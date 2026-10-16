import type { Vec3 } from './mat4';
import { dampStep } from './orbit';
import type { Orbit } from './orbit';

/** How far the camera sits from the point it orbits, and that point. */
export interface CameraFrame {
  readonly distance: number;
  readonly target: Vec3;
}

/** The whole figure in view. */
export const HOME_FRAME: CameraFrame = { distance: 4.2, target: [0, 0.7, 0] };
export const HOME_ORBIT: Orbit = { azimuth: 0.7, elevation: 0.25 };
/** A follow-cam: behind the skier and a little above, looking down the fall line. */
export const FOLLOW_ORBIT: Orbit = { azimuth: Math.PI, elevation: 0.3 };
/** Downhill of the skier, low, looking up the fall line. */
export const SLOPE_ORBIT: Orbit = { azimuth: 0, elevation: 0.12 };
/** About a forearm filling the view at the camera's 32° field. */
export const MIN_DISTANCE = 0.55;
export const MAX_DISTANCE = HOME_FRAME.distance;
/** The orbit point stays inside the figure's box, so some of the figure is always in view. */
export const PAN_MIN: Vec3 = [-0.55, 0.1, -0.8];
export const PAN_MAX: Vec3 = [0.55, 1.65, 0.8];
/** Metres; closer than this the frame snaps and stops. */
const SETTLED = 1e-4;

export const clampDistance = (d: number): number => Math.min(MAX_DISTANCE, Math.max(MIN_DISTANCE, d));

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

const vec = (f: (i: 0 | 1 | 2) => number): Vec3 => [f(0), f(1), f(2)];

/** The pan box grows from the home point as the camera closes in, reaching full size halfway in. */
export const clampTarget = (target: Vec3, distance: number): Vec3 => {
  const reach = clamp((2 * (MAX_DISTANCE - distance)) / (MAX_DISTANCE - MIN_DISTANCE), 0, 1);
  const home = HOME_FRAME.target;
  const mix = (a: number, b: number): number => a * (1 - reach) + b * reach;
  return vec((i) => clamp(target[i], mix(home[i], PAN_MIN[i]), mix(home[i], PAN_MAX[i])));
};

/** A frame inside the clamps; a focus turn keeps the zoom and pan through this. */
export const clampFrame = (frame: CameraFrame): CameraFrame => {
  const distance = clampDistance(frame.distance);
  const target = clampTarget(frame.target, distance);
  return distance === frame.distance && target.every((v, i) => v === frame.target[i]) ? frame : { distance, target };
};

/** The aim of a focus turn: only the azimuth changes. */
export const turnAim = (aim: Orbit, frame: CameraFrame, azimuth: number): { readonly orbit: Orbit; readonly frame: CameraFrame } => ({
  orbit: { azimuth, elevation: aim.elevation },
  frame: clampFrame(frame),
});

/** The camera's right and up axes when it looks at the target from `orbit` (as in scene.ts). */
export const cameraAxes = (orbit: Orbit): { readonly right: Vec3; readonly up: Vec3 } => {
  const sa = Math.sin(orbit.azimuth);
  const ca = Math.cos(orbit.azimuth);
  const se = Math.sin(orbit.elevation);
  const ce = Math.cos(orbit.elevation);
  return { right: [ca, 0, -sa], up: [-se * sa, ce, -se * ca] };
};

export interface Lens {
  /** Vertical field of view in radians. */
  readonly fov: number;
  /** Width over height. */
  readonly aspect: number;
}

const shift = (target: Vec3, orbit: Orbit, dx: number, dy: number): Vec3 => {
  const { right, up } = cameraAxes(orbit);
  return vec((i) => target[i] + right[i] * dx + up[i] * dy);
};

/** The camera's position for `frame` seen from `orbit` (as in scene.ts). */
export const eyeOf = (frame: CameraFrame, orbit: Orbit): Vec3 => {
  const { distance, target } = frame;
  const r = distance * Math.cos(orbit.elevation);
  return [target[0] + r * Math.sin(orbit.azimuth), target[1] + distance * Math.sin(orbit.elevation), target[2] + r * Math.cos(orbit.azimuth)];
};

/** The view ray through `ndc`, not unit length: its forward part is 1. */
const rayOf = (orbit: Orbit, ndc: readonly [number, number], lens: Lens): Vec3 => {
  const { right, up } = cameraAxes(orbit);
  const t = Math.tan(lens.fov / 2);
  const ce = Math.cos(orbit.elevation);
  const back: Vec3 = [ce * Math.sin(orbit.azimuth), Math.sin(orbit.elevation), ce * Math.cos(orbit.azimuth)];
  return vec((i) => -back[i] + right[i] * ndc[0] * t * lens.aspect + up[i] * ndc[1] * t);
};

const dot = (p: Vec3, q: Vec3): number => p[0] * q[0] + p[1] * q[1] + p[2] * q[2];

/** A body part as a capsule round the segment a..b. */
export interface Capsule {
  readonly a: Vec3;
  readonly b: Vec3;
  readonly radius: number;
}

/** How far ahead of the camera, along its forward axis, the ray through `ndc` meets the first capsule; null for none. */
export const surfaceDepth = (frame: CameraFrame, orbit: Orbit, ndc: readonly [number, number], lens: Lens, capsules: ReadonlyArray<Capsule>): number | null => {
  const eye = eyeOf(frame, orbit);
  const ray = rayOf(orbit, ndc, lens);
  const rr = dot(ray, ray);
  let best: number | null = null;
  for (const { a, b, radius } of capsules) {
    // Closest approach of the ray (t >= 0) and the segment (0..1), then back off by the radius.
    const v = vec((i) => b[i] - a[i]);
    const w = vec((i) => eye[i] - a[i]);
    const rv = dot(ray, v);
    const vv = dot(v, v);
    const rw = dot(ray, w);
    const vw = dot(v, w);
    const det = rr * vv - rv * rv;
    let s = det > 1e-9 ? clamp((rr * vw - rv * rw) / det, 0, 1) : 0;
    const t = Math.max(0, (s * rv - rw) / rr);
    s = vv > 1e-9 ? clamp((t * rv + vw) / vv, 0, 1) : 0;
    const gap = Math.hypot(...vec((i) => w[i] + ray[i] * t - v[i] * s));
    if (gap > radius) continue;
    const depth = Math.max(0, t - Math.sqrt((radius * radius - gap * gap) / rr));
    if (best === null || depth < best) best = depth;
  }
  return best;
};

/**
 * Scales the distance by `ratio` about the point under `ndc` (-1..1, y up) on the
 * target's plane, so that point stays put on screen until a clamp stops it.
 * The camera moves along that ray, so with `surface` (the depth of the body under
 * the cursor, as surfaceDepth) it stops MIN_DISTANCE short of it instead of flying through.
 */
export const zoomAbout = (frame: CameraFrame, orbit: Orbit, ndc: readonly [number, number], ratio: number, lens: Lens, surface: number | null = null): CameraFrame => {
  const wanted = frame.distance * ratio;
  const floor = surface === null ? MIN_DISTANCE : frame.distance - (surface - MIN_DISTANCE);
  const distance = clampDistance(ratio < 1 ? Math.max(wanted, Math.min(frame.distance, floor)) : wanted);
  const k = distance / frame.distance;
  const hh = frame.distance * Math.tan(lens.fov / 2);
  const target = shift(frame.target, orbit, ndc[0] * hh * lens.aspect * (1 - k), ndc[1] * hh * (1 - k));
  return { distance, target: clampTarget(target, distance) };
};

/** Moves the target so the scene follows a drag of `dx`, `dy` CSS px on a view `height` px tall. */
export const panBy = (frame: CameraFrame, orbit: Orbit, dx: number, dy: number, height: number, lens: Lens): CameraFrame => {
  if (height <= 0) return frame;
  const perPx = (2 * frame.distance * Math.tan(lens.fov / 2)) / height;
  return { distance: frame.distance, target: clampTarget(shift(frame.target, orbit, -dx * perPx, dy * perPx), frame.distance) };
};

/** Eases `current` toward `aim` like dampOrbit. */
export const dampFrame = (
  current: CameraFrame,
  aim: CameraFrame,
  seconds: number,
  damping: number,
): { readonly frame: CameraFrame; readonly settled: boolean } => {
  const k = dampStep(seconds, damping);
  const distance = current.distance + (aim.distance - current.distance) * k;
  const target = vec((i) => current.target[i] + (aim.target[i] - current.target[i]) * k);
  const settled = Math.abs(aim.distance - distance) < SETTLED && [0, 1, 2].every((i) => Math.abs((aim.target[i] ?? 0) - (target[i] ?? 0)) < SETTLED);
  return { frame: settled ? aim : { distance, target }, settled };
};
