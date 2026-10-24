import { Side } from '../../skeleton';
import { Terrain } from '../../skier';
import { add, dot3, mul, skiFrame, sub, sub3, transform, value } from '../fk';
import type { Rigid, Scalar, V3 } from '../fk';
import { bootCapsules, skiPoints } from '../turn';
import type { BootCapsule } from '../turn';

type Vec = readonly [number, number, number];
const SKI = skiPoints(Terrain.Groomed);
/** Shank capsule radius above the boot cuff, inferred (a calf's half depth). */
export const SHANK_RADIUS = 0.045;

const dotN = (u: Vec, v: Vec): number => u[0] * v[0] + u[1] * v[1] + u[2] * v[2];
const unit01 = (x: number): number => Math.min(1, Math.max(0, x));
const lerp = (u: V3, v: V3, k: number): V3 => [add(u[0], mul(k, sub(v[0], u[0]))), add(u[1], mul(k, sub(v[1], u[1]))), add(u[2], mul(k, sub(v[2], u[2])))];
const vals = (p: V3): Vec => p.map(value) as unknown as Vec;
const distance = (u: V3, v: V3): Scalar => {
  const d = sub3(u, v);
  const l2 = dot3(d, d);
  return typeof l2 === 'number' ? Math.sqrt(l2) : l2.sqrt();
};

// Same capsule geometry as turn.ts's private clearance (Ericson 5.1.9), copied rather than exported from WIP.
const closest = (p0: Vec, p1: Vec, q0: Vec, q1: Vec): readonly [number, number] => {
  const d1: Vec = [p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]];
  const d2: Vec = [q1[0] - q0[0], q1[1] - q0[1], q1[2] - q0[2]];
  const r: Vec = [p0[0] - q0[0], p0[1] - q0[1], p0[2] - q0[2]];
  const [a, e, f, c, b] = [dotN(d1, d1), dotN(d2, d2), dotN(d2, r), dotN(d1, r), dotN(d1, d2)];
  const den = a * e - b * b;
  let sP = den > 1e-12 ? unit01((b * f - c * e) / den) : 0;
  let tQ = (b * sP + f) / e;
  if (tQ < 0) [tQ, sP] = [0, unit01(-c / a)];
  else if (tQ > 1) [tQ, sP] = [1, unit01((b - c) / a)];
  return [sP, tQ];
};
const nearest = (p: V3, s0: V3, s1: V3): number => {
  const [P, A, B] = [vals(p), vals(s0), vals(s1)];
  const d: Vec = [B[0] - A[0], B[1] - A[1], B[2] - A[2]];
  return unit01(dotN([P[0] - A[0], P[1] - A[1], P[2] - A[2]], d) / Math.max(1e-12, dotN(d, d)));
};

/** Five smooth clearance rows between two capsules (ends against axes, then the axes' closest pair); ≥ 0 is clear. */
export const clearance = (fa: Rigid, ca: BootCapsule, fb: Rigid, cb: BootCapsule): Scalar[] => {
  const [a0, a1, b0, b1] = [transform(fa, ca.a), transform(fa, ca.b), transform(fb, cb.a), transform(fb, cb.b)];
  const r = ca.radius + cb.radius;
  const toAxis = (p: V3, s0: V3, s1: V3): Scalar => sub(distance(p, lerp(s0, s1, nearest(p, s0, s1))), r);
  const ends = [toAxis(a0, b0, b1), toAxis(a1, b0, b1), toAxis(b0, a0, a1), toAxis(b1, a0, a1)];
  const [sP, tQ] = closest(vals(a0), vals(a1), vals(b0), vals(b1));
  const inside = sP > 0 && sP < 1 && tQ > 0 && tQ < 1;
  const e0 = ends[0] ?? 0;
  return [...ends, inside ? sub(distance(lerp(a0, a1, sP), lerp(b0, b1, tQ)), r) : typeof e0 === 'number' ? 1 : e0.mul(0).add(1)];
};

const BOOTS = { [Side.Right]: bootCapsules(Side.Right), [Side.Left]: bootCapsules(Side.Left) } as const;
const other = (s: Side): Side => (s === Side.Right ? Side.Left : Side.Right);

/** The shank from knee to the boot cuff's top, in the tibia frame (origin at the knee). */
const shankOf = (w: Readonly<Record<string, Rigid>>, s: Side): BootCapsule => {
  const t = w[`tibia.${s}`];
  const f = w[`foot.${s}`];
  if (t === undefined || f === undefined) throw new Error('legs not solved');
  // Ankle in the tibia frame, from the current pose; the knee is 1-DOF so the shank is rigid in it.
  const d = sub3(f.p, t.p).map(value);
  const local = [0, 1, 2].map((c) => (t.R[c] === undefined ? 0 : d.reduce((acc, x, r) => acc + x * value(t.R[3 * r + c] ?? 0), 0))) as unknown as Vec;
  return { a: [0, 0, 0], b: [local[0] * 0.5, local[1] * 0.5, local[2] * 0.5], radius: SHANK_RADIUS };
};

export const ClearancePair = { Skis: 'skis', SkiBoot: 'ski–other boot', SkiShank: 'ski–other shank' } as const;
export type ClearancePair = (typeof ClearancePair)[keyof typeof ClearancePair];

/** Clearance rows by pair: ski against ski, each ski against the other foot's boot capsules and shank. */
export const crossClearances = (w: Readonly<Record<string, Rigid>>): Readonly<Record<ClearancePair, Scalar[]>> => {
  const ski = { [Side.Right]: skiFrame(w, Side.Right), [Side.Left]: skiFrame(w, Side.Left) } as const;
  const sides = [Side.Right, Side.Left] as const;
  return {
    [ClearancePair.Skis]: SKI.capsules.flatMap((cr) => SKI.capsules.flatMap((cl) => clearance(ski[Side.Right], cr, ski[Side.Left], cl))),
    [ClearancePair.SkiBoot]: sides.flatMap((s) => {
      const foot = w[`foot.${other(s)}`];
      if (foot === undefined) throw new Error('feet not solved');
      return SKI.capsules.flatMap((cs) => BOOTS[other(s)].flatMap((cb) => clearance(ski[s], cs, foot, cb)));
    }),
    [ClearancePair.SkiShank]: sides.flatMap((s) => {
      const tibia = w[`tibia.${other(s)}`];
      if (tibia === undefined) throw new Error('legs not solved');
      const shank = shankOf(w, other(s));
      return SKI.capsules.flatMap((cs) => clearance(ski[s], cs, tibia, shank));
    }),
  };
};
