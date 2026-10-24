import { Matrix4, PropertyBinding } from 'three/webgpu';
import type { Object3D } from 'three/webgpu';
import { SEGMENT_NAMES, SKELETON_DATA } from '../skeleton';
import type { Rigid } from './fk';
import { REST_WORLD } from './q-table';

/** An armature bone the solve places: its ISB segment, and its rest frame in that segment's rest frame (S⁻¹ · B). */
export interface DrivenBone {
  readonly bone: Object3D;
  readonly segment: string;
  readonly offset: Matrix4;
  /** The bone's world in the root's frame, set by each `poseSolved`. */
  readonly placed: Matrix4;
}

/** A root frame as a matrix, float64. */
export const matrixOf = (r: Rigid, out: Matrix4 = new Matrix4()): Matrix4 => {
  const R = r.R;
  return out.set(
    Number(R[0]), Number(R[1]), Number(R[2]), Number(r.p[0]),
    Number(R[3]), Number(R[4]), Number(R[5]), Number(r.p[1]),
    Number(R[6]), Number(R[7]), Number(R[8]), Number(r.p[2]),
    0, 0, 0, 1,
  );
};

/** Bone → ISB segment: every segment's own bone, and each talus fused to its foot (the bake's calcaneus frame, subtalar held by the boot). */
const DRIVERS: ReadonlyArray<readonly [string, string]> = [
  ...SEGMENT_NAMES.map((name): readonly [string, string] => [SKELETON_DATA.segments[name]?.bone ?? name, name]),
  ['talus.R', 'foot.R'],
  ['talus.L', 'foot.L'],
];

const depth = (o: Object3D): number => (o.parent === null ? 0 : 1 + depth(o.parent));

/**
 * The bones the solve drives, read at the armature's rest pose (call before any clip plays), parents first.
 * Each offset is taken in `root`'s frame, so the figure's placement in the scene never enters it.
 */
export const drivenBones = (root: Object3D): ReadonlyArray<DrivenBone> => {
  root.updateMatrixWorld(true);
  const toRoot = new Matrix4().copy(root.matrixWorld).invert();
  return DRIVERS.flatMap(([name, segment]) => {
    const bone = root.getObjectByName(PropertyBinding.sanitizeNodeName(name));
    const rest = REST_WORLD[segment];
    if (bone === undefined || rest === undefined) return [];
    const offset = matrixOf(rest).invert().multiply(new Matrix4().multiplyMatrices(toRoot, bone.matrixWorld));
    return [{ bone, segment, offset, placed: new Matrix4() }];
  }).sort((a, b) => depth(a.bone) - depth(b.bone));
};

const segmentWorld = new Matrix4();
const parentWorld = new Matrix4();
const step = new Matrix4();

/** `o`'s world in `root`'s frame from the bones placed this pass and the rest's own transforms. */
const inRoot = (o: Object3D | null, root: Object3D, placed: ReadonlyMap<Object3D, Matrix4>, out: Matrix4): Matrix4 => {
  if (o === null || o === root) return out.identity();
  const own = placed.get(o);
  if (own !== undefined) return out.copy(own);
  inRoot(o.parent, root, placed, out);
  return out.multiply(o.matrixAutoUpdate ? step.compose(o.position, o.quaternion, o.scale) : o.matrix);
};

/**
 * Sets the driven bones' local matrices so each stands at its segment's frame in `w` times its rest offset;
 * bones the solve does not own (fingers, thumbs) keep their clip transforms under their solved parents.
 */
export const poseSolved = (root: Object3D, bones: ReadonlyArray<DrivenBone>, w: Readonly<Record<string, Rigid>>, placed: Map<Object3D, Matrix4> = new Map()): void => {
  placed.clear();
  for (const d of bones) {
    const seg = w[d.segment];
    if (seg === undefined) continue;
    d.placed.multiplyMatrices(matrixOf(seg, segmentWorld), d.offset);
    inRoot(d.bone.parent, root, placed, parentWorld);
    // A matrix, not TRS: decompose would drop the FK frames' micrometre shear.
    d.bone.matrix.copy(parentWorld.invert().multiply(d.placed));
    d.bone.matrixAutoUpdate = false;
    placed.set(d.bone, d.placed);
  }
};

/** Hands the driven bones back to the clips. */
export const unposeSolved = (bones: ReadonlyArray<DrivenBone>): void => {
  for (const d of bones) d.bone.matrixAutoUpdate = true;
};
