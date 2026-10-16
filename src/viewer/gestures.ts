/** CSS px a pointer may travel and still tap. */
export const TAP_SLOP = 8;
/** A second tap this soon and this near makes a double tap. */
export const DOUBLE_TAP_MS = 320;
export const DOUBLE_TAP_SLOP = 30;

export interface Point {
  readonly x: number;
  readonly y: number;
}

export interface TapAt extends Point {
  readonly at: number;
}

/** One pointer that went down and up without travelling, and no pinch in the gesture. */
export const isTap = (travel: number, pinched: boolean): boolean => !pinched && travel < TAP_SLOP;

export const isDoubleTap = (previous: TapAt | null, next: TapAt): boolean =>
  previous !== null && next.at - previous.at <= DOUBLE_TAP_MS && Math.hypot(next.x - previous.x, next.y - previous.y) <= DOUBLE_TAP_SLOP;

export const span = (a: Point, b: Point): number => Math.hypot(a.x - b.x, a.y - b.y);

export const midpoint = (a: Point, b: Point): Point => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

/** Fingers closer than this in CSS px give no usable ratio, such as a stale second pointer. */
export const MIN_PINCH_SPAN = 24;
/** One move zooms at most this far either way. */
const MAX_PINCH_STEP = 1.5;

/** The camera distance multiplier for fingers moving from `before` to `after` apart: spreading moves closer. */
export const pinchRatio = (before: number, after: number): number =>
  before < MIN_PINCH_SPAN || after < MIN_PINCH_SPAN ? 1 : Math.min(MAX_PINCH_STEP, Math.max(1 / MAX_PINCH_STEP, before / after));

/** WheelEvent.deltaMode lines and pages, in px. */
const LINE = 16;
const PAGE = 800;
/** Per px of wheel; a trackpad pinch (ctrlKey) sends small deltas, so it zooms faster per px. */
const WHEEL_RATE = 0.0015;
const PINCH_RATE = 0.01;

/** The camera distance multiplier for one wheel event. */
export const wheelRatio = (deltaY: number, deltaMode: number, ctrlKey: boolean): number => {
  const px = deltaY * (deltaMode === 1 ? LINE : deltaMode === 2 ? PAGE : 1);
  return Math.exp(Math.max(-1, Math.min(1, px * (ctrlKey ? PINCH_RATE : WHEEL_RATE))));
};

/** A point in CSS px on a `width` by `height` canvas, as -1..1 with y up. */
export const toNdc = (p: Point, width: number, height: number): readonly [number, number] =>
  width <= 0 || height <= 0 ? [0, 0] : [(p.x / width) * 2 - 1, 1 - (p.y / height) * 2];
