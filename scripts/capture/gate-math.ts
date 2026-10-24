// Pure geometry for scripts/capture/gates.ts.

export type V3 = [number, number, number];
export type V2 = [number, number];
/** Row-major 3 × 3. */
export type M3 = number[];
export interface Frame3 {
  readonly R: M3;
  readonly p: V3;
}

const DEG = 180 / Math.PI;
export const sub = (a: ReadonlyArray<number>, b: ReadonlyArray<number>): V3 => [(a[0] ?? 0) - (b[0] ?? 0), (a[1] ?? 0) - (b[1] ?? 0), (a[2] ?? 0) - (b[2] ?? 0)];
export const addV = (a: ReadonlyArray<number>, b: ReadonlyArray<number>): V3 => [(a[0] ?? 0) + (b[0] ?? 0), (a[1] ?? 0) + (b[1] ?? 0), (a[2] ?? 0) + (b[2] ?? 0)];
export const scale = (a: ReadonlyArray<number>, k: number): V3 => [(a[0] ?? 0) * k, (a[1] ?? 0) * k, (a[2] ?? 0) * k];
export const dot = (a: ReadonlyArray<number>, b: ReadonlyArray<number>): number => (a[0] ?? 0) * (b[0] ?? 0) + (a[1] ?? 0) * (b[1] ?? 0) + (a[2] ?? 0) * (b[2] ?? 0);
export const cross = (a: ReadonlyArray<number>, b: ReadonlyArray<number>): V3 => [
  (a[1] ?? 0) * (b[2] ?? 0) - (a[2] ?? 0) * (b[1] ?? 0),
  (a[2] ?? 0) * (b[0] ?? 0) - (a[0] ?? 0) * (b[2] ?? 0),
  (a[0] ?? 0) * (b[1] ?? 0) - (a[1] ?? 0) * (b[0] ?? 0),
];
export const norm = (a: ReadonlyArray<number>): number => Math.sqrt(dot(a, a));
export const unit = (a: ReadonlyArray<number>): V3 => scale(a, 1 / (norm(a) || 1));
export const col = (R: M3, c: number): V3 => [R[c] ?? 0, R[3 + c] ?? 0, R[6 + c] ?? 0];
export const mulV = (R: M3, v: ReadonlyArray<number>): V3 => [dot(R.slice(0, 3), v), dot(R.slice(3, 6), v), dot(R.slice(6, 9), v)];
export const mulM = (a: M3, b: M3): M3 => Array.from({ length: 9 }, (_, i) => dot(a.slice(Math.floor(i / 3) * 3, Math.floor(i / 3) * 3 + 3), col(b, i % 3)));
export const transpose = (a: M3): M3 => [0, 3, 6, 1, 4, 7, 2, 5, 8].map((i) => a[i] ?? 0);
export const apply = (f: Frame3, v: ReadonlyArray<number>): V3 => addV(mulV(f.R, v), f.p);
export const compose = (a: Frame3, b: Frame3): Frame3 => ({ R: mulM(a.R, b.R), p: apply(a, b.p) });

/** Unsigned angle between two vectors, degrees. */
export const angle = (a: ReadonlyArray<number>, b: ReadonlyArray<number>): number => Math.atan2(norm(cross(a, b)), dot(a, b)) * DEG;

/** Interior-angle complement at b: 0 for a straight a-b-c, as knee flexion from three joint centres. */
export const flexion3 = (a: ReadonlyArray<number>, b: ReadonlyArray<number>, c: ReadonlyArray<number>): number => angle(sub(b, a), sub(c, b));

/** Hip flexion: the thigh's pitch in the pelvis frame's sagittal plane (x anterior, y up), degrees. */
export const hipFlexion = (pelvis: M3, hip: ReadonlyArray<number>, knee: ReadonlyArray<number>): number => {
  const d = mulV(transpose(pelvis), sub(knee, hip));
  return Math.atan2(d[0], -d[1]) * DEG;
};

/** Pinhole projection of a world point; K = [fx, fy, cx, cy], world to camera (OpenCV axes). */
export const project = (K: ReadonlyArray<number>, w2c: Frame3, X: ReadonlyArray<number>): V2 => {
  const c = apply(w2c, X);
  return [(K[0] ?? 0) * (c[0] / c[2]) + (K[2] ?? 0), (K[1] ?? 0) * (c[1] / c[2]) + (K[3] ?? 0)];
};

/** Undirected image-line angle difference, degrees in [0, 90]. */
export const lineAngle = (a0: V2, a1: V2, b0: V2, b1: V2): number => {
  const d = Math.abs(Math.atan2(a1[1] - a0[1], a1[0] - a0[0]) - Math.atan2(b1[1] - b0[1], b1[0] - b0[0])) * DEG % 180;
  return Math.min(d, 180 - d);
};
/** Signed undirected angle from line a to line b, degrees in (-90, 90]. */
export const lineTurn = (a0: V2, a1: V2, b0: V2, b1: V2): number => {
  let d = (Math.atan2(b1[1] - b0[1], b1[0] - b0[0]) - Math.atan2(a1[1] - a0[1], a1[0] - a0[0])) * DEG;
  d = ((d % 180) + 180) % 180;
  return d > 90 ? d - 180 : d;
};

/** An oriented box: frame, half extents along its x, y, z. */
export interface Box {
  readonly f: Frame3;
  readonly h: V3;
}

/** Separating-axis overlap of two boxes, metres: > 0 is penetration depth, ≤ 0 separation along the best axis. */
export const boxOverlap = (a: Box, b: Box): number => {
  const ax = [0, 1, 2].map((i) => col(a.f.R, i));
  const bx = [0, 1, 2].map((i) => col(b.f.R, i));
  const axes = [...ax, ...bx, ...ax.flatMap((u) => bx.map((v) => cross(u, v)))].filter((u) => norm(u) > 1e-6).map(unit);
  const t = sub(b.f.p, a.f.p);
  let best = Infinity;
  for (const u of axes) {
    const ra = ax.reduce((s, e, i) => s + (a.h[i] ?? 0) * Math.abs(dot(e, u)), 0);
    const rb = bx.reduce((s, e, i) => s + (b.h[i] ?? 0) * Math.abs(dot(e, u)), 0);
    best = Math.min(best, ra + rb - Math.abs(dot(t, u)));
  }
  return best;
};

/** Signed distance from a point to a box surface: negative inside. */
export const boxDistance = (b: Box, p: ReadonlyArray<number>): number => {
  const l = mulV(transpose(b.f.R), sub(p, b.f.p));
  const q = l.map((v, i) => Math.abs(v) - (b.h[i] ?? 0));
  const out = Math.hypot(...q.map((v) => Math.max(v, 0)));
  return out + Math.min(Math.max(q[0] ?? 0, q[1] ?? 0, q[2] ?? 0), 0);
};

/** Capsule clearance to a box, metres (negative = penetration), sampled along the capsule's axis. */
export const capsuleBoxClearance = (b: Box, p0: ReadonlyArray<number>, p1: ReadonlyArray<number>, radius: number, samples = 17): number => {
  let best = Infinity;
  for (let k = 0; k < samples; k++) best = Math.min(best, boxDistance(b, addV(p0, scale(sub(p1, p0), k / (samples - 1)))) - radius);
  return best;
};

/** Least-squares plane through points: unit normal (y-up hemisphere) and offset, n·p = d. */
export const fitPlane = (pts: ReadonlyArray<ReadonlyArray<number>>): { n: V3; d: number } => {
  const c = scale(pts.reduce<V3>((s, p) => addV(s, p), [0, 0, 0]), 1 / pts.length);
  const A = [0, 0, 0, 0, 0, 0, 0, 0, 0];
  for (const p of pts) {
    const v = sub(p, c);
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) A[i * 3 + j] = (A[i * 3 + j] ?? 0) + (v[i] ?? 0) * (v[j] ?? 0);
  }
  // Smallest eigenvector by inverse iteration on A + εI.
  let n: V3 = [0, 1, 0];
  const M = A.map((v, i) => v + (i % 4 === 0 ? 1e-9 : 0));
  for (let it = 0; it < 50; it++) n = unit(solve3(M, n));
  if (n[1] < 0) n = scale(n, -1);
  return { n, d: dot(n, c) };
};

const solve3 = (M: ReadonlyArray<number>, b: V3): V3 => {
  const m = (i: number): number => M[i] ?? 0;
  const det = m(0) * (m(4) * m(8) - m(5) * m(7)) - m(1) * (m(3) * m(8) - m(5) * m(6)) + m(2) * (m(3) * m(7) - m(4) * m(6));
  const c0: V3 = [m(0), m(3), m(6)];
  const c1: V3 = [m(1), m(4), m(7)];
  const c2: V3 = [m(2), m(5), m(8)];
  const d3 = (a: V3, e: V3, f: V3): number => dot(a, cross(e, f));
  return [d3(b, c1, c2) / det, d3(c0, b, c2) / det, d3(c0, c1, b) / det];
};

export const quantile = (xs: ReadonlyArray<number>, q: number): number => {
  const s = xs.filter(Number.isFinite).toSorted((a, b) => a - b);
  if (s.length === 0) return Number.NaN;
  const k = (s.length - 1) * q;
  const lo = Math.floor(k);
  return (s[lo] ?? 0) + ((s[Math.ceil(k)] ?? 0) - (s[lo] ?? 0)) * (k - lo);
};
