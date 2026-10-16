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
  /** Pelvis facing the outside of the turn at shaping, and the trunk turned further beyond it. */
  readonly counter: number;
  readonly twist: number;
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
    counter: 6,
    twist: 2,
    bend: 2,
    dorsiflexion: 13,
    ankle: [0, 1, 0, 0, -1],
    spineFlex: 20,
    narrow: 0,
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
    counter: 7,
    twist: 3,
    bend: 6,
    dorsiflexion: 14,
    ankle: [-1, 4, 2, 0, -2],
    spineFlex: 21,
    narrow: 0,
    comAhead: 0.08,
    early: 0.65,
    polePlant: false,
    poleTrim: 0,
  },
  // Legs flex and extend under a quiet trunk turned down the fall line.
  [RegularTurn.ShortTurns]: {
    scenarios: SHORT,
    outsideShare: [0.62, 0.85],
    hip: [32, 56],
    hipStep: 4,
    angulation: 9,
    counter: 14,
    twist: 10,
    bend: 5,
    dorsiflexion: 15,
    ankle: [0, 3, 2, 0, -2],
    spineFlex: 22,
    narrow: 0,
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
    counter: 15,
    twist: 10,
    bend: 3,
    dorsiflexion: 17,
    ankle: [4, 2, -1, -1, 2],
    spineFlex: 20,
    narrow: 0,
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
    counter: 18,
    twist: 12,
    bend: 9,
    dorsiflexion: 15,
    ankle: [-1, 4, 2, 0, -2],
    spineFlex: 24,
    narrow: 0,
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
    counter: 5,
    twist: 2,
    bend: 2,
    dorsiflexion: 13,
    ankle: [0, 1, 0, -1, -1],
    spineFlex: 16,
    narrow: 2,
    comAhead: 0.04,
    early: 0.5,
    polePlant: true,
    poleTrim: 0,
  },
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
        spineTwist: style.twist * share * DEG,
        counter: style.counter * share * DEG,
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
