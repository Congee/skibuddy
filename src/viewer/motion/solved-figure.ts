import type { Intensity } from '../../content/schema';
import { bendCurvatureOf } from '../../physics/ski-bend';
import { BodySide, CAPSULE_BINDING, SEGMENTS, SegmentKind, segmentIndex } from '../figure';
import { EQUIPMENT } from '../equipment';
import { compose, identity, transformPoint, translation } from '../mat4';
import type { Mat4, Vec3 } from '../mat4';
import { SKELETON_DATA, restWorld, rigidInverse, Side } from '../skeleton';
import { surfaceFor } from '../surface';
import { ALIGN, PAIRS } from './adapter';
import { skiFrame, transform } from './fk';
import type { Rigid } from './fk';
import { Q_FRAMES, qTable, rootWorlds } from './q-table';
import { MIRROR, skiGoal } from './turn';

/** The capsule figure placed by the solve's forward kinematics, its skis bent as solved. */
export interface SolvedFigure {
  readonly world: ReadonlyArray<Mat4>;
  /** Per side, outside then inside, 1/m. */
  readonly bend: readonly [number, number];
  /** Per side, the capsule boot's frame on the solved binding, where its shell and binding are drawn. */
  readonly shells: Readonly<Record<BodySide, Mat4 | undefined>>;
}

const mat = (R: ReadonlyArray<number>, p: Vec3): Mat4 =>
  new Float32Array([R[0] ?? 1, R[3] ?? 0, R[6] ?? 0, 0, R[1] ?? 0, R[4] ?? 1, R[7] ?? 0, 0, R[2] ?? 0, R[5] ?? 0, R[8] ?? 1, 0, p[0], p[1], p[2], 1]);
const mul3 = (a: ReadonlyArray<number>, b: ReadonlyArray<number>): number[] =>
  [0, 1, 2].flatMap((r) => [0, 1, 2].map((c) => (a[3 * r] ?? 0) * (b[c] ?? 0) + (a[3 * r + 1] ?? 0) * (b[3 + c] ?? 0) + (a[3 * r + 2] ?? 0) * (b[6 + c] ?? 0)));
const num = (r: Rigid): { readonly R: number[]; readonly p: Vec3 } => ({ R: r.R.map(Number), p: [Number(r.p[0]), Number(r.p[1]), Number(r.p[2])] });
const pointOf = (m: Mat4): Vec3 => [m[12] ?? 0, m[13] ?? 0, m[14] ?? 0];
const withPoint = (m: Mat4, p: Vec3): Mat4 => {
  const out = new Float32Array(m);
  [out[12], out[13], out[14]] = p;
  return out;
};

/** Capsule segment index → its ISB pair's index in PAIRS. */
const PAIR_OF = new Map(PAIRS.map(([leg], k) => [segmentIndex(leg), k]));
const SIDE_OF = (side: BodySide): Side => (side === BodySide.Right ? Side.Right : Side.Left);
// Mid-thickness under the binding with no setback: the solve's ski centre is SKI_MOUNT ahead of the binding.
const SKI_IN_BINDING = translation([0, -EQUIPMENT.skiThickness / 2, 0]);
const BOOT_IN_BINDING = rigidInverse(CAPSULE_BINDING);
const HIP_IN_PELVIS = (() => {
  const thigh = SEGMENTS.find((s) => s.kind === SegmentKind.Thigh);
  if (thigh === undefined) throw new Error('no thigh segment');
  return [0, thigh.joint[1], thigh.joint[2]] as Vec3;
})();

/** The ankle in each foot's frame with the rest-world axes: where the solver's boot capsules hang. */
const ANKLE_FRAME: Readonly<Record<Side, Mat4>> = {
  [Side.Right]: compose(rigidInverse(restWorld(`foot.${Side.Right}`)), translation(SKELETON_DATA.gear_fit[Side.Right].ankle)),
  [Side.Left]: compose(rigidInverse(restWorld(`foot.${Side.Left}`)), translation(SKELETON_DATA.gear_fit[Side.Left].ankle)),
};
const ankleOf = (w: Readonly<Record<string, Rigid>>, s: Side): Vec3 => {
  const foot = w[`foot.${s}`];
  if (foot === undefined) throw new Error(`no foot.${s}`);
  return transform(foot, pointOf(ANKLE_FRAME[s])).map(Number) as unknown as Vec3;
};

/** `m` turned the least way so its −y runs from `from` to `to`, y stretched so the capsule's bone of `length` spans them. */
const along = (m: Mat4, from: Vec3, to: Vec3, length: number): Mat4 => {
  const d: Vec3 = [from[0] - to[0], from[1] - to[1], from[2] - to[2]];
  const n = Math.hypot(...d);
  const v: Vec3 = [d[0] / n, d[1] / n, d[2] / n];
  const y: Vec3 = [m[4] ?? 0, m[5] ?? 0, m[6] ?? 0];
  // Rodrigues for y → v.
  const c = y[0] * v[0] + y[1] * v[1] + y[2] * v[2];
  const k: Vec3 = [y[1] * v[2] - y[2] * v[1], y[2] * v[0] - y[0] * v[2], y[0] * v[1] - y[1] * v[0]];
  const turn = (a: Vec3): Vec3 => {
    const kxa: Vec3 = [k[1] * a[2] - k[2] * a[1], k[2] * a[0] - k[0] * a[2], k[0] * a[1] - k[1] * a[0]];
    const kka = k[0] * a[0] + k[1] * a[1] + k[2] * a[2];
    const f = 1 / (1 + c);
    return [a[0] * c + kxa[0] + k[0] * kka * f, a[1] * c + kxa[1] + k[1] * kka * f, a[2] * c + kxa[2] + k[2] * kka * f];
  };
  const x = turn([m[0] ?? 0, m[1] ?? 0, m[2] ?? 0]);
  const z = turn([m[8] ?? 0, m[9] ?? 0, m[10] ?? 0]);
  const s = n / length;
  return new Float32Array([...x, 0, v[0] * s, v[1] * s, v[2] * s, 0, ...z, 0, ...from, 1]);
};

/** The capsule's hip line on the solved hip centres `a` and `b`, the pelvis turned as `rotated`. */
const pelvisOn = (rotated: Mat4, a: Vec3, b: Vec3): Mat4 => {
  const mid: Vec3 = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
  const off = transformPoint(rotated, HIP_IN_PELVIS);
  return withPoint(rotated, [mid[0] - off[0], mid[1] - off[1], mid[2] - off[2]]);
};

/**
 * Capsule world matrices from ISB root frames: every paired segment turns as its ISB segment; the legs stand on
 * the solved hip and knee centres and the boots and skis on the solved bindings, so the stance is the solve's.
 * The trunk, head and arms hang on the capsule's own joints; `legacy` (the drawn pose's matrices) carries the girdles.
 */
export const placeCapsule = (w: Readonly<Record<string, Rigid>>, legacy: ReadonlyArray<Mat4>): ReadonlyArray<Mat4> => {
  const out: Mat4[] = [];
  const femur = (s: 'R' | 'L'): Vec3 => num(w[`femur.${s}`] ?? { R: [], p: [0, 0, 0] }).p;
  SEGMENTS.forEach((segment, i) => {
    const parent = segment.parent === null ? identity() : (out[segment.parent] ?? identity());
    const k = PAIR_OF.get(i);
    if (segment.kind === SegmentKind.Ski) {
      const f = num(skiFrame(w, SIDE_OF(segment.side)));
      out[i] = compose(mat(f.R, f.p), SKI_IN_BINDING);
      return;
    }
    if (segment.kind === SegmentKind.Boot) {
      // The solver's boot hangs at the ankle in the rest-world axes, turned as the foot.
      const s = SIDE_OF(segment.side);
      const f = num(w[`foot.${s}`] ?? { R: [], p: [0, 0, 0] });
      out[i] = compose(mat(f.R, f.p), ANKLE_FRAME[s]);
      return;
    }
    if (k === undefined) {
      // Unpaired: rides its parent as the drawn pose has it.
      const p = segment.parent === null ? undefined : legacy[segment.parent];
      out[i] = p === undefined ? (legacy[i] ?? identity()) : compose(parent, rigidInverse(p), legacy[i] ?? identity());
      return;
    }
    const [, isb] = PAIRS[k] ?? ['', ''];
    const r = w[isb];
    if (r === undefined) throw new Error(`no segment ${isb}`);
    const { R, p } = num(r);
    const rotated = mat(mul3(R, ALIGN[k] ?? []), [0, 0, 0]);
    if (segment.kind === SegmentKind.Thigh || segment.kind === SegmentKind.Shin) {
      const s = SIDE_OF(segment.side);
      const thigh = segment.kind === SegmentKind.Thigh;
      const end = thigh ? num(w[`tibia.${s}`] ?? r).p : ankleOf(w, s);
      out[i] = along(rotated, p, end, -(SEGMENTS[i + 1]?.joint[1] ?? 1));
      return;
    }
    if (segment.kind === SegmentKind.Pelvis) {
      out[i] = pelvisOn(rotated, femur('R'), femur('L'));
      return;
    }
    out[i] = withPoint(rotated, pointOf(compose(parent, translation(segment.joint))));
  });
  return out;
};

/** q at turn time `t`, linear between stored frames; past the last, toward the next turn's mirrored start. */
export const qAt = (q: ReadonlyArray<ArrayLike<number>>, t: number): Float64Array => {
  const n = q.length;
  const u = (((t % 1) + 1) % 1) * n;
  const i = Math.min(n - 1, Math.floor(u + 1e-9));
  const f = Math.max(0, u - i);
  const a = q[i];
  const first = q[0];
  if (a === undefined || first === undefined) throw new Error('empty q table');
  const b = i + 1 < n ? (q[i + 1] ?? a) : Float64Array.from(MIRROR.perm, (j, c) => (MIRROR.sign[c] ?? 1) * (first[j] ?? 0));
  return Float64Array.from({ length: a.length }, (_, c) => (a[c] ?? 0) + f * ((b[c] ?? 0) - (a[c] ?? 0)));
};

/** The solve at a turn time: ISB root frames, and per side the skis' bend, outside then inside, 1/m. */
export interface Solved {
  readonly w: Readonly<Record<string, Rigid>>;
  readonly bend: readonly [number, number];
}

const tables = new Map<string, ReadonlyArray<Float64Array> | null>();
const stored = new Map<string, Solved>();
let last: { readonly key: string; readonly t: number; readonly solved: Solved } | null = null;

/**
 * The migrated drill's solve at turn time `t`, or null when it has none. Kept per stored frame, where it is exact,
 * and for the last time asked, which the camera lock and both figures share within a draw.
 */
export const solvedAt = (drill: string, intensity: Intensity, t: number): Solved | null => {
  const key = `${drill}|${intensity}`;
  if (last !== null && last.key === key && last.t === t) return last.solved;
  if (!tables.has(key)) tables.set(key, qTable(drill, intensity));
  const q = tables.get(key) ?? null;
  if (q === null) return null;
  const u = (((t % 1) + 1) % 1) * Q_FRAMES;
  // k / Q_FRAMES * Q_FRAMES misses the integer by an ulp for most k.
  const k = Math.round(u);
  const frame = Math.abs(u - k) < 1e-9 && k < Q_FRAMES && q.length === Q_FRAMES ? `${key}|${k}` : null;
  let solved = frame === null ? undefined : stored.get(frame);
  if (solved === undefined) {
    const [out, ins] = skiGoal(drill, intensity, surfaceFor(drill, intensity), t).bend.map(bendCurvatureOf);
    solved = { w: rootWorlds(drill, intensity, qAt(q, t), t), bend: [out ?? 0, ins ?? 0] };
    if (frame !== null) stored.set(frame, solved);
  }
  last = { key, t, solved };
  return solved;
};

const PELVIS = SEGMENTS.findIndex((s) => s.kind === SegmentKind.Pelvis);

/** The capsule pelvis's frame (the camera locks' pelvis) on the solve at turn time `t`, or null when the drill has none. */
export const solvedPelvis = (drill: string, intensity: Intensity, t: number): Mat4 | null => {
  const w = solvedAt(drill, intensity, t)?.w;
  const k = PAIR_OF.get(PELVIS);
  const r = w?.['pelvis'];
  if (w === undefined || k === undefined || r === undefined) return null;
  const femur = (s: Side): Vec3 => num(w[`femur.${s}`] ?? r).p;
  return pelvisOn(mat(mul3(num(r).R, ALIGN[k] ?? []), [0, 0, 0]), femur(Side.Right), femur(Side.Left));
};

/** The migrated drill's capsule figure at turn time `t`, or null when it has no solve. */
export const solvedFigure = (drill: string, intensity: Intensity, t: number, legacy: ReadonlyArray<Mat4>): SolvedFigure | null => {
  const solved = solvedAt(drill, intensity, t);
  if (solved === null) return null;
  const { w } = solved;
  const [out, ins] = solved.bend;
  const shell = (side: Side): Mat4 => {
    const f = num(skiFrame(w, side));
    return compose(mat(f.R, f.p), BOOT_IN_BINDING);
  };
  return { world: placeCapsule(w, legacy), bend: [out, ins], shells: { [BodySide.Right]: shell(Side.Right), [BodySide.Left]: shell(Side.Left), [BodySide.Center]: undefined } };
};
