import { COORDINATES, Side } from '../../skeleton';
import { axisOf, skiFrame, transform, value } from '../fk';
import type { Vec3 } from '../../mat4';
import { edgeOf, trunkGravityOf } from '../turn';
import { crossClearances } from './clearance';
import { column, cross, dot, minus } from './geometry';
import { ORIENT_SIGMA, SKI_CENTRE, limits, skiOnSnow, worldOf } from './ik';
import type { CaptureProblem } from './ik';

const DEG = Math.PI / 180;
const SIDES = [Side.Right, Side.Left] as const;
const at = (name: string): number => COORDINATES.findIndex((c) => c.name === name);

export interface Stat {
  readonly mean: number;
  readonly rms: number;
  readonly max: number;
}
const stat = (xs: readonly number[]): Stat => ({
  mean: xs.reduce((s, x) => s + x, 0) / Math.max(1, xs.length),
  rms: Math.sqrt(xs.reduce((s, x) => s + x * x, 0) / Math.max(1, xs.length)),
  max: xs.reduce((m, x) => Math.max(m, Math.abs(x)), 0),
});
const range = (xs: readonly number[]): readonly [number, number] => [Math.min(...xs), Math.max(...xs)];

export interface Continuity {
  /** Largest |q(k+1) − q(k)| over rotation coordinates, degrees, and its coordinate. */
  readonly maxStep: number;
  readonly stepDof: string;
  /** Mean |second difference| over rotation coordinates, degrees per frame². */
  readonly meanAccel: number;
}

export const continuityOf = (qs: ReadonlyArray<ArrayLike<number>>): Continuity => {
  let [maxStep, stepDof, acc, n] = [0, '', 0, 0];
  COORDINATES.forEach((c, i) => {
    if (c.name.startsWith('pelvis_t')) return;
    for (let k = 1; k < qs.length; k++) {
      const d = Math.abs((qs[k]?.[i] ?? 0) - (qs[k - 1]?.[i] ?? 0)) / DEG;
      if (d > maxStep) [maxStep, stepDof] = [d, c.name];
      if (k + 1 < qs.length) {
        acc += Math.abs((qs[k + 1]?.[i] ?? 0) - 2 * (qs[k]?.[i] ?? 0) + (qs[k - 1]?.[i] ?? 0)) / DEG;
        n++;
      }
    }
  });
  return { maxStep, stepDof, meanAccel: acc / Math.max(1, n) };
};

/** (frame, coordinate) pairs outside joint limits ∩ cuff, beyond `tol` radians. */
export const violationsOf = (qs: ReadonlyArray<ArrayLike<number>>, tol = 1e-6): { count: number; dofs: Record<string, number> } => {
  const { lo, hi } = limits();
  const dofs: Record<string, number> = {};
  let count = 0;
  qs.forEach((q) =>
    COORDINATES.forEach((c, i) => {
      const v = q[i] ?? 0;
      if (v < (lo[i] ?? -Infinity) - tol || v > (hi[i] ?? Infinity) + tol) {
        count++;
        dofs[c.name] = (dofs[c.name] ?? 0) + 1;
      }
    }),
  );
  return { count, dofs };
};

export interface CaptureReport {
  readonly trunkGravity: { readonly solved: Stat; readonly target: Stat; readonly median: number };
  readonly knee: Readonly<Record<string, Stat & { readonly bias: number }>>;
  readonly snow: { readonly edgeGapMm: Stat; readonly tipClimbMm: Stat; readonly airborneFootFrames: number };
  readonly limits: { readonly solved: number; readonly seed: number; readonly seedDofs: Record<string, number> };
  /** Natural-unit misfit per target family: degrees for orientations and coordinates, cm for positions. */
  readonly residual: Readonly<Record<string, Stat>>;
  readonly continuity: { readonly solved: Continuity; readonly seed: Continuity };
  /** Degrees: the prior-driven spine shape. */
  readonly spine: Readonly<Record<string, { readonly mean: number; readonly range: readonly [number, number] }>>;
  readonly twistDeg: Readonly<Record<string, { readonly theta: number; readonly varusBefore: number; readonly varusAfter: number }>>;
}

const angleBetween = (A: ReadonlyArray<number>, B: ReadonlyArray<number>): number => {
  const tr = [0, 1, 2].reduce((s, c) => s + dot(column(A, c), column(B, c)), 0);
  return Math.acos(Math.max(-1, Math.min(1, (tr - 1) / 2))) / DEG;
};

/** `qs` solved frames, `seed` the raw sequential retarget (same layout), `kneeRef` GVHMR's knee angles per side, degrees. */
export const reportOf = (cp: CaptureProblem, qs: ReadonlyArray<ArrayLike<number>>, seed: ReadonlyArray<ArrayLike<number>>, kneeRef: Readonly<Record<string, readonly number[]>>): CaptureReport => {
  const tg = cp.targets;
  const worlds = qs.map((q, k) => worldOf(cp, q, k));
  const trunk = worlds.map((w) => value(trunkGravityOf(w, [0, 1, 0])) / DEG);
  const target = tg.trunk.map((d) => Math.acos(d[1]) / DEG);
  const knee = Object.fromEntries(
    SIDES.map((s) => {
      const ref = kneeRef[s] ?? [];
      const diffs = qs.map((q, k) => (q[at(`knee_flexion.${s}`)] ?? 0) / DEG - (ref[k] ?? 0));
      return [s, { ...stat(diffs), bias: stat(diffs).mean }];
    }),
  );
  const [gaps, climbs] = [[] as number[], [] as number[]];
  let airborne = 0;
  worlds.forEach((w, k) =>
    SIDES.forEach((s, i) => {
      if (!(tg.stance[k]?.[i] ?? true)) {
        airborne++;
        return;
      }
      const [g, c] = skiOnSnow(skiFrame(w, s), tg.snow[k] ?? { n: [0, 1, 0], d: 0 });
      gaps.push(value(g) * 1000);
      climbs.push(value(c) * 1000);
    }),
  );
  const residual: Record<string, number[]> = {};
  const push = (key: string, v: number): void => void (residual[key] ??= []).push(v);
  worlds.forEach((w, k) => {
    for (const seg of Object.keys(ORIENT_SIGMA)) {
      const T = tg.orient[seg]?.[k];
      const m = w[seg];
      if (T !== undefined && m !== undefined) push(`orient ${seg}`, angleBetween(T, m.R.map(value)));
    }
    const ankle = (s: string): number[] => (w[`foot.${s}`]?.p ?? [0, 0, 0]).map(value);
    const pts: Record<string, number[]> = { mid_hips: (w['pelvis']?.p ?? [0, 0, 0]).map(value), 'ankle.R': ankle('R'), 'ankle.L': ankle('L') };
    for (const s of SIDES) {
      pts[`knee.${s}`] = (w[`tibia.${s}`]?.p ?? [0, 0, 0]).map(value);
      pts[`wrist.${s}`] = (w[`hand.${s}`]?.p ?? [0, 0, 0]).map(value);
      const z = axisOf(skiFrame(w, s), 2).map(value);
      const n = tg.snow[k]?.n ?? [0, 1, 0];
      const zc = tg.skiAxis[s]?.[k] ?? [0, 0, 1];
      const flat = (v: ReadonlyArray<number>): number[] => minus(v, n.map((x) => x * dot(v, n)));
      const [a, b] = [flat(z), flat(zc)];
      push('ski heading', Math.acos(Math.max(-1, Math.min(1, dot(a, b) / Math.hypot(...a) / Math.hypot(...b)))) / DEG);
      push('knee_flexion', ((qs[k]?.[at(`knee_flexion.${s}`)] ?? 0) - (tg.coords[`knee_flexion.${s}`]?.[k] ?? 0)) / DEG);
      push('hip_flexion', ((qs[k]?.[at(`hip_flexion.${s}`)] ?? 0) - (tg.coords[`hip_flexion.${s}`]?.[k] ?? 0)) / DEG);
    }
    for (const [key, p] of Object.entries(pts)) {
      const t = tg.points[key]?.[k];
      if (t !== undefined) push(`point ${key.replace(/\.[RL]$/, '')}`, Math.hypot(...minus(p, t)) * 100);
    }
    push('trunk direction', Math.abs((trunk[k] ?? 0) - (target[k] ?? 0)));
  });
  const spineOf = (names: readonly string[]): number[] => qs.map((q) => names.reduce((s, n) => s + (q[at(n)] ?? 0), 0) / DEG);
  const spine = Object.fromEntries(
    (
      [
        ['pelvis_tilt', ['pelvis_tilt']],
        ['lumbar_flexion', ['lumbar_flexion']],
        ['thoracic_flexion', ['thoracic_flexion']],
        ['lumbar+thoracic', ['lumbar_flexion', 'thoracic_flexion']],
        ['lumbar_bending', ['lumbar_bending']],
        ['thoracic_bending', ['thoracic_bending']],
        ['thoracic_rotation', ['thoracic_rotation']],
      ] as const
    ).map(([k, ns]) => {
      const xs = spineOf(ns);
      return [k, { mean: stat(xs).mean, range: range(xs) }];
    }),
  );
  const solvedV = violationsOf(qs);
  const seedV = violationsOf(seed);
  return {
    trunkGravity: { solved: stat(trunk), target: stat(target), median: trunk.toSorted((a, b) => a - b)[Math.floor(trunk.length / 2)] ?? 0 },
    knee,
    snow: { edgeGapMm: stat(gaps), tipClimbMm: stat(climbs), airborneFootFrames: airborne },
    limits: { solved: solvedV.count, seed: seedV.count, seedDofs: seedV.dofs },
    residual: Object.fromEntries(Object.entries(residual).map(([k, v]) => [k, stat(v)])),
    continuity: { solved: continuityOf(qs), seed: continuityOf(seed) },
    spine,
    twistDeg: Object.fromEntries(Object.entries(tg.twist).map(([s, t]) => [s, { theta: t.theta / DEG, varusBefore: t.before / DEG, varusAfter: t.after / DEG }])),
  };
};

/** Frame k's segment world frames flattened for export. */
export const pelvisOf = (cp: CaptureProblem, q: ArrayLike<number>, k: number): { p: number[]; R: number[] } => {
  const m = worldOf(cp, q, k)['pelvis'];
  return { p: (m?.p ?? [0, 0, 0]).map(value), R: (m?.R ?? []).map(value) };
};

/** Edge angle above which a ski counts as edged, so its base centre may sit off the snow; inferred. */
export const EDGED = 10 * DEG;
const GATE = { relativeYaw: 5, yaw: 5, soleMm: 20 } as const;

export interface GateFrame {
  /** Signed yaw of the left ski from the right, in the snow plane, degrees. */
  readonly relativeYaw: number;
  /** (a) |solved − observed| relative yaw, null where a ski is unobserved. */
  readonly relativeYawError: number | null;
  /** (b) per side |solved − observed| yaw, null where unobserved. */
  readonly yawError: Readonly<Record<string, number | null>>;
  /** (c) least clearance per pair, mm (negative = intersecting). */
  readonly clearanceMm: Readonly<Record<string, number>>;
  /** (d) per side base-centre height over the plane (mm) and edge angle (deg), null when airborne. */
  readonly sole: Readonly<Record<string, { readonly centreMm: number; readonly edgeDeg: number } | null>>;
  /** (e) coordinates outside joint limits ∩ cuff. */
  readonly violations: number;
}

export interface Gates {
  readonly frames: readonly GateFrame[];
  readonly worst: {
    readonly relativeYawError: number | null;
    readonly yawError: number | null;
    readonly clearanceMm: Readonly<Record<string, number>>;
    readonly soleMm: number;
    readonly violations: number;
  };
  /** null: not evaluable (unobserved). */
  readonly pass: { readonly a: boolean | null; readonly b: boolean | null; readonly c: boolean; readonly d: boolean; readonly e: boolean };
}

const maxOf = (xs: ReadonlyArray<number | null>): number | null => {
  const v = xs.filter((x): x is number => x !== null);
  return v.length === 0 ? null : Math.max(...v);
};

const yawIn = (v: ReadonlyArray<number>, n: ReadonlyArray<number>, ref: ReadonlyArray<number>): number => {
  // Signed angle of v from ref about n, both flattened onto the plane.
  const flat = (u: ReadonlyArray<number>): number[] => minus(u, n.map((x) => x * dot(u, n)));
  const [a, b] = [flat(v), flat(ref)];
  const c = cross(b, a);
  return Math.atan2(dot(c, n), dot(a, b)) / DEG;
};

/** The coordinator's per-frame IK gates (design.md): ski yaw vs observation, clearance, skis on snow, limits. */
export const gatesOf = (cp: CaptureProblem, qs: ReadonlyArray<ArrayLike<number>>): Gates => {
  const tg = cp.targets;
  const { lo, hi } = limits();
  const frames = qs.map((q, k): GateFrame => {
    const w = worldOf(cp, q, k);
    const plane = tg.snow[k] ?? { n: [0, 1, 0] as const, d: 0 };
    const z = Object.fromEntries(SIDES.map((s) => [s, axisOf(skiFrame(w, s), 2).map(value)]));
    const relativeYaw = yawIn(z['L'] ?? [0, 0, 1], plane.n, z['R'] ?? [0, 0, 1]);
    const obs = Object.fromEntries(SIDES.map((s) => [s, tg.skiAxis[s]?.[k]]));
    const yawError = Object.fromEntries(SIDES.map((s) => [s, obs[s] === undefined ? null : Math.abs(yawIn(z[s] ?? [0, 0, 1], plane.n, obs[s]))]));
    const relativeYawError = obs['R'] === undefined || obs['L'] === undefined ? null : Math.abs(relativeYaw - yawIn(obs['L'], plane.n, obs['R']));
    const clearanceMm = Object.fromEntries(Object.entries(crossClearances(w)).map(([p, rows]) => [p, Math.min(...rows.map(value)) * 1000]));
    const sole = Object.fromEntries(
      SIDES.map((s, i) => {
        if (!(tg.stance[k]?.[i] ?? true)) return [s, null];
        const ski = skiFrame(w, s);
        const c = transform(ski, SKI_CENTRE).map(value);
        return [s, { centreMm: (dot(c, plane.n) - plane.d) * 1000, edgeDeg: value(edgeOf(ski, plane.n as Vec3)) / DEG }];
      }),
    );
    const violations = COORDINATES.filter((_, i) => (q[i] ?? 0) < (lo[i] ?? -Infinity) - 1e-6 || (q[i] ?? 0) > (hi[i] ?? Infinity) + 1e-6).length;
    return { relativeYaw, relativeYawError, yawError, clearanceMm, sole, violations };
  });
  const pairs = Object.keys(frames[0]?.clearanceMm ?? {});
  const clearanceMm = Object.fromEntries(pairs.map((p) => [p, Math.min(...frames.map((f) => f.clearanceMm[p] ?? Infinity))]));
  // An edged ski's centre rises by the half width times sin(edge); only flat skis are held to the sole gate.
  const soleMm = Math.max(0, ...frames.flatMap((f) => Object.values(f.sole).flatMap((s) => (s === null || Math.abs(s.edgeDeg) > EDGED / DEG ? [] : [Math.abs(s.centreMm)]))));
  const worst = {
    relativeYawError: maxOf(frames.map((f) => f.relativeYawError)),
    yawError: maxOf(frames.flatMap((f) => Object.values(f.yawError))),
    clearanceMm,
    soleMm,
    violations: Math.max(...frames.map((f) => f.violations)),
  };
  return {
    frames,
    worst,
    pass: {
      a: worst.relativeYawError === null ? null : worst.relativeYawError <= GATE.relativeYaw,
      b: worst.yawError === null ? null : worst.yawError <= GATE.yaw,
      c: Object.values(clearanceMm).every((m) => m >= -1e-3),
      d: soleMm <= GATE.soleMm,
      e: worst.violations === 0,
    },
  };
};
