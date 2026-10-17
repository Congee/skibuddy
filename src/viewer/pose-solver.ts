// Build time only: scripts/anatomy/pose-tables.ts solves every definition into src/viewer/poses/tables.json.
import { arcLoad, brakingTilt, comRadius, isTurn, turnForcesAt } from '../physics/turn';
import type { DrillScenario, TurnForces, TurnScenario } from '../physics/turn';
import { EQUIPMENT, minShinAngle, shinAngle } from './equipment';
import { BodySide, SEGMENTS, SegmentKind } from './figure';
import { compose, identity, inverseRotation, rotationX, rotationY, rotationZ, transformPoint } from './mat4';
import type { Mat4, Vec3 } from './mat4';
import { HeadAim, keyValuesAt, touchShare, windowShare, wrapTime } from './pose-definition';
import type { HeadRule, KeyField, PoseDefinition } from './pose-definition';
import { HEAD_LIMIT, gazeHeading } from './gaze';
import { CORRIDOR_SHARE, headingAt } from './turn-heading';
import type { TurnPath } from './turn-heading';
import { FLAT_RIDE, rideOf, skiOn } from './ride';
import type { Ride } from './ride';
import { MogulLine, SurfaceKind, trackRest } from './surface';
import type { Surface } from './surface';
import { REFERENCE_SKIER, skiEnds } from './skier';
import type { ReferenceSkier, Ski } from './skier';

const DEG = Math.PI / 180;
/** The shin's forward limit in a shell, inferred. */
const SHIN_MAX = 50 * DEG;
/** Lean by which a fold turned toward the inside is fully answered by hip angulation; inferred. */
const FOLD_HANDOVER = 20 * DEG;
const smooth = (u: number): number => u * u * (3 - 2 * u);
/** The body rolls onto the balance axis as the lean builds past BALANCE_FROM, or nears its turn's peak; inferred. */
const BALANCE_FROM = 15 * DEG;
const BALANCE_BY = 20 * DEG;
const BALANCE_PEAK = 0.9;
const peaks = new WeakMap<TurnScenario, number>();
const peakLean = (s: TurnScenario): number => {
  const known = peaks.get(s);
  if (known !== undefined) return known;
  const peak = Math.max(...Array.from({ length: 48 }, (_, k) => Math.abs(turnForcesAt(s, k / 48).tilt)));
  peaks.set(s, peak);
  return peak;
};
const fade = (u: number): number => smooth(Math.min(1, Math.max(0, u)));
// Nil at the switch, so the mass still leads into the new turn there; either fade, kink-free, as tables interpolate.
const balanceShare = (lean: number, s: TurnScenario): number => {
  const a = Math.abs(lean);
  return 1 - (1 - fade((a - BALANCE_FROM) / (BALANCE_BY - BALANCE_FROM))) * (1 - fade(a / (BALANCE_PEAK * peakLean(s))));
};
import { ARM_ABDUCTION, ARM_FLEXION, CAPSULE_ARM, CAPSULE_GRIP, PLANT_AHEAD, SKI_BASE, MID_FOOT, aheadOnSki, centreOfMass, outsideWeight, pelvisRotation, poleDirection, poleSize, segmentMatrices, skiEndPoints, skiIndex, touchSide, thighPitch, turnDepth } from './pose';
import type { LegPose, Pose, SkiEnds } from './pose';

/** How hard the drill is skied, from its physics. */
export interface Effort {
  /** Outside hip flexion at its most open, degrees. */
  readonly hipMin: number;
  /** Outside hip flexion at its deepest, degrees. */
  readonly hipMax: number;
  /** -1 gentle .. 0 moderate .. +1 dynamic, from the hip depth; scales the milder fields. */
  readonly scale: number;
}

const interpolate = (table: ReadonlyArray<readonly [number, number, number]>, x: number): readonly [number, number] => {
  const first = table[0];
  const last = table.at(-1);
  if (first === undefined || last === undefined) throw new Error('empty table');
  if (x <= first[0]) return [first[1], first[2]];
  for (let i = 1; i < table.length; i++) {
    const a = table[i - 1];
    const b = table[i];
    if (a === undefined || b === undefined || x > b[0]) continue;
    const f = (x - a[0]) / (b[0] - a[0]);
    return [a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];
  }
  return [last[1], last[2]];
};

/** The fall-line load of a turn; a drill that is not a turn stands on the slope's normal share of weight. */
const loadOf = (s: DrillScenario | null): number => {
  if (s === null) return 1;
  return isTurn(s) ? arcLoad(s) : Math.cos((s.slopeDeg * Math.PI) / 180);
};

export const effortOf = (def: PoseDefinition, scenario: DrillScenario | null): Effort => {
  const rows = def.constraints.hipByLoad;
  const [hipMin, hipMax] = interpolate(rows, loadOf(scenario));
  const mid = rows[Math.floor(rows.length / 2)]?.[1] ?? hipMin;
  const span = rows.length > 1 ? mid - (rows[0]?.[1] ?? mid) : 0;
  return { hipMin, hipMax, scale: span === 0 ? 0 : (hipMin - mid) / span };
};

/** Head yaw beyond the chest, toward the outside, that `rule` asks for at turn time `t` given the chest's heading on the skis. */
export const headYawOf = (rule: HeadRule | undefined, scenario: DrillScenario | null, t: number, chest: number, set?: number, run?: TurnPath): number => {
  if (rule === undefined || rule.aim === HeadAim.Chest || scenario === null || !isTurn(scenario)) return 0;
  const corridor = rule.aim === HeadAim.FallLine ? rule.corridor : CORRIDOR_SHARE * scenario.radiusM;
  const path = rule.aim !== HeadAim.FallLine && run !== undefined ? run : { radius: scenario.radiusM, corridor, ...(set === undefined ? {} : { set }) };
  // The gaze lies the skis' heading, less its own, off the fall line toward the outside.
  const yaw = headingAt(t, path) - gazeHeading(rule, path, scenario.speedMps, t) - chest;
  return Math.min(HEAD_LIMIT, Math.max(-HEAD_LIMIT, yaw));
};

// Above the outside tip, which sits on the snow unless both skis pitch or the snow under the tips differs.
const insideTipHeight = (pose: Pose, ski: SkiEnds): number => {
  const world = segmentMatrices(pose);
  const tip = (side: BodySide): number => transformPoint(world[skiIndex(side)] ?? identity(), ski.tip)[1];
  return tip(BodySide.Left) - tip(BodySide.Right);
};

/**
 * On firm snow the boots stand `clearance` over it, or higher if a tip-down tip would dip under it; a tip-up ski's
 * tail stays under it, drawn so for the bent, loaded tail.
 */
const riseOf = (pose: Pose, clearance: number, ski: SkiEnds): number => {
  const world = segmentMatrices({ ...pose, rise: 0 });
  const tip = (side: BodySide): number => transformPoint(world[skiIndex(side)] ?? identity(), ski.tip)[1];
  return Math.max(0, clearance, -Math.min(tip(BodySide.Left), tip(BodySide.Right)));
};

/** Softness of the lowest end, metres: the rise stays smooth as tail and tip swap. */
const BASE_SOFTNESS = 0.005;

/** In loose snow the pitched skis ride the packed base: the boots rise until neither ski's end dips under it. */
const baseRiseOf = (pose: Pose, ski: SkiEnds): number => {
  const world = segmentMatrices({ ...pose, rise: 0 });
  const end = (side: BodySide, point: Vec3): number => transformPoint(world[skiIndex(side)] ?? identity(), point)[1];
  const depths = [BodySide.Left, BodySide.Right].flatMap((side) => [-end(side, ski.tip), -end(side, ski.tail)]);
  const most = Math.max(...depths);
  return Math.max(0, most + BASE_SOFTNESS * Math.log(depths.reduce((sum, d) => sum + Math.exp((d - most) / BASE_SOFTNESS), 0)));
};

const segmentOf = (kind: SegmentKind, side: BodySide): number => SEGMENTS.findIndex((s) => s.kind === kind && s.side === side);

/** A segment pitched forward of the slope normal, radians. */
const pitchOf = (world: ReadonlyArray<Mat4>, kind: SegmentKind, side: BodySide): number => {
  const m = world[segmentOf(kind, side)] ?? identity();
  return Math.atan2(m[6] ?? 0, m[5] ?? 1);
};

/** The trunk behind the outside shin, each pitched from the slope normal, radians. */
const trunkBehindShin = (world: ReadonlyArray<Mat4>): number =>
  pitchOf(world, SegmentKind.Shin, BodySide.Right) - pitchOf(world, SegmentKind.Trunk, BodySide.Center);

/**
 * The centre of mass ahead of the outside mid-foot; near the transition, where the outside foot changes, ahead of
 * a point between both, so a turn's end balances as the mirrored next turn's start. Along the ski, or on firm snow
 * along the snow, which takes the load of a pitched ski at its tail or tip. Measured from the snow's force line
 * through the foot, `brake` its tangent uphill of the slope normal.
 */
const balanceAhead = (world: ReadonlyArray<Mat4>, t: number, firm: boolean, brake: number): number => {
  const w = 0.5 * (1 - turnDepth(t)) ** 8;
  const right = transformPoint(world[segmentOf(SegmentKind.Boot, BodySide.Right)] ?? identity(), MID_FOOT);
  const left = transformPoint(world[segmentOf(SegmentKind.Boot, BodySide.Left)] ?? identity(), MID_FOOT);
  const foot: Vec3 = [(1 - w) * right[0] + w * left[0], (1 - w) * right[1] + w * left[1], (1 - w) * right[2] + w * left[2]];
  const com = centreOfMass(world);
  const line = brake * Math.hypot(com[0] - foot[0], com[1] - foot[1]);
  return (firm ? com[2] - foot[2] : aheadOnSki(world, com, foot)) + line;
};

/**
 * The snow's force line uphill of the slope normal at turn time t, radians: braking to hold the speed, against the
 * load. The skis head along the surface's path, the mass off the fall line by the share radiusM / comRadiusM of it.
 */
export const brakingTiltAt = (scenario: DrillScenario | null, surface: Surface | null, t: number): number => {
  if (scenario === null || !isTurn(scenario) || (scenario.brakingShare ?? 0) === 0) return 0;
  const path = surface?.path ?? { radius: scenario.radiusM, corridor: CORRIDOR_SHARE * scenario.radiusM };
  const ski = headingAt(t, path);
  return brakingTilt(scenario, ski, (ski * scenario.radiusM) / comRadius(scenario), pathForcesAt(scenario, surface, t).load);
};

/** Forces at turn time t, run ahead by the path's `forces`, for the braking load; past the switch, the mirrored next turn's. */
const pathForcesAt = (scenario: TurnScenario, surface: Surface | null, t: number): TurnForces => {
  const u = wrapTime(t) + (surface?.path.forces ?? 0);
  const f = turnForcesAt(scenario, u);
  return u < 1 ? f : { load: f.load, tilt: -f.tilt };
};

/** Half-width of the window the body balances the snow's force over, seconds: about a postural correction's latency; inferred. */
const BALANCE_LAG = 0.15;
const LAG_SAMPLES = 16;

/**
 * On moguls the snow pushes along the skis' normal, pitched downhill on a backside; the body cannot re-balance at
 * 2-3 turns a second, so it meets that pitch raised-cosine averaged over BALANCE_LAG either side of t, through the
 * mirrored next turn. Radians uphill of the slope normal; 0 off moguls.
 */
export const snowPitchAt = (scenario: DrillScenario | null, surface: Surface | null, t: number, skier: ReferenceSkier = REFERENCE_SKIER): number => {
  if (scenario === null || surface === null || surface.kind !== SurfaceKind.Moguls || surface.speed === 0) return 0;
  const { tip, tail } = skiEnds(skiOn(surface, skier));
  const half = (BALANCE_LAG * scenario.speedMps) / surface.speed;
  let sum = 0;
  let weights = 0;
  for (let i = 0; i < LAG_SAMPLES; i++) {
    const u = (2 * (i + 0.5)) / LAG_SAMPLES - 1;
    const w = 1 + Math.cos(Math.PI * u);
    // On a face the feet lead and the body catches up, centred, rather than sitting back on its pitch (duncan-smith-2021 3:30-3:54).
    sum += w * Math.min(0, trackRest(surface, wrapTime(t + u * half), tip, -tail).pitch);
    weights += w;
  }
  // Down the backside the ankle brings the tip down and presses it downhill (duncan-smith-2021 3:00-3:25).
  return sum / weights;
};

/** The snow's force line the mass balances on, radians uphill of the slope normal: the skis' averaged pitch plus braking. */
export const forceTiltAt = (scenario: DrillScenario | null, surface: Surface | null, t: number, skier: ReferenceSkier = REFERENCE_SKIER): number =>
  brakingTiltAt(scenario, surface, t) + snowPitchAt(scenario, surface, t, skier);

type Spine = Pick<Pose, 'spineFlex' | 'spineBend' | 'spineTwist'>;

/** The spine that tips the trunk `outward` about the body frame's fore-aft axis, so the tip adds no pitch. */
const spineTipped = (pelvis: Mat4, spine: Spine, outward: number): Spine => {
  if (outward === 0) return spine;
  const keyed = compose(rotationY(-spine.spineTwist), rotationZ(spine.spineBend), rotationX(spine.spineFlex));
  const m = compose(inverseRotation(pelvis), rotationZ(outward), pelvis, keyed);
  // Back to the trunk's twist, bend and flex, in that order.
  return { spineTwist: -Math.atan2(-(m[2] ?? 0), m[0] ?? 1), spineBend: Math.asin(m[1] ?? 0), spineFlex: Math.atan2(-(m[9] ?? 0), m[5] ?? 1) };
};

/** The centre of mass toward the inside of the snow's force line through the skis, before the balance roll takes it out. */
const inwardOfForce = (pose: Pose): number => {
  const world = segmentMatrices(pose, false);
  const o = outsideWeight(pose.lean);
  const right = transformPoint(world[skiIndex(BodySide.Right)] ?? identity(), [0, SKI_BASE, 0]);
  const left = transformPoint(world[skiIndex(BodySide.Left)] ?? identity(), [0, SKI_BASE, 0]);
  const com = centreOfMass(world);
  const dx = com[0] - (o * right[0] + (1 - o) * left[0]);
  const dy = com[1] - (o * right[1] + (1 - o) * left[1]);
  return dx * Math.cos(pose.lean) - dy * Math.sin(pose.lean);
};

/** How far ahead of its own ankle the touching pole's full touch lands. */
const touchAhead = (pose: Pose, basket: number): number => {
  const world = segmentMatrices(pose);
  const side = touchSide(pose);
  const at = (kind: SegmentKind, p: Vec3): Vec3 => transformPoint(world[segmentOf(kind, side)] ?? identity(), p);
  const grip = at(SegmentKind.Forearm, CAPSULE_GRIP);
  const ankle = at(SegmentKind.Boot, [0, 0, 0]);
  const elbow = at(SegmentKind.Forearm, [0, 0, 0]);
  const forearm: Vec3 = [grip[0] - elbow[0], grip[1] - elbow[1], grip[2] - elbow[2]];
  return grip[2] + poleDirection(grip, side, 1, ankle, basket, forearm)[2] * basket - ankle[2];
};

/**
 * The exact pose at turn time `t`, solved by bisection; about 125 skeleton passes, so it runs at build time only.
 * The shin follows the ankle's dorsiflexion plus the boot's ramp, the outside hip holds its keyed flexion on the
 * pelvis, the knee bends until the centre of mass sits `comAhead` of mid-foot, and the inside hip flexes until
 * its ski tip just touches the snow. `scenario` null, or one without a radius, stands without turning.
 */
export const solvePose = (def: PoseDefinition, t: number, scenario: DrillScenario | null, surface: Surface | null = null, skier: ReferenceSkier = REFERENCE_SKIER): Pose =>
  solveRidden(def, t, scenario, surface, null, skier).pose;

/** Knee flexion over which the absorbing knee eases into its range's ends, radians; inferred. */
const ABSORB_EASE = 6 * DEG;
/** On bumps the balancing knee may open near straight, as the absorbing one does. */
const KNEE_FLOOR = 5;

/** Share the thighs' draw grows per radian the absorbing knee folds past SQUEEZE_FROM; inferred. */
const STANCE_SQUEEZE = 0.75;
const SQUEEZE_FROM = 60 * DEG;

/** Over this either side of the cuff the shin eases onto it on bumps; inferred. */
const CUFF_EASE = 3 * DEG;
/** The trunk stands up off the shin by at most this, radians; inferred. */
const UPRIGHT_MAX = 20 * DEG;
/** The most the trunk leans behind the shin, from the slope normal; inferred. */
const TRUNK_BEHIND = 20 * DEG;
/** Zipper trunk behind the shin: up to STAND_PEAK on the backside, up to TROUGH_AHEAD ahead in the trough; inferred. */
const STAND_PEAK = 15 * DEG;
const STAND_END = 0.45;
const TROUGH_AHEAD = 2 * DEG;
const TROUGH_END = 0.75;
/** Past a straight hip, the lumbar spine unflexes by at most this, into slight extension if need be; inferred. */
const UNFLEX_MAX = 10 * DEG;
const standBehind = (t: number): number => {
  const u = wrapTime(t);
  if (u < STAND_END) return STAND_PEAK * Math.sin((Math.PI * u) / STAND_END) ** 2;
  return u >= TROUGH_END ? 0 : -TROUGH_AHEAD * Math.sin((Math.PI * (u - STAND_END)) / (TROUGH_END - STAND_END)) ** 2;
};

/** `x` held in [lo, hi], easing quadratically onto each end from `w` inside it to `w` beyond; hi - lo > 2w. */
const softClamp = (x: number, lo: number, hi: number, w: number): number => {
  const up = x <= lo - w ? lo : x >= lo + w ? x : lo + (x - lo + w) ** 2 / (4 * w);
  return up >= hi + w ? hi : up <= hi - w ? up : hi - (hi + w - up) ** 2 / (4 * w);
};

/** On moguls with `absorb`, the unclamped knee a sample absorbs with and its ride: a warm start for the next. */
interface Warm {
  readonly hip: number;
  readonly ride: Ride;
  readonly slope: number;
}

/** The pose and, on moguls with `absorb`, its warm start for the next sample. */
const solveRidden = (
  def: PoseDefinition,
  t: number,
  scenario: DrillScenario | null,
  surface: Surface | null,
  warm: Warm | null,
  skier: ReferenceSkier,
): { readonly pose: Pose; readonly warm: Warm | null } => {
  if (surface === null || surface.kind !== SurfaceKind.Moguls) return { pose: solveOn(def, t, scenario, surface, FLAT_RIDE, null, false, skier), warm: null };
  const c = def.constraints;
  const ridden = (hip: number | null, ride: Ride): { readonly pose: Pose; readonly ride: Ride } => {
    const pose = solveOn(def, t, scenario, surface, ride, hip, true, skier);
    return { pose, ride: rideOf(surface, t, pose, skier) };
  };
  const settle = (hip: number | null, ride: Ride): Pose => solveOn(def, t, scenario, surface, ridden(hip, ride).ride, hip, true, skier);
  if (c.absorb === undefined) return { pose: settle(null, ridden(null, ridden(null, FLAT_RIDE).ride).ride), warm: null };
  const [lo, hi] = absorbRange(def, scenario);
  const level = levelOf(def, scenario, surface, skier).at(t);
  // The knee folds as the snow rises under the skis, so the mass rides at `level` while the legs reach; past the
  // range's ends it eases in, so the knee settles on its stops without a kink.
  const w = ABSORB_EASE;
  const held = (hip: number): number => softClamp(hip, lo, hi, w);
  const guess = warm?.hip ?? null;
  let ride = warm?.ride ?? rideOf(surface, t, solveOn(def, t, scenario, surface, FLAT_RIDE, held(lo), true, skier), skier);
  // The mass's height over the level with the unclamped knee held in range by its ease, ridden afresh from one start
  // so the secant sees a function of the knee alone, not of the order it was tried in.
  const start = ride;
  const above = (knee: number): number => {
    const next = ridden(held(knee), ridden(held(knee), start).ride);
    ride = next.ride;
    return ride.lift + centreOfMass(segmentMatrices(next.pose))[1] - level;
  };
  // Secant on the unclamped knee, started where the ease still moves it; the height falls near linearly with it.
  let a = Math.min(hi + w - 2 * DEG, Math.max(lo - w + DEG, guess ?? (lo + hi) / 2));
  let fa = above(a);
  // Far under the table's precision and far over the engines' last-bit noise, so neither flips the stop.
  const tol = 1e-6;
  // On an end stop the ease flattens the height and the ride's noise can flip the slope: step back into the range.
  const step = warm === null || Math.abs(fa) <= tol ? DEG : warm.slope < 0 ? -fa / warm.slope : (lo + hi) / 2 - a;
  let b = Math.abs(fa) <= tol ? a : Math.min(hi + w, Math.max(lo - w, a + step));
  let fb = b === a ? fa : above(b);
  // Slope only from knees far enough apart that the ride's noise cannot flip its sign.
  let slope = warm?.slope ?? 0;
  const measure = (): void => {
    if (Math.abs(b - a) >= SLOPE_SPAN && fb !== fa) slope = (fb - fa) / (b - a);
  };
  measure();
  for (let i = 0; i < 8 && Math.abs(fb) > tol; i++) {
    if (fb === fa) break;
    const next = Math.min(hi + w, Math.max(lo - w, b - (fb * (b - a)) / (fb - fa)));
    // Held at an end, the mass can move no further.
    if (next === b) break;
    a = b;
    fa = fb;
    b = next;
    fb = above(b);
    measure();
  }
  // Where the legs' balancing fold holds the knee, the height goes flat and the secant can overshoot: keep the nearer.
  const knee = Math.abs(fa) < Math.abs(fb) ? a : b;
  // The legs' balancing fold changes the skis' pitch, so the ride settles once more.
  return { pose: settle(held(knee), ridden(held(knee), ride).ride), warm: slope === 0 ? null : { hip: knee, ride, slope } };
};

/** The outside knee from open to its absorbing ceiling, radians, a hair inside, which the knee keeps. */
const absorbRange = (def: PoseDefinition, scenario: DrillScenario | null): readonly [number, number] => {
  const effort = effortOf(def, scenario);
  const absorb = def.constraints.absorb;
  const [gentle, moderate, dynamic] = absorb?.deep ?? [0, 0, 0];
  const deep = effort.scale < 0 ? moderate + (moderate - gentle) * effort.scale : moderate + (dynamic - moderate) * effort.scale;
  return [(absorb?.open ?? 0) + 0.5 * DEG, deep - 0.5 * DEG];
};

/** The mass's height aim on moguls, from turn time. */
interface Level {
  readonly at: (t: number) => number;
}

const levels = new WeakMap<PoseDefinition, Map<string, Level>>();

/** Share of the knee's reach the absorbing legs use at the extremes, so they ease onto their stops only briefly; inferred. */
const KNEE_SPAN = 0.97;
/** Least knee gap, radians, the absorbing secant takes a warm slope from. */
const SLOPE_SPAN = 1e-3;
/** Samples per turn of the legs' reach on the zipper. */
const REACH_SAMPLES = 48;
/** Fixed relaxation sweeps for the mass's taut string, enough to settle REACH_SAMPLES. */
const TAUT_STEPS = 6000;
/** Half-width of the aim's window on the snow, turn time: short enough to keep the face's rise; inferred. */
const AIM_HALF = 0.08;

/** The boots' snow along the skis' track at turn time t, raised-cosine averaged over AIM_HALF either side. */
const snowAt = (surface: Surface, t: number, ski: Ski): number => {
  const { tip, tail } = skiEnds(ski);
  let sum = 0;
  let weights = 0;
  for (let i = 0; i < LAG_SAMPLES; i++) {
    const u = (2 * (i + 0.5)) / LAG_SAMPLES - 1;
    const w = 1 + Math.cos(Math.PI * u);
    sum += w * trackRest(surface, wrapTime(t + u * AIM_HALF), tip, -tail).base;
    weights += w;
  }
  return sum / weights;
};

/**
 * Off the zipper, from the mass stretched longest in the trough to folded deepest on the crest with the snow's rise. On the
 * zipper, the mass runs the straightest line inside the knee's reach, each end inside it by its spare share, so it
 * rises and falls only by what the legs cannot take (fis-freestyle-judging-2025 p28; Gellie 05:20).
 */
const levelOf = (def: PoseDefinition, scenario: DrillScenario | null, surface: Surface, skier: ReferenceSkier): Level => {
  const key = JSON.stringify([scenario, surface, skier]);
  const cached = levels.get(def)?.get(key);
  if (cached !== undefined) return cached;
  const cache = (level: Level): Level => {
    const map = levels.get(def) ?? new Map<string, Level>();
    map.set(key, level);
    levels.set(def, map);
    return level;
  };
  const [lo, hi] = absorbRange(def, scenario);
  const ski = skiOn(surface, skier);
  const at = (t: number, hip: number): number => {
    let ride = FLAT_RIDE;
    for (let i = 0; i < 3; i++) ride = rideOf(surface, t, solveOn(def, t, scenario, surface, ride, hip, true, skier), skier);
    return ride.lift + centreOfMass(segmentMatrices(solveOn(def, t, scenario, surface, ride, hip, true, skier)))[1];
  };
  if (surface.line !== MogulLine.Zipper) {
    // The boots' own highest snow: on the round line's wall it comes after the path centre's crest.
    const ts = Array.from({ length: REACH_SAMPLES }, (_, k) => k / REACH_SAMPLES);
    const snow = ts.map((t) => snowAt(surface, t, ski));
    const high = Math.max(...snow);
    const low = snowAt(surface, surface.trough, ski);
    // Folded deepest on the crest and long in the trough, the mass sinking on top by what the relief does not take.
    const crest = at(ts[snow.indexOf(high)] ?? surface.crest, hi);
    const trough = at(surface.trough, lo);
    return cache({ at: (t) => trough + (crest - trough) * Math.min(1, Math.max(0, (snowAt(surface, t, ski) - low) / (high - low))) });
  }
  const bounds = Array.from({ length: REACH_SAMPLES }, (_, k) => {
    const t = k / REACH_SAMPLES;
    const stretched = at(t, lo);
    const folded = at(t, hi);
    const spare = ((1 - KNEE_SPAN) / 2) * Math.abs(stretched - folded);
    return { low: Math.min(stretched, folded) + spare, high: Math.max(stretched, folded) - spare };
  });
  // The taut string through the legs' reach: the straightest mass the knees allow, folding as the snow rises.
  let reach = bounds.map((r) => (r.low + r.high) / 2);
  for (let i = 0; i < TAUT_STEPS; i++) {
    reach = reach.map((_, k) => {
      const r = bounds[k] ?? { low: 0, high: 0 };
      const mean = ((reach[(k + REACH_SAMPLES - 1) % REACH_SAMPLES] ?? 0) + (reach[(k + 1) % REACH_SAMPLES] ?? 0)) / 2;
      return Math.min(r.high, Math.max(r.low, mean));
    });
  }
  return cache({
    at: (t) => {
      const x = wrapTime(t) * REACH_SAMPLES;
      const k = Math.floor(x);
      return (reach[k % REACH_SAMPLES] ?? 0) * (1 - (x - k)) + (reach[(k + 1) % REACH_SAMPLES] ?? 0) * (x - k);
    },
  });
};

/** The pose on snow that pitches the skis and lifts the inside tip by `ride`; `absorbKnee` replaces the keyed outside knee. */
const solveOn = (
  def: PoseDefinition,
  t: number,
  scenario: DrillScenario | null,
  surface: Surface | null,
  ride: Ride,
  absorbKnee: number | null,
  bumps: boolean,
  skier: ReferenceSkier,
): Pose => {
  const c = def.constraints;
  const ends = skiEndPoints(skiOn(surface, skier));
  const k = keyValuesAt(def.keys, t);
  const effort = effortOf(def, scenario);
  const mild = (f: KeyField): number => k[f] * (1 + (c.gains[f] ?? 0) * effort.scale);
  const turning = scenario !== null && isTurn(scenario);
  const lean = turning ? turnForcesAt(scenario, t).tilt : 0;
  const braking = brakingTiltAt(scenario, surface, t);
  const brake = Math.tan(forceTiltAt(scenario, surface, t, skier));
  const onAxis = turning && c.balanced !== false ? balanceShare(lean, scenario) : 0;
  const angulation = mild('angulation') + k.angulationStep * effort.scale;
  const counter = mild('counter') + k.counterStep * effort.scale;
  const [gentle, moderate, dynamic] = c.crossUnder ?? [0, 0, 0];
  const under = Math.min(1, Math.max(0, effort.scale < 0 ? moderate + (moderate - gentle) * effort.scale : moderate + (dynamic - moderate) * effort.scale));
  const dorsiflexion = mild('dorsiflexion') + (c.underAnkle ?? 0) * under * k.hipUnder;
  const keyedShin = shinAngle(dorsiflexion, EQUIPMENT);
  // Hip flexion on the pelvis is set; the knee and the pelvis's pitch follow from balance.
  const hipShare = k.hip + (k.hipUnder - k.hip) * under;
  const keyedHip = (effort.hipMin + hipShare * (effort.hipMax - effort.hipMin)) * DEG;
  // Shin-first, the knee is the hip less the trunk's lean on the shin.
  // The cuff holds the shin, so the trunk, not the shin, stands up onto a braking force line.
  const trunkOffset = mild('lumbarFlex') - (c.trunkOverShin ?? 0) * (1 + (c.trunkOverShinGain ?? 0) * effort.scale) + braking;
  const hip = absorbKnee === null ? keyedHip : absorbKnee - trunkOffset;
  const lifted = windowShare(c.tailLift, t);
  const fullLift = Math.max(0, mild('insideTailLift')) * lifted;
  const pitch = mild('skiPitch');
  const femurRotation = c.femurRotation * angulation;
  // Past mid-turn the touch is the next turn's, made by this turn's outside arm.
  const poleTouch = touchShare(c.poleTouch, t) * (wrapTime(t) < 0.5 ? 1 : -1);
  const girdle = { protraction: k.protraction, elevation: k.elevation };
  // Shin-first: the inside ankle closes with the outside one and takes a share of the inside leg's extra flexion.
  const shinFirst = c.trunkOverShin !== undefined;
  const firm = c.firmSnow === true;
  // Pitched by the bumps, the mass balances over the feet along the snow, not along the ski.
  const alongSnow = firm || bumps;
  const insideShare = shinFirst ? (c.insideAnkleShare ?? 0) : 0;
  const insideAnkle = (tailLift: number, shin: number): number =>
    (shinFirst ? shin : shinAngle(dorsiflexion + (k.insideDorsiflexion - dorsiflexion) * lifted, EQUIPMENT)) + tailLift;
  // Near the switch the legs share the difference in length, so neither kinks as outside and inside swap.
  const split = 1 - outsideWeight(lean);
  // The trunk tipped outward about the skis' axis beyond its keys, solved below.
  let tip = 0;
  // On bumps the hip folds with a balancing knee, so the trunk keeps its lean on the shin.
  let folded = false;
  // On bumps with `absorb`, radians the trunk stands up off its lean on the shin as the hips drive forward.
  let upright = 0;
  // On the zipper, radians the lumbar spine unflexes once the hip is straight, so the trunk still stands up.
  let unflex = 0;
  const spine = { spineFlex: mild('lumbarFlex'), spineBend: mild('spineBend'), spineTwist: mild('spineTwist') };
  // Legs built as unturned: hipFlex + ankleFlex is the knee's flexion.
  const unturned = (leg: LegPose): LegPose => ({ ...leg, hipFlex: thighPitch(leg.hipFlex + leg.ankleFlex, leg.ankleFlex, leg.femurRotation) });
  const base = (knee: number, extra: number, tailLift: number, ankleFlex: number, outward = tip): Pose => {
    const hipFlex = knee - ankleFlex;
    const outsideTurn = femurRotation + c.kneesIn;
    // A turned femur flexes the knee out of the shin's plane, so the thigh stands up to keep the knee's flexion.
    const pelvisPitch = (folded ? hip + knee - depthKnee : hip) - upright - thighPitch(knee, ankleFlex, outsideTurn);
    // A folding hip turns the thighs' draw forward, so absorbing legs squeeze harder to keep the boots together.
    const adduction = c.stance * (c.absorb === undefined ? 1 : 1 + STANCE_SQUEEZE * Math.max(0, knee - SQUEEZE_FROM));
    const insideExtra = (1 - split) * extra;
    const trunk = spineTipped(pelvisRotation(counter, mild('pelvisList'), pelvisPitch), { ...spine, spineFlex: spine.spineFlex - unflex }, outward);
    return {
      lean,
      hipAngulation: c.hipAngulation * angulation,
      eversion: mild('eversion'),
      pelvisList: mild('pelvisList'),
      pelvisPitch,
      counter,
      ...trunk,
      headYaw: 0,
      armAbduction: c.armAbduction ?? ARM_ABDUCTION,
      armFlexion: c.armFlexion ?? ARM_FLEXION,
      poleTouch,
      reach: 0,
      rise: 0,
      balance: onAxis,
      // The outside leg gives up its share as the inside one takes it, so the legs swap evenly at the switch.
      outside: unturned({ hipFlex: hipFlex - split * extra * (1 - insideShare), ankleFlex: ankleFlex - split * extra * insideShare, femurRotation: outsideTurn, tailLift: -pitch - ride.outside, adduction }),
      // The inside leg shortens, its foot leading as a result (lemaster-2010 pp61-62); the shin stays
      // forward on the tongue as the ski pitches tip-down under it.
      inside: unturned({
        hipFlex: hipFlex + insideExtra * (1 - insideShare),
        ankleFlex: insideAnkle(tailLift, ankleFlex) + insideShare * insideExtra,
        femurRotation: c.insideFemurShare * femurRotation - c.kneesIn,
        tailLift: tailLift - pitch - ride.inside,
        adduction,
      }),
      outsideGirdle: girdle,
      insideGirdle: girdle,
    };
  };
  // Flex the inside hip until its ski tip just touches the snow; the tip rises with flex. The spine moves no leg.
  const tipFlex = (knee: number, tailLift: number, shin: number): number => {
    let lo = -0.3;
    let hi = 1.5;
    for (let i = 0; i < 24; i++) {
      const mid = (lo + hi) / 2;
      if (insideTipHeight(base(knee, mid, tailLift, shin), ends) > ride.insideTip) hi = mid;
      else lo = mid;
    }
    return (lo + hi) / 2;
  };
  // The lifted inside knee stops at insideKneeMax: past it the tail lifts less instead, so the tip stays on the snow.
  const insideLeg = (knee: number, shin: number): { readonly extra: number; readonly tailLift: number } => {
    const capped = (tailLift: number): number => (c.insideKneeMax - (knee - shin) - insideAnkle(tailLift, shin)) / (1 - split);
    const extra = tipFlex(knee, fullLift, shin);
    if (extra <= capped(fullLift)) return { extra, tailLift: fullLift };
    let lo = 0;
    let hi = fullLift;
    for (let i = 0; i < 20; i++) {
      const mid = (lo + hi) / 2;
      if (insideTipHeight(base(knee, capped(mid), mid, shin), ends) > ride.insideTip) lo = mid;
      else hi = mid;
    }
    const tailLift = (lo + hi) / 2;
    return { extra: capped(tailLift), tailLift };
  };
  // Bend the knee until the centre of mass sits comAhead of mid-foot; more knee moves it back, as the hips
  // sink behind the foot and the trunk, at a set hip angle, stands up with the thigh (lemaster-2010 p9, p16).
  const balance = (extra: number, tailLift: number, shin = keyedShin, goal = k.comAhead): number => {
    let lo = (bumps ? KNEE_FLOOR : 30) * DEG;
    let hi = 120 * DEG;
    for (let i = 0; i < 24; i++) {
      const mid = (lo + hi) / 2;
      if (balanceAhead(segmentMatrices(base(mid, extra, tailLift, shin)), t, alongSnow, brake) > goal) lo = mid;
      else hi = mid;
    }
    return (lo + hi) / 2;
  };
  // Shin-first: the trunk keeps its lean on the shin, so the knee is the hip's depth less that lean; closing the
  // ankle draws the feet back under the mass, opening it slides them ahead (lemaster-2010 p81). The cuff stops it open.
  const target = mild('comAhead');
  const depthKnee = absorbKnee ?? hip + trunkOffset;
  const cuff = minShinAngle(EQUIPMENT) - pitch - ride.outside;
  // Absorbing, the trunk stands up no further than a straight hip, nor further behind the shin than TRUNK_BEHIND.
  const zipper = c.absorb !== undefined && surface?.line === MogulLine.Zipper;
  const stand = !zipper ? UPRIGHT_MAX : Math.min(hip, hip + mild('lumbarFlex') - depthKnee + TRUNK_BEHIND);
  const balanceShin = (extra: number, tailLift: number): number => {
    // The cuff stops the shin on the boot, which pitches with the ski.
    let lo = bumps ? cuff - CUFF_EASE : cuff;
    let hi = SHIN_MAX;
    for (let i = 0; i < 24; i++) {
      const mid = (lo + hi) / 2;
      if (balanceAhead(segmentMatrices(base(depthKnee, extra, tailLift, mid)), t, alongSnow, brake) < target) lo = mid;
      else hi = mid;
    }
    return (lo + hi) / 2;
  };
  // Standing up `by`: the hip opens to its floor, then on the zipper the lumbar spine unflexes.
  const standTo = (by: number): void => {
    upright = Math.min(stand, by);
    unflex = zipper ? Math.min(UNFLEX_MAX, Math.max(0, by - upright)) : 0;
  };
  // The hip opens until the mass sits back at the target; standing up moves it back.
  const standUp = (extra: number, tailLift: number, shin: number, from: number): void => {
    let lo = from;
    standTo(from);
    // Off the zipper the trunk stands up no further than the slope normal; the legs fold for the rest.
    const square = zipper ? Infinity : from + pitchOf(segmentMatrices(base(depthKnee, extra, tailLift, shin)), SegmentKind.Trunk, BodySide.Center) - (c.trunkMin ?? 0);
    let hi = Math.max(from, zipper ? stand + UNFLEX_MAX : Math.min(UPRIGHT_MAX, stand, square));
    for (let i = 0; i < 24; i++) {
      standTo((lo + hi) / 2);
      if (balanceAhead(segmentMatrices(base(depthKnee, extra, tailLift, shin)), t, alongSnow, brake) > target) lo = (lo + hi) / 2;
      else hi = (lo + hi) / 2;
    }
    standTo((lo + hi) / 2);
  };
  // Hip angulation answers a fold turned toward the inside: as the lean builds, the spine tips the trunk outward until
  // the fold moves the mass no further inside the snow's force than a square fold would (lemaster-2010 pp70-71, 126).
  // At the switch the anticipated fold still leads the mass into the new turn.
  const settled = smooth(Math.min(1, Math.abs(lean) / FOLD_HANDOVER));
  const squareFold = (knee: number, extra: number, tailLift: number, shin: number): number => {
    const pose = base(knee, extra, tailLift, shin, 0);
    const inward = inwardOfForce(pose);
    const excess = inward - inwardOfForce({ ...pose, counter: 0, spineTwist: 0 });
    if (excess <= 0 || settled === 0) return 0;
    const goal = inward - settled * excess;
    let lo = 0;
    let hi = 1.2;
    for (let i = 0; i < 24; i++) {
      const mid = (lo + hi) / 2;
      if (inwardOfForce(base(knee, extra, tailLift, shin, mid)) > goal) lo = mid;
      else hi = mid;
    }
    return (lo + hi) / 2;
  };
  // The lifted leg and the balance depend on each other a little; two rounds settle them.
  let knee = shinFirst ? depthKnee : 65 * DEG;
  let shin = keyedShin;
  let inside = insideLeg(knee, shin);
  for (let round = 0; round < 2; round++) {
    if (turning) tip = squareFold(knee, inside.extra, inside.tailLift, shin);
    if (shinFirst) {
      upright = Math.min(0, stand);
      // Zipper: the trunk keeps its line on the shin at full absorption and stands up behind it as the hips and shins drive
      // down the backside, the shins still forward (gellie-2019-moguls-forward 06:00-06:20, 10:13).
      unflex = 0;
      const matched = zipper ? upright + standBehind(t) - trunkBehindShin(segmentMatrices(base(knee, inside.extra, inside.tailLift, shin))) : upright;
      standTo(matched);
      shin = balanceShin(inside.extra, inside.tailLift);
      knee = depthKnee;
      // Down a bump's face the cuff holds the shin forward, easing on; the mass comes back by the legs folding or, absorbing,
      // by the trunk standing up as the hips drive forward, so the legs keep the mass level (gellie-2019-moguls-forward 06:00).
      if (bumps && shin < cuff + CUFF_EASE) {
        shin = softClamp(shin, cuff, SHIN_MAX + CUFF_EASE, CUFF_EASE);
        if (balanceAhead(segmentMatrices(base(knee, inside.extra, inside.tailLift, shin)), t, alongSnow, brake) > target) {
          if (c.absorb !== undefined) standUp(inside.extra, inside.tailLift, shin, matched);
          // The legs fold for what standing up cannot bring back.
          if (balanceAhead(segmentMatrices(base(knee, inside.extra, inside.tailLift, shin)), t, alongSnow, brake) > target) {
            folded = true;
            // Never past the kind's ceiling (OUTSIDE_KNEE_MAX); the mass keeps what is left.
            knee = Math.min(balance(inside.extra, inside.tailLift, shin, target), c.absorb === undefined ? Infinity : absorbRange(def, scenario)[1] + 0.5 * DEG);
          }
        }
      }
    } else knee = balance(inside.extra, inside.tailLift);
    inside = insideLeg(knee, shin);
  }
  const solved = base(knee, inside.extra, inside.tailLift, shin);
  // The head moves no mass to speak of, so it turns only once the trunk is set.
  const turned = { ...solved, headYaw: headYawOf(c.head, scenario, t, solved.counter + solved.spineTwist, c.set, surface?.path) };
  const rested = (p: Pose): Pose => (firm ? { ...p, rise: riseOf(p, mild('skiClearance'), ends) } : pitch === 0 ? p : { ...p, rise: baseRiseOf(p, ends) });
  const legs = rested(turned);
  if (legs.poleTouch === 0) return legs;
  const reach = Math.abs(legs.poleTouch) * solveReach(legs, c.scapularRhythm, poleSize(CAPSULE_ARM, c.poleTrim).basket);
  const reaching = { ...girdle, protraction: girdle.protraction + c.scapularRhythm * reach };
  // Again, as the arm moves the mass and so the balance roll.
  return rested({ ...legs, reach, ...(legs.poleTouch > 0 ? { insideGirdle: reaching } : { outsideGirdle: reaching }) });
};

/** Shoulder flexion, with the shoulder blade's share, that lands the touch PLANT_AHEAD in front of the ankle; mirrored in build_anatomy.py. */
const solveReach = (pose: Pose, rhythm: number, basket: number): number => {
  let lo = -0.5;
  let hi = 0.8;
  for (let i = 0; i < 20; i++) {
    const mid = (lo + hi) / 2;
    const key = touchSide(pose) === BodySide.Left ? 'insideGirdle' : 'outsideGirdle';
    const girdle = { ...pose[key], protraction: pose[key].protraction + rhythm * mid };
    if (touchAhead({ ...pose, reach: mid, [key]: girdle }, basket) < PLANT_AHEAD) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
};

/** Solved poses per turn; a multiple of the bake's 24 frames, so those frames are exact. */
export const POSE_SAMPLES = 96;

/** One turn of poses, `samples` evenly spaced from t = 0. */
export const solveTable = (
  def: PoseDefinition,
  scenario: DrillScenario | null,
  surface: Surface | null = null,
  samples = POSE_SAMPLES,
  skier: ReferenceSkier = REFERENCE_SKIER,
): ReadonlyArray<Pose> => {
  let warm: Warm | null = null;
  return Array.from({ length: samples }, (_, i) => {
    const solved = solveRidden(def, i / samples, scenario, surface, warm, skier);
    warm = solved.warm;
    return solved.pose;
  });
};
