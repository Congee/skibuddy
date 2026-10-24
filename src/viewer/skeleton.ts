import { bindingInFoot, EQUIPMENT } from './equipment';
import { bootFitFrom } from './gear-fit';
import type { RawFit } from './gear-fit';
import { compose, identity, multiply, rotationX, rotationY, rotationZ, translation } from './mat4';
import type { Mat4, Vec3 } from './mat4';
import SKELETON from './skeleton.json';

/**
 * The ISB skeleton (wu-2002 lower limb, pelvis and spine; wu-2005 upper limb) fitted to the
 * baked mesh by build_anatomy.py at the record's height. Segment origins are the rig's joint
 * centres, axes ISB's: x anterior, y up the segment, z to the body's right on both sides.
 */

export const Side = { Right: 'R', Left: 'L' } as const;
export type Side = (typeof Side)[keyof typeof Side];
const SIDES: ReadonlyArray<Side> = [Side.Right, Side.Left];

export const Axis = { X: 'x', Y: 'y', Z: 'z' } as const;
export type Axis = (typeof Axis)[keyof typeof Axis];

export const DofKind = { Rotation: 'rotation', Translation: 'translation' } as const;
export type DofKind = (typeof DofKind)[keyof typeof DofKind];

export interface SegmentRest {
  readonly parent: string | null;
  /** The armature bone the segment drives. */
  readonly bone: string;
  readonly origin: Vec3;
  readonly x: Vec3;
  readonly y: Vec3;
  readonly z: Vec3;
}

export interface SkeletonData {
  readonly height: number;
  readonly segments: Readonly<Record<string, SegmentRest>>;
  readonly landmarks: Readonly<Record<string, Vec3>>;
  readonly joints: Readonly<Record<string, Vec3>>;
  readonly fits: Readonly<Record<string, { readonly centre: Vec3; readonly radius: number; readonly rms: number; readonly points: number; readonly offset: number }>>;
  readonly body: Readonly<Record<string, number>>;
  readonly gear_fit: Readonly<Record<Side, RawFit>>;
}

export const SKELETON_DATA = SKELETON as unknown as SkeletonData;
export const SEGMENT_NAMES: ReadonlyArray<string> = Object.keys(SKELETON_DATA.segments);

/** One degree of freedom; rotations turn by `sign * (q - rest)` radians about the segment's parent-frame axis. */
export interface Coordinate {
  readonly name: string;
  readonly segment: string;
  readonly kind: DofKind;
  readonly axis: Axis;
  readonly sign: 1 | -1;
  /** Held by the boot; always at rest. */
  readonly locked?: true;
}

const dof = (name: string, segment: string, axis: Axis, sign: 1 | -1, kind: DofKind = DofKind.Rotation): Coordinate => ({ name, segment, kind, axis, sign });

const spine = (region: string, segment: string): ReadonlyArray<Coordinate> => [
  dof(`${region}_flexion`, segment, Axis.Z, -1),
  // Bending to the right and rotation to the left positive, as wu-2005's thorax.
  dof(`${region}_bending`, segment, Axis.X, 1),
  dof(`${region}_rotation`, segment, Axis.Y, 1),
];

/** Signs make each name's positive sense anatomical on both sides (adduction, internal rotation, elevation...). */
const limb = (s: Side): ReadonlyArray<Coordinate> => {
  const m = s === Side.Right ? 1 : -1;
  return [
    dof(`hip_flexion.${s}`, `femur.${s}`, Axis.Z, 1),
    dof(`hip_adduction.${s}`, `femur.${s}`, Axis.X, m),
    dof(`hip_rotation.${s}`, `femur.${s}`, Axis.Y, m),
    dof(`knee_flexion.${s}`, `tibia.${s}`, Axis.Z, -1),
    // ISB's third knee rotation, the tibia about its long axis after the hinge; internal positive.
    dof(`knee_rotation.${s}`, `tibia.${s}`, Axis.Y, m),
    dof(`ankle_dorsiflexion.${s}`, `foot.${s}`, Axis.Z, 1),
    dof(`subtalar_inversion.${s}`, `foot.${s}`, Axis.X, m),
    dof(`scapula_elevation.${s}`, `scapula.${s}`, Axis.X, m === 1 ? -1 : 1),
    dof(`scapula_protraction.${s}`, `scapula.${s}`, Axis.Y, m),
    dof(`shoulder_flexion.${s}`, `humerus.${s}`, Axis.Z, 1),
    dof(`shoulder_abduction.${s}`, `humerus.${s}`, Axis.X, m === 1 ? -1 : 1),
    dof(`shoulder_rotation.${s}`, `humerus.${s}`, Axis.Y, m),
    dof(`elbow_flexion.${s}`, `forearm.${s}`, Axis.Z, 1),
    dof(`forearm_pronation.${s}`, `forearm.${s}`, Axis.Y, m),
    dof(`wrist_flexion.${s}`, `hand.${s}`, Axis.Z, 1),
    dof(`wrist_deviation.${s}`, `hand.${s}`, Axis.X, m),
  ];
};

/** Every coordinate; the head rides the neck. */
export const COORDINATES: ReadonlyArray<Coordinate> = [
  dof('pelvis_tx', 'pelvis', Axis.X, 1, DofKind.Translation),
  dof('pelvis_ty', 'pelvis', Axis.Y, 1, DofKind.Translation),
  dof('pelvis_tz', 'pelvis', Axis.Z, 1, DofKind.Translation),
  // Anterior tilt, right side up, turning left positive.
  dof('pelvis_tilt', 'pelvis', Axis.Z, -1),
  dof('pelvis_list', 'pelvis', Axis.X, -1),
  dof('pelvis_rotation', 'pelvis', Axis.Y, 1),
  ...spine('lumbar', 'lumbar'),
  ...spine('thoracic', 'thorax'),
  ...spine('neck', 'neck'),
  ...SIDES.flatMap(limb),
];

export type Pose = Readonly<Record<string, number>>;

const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/** A segment's rest frame in the world: columns x, y, z and its origin. */
export const restWorld = (name: string): Mat4 => {
  const s = SKELETON_DATA.segments[name];
  if (s === undefined) throw new Error(`no segment ${name}`);
  return new Float32Array([...s.x, 0, ...s.y, 0, ...s.z, 0, ...s.origin, 1]);
};

/** A rigid matrix's inverse. */
export const rigidInverse = (m: Mat4): Mat4 => {
  const r = identity();
  for (let c = 0; c < 3; c++) for (let k = 0; k < 3; k++) r[c * 4 + k] = m[k * 4 + c] ?? 0;
  const t: Vec3 = [m[12] ?? 0, m[13] ?? 0, m[14] ?? 0];
  for (let k = 0; k < 3; k++) r[12 + k] = -((r[k] ?? 0) * t[0] + (r[4 + k] ?? 0) * t[1] + (r[8 + k] ?? 0) * t[2]);
  return r;
};

const parentOf = (name: string): string | null => SKELETON_DATA.segments[name]?.parent ?? null;

// Hinges and the joint centres either side of them.
const HINGES: Readonly<Record<string, readonly [string, string, string]>> = { knee_flexion: ['hip', 'knee', 'ankle'], elbow_flexion: ['shoulder', 'elbow', 'wrist'] };

/** A hinge's rest angle between the joint-centre lines, about the parent's z; zero for every other coordinate. */
const restAngle = (c: Coordinate): number => {
  const [base, side] = c.name.split('.');
  const hinge = HINGES[base ?? ''];
  const parent = SKELETON_DATA.segments[parentOf(c.segment) ?? ''];
  if (hinge === undefined || parent === undefined) return 0;
  const [a, b, e] = hinge.map((k) => SKELETON_DATA.joints[`${k}.${side}`] ?? ([0, 0, 0] as Vec3));
  if (a === undefined || b === undefined || e === undefined) return 0;
  const pitch = (v: Vec3): number => Math.atan2(-dot(v, parent.x), dot(v, parent.y));
  return c.sign * (pitch(sub(b, e)) - pitch(sub(a, b)));
};

/** Each coordinate's value at the template's rest pose, where FK reproduces the landmarks. */
export const REST_POSE: Pose = Object.fromEntries(COORDINATES.map((c) => [c.name, restAngle(c)]));

const ROTATION: Record<Axis, (a: number) => Mat4> = { [Axis.X]: rotationX, [Axis.Y]: rotationY, [Axis.Z]: rotationZ };
// Grood and Suntay's order, as wu-2002's JCS: the parent's z, the floating x, then the child's y.
const ORDER: ReadonlyArray<Axis> = [Axis.Z, Axis.X, Axis.Y];

const jointRotation = (segment: string, q: Pose): Mat4 => {
  const own = COORDINATES.filter((c) => c.segment === segment && c.kind === DofKind.Rotation && c.locked !== true);
  return compose(
    ...ORDER.flatMap((axis) => own.filter((c) => c.axis === axis).map((c) => ROTATION[axis](c.sign * ((q[c.name] ?? REST_POSE[c.name] ?? 0) - (REST_POSE[c.name] ?? 0))))),
  );
};

/**
 * Segment world matrices for `q` (radians and metres, defaulting to REST_POSE); the pelvis translates in world axes.
 * `lengths` scales a segment's joint offset from its parent, as fk.ts `forward`.
 */
export const forwardKinematics = (q: Pose = REST_POSE, lengths: Readonly<Record<string, number>> = {}): Readonly<Record<string, Mat4>> => {
  const out: Record<string, Mat4> = {};
  for (const name of SEGMENT_NAMES) {
    const rest = restWorld(name);
    const parent = parentOf(name);
    if (parent === null) {
      const t: Vec3 = [q['pelvis_tx'] ?? 0, q['pelvis_ty'] ?? 0, q['pelvis_tz'] ?? 0];
      out[name] = compose(translation(t), rest, jointRotation(name, q));
      continue;
    }
    const local = multiply(rigidInverse(restWorld(parent)), rest);
    const l = lengths[name] ?? 1;
    const joint = translation([l * (local[12] ?? 0), l * (local[13] ?? 0), l * (local[14] ?? 0)]);
    local[12] = local[13] = local[14] = 0;
    const world = out[parent];
    if (world === undefined) throw new Error(`segment ${name} precedes its parent ${parent}`);
    out[name] = compose(world, joint, jointRotation(name, q), local);
  }
  return out;
};

/** Joint centre to the next joint centre along each limb segment, and between the hip centres; metres. */
export const segmentLengths = (): Readonly<Record<string, number>> => {
  const j = SKELETON_DATA.joints;
  const d = (a: string, b: string): number => {
    const [p, r] = [j[a], j[b]];
    return p === undefined || r === undefined ? Number.NaN : Math.hypot(...sub(p, r));
  };
  return {
    hipWidth: d('hip.R', 'hip.L'),
    thigh: d('hip.L', 'knee.L'),
    shin: d('knee.L', 'ankle.L'),
    trunk: d('pelvis', 'c7t1'),
    upperArm: d('shoulder.L', 'elbow.L'),
  };
};

/** The binding frame (gear-fit.ts, equipment.ts) in the foot segment's frame, so the ski follows FK. */
export const bindingInSegment = (s: Side): Mat4 => {
  const raw = SKELETON_DATA.gear_fit[s];
  return compose(rigidInverse(restWorld(`foot.${s}`)), translation(raw.ankle), bindingInFoot(bootFitFrom(raw), EQUIPMENT));
};
