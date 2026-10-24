/** Zero-phase low-pass for capture targets: a 2nd-order Butterworth run forward and backward (filtfilt). */

export interface Biquad {
  readonly b: readonly [number, number, number];
  /** a0 = 1. */
  readonly a: readonly [number, number];
}

/** Bilinear transform with prewarp, as scipy.signal.butter(2, cutoff, fs=fps). */
export const butterworth2 = (cutoff: number, fps: number): Biquad => {
  const K = Math.tan((Math.PI * cutoff) / fps);
  const norm = 1 / (1 + Math.SQRT2 * K + K * K);
  const b0 = K * K * norm;
  return { b: [b0, 2 * b0, b0], a: [2 * (K * K - 1) * norm, (1 - Math.SQRT2 * K + K * K) * norm] };
};

/** One pass, direct form II transposed, its state at the steady response to x[0] (scipy's lfilter_zi · x[0]). */
const pass = (f: Biquad, x: readonly number[]): number[] => {
  const [b0, b1, b2] = f.b;
  const [a1, a2] = f.a;
  const x0 = x[0] ?? 0;
  let z1 = (1 - b0) * x0;
  let z2 = (b2 - a2) * x0;
  return x.map((v) => {
    const y = b0 * v + z1;
    z1 = b1 * v - a1 * y + z2;
    z2 = b2 * v - a2 * y;
    return y;
  });
};

/** Forward-backward with odd reflection padding of 3·order samples, as scipy.signal.filtfilt's default. */
export const filtfilt = (f: Biquad, x: readonly number[]): number[] => {
  const n = x.length;
  const pad = Math.min(9, n - 1);
  if (pad < 1) return [...x];
  const first = x[0] ?? 0;
  const last = x[n - 1] ?? 0;
  const head = Array.from({ length: pad }, (_, i) => 2 * first - (x[pad - i] ?? 0));
  const tail = Array.from({ length: pad }, (_, i) => 2 * last - (x[n - 2 - i] ?? 0));
  const ext = [...head, ...x, ...tail];
  const y = pass(f, pass(f, ext).toReversed()).toReversed();
  return y.slice(pad, pad + n);
};

/** Each component of a per-frame vector series filtered on its own. */
export const filterSeries = (f: Biquad, xs: ReadonlyArray<ReadonlyArray<number>>): number[][] => {
  const m = xs[0]?.length ?? 0;
  const cols = Array.from({ length: m }, (_, c) => filtfilt(f, xs.map((v) => v[c] ?? 0)));
  return xs.map((_, k) => cols.map((col) => col[k] ?? 0));
};

/** Unit quaternion [x, y, z, w] of a row-major rotation. */
export const quatOf = (R: ReadonlyArray<number>): [number, number, number, number] => {
  const m = (r: number, c: number): number => R[3 * r + c] ?? 0;
  const tr = m(0, 0) + m(1, 1) + m(2, 2);
  if (tr > 0) {
    const s = 2 * Math.sqrt(1 + tr);
    return [(m(2, 1) - m(1, 2)) / s, (m(0, 2) - m(2, 0)) / s, (m(1, 0) - m(0, 1)) / s, s / 4];
  }
  if (m(0, 0) > m(1, 1) && m(0, 0) > m(2, 2)) {
    const s = 2 * Math.sqrt(1 + m(0, 0) - m(1, 1) - m(2, 2));
    return [s / 4, (m(0, 1) + m(1, 0)) / s, (m(0, 2) + m(2, 0)) / s, (m(2, 1) - m(1, 2)) / s];
  }
  if (m(1, 1) > m(2, 2)) {
    const s = 2 * Math.sqrt(1 + m(1, 1) - m(0, 0) - m(2, 2));
    return [(m(0, 1) + m(1, 0)) / s, s / 4, (m(1, 2) + m(2, 1)) / s, (m(0, 2) - m(2, 0)) / s];
  }
  const s = 2 * Math.sqrt(1 + m(2, 2) - m(0, 0) - m(1, 1));
  return [(m(0, 2) + m(2, 0)) / s, (m(1, 2) + m(2, 1)) / s, s / 4, (m(1, 0) - m(0, 1)) / s];
};

/** Row-major rotation of a quaternion [x, y, z, w], normalised. */
export const matrixOf = (q: ReadonlyArray<number>): number[] => {
  const l = Math.hypot(q[0] ?? 0, q[1] ?? 0, q[2] ?? 0, q[3] ?? 0) || 1;
  const [x, y, z, w] = [(q[0] ?? 0) / l, (q[1] ?? 0) / l, (q[2] ?? 0) / l, (q[3] ?? 1) / l];
  return [
    1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w),
    2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w),
    2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y),
  ];
};

/** Rotations filtered as sign-continuous quaternions, renormalised: fine for the small per-frame steps of capture. */
export const filterRotations = (f: Biquad, Rs: ReadonlyArray<ReadonlyArray<number>>): number[][] => {
  const qs: number[][] = [];
  for (const R of Rs) {
    const q = quatOf(R);
    const prev = qs[qs.length - 1];
    const d = prev === undefined ? 1 : q.reduce((s, v, i) => s + v * (prev[i] ?? 0), 0);
    qs.push(d < 0 ? q.map((v) => -v) : q);
  }
  return filterSeries(f, qs).map(matrixOf);
};
