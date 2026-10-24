import { COORDINATES } from '../skeleton';
import PRIORS from './priors.json';

/**
 * Motion priors per drill and edge-change style: for each skeleton coordinate a low-order Fourier
 * series of the mean μ and of ln σ over the turn phase φ ∈ [0, 1) (0 edge change, ½ fall line).
 * Turn 0 is a left turn, the right leg outside; the series run over the two-turn cycle ω = π(φ + n),
 * so the next turn is the mirror of this one by construction. Values in degrees, read out in radians.
 */

/** How a coordinate maps onto the next turn. */
export const Parity = {
  /** The same every turn (flexion, tilt). */
  Even: 'even',
  /** Negated every turn (bending, axial rotation). */
  Odd: 'odd',
  /** One series for the right side; the left side runs half a cycle (one turn) later. */
  Sided: 'sided',
} as const;
export type Parity = (typeof Parity)[keyof typeof Parity];

export const EdgeChange = { CrossOver: 'cross-over', CrossUnder: 'cross-under', Unstated: 'unstated' } as const;
export type EdgeChange = (typeof EdgeChange)[keyof typeof EdgeChange];

/** a0 + Σ cos[k-1]·cos(kω) + sin[k-1]·sin(kω); terms the parity forbids (an odd a0) are ignored. */
export interface Series {
  readonly a0: number;
  readonly cos: ReadonlyArray<number>;
  readonly sin: ReadonlyArray<number>;
}

/** The strongest evidence behind a role, in falling order. */
export const Evidence = {
  Measured: 'measured',
  Digitised: 'digitised',
  EyeRead: 'eye-read',
  Footage: 'footage',
  RangeOnly: 'range-only',
  Inferred: 'inferred',
  Neutral: 'neutral',
  /** Placed by the constraints: the root pose, which would otherwise target derived outputs. */
  None: 'none',
  Locked: 'locked',
} as const;
export type Evidence = (typeof Evidence)[keyof typeof Evidence];

export const SigmaFrom = { BetweenSources: 'between-sources', SingleSourceWide: 'single-source-wide', SourceSd: 'source-sd', Range: 'range', Neutral: 'neutral' } as const;
export type SigmaFrom = (typeof SigmaFrom)[keyof typeof SigmaFrom];

export interface SourceUse {
  /** A sources.yaml id, or a footage id. */
  readonly id: string;
  readonly what: string;
  readonly status: string;
  readonly n: number;
  readonly errorDeg: number;
  /** The source's angle convention onto the ISB coordinate. */
  readonly mapping: string;
  /** How a measured source was taken, e.g. video-3d (SAM 3D Body). */
  readonly method?: string;
  /** The transition style the source shows; absent = unstated. */
  readonly style?: EdgeChange;
  /** Time warp onto the phase events. */
  readonly warp: string;
}

/** Outside or inside leg for a sided coordinate, the turn for an unsided one. */
export const Role = { Outside: 'outside', Inside: 'inside', Turn: 'turn' } as const;
export type Role = (typeof Role)[keyof typeof Role];

export interface RoleProvenance {
  readonly evidence: Evidence;
  readonly sigma: SigmaFrom | null;
  readonly sources: ReadonlyArray<SourceUse>;
}

export interface Provenance {
  readonly roles: Readonly<Partial<Record<Role, RoleProvenance>>>;
  readonly notes: ReadonlyArray<string>;
}

export interface CoordinatePrior {
  readonly parity: Parity;
  /** Null: no prior term. */
  readonly mu: Series | null;
  readonly logSigma: Series | null;
  readonly provenance: Provenance;
}

/** μ ± σ past `bound` over turn-0 phases `phi` (from, to); turn 1 mirrors it. */
export interface LimitFlag {
  readonly coordinate: string;
  readonly phi: readonly [number, number];
  readonly value: number;
  readonly bound: number;
}

export interface Example {
  readonly id: string;
  /** Interpolation key: the turn's fall-line load (turn.ts arcLoad). */
  readonly arcLoad: number;
  /** Balance-axis lean at the fall line, degrees (§4.1): the odd harmonics' scale below the lightest example. */
  readonly lean: number;
  readonly indexProvenance: string;
  /** Keyed by coordinate base name (without the side). */
  readonly coordinates: Readonly<Record<string, CoordinatePrior>>;
  /** Measured derived quantities (Derived), each a soft per-frame target. */
  readonly derived?: Readonly<Record<string, CoordinatePrior>>;
  /** μ ± σ past a joint limit; kept, not clipped. */
  readonly limitFlags: ReadonlyArray<LimitFlag>;
}

export interface PriorFile {
  readonly unit: string;
  readonly turn0: string;
  readonly drills: Readonly<Record<string, Readonly<Partial<Record<EdgeChange, ReadonlyArray<Example>>>>>>;
  /** Drills that borrow another drill's examples, and why. */
  readonly aliases: Readonly<Record<string, { readonly from: string; readonly why: string }>>;
  readonly evidence: Readonly<Record<string, unknown>>;
  /** Canonical event phases per drill whose sources time them; absent: the fall line alone registers. */
  readonly events?: Readonly<Record<string, PhaseAnchors>>;
}

/** A drill's canonical event phases φ on the prior's axis (the fall line at ½); a missing event has no anchor. */
export interface PhaseAnchors {
  readonly engagement?: number;
  readonly fallLine: number;
  readonly forcePeak?: number;
  readonly release?: number;
  readonly sources: ReadonlyArray<string>;
}

/** The cell's events, turn time in [0, 1). */
export interface CellEvents {
  readonly engagement: number;
  readonly fallLine: number;
  readonly forcePeak: number;
  readonly release: number;
}

/** The map's (t, φ) pairs in t order and the anchors dropped for breaking monotonicity. */
export interface PhaseMap {
  readonly pairs: ReadonlyArray<readonly [number, number]>;
  readonly dropped: ReadonlyArray<string>;
}

const OPTIONAL = ['engagement', 'forcePeak', 'release'] as const;

/** (0, 0), (fallLine, ½), (1, 1), plus each canonical anchor that keeps both axes strictly increasing. */
export const phaseMapOf = (anchors: PhaseAnchors | null, events: CellEvents): PhaseMap => {
  const pairs: Array<readonly [number, number]> = [[0, 0], [events.fallLine, 0.5], [1, 1]];
  const dropped: string[] = [];
  for (const name of OPTIONAL) {
    const phi = anchors?.[name];
    if (phi === undefined) continue;
    const t = events[name];
    if (pairs.every(([t0, p0]) => Math.sign(t - t0) === Math.sign(phi - p0) && t !== t0)) pairs.push([t, phi]);
    else dropped.push(name);
  }
  pairs.sort((a, b) => a[0] - b[0]);
  return { pairs, dropped };
};

/** Piecewise linear through the map's pairs: the cell's turn time `t` onto the prior phase φ. */
export const phaseOn = (map: PhaseMap, t: number): number => {
  const u = ((t % 1) + 1) % 1;
  const { pairs } = map;
  const i = Math.max(0, Math.min(pairs.length - 2, pairs.findIndex(([x]) => x > u) - 1));
  const [t0, p0] = pairs[i] ?? [0, 0];
  const [t1, p1] = pairs[i + 1] ?? [1, 1];
  return p0 + ((p1 - p0) * (u - t0)) / (t1 - t0);
};

/** The cell's turn time `t` registered to the prior's phase by the events (motion-model §9 F). */
export const phaseAt = (anchors: PhaseAnchors | null, events: CellEvents, t: number): number => phaseOn(phaseMapOf(anchors, events), t);

/** The drill's canonical anchors, through its alias; null when its sources time no event. */
export const anchorsFor = (drill: string, file: PriorFile = PRIOR_FILE): PhaseAnchors | null => file.events?.[file.aliases[drill]?.from ?? drill] ?? file.events?.[drill] ?? null;

export const PRIOR_FILE = PRIORS as unknown as PriorFile;

const DEG = Math.PI / 180;
const ODD_NAMES = /^(pelvis_list|pelvis_rotation|pelvis_tx|(lumbar|thoracic|neck)_(bending|rotation))$/;

export const baseName = (name: string): string => name.replace(/\.[RL]$/, '');

export const parityOf = (name: string): Parity => {
  if (/\.[RL]$/.test(name)) return Parity.Sided;
  return ODD_NAMES.test(name) ? Parity.Odd : Parity.Even;
};

/** Base names in COORDINATES order. */
export const BASE_NAMES: ReadonlyArray<string> = [...new Set(COORDINATES.map((c) => baseName(c.name)))];

const allowed = (parity: Parity, k: number): boolean => parity === Parity.Sided || (parity === Parity.Even) === (k % 2 === 0);

export const evalSeries = (s: Series, parity: Parity, omega: number): number => {
  let v = parity === Parity.Odd ? 0 : s.a0;
  for (let i = 0; i < Math.max(s.cos.length, s.sin.length); i++) {
    const k = i + 1;
    if (!allowed(parity, k)) continue;
    v += (s.cos[i] ?? 0) * Math.cos(k * omega) + (s.sin[i] ?? 0) * Math.sin(k * omega);
  }
  return v;
};

/** Cycle angle of coordinate `name` at phase `phi` of turn `turn` (even turns are left turns). */
export const omegaOf = (name: string, phi: number, turn = 0): number => Math.PI * (phi + turn + (name.endsWith('.L') ? 1 : 0));

/** μ and σ in degrees, or null where the coordinate has no prior term. */
export const evalDeg = (c: CoordinatePrior, name: string, phi: number, turn = 0): { readonly mu: number; readonly sigma: number } | null => {
  if (c.mu === null || c.logSigma === null) return null;
  const w = omegaOf(name, phi, turn);
  // σ follows the side, not the sign: an odd coordinate's spread is the same every turn.
  return { mu: evalSeries(c.mu, c.parity, w), sigma: Math.exp(evalSeries(c.logSigma, c.parity === Parity.Sided ? Parity.Sided : Parity.Even, w)) };
};

/** The coordinate's mirror image in the next turn: sides swapped, odd coordinates negated. */
export const mirrorName = (name: string): string => (name.endsWith('.R') ? `${baseName(name)}.L` : name.endsWith('.L') ? `${baseName(name)}.R` : name);

/** Derived quantities a prior may target; turn.ts computes each from the pose. */
export const Derived = {
  /** Pelvis origin → neck origin vs the mean ski-base normal, in the plane of the mean ski axis, + forward. */
  TrunkPitch: 'trunk_pitch',
  /** Pelvis origin → neck origin off gravity up. */
  TrunkGravity: 'trunk_gravity',
  /** The same in the plane of gravity up and the across-heading axis, + toward the turn's inside. */
  TrunkAcross: 'trunk_across',
} as const;
export type Derived = (typeof Derived)[keyof typeof Derived];

export interface PriorAt {
  readonly coordinates: Readonly<Record<string, CoordinatePrior>>;
  readonly derived: Readonly<Record<string, CoordinatePrior>>;
  /** The examples blended, and the weight of the second. */
  readonly between: readonly [string, string];
  readonly weight: number;
  /** The arcLoad used: the query held to the examples' range. */
  readonly arcLoad: number;
  /** Factor on every μ's odd harmonics: λ_cell / λ_example below the lightest example, else 1. */
  readonly scale: number;
}

/** Balance-axis lean from the slope normal at the fall line, degrees: there the load is cos θ / cos λ (§4.1). */
export const fallLineLean = (load: number, slopeDeg: number): number => Math.acos(Math.min(1, Math.cos(slopeDeg * DEG) / load)) / DEG;

const at = (x: ReadonlyArray<number>, i: number): number => x[i] ?? 0;

const lerpSeries = (a: Series, b: Series, w: number): Series => {
  const n = (k: 'cos' | 'sin'): number => Math.max(a[k].length, b[k].length);
  return {
    a0: a.a0 + (b.a0 - a.a0) * w,
    cos: Array.from({ length: n('cos') }, (_, i) => at(a.cos, i) + (at(b.cos, i) - at(a.cos, i)) * w),
    sin: Array.from({ length: n('sin') }, (_, i) => at(a.sin, i) + (at(b.sin, i) - at(a.sin, i)) * w),
  };
};

const lerpPrior = (a: CoordinatePrior, b: CoordinatePrior, w: number): CoordinatePrior => {
  if (w === 0) return a;
  if (w === 1) return b;
  if (a.mu === null || b.mu === null || a.logSigma === null || b.logSigma === null) return w < 0.5 ? a : b;
  return { parity: a.parity, mu: lerpSeries(a.mu, b.mu, w), logSigma: lerpSeries(a.logSigma, b.logSigma, w), provenance: w < 0.5 ? a.provenance : b.provenance };
};

// The side-against-side part (odd k) flips with the turn, so it is odd in the lean; even k and σ are shared.
const oddScaled = (s: Series, f: number): Series => ({ a0: s.a0, cos: s.cos.map((v, i) => (i % 2 === 0 ? v * f : v)), sin: s.sin.map((v, i) => (i % 2 === 0 ? v * f : v)) });

// Derived quantities signed toward the turn's inside: the whole μ flips with the turn, so a0 scales too.
export const WHOLE_SCALED_DERIVED: ReadonlySet<string> = new Set([Derived.TrunkAcross]);

const wholeScaled = (s: Series, f: number): Series => ({ a0: s.a0 * f, cos: s.cos.map((v) => v * f), sin: s.sin.map((v) => v * f) });

const leanScaled = (c: CoordinatePrior, f: number, whole = false): CoordinatePrior =>
  f === 1 || c.mu === null ? c : { ...c, mu: whole ? wholeScaled(c.mu, f) : oddScaled(c.mu, f) };

/**
 * Linear between the two examples around `arcLoad`. Above the heaviest it holds: this selects the input,
 * it doesn't clamp an output, and the constraints carry the change beyond it. Below the lightest, its μ odd
 * harmonics (the whole μ of WHOLE_SCALED_DERIVED) scale by the fall-line leans `lean / λ_example` in [0, 1] (motion-model §5).
 */
export const interpolate = (examples: ReadonlyArray<Example>, arcLoad: number, lean: number): PriorAt => {
  const sorted = examples.toSorted((x, y) => x.arcLoad - y.arcLoad);
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  if (first === undefined || last === undefined) throw new Error('no examples');
  const x = Math.min(last.arcLoad, Math.max(first.arcLoad, arcLoad));
  let i = 0;
  while (i < sorted.length - 2 && x > (sorted[i + 1]?.arcLoad ?? Number.POSITIVE_INFINITY)) i++;
  const a = sorted[i] ?? first;
  const b = sorted[i + 1] ?? a;
  const w = b.arcLoad > a.arcLoad ? (x - a.arcLoad) / (b.arcLoad - a.arcLoad) : 0;
  const f = arcLoad < first.arcLoad && lean < first.lean ? Math.max(0, lean / first.lean) : 1;
  const coordinates = Object.fromEntries(Object.entries(a.coordinates).map(([k, c]) => [k, leanScaled(lerpPrior(c, b.coordinates[k] ?? c, w), f)]));
  const derived = Object.fromEntries(Object.entries(a.derived ?? {}).map(([k, c]) => [k, leanScaled(lerpPrior(c, b.derived?.[k] ?? c, w), f, WHOLE_SCALED_DERIVED.has(k))]));
  return { coordinates, derived, between: [a.id, b.id], weight: w, arcLoad: x, scale: f };
};

/** The drill's examples for the style, else the style-unstated ones. */
export const examplesFor = (drill: string, style: EdgeChange = EdgeChange.Unstated, file: PriorFile = PRIOR_FILE): ReadonlyArray<Example> | null => {
  const sets = file.drills[file.aliases[drill]?.from ?? drill];
  return sets?.[style] ?? sets?.[EdgeChange.Unstated] ?? null;
};

/** μ and σ in radians for a skeleton coordinate, or null where it has no prior term. */
export const priorAt = (prior: PriorAt, name: string, phi: number, turn = 0): { readonly mu: number; readonly sigma: number } | null => {
  const c = prior.coordinates[baseName(name)];
  const v = c === undefined ? null : evalDeg(c, name, phi, turn);
  return v === null ? null : { mu: v.mu * DEG, sigma: v.sigma * DEG };
};

/** μ and σ in radians for a derived quantity, or null where the drill has none. */
export const derivedAt = (prior: PriorAt, name: Derived, phi: number, turn = 0): { readonly mu: number; readonly sigma: number } | null => {
  const c = prior.derived[name];
  const v = c === undefined ? null : evalDeg(c, name, phi, turn);
  return v === null ? null : { mu: v.mu * DEG, sigma: v.sigma * DEG };
};
