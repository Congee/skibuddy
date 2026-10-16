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
  /** Share per intensity step the counter grows by; defaults to COUNTER_GAIN. */
  readonly counterGain?: number;
  readonly twist: number;
  /** Share of the peak counter and twist at each phase key. */
  readonly counterCurve: PhaseValues;
  /** The inside tip leads as the stance width and the countered hips set it, nil at the switch; absent, as the legs fall. */
  readonly scissor?: boolean;
  /** Trunk bent toward the outside ski at shaping. */
  readonly bend: number;
  /** Degrees the trunk leans further forward than the outside shin; the ankle, solved, sets fore-aft (lemaster-2010 p81). */
  readonly trunkOverShin: number;
  /** How much a harder turn adds to trunkOverShin, as a share per intensity step; defaults to TRUNK_OVER_SHIN_GAIN. */
  readonly trunkOverShinGain?: number;
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
  /** How much a harder turn adds to comAhead, as a share per intensity step; defaults to COM_AHEAD_GAIN. */
  readonly comAheadGain?: number;
  /** Share of the peak angulation already in at the initiation key: feet and knees tip the new edges early. */
  readonly early: number;
  /** Share of a cross-under transition at gentle, moderate and dynamic; the rest is a cross-over. */
  readonly crossUnder: readonly [number, number, number];
  /** A pole plant at the transition. */
  readonly polePlant: boolean;
  /** Turn time of the touch; absent, just after the switch. */
  readonly poleTouchAt?: number;
  /** Poles this many metres shorter than regular. */
  readonly poleTrim: number;
  /** Where the head looks; absent, with the chest. */
  readonly head?: HeadRule;
  /** Arm abduction; absent, the figure's default, hands wide. */
  readonly armAbduction?: number;
  /** A two-footed pop through the switch in place of the shared hip curve; absent, none. */
  readonly rebound?: Rebound;
  /** Skis on top of firm snow, lifting off it only by `rebound.clearance`; absent, they pivot at the boots as in powder. */
  readonly firmSnow?: boolean;
  /** On moguls, the outside knee's range, degrees: open in the troughs, deep per intensity over the crests. */
  readonly absorb?: { readonly open: number; readonly deep: Readonly<Record<Intensity, number>> };
}

/** Values at each phase key, then at the switch keys 1/12 and 11/12. */
export type ReboundValues = readonly [...PhaseValues, number, number];

/** Both legs' depth and both skis' pitch through the switch, the skis pitching as the legs rise or retract. */
export interface Rebound {
  /** Outside hip depth, 0 most open to 1 deepest. */
  readonly hip: ReboundValues;
  /** Degrees both skis pitch tip-up at moderate; negative, tip-down. */
  readonly pitch: ReboundValues;
  /** Share the pitch grows per step of intensity. */
  readonly pitchGain: number;
  /** Mass ahead of the outside mid-foot at the switch keys, metres; absent, the phase keys' curve. */
  readonly comAhead?: readonly [number, number];
  /** Metres the boots clear firm snow at moderate, the tips over it; absent, none. */
  readonly clearance?: ReboundValues;
}

/** One value per phase key, in PHASES order. */
export type PhaseValues = readonly [number, number, number, number, number];

/**
 * Both legs flex through the finish as the snow packs (iasi-2021 p87), then extend to their longest at the switch,
 * unweighting the skis in the snow (iasi-2021 p88, lemaster-2010 p196), and sink into the new turn. The feet move
 * ahead by the finish (lemaster-2010 p197), the tips rising, and draw back under the hips into the new turn
 * (iasi-2021 p87), the tips dipping, less, so the front never digs in. Pitches inferred.
 */
const POWDER_POP = {
  hip: [0, 0.5, 0.45, 0.55, 0.95, 0.25, 0.6],
  pitch: [0, -1, 0, 0, 2, -2, 4],
  pitchGain: 0.4,
} as const satisfies Rebound;

// Carving scenarios as long-radius-carved-turns; short-turn ones as short-radius-turns.
const LONG: TurnScenarios = {
  gentle: { speedMps: 9, radiusM: 17, slopeDeg: 10 },
  moderate: { speedMps: 11, radiusM: 14, slopeDeg: 14 },
  dynamic: { speedMps: 12, radiusM: 11, slopeDeg: 18 },
};
// The trunk follows the skis: counter builds to late shaping and eases off through completion (lemaster-2010 p128).
const FOLLOW: PhaseValues = [0, 0.5, 0.9, 1, 0.4];
// In moguls the hips (user's rule) and the head and chest (fis-freestyle-judging-2025 p29, dipiro-2005 p32) face the
// fall line, so pelvis counter is the skis' heading off it with no spine twist.
// The tops line, and the closed-stance drill's terrain, run in a corridor about 2 m wide.
const CORRIDOR = 2;
/** The zipper line swings about a rut's width across, between two mogul columns; inferred. */
export const ZIPPER_CORRIDOR = 1.1;
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
// An arc of radius r from the fall line across half a corridor w heads acos(1 - w/2r) off it.
const pathHeading = (r: number, w: number): number => Math.acos(1 - w / (2 * r)) / DEG;
// The hips' rotation range.
const HIP_TURN = 45;
const fallLineHeading = (r: number, w: number): number => Math.min(HIP_TURN, pathHeading(r, w));
/** Corridor as a share of the radius where none is known: a round turn, 60° off the fall line at the transition. */
export const CORRIDOR_SHARE = 1;
// Pelvis counter at the switch: a share of the skis' heading off the fall line, so the trunk is biased downhill, facing
// it fully only in passing, more on steeper hills (kipp-2024; lemaster-2010 pp74, 128); the spine adds 5-8 (sporri-2016).
const anticipation = (scenarios: TurnScenarios, share: number): number =>
  Math.min(HIP_TURN, share * pathHeading(scenarios.moderate.radiusM, CORRIDOR_SHARE * scenarios.moderate.radiusM));
// Signed, as headingAt in turn-heading.ts: -max at the transition, 0 at the fall line, max into the next transition.
const heading = (t: number): number => -Math.cos(Math.PI * t);
const HEADING: PhaseValues = [heading(0), heading(1 / 6), heading(1 / 2), heading(0.65), heading(5 / 6)];

// The mass runs nearly straight while the legs swing under it (lind-sanders-2004 pp114-115), the feet under the
// hips (fis-freestyle-judging-2025 p26): its path about 4x the skis' arc, inferred, so the trunk inclines 10-20 deg.
const MOGUL_COM = 4;

// FIS course angles: FIS level 25 ± 3°, World Cup 28 ± 4° (fis-course-standards-2023 p3); gentle's 18° inferred.
// Dynamic nears the pace speeds, 9.0 and 10.3 m/s down the course (fis-icr-book6-2025 §4207.2), 235 m in 25-30 s (fis-moguls-101-2026):
// one radius at every intensity keeps one turn per mogul on the course's 3.5 m spacing (surface.ts), 1.6, 2.1 and 2.7 turns a second.
// A quarter of the braking is fore-aft at the feet, inferred: at a level hip line the faces average none, the edges skidding take the rest.
const ZIPPER_SCENARIOS: TurnScenarios = {
  gentle: { speedMps: 6, radiusM: 5, slopeDeg: 18, comRadiusM: MOGUL_COM * 5, brakingShare: 0.25 },
  moderate: { speedMps: 8, radiusM: 5, slopeDeg: 25, comRadiusM: MOGUL_COM * 5, brakingShare: 0.25 },
  dynamic: { speedMps: 10, radiusM: 5, slopeDeg: 28, comRadiusM: MOGUL_COM * 5, brakingShare: 0.25 },
};

const SHORT: TurnScenarios = {
  gentle: { speedMps: 6, radiusM: 6, slopeDeg: 12 },
  moderate: { speedMps: 7, radiusM: 6, slopeDeg: 15 },
  dynamic: { speedMps: 9, radiusM: 7, slopeDeg: 20 },
};
const STEEP: TurnScenarios = {
  gentle: { speedMps: 5, radiusM: 6, slopeDeg: 25 },
  moderate: { speedMps: 6, radiusM: 6, slopeDeg: 30 },
  dynamic: { speedMps: 7, radiusM: 6, slopeDeg: 35 },
};
const POWDER: TurnScenarios = {
  gentle: { speedMps: 8, radiusM: 14, slopeDeg: 16 },
  moderate: { speedMps: 8.5, radiusM: 13, slopeDeg: 22 },
  dynamic: { speedMps: 10, radiusM: 12, slopeDeg: 26 },
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

const COUNTER_GAIN = 0.15;
// A harder turn leans the trunk further over the shin; inferred.
const TRUNK_OVER_SHIN_GAIN = 0.4;
// A harder turn balances further forward; inferred.
const COM_AHEAD_GAIN = 0.4;

/**
 * Per kind. Trunk 17-40 deg forward of the slope normal, the chest over the outside knee (inferred); outside hip
 * flexion peaks at 55-65 deg (gao-2024). Outside knee within OUTSIDE_KNEE_MAX; outside share 0.6 gentle to 0.85
 * dynamic (heinrich-2022), powder near even.
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
    hip: [36, 42],
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
    // Mass toward the ball of the foot so the chest stays over the outside knee (lemaster-2010 pp57, 182-183); inferred.
    comAhead: [0.055, 0.085, 0.06, 0.05, 0.04],
    comAheadGain: 0.2,
    trunkOverShin: 10,
    trunkOverShinGain: 0,
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
    hip: [34, 40],
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
    // Mass toward the ball of the foot so the chest stays over the outside knee (lemaster-2010 pp57, 182-183); inferred.
    comAhead: [0.065, 0.095, 0.06, 0.045, 0.039],
    comAheadGain: 0.2,
    trunkOverShin: 10,
    trunkOverShinGain: 0,
    early: 0.65,
    // Cross-over at gentle and moderate; at dynamic the legs flex and retract so the skis stay on the snow
    // (lemaster-2010 p154, komissarov-2022b, seifert-2023).
    crossUnder: [0, 0, 1],
    // Outside knee about 71 deg and trunk about 39 deg at the switch: toward seifert-2023's 90 deg flexion transition,
    // within heinrich-2022's GS knee 56-80 and ankle 18-27 deg.
    dynamicDeep: 16,
    polePlant: false,
    poleTrim: 0,
    head: ALONG_ARC,
  },
  // Legs flex and extend under a quiet trunk biased down the fall line.
  [RegularTurn.ShortTurns]: {
    scenarios: SHORT,
    outsideShare: [0.62, 0.85],
    hip: [30, 44],
    hipStep: 4,
    hipSpread: 0,
    angulation: 9,
    // 36 deg at the switch: pelvis counter 30-40 deg, low confidence (biomechanics.md D12); share inferred.
    counter: anticipation(SHORT, 0.6),
    twist: 6,
    counterCurve: HEADING,
    scissor: true,
    bend: 5,
    spineFlex: 22,
    narrow: 0,
    kneesIn: 0,
    // Feet drawn back through the transition, forward into the new turn, centred by the edge set (lemaster-2010 p86); inferred.
    // Mass toward the ball of the foot so the chest stays over the outside knee (lemaster-2010 pp57, 182-183); inferred.
    comAhead: [0.08, 0.08, 0.035, 0.05, 0.035],
    comAheadGain: 0,
    trunkOverShin: 14,
    trunkOverShinGain: 0.4,
    early: 0.6,
    // Cross-under: the edges release as the legs flex back toward the mass (iasi-2021 p63, lemaster-2010 p152).
    crossUnder: [1, 1, 1],
    polePlant: true,
    poleTrim: 0,
    head: DOWN_THE_LINE,
  },
  // Compact, on the zipper line; the legs fold deep up each bump's face.
  [RegularTurn.Moguls]: {
    scenarios: ZIPPER_SCENARIOS,
    outsideShare: [0.6, 0.75],
    // Elite mogul skiers fold the hip much deeper over the bump than the knee (arndt-1992 p85); the range widens with intensity.
    hip: [30, 72],
    hipStep: 5,
    hipSpread: 3,
    angulation: 1,
    // Angulation of the lower leg sets the radius (fis-freestyle-judging-2025 p26); amount inferred.
    kneeAngulation: 34,
    counter: fallLineHeading(5, ZIPPER_CORRIDOR),
    // Held to the skis' heading off the fall line, which the corridor sets at every intensity.
    counterGain: 0,
    twist: 0,
    counterCurve: HEADING,
    scissor: true,
    bend: 3,
    spineFlex: 24,
    // Legs together (fis-freestyle-judging-2025 p26), as the closed stance.
    narrow: 7,
    kneesIn: 10,
    // Feet pushed ahead into the bump, pulled back over the crest, pressing forward into the trough (lemaster-2010
    // p78, p89); inferred. The legs fold up under a trunk that stays over the feet (fis-freestyle-judging-2025 p26).
    comAhead: [0.06, 0.05, 0.01, 0, -0.01],
    trunkOverShin: 8,
    // The upper body stays upright through the whole absorption, so deeper bumps fold the legs, not the hips (fis-freestyle-judging-2025 p28).
    trunkOverShinGain: -0.5,
    early: 0.4,
    // Cross-under: the legs retract over the crest so the mass travels straight (lind-sanders-2004 pp114-115).
    crossUnder: [1, 1, 1],
    // Absorb up to the top of each bump, extend right after it, pressure on the snow even (fis-freestyle-judging-2025 p28);
    // knees near straight after a mogul (arndt-1992 pp79, 87), short of full extension (p93) and still flexed (fis p26).
    absorb: { open: 15, deep: OUTSIDE_KNEE_MAX[RegularTurn.Moguls] },
    polePlant: true,
    // Shorter for quick plants on the bumps' backs.
    poleTrim: 0.05,
    head: { ...DOWNHILL, corridor: ZIPPER_CORRIDOR },
    armAbduction: HANDS_IN,
  },
  // Strong counter and angulation, a firm pole plant.
  [RegularTurn.Steeps]: {
    scenarios: STEEP,
    outsideShare: [0.65, 0.85],
    hip: [28, 42],
    hipStep: 4,
    hipSpread: 0,
    angulation: 14,
    // Further down the fall line than short turns (skimag-steeps-2018, kipp-2024); share inferred.
    counter: anticipation(STEEP, 0.65),
    twist: 4,
    counterCurve: HEADING,
    scissor: true,
    bend: 1,
    spineFlex: 24,
    narrow: 0,
    kneesIn: 0,
    // The balance axis stays square to the skis, so forward of gravity, not of the feet (lemaster-2010 p84); inferred.
    // Mass toward the ball of the foot so the chest stays over the outside knee (lemaster-2010 pp57, 182-183); inferred.
    comAhead: [0.072, 0.06, 0.02, 0.045, 0.025],
    comAheadGain: 0.2,
    trunkOverShin: 16,
    trunkOverShinGain: 0.2,
    early: 0.6,
    // Cross-under: flexing and relaxing the downhill leg, on a solid pole plant (lemaster-2010 pp151-156).
    crossUnder: [1, 1, 1],
    polePlant: true,
    poleTrim: 0,
    head: DOWN_THE_LINE,
  },
  // Near even weighting, a narrow stance and more up and down.
  [RegularTurn.Powder]: {
    scenarios: POWDER,
    outsideShare: [0.52, 0.6],
    hip: [26, 44],
    hipStep: 4,
    // Gentle a soft rebound, dynamic a clear pop (iasi-2021 p88); inferred.
    hipSpread: 3,
    angulation: 4,
    // Head on the fall line and near the chest in open powder, so the chest leads well down it; share inferred.
    counter: anticipation(POWDER, 0.7),
    twist: 7,
    counterCurve: HEADING,
    scissor: true,
    bend: 2,
    spineFlex: 19,
    narrow: 2,
    kneesIn: 0,
    // Never sitting back (lemaster-2010 pp193-199); inferred.
    // Mass toward the ball of the foot so the chest stays over the outside knee (lemaster-2010 pp57, 182-183); inferred.
    comAhead: [0.055, 0.075, 0.05, 0.045, 0.04],
    comAheadGain: 0,
    trunkOverShin: 14,
    trunkOverShinGain: 0.2,
    early: 0.5,
    crossUnder: [0, 0, 0],
    polePlant: true,
    poleTrim: 0,
    head: DOWN_THE_LINE,
    rebound: POWDER_POP,
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
  hip: [36, 46],
  hipStep: 3,
  hipSpread: 0,
  angulation: 3,
  // Edged from the knees, the legs together; amount inferred.
  kneeAngulation: 10,
  counter: fallLineHeading(4.5, CORRIDOR),
  twist: 0,
  counterCurve: HEADING,
  scissor: true,
  bend: 1,
  spineFlex: 22,
  narrow: 7,
  kneesIn: 10,
  // Toward the ball of the foot so the chest stays over the knees (lemaster-2010 pp57, 182-183); inferred.
  comAhead: [0.09, 0.07, 0.05, 0.03, 0.04],
  comAheadGain: 0.1,
  trunkOverShin: 15,
  trunkOverShinGain: 0,
  early: 0.6,
  // Cross-under: the legs swivel under a level trunk.
  crossUnder: [1, 1, 1],
  polePlant: true,
  poleTrim: 0,
  head: DOWNHILL,
  armAbduction: HANDS_IN,
};

/** Turns on the tops (content/drills/turns-on-the-tops.yaml): the mogul style turning over each crest in the 2 m corridor. */
export const TOPS: TurnStyle = {
  ...TURN_STYLES[RegularTurn.Moguls],
  // As content/drills/turns-on-the-tops.yaml: a recreational field; a quarter of the braking fore-aft, as the zipper.
  scenarios: {
    gentle: { speedMps: 5, radiusM: 5, slopeDeg: 15, comRadiusM: MOGUL_COM * 5, brakingShare: 0.25 },
    moderate: { speedMps: 6, radiusM: 5, slopeDeg: 18, comRadiusM: MOGUL_COM * 5, brakingShare: 0.25 },
    dynamic: { speedMps: 7.5, radiusM: 5.5, slopeDeg: 22, comRadiusM: MOGUL_COM * 5.5, brakingShare: 0.25 },
  },
  counter: fallLineHeading(5, CORRIDOR),
  counterGain: COUNTER_GAIN,
  trunkOverShin: 12,
  trunkOverShinGain: TRUNK_OVER_SHIN_GAIN,
  head: DOWNHILL,
};

/** The round line swings wider than the tops line's corridor (jds-bumps-style 2:00); inferred. */
export const ROUND_CORRIDOR = 2.8;
/**
 * The round line's path crosses its centre line, heading most across the hill, at the edge set, 0.35 turn before the
 * flat skis of the switch (jds-bumps-style 1:56-2:01, measured 0.3-0.4).
 */
export const ROUND_PHASE = 0.35;
const roundHeading = (t: number): number => heading(t + ROUND_PHASE);
// Hands wide and forward (jds-bumps-style frames): the figure's default, not the zipper's hands in.
const { armAbduction: _handsIn, ...MOGUL_HANDS_WIDE } = TURN_STYLES[RegularTurn.Moguls];

/**
 * The round line (content/drills/round-line.yaml): round each bump high on its wall, a skidded edge set across the
 * hill on the next face, then release and pivot over the shoulder (jds-bumps-style 1:11-2:37, 5:11-7:22).
 */
export const ROUND: TurnStyle = {
  ...MOGUL_HANDS_WIDE,
  // As content/drills/round-line.yaml: a natural field, turn times 1.1-1.3 s at moderate (jds-bumps-style 1:56-2:01).
  scenarios: {
    gentle: { speedMps: 3.8, radiusM: 3, slopeDeg: 15, comRadiusM: MOGUL_COM * 3, brakingShare: 0.25 },
    moderate: { speedMps: 4.3, radiusM: 3, slopeDeg: 18, comRadiusM: MOGUL_COM * 3, brakingShare: 0.25 },
    dynamic: { speedMps: 5.2, radiusM: 3, slopeDeg: 22, comRadiusM: MOGUL_COM * 3, brakingShare: 0.25 },
  },
  // The chest faces downhill (jds-bumps-style frames), so the pelvis turns back by the skis' heading, phased as the path.
  counter: fallLineHeading(3, ROUND_CORRIDOR),
  counterGain: 0,
  counterCurve: [roundHeading(0), roundHeading(1 / 6), roundHeading(1 / 2), roundHeading(0.65), roundHeading(5 / 6)],
  // Trunk parallel to the shin at the crest (gellie-2019-moguls-forward).
  trunkOverShin: 0,
  trunkOverShinGain: 0,
  // Tip the legs as soon as the skis are flat (jds-bumps-style 5:11-6:00).
  early: 0.6,
  // The plant downhill at the release, on the bump's top or shoulder (jds-bumps-style 3:24, 4:25).
  poleTouchAt: 0.78,
  head: { ...DOWNHILL, corridor: ROUND_CORRIDOR },
};

/**
 * The dolphin turn's fore-aft cycle on firm snow (content/movements/dolphin-turn.yaml). Through the finish the ankles
 * open and the feet slide ahead, the mass behind mid-foot over the loaded tails (lemaster-2010 p81; lind-sanders-2004
 * pp69-70, 146); the tips lift. In the transition both legs retract under the hips and the tips point down
 * (iasi-2021 p174, lind-sanders-2004 p120), the skis just off the snow; they land tip first on the new edges, the
 * forebody engaged and the mass ahead of mid-foot. Tips-up pitch inferred: the tail's reverse bend under the boot
 * plus the boot tipped back on the spoiler; 8-16 deg lifts a forebody 0.85 m long 12-23 cm off the snow, the rigid
 * tail drawn under it for the bend.
 */
const DOLPHIN_POP = {
  hip: [1, 0.3, 0, 0.08, 0.35, 0.75, 0.55],
  pitch: [-6, 0, 0, 1, 6, -3, 12],
  pitchGain: 1 / 3,
  comAhead: [0.06, -0.12],
  clearance: [0.13, 0, 0, 0, 0, 0, 0],
} as const satisfies Rebound;

/** Dolphin turns: medium-radius turns working the fore-aft range. Scenarios as content/drills/dolphin-turns.yaml. */
export const DOLPHIN: TurnStyle = {
  scenarios: {
    gentle: { speedMps: 8, radiusM: 12, slopeDeg: 14 },
    moderate: { speedMps: 10, radiusM: 14, slopeDeg: 17 },
    dynamic: { speedMps: 12, radiusM: 16, slopeDeg: 20 },
  },
  // About 60-75 % on the outside foot through shaping (heinrich-2022).
  outsideShare: [0.6, 0.75],
  // Deepest in the retraction, near 90 deg at hip and knee (seifert-2023); inferred.
  hip: [40, 75],
  hipStep: 5,
  hipSpread: 0,
  angulation: 8,
  // Slight.
  counter: 8,
  twist: 2,
  counterCurve: FOLLOW,
  bend: 3,
  spineFlex: 21,
  narrow: 0,
  kneesIn: 0,
  // Forebody at initiation, centred by shaping, the tails in the finish (lind-sanders-2004 pp69-70); inferred.
  // Ahead late in shaping so the chest stays over the outside knee into the sit-back; inferred.
  comAhead: [0.07, 0.065, 0.045, 0.1, -0.055],
  comAheadGain: 0.25,
  trunkOverShin: 11,
  trunkOverShinGain: 0,
  early: 0.6,
  // A flexion transition: the legs retract under the mass (seifert-2023, lemaster-2010 pp152-154).
  crossUnder: [1, 1, 1],
  polePlant: true,
  // As the tips leave the snow (dolphin-turns.yaml): half their lift at the finish key.
  poleTouchAt: 5 / 6,
  poleTrim: 0,
  head: NEXT_APEX,
  rebound: DOLPHIN_POP,
  firmSnow: true,
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
// A faster retraction lifts the skis higher; inferred.
const CLEARANCE_GAIN = 0.4;

/** The kind's two-footed turn as a pose definition: both skis on the snow, the inside leg shorter. */
export const regularTurn = (style: TurnStyle): PoseDefinition => {
  const [open, deep] = style.hip;
  const step = style.hipStep;
  const spread = style.hipSpread;
  const load = (i: Intensity): number => arcLoad(style.scenarios[i]);
  const pop = style.rebound;
  const popped = (i: number): Partial<PoseKey> => {
    if (pop === undefined) return {};
    const ahead = pop.comAhead?.[i - PHASES.length];
    return {
      hip: pop.hip[i] ?? 0,
      hipUnder: pop.hip[i] ?? 0,
      skiPitch: (pop.pitch[i] ?? 0) * DEG,
      ...(ahead === undefined ? {} : { comAhead: ahead }),
      ...(pop.clearance === undefined ? {} : { skiClearance: pop.clearance[i] ?? 0 }),
    };
  };
  const keys = PHASES.map((p, i): PoseKey => {
    const share = p.share ?? style.early;
    return {
      t: p.t,
      angulation: share,
      hip: p.hip,
      hipUnder: p.under,
      ...popped(i),
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
    keys: [...keys, ...SWITCH.map((k, i): PoseKey => ({ ...keyValuesAt(keys, k.t), t: k.t, hip: k.hip, hipUnder: k.under, ...popped(PHASES.length + i) }))],
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
      trunkOverShinGain: style.trunkOverShinGain ?? TRUNK_OVER_SHIN_GAIN,
      insideAnkleShare: INSIDE_ANKLE_SHARE,
      ...(style.scissor === true ? { scissor: true } : {}),
      poleTouch: style.polePlant ? { t: style.poleTouchAt ?? 1 / 24, hold: 0.02, swing: 0.11 } : null,
      scapularRhythm: 0.3,
      stance: style.narrow * DEG,
      kneesIn: style.kneesIn * DEG,
      poleTrim: style.poleTrim,
      ...(style.head === undefined ? {} : { head: style.head }),
      ...(style.armAbduction === undefined ? {} : { armAbduction: style.armAbduction * DEG }),
      ...(style.firmSnow === true ? { firmSnow: true } : {}),
      ...(style.absorb === undefined ? {} : { absorb: { open: style.absorb.open * DEG, deep: [style.absorb.deep.gentle * DEG, style.absorb.deep.moderate * DEG, style.absorb.deep.dynamic * DEG] as const } }),
      gains: {
        comAhead: style.comAheadGain ?? COM_AHEAD_GAIN,
        lumbarFlex: 0.1,
        angulation: 0.15,
        eversion: 0.15,
        pelvisList: 0.4,
        counter: style.counterGain ?? COUNTER_GAIN,
        spineBend: 0.15,
        spineTwist: 0.1,
        skiPitch: pop?.pitchGain ?? 0,
        skiClearance: CLEARANCE_GAIN,
      },
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
