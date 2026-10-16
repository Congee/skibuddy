import { Intensity } from '../../content/schema';
import { phaseForces, turnForcesAt } from '../../physics/turn';
import type { TurnScenarios } from '../../physics/turn';
import type { PoseDefinition, PoseKey } from '../pose-definition';

const DEG = Math.PI / 180;
// 5 deg of shin moves the mass about 7.6 cm with the other joints held (lemaster-2010 p58).
const SHIN_TRAVEL = 0.076 / 5;

/** The kinds of skiing a regular two-footed turn is shown for; each is a pose id. */
export const RegularTurn = {
  Cruising: 'regular-cruising',
  Carving: 'regular-carving',
  ShortTurns: 'regular-short-turns',
  Moguls: 'regular-moguls',
  Steeps: 'regular-steeps',
  Powder: 'regular-powder',
} as const;
export type RegularTurn = (typeof RegularTurn)[keyof typeof RegularTurn];

/** How one kind of skiing turns: data only, read by `regularTurn`. Angles in degrees. */
export interface TurnStyle {
  readonly scenarios: TurnScenarios;
  /** Outside foot's share of the load mid-turn, gentle and dynamic; moderate is between. */
  readonly outsideShare: readonly [number, number];
  /** Outside hip flexion at moderate: most extended (shaping) and deepest (transition). */
  readonly hip: readonly [number, number];
  /** Degrees both hip ends deepen per step of intensity. */
  readonly hipStep: number;
  /** Peak hip angulation and the outside femur's rotation into the turn. */
  readonly angulation: number;
  /** Peak pelvis turn toward the outside of the turn, relative to the skis, and the chest turned further beyond it. */
  readonly counter: number;
  readonly twist: number;
  /** Share of the peak counter and twist at each phase key. */
  readonly counterCurve: PhaseValues;
  /** Trunk bent toward the outside ski at shaping. */
  readonly bend: number;
  /** Outside ankle dorsiflexion at shaping. */
  readonly dorsiflexion: number;
  /** Degrees off `dorsiflexion` at each phase key: shin into the tongue to load the tip, opened to use the tail. */
  readonly ankle: PhaseValues;
  /** Low back flexed on the pelvis at moderate intensity; racers measure 11-27 deg (sporri-2016). */
  readonly spineFlex: number;
  /** Thighs drawn toward each other: a narrower stance than hip width. */
  readonly narrow: number;
  /** Both femurs turned inward, so the knees meet while the boots stay apart. */
  readonly kneesIn: number;
  /** Mass ahead of the outside mid-foot at shaping, metres. */
  readonly comAhead: number;
  /** Share of the peak angulation already in at the initiation key: feet and knees tip the new edges early. */
  readonly early: number;
  /** A pole plant at the transition. */
  readonly polePlant: boolean;
  /** Poles this many metres shorter than regular. */
  readonly poleTrim: number;
}

/** One value per phase key, in PHASES order. */
export type PhaseValues = readonly [number, number, number, number, number];

// Carving scenarios as long-radius-carved-turns; short-turn ones as short-radius-turns.
const LONG: TurnScenarios = {
  gentle: { speedMps: 9, radiusM: 17, slopeDeg: 10 },
  moderate: { speedMps: 11, radiusM: 14, slopeDeg: 14 },
  dynamic: { speedMps: 12, radiusM: 11, slopeDeg: 18 },
};
// The trunk follows the skis: counter builds to late shaping and eases off through completion (lemaster-2010 p128).
const FOLLOW: PhaseValues = [0, 0.5, 0.9, 1, 0.4];
// The trunk faces the fall line, so counter tracks the skis' heading off it: most at the edge set (lemaster-2010 pp74, 128).
const SWIVEL: PhaseValues = [0, 0.3, 0.8, 0.94, 1];
// Pelvis counter at the finish: short turns 30-40 deg, low confidence (biomechanics.md D12); the spine adds 5-8 (sporri-2016).
const SHORT_COUNTER = 35;
// In moguls the chest faces the fall line (fis-freestyle-judging-2025 p29, dipiro-2005 p32), so pelvis counter plus twist
// is the skis' heading off it, 0 at the transition; the pelvis trails the chest by about 5 deg (sporri-2016, lemaster-2010 p73).
const MOGUL_TWIST = 5;
// An arc of radius r from the fall line across half a corridor w heads acos(1 - w/2r) off it, up to the hips' rotation range.
const fallLineHeading = (r: number, w: number): number => Math.min(45, Math.acos(1 - w / (2 * r)) / DEG);
// Constant turn rate: the heading grows as t / (5/6) to the finish key.
const HEADING: PhaseValues = [0, 0.2, 0.6, 0.78, 1];

const SHORT: TurnScenarios = {
  gentle: { speedMps: 6, radiusM: 6, slopeDeg: 12 },
  moderate: { speedMps: 7, radiusM: 6, slopeDeg: 15 },
  dynamic: { speedMps: 9, radiusM: 7, slopeDeg: 20 },
};

/**
 * Per kind. Trunk 20-35 deg forward of vertical: outside hip flexion peaks at 55-65 deg (gao-2024). Outside knee about 30-45 deg in recreational turns (video reference), deeper only
 * when moguls absorb; outside share 0.6 gentle to 0.85 dynamic (heinrich-2022), powder near even.
 */
export const TURN_STYLES: Readonly<Record<RegularTurn, TurnStyle>> = {
  // Skidded and tall: less edge, less speed.
  [RegularTurn.Cruising]: {
    scenarios: {
      gentle: { speedMps: 7, radiusM: 16, slopeDeg: 10 },
      moderate: { speedMps: 8.5, radiusM: 14, slopeDeg: 13 },
      dynamic: { speedMps: 10, radiusM: 13, slopeDeg: 16 },
    },
    outsideShare: [0.6, 0.75],
    hip: [32, 38],
    hipStep: 2,
    angulation: 5,
    // Between carving and short turns; inferred.
    counter: 12,
    twist: 2,
    counterCurve: FOLLOW,
    bend: 2,
    dorsiflexion: 13,
    ankle: [0, 1, 0, 0, -1],
    spineFlex: 20,
    narrow: 0,
    kneesIn: 0,
    comAhead: 0.05,
    early: 0.4,
    polePlant: false,
    poleTrim: 0,
  },
  // High edge, long outside leg, angulation from the hip.
  [RegularTurn.Carving]: {
    scenarios: LONG,
    outsideShare: [0.65, 0.88],
    hip: [32, 38],
    hipStep: 2,
    angulation: 12,
    // Slight, from the strong inside half; the trunk turns with the skis (debertin-2022, biomechanics.md D13).
    counter: 5,
    twist: 1,
    counterCurve: FOLLOW,
    bend: 6,
    dorsiflexion: 14,
    ankle: [-1, 4, 2, 0, -2],
    spineFlex: 21,
    narrow: 0,
    kneesIn: 0,
    comAhead: 0.08,
    early: 0.65,
    polePlant: false,
    poleTrim: 0,
  },
  // Legs flex and extend under a quiet trunk square to the fall line.
  [RegularTurn.ShortTurns]: {
    scenarios: SHORT,
    outsideShare: [0.62, 0.85],
    hip: [32, 56],
    hipStep: 4,
    angulation: 9,
    counter: SHORT_COUNTER,
    twist: 5,
    counterCurve: SWIVEL,
    bend: 5,
    dorsiflexion: 15,
    ankle: [0, 3, 2, 0, -2],
    spineFlex: 22,
    narrow: 0,
    kneesIn: 0,
    comAhead: 0.06,
    early: 0.6,
    polePlant: true,
    poleTrim: 0,
  },
  // Compact; the legs fold deep over each bump at the transition.
  [RegularTurn.Moguls]: {
    scenarios: {
      gentle: { speedMps: 5, radiusM: 5, slopeDeg: 15 },
      moderate: { speedMps: 6, radiusM: 5, slopeDeg: 18 },
      dynamic: { speedMps: 7.5, radiusM: 5.5, slopeDeg: 22 },
    },
    outsideShare: [0.6, 0.75],
    hip: [36, 75],
    hipStep: 5,
    angulation: 6,
    // Zipper line about 2 m wide.
    counter: fallLineHeading(5, 2) - MOGUL_TWIST,
    twist: MOGUL_TWIST,
    counterCurve: HEADING,
    bend: 3,
    dorsiflexion: 17,
    ankle: [4, 2, -1, -1, 2],
    spineFlex: 24,
    narrow: 0,
    kneesIn: 0,
    comAhead: 0.05,
    early: 0.4,
    polePlant: true,
    // Shorter for quick plants on the bumps' backs.
    poleTrim: 0.05,
  },
  // Strong counter and angulation, a firm pole plant.
  [RegularTurn.Steeps]: {
    scenarios: {
      gentle: { speedMps: 5, radiusM: 6, slopeDeg: 25 },
      moderate: { speedMps: 6, radiusM: 6, slopeDeg: 30 },
      dynamic: { speedMps: 7, radiusM: 6, slopeDeg: 35 },
    },
    outsideShare: [0.65, 0.85],
    hip: [36, 56],
    hipStep: 4,
    angulation: 14,
    // Pivoted, so near short turns; inferred.
    counter: 30,
    twist: 6,
    counterCurve: SWIVEL,
    bend: 9,
    dorsiflexion: 15,
    ankle: [-1, 4, 2, 0, -2],
    spineFlex: 24,
    narrow: 0,
    kneesIn: 0,
    comAhead: 0.06,
    early: 0.6,
    polePlant: true,
    poleTrim: 0,
  },
  // Near even weighting, a narrow stance and more up and down.
  [RegularTurn.Powder]: {
    scenarios: {
      gentle: { speedMps: 8, radiusM: 14, slopeDeg: 16 },
      moderate: { speedMps: 8.5, radiusM: 13, slopeDeg: 22 },
      dynamic: { speedMps: 10, radiusM: 12, slopeDeg: 26 },
    },
    outsideShare: [0.52, 0.6],
    hip: [28, 54],
    hipStep: 4,
    angulation: 4,
    // Rhythmic fall-line turns, rounder than short turns; inferred.
    counter: 20,
    twist: 3,
    counterCurve: SWIVEL,
    bend: 2,
    dorsiflexion: 13,
    ankle: [0, 1, 0, -1, -1],
    spineFlex: 19,
    narrow: 2,
    kneesIn: 0,
    comAhead: 0.04,
    early: 0.5,
    polePlant: true,
    poleTrim: 0,
  },
};

/**
 * Closed-stance short turns: knees and boots together, the legs swivelling under a still trunk square to the
 * fall line. Scenarios as content/drills/closed-stance-short-turns.yaml.
 */
export const CLOSED_STANCE: TurnStyle = {
  scenarios: {
    gentle: { speedMps: 5, radiusM: 4.5, slopeDeg: 14 },
    moderate: { speedMps: 6, radiusM: 4.5, slopeDeg: 17 },
    dynamic: { speedMps: 7, radiusM: 5, slopeDeg: 20 },
  },
  // Both feet share the load more evenly than in an open stance.
  outsideShare: [0.55, 0.65],
  // Little up and down: the trunk stays level.
  hip: [40, 50],
  hipStep: 3,
  angulation: 3,
  // A corridor about 2 m wide, as the drill's terrain.
  counter: fallLineHeading(4.5, 2) - MOGUL_TWIST,
  twist: MOGUL_TWIST,
  counterCurve: HEADING,
  bend: 1,
  dorsiflexion: 15,
  ankle: [0, 3, 2, 0, -2],
  spineFlex: 22,
  narrow: 7,
  kneesIn: 10,
  comAhead: 0.06,
  early: 0.6,
  polePlant: true,
  poleTrim: 0,
};

export const isRegularTurn = (id: string): id is RegularTurn => Object.hasOwn(TURN_STYLES, id);

/** The regular turn shown for a turning drill without its own pose. */
export const DEFAULT_REGULAR_TURN: RegularTurn = RegularTurn.Cruising;

/** One key of the shared turn shape: shares of each kind's peaks; `share` null takes the kind's early edge. */
interface Phase {
  readonly t: number;
  readonly share: number | null;
  readonly hip: number;
  readonly ahead: number;
}

// Flexed through the transition, longest at shaping, flexing again through the finish
// (lemaster-2010 pp40-42); edge, counter and angulation build to late shaping.
const PHASES: ReadonlyArray<Phase> = [
  { t: 0, share: 0, hip: 1, ahead: 0.5 },
  { t: 1 / 6, share: null, hip: 0.45, ahead: 1 },
  { t: 1 / 2, share: 0.9, hip: 0, ahead: 1 },
  { t: 0.65, share: 1, hip: 0.08, ahead: 0.9 },
  { t: 5 / 6, share: 0.4, hip: 0.55, ahead: 0.6 },
];

/** The kind's two-footed turn as a pose definition: both skis on the snow, the inside leg shorter. */
export const regularTurn = (style: TurnStyle): PoseDefinition => {
  const [open, deep] = style.hip;
  const step = style.hipStep;
  const load = (i: Intensity): number => phaseForces(style.scenarios[i]).shaping.load;
  return {
    keys: PHASES.map((p, i): PoseKey => {
      const share = p.share ?? style.early;
      const offset = style.ankle[i] ?? 0;
      const ankle = (style.dorsiflexion + offset) * DEG;
      return {
        t: p.t,
        angulation: share,
        hip: p.hip,
        pelvisList: 1.2 * style.angulation * share * DEG,
        lumbarFlex: style.spineFlex * DEG,
        spineBend: style.bend * share * DEG,
        spineTwist: style.twist * (style.counterCurve[i] ?? 0) * DEG,
        counter: style.counter * (style.counterCurve[i] ?? 0) * DEG,
        dorsiflexion: ankle,
        insideDorsiflexion: ankle,
        // The feet tip first, the hips follow.
        eversion: 0.2 * style.angulation * Math.sqrt(share) * DEG,
        protraction: 6 * DEG,
        elevation: 0,
        insideTailLift: 0,
        comAhead: style.comAhead * p.ahead + SHIN_TRAVEL * offset,
      };
    }),
    constraints: {
      hipAngulation: style.angulation * DEG,
      femurRotation: 0.5 * style.angulation * DEG,
      insideFemurShare: 0.8,
      hipByLoad: [
        [load(Intensity.Gentle), open - step, deep - step],
        [load(Intensity.Moderate), open, deep],
        [load(Intensity.Dynamic), open + step, deep + step],
      ],
      insideKneeMax: 120 * DEG,
      tailLift: null,
      poleTouch: style.polePlant ? { t: 1 / 24, hold: 0.02, swing: 0.11 } : null,
      scapularRhythm: 0.3,
      stance: style.narrow * DEG,
      kneesIn: style.kneesIn * DEG,
      poleTrim: style.poleTrim,
      gains: { lumbarFlex: 0.1, angulation: 0.15, eversion: 0.15, pelvisList: 0.4, counter: 0.15, spineBend: 0.15, spineTwist: 0.1 },
    },
  };
};

/** Every kind's pose definition, by pose id. */
export const REGULAR_TURNS: Readonly<Record<RegularTurn, PoseDefinition>> = Object.fromEntries(
  Object.entries(TURN_STYLES).map(([id, style]) => [id, regularTurn(style)]),
) as Record<RegularTurn, PoseDefinition>;

const STEP: Readonly<Record<Intensity, number>> = { gentle: 0, moderate: 0.5, dynamic: 1 };

/**
 * Load share of each foot at turn time `t`: even through the edge change, the outside foot's
 * share growing with the turn's tilt to the kind's mid-turn split at this intensity.
 */
export const weightSplit = (style: TurnStyle, intensity: Intensity, t: number): { readonly outside: number; readonly inside: number } => {
  const [gentle, dynamic] = style.outsideShare;
  const peak = gentle + (dynamic - gentle) * STEP[intensity];
  const s = style.scenarios[intensity];
  const tilt = turnForcesAt(s, t).tilt / Math.max(1e-9, phaseForces(s).shaping.tilt);
  const outside = 0.5 + (peak - 0.5) * Math.min(1, Math.max(0, tilt));
  return { outside, inside: 1 - outside };
};
