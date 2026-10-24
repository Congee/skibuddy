import { bootFitFrom } from '../viewer/gear-fit';
import { EQUIPMENT } from '../viewer/equipment';
import { transformPoint } from '../viewer/mat4';
import { bindingInSegment, rigidInverse, SKELETON_DATA, Side } from '../viewer/skeleton';
import { REFERENCE_SKIER, skiEnds } from '../viewer/skier';
import type { Ski } from '../viewer/skier';
import { BEND_FACTOR, DRAG_AREA_M2, EDGE_FRICTION, GLIDING_FRICTION, SNOW_COMPLIANCE, SOFT_LEVEL_EDGE_DEG, Snow, angulationReach, carvedRadius } from './edge';
import { MOGUL_LEAN_RATIO, REACH, alongOf, edgeCurvatureOf, harmonicSwing, leanRatioOf, mogulMassOf, swingForLean } from './moguls';
import type { Bridge, ContactGeometry, MogulMass, SwingFit } from './moguls';
import { carveCellFor } from './carve-bake';
import type { CarveCell, CarveCells, CarveSampleKey } from './carve-bake';
import { bendRadiusOf } from './ski-bend';
import type { TurnEvents, TurnTask } from './task';
import { lineHeading, zipperTrack } from './zipper';
import type { ZipperTrack } from './zipper';

const DEG_RAD = Math.PI / 180;

/** A round turn at constant speed: speed, radius of the skis' arc, slope. Content's `Scenario` fits it. */
export interface TurnScenario {
  readonly speedMps: number;
  /** The skis' arc, and the centre of mass's path unless `comRadiusM` is set. */
  readonly radiusM: number;
  readonly slopeDeg: number;
  /** The centre of mass's path when the legs swing the skis under a straighter mass, as in moguls. */
  readonly comRadiusM?: number;
  /** Share of gravity's pull along the path the snow takes to hold the speed: 1 steady, 0 none; absent, 0. */
  readonly brakingShare?: number;
}

export const G = 9.81;

// The mass runs nearly straight while the legs swing under it (lind-sanders-2004 pp114-115), the feet under the
// hips (fis-freestyle-judging-2025 p26): its path about 4x the skis' arc, inferred, so the trunk inclines 10-20 deg.
export const MOGUL_COM = 4;

/** The moguls style's outside-foot share mid-turn, gentle and dynamic. */
export const MOGUL_OUTSIDE_SHARE: readonly [number, number] = [0.6, 0.75];
/** Moguls: boot centre to centre in boot widths (refskier notes: Horishima, measured 1 frame). */
export const MOGUL_STANCE_BOOTS = 1.1;
/** Boot width across its sole, for stances measured in boot widths. */
export const BOOT_WIDTH = 2 * bootFitFrom(SKELETON_DATA.gear_fit[Side.Right]).halfWidth;
/** The moguls stance goal, boot centre to centre, metres. */
export const MOGUL_STANCE_M = MOGUL_STANCE_BOOTS * BOOT_WIDTH;
/** The ankle over the ski's base, metres: the foot origin in the binding frame plus the ski's thickness. */
export const ANKLE_STAND_M = transformPoint(rigidInverse(bindingInSegment(Side.Right)), [0, 0, 0])[1] + EQUIPMENT.skiThickness;
/** A task's ski under the ankle (edgedContacts). */
export const contactGeometryOf = (task: TurnTask): ContactGeometry => ({ stand: ANKLE_STAND_M, half: task.ski.waist / 2 });

/** Any drill's scenario: no radius means it is not a round turn (steps, stops, straight runs). */
export interface DrillScenario {
  readonly speedMps: number;
  readonly slopeDeg: number;
  readonly radiusM?: number;
  readonly comRadiusM?: number;
  readonly brakingShare?: number;
}

/** Structural twin of content's `isTurnScenario`, so the physics needs nothing from the content schema. */
export const isTurn = (s: DrillScenario): s is TurnScenario => typeof s.radiusM === 'number' && s.radiusM > 0;

export interface TurnForces {
  /** Snow force over body weight. */
  readonly load: number;
  /** Tilt of the resultant, and of the balanced body, from the slope normal, radians. */
  readonly tilt: number;
}

/** Radius of the centre of mass's path. */
export const comRadius = (s: TurnScenario): number => s.comRadiusM ?? s.radiusM;

/**
 * Lind & Sanders eq 4.9 at the skis' heading `beta`, radians: 0 across the hill at the top of the
 * turn, π/2 down the fall line, π across again at the finish. Gravity opposes the turn
 * above the fall line and adds below it (lind-sanders-2004). A wider mass path keeps the skis'
 * rhythm, so it heads off the fall line by the share radiusM / comRadiusM of the skis' heading.
 */
export const forcesAt = (s: TurnScenario, beta: number): TurnForces => {
  const alpha = (s.slopeDeg * Math.PI) / 180;
  const r = comRadius(s);
  const off = (Math.PI / 2 - beta) * (s.radiusM / r);
  const f = s.speedMps ** 2 / (G * r) - Math.sin(alpha) * Math.sin(off);
  return { load: Math.hypot(f, Math.cos(alpha)), tilt: Math.atan2(f, Math.cos(alpha)) };
};

/** Air drag over weight per (m/s)²: ½ ρ CdA / mg at 1 kg/m³, 0.4 m², 75 kg; inferred. */
export const DRAG_PER_V2 = (0.5 * 1 * 0.4) / (75 * G);

/**
 * Tilt of the snow's force uphill from the slope normal in the skis' pitch plane, radians. Holding the speed, the
 * snow takes gravity's pull along the mass's path, sinθ cosψ less air drag, in the share `brakingShare`; projected
 * on skis heading `ski` off the fall line, against the snow's normal load. `mass` is the mass path's heading.
 */
export const brakingTilt = (s: DrillScenario, ski: number, mass: number, load: number): number => {
  const share = s.brakingShare ?? 0;
  if (share === 0) return 0;
  const slope = (s.slopeDeg * Math.PI) / 180;
  const along = Math.max(0, Math.sin(slope) * Math.cos(mass) - DRAG_PER_V2 * s.speedMps ** 2);
  return Math.atan2(share * along * Math.cos(ski - mass), load);
};

/** Turn time of each phase's key pose; the transition is at 0. */
export const PHASE_T = { transition: 0, initiation: 1 / 6, shaping: 1 / 2, finish: 5 / 6 } as const;

const wrap = (t: number): number => ((t % 1) + 1) % 1;

/**
 * Heading at the finish key, below the fall line. The radius opens through completion, so the load
 * peaks here rather than across the hill (falda-buscaiot-2017, zorko-2015, lind-sanders-2004 Table 6.1);
 * the transition covers the rest of the heading.
 */
export const FINISH_HEADING = (3 * Math.PI) / 4;

/** Heading through the arc: initiation at the top (0), shaping in the fall line, finish below it; null in the transition. */
export const headingAt = (t: number): number | null => {
  const u = wrap(t);
  // Wrapping costs an ulp, so the phase keys land a hair off.
  if (u < PHASE_T.initiation - 1e-12 || u > PHASE_T.finish + 1e-12) return null;
  const x = Math.min(1, Math.max(0, (u - PHASE_T.initiation) / (PHASE_T.finish - PHASE_T.initiation)));
  // Smooth and monotone, with the shaping key on the fall line; still at the finish, so the forces ease into the transition.
  return FINISH_HEADING * x * (4 + x - 2 * x * x) / 3;
};

export const phaseForces = (s: TurnScenario): { readonly initiation: TurnForces; readonly shaping: TurnForces; readonly finish: TurnForces } => ({
  initiation: forcesAt(s, 0),
  shaping: forcesAt(s, Math.PI / 2),
  finish: forcesAt(s, FINISH_HEADING),
});

/** Fall-line load were the mass on the skis' arc: the effort key, which a straighter mass path must not soften. */
export const arcLoad = (s: TurnScenario): number => phaseForces({ speedMps: s.speedMps, radiusM: s.radiusM, slopeDeg: s.slopeDeg }).shaping.load;

export const smooth = (u: number): number => u * u * (3 - 2 * u);

/**
 * Load share of the outside foot at turn time `t`: even through the edge change, growing with the turn's tilt to the
 * mid-turn split `peak`.
 */
export const outsideShareFrom = (peak: number, s: TurnScenario, t: number): number => {
  const u = Math.min(1, Math.max(0, turnForcesAt(s, t).tilt / Math.max(1e-9, phaseForces(s).shaping.tilt)));
  // Smoothstep: flat at the switch, so the share has no V across the mirror.
  return 0.5 + (peak - 0.5) * smooth(u);
};

/** Cubic Hermite on 0..1 from `a`, still, to `b` at slope `m` (per unit of u). */
const easeTo = (a: number, b: number, m: number, u: number): number => a + (b - a) * smooth(u) + m * u * u * (u - 1);

/**
 * Rate the tilt passes through 0 at the switch, per unit of turn time: monotone (Fritsch-Carlson) through
 * the finish tilt, 0, and the next turn's initiation tilt with its sign flipped.
 */
const switchRate = (s: TurnScenario): number => {
  const finish = forcesAt(s, FINISH_HEADING).tilt;
  const initiation = forcesAt(s, 0).tilt;
  const d0 = -finish / (1 - PHASE_T.finish);
  const d1 = -initiation / PHASE_T.initiation;
  if (d0 * d1 <= 0) return 0;
  const secant = -(finish + initiation) / (1 - PHASE_T.finish + PHASE_T.initiation);
  return Math.sign(d0) * Math.min(Math.abs(secant), 3 * Math.abs(d0), 3 * Math.abs(d1));
};

/**
 * Through a turn whose mass rides the skis' arc, a share of the peak: the path's curvature into the turn, the lean as
 * the edges release. Gravity's pull across the path curves it on flat skis, so the share is nil at the switch. The
 * radius tightens progressively and is least at about two thirds of the turn (sporri-2016-sidecut Fig 4), where the pressure
 * peaks (carv-ligety-2024); the edge builds ahead of it (carv-ligety-2024, reid-2020 Fig 4).
 */
/** Turn time of the least radius and the peak load: the legacy turns' and a task's without a force-peak window. */
const ARC_PEAK_T = 0.61;
const ARC_SHARE: ReadonlyArray<readonly [number, number]> = [
  [0, 0],
  [1 / 12, 0.36],
  [1 / 6, 0.59],
  [1 / 4, 0.76],
  [1 / 3, 0.86],
  [5 / 12, 0.93],
  [1 / 2, 0.97],
  [ARC_PEAK_T, 1],
  [3 / 4, 0.86],
  [5 / 6, 0.68],
  [11 / 12, 0.47],
  [1, 0],
];
/** Rate the curvature share leaves nil at the switch, per unit of turn time. */
const SWITCH_RATE = 5;

/** Monotone cubic Hermite (Fritsch-Carlson) through `knots`, with the end slopes given. */
const monotone = (knots: ReadonlyArray<readonly [number, number]>, d0: number, d1: number, x: number): number => {
  const n = knots.length;
  const at = (i: number): readonly [number, number] => knots[Math.min(n - 1, Math.max(0, i))] ?? [0, 0];
  const secant = (i: number): number => (at(i + 1)[1] - at(i)[1]) / (at(i + 1)[0] - at(i)[0]);
  const tangent = (i: number): number => {
    if (i === 0) return d0;
    if (i === n - 1) return d1;
    const a = secant(i - 1);
    const b = secant(i);
    if (a * b <= 0) return 0;
    const m = (at(i + 1)[1] - at(i - 1)[1]) / (at(i + 1)[0] - at(i - 1)[0]);
    return Math.sign(m) * Math.min(Math.abs(m), 3 * Math.abs(a), 3 * Math.abs(b));
  };
  let i = 0;
  while (i < n - 2 && at(i + 1)[0] <= x) i++;
  const [x0, y0] = at(i);
  const [x1, y1] = at(i + 1);
  const h = x1 - x0;
  const s = (x - x0) / h;
  return (2 * s ** 3 - 3 * s ** 2 + 1) * y0 + (s ** 3 - 2 * s ** 2 + s) * h * tangent(i) + (-2 * s ** 3 + 3 * s ** 2) * y1 + (s ** 3 - s ** 2) * h * tangent(i + 1);
};

/**
 * Forces on a turn whose mass rides the skis' arc. The lean peaks as at the finish key, the radius held to 45° below
 * the fall line, so the peak lean and load stay. Into the turn its tangent follows the curvature, so a faster turn
 * tips sooner (carv-ligety-2024); past the peak it eases off by ARC_SHARE, at the rate it left the switch.
 */
const arcForcesAt = (s: TurnScenario, t: number): TurnForces => {
  const cos = Math.cos((s.slopeDeg * Math.PI) / 180);
  const peak = forcesAt(s, FINISH_HEADING).tilt;
  const u = wrap(t);
  // The lean's rate through the switch, matched by the release so the mirrored turn joins without a kink.
  const rate = (SWITCH_RATE * Math.tan(peak)) / Math.max(1e-9, peak);
  const share = monotone(ARC_SHARE, SWITCH_RATE, -rate, u);
  const tilt = u <= ARC_PEAK_T ? Math.atan(Math.tan(peak) * share) : peak * share;
  return { load: cos / Math.cos(tilt), tilt };
};

/**
 * Forces at turn time `t`. Where the mass rides the skis' arc, as ARC_SHARE says; on a straighter mass path, as in
 * moguls, through the phase keys' headings. Through the transition the edges change: the load eases to the slope's
 * normal share of weight, and the tilt passes through 0 at the switch without stopping there, into the mirrored next turn.
 */
export const turnForcesAt = (s: TurnScenario, t: number): TurnForces => {
  if (s.comRadiusM === undefined) return arcForcesAt(s, t);
  const beta = headingAt(t);
  if (beta !== null) return forcesAt(s, beta);
  const u = wrap(t);
  const flat = Math.cos((s.slopeDeg * Math.PI) / 180);
  const rate = switchRate(s);
  if (u > PHASE_T.finish) {
    const from = forcesAt(s, FINISH_HEADING);
    const x = (u - PHASE_T.finish) / (1 - PHASE_T.finish);
    return { load: flat + (from.load - flat) * smooth(1 - x), tilt: easeTo(from.tilt, 0, rate * (1 - PHASE_T.finish), x) };
  }
  const to = forcesAt(s, 0);
  const x = 1 - u / PHASE_T.initiation;
  return { load: flat + (to.load - flat) * smooth(1 - x), tilt: easeTo(to.tilt, 0, rate * PHASE_T.initiation, x) };
};

/** How a drill shares the load between the feet. */
export interface TurnDrill {
  /** Outside foot's share with both skis on the snow: 0.6–0.75 (heinrich-2022, falda-buscaiot-2017). */
  readonly outsideShare: number;
  /** The inside ski leaves the snow, as in a stork turn. */
  readonly liftsInside: boolean;
}

export const STORK_DRILL: TurnDrill = { outsideShare: 0.65, liftsInside: true };

/** Outside foot's share given how far the inside ski is lifted (0..1); all of it once lifted. */
export const outsideShare = (drill: TurnDrill, lifted: number): number =>
  drill.liftsInside ? drill.outsideShare + (1 - drill.outsideShare) * Math.min(1, Math.max(0, lifted)) : drill.outsideShare;

/** Outside-leg load over body weight at turn time `t`. */
export const outsideLoadAt = (s: TurnScenario, drill: TurnDrill, t: number, lifted: number): number => turnForcesAt(s, t).load * outsideShare(drill, lifted);

/** ARC_SHARE's own time at turn time `t` with its peak moved to `peak`: t + c sin²(πt), slope 1 at both ends so the seam stays C1; inferred. */
const unwarp = (t: number, peak: number): number => t + ((ARC_PEAK_T - peak) / Math.sin(Math.PI * peak) ** 2) * Math.sin(Math.PI * t) ** 2;

/** The arc share at `t` with its peak at `peak`. */
const arcShareOf = (t: number, peak: number): number => Math.min(1, Math.max(0, monotone(ARC_SHARE, SWITCH_RATE, -SWITCH_RATE, unwarp(wrap(t), peak))));

/** Share of the skis' curvature the mass path takes at turn time `t` (motion-model §4.4): 0 at the switch, 1 at ARC_PEAK_T; inferred. */
export const arcShareAt = (t: number): number => arcShareOf(t, ARC_PEAK_T);

/** Mass path forces at turn time `t`; radians. */
export interface MassPathForces {
  /** Balance-axis lean from the slope normal toward the turn's inside. */
  readonly lean: number;
  /** Snow force over body weight. */
  readonly load: number;
  /** The mass path's heading: π/2 down the fall line. */
  readonly heading: number;
  /** The load's build-up share: 0 at the switch, above one half while loaded (engagement to release). */
  readonly arcShare: number;
  /** Speed on the mass path, m/s. */
  readonly speed: number;
}

export interface ProfilePoint extends MassPathForces {
  /** Edge angle toward the turn's inside; negative on the old edges. */
  readonly edge: number;
  readonly skiRadius: number;
  /** Attack angle γ, degrees. */
  readonly attack: number;
  /** Share of the skis' curvature the mass path takes, w = r_ski κ_mass. */
  readonly massShare: number;
  /** The mass's height over the ski base under the boots, along its normal, metres; null off moguls. */
  readonly clearance: number | null;
  /** Carve only: the outside ski's share of the leg force, the pressure centre's (§7). */
  readonly outsideShare?: number;
  /** Each ski's bend radius under its share of the load square to its base, metres (mogulMassOf); null off moguls. */
  readonly bendRadius: number | null;
}

/** Cycle means of the speed balance's terms over the path, in g: what gravity gives and what takes it. */
export interface EnergyMeans {
  readonly gain: number;
  readonly friction: number;
  readonly skid: number;
  readonly bump: number;
  readonly drag: number;
}

/** How the speed's fixed point closed. */
export interface SpeedClosure {
  /** A closing root holds the mean speed: γ_e on bumps, β_h on groomed snow. */
  readonly root: boolean;
  readonly converged: boolean;
  readonly passes: number;
  /** v(1) − v(0), m/s. */
  readonly residual: number;
}

/** One sampled cycle of a task: the mass path, the skis' arc and the edge, solved together. */
export interface TurnProfile {
  readonly t: ReadonlyArray<number>;
  /** The load's build-up share (arcShareAt), the loaded marker. */
  readonly arcShare: ReadonlyArray<number>;
  /** Mass-path curvature share w = r_ski κ_mass: g sinθ cosβ r_ski / v² at the switch, −that at the cycle's end. */
  readonly massShare: ReadonlyArray<number>;
  readonly heading: ReadonlyArray<number>;
  readonly lean: ReadonlyArray<number>;
  readonly load: ReadonlyArray<number>;
  readonly edge: ReadonlyArray<number>;
  readonly skiRadius: ReadonlyArray<number>;
  readonly periodS: number;
  /** Half the mass heading's sweep about the fall line. */
  readonly halfSweep: number;
  /** Half the skis' heading sweep. */
  readonly skisHalfSweep: number;
  /** The mass the moguls turn rides (mogulMassFor); null off moguls. */
  readonly mogul: MogulMass | null;
  readonly events: TurnEvents;
  /** Speed on the mass path, m/s; its time mean is the task's speedMps. */
  readonly speed: Float64Array;
  /** Attack angle γ, degrees: the set plus the closure's skid; the skis' yaw less their travel's on bumps (skiHeadingAt). */
  readonly attack: ReadonlyArray<number>;
  /** The closure's skid at its peak, degrees: γ_e on groomed snow, γ's amplitude on bumps. */
  readonly gammaE: number;
  readonly energy: EnergyMeans;
  /** Path length from the switch, metres, at t[i] and, last, the cycle's end. */
  readonly pathM: ReadonlyArray<number>;
  readonly closure: SpeedClosure;
  readonly at: (t: number) => ProfilePoint;
  /** Groomed only: the skis' heading, path travel plus γ, radians (skiHeadingAt). */
  readonly skiHeading?: ReadonlyArray<number>;
  /** Groomed only: ε_c − λ, the carved edge toward the skis' turn less the lean, radians (rule 1). */
  readonly carveMargin?: ReadonlyArray<number>;
  /** Carve only: the outside ski's share, the pressure centre's place between the skis. */
  readonly outsideShare?: ReadonlyArray<number>;
  /** Groomed only: the roundest feasible half sweep, ≤ π/2: the f(0) = 0 fold, a flag edge, or the cap. */
  readonly topHalfSweep?: number;
  /** Groomed only: which bound set topHalfSweep. */
  readonly topBound?: TopBound;
  /** Groomed only: the peak lateral over normal snow force the edge holds, |f| / cos θ = tan λ; a check, never a solve input. */
  readonly gripDemand?: number;
  /** Groomed only: the solvable space's boundary the task crossed, else none. */
  readonly boundary?: Boundary;
  /** Groomed only: the carve's bridge D over the turn, and rule 7's least. */
  readonly bridgeShare?: number;
  readonly bridgeShareMin?: number;
  /** Groomed only: 1 − S / F(0.5) where the carve oversweeps at δ 0.5, else 0. */
  readonly sigmaMin?: number;
  /** Groomed only: the σ the profile was solved at, where the task's own leaves the space. */
  readonly solvedSigma?: number;
  /** σ 0 only: the carve's outputs and flags. */
  readonly carve?: CarveReport;
}

const SAMPLES = 720;

/** Turn time where the along-track distance `target` falls, the samples' distances `along` linear between them. */
const timeAlong = (along: Float64Array, length: number, target: number): number => {
  const n = along.length;
  const s = ((target % length) + length) % length;
  let i = 0;
  while (i + 1 < n && (along[i + 1] ?? 0) <= s) i++;
  const [a, b] = [along[i] ?? 0, i + 1 < n ? (along[i + 1] ?? 0) : length];
  return (i + (s - a) / (b - a)) / n;
};

/**
 * The zipper snow along the skis' track of a bump task swinging `swing` across, SAMPLES a turn: its crest, its trough,
 * and the hit, where the tip, skiEnds' tip ahead of the boot along the track, passes the trough's bottom onto the next
 * face (P4).
 */
const trackAt = (task: TurnTask, swing: number): ZipperTrack => {
  // The skis ride their own line at steady speed, as surface.ts lays it.
  const snow = zipperTrack({ spacing: task.bumpSpacingM, relief: task.bumpHeightM, swing }, SAMPLES);
  const { along, length } = alongOf(snow.pace);
  const bottom = along[Math.round(snow.trough * SAMPLES) % SAMPLES] ?? 0;
  return { ...snow, hit: timeAlong(along, length, bottom - skiEnds(task.ski).tip) };
};

const bridgeOn = (task: TurnTask, track: ZipperTrack): Bridge => {
  const { tail, tip } = skiEnds(task.ski);
  return { ...alongOf(track.pace), tail, tip, massKg: REFERENCE_SKIER.mass };
};

/** The moguls cell's inside-foot share per sample of a turn of `n`, as the solve's weightSplit gives it. */
export const mogulInsideShare = (task: TurnTask, n: number): Float64Array => {
  const s = task.legacy.shareScenario;
  if (s === null) throw new Error('mogulInsideShare: the task has no share scenario');
  return Float64Array.from({ length: n }, (_, i) => 1 - outsideShareFrom(task.style.outsideShare, s, i / n));
};

/**
 * The mass over a track at the task's period, the skis bridging (mogulMassOf, P3b) on the planned edge, the lean (a
 * skidding ski sits at the slip threshold), the pendulum on the solve's pressure centre at the cell's inside share.
 */
const massOn = (task: TurnTask, track: ZipperTrack): MogulMass => {
  const n = track.height.length;
  const edging = { margin: new Float64Array(n), sidecutM: task.ski.sidecutRadius };
  const pressure = { insideShare: mogulInsideShare(task, n), stanceM: MOGUL_STANCE_M, geometry: contactGeometryOf(task) };
  return mogulMassOf(track.height, track.across, task.bumpSpacingM / task.speedMps, task.slopeDeg * DEG_RAD, REACH, bridgeOn(task, track), edging, pressure);
};

/** A bump task's own line: the swing, its track and the mass over it. */
export type MogulLineFit = SwingFit<{ readonly track: ZipperTrack; readonly mass: MogulMass }>;

// Keyed on what it reads, so a twin task finds it.
const mogulLines = new Map<string, MogulLineFit>();
/**
 * Each skier cuts the line they ride (P7a): the swing for which the cell's own ride (track, absorption, pendulum at its
 * pace) leans the mass line MOGUL_LEAN_RATIO, from the harmonic guess.
 */
export const mogulLineFor = (task: TurnTask): MogulLineFit => {
  const key = [task.style.outsideShare, JSON.stringify(task.legacy.shareScenario), task.bumpSpacingM, task.bumpHeightM, task.radiusM, task.speedMps, task.slopeDeg, task.ski.length, task.ski.sidecutRadius].join();
  let line = mogulLines.get(key);
  if (line === undefined) {
    const periodS = task.bumpSpacingM / task.speedMps;
    const guess = harmonicSwing(MOGUL_LEAN_RATIO, (REACH[0] + REACH[1]) / 2, G * Math.cos(task.slopeDeg * DEG_RAD), periodS);
    line = swingForLean(
      MOGUL_LEAN_RATIO,
      guess,
      (swing) => {
        const track = trackAt(task, swing);
        return { track, mass: massOn(task, track) };
      },
      (r) => leanRatioOf(r.mass, r.track.across),
      (r) => r.mass.settled && r.mass.leanSettled,
    );
    mogulLines.set(key, line);
  }
  return line;
};

/** The zipper snow along the skis' track of a bump task, its own line (mogulLineFor). */
export const mogulTrackOf = (task: TurnTask): ZipperTrack => mogulLineFor(task).ride.track;

/** The task's ski on its zipper track: the track's distance, the ski's ends about the boot, the skier's mass. */
export const bridgeOf = (task: TurnTask): Bridge => bridgeOn(task, mogulTrackOf(task));

/** The mass the turn rides (P4) and rule 9 checks (P5), over the cell's own line. */
export const mogulMassFor = (task: TurnTask): MogulMass => mogulLineFor(task).ride.mass;

/** The moguls turn's series per sample, the cycle's end (index n) closing on the mirrored next turn. */
interface MogulSeries {
  /** The resultant along the leg s / (g cos λ), BW, and the support square to the slope s / g. */
  readonly load: ReadonlyArray<number>;
  readonly support: ReadonlyArray<number>;
  /** tan λ = (x_mass − x_ski) / h: the leg axis from the skis to the mass. */
  readonly tanLean: ReadonlyArray<number>;
  /** Sine of the boot track's slope along the track. */
  readonly sinBoot: ReadonlyArray<number>;
  /** The mass path's heading and curvature, 1/m. */
  readonly heading: ReadonlyArray<number>;
  readonly kappa: ReadonlyArray<number>;
  readonly halfSweep: number;
  readonly skisHalfSweep: number;
}

/**
 * The mass path from the pendulum's x_mass, down the slope with the skis at the track's pace: the mass rides no
 * faster than the bumps come, so the speed's swing does not re-time them.
 */
const mogulSeriesOf = (track: ZipperTrack, mass: MogulMass): MogulSeries => {
  const n = track.height.length;
  const at = (a: ArrayLike<number>, i: number, sign: number): number => (i < 0 ? sign * (a[i + n] ?? 0) : i >= n ? sign * (a[i - n] ?? 0) : (a[i] ?? 0));
  // Per unit turn time; across positions mirror at the seam, heights repeat.
  const rate = (a: ArrayLike<number>, i: number, sign: number): number => ((at(a, i + 1, sign) - at(a, i - 1, sign)) * n) / 2;
  const accel = (a: ArrayLike<number>, i: number, sign: number): number => (at(a, i + 1, sign) - 2 * at(a, i, sign) + at(a, i - 1, sign)) * n * n;
  const down = Float64Array.from(track.pace, (p, i) => Math.sqrt(Math.max(0, p * p - rate(track.across, i, -1) ** 2)));
  const idx = Array.from({ length: n + 1 }, (_, i) => i);
  const side = (i: number): number => (i < n ? 1 : -1);
  const beta = Array.from({ length: n }, (_, i) => Math.atan2(down[i] ?? 0, -rate(mass.across, i, -1)));
  const kappa = Array.from({ length: n }, (_, i) => {
    const [xd, xdd, zd, zdd] = [rate(mass.across, i, -1), accel(mass.across, i, -1), down[i] ?? 0, rate(down, i, 1)];
    return (zd * xdd - xd * zdd) / Math.hypot(xd, zd) ** 3;
  });
  return {
    load: idx.map((i) => mass.load[i % n] ?? 0),
    support: idx.map((i) => (mass.support[i % n] ?? 0) / G),
    tanLean: idx.map((i) => (side(i) * ((mass.across[i % n] ?? 0) - (mass.pivot[i % n] ?? 0))) / (mass.clearance[i % n] ?? 1)),
    sinBoot: idx.map((i) => {
      const tan = rate(mass.boot, i % n, 1) / (track.pace[i % n] ?? 1);
      return tan / Math.hypot(1, tan);
    }),
    heading: [...beta, Math.PI - (beta[0] ?? 0)],
    kappa: [...kappa, -(kappa[0] ?? 0)],
    halfSweep: Math.max(...beta.map((b) => Math.abs(b - Math.PI / 2))),
    skisHalfSweep: Math.max(...Array.from(down, (d, i) => Math.atan2(Math.abs(rate(track.across, i, -1)), d))),
  };
};

const same = (y: number): number => y;
const flip = (y: number): number => -y;
const lerp = (a: ReadonlyArray<number>, x: number, mirror: (y: number) => number): number => {
  const n = a.length;
  const u = wrap(x) * n;
  const i = Math.floor(u);
  const y0 = a[i % n] ?? 0;
  // Past the last sample the cycle closes on the next turn's first one, mirrored.
  const y1 = i + 1 < n ? (a[i + 1] ?? y0) : mirror(a[0] ?? 0);
  return y0 + (y1 - y0) * (u - i);
};

const profiles = new WeakMap<TurnTask, Map<string, TurnProfile>>();

/** First sample where `pred` holds from index `from`, as turn time. */
const firstWhere = (n: number, from: number, pred: (i: number) => boolean): number => {
  for (let i = from; i < n; i++) if (pred(i)) return i / n;
  return Number.NaN;
};

/** The early skid's share of γ_e at `t`: [4x(1 − x)]² over x = t / peak, 0 after; squared so it is C¹ at both ends; inferred. */
const earlySkidAt = (t: number, peak: number): number => {
  const x = wrap(t) / peak;
  return x >= 1 ? 0 : (4 * x * (1 - x)) ** 2;
};

/** γ_e is sought on [0, GAMMA_E_MAX]; reid-2020's attack angles stay well under it. */
const GAMMA_E_MAX = 60 * DEG_RAD;
const PASS_CAP = 50;
/** Floor on the integrated speed so a cell that cannot hold its speed still integrates; rule 7 reports it. */
export const V_FLOOR = 0.05;

export interface SolveOptions {
  /** Hold v at the task's speed: today's profile, for comparison. */
  readonly constantSpeed?: boolean;
  /** Groomed only: samples per cycle in place of SAMPLES, for coarse sweeps. */
  readonly samples?: number;
  /** Scratch probes: one row per outer pass. */
  readonly trace?: (row: Readonly<Record<string, number>>) => void;
  /** Rule 7's edge rate in place of EDGE_RATE_DEG_S, for its sweep. */
  readonly edgeRateDegS?: number;
  /** Groomed only: friction, a number or the speed law a + b v, in place of EDGE_FRICTION (carve) or the snow's constant. */
  readonly friction?: number | { readonly a: number; readonly b: number };
  /** Groomed only: drag area CdA, m², in place of DRAG_AREA_M2 over REFERENCE_SKIER.mass (carve) or DRAG_PER_V2. */
  readonly dragAreaM2?: number;
  /** σ 0 only: snow compliance c, m/N, in place of the snow's SNOW_COMPLIANCE. */
  readonly snowCompliance?: number;
  /** σ 0 only: §7's movement range, m, in place of the task's (0 without one: h constant). */
  readonly movementRangeM?: number;
  /** σ 0 only: §7's transition phase, turn phase of the lowest h, in place of the task's (0 without one). */
  readonly transitionPhase?: number;
  /** σ 0 only: the skis' heading at the switch (λ 0) from the fall line, degrees; absent: 90, straight across. */
  readonly switchHeadingDeg?: number;
  /** σ 0 probe only: the stepped leg in place of the movement harmonic; absent: the harmonic. */
  readonly legStep?: LegStep;
  /** σ 0 only: the baked cycles in place of carve-cycles.json. */
  readonly carveCells?: CarveCells;
}

interface Geometry {
  readonly skiRadius: ReadonlyArray<number>;
  readonly w: ReadonlyArray<number>;
  readonly kappa: ReadonlyArray<number>;
  readonly heading: ReadonlyArray<number>;
  readonly periodS: number;
  readonly halfSweep: number;
}

/** Heun's steps over the grid from v(0); `accel(i, v)` is dv per unit turn time. */
const heun = (n: number, accel: (i: number, v: number) => number, v0: number): Float64Array => {
  const out = new Float64Array(n + 1);
  out[0] = v0;
  for (let i = 0; i < n; i++) {
    const vi = out[i] ?? 0;
    const a = accel(i, vi);
    const vp = Math.max(V_FLOOR, vi + a / n);
    const b = accel(i + 1, vp);
    out[i + 1] = Math.max(V_FLOOR, vi + (a + b) / (2 * n));
  }
  return out;
};

const meanOf = (v: Float64Array, n: number): number => {
  let s = 0;
  for (let i = 0; i < n; i++) s += (v[i] ?? 0) / n;
  return s;
};

/** v(0) by secant so that the time mean of `run(v0)` is `vMean`. */
const holdMean = (n: number, vMean: number, run: (v0: number) => Float64Array, guess: number): Float64Array => {
  let x0 = guess;
  let v = run(x0);
  let e0 = meanOf(v, n) - vMean;
  let x1 = guess - e0;
  for (let j = 0; j < 12 && Math.abs(e0) >= 1e-9; j++) {
    const next = run(x1);
    const e1 = meanOf(next, n) - vMean;
    v = next;
    if (Math.abs(e1) < 1e-9 || e1 === e0) break;
    const x2 = x1 - (e1 * (x1 - x0)) / (e1 - e0);
    [x0, e0, x1] = [x1, e1, x2];
  }
  return v;
};

/** A bump task's cycle: the line's mass path (mogulLineFor), the speed from the energy balance with the least skid. */
const solveBumps = (task: TurnTask, snow: Snow, options: SolveOptions): TurnProfile => {
  const n = SAMPLES;
  const vMean = task.speedMps;
  const theta = task.slopeDeg * DEG_RAD;
  const sin = Math.sin(theta);
  const peakT = task.arcPeakT ?? ARC_PEAK_T;
  const mu = GLIDING_FRICTION[snow];
  const ts = Array.from({ length: n }, (_, i) => i / n);
  // Index n is the cycle's end, t = 1, for the integration.
  const idx = Array.from({ length: n + 1 }, (_, i) => i);
  // The legacy share, nil at the switch, keeps the release's timing.
  const legacy = ts.map((t) => arcShareOf(t, peakT));
  const track = mogulTrackOf(task);
  const mogul = mogulMassFor(task);
  const ride = mogulSeriesOf(track, mogul);
  const top = legacy.indexOf(Math.max(...legacy));
  const engagement = track.crest;
  const release = firstWhere(n, top, (i) => (legacy[i] ?? 0) < 0.5);
  // The closure's skid shape per sample, 1 at its peak: the least skid.
  let skidShape = idx.map((i) => earlySkidAt(i / n, peakT));

  const geo: Geometry = {
    skiRadius: idx.map(() => task.radiusM),
    w: ride.kappa.map((x) => x * task.radiusM),
    kappa: ride.kappa,
    heading: ride.heading,
    periodS: task.bumpSpacingM / vMean,
    halfSweep: ride.halfSweep,
  };
  // Across the slope, BW: the pendulum's ẍ / g = (s / g) tan λ.
  const across = (i: number): number => (ride.support[i] ?? 0) * (ride.tanLean[i] ?? 0);
  /** The speed balance's terms at sample i and speed vv, in g: gain, friction, skid, bump, drag. */
  const terms = (i: number, vv: number, gammaE: number): readonly [number, number, number, number, number] => {
    const beta = geo.heading[i] ?? 0;
    const f = across(i);
    const gamma = gammaE * (skidShape[i] ?? 0);
    return [sin * Math.sin(beta), mu * (ride.load[i] ?? 0), Math.max(0, f) * Math.tan(gamma), (ride.support[i] ?? 0) * (ride.sinBoot[i] ?? 0), DRAG_PER_V2 * vv * vv];
  };
  const net = (i: number, vv: number, gammaE: number): number => {
    const [gain, friction, skid, bump, drag] = terms(i, vv, gammaE);
    return gain - friction - skid - bump - drag;
  };
  // The cycle's net work per unit mass over g T, at the frozen speed.
  const work = (v: Float64Array, gammaE: number): number => {
    let s = 0;
    for (let i = 0; i < n; i++) s += net(i, v[i] ?? 0, gammaE) * (v[i] ?? 0);
    return s;
  };
  const closingAngle = (v: Float64Array): { readonly gammaE: number; readonly root: boolean } => {
    if (work(v, 0) < 0) return { gammaE: 0, root: false };
    if (work(v, GAMMA_E_MAX) > 0) return { gammaE: GAMMA_E_MAX, root: false };
    // Only the skid term depends on γ_e: sum the rest once.
    let rest = 0;
    const skidWeight = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      const vi = v[i] ?? 0;
      const [gain, friction, , bump, drag] = terms(i, vi, 0);
      rest += (gain - friction - bump - drag) * vi;
      skidWeight[i] = Math.max(0, across(i)) * vi;
    }
    const workAt = (gammaE: number): number => {
      let s = rest;
      for (let i = 0; i < n; i++) s -= (skidWeight[i] ?? 0) * Math.tan(gammaE * (skidShape[i] ?? 0));
      return s;
    };
    let a = 0;
    let b = GAMMA_E_MAX;
    for (let j = 0; j < 60; j++) {
      const m = (a + b) / 2;
      if (workAt(m) > 0) a = m;
      else b = m;
    }
    return { gammaE: (a + b) / 2, root: true };
  };
  const speedFrom = (gammaE: number, guess: number): Float64Array =>
    holdMean(n, vMean, (v0) => heun(n, (i, vv) => geo.periodS * G * net(i, vv, gammaE), v0), guess);
  // The leg axis, skis to mass: tan λ = (x_mass − x_ski) / h, ẍ / s while supported.
  const lean = ts.map((_, i) => Math.atan(ride.tanLean[i] ?? 0));
  // Least ∫γ² dt for the closure's ∫ f v tan γ dt: γ ∝ f⁺ v to first order; the objective is inferred.
  const leastSkid = (v: Float64Array): number[] => {
    const w = idx.map((i) => Math.max(0, across(i)) * (v[i] ?? 0));
    const most = Math.max(...w);
    return most > 0 ? w.map((x) => x / most) : w;
  };

  let v: Float64Array = new Float64Array(n + 1).fill(vMean);
  let gammaE = 0;
  let root = true;
  let passes = 0;
  let converged = false;
  for (let pass = 0; pass < PASS_CAP && !converged; pass++) {
    passes = pass + 1;
    const before = gammaE;
    skidShape = leastSkid(v);
    if (options.constantSpeed !== true) {
      ({ gammaE, root } = closingAngle(v));
      v = speedFrom(gammaE, v[0] ?? vMean);
    }
    converged = Math.abs(gammaE - before) < 1e-6 * DEG_RAD;
  }
  if (root && options.constantSpeed !== true) {
    // W's sum is not Heun's: close the discrete cycle by secant on γ_e from W's root.
    const gap = (x: number): readonly [number, Float64Array] => {
      const vv = speedFrom(x, v[0] ?? vMean);
      return [(vv[n] ?? 0) - (vv[0] ?? 0), vv];
    };
    let x0 = gammaE;
    let [r0, v0] = gap(x0);
    let best = { x: x0, r: r0, v: v0 };
    let x1 = gammaE + 1e-4;
    for (let j = 0; j < 8 && Math.abs(best.r) >= 1e-10; j++) {
      const [r1, v1] = gap(x1);
      if (Math.abs(r1) < Math.abs(best.r)) best = { x: x1, r: r1, v: v1 };
      if (r1 === r0) break;
      const x2 = Math.min(GAMMA_E_MAX, Math.max(0, x1 - (r1 * (x1 - x0)) / (r1 - r0)));
      [x0, r0, x1] = [x1, r1, x2];
    }
    ({ x: gammaE, v } = best);
  }
  const residual = (v[n] ?? 0) - (v[0] ?? 0);
  // A skidding ski sits at the slip threshold: the edge is the lean, margin 0.
  const edge = lean;
  const load = ts.map((_, i) => ride.load[i] ?? 0);
  const heading = geo.heading.slice(0, n);
  const w = geo.w.slice(0, n);
  const skiRadius = geo.skiRadius.slice(0, n);
  const speed = v.slice(0, n);
  const attack = ts.map((_, i) => (gammaE * (skidShape[i] ?? 0)) / DEG_RAD);
  const pathM = [0];
  for (let i = 1; i <= n; i++) pathM.push((pathM[i - 1] ?? 0) + (geo.periodS * ((v[i - 1] ?? 0) + (v[i] ?? 0))) / (2 * n));
  const sums = [0, 0, 0, 0, 0];
  let along = 0;
  for (let i = 0; i < n; i++) {
    const vi = v[i] ?? 0;
    terms(i, vi, gammaE).forEach((x, j) => (sums[j] = (sums[j] ?? 0) + x * vi));
    along += vi;
  }
  const [gain = 0, friction = 0, skid = 0, bump = 0, drag = 0] = sums.map((s) => s / along);
  const peakAt = load.indexOf(Math.max(...load));
  const events: TurnEvents = {
    switch: 0,
    engagement,
    fallLine: firstWhere(n, 0, (i) => (heading[i] ?? 0) >= Math.PI / 2),
    forcePeak: peakAt / n,
    release,
  };
  const series = { arcShare: legacy, massShare: w, heading, lean, load, edge, skiRadius };
  const speedList = [...speed];
  const at = (t: number): ProfilePoint => ({
    arcShare: lerp(legacy, t, same),
    massShare: lerp(w, t, flip),
    heading: lerp(heading, t, (y) => Math.PI - y),
    lean: lerp(lean, t, flip),
    load: lerp(load, t, same),
    edge: lerp(edge, t, flip),
    skiRadius: lerp(skiRadius, t, same),
    speed: lerp(speedList, t, same),
    attack: lerp(attack, t, same),
    clearance: lerp([...mogul.clearance], t, same),
    bendRadius: lerp([...mogul.radius], t, same),
  });
  return {
    t: ts,
    ...series,
    periodS: geo.periodS,
    halfSweep: geo.halfSweep,
    skisHalfSweep: ride.skisHalfSweep,
    mogul,
    events,
    speed,
    attack,
    gammaE: gammaE / DEG_RAD,
    energy: { gain, friction, skid, bump, drag },
    pathM,
    closure: { root, converged, passes, residual },
    at,
  };
};

/** Mass height over the skis on groomed snow, metres: REACH's mean, inferred; the carve's stance depth. */
export const MASS_HEIGHT_M = (REACH[0] + REACH[1]) / 2;
/** The largest movement range h stays inside REACH at: half its span, metres. */
export const MOVEMENT_RANGE_MAX_M = (REACH[1] - REACH[0]) / 2;

/** §7's mass height over the cycle: stance depth (mean, m), movement range (amplitude, m), transition phase (turn phase of the lowest h). */
export interface StanceMovement {
  readonly meanM: number;
  readonly rangeM: number;
  readonly phase: number;
}

/** h, ḣ, ḧ at turn time t over period `periodS`: one harmonic per turn, lowest at the transition phase (inferred: the minimal periodic shape). */
export const movementHeight =
  (m: StanceMovement, periodS: number) =>
  (t: number): { readonly h: number; readonly hd: number; readonly hdd: number } => {
    const w = (2 * Math.PI) / periodS;
    const a = w * t - 2 * Math.PI * m.phase;
    const c = Math.cos(a);
    return { h: m.meanM - m.rangeM * c, hd: m.rangeM * w * Math.sin(a), hdd: m.rangeM * w * w * c };
  };
/** Where the stepped leg's return to REACH[0] ends: the trigger (h flat through the release) or λ 0 (reid-2010's fall). */
export const LegReturn = { Trigger: 'trigger', Switch: 'switch' } as const;
export type LegReturn = (typeof LegReturn)[keyof typeof LegReturn];

/** A probe's stepped leg: REACH[0] at λ 0, a smoothstep to REACH[1] over `riseS`, a smoothstep back ending at `returnTo`. */
export interface LegStep {
  readonly riseS: number;
  readonly returnTo: LegReturn;
}

/** h, ḣ, ḧ of the stepped leg at turn time t; the trigger and period are fixed points of the march. */
export const stepHeight =
  (step: LegStep, periodS: number, triggerS: number) =>
  (t: number): { readonly h: number; readonly hd: number; readonly hdd: number } => {
    const [lo, d] = [REACH[0], REACH[1] - REACH[0]];
    const tau = step.riseS;
    if (t < tau) {
      const u = t / tau;
      return { h: lo + d * u * u * (3 - 2 * u), hd: (d * 6 * u * (1 - u)) / tau, hdd: (d * (6 - 12 * u)) / (tau * tau) };
    }
    const len = (step.returnTo === LegReturn.Trigger ? triggerS : periodS) - tau;
    // No room for the return after the rise: NaN stops the march rather than jump h.
    if (!(len > 0)) return { h: Number.NaN, hd: Number.NaN, hdd: Number.NaN };
    const u = (t - tau) / len;
    if (u >= 1) return { h: lo, hd: 0, hdd: 0 };
    return { h: lo + d - d * u * u * (3 - 2 * u), hd: (-d * 6 * u * (1 - u)) / len, hdd: (-d * (6 - 12 * u)) / (len * len) };
  };

/** The carve's height: the stepped leg when given, else the movement harmonic itself. */
const heightOf = (m: StanceMovement, step: LegStep | undefined, periodS: number, triggerS: number): CarveInputs['height'] =>
  step === undefined ? movementHeight(m, periodS) : stepHeight(step, periodS, triggerS);
/** Attack Γ of a fully steered turn at its set, degrees; inferred. */
export const STEER_ATTACK_DEG = 35;
/** Least half sweep the groomed closure tries, radians: W < 0 there is outside the skiable space. */
export const LEAST_HALF_SWEEP = 1e-3;
/** The skis' radius reported where they run straight, metres. */
const STRAIGHT_RADIUS_M = 1000;
const GEOMETRY_CAP = 400;
/** Rule 7: the fastest edge change, deg/s: reid-2020 10 m, 5.1° at the switch to 35.7° at t 0.1 of reid-2010's 0.83 s turn; inferred. */
export const EDGE_RATE_DEG_S = (35.7 - 5.1) / (0.1 * 0.83);
/** f(0) reported for a half sweep no τ0 can solve, g: below any root. */
const NO_REACH = -1;
/** The flag edge's width in τ0. */
const EDGE_TAU = 1e-12;
/** Inner steps that run clamped before a σ 0 band flag counts. */
const SETTLE_STEPS = 3;
/** β_h edges of the solvable space to this, radians, refined only where the closure lands on one. */
const EDGE_COARSE = 1e-3;

/** Where the carve's δ sits: F⁻¹(S) inside [δ_min, 0.5], or clamped at one end. */
export const CarveBand = { Inside: 'inside', Above: 'above', Below: 'below' } as const;
export type CarveBand = (typeof CarveBand)[keyof typeof CarveBand];

/** A groomed point outside the solvable space, by the boundary it crossed. */
export const Boundary = {
  None: 'none',
  /** σ 0 and the carve sweeps less than the skis even at δ_min: angulation M would close it. */
  CarveShort: 'carve-short',
  /** σ < σ_min: the carve oversweeps at δ 0.5 and the sine would counter-steer. */
  CounterSteer: 'counter-steer',
  /** W < 0 as β_h → 0: too slow for its pitch. */
  TooSlow: 'too-slow',
  /** W > 0 at the roundest feasible β_h: the carve gains speed every cycle; closure.residual is the gain. */
  SpeedsUp: 'speeds-up',
  /** The cycle cannot close at this β_h (no sweep, no fall-line travel, or no settled geometry). */
  NoGeometry: 'no-geometry',
  /** σ 0: no balance root on the arc at this speed, ski and angulation (CarveReport flags where). */
  TooFastToCarve: 'too-fast-to-carve',
  /** σ 0: the speed runs out before the switch (CarveReport flags where). */
  Stall: 'stall',
} as const;
export type Boundary = (typeof Boundary)[keyof typeof Boundary];

/** What stopped the roundest groomed turn. */
export const TopBound = {
  /** max over τ0 of f(0) is 0: the switch cannot hold a wider sweep. */
  Fold: 'fold',
  /** The solvable space's flag edge (Boundary) below the cap. */
  Edge: 'edge',
  /** β_h = π/2: the turn finishes straight across the hill, never uphill. */
  Cap: 'cap',
} as const;
export type TopBound = (typeof TopBound)[keyof typeof TopBound];

/** The skis' curvature shape c(t): one sine, 0 at t 0, its peak at `peak` by a monotone warp (|c| π < 1 on 0.37–0.75), flipped each turn. */
export const arcCurveAt = (t: number, peak: number): number => {
  const c = (0.5 - peak) / Math.sin(Math.PI * peak) ** 2;
  return Math.sin(Math.PI * (t + c * Math.sin(Math.PI * t) ** 2));
};

/** x of the cyclic tridiagonal system: sub a, diagonal b, super c, corners top-right `up` and bottom-left `down`. */
const cyclicSolve = (a: Float64Array, b: Float64Array, c: Float64Array, up: number, down: number, r: Float64Array): Float64Array => {
  const n = b.length;
  const gamma = -(b[0] ?? 1);
  const bb = Float64Array.from(b);
  bb[0] = (b[0] ?? 0) - gamma;
  bb[n - 1] = (b[n - 1] ?? 0) - (down * up) / gamma;
  const thomas = (rhs: Float64Array): Float64Array => {
    const cp = new Float64Array(n);
    const x = new Float64Array(n);
    let m = bb[0] ?? 1;
    cp[0] = (c[0] ?? 0) / m;
    x[0] = (rhs[0] ?? 0) / m;
    for (let i = 1; i < n; i++) {
      m = (bb[i] ?? 0) - (a[i] ?? 0) * (cp[i - 1] ?? 0);
      cp[i] = (c[i] ?? 0) / m;
      x[i] = ((rhs[i] ?? 0) - (a[i] ?? 0) * (x[i - 1] ?? 0)) / m;
    }
    for (let i = n - 2; i >= 0; i--) x[i] = (x[i] ?? 0) - (cp[i] ?? 0) * (x[i + 1] ?? 0);
    return x;
  };
  const x = thomas(r);
  const u = new Float64Array(n);
  u[0] = gamma;
  u[n - 1] = down;
  const z = thomas(u);
  const fact = ((x[0] ?? 0) + (up * (x[n - 1] ?? 0)) / gamma) / (1 + (z[0] ?? 0) + (up * (z[n - 1] ?? 0)) / gamma);
  for (let i = 0; i < n; i++) x[i] = (x[i] ?? 0) - fact * (z[i] ?? 0);
  return x;
};

/** A groomed cycle's geometry at one half sweep and a frozen speed; arrays hold n + 1 samples, the last the mirrored next turn's first. */
interface GroomedGeometry {
  readonly halfSweep: number;
  readonly periodS: number;
  /** A, 1/m: the skis' curvature is A c(t − shift). */
  readonly amplitude: number;
  readonly shift: number;
  /** The mass path's curvature, 1/m. */
  readonly kappa: Float64Array;
  readonly heading: Float64Array;
  readonly kappaSki: Float64Array;
  /** The skis' travel past the mass heading, atan2(d', 1 − κ d). */
  readonly travel: Float64Array;
  readonly settled: boolean;
  /** False when no τ0 on the rising branch gives f(0) = 0: the half sweep is past what the turn can close. */
  readonly feasible: boolean;
  /** The carve component's bridge half-width δ, turn time: D = 2 δ T. */
  readonly bridgeHalf: number;
  readonly band: CarveBand;
  /** δ_min from rule 7 at this geometry. */
  readonly bridgeHalfMin: number;
  /** 1 − S / F(0.5) below the band, else 0. */
  readonly sigmaMin: number;
  readonly boundary: Boundary;
  /** f(0) at τ0: 0 at a root, else (or when asked) its maximum on the rising branch. */
  readonly reach: number;
  /** The τ0 side of a flag edge where f(0) peaks (a corner), else 0. */
  readonly corner: number;
}

interface GroomedSetup {
  readonly n: number;
  readonly sin: number;
  readonly cos: number;
  readonly peak: number;
  readonly turnSizeM: number;
  readonly kR: number;
  /** 1 − σ. */
  readonly free: number;
  /** Angulation style M, radians. */
  readonly angulationMax: number;
  /** Rule 7's edge rate, rad/s. */
  readonly edgeRate: number;
}

/** A predicted flag edge in τ0 and the bracket walk's first step. */
interface EdgeGuess {
  readonly at: number;
  readonly step: number;
}

/**
 * The mass path whose offset curve, the skis h_m sin λ outside it (tan λ = f / cos θ), has the curvature A c(t − τ0):
 * fixed-point on κ_mass preconditioned by the linear form κ_ski = κ_mass + d″, the sweep and T held exact each step,
 * and τ0 on the rising branch of f(0) so that f(0) = 0.
 */
const groomedGeometry = (s: GroomedSetup, v: Float64Array, halfSweep: number, warm: GroomedGeometry | null, reach = false, probe = false, guess: EdgeGuess | null = null): GroomedGeometry => {
  const { n, sin, cos, peak, turnSizeM, kR, free, angulationMax, edgeRate } = s;
  const lam = new Float64Array(n);
  const ws = new Float64Array(n);
  const carve = new Float64Array(n);
  const carveUp = new Float64Array(n);
  const arcJac = new Float64Array(n);
  let [sweepS, half, halfMin, sigmaMin] = [0, warm?.bridgeHalf ?? 0.25, 0, 0];
  let band: CarveBand = CarveBand.Inside;
  let boundary: Boundary = Boundary.None;
  // λ at turn time t, antiperiodic.
  const lamAt = (t: number): number => {
    let x = t * n;
    let sgn = 1;
    while (x < 0) [x, sgn] = [x + n, -sgn];
    while (x >= n) [x, sgn] = [x - n, -sgn];
    const k = Math.floor(x);
    const l1 = k + 1 < n ? (lam[k + 1] ?? 0) : -(lam[0] ?? 0);
    return sgn * ((lam[k] ?? 0) + (x - k) * (l1 - (lam[k] ?? 0)));
  };
  // κ_H(λ + m) on the arc [δ, 1 − δ] of ski-switch time u, m = (1 − σ) M sin² over the arc.
  const howeAt = (u: number, delta: number, tau: number): number => {
    const span = 1 - 2 * delta;
    const m = span > 0 ? free * angulationMax * Math.sin((Math.PI * (u - delta)) / span) ** 2 : 0;
    return 1 / (kR * Math.cos(lamAt(u + tau) + m));
  };
  // The carve component: Howe on the arc, a cubic Hermite over the bridge [−δ, δ] about the ski switch; its sweep Σ K ws.
  const carveOf = (delta: number, tau: number, out: Float64Array): number => {
    const dt = 1 / n;
    const e = Math.min(0.5, delta);
    const pE = howeAt(e, delta, tau);
    const mE = (howeAt(e + dt, delta, tau) - pE) / dt;
    const pR = howeAt(1 - e, delta, tau);
    const mR = (pR - howeAt(1 - e - dt, delta, tau)) / dt;
    let sum = 0;
    for (let i = 0; i < n; i++) {
      let u = i / n - tau;
      let sgn = 1;
      while (u >= 1) [u, sgn] = [u - 1, -sgn];
      while (u < 0) [u, sgn] = [u + 1, -sgn];
      let k: number;
      if (u >= delta && u <= 1 - delta) k = howeAt(u, delta, tau);
      else if (delta <= 0) k = 0;
      else {
        // Past 1 − δ the sample sits before the next switch: −H(u − 1) by antiperiodicity.
        const x = u < delta ? u : u - 1;
        if (u > 1 - delta) sgn = -sgn;
        const q = (x + delta) / (2 * delta);
        const span = 2 * delta;
        k = (2 * q ** 3 - 3 * q ** 2 + 1) * -pR + (q ** 3 - 2 * q ** 2 + q) * span * -mR + (-2 * q ** 3 + 3 * q ** 2) * pE + (q ** 3 - q ** 2) * span * mE;
        arcJac[i] = 0;
      }
      out[i] = sgn * k;
      sum += sgn * k * (ws[i] ?? 0);
    }
    return sum;
  };
  // Rule 7: D = 2 δ T ≥ (|λ| at both junctions) / rate, m 0 there; λ moves slowly near them (inferred).
  const leastHalf = (tau: number): number => {
    let x = 0;
    for (let j = 0; j < 4; j++) x = Math.min(0.5, (Math.abs(lamAt(x + tau)) + Math.abs(lamAt(1 - x + tau))) / (2 * edgeRate * periodS));
    return x;
  };
  const h = MASS_HEIGHT_M;
  const vAt = (i: number): number => v[((i % n) + n) % n] ?? 0;
  const kappa = new Float64Array(n);
  let periodS = 0;
  let amplitude = 0;
  const useWarm = warm !== null && warm.kappa.length === n + 1;
  const seed = (tau: number): void => {
    periodS = turnSizeM / meanOf(v, n);
    for (let i = 0; i < n; i++) kappa[i] = arcCurveAt(i / n - tau, peak);
  };
  const kAt = (i: number): number => (i < 0 ? -(kappa[i + n] ?? 0) : i >= n ? -(kappa[i - n] ?? 0) : (kappa[i] ?? 0));
  const d = new Float64Array(n);
  const stiff = new Float64Array(n);
  const dAt = (i: number): number => (i < 0 ? -(d[i + n] ?? 0) : i >= n ? -(d[i - n] ?? 0) : (d[i] ?? 0));
  const heading = new Float64Array(n + 1);
  const kappaSki = new Float64Array(n + 1);
  const travel = new Float64Array(n + 1);
  const shape = new Float64Array(n);
  const [a, b, c, r, col] = [new Float64Array(n), new Float64Array(n), new Float64Array(n), new Float64Array(n), new Float64Array(n)];
  const integrate = (): void => {
    heading[0] = Math.PI / 2 - halfSweep;
    for (let i = 1; i <= n; i++) heading[i] = (heading[i - 1] ?? 0) + (periodS * (vAt(i - 1) * kAt(i - 1) + vAt(i) * kAt(i))) / (2 * n);
  };
  let poisoned = !useWarm;
  // κ_ski = A c(t − τ0) at a fixed τ0, A the least-squares fit; f(0), or NaN when the cycle cannot close.
  const fitFrom = (tau: number): number => {
    if (poisoned) seed(tau);
    boundary = Boundary.None;
    poisoned = true;
    for (let i = 0; i < n; i++) shape[i] = arcCurveAt(i / n - tau, peak);
    let last = Number.POSITIVE_INFINITY;
    let rising = 0;
    let halvings = 0;
    const prevKappa = new Float64Array(n);
    const stepKappa = new Float64Array(n);
    let [prevAmplitude, stepAmplitude, prevPeriod] = [0, 0, periodS];
    for (let it = 0; it < GEOMETRY_CAP; it++) {
      integrate();
      const sweep = (heading[n] ?? 0) - (heading[0] ?? 0);
      if (!(sweep > 0)) {
        boundary = Boundary.NoGeometry;
        return Number.NaN;
      }
      // The sweep is held by A's Newton row below; the rescale only seeds it.
      if (it === 0) {
        for (let i = 0; i < n; i++) kappa[i] = ((kappa[i] ?? 0) * 2 * halfSweep) / sweep;
        integrate();
      }
      // T from the turn size; κ rescaled so T κ, and so the heading, stay put.
      let down = 0;
      for (let i = 0; i < n; i++) down += (vAt(i) * Math.sin(heading[i] ?? 0) + vAt(i + 1) * Math.sin(heading[i + 1] ?? 0)) / (2 * n);
      if (!(down > 0)) {
        boundary = Boundary.NoGeometry;
        return Number.NaN;
      }
      const nextT = turnSizeM / down;
      for (let i = 0; i < n; i++) kappa[i] = ((kappa[i] ?? 0) * periodS) / nextT;
      periodS = nextT;
      for (let i = 0; i < n; i++) {
        const f = (vAt(i) ** 2 * (kappa[i] ?? 0)) / G - sin * Math.cos(heading[i] ?? 0);
        const lambda = Math.atan2(f, cos);
        d[i] = -h * Math.sin(lambda);
        // ∂d/∂κ = −h cos³λ v² / (g cos θ).
        stiff[i] = (h * Math.cos(lambda) ** 3 * vAt(i) ** 2) / (G * cos);
        lam[i] = lambda;
        arcJac[i] = (Math.cos(lambda) ** 2 * vAt(i) ** 2) / (G * cos);
      }
      let most = 0;
      for (let i = 0; i < n; i++) {
        const ds = (periodS * vAt(i)) / n;
        const hp = (periodS * (vAt(i) + vAt(i + 1))) / (2 * n);
        const hm = (periodS * (vAt(i - 1) + vAt(i))) / (2 * n);
        const k = kAt(i);
        const dp = (dAt(i + 1) - dAt(i - 1)) / (2 * ds);
        const dpp = ((dAt(i + 1) - dAt(i)) / hp - (dAt(i) - dAt(i - 1)) / hm) / ds;
        const kdp = (kAt(i + 1) * dAt(i + 1) - kAt(i - 1) * dAt(i - 1)) / (2 * ds);
        const one = 1 - k * dAt(i);
        kappaSki[i] = (one * (one * k + dpp) + dp * (kdp + k * dp)) / (one * one + dp * dp) ** 1.5;
        travel[i] = Math.atan2(dp, one);
        ws[i] = ds * Math.hypot(one, dp);
        most = Math.max(most, Math.abs(k));
        const e = (j: number): number => stiff[((j % n) + n) % n] ?? 0;
        a[i] = -e(i - 1) / (hm * ds);
        c[i] = -e(i + 1) / (hp * ds);
        b[i] = 1 + (e(i) * (1 / hp + 1 / hm)) / ds;
      }
      let cw = 0;
      if (it === 0) sweepS = 0;
      for (let i = 0; i < n; i++) {
        cw += (shape[i] ?? 0) * (ws[i] ?? 0);
        if (it === 0) sweepS += (kappaSki[i] ?? 0) * (ws[i] ?? 0);
      }
      // δ = clamp(F⁻¹(S), δ_min, 0.5), F falling in δ; A from the blended sweep σ A Σ c ws = S − (1 − σ) F(δ) (inferred).
      const sig = 1 - free;
      let slope = 0;
      let fAt = sweepS;
      [band, sigmaMin] = [CarveBand.Inside, 0];
      let [lastX, lastAt, lastUp] = [Number.NaN, 0, 0];
      if (free > 0) {
        halfMin = leastHalf(tau);
        const fMin = carveOf(halfMin, tau, carve);
        const fAll = carveOf(0.5, tau, carve);
        if (sweepS > fMin) [band, half, fAt] = [CarveBand.Above, halfMin, fMin];
        else if (sweepS < fAll) [band, half, fAt, sigmaMin] = [CarveBand.Below, 0.5, fAll, 1 - sweepS / fAll];
        else {
          let [lo, hi] = [halfMin, 0.5];
          let x = Math.min(hi, Math.max(lo, half));
          for (let j = 0; j < 60; j++) {
            [lastX, lastAt, lastUp] = [x, carveOf(x, tau, carve), carveOf(x + 1e-7, tau, carveUp)];
            const fx = lastAt - sweepS;
            if (fx > 0) lo = x;
            else hi = x;
            const fu = lastUp - sweepS;
            slope = (fu - fx) / 1e-7;
            const next = slope < 0 ? x - fx / slope : Number.NaN;
            if (Math.abs(fx) < 1e-13 * (Math.abs(sweepS) + 1)) break;
            x = next > lo && next < hi ? next : (lo + hi) / 2;
            if (hi - lo < 1e-14) break;
          }
          half = x;
        }
        // σ 0 outside the band leaves the space; the first steps run clamped since the seed's λ is not yet the path's.
        if (band !== CarveBand.Inside && sig <= 0 && it >= SETTLE_STEPS) {
          boundary = band === CarveBand.Above ? Boundary.CarveShort : Boundary.CounterSteer;
          return Number.NaN;
        }
        // The last carveOf calls set `carve`, `carveUp` and arcJac at the chosen δ.
        // The loop's last δ left both arrays at it.
        const reuse = band === CarveBand.Inside && half === lastX;
        const at = reuse ? lastAt : carveOf(half, tau, carve);
        if (band === CarveBand.Inside) slope = ((reuse ? lastUp : carveOf(half + 1e-7, tau, carveUp)) - at) / 1e-7;
      }
      amplitude = band === CarveBand.Inside || sig <= 0 ? sweepS / cw : (sweepS - free * fAt) / (sig * cw);
      if (amplitude < 0 && it >= SETTLE_STEPS) {
        boundary = Boundary.CounterSteer;
        return Number.NaN;
      }
      const gap = 2 * halfSweep - ((heading[n] ?? 0) - (heading[0] ?? 0));
      let worst = Math.abs(gap) * most;
      for (let i = 0; i < n; i++) {
        const k = carve[i] ?? 0;
        r[i] = free * k + (1 - free) * amplitude * (shape[i] ?? 0) - (kappaSki[i] ?? 0);
        // ∂target/∂S: the carve through δ, the sine through A.
        // At a clamp only the sine moves with S (at σ 0 a stand-in while it settles).
        col[i] = band === CarveBand.Inside ? (free > 0 && slope < 0 ? (free * ((carveUp[i] ?? 0) - k)) / 1e-7 / slope : 0) + (sig * (shape[i] ?? 0)) / cw : (shape[i] ?? 0) / cw;
        // Howe follows κ through λ on the arc: its slope on the diagonal.
        if (free > 0 && (arcJac[i] ?? 0) > 0) b[i] = (b[i] ?? 0) - free * k * Math.tan(Math.abs(lam[i] ?? 0)) * (arcJac[i] ?? 0);
        worst = Math.max(worst, Math.abs(r[i] ?? 0));
      }
      // Backtrack: the max() switches its active set between steps, so a full step can overshoot.
      if (worst >= last * (1 - 1e-6) && halvings < 10 && last < Number.POSITIVE_INFINITY) {
        halvings++;
        const k = 0.5 ** halvings;
        for (let i = 0; i < n; i++) kappa[i] = (prevKappa[i] ?? 0) + k * (stepKappa[i] ?? 0);
        sweepS = prevAmplitude + k * stepAmplitude;
        periodS = prevPeriod;
        continue;
      }
      halvings = 0;
      rising = worst >= last * (1 - 1e-6) ? rising + 1 : 0;
      // The offset's d″ has a rounding floor near 1e-11 /m: stalled under it is settled.
      if (worst <= 1e-10 * most + 1e-12 || (rising >= 3 && worst <= 1e-8 * most + 1e-9)) {
        poisoned = false;
        return ((v[0] ?? 0) ** 2 * (kappa[0] ?? 0)) / G - sin * Math.sin(halfSweep);
      }
      if (rising >= 5 || !Number.isFinite(worst)) {
        boundary = Boundary.NoGeometry;
        return Number.NaN;
      }
      last = worst;
      // Antiperiodic corners: κ(−1) = −κ(n − 1), κ(n) = −κ(0).
      // Bordered Newton: δκ = x1 + δA x2, δA from the sweep row Σ w δκ = gap (the trapezoid's weights, κ(n) = −κ(0)).
      const x1 = cyclicSolve(a, b, c, -(a[0] ?? 0), -(c[n - 1] ?? 0), r);
      const x2 = cyclicSolve(a, b, c, -(a[0] ?? 0), -(c[n - 1] ?? 0), col);
      let [w1, w2] = [0, 0];
      for (let i = 0; i < n; i++) {
        const wt = i === 0 ? (periodS * (vAt(0) - vAt(n))) / (2 * n) : (periodS * vAt(i)) / n;
        w1 += wt * (x1[i] ?? 0);
        w2 += wt * (x2[i] ?? 0);
      }
      const dA = w2 !== 0 ? (gap - w1) / w2 : 0;
      prevKappa.set(kappa);
      prevAmplitude = sweepS;
      prevPeriod = periodS;
      stepAmplitude = dA;
      sweepS += dA;
      for (let i = 0; i < n; i++) {
        stepKappa[i] = (x1[i] ?? 0) + dA * (x2[i] ?? 0);
        kappa[i] = (kappa[i] ?? 0) + (stepKappa[i] ?? 0);
      }
    }
    boundary = Boundary.NoGeometry;
    return Number.NaN;
  };
  // From the last state first, then from a fresh seed.
  // Near the band's edge a fresh seed can flag where a neighbour's state settles inside: the last good state last.
  const good = { kappa: new Float64Array(n), periodS: 0, half: 0, ok: false };
  const fit = (tau: number): number => {
    const fresh = poisoned;
    const y = fitFrom(tau);
    let z = Number.isFinite(y) || fresh ? y : fitFrom(tau);
    if (!Number.isFinite(z) && good.ok) {
      kappa.set(good.kappa);
      [periodS, half, poisoned] = [good.periodS, good.half, false];
      z = fitFrom(tau);
    }
    if (Number.isFinite(z)) {
      good.kappa.set(kappa);
      [good.periodS, good.half, good.ok] = [periodS, half, true];
    }
    return z;
  };
  const TOL = 1e-10;
  let corner = 0;
  const done = (shift: number, feasible: boolean, settled: boolean, f0: number): GroomedGeometry => {
    kappaSki[n] = -(kappaSki[0] ?? 0);
    travel[n] = -(travel[0] ?? 0);

    const full = new Float64Array(n + 1);
    full.set(kappa);
    full[n] = -(kappa[0] ?? 0);
    const reachOut = Number.isFinite(f0) ? f0 : NO_REACH;
    return { halfSweep, periodS, amplitude, shift, kappa: full, heading, kappaSki, travel, settled, feasible, reach: reachOut, corner, bridgeHalf: half, band, bridgeHalfMin: halfMin, sigmaMin, boundary };
  };
  if (useWarm) {
    kappa.set(warm.kappa.subarray(0, n));
    periodS = warm.periodS;
  }
  // Warm: secant from the last τ0, kept only if it lands on the rising branch (f(0) falling as τ0 grows).
  if (useWarm && !reach) {
    let x0 = warm.shift;
    let r0 = fit(x0);
    let x1 = x0 - 1e-4;
    for (let j = 0; j < 12 && Number.isFinite(r0); j++) {
      if (Math.abs(r0) < TOL && j > 0) break;
      const r1 = fit(x1);
      if (!Number.isFinite(r1) || r1 === r0) break;
      const slope = (r1 - r0) / (x1 - x0);
      if (!(slope < 0)) break;
      const x2 = Math.min(0, Math.max(-peak / 2, x1 - r1 / slope));
      [x0, r0, x1] = [x1, r1, x2];
      if (Math.abs(r1) < TOL) return done(x0, true, true, 0);
    }
    poisoned = true;
  }
  const fitOr = (x: number): number => {
    const y = fit(x);
    return Number.isFinite(y) ? y : Number.NEGATIVE_INFINITY;
  };
  // The state at the last good trial: a refit there can flag, the edge's margin being rounding.
  const snap = (shift: number, f0: number): GroomedGeometry => {
    const g = done(shift, f0 >= 0, true, f0);
    return { ...g, heading: g.heading.slice(), kappaSki: g.kappaSki.slice(), travel: g.travel.slice() };
  };
  // The clamp puts f(0)'s maximum at the flag edge, a corner: bisect it; rising when f(0) there tops the inside's.
  const edgeFrom = (inside: number, outside: number): { readonly at: GroomedGeometry; readonly rising: boolean } | null => {
    corner = Math.sign(outside - inside);
    const fIn = fit(inside);
    if (!Number.isFinite(fIn)) return null;
    let at = snap(inside, fIn);
    let [ok, bad] = [inside, outside];
    // A feasibility probe reads only the flag, settled once a τ0 fits.
    const cap = probe ? 0 : 80;
    for (let j = 0; j < cap && Math.abs(bad - ok) > EDGE_TAU; j++) {
      const m = (ok + bad) / 2;
      const y = fit(m);
      if (Number.isFinite(y)) [ok, at] = [m, snap(m, y)];
      else bad = m;
    }
    return { at, rising: at.reach >= fIn };
  };
  // A flat maximum's argmax from compares is only √noise sharp; where the centred difference vanishes is noise/h.
  const vertexFrom = (start: number): number => {
    const dx = 1e-3;
    let x = start;
    for (let j = 0; j < 6; j++) {
      x = Math.min(-dx, Math.max(-peak / 2 + dx, x));
      const [fm, f0, fp] = [fitOr(x - dx), fitOr(x), fitOr(x + dx)];
      const curve = fp - 2 * f0 + fm;
      if (!(curve < 0)) return Number.NaN;
      const move = (dx * (fp - fm)) / (2 * curve);
      x -= move;
      if (Math.abs(move) < 1e-7) return x;
    }
    return Number.NaN;
  };
  // Warm corner: bracket the edge outward from the last one, then bisect it.
  if (useWarm && reach && warm.corner !== 0) {
    const side = warm.corner;
    const inRange = (x: number): number => Math.min(0, Math.max(-peak / 2, x));
    const from = inRange(guess?.at ?? warm.shift);
    let [inside, outside] = Number.isFinite(fit(from)) ? [from, Number.NaN] : [Number.NaN, from];
    for (let w = guess?.step ?? 1e-9; w < peak && (Number.isNaN(inside) || Number.isNaN(outside)); w *= 4) {
      const x = inRange(Number.isNaN(outside) ? inside + side * w : outside - side * w);
      if (Number.isFinite(fit(x))) inside = x;
      else outside = x;
      if (x === 0 || x === -peak / 2) break;
    }
    if (!Number.isNaN(inside) && !Number.isNaN(outside)) {
      const e = edgeFrom(inside, outside);
      if (e?.rising === true) return e.at;
    }
    corner = 0;
    poisoned = true;
  }
  if (useWarm && reach && warm.corner === 0) {
    const x = vertexFrom(warm.shift);
    const f0 = Number.isFinite(x) ? fit(x) : Number.NaN;
    if (Number.isFinite(f0)) return done(x, f0 >= 0, true, f0);
    poisoned = true;
  }
  // Cold: walk τ0 down from 0 to the first sign change, or past the maximum of f(0); deeper than −peak/2 the path turns back uphill.
  const step = peak / 16;
  let [hi, fHi] = [Number.NaN, Number.NaN];
  let [lo, fLo] = [Number.NaN, Number.NaN];
  let [top, fTop] = [Number.NaN, Number.NEGATIVE_INFINITY];
  for (let x = 0; x >= -peak / 2 - 1e-12; x -= step) {
    let fx = fitOr(x);
    if (Number.isNaN(fHi)) {
      if (fx > Number.NEGATIVE_INFINITY && fx < 0) [hi, fHi] = [x, fx];
      continue;
    }
    if (fx === Number.NEGATIVE_INFINITY) {
      const e = edgeFrom(hi, x);
      corner = 0;
      if (e !== null && e.rising && (reach || e.at.reach < 0)) return e.at;
      if (e?.rising === true) {
        [lo, fLo] = [e.at.shift, e.at.reach];
        break;
      }
      if (e !== null) [x, fx] = [e.at.shift, e.at.reach];
    }
    if (fx < fHi) {
      // Past the maximum: golden search between x and hi + step.
      let [p, q] = [x, Math.min(0, hi + step)];
      const g = (Math.sqrt(5) - 1) / 2;
      let m1 = q - g * (q - p);
      let m2 = p + g * (q - p);
      let f1 = fitOr(m1);
      let f2 = fitOr(m2);
      const width = reach ? 1e-3 : 1e-9;
      for (let k = 0; k < 60 && q - p > width; k++) {
        if (!reach && !(f1 < 0 && f2 < 0)) break;
        if (f1 < f2) {
          [p, m1, f1] = [m1, m2, f2];
          m2 = p + g * (q - p);
          f2 = fitOr(m2);
        } else {
          [q, m2, f2] = [m2, m1, f1];
          m1 = q - g * (q - p);
          f1 = fitOr(m1);
        }
      }
      [top, fTop] = f1 >= f2 ? [m1, f1] : [m2, f2];
      if (reach) {
        const at = vertexFrom(top);
        if (Number.isFinite(at)) top = at;
      }
      if (!reach && fTop >= 0) [lo, fLo] = [top, fTop];
      break;
    }
    if (fx >= 0 && !reach) {
      [lo, fLo] = [x, fx];
      break;
    }
    [hi, fHi] = [x, fx];
    [top, fTop] = [x, fx];
  }
  if (Number.isNaN(lo) || Number.isNaN(hi)) {
    // No root: the τ0 nearest one, continuous with the fold where the root vanishes.
    const at = Number.isNaN(top) ? 0 : top;
    const f0 = fit(at);
    return done(at, f0 >= 0, Number.isFinite(f0), f0);
  }
  // Illinois on [lo, hi]: f(lo) ≥ 0 > f(hi), monotone between.
  let side = 0;
  let m = lo;
  let fm = fLo;
  for (let j = 0; j < 100 && Math.abs(fm) >= TOL && hi - lo > 1e-14; j++) {
    const x = (lo * fHi - hi * fLo) / (fHi - fLo);
    const y = fit(x);
    // A flagged τ0 inside a bracket: keep the best so far.
    if (!Number.isFinite(y)) break;
    [m, fm] = [x, y];
    if (fm > 0) {
      [lo, fLo] = [m, fm];
      if (side === 1) fHi /= 2;
      side = 1;
    } else {
      [hi, fHi] = [m, fm];
      if (side === -1) fLo /= 2;
      side = -1;
    }
  }
  fm = fit(m);
  return done(m, true, Math.abs(fm) < 1e-8, 0);
};

/** The carve's bridge D over the turn: 2δ. */
const bridgeShareOf = (g: GroomedGeometry): number => 2 * g.bridgeHalf;

/** Share of the steered attack at `t`: 0 to the engagement, one cosine up to the release, one down by the switch; inferred. */
const setShareOf = (events: TurnEvents, t: number): number => {
  const u = wrap(t);
  if (u <= events.engagement) return 0;
  if (u <= events.release) return (1 - Math.cos((Math.PI * (u - events.engagement)) / (events.release - events.engagement))) / 2;
  return (1 + Math.cos((Math.PI * (u - events.release)) / (1 - events.release))) / 2;
};

/**
 * A groomed task's cycle (motion-model §4): the skis' curvature A c(t − τ0), the mass path from the balance, the edge from
 * the sidecut and σ, the speed by Heun along the mass path, and the half sweep β_h that closes the net work at the turn
 * size alone, ≤ π/2; no skid is added to hold speed: past the roundest feasible β_h the cell speeds up (Boundary.SpeedsUp).
 */
const solveGroomed = (task: TurnTask, snow: Snow, options: SolveOptions, depth = 0): TurnProfile => {
  const n = options.samples ?? SAMPLES;
  const vMean = task.speedMps;
  const theta = task.slopeDeg * DEG_RAD;
  const sin = Math.sin(theta);
  const cos = Math.cos(theta);
  const peakT = task.arcPeakT ?? ARC_PEAK_T;
  const kR = BEND_FACTOR[snow] * task.ski.sidecutRadius;
  const mu = GLIDING_FRICTION[snow];
  const fr = options.friction;
  const muAt = (vv: number): number => (fr === undefined ? mu : typeof fr === 'number' ? fr : fr.a + fr.b * vv);
  const dragPerV2 = options.dragAreaM2 === undefined ? DRAG_PER_V2 : (0.5 * 1 * options.dragAreaM2) / (75 * G);
  const sigma = task.skidShare;
  const setup: GroomedSetup = { n, sin, cos, peak: peakT, turnSizeM: task.turnSizeM, kR, free: 1 - sigma, angulationMax: task.style.angulationDeg * DEG_RAD,
    edgeRate: (options.edgeRateDegS ?? EDGE_RATE_DEG_S) * DEG_RAD };
  const ts = Array.from({ length: n }, (_, i) => i / n);
  const fixed = options.constantSpeed === true;
  let warm: GroomedGeometry | null = null;
  const geometryAt = (halfSweep: number, v: Float64Array): GroomedGeometry => {
    const g = groomedGeometry(setup, v, halfSweep, warm);
    if (g.feasible && g.settled) warm = g;
    return g;
  };
  let lastTop = Math.PI / 2;
  let topSlope = Number.NaN;
  let peakWarm: GroomedGeometry | null = null;
  // Corner edges at this v, τ0 against β: a linear guess for the next one.
  let edgeV: Float64Array | null = null;
  const edges: { readonly beta: number; readonly shift: number }[] = [];
  let lastPeak: { readonly b: number; readonly v: Float64Array; readonly g: GroomedGeometry } | null = null;
  let edgeSlope = Number.NaN;
  const peakAt = (b: number, v: Float64Array): GroomedGeometry => {
    if (lastPeak !== null && lastPeak.b === b && lastPeak.v === v) return lastPeak.g;
    if (v !== edgeV) [edgeV, edges.length] = [v, 0];
    const from = peakWarm ?? warm;
    const [p, q] = [edges[edges.length - 2], edges[edges.length - 1]];
    if (p !== undefined && q !== undefined && p.beta !== q.beta) edgeSlope = (q.shift - p.shift) / (q.beta - p.beta);
    let guess: EdgeGuess | null = null;
    // Until two edges at this v, the last v's slope.
    if (from !== null && from.corner !== 0 && q !== undefined && q.shift === from.shift && Number.isFinite(edgeSlope)) {
      const move = edgeSlope * (b - q.beta);
      guess = { at: q.shift + move, step: Math.max(4e-12, 5e-2 * Math.abs(move)) };
    }
    const g = groomedGeometry(setup, v, b, from, true, false, guess);
    if (g.settled) [peakWarm, lastPeak] = [g, { b, v, g }];
    if (g.settled && g.corner !== 0) {
      if (q?.beta === b) edges.pop();
      edges.push({ beta: b, shift: g.shift });
    }
    return g;
  };
  const reachAt = (b: number, v: Float64Array): number => peakAt(b, v).reach;
  // The β_h interval with a solvable cycle: flagged trials are outside it, their boundaries kept.
  const seen = new Set<Boundary>();
  let sigmaFloor = 0;
  const out = (b: number, v: Float64Array): boolean => {
    let g = groomedGeometry(setup, v, b, null, true, true);
    // A cold seed can flag near the band's edge: a flag counts only if the last settled state flags too.
    if (g.boundary !== Boundary.None && warm !== null) {
      const again = groomedGeometry(setup, v, b, warm, true, true);
      if (again.boundary === Boundary.None) g = again;
    }
    if (g.boundary !== Boundary.None) seen.add(g.boundary);
    if (g.boundary === Boundary.CounterSteer) sigmaFloor = Math.max(sigmaFloor, g.sigmaMin);
    return g.boundary !== Boundary.None;
  };
  const SCAN = Array.from({ length: 24 }, (_, j) => ((j + 1) * Math.PI) / 48);
  // Each edge as [inside, outside]; coarse until the closure lands on it.
  const brackets: [number, number][] = [
    [Number.NaN, Number.NaN],
    [Number.NaN, Number.NaN],
  ];
  const narrow = (k: 0 | 1, v: Float64Array, tol: number): number => {
    const e = brackets[k] ?? [Number.NaN, Number.NaN];
    for (let j = 0; j < 40 && Math.abs(e[1] - e[0]) > tol; j++) {
      const m = (e[0] + e[1]) / 2;
      e[out(m, v) ? 1 : 0] = m;
    }
    return e[0];
  };
  // Two-sided: the coarse scan's first feasible run, each edge bisected between scan points.
  // A flag narrower than the scan step is stepped over: walking outward finer stops at such holes.
  let carried: { readonly least: boolean; readonly top: boolean } | null = null;
  const boundsOf = (v: Float64Array): readonly [number, number] => {
    seen.clear();
    // out() is fixed within one call: no state it reads moves here.
    const memo = new Map<number, boolean>();
    const at = (b: number): boolean => {
      const hit = memo.get(b);
      if (hit !== undefined) return hit;
      const r = out(b, v);
      memo.set(b, r);
      return r;
    };
    const holds = (e: [number, number]): boolean => !at(e[0]) && at(e[1]);
    // The last pass's edges, kept while they still bracket at this v.
    const none: [number, number] = [Number.NaN, Number.NaN];
    const [e0, e1] = [brackets[0] ?? none, brackets[1] ?? none];
    if (carried !== null && (carried.least ? !at(LEAST_HALF_SWEEP) : holds(e0)) && (carried.top ? !at(Math.PI / 2) : holds(e1))) {
      return [carried.least ? LEAST_HALF_SWEEP : e0[0], carried.top ? Math.PI / 2 : e1[0]];
    }
    // A moved edge: walk its bracket from the last one by doubling steps; false sends it to the full scan.
    const shift = (k: 0 | 1): boolean => {
      const e = brackets[k] ?? none;
      const dir = Math.sign(e[1] - e[0]);
      if (!(dir !== 0) || holds(e)) return dir !== 0;
      const gone = at(e[0]);
      let [from, w] = [gone ? e[0] : e[1], EDGE_COARSE];
      for (let j = 0; j < 8; j++) {
        const x = from + (gone ? -dir : dir) * w;
        if (x <= LEAST_HALF_SWEEP || x >= Math.PI / 2) return false;
        if (at(x) !== gone) {
          brackets[k] = gone ? [x, from] : [from, x];
          return true;
        }
        [from, w] = [x, 2 * w];
      }
      return false;
    };
    if (carried !== null && !carried.least && !carried.top && shift(0) && shift(1) && (brackets[0]?.[0] ?? 0) < (brackets[1]?.[0] ?? 0)) {
      return [narrow(0, v, EDGE_COARSE), narrow(1, v, EDGE_COARSE)];
    }
    carried = null;
    const ok = SCAN.map((b) => !out(b, v));
    const i = ok.indexOf(true);
    if (i < 0) return [Number.NaN, Number.NaN];
    let j = i;
    while (j + 1 < SCAN.length && ok[j + 1] === true) j++;
    const lo = SCAN[i] ?? Number.NaN;
    const hi = SCAN[j] ?? Number.NaN;
    brackets[0] = [lo, i > 0 ? (SCAN[i - 1] ?? LEAST_HALF_SWEEP) : LEAST_HALF_SWEEP];
    const low = i === 0 && !out(LEAST_HALF_SWEEP, v) ? LEAST_HALF_SWEEP : narrow(0, v, EDGE_COARSE);
    if (j === SCAN.length - 1) {
      brackets[1] = [hi, hi];
      carried = { least: low === LEAST_HALF_SWEEP, top: true };
      return [low, hi];
    }
    brackets[1] = [hi, SCAN[j + 1] ?? Math.PI / 2];
    carried = { least: low === LEAST_HALF_SWEEP, top: false };
    return [low, narrow(1, v, EDGE_COARSE)];
  };
  let least = LEAST_HALF_SWEEP;
  let ceiling = Math.PI / 2;
  // At a fold bound τ0 is f(0)'s maximum, smooth in v where the root has a square-root corner.
  const closedAt = (c: { readonly halfSweep: number; readonly top: number }, v: Float64Array): GroomedGeometry =>
    c.halfSweep >= c.top && c.top < ceiling ? peakAt(c.top, v) : geometryAt(c.halfSweep, v);
  // The widest feasible β_h: the ceiling, else the fold where max over τ0 of f(0) is 0, by Illinois from the last pass's.
  const topOf = (v: Float64Array): number => {
    if (lastTop >= ceiling && geometryAt(ceiling, v).feasible) return lastTop;
    let [lo, fLo] = [Number.NaN, Number.NaN];
    let [hi, fHi] = [Number.NaN, Number.NaN];
    if (lastTop < ceiling) {
      // Bracket outward from the last pass's fold: the secant's root overshot by half, else doubling.
      const f = reachAt(lastTop, v);
      const dir = f >= 0 ? 1 : -1;
      const first = -f / topSlope;
      let [p, fp, w] = [lastTop, f, dir * first > 0 ? Math.min(1e-4, Math.max(1e-10, 1.5 * Math.abs(first))) : 1e-4];
      for (let j = 0; j < 40 && Number.isNaN(f >= 0 ? hi : lo); j++) {
        const x = Math.min(ceiling, Math.max(least, p + dir * w));
        const fx = reachAt(x, v);
        if (f >= 0 ? fx < 0 : fx >= 0) {
          [lo, fLo, hi, fHi] = f >= 0 ? [p, fp, x, fx] : [x, fx, p, fp];
        } else if (x === ceiling || x === least) break;
        const ahead = (fx * (x - p)) / (fp - fx);
        w = dir * ahead > 0 && Number.isFinite(ahead) ? Math.max(1e-10, 1.5 * Math.abs(ahead)) : 2 * Math.abs(x - p);
        [p, fp] = [x, fx];
      }
    }
    if (!(fHi < 0)) {
      const f = reachAt(ceiling, v);
      if (f >= 0) return (lastTop = ceiling);
      [hi, fHi] = [ceiling, f];
    }
    if (!(fLo >= 0)) [lo, fLo] = [least, reachAt(least, v)];
    // No β_h in the band holds f(0) = 0: Illinois would extrapolate below least.
    if (!(fLo >= 0)) return Number.NaN;
    let side = 0;
    let m = lo;
    let [pm, pf] = [lo, fLo];
    for (let j = 0; j < 100 && hi - lo > 1e-12; j++) {
      m = (lo * fHi - hi * fLo) / (fHi - fLo);
      const fm = reachAt(m, v);
      // Noise swamps the slope over closer points.
      if (Math.abs(m - pm) > 1e-9) [topSlope, pm, pf] = [(fm - pf) / (m - pm), m, fm];
      if (Math.abs(fm) < 1e-12) break;
      if (fm > 0) {
        [lo, fLo] = [m, fm];
        if (side === 1) fHi /= 2;
        side = 1;
      } else {
        [hi, fHi] = [m, fm];
        if (side === -1) fLo /= 2;
        side = -1;
      }
    }
    return (lastTop = m);
  };
  let set: Float64Array = new Float64Array(n + 1);
  const setFrom = (e: TurnEvents): Float64Array => Float64Array.from({ length: n + 1 }, (_, i) => sigma * STEER_ATTACK_DEG * DEG_RAD * setShareOf(e, i / n));
  const across = (g: GroomedGeometry, i: number, vv: number): number => (vv * vv * (g.kappa[i] ?? 0)) / G - sin * Math.cos(g.heading[i] ?? 0);
  /** The speed balance's terms at sample i and speed vv, in g: gain, friction, skid, bump, drag. */
  const terms = (g: GroomedGeometry, i: number, vv: number): readonly [number, number, number, number, number] => {
    const f = across(g, i, vv);
    return [sin * Math.sin(g.heading[i] ?? 0), muAt(vv) * Math.hypot(f, cos), Math.max(0, f) * Math.tan(set[i] ?? 0), 0, dragPerV2 * vv * vv];
  };
  const net = (g: GroomedGeometry, i: number, vv: number): number => {
    const [gain, friction, skid, , drag] = terms(g, i, vv);
    return gain - friction - skid - drag;
  };
  const work = (g: GroomedGeometry, v: Float64Array): number => {
    let s = 0;
    for (let i = 0; i < n; i++) s += net(g, i, v[i] ?? 0) * (v[i] ?? 0);
    return s;
  };
  const speedOf = (g: GroomedGeometry, guess: number): Float64Array =>
    fixed ? new Float64Array(n + 1).fill(vMean) : holdMean(n, vMean, (v0) => heun(n, (i, vv) => g.periodS * G * net(g, i, vv), v0), guess);
  // SpeedsUp: the geometry wraps v, so the next pass gets the cycle's gain taken out linearly, at the same mean.
  const detrend = (v: Float64Array): Float64Array => {
    const gain = (v[n] ?? 0) - (v[0] ?? 0);
    const flat = v.map((x, i) => x - (gain * i) / n);
    const shift = vMean - meanOf(flat, n);
    return flat.map((x) => x + shift);
  };
  // Events from f, linear between samples so they move continuously with the parameters.
  const eventsFrom = (g: GroomedGeometry, v: Float64Array): TurnEvents => {
    const f = Float64Array.from({ length: n + 1 }, (_, i) => across(g, i, v[i] ?? 0));
    let top = 0;
    for (let i = 1; i < n; i++) if ((f[i] ?? 0) > (f[top] ?? 0)) top = i;
    const half = (f[top] ?? 0) / 2;
    const cross = (from: number, up: boolean): number => halfCrossOf(f, half, from, up);
    let fallLine = Number.NaN;
    for (let i = 1; i <= n && Number.isNaN(fallLine); i++) {
      const [h0, h1] = [g.heading[i - 1] ?? 0, g.heading[i] ?? 0];
      if (h1 >= Math.PI / 2) fallLine = (i - 1 + (Math.PI / 2 - h0) / (h1 - h0)) / n;
    }
    const load = (i: number): number => Math.hypot(f[((i % n) + n) % n] ?? 0, cos);
    let p = 0;
    for (let i = 1; i < n; i++) if (load(i) > load(p)) p = i;
    const curve = load(p - 1) - 2 * load(p) + load(p + 1);
    const off = curve < 0 ? (0.5 * (load(p - 1) - load(p + 1))) / curve : 0;
    return { switch: 0, engagement: cross(0, true), fallLine, forcePeak: wrap((p + off) / n), release: cross(top, false) };
  };
  interface Closed {
    readonly halfSweep: number;
    readonly root: boolean;
    readonly top: number;
    readonly topBound: TopBound;
    readonly boundary: Boundary;
  }
  const flagged = (): Boundary => (seen.has(Boundary.CounterSteer) ? Boundary.CounterSteer : seen.has(Boundary.CarveShort) ? Boundary.CarveShort : Boundary.NoGeometry);
  // β_h where the net work at frozen speed is 0, W falling with β_h; W > 0 at the roundest feasible β_h speeds up.
  const close = (v: Float64Array): Closed => {
    [least, ceiling] = boundsOf(v);
    lastTop = Math.min(lastTop, ceiling);
    const none = { halfSweep: Number.NaN, root: false, top: Number.NaN, topBound: TopBound.Fold };
    if (Number.isNaN(least)) return { ...none, boundary: flagged() };
    let beta = topOf(v);
    if (beta >= ceiling - EDGE_COARSE && ceiling < Math.PI / 2) {
      ceiling = narrow(1, v, 1e-7);
      lastTop = Math.min(lastTop, ceiling);
      beta = topOf(v);
    }
    if (Number.isNaN(beta)) return { ...none, boundary: Boundary.NoGeometry };
    const topBound = beta >= Math.PI / 2 ? TopBound.Cap : beta >= ceiling ? TopBound.Edge : TopBound.Fold;
    const wTop = work(closedAt({ halfSweep: beta, top: beta }, v), v);
    if (wTop > 0) return { halfSweep: beta, root: false, top: beta, topBound, boundary: Boundary.SpeedsUp };
    let [lo, hi] = [least, beta];
    let wLo = work(geometryAt(lo, v), v);
    if (wLo < 0 && least > LEAST_HALF_SWEEP) {
      lo = least = narrow(0, v, 1e-7);
      wLo = work(geometryAt(lo, v), v);
    }
    if (wLo < 0) return { halfSweep: lo, root: false, top: beta, topBound, boundary: Boundary.TooSlow };
    let wHi = wTop;
    // Illinois regula falsi on the bracket.
    let side = 0;
    let m = (lo + hi) / 2;
    for (let j = 0; j < 100 && hi - lo > 1e-11; j++) {
      m = (lo * wHi - hi * wLo) / (wHi - wLo);
      const wm = work(geometryAt(m, v), v);
      if (wm === 0) break;
      if (wm > 0) {
        [lo, wLo] = [m, wm];
        if (side === 1) wHi /= 2;
        side = 1;
      } else {
        [hi, wHi] = [m, wm];
        if (side === -1) wLo /= 2;
        side = -1;
      }
    }
    return { halfSweep: m, root: true, top: beta, topBound, boundary: Boundary.None };
  };

  let v: Float64Array = new Float64Array(n + 1).fill(vMean);
  let closed: Closed = { halfSweep: Math.PI / 4, root: true, top: Math.PI / 2, topBound: TopBound.Cap, boundary: Boundary.None };
  let geo = closedAt(closed, v);
  let events = eventsFrom(geo, v);
  set = setFrom(events);
  let passes = 0;
  let converged = false;
  // Aitken relaxation on v: the pass map alternates (ratio ≈ −0.5) where β_h sits on a fold.
  let omega = 1;
  let lastStep: Float64Array | null = null;
  let lastV: Float64Array | null = null;
  let backs = 0;
  for (let pass = 0; pass < PASS_CAP && !converged; pass++) {
    passes = pass + 1;
    const before = { ...closed, periodS: geo.periodS, engagement: events.engagement, release: events.release };
    const tried = close(v);
    if (Number.isNaN(tried.halfSweep)) {
      // A pass's step can leave the space: halve it back toward the last v that closed.
      if (lastV === null || backs >= 8) {
        closed = tried;
        break;
      }
      const from = lastV;
      v = v.map((x, i) => (from[i] ?? 0) + 0.5 * (x - (from[i] ?? 0)));
      [backs, lastStep] = [backs + 1, null];
      continue;
    }
    [closed, backs] = [tried, 0];
    geo = closedAt(closed, v);
    const raw = speedOf(geo, v[0] ?? vMean);
    const next = closed.boundary === Boundary.SpeedsUp ? detrend(raw) : raw;
    const step = next.map((x, i) => x - (v[i] ?? 0));
    if (lastStep) {
      let [num, den] = [0, 0];
      for (let i = 0; i <= n; i++) {
        const d = (step[i] ?? 0) - (lastStep[i] ?? 0);
        num += (lastStep[i] ?? 0) * d;
        den += d * d;
      }
      if (den > 0) omega = Math.min(1.5, Math.max(0.2, (-omega * num) / den));
    }
    lastStep = step;
    lastV = v;
    v = v.map((x, i) => x + omega * (step[i] ?? 0));
    geo = closedAt(closed, v);
    events = eventsFrom(geo, v);
    set = setFrom(events);
    options.trace?.({ pass, engagement: events.engagement, release: events.release, amplitude: geo.amplitude, shift: geo.shift, halfSweep: closed.halfSweep, bridge: bridgeShareOf(geo), bridgeMin: 2 * geo.bridgeHalfMin, sigmaMin: geo.sigmaMin, least, ceiling, settled: geo.settled ? 1 : 0, periodS: geo.periodS });
    const moved = Math.max(
      Math.abs(closed.halfSweep - before.halfSweep),
      Math.abs(geo.periodS - before.periodS),
      Math.abs(events.engagement - before.engagement),
      Math.abs(events.release - before.release),
    );
    converged = geo.settled && moved < 1e-9;
  }
  // W's sum is not Heun's: close the discrete cycle by secant on β_h.
  if (closed.root && !fixed) {
    const frozen = v;
    const gap = (x: number): readonly [number, Float64Array] => {
      const vv = speedOf(geometryAt(x, frozen), frozen[0] ?? vMean);
      return [(vv[n] ?? 0) - (vv[0] ?? 0), vv];
    };
    let x0 = closed.halfSweep;
    let [r0, v0] = gap(x0);
    let best = { x: x0, r: r0, v: v0 };
    let x1 = x0 - 1e-4;
    for (let j = 0; j < 8 && Math.abs(best.r) >= 1e-10; j++) {
      const [r1, v1] = gap(x1);
      if (Math.abs(r1) < Math.abs(best.r)) best = { x: x1, r: r1, v: v1 };
      if (r1 === r0) break;
      const x2 = Math.min(closed.top, Math.max(LEAST_HALF_SWEEP, x1 - (r1 * (x1 - x0)) / (r1 - r0)));
      [x0, r0, x1] = [x1, r1, x2];
    }
    closed = { ...closed, halfSweep: best.x };
    v = best.v;
    geo = closedAt(closed, v);
    events = eventsFrom(geo, v);
  }
  if (Number.isNaN(closed.halfSweep)) {
    // No β_h solves at this σ: the nearest σ that does, flagged: σ_min, or σ → 0⁺ where the sine steers the carve's shortfall.
    const near = depth > 0 ? 1 : closed.boundary === Boundary.CounterSteer ? Math.min(1, sigmaFloor) : 1e-6;
    if (depth >= 2) throw new Error(`no groomed cycle at σ ${sigma}: ${closed.boundary}`);
    const p = solveGroomed({ ...task, skidShare: Math.max(sigma, near) }, snow, options, depth + 1);
    return { ...p, closure: { ...p.closure, root: false }, boundary: closed.boundary, solvedSigma: p.solvedSigma ?? Math.max(sigma, near) };
  }
  // SpeedsUp: the gain per cycle at the roundest turn, from v's own start.
  const gained = closed.boundary === Boundary.SpeedsUp && !fixed ? speedOf(geo, v[0] ?? vMean) : v;
  const residual = (gained[n] ?? 0) - (gained[0] ?? 0);
  const f = ts.map((_, i) => across(geo, i, v[i] ?? 0));
  const fPeak = Math.max(...f);
  const lean = f.map((x) => Math.atan2(x, cos));
  const load = f.map((x) => Math.hypot(x, cos));
  const heading = Array.from(geo.heading.subarray(0, n));
  const edge: number[] = [];
  const carveMargin: number[] = [];
  const skiRadius: number[] = [];
  const skiHeading: number[] = [];
  const attack: number[] = [];
  for (let i = 0; i < n; i++) {
    const ks = geo.kappaSki[i] ?? 0;
    const l = lean[i] ?? 0;
    // ε_c: the edge whose carved arc k R_sc cos ε is the skis' arc; signed toward the skis' turn.
    const sign = ks >= 0 ? 1 : -1;
    const carve = sign * Math.acos(Math.min(1, 1 / (Math.abs(ks) * kR)));
    edge.push(l + sign * (1 - sigma) * Math.max(0, sign * (carve - l)));
    carveMargin.push(carve - l);
    skiRadius.push(Math.min(STRAIGHT_RADIUS_M, 1 / Math.abs(ks)));
    const gamma = set[i] ?? 0;
    attack.push(gamma / DEG_RAD);
    skiHeading.push((heading[i] ?? 0) + (geo.travel[i] ?? 0) + gamma);
  }
  const w = ts.map((_, i) => (geo.kappa[i] ?? 0) * (skiRadius[i] ?? 0));
  const arcShare = f.map((x) => Math.max(0, x) / fPeak);
  const speed = v.slice(0, n);
  const pathM = [0];
  for (let i = 1; i <= n; i++) pathM.push((pathM[i - 1] ?? 0) + (geo.periodS * ((v[i - 1] ?? 0) + (v[i] ?? 0))) / (2 * n));
  const sums = [0, 0, 0, 0, 0];
  let along = 0;
  for (let i = 0; i < n; i++) {
    const vi = v[i] ?? 0;
    terms(geo, i, vi).forEach((x, j) => (sums[j] = (sums[j] ?? 0) + x * vi));
    along += vi;
  }
  const [gain = 0, friction = 0, skid = 0, bump = 0, drag = 0] = sums.map((x) => x / along);
  let skisHalfSweep = 0;
  for (let i = 0; i < n; i++) skisHalfSweep = Math.max(skisHalfSweep, Math.abs((heading[i] ?? 0) + (geo.travel[i] ?? 0) - Math.PI / 2));
  const speedList = [...speed];
  const at = (t: number): ProfilePoint => ({
    arcShare: lerp(arcShare, t, same),
    massShare: lerp(w, t, flip),
    heading: lerp(heading, t, (y) => Math.PI - y),
    lean: lerp(lean, t, flip),
    load: lerp(load, t, same),
    edge: lerp(edge, t, flip),
    skiRadius: lerp(skiRadius, t, same),
    speed: lerp(speedList, t, same),
    attack: lerp(attack, t, same),
    clearance: null,
    bendRadius: null,
  });
  return {
    t: ts,
    arcShare,
    massShare: w,
    heading,
    lean,
    load,
    edge,
    skiRadius,
    periodS: geo.periodS,
    halfSweep: closed.halfSweep,
    skisHalfSweep,
    mogul: null,
    events,
    speed,
    attack,
    gammaE: 0,
    energy: { gain, friction, skid, bump, drag },
    pathM,
    closure: { root: closed.root, converged, passes, residual },
    at,
    skiHeading,
    carveMargin,
    topHalfSweep: closed.top,
    topBound: closed.topBound,
    gripDemand: Math.max(...lean.map((l) => Math.abs(Math.tan(l)))),
    boundary: closed.boundary,
    bridgeShare: bridgeShareOf(geo),
    bridgeShareMin: 2 * geo.bridgeHalfMin,
    sigmaMin: geo.sigmaMin,
  };
};

/** What a carved turn met on its arc (skid share 0). */
export const CarveFlagKind = {
  /** No balance root: too fast for this ski to carve at this angulation. */
  TooFast: 'too-fast-to-carve',
  /** A second, over-leaned balance root exists beside the lower one. */
  SecondRoot: 'second-root',
  /** M past angulationReach: the margin is held at the reach. */
  PastReach: 'angulation-past-reach',
  /** Soft snow past SOFT_LEVEL_EDGE_DEG, where federolf-2005's radius levels off and carvedRadius does not. */
  SoftPastLevel: 'soft-snow-past-level',
  /** The speed runs out before the switch: the turn cannot finish straight across. */
  Stall: 'stall',
  /** ε̇ above EDGE_RATE_DEG_S. */
  EdgeRateOver: 'edge-rate-over',
  /** The hold's demand past EDGE_RATE_DEG_S: the edge at the ceiling, the pendulum free on it. */
  EdgeRateLimited: 'edge-rate-limited',
  /** The leg pulls: F < 0. */
  NegativeLegForce: 'negative-leg-force',
  /** ε below λ on the same side: the ski slides. */
  EdgeBelowLean: 'edge-below-lean',
  /** The ski bridged (not pressed) while loaded. */
  BridgedUnderLoad: 'bridged-under-load',
  /** The hold's λ̈ needs an edge past the pressed range or below flat: λ off the root by more than the hold can recover. */
  HoldPastEdge: 'hold-past-edge',
  /** No flip start at the ceiling puts ε 0 at λ 0. */
  FlipLate: 'flip-late',
  /** The pendulum falls past level: no edge holds λ. */
  Fell: 'fell',
} as const;
export type CarveFlagKind = (typeof CarveFlagKind)[keyof typeof CarveFlagKind];

/** A flag's span on turn `turn` (1 the profile's, 2 the next from its end speed), turn time and mass heading from across. */
export interface CarveFlag {
  readonly kind: CarveFlagKind;
  readonly turn: number;
  readonly fromT: number;
  readonly toT: number;
  readonly fromHeadingDeg: number;
  readonly toHeadingDeg: number;
}

/** A carved turn's outputs beside the profile. */
export interface CarveReport {
  /** Fall-line distance of the profile's turn, metres. */
  readonly turnSizeM: number;
  /** Two turns, the second from the first's end speed, s. */
  readonly cycleS: number;
  readonly speedChangeTurnMps: number;
  readonly speedChangeCycleMps: number;
  readonly leastSkiRadiusM: number;
  /** The edge rate both transitions ran at, deg/s. */
  readonly edgeRateDegS: number;
  /** The arc's fastest edge change, deg/s. */
  readonly arcEdgeRateDegS: number;
  /** Engagement and release, s. */
  readonly engageS: number;
  readonly releaseS: number;
  /** The mass heading's most past straight across, degrees. */
  readonly overshootDeg: number;
  /** The margin M after angulationReach, degrees. */
  readonly angulationDeg: number;
  /** Where the turn first stops, too fast (no balance root) or stalled: the march ends there, no carved figure past it (motion-model §4.3). */
  readonly stop: CarveStop | null;
  readonly flags: ReadonlyArray<CarveFlag>;
  /** The switch's pendulum checks; null when the turn stops. */
  readonly switch: CarveSwitch | null;
  readonly periodic: CarvePeriodic;
}

/** The first stopped sample: why, turn (1 or 2), time from that turn's switch, mass heading from across, speed. */
export interface CarveStop {
  readonly kind: typeof CarveFlagKind.TooFast | typeof CarveFlagKind.Stall | typeof CarveFlagKind.Fell;
  readonly turn: number;
  readonly t: number;
  readonly headingDeg: number;
  readonly speedMps: number;
}

/** Balance roots in ε at one sample: the lower (0 where the balance sits at or below flat), how many, an upper past it, the ε nearest balance (no root). */
export interface CarveRoots {
  readonly first: number;
  readonly count: number;
  readonly upper: boolean;
  readonly nearest: number;
}

const ROOT_STEP = 0.5 * DEG_RAD;
export const ROOT_TOP = 89.5 * DEG_RAD;
export const CARVE_DT = 2e-3;
/** A turn not at its switch by this time is stalled, s; inferred. */
const CARVE_T_CAP = 60;
/** Bisection steps of the carve's searches: switch rate, trigger, flip start. */
const CARVE_BISECT = 40;
/** Arc steps between release checks; the trigger bisection refines between them. */
const RELEASE_CHECK = 10;
/** Hip joint centres apart, metres: the groomed stance with the thighs parallel, no hip ab- or adduction. */
export const HIP_WIDTH_M = Math.abs((SKELETON_DATA.joints['hip.L']?.[0] ?? 0) - (SKELETON_DATA.joints['hip.R']?.[0] ?? 0));
/** §7's weight split at the switch: both skis carry half. */
export const SWITCH_SHARE = 0.5;

export interface CarveBalance {
  readonly sin: number;
  readonly cos: number;
  readonly ski: Ski;
  /** Snow compliance c, m/N: the edge sinks c F under the outside ski's force F. */
  readonly compliance: number;
}

const carveBalanceOf = (task: TurnTask, compliance: number): CarveBalance => {
  const theta = task.slopeDeg * DEG_RAD;
  return { sin: Math.sin(theta), cos: Math.cos(theta), ski: task.ski, compliance };
};

/** The steady balance's curvature: v² κ = g (cos θ tan λ + sin θ cos ψ). */
export const balanceCurvature = (cosT: number, sinT: number, psi: number, v: number, lam: number): number => (G * (cosT * Math.tan(lam) + sinT * Math.cos(psi))) / (v * v);

/** The pendulum's state: mass height h over the pressure centre and its rates, lean λ and its rate. */
export interface Pendulum {
  readonly h: number;
  readonly hd: number;
  readonly hdd: number;
  readonly lam: number;
  readonly lamDot: number;
}

/**
 * The mass as an inverted pendulum on the pressure centre (the linear-inverted-pendulum and capture-point model of legged
 * robots, the pressure centre the input the feet bound), in the turn's own side: λ, κ and p positive toward its inside,
 * ψ the mass heading (0 across), a = v² κ_ski + p̈ the pressure centre's acceleration toward the inside and g sinθ cosψ
 * gravity's pull toward it; from the mass's motion about a translating pressure centre:
 *   h λ̈ + 2 ḣ λ̇ = g cosθ sinλ − (a − g sinθ cosψ) cosλ,
 *   F/m = ḧ − h λ̇² + g cosθ cosλ + (a − g sinθ cosψ) sinλ, the leg's force from the pressure centre to the mass.
 * At λ̈ = ḣ = p̈ = 0 the first is balanceCurvature's balance and F/m = g cosθ / cosλ. This gives λ̈.
 */
export const pendulumLamAcc = (q: Pendulum, cosT: number, sinT: number, psi: number, a: number): number =>
  (G * cosT * Math.sin(q.lam) - (a - G * sinT * Math.cos(psi)) * Math.cos(q.lam) - 2 * q.hd * q.lamDot) / q.h;

/** pendulumLamAcc's leg force over the mass, m/s². */
export const pendulumForce = (q: Pendulum, cosT: number, sinT: number, psi: number, a: number): number =>
  q.hdd - q.h * q.lamDot ** 2 + G * cosT * Math.cos(q.lam) + (a - G * sinT * Math.cos(psi)) * Math.sin(q.lam);

/** The pressure centre's acceleration a that gives λ̈ `lamAcc`: pendulumLamAcc solved for a. */
const pendulumDrive = (q: Pendulum, cosT: number, sinT: number, psi: number, lamAcc: number): number =>
  (G * cosT * Math.sin(q.lam) - q.h * lamAcc - 2 * q.hd * q.lamDot) / Math.cos(q.lam) + G * sinT * Math.cos(psi);

/**
 * The outside ski's curvature toward ε's side at leg force `load` (g) with outside share `share` (motion-model §4.8):
 * Howe's sunk arc (carvedRadius) where its bend under that force reaches tan|ε| / R_sc (edgeCurvatureOf ≥ 0, pressed),
 * else the bridged edge's cos ε / R_sc + sin|ε| / R_bend.
 */
export const skiCurvatureOf = (s: CarveBalance, eps: number, load: number, share: number): { readonly k: number; readonly pressed: boolean } => {
  const force = Math.max(0, load) * share * REFERENCE_SKIER.mass * G;
  const bend = bendRadiusOf(force);
  const e = Math.abs(eps);
  const pressed = edgeCurvatureOf(bend, e, s.ski.sidecutRadius) >= 0;
  const k = pressed ? 1 / carvedRadius(s.ski, e, s.compliance * force) : Math.cos(e) / s.ski.sidecutRadius + Math.sin(e) / bend;
  return { k: eps < 0 ? -k : k, pressed };
};

/** cos θ tan λ − v² κ_ski / g + sin θ cos ψ at edge ε, λ = ε − m: the steady pendulum's gap; NaN past λ = 90°. */
const carveGap = (s: CarveBalance, eps: number, v: number, psi: number, m: number, share: number): number => {
  const lam = eps - m;
  if (!(Math.abs(lam) < Math.PI / 2)) return Number.NaN;
  const k = skiCurvatureOf(s, eps, s.cos / Math.cos(lam), share).k;
  return s.cos * Math.tan(lam) - (v * v * k) / G + s.sin * Math.cos(psi);
};

/** The balance's roots in ε on [0, ROOT_TOP]: scanned, the first bisected; a pole ends the scan as −∞. */
export const carveRootsOf = (s: CarveBalance, v: number, psi: number, m: number, share: number): CarveRoots => {
  let [prevE, prevG] = [0, carveGap(s, 0, v, psi, m, share)];
  let [first, count, best, bestG] = [Number.NaN, 0, 0, prevG];
  const bisect = (lo: number, hi: number, gLo: number): number => {
    for (let j = 0; j < 50; j++) {
      const mid = (lo + hi) / 2;
      const g = carveGap(s, mid, v, psi, m, share);
      if (Number.isNaN(g) ? gLo > 0 : g > 0 === gLo > 0) lo = mid;
      else hi = mid;
    }
    return (lo + hi) / 2;
  };
  if (Number.isNaN(prevG)) return { first, count, upper: false, nearest: 0 };
  // Over-leaned at flat: the balance is at or below flat, the edge held there.
  if (prevG >= 0) first = 0;
  let upper = false;
  for (let e = ROOT_STEP; e <= ROOT_TOP + 1e-12; e += ROOT_STEP) {
    const g = carveGap(s, e, v, psi, m, share);
    const pole = Number.isNaN(g);
    if (pole ? prevG > 0 : g > 0 !== prevG > 0) {
      count++;
      if (prevG <= 0 && Number.isNaN(first)) first = bisect(prevE, e, prevG);
      else if (prevG > 0 && !Number.isNaN(first)) upper = true;
    }
    if (pole) break;
    if (g > bestG) [best, bestG] = [e, g];
    [prevE, prevG] = [e, g];
  }
  // Golden section about the scan's best for the no-root fallback.
  let [lo, hi] = [Math.max(0, best - ROOT_STEP), best + ROOT_STEP];
  for (let j = 0; j < 40; j++) {
    const [a, b] = [hi - 0.618 * (hi - lo), lo + 0.618 * (hi - lo)];
    const [ga, gb] = [carveGap(s, a, v, psi, m, share), carveGap(s, b, v, psi, m, share)];
    if ((Number.isNaN(gb) ? Number.NEGATIVE_INFINITY : gb) > (Number.isNaN(ga) ? Number.NEGATIVE_INFINITY : ga)) lo = a;
    else hi = b;
  }
  return { first, count, upper, nearest: (lo + hi) / 2 };
};

/** The balance's roots at speed `v` and mass heading `psi` (0 across, π/2 the fall line), margin `angulationDeg`, the arc's share. */
export const carveRootsAt = (task: TurnTask, snow: Snow, v: number, psi: number, angulationDeg: number, compliance = SNOW_COMPLIANCE[snow]): CarveRoots =>
  carveRootsOf(carveBalanceOf(task, compliance), v, psi, angulationDeg * DEG_RAD * Math.sin(psi) ** 2, task.style.outsideShare);

/** One march sample: time, the mass's heading, speed and fall-line distance, the pendulum, the pressure centre, the skis. */
interface CarveSample {
  readonly t: number;
  readonly psi: number;
  readonly v: number;
  readonly y: number;
  readonly lam: number;
  readonly lamDot: number;
  /** The pressure centre toward the turn's inside of the skis' middle, metres, and its rate: §7's share law at λ, λ̇. */
  readonly p: number;
  readonly pDot: number;
  readonly eps: number;
  /** The hold's demanded edge; NaN off the hold (the release). */
  readonly demand: number;
  /** The balance's lean at this state, the hold's target. */
  readonly lamB: number;
  readonly kSki: number;
  readonly kMass: number;
  /** Leg force over weight, g. */
  readonly load: number;
  readonly share: number;
  readonly pressed: boolean;
  readonly skiHeading: number;
  readonly count: number;
  /** The hold drives: its demand is within the ceiling rate of the last edge. */
  readonly engaged: boolean;
  /** On the hold, the demand past the ceiling rate or the pressed range: the pendulum free on the limited edge. */
  readonly limited: boolean;
  /** The hold's demand is past the pressed range or below flat. */
  readonly past: boolean;
}

/** The switch as the pendulum rides it: the per-turn checks the carve reports. */
export interface CarveSwitch {
  /** λ̇ at the switch the turn starts from, and at the λ 0 it ends on in the next turn's side, deg/s. */
  readonly startLamDotDegS: number;
  readonly endLamDotDegS: number;
  /** λ̇ where the hold stops with the edge held, deg/s, and λ less the root there, degrees. */
  readonly triggerLamDotDegS: number;
  readonly triggerOffDeg: number;
  /** Trigger to λ 0, and the flip from the held edge to 0 at λ 0, s. */
  readonly releaseS: number;
  readonly flipS: number;
  /** After the switch, how long the edge is rate-limited before the hold first takes it, s. */
  readonly limitedS: number;
  /** λ's most past the root on the arc, degrees, when, and when it first falls to 1/e of that after, s (NaN: never). */
  readonly overshootDeg: number;
  readonly overshootT: number;
  readonly settleT: number;
  /** The fastest ε̇ between held samples, and anywhere, deg/s. */
  readonly heldEdgeRateDegS: number;
  readonly maxEdgeRateDegS: number;
  /** The least leg force over weight, g. */
  readonly minLoad: number;
  /** λ past ε on its side at most (the ski slides), degrees, and when, s. */
  readonly slideDeg: number;
  readonly slideT: number;
  /** The skis' heading less the mass's at most, degrees. */
  readonly maxSkiOffDeg: number;
  /** The skis' heading past straight across before λ 0 (rule 8 on the ski track), degrees; ≤ 0 passes. */
  readonly skiUphillDeg: number;
  /** The root's largest λ over the turn, and the λ_peak the share law ran on, degrees. */
  readonly maxLamBDeg: number;
  readonly lamPeakDeg: number;
  /** The flip met λ 0. */
  readonly flipped: boolean;
}

interface CarveTurn {
  readonly samples: ReadonlyArray<CarveSample>;
  readonly periodS: number;
  readonly engageS: number;
  readonly releaseS: number;
  readonly releaseT: number;
  /** The first stopped state; the samples end before it. */
  readonly stop: { readonly kind: CarveFlagKind; readonly t: number; readonly psi: number; readonly v: number } | null;
  readonly sw: CarveSwitch | null;
  /** The λ 0 the turn ends on; null when it stops. */
  readonly end: CarveState | null;
  readonly maxLamB: number;
}

/** What a carved turn's march needs beside its start. */
interface CarveInputs {
  readonly s: CarveBalance;
  readonly mMax: number;
  readonly rate: number;
  /** Speed's rate at heading, speed and leg force over weight (g). */
  readonly accel: (psi: number, v: number, load: number) => number;
  /** The mass height over the pressure centre and its rates at turn time t: movementHeight at period `periodS`. */
  readonly height: (t: number) => { readonly h: number; readonly hd: number; readonly hdd: number };
  readonly movement: StanceMovement;
  /** The period the height runs on; carveCycle's fixed point replaces it. */
  readonly periodS: number;
  /** The arc's outside share S (§7). */
  readonly share: number;
  readonly stance: number;
  /** The skis' heading at λ 0 from the fall line, radians; absent: straight across. */
  readonly switchHeading?: number;
  /** The stepped leg and the trigger time it runs on (a fixed point like periodS); absent: the harmonic. */
  readonly step?: LegStep;
  readonly triggerS?: number;
}

/** The switch a turn starts from in its own side: λ 0 at λ̇ w, ε 0, p and ṗ 0 (the share law's at λ 0). */
interface CarveStart {
  readonly v: number;
  readonly psi: number;
  readonly w: number;
  readonly y: number;
}

interface CarveState {
  readonly t: number;
  readonly psi: number;
  readonly v: number;
  readonly y: number;
  readonly lam: number;
  readonly w: number;
}

interface CarveForces {
  readonly lamAcc: number;
  readonly pAcc: number;
  readonly load: number;
  readonly kSki: number;
  readonly pressed: boolean;
  readonly kMass: number;
  readonly share: number;
  readonly eps: number;
  readonly past: boolean;
}

const Drive = { Hold: 'hold', Free: 'free' } as const;
type Drive = (typeof Drive)[keyof typeof Drive];

/** §7's share law p = amp σ(|λ| / λ_peak), σ the smoothstep: p and ṗ from λ and λ̇, p̈ = A λ̈ + B by the chain rule. */
export const shareLawOf =
  (amp: number, lamPeak: number) =>
  (lam: number, w: number): { readonly p: number; readonly pd: number; readonly A: number; readonly B: number } => {
    const u = lam === 0 ? 0 : Math.abs(lam) / lamPeak;
    if (!(u < 1)) return { p: amp, pd: 0, A: 0, B: 0 };
    const A = (amp * 6 * u * (1 - u) * Math.sign(lam)) / lamPeak;
    return { p: amp * u * u * (3 - 2 * u), pd: A * w, A, B: (amp * (6 - 12 * u) * w * w) / (lamPeak * lamPeak) };
  };

interface CarveRoot {
  readonly eps: number;
  readonly lamB: number;
  readonly count: number;
}

/** The balance's first root at heading `psi`, speed `v`, margin mMax sin²ψ: its edge, its lean λ_b, how many. */
const carveRootOf = (inp: CarveInputs, psi: number, v: number): CarveRoot => {
  const m = inp.mMax * Math.sin(psi) ** 2;
  const r = carveRootsOf(inp.s, v, psi, m, inp.share);
  const found = !Number.isNaN(r.first);
  const eps = found ? r.first : r.nearest;
  return { eps, lamB: eps - m, count: found ? (r.upper ? 2 : 1) : 0 };
};

/** The pendulum falling on edge `eps` (free, or a held edge at its bound), the share law's p̈ in its inertia: λ̈, p̈, F/(m g), the ski. */
export const carveFreeFall = (
  s: CarveBalance,
  q: Pendulum,
  law: { readonly A: number; readonly B: number },
  v: number,
  psi: number,
  eps: number,
  share: number,
  ski0: { readonly k: number; readonly pressed: boolean },
): { readonly lamAcc: number; readonly pAcc: number; readonly load: number; readonly ski: { readonly k: number; readonly pressed: boolean } } => {
  const pull = G * s.sin * Math.cos(psi);
  let [ski, lamAcc, pAcc, load] = [ski0, 0, 0, 0];
  for (let j = 0; j < 3; j++) {
    const vk = v * v * ski.k;
    // The share law moving p faster than the mass (h + A cos λ ≤ 0) has no λ̈: NaN stops the march as fallen.
    const inertia = q.h + law.A * Math.cos(q.lam);
    lamAcc = inertia > 0 ? (G * s.cos * Math.sin(q.lam) - (vk + law.B - pull) * Math.cos(q.lam) - 2 * q.hd * q.lamDot) / inertia : Number.NaN;
    pAcc = law.A * lamAcc + law.B;
    load = pendulumForce(q, s.cos, s.sin, psi, vk + pAcc) / G;
    ski = skiCurvatureOf(s, eps, load, share);
  }
  return { lamAcc, pAcc, load, ski };
};

/** The mass path's curvature: the leg force's and gravity's (`pull`) inward parts over v². */
export const massCurvatureOf = (load: number, lam: number, pull: number, v: number): number => (load * G * Math.sin(lam) + pull) / (v * v);

/** The skis' heading: the mass heading less the skis' sideways rate under the mass (h cos λ λ̇ + ḣ sin λ + ṗ) over v. */
const skiHeadingFrom = (psi: number, v: number, h: number, hd: number, lam: number, w: number, pd: number): number => {
  const dd = h * Math.cos(lam) * w + hd * Math.sin(lam) + pd;
  return psi - Math.atan(dd / v);
};

/**
 * One carved turn from the switch `start`, §7's share law rising to S at λ_peak `lamPeak`: the edge follows the hold's
 * demand at no more than the ceiling rate (from 0 at the switch, so the flip runs on until it meets the demand), the
 * pendulum free on the limited edge; the hold keeps λ at the root; at the trigger the hold stops with the edge held, the
 * mass falls, and the edge flips at the ceiling so ε crosses 0 with λ; the trigger lands the skis straight across at λ 0.
 */
export const carveTurn = (inp: CarveInputs, start: CarveStart, lamPeak: number): CarveTurn => {
  const { s, rate, accel, height, share: S, stance } = inp;
  const rootOf = (x: CarveState): CarveRoot => carveRootOf(inp, x.psi, x.v);
  const pendulumOf = (x: CarveState): Pendulum => ({ ...height(x.t), lam: x.lam, lamDot: x.w });
  const land = inp.switchHeading === undefined ? Math.PI : Math.PI / 2 + inp.switchHeading;
  const amp = -(S - SWITCH_SHARE) * stance;
  const lawOf = shareLawOf(amp, lamPeak);
  // The edge whose ski curvature is `target` on the pressed range at this force; past: none there, held at the bound.
  const edgeFor = (target: number, load: number, share: number): { readonly eps: number; readonly past: boolean } => {
    const bend = bendRadiusOf(Math.max(0, load) * share * REFERENCE_SKIER.mass * G);
    const top = Math.min(ROOT_TOP, Math.atan(s.ski.sidecutRadius / bend));
    if (target <= skiCurvatureOf(s, 0, load, share).k) return { eps: 0, past: true };
    if (target >= skiCurvatureOf(s, top, load, share).k) return { eps: top, past: true };
    let [lo, hi] = [0, top];
    for (let j = 0; j < CARVE_BISECT; j++) {
      const mid = (lo + hi) / 2;
      if (skiCurvatureOf(s, mid, load, share).k < target) lo = mid;
      else hi = mid;
    }
    return { eps: (lo + hi) / 2, past: false };
  };
  // The forces at x: λ̈ and p̈ by the drive, the leg force, both curvatures. The hold solves its edge; free takes eps.
  const forces = (x: CarveState, eps: number, drive: Drive, lamB: number, lamBDot: number): CarveForces => {
    const q = pendulumOf(x);
    const law = lawOf(x.lam, x.w);
    const share = SWITCH_SHARE - law.p / stance;
    const pull = G * s.sin * Math.cos(x.psi);
    let load = s.cos / Math.cos(x.lam);
    let [lamAcc, pAcc, a, e, past] = [0, 0, 0, eps, false];
    let ski = skiCurvatureOf(s, eps, load, share);
    if (drive === Drive.Hold) {
      // Critical damping at the pendulum's own time constant (inferred), λ_b's rate fed forward; the edge makes it.
      const tau = Math.sqrt((q.h * Math.cos(lamB)) / (G * s.cos));
      lamAcc = (-2 * (x.w - lamBDot)) / tau - (x.lam - lamB) / (tau * tau);
      pAcc = law.A * lamAcc + law.B;
      a = pendulumDrive(q, s.cos, s.sin, x.psi, lamAcc);
      load = pendulumForce(q, s.cos, s.sin, x.psi, a) / G;
      ({ eps: e, past } = edgeFor((a - pAcc) / (x.v * x.v), load, share));
      ski = skiCurvatureOf(s, e, load, share);
    }
    // Free, or a held edge at its bound: the pendulum falls on the edge, the share law's p̈ in its inertia.
    if (drive !== Drive.Hold || past) ({ lamAcc, pAcc, load, ski } = carveFreeFall(s, q, law, x.v, x.psi, e, share, ski));
    const kMass = massCurvatureOf(load, x.lam, pull, x.v);
    return { lamAcc, pAcc, load, kSki: ski.k, pressed: ski.pressed, kMass, share, eps: e, past };
  };
  type Rates = readonly [number, number, number, number, number];
  // Heun's step of the state at the edge `epsAt` gives.
  const step = (st: CarveState, dt: number, epsAt: (x: CarveState) => number, drive: Drive, lamBAt: (x: CarveState) => number, lamBDot: number): CarveState => {
    const d = (x: CarveState): Rates => {
      const f = forces(x, epsAt(x), drive, lamBAt(x), lamBDot);
      return [x.v * f.kMass, accel(x.psi, x.v, f.load), x.v * Math.sin(x.psi), x.w, f.lamAcc];
    };
    const add = (x: CarveState, r: Rates, h: number): CarveState => ({
      t: x.t + h,
      psi: x.psi + h * r[0],
      v: Math.max(V_FLOOR, x.v + h * r[1]),
      y: x.y + h * r[2],
      lam: x.lam + h * r[3],
      w: x.w + h * r[4],
    });
    const a = d(st);
    const b = d(add(st, a, dt));
    return add(st, a.map((ai, j) => (ai + (b[j] ?? 0)) / 2) as unknown as Rates, dt);
  };
  const skiHeadingOf = (x: CarveState): number => {
    const hh = height(x.t);
    return skiHeadingFrom(x.psi, x.v, hh.h, hh.hd, x.lam, x.w, lawOf(x.lam, x.w).pd);
  };
  const sampleOf = (x: CarveState, f: CarveForces, lamB: number, count: number, demand: number, engaged: boolean, limited: boolean): CarveSample => {
    const law = lawOf(x.lam, x.w);
    return { t: x.t, psi: x.psi, v: x.v, y: x.y, lam: x.lam, lamDot: x.w, p: law.p, pDot: law.pd, eps: f.eps, demand, past: f.past && limited, lamB, kSki: f.kSki, kMass: f.kMass, load: f.load, share: f.share, pressed: f.pressed, skiHeading: skiHeadingOf(x), count, engaged, limited };
  };
  const stateOf = (a: CarveSample): CarveState => ({ t: a.t, psi: a.psi, v: a.v, y: a.y, lam: a.lam, w: a.lamDot });
  const lamBOf = (x: CarveState): number => rootOf(x).lamB;
  const stopped = (x: CarveState, count: number): CarveFlagKind | null =>
    !(Math.abs(x.lam) < Math.PI / 2) ? CarveFlagKind.Fell : x.v <= V_FLOOR || x.t > CARVE_T_CAP ? CarveFlagKind.Stall : count === 0 ? CarveFlagKind.TooFast : null;
  // The edge at x a time dt after edge ePrev: the hold's demand within the ceiling rate, else the ceiling toward it.
  const edgeAt = (x: CarveState, ePrev: number, dt: number, lamB: number, lamBDot: number): { readonly fh: ReturnType<typeof forces>; readonly e: number; readonly held: boolean; readonly slope: number } => {
    const fh = forces(x, 0, Drive.Hold, lamB, lamBDot);
    const lim = rate * dt;
    const e = Math.min(ePrev + lim, Math.max(ePrev - lim, fh.eps));
    const held = !fh.past && e === fh.eps;
    return { fh, e, held, slope: held ? 0 : Math.sign(fh.eps - e) * rate };
  };

  const arc: CarveSample[] = [];
  const how: { readonly held: boolean; readonly slope: number; readonly lamBDot: number }[] = [];
  const stopAt = (next: CarveState, kind: CarveFlagKind): CarveTurn => {
    // A fall reports the last finite sample, not the step that left the range.
    const kept = arc[arc.length - 1];
    const x = kind === CarveFlagKind.Fell && kept !== undefined ? stateOf(kept) : next;
    if (arc.length === 0) arc.push(sampleOf(x, forces(x, 0, Drive.Free, 0, 0), 0, 0, Number.NaN, false, false));
    const engaged = arc.find((a) => a.engaged);
    return { samples: arc, periodS: Math.max(x.t, CARVE_DT), engageS: engaged?.t ?? 0, releaseS: 0, releaseT: x.t, stop: { kind, t: x.t, psi: x.psi, v: x.v }, sw: null, end: null, maxLamB: Number.NaN };
  };

  // The release from x on held edge e0, the flip starting at tf: λ 0 first (end), or ε 0 first (epsFirst).
  const releaseRun = (from: CarveState, e0: number, tf: number, keep: CarveSample[] | null): { readonly end: CarveState | null; readonly epsFirst: boolean } => {
    let x = from;
    // The flip at the ceiling rate; a slower flip is a later input.
    const epsAt = (z: CarveState): number => (z.t <= tf ? e0 : e0 - rate * (z.t - tf));
    for (;;) {
      if (x.v <= V_FLOOR || x.t > from.t + CARVE_T_CAP || !(Math.abs(x.lam) < Math.PI / 2)) return { end: null, epsFirst: false };
      if (keep !== null) {
        const r = rootOf(x);
        keep.push(sampleOf(x, forces(x, epsAt(x), Drive.Free, 0, 0), r.lamB, r.count, Number.NaN, false, false));
      }
      const next = step(x, CARVE_DT, epsAt, Drive.Free, () => 0, 0);
      if (next.lam <= 0) {
        // The crossing by linear interpolation of the step.
        const u = x.lam / (x.lam - next.lam);
        const mix = (a: number, b: number): number => a + u * (b - a);
        const end: CarveState = { t: mix(x.t, next.t), psi: mix(x.psi, next.psi), v: mix(x.v, next.v), y: mix(x.y, next.y), lam: 0, w: mix(x.w, next.w) };
        return { end, epsFirst: epsAt(end) < 0 };
      }
      if (epsAt(next) <= 0) return { end: null, epsFirst: true };
      x = next;
    }
  };
  // The flip start that puts ε 0 at λ 0, by bisection between the trigger and the unflipped crossing.
  const release = (from: CarveState, e0: number, keep: CarveSample[] | null): { readonly end: CarveState | null; readonly tf: number; readonly flipped: boolean } => {
    const free = releaseRun(from, e0, Number.POSITIVE_INFINITY, null);
    if (free.end === null) return { end: null, tf: from.t, flipped: false };
    let [lo, hi] = [from.t, free.end.t];
    const flipped = releaseRun(from, e0, lo, null).epsFirst;
    for (let j = 0; j < (flipped ? CARVE_BISECT : 0); j++) {
      const mid = (lo + hi) / 2;
      if (releaseRun(from, e0, mid, null).epsFirst) lo = mid;
      else hi = mid;
    }
    const tf = flipped ? hi : from.t;
    return { end: releaseRun(from, e0, tf, keep).end, tf, flipped };
  };
  const switchSki = (a: CarveSample | undefined): number => {
    if (a === undefined) return Number.NaN;
    const e = release(stateOf(a), a.eps, null).end;
    return e === null ? Number.NaN : skiHeadingOf(e);
  };
  const lands = (a: CarveSample | undefined): boolean => switchSki(a) >= land;

  // The arc from the switch: ε 0 at λ 0, then the rate-limited hold until a release lands the skis straight across,
  // checked at doubling intervals (the landing is monotone along the arc), then bisected.
  let x: CarveState = { t: 0, psi: start.psi, v: start.v, y: start.y, lam: 0, w: start.w };
  let ePrev = 0;
  let prevB = rootOf(x).lamB;
  let prevT = x.t - CARVE_DT;
  let [miss, check] = [-1, RELEASE_CHECK];
  for (let k = 0; ; k++) {
    const r = rootOf(x);
    const stop = stopped(x, r.count);
    if (stop !== null) {
      if (lands(arc[arc.length - 1])) break;
      return stopAt(x, stop);
    }
    const lamBDot = (r.lamB - prevB) / Math.max(1e-9, x.t - prevT);
    [prevB, prevT] = [r.lamB, x.t];
    // The switch itself is ε 0.
    const ed = edgeAt(x, ePrev, k === 0 ? 0 : CARVE_DT, r.lamB, lamBDot);
    const f = ed.held ? ed.fh : forces(x, ed.e, Drive.Free, r.lamB, lamBDot);
    arc.push(sampleOf(x, { ...f, past: ed.fh.past }, r.lamB, r.count, ed.fh.eps, ed.held, !ed.held));
    how.push({ held: ed.held, slope: ed.slope, lamBDot });
    if (k === check) {
      if (lands(arc[k])) break;
      [miss, check] = [k, 2 * check];
    }
    ePrev = ed.e;
    const [x0, e0, sl] = [x, ed.e, ed.slope];
    x = ed.held ? step(x, CARVE_DT, () => 0, Drive.Hold, lamBOf, lamBDot) : step(x, CARVE_DT, (z) => e0 + sl * (z.t - x0.t), Drive.Free, () => 0, 0);
  }
  // The first arc index past the last miss whose release lands at or past straight across.
  let [lo, hi] = [Math.max(0, miss), arc.length - 1];
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (lands(arc[mid])) hi = mid;
    else lo = mid;
  }
  const out = arc.slice(0, Math.max(1, hi));
  let from = stateOf(arc[hi] ?? arc[arc.length - 1] ?? sampleOf(x, forces(x, 0, Drive.Free, 0, 0), 0, 0, Number.NaN, false, false));
  let eps0 = arc[hi]?.eps ?? 0;
  const base = arc[hi - 1];
  const bh = how[hi - 1];
  if (hi > 0 && base !== undefined && bh !== undefined) {
    // A part step τ past sample hi − 1 so the switch lands straight across.
    const b0 = stateOf(base);
    const part = (tau: number): CarveState =>
      bh.held ? step(b0, tau, () => 0, Drive.Hold, lamBOf, bh.lamBDot) : step(b0, tau, (z) => base.eps + bh.slope * (z.t - b0.t), Drive.Free, () => 0, 0);
    const partEps = (p: CarveState, tau: number): number => (bh.held ? edgeAt(p, base.eps, tau, lamBOf(p), bh.lamBDot).e : base.eps + bh.slope * tau);
    let [a, b] = [0, CARVE_DT];
    for (let j = 0; j < CARVE_BISECT; j++) {
      const mid = (a + b) / 2;
      const p = part(mid);
      const e = release(p, partEps(p, mid), null).end;
      if (e !== null && skiHeadingOf(e) >= land) b = mid;
      else a = mid;
    }
    from = part(b);
    eps0 = partEps(from, b);
  }
  const rel = release(from, eps0, out);
  if (rel.end === null) return stopAt(from, CarveFlagKind.Stall);
  const end = rel.end;
  const rEnd = rootOf(end);
  out.push(sampleOf(end, forces(end, 0, Drive.Free, 0, 0), rEnd.lamB, rEnd.count, Number.NaN, false, false));
  const engaged = out.find((a) => a.engaged);
  const engageS = engaged?.t ?? 0;
  const { sw, maxB } = carveSwitchOf(out, start.w, end, from, rootOf(from).lamB, rel.tf, rel.flipped, lamPeak, engageS);
  return { samples: out, periodS: end.t, engageS, releaseS: end.t - from.t, releaseT: from.t, stop: null, sw, end, maxLamB: maxB };
};

/** The switch record over a turn's samples `out`: λ̇ at start `w0`, the end, the trigger `from` (its root λ_b), the flip start `tf`. */
const carveSwitchOf = (out: ReadonlyArray<CarveSample>, w0: number, end: CarveState, from: CarveState, fromLamB: number, tf: number, flipped: boolean, lamPeak: number, engageS: number): { readonly sw: CarveSwitch; readonly maxB: number } => {
  // The checks over the whole turn; the overshoot on the arc up to the trigger.
  let [over, overT, rateMax, heldRate, minLoad, slide, slideT, skiOff, uphill, maxB] = [Number.NEGATIVE_INFINITY, 0, 0, 0, Number.POSITIVE_INFINITY, 0, 0, 0, Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY];
  for (let k = 0; k < out.length; k++) {
    const a = out[k];
    if (a === undefined) continue;
    if (a.t < from.t && a.lam - a.lamB > over) [over, overT] = [a.lam - a.lamB, a.t];
    const b = out[k + 1];
    if (b !== undefined && b.t > a.t) {
      const er = Math.abs(b.eps - a.eps) / (b.t - a.t);
      rateMax = Math.max(rateMax, er);
      if (a.engaged && b.engaged) heldRate = Math.max(heldRate, er);
    }
    minLoad = Math.min(minLoad, a.load);
    if (a.lam > 0 && a.lam - a.eps > slide) [slide, slideT] = [a.lam - a.eps, a.t];
    skiOff = Math.max(skiOff, Math.abs(a.skiHeading - a.psi));
    if (k < out.length - 1) uphill = Math.max(uphill, a.skiHeading - Math.PI);
    if (Number.isFinite(a.lamB)) maxB = Math.max(maxB, a.lamB);
  }
  const settle = over > 0 ? out.find((a) => a.t > overT && a.t < from.t && a.lam - a.lamB <= over / Math.E) : undefined;
  const sw: CarveSwitch = {
    startLamDotDegS: w0 / DEG_RAD,
    endLamDotDegS: -end.w / DEG_RAD,
    triggerLamDotDegS: from.w / DEG_RAD,
    triggerOffDeg: (from.lam - fromLamB) / DEG_RAD,
    releaseS: end.t - from.t,
    flipS: end.t - tf,
    limitedS: engageS,
    overshootDeg: over / DEG_RAD,
    overshootT: overT,
    settleT: settle?.t ?? Number.NaN,
    heldEdgeRateDegS: heldRate / DEG_RAD,
    maxEdgeRateDegS: rateMax / DEG_RAD,
    minLoad,
    slideDeg: slide / DEG_RAD,
    slideT,
    maxSkiOffDeg: skiOff / DEG_RAD,
    skiUphillDeg: uphill / DEG_RAD,
    maxLamBDeg: maxB / DEG_RAD,
    lamPeakDeg: lamPeak / DEG_RAD,
    flipped,
  };
  return { sw, maxB };
};

/** First crossing of `half` by `f` (n + 1 samples over the cycle) after sample `from`, as a cycle fraction; NaN if none. */
const halfCrossOf = (f: ArrayLike<number>, half: number, from: number, up: boolean): number => {
  const n = f.length - 1;
  for (let i = from + 1; i <= n; i++) {
    const [y0, y1] = [f[i - 1] ?? 0, f[i] ?? 0];
    if (up ? y1 >= half : y1 < half) return (i - 1 + (half - y0) / (y1 - y0)) / n;
  }
  return Number.NaN;
};

/** The periodic search's outcome for turn 1. */
export interface CarvePeriodic {
  /** λ̇0 the root find landed on, turn 1's mirrored end λ̇ less it, and the resolution it stopped at, deg/s. */
  readonly lamDot0DegS: number;
  readonly residualDegS: number;
  readonly resolutionDegS: number;
  readonly evaluations: number;
  readonly converged: boolean;
  /** A march that stopped during the search: its λ̇0, deg/s, and why; null when none did. */
  readonly stopped: { readonly lamDot0DegS: number; readonly kind: CarveFlagKind } | null;
  /** Turn 2's own root maximum less the λ_peak it ran on (turn 1's), degrees. */
  readonly lamPeakMissDeg: number;
  /** Turn 1's period less the one its height ran on, s: the switch time's fixed point. */
  readonly periodMissS: number;
  /** Stepped leg only: turn 1's trigger time less the one its height ran on, s. */
  readonly triggerMissS?: number;
  /**
   * Across the switch from turn 1 into turn 2 (mirrored): each of λ, λ̇, p and the share, its largest change over the last
   * step into λ 0, the handover and the first step out, and the largest one-step change elsewhere in the two turns.
   */
  readonly seam: Readonly<Record<'lam' | 'lamDot' | 'p' | 'share', { readonly seam: number; readonly step: number }>>;
}

/** The next turn's start in its own side from a turn's end at λ 0. */
export const mirrorOf = (end: CarveState): CarveStart => ({ v: end.v, psi: Math.PI - end.psi, w: -end.w, y: end.y });

/** Across the switch from turn 1 into turn 2 (mirrored), each key's change against the largest one-step change elsewhere. */
const carveSeamOf = (one: CarveTurn, two: CarveTurn | null): CarvePeriodic['seam'] => {
  // The seam's change against the largest one-step change elsewhere, turn 1's samples mirrored into turn 2's side.
  const keys = ['lam', 'lamDot', 'p', 'share'] as const;
  const valueOf = (c: CarveSample, key: (typeof keys)[number], mirror: boolean): number =>
    key === 'share' ? (mirror ? 1 - c.share : c.share) : mirror ? -c[key] : c[key];
  return Object.fromEntries(
    keys.map((key) => {
      const [s1, s2] = [one.samples, two?.samples ?? []];
      const [before, end, first, after] = [s1[s1.length - 2], s1[s1.length - 1], s2[0], s2[1]];
      const across =
        before === undefined || end === undefined || first === undefined || after === undefined
          ? Number.NaN
          : Math.max(Math.abs(valueOf(end, key, true) - valueOf(before, key, true)), Math.abs(valueOf(first, key, false) - valueOf(end, key, true)), Math.abs(valueOf(after, key, false) - valueOf(first, key, false)));
      let most = 0;
      for (const sm of [s1, s2])
        for (let k = 1; k < sm.length; k++) {
          const [p, q] = [sm[k - 1], sm[k]];
          const atSeam = (sm === s1 && k === s1.length - 1) || (sm === s2 && k === 1);
          if (p !== undefined && q !== undefined && !atSeam) most = Math.max(most, Math.abs(valueOf(q, key, false) - valueOf(p, key, false)));
        }
      return [key, { seam: across, step: most }];
    }),
  ) as CarvePeriodic['seam'];
};

/**
 * Two carved turns. Turn 1 starts from the periodic λ̇0, its mirrored end λ̇ equal to its start: secant on λ̇0 from the
 * pendulum's fall from rest at the fall line's root and its fixed-point step, bisection once bracketed. λ_peak is the root's
 * largest λ over the turn by fixed point in the same loop. Turn 2 starts from turn 1's mirrored end.
 */
interface CarveCycle {
  readonly one: CarveTurn;
  readonly two: CarveTurn | null;
  readonly periodic: CarvePeriodic;
}

const carveCycle = (inp: CarveInputs, v0: number): CarveCycle => {
  let period = inp.periodS;
  let trigger = inp.triggerS ?? period;
  const at = (): CarveInputs => ({ ...inp, periodS: period, height: heightOf(inp.movement, inp.step, period, trigger), ...(inp.step === undefined ? {} : { triggerS: trigger }) });
  const h = inp.height(0).h;
  const fall = carveRootsOf(inp.s, v0, Math.PI / 2, inp.mMax, inp.share);
  let peak = (Number.isNaN(fall.first) ? fall.nearest : fall.first) - inp.mMax;
  const seed = Math.sqrt((2 * G * inp.s.cos * (1 - Math.cos(peak))) / h);
  const tol = seed / 2 ** CARVE_BISECT;
  let evaluations = 0;
  let stopped: CarvePeriodic['stopped'] = null;
  type Eval = { readonly w: number; readonly tr: CarveTurn; readonly r: number; readonly periodS: number; readonly triggerS: number };
  const run = (w: number): Eval => {
    const [ran, ranTrigger] = [period, trigger];
    const lean = Math.atan((h * w) / v0);
    const tr = carveTurn(at(), { v: v0, psi: inp.switchHeading === undefined ? lean : Math.PI / 2 - inp.switchHeading + lean, w, y: 0 }, peak);
    evaluations++;
    if (tr.end === null) stopped ??= { lamDot0DegS: w / DEG_RAD, kind: tr.stop?.kind ?? CarveFlagKind.Stall };
    else [peak, period, trigger] = [tr.maxLamB, tr.periodS, tr.releaseT];
    return { w, tr, r: tr.end === null ? Number.NaN : -tr.end.w - w, periodS: ran, triggerS: ranTrigger };
  };
  let a = run(seed);
  let best = a;
  let converged = false;
  if (a.tr.end !== null) {
    let b = run(-a.tr.end.w);
    let bracket: [Eval, Eval] | null = null;
    for (let j = 0; ; j++) {
      if (b.tr.end !== null && Math.abs(b.r) <= Math.abs(best.r)) best = b;
      if (b.tr.end !== null && a.tr.end !== null && a.r * b.r < 0) bracket = a.w < b.w ? [a, b] : [b, a];
      if (b.tr.end !== null && (b.r === 0 || Math.abs(b.w - a.w) <= tol)) {
        converged = true;
        break;
      }
      if (j >= CARVE_BISECT) break;
      let w = b.tr.end !== null && a.tr.end !== null && b.r !== a.r ? b.w - (b.r * (b.w - a.w)) / (b.r - a.r) : Number.NaN;
      if (bracket !== null && !(w > bracket[0].w && w < bracket[1].w)) w = (bracket[0].w + bracket[1].w) / 2;
      if (!Number.isFinite(w)) break;
      const c = run(w);
      if (bracket !== null && c.tr.end !== null) bracket = c.r * bracket[0].r > 0 ? [c, bracket[1]] : [bracket[0], c];
      [a, b] = [b, c];
    }
  }
  const one = best.tr;
  const two = one.end === null ? null : carveTurn(at(), mirrorOf(one.end), peak);
  const seam = carveSeamOf(one, two);
  const periodic: CarvePeriodic = {
    lamDot0DegS: best.w / DEG_RAD,
    residualDegS: best.r / DEG_RAD,
    resolutionDegS: tol / DEG_RAD,
    evaluations,
    converged,
    stopped,
    lamPeakMissDeg: two === null ? Number.NaN : (two.maxLamB - peak) / DEG_RAD,
    periodMissS: one.end === null ? Number.NaN : one.periodS - best.periodS,
    ...(inp.step === undefined ? {} : { triggerMissS: one.end === null ? Number.NaN : one.releaseT - best.triggerS }),
    seam,
  };
  return { one, two, periodic };
};

/** The bake's link gate on λ̇'s periodic defect, rad/s (scripts/solve/carve_cycle.py LINK_RAD_S). */
const BAKE_LINK_RAD_S = 1e-6;

/** The baked turn's release: the edge's peak, from which it falls to 0 at λ 0 (carveTurn's trigger and flip start). */
const bakedReleaseIndex = (eps: ReadonlyArray<number>): number => {
  let k = 0;
  for (let i = 1; i < eps.length; i++) if ((eps[i] ?? 0) > (eps[k] ?? 0)) k = i;
  return k;
};

/**
 * A baked cell's cycle (carve-bake.ts): turn 1 from its samples, turn 2 its mirror (equal in its own side, y on from
 * turn 1's end). λ_b, count, κ_mass and the ski heading by carveTurn's own functions; engaged where the bake's ε̇ is
 * within the ceiling rate on a pressed edge before the release.
 */
const bakedCycleOf = (inp: CarveInputs, cell: CarveCell): CarveCycle | null => {
  const c = cell.samples;
  const n = c.t.length;
  const num = (key: CarveSampleKey, i: number): number => c[key][i] ?? Number.NaN;
  const rel = bakedReleaseIndex(c.eps);
  const releaseT = num('t', rel);
  // y by the march's own rate v sin ψ, trapezoids between samples.
  const ys = [0];
  for (let i = 1; i < n; i++) ys.push((ys[i - 1] ?? 0) + ((num('t', i) - num('t', i - 1)) * (num('v', i - 1) * Math.sin(num('psi', i - 1)) + num('v', i) * Math.sin(num('psi', i)))) / 2);
  const samples: CarveSample[] = [];
  for (let i = 0; i < n; i++) {
    const [t, psi, v, lam, w, eps, load] = [num('t', i), num('psi', i), num('v', i), num('lam', i), num('lamDot', i), num('eps', i), num('load', i)];
    const r = carveRootOf(inp, psi, v);
    const pressed = num('pressed', i) === 1;
    const arc = t < releaseT;
    const past = !pressed || eps < 0;
    const engaged = arc && !past && Math.abs(num('epsDot', i)) <= inp.rate;
    const limited = arc && !engaged;
    samples.push({
      t,
      psi,
      v,
      y: ys[i] ?? 0,
      lam,
      lamDot: w,
      p: num('p', i),
      pDot: num('pDot', i),
      eps,
      demand: arc ? eps : Number.NaN,
      lamB: r.lamB,
      kSki: num('kSki', i),
      kMass: massCurvatureOf(load, lam, G * inp.s.sin * Math.cos(psi), v),
      load,
      share: num('share', i),
      pressed,
      skiHeading: skiHeadingFrom(psi, v, num('h', i), num('hDot', i), lam, w, num('pDot', i)),
      count: r.count,
      engaged,
      limited,
      past: past && limited,
    });
  }
  const [first, trig, last] = [samples[0], samples[rel], samples[n - 1]];
  if (first === undefined || trig === undefined || last === undefined) return null;
  const stateOf = (a: CarveSample): CarveState => ({ t: a.t, psi: a.psi, v: a.v, y: a.y, lam: a.lam, w: a.lamDot });
  const [from, end] = [stateOf(trig), stateOf(last)];
  const engageS = samples.find((a) => a.engaged)?.t ?? 0;
  // A cell exists only where the bake links with ε 0 at λ 0: the flip meets it.
  const { sw, maxB } = carveSwitchOf(samples, first.lamDot, end, from, trig.lamB, releaseT, true, cell.lamPeak, engageS);
  const one: CarveTurn = { samples, periodS: end.t, engageS, releaseS: end.t - from.t, releaseT, stop: null, sw, end, maxLamB: maxB };
  const shifted: CarveSample[] = [];
  for (const a of samples) shifted.push({ ...a, y: a.y + end.y });
  const two: CarveTurn = { ...one, samples: shifted, end: { ...end, y: end.y + end.y } };
  const periodic: CarvePeriodic = {
    lamDot0DegS: first.lamDot / DEG_RAD,
    residualDegS: (-end.w - first.lamDot) / DEG_RAD,
    resolutionDegS: BAKE_LINK_RAD_S / DEG_RAD,
    evaluations: 0,
    converged: true,
    stopped: null,
    lamPeakMissDeg: (Math.max(...c.lam) - cell.lamPeak) / DEG_RAD,
    periodMissS: one.periodS - cell.periodS,
    seam: carveSeamOf(one, two),
  };
  return { one, two, periodic };
};

/** The carve's balance, friction, drag, edge rate and margin from the task and options. */
interface CarveSetup {
  readonly compliance: number;
  readonly s: CarveBalance;
  readonly muAt: (vv: number) => number;
  readonly dragPerV2: number;
  readonly rateDeg: number;
  readonly rate: number;
  readonly reach: number;
  readonly mDeg: number;
  readonly inputs: CarveInputs;
}

export const carveSetupOf = (task: TurnTask, snow: Snow, options: SolveOptions): CarveSetup => {
  const compliance = options.snowCompliance ?? SNOW_COMPLIANCE[snow];
  const s = carveBalanceOf(task, compliance);
  const fr = options.friction;
  // A ski on edge, not the base gliding constant.
  const muAt = (vv: number): number => (fr === undefined ? EDGE_FRICTION : typeof fr === 'number' ? fr : fr.a + fr.b * vv);
  const dragPerV2 = (0.5 * 1 * (options.dragAreaM2 ?? DRAG_AREA_M2)) / (REFERENCE_SKIER.mass * G);
  const fixed = options.constantSpeed === true;
  const rateDeg = options.edgeRateDegS ?? EDGE_RATE_DEG_S;
  const rate = rateDeg * DEG_RAD;
  // Carved turns hold no counter (user, 2026-10-23): the reach at counter 0.
  const reach = angulationReach(0);
  const mDeg = Math.min(task.style.angulationDeg, reach);
  const mMax = mDeg * DEG_RAD;
  // Edge friction on the leg's force.
  const accel = (psi: number, v: number, load: number): number => (fixed ? 0 : G * (s.sin * Math.sin(psi) - muAt(v) * load - dragPerV2 * v * v));
  const movement: StanceMovement = { meanM: MASS_HEIGHT_M, rangeM: options.movementRangeM ?? task.style.movementRangeM ?? 0, phase: options.transitionPhase ?? task.style.transitionPhase ?? 0 };
  // The period's start: half a circle at the sidecut radius, which the edged arc never opens past.
  const periodS = (Math.PI * task.ski.sidecutRadius) / entrySpeedOf(task);
  const sw = options.switchHeadingDeg;
  const step = options.legStep;
  // The trigger's seed is the period's: no release time yet.
  const inputs: CarveInputs = { s, mMax, rate, accel, height: heightOf(movement, step, periodS, periodS), movement, periodS, share: task.style.outsideShare, stance: HIP_WIDTH_M, ...(sw === undefined ? {} : { switchHeading: sw * DEG_RAD }), ...(step === undefined ? {} : { step, triggerS: periodS }) };
  return { compliance, s, muAt, dragPerV2, rateDeg, rate, reach, mDeg, inputs };
};

/** The march's switch speed: a carved preset's entry, else the task's mean. */
const entrySpeedOf = (task: TurnTask): number => task.entrySpeedMps ?? task.speedMps;

/** A carved task's two marched turns (the lane's track and switch views). */
export const carveTurns = (task: TurnTask, snow: Snow, options: SolveOptions = {}): CarveCycle =>
  carveCycle(carveSetupOf(task, snow, options).inputs, entrySpeedOf(task));

/**
 * A carved task's turn (skid share 0): the mass a pendulum on the pressure centre (carveTurn), the skis on the mass path
 * offset by h sin λ + p at the ski's own curvature; the speed marched from the task's speed as the entry, never closed.
 * Turn size is an output.
 */
const solveCarved = (task: TurnTask, snow: Snow, options: SolveOptions): TurnProfile => {
  const n = options.samples ?? SAMPLES;
  const { compliance, s, muAt, dragPerV2, rateDeg, rate, reach, mDeg, inputs } = carveSetupOf(task, snow, options);
  // A turn that stops has no switch, so no next turn.
  // The baked whole-turn cycle where its inputs are this task's; else the forward march.
  const cell = carveCellFor(task, snow, options, options.carveCells);
  const baked = cell === null ? null : bakedCycleOf(inputs, cell);
  const { one: turn, two, periodic } = baked ?? carveCycle(inputs, entrySpeedOf(task));
  const sm = turn.samples;
  // The bake's speed is its own periodic output, not the task's.
  const v0 = baked === null ? entrySpeedOf(task) : (sm[0]?.v ?? entrySpeedOf(task));
  const last = sm[sm.length - 1];
  const v1 = turn.stop?.v ?? last?.v ?? v0;
  const v2 = two === null ? v1 : (two.stop?.v ?? two.samples[two.samples.length - 1]?.v ?? v1);
  const stopOf = (tr: CarveTurn, no: number): CarveStop | null =>
    tr.stop === null
      ? null
      : { kind: tr.stop.kind === CarveFlagKind.TooFast || tr.stop.kind === CarveFlagKind.Fell ? tr.stop.kind : CarveFlagKind.Stall, turn: no, t: tr.stop.t, headingDeg: tr.stop.psi / DEG_RAD, speedMps: tr.stop.v };
  const stop = stopOf(turn, 1) ?? (two === null ? null : stopOf(two, 2));
  const T = turn.periodS;
  const flags: CarveFlag[] = [];
  const spans = (tr: CarveTurn, no: number): void => {
    const add = (kind: CarveFlagKind, pred: (a: CarveSample, i: number) => boolean, all = false): void => {
      const hit = tr.samples.filter((a, i) => (all || (a.engaged && a.t <= tr.releaseT)) && pred(a, i));
      const [a, b] = [hit[0], hit[hit.length - 1]];
      if (a !== undefined && b !== undefined)
        flags.push({ kind, turn: no, fromT: a.t / tr.periodS, toT: b.t / tr.periodS, fromHeadingDeg: a.psi / DEG_RAD, toHeadingDeg: b.psi / DEG_RAD });
    };
    add(CarveFlagKind.SecondRoot, (a) => a.count >= 2);
    add(CarveFlagKind.SoftPastLevel, (a) => compliance > 0 && a.eps > SOFT_LEVEL_EDGE_DEG * DEG_RAD);
    const sm2 = tr.samples;
    const rateOf = (i: number): number => {
      const [a, b] = [sm2[i], sm2[i + 1]];
      return a === undefined || b === undefined || !(b.t > a.t) ? 0 : Math.abs(b.eps - a.eps) / (b.t - a.t);
    };
    add(CarveFlagKind.EdgeRateOver, (_, i) => rateOf(i) > rate * (1 + 1e-6), true);
    // One span per contiguous run where the rate limit binds.
    let run: CarveSample[] = [];
    for (const a of [...sm2, null]) {
      if (a !== null && a.limited) run.push(a);
      else if (run.length > 0) {
        const [p, q] = [run[0], run[run.length - 1]];
        if (p !== undefined && q !== undefined)
          flags.push({ kind: CarveFlagKind.EdgeRateLimited, turn: no, fromT: p.t / tr.periodS, toT: q.t / tr.periodS, fromHeadingDeg: p.psi / DEG_RAD, toHeadingDeg: q.psi / DEG_RAD });
        run = [];
      }
    }
    add(CarveFlagKind.NegativeLegForce, (a) => a.load < 0, true);
    add(CarveFlagKind.EdgeBelowLean, (a) => a.lam > 0 && a.eps < a.lam - 1e-9, true);
    add(CarveFlagKind.BridgedUnderLoad, (a) => !a.pressed && a.load > 0, true);
    add(CarveFlagKind.HoldPastEdge, (a) => a.past, true);
    const sw = tr.sw;
    if (sw !== null && !sw.flipped) flags.push({ kind: CarveFlagKind.FlipLate, turn: no, fromT: tr.releaseT / tr.periodS, toT: 1, fromHeadingDeg: 0, toHeadingDeg: 180 });
    const at = tr.stop;
    if (at !== null) flags.push({ kind: at.kind, turn: no, fromT: 1, toT: 1, fromHeadingDeg: at.psi / DEG_RAD, toHeadingDeg: at.psi / DEG_RAD });
  };
  spans(turn, 1);
  if (two !== null) spans(two, 2);
  if (task.style.angulationDeg > reach) flags.push({ kind: CarveFlagKind.PastReach, turn: 1, fromT: 0, toT: 1, fromHeadingDeg: 0, toHeadingDeg: 180 });
  // Resample onto t = i T / n, the last the switch.
  const at = (key: (a: CarveSample) => number): number[] => {
    const out: number[] = [];
    let k = 0;
    for (let i = 0; i <= n; i++) {
      const t = (i * T) / n;
      while (k + 1 < sm.length - 1 && (sm[k + 1]?.t ?? 0) <= t) k++;
      const [a, b] = [sm[k], sm[k + 1] ?? sm[k]];
      if (a === undefined || b === undefined) {
        out.push(0);
        continue;
      }
      const u = b.t > a.t ? Math.min(1, (t - a.t) / (b.t - a.t)) : 0;
      out.push(key(a) + u * (key(b) - key(a)));
    }
    return out;
  };
  const ts = Array.from({ length: n }, (_, i) => i / n);
  const headingAll = at((a) => a.psi);
  const vAll = at((a) => a.v);
  const heading = headingAll.slice(0, n);
  const lean = at((a) => a.lam).slice(0, n);
  const edge = at((a) => a.eps).slice(0, n);
  const kSki = at((a) => a.kSki).slice(0, n);
  const kMass = at((a) => a.kMass).slice(0, n);
  const load = at((a) => a.load).slice(0, n);
  const shareCurve = at((a) => a.share).slice(0, n);
  const skiHeading = at((a) => a.skiHeading).slice(0, n);
  const f = lean.map((l) => s.cos * Math.tan(l));
  const fPeak = Math.max(...f);
  const skiRadius = kSki.map((k) => Math.min(STRAIGHT_RADIUS_M, 1 / Math.abs(k)));
  const massShare = kMass.map((k, i) => k * (skiRadius[i] ?? 0));
  const arcShare = f.map((x) => Math.max(0, x) / fPeak);
  const carveMargin = edge.map((e, i) => e - (lean[i] ?? 0));
  const speed = Float64Array.from(vAll.slice(0, n));
  const pathM = [0];
  for (let i = 1; i <= n; i++) pathM.push((pathM[i - 1] ?? 0) + (T * ((vAll[i - 1] ?? 0) + (vAll[i] ?? 0))) / (2 * n));
  const sums = [0, 0, 0];
  let along = 0;
  for (let i = 0; i < n; i++) {
    const vi = vAll[i] ?? 0;
    sums[0] = (sums[0] ?? 0) + s.sin * Math.sin(heading[i] ?? 0) * vi;
    sums[1] = (sums[1] ?? 0) + muAt(vi) * (load[i] ?? 0) * vi;
    sums[2] = (sums[2] ?? 0) + dragPerV2 * vi * vi * vi;
    along += vi;
  }
  const [gain = 0, friction = 0, drag = 0] = sums.map((x) => x / along);
  let fallLine = Number.NaN;
  for (let i = 1; i <= n && Number.isNaN(fallLine); i++) {
    const [h0, h1] = [headingAll[i - 1] ?? 0, headingAll[i] ?? 0];
    if (h1 >= Math.PI / 2) fallLine = (i - 1 + (Math.PI / 2 - h0) / (h1 - h0)) / n;
  }
  const loadAt = (i: number): number => load[((i % n) + n) % n] ?? 0;
  let p = 0;
  for (let i = 1; i < n; i++) if (loadAt(i) > loadAt(p)) p = i;
  const curve = loadAt(p - 1) - 2 * loadAt(p) + loadAt(p + 1);
  const off = curve < 0 ? (0.5 * (loadAt(p - 1) - loadAt(p + 1))) / curve : 0;
  const forcePeak = wrap((p + off) / n);
  // §4.7: engagement and release where f crosses half its peak, as the groomed solve reads them.
  const fAll = at((a) => a.lam).map((l) => s.cos * Math.tan(l));
  const fTop = fAll.reduce((top, x, i) => (x > (fAll[top] ?? 0) ? i : top), 0);
  const fHalf = (fAll[fTop] ?? 0) / 2;
  const events: TurnEvents = { switch: 0, engagement: halfCrossOf(fAll, fHalf, 0, true), fallLine, forcePeak, release: halfCrossOf(fAll, fHalf, fTop, false) };
  let skisHalfSweep = 0;
  let most = 0;
  for (const a of sm) most = Math.max(most, a.psi);
  for (let i = 0; i < n; i++) skisHalfSweep = Math.max(skisHalfSweep, Math.abs((skiHeading[i] ?? 0) - Math.PI / 2));
  let arcRate = 0;
  for (let k = 1; k < sm.length; k++) {
    const [a, b] = [sm[k - 1], sm[k]];
    if (a?.engaged === true && b?.engaged === true && b.t > a.t) arcRate = Math.max(arcRate, Math.abs(b.eps - a.eps) / (b.t - a.t));
  }
  const zeros = ts.map(() => 0);
  const speedList = [...speed];
  const carve: CarveReport = {
    turnSizeM: last?.y ?? 0,
    cycleS: T + (two?.periodS ?? 0),
    speedChangeTurnMps: v1 - v0,
    speedChangeCycleMps: v2 - v0,
    leastSkiRadiusM: Math.min(...skiRadius.filter((_, i) => (arcShare[i] ?? 0) > 0)),
    edgeRateDegS: rateDeg,
    arcEdgeRateDegS: arcRate / DEG_RAD,
    engageS: turn.engageS,
    releaseS: turn.releaseS,
    overshootDeg: (most - Math.PI) / DEG_RAD,
    angulationDeg: mDeg,
    stop,
    flags,
    switch: turn.sw,
    periodic,
  };
  return {
    t: ts,
    arcShare,
    massShare,
    heading,
    lean,
    load,
    edge,
    skiRadius,
    periodS: T,
    // The bake's sweep is solved; the march runs to the cap.
    halfSweep: baked === null ? Math.PI / 2 : Math.max(...headingAll.map((h) => Math.abs(h - Math.PI / 2))),
    skisHalfSweep,
    mogul: null,
    events,
    speed,
    attack: zeros,
    gammaE: 0,
    energy: { gain, friction, skid: 0, bump: 0, drag },
    pathM,
    // The bake is the periodic root; the march is never closed.
    closure: { root: baked !== null, converged: periodic.converged && turn.sw?.flipped === true, passes: periodic.evaluations, residual: v1 - v0 },
    at: (t: number): ProfilePoint => ({
      arcShare: lerp(arcShare, t, same),
      massShare: lerp(massShare, t, flip),
      heading: lerp(heading, t, (y) => Math.PI - y),
      lean: lerp(lean, t, flip),
      load: lerp(load, t, same),
      edge: lerp(edge, t, flip),
      skiRadius: lerp(skiRadius, t, same),
      speed: lerp(speedList, t, same),
      attack: lerp(zeros, t, same),
      clearance: null,
      bendRadius: null,
      outsideShare: lerp(shareCurve, t, same),
    }),
    skiHeading,
    carveMargin,
    outsideShare: shareCurve,
    topHalfSweep: Math.PI / 2,
    topBound: TopBound.Cap,
    gripDemand: Math.max(...lean.map((l) => Math.abs(Math.tan(l)))),
    boundary: stop?.turn !== 1 ? Boundary.None : stop.kind === CarveFlagKind.Stall ? Boundary.Stall : Boundary.TooFastToCarve,
    bridgeShare: (turn.engageS + turn.releaseS) / T,
    bridgeShareMin: (turn.engageS + turn.releaseS) / T,
    sigmaMin: 0,
    carve,
  };
};

/** The task's cycle (motion-model §4.1, §9 V): the bump line on h > 0, the carve at σ 0, the groomed solve otherwise. */
export const solveProfile = (task: TurnTask, snow: Snow, options: SolveOptions = {}): TurnProfile =>
  task.bumpHeightM > 0 ? solveBumps(task, snow, options) : task.skidShare === 0 ? solveCarved(task, snow, options) : solveGroomed(task, snow, options);

/** The arc share's peak time: the task's own, else ARC_PEAK_T. */
export const arcPeakTOf = (task: TurnTask): number => task.arcPeakT ?? ARC_PEAK_T;

/** The task's solved cycle, cached per task and snow. */
export const turnProfile = (task: TurnTask, snow: Snow = task.snow ?? Snow.HardGroomed): TurnProfile => {
  let bySnow = profiles.get(task);
  if (bySnow === undefined) {
    bySnow = new Map();
    profiles.set(task, bySnow);
  }
  const hit = bySnow.get(snow);
  if (hit !== undefined) return hit;
  const p = solveProfile(task, snow);
  bySnow.set(snow, p);
  return p;
};

/**
 * The skis' travel heading at `t` on a bump task, the mass heading's convention: the line's (lineHeading) where the skis
 * are down it, t in [0, 1] taken as is so the cycle's end reads the mirrored next turn's first sample, as pathAt does.
 */
const mogulLineHeadingAt = (task: TurnTask, t: number): number => {
  const { swing, ride } = mogulLineFor(task);
  const { down } = ride.track;
  const n = down.length;
  const u = (t >= 0 && t <= 1 ? t : wrap(t)) * n;
  const i = Math.min(n - 1, Math.floor(u));
  const f = u - i;
  const z1 = i + 1 < n ? (down[i + 1] ?? 0) : task.bumpSpacingM + (down[0] ?? 0);
  const z = (down[i] ?? 0) * (1 - f) + z1 * f;
  return Math.PI / 2 + lineHeading({ spacing: task.bumpSpacingM, relief: task.bumpHeightM, swing }, z);
};

/**
 * The skis' heading at `t`, radians, in the mass heading's convention (0 across the hill at the top, π/2 the fall line):
 * the line plus the attack γ on bumps; the skis' path travel plus γ on groomed snow.
 */
export const skiHeadingAt = (task: TurnTask, t: number, snow: Snow = task.snow ?? Snow.HardGroomed): number => {
  const p = turnProfile(task, snow);
  if (task.bumpHeightM > 0) return mogulLineHeadingAt(task, t) + p.at(t).attack * DEG_RAD;
  return lerp(p.skiHeading ?? p.heading, t, (y) => Math.PI - y);
};

export interface CounterBand {
  readonly minDeg: number;
  readonly maxDeg: number;
  /** Pelvis share 1 (moguls): the band holds the pelvis against the fall line, not the outside ski. */
  readonly aboutFallLine: boolean;
}

/**
 * Counter band at `t`, degrees (motion-model §4.5). Counter = pelvis yaw − outside ski yaw, + when the pelvis faces the
 * turn's outside more than the ski. Groomed: the pelvis faces the mass heading plus the style's habit, so the centre is
 * the skis' heading less the mass heading plus counterHabitDeg. Bumps at pelvis share 1: the tolerance about the fall line.
 */
export const counterBandAt = (task: TurnTask, t: number, snow: Snow = task.snow ?? Snow.HardGroomed): CounterBand => {
  const [lo, hi] = task.legacy.counterToleranceDeg;
  const h = turnProfile(task, snow).at(t).heading;
  if (task.bumpHeightM > 0) {
    const share = task.legacy.pelvisShare ?? 1;
    if (share === 1) return { minDeg: lo, maxDeg: hi, aboutFallLine: true };
    const pivot = (skiHeadingAt(task, t, snow) - h + share * (h - Math.PI / 2)) / DEG_RAD;
    return { minDeg: pivot + lo, maxDeg: pivot + hi, aboutFallLine: false };
  }
  const centre = (skiHeadingAt(task, t, snow) - h) / DEG_RAD + task.style.counterHabitDeg;
  return { minDeg: centre + lo, maxDeg: centre + hi, aboutFallLine: false };
};

/**
 * Lean, load and heading on the mass path, r_mass = r_ski / w(t) (motion-model §4.1, §4.4). The arc share keeps
 * ARC_SHARE's inferred shape for every kind; to be replaced by measured force profiles: GS falda-buscaiot-2017
 * phase means 218/279/187 % over 21/33/32/14 % and zorko-2015 0.54/1.48/1.83/0.64 BW (carving), bon-2021 (short),
 * regular from nakazato-2011 once read, moguls inferred.
 */
export const massPathForcesAt = (task: TurnTask, t: number): MassPathForces => {
  const p = turnProfile(task).at(t);
  return { lean: p.lean, load: p.load, heading: p.heading, arcShare: p.arcShare, speed: p.speed };
};
