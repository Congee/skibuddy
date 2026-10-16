import { Intensity } from '../../content/schema';
import { arcLoad, phaseForces, turnForcesAt } from '../../physics/turn';
import type { TurnScenarios } from '../../physics/turn';
import { keyValuesAt } from '../pose-definition';
import { HeadAim } from '../pose-definition';
import type { HeadRule, PoseDefinition, PoseKey } from '../pose-definition';

const DEG = Math.PI / 180;

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
  /** Degrees the hip ends move apart per step of intensity: a wider absorption range. */
  readonly hipSpread: number;
  /** Degrees the deep end deepens further at dynamic only: a lower cross-under. */
  readonly dynamicDeep?: number;
  /** Peak hip angulation and the outside femur's rotation into the turn. */
  readonly angulation: number;
  /** Degrees both femurs turn further into the turn: edge from the knees, the pelvis left level. */
  readonly kneeAngulation?: number;
  /** Peak pelvis turn toward the outside of the turn, relative to the skis, and the chest turned further beyond it. */
  readonly counter: number;
  readonly twist: number;
  /** Share of the peak counter and twist at each phase key. */
  readonly counterCurve: PhaseValues;
  /** Trunk bent toward the outside ski at shaping. */
  readonly bend: number;
  /** Degrees the trunk leans further forward than the outside shin; the ankle, solved, sets fore-aft (lemaster-2010 p81). */
  readonly trunkOverShin: number;
  /** Low back flexed on the pelvis at moderate intensity; racers measure 11-27 deg (sporri-2016). */
  readonly spineFlex: number;
  /** Thighs drawn toward each other: a narrower stance than hip width. */
  readonly narrow: number;
  /** Both femurs turned inward, so the knees meet while the boots stay apart. */
  readonly kneesIn: number;
  /**
   * Mass ahead of the outside mid-foot at each phase key, metres: forward into the control phase, back to the middle
   * or tail by the completion, the range an inch or two in free skiing and more when aggressive (lemaster-2010 p85).
   */
  readonly comAhead: PhaseValues;
  /** Share of the peak angulation already in at the initiation key: feet and knees tip the new edges early. */
  readonly early: number;
  /** Share of a cross-under transition at gentle, moderate and dynamic; the rest is a cross-over. */
  readonly crossUnder: readonly [number, number, number];
  /** A pole plant at the transition. */
  readonly polePlant: boolean;
  /** Poles this many metres shorter than regular. */
  readonly poleTrim: number;
  /** Where the head looks; absent, with the chest. */
  readonly head?: HeadRule;
  /** Arm abduction; absent, the figure's default, hands wide. */
  readonly armAbduction?: number;
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
// In moguls the hips (user's rule) and the head and chest (fis-freestyle-judging-2025 p29, dipiro-2005 p32) face the
// fall line, so pelvis counter is the skis' heading off it with no spine twist.
// Mogul lines, and the closed-stance drill's terrain, run in a corridor about 2 m wide.
const CORRIDOR = 2;
// The head stays still, facing downhill (fis-freestyle-judging-2025 p29).
const DOWNHILL: HeadRule = { aim: HeadAim.FallLine, corridor: CORRIDOR };
// The head leads the path by about 1 s (land-tatler-2001, lappi-2025) and the gaze moves to the next gate about 0.5 s
// before passing one (decroix-2017); along the arc a little inside it (collin-psia-nw).
const ALONG_ARC: HeadRule = { aim: HeadAim.Arc, lead: 1, early: 0.5 };
// Cruising picks the next turn's spot before the transition (lemaster-2010 p150), earlier than a racer; 1 s inferred.
const NEXT_APEX: HeadRule = { aim: HeadAim.Arc, lead: 1, early: 1 };
// At least two turns ahead (zalohar-fall-line), down the fall line on steeps (skimag-steeps-2018); its centre line inferred.
const DOWN_THE_LINE: HeadRule = { aim: HeadAim.Line, turns: 2 };
// Hands in front of the body (fis-freestyle-judging-2025 p29), not out wide; amount inferred.
const HANDS_IN = 10;
// An arc of radius r from the fall line across half a corridor w heads acos(1 - w/2r) off it, up to the hips' rotation range.
const fallLineHeading = (r: number, w: number): number => Math.min(45, Math.acos(1 - w / (2 * r)) / DEG);
// Signed, as headingAt in turn-heading.ts: -max at the transition, 0 at the fall line, max into the next transition.
const heading = (t: number): number => -Math.cos(Math.PI * t);
const HEADING: PhaseValues = [heading(0), heading(1 / 6), heading(1 / 2), heading(0.65), heading(5 / 6)];

// The mass runs nearly straight while the legs swing under it (lind-sanders-2004 pp114-115), the feet under the
// hips (fis-freestyle-judging-2025 p26): its path about 4x the skis' arc, inferred, so the trunk inclines 10-20 deg.
const MOGUL_COM = 4;

const SHORT: TurnScenarios = {
  gentle: { speedMps: 6, radiusM: 6, slopeDeg: 12 },
  moderate: { speedMps: 7, radiusM: 6, slopeDeg: 15 },
  dynamic: { speedMps: 9, radiusM: 7, slopeDeg: 20 },
};

/**
 * Outside knee flexion ceiling over the whole turn, degrees. Gentle and moderate are recreational: about 30-45 at shaping
 * (video reference), folding deeper through a flexed transition and over bumps (inferred). Dynamic takes the measured
 * ceiling: a GS instructor's 56-80 (heinrich-2022), elite moguls little past 100 (arndt-1992 p85).
 */
export const OUTSIDE_KNEE_MAX: Readonly<Record<RegularTurn, Readonly<Record<Intensity, number>>>> = {
  [RegularTurn.Cruising]: { gentle: 55, moderate: 55, dynamic: 80 },
  [RegularTurn.Carving]: { gentle: 58, moderate: 58, dynamic: 85 },
  [RegularTurn.ShortTurns]: { gentle: 65, moderate: 65, dynamic: 80 },
  [RegularTurn.Moguls]: { gentle: 80, moderate: 90, dynamic: 100 },
  [RegularTurn.Steeps]: { gentle: 65, moderate: 65, dynamic: 80 },
  [RegularTurn.Powder]: { gentle: 60, moderate: 60, dynamic: 80 },
};

/**
 * Per kind. Trunk 20-35 deg forward of vertical: outside hip flexion peaks at 55-65 deg (gao-2024). Outside knee within
 * OUTSIDE_KNEE_MAX; outside share 0.6 gentle to 0.85 dynamic (heinrich-2022), powder near even.
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
    hipSpread: 0,
    angulation: 5,
    // Between carving and short turns; inferred.
    counter: 12,
    twist: 2,
    counterCurve: FOLLOW,
    bend: 2,
    spineFlex: 20,
    narrow: 0,
    kneesIn: 0,
    // Free skiing's small range (lemaster-2010 p85), forward at initiation (debertin-2022); values inferred.
    comAhead: [0.015, 0.045, 0.02, 0.01, 0],
    trunkOverShin: 4,
    early: 0.4,
    // Cross-over: the mass moves across the skis into the new turn (iasi-2021 p46, lemaster-2010 pp144-148).
    crossUnder: [0, 0, 0],
    polePlant: false,
    poleTrim: 0,
    head: NEXT_APEX,
  },
  // High edge, long outside leg, angulation from the hip.
  [RegularTurn.Carving]: {
    scenarios: LONG,
    outsideShare: [0.65, 0.88],
    hip: [32, 38],
    hipStep: 2,
    hipSpread: 0,
    angulation: 12,
    // Slight, from the strong inside half; the trunk turns with the skis (debertin-2022, biomechanics.md D13).
    counter: 5,
    twist: 1,
    counterCurve: FOLLOW,
    bend: 6,
    spineFlex: 21,
    narrow: 0,
    kneesIn: 0,
    // Tip pressure into the control phase, then the feet slide ahead to the finish (lemaster-2010 pp79-81, 85); inferred.
    comAhead: [0.015, 0.045, 0.02, 0.005, -0.02],
    trunkOverShin: 3,
    early: 0.65,
    // Cross-over at gentle and moderate; at dynamic the legs flex and retract so the skis stay on the snow
    // (lemaster-2010 p154, komissarov-2022b, seifert-2023).
    crossUnder: [0, 0, 1],
    // Outside knee about 72 deg and trunk about 41 deg at the switch: toward seifert-2023's 90 deg flexion transition,
    // within heinrich-2022's GS knee 56-80 and ankle 18-27 deg.
    dynamicDeep: 25,
    polePlant: false,
    poleTrim: 0,
    head: ALONG_ARC,
  },
  // Legs flex and extend under a quiet trunk square to the fall line.
  [RegularTurn.ShortTurns]: {
    scenarios: SHORT,
    outsideShare: [0.62, 0.85],
    hip: [32, 46],
    hipStep: 4,
    hipSpread: 0,
    angulation: 9,
    counter: SHORT_COUNTER,
    twist: 5,
    counterCurve: SWIVEL,
    bend: 5,
    spineFlex: 22,
    narrow: 0,
    kneesIn: 0,
    // Feet drawn back through the transition, forward into the new turn, centred by the edge set (lemaster-2010 p86); inferred.
    comAhead: [0.02, 0.055, 0.03, 0.01, -0.01],
    trunkOverShin: 10,
    early: 0.6,
    // Cross-under: the edges release as the legs flex back toward the mass (iasi-2021 p63, lemaster-2010 p152).
    crossUnder: [1, 1, 1],
    polePlant: true,
    poleTrim: 0,
    head: DOWN_THE_LINE,
  },
  // Compact; the legs fold deep over each bump at the transition.
  [RegularTurn.Moguls]: {
    scenarios: {
      gentle: { speedMps: 5, radiusM: 5, slopeDeg: 15, comRadiusM: MOGUL_COM * 5 },
      moderate: { speedMps: 6, radiusM: 5, slopeDeg: 18, comRadiusM: MOGUL_COM * 5 },
      dynamic: { speedMps: 7.5, radiusM: 5.5, slopeDeg: 22, comRadiusM: MOGUL_COM * 5.5 },
    },
    outsideShare: [0.6, 0.75],
    // Elite mogul skiers fold the hip much deeper over the bump than the knee (arndt-1992 p85); the range widens with intensity.
    hip: [30, 72],
    hipStep: 5,
    hipSpread: 3,
    angulation: 6,
    // Angulation of the lower leg sets the radius (fis-freestyle-judging-2025 p26); amount inferred.
    kneeAngulation: 10,
    counter: fallLineHeading(5, CORRIDOR),
    twist: 0,
    counterCurve: HEADING,
    bend: 3,
    spineFlex: 24,
    // Legs together (fis-freestyle-judging-2025 p26), as the closed stance.
    narrow: 7,
    kneesIn: 10,
    // Feet pushed ahead into the bump, pulled back over the crest, pressing forward into the trough (lemaster-2010
    // p78, p89); inferred. The legs fold up under a trunk that stays over the feet (fis-freestyle-judging-2025 p26).
    comAhead: [0.06, 0.05, 0.01, 0, -0.01],
    trunkOverShin: 12,
    early: 0.4,
    // Cross-under: the legs retract over the crest so the mass travels straight (lind-sanders-2004 pp114-115).
    crossUnder: [1, 1, 1],
    polePlant: true,
    // Shorter for quick plants on the bumps' backs.
    poleTrim: 0.05,
    head: DOWNHILL,
    armAbduction: HANDS_IN,
  },
  // Strong counter and angulation, a firm pole plant.
  [RegularTurn.Steeps]: {
    scenarios: {
      gentle: { speedMps: 5, radiusM: 6, slopeDeg: 25 },
      moderate: { speedMps: 6, radiusM: 6, slopeDeg: 30 },
      dynamic: { speedMps: 7, radiusM: 6, slopeDeg: 35 },
    },
    outsideShare: [0.65, 0.85],
    hip: [36, 50],
    hipStep: 4,
    hipSpread: 0,
    angulation: 14,
    // Pivoted, so near short turns; inferred.
    counter: 30,
    twist: 6,
    counterCurve: SWIVEL,
    bend: 9,
    spineFlex: 24,
    narrow: 0,
    kneesIn: 0,
    // The balance axis stays square to the skis, so forward of gravity, not of the feet (lemaster-2010 p84); inferred.
    comAhead: [0.02, 0.05, 0.03, 0.01, -0.01],
    trunkOverShin: 10,
    early: 0.6,
    // Cross-under: flexing and relaxing the downhill leg, on a solid pole plant (lemaster-2010 pp151-156).
    crossUnder: [1, 1, 1],
    polePlant: true,
    poleTrim: 0,
    head: DOWN_THE_LINE,
  },
  // Near even weighting, a narrow stance and more up and down.
  [RegularTurn.Powder]: {
    scenarios: {
      gentle: { speedMps: 8, radiusM: 14, slopeDeg: 16 },
      moderate: { speedMps: 8.5, radiusM: 13, slopeDeg: 22 },
      dynamic: { speedMps: 10, radiusM: 12, slopeDeg: 26 },
    },
    outsideShare: [0.52, 0.6],
    hip: [28, 46],
    hipStep: 4,
    hipSpread: 0,
    angulation: 4,
    // Rhythmic fall-line turns, rounder than short turns; inferred.
    counter: 20,
    twist: 3,
    counterCurve: SWIVEL,
    bend: 2,
    spineFlex: 19,
    narrow: 2,
    kneesIn: 0,
    // Never sitting back (lemaster-2010 pp193-199); inferred.
    comAhead: [0.015, 0.045, 0.03, 0.01, -0.005],
    trunkOverShin: 6,
    early: 0.5,
    // A two-footed rebound: both legs flex through the finish and extend through the switch, kept small
    // (iasi-2021 p88, lemaster-2010 pp193-199).
    crossUnder: [0, 0, 0],
    polePlant: true,
    poleTrim: 0,
    head: DOWN_THE_LINE,
  },
};

/**
 * Closed-stance short turns: knees and boots together, the legs swivelling under a still trunk square to the
 * fall line. Scenarios as content/drills/closed-stance-short-turns.yaml.
 */
export const CLOSED_STANCE: TurnStyle = {
  scenarios: {
    gentle: { speedMps: 5, radiusM: 4.5, slopeDeg: 14, comRadiusM: MOGUL_COM * 4.5 },
    moderate: { speedMps: 6, radiusM: 4.5, slopeDeg: 17, comRadiusM: MOGUL_COM * 4.5 },
    dynamic: { speedMps: 7, radiusM: 5, slopeDeg: 20, comRadiusM: MOGUL_COM * 5 },
  },
  // Both feet share the load more evenly than in an open stance.
  outsideShare: [0.55, 0.65],
  // Little up and down: the trunk stays level.
  hip: [40, 50],
  hipStep: 3,
  hipSpread: 0,
  angulation: 3,
  counter: fallLineHeading(4.5, CORRIDOR),
  twist: 0,
  counterCurve: HEADING,
  bend: 1,
  spineFlex: 22,
  narrow: 7,
  kneesIn: 10,
  // Centred, little fore-aft in the narrow stance; inferred.
  comAhead: [0.015, 0.04, 0.02, 0, -0.01],
  trunkOverShin: 6,
  early: 0.6,
  // Cross-under: the legs swivel under a level trunk.
  crossUnder: [1, 1, 1],
  polePlant: true,
  poleTrim: 0,
  head: DOWNHILL,
  armAbduction: HANDS_IN,
};

export const isRegularTurn = (id: string): id is RegularTurn => Object.hasOwn(TURN_STYLES, id);

/** The regular turn shown for a turning drill without its own pose. */
export const DEFAULT_REGULAR_TURN: RegularTurn = RegularTurn.Cruising;

/** One key of the shared turn shape: shares of each kind's peaks; `share` null takes the kind's early edge. */
interface Phase {
  readonly t: number;
  readonly share: number | null;
  /** Outside hip depth in a cross-over, and in a cross-under. */
  readonly hip: number;
  readonly under: number;
}

// Longest at shaping, flexing again through the finish (lemaster-2010 pp40-42); edge, counter and angulation
// build to late shaping. A cross-over is deepest late in the finish and extends through the switch, so the mass
// rises across the skis (iasi-2021 pp35, 38; seifert-2023). A cross-under stays deepest around the switch while the
// skis swing under a lower, steadier mass (lemaster-2010 pp152-154, lind-sanders-2004 p120).
const PHASES: ReadonlyArray<Phase> = [
  { t: 0, share: 0, hip: 0.7, under: 1 },
  { t: 1 / 6, share: null, hip: 0.35, under: 0.45 },
  { t: 1 / 2, share: 0.9, hip: 0, under: 0 },
  { t: 0.65, share: 1, hip: 0.08, under: 0.08 },
  { t: 5 / 6, share: 0.4, hip: 0.7, under: 0.55 },
];
/** Hip-only keys either side of the switch; every other field keeps the phase keys' curve. */
const SWITCH: ReadonlyArray<Pick<Phase, 't' | 'hip' | 'under'>> = [
  { t: 1 / 12, hip: 0.5, under: 0.9 },
  { t: 11 / 12, hip: 1, under: 0.9 },
];

// The inside boot lets its ankle flex a little, so most of the inside leg's extra flex leads its foot (lemaster-2010 p61); inferred.
const INSIDE_ANKLE_SHARE = 0.3;
// A harder turn leans the trunk further over the shin; inferred.
const TRUNK_OVER_SHIN_GAIN = 0.4;

/** The kind's two-footed turn as a pose definition: both skis on the snow, the inside leg shorter. */
export const regularTurn = (style: TurnStyle): PoseDefinition => {
  const [open, deep] = style.hip;
  const step = style.hipStep;
  const spread = style.hipSpread;
  const load = (i: Intensity): number => arcLoad(style.scenarios[i]);
  const keys = PHASES.map((p, i): PoseKey => {
    const share = p.share ?? style.early;
    return {
      t: p.t,
      angulation: share,
      hip: p.hip,
      hipUnder: p.under,
      pelvisList: 1.2 * style.angulation * share * DEG,
      lumbarFlex: style.spineFlex * DEG,
      spineBend: style.bend * share * DEG,
      spineTwist: style.twist * (style.counterCurve[i] ?? 0) * DEG,
      counter: style.counter * (style.counterCurve[i] ?? 0) * DEG,
      // Solved from the balance.
      dorsiflexion: 0,
      insideDorsiflexion: 0,
      // The feet tip first, the hips follow.
      eversion: 0.2 * style.angulation * Math.sqrt(share) * DEG,
      protraction: 6 * DEG,
      elevation: 0,
      insideTailLift: 0,
      comAhead: style.comAhead[i] ?? 0,
    };
  });
  return {
    keys: [...keys, ...SWITCH.map((k): PoseKey => ({ ...keyValuesAt(keys, k.t), t: k.t, hip: k.hip, hipUnder: k.under }))],
    constraints: {
      hipAngulation: style.angulation * DEG,
      femurRotation: (0.5 * style.angulation + (style.kneeAngulation ?? 0)) * DEG,
      insideFemurShare: 0.8,
      hipByLoad: [
        [load(Intensity.Gentle), open - step + spread, deep - step - spread],
        [load(Intensity.Moderate), open, deep],
        [load(Intensity.Dynamic), open + step - spread, deep + step + spread + (style.dynamicDeep ?? 0)],
      ],
      insideKneeMax: 120 * DEG,
      tailLift: null,
      crossUnder: style.crossUnder,
      trunkOverShin: style.trunkOverShin * DEG,
      trunkOverShinGain: TRUNK_OVER_SHIN_GAIN,
      insideAnkleShare: INSIDE_ANKLE_SHARE,
      poleTouch: style.polePlant ? { t: 1 / 24, hold: 0.02, swing: 0.11 } : null,
      scapularRhythm: 0.3,
      stance: style.narrow * DEG,
      kneesIn: style.kneesIn * DEG,
      poleTrim: style.poleTrim,
      ...(style.head === undefined ? {} : { head: style.head }),
      ...(style.armAbduction === undefined ? {} : { armAbduction: style.armAbduction * DEG }),
      gains: { comAhead: 0.4, lumbarFlex: 0.1, angulation: 0.15, eversion: 0.15, pelvisList: 0.4, counter: 0.15, spineBend: 0.15, spineTwist: 0.1 },
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
