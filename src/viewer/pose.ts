import { BodySide, SEGMENTS, SegmentKind } from './figure';
import type { Segment } from './figure';
import { compose, identity, inverseRotation, rotationX, rotationY, rotationZ, transformPoint, translation } from './mat4';
import type { Mat4, Vec3 } from './mat4';

/** Joint angles in radians; flexion is positive. */
export interface Pose {
  /** Whole-body inclination toward the inside of the turn, about the outside ski. */
  readonly lean: number;
  /** Legs tilted further in than the pelvis. */
  readonly hipAngulation: number;
  readonly kneeAngulation: number;
  /** Torso pitch forward from the pelvis. */
  readonly trunkFlex: number;
  /** Torso yaw toward the outside ski, so it faces down the fall line. */
  readonly trunkTurn: number;
  /** 0..1: the inside pole swings forward and plants at 1. */
  readonly poleTouch: number;
  /** Extra inside-shoulder flexion that brings the touch beside the ski; solved per figure. */
  readonly insideReach: number;
  readonly outside: LegPose;
  readonly inside: LegPose;
}

export interface LegPose {
  /** Thigh forward of vertical in the pelvis frame. */
  readonly hipFlex: number;
  /** Shin forward of vertical; the knee flexes by hip + ankle. */
  readonly ankleFlex: number;
  /** Ski pitch with the tail up. */
  readonly tailLift: number;
}

/** 0 at the transition (t = 0), 1 mid-turn (t = 0.5). */
export const turnDepth = (t: number): number => 0.5 - 0.5 * Math.cos(2 * Math.PI * (((t % 1) + 1) % 1));

/** A key pose; the inside leg's flex is solved so its ski tip stays on the snow. */
interface Key {
  readonly t: number;
  readonly lean: number;
  readonly hipAngulation: number;
  readonly kneeAngulation: number;
  readonly trunkFlex: number;
  readonly trunkTurn: number;
  readonly hipFlex: number;
  readonly ankleFlex: number;
  readonly insideTailLift: number;
}

type KeyValues = Omit<Key, 't'>;

// Centred stance: hips over mid-foot, shins about as far forward as the torso.
const KEYS: ReadonlyArray<Key> = [
  // Transition: slightly taller, skis flat.
  { t: 0, lean: 0, hipAngulation: 0, kneeAngulation: 0, trunkFlex: 0.55, trunkTurn: 0, hipFlex: 0.34, ankleFlex: 0.42, insideTailLift: 0 },
  // Initiation: weight already on the outside ski, inside tail starts to rise.
  { t: 1 / 6, lean: 0.12, hipAngulation: 0.08, kneeAngulation: 0.03, trunkFlex: 0.6, trunkTurn: -0.06, hipFlex: 0.42, ankleFlex: 0.5, insideTailLift: 0.12 },
  { t: 1 / 2, lean: 0.22, hipAngulation: 0.16, kneeAngulation: 0.06, trunkFlex: 0.62, trunkTurn: -0.15, hipFlex: 0.45, ankleFlex: 0.53, insideTailLift: 0.22 },
  // Finish: easing out of the turn; the inside ski comes back down by the transition.
  { t: 5 / 6, lean: 0.12, hipAngulation: 0.1, kneeAngulation: 0.04, trunkFlex: 0.6, trunkTurn: -0.1, hipFlex: 0.42, ankleFlex: 0.5, insideTailLift: 0.08 },
];

const FIELDS = ['lean', 'hipAngulation', 'kneeAngulation', 'trunkFlex', 'trunkTurn', 'hipFlex', 'ankleFlex', 'insideTailLift'] as const;

/** Periodic cubic Hermite through the keys, with finite-difference tangents. */
const keyValuesAt = (t: number): KeyValues => {
  const u = ((t % 1) + 1) % 1;
  const n = KEYS.length;
  const at = (i: number): Key & { readonly time: number } => {
    const k = KEYS[((i % n) + n) % n] ?? KEYS[0];
    if (k === undefined) throw new Error('no key poses');
    return { ...k, time: k.t + Math.floor(i / n) };
  };
  let i = n - 1;
  while (i > 0 && (at(i).time > u)) i--;
  const p0 = at(i - 1);
  const p1 = at(i);
  const p2 = at(i + 1);
  const p3 = at(i + 2);
  const h = p2.time - p1.time;
  const s = (u - p1.time) / h;
  const h00 = 2 * s ** 3 - 3 * s ** 2 + 1;
  const h10 = s ** 3 - 2 * s ** 2 + s;
  const h01 = -2 * s ** 3 + 3 * s ** 2;
  const h11 = s ** 3 - s ** 2;
  const out: Record<(typeof FIELDS)[number], number> = { lean: 0, hipAngulation: 0, kneeAngulation: 0, trunkFlex: 0, trunkTurn: 0, hipFlex: 0, ankleFlex: 0, insideTailLift: 0 };
  for (const f of FIELDS) {
    const m1 = (p2[f] - p0[f]) / (p2.time - p0.time);
    const m2 = (p3[f] - p1[f]) / (p3.time - p1.time);
    out[f] = h00 * p1[f] + h10 * h * m1 + h01 * p2[f] + h11 * h * m2;
  }
  return out;
};

// Outside = the figure's right leg until turns alternate sides.
const legPose = (pose: Pose, side: BodySide): LegPose => (side === BodySide.Right ? pose.outside : pose.inside);

const localRotation = (segment: Segment, pose: Pose): Mat4 => {
  const leg = legPose(pose, segment.side);
  const out = segment.side === BodySide.Right ? -1 : 1;
  switch (segment.kind) {
    case SegmentKind.Trunk:
      // Counter the lean so the shoulders stay level.
      return compose(rotationZ(pose.lean), rotationY(pose.trunkTurn), rotationX(pose.trunkFlex));
    case SegmentKind.Head:
      // Eyes ahead, not at the snow.
      return rotationX(-HEAD_LIFT * pose.trunkFlex);
    case SegmentKind.UpperArm:
      // Hands forward at hip-to-chest height, wider than the hips.
      return compose(rotationZ(out * 0.35), rotationX(-0.9 - (segment.side === BodySide.Left ? pose.insideReach : 0)));
    case SegmentKind.Forearm:
      return rotationX(-1.1);
    case SegmentKind.Thigh:
      // Both feet move toward the outside of the turn, so the legs incline more than the pelvis.
      return compose(rotationZ(-pose.hipAngulation), rotationX(-leg.hipFlex));
    case SegmentKind.Shin:
      return compose(rotationZ(-pose.kneeAngulation), rotationX(leg.hipFlex + leg.ankleFlex));
    case SegmentKind.Boot:
      // Set in the body frame by bootRotation instead.
      return identity();
    default:
      return identity();
  }
};

/**
 * Boot orientation before the lean: after it, both skis point straight ahead on
 * the same edge angle and only the inside tail pitches up. Mirrored in build_anatomy.py.
 */
const bootRotation = (segment: Segment, pose: Pose): Mat4 =>
  compose(rotationZ(pose.lean), rotationX(legPose(pose, segment.side).tailLift), rotationZ(-pose.lean - pose.hipAngulation - pose.kneeAngulation));

/** Share of the torso's pitch the neck takes back out. */
export const HEAD_LIFT = 0.6;

/** Height of the ski base below its segment origin. */
const SKI_BASE = -0.01;
export const SKI_TIP: Vec3 = [0, SKI_BASE, 0.85];

/**
 * World matrix per segment: the outside ski base rests on y = 0 and the whole
 * figure leans toward the inside of the turn about that contact.
 */
export const segmentMatrices = (pose: Pose): ReadonlyArray<Mat4> => {
  const world: Array<Mat4> = [];
  for (const segment of SEGMENTS) {
    const parent = segment.parent === null ? identity() : (world[segment.parent] ?? identity());
    const local = segment.kind === SegmentKind.Boot ? compose(inverseRotation(parent), bootRotation(segment, pose)) : localRotation(segment, pose);
    world.push(compose(parent, translation(segment.joint), local));
  }
  const outsideSki = world[skiIndex(BodySide.Right)] ?? identity();
  const [cx, cy, cz] = transformPoint(outsideSki, [0, SKI_BASE, 0]);
  // Negative z rotation tips the figure toward +x, the inside (left) side.
  const lean = compose(translation([cx, 0, cz]), rotationZ(-pose.lean), translation([-cx, -cy, -cz]));
  return world.map((m) => compose(lean, m));
};

const skiIndex = (side: BodySide): number => SEGMENTS.findIndex((s) => s.kind === SegmentKind.Ski && s.side === side);

const insideTipHeight = (pose: Pose): number => transformPoint(segmentMatrices(pose)[skiIndex(BodySide.Left)] ?? identity(), SKI_TIP)[1];

/** The exact pose, solved by bisection; costs about 45 skeleton passes, so frames read `poseAt`. */
export const solvePose = (t: number): Pose => {
  const k = keyValuesAt(t);
  const outside: LegPose = { hipFlex: k.hipFlex, ankleFlex: k.ankleFlex, tailLift: 0 };
  const withFlex = (extra: number): Pose => ({
    lean: k.lean,
    hipAngulation: k.hipAngulation,
    kneeAngulation: k.kneeAngulation,
    trunkFlex: k.trunkFlex,
    trunkTurn: k.trunkTurn,
    poleTouch: poleTouchAt(t),
    insideReach: 0,
    outside,
    inside: { hipFlex: k.hipFlex + extra, ankleFlex: k.ankleFlex + 0.6 * extra, tailLift: Math.max(0, k.insideTailLift) },
  });
  // Bend the inside leg until its ski tip just touches the snow; the tip rises with flex.
  let lo = -0.3;
  let hi = 1.2;
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2;
    if (insideTipHeight(withFlex(mid)) > 0) hi = mid;
    else lo = mid;
  }
  const legs = withFlex((lo + hi) / 2);
  return legs.poleTouch > 0 ? { ...legs, insideReach: legs.poleTouch * solveReach(legs) } : legs;
};

/** Solved poses per turn; a multiple of the bake's 24 frames, so those frames are exact. */
export const POSE_SAMPLES = 96;
let table: ReadonlyArray<Pose> | null = null;

const mixLeg = (a: LegPose, b: LegPose, f: number): LegPose => ({
  hipFlex: a.hipFlex + (b.hipFlex - a.hipFlex) * f,
  ankleFlex: a.ankleFlex + (b.ankleFlex - a.ankleFlex) * f,
  tailLift: a.tailLift + (b.tailLift - a.tailLift) * f,
});

/** The pose at turn time `t`, interpolated from a table solved once. */
export const poseAt = (t: number): Pose => {
  table ??= Array.from({ length: POSE_SAMPLES }, (_, i) => solvePose(i / POSE_SAMPLES));
  const u = (((t % 1) + 1) % 1) * POSE_SAMPLES;
  // Sample times such as 1/24 land a rounding error off their sample.
  const near = Math.round(u);
  const i = Math.abs(u - near) < 1e-9 ? near : Math.floor(u);
  const f = Math.max(0, u - i);
  const a = table[i % POSE_SAMPLES];
  const b = table[(i + 1) % POSE_SAMPLES];
  if (a === undefined || b === undefined) throw new Error('empty pose table');
  if (f < 1e-9) return a;
  const mix = (x: number, y: number): number => x + (y - x) * f;
  return {
    lean: mix(a.lean, b.lean),
    hipAngulation: mix(a.hipAngulation, b.hipAngulation),
    kneeAngulation: mix(a.kneeAngulation, b.kneeAngulation),
    trunkFlex: mix(a.trunkFlex, b.trunkFlex),
    trunkTurn: mix(a.trunkTurn, b.trunkTurn),
    poleTouch: poleTouchAt(t),
    insideReach: mix(a.insideReach, b.insideReach),
    outside: mixLeg(a.outside, b.outside, f),
    inside: mixLeg(a.inside, b.inside, f),
  };
};

/** How far ahead of the inside ankle a full touch lands. */
const touchAhead = (pose: Pose): number => {
  const world = segmentMatrices(pose);
  const at = (kind: SegmentKind, p: Vec3): Vec3 => transformPoint(world[SEGMENTS.findIndex((s) => s.kind === kind && s.side === BodySide.Left)] ?? identity(), p);
  const grip = at(SegmentKind.Forearm, CAPSULE_GRIP);
  const ankle = at(SegmentKind.Boot, [0, 0, 0]);
  return grip[2] + poleDirection(grip, BodySide.Left, 1, ankle)[2] * POLE.basket - ankle[2];
};

/** Shoulder flexion that lands the touch PLANT_AHEAD in front of the ankle; mirrored in build_anatomy.py. */
const solveReach = (pose: Pose): number => {
  let lo = -0.5;
  let hi = 0.8;
  for (let i = 0; i < 20; i++) {
    const mid = (lo + hi) / 2;
    if (touchAhead({ ...pose, insideReach: mid }) < PLANT_AHEAD) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
};

/** Turn time of the inside pole touch: initiation. */
export const POLE_TOUCH_T = 1 / 6;
const TOUCH_HOLD = 0.02;
const TOUCH_SWING = 0.11;

/** 1 while the inside basket is planted, easing to 0 over the swing either side. */
export const poleTouchAt = (t: number): number => {
  const u = (((t - POLE_TOUCH_T) % 1) + 1) % 1;
  const d = Math.min(u, 1 - u) - TOUCH_HOLD;
  if (d <= 0) return 1;
  if (d >= TOUCH_SWING) return 0;
  return 0.5 + 0.5 * Math.cos((Math.PI * d) / TOUCH_SWING);
};

/** Pole measured from the centre of the fist. */
export const POLE = {
  /** Fist to the spike's point. */
  reach: 1.17,
  /** Fist to the basket. */
  basket: 1.09,
  /** Basket height while carried. */
  carry: 0.32,
} as const;

/** Heading of the carried shaft from +z (forward) toward the pole's own side. */
const CARRY_HEADING = Math.PI - 0.3;
/** The touch lands this far outside the inside ski, and this far ahead of the ankle: by the forebody. */
const PLANT_SIDE = 0.22;
export const PLANT_AHEAD = 0.3;

/**
 * Unit shaft direction, fist to tip, in world space. The pitch is solved so the
 * basket hangs at the carry height, or reaches the snow at a full touch beside
 * the ski at `ankle`, behind the fist; the heading eases between the two, so the
 * swing stays back and close to the hand.
 */
export const poleDirection = (grip: Vec3, side: typeof BodySide.Left | typeof BodySide.Right, touch: number, ankle: Vec3): Vec3 => {
  const out = side === BodySide.Left ? 1 : -1;
  const b = POLE.basket;
  const dx = ankle[0] + out * PLANT_SIDE - grip[0];
  const dz = -Math.sqrt(Math.max(0, b ** 2 - grip[1] ** 2 - dx ** 2));
  // Turn the short way from the carry heading.
  const turn = Math.atan2(out * dx, dz) - CARRY_HEADING;
  const heading = CARRY_HEADING + Math.atan2(Math.sin(turn), Math.cos(turn)) * touch;
  const drop = Math.min(b, Math.max(0, grip[1] - POLE.carry * (1 - touch) ** 2));
  const flat = Math.sqrt(b ** 2 - drop ** 2);
  return [(out * Math.sin(heading) * flat) / b, -drop / b, (Math.cos(heading) * flat) / b];
};

/** The capsule figure's fist, in its forearm frame. */
export const CAPSULE_GRIP: Vec3 = [0, -0.3, 0.01];
