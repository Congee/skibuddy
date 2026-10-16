import { BodySide } from '../src/viewer/figure';
import type { LegSide } from '../src/viewer/gear';
import { identity, transformPoint } from '../src/viewer/mat4';
import type { Vec3 } from '../src/viewer/mat4';
import { SKI_TAIL, SKI_TIP, centreOfMass, segmentMatrices, skiIndex } from '../src/viewer/pose';
import type { Pose } from '../src/viewer/pose';
import { rideOf } from '../src/viewer/ride';
import type { Ride } from '../src/viewer/ride';
import { underFoot } from '../src/viewer/surface';
import type { Surface } from '../src/viewer/surface';

export const SIDES = [BodySide.Right, BodySide.Left] as const;
export const ALONG = 16;
const SKI_BASE = SKI_TIP[1];

export interface Ridden {
  readonly ride: Ride;
  /** Centre of mass on the field. */
  readonly com: Vec3;
  /** Each ski's base line from tail to tip, on the field. */
  readonly ski: Readonly<Record<LegSide, ReadonlyArray<Vec3>>>;
  /** The snow's support under a point on the field, read on the platform's line between the skis. */
  readonly snow: (p: Vec3) => number;
  /** The snow's support right under a point on the field. */
  readonly ground: (p: Vec3) => number;
  /** Each ski's two edges from tail to tip, on the field. */
  readonly edges: Readonly<Record<LegSide, readonly [ReadonlyArray<Vec3>, ReadonlyArray<Vec3>]>>;
}

/** Half a ski's width at the binding, metres; inferred. */
const HALF_WIDTH = 0.05;

/** One sample of a ridden table: the figure on the field, its skis' base lines and the snow under them. */
export const ridden = (s: Surface, t: number, pose: Pose): Ridden => {
  const ride = rideOf(s, t, pose);
  const world = segmentMatrices({ ...pose, rise: 0 });
  const raised = (p: Vec3): Vec3 => [p[0], p[1] + ride.lift, p[2]];
  const base = (side: BodySide, across = 0): ReadonlyArray<Vec3> => {
    const m = world[skiIndex(side)] ?? identity();
    return Array.from({ length: ALONG + 1 }, (_, i) => {
      const u = i / ALONG;
      return raised(transformPoint(m, [across, SKI_BASE, SKI_TAIL[2] + (SKI_TIP[2] - SKI_TAIL[2]) * u]));
    });
  };
  const edges = (side: BodySide): readonly [ReadonlyArray<Vec3>, ReadonlyArray<Vec3>] => [base(side, -HALF_WIDTH), base(side, HALF_WIDTH)];
  const right = base(BodySide.Right);
  const left = base(BodySide.Left);
  // The skis edge as one platform, so the snow is read on the line between them.
  const across = ((right[ALONG / 2]?.[0] ?? 0) + (left[ALONG / 2]?.[0] ?? 0)) / 2;
  const snow = (p: Vec3): number => underFoot(s, t, [across, p[2]]).support;
  const ground = (p: Vec3): number => underFoot(s, t, [p[0], p[2]]).support;
  return {
    ride,
    com: raised(centreOfMass(world)),
    ski: { [BodySide.Right]: right, [BodySide.Left]: left },
    snow,
    ground,
    edges: { [BodySide.Right]: edges(BodySide.Right), [BodySide.Left]: edges(BodySide.Left) },
  };
};

/** Each ski's lowest point over the snow under it: zero when the rigid ski rests on it. */
export const clearance = (r: Ridden, side: LegSide): number => Math.min(...r.ski[side].map((p) => p[1] - r.snow(p)));
