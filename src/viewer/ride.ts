import { BodySide } from './figure';
import { identity, transformPoint } from './mat4';
import type { Vec3 } from './mat4';
import { SKI_TAIL, SKI_TIP, segmentMatrices, skiIndex } from './pose';
import type { Pose } from './pose';
import { wrapTime } from './pose-definition';
import { SurfaceKind, skiRest } from './surface';
import type { SkiRest, Surface } from './surface';

/**
 * How the snow under the skis meets a pose at turn time t: each ski's pitch tip-up, the inside tip's height over the
 * outside one, and how far the figure's root rises so both skis rest on the snow.
 */
export interface Ride {
  readonly outside: number;
  readonly inside: number;
  readonly insideTip: number;
  readonly lift: number;
}

export const FLAT_RIDE: Ride = { outside: 0, inside: 0, insideTip: 0, lift: 0 };

/** Each ski's rest on moguls under `pose`, from where its binding stands in the figure's root, and the root's lift onto them. */
const skiRests = (s: Surface, t: number, pose: Pose): { readonly outside: SkiRest; readonly inside: SkiRest; readonly lift: number } => {
  const world = segmentMatrices({ ...pose, rise: 0 });
  const binding = (side: BodySide): Vec3 => transformPoint(world[skiIndex(side)] ?? identity(), [0, SKI_TIP[1], 0]);
  const right = binding(BodySide.Right);
  const left = binding(BodySide.Left);
  // Pressed together, the skis edge as one platform: the snow's slope across the stance goes to the edges, not the legs.
  const across = (right[0] + left[0]) / 2;
  const rest = ([, , z]: Vec3): SkiRest => skiRest(s, wrapTime(t), [across, z], SKI_TIP[2], -SKI_TAIL[2]);
  const outside = rest(right);
  const inside = rest(left);
  // Both rest when the legs meet the snow; when the inside leg falls short, it rests and the outside floats.
  return { outside, inside, lift: Math.max(outside.base - right[1], inside.base - left[1]) };
};

/** The ride on moguls; off them the skis lie flat on the root's y = 0. */
export const rideOf = (s: Surface, t: number, pose: Pose): Ride => {
  if (s.kind !== SurfaceKind.Moguls) return FLAT_RIDE;
  const { outside, inside, lift } = skiRests(s, t, pose);
  return { outside: outside.pitch, inside: inside.pitch, insideTip: inside.tip - outside.tip, lift };
};
