/** Plain row-major 3 × 3 and 3-vector helpers for capture preparation (numbers only; the IK uses fk.ts's duals). */

export type M3n = number[];
export type V3n = [number, number, number];

export const mm = (a: ReadonlyArray<number>, b: ReadonlyArray<number>): M3n =>
  Array.from({ length: 9 }, (_, i) => {
    const r = Math.floor(i / 3);
    const c = i % 3;
    return (a[3 * r] ?? 0) * (b[c] ?? 0) + (a[3 * r + 1] ?? 0) * (b[3 + c] ?? 0) + (a[3 * r + 2] ?? 0) * (b[6 + c] ?? 0);
  });
export const mt = (a: ReadonlyArray<number>): M3n => [0, 3, 6, 1, 4, 7, 2, 5, 8].map((i) => a[i] ?? 0);
export const rotY = (t: number): M3n => [Math.cos(t), 0, Math.sin(t), 0, 1, 0, -Math.sin(t), 0, Math.cos(t)];
export const column = (a: ReadonlyArray<number>, c: number): V3n => [a[c] ?? 0, a[3 + c] ?? 0, a[6 + c] ?? 0];
export const dot = (u: ReadonlyArray<number>, v: ReadonlyArray<number>): number => (u[0] ?? 0) * (v[0] ?? 0) + (u[1] ?? 0) * (v[1] ?? 0) + (u[2] ?? 0) * (v[2] ?? 0);
export const cross = (a: ReadonlyArray<number>, b: ReadonlyArray<number>): V3n => [
  (a[1] ?? 0) * (b[2] ?? 0) - (a[2] ?? 0) * (b[1] ?? 0),
  (a[2] ?? 0) * (b[0] ?? 0) - (a[0] ?? 0) * (b[2] ?? 0),
  (a[0] ?? 0) * (b[1] ?? 0) - (a[1] ?? 0) * (b[0] ?? 0),
];
export const minus = (a: ReadonlyArray<number>, b: ReadonlyArray<number>): V3n => [(a[0] ?? 0) - (b[0] ?? 0), (a[1] ?? 0) - (b[1] ?? 0), (a[2] ?? 0) - (b[2] ?? 0)];
export const unit = (v: ReadonlyArray<number>): V3n => {
  const l = Math.hypot(v[0] ?? 0, v[1] ?? 0, v[2] ?? 0) || 1;
  return [(v[0] ?? 0) / l, (v[1] ?? 0) / l, (v[2] ?? 0) / l];
};

/** Grood–Suntay angles of J = Rz(z) · Rx(x) · Ry(y), as fk.ts composes a joint. */
export const zxy = (J: ReadonlyArray<number>): { z: number; x: number; y: number } => ({
  z: Math.atan2(-(J[1] ?? 0), J[4] ?? 1),
  x: Math.asin(Math.max(-1, Math.min(1, J[7] ?? 0))),
  y: Math.atan2(-(J[6] ?? 0), J[8] ?? 1),
});

/** Eigenvector of the smallest eigenvalue of a symmetric 3 × 3 (cyclic Jacobi). */
export const smallestEigenvector = (A: ReadonlyArray<number>): V3n => {
  const a = [...A];
  let V: M3n = [1, 0, 0, 0, 1, 0, 0, 0, 1];
  for (let sweep = 0; sweep < 50; sweep++) {
    for (const [p, q] of [[0, 1], [0, 2], [1, 2]] as const) {
      const apq = a[3 * p + q] ?? 0;
      if (Math.abs(apq) < 1e-15) continue;
      const theta = ((a[3 * q + q] ?? 0) - (a[3 * p + p] ?? 0)) / (2 * apq);
      const t = Math.sign(theta || 1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
      const c = 1 / Math.sqrt(t * t + 1);
      const s = t * c;
      const G: M3n = [1, 0, 0, 0, 1, 0, 0, 0, 1];
      G[3 * p + p] = c;
      G[3 * q + q] = c;
      G[3 * p + q] = s;
      G[3 * q + p] = -s;
      const r = mm(mt(G), mm(a, G));
      a.splice(0, 9, ...r);
      V = mm(V, G);
    }
  }
  const d = [a[0] ?? 0, a[4] ?? 0, a[8] ?? 0];
  const i = d.indexOf(Math.min(...d));
  return column(V, i);
};
