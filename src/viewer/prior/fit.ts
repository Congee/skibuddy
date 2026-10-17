import { Parity } from './prior';
import type { Series } from './prior';

/** Registration and least-squares Fourier fitting for the prior build (scripts/prior/build.ts). */

export interface Curve {
  readonly t: ReadonlyArray<number>;
  readonly v: ReadonlyArray<number>;
}

/** Piecewise-linear through sorted `t`, held flat past the ends. */
export const sample = (c: Curve, x: number): number => {
  const { t, v } = c;
  const n = t.length;
  if (n === 0) return Number.NaN;
  if (x <= (t[0] ?? 0)) return v[0] ?? Number.NaN;
  if (x >= (t[n - 1] ?? 0)) return v[n - 1] ?? Number.NaN;
  let i = 0;
  while ((t[i + 1] ?? 0) < x) i++;
  const [t0, t1, v0, v1] = [t[i] ?? 0, t[i + 1] ?? 0, v[i] ?? 0, v[i + 1] ?? 0];
  return v0 + ((v1 - v0) * (x - t0)) / (t1 - t0);
};

/** Monotone piecewise-linear time warp through (source, target) anchors, which must include 0 and 1. */
export const warp = (anchors: ReadonlyArray<readonly [number, number]>, t: number): number =>
  sample({ t: anchors.map((a) => a[0]), v: anchors.map((a) => a[1]) }, t);

/** The curve's samples moved onto the phase events. */
export const register = (c: Curve, anchors: ReadonlyArray<readonly [number, number]>): Curve => ({ t: c.t.map((x) => warp(anchors, x)), v: c.v });

/** Phase of the curve's largest value, refined by a parabola through its neighbours. */
export const peakPhase = (c: Curve): number => {
  let i = 0;
  c.v.forEach((x, j) => {
    if (x > (c.v[i] ?? Number.NEGATIVE_INFINITY)) i = j;
  });
  const [a, b, d] = [c.v[i - 1], c.v[i], c.v[i + 1]];
  const [ta, tb, td] = [c.t[i - 1], c.t[i], c.t[i + 1]];
  if (a === undefined || b === undefined || d === undefined || ta === undefined || tb === undefined || td === undefined) return c.t[i] ?? 0;
  const den = a - 2 * b + d;
  return den === 0 ? tb : tb + (0.5 * (a - d) * (td - ta)) / 2 / den;
};

/** Gaussian elimination with partial pivoting; `a` is n × n row-major. */
const solve = (a: number[][], b: number[]): number[] => {
  const n = b.length;
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(a[r]?.[c] ?? 0) > Math.abs(a[p]?.[c] ?? 0)) p = r;
    [a[c], a[p]] = [a[p] ?? [], a[c] ?? []];
    [b[c], b[p]] = [b[p] ?? 0, b[c] ?? 0];
    const pivot = a[c]?.[c] ?? 0;
    for (let r = c + 1; r < n; r++) {
      const f = (a[r]?.[c] ?? 0) / pivot;
      for (let k = c; k < n; k++) (a[r] as number[])[k] = (a[r]?.[k] ?? 0) - f * (a[c]?.[k] ?? 0);
      b[r] = (b[r] ?? 0) - f * (b[c] ?? 0);
    }
  }
  const x = Array.from({ length: n }, () => 0);
  for (let r = n - 1; r >= 0; r--) {
    let s = b[r] ?? 0;
    for (let k = r + 1; k < n; k++) s -= (a[r]?.[k] ?? 0) * (x[k] ?? 0);
    x[r] = s / (a[r]?.[r] ?? 1);
  }
  return x;
};

/** The harmonics `parity` allows up to `order`, with the constant where it may be non-zero. */
const basis = (parity: Parity, order: number): ReadonlyArray<{ readonly k: number; readonly f: 'c' | 's' }> => {
  const out: Array<{ k: number; f: 'c' | 's' }> = parity === Parity.Odd ? [] : [{ k: 0, f: 'c' }];
  for (let k = 1; k <= order; k++) {
    if (parity === Parity.Even && k % 2 === 1) continue;
    if (parity === Parity.Odd && k % 2 === 0) continue;
    out.push({ k, f: 'c' }, { k, f: 's' });
  }
  return out;
};

const round = (v: number): number => Math.round(v * 1e4) / 1e4;

/** Ridge-regularised least squares of the series to (ω, value) samples; `ridge` grows with k² to damp ringing. */
export const fitSeries = (omega: ReadonlyArray<number>, value: ReadonlyArray<number>, parity: Parity, order: number, ridge = 1e-4): Series => {
  const fs = basis(parity, order);
  const row = (w: number): number[] => fs.map(({ k, f }) => (f === 'c' ? Math.cos(k * w) : Math.sin(k * w)));
  const m = fs.length;
  const ata = Array.from({ length: m }, () => Array.from({ length: m }, () => 0));
  const atb = Array.from({ length: m }, () => 0);
  omega.forEach((w, i) => {
    const r = row(w);
    const y = value[i] ?? 0;
    for (let p = 0; p < m; p++) {
      atb[p] = (atb[p] ?? 0) + (r[p] ?? 0) * y;
      for (let q = 0; q < m; q++) (ata[p] as number[])[q] = (ata[p]?.[q] ?? 0) + (r[p] ?? 0) * (r[q] ?? 0);
    }
  });
  fs.forEach(({ k }, p) => {
    (ata[p] as number[])[p] = (ata[p]?.[p] ?? 0) + ridge * omega.length * k * k;
  });
  const x = solve(ata, atb);
  const cos = Array.from({ length: order }, () => 0);
  const sin = Array.from({ length: order }, () => 0);
  let a0 = 0;
  fs.forEach(({ k, f }, p) => {
    const v = round(x[p] ?? 0);
    if (k === 0) a0 = v;
    else if (f === 'c') cos[k - 1] = v;
    else sin[k - 1] = v;
  });
  return { a0, cos, sin };
};
