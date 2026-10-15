import { BodySide, SEGMENTS, SegmentKind } from './figure';
import type { Segment } from './figure';
import { compose, identity, rotationX, rotationY, rotationZ, transformPoint, translation } from './mat4';
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
      // Hands forward at hip-to-chest height, wider than the hips; the inside arm reaches to plant its pole.
      return compose(rotationZ(out * 0.35), rotationX(-0.9 - REACH_SHOULDER * reach(segment, pose)));
    case SegmentKind.Forearm:
      return rotationX(-1.1 + REACH_ELBOW * reach(segment, pose));
    case SegmentKind.Thigh:
      // Both feet move toward the outside of the turn, so the legs incline more than the pelvis.
      return compose(rotationZ(-pose.hipAngulation), rotationX(-leg.hipFlex));
    case SegmentKind.Shin:
      return compose(rotationZ(-pose.kneeAngulation), rotationX(leg.hipFlex + leg.ankleFlex));
    case SegmentKind.Boot:
      // Undo the shin's net pitch so the boot sole stays level, then pitch the tail up.
      return rotationX(-leg.ankleFlex + leg.tailLift);
    default:
      return identity();
  }
};

const reach = (segment: Segment, pose: Pose): number => (segment.side === BodySide.Left ? pose.poleTouch : 0);

/** Inside-arm shoulder flexion and elbow extension at the pole touch; mirrored in build_anatomy.py. */
export const REACH_SHOULDER = 0.15;
export const REACH_ELBOW = 0.4;

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
    world.push(compose(parent, translation(segment.joint), localRotation(segment, pose)));
  }
  const outsideSki = world[skiIndex(BodySide.Right)] ?? identity();
  const [cx, cy, cz] = transformPoint(outsideSki, [0, SKI_BASE, 0]);
  // Negative z rotation tips the figure toward +x, the inside (left) side.
  const lean = compose(translation([cx, 0, cz]), rotationZ(-pose.lean), translation([-cx, -cy, -cz]));
  return world.map((m) => compose(lean, m));
};

const skiIndex = (side: BodySide): number => SEGMENTS.findIndex((s) => s.kind === SegmentKind.Ski && s.side === side);

const insideTipHeight = (pose: Pose): number => transformPoint(segmentMatrices(pose)[skiIndex(BodySide.Left)] ?? identity(), SKI_TIP)[1];

export const poseAt = (t: number): Pose => {
  const k = keyValuesAt(t);
  const outside: LegPose = { hipFlex: k.hipFlex, ankleFlex: k.ankleFlex, tailLift: 0 };
  const withFlex = (extra: number): Pose => ({
    lean: k.lean,
    hipAngulation: k.hipAngulation,
    kneeAngulation: k.kneeAngulation,
    trunkFlex: k.trunkFlex,
    trunkTurn: k.trunkTurn,
    poleTouch: poleTouchAt(t),
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
  return withFlex((lo + hi) / 2);
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

/** Heading of the shaft from +z (forward) toward the pole's own side. */
const CARRY_HEADING = Math.PI - 0.35;
const PLANT_HEADING = -0.2;

/**
 * Unit shaft direction, fist to tip, in world space. The pitch is solved so the
 * basket hangs at the carry height, or touches the snow at a full touch; the
 * heading swings from back-and-out to forward through the side.
 */
export const poleDirection = (grip: Vec3, side: typeof BodySide.Left | typeof BodySide.Right, touch: number): Vec3 => {
  const out = side === BodySide.Left ? 1 : -1;
  const heading = CARRY_HEADING + (PLANT_HEADING - CARRY_HEADING) * touch;
  const drop = Math.min(POLE.basket, Math.max(0, grip[1] - POLE.carry * (1 - touch) ** 2));
  const flat = Math.sqrt(POLE.basket ** 2 - drop ** 2);
  return [(out * Math.sin(heading) * flat) / POLE.basket, -drop / POLE.basket, (Math.cos(heading) * flat) / POLE.basket];
};

/** The capsule figure's fist, in its forearm frame. */
export const CAPSULE_GRIP: Vec3 = [0, -0.3, 0.01];
