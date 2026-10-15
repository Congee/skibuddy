import type { MuscleAnchor } from './anchors';
import type { Mat4, Vec3 } from './mat4';
import type { TurnSide } from './slots';

/** A pin's point on the figure and its outward surface normal, in world space. */
export interface AnchorPoint {
  readonly muscle: string;
  readonly side: TurnSide;
  readonly position: Vec3;
  readonly normal: Vec3;
}

/** A projected candidate and how squarely its surface faces the camera (cosine). */
interface Projected {
  readonly anchor: MuscleAnchor;
  readonly facing: number;
}

/** Surfaces this close to edge-on still take a pin. */
const MIN_FACING = -0.1;

const project = (viewProjection: Mat4, eye: Vec3, point: AnchorPoint, width: number, height: number): Projected => {
  const m = viewProjection;
  const [x, y, z] = point.position;
  const cx = (m[0] ?? 0) * x + (m[4] ?? 0) * y + (m[8] ?? 0) * z + (m[12] ?? 0);
  const cy = (m[1] ?? 0) * x + (m[5] ?? 0) * y + (m[9] ?? 0) * z + (m[13] ?? 0);
  const cw = (m[3] ?? 0) * x + (m[7] ?? 0) * y + (m[11] ?? 0) * z + (m[15] ?? 0);
  const ndcX = cx / cw;
  const ndcY = cy / cw;
  const toEye = [eye[0] - x, eye[1] - y, eye[2] - z] as const;
  const length = Math.hypot(toEye[0], toEye[1], toEye[2]) * Math.hypot(point.normal[0], point.normal[1], point.normal[2]);
  const facing = length === 0 ? 1 : (point.normal[0] * toEye[0] + point.normal[1] * toEye[1] + point.normal[2] * toEye[2]) / length;
  const onScreen = cw > 0 && Math.abs(ndcX) <= 1 && Math.abs(ndcY) <= 1;
  return {
    anchor: {
      muscle: point.muscle,
      side: point.side,
      x: ((ndcX + 1) / 2) * width,
      y: ((1 - ndcY) / 2) * height,
      visible: facing > MIN_FACING && onScreen,
    },
    facing: onScreen ? facing : -Infinity,
  };
};

/** Projects one point to CSS px with the origin at the canvas's top-left. */
export const projectAnchor = (viewProjection: Mat4, eye: Vec3, point: AnchorPoint, width: number, height: number): MuscleAnchor =>
  project(viewProjection, eye, point, width, height).anchor;

/**
 * One pin per muscle and side: of that muscle's candidate points, the one that
 * faces the camera most squarely. Nearer body parts that cover it are not tested.
 */
export const bestAnchors = (viewProjection: Mat4, eye: Vec3, points: ReadonlyArray<AnchorPoint>, width: number, height: number): ReadonlyArray<MuscleAnchor> => {
  const best = new Map<string, Projected>();
  for (const point of points) {
    const p = project(viewProjection, eye, point, width, height);
    const key = `${point.muscle}/${point.side}`;
    const current = best.get(key);
    if (current === undefined || p.facing > current.facing) best.set(key, p);
  }
  return [...best.values()].map((p) => p.anchor);
};

const d2 = (a: Vec3, b: Vec3): number => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;

/**
 * Up to `k` well-spread indices into `points`, from the half nearest `centre`,
 * so a muscle has a candidate pin on every side of its middle.
 */
export const spreadCandidates = (points: ReadonlyArray<Vec3>, centre: Vec3, k: number): ReadonlyArray<number> => {
  const byDistance = points.map((p, i) => ({ i, d: d2(p, centre) })).toSorted((a, b) => a.d - b.d);
  const pool = byDistance.slice(0, Math.max(1, Math.ceil(byDistance.length / 2))).map((e) => e.i);
  const first = pool[0];
  if (first === undefined) return [];
  const picked = [first];
  const gap = new Map(pool.map((i) => [i, d2(points[i] ?? centre, points[first] ?? centre)]));
  while (picked.length < k) {
    let next = -1;
    let far = 0;
    for (const [i, d] of gap) {
      if (d > far) {
        far = d;
        next = i;
      }
    }
    if (next < 0) break;
    picked.push(next);
    for (const [i, d] of gap) gap.set(i, Math.min(d, d2(points[i] ?? centre, points[next] ?? centre)));
  }
  return picked;
};

/** True when no pin moved by half a pixel or more and none changed visibility. */
export const sameAnchors = (a: ReadonlyArray<MuscleAnchor>, b: ReadonlyArray<MuscleAnchor>): boolean =>
  a.length === b.length &&
  a.every((p, i) => {
    const q = b[i];
    return q !== undefined && p.muscle === q.muscle && p.side === q.side && p.visible === q.visible && Math.abs(p.x - q.x) < 0.5 && Math.abs(p.y - q.y) < 0.5;
  });
