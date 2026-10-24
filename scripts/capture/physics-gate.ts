// Newton–Euler consistency of a captured motion: the snow force its centre of mass's path needs, against the body and
// skis on that snow. No angle targets and no discipline constants: every interval is the clip's own noise, propagated.
import { G } from '../../src/physics/turn';
import type { Frame3, M3, V3 } from './gate-math';
import { addV, apply, col, cross, dot, fitPlane, norm, quantile, scale, sub, unit } from './gate-math';

const DEG = 180 / Math.PI;
/** Two-sided 95 % normal quantile. */
export const Z95 = 1.959964;
/** One-sided 95 % normal quantile. */
const Z95_ONE = 1.644854;

export interface MassSegment {
  /** Share of body mass. */
  readonly mass: number;
  readonly centre: V3;
  /** Unit long axis, for a slender rod's spin. */
  readonly axis: V3;
  readonly length: number;
}
export interface MassFrame {
  readonly com: V3;
  readonly segments: ReadonlyArray<MassSegment>;
}
/** A ski's base in its binding frame: z from tail to tip, y the base's height, x across. */
export interface SkiShape {
  readonly tip: number;
  readonly tail: number;
  readonly base: number;
  readonly halfWidth: number;
}
export interface PhysicsInput {
  readonly mass: MassFrame;
  readonly skis: Readonly<Record<string, Frame3>>;
}
export interface PhysicsOptions {
  readonly dt: number;
  readonly ski: SkiShape;
  /** Relative 1σ uncertainty of the world's metric scale. */
  readonly scaleSigma: number;
  /** Snow-plane window half width, frames. */
  readonly snowHalf: number;
  /** Gravity in the world frame, m/s². */
  readonly gravity?: V3;
  /** Fixed polynomial half window, frames; chosen from the noise when absent. */
  readonly half?: number;
}

// --- Local quadratic (Savitzky–Golay) fit with covariance from its residuals.

const inv3 = (m: ReadonlyArray<number>): number[] => {
  const a = (i: number): number => m[i] ?? 0;
  const c = [
    a(4) * a(8) - a(5) * a(7), a(2) * a(7) - a(1) * a(8), a(1) * a(5) - a(2) * a(4),
    a(5) * a(6) - a(3) * a(8), a(0) * a(8) - a(2) * a(6), a(2) * a(3) - a(0) * a(5),
    a(3) * a(7) - a(4) * a(6), a(1) * a(6) - a(0) * a(7), a(0) * a(4) - a(1) * a(3),
  ];
  const det = a(0) * (c[0] ?? 0) + a(1) * (c[3] ?? 0) + a(2) * (c[6] ?? 0);
  return c.map((v) => v / det);
};
const scaleM = (m: ReadonlyArray<number>, k: number): M3 => m.map((v) => v * k);

export interface LocalFit {
  readonly value: V3;
  readonly rate: V3;
  readonly accel: V3;
  readonly covValue: M3;
  readonly covRate: M3;
  readonly covAccel: M3;
  /** One sample's residual covariance, its diagonal floored at the series' noise. */
  readonly noise: M3;
  /** Residual sum of squares per axis. */
  readonly rss: V3;
  readonly dof: number;
}

/** Quadratic in time over 2·half+1 frames about frame k (shifted inward at the ends), evaluated at k. */
export const localFit = (xs: ReadonlyArray<ReadonlyArray<number>>, k: number, half: number, dt: number, floor: ReadonlyArray<number> = [0, 0, 0]): LocalFit => {
  const w = Math.min(xs.length, 2 * half + 1);
  const lo = Math.max(0, Math.min(k - half, xs.length - w));
  const S = [0, 0, 0, 0, 0];
  for (let i = lo; i < lo + w; i++) {
    const t = (i - k) * dt;
    for (let p = 0; p < 5; p++) S[p] = (S[p] ?? 0) + t ** p;
  }
  const A = inv3([0, 1, 2, 1, 2, 3, 2, 3, 4].map((p) => S[p] ?? 0));
  const beta = [0, 1, 2].map((d) => {
    const b = [0, 0, 0];
    for (let i = lo; i < lo + w; i++) {
      const t = (i - k) * dt;
      const y = xs[i]?.[d] ?? 0;
      b[0] = (b[0] ?? 0) + y;
      b[1] = (b[1] ?? 0) + y * t;
      b[2] = (b[2] ?? 0) + y * t * t;
    }
    return [0, 1, 2].map((r) => (A[3 * r] ?? 0) * (b[0] ?? 0) + (A[3 * r + 1] ?? 0) * (b[1] ?? 0) + (A[3 * r + 2] ?? 0) * (b[2] ?? 0));
  });
  const dof = Math.max(1, w - 3);
  const E = [0, 0, 0, 0, 0, 0, 0, 0, 0];
  for (let i = lo; i < lo + w; i++) {
    const t = (i - k) * dt;
    const e = [0, 1, 2].map((d) => (xs[i]?.[d] ?? 0) - ((beta[d]?.[0] ?? 0) + (beta[d]?.[1] ?? 0) * t + (beta[d]?.[2] ?? 0) * t * t));
    for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) E[3 * r + c] = (E[3 * r + c] ?? 0) + (e[r] ?? 0) * (e[c] ?? 0);
  }
  const rss: V3 = [E[0] ?? 0, E[4] ?? 0, E[8] ?? 0];
  // Raising the diagonal keeps the covariance positive semi-definite.
  const noise = E.map((v, i) => (i % 4 === 0 ? Math.max(v / dof, (floor[i / 4] ?? 0) ** 2) : v / dof));
  const coef = (j: number): V3 => [beta[0]?.[j] ?? 0, beta[1]?.[j] ?? 0, beta[2]?.[j] ?? 0];
  return {
    value: coef(0),
    rate: coef(1),
    accel: scale(coef(2), 2),
    covValue: scaleM(noise, A[0] ?? 0),
    covRate: scaleM(noise, A[4] ?? 0),
    covAccel: scaleM(noise, 4 * (A[8] ?? 0)),
    noise,
    rss,
    dof,
  };
};

/** White-noise σ of a sampled series from its fourth differences, robust to the odd outlier (MAD). */
export const noiseOf = (xs: ReadonlyArray<number>): number => {
  const d4 = xs.slice(4).map((_, i) => (xs[i + 4] ?? 0) - 4 * (xs[i + 3] ?? 0) + 6 * (xs[i + 2] ?? 0) - 4 * (xs[i + 1] ?? 0) + (xs[i] ?? 0));
  const med = quantile(d4, 0.5);
  return d4.length === 0 ? 0 : (1.4826 * quantile(d4.map((v) => Math.abs(v - med)), 0.5)) / Math.sqrt(70);
};
const noise3 = (xs: ReadonlyArray<ReadonlyArray<number>>): V3 => [0, 1, 2].map((d) => noiseOf(xs.map((x) => x[d] ?? 0))) as V3;

/** χ² quantile at standard-normal z with ν degrees of freedom (Wilson–Hilferty). */
export const chi2Quantile = (nu: number, z: number): number => nu * (1 - 2 / (9 * nu) + z * Math.sqrt(2 / (9 * nu))) ** 3;

/**
 * The widest centred window whose quadratic still fits to the noise: no more windows than the expected 5 % (plus its
 * binomial 95 % margin) leave residuals above the 95 % χ² quantile. Wider windows would bias the acceleration.
 */
export const chooseHalf = (xs: ReadonlyArray<ReadonlyArray<number>>, dt: number, sigma: ReadonlyArray<number> = noise3(xs)): number => {
  let best = 2;
  for (let h = 2; 2 * h + 1 <= xs.length; h++) {
    const ks = Array.from({ length: xs.length - 2 * h }, (_, i) => i + h);
    const limit = chi2Quantile(2 * h - 2, Z95_ONE);
    const over = ks.filter((k) => {
      const f = localFit(xs, k, h, dt);
      return [0, 1, 2].some((d) => (f.rss[d] ?? 0) > limit * Math.max(1e-24, (sigma[d] ?? 0) ** 2));
    }).length;
    // Each axis may fail on its own, so the null rate is 1 − 0.95³.
    const p = 1 - 0.95 ** 3;
    if (over > ks.length * p + Z95_ONE * Math.sqrt(ks.length * p * (1 - p))) break;
    best = h;
  }
  return best;
};

// --- Per-frame checks.

const covQuad = (J: ReadonlyArray<number>, K: ReadonlyArray<number>, C: ReadonlyArray<ReadonlyArray<number>>): number =>
  J.reduce((s, a, i) => s + K.reduce((t, b, j) => t + a * b * (C[i]?.[j] ?? 0), 0), 0);

/** Block-diagonal covariance from square blocks. */
const blockDiag = (blocks: ReadonlyArray<ReadonlyArray<number>>): number[][] => {
  const sizes = blocks.map((b) => Math.round(Math.sqrt(b.length)));
  const n = sizes.reduce((a, b) => a + b, 0);
  const out = Array.from({ length: n }, () => Array.from({ length: n }, () => 0));
  let o = 0;
  blocks.forEach((b, k) => {
    const m = sizes[k] ?? 0;
    for (let r = 0; r < m; r++) for (let c = 0; c < m; c++) (out[o + r] as number[])[o + c] = b[m * r + c] ?? 0;
    o += m;
  });
  return out;
};

export interface FrameState {
  /** Centre of mass as captured, its trajectory's acceleration and velocity. */
  readonly c: V3;
  readonly a: V3;
  readonly v: V3;
  /** Whole-body angular momentum rate per unit mass about the centre of mass, m²/s². */
  readonly ldot: V3;
  readonly cov: { readonly c: M3; readonly a: M3; readonly v: M3; readonly ldot: M3 };
  readonly scaleSigma: number;
  readonly plane: { readonly n: V3; readonly d: number };
  readonly skis: Readonly<Record<string, Frame3>>;
  /** Per-frame noise of each ski's base normal and of the skis' heading, radians. */
  readonly baseSigma: Readonly<Record<string, number>>;
  readonly headingSigma: number;
  readonly gravity: V3;
}

export interface CheckResult {
  /** Distance outside the allowed range in the check's unit; 0 inside. */
  readonly miss: number;
  readonly sigma: number;
  /** miss over its 95 % allowance: the check fails above 1. */
  readonly score: number;
  readonly pass: boolean;
}
const check = (miss: number, sigma: number, z = Z95): CheckResult => {
  const score = miss <= 0 ? 0 : miss / Math.max(1e-12, z * sigma);
  return { miss: Math.max(0, miss), sigma, score, pass: !(score > 1) };
};

export interface PhysicsFrame {
  /** Snow force per unit mass, f = a − g, in units of g; its 1σ. */
  readonly force: number;
  readonly forceSigma: number;
  /** The force exceeds its own noise: the snow carries the skier. */
  readonly loaded: boolean;
  /** Snow normal from up, degrees. */
  readonly slope: number;
  /** Across the skis' heading (+ toward cross(heading, normal)), degrees from the snow normal. */
  readonly tilt: {
    readonly required: number;
    /** Line from where the force meets the snow to the centre of mass, the angular-momentum offset included. */
    readonly effective: number;
    readonly captured: number;
    readonly interval: readonly [number, number];
    readonly sigma: number;
  };
  /** Where the force's line meets the snow along the heading against the skis' tail..tip, m from the centre of mass. */
  readonly foreAft: { readonly at: number; readonly range: readonly [number, number]; readonly sigma: number };
  /** Snow-normal force in units of g. */
  readonly normal: { readonly value: number; readonly sigma: number };
  /** Force tilt and each ski base's edge angle, degrees, across the heading. */
  readonly edge: { readonly force: number; readonly base: Readonly<Record<string, number>>; readonly over: number; readonly sigma: number };
  /** Skis' heading against the centre of mass's velocity in the snow plane, degrees. */
  readonly skid: { readonly angle: number; readonly sigma: number; readonly evident: boolean; readonly speed: number };
  readonly checks: { readonly balance: CheckResult | null; readonly foreAft: CheckResult | null; readonly contact: CheckResult; readonly edge: CheckResult | null };
}

/** Lower base corners of a ski: both edges at tip and tail. */
const corners = (ski: Frame3, s: SkiShape): V3[] => [s.tip, s.tail].flatMap((z) => [1, -1].map((e) => apply(ski, [e * s.halfWidth, s.base, z])));

/** One frame's checks with every output's uncertainty from a numerical Jacobian over (a, scale, c, ldot, v). */
export const physicsFrame = (st: FrameState, shape: SkiShape): PhysicsFrame => {
  const { n, d } = st.plane;
  const sides = Object.keys(st.skis);
  const heads = sides.map((s) => { const z = col(st.skis[s]?.R ?? [], 2); return unit(sub(z, scale(n, dot(z, n)))); });
  const H = unit(heads.reduce<V3>((a, h) => addV(a, h), [0, 0, 0]));
  const e = unit(cross(H, n));
  const pts = sides.flatMap((s) => corners(st.skis[s] as Frame3, shape));
  const bases = Object.fromEntries(sides.map((s) => { const b = col(st.skis[s]?.R ?? [], 1); return [s, Math.atan2(dot(b, e), dot(b, n))]; }));

  const P0 = [...st.a, 1, ...st.c, ...st.ldot, ...st.v];
  const outputs = (p: ReadonlyArray<number>): number[] => {
    const a: V3 = [p[0] ?? 0, p[1] ?? 0, p[2] ?? 0];
    const c: V3 = [p[4] ?? 0, p[5] ?? 0, p[6] ?? 0];
    const l: V3 = [p[7] ?? 0, p[8] ?? 0, p[9] ?? 0];
    const v: V3 = [p[10] ?? 0, p[11] ?? 0, p[12] ?? 0];
    const f = sub(scale(a, p[3] ?? 1), st.gravity);
    const ff = dot(f, f);
    // The force's line passes off the mass by f × ldot / |f|², so its moment about the mass is the momentum's rate.
    const cl = addV(c, ff > 0 ? scale(cross(f, l), 1 / ff) : [0, 0, 0]);
    const fn = dot(n, f);
    const q = Math.abs(fn) > 1e-12 ? sub(cl, scale(f, (dot(n, cl) - d) / fn)) : addV(cl, scale(f, 1e9));
    const h = dot(n, c) - d;
    const es = pts.map((x) => dot(sub(x, c), e));
    const hs = pts.map((x) => dot(sub(x, c), H));
    const qe = dot(sub(q, c), e);
    const vp = sub(v, scale(n, dot(n, v)));
    return [
      Math.atan2(dot(f, e), fn),
      Math.atan2(-qe, h),
      Math.atan2(-Math.max(...es), h),
      Math.atan2(-Math.min(...es), h),
      Math.atan2(-es.reduce((s, x) => s + x, 0) / es.length, h),
      dot(sub(q, c), H),
      fn / G,
      Math.sqrt(ff) / G,
      Math.atan2(dot(cross(H, vp), n), dot(H, vp)),
      norm(vp),
      Math.min(...hs),
      Math.max(...hs),
    ];
  };
  const o = outputs(P0);
  const J = P0.map((x, i) => {
    const h = 1e-6 * Math.max(1, Math.abs(x));
    const up = outputs(P0.map((y, j) => (j === i ? y + h : y)));
    const dn = outputs(P0.map((y, j) => (j === i ? y - h : y)));
    return up.map((u, k) => (u - (dn[k] ?? 0)) / (2 * h));
  });
  const C = blockDiag([st.cov.a, [st.scaleSigma ** 2], st.cov.c, st.cov.ldot, st.cov.v]);
  const row = (k: number): number[] => J.map((jc) => jc[k] ?? 0);
  const varOf = (w: ReadonlyArray<readonly [number, number]>): number => {
    const g = J.map((_, i) => w.reduce((s, [k, c]) => s + c * (row(k)[i] ?? 0), 0));
    return Math.max(0, covQuad(g, g, C));
  };
  const sd = (k: number): number => Math.sqrt(varOf([[k, 1]]));
  const [req = 0, eff = 0, lo = 0, hi = 0, centre = 0, along = 0, fn = 0, f = 0, psi = 0, speed = 0, tail = 0, tip = 0] = o;

  const loaded = f > Z95_ONE * sd(7) && fn > 0;
  const sTilt = Math.max(Math.sqrt(varOf([[1, 1], [2, -1]])), Math.sqrt(varOf([[1, 1], [3, -1]])));
  const balance = loaded ? check(Math.max(lo - eff, eff - hi), eff < lo ? Math.sqrt(varOf([[1, 1], [2, -1]])) : Math.sqrt(varOf([[1, 1], [3, -1]]))) : null;
  const foreAft = loaded ? check(Math.max(tail - along, along - tip), sd(5)) : null;
  const contact = check(-fn, sd(6), Z95_ONE);

  const skidSigma = Math.hypot(sd(8), st.headingSigma);
  const evident = Math.abs(psi) > Z95 * skidSigma;
  const overs = sides.map((s) => Math.sign(req) * (req - (bases[s] ?? 0)));
  const best = sides.reduce((b, _, i) => ((overs[i] ?? Infinity) < (overs[b] ?? Infinity) ? i : b), 0);
  const edgeSigma = Math.hypot(sd(0), st.baseSigma[sides[best] ?? ''] ?? 0);
  const edgeCheck = loaded ? check(overs[best] ?? 0, edgeSigma) : null;
  // A skidding platform is reported, not failed.
  const edge = edgeCheck !== null && !edgeCheck.pass && evident ? { ...edgeCheck, score: 0, pass: true } : edgeCheck;

  return {
    force: f,
    slope: Math.acos(Math.min(1, -dot(n, unit(st.gravity)))) * DEG,
    forceSigma: sd(7),
    loaded,
    tilt: { required: req * DEG, effective: eff * DEG, captured: centre * DEG, interval: [lo * DEG, hi * DEG], sigma: sTilt * DEG },
    foreAft: { at: along, range: [tail, tip], sigma: sd(5) },
    normal: { value: fn, sigma: sd(6) },
    edge: { force: req * DEG, base: Object.fromEntries(Object.entries(bases).map(([k, v]) => [k, v * DEG])), over: (overs[best] ?? 0) * DEG, sigma: edgeSigma * DEG },
    skid: { angle: psi * DEG, sigma: skidSigma * DEG, evident, speed },
    checks: { balance, foreAft, contact, edge },
  };
};

// --- Whole clip.

const sum = (vs: ReadonlyArray<V3>): V3 => vs.reduce<V3>((a, v) => addV(a, v), [0, 0, 0]);

export interface PhysicsClip {
  readonly half: number;
  readonly windowSeconds: number;
  /** COM noise per axis, m. */
  readonly comNoise: V3;
  readonly frames: ReadonlyArray<PhysicsFrame>;
  /** Median |ldot| and median of its inferred-inertia (rod) share, m²/s² per unit mass. */
  readonly angularMomentum: { readonly rate: number; readonly rodRate: number };
}

/** Every frame's checks over a clip. */
export const physicsGate = (frames: ReadonlyArray<PhysicsInput>, opt: PhysicsOptions): PhysicsClip => {
  const { dt } = opt;
  const gravity = opt.gravity ?? [0, -G, 0];
  const C = frames.map((f) => f.mass.com);
  const comNoise = noise3(C);
  const half = opt.half ?? chooseHalf(C, dt, comNoise);
  // A window's few residual dof estimate its noise poorly, so it is floored at the clip's pooled residual and white noise.
  const fitOf = (xs: ReadonlyArray<ReadonlyArray<number>>): LocalFit[] => {
    const white = noise3(xs);
    const first = xs.map((_, k) => localFit(xs, k, half, dt));
    const dofs = first.reduce((t, f) => t + f.dof, 0);
    const floor = white.map((w, i) => Math.max(w, Math.sqrt(first.reduce((t, f) => t + (f.rss[i] ?? 0), 0) / dofs)));
    return xs.map((_, k) => localFit(xs, k, half, dt, floor));
  };
  const fc = fitOf(C);

  // Angular momentum about the centre of mass per unit mass: segment centres' motion plus slender rods' spin.
  const nSeg = frames[0]?.mass.segments.length ?? 0;
  const segFit = Array.from({ length: nSeg }, (_, i) => fitOf(frames.map((f) => f.mass.segments[i]?.centre ?? [0, 0, 0])));
  const axisFit = Array.from({ length: nSeg }, (_, i) => fitOf(frames.map((f) => f.mass.segments[i]?.axis ?? [0, 1, 0])));
  const total = frames[0]?.mass.segments.reduce((t, s) => t + s.mass, 0) ?? 1;
  const orbit = frames.map((f, k) => scale(sum(f.mass.segments.map((s, i) => {
    const r = segFit[i]?.[k];
    const cf = fc[k];
    return r === undefined || cf === undefined ? [0, 0, 0] : scale(cross(sub(r.value, cf.value), sub(r.rate, cf.rate)), s.mass);
  })), 1 / total));
  const spin = frames.map((f, k) => scale(sum(f.mass.segments.map((s, i) => {
    const u = axisFit[i]?.[k];
    return u === undefined ? [0, 0, 0] : scale(cross(u.value, u.rate), (s.mass * s.length ** 2) / 12);
  })), 1 / total));
  const lOrbit = fitOf(orbit);
  const lSpin = fitOf(spin);

  // Snow plane through both skis' lower tip and tail edges over the window, as the fit's snowFromSkis.
  const lowest = (ski: Frame3): V3[] => [opt.ski.tip, opt.ski.tail].map((z) => {
    const [a, b] = [1, -1].map((e) => apply(ski, [e * opt.ski.halfWidth, opt.ski.base, z])) as [V3, V3];
    return dot(a, gravity) > dot(b, gravity) ? a : b;
  });
  const planes = frames.map((_, k) => {
    const pts = frames.slice(Math.max(0, k - opt.snowHalf), k + opt.snowHalf + 1).flatMap((f) => Object.values(f.skis).flatMap(lowest));
    const p = fitPlane(pts);
    return dot(p.n, gravity) > 0 ? { n: scale(p.n, -1), d: -p.d } : p;
  });

  // Per-frame noise of the skis' base normals and heading, from the same local fit.
  const sides = Object.keys(frames[0]?.skis ?? {});
  const vecNoise = (xs: ReadonlyArray<V3>): number[] => { const f = fitOf(xs); return f.map((x) => Math.sqrt((x.noise[0] ?? 0) + (x.noise[4] ?? 0) + (x.noise[8] ?? 0))); };
  const baseNoise = Object.fromEntries(sides.map((s) => [s, vecNoise(frames.map((f) => col(f.skis[s]?.R ?? [], 1)))]));
  const headingNoise = vecNoise(frames.map((f, k) => {
    const n = planes[k]?.n ?? [0, 1, 0];
    return unit(sum(sides.map((s) => { const z = col(f.skis[s]?.R ?? [], 2); return unit(sub(z, scale(n, dot(z, n)))); })));
  }));

  const out = frames.map((f, k) => {
    const c = fc[k] as LocalFit;
    const lo = lOrbit[k] as LocalFit;
    const ls = lSpin[k] as LocalFit;
    // Rod inertia is inferred, so its whole share counts as uncertainty on top of the fit's.
    const ldotCov = lo.covRate.map((v, i) => (i % 4 === 0 ? v + (ls.covRate[i] ?? 0) + (ls.rate[i / 4] ?? 0) ** 2 : v + (ls.covRate[i] ?? 0)));
    return physicsFrame({
      c: f.mass.com,
      a: c.accel,
      v: c.rate,
      ldot: addV(lo.rate, ls.rate),
      cov: { c: c.noise, a: c.covAccel, v: c.covRate, ldot: ldotCov },
      scaleSigma: opt.scaleSigma,
      plane: planes[k] as { n: V3; d: number },
      skis: f.skis,
      baseSigma: Object.fromEntries(sides.map((s) => [s, baseNoise[s]?.[k] ?? 0])),
      headingSigma: headingNoise[k] ?? 0,
      gravity,
    }, opt.ski);
  });
  return {
    half,
    windowSeconds: (2 * half + 1) * dt,
    comNoise,
    frames: out,
    angularMomentum: { rate: quantile(lOrbit.map((l, k) => norm(addV(l.rate, lSpin[k]?.rate ?? [0, 0, 0]))), 0.5), rodRate: quantile(lSpin.map((l) => norm(l.rate)), 0.5) },
  };
};

/**
 * Metric scale from detected over modelled ski length in the image: 1σ is the median's distance from 1 (the
 * skier's ski or the world's scale, indistinguishable here) with the median's own spread.
 */
export const skiScale = (ratios: ReadonlyArray<number>): { readonly ratio: number; readonly sigma: number; readonly n: number } => {
  const r = ratios.filter((x) => Number.isFinite(x) && x > 0);
  const med = quantile(r, 0.5);
  const mad = 1.4826 * quantile(r.map((x) => Math.abs(x - med)), 0.5);
  return r.length === 0 ? { ratio: Number.NaN, sigma: 0, n: 0 } : { ratio: med, sigma: Math.hypot(med - 1, (1.2533 * mad) / Math.sqrt(r.length)), n: r.length };
};
