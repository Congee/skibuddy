import { BodySide, SEGMENTS, SegmentKind } from './figure';
import { compose, identity, rotationY, translation } from './mat4';
import type { Mat4 } from './mat4';
import { POSE_CHANNELS, poseFromChannels, segmentMatrices } from './pose';
import type { Pose } from './pose';

/**
 * What stays put on screen: the skis (the body turns over them), the hips (the skis swivel under them), or the
 * slope (skis and body turn together down the fall line).
 */
export const ViewLock = { SkisFixed: 'skis-fixed', HipsFixed: 'hips-fixed', SlopeFixed: 'slope-fixed' } as const;
export type ViewLock = (typeof ViewLock)[keyof typeof ViewLock];

const PELVIS = SEGMENTS.findIndex((s) => s.kind === SegmentKind.Pelvis && s.side === BodySide.Center);

/** The pelvis's heading from +z (the skis) toward +x, and where it stands over the snow. */
export const pelvisOnSnow = (pelvis: Mat4): { readonly heading: number; readonly x: number; readonly z: number } => ({
  // From the lateral axis, which the pelvis's forward fold leaves level.
  heading: Math.atan2(-(pelvis[2] ?? 0), pelvis[0] ?? 1),
  x: pelvis[12] ?? 0,
  z: pelvis[14] ?? 0,
});

const pelvisOf = (pose: Pose): Mat4 => segmentMatrices(pose)[PELVIS] ?? identity();

/** Where the pelvis stands in the neutral stance; the locked pelvis is held there. */
const HOME = pelvisOnSnow(pelvisOf(poseFromChannels(POSE_CHANNELS.map(() => 0))));

/** The figure root's transform that turns the skis `yaw` off +z and holds the pelvis where it stands in the neutral stance. */
const centred = (p: { readonly x: number; readonly z: number }, yaw: number): Mat4 =>
  compose(translation([HOME.x, 0, HOME.z]), rotationY(yaw), translation([-p.x, 0, -p.z]));

/** Holds the pelvis's heading and place on the snow, so the skis turn and slide under it. */
export const hipLock = (pose: Pose): Mat4 => {
  const p = pelvisOnSnow(pelvisOf(pose));
  return centred(p, HOME.heading - p.heading);
};

/** Turns the skis to `heading` off the fall line (+z), the pelvis held in place. */
export const slopeLock = (pose: Pose, heading: number): Mat4 => centred(pelvisOnSnow(pelvisOf(pose)), heading);
