import { assert, describe, it, vi } from '@effect/vitest';
import { Bone, Euler, Matrix4, Object3D, PropertyBinding, Vector3 } from 'three/webgpu';
import { INTENSITIES, Intensity } from '../src/content/schema';
import { skiFrame, transform } from '../src/viewer/motion/fk';
import type { V3 } from '../src/viewer/motion/fk';
import { Q_FRAMES, REST_WORLD } from '../src/viewer/motion/q-table';
import { drivenBones, matrixOf, poseSolved, unposeSolved } from '../src/viewer/motion/solved-bones';
import { solvedAt } from '../src/viewer/motion/solved-figure';
import { bootCapsules } from '../src/viewer/motion/turn';
import { SKELETON_DATA, Side, restWorld } from '../src/viewer/skeleton';
import { MOGUL_POSE } from '../src/viewer/turn-heading';

// A steered surface's first profile takes tens of seconds, as in clearance.test.ts.
vi.setConfig({ testTimeout: 600_000 });

const DRILLS = ['regular-sl', 'regular-gs', 'regular-steered'] as const;
// Float64 round-off on metre-scale frames.
const TOLERANCE = 1e-12;

const must = <T>(v: T | null | undefined, what: string): T => {
  if (v === null || v === undefined) throw new Error(`no ${what}`);
  return v;
};

const named = (o: Object3D, name: string): Object3D => {
  o.name = PropertyBinding.sanitizeNodeName(name);
  return o;
};

/** The GLB's armature from skeleton.json: bone rests off the ISB frames, a talus under each foot, a finger under each hand. */
const armature = (): { readonly root: Object3D; readonly bones: ReadonlyArray<Object3D> } => {
  const root = new Object3D();
  root.position.set(3, -2, 5);
  root.quaternion.setFromEuler(new Euler(0.2, -1.1, 0.4));
  const rig = named(new Object3D(), 'rig');
  root.add(rig);
  // Blender bones run along +Y, not along the ISB axes.
  const twist = new Matrix4().makeRotationFromEuler(new Euler(0.7, -0.3, 1.9));
  const restOf = new Map<string, Matrix4>();
  const bones = new Map<string, Object3D>();
  const place = (bone: Object3D, parent: Object3D, world: Matrix4): void => {
    const parentWorld = restOf.get(parent.name) ?? new Matrix4();
    new Matrix4().copy(parentWorld).invert().multiply(world).decompose(bone.position, bone.quaternion, bone.scale);
    parent.add(bone);
    restOf.set(bone.name, world);
  };
  for (const [segment, rest] of Object.entries(SKELETON_DATA.segments)) {
    const bone = named(new Bone(), rest.bone);
    const parent = rest.parent === null ? rig : bones.get(rest.parent);
    if (parent === undefined) throw new Error(`${segment} before its parent`);
    place(bone, parent, new Matrix4().fromArray(restWorld(segment)).multiply(twist));
    bones.set(segment, bone);
  }
  for (const s of [Side.Right, Side.Left]) {
    const foot = must(bones.get(`foot.${s}`), 'foot');
    place(named(new Bone(), `talus.${s}`), foot, new Matrix4().copy(must(restOf.get(foot.name), 'foot rest')).multiply(new Matrix4().makeTranslation(0.01, 0.04, -0.02)));
    const hand = must(bones.get(`hand.${s}`), 'hand');
    place(named(new Bone(), `finger.${s}`), hand, new Matrix4().copy(must(restOf.get(hand.name), 'hand rest')).multiply(new Matrix4().makeTranslation(0, 0.08, 0)));
  }
  const all: Object3D[] = [];
  root.traverse((o) => {
    if (o instanceof Bone) all.push(o);
  });
  return { root, bones: all };
};

/** A clip's frame: every bone rotated, the pelvis moved. */
const scramble = (bones: ReadonlyArray<Object3D>, k: number): void => {
  bones.forEach((b, i) => b.quaternion.setFromEuler(new Euler(Math.sin(k + i), Math.cos(2 * k + i), 0.5 * Math.sin(3 * k - i))));
  bones[0]?.position.set(0.1 * Math.sin(k), 0.9, -0.05);
};

const inRoot = (root: Object3D, o: Object3D): Matrix4 => new Matrix4().copy(root.matrixWorld).invert().multiply(o.matrixWorld);

const gap = (a: Matrix4, b: Matrix4): number => Math.max(...a.elements.map((v, i) => Math.abs(v - (b.elements[i] ?? 0))));

const point = (m: Matrix4, v: V3): Vector3 => new Vector3(Number(v[0]), Number(v[1]), Number(v[2])).applyMatrix4(m);

describe('solved bones', () => {
  it('every driven bone stands at its segment frame times its rest offset, every migrated drill, intensity and stored frame', () => {
    const { root, bones } = armature();
    const driven = drivenBones(root);
    assert.deepStrictEqual(driven.map((d) => d.segment).sort(), [...Object.keys(SKELETON_DATA.segments), 'foot.R', 'foot.L'].sort());
    const rest = new Map(driven.map((d) => [d.bone, inRoot(root, d.bone)]));
    const finger = must(root.getObjectByName(PropertyBinding.sanitizeNodeName('finger.R')), 'finger');
    const fingerLocal = new Matrix4();
    let worst = 0;
    let worstSki = 0;
    let worstBoot = 0;
    for (const drill of DRILLS)
      for (const intensity of INTENSITIES)
        for (let k = 0; k < Q_FRAMES; k++) {
          const solved = solvedAt(drill, intensity, k / Q_FRAMES);
          if (solved === null) throw new Error(`${drill} ${intensity} has no solve`);
          const w = solved.w;
          scramble(bones, k);
          fingerLocal.compose(finger.position, finger.quaternion, finger.scale);
          poseSolved(root, driven, w);
          root.updateMatrixWorld(true);
          for (const d of driven) {
            const want = matrixOf(must(w[d.segment], d.segment)).multiply(matrixOf(must(REST_WORLD[d.segment], d.segment)).invert()).multiply(must(rest.get(d.bone), 'rest'));
            worst = Math.max(worst, gap(inRoot(root, d.bone), want));
          }
          // The clip still owns the finger, under its solved hand.
          assert.isTrue(finger.matrix.equals(fingerLocal));
          for (const s of [Side.Right, Side.Left]) {
            const foot = must(driven.find((d) => d.segment === `foot.${s}` && d.bone.name.startsWith('foot')), 'foot');
            // Skis and boots are skinned to the foot in their rest frames.
            const skinning = inRoot(root, foot.bone).multiply(must(rest.get(foot.bone), 'foot rest').clone().invert());
            const ski = skinning.clone().multiply(matrixOf(skiFrame(REST_WORLD, s)));
            worstSki = Math.max(worstSki, gap(ski, matrixOf(skiFrame(w, s))));
            for (const c of bootCapsules(s))
              for (const end of [c.a, c.b]) {
                const shell = point(skinning, transform(must(REST_WORLD[`foot.${s}`], 'foot'), end));
                worstBoot = Math.max(worstBoot, shell.distanceTo(point(new Matrix4(), transform(must(w[`foot.${s}`], 'foot'), end))));
              }
          }
        }
    assert.isBelow(worst, TOLERANCE, `bone ${worst}`);
    assert.isBelow(worstSki, TOLERANCE, `ski ${worstSki}`);
    assert.isBelow(worstBoot, TOLERANCE, `boot ${worstBoot}`);
  });

  it('handing back to the clips returns the driven bones to their clip transforms', () => {
    const { root, bones } = armature();
    const driven = drivenBones(root);
    poseSolved(root, driven, must(solvedAt('regular-sl', Intensity.Gentle, 0.3), 'solve').w);
    unposeSolved(driven);
    scramble(bones, 1);
    root.updateMatrixWorld(true);
    for (const d of driven) assert.isTrue(d.bone.matrix.equals(new Matrix4().compose(d.bone.position, d.bone.quaternion, d.bone.scale)));
  });

  it('a non-migrated drill has no solved frames', () => {
    assert.isNull(solvedAt(MOGUL_POSE, Intensity.Moderate, 0.3));
  });
});

