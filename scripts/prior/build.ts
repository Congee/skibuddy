// Usage: bun scripts/prior/build.ts [--check]
// Registers the literature and footage curves onto the phase events, maps them onto the ISB
// coordinates and fits src/viewer/prior/priors.json. --check exits non-zero when it is stale.
import { readFileSync, writeFileSync } from 'node:fs';
import { PHASE_T, arcLoad } from '../../src/physics/turn';
import type { TurnScenario } from '../../src/physics/turn';
import { JOINT_LIMITS } from '../../src/viewer/joint-limits';
import { fitSeries, peakPhase, register, sample } from '../../src/viewer/prior/fit';
import type { Curve } from '../../src/viewer/prior/fit';
import { BASE_NAMES, EdgeChange, Evidence, Parity, Role, SigmaFrom, evalDeg, parityOf } from '../../src/viewer/prior/prior';
import type { CoordinatePrior, Example, LimitFlag, PriorFile, RoleProvenance, SourceUse } from '../../src/viewer/prior/prior';
import { RegularTurn, TURN_STYLES } from '../../src/viewer/poses/regular-turn';
import LIT from './lit-curves.json';
import REILLY from './reilly-curves.json';

export const PRIORS_FILE = new URL('../../src/viewer/prior/priors.json', import.meta.url);

const DEG = Math.PI / 180;
/** Phase samples per turn. */
export const GRID = 48;
const MU_ORDER = 12;
const SIGMA_ORDER = 6;
/** σ of a single source, degrees; inferred. */
export const SINGLE_WIDE = 10;
/** Least σ from a between-source spread, degrees; inferred, so two agreeing sources don't pin a coordinate. */
export const SIGMA_FLOOR = 3;

type Anchors = ReadonlyArray<readonly [number, number]>;
const IDENTITY: Anchors = [[0, 0], [1, 1]];

interface Base {
  readonly id: string;
  readonly what: string;
  readonly status: string;
  readonly evidence: Evidence;
  readonly n: number;
  readonly errorDeg: number;
  readonly mapping: string;
}
interface CurveSource extends Base {
  readonly curve: Curve;
  readonly anchors: Anchors;
  readonly warp: string;
  /** Phases the curve covers; the source reads nothing outside it. */
  readonly span?: readonly [number, number];
}
interface RangeSource extends Base {
  readonly range: readonly [number, number];
}
export type Source = CurveSource | RangeSource;
const isCurve = (s: Source): s is CurveSource => 'curve' in s;

interface CoordinateDef {
  readonly roles: Readonly<Partial<Record<Role, ReadonlyArray<Source>>>>;
  readonly notes?: ReadonlyArray<string>;
}
export interface ExampleDef {
  readonly id: string;
  readonly arcLoad: number;
  readonly indexProvenance: string;
  readonly coordinates: Readonly<Record<string, CoordinateDef>>;
}

// --- Sources -------------------------------------------------------------------------------------

const lit = LIT as unknown as Record<string, Record<string, unknown>>;
const at = (path: string): Record<string, unknown> => {
  const v = path.split('.').reduce<unknown>((o, k) => (o as Record<string, unknown> | undefined)?.[k], lit);
  if (v === undefined) throw new Error(`no ${path} in lit-curves.json`);
  return v as Record<string, unknown>;
};
const curveAt = (path: string, scale = 1): Curve => {
  const e = at(path);
  return { t: e['t'] as number[], v: (e['mean'] as number[]).map((x) => x * scale) };
};

// Heinrich 2023's window is the captured turn, not switch to switch: put the inside knee's peak on the fall line (kroll-2015 t ≈0.5).
const H23_INSIDE_KNEE = peakPhase(curveAt('gs_carving.inside.knee_flexion'));
const H23_ANCHORS: Anchors = [[0, 0], [H23_INSIDE_KNEE, 0.5], [1, 1]];
const H23_WARP = `window start = edge change (pelvis list ≈0 there), inside knee max t ${H23_INSIDE_KNEE.toFixed(3)} → ½, window end → 1; piecewise linear`;
const H23 = { id: 'heinrich-2023', status: 'digitised (Fig 2, grey = measured)', evidence: Evidence.Digitised, n: 1, errorDeg: 1, anchors: H23_ANCHORS, warp: H23_WARP } as const;
// The turn's global pelvis yaw rises (−34 → +53, OpenSim, + to the left), so it is read as a left turn, right leg outside; inferred.
const H23_TURN = 'turn read as a left turn from the rising global pelvis yaw (OpenSim + = left; inferred); a right turn would flip this sign';

// OpenSim's single lumbar joint is the whole trunk on the pelvis; shared out by the limit spans (inferred).
const spineShare = (region: 'lumbar' | 'thoracic', axis: 'flexion' | 'bending' | 'rotation'): number => {
  const span = (r: string): number => {
    const l = JOINT_LIMITS[`${r}_${axis}`];
    return l === undefined ? 0 : l.upper.value - l.lower.value;
  };
  return span(region) / (span('lumbar') + span('thoracic'));
};

const h23Spine = (region: 'lumbar' | 'thoracic', axis: 'flexion' | 'bending' | 'rotation'): CurveSource => {
  const share = spineShare(region, axis);
  const key = { flexion: 'trunk_pitch.lumbar_flexion_vs_pelvis', bending: 'trunk_lateral_tilt.lumbar_bend_vs_pelvis', rotation: 'trunk_lateral_tilt.lumbar_rotation_vs_pelvis' }[axis];
  const sign = axis === 'flexion' ? -1 : 1;
  const mapping =
    axis === 'flexion'
      ? `OpenSim lumbar_extension (− = flexed) negated; × ${share.toFixed(3)}, this region's share of the lumbar + thoracic flexion span (inferred)`
      : `OpenSim lumbar_${axis} as ISB ${axis} (${axis === 'bending' ? 'right' : 'left'} +; sign convention not stated in the paper, uncertain); × ${share.toFixed(3)} span share (inferred); ${H23_TURN}`;
  return { ...H23, what: `${key} (whole trunk vs pelvis)`, curve: curveAt(`gs_carving.${key}`, sign * share), mapping };
};

const h23Leg = (role: 'outside' | 'inside', channel: string, mapping: string, scale = 1): CurveSource => ({
  ...H23,
  what: `${role} ${channel}`,
  curve: curveAt(`gs_carving.${role}.${channel}`, scale),
  mapping,
});
const H22 = { id: 'heinrich-2022', status: 'range-only measured (Table 1)', evidence: Evidence.RangeOnly, n: 1, errorDeg: 1 } as const;
const h22 = (role: 'outside' | 'inside', channel: string, mapping: string, scale = 1): RangeSource => {
  const [a, b] = at(`gs_carving.${role}.${channel}_heinrich2022`)['range'] as [number, number];
  const r = [a * scale, b * scale].toSorted((x, y) => x - y) as [number, number];
  return { ...H22, what: `${role} ${channel} min–max, one instructor, GS ≈14 m/s`, range: r, mapping };
};
const KROLL = { id: 'kroll-2015', status: 'eye-read (Fig 1A); its Table 1 extrema measured', evidence: Evidence.EyeRead, n: 1, errorDeg: 5, anchors: IDENTITY } as const;
const kroll = (path: string, role: string, span?: readonly [number, number]): CurveSource => ({
  ...KROLL,
  what: `${role} knee flexion, ${path.startsWith('slalom') ? 'SL' : 'GS'}, one FIS racer`,
  curve: curveAt(path),
  warp: 'none: plotted switch to switch, inside knee max ≈ ½ already',
  mapping: 'flexion = 180 − knee angle, as ISB knee_flexion',
  ...(span === undefined ? {} : { span }),
});

const FLEX = 'flexion +, as ISB';
const ABD = 'abduction + negated to ISB adduction';
const ROT = 'internal rotation +, as ISB';

// Reilly: the three turns' mean; the near ski is outside in turn 2 (lead-footage/notes.md), alternating.
const reillyMean = (key: 'knee_outside' | 'knee_inside' | 'trunk_thigh_outside' | 'trunk_thigh_inside'): Curve => {
  const turns = REILLY.turns as unknown as ReadonlyArray<Record<string, number[]>>;
  return { t: REILLY.phi, v: REILLY.phi.map((_, i) => turns.reduce((s, tr) => s + (tr[key]?.[i] ?? 0), 0) / turns.length) };
};
const REILLY_SRC = {
  id: 'footage vXcjdfBXTiI (Reilly McGlashan)',
  status: 'footage: rtmlib RTMPose-x 2D, side-on, 3 turns (scripts/prior/reilly-curves.json)',
  evidence: Evidence.Footage,
  n: 1,
  anchors: IDENTITY,
  warp: 'phase = time between hand-read switches 4.86 and 5.59 s (lead-footage/notes.md); 4.13 and 6.32 s at the 0.73 s period, inferred',
} as const;
const reilly = (key: 'knee_outside' | 'knee_inside' | 'trunk_thigh_outside' | 'trunk_thigh_inside'): CurveSource =>
  key.startsWith('knee')
    ? { ...REILLY_SRC, what: key.replace('_', ' '), curve: reillyMean(key), errorDeg: 10, mapping: 'image-plane thigh–shank angle as knee_flexion (side view, ±5–10°, spike/video/notes.md)' }
    : {
        ...REILLY_SRC,
        what: key.replace('_', ' ').replace('_', '–'),
        curve: reillyMean(key),
        errorDeg: 15,
        mapping: 'image-plane trunk–thigh angle as hip_flexion; it includes the spine flexion, so it overstates the hip (uncertain)',
      };

const range = (id: string, what: string, r: readonly [number, number], status: string, errorDeg: number, mapping: string, n = 1): RangeSource => ({
  id,
  what,
  status,
  evidence: Evidence.RangeOnly,
  n,
  errorDeg,
  range: r,
  mapping,
});

const scenario = (kind: RegularTurn, key: 'gentle' | 'moderate' | 'dynamic'): TurnScenario => TURN_STYLES[kind].scenarios[key];

const both = (sources: ReadonlyArray<Source>): Partial<Record<Role, ReadonlyArray<Source>>> => ({ [Role.Outside]: sources, [Role.Inside]: sources });

export const EXAMPLES: Readonly<Record<string, ReadonlyArray<ExampleDef>>> = {
  [RegularTurn.Carving]: [
    {
      id: 'gs-fis-heinrich-2023',
      arcLoad: arcLoad({ speedMps: 12, radiusM: 10.7, slopeDeg: 12.3 }),
      indexProvenance: 'measured: heinrich-2023 ≈12 m/s, min radius ≈10.7 m, 12.3° slope (the min radius, so the turn’s peak load)',
      coordinates: {
        hip_flexion: { roles: { outside: [h23Leg('outside', 'hip_flexion', FLEX)], inside: [h23Leg('inside', 'hip_flexion', FLEX)] } },
        hip_adduction: {
          roles: { outside: [h23Leg('outside', 'hip_abduction', ABD, -1), h22('outside', 'hip_abduction', ABD, -1)], inside: [h23Leg('inside', 'hip_abduction', ABD, -1)] },
        },
        hip_rotation: {
          roles: { outside: [h23Leg('outside', 'hip_rotation', ROT), h22('outside', 'hip_rotation', ROT)], inside: [h23Leg('inside', 'hip_rotation', ROT), h22('inside', 'hip_rotation', ROT)] },
          notes: ['fasel-2017 carpet hip rotation not used: sign not stated, short skis'],
        },
        knee_flexion: {
          roles: {
            outside: [h23Leg('outside', 'knee_flexion', FLEX), h22('outside', 'knee_flexion', FLEX), kroll('gs_carving.outside.knee_flexion_kroll', 'outside')],
            inside: [h23Leg('inside', 'knee_flexion', FLEX), h22('inside', 'knee_flexion', FLEX), kroll('gs_carving.inside.knee_flexion_kroll', 'inside')],
          },
        },
        ankle_dorsiflexion: {
          roles: {
            outside: [h23Leg('outside', 'ankle_dorsiflexion', 'dorsiflexion +, as ISB'), h22('outside', 'ankle_dorsiflexion', 'dorsiflexion +, as ISB')],
            inside: [h23Leg('inside', 'ankle_dorsiflexion', 'dorsiflexion +, as ISB'), h22('inside', 'ankle_dorsiflexion', 'dorsiflexion +, as ISB')],
          },
        },
        lumbar_flexion: { roles: { turn: [h23Spine('lumbar', 'flexion')] }, notes: ['fasel-2017 carpet trunk vs pelvis not used: carpet, short skis'] },
        thoracic_flexion: { roles: { turn: [h23Spine('thoracic', 'flexion')] } },
        lumbar_bending: { roles: { turn: [h23Spine('lumbar', 'bending')] } },
        thoracic_bending: { roles: { turn: [h23Spine('thoracic', 'bending')] } },
        lumbar_rotation: { roles: { turn: [h23Spine('lumbar', 'rotation')] } },
        thoracic_rotation: { roles: { turn: [h23Spine('thoracic', 'rotation')] } },
      },
    },
  ],
  [RegularTurn.ShortTurns]: [
    {
      id: 'short-sl-kroll-2015-and-reilly',
      arcLoad: arcLoad(scenario(RegularTurn.ShortTurns, 'dynamic')),
      indexProvenance: 'inferred: the drill’s dynamic scenario (an SL racer and an instructor’s dynamic demo; neither source gives speed and radius)',
      coordinates: {
        knee_flexion: {
          roles: {
            outside: [kroll('slalom.outside.knee_flexion', 'outside'), reilly('knee_outside')],
            inside: [kroll('slalom.inside.knee_flexion', 'inside', [0, 0.55]), reilly('knee_inside')],
          },
          notes: ['footage outside/inside split from the near ski (lead-footage/notes.md); the straighter mid-turn knee disagrees in 2 of 3 turns, so the split is uncertain'],
        },
        hip_flexion: { roles: { outside: [reilly('trunk_thigh_outside')], inside: [reilly('trunk_thigh_inside')] } },
      },
    },
  ],
  [RegularTurn.Cruising]: [
    {
      id: 'medium-intermediate-gao-2025',
      arcLoad: arcLoad({ ...scenario(RegularTurn.Cruising, 'moderate'), speedMps: 11.5, radiusM: 17.6 }),
      indexProvenance: 'gao-2025 11.5 m/s and r 17.6 m measured; slope the drill’s moderate one (inferred)',
      coordinates: {
        hip_rotation: { roles: { outside: [range('gao-2025', 'outside hip rotation, one intermediate', [-4, 10], 'range-only (eye, Fig 5)', 3, ROT)] } },
        hip_adduction: { roles: { outside: [range('gao-2025', 'outside hip abduction ≈20', [-20, -20], 'range-only (eye, Fig 5)', 5, ABD)] } },
        knee_flexion: {
          roles: { outside: [range('gao-2025', 'knee flexion 40–67 right / 40–80 left; which leg is outside is not read', [40, 80], 'range-only (eye, Fig 5)', 5, FLEX)] },
        },
      },
    },
  ],
  [RegularTurn.Moguls]: [
    {
      id: 'moguls-elite-ranges',
      arcLoad: arcLoad(scenario(RegularTurn.Moguls, 'dynamic')),
      indexProvenance: 'inferred: the drill’s dynamic scenario (elite and WC skiers)',
      coordinates: {
        knee_flexion: {
          roles: both([range('ando-2024', 'knee 20–120 from max extension (horishima-2019 thesis)', [20, 120], 'range-only', 5, FLEX)]),
          notes: ['no outside/inside split', 'riku-2007: 50–60° change per turn (both knees, 6 WC/EC); an amplitude check, not fitted'],
        },
        ankle_dorsiflexion: {
          roles: both([range('arndt-1992', 'ankle ≈10 → 45, left leg, 3 elite', [10, 45], 'range-only measured (pp67-68)', 5, 'dorsiflexion +, as ISB', 3)]),
          notes: ['impact-referenced, left leg only: no outside/inside split'],
        },
        hip_flexion: { roles: {}, notes: ['arndt-1992 p78: to ≈130 at peak absorption (a peak only, not fitted)'] },
      },
    },
  ],
};

/** Drills that ski another's turn closely enough to borrow its sources. */
export const ALIASES: Readonly<Record<string, { readonly from: string; readonly why: string }>> = {
  'turns-on-the-tops': { from: RegularTurn.Moguls, why: 'inferred: a mogul line; no source measures it alone' },
  'round-line': { from: RegularTurn.Moguls, why: 'inferred: a mogul line; no source measures it alone' },
  'closed-stance-short-turns': { from: RegularTurn.ShortTurns, why: 'inferred: short turns with the feet closer; no source measures it alone' },
};

/** Turning drills with no source: every coordinate neutral. */
export const NEUTRAL_DRILLS: ReadonlyArray<string> = [RegularTurn.Steeps, RegularTurn.Powder, 'stork-turns', 'dolphin-turns'];

// --- Combination and fitting ---------------------------------------------------------------------

export const limitDeg = (base: string): readonly [number, number] => {
  const l = JOINT_LIMITS[parityOf(`${base}.R`) === Parity.Sided && JOINT_LIMITS[`${base}.R`] !== undefined ? `${base}.R` : base];
  if (l === undefined) throw new Error(`no limit for ${base}`);
  return [l.lower.value / DEG, l.upper.value / DEG];
};

export const isSided = (base: string): boolean => JOINT_LIMITS[`${base}.R`] !== undefined;
const isRoot = (base: string): boolean => base.startsWith('pelvis_');
const isLocked = (base: string): boolean => base === 'subtalar_inversion';

export const PHI: ReadonlyArray<number> = Array.from({ length: GRID }, (_, j) => j / GRID);
/** The grid with φ = 1 as well: the seam blend needs each turn's end. */
export const CLOSED: ReadonlyArray<number> = [...PHI, 1];

const sourceValues = (s: CurveSource): ReadonlyArray<number> => {
  const c = register(s.curve, s.anchors);
  return CLOSED.map((p) => (s.span === undefined || (p >= s.span[0] - 1e-9 && p <= s.span[1] + 1e-9) ? sample(c, p) : Number.NaN));
};

const mean = (xs: ReadonlyArray<number>): number => xs.reduce((a, b) => a + b, 0) / xs.length;
const sd = (xs: ReadonlyArray<number>): number => Math.sqrt(xs.reduce((a, x) => a + (x - mean(xs)) ** 2, 0) / (xs.length - 1));

export interface RoleTarget {
  readonly mu: ReadonlyArray<number>;
  readonly sigma: ReadonlyArray<number>;
  readonly provenance: RoleProvenance;
}

const use = (s: Source): SourceUse => ({
  id: s.id,
  what: s.what,
  status: s.status,
  n: s.n,
  errorDeg: s.errorDeg,
  mapping: s.mapping,
  warp: isCurve(s) ? s.warp : 'none: a range has no timing',
});

const STRENGTH: ReadonlyArray<Evidence> = [Evidence.Measured, Evidence.Digitised, Evidence.EyeRead, Evidence.Footage, Evidence.RangeOnly];

/** μ and σ on the phase grid from one role's sources; ranges take the curves' shape, rescaled to the range. */
export const combine = (sources: ReadonlyArray<Source>, limits: readonly [number, number]): RoleTarget => {
  if (sources.length === 0) {
    const [lo, hi] = limits;
    return { mu: CLOSED.map(() => (lo + hi) / 2), sigma: CLOSED.map(() => (hi - lo) / 4), provenance: { evidence: Evidence.Neutral, sigma: SigmaFrom.Neutral, sources: [] } };
  }
  const curves = sources.filter(isCurve).map(sourceValues);
  const shape = CLOSED.map((_, j) => {
    const xs = curves.map((c) => c[j] ?? Number.NaN).filter(Number.isFinite);
    return xs.length === 0 ? 0 : mean(xs);
  });
  const [smin, smax] = [Math.min(...shape), Math.max(...shape)];
  const rows = sources.map((s, i) => {
    if (isCurve(s)) return curves[sources.slice(0, i).filter(isCurve).length] ?? [];
    const [lo, hi] = s.range;
    return shape.map((v) => (smax > smin ? lo + ((v - smin) * (hi - lo)) / (smax - smin) : (lo + hi) / 2));
  });
  const err = Math.max(...sources.map((s) => s.errorDeg));
  const single = sources.length === 1;
  const only = sources[0];
  const rangeSigma = only !== undefined && !isCurve(only) ? (only.range[1] - only.range[0]) / 4 : 0;
  const mu: number[] = [];
  const sigma: number[] = [];
  let between = 0;
  CLOSED.forEach((_, j) => {
    const xs = rows.map((r) => r[j] ?? Number.NaN).filter(Number.isFinite);
    mu.push(mean(xs));
    if (xs.length >= 2) {
      between++;
      sigma.push(Math.max(sd(xs), err, SIGMA_FLOOR));
    } else sigma.push(Math.max(SINGLE_WIDE, err, rangeSigma));
  });
  const evidence = STRENGTH.find((e) => sources.some((s) => s.evidence === e)) ?? Evidence.Inferred;
  const sigmaFrom = single ? (rangeSigma >= SINGLE_WIDE ? SigmaFrom.Range : SigmaFrom.SingleSourceWide) : between === CLOSED.length ? SigmaFrom.BetweenSources : SigmaFrom.SingleSourceWide;
  return { mu, sigma, provenance: { evidence, sigma: sigmaFrom, sources: sources.map(use) } };
};

/** Half-width of the seam blend: the transition phase, edge change to initiation. */
export const SEAM = PHASE_T.initiation;
const smooth = (x: number): number => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));

export interface CycleSamples {
  readonly omega: number[];
  readonly mu: number[];
  readonly sigma: number[];
  /** μ before the seam blend. */
  readonly raw: number[];
  /** How far the seam blend moved μ: half the sources' own mismatch across the edge change. */
  readonly blend: number[];
}

/**
 * The coordinate's cycle samples: a sided one's right leg is outside in turn 0 and inside in turn 1.
 * Where one turn's end doesn't meet the next turn's start (windows not switch to switch, roles from
 * different sources), both sides of the edge change are blended to the midpoint and σ widened by it.
 */
export const cycleSamples = (base: string, targets: Readonly<Partial<Record<Role, RoleTarget>>>): CycleSamples => {
  const out: CycleSamples = { omega: [], mu: [], sigma: [], raw: [], blend: [] };
  const sided = isSided(base);
  const segs = (sided ? [targets[Role.Outside], targets[Role.Inside]] : [targets[Role.Turn]]).filter((t): t is RoleTarget => t !== undefined);
  const sign = !sided && parityOf(base) === Parity.Odd ? -1 : 1;
  segs.forEach((t, i) => {
    const other = segs[(i + 1) % segs.length] ?? t;
    const s = sided ? 1 : sign;
    const dEnd = s * (other.mu[0] ?? 0) - (t.mu[GRID] ?? 0);
    const dStart = (t.mu[0] ?? 0) - s * (other.mu[GRID] ?? 0);
    PHI.forEach((p, j) => {
      const b = (dEnd / 2) * smooth((p - (1 - SEAM)) / SEAM) - (dStart / 2) * smooth((SEAM - p) / SEAM);
      const raw = t.mu[j] ?? 0;
      out.omega.push(Math.PI * (p + i));
      out.raw.push(raw);
      out.mu.push(raw + b);
      out.blend.push(Math.abs(b));
      out.sigma.push(Math.hypot(t.sigma[j] ?? 0, b));
    });
  });
  return out;
};

export const ROOT_NOTE = 'root pose: placed by the ski and balance constraints; a prior here would target derived outputs (list, lead, comAhead)';

export const buildCoordinate = (base: string, def: CoordinateDef | undefined): CoordinatePrior => {
  const parity = isSided(base) ? Parity.Sided : parityOf(base);
  if (isRoot(base)) return { parity, mu: null, logSigma: null, provenance: { roles: { turn: { evidence: Evidence.None, sigma: null, sources: [] } }, notes: [ROOT_NOTE] } };
  if (isLocked(base)) {
    return { parity, mu: null, logSigma: null, provenance: { roles: { outside: { evidence: Evidence.Locked, sigma: null, sources: [] }, inside: { evidence: Evidence.Locked, sigma: null, sources: [] } }, notes: ['held by the boot'] } };
  }
  const limits = limitDeg(base);
  const roles: ReadonlyArray<Role> = isSided(base) ? [Role.Outside, Role.Inside] : [Role.Turn];
  const targets = Object.fromEntries(roles.map((r) => [r, combine(def?.roles[r] ?? [], limits)])) as Partial<Record<Role, RoleTarget>>;
  const c = cycleSamples(base, targets);
  const sigmaParity = parity === Parity.Sided ? Parity.Sided : Parity.Even;
  return {
    parity,
    mu: fitSeries(c.omega, c.mu, parity, MU_ORDER),
    logSigma: fitSeries(c.omega, c.sigma.map(Math.log), sigmaParity, SIGMA_ORDER),
    provenance: { roles: Object.fromEntries(roles.map((r) => [r, targets[r]?.provenance])), notes: def?.notes ?? (def === undefined ? ['no source: weak neutral prior (μ mid-range, ±2σ the joint limits)'] : []) },
  };
};

const names = (base: string): ReadonlyArray<string> => (isSided(base) ? [`${base}.R`, `${base}.L`] : [base]);

const r = (x: number, d = 10): number => Math.round(x * d) / d;

/** Runs of grid phases where μ ± σ passes a joint limit, with the worst value; reported, never clipped. Turn 1 mirrors turn 0. */
export const limitFlags = (coordinates: Readonly<Record<string, CoordinatePrior>>): LimitFlag[] => {
  const out: LimitFlag[] = [];
  for (const [base, c] of Object.entries(coordinates)) {
    if (c.mu === null) continue;
    const [lo, hi] = limitDeg(base);
    for (const name of names(base))
      for (const [side, bound] of [[-1, lo], [1, hi]] as const) {
        let run: { from: number; to: number; worst: number } | null = null;
        const close = (): void => {
          if (run !== null) out.push({ coordinate: name, phi: [r(run.from, 1000), r(run.to, 1000)], value: r(run.worst), bound: r(bound) });
          run = null;
        };
        for (const p of PHI) {
          const v = evalDeg(c, name, p);
          const x = v === null ? Number.NaN : v.mu + side * v.sigma;
          if (!(side * (x - bound) > 0)) {
            close();
            continue;
          }
          run = run === null ? { from: p, to: p, worst: x } : { from: run.from, to: p, worst: side * x > side * run.worst ? x : run.worst };
        }
        close();
      }
  }
  return out;
};

export const buildExample = (def: ExampleDef): Example => {
  const coordinates = Object.fromEntries(BASE_NAMES.map((b) => [b, buildCoordinate(b, def.coordinates[b])]));
  return { id: def.id, arcLoad: Math.round(def.arcLoad * 1e4) / 1e4, indexProvenance: def.indexProvenance, coordinates, limitFlags: limitFlags(coordinates) };
};

const NEUTRAL_EXAMPLE: ExampleDef = { id: 'neutral', arcLoad: 1, indexProvenance: 'one neutral example: the index is unused', coordinates: {} };

export const buildPriors = (): PriorFile => {
  const drills: Record<string, Partial<Record<EdgeChange, ReadonlyArray<Example>>>> = {};
  for (const [drill, defs] of Object.entries(EXAMPLES)) drills[drill] = { [EdgeChange.Unstated]: defs.map(buildExample) };
  for (const drill of NEUTRAL_DRILLS) drills[drill] = { [EdgeChange.Unstated]: [buildExample(NEUTRAL_EXAMPLE)] };
  const turns = REILLY.turns;
  return {
    unit: 'deg',
    turn0: 'a left turn, the right leg outside; ω = π(φ + turn), the left side half a cycle later',
    drills,
    aliases: ALIASES,
    evidence: {
      note: 'Range and timing evidence for derived outputs: never prior terms.',
      'regular-short-turns.trunk_pitch_vs_image_vertical': {
        source: REILLY.clip,
        status: 'footage, image-plane; the camera is not level with the snow, so only the range and timing hold',
        phi: REILLY.phi,
        turns: turns.map((t) => t.trunk_pitch),
      },
      edge_change_style: 'No source states cross-over or cross-under; every example is style-unstated and serves both.',
    },
  };
};

// Number arrays on one line; the rest indented.
export const format = (x: unknown): string => `${JSON.stringify(x, null, 1).replace(/\[\n\s*(-?[\d.e+-]+(?:,\n\s*-?[\d.e+-]+)*)\n\s*\]/g, (_, body: string) => `[${body.replace(/,\n\s*/g, ', ')}]`)}\n`;

if (import.meta.main) {
  const text = format(buildPriors());
  if (process.argv.includes('--check')) {
    if (readFileSync(PRIORS_FILE, 'utf8') !== text) {
      console.error('priors.json is stale: run bun run priors');
      process.exit(1);
    }
  } else writeFileSync(PRIORS_FILE, text);
}
