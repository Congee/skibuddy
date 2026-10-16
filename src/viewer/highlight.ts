import { Side } from '../content/schema';
import type { AnchorPoint } from './anchor-projection';
import type { Vec3 } from './mat4';
import { familyOf, isDeep } from './muscle-groups';
import type { SlotTable, TurnSide } from './slots';

/** A muscle singled out from the board: focused (a slat is open) or previewed (hover). */
export interface FigureHighlight {
  readonly muscle: string;
  readonly side: Side;
  readonly focus: boolean;
}

/** How strongly the figure shows each kind; others dim by this much. */
export const FOCUS_STRENGTH = 1;
export const PREVIEW_STRENGTH = 0.45;

export const highlightStrength = (h: FigureHighlight | null): number => (h === null ? 0 : h.focus ? FOCUS_STRENGTH : PREVIEW_STRENGTH);

const sidesOf = (side: Side): ReadonlyArray<TurnSide> => (side === Side.Both ? [Side.Outside, Side.Inside] : [side]);

/** The slots a highlight marks; "both" marks both sides and a parent marks its parts. */
export const highlightSlots = (table: SlotTable, h: FigureHighlight | null): ReadonlyArray<number> =>
  h === null ? [] : sidesOf(h.side).flatMap((s) => table.slotsOf(h.muscle, s));

/** A focus on a deep muscle fades the muscles over it. */
export const revealsDeep = (h: FigureHighlight | null): boolean => h !== null && h.focus && isDeep(h.muscle);

/** Slot writes that turn `prev` marks into `next`: only the slots whose mark changed. */
export const markChanges = (prev: ReadonlyArray<number>, next: ReadonlyArray<number>): ReadonlyArray<readonly [number, 0 | 1]> => [
  ...prev.filter((s) => !next.includes(s)).map((s) => [s, 0] as const),
  ...next.filter((s) => !prev.includes(s)).map((s) => [s, 1] as const),
];

export const pointsFor = (points: ReadonlyArray<AnchorPoint>, h: FigureHighlight): ReadonlyArray<AnchorPoint> => {
  const sides = sidesOf(h.side);
  const family = familyOf(h.muscle);
  return points.filter((p) => family.includes(p.muscle) && sides.includes(p.side));
};

/** A muscle whose mean surface faces the camera at least this squarely (cosine) needs no turn. */
const FACING_OK = 0.35;
/** A mean normal closer to vertical than this gives no useful heading. */
const MIN_LEVEL = 0.3;

const wrapAngle = (a: number): number => Math.atan2(Math.sin(a), Math.cos(a));

/**
 * The camera azimuth (as in orbit.ts: the eye sits toward (sin, cos) of it) that
 * faces the muscle's mean surface normal, by the shortest turn; null when it
 * already faces the camera or points too near straight up or down.
 */
export const turnAzimuth = (points: ReadonlyArray<AnchorPoint>, eye: Vec3, azimuth: number): number | null => {
  if (points.length === 0) return null;
  const n = [0, 0, 0];
  const c = [0, 0, 0];
  for (const p of points) {
    const length = Math.hypot(...p.normal) || 1;
    for (let i = 0; i < 3; i++) {
      n[i] = (n[i] ?? 0) + (p.normal[i] ?? 0) / length;
      c[i] = (c[i] ?? 0) + (p.position[i] ?? 0) / points.length;
    }
  }
  const [nx = 0, ny = 0, nz = 0] = n;
  const [cx = 0, cy = 0, cz = 0] = c;
  const size = Math.hypot(nx, ny, nz);
  if (size === 0) return null;
  const to = [eye[0] - cx, eye[1] - cy, eye[2] - cz] as const;
  const facing = (nx * to[0] + ny * to[1] + nz * to[2]) / (size * (Math.hypot(...to) || 1));
  if (facing >= FACING_OK || Math.hypot(nx, nz) < MIN_LEVEL * size) return null;
  return azimuth + wrapAngle(Math.atan2(nx, nz) - azimuth);
};

/** A limb or the trunk as a capsule in world space: axis from `a` to `b`. */
export interface Occluder {
  readonly a: Vec3;
  readonly b: Vec3;
  readonly radius: number;
}

const sub = (p: Vec3, q: Vec3): Vec3 => [p[0] - q[0], p[1] - q[1], p[2] - q[2]];
const dot = (p: Vec3, q: Vec3): number => p[0] * q[0] + p[1] * q[1] + p[2] * q[2];
const clamp01 = (x: number): number => Math.min(1, Math.max(0, x));

/** Closest distance between segments p0-p1 and q0-q1. */
export const segmentDistance = (p0: Vec3, p1: Vec3, q0: Vec3, q1: Vec3): number => {
  const d1 = sub(p1, p0);
  const d2 = sub(q1, q0);
  const r = sub(p0, q0);
  const a = dot(d1, d1);
  const e = dot(d2, d2);
  const f = dot(d2, r);
  const c = dot(d1, r);
  const b = dot(d1, d2);
  const denom = a * e - b * b;
  let s = a < 1e-12 ? 0 : denom > 1e-12 ? clamp01((b * f - c * e) / denom) : 0;
  let t = e < 1e-12 ? 0 : (b * s + f) / e;
  if (t < 0 || t > 1) {
    t = clamp01(t);
    s = a < 1e-12 ? 0 : clamp01((b * t - c) / a);
  }
  const x = sub([p0[0] + d1[0] * s, p0[1] + d1[1] * s, p0[2] + d1[2] * s], [q0[0] + d2[0] * t, q0[1] + d2[1] * t, q0[2] + d2[2] * t]);
  return Math.hypot(...x);
};

/** A point this close to a capsule's surface lies on that limb, which never hides it. */
const OWN_LIMB = 0.03;

/** Share of the points that face `eye` with no other limb between them and it. */
export const visibleShare = (points: ReadonlyArray<AnchorPoint>, eye: Vec3, occluders: ReadonlyArray<Occluder>): number => {
  if (points.length === 0) return 0;
  const seen = points.filter((p) => {
    if (dot(p.normal, sub(eye, p.position)) <= 0) return false;
    return occluders.every((o) => segmentDistance(p.position, p.position, o.a, o.b) < o.radius + OWN_LIMB || segmentDistance(p.position, eye, o.a, o.b) >= o.radius);
  });
  return seen.length / points.length;
};

/** Enough of the muscle shows from a view when this share of its pins can be seen. */
const SEEN_OK = 0.5;
/** Views tried round the figure. */
const VIEWS = 24;

export interface View {
  /** Camera azimuth to turn to; null keeps the current one. */
  readonly azimuth: number | null;
  /** The muscle shows from there; false asks for the deep-reveal fade instead. */
  readonly seen: boolean;
}

/**
 * The nearest camera azimuth from which the muscle faces the camera with no other limb in
 * front of it; `eyeAt` places the eye for an azimuth. When no view shows it, the best one
 * and `seen: false`, so the figure fades the muscles over it.
 */
export const chooseView = (points: ReadonlyArray<AnchorPoint>, eyeAt: (azimuth: number) => Vec3, occluders: ReadonlyArray<Occluder>, azimuth: number): View => {
  if (points.length === 0) return { azimuth: null, seen: true };
  const shows = (a: number): number => {
    const eye = eyeAt(a);
    return turnAzimuth(points, eye, a) === null ? visibleShare(points, eye, occluders) : 0;
  };
  if (shows(azimuth) >= SEEN_OK) return { azimuth: null, seen: true };
  const facing = turnAzimuth(points, eyeAt(azimuth), azimuth);
  const candidates = [
    ...(facing === null ? [] : [facing]),
    ...Array.from({ length: VIEWS }, (_, k) => azimuth + wrapAngle((2 * Math.PI * k) / VIEWS)),
  ];
  const scored = candidates.map((a) => ({ a, share: shows(a), turn: Math.abs(wrapAngle(a - azimuth)) }));
  const ok = scored.filter((c) => c.share >= SEEN_OK).toSorted((x, y) => x.turn - y.turn)[0];
  if (ok !== undefined) return { azimuth: ok.a, seen: true };
  const best = scored.toSorted((x, y) => y.share - x.share || x.turn - y.turn)[0];
  return { azimuth: best === undefined || best.share === 0 ? facing : best.a, seen: false };
};
