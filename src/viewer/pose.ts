import { EQUIPMENT, totalRamp } from './equipment';
import { BodySide, CAPSULE_BINDING, SEGMENTS, SegmentKind } from './figure';
import type { Segment } from './figure';
import { compose, identity, inverseRotation, rotationX, rotationY, rotationZ, transformPoint, translation } from './mat4';
import type { Mat4, Vec3 } from './mat4';

/**
 * Joint angles in radians; flexion is positive. "Body frame" is the figure before
 * the lean, whose y axis is the balance axis. Solved at build time (pose-solver.ts),
 * read at run time from the tables (pose-table.ts).
 */
export interface Pose {
  /** Whole-body inclination toward the inside of the turn, about the outside ski. */
  readonly lean: number;
  /** Thighs inclined further in than the balance axis. */
  readonly hipAngulation: number;
  /** Outside foot everted at the subtalar joint; the inside foot inverts there to keep its ski parallel. */
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
  /** Head turned toward the outside of the turn beyond the chest. */
  readonly headYaw: number;
  /** Both arms abducted at the shoulder, so the hands ride out to the sides. */
  readonly armAbduction: number;
  /** Both upper arms flexed forward at the shoulder. */
  readonly armFlexion: number;
  /** 0..1: the inside pole swings forward and plants at 1; negative, the outside pole does, for the next turn. */
  readonly poleTouch: number;
  /** Extra shoulder flexion of the touching arm that brings the touch beside the ski; solved per figure. */
  readonly reach: number;
  /** Metres the whole figure stands above its outside ski's contact: a tip-down ski's tip on or over the snow. */
  readonly rise: number;
  /** 0..1: share of the mass's offset from the balance axis the body rolls out about the contact; nil at the switch, where the mass leads. */
  readonly balance: number;
  readonly outside: LegPose;
  readonly inside: LegPose;
  readonly outsideGirdle: GirdlePose;
  readonly insideGirdle: GirdlePose;
}

export interface LegPose {
  /** Thigh forward of the balance axis in the body frame; hip flexion adds the pelvis's pitch. */
  readonly hipFlex: number;
  /** Shin forward of vertical, from the ski-base normal on a flat ski. */
  readonly ankleFlex: number;
  /** Femur turned about its own axis so the knee moves toward the turn: outside internal, inside external rotation. */
  readonly femurRotation: number;
  /** Ski pitch about the boot with the tail up; negative, the tip up. */
  readonly tailLift: number;
  /** Thigh drawn toward the other leg in the body frame. */
  readonly adduction: number;
}

/** The shoulder blade and collarbone on the chest. */
export interface GirdlePose {
  /** Drawn forward round the chest. */
  readonly protraction: number;
  /** Raised. */
  readonly elevation: number;
}

/** Every number in a pose, in a fixed order: the tables' channels. */
export const POSE_CHANNELS = [
  'lean',
  'hipAngulation',
  'eversion',
  'pelvisList',
  'pelvisPitch',
  'counter',
  'spineFlex',
  'spineBend',
  'spineTwist',
  'poleTouch',
  'reach',
  'outside.hipFlex',
  'outside.ankleFlex',
  'outside.femurRotation',
  'outside.tailLift',
  'outside.adduction',
  'inside.hipFlex',
  'inside.ankleFlex',
  'inside.femurRotation',
  'inside.tailLift',
  'inside.adduction',
  'outsideGirdle.protraction',
  'outsideGirdle.elevation',
  'insideGirdle.protraction',
  'insideGirdle.elevation',
  'headYaw',
  'armAbduction',
  'rise',
  'balance',
  'armFlexion',
] as const;

export const poseToChannels = (p: Pose): ReadonlyArray<number> => [
  p.lean,
  p.hipAngulation,
  p.eversion,
  p.pelvisList,
  p.pelvisPitch,
  p.counter,
  p.spineFlex,
  p.spineBend,
  p.spineTwist,
  p.poleTouch,
  p.reach,
  p.outside.hipFlex,
  p.outside.ankleFlex,
  p.outside.femurRotation,
  p.outside.tailLift,
  p.outside.adduction,
  p.inside.hipFlex,
  p.inside.ankleFlex,
  p.inside.femurRotation,
  p.inside.tailLift,
  p.inside.adduction,
  p.outsideGirdle.protraction,
  p.outsideGirdle.elevation,
  p.insideGirdle.protraction,
  p.insideGirdle.elevation,
  p.headYaw,
  p.armAbduction,
  p.rise,
  p.balance,
  p.armFlexion,
];

/** The inverse of `poseToChannels`, reading `channels` from `at`. */
export const poseFromChannels = (c: ArrayLike<number>, at = 0): Pose => {
  const v = (i: number): number => c[at + i] ?? 0;
  return {
    lean: v(0),
    hipAngulation: v(1),
    eversion: v(2),
    pelvisList: v(3),
    pelvisPitch: v(4),
    counter: v(5),
    spineFlex: v(6),
    spineBend: v(7),
    spineTwist: v(8),
    poleTouch: v(9),
    reach: v(10),
    outside: { hipFlex: v(11), ankleFlex: v(12), femurRotation: v(13), tailLift: v(14), adduction: v(15) },
    inside: { hipFlex: v(16), ankleFlex: v(17), femurRotation: v(18), tailLift: v(19), adduction: v(20) },
    outsideGirdle: { protraction: v(21), elevation: v(22) },
    insideGirdle: { protraction: v(23), elevation: v(24) },
    headYaw: v(25),
    armAbduction: v(26),
    rise: v(27),
    balance: v(28),
    armFlexion: v(29),
  };
};

/** 0 at the transition (t = 0), 1 mid-turn (t = 0.5). */
export const turnDepth = (t: number): number => 0.5 - 0.5 * Math.cos(2 * Math.PI * (((t % 1) + 1) % 1));

/** Arms abducted at the shoulder so the hands ride wide, poles clear of the body (lemaster-2010); a kind may hold them closer. */
export const ARM_ABDUCTION = 0.5;
/** Forward flexion of the upper arm; build_anatomy.py reads it from the pose track. */
export const ARM_FLEXION = 0.4;
/** Elbow flexion, about 75 deg (lemaster-2010 p142); build_anatomy.py reads it from the pose track. */
export const FOREARM_FLEXION = 1.3;
/** Trunk pitch the arm angles are set at; leaning past it flexes shoulder and elbow further so the forearm keeps its pitch over the snow (lemaster-2010 p142). */
export const ARM_LEAN = 0.35;
/** Share of that flexion the shoulder takes; the elbow takes the rest. */
export const ARM_LEAN_SHOULDER = 0.5;
/** Share of the inside reach the elbow gives back, so the forearm stays nearer level through the swing (lemaster-2010 p142). */
export const ARM_REACH_ELBOW = 0.5;
const armLean = (pose: Pose): number => pose.pelvisPitch + pose.spineFlex - ARM_LEAN;

// Outside is the figure's right leg; the other turn is drawn mirrored (mirrorPose, MIRROR).
const legPose = (pose: Pose, side: BodySide): LegPose => (side === BodySide.Right ? pose.outside : pose.inside);
const girdlePose = (pose: Pose, side: BodySide): GirdlePose => (side === BodySide.Right ? pose.outsideGirdle : pose.insideGirdle);

/** The arm that swings to the touch: the inside one, or the outside one ahead of the next turn. */
export const touchSide = (pose: Pose): typeof BodySide.Left | typeof BodySide.Right => (pose.poleTouch < 0 ? BodySide.Right : BodySide.Left);

/** The touch share of the pole on `side`. */
export const poleTouchOf = (pose: Pose, side: BodySide): number => (side === touchSide(pose) ? Math.abs(pose.poleTouch) : 0);

const mirrorLeg = (leg: LegPose): LegPose => ({ ...leg, femurRotation: -leg.femurRotation });

/**
 * The same body reflected left for right, in this turn's terms: the legs and shoulder girdles swap and every
 * roll and yaw toward the inside changes sign. A turn ends on the mirror of its start, the next turn's start.
 */
export const mirrorPose = (p: Pose): Pose => ({
  ...p,
  lean: -p.lean,
  hipAngulation: -p.hipAngulation,
  eversion: -p.eversion,
  pelvisList: -p.pelvisList,
  counter: -p.counter,
  spineBend: -p.spineBend,
  spineTwist: -p.spineTwist,
  headYaw: -p.headYaw,
  poleTouch: -p.poleTouch,
  outside: mirrorLeg(p.inside),
  inside: mirrorLeg(p.outside),
  outsideGirdle: p.insideGirdle,
  insideGirdle: p.outsideGirdle,
});

/** Reflects the figure's root across its midline: the other turn, its right leg on the inside. */
export const MIRROR: Mat4 = new Float32Array([-1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);

/** The pelvis in the body frame: counter, then the outward tip, then the fold at the hips. */
export const pelvisRotation = (counter: number, list: number, pitch: number): Mat4 => compose(rotationY(-counter), rotationZ(list), rotationX(pitch));
const pelvisOf = (pose: Pose): Mat4 => pelvisRotation(pose.counter, pose.pelvisList, pose.pelvisPitch);

/** Share of the trunk's roll the head takes back out, so the eyes stay near level, tipped slightly outside (lemaster-2010 p72). */
const HEAD_LEVEL = 0.7;

const localRotation = (segment: Segment, pose: Pose, lean: number): Mat4 => {
  const leg = legPose(pose, segment.side);
  const out = segment.side === BodySide.Right ? -1 : 1;
  switch (segment.kind) {
    case SegmentKind.Pelvis:
      return pelvisOf(pose);
    case SegmentKind.Trunk:
      return compose(rotationY(-pose.spineTwist), rotationZ(pose.spineBend), rotationX(pose.spineFlex));
    case SegmentKind.Head:
      // Eyes ahead, not at the snow.
      return compose(
        rotationY(-pose.headYaw),
        rotationZ(-HEAD_LEVEL * (pose.pelvisList - lean + pose.spineBend)),
        rotationX(-HEAD_LIFT * (pose.pelvisPitch + pose.spineFlex)),
      );
    case SegmentKind.Girdle: {
      // About the sternoclavicular joint: forward round the chest, then up.
      const g = girdlePose(pose, segment.side);
      return compose(rotationY(-out * g.protraction), rotationZ(out * g.elevation));
    }
    case SegmentKind.UpperArm: {
      // Hands forward at hip-to-chest height, wider than the hips; the girdle's turn is taken back out of the arm's aim.
      const g = girdlePose(pose, segment.side);
      return compose(
        rotationY(out * g.protraction),
        rotationZ(out * pose.armAbduction),
        rotationX(-pose.armFlexion - ARM_LEAN_SHOULDER * armLean(pose) - (segment.side === touchSide(pose) ? pose.reach : 0)),
      );
    }
    case SegmentKind.Forearm:
      return rotationX(-FOREARM_FLEXION - (1 - ARM_LEAN_SHOULDER) * armLean(pose) + (segment.side === touchSide(pose) ? ARM_REACH_ELBOW * pose.reach : 0));
    case SegmentKind.Thigh:
      // Set in the body frame, so the pelvis's counter and tip are rotation and abduction in the hip.
      return compose(inverseRotation(pelvisOf(pose)), rotationZ(-pose.hipAngulation - out * leg.adduction), rotationX(-leg.hipFlex), rotationY(leg.femurRotation));
    case SegmentKind.Shin:
      // A hinge: the knee only flexes.
      return rotationX(kneeFlex(leg));
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

/** The thigh's pitch that, with the shin pitched by ankleFlex and the femur turned, flexes the knee by `knee`: kneeFlex's inverse. */
export const thighPitch = (knee: number, ankleFlex: number, femurRotation: number): number => {
  const [a, b] = [Math.cos(femurRotation) * Math.sin(knee), Math.cos(knee)];
  return Math.acos(Math.sin(ankleFlex) / Math.hypot(a, b)) - Math.atan2(b, a);
};

/**
 * The knee's hinge angle that keeps the shin pitched forward by ankleFlex, as the boot's cuff holds it, whatever the
 * femur's rotation: the rotation then only tilts the shin sideways (lemaster-2010 pp61-62, p74). Inferred from the cuff.
 * Mirrored in build_anatomy.py.
 */
export const kneeFlex = (leg: LegPose): number => {
  const [a, b] = [Math.cos(leg.hipFlex) * Math.cos(leg.femurRotation), Math.sin(leg.hipFlex)];
  return Math.atan2(b, a) + Math.asin(Math.sin(leg.ankleFlex) / Math.hypot(a, b));
};

/** Frontal tilt of a shin toward the inside of the turn, in the body frame. */
const shinTilt = (shin: Mat4): number => {
  const [ox, oy] = transformPoint(shin, [0, 0, 0]);
  const [x, y] = transformPoint(shin, [0, 1, 0]);
  return Math.atan2(x - ox, y - oy);
};

/**
 * Foot orientation before the lean: after it, both skis point straight ahead on one edge angle,
 * the shins' tilt (edgeOf) plus the outside foot's subtalar eversion, and only the inside tail pitches
 * up; the foot sits heel-up on its ski by the total ramp.
 * Mirrored in build_anatomy.py.
 */
const bootRotation = (segment: Segment, pose: Pose, edge: number, lean: number): Mat4 =>
  compose(rotationZ(lean), rotationX(legPose(pose, segment.side).tailLift), rotationZ(-lean - edge), rotationX(RAMP));

/** Share of the torso's pitch the neck takes back out. */
export const HEAD_LIFT = 0.6;

/** Height of the ski base below its segment origin. */
const SKI_BASE = -EQUIPMENT.skiThickness / 2;
/** Mid-foot in the foot's frame: the binding's centre on the ski's top. */
export const MID_FOOT: Vec3 = transformPoint(CAPSULE_BINDING, [0, 0, 0]);
export const SKI_TIP: Vec3 = [0, SKI_BASE, 0.85];
/** As figure.ts's ski: 1.6 m long, 5 cm more of it ahead of the binding than behind. */
export const SKI_TAIL: Vec3 = [0, SKI_BASE, -0.75];

const FOOT_KINDS: ReadonlySet<SegmentKind> = new Set([SegmentKind.Boot, SegmentKind.Ski]);
const isFoot = (kind: SegmentKind): boolean => FOOT_KINDS.has(kind);
const SHINS = [BodySide.Right, BodySide.Left].map((side) => SEGMENTS.findIndex((s) => s.kind === SegmentKind.Shin && s.side === side));
/** Lean by which the outside shin alone sets the edge. */
const EDGE_HANDOVER = (10 * Math.PI) / 180;
/** The outside leg's share of what both legs set: 1 past EDGE_HANDOVER of lean, half at the switch, flat there. */
export const outsideWeight = (lean: number): number => {
  const u = Math.min(1, Math.abs(lean) / EDGE_HANDOVER);
  return 0.5 + 0.5 * u * u * (3 - 2 * u);
};

/** Both shins' tilt, evenly at the switch where the lean is nil, so the edge flips with the mirrored pose. */
const edgeOf = (world: ReadonlyArray<Mat4>, pose: Pose): number => {
  const outside = outsideWeight(pose.lean);
  const [right, left] = SHINS.map((i) => shinTilt(world[i] ?? identity()));
  return outside * (right ?? 0) + (1 - outside) * (left ?? 0) + pose.eversion;
};

/**
 * The figure leaned toward the inside about the outside ski base, which rests on y = `rise`; near the switch about a
 * point between both skis, so the mass rolls across smoothly. Balanced, the body first rolls out about that contact
 * by `balance` of the mass's offset, so the line from the contact through the mass tilts by the lean.
 */
const placed = (pose: Pose, balanced: boolean): { readonly world: ReadonlyArray<Mat4>; readonly roll: number } => {
  const world: Array<Mat4> = [];
  const place = (kinds: (kind: SegmentKind) => boolean, edge: number, lean: number): void =>
    SEGMENTS.forEach((segment, i) => {
      if (!kinds(segment.kind)) return;
      const parent = segment.parent === null ? identity() : (world[segment.parent] ?? identity());
      const local = segment.kind === SegmentKind.Boot ? compose(inverseRotation(parent), bootRotation(segment, pose, edge, lean)) : localRotation(segment, pose, lean);
      world[i] = compose(parent, translation(segment.joint), local);
    });
  const o = outsideWeight(pose.lean);
  const pivot = (): Vec3 => {
    const [rx, ry, rz] = transformPoint(world[skiIndex(BodySide.Right)] ?? identity(), [0, SKI_BASE, 0]);
    const [lx, ly, lz] = transformPoint(world[skiIndex(BodySide.Left)] ?? identity(), [0, SKI_BASE, 0]);
    return [o * rx + (1 - o) * lx, o * ry + (1 - o) * ly, o * rz + (1 - o) * lz];
  };
  // The boots wait for both shins.
  place((kind) => !isFoot(kind), 0, pose.lean);
  const edge = edgeOf(world, pose);
  place(isFoot, edge, pose.lean);
  let [cx, cy, cz] = pivot();
  let roll = 0;
  if (balanced && pose.balance !== 0) {
    const com = centreOfMass(world);
    roll = pose.balance * Math.atan2(com[0] - cx, com[1] - cy);
    // The head levels and the skis lie flat ahead against the rolled body; neither moves the mass to speak of.
    place((kind) => kind === SegmentKind.Head || isFoot(kind), edge, pose.lean - roll);
    [cx, cy, cz] = pivot();
  }
  // Negative z rotation tips the figure toward +x, the inside (left) side.
  const lean = compose(translation([cx, pose.rise, cz]), rotationZ(roll - pose.lean), translation([-cx, -cy, -cz]));
  return { world: world.map((m) => compose(lean, m)), roll };
};

/** World matrix per segment; `balanced` false leaves the body frame unrolled, the mass off the balance axis. */
export const segmentMatrices = (pose: Pose, balanced = true): ReadonlyArray<Mat4> => placed(pose, balanced).world;

/** How far the body frame rolls out about the contact to bring the mass onto the balance axis, radians. */
export const balanceRoll = (pose: Pose): number => placed(pose, true).roll;

export const skiIndex = (side: BodySide): number => SEGMENTS.findIndex((s) => s.kind === SegmentKind.Ski && s.side === side);

/** Body mass shares per segment kind (de-leva-1996); the forearm carries the hand, the trunk the chest, abdomen and shoulder girdle. */
const MASS_SHARE: Readonly<Record<SegmentKind, number>> = {
  [SegmentKind.Pelvis]: 0.1117,
  [SegmentKind.Trunk]: 0.3229,
  [SegmentKind.Head]: 0.0694,
  [SegmentKind.Girdle]: 0,
  [SegmentKind.UpperArm]: 0.0271,
  [SegmentKind.Forearm]: 0.0223,
  [SegmentKind.Thigh]: 0.1416,
  [SegmentKind.Shin]: 0.0433,
  [SegmentKind.Boot]: 0.0137,
  [SegmentKind.Ski]: 0,
};

const OUTSIDE_BOOT = SEGMENTS.findIndex((s) => s.kind === SegmentKind.Boot && s.side === BodySide.Right);
const OUTSIDE_SKI = SEGMENTS.findIndex((s) => s.kind === SegmentKind.Ski && s.side === BodySide.Right);

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

/** How far `p` lies ahead of `from` along the outside ski: the snow pushes square to its base (lemaster-2010 p9). */
export const aheadOnSki = (world: ReadonlyArray<Mat4>, p: Vec3, from: Vec3): number => {
  const ski = world[OUTSIDE_SKI] ?? identity();
  const [ox, oy, oz] = transformPoint(ski, [0, 0, 0]);
  const [ax, ay, az] = transformPoint(ski, [0, 0, 1]);
  return (p[0] - from[0]) * (ax - ox) + (p[1] - from[1]) * (ay - oy) + (p[2] - from[2]) * (az - oz);
};

/** How far the centre of mass sits ahead of the outside mid-foot along the ski (lemaster-2010 p57). */
export const comAhead = (world: ReadonlyArray<Mat4>): number => aheadOnSki(world, centreOfMass(world), transformPoint(world[OUTSIDE_BOOT] ?? identity(), MID_FOOT));

/** Pole measured from the centre of the fist. */
export const POLE = {
  /** Basket above the spike's point. */
  basketUp: 0.08,
  /** Basket height while carried: trailing just clear of the snow, so the shaft hangs steeply from the fist. */
  carry: 0.12,
} as const;

/** The arm standing in boots, as poles are sized: shoulder height above the snow, upper-arm length, and the fist above the forearm's axis held level. */
export interface StandingArm {
  readonly shoulder: number;
  readonly upperArm: number;
  readonly fist: number;
}

/** Regular pole, fist to tip: standing, upper arm hanging, forearm level, the tip just on the snow. */
export const regularPoleReach = (arm: StandingArm): number => arm.shoulder - arm.upperArm + arm.fist;

export interface PoleSize {
  /** Fist to the spike's point. */
  readonly reach: number;
  /** Fist to the basket. */
  readonly basket: number;
}

/** The arm's pole, `trim` metres shorter than regular. */
export const poleSize = (arm: StandingArm, trim = 0): PoleSize => {
  const reach = regularPoleReach(arm) - trim;
  return { reach, basket: reach - POLE.basketUp };
};

/** Heading of the carried shaft from +z (forward) toward the pole's own side. */
export const CARRY_HEADING = Math.PI - 0.3;
/**
 * Furthest the carried shaft trails back from square to the forearm. A low hand, as the inside one at high
 * tilt, swings it out to its own side past this, the grip rolling with the forearm rather than the wrist bending.
 */
export const CARRY_TRAIL = 1.0;
/** The touch lands this far outside the inside ski, and this far ahead of the ankle: by the forebody. */
export const PLANT_SIDE = 0.22;
export const PLANT_AHEAD = 0.3;

/** `heading`, or swung out toward the pole's side until a shaft `drop` down per unit trails at most CARRY_TRAIL behind square to the forearm. */
const trailHeading = (heading: number, drop: number, out: number, forearm: Vec3): number => {
  const [fx, fy, fz] = forearm;
  const n = Math.hypot(fx, fy, fz);
  // Heading h trails back by -(level * cos(h - aim) - drop * rise), from square to the forearm.
  const level = (Math.sqrt(1 - drop ** 2) * Math.hypot(fx, fz)) / n;
  if (level < 1e-9) return heading;
  const aim = Math.atan2(out * fx, fz);
  const least = (drop * (fy / n) - Math.sin(CARRY_TRAIL)) / level;
  if (Math.cos(heading - aim) >= least) return heading;
  return aim + Math.acos(Math.min(1, Math.max(-1, least)));
};

/**
 * Unit shaft direction, fist to tip, in world space. The pitch is solved so the
 * basket hangs at the carry height, or reaches the snow at a full touch beside
 * the ski at `ankle`, behind the fist, for a basket `b` from the fist; the heading eases between the two, so the
 * swing stays back and close to the hand. `forearm` points elbow to wrist.
 */
export const poleDirection = (grip: Vec3, side: typeof BodySide.Left | typeof BodySide.Right, touch: number, ankle: Vec3, b: number, forearm: Vec3): Vec3 => {
  const out = side === BodySide.Left ? 1 : -1;
  const dx = ankle[0] + out * PLANT_SIDE - grip[0];
  const dz = -Math.sqrt(Math.max(0, b ** 2 - grip[1] ** 2 - dx ** 2));
  const drop = Math.min(b, Math.max(0, grip[1] - POLE.carry * (1 - touch) ** 2));
  // Turn the short way from the carry heading.
  const turn = Math.atan2(out * dx, dz) - CARRY_HEADING;
  const heading = trailHeading(CARRY_HEADING + Math.atan2(Math.sin(turn), Math.cos(turn)) * touch, drop / b, out, forearm);
  const flat = Math.sqrt(b ** 2 - drop ** 2);
  return [(out * Math.sin(heading) * flat) / b, -drop / b, (Math.cos(heading) * flat) / b];
};

/** The capsule figure's fist, in its forearm frame. */
export const CAPSULE_GRIP: Vec3 = [0, -0.3, 0.01];

const UPPER_ARM = SEGMENTS.findIndex((s) => s.kind === SegmentKind.UpperArm && s.side === BodySide.Left);
const FOREARM = SEGMENTS.findIndex((s) => s.kind === SegmentKind.Forearm && s.side === BodySide.Left);

/** The capsule figure's arm, measured standing with every joint angle at zero; its boot soles sit the stand height over the ski bases. */
export const CAPSULE_ARM: StandingArm = {
  shoulder: transformPoint(segmentMatrices(poseFromChannels(POSE_CHANNELS.map(() => 0)))[UPPER_ARM] ?? identity(), [0, 0, 0])[1] - EQUIPMENT.standHeight,
  upperArm: Math.hypot(...(SEGMENTS[FOREARM]?.joint ?? [0, 0, 0])),
  // Level, the forearm's frame turns its +z up.
  fist: CAPSULE_GRIP[2],
};
