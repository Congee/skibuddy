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
