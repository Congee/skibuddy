import type { Dual } from '../../solve/dual';
import type { Mat4, Vec3 } from '../mat4';
import { COORDINATES, DofKind, REST_POSE, SEGMENT_NAMES, SKELETON_DATA, Axis, bindingInSegment, Side } from '../skeleton';

/**
 * skeleton.ts's forward kinematics over dual numbers, so solver blocks get exact Jacobians. Scalars stay
 * plain numbers until a variable touches them, which keeps the many constant entries cheap.
 */

export type Scalar = Dual | number;
export type V3 = readonly [Scalar, Scalar, Scalar];
/** Row-major 3 × 3. */
type M3 = readonly Scalar[];

export interface Rigid {
  readonly R: M3;
  readonly p: V3;
}

export const add = (a: Scalar, b: Scalar): Scalar => {
  if (typeof a === 'number') return typeof b === 'number' ? a + b : a === 0 ? b : b.add(a);
  return typeof b === 'number' && b === 0 ? a : a.add(b);
};
export const sub = (a: Scalar, b: Scalar): Scalar => add(a, neg(b));
export const neg = (a: Scalar): Scalar => (typeof a === 'number' ? -a : a.neg());
export const mul = (a: Scalar, b: Scalar): Scalar => {
  if (typeof a === 'number') {
    if (typeof b === 'number') return a * b;
    return a === 0 ? 0 : a === 1 ? b : b.mul(a);
  }
  if (typeof b === 'number') return b === 0 ? 0 : b === 1 ? a : a.mul(b);
  return a.mul(b);
};
export const value = (a: Scalar): number => (typeof a === 'number' ? a : a.v);
const cos = (a: Scalar): Scalar => (typeof a === 'number' ? Math.cos(a) : a.cos());
const sin = (a: Scalar): Scalar => (typeof a === 'number' ? Math.sin(a) : a.sin());
export const asin = (a: Scalar): Scalar => (typeof a === 'number' ? Math.asin(a) : a.chain(Math.asin(a.v), 1 / Math.sqrt(Math.max(1e-12, 1 - a.v * a.v))));

/** atan2 with the derivative (x dy − y dx) / r². */
export const atan2 = (y: Scalar, x: Scalar): Scalar => {
  const [yv, xv] = [value(y), value(x)];
  const r2 = Math.max(1e-12, xv * xv + yv * yv);
  return add(Math.atan2(yv, xv), mul(1 / r2, sub(mul(xv, y), mul(yv, x))));
};
export const dot3 = (a: V3, b: V3): Scalar => add(add(mul(a[0], b[0]), mul(a[1], b[1])), mul(a[2], b[2]));
export const sub3 = (a: V3, b: V3): V3 => [sub(a[0], b[0]), sub(a[1], b[1]), sub(a[2], b[2])];
export const cross3 = (a: V3, b: V3): V3 => [
  sub(mul(a[1], b[2]), mul(a[2], b[1])),
  sub(mul(a[2], b[0]), mul(a[0], b[2])),
  sub(mul(a[0], b[1]), mul(a[1], b[0])),
];

const matMul = (a: M3, b: M3): M3 => {
  const out: Scalar[] = [];
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) out.push(add(add(mul(a[r * 3] ?? 0, b[c] ?? 0), mul(a[r * 3 + 1] ?? 0, b[3 + c] ?? 0)), mul(a[r * 3 + 2] ?? 0, b[6 + c] ?? 0)));
  return out;
};
const matVec = (a: M3, v: V3): V3 => [0, 1, 2].map((r) => add(add(mul(a[r * 3] ?? 0, v[0]), mul(a[r * 3 + 1] ?? 0, v[1])), mul(a[r * 3 + 2] ?? 0, v[2]))) as unknown as V3;

export const compose = (a: Rigid, b: Rigid): Rigid => {
  const t = matVec(a.R, b.p);
  return { R: matMul(a.R, b.R), p: [add(t[0], a.p[0]), add(t[1], a.p[1]), add(t[2], a.p[2])] };
};
export const transform = (m: Rigid, v: V3): V3 => {
  const t = matVec(m.R, v);
  return [add(t[0], m.p[0]), add(t[1], m.p[1]), add(t[2], m.p[2])];
};
/** Column `c` of the rotation: the frame's axis in the world. */
export const axisOf = (m: Rigid, c: 0 | 1 | 2): V3 => [m.R[c] ?? 0, m.R[3 + c] ?? 0, m.R[6 + c] ?? 0];

const rotation = (axis: Axis, a: Scalar): M3 => {
  const c = cos(a);
  const s = sin(a);
  const ns = neg(s);
  if (axis === Axis.X) return [1, 0, 0, 0, c, ns, 0, s, c];
  if (axis === Axis.Y) return [c, 0, s, 0, 1, 0, ns, 0, c];
  return [c, ns, 0, s, c, 0, 0, 0, 1];
};

/** A column-major Mat4 as a constant rigid transform. */
export const fromMat4 = (m: Mat4): Rigid => ({
  R: [m[0] ?? 0, m[4] ?? 0, m[8] ?? 0, m[1] ?? 0, m[5] ?? 0, m[9] ?? 0, m[2] ?? 0, m[6] ?? 0, m[10] ?? 0],
  p: [m[12] ?? 0, m[13] ?? 0, m[14] ?? 0],
});

const restOf = (name: string): { readonly R: number[]; readonly o: Vec3 } => {
  const s = SKELETON_DATA.segments[name];
  if (s === undefined) throw new Error(`no segment ${name}`);
  return { R: [s.x[0], s.y[0], s.z[0], s.x[1], s.y[1], s.z[1], s.x[2], s.y[2], s.z[2]], o: s.origin };
};

interface SegmentConst {
  readonly parent: string | null;
  /** Joint centre in the parent's rest frame; the root's rest origin. */
  readonly joint: Vec3;
  /** Rest rotation relative to the parent's; the root's in the world. */
  readonly local: readonly number[];
  /** COORDINATES indices in Grood–Suntay order, with sign and rest. */
  readonly dofs: ReadonlyArray<{ readonly index: number; readonly axis: Axis; readonly sign: number; readonly rest: number }>;
}

const ORDER: ReadonlyArray<Axis> = [Axis.Z, Axis.X, Axis.Y];

const transposeMul = (a: readonly number[], b: readonly number[]): number[] =>
  Array.from({ length: 9 }, (_, i) => {
    const r = Math.floor(i / 3);
    const c = i % 3;
    return (a[r] ?? 0) * (b[c] ?? 0) + (a[3 + r] ?? 0) * (b[3 + c] ?? 0) + (a[6 + r] ?? 0) * (b[6 + c] ?? 0);
  });

const SEGMENTS: Readonly<Record<string, SegmentConst>> = Object.fromEntries(
  SEGMENT_NAMES.map((name) => {
    const parent = SKELETON_DATA.segments[name]?.parent ?? null;
    const rest = restOf(name);
    const dofs = ORDER.flatMap((axis) =>
      COORDINATES.flatMap((c, index) =>
        c.segment === name && c.kind === DofKind.Rotation && c.locked !== true && c.axis === axis ? [{ index, axis, sign: c.sign, rest: REST_POSE[c.name] ?? 0 }] : [],
      ),
    );
    if (parent === null) return [name, { parent, joint: rest.o, local: rest.R, dofs }];
    const p = restOf(parent);
    const d = [rest.o[0] - p.o[0], rest.o[1] - p.o[1], rest.o[2] - p.o[2]];
    const joint: Vec3 = [0, 1, 2].map((c) => (p.R[c] ?? 0) * (d[0] ?? 0) + (p.R[3 + c] ?? 0) * (d[1] ?? 0) + (p.R[6 + c] ?? 0) * (d[2] ?? 0)) as unknown as Vec3;
    return [name, { parent, joint, local: transposeMul(p.R, rest.R), dofs }];
  }),
);

const index = (name: string): number => COORDINATES.findIndex((c) => c.name === name);
const TRANSLATION = [index('pelvis_tx'), index('pelvis_ty'), index('pelvis_tz')] as const;

/** Every segment's ancestors and itself, root first. */
export const chainOf = (names: ReadonlyArray<string>): string[] => {
  const need = new Set<string>();
  for (const n of names) for (let at: string | null = n; at !== null; at = SEGMENTS[at]?.parent ?? null) need.add(at);
  return SEGMENT_NAMES.filter((n) => need.has(n));
};

const IDENTITY: readonly number[] = [1, 0, 0, 0, 1, 0, 0, 0, 1];

/**
 * World frames of `segments` (closed under parents, in SEGMENT_NAMES order) for coordinates `q` in COORDINATES
 * order, the pelvis translated by `offset` plus its own coordinates, as forwardKinematics. The pelvis rotation is
 * relative to `ref` (row-major, constant): R_pelvis = ref · R_rest · R_isb(q), so a moving root keeps q small.
 * `lengths` scales a segment's joint offset from its parent (a subject's bone lengths against the template's).
 */
export const forward = (
  q: ReadonlyArray<Scalar>,
  offset: Vec3 = [0, 0, 0],
  segments: ReadonlyArray<string> = SEGMENT_NAMES,
  ref: readonly number[] = IDENTITY,
  lengths: Readonly<Record<string, Scalar>> = {},
): Readonly<Record<string, Rigid>> => {
  const out: Record<string, Rigid> = {};
  for (const name of segments) {
    const s = SEGMENTS[name];
    if (s === undefined) throw new Error(`no segment ${name}`);
    let joint: M3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];
    for (const d of s.dofs) joint = matMul(joint, rotation(d.axis, mul(d.sign, sub(q[d.index] ?? 0, d.rest))));
    if (s.parent === null) {
      const t: V3 = [0, 1, 2].map((k) => add(add(q[TRANSLATION[k as 0 | 1 | 2]] ?? 0, offset[k as 0 | 1 | 2]), s.joint[k as 0 | 1 | 2])) as unknown as V3;
      out[name] = { R: matMul(ref === IDENTITY ? s.local : matMul(ref, s.local), joint), p: t };
      continue;
    }
    const parent = out[s.parent];
    if (parent === undefined) throw new Error(`segment ${name} precedes its parent ${s.parent}`);
    const l = lengths[name];
    out[name] = compose(parent, { R: matMul(joint, s.local), p: l === undefined ? s.joint : (s.joint.map((c) => mul(l, c)) as unknown as V3) });
  }
  return out;
};

/**
 * Each of `segment`'s rotation coordinates with its world axis times its sign, so a moment's dot with it is the
 * coordinate's generalised force. Grood–Suntay: each axis is the parent's turned by the coordinates before it.
 */
export const dofAxes = (q: ReadonlyArray<Scalar>, world: Readonly<Record<string, Rigid>>, segment: string): Array<{ readonly index: number; readonly axis: V3 }> => {
  const s = SEGMENTS[segment];
  if (s === undefined || s.parent === null) throw new Error(`no joint above ${segment}`);
  const parent = world[s.parent];
  if (parent === undefined) throw new Error(`${s.parent} not solved`);
  let R: M3 = parent.R;
  return s.dofs.map((d) => {
    R = matMul(R, rotation(d.axis, mul(d.sign, sub(q[d.index] ?? 0, d.rest))));
    const c = d.axis === Axis.X ? 0 : d.axis === Axis.Y ? 1 : 2;
    return { index: d.index, axis: [mul(d.sign, R[c] ?? 0), mul(d.sign, R[3 + c] ?? 0), mul(d.sign, R[6 + c] ?? 0)] };
  });
};

/** The binding frame (ski top under the boot; x across to the body's left, y up, z along the ski) in each foot. */
export const BINDING: Readonly<Record<Side, Rigid>> = { [Side.Right]: fromMat4(bindingInSegment(Side.Right)), [Side.Left]: fromMat4(bindingInSegment(Side.Left)) };

/** World frame of a side's ski binding. */
export const skiFrame = (world: Readonly<Record<string, Rigid>>, s: Side): Rigid => {
  const foot = world[`foot.${s}`];
  if (foot === undefined) throw new Error(`foot.${s} not solved`);
  return compose(foot, BINDING[s]);
};
