import { phaseForces, turnForcesAt } from '../physics/turn';
import type { TurnScenario } from '../physics/turn';
import { EQUIPMENT, shinAngle, totalRamp } from './equipment';
import { BodySide, CAPSULE_BINDING, SEGMENTS, SegmentKind } from './figure';
import type { Segment } from './figure';
import { compose, identity, inverseRotation, rotationX, rotationY, rotationZ, transformPoint, translation } from './mat4';
import type { Mat4, Vec3 } from './mat4';

/**
 * Joint angles in radians; flexion is positive. "Body frame" is the figure before
 * the lean, whose y axis is the balance axis.
 */
export interface Pose {
  /** Whole-body inclination toward the inside of the turn, about the outside ski. */
  readonly lean: number;
  /** Thighs inclined further in than the balance axis. */
  readonly hipAngulation: number;
  /** Outside foot everted in the boot; the inside foot inverts to keep its ski parallel. */
  readonly eversion: number;
  /** Pelvis tipped up on the inside against the balance axis, over the outside femoral head. */
  readonly pelvisList: number;
  /** Pelvis folded forward at the hips. */
  readonly pelvisPitch: number;
  /** Pelvis facing toward the outside of the turn, turned in the hip sockets. */
  readonly counter: number;
  /** Trunk flexed on the pelvis: the low back slightly flattened from standing. */
  readonly spineFlex: number;
  /** Trunk bent toward the outside ski on the pelvis. */
  readonly spineBend: number;
  /** Trunk turned toward the outside of the turn beyond the pelvis. */
  readonly spineTwist: number;
  /** 0..1: the inside pole swings forward and plants at 1. */
  readonly poleTouch: number;
  /** Extra inside-shoulder flexion that brings the touch beside the ski; solved per figure. */
  readonly insideReach: number;
  readonly outside: LegPose;
  readonly inside: LegPose;
}

export interface LegPose {
  /** Thigh forward of the balance axis in the body frame; hip flexion adds the pelvis's pitch. */
  readonly hipFlex: number;
  /** Shin forward of vertical, from the ski-base normal on a flat ski. */
  readonly ankleFlex: number;
  /** Femur turned about its own axis so the knee moves toward the turn: outside internal, inside external rotation. */
  readonly femurRotation: number;
  /** Ski pitch with the tail up. */
  readonly tailLift: number;
  /** Thigh drawn toward the other leg in the body frame. */
  readonly adduction: number;
}

/** 0 at the transition (t = 0), 1 mid-turn (t = 0.5). */
export const turnDepth = (t: number): number => 0.5 - 0.5 * Math.cos(2 * Math.PI * (((t % 1) + 1) % 1));

/**
 * A key pose for moderate intensity; the physics sets the tilt and the depth of each
 * scaled field. The shin follows the ankle's dorsiflexion plus the boot's ramp, the outside
 * hip holds its flexion on the pelvis, the knee bends until the centre of mass sits `comAhead`
 * of mid-foot, and the inside hip flexes until its ski tip just touches the snow.
 */
interface Key {
  readonly t: number;
  /** Share of the peak angulation: hip angulation, femur rotation and eversion. */
  readonly angulation: number;
  /** Outside hip flexion between its most open, mid-turn (0), and its depth in the transition (1); the knee follows from balance. */
  readonly hip: number;
  readonly pelvisList: number;
  /** Low back slightly flattened from standing, never arched or slumped (lemaster-2010 pp62-63); racers reach 23-29 deg (heinrich-2022). */
  readonly lumbarFlex: number;
  readonly spineBend: number;
  readonly spineTwist: number;
  readonly counter: number;
  /** Outside shin forward of the foot's normal. */
  readonly dorsiflexion: number;
  readonly insideTailLift: number;
  /** Centre of mass ahead of the outside mid-foot, metres. */
  readonly comAhead: number;
}

type KeyValues = Omit<Key, 't'>;

const DEG = Math.PI / 180;

// heinrich-2022 where measured (GS, scaled down for a slow drill); lemaster-2010, biomechanics.md 2.0 and D1 elsewhere.
// The outside leg is most flexed in the transition, extends a little through initiation, holds through
// shaping and flexes again through the finish (lemaster-2010 pp40-42, pritchard-taylor-2023 p27, iasi-2021 pp65-66).
const KEYS: ReadonlyArray<Key> = [
  // Transition: skis flat, square, legs at their deepest, mass over mid-foot as the feet are drawn back, ankles closing again (lemaster-2010 p79, pp85-86).
  { t: 0, angulation: 0, hip: 1, pelvisList: 0, lumbarFlex: 11 * DEG, spineBend: 0, spineTwist: 0, counter: 0, dorsiflexion: 19.5 * DEG, insideTailLift: 0, comAhead: -0.008 },
  // Initiation: the leg lengthens a little, ankles flexed, mass a little ahead (lemaster-2010 pp81-85, p182); edge lowest, building (F10).
  {
    t: 1 / 6,
    angulation: 0.45,
    hip: 0.4,
    pelvisList: 10 * DEG,
    lumbarFlex: 11 * DEG,
    spineBend: 3 * DEG,
    spineTwist: 2 * DEG,
    counter: 5 * DEG,
    dorsiflexion: 21.5 * DEG,
    insideTailLift: 6 * DEG,
    comAhead: 0.05,
  },
  // Shaping: legs most extended and quasi-isometric; DF held to the fall line, in heinrich-2022's 18-27 deg
  // (lemaster-2010 pp79, 85); angulation mostly from the hip (lemaster-2010 p74); pelvis tipped outward of the
  // balance axis over the outside femoral head (lemaster-2010 p70); counter 5-10 deg (2.0).
  {
    t: 1 / 2,
    angulation: 0.85,
    hip: 0,
    pelvisList: 13 * DEG,
    lumbarFlex: 11.5 * DEG,
    spineBend: 6 * DEG,
    spineTwist: 3 * DEG,
    counter: 8 * DEG,
    dorsiflexion: 21.5 * DEG,
    insideTailLift: 6.8 * DEG,
    comAhead: 0.052,
  },
  // Late shaping: the edge peaks (lemaster-2010 p128), then releases through the finish; the ankle starts to open.
  {
    t: 0.65,
    angulation: 1,
    hip: 0.06,
    pelvisList: 14 * DEG,
    lumbarFlex: 11.5 * DEG,
    spineBend: 6 * DEG,
    spineTwist: 3 * DEG,
    counter: 7 * DEG,
    dorsiflexion: 20.8 * DEG,
    insideTailLift: 6.2 * DEG,
    comAhead: 0.045,
  },
  // Finish: the leg flexes, absorbing the late load; ankles opening, feet slid forward, pressure toward
  // the heel (lemaster-2010 pp182-183, falda-buscaiot-2017); chest and pelvis square up to the skis as they release.
  {
    t: 5 / 6,
    angulation: 0.3,
    hip: 0.5,
    pelvisList: 14 * DEG,
    lumbarFlex: 11 * DEG,
    spineBend: 5 * DEG,
    spineTwist: 1.5 * DEG,
    counter: 3 * DEG,
    dorsiflexion: 18.8 * DEG,
    insideTailLift: 5 * DEG,
    comAhead: 0.02,
  },
];

const FIELDS = ['angulation', 'hip', 'pelvisList', 'lumbarFlex', 'spineBend', 'spineTwist', 'counter', 'dorsiflexion', 'insideTailLift', 'comAhead'] as const;

/** Peak angulation at moderate intensity; edge minus tilt comes to about 10 deg (lind-sanders-2004 low-speed angulation). */
const HIP_ANGULATION = 4.5 * DEG;
const FEMUR_ROTATION = 4.5 * DEG;
const EVERSION = 2.2 * DEG;

/**
 * Outside hip flexion on the pelvis by fall-line load, [load, most open mid-turn, transition depth] in degrees.
 * Inference, near the low end of heinrich-2022's GS 50-81 deg; the knee is whatever balances the centre of mass.
 */
const HIP_BY_LOAD: ReadonlyArray<readonly [number, number, number]> = [
  [1.06, 48, 62],
  [1.12, 55, 70],
  [1.21, 62, 78],
];
/** Deepest lifted inside knee; stork goes past heinrich-2022's weighted 81-114 deg, but a free knee stops about here. */
const INSIDE_KNEE_MAX = 120 * DEG;
/** Share of the outside femur's rotation the inside one takes; more would evert the lifted foot. */
const INSIDE_FEMUR_SHARE = 0.3;

const smoothstep = (a: number, b: number, x: number): number => {
  const u = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return u * u * (3 - 2 * u);
};

/** The lifted inside ankle, in heinrich-2022's 17-21 deg; it stays closed as the outside ankle opens in the finish, ready to become the new outside. */
const insideDorsiflexion = (t: number): number => (17.8 + 1.2 * smoothstep(0.55, 0.8, ((t % 1) + 1) % 1)) * DEG;

/** Turn time the inside tail is half lifted and half set down: mid-initiation and mid-finish (psia-c-stork-turns). */
export const TAIL_UP_T = 1 / 6;
export const TAIL_DOWN_T = 5 / 6;

/**
 * Share of the inside tail lift: up through mid-initiation, once the body has tilted in off
 * the inside ski's lateral support (about 0.3 s, lind-sanders-2004), and down through mid-finish.
 */
export const tailLiftShare = (t: number): number => {
  const u = ((t % 1) + 1) % 1;
  return smoothstep(TAIL_UP_T - 0.06, TAIL_UP_T + 0.06, u) * (1 - smoothstep(TAIL_DOWN_T - 0.06, TAIL_DOWN_T + 0.06, u));
};

/** Periodic monotone cubic Hermite through the keys, so nothing overshoots a key: no counter into the new turn. */
const keyValuesAt = (t: number): KeyValues => {
  const u = ((t % 1) + 1) % 1;
  const n = KEYS.length;
  const at = (i: number): Key & { readonly time: number } => {
    const k = KEYS[((i % n) + n) % n] ?? KEYS[0];
    if (k === undefined) throw new Error('no key poses');
    return { ...k, time: k.t + Math.floor(i / n) };
  };
  let i = n - 1;
  while (i > 0 && at(i).time > u) i--;
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
  // Zero at a turning key, and limited to three times the smaller secant (Fritsch-Carlson).
  const tangent = (a: Key & { readonly time: number }, b: Key & { readonly time: number }, c: Key & { readonly time: number }, f: (typeof FIELDS)[number]): number => {
    const d0 = (b[f] - a[f]) / (b.time - a.time);
    const d1 = (c[f] - b[f]) / (c.time - b.time);
    if (d0 * d1 <= 0) return 0;
    const m = (c[f] - a[f]) / (c.time - a.time);
    return Math.sign(m) * Math.min(Math.abs(m), 3 * Math.abs(d0), 3 * Math.abs(d1));
  };
  const out = Object.fromEntries(FIELDS.map((f) => [f, 0])) as Record<(typeof FIELDS)[number], number>;
  for (const f of FIELDS) out[f] = h00 * p1[f] + h10 * h * tangent(p0, p1, p2, f) + h01 * p2[f] + h11 * h * tangent(p1, p2, p3, f);
  return out;
};

/** How hard the turn is skied, from its physics. */
export interface TurnEffort {
  readonly scenario: TurnScenario;
  /** Outside hip flexion mid-turn, at its most open, degrees. */
  readonly hipMin: number;
  /** Outside hip flexion in the transition, at its deepest, degrees. */
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

export const turnEffort = (scenario: TurnScenario): TurnEffort => {
  const [hipMin, hipMax] = interpolate(HIP_BY_LOAD, phaseForces(scenario).shaping.load);
  return { scenario, hipMin, hipMax, scale: (hipMin - 55) / 7 };
};

/** Arms abducted at the shoulder so the hands ride wide, poles clear of the body (lemaster-2010). */
export const ARM_ABDUCTION = 0.5;
/** Forward flexion of the upper arm; build_anatomy.py reads it from the pose track. */
export const ARM_FLEXION = 0.4;
/** Elbow flexion, about 75 deg (lemaster-2010 p142); build_anatomy.py reads it from the pose track. */
export const FOREARM_FLEXION = 1.3;

// Outside = the figure's right leg until turns alternate sides.
const legPose = (pose: Pose, side: BodySide): LegPose => (side === BodySide.Right ? pose.outside : pose.inside);

/** The pelvis in the body frame: counter, then the outward tip, then the fold at the hips. */
const pelvisRotation = (pose: Pose): Mat4 => compose(rotationY(-pose.counter), rotationZ(pose.pelvisList), rotationX(pose.pelvisPitch));

/** Share of the trunk's roll the head takes back out, so the eyes stay near level, tipped slightly outside (lemaster-2010 p72). */
const HEAD_LEVEL = 0.7;

const localRotation = (segment: Segment, pose: Pose): Mat4 => {
  const leg = legPose(pose, segment.side);
  const out = segment.side === BodySide.Right ? -1 : 1;
  switch (segment.kind) {
    case SegmentKind.Pelvis:
      return pelvisRotation(pose);
    case SegmentKind.Trunk:
      return compose(rotationY(-pose.spineTwist), rotationZ(pose.spineBend), rotationX(pose.spineFlex));
    case SegmentKind.Head:
      // Eyes ahead, not at the snow.
      return compose(
        rotationZ(-HEAD_LEVEL * (pose.pelvisList - pose.lean + pose.spineBend)),
        rotationX(-HEAD_LIFT * (pose.pelvisPitch + pose.spineFlex)),
      );
    case SegmentKind.UpperArm:
      // Hands forward at hip-to-chest height, wider than the hips.
      return compose(rotationZ(out * ARM_ABDUCTION), rotationX(-ARM_FLEXION - (segment.side === BodySide.Left ? pose.insideReach : 0)));
    case SegmentKind.Forearm:
      return rotationX(-FOREARM_FLEXION);
    case SegmentKind.Thigh:
      // Set in the body frame, so the pelvis's counter and tip are rotation and abduction in the hip.
      return compose(inverseRotation(pelvisRotation(pose)), rotationZ(-pose.hipAngulation - out * leg.adduction), rotationX(-leg.hipFlex), rotationY(leg.femurRotation));
    case SegmentKind.Shin:
      // A hinge: the knee only flexes.
      return rotationX(leg.hipFlex + leg.ankleFlex);
    case SegmentKind.Boot:
      // Set in the body frame by bootRotation instead.
      return identity();
    case SegmentKind.Ski:
      // Takes the foot's ramp back out, so the ski lies as bootRotation sets it.
      return rotationX(-RAMP);
    default:
      return identity();
  }
};

const RAMP = totalRamp(EQUIPMENT);

/** Frontal tilt of a shin toward the inside of the turn, in the body frame. */
const shinTilt = (shin: Mat4): number => {
  const [ox, oy] = transformPoint(shin, [0, 0, 0]);
  const [x, y] = transformPoint(shin, [0, 1, 0]);
  return Math.atan2(x - ox, y - oy);
};

/**
 * Foot orientation before the lean: after it, both skis point straight ahead on the
 * outside ski's edge angle, the outside shin's tilt plus its foot's eversion, and only
 * the inside tail pitches up; the foot sits heel-up on its ski by the total ramp.
 * Mirrored in build_anatomy.py.
 */
const bootRotation = (segment: Segment, pose: Pose, edge: number): Mat4 =>
  compose(rotationZ(pose.lean), rotationX(legPose(pose, segment.side).tailLift), rotationZ(-pose.lean - edge), rotationX(RAMP));

/** Share of the torso's pitch the neck takes back out. */
export const HEAD_LIFT = 0.6;

/** Height of the ski base below its segment origin. */
const SKI_BASE = -EQUIPMENT.skiThickness / 2;
/** Mid-foot in the foot's frame: the binding's centre on the ski's top. */
export const MID_FOOT: Vec3 = transformPoint(CAPSULE_BINDING, [0, 0, 0]);
export const SKI_TIP: Vec3 = [0, SKI_BASE, 0.85];

const OUTSIDE_SHIN = SEGMENTS.findIndex((s) => s.kind === SegmentKind.Shin && s.side === BodySide.Right);

/**
 * World matrix per segment: the outside ski base rests on y = 0 and the whole
 * figure leans toward the inside of the turn about that contact.
 */
export const segmentMatrices = (pose: Pose): ReadonlyArray<Mat4> => {
  const world: Array<Mat4> = [];
  for (const segment of SEGMENTS) {
    const parent = segment.parent === null ? identity() : (world[segment.parent] ?? identity());
    const local =
      segment.kind === SegmentKind.Boot
        ? compose(inverseRotation(parent), bootRotation(segment, pose, shinTilt(world[OUTSIDE_SHIN] ?? identity()) + pose.eversion))
        : localRotation(segment, pose);
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

/** Body mass shares per segment kind (de-leva-1996); the forearm carries the hand, the trunk the chest and abdomen. */
const MASS_SHARE: Readonly<Record<SegmentKind, number>> = {
  [SegmentKind.Pelvis]: 0.1117,
  [SegmentKind.Trunk]: 0.3229,
  [SegmentKind.Head]: 0.0694,
  [SegmentKind.UpperArm]: 0.0271,
  [SegmentKind.Forearm]: 0.0223,
  [SegmentKind.Thigh]: 0.1416,
  [SegmentKind.Shin]: 0.0433,
  [SegmentKind.Boot]: 0.0137,
  [SegmentKind.Ski]: 0,
};

const OUTSIDE_BOOT = SEGMENTS.findIndex((s) => s.kind === SegmentKind.Boot && s.side === BodySide.Right);

/** The body's centre of mass, each segment's at its shape's centre; skis and boots left out. */
export const centreOfMass = (world: ReadonlyArray<Mat4>): Vec3 => {
  const sum: [number, number, number] = [0, 0, 0];
  SEGMENTS.forEach((s, i) => {
    const p = transformPoint(world[i] ?? identity(), s.shape.center);
    const m = MASS_SHARE[s.kind];
    for (let k = 0; k < 3; k++) sum[k] = (sum[k] ?? 0) + m * (p[k] ?? 0);
  });
  return sum;
};

/** How far the centre of mass sits ahead of the outside mid-foot (lemaster-2010 p57). */
export const comAhead = (world: ReadonlyArray<Mat4>): number => centreOfMass(world)[2] - transformPoint(world[OUTSIDE_BOOT] ?? identity(), MID_FOOT)[2];

/** The exact pose for a scenario, solved by bisection; costs about 70 skeleton passes, so frames read `poseAt`. */
export const solvePose = (t: number, scenario: TurnScenario): Pose => {
  const k = keyValuesAt(t);
  const effort = turnEffort(scenario);
  const e = effort.scale;
  // Mild scalings, inference: deeper, more dynamic turns flex, lift and counter a little more.
  const mild = (gain: number): number => 1 + gain * e;
  const lean = turnForcesAt(scenario, t).tilt;
  const angulation = k.angulation * mild(0.12);
  const dorsiflexion = k.dorsiflexion * mild(0.06);
  const ankleFlex = shinAngle(dorsiflexion, EQUIPMENT);
  // Hip flexion on the pelvis is set; the knee and the pelvis's pitch follow from balance.
  const hip = (effort.hipMin + k.hip * (effort.hipMax - effort.hipMin)) * DEG;
  const lifted = tailLiftShare(t);
  const fullLift = Math.max(0, k.insideTailLift) * mild(0.04) * lifted;
  const femurRotation = FEMUR_ROTATION * angulation;
  const base = (knee: number, extra: number, tailLift = fullLift): Pose => {
    const hipFlex = knee - ankleFlex;
    return {
      lean,
      hipAngulation: HIP_ANGULATION * angulation,
      eversion: EVERSION * angulation,
      pelvisList: k.pelvisList * mild(0.5),
      pelvisPitch: hip - hipFlex,
      counter: k.counter * mild(0.1),
      // Near constant: a harder turn folds more at the hips, not the low back.
      spineFlex: k.lumbarFlex * mild(0.1),
      spineBend: k.spineBend * mild(0.1),
      spineTwist: k.spineTwist * mild(0.1),
      poleTouch: poleTouchAt(t),
      insideReach: 0,
      outside: { hipFlex, ankleFlex, femurRotation, tailLift: 0, adduction: 0 },
      // The inside leg shortens, its foot leading as a result (lemaster-2010 pp61-62); the shin stays
      // forward on the tongue as the ski pitches tip-down under it.
      inside: {
        hipFlex: hipFlex + extra,
        ankleFlex: insideAnkle(tailLift),
        femurRotation: INSIDE_FEMUR_SHARE * femurRotation,
        tailLift,
        // At hip width, as the outside thigh.
        adduction: 0,
      },
    };
  };
  const insideAnkle = (tailLift: number): number => shinAngle(dorsiflexion + (insideDorsiflexion(t) - dorsiflexion) * lifted, EQUIPMENT) + tailLift;
  // Flex the inside hip until its ski tip just touches the snow; the tip rises with flex. The spine moves no leg.
  const tipFlex = (knee: number, tailLift: number): number => {
    let lo = -0.3;
    let hi = 1.5;
    for (let i = 0; i < 24; i++) {
      const mid = (lo + hi) / 2;
      if (insideTipHeight(base(knee, mid, tailLift)) > 0) hi = mid;
      else lo = mid;
    }
    return (lo + hi) / 2;
  };
  // The lifted inside knee may flex past heinrich-2022's weighted 81-114 deg, but stops at INSIDE_KNEE_MAX:
  // past it the tail lifts less instead, so the tip stays on the snow.
  const insideLeg = (knee: number): { readonly extra: number; readonly tailLift: number } => {
    const capped = (tailLift: number): number => INSIDE_KNEE_MAX - (knee - ankleFlex) - insideAnkle(tailLift);
    const extra = tipFlex(knee, fullLift);
    if (extra <= capped(fullLift)) return { extra, tailLift: fullLift };
    let lo = 0;
    let hi = fullLift;
    for (let i = 0; i < 20; i++) {
      const mid = (lo + hi) / 2;
      if (insideTipHeight(base(knee, capped(mid), mid)) > 0) lo = mid;
      else hi = mid;
    }
    const tailLift = (lo + hi) / 2;
    return { extra: capped(tailLift), tailLift };
  };
  // Bend the knee until the centre of mass sits comAhead of mid-foot; more knee moves it back, as the hips
  // sink behind the foot and the trunk, at a set hip angle, stands up with the thigh (lemaster-2010 p9, p16).
  const balance = (extra: number, tailLift: number): number => {
    let lo = 30 * DEG;
    let hi = 120 * DEG;
    for (let i = 0; i < 24; i++) {
      const mid = (lo + hi) / 2;
      if (comAhead(segmentMatrices(base(mid, extra, tailLift))) > k.comAhead) lo = mid;
      else hi = mid;
    }
    return (lo + hi) / 2;
  };
  // The lifted leg and the outside knee depend on each other a little; two rounds settle them.
  let knee = 65 * DEG;
  let inside = insideLeg(knee);
  for (let round = 0; round < 2; round++) {
    knee = balance(inside.extra, inside.tailLift);
    inside = insideLeg(knee);
  }
  const legs = base(knee, inside.extra, inside.tailLift);
  return legs.poleTouch > 0 ? { ...legs, insideReach: legs.poleTouch * solveReach(legs) } : legs;
};

/** Solved poses per turn; a multiple of the bake's 24 frames, so those frames are exact. */
export const POSE_SAMPLES = 96;
/** One table per scenario, solved on first use (about 75 ms). */
const tables = new Map<string, ReadonlyArray<Pose>>();
const tableFor = (s: TurnScenario): ReadonlyArray<Pose> => {
  const key = `${s.speedMps}/${s.radiusM}/${s.slopeDeg}`;
  let table = tables.get(key);
  if (table === undefined) {
    table = Array.from({ length: POSE_SAMPLES }, (_, i) => solvePose(i / POSE_SAMPLES, s));
    tables.set(key, table);
  }
  return table;
};

const mixLeg = (a: LegPose, b: LegPose, f: number): LegPose => ({
  hipFlex: a.hipFlex + (b.hipFlex - a.hipFlex) * f,
  ankleFlex: a.ankleFlex + (b.ankleFlex - a.ankleFlex) * f,
  femurRotation: a.femurRotation + (b.femurRotation - a.femurRotation) * f,
  tailLift: a.tailLift + (b.tailLift - a.tailLift) * f,
  adduction: a.adduction + (b.adduction - a.adduction) * f,
});

/** The pose at turn time `t`, interpolated from a table solved once per scenario. */
export const poseAt = (t: number, scenario: TurnScenario): Pose => {
  const table = tableFor(scenario);
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
    eversion: mix(a.eversion, b.eversion),
    pelvisList: mix(a.pelvisList, b.pelvisList),
    pelvisPitch: mix(a.pelvisPitch, b.pelvisPitch),
    counter: mix(a.counter, b.counter),
    spineFlex: mix(a.spineFlex, b.spineFlex),
    spineBend: mix(a.spineBend, b.spineBend),
    spineTwist: mix(a.spineTwist, b.spineTwist),
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

/** Turn time of the inside pole touch: the transition, just before the tail lifts (psia-c-stork-turns, lemaster-2010 p39). */
export const POLE_TOUCH_T = 1 / 24;
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
