/** Dense row-major matrix. */
export interface Matrix {
  readonly rows: number;
  readonly cols: number;
  readonly data: Float64Array;
}
export type Vector = Float64Array;

const at = (a: ArrayLike<number>, i: number): number => a[i] as number;

export const matrix = (rows: number, cols: number, data: ArrayLike<number> = new Float64Array(rows * cols)): Matrix => {
  if (data.length !== rows * cols) throw new Error(`matrix: ${data.length} values for ${rows} × ${cols}`);
  return { rows, cols, data: Float64Array.from(data) };
};

/** Least squares over the columns `free` of A by Householder QR; a column with no pivot gets 0. */
const lstsq = (A: Matrix, free: ReadonlyArray<number>, rhs: Float64Array): Float64Array => {
  const m = A.rows;
  const k = free.length;
  // Column-major copy: q[c * m + r].
  const q = new Float64Array(m * k);
  for (let c = 0; c < k; c++) for (let r = 0; r < m; r++) q[c * m + r] = at(A.data, r * A.cols + at(free, c));
  const y = Float64Array.from(rhs);
  const diag = new Float64Array(k);
  const reflect = (vv: number, c: number, target: Float64Array, offset: number): void => {
    let d = 0;
    for (let r = c; r < m; r++) d += at(q, c * m + r) * at(target, offset + r);
    const f = (2 * d) / vv;
    for (let r = c; r < m; r++) target[offset + r] = at(target, offset + r) - f * at(q, c * m + r);
  };
  for (let c = 0; c < Math.min(k, m); c++) {
    let s = 0;
    for (let r = c; r < m; r++) s += at(q, c * m + r) ** 2;
    if (s === 0) continue;
    const head = at(q, c * m + c);
    const alpha = head > 0 ? -Math.sqrt(s) : Math.sqrt(s);
    q[c * m + c] = head - alpha;
    const vv = s - head * head + (head - alpha) ** 2;
    for (let j = c + 1; j < k; j++) reflect(vv, c, q, j * m);
    reflect(vv, c, y, 0);
    diag[c] = alpha;
  }
  let big = 0;
  for (const d of diag) big = Math.max(big, Math.abs(d));
  const x = new Float64Array(k);
  for (let c = Math.min(k, m) - 1; c >= 0; c--) {
    let s = at(y, c);
    for (let j = c + 1; j < k; j++) s -= at(q, j * m + c) * at(x, j);
    const d = at(diag, c);
    x[c] = Math.abs(d) > 1e-13 * big ? s / d : 0;
  }
  return x;
};

/** Aᵀ(Ax − b). */
const gradient = (A: Matrix, b: Vector, x: Vector): Float64Array => {
  const g = new Float64Array(A.cols);
  for (let r = 0; r < A.rows; r++) {
    let res = -at(b, r);
    for (let c = 0; c < A.cols; c++) res += at(A.data, r * A.cols + c) * at(x, c);
    for (let c = 0; c < A.cols; c++) g[c] = at(g, c) + at(A.data, r * A.cols + c) * res;
  }
  return g;
};

/**
 * argmin ‖Ax − b‖² subject to lo ≤ x ≤ hi, by Stark & Parker's (1995) bounded-variable least squares: an active
 * set where each step frees the bound variable whose gradient most violates the KKT conditions, then interpolates
 * toward the free least-squares solution until it is feasible.
 */
export const bvls = (A: Matrix, b: Vector, lo: Vector, hi: Vector): Vector => {
  const { rows: m, cols: n } = A;
  if (b.length !== m || lo.length !== n || hi.length !== n) throw new Error('bvls: size mismatch');
  for (let i = 0; i < n; i++) if (!(at(lo, i) <= at(hi, i))) throw new Error(`bvls: lo > hi at ${i}`);
  const x = new Float64Array(n);
  // −1 at lo, +1 at hi, 0 free.
  const state = new Int8Array(n);
  const freeSet = (): number[] => Array.from({ length: n }, (_, i) => i).filter((i) => state[i] === 0);
  const solveFree = (free: ReadonlyArray<number>): Float64Array => {
    const rhs = Float64Array.from(b);
    for (let i = 0; i < n; i++) {
      if (state[i] === 0) continue;
      for (let r = 0; r < m; r++) rhs[r] = at(rhs, r) - at(A.data, r * n + i) * at(x, i);
    }
    return lstsq(A, free, rhs);
  };

  // Start from the free solution with violators pinned, repeated until the rest is feasible.
  for (let free = freeSet(); free.length > 0; free = freeSet()) {
    const z = solveFree(free);
    let pinned = false;
    free.forEach((i, k) => {
      const v = at(z, k);
      if (v < at(lo, i)) [x[i], state[i], pinned] = [at(lo, i), -1, true];
      else if (v > at(hi, i)) [x[i], state[i], pinned] = [at(hi, i), 1, true];
      else x[i] = v;
    });
    if (!pinned) break;
  }

  let norm = 0;
  for (const v of A.data) norm += v * v;
  let bn = 0;
  for (const v of b) bn += v * v;
  const tol = 1e-12 * (norm + Math.sqrt(norm * bn));
  const blocked = new Set<number>();
  for (let iter = 0; iter < 10 * n + 10; iter++) {
    const g = gradient(A, b, x);
    let best = -1;
    let worst = tol;
    for (let i = 0; i < n; i++) {
      const v = at(g, i) * (state[i] ?? 0);
      if (state[i] !== 0 && !blocked.has(i) && v > worst) [best, worst] = [i, v];
    }
    if (best < 0) break;
    const was = state[best] ?? 0;
    state[best] = 0;
    for (let inner = 0; ; inner++) {
      const free = freeSet();
      const z = solveFree(free);
      let alpha = 1;
      let hit = -1;
      free.forEach((i, k) => {
        const v = at(z, k);
        const xi = at(x, i);
        const bound = v < at(lo, i) ? at(lo, i) : v > at(hi, i) ? at(hi, i) : null;
        if (bound === null) return;
        const a = (bound - xi) / (v - xi);
        if (a < alpha) [alpha, hit] = [a, i];
      });
      if (hit === best && inner === 0 && alpha <= 0) {
        // The freed variable cannot leave its bound: keep it there until something else moves.
        state[best] = was;
        blocked.add(best);
        break;
      }
      free.forEach((i, k) => (x[i] = at(x, i) + alpha * (at(z, k) - at(x, i))));
      blocked.clear();
      if (hit < 0) break;
      const toLo = at(z, free.indexOf(hit)) < at(lo, hit);
      [x[hit], state[hit]] = toLo ? [at(lo, hit), -1] : [at(hi, hit), 1];
    }
  }
  return x;
};
