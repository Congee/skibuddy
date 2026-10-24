import { BodySide } from './figure';
import { identity, transformPoint } from './mat4';
import type { Vec3 } from './mat4';
import { SKI_BASE, segmentMatrices, skiEndPoints, skiIndex } from './pose';
import type { Pose } from './pose';
import { wrapTime } from './pose-definition';
import { SurfaceKind, skiRest } from './surface';
import type { SkiRest, Surface } from './surface';
import { REFERENCE_SKIER, SKI_MOUNT, Terrain, skiFor } from './skier';
import type { ReferenceSkier, Ski } from './skier';

/** The ski `skier` takes onto `s`'s snow. */
export const skiOn = (s: Surface | null, skier: ReferenceSkier = REFERENCE_SKIER): Ski => skiFor(skier, s?.kind === SurfaceKind.Moguls ? Terrain.Moguls : Terrain.Groomed);

/**
 * How the snow under the skis meets a pose at turn time t: each ski's pitch tip-up, the snow's bank under each ski
 * toward the turn's inside, the inside tip's height over the outside one, and how far the figure's root rises so both
 * skis rest on the snow. A ski's edge on the snow is its edge to the slope less its bank.
 */
export interface Ride {
  readonly outside: number;
  readonly inside: number;
  readonly outsideBank: number;
  readonly insideBank: number;
  readonly insideTip: number;
  readonly lift: number;
}

export const FLAT_RIDE: Ride = { outside: 0, inside: 0, outsideBank: 0, insideBank: 0, insideTip: 0, lift: 0 };

/** Each ski's rest on moguls under `pose`, from where its binding stands in the figure's root, and the root's lift onto them. */
const skiRests = (s: Surface, t: number, pose: Pose, ski: Ski): { readonly outside: SkiRest; readonly inside: SkiRest; readonly lift: number } => {
  const world = segmentMatrices({ ...pose, rise: 0 });
  const { tip, tail } = skiEndPoints(ski);
  // The mount, where the solve bends the ski about (SkiPoints.centre).
  const binding = (side: BodySide): Vec3 => transformPoint(world[skiIndex(side)] ?? identity(), [0, SKI_BASE, SKI_MOUNT]);
  const right = binding(BodySide.Right);
  const left = binding(BodySide.Left);
  // Pressed together, the skis edge as one platform: the snow's slope across the stance goes to the edges, not the legs.
  const across = (right[0] + left[0]) / 2;
  // Each ski at its baked bend, so the drawn base rests where the physics' boot track has it.
  const rest = ([, , z]: Vec3, curvature: number): SkiRest => skiRest(s, wrapTime(t), [across, z], tip[2] - SKI_MOUNT, SKI_MOUNT - tail[2], curvature);
  const outside = rest(right, pose.outside.bend);
  const inside = rest(left, pose.inside.bend);
  // Both rest when the legs meet the snow; when the inside leg falls short, it rests and the outside floats.
  return { outside, inside, lift: Math.max(outside.base - right[1], inside.base - left[1]) };
};

/** The ride on moguls; off them the skis lie flat on the root's y = 0. */
export const rideOf = (s: Surface, t: number, pose: Pose, skier: ReferenceSkier = REFERENCE_SKIER): Ride => {
  if (s.kind !== SurfaceKind.Moguls) return FLAT_RIDE;
  const { outside, inside, lift } = skiRests(s, t, pose, skiOn(s, skier));
  return {
    outside: outside.pitch,
    inside: inside.pitch,
    outsideBank: outside.roll,
    insideBank: inside.roll,
    insideTip: inside.tip - outside.tip,
    lift,
  };
};
