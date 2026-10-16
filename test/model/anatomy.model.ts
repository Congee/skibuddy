// Checks against the real baked model; run with `bun run test:model` after scripts/anatomy/build.sh.
import { assert, describe, it } from '@effect/vitest';
import { Quaternion, Raycaster, SkinnedMesh, Vector3, Vector4 } from 'three';
import { drillScenarios } from '../../scripts/anatomy/drill-scenarios';
import { POSE_DEFINITIONS } from '../../src/viewer/poses';
import { loadAnatomy } from '../../scripts/anatomy/model';
import { probeFixture } from '../../scripts/anatomy/probe-fixture';
import { anchorCandidates } from '../../scripts/anatomy/stamp-anchors';
import { INTENSITIES } from '../../src/content/schema';
import { NEUTRAL_CLIP, motionClipName, nodeOf } from '../../src/viewer/anatomy-names';
import { pickOfName } from '../../src/viewer/pick';
import { EQUIPMENT, bindingInFoot, shellInFoot, totalRamp } from '../../src/viewer/equipment';
import { BodySide } from '../../src/viewer/figure';
import { bootFitFrom, parseGearFit, standingArm } from '../../src/viewer/gear-fit';
import { transformPoint } from '../../src/viewer/mat4';
import type { Vec3 } from '../../src/viewer/mat4';
import { poleDirection, poleSize } from '../../src/viewer/pose';
import { touchShare } from '../../src/viewer/pose-definition';
import { STORK_TURNS } from '../../src/viewer/poses/stork-turns';
import fixture from '../anatomy-probe.json';

const POLE_TOUCH_T = STORK_TURNS.constraints.poleTouch?.t ?? 0;
const poleTouchAt = (t: number): number => touchShare(STORK_TURNS.constraints.poleTouch, t);

const flat = (v: unknown): ReadonlyArray<number> => (typeof v === 'number' ? [v] : typeof v === 'object' && v !== null ? Object.values(v).flatMap(flat) : []);

describe('anatomy model build outputs', () => {
  it('matches the probe fixture the unit tests read', async () => {
    const fresh = probeFixture(await loadAnatomy());
    assert.deepStrictEqual(fresh.scenarios, fixture.scenarios);
    assert.deepStrictEqual(fresh.scenarios, Object.fromEntries(Object.keys(POSE_DEFINITIONS).map((d) => [d, drillScenarios(d)])));
    assert.strictEqual(fresh.frames.length, fixture.frames.length);
    // Rounded to micrometres by another JS engine, so the last digit may differ.
    const a = flat(fresh.frames);
    const b = flat(fixture.frames);
    assert.strictEqual(a.length, b.length);
    a.forEach((x, i) => assert.closeTo(x, b[i] ?? Number.NaN, 2e-6, `value ${i}`));
  });

  it('carries a clip per posed drill and intensity, and the neutral stance', async () => {
    const names = (await loadAnatomy()).gltf.animations.map((a) => a.name);
    assert.include(names, NEUTRAL_CLIP);
    for (const d of Object.keys(POSE_DEFINITIONS)) for (const i of INTENSITIES) assert.include(names, motionClipName(d, i), `${d} ${i}`);
  });

  it('carries the anchor candidates the viewer reads', async () => {
    const model = await loadAnatomy();
    const expected = anchorCandidates(model);
    assert.isAbove(expected.size, 0);
    for (const [index, vertices] of expected) {
      let owner: unknown;
      for (const [object, ref] of model.gltf.parser.associations) if (ref.nodes === index && 'userData' in object) owner = object.userData['anchor_vertices'];
      assert.deepStrictEqual(owner, vertices, `node ${index}`);
    }
  });
});

describe('anatomy boots on their bindings', () => {
  it('stands each foot heel-up by the total ramp, its shell sole at stand height above the ski base', async () => {
    const model = await loadAnatomy();
    const raw = parseGearFit(model.root.getObjectByName('bones')?.userData['gear_fit']);
    if (raw === null) throw new Error('no gear fit');
    // Carried points are taken at the rest pose, before anything poses the model.
    const sides = (
      [
        { side: BodySide.Right, letter: 'R', raw: raw.right },
        { side: BodySide.Left, letter: 'L', raw: raw.left },
      ] as const
    ).map(({ side, letter, raw: r }) => {
      const fit = bootFitFrom(r);
      const at = (local: Vec3): (() => Vector3) => model.carried(`foot.${letter}`, new Vector3(r.ankle[0] + local[0], r.ankle[1] + local[1], r.ankle[2] + local[2]));
      return {
        side,
        letter,
        ankle: at([0, 0, 0]),
        ahead: at([0, 0, 0.1]),
        mount: at(transformPoint(bindingInFoot(fit, EQUIPMENT), [0, 0, 0])),
        sole: at(transformPoint(shellInFoot(fit, EQUIPMENT), [0, fit.sole, (fit.heel + fit.toe) / 2])),
      };
    });
    const probe = probeFixture(model);
    for (const i of [0, 16, 48, 80]) {
      const frame = probe.frames[i];
      if (frame === undefined) throw new Error(`no probe frame ${i}`);
      model.pose(i / probe.samples);
      for (const { side, letter, ankle, ahead, mount, sole } of sides) {
        const tail = new Vector3(...frame.tail[side]);
        const along = new Vector3(...frame.tip[side]).sub(tail).normalize();
        // Rest points lie in the ski's mid-plane, so their distance from the base line is their height.
        const height = (p: Vector3): number => p.clone().sub(tail).cross(along).length();
        const toe = ahead().sub(ankle()).normalize();
        const label = `${letter} at sample ${i}`;
        assert.closeTo(toe.angleTo(along), totalRamp(EQUIPMENT), 1e-3, `foot pitch, ${label}`);
        assert.closeTo(height(mount()), EQUIPMENT.skiThickness, 5e-4, `binding on the ski, ${label}`);
        assert.closeTo(height(sole()), EQUIPMENT.standHeight, 5e-4, `sole at stand height, ${label}`);
      }
    }
  });
});

describe('anatomy hands on the grips', () => {
  it('closes the bare fingers round each grip and lays the thumb on it', async () => {
    const model = await loadAnatomy();
    let bones: SkinnedMesh | undefined;
    model.root.traverse((o) => {
      if (bones === undefined && o instanceof SkinnedMesh && !Array.isArray(o.material) && o.material.name === 'bone') bones = o;
    });
    const raw = parseGearFit(model.root.getObjectByName('bones')?.userData['gear_fit']);
    if (bones === undefined || raw === null) throw new Error('no bones or gear fit');
    const arm = standingArm(raw.left);
    if (arm === null) throw new Error('no arm joints');
    const { basket } = poleSize(arm);
    const mesh = bones;
    const index = mesh.geometry.getAttribute('skinIndex');
    const weight = mesh.geometry.getAttribute('skinWeight');
    const names = mesh.skeleton.bones.map((b) => b.name);
    const owner = (i: number): string | undefined => {
      const k = [0, 1, 2, 3].reduce((a, b) => (weight.getComponent(i, b) > weight.getComponent(i, a) ? b : a));
      return names[index.getComponent(i, k)];
    };
    const count = mesh.geometry.getAttribute('position').count;
    const on = (parts: ReadonlyArray<string>): ReadonlyArray<number> => Array.from({ length: count }, (_, i) => i).filter((i) => parts.includes(owner(i) ?? ''));
    const sides = [
      { side: BodySide.Right, letter: 'R', grip: raw.right.grip },
      { side: BodySide.Left, letter: 'L', grip: raw.left.grip },
    ] as const;
    const hands = sides.map(({ side, letter, grip }) => ({
      side,
      letter,
      grip: model.carried(`hand.${letter}`, new Vector3(...grip)),
      fingers: on([`fingers${letter}`, `fingertips${letter}`]),
      palm: on([`hand${letter}`]),
      thumb: on([`thumbtip${letter}`]),
    }));
    const v = new Vector4();
    const p = new Vector3();
    for (const t of [0, POLE_TOUCH_T, 0.5, 5 / 6]) {
      model.pose(t);
      for (const { side, letter, grip, fingers, palm, thumb } of hands) {
        const g = grip();
        const ankle = model.bone(`foot.${letter}`).getWorldPosition(new Vector3());
        const d = new Vector3(...poleDirection([g.x, g.y, g.z], side, side === BodySide.Left ? poleTouchAt(t) : 0, [ankle.x, ankle.y, ankle.z], basket));
        const e1 = new Vector3(0, 1, 0).cross(d).normalize();
        const e2 = d.clone().cross(e1);
        // Radius and angle about the pole's axis.
        const around = (i: number): { readonly r: number; readonly angle: number } => {
          const pos = mesh.geometry.getAttribute('position');
          mesh.applyBoneTransform(i, v.set(pos.getX(i), pos.getY(i), pos.getZ(i), 1));
          const q = mesh.localToWorld(p.set(v.x, v.y, v.z)).sub(g);
          q.addScaledVector(d, -q.dot(d));
          return { r: q.length(), angle: Math.atan2(q.dot(e2), q.dot(e1)) };
        };
        const at = `${letter} at t=${t}`;
        const wrap = fingers.map(around);
        assert.isAbove(Math.min(...wrap.map((w) => w.r)), 0.015, `fingers clear of the grip, ${at}`);
        assert.isBelow(wrap.reduce((sum, w) => sum + w.r, 0) / wrap.length, 0.035, `fingers closed on the grip, ${at}`);
        // With the palm, the curled fingers enclose the grip.
        const angles = [...wrap, ...palm.map(around).filter((w) => w.r < 0.035)].map((w) => w.angle).toSorted((a, b) => a - b);
        const gaps = angles.map((a, i) => (angles[i + 1] ?? (angles[0] ?? 0) + 2 * Math.PI) - a);
        assert.isBelow(Math.max(...gaps), Math.PI / 2, `fist closed round the grip, ${at}`);
        const lay = thumb.map(around);
        assert.isAbove(Math.min(...lay.map((w) => w.r)), 0.015, `thumb clear of the grip, ${at}`);
        assert.isBelow(lay.reduce((sum, w) => sum + w.r, 0) / lay.length, 0.04, `thumb on the grip, ${at}`);
      }
    }
  });
});

describe('anatomy wrists on the grips', () => {
  it('keeps each wrist within 40 deg of straight, hand axis to forearm axis, in every clip', async () => {
    // The model's own rest hand sits 18 deg off the forearm; a grip that looked broken reached 63.
    const clips = [NEUTRAL_CLIP, ...Object.keys(POSE_DEFINITIONS).flatMap((d) => INTENSITIES.map((i) => motionClipName(d, i)))];
    const models = await Promise.all(clips.map(async (clip) => ({ clip, model: await loadAnatomy(undefined, clip) })));
    for (const { clip, model } of models) {
      const at = (name: string): Vector3 => model.bone(name).getWorldPosition(new Vector3());
      for (let i = 0; i < 24; i++) {
        model.pose(i / 24);
        for (const letter of ['R', 'L']) {
          const fore = at(`hand.${letter}`).sub(at(`forearm.${letter}`)).normalize();
          const hand = at(`fingers.${letter}`).sub(at(`hand.${letter}`)).normalize();
          assert.isBelow((fore.angleTo(hand) * 180) / Math.PI, 40, `${clip}: ${letter} at frame ${i}`);
        }
      }
    }
  });
});

describe('anatomy subtalar and shoulder-blade joints', () => {
  it('rolls the foot under the talus and keeps the talus square in the ankle mortise', async () => {
    const model = await loadAnatomy();
    const names = ['R', 'L'].flatMap((l) => [`shin.${l}`, `talus.${l}`, `foot.${l}`]);
    const rest = new Map(names.map((n) => [n, model.bone(n).getWorldQuaternion(new Quaternion())]));
    // The rotation the pose gives a bone, in rest-pose world axes.
    const moved = (n: string): Quaternion => model.bone(n).getWorldQuaternion(new Quaternion()).multiply((rest.get(n) ?? new Quaternion()).clone().invert());
    // Twist of b relative to a about the rest foot's long axis (+z), degrees.
    const roll = (a: string, b: string): number => {
      const q = moved(a).invert().multiply(moved(b));
      return (2 * Math.atan2(q.z, q.w) * 180) / Math.PI;
    };
    model.pose(0.65);
    for (const l of ['R', 'L']) {
      assert.isAbove(Math.abs(roll(`shin.${l}`, `foot.${l}`)), 1, `${l} foot rolls on the shin`);
      assert.isBelow(Math.abs(roll(`shin.${l}`, `talus.${l}`)), 0.3, `${l} talus stays with the shin`);
    }
  });

  it('hangs each arm from a shoulder blade on the chest', async () => {
    const model = await loadAnatomy();
    for (const l of ['R', 'L']) {
      assert.strictEqual(model.bone(`upper_arm.${l}`).parent?.name, `scapula${l}`);
      assert.strictEqual(model.bone(`scapula.${l}`).parent?.name, 'chest');
    }
  });
});

describe('anatomy tap picking', () => {
  it('hits the posed front of each thigh as that side quadriceps', async () => {
    const model = await loadAnatomy();
    model.pose(0.3);
    const meshes: Array<SkinnedMesh> = [];
    model.root.traverse((o) => {
      if (o instanceof SkinnedMesh) meshes.push(o);
    });
    for (const s of new Set(meshes.map((m) => m.skeleton))) s.update();
    const muscles = new Set(['quadriceps']);
    for (const [letter, side] of [['R', 'outside'], ['L', 'inside']] as const) {
      const mid = model.bone(`thigh.${letter}`).getWorldPosition(new Vector3()).lerp(model.bone(`shin.${letter}`).getWorldPosition(new Vector3()), 0.5);
      const raycaster = new Raycaster(new Vector3(mid.x, mid.y, mid.z + 3), new Vector3(0, 0, -1));
      const hits = meshes.flatMap((m) => raycaster.intersectObject(m, false)).sort((a, b) => a.distance - b.distance);
      const first = hits[0] === undefined ? null : nodeOf(hits[0].object);
      assert.deepStrictEqual(first === null ? null : pickOfName(first.owner.name, muscles), { muscle: 'quadriceps', side }, letter);
    }
  });
});
