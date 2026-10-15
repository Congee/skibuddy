// Checks against the real baked model; run with `bun run test:model` after scripts/anatomy/build.sh.
import { assert, describe, it } from '@effect/vitest';
import { SkinnedMesh, Vector3, Vector4 } from 'three';
import { loadAnatomy } from '../../scripts/anatomy/model';
import { probeFixture } from '../../scripts/anatomy/probe-fixture';
import { anchorCandidates } from '../../scripts/anatomy/stamp-anchors';
import { EQUIPMENT, bindingInFoot, shellInFoot, totalRamp } from '../../src/viewer/equipment';
import { BodySide } from '../../src/viewer/figure';
import { bootFitFrom, parseGearFit } from '../../src/viewer/gear-fit';
import { transformPoint } from '../../src/viewer/mat4';
import type { Vec3 } from '../../src/viewer/mat4';
import { POLE_TOUCH_T, poleDirection, poleTouchAt } from '../../src/viewer/pose';
import fixture from '../anatomy-probe.json';

const flat = (v: unknown): ReadonlyArray<number> => (typeof v === 'number' ? [v] : typeof v === 'object' && v !== null ? Object.values(v).flatMap(flat) : []);

describe('anatomy model build outputs', () => {
  it('matches the probe fixture the unit tests read', async () => {
    const fresh = probeFixture(await loadAnatomy());
    assert.strictEqual(fresh.frames.length, fixture.frames.length);
    // Rounded to micrometres by another JS engine, so the last digit may differ.
    const a = flat(fresh.frames);
    const b = flat(fixture.frames);
    assert.strictEqual(a.length, b.length);
    a.forEach((x, i) => assert.closeTo(x, b[i] ?? Number.NaN, 2e-6, `value ${i}`));
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
        const d = new Vector3(...poleDirection([g.x, g.y, g.z], side, side === BodySide.Left ? poleTouchAt(t) : 0, [ankle.x, ankle.y, ankle.z]));
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
