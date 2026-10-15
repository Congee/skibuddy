import { BodySide, SEGMENTS, SegmentKind } from './figure';
import type { Segment } from './figure';
import { compose, identity, rotationX, rotationZ, transformPoint, translation } from './mat4';
import type { Mat4 } from './mat4';

/** Joint angles in radians; flexion is positive. */
export interface Pose {
  readonly lean: number;
  readonly angulation: number;
  readonly trunkFlex: number;
  readonly outside: LegPose;
  readonly inside: LegPose;
}

export interface LegPose {
  readonly hipFlex: number;
  readonly kneeFlex: number;
  /** Ski pitch with the tail up. */
  readonly tailLift: number;
}

const STANCE: LegPose = { hipFlex: 0.5, kneeFlex: 0.85, tailLift: 0 };
const MAX_LEAN = 0.22;

/** 0 at the transition (t = 0), 1 mid-turn (t = 0.5). */
export const turnDepth = (t: number): number => 0.5 - 0.5 * Math.cos(2 * Math.PI * (((t % 1) + 1) % 1));

export const poseAt = (t: number): Pose => {
  const d = turnDepth(t);
  return {
    lean: MAX_LEAN * d,
    angulation: 0.5 * MAX_LEAN * d,
    trunkFlex: 0.3,
    outside: STANCE,
    inside: { hipFlex: STANCE.hipFlex + 0.45 * d, kneeFlex: STANCE.kneeFlex + 0.75 * d, tailLift: 0.3 * d },
  };
};

// Outside = the figure's right leg until turns alternate sides.
const legPose = (pose: Pose, side: BodySide): LegPose => (side === BodySide.Right ? pose.outside : pose.inside);

const localRotation = (segment: Segment, pose: Pose): Mat4 => {
  const leg = legPose(pose, segment.side);
  switch (segment.kind) {
    case SegmentKind.Trunk:
      return compose(rotationZ(pose.angulation), rotationX(-pose.trunkFlex));
    case SegmentKind.UpperArm:
      return compose(rotationZ(segment.side === BodySide.Right ? -0.25 : 0.25), rotationX(-0.4));
    case SegmentKind.Forearm:
      return rotationX(-0.7);
    case SegmentKind.Thigh:
      return rotationX(-leg.hipFlex);
    case SegmentKind.Shin:
      return rotationX(leg.kneeFlex);
    case SegmentKind.Boot:
      // Undo the shin's net tilt so the boot sole stays level, then pitch the tail up.
      return rotationX(leg.hipFlex - leg.kneeFlex + leg.tailLift);
    default:
      return identity();
  }
};

/** Height of the ski base below its segment origin. */
const SKI_BASE = -0.01;

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
  const outsideSki = world[SEGMENTS.findIndex((s) => s.kind === SegmentKind.Ski && s.side === BodySide.Right)] ?? identity();
  const [cx, cy, cz] = transformPoint(outsideSki, [0, SKI_BASE, 0]);
  // Negative z rotation tips the figure toward +x, the inside (left) side.
  const lean = compose(translation([cx, 0, cz]), rotationZ(-pose.lean), translation([-cx, -cy, -cz]));
  return world.map((m) => compose(lean, m));
};
