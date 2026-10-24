/**
 * Riding the zipper (motion-model §4.4, §4.8): the legs absorb the bumps within their reach while the snow only
 * pushes, and the mass runs straighter than the skis by the balance over them. Both on the track's turn-time samples,
 * periodic over the turn.
 */

import { BEND_RADIUS_MAX_M, bendRadiusOf } from './ski-bend';

/** Outside knee at its deepest mogul fold, 105°: inferred; arndt-1992 p78 has the knee past 90° in one trial. */
export const MOGUL_KNEE_FOLD_DEG = 105;
/** The open knee in the trough; inferred: the band's middle then sits at the mogul knee prior's 70°. */
export const MOGUL_KNEE_OPEN_DEG = 35;
/** Trunk pitch off the ski base normal of the moguls prior's means (constant over the turn, so its deepest); a test holds it. */
export const MOGUL_TRUNK_PITCH_DEG = 25.5;

/**
 * Mass over the snow under the boots, metres, at the fold and the open knee: the skeleton with the trunk at
 * MOGUL_TRUNK_PITCH_DEG and the mass over the mount, both legs alike (a test solves it by FK). The fold asks the ankle
 * 47° against the 12.7° barefoot bound (arndt-1992 measured ≈10–45° in moguls); held to the bound, no trunk pitch puts
 * the mass over the mid-foot.
 */
export const REACH: readonly [number, number] = [0.7014, 0.9365];

const G = 9.81;

/** Weight of the pull to the band's middle against Σ(Δ²z)², so ties go there; small beside the bend's lowest mode (2π/n)⁴. */
const TIE = 1e-12;

const wrap = (n: number, i: number): number => ((i % n) + n) % n;
// Float64Array.from with a map runs the iterator protocol per element; this loop is the hot path's.
const mapOf = (a: ArrayLike<number>, f: (v: number, i: number) => number = (v) => v): Float64Array => {
  const out = new Float64Array(a.length);
  for (let i = 0; i < a.length; i++) out[i] = f(a[i] ?? 0, i);
  return out;
};
/** z_{i+1} − 2 z_i + z_{i−1}, periodic. */
const secondAt = (z: Float64Array, i: number): number => {
  const n = z.length;
  return (z[wrap(n, i + 1)] ?? 0) - 2 * (z[i] ?? 0) + (z[wrap(n, i - 1)] ?? 0);
};

/**
 * The highest periodic path under `hi` whose second difference never falls below −`drop`: the snow pulls nothing, so
 * the mass comes down no faster than it falls. hi + drop i²/2 under its lower convex hull, on enough periods that no
 * hull edge spans the window.
 */
export const highestHeld = (hi: Float64Array, drop: number): Float64Array => {
  const n = hi.length;
  if (!Number.isFinite(drop)) return mapOf(hi);
  const range = Math.max(...hi) - Math.min(...hi);
  // A parabola of curvature −drop over k samples rises drop k² / 8 over its chord: past the range it cannot touch hi.
  const reach = Math.ceil(Math.sqrt((8 * range) / drop) / n) + 1;
  const [from, to] = [-reach * n, (reach + 1) * n];
  const w = (i: number): number => (hi[wrap(n, i)] ?? 0) + (drop * i * i) / 2;
  const hull: number[] = [];
  for (let i = from; i < to; i++) {
    while (hull.length >= 2) {
      const [a, b] = [hull[hull.length - 2] ?? 0, hull[hull.length - 1] ?? 0];
      if ((w(b) - w(a)) * (i - a) >= (w(i) - w(a)) * (b - a)) hull.pop();
      else break;
    }
    hull.push(i);
  }
  const out = new Float64Array(n);
  let k = 0;
  for (let i = 0; i < n; i++) {
    while ((hull[k + 1] ?? i) < i) k++;
    const [a, b] = [hull[k] ?? i, hull[k + 1] ?? i];
    const lin = b === a ? w(a) : w(a) + ((w(b) - w(a)) * (i - a)) / (b - a);
    out[i] = lin - (drop * i * i) / 2;
  }
  return out;
};

/**
 * A = DᵀD + TIE·I + diag(d) + D·diag(e)·D, periodic, D the second difference: rows couple samples at most 2 apart.
 * Entry (r, s) by the cyclic offset of s from r.
 */
const entryOf = (d: Float64Array, e: Float64Array) => {
  const n = d.length;
  const at = (i: number): number => e[wrap(n, i)] ?? 0;
  return (r: number, s: number): number => {
    const k = wrap(n, s - r);
    if (k === 0) return 6 + TIE + (d[r] ?? 0) + at(r - 1) + 4 * at(r) + at(r + 1);
    if (k === 1) return -4 - 2 * (at(r) + at(r + 1));
    if (k === n - 1) return -4 - 2 * (at(s) + at(s + 1));
    if (k === 2) return 1 + at(r + 1);
    if (k === n - 2) return 1 + at(s + 1);
    return 0;
  };
};

/**
 * A x = rhs by an envelope Cholesky: each row's profile is 2 wide but for the last two rows, which wrap onto the first.
 */
const solveBanded = (entry: (r: number, s: number) => number, rhs: Float64Array): Float64Array => {
  const m = rhs.length;
  const first = Int32Array.from({ length: m }, (_, r) => (r >= m - 2 ? 0 : Math.max(0, r - 2)));
  // Row r's profile from first[r] to r, packed.
  const off = new Int32Array(m + 1);
  for (let r = 0; r < m; r++) off[r + 1] = (off[r] ?? 0) + r - (first[r] ?? 0) + 1;
  const L = new Float64Array(off[m] ?? 0);
  const at = (r: number, s: number): number => (off[r] ?? 0) + s - (first[r] ?? 0);
  for (let r = 0; r < m; r++) {
    for (let s = first[r] ?? 0; s <= r; s++) {
      let sum = entry(r, s);
      for (let k = Math.max(first[r] ?? 0, first[s] ?? 0); k < s; k++) sum -= (L[at(r, k)] ?? 0) * (L[at(s, k)] ?? 0);
      L[at(r, s)] = s === r ? Math.sqrt(sum) : sum / (L[at(s, s)] ?? 1);
    }
  }
  const y = new Float64Array(m);
  for (let r = 0; r < m; r++) {
    let sum = rhs[r] ?? 0;
    for (let k = first[r] ?? 0; k < r; k++) sum -= (L[at(r, k)] ?? 0) * (y[k] ?? 0);
    y[r] = sum / (L[at(r, r)] ?? 1);
  }
  for (let r = m - 1; r >= 0; r--) {
    let sum = y[r] ?? 0;
    // Rows below r reaching back to it: the next two and the wrapping last two.
    for (let k = r + 1; k < m; k = k < r + 2 ? k + 1 : Math.max(k + 1, m - 2)) if ((first[k] ?? 0) <= r) sum -= (L[at(k, r)] ?? 0) * (y[k] ?? 0);
    y[r] = sum / (L[at(r, r)] ?? 1);
  }
  return y;
};

/** The absorbed mass height: samples, how many sit within a millimetre of the fold and of the open knee, Newton steps. */
export interface Absorption {
  readonly height: Float64Array;
  readonly folded: number;
  readonly open: number;
  readonly passes: number;
  /** The reach and the contact hold together; when not, `height` is the path without contact. */
  readonly ridable: boolean;
  /** Most the highest held path falls below the fold, metres; at or below 0 when ridable. */
  readonly short: number;
}

/**
 * The periodic path with the least Σ(Δ²z)² that keeps `lo_i ≤ z_i ≤ hi_i` and Δ²z_i ≥ −`drop`, ties to the band's
 * middle: a QP by a primal-dual interior point (an active set cycles here, the Hessian not being an M-matrix), each
 * step one banded solve, the contact rows on slacks so the start need not hold them. Infeasible when the highest
 * held path under `hi` dips below `lo`; the path is then the reach's alone.
 */
export const leastBend = (lo: Float64Array, hi: Float64Array, drop = Number.POSITIVE_INFINITY): Absorption => {
  const n = lo.length;
  const held = highestHeld(hi, drop);
  const short = Math.max(...Array.from(lo, (l, i) => l - (held[i] ?? 0)));
  const ridable = short <= 0;
  const contact = ridable && Number.isFinite(drop);
  const mid = mapOf(lo, (l, i) => (l + (hi[i] ?? 0)) / 2);
  // The reach takes the whole bump: a level path bends nil and holds contact, the tie to the middle exact.
  const [top, floor] = [Math.max(...lo), Math.min(...hi)];
  if (top <= floor) {
    const level = Math.min(floor, Math.max(top, mid.reduce((a, b) => a + b, 0) / n));
    return { height: new Float64Array(n).fill(level), folded: 0, open: 0, passes: 0, ridable: true, short };
  }
  const z = mapOf(mid);
  // Duals start near the bend's gradient scale in these index units; inferred.
  const u = new Float64Array(n).fill(1e-6);
  const w = new Float64Array(n).fill(1e-6);
  const v = new Float64Array(n).fill(contact ? 1e-6 : 0);
  const p = mapOf(z, (_, i) => (contact ? Math.max(secondAt(z, i) + drop, drop) : 1));
  const rows = contact ? 3 * n : 2 * n;
  let passes = 0;
  for (; passes < 300; passes++) {
    let gap = 0;
    let dual = 0;
    let primal = 0;
    const s = mapOf(z, (x, i) => x - (lo[i] ?? 0));
    const t = mapOf(z, (x, i) => (hi[i] ?? 0) - x);
    const bend = mapOf(z, (_, i) => secondAt(z, i));
    const rp = mapOf(bend, (b, i) => (contact ? b + drop - (p[i] ?? 0) : 0));
    const rd = mapOf(z, (_, i) => secondAt(bend, i) + TIE * ((z[i] ?? 0) - (mid[i] ?? 0)) - (u[i] ?? 0) + (w[i] ?? 0) - secondAt(v, i));
    for (let i = 0; i < n; i++) {
      gap += (s[i] ?? 0) * (u[i] ?? 0) + (t[i] ?? 0) * (w[i] ?? 0) + (contact ? (p[i] ?? 0) * (v[i] ?? 0) : 0);
      dual = Math.max(dual, Math.abs(rd[i] ?? 0));
      primal = Math.max(primal, Math.abs(rp[i] ?? 0));
    }
    // The contact rows' conditioning floors the dual residual near 1e-14.
    if (gap < 1e-18 && dual < (contact ? 1e-13 : 1e-14) && primal < 1e-14) break;
    const mu = (0.1 * gap) / rows;
    const diag = mapOf(s, (si, i) => (u[i] ?? 0) / si + (w[i] ?? 0) / (t[i] ?? 1));
    const e = mapOf(p, (pi, i) => (contact ? (v[i] ?? 0) / pi : 0));
    const q = mapOf(p, (pi, i) => (contact ? mu / pi - (v[i] ?? 0) - ((v[i] ?? 0) * (rp[i] ?? 0)) / pi : 0));
    const rhs = mapOf(rd, (r, i) => -r + (mu / (s[i] ?? 1) - (u[i] ?? 0)) - (mu / (t[i] ?? 1) - (w[i] ?? 0)) + secondAt(q, i));
    const dz = solveBanded(entryOf(diag, e), rhs);
    if (!dz.every(Number.isFinite)) break;
    const du = mapOf(dz, (d, i) => (mu - (s[i] ?? 0) * (u[i] ?? 0) - (u[i] ?? 0) * d) / (s[i] ?? 1));
    const dw = mapOf(dz, (d, i) => (mu - (t[i] ?? 0) * (w[i] ?? 0) + (w[i] ?? 0) * d) / (t[i] ?? 1));
    const dp = mapOf(dz, (_, i) => (contact ? secondAt(dz, i) + (rp[i] ?? 0) : 0));
    const dv = mapOf(dp, (d, i) => (contact ? (mu - (p[i] ?? 0) * (v[i] ?? 0) - (v[i] ?? 0) * d) / (p[i] ?? 1) : 0));
    // Fraction to the boundary, primal and dual alike.
    let step = 1;
    const keep = (x: number, dx: number): void => {
      if (dx < 0) step = Math.min(step, (-0.99 * x) / dx);
    };
    for (let i = 0; i < n; i++) {
      keep(s[i] ?? 0, dz[i] ?? 0);
      keep(t[i] ?? 0, -(dz[i] ?? 0));
      keep(u[i] ?? 0, du[i] ?? 0);
      keep(w[i] ?? 0, dw[i] ?? 0);
      if (contact) {
        keep(p[i] ?? 0, dp[i] ?? 0);
        keep(v[i] ?? 0, dv[i] ?? 0);
      }
    }
    for (let i = 0; i < n; i++) {
      z[i] = (z[i] ?? 0) + step * (dz[i] ?? 0);
      u[i] = (u[i] ?? 0) + step * (du[i] ?? 0);
      w[i] = (w[i] ?? 0) + step * (dw[i] ?? 0);
      p[i] = (p[i] ?? 0) + step * (dp[i] ?? 0);
      v[i] = (v[i] ?? 0) + step * (dv[i] ?? 0);
    }
  }
  let [folded, open] = [0, 0];
  for (let i = 0; i < n; i++) [folded, open] = [folded + Number((z[i] ?? 0) - (lo[i] ?? 0) < 1e-3), open + Number((hi[i] ?? 0) - (z[i] ?? 0) < 1e-3)];
  return { height: z, folded, open, passes, ridable, short };
};

/**
 * The across-slope mass path over a pressure centre tracking `pivot`: the pendulum h ẍ = s (x − x_P) per sample, h the
 * mass over the snow, s the snow's support g cos θ + z̈ ≥ 0 (nil: ẍ = 0), ẍ by second differences at `dt`;
 * antiperiodic, as the next turn mirrors this one. A cyclic tridiagonal solve (Sherman-Morrison).
 */
export const balanceAcross = (pivot: Float64Array, h: Float64Array, support: Float64Array, dt: number): Float64Array => {
  const n = pivot.length;
  const k = mapOf(h, (v) => v / (dt * dt));
  const diag = mapOf(k, (v, i) => (support[i] ?? 0) + 2 * v);
  const lower = mapOf(k, (v) => -v);
  const upper = mapOf(k, (v) => -v);
  const rhs = mapOf(pivot, (x, i) => (support[i] ?? 0) * x);
  // Corners: x_{−1} = −x_{n−1} and x_n = −x_0.
  const alpha = k[n - 1] ?? 0;
  const beta = k[0] ?? 0;
  const thomas = (r: Float64Array, d: Float64Array): Float64Array => {
    const c = new Float64Array(n);
    const x = new Float64Array(n);
    c[0] = (upper[0] ?? 0) / (d[0] ?? 1);
    x[0] = (r[0] ?? 0) / (d[0] ?? 1);
    for (let i = 1; i < n; i++) {
      const m = (d[i] ?? 0) - (lower[i] ?? 0) * (c[i - 1] ?? 0);
      c[i] = (upper[i] ?? 0) / m;
      x[i] = ((r[i] ?? 0) - (lower[i] ?? 0) * (x[i - 1] ?? 0)) / m;
    }
    for (let i = n - 2; i >= 0; i--) x[i] = (x[i] ?? 0) - (c[i] ?? 0) * (x[i + 1] ?? 0);
    return x;
  };
  const gamma = -(diag[0] ?? 1);
  const d = mapOf(diag);
  d[0] = (d[0] ?? 0) - gamma;
  d[n - 1] = (d[n - 1] ?? 0) - (alpha * beta) / gamma;
  const x = thomas(rhs, d);
  const u = new Float64Array(n);
  u[0] = gamma;
  u[n - 1] = alpha;
  const zz = thomas(u, d);
  const f = ((x[0] ?? 0) + (beta * (x[n - 1] ?? 0)) / gamma) / (1 + (zz[0] ?? 0) + (beta * (zz[n - 1] ?? 0)) / gamma);
  return mapOf(x, (v, i) => v - f * (zz[i] ?? 0));
};

/** The legs' absorption over one turn of the zipper and the snow's support under it, per track sample. */
export interface MogulHeight {
  /** Height over the mean slope, metres, and its acceleration, m/s². */
  readonly height: Float64Array;
  readonly heightAccel: Float64Array;
  /** Height over the boot, metres. */
  readonly clearance: Float64Array;
  /** Snow support g cos θ + z̈, m/s²; negative only where the absorption is not ridable. */
  readonly support: Float64Array;
  readonly absorption: Absorption;
  /** Least and most support over g: the load, BW. */
  readonly leastSupport: number;
  readonly peakLoad: number;
  /** The boot's height over the mean slope, metres, and the ski's bend radius under it; the snow and 1000 m unbridged. */
  readonly boot: Float64Array;
  readonly radius: Float64Array;
  /** Samples where the boot rides over a millimetre above the snow under it: the ski spans the trough. */
  readonly bridged: number;
  /** Load-and-bend passes and the boot's last change over them, metres. */
  readonly iterations: number;
  readonly change: number;
  /**
   * The pair settles: a stable fixed point. Unsettled, the hit's load bends the ski into the trough faster than the
   * deeper trough eases it, and the ski snaps through to its tightest bend: not ridable.
   */
  readonly settled: boolean;
}

/** The mass over one turn of the zipper, per track sample. */
export interface MogulMass extends MogulHeight {
  /** Across the slope toward the turn's inside, metres, and its acceleration, m/s². */
  readonly across: Float64Array;
  readonly acrossAccel: Float64Array;
  /** The leg's lean λ toward the turn's inside, radians; the load s / (g cos λ) along it, BW. */
  readonly lean: Float64Array;
  readonly load: Float64Array;
  /** The pendulum's pivot across, metres: the edged skis' pressure centre about the ankles' mid (pivotOf). */
  readonly pivot: Float64Array;
  /** Reach-and-lean passes, the lean's last change over them, radians, and whether it settled. */
  readonly leanPasses: number;
  readonly leanChange: number;
  readonly leanSettled: boolean;
}

/** Second difference over `dt`, periodic (`sign` 1) or antiperiodic (−1). */
export const secondDiff = (y: Float64Array, dt: number, sign: 1 | -1): Float64Array => {
  const n = y.length;
  return mapOf(y, (v, i) => {
    const prev = i === 0 ? sign * (y[n - 1] ?? 0) : (y[i - 1] ?? 0);
    const next = i === n - 1 ? sign * (y[0] ?? 0) : (y[i + 1] ?? 0);
    return (next - 2 * v + prev) / (dt * dt);
  });
};

/** Most the highest path the snow holds under the open knee falls below the fold, metres: ridable at or below 0. */
export const shortOfReach = (snow: Float64Array, periodS: number, slopeRad: number, reach: readonly [number, number] = REACH): number => {
  const dt = periodS / snow.length;
  const held = highestHeld(mapOf(snow, (s) => s + reach[1]), G * Math.cos(slopeRad) * dt * dt);
  return Math.max(...Array.from(snow, (s, i) => s + reach[0] - (held[i] ?? 0)));
};

/** A ski riding the track: the snow's distance along it per sample, the turn's length, the ski's ends from the boot and the body mass. */
export interface Bridge {
  /** Metres along the track at each sample from the turn's start; the next turn starts at `length`. */
  readonly along: Float64Array;
  readonly length: number;
  /** Tail (negative) and tip from the boot along the ski, metres. */
  readonly tail: number;
  readonly tip: number;
  readonly massKg: number;
}

/** Load-and-bend passes before the pair counts as unsettled; the slowest settling relief, 0.388 m, takes 31; inferred. */
const BEND_PASSES = 40;
/** The boot's last change under which the load and the bend agree, metres. */
const BEND_SETTLED_M = 1e-9;

/** Each ski carries half the load: the zipper rides both feet alike; inferred. */
export const MOGUL_SKI_SHARE = 0.5;

/** The track's distance per sample from its pace (metres per unit turn time), trapezoids; and the turn's length. */
export const alongOf = (pace: Float64Array): { readonly along: Float64Array; readonly length: number } => {
  const n = pace.length;
  const along = new Float64Array(n);
  for (let i = 1; i < n; i++) along[i] = (along[i - 1] ?? 0) + ((pace[i - 1] ?? 0) + (pace[i] ?? 0)) / (2 * n);
  return { along, length: (along[n - 1] ?? 0) + ((pace[n - 1] ?? 0) + (pace[0] ?? 0)) / (2 * n) };
};

/** Where a bent, edged ski's lower edge rests on the snow under it (P5). */
export interface EdgeContact {
  /** The edge's height at the waist, over the snow's datum: the least that keeps the edge on or above the snow. */
  readonly rest: number;
  /** Touching points about the waist, metres along the ski: both 0 when pressed, else the two the ski spans between. */
  readonly touch: readonly [number, number];
  /** The waist on the snow: edgeCurvatureOf at least the snow's curvature. */
  readonly pressed: boolean;
  /** The edge's slope at the waist, p: tip up positive; pressed, the mean of the hull's two sides there. */
  readonly pitch: number;
}

/** Below this the waist counts as on the snow, metres: rounding only. */
const PRESSED_M = 1e-12;

/**
 * The lower edge's height along the snow normal is z_w + p u + c u²/2, c this, 1/m: the bend lies along the base
 * normal, ε off the snow's, so it lifts the ends by cos ε / R_bend; the edged sidecut drops them by sin|ε| / R_sc.
 * Pressed on a plane needs c ≥ 0, 1/R_bend ≥ tan|ε| / R_sc; the edge then curves 1 / (R_sc cos ε) in the snow (Howe).
 */
export const edgeCurvatureOf = (bendRadius: number, edge: number, sidecutRadius: number): number => Math.cos(edge) / bendRadius - Math.sin(Math.abs(edge)) / sidecutRadius;

/**
 * The lower edge z_w + p u + c u²/2 from the tail to the tip, free in pitch p, never below the snow `z` at `u` (tail
 * first, tip last, the waist at u = 0 among them), the load settling it lowest: z_w is the upper concave hull of
 * z − c u²/2 at 0. On a plane pressed exactly when c ≥ κ_snow (M4); at ε 0 P3b's hull.
 */
// The hull's stack, reused: bootTrackOf calls this once per sample per pass.
let hullU = new Float64Array(256);
let hullF = new Float64Array(256);
export const edgeContactOf = (u: ArrayLike<number>, z: ArrayLike<number>, curvature: number): EdgeContact => {
  const m = u.length;
  if (hullU.length < m) [hullU, hullF] = [new Float64Array(2 * m), new Float64Array(2 * m)];
  const [us, fs] = [hullU, hullF];
  let top = 0;
  const at = (a: Float64Array, i: number): number | undefined => (i >= 0 && i < top ? a[i] : undefined);
  let waist = Number.NaN;
  for (let j = 0; j < m; j++) {
    const [uj, zj] = [u[j] ?? 0, z[j] ?? 0];
    const f = zj - (curvature * uj * uj) / 2;
    if (uj === 0) waist = f;
    while (top >= 2 && ((fs[top - 1] ?? 0) - (fs[top - 2] ?? 0)) * (uj - (us[top - 2] ?? 0)) <= (f - (fs[top - 2] ?? 0)) * ((us[top - 1] ?? 0) - (us[top - 2] ?? 0))) top--;
    us[top] = uj;
    fs[top] = f;
    top++;
  }
  let k = 0;
  while ((at(us, k + 1) ?? 0) < 0) k++;
  const [u0, f0, u1, f1] = [at(us, k) ?? 0, at(fs, k) ?? 0, at(us, k + 1) ?? 0, at(fs, k + 1) ?? 0];
  const rest = u1 === u0 ? f0 : f0 + ((f1 - f0) * (0 - u0)) / (u1 - u0);
  const pressed = rest - waist <= PRESSED_M;
  const slope = (i: number): number => {
    const [a, b] = [at(us, i), at(us, i + 1)];
    return a === undefined || b === undefined || a === b ? Number.NaN : ((at(fs, i + 1) ?? 0) - (at(fs, i) ?? 0)) / (b - a);
  };
  const sides = (pressed && u1 === 0 ? [slope(k), slope(k + 1)] : [slope(k)]).filter((v) => !Number.isNaN(v));
  const pitch = sides.length === 0 ? 0 : sides.reduce((a, b) => a + b, 0) / sides.length;
  return { rest, touch: pressed ? [0, 0] : [u0, u1], pressed, pitch };
};

/**
 * The boot's height over the mean slope per sample under a ski bent at `radius` (motion-model §4.8, P3b), edged by
 * `edging` (none: flat): edgeContactOf on the snow from the tail to the tip about the boot. The snow repeats each turn.
 */
export const bootTrackOf = (snow: Float64Array, b: Bridge, radius: Float64Array, edging?: { readonly edge: Float64Array; readonly sidecutM: number }): Float64Array => {
  const n = snow.length;
  // Three turns laid end to end, the middle one this; a ski shorter than a turn stays inside them.
  const s3 = new Float64Array(3 * n);
  const z3 = new Float64Array(3 * n);
  for (let j = 0; j < 3 * n; j++) {
    const k = Math.floor(j / n) - 1;
    s3[j] = (b.along[j % n] ?? 0) + k * b.length;
    z3[j] = snow[j % n] ?? 0;
  }
  const out = new Float64Array(n);
  const [us, zs] = [new Float64Array(3 * n + 2), new Float64Array(3 * n + 2)];
  let lo = 0;
  for (let i = 0; i < n; i++) {
    const s0 = s3[n + i] ?? 0;
    // The first sample past the tail; the ends interpolated on the snow.
    while ((s3[lo] ?? 0) - s0 <= b.tail) lo++;
    const end = (j: number, u: number): number => {
      const [sa, sb] = [s3[j - 1] ?? 0, s3[j] ?? 0];
      return (z3[j - 1] ?? 0) + (((z3[j] ?? 0) - (z3[j - 1] ?? 0)) * (s0 + u - sa)) / (sb - sa);
    };
    us[0] = b.tail;
    zs[0] = end(lo, b.tail);
    let [j, m] = [lo, 1];
    for (; (s3[j] ?? 0) - s0 < b.tip; j++, m++) {
      us[m] = (s3[j] ?? 0) - s0;
      zs[m] = z3[j] ?? 0;
    }
    us[m] = b.tip;
    zs[m] = end(j, b.tip);
    out[i] = edgeContactOf(us.subarray(0, m + 1), zs.subarray(0, m + 1), edgeCurvatureOf(radius[i] ?? BEND_RADIUS_MAX_M, edging?.edge[i] ?? 0, edging?.sidecutM ?? Infinity)).rest;
  }
  return out;
};

/** The absorbed path over the boot's track, its acceleration and the snow's support. */
interface Absorbed {
  readonly absorption: Absorption;
  readonly heightAccel: Float64Array;
  readonly support: Float64Array;
}

/** The legs' absorption over a boot's track per turn time, the snow pushing only, each leg leaning λ: h in reach cos λ. */
const absorbOn = (boot: Float64Array, periodS: number, slopeRad: number, reach: readonly [number, number], cosLean: Float64Array): Absorbed => {
  const dt = periodS / boot.length;
  const normal = G * Math.cos(slopeRad);
  const absorption = leastBend(
    mapOf(boot, (s, i) => s + reach[0] * (cosLean[i] ?? 1)),
    mapOf(boot, (s, i) => s + reach[1] * (cosLean[i] ?? 1)),
    normal * dt * dt,
  );
  const heightAccel = secondDiff(absorption.height, dt, 1);
  return { absorption, heightAccel, support: mapOf(heightAccel, (a) => normal + a) };
};

/** The skis' edging over the turn: the set ε − λ per sample (the edge rule's) and the sidecut radius, metres. */
export interface Edging {
  readonly margin: Float64Array;
  readonly sidecutM: number;
}

/** The inside ski's load share per sample, the stance goal's base gap and the skis' contact geometry: the pressure centre. */
export interface Pressure {
  readonly insideShare: Float64Array;
  readonly stanceM: number;
  readonly geometry: ContactGeometry;
}

/** Lean's last change under which the reach and the pendulum agree, radians: over the absorption QP's ~3e-9 floor; inferred. */
const LEAN_SETTLED_RAD = 1e-8;

/** The lean step of the pressure centre's slope by difference, radians; inferred. */
const PIVOT_DIFF_RAD = 1e-7;

const cosOf = (l: Float64Array): Float64Array => mapOf(l, Math.cos);

/** The ride with the lean the pendulum gives when `ski` is set, else the leg square to the slope. */
interface Ride extends MogulHeight {
  readonly lean: Float64Array;
  readonly across: Float64Array;
  readonly pivot: Float64Array;
  readonly leanPasses: number;
  readonly leanChange: number;
}

/**
 * One fixed point, warm from pass to pass and from the snow and λ 0: the load bends the ski, the bend and the edge
 * ε = λ + set rest the boot (edgeContactOf), the boot's track and the leg's reach cos λ the absorption, the absorption
 * the support, the pendulum over the pressure centre x_P (pivotOf, on the edges ε) the resultant's lean λ = atan((x_mass − x_P) / h). The resultant s / cos λ runs along
 * the leg; its part cos(ε − λ) square to the base bends the ski. Nested (λ held while the bend settles) it cycles.
 */
const rideOf = (
  snow: Float64Array,
  ski: Float64Array | null,
  periodS: number,
  slopeRad: number,
  reach: readonly [number, number],
  bridge: Bridge | undefined,
  edging: Edging | undefined,
  pressure: Pressure | undefined,
): Ride => {
  const n = snow.length;
  let pivot: Float64Array = ski === null ? new Float64Array(n) : mapOf(ski);
  const dt = periodS / n;
  const margin = (i: number): number => edging?.margin[i] ?? 0;
  let lean: Float64Array = new Float64Array(n);
  let radius: Float64Array = new Float64Array(n).fill(BEND_RADIUS_MAX_M);
  let boot: Float64Array = mapOf(snow);
  let ride = absorbOn(boot, periodS, slopeRad, reach, cosOf(lean));
  let across: Float64Array = new Float64Array(n);
  let [iterations, change, leanPasses, leanChange, relax] = [0, 0, 0, 0, 1];
  const swing = (): void => {
    if (ski === null) return;
    const h = mapOf(ride.absorption.height, (z, i) => z - (boot[i] ?? 0));
    // Where the snow would have to pull, the mass flies: no force across.
    const support = mapOf(ride.support, (s) => Math.max(0, s));
    const leanOver = (p: Float64Array): Float64Array => {
      across = balanceAcross(p, h, support, dt);
      return mapOf(across, (x, i) => Math.atan((x - (p[i] ?? 0)) / (h[i] ?? 1)));
    };
    let next = leanOver(pivot);
    if (pressure !== undefined) {
      // One Newton step on x_P = f(λ(x_P)) per pass, dλ/dx_P ≈ −1/h: near flat the edge share's slope makes the plain step a 2-cycle.
      const target = pivotOf(ski, next, edging?.margin, pressure);
      const ahead = pivotOf(ski, mapOf(next, (l) => l + PIVOT_DIFF_RAD), edging?.margin, pressure);
      pivot = mapOf(target, (x, i) => (pivot[i] ?? 0) + (x - (pivot[i] ?? 0)) / (1 + ((ahead[i] ?? 0) - x) / PIVOT_DIFF_RAD / (h[i] ?? 1)));
      next = leanOver(pivot);
    }
    leanChange = Math.max(...Array.from(next, (l, i) => Math.abs(l - (lean[i] ?? 0))));
    lean = next;
    leanPasses++;
  };
  swing();
  if (bridge !== undefined || ski !== null) {
    for (iterations = 1; iterations <= BEND_PASSES; iterations++) {
      if (bridge !== undefined) {
        const cos = cosOf(lean);
        radius = mapOf(ride.support, (f, i) => bendRadiusOf(((Math.max(0, f) * Math.cos(margin(i))) / (cos[i] ?? 1)) * MOGUL_SKI_SHARE * bridge.massKg));
        const edged = edging === undefined ? undefined : { edge: mapOf(lean, (l, i) => l + margin(i)), sidecutM: edging.sidecutM };
        const next = bootTrackOf(snow, bridge, radius, edged);
        const last = change;
        change = Math.max(...Array.from(next, (z, i) => Math.abs(z - (boot[i] ?? 0))));
        // Damped once the change grows: the bridging can flip under the edged lean's lift.
        if (iterations > 1 && change > last) relax /= 2;
        boot = mapOf(next, (z, i) => (boot[i] ?? 0) + relax * (z - (boot[i] ?? 0)));
      }
      ride = absorbOn(boot, periodS, slopeRad, reach, cosOf(lean));
      swing();
      if (change < BEND_SETTLED_M && leanChange < LEAN_SETTLED_RAD) break;
    }
    iterations = Math.min(iterations, BEND_PASSES);
  }
  const { absorption, heightAccel, support } = ride;
  const height = absorption.height;
  return {
    height,
    heightAccel,
    clearance: mapOf(height, (z, i) => z - (boot[i] ?? 0)),
    support,
    absorption,
    leastSupport: Math.min(...support) / G,
    peakLoad: Math.max(...support) / G,
    boot,
    radius,
    bridged: boot.reduce((c, z, i) => c + Number(z - (snow[i] ?? 0) > 1e-3), 0),
    iterations,
    change,
    settled: change < BEND_SETTLED_M,
    lean,
    across,
    pivot,
    leanPasses,
    leanChange,
  };
};

/**
 * The absorption on a track of `snow` heights per turn time, the snow pushing only: motion-model §4.3 rule 9, the leg
 * square to the slope. With a `bridge` the legs ride the boot's track under the bent ski, the load and the bend solved
 * together (P3b); without, the boot on the snow.
 */
export const mogulHeightOf = (snow: Float64Array, periodS: number, slopeRad: number, reach: readonly [number, number] = REACH, bridge?: Bridge): MogulHeight => {
  const { lean: _lean, across: _across, pivot: _pivot, leanPasses: _passes, leanChange: _change, ...height } = rideOf(snow, null, periodS, slopeRad, reach, bridge, undefined, undefined);
  return height;
};

/**
 * The absorption and the balance across together, on a track of `snow` heights and `ski` across positions per turn
 * time (rideOf): the leg of length h / cos λ within `reach`, the load s / (g cos λ) along it; with `pressure` the
 * pivot is the edged skis' pressure centre about the ankles' mid `ski` (pivotOf), absent the mid itself.
 */
export const mogulMassOf = (
  snow: Float64Array,
  ski: Float64Array,
  periodS: number,
  slopeRad: number,
  reach: readonly [number, number] = REACH,
  bridge?: Bridge,
  edging?: Edging,
  pressure?: Pressure,
): MogulMass => {
  const dt = periodS / snow.length;
  const r = rideOf(snow, ski, periodS, slopeRad, reach, bridge, edging, pressure);
  return {
    ...r,
    acrossAccel: secondDiff(r.across, dt, -1),
    load: mapOf(r.support, (s, i) => s / (G * Math.cos(r.lean[i] ?? 0))),
    leanSettled: r.leanChange < LEAN_SETTLED_RAD,
  };
};

/** A ski under its ankle: the boot's stand height over the base and the half waist, metres. */
export interface ContactGeometry {
  readonly stand: number;
  readonly half: number;
}

/** Edge at which the pressure centre reaches the lower edge, degrees: a flat ski loads its centre, an edged one its edge; inferred. */
export const PRESSURE_EDGE_DEG = 3;

/** Share of the half waist the pressure centre sits toward +x at edge `e` radians: an odd C¹ smoothstep, ±1 beyond PRESSURE_EDGE_DEG. */
export const edgeShare = (e: number): number => {
  const u = e / ((PRESSURE_EDGE_DEG * Math.PI) / 180);
  if (u >= 1) return 1;
  if (u <= -1) return -1;
  return 3 * u * Math.abs(u) - 2 * u * u * u;
};

/**
 * The outside and inside skis' contacts across, toward +x (the turn's centre), from their ankles and edges (+ the +x
 * edge lower): the base centre stands y − H sin e, its lower edge half · cos e beyond it.
 */
export const edgedContacts = (ankles: readonly [number, number], edges: readonly [number, number], g: ContactGeometry): [number, number] => {
  const at = (y: number, e: number): number => y + g.half * edgeShare(e) * Math.cos(e) - g.stand * Math.sin(e);
  return [at(ankles[0], edges[0]), at(ankles[1], edges[1])];
};

/** The ankles across about their `mid`, the outside at −x: the stance goal's base gap stance / cos ε_o, each base H sin e off its ankle. */
export const anklesOf = (mid: number, edges: readonly [number, number], stanceM: number, g: ContactGeometry): [number, number] => {
  const w = stanceM / Math.cos(edges[0]) - g.stand * (Math.sin(edges[0]) - Math.sin(edges[1]));
  return [mid - w / 2, mid + w / 2];
};

/** The pressure centre's offset δ from the contacts' mid toward the outside ski, metres: the inside ski takes `insideShare`, (½ − s)(c_i − c_o). */
export const pressureOffsetOf = (contacts: readonly [number, number], insideShare: number): number => (0.5 - insideShare) * (contacts[1] - contacts[0]);

/** The pendulum's pivot per sample: both skis on the planned edge ε = λ + margin about the ankles' mid, the contacts' mid less δ. */
export const pivotOf = (mid: Float64Array, lean: Float64Array, margin: Float64Array | undefined, p: Pressure): Float64Array =>
  mapOf(mid, (x, i) => {
    const e = (lean[i] ?? 0) + (margin?.[i] ?? 0);
    const c = edgedContacts(anklesOf(x, [e, e], p.stanceM, p.geometry), [e, e], p.geometry);
    return (c[0] + c[1]) / 2 - pressureOffsetOf(c, p.insideShare[i] ?? 0.5);
  });

/**
 * The mass line's lean amplitude per clip (bumpA, bumpB, jdsB; jdsA irregular, reported only), (D_m_pp / 2) / h_m_mean:
 * the whole-body mass over the ankles across and along the slope normal (M2); measured.
 */
export const MOGUL_LEAN_RATIOS = [0.3724, 0.3648, 0.4053] as const;
/** Their mean, the same for every cell: the lean is the amount the clips give, the swing physics' answer at each pace. */
export const MOGUL_LEAN_RATIO = MOGUL_LEAN_RATIOS.reduce((a, b) => a + b, 0) / MOGUL_LEAN_RATIOS.length;
/** The clips' band of that ratio: least and most over bumpA, bumpB, jdsB with the slope ±5° (M2 res.json); measured. */
export const MOGUL_LEAN_RATIO_BAND = [0.357, 0.4167] as const;

/** The mass line's lean amplitude ratio as M2 measures the clips: most |x_mass − x_ski| (antiperiodic: half the peak to peak) over the mean h. */
export const leanRatioOf = (m: Pick<MogulMass, 'across' | 'clearance'>, ski: Float64Array): number => {
  const d = Math.max(...Array.from(m.across, (x, i) => Math.abs(x - (ski[i] ?? 0))));
  return d / (m.clearance.reduce((a, b) => a + b, 0) / m.clearance.length);
};

/** The harmonic pendulum's swing for a lean ratio r at constant h and s over a turn of `periodS`: r h (1 + s / (h ω²)), ω = π / T; a cross-check. */
export const harmonicSwing = (ratio: number, h: number, s: number, periodS: number): number => ratio * h * (1 + s / (h * (Math.PI / periodS) ** 2));

/** A swing found by rescaling, its ride, the passes and whether the last rescale fell under SWING_SETTLED. */
export interface SwingFit<R> {
  readonly swing: number;
  readonly ride: R;
  readonly passes: number;
  readonly settled: boolean;
}

/** Rescale under which the ride's lean ratio counts as the target's. */
const SWING_SETTLED = 1e-4;
const SWING_PASSES = 30;

/**
 * The swing whose ride leans the mass line `ratio`: each pass rides it (track, absorption, pendulum) and steps by the
 * secant of the ratio's miss (the first by rescaling); a ride that does not settle steps halfway back to the last that
 * did. Two rides in a row that do not settle end it: no line to fit.
 */
export const swingForLean = <R>(
  ratio: number,
  guess: number,
  rideAt: (swing: number) => R,
  ratioOf: (ride: R) => number,
  holds: (ride: R) => boolean,
): SwingFit<R> => {
  let [swing, ride] = [guess, rideAt(guess)];
  let [last, lastRatio, fails] = [Number.NaN, Number.NaN, 0];
  for (let passes = 1; ; passes++) {
    const now = ratioOf(ride);
    fails = holds(ride) ? 0 : fails + 1;
    const settled = fails === 0 && Math.abs(ratio / now - 1) < SWING_SETTLED;
    if (settled || fails >= 2 || passes >= SWING_PASSES) return { swing, ride, passes, settled };
    if (fails > 0 && Number.isFinite(last)) {
      swing = (swing + last) / 2;
      ride = rideAt(swing);
      continue;
    }
    const slope = (now - lastRatio) / (swing - last);
    const next = slope > 0 ? swing + (ratio - now) / slope : (swing * ratio) / now;
    [last, lastRatio] = [swing, now];
    swing = next;
    ride = rideAt(swing);
  }
};
