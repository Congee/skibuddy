import { assert, describe, it } from '@effect/vitest';
import { bvls, matrix } from '../src/solve/bvls';
import type { Matrix } from '../src/solve/bvls';

// mulberry32: a seeded uniform generator in [0, 1).
const rng = (seed: number): (() => number) => {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

const at = (a: ArrayLike<number>, i: number): number => a[i] as number;

const gradient = (A: Matrix, b: Float64Array, x: Float64Array): Float64Array => {
  const g = new Float64Array(A.cols);
  for (let r = 0; r < A.rows; r++) {
    let res = -at(b, r);
    for (let c = 0; c < A.cols; c++) res += at(A.data, r * A.cols + c) * at(x, c);
    for (let c = 0; c < A.cols; c++) g[c] = at(g, c) + at(A.data, r * A.cols + c) * res;
  }
  return g;
};

/** AᵀA x = Aᵀb by Cholesky. */
const normalSolve = (A: Matrix, b: Float64Array): Float64Array => {
  const n = A.cols;
  const N = new Float64Array(n * n);
  const y = new Float64Array(n);
  for (let r = 0; r < A.rows; r++)
    for (let i = 0; i < n; i++) {
      y[i] = at(y, i) + at(A.data, r * n + i) * at(b, r);
      for (let j = 0; j < n; j++) N[i * n + j] = at(N, i * n + j) + at(A.data, r * n + i) * at(A.data, r * n + j);
    }
  const L = new Float64Array(n * n);
  for (let i = 0; i < n; i++)
    for (let j = 0; j <= i; j++) {
      let s = at(N, i * n + j);
      for (let k = 0; k < j; k++) s -= at(L, i * n + k) * at(L, j * n + k);
      L[i * n + j] = i === j ? Math.sqrt(s) : s / at(L, j * n + j);
    }
  const z = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    let s = at(y, i);
    for (let k = 0; k < i; k++) s -= at(L, i * n + k) * at(z, k);
    z[i] = s / at(L, i * n + i);
  }
  const x = new Float64Array(n);
  for (let i = n - 1; i >= 0; i--) {
    let s = at(z, i);
    for (let k = i + 1; k < n; k++) s -= at(L, k * n + i) * at(x, k);
    x[i] = s / at(L, i * n + i);
  }
  return x;
};

const problem = (seed: number, m: number, n: number): { A: Matrix; b: Float64Array; lo: Float64Array; hi: Float64Array } => {
  const r = rng(seed);
  const A = matrix(m, n, Array.from({ length: m * n }, () => 2 * r() - 1));
  const b = Float64Array.from({ length: m }, () => 4 * r() - 2);
  const lo = Float64Array.from({ length: n }, () => -r());
  const hi = Float64Array.from(lo, (l) => l + 0.05 + r());
  return { A, b, lo, hi };
};

describe('bounded least squares', () => {
  it('meets the KKT conditions on random bounded problems', () => {
    let atBound = 0;
    for (let seed = 1; seed <= 60; seed++) {
      const n = 3 + (seed % 23);
      const m = n + (seed % 20);
      const { A, b, lo, hi } = problem(seed, m, n);
      const x = bvls(A, b, lo, hi);
      const g = gradient(A, b, x);
      const tol = 1e-8 * Math.max(1, ...Array.from(g, Math.abs));
      for (let i = 0; i < n; i++) {
        const [xi, gi, l, h] = [at(x, i), at(g, i), at(lo, i), at(hi, i)];
        const where = `seed ${seed} x[${i}] = ${xi} in [${l}, ${h}], g = ${gi}`;
        assert.isTrue(xi >= l && xi <= h, where);
        if (xi === l) assert.isAtLeast(gi, -tol, where);
        else if (xi === h) assert.isAtMost(gi, tol, where);
        else assert.isAtMost(Math.abs(gi), 1e-8, where);
        if (xi === l || xi === h) atBound++;
      }
    }
    // The problems must actually exercise the bounds.
    assert.isAbove(atBound, 100);
  });

  it('agrees with the normal equations when the bounds are inactive', () => {
    for (let seed = 100; seed < 120; seed++) {
      const n = 5 + (seed % 21);
      const { A, b } = problem(seed, n + 20, n);
      const ref = normalSolve(A, b);
      const wide = new Float64Array(n).fill(1e6);
      const x = bvls(A, b, Float64Array.from(wide, (v) => -v), wide);
      for (let i = 0; i < n; i++) assert.closeTo(at(x, i), at(ref, i), 1e-9, `seed ${seed} x[${i}]`);
    }
  });

  it('solves non-negative least squares on a hand case', () => {
    // min (x − 1)² + (y + 1)² with x, y ≥ 0: y sits at its bound with gradient 2.
    const x = bvls(matrix(2, 2, [1, 0, 0, 1]), Float64Array.of(1, -1), Float64Array.of(0, 0), Float64Array.of(10, 10));
    assert.closeTo(at(x, 0), 1, 1e-12);
    assert.strictEqual(at(x, 1), 0);
  });
});
