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
/** Downhill of the skier, high enough to read the snow marks, looking up the fall line. */
export const SLOPE_ORBIT: Orbit = { azimuth: 0, elevation: 0.4 };
/** About a forearm filling the view at the camera's 32° field. */
export const MIN_DISTANCE = 0.55;
export const MAX_DISTANCE = HOME_FRAME.distance;
/** The orbit point stays inside the figure's box, so some of the figure is always in view. */
export const PAN_MIN: Vec3 = [-0.55, 0.1, -0.8];
export const PAN_MAX: Vec3 = [0.55, 1.65, 0.8];
/** Metres; closer than this the frame snaps and stops. */
const SETTLED = 1e-4;

/** The farthest out is the home frame's distance, which a fit sets. */
export const clampDistance = (d: number, home: CameraFrame = HOME_FRAME): number => Math.min(Math.max(home.distance, MIN_DISTANCE), Math.max(MIN_DISTANCE, d));

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

const vec = (f: (i: 0 | 1 | 2) => number): Vec3 => [f(0), f(1), f(2)];

/** The pan box grows from the home point as the camera closes in, reaching full size halfway in. */
export const clampTarget = (target: Vec3, distance: number, home: CameraFrame = HOME_FRAME): Vec3 => {
  const far = Math.max(home.distance, MIN_DISTANCE + 1e-6);
  const reach = clamp((2 * (far - distance)) / (far - MIN_DISTANCE), 0, 1);
  const at = home.target;
  const mix = (a: number, b: number): number => a * (1 - reach) + b * reach;
  return vec((i) => clamp(target[i], mix(at[i], Math.min(PAN_MIN[i], at[i])), mix(at[i], Math.max(PAN_MAX[i], at[i]))));
};

/** A frame inside the clamps; a focus turn keeps the zoom and pan through this. */
export const clampFrame = (frame: CameraFrame, home: CameraFrame = HOME_FRAME): CameraFrame => {
  const distance = clampDistance(frame.distance, home);
  const target = clampTarget(frame.target, distance, home);
  return distance === frame.distance && target.every((v, i) => v === frame.target[i]) ? frame : { distance, target };
};

/** The aim of a focus turn: only the azimuth changes. */
export const turnAim = (aim: Orbit, frame: CameraFrame, azimuth: number, home: CameraFrame = HOME_FRAME): { readonly orbit: Orbit; readonly frame: CameraFrame } => ({
  orbit: { azimuth, elevation: aim.elevation },
  frame: clampFrame(frame, home),
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

/** Gear a zoom stops short of, as the body's capsules. */
export interface GearStops {
  readonly capsules: ReadonlyArray<Capsule>;
  readonly boxes: ReadonlyArray<Box>;
}

/** A rigid part such as a ski or boot as a box: one corner and its three edges from it, at right angles. */
export interface Box {
  readonly corner: Vec3;
  readonly edges: readonly [Vec3, Vec3, Vec3];
}

/** The box `size` about `center` in the frame of the column-major 4x4 `m`. */
export const boxIn = (m: ArrayLike<number>, center: Vec3, size: Vec3): Box => {
  const at = (p: Vec3): Vec3 => vec((i) => (m[i] ?? 0) * p[0] + (m[4 + i] ?? 0) * p[1] + (m[8 + i] ?? 0) * p[2] + (m[12 + i] ?? 0));
  const axis = (k: 0 | 1 | 2): Vec3 => vec((i) => (m[4 * k + i] ?? 0) * size[k]);
  return { corner: at(vec((i) => center[i] - size[i] / 2)), edges: [axis(0), axis(1), axis(2)] };
};

/** The least box along the unit, perpendicular `axes` round `points`. */
export const boxRound = (points: ReadonlyArray<Vec3>, axes: readonly [Vec3, Vec3, Vec3]): Box | null => {
  if (points.length === 0) return null;
  const lo = [Infinity, Infinity, Infinity];
  const hi = [-Infinity, -Infinity, -Infinity];
  for (const p of points)
    axes.forEach((a, k) => {
      const d = dot(p, a);
      lo[k] = Math.min(lo[k] ?? d, d);
      hi[k] = Math.max(hi[k] ?? d, d);
    });
  const span = (k: 0 | 1 | 2): Vec3 => vec((i) => axes[k][i] * ((hi[k] ?? 0) - (lo[k] ?? 0)));
  return { corner: vec((i) => axes.reduce((s, a, k) => s + a[i] * (lo[k] ?? 0), 0)), edges: [span(0), span(1), span(2)] };
};

/** Where the ray `eye + ray t` (t >= 0) first meets a capsule; null for a miss. */
const capsuleDepth = (eye: Vec3, ray: Vec3, { a, b, radius }: Capsule): number | null => {
  // Closest approach of the ray (t >= 0) and the segment (0..1), then back off by the radius.
  const rr = dot(ray, ray);
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
  if (gap > radius) return null;
  return Math.max(0, t - Math.sqrt((radius * radius - gap * gap) / rr));
};

/** Where the ray first meets a box, by its slabs; null for a miss. */
const boxDepth = (eye: Vec3, ray: Vec3, { corner, edges }: Box): number | null => {
  let near = 0;
  let far = Infinity;
  const w = vec((i) => eye[i] - corner[i]);
  for (const e of edges) {
    const ee = dot(e, e);
    if (ee < 1e-12) return null;
    // The eye's and the ray's place across this slab, 0..1 inside.
    const at = dot(w, e) / ee;
    const step = dot(ray, e) / ee;
    if (Math.abs(step) < 1e-12) {
      if (at < 0 || at > 1) return null;
      continue;
    }
    const t0 = -at / step;
    const t1 = (1 - at) / step;
    near = Math.max(near, Math.min(t0, t1));
    far = Math.min(far, Math.max(t0, t1));
    if (near > far) return null;
  }
  return near;
};

/** The snow's height at a point in world space, metres. */
export type Ground = (x: number, z: number) => number;

/** Forward steps a ray marches over the snow, and how far. */
const GROUND_STEP = 0.05;
const GROUND_REACH = 12;

/** Where the ray first dips under the snow, by marching then bisecting; null for a miss or an eye already under it. */
const groundDepth = (eye: Vec3, ray: Vec3, ground: Ground): number | null => {
  const above = (t: number): number => eye[1] + ray[1] * t - ground(eye[0] + ray[0] * t, eye[2] + ray[2] * t);
  if (above(0) < 0) return null;
  for (let t = GROUND_STEP; t <= GROUND_REACH; t += GROUND_STEP) {
    if (above(t) >= 0) continue;
    let lo = t - GROUND_STEP;
    let hi = t;
    for (let k = 0; k < 16; k++) {
      const mid = (lo + hi) / 2;
      if (above(mid) >= 0) lo = mid;
      else hi = mid;
    }
    return lo;
  }
  return null;
};

/** How far ahead of the camera, along its forward axis, the ray through `ndc` meets the first capsule, box or the snow; null for none. */
export const surfaceDepth = (
  frame: CameraFrame,
  orbit: Orbit,
  ndc: readonly [number, number],
  lens: Lens,
  capsules: ReadonlyArray<Capsule>,
  boxes: ReadonlyArray<Box> = [],
  ground: Ground | null = null,
): number | null => {
  const eye = eyeOf(frame, orbit);
  const ray = rayOf(orbit, ndc, lens);
  let best: number | null = null;
  const snow = ground === null ? [] : [groundDepth(eye, ray, ground)];
  for (const depth of [...capsules.map((c) => capsuleDepth(eye, ray, c)), ...boxes.map((b) => boxDepth(eye, ray, b)), ...snow])
    if (depth !== null && (best === null || depth < best)) best = depth;
  return best;
};

/** Metres the camera keeps above the snow, well past the near plane. */
export const SNOW_CLEARANCE = 0.08;

const FLAT: Ground = () => 0;
/** Raising the camera moves it over other snow; a few rounds settle it over the bumps. */
const CLEAR_ROUNDS = 6;

/** The orbit raised just enough that the camera stays SNOW_CLEARANCE above the snow under it; `orbit` itself when it already does. */
export const clearSnow = (frame: CameraFrame, orbit: Orbit, ground: Ground = FLAT): Orbit => {
  const { distance, target } = frame;
  let elevation = orbit.elevation;
  for (let k = 0; k < CLEAR_ROUNDS; k++) {
    const [x, y, z] = eyeOf(frame, { azimuth: orbit.azimuth, elevation });
    const floor = ground(x, z) + SNOW_CLEARANCE;
    if (y >= floor - 1e-9) break;
    elevation = Math.max(elevation, Math.asin(clamp((floor - target[1]) / distance, -1, 1)));
  }
  return elevation === orbit.elevation ? orbit : { azimuth: orbit.azimuth, elevation };
};

/**
 * Scales the distance by `ratio` about the point under `ndc` (-1..1, y up) on the
 * target's plane, so that point stays put on screen until a clamp stops it.
 * The camera moves along that ray, so with `surface` (the depth of the body under
 * the cursor, as surfaceDepth) it stops MIN_DISTANCE short of it instead of flying through.
 */
export const zoomAbout = (
  frame: CameraFrame,
  orbit: Orbit,
  ndc: readonly [number, number],
  ratio: number,
  lens: Lens,
  surface: number | null = null,
  home: CameraFrame = HOME_FRAME,
): CameraFrame => {
  const wanted = frame.distance * ratio;
  const floor = surface === null ? MIN_DISTANCE : frame.distance - (surface - MIN_DISTANCE);
  const distance = clampDistance(ratio < 1 ? Math.max(wanted, Math.min(frame.distance, floor)) : wanted, home);
  const k = distance / frame.distance;
  const hh = frame.distance * Math.tan(lens.fov / 2);
  const target = shift(frame.target, orbit, ndc[0] * hh * lens.aspect * (1 - k), ndc[1] * hh * (1 - k));
  return { distance, target: clampTarget(target, distance, home) };
};

/** Moves the target so the scene follows a drag of `dx`, `dy` CSS px on a view `height` px tall. */
export const panBy = (frame: CameraFrame, orbit: Orbit, dx: number, dy: number, height: number, lens: Lens, home: CameraFrame = HOME_FRAME): CameraFrame => {
  if (height <= 0) return frame;
  const perPx = (2 * frame.distance * Math.tan(lens.fov / 2)) / height;
  return { distance: frame.distance, target: clampTarget(shift(frame.target, orbit, -dx * perPx, dy * perPx), frame.distance, home) };
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

/** A ball the figure fills part of; capsules are two, boxes eight of radius 0. */
export interface Ball {
  readonly center: Vec3;
  readonly radius: number;
}

/** The balls that hold a capsule and a box: a capsule is the hull of its two end balls. */
export const ballsOf = (capsules: ReadonlyArray<Capsule>, boxes: ReadonlyArray<Box>): ReadonlyArray<Ball> => [
  ...capsules.flatMap(({ a, b, radius }) => [
    { center: a, radius },
    { center: b, radius },
  ]),
  ...boxes.flatMap(({ corner, edges: [u, v, w] }) =>
    [0, 1].flatMap((i) => [0, 1].flatMap((j) => [0, 1].map((k) => ({ center: vec((n) => corner[n] + u[n] * i + v[n] * j + w[n] * k), radius: 0 })))),
  ),
];

/** The usable part of the view in NDC, -1..1 on each axis, y up: what the overlays leave free. */
export interface ViewArea {
  readonly left: number;
  readonly right: number;
  readonly bottom: number;
  readonly top: number;
}

export const FULL_VIEW: ViewArea = { left: -1, right: 1, bottom: -1, top: 1 };

/**
 * The nearest frame from `orbit` that shows every ball inside `area`, centred in it along the
 * axis with room to spare. Each frustum side is a plane through the eye, so the fit is closed form.
 */
export const fitFrame = (balls: ReadonlyArray<Ball>, orbit: Orbit, lens: Lens, area: ViewArea = FULL_VIEW): CameraFrame => {
  if (balls.length === 0) return HOME_FRAME;
  const { right, up } = cameraAxes(orbit);
  const ce = Math.cos(orbit.elevation);
  const back: Vec3 = [ce * Math.sin(orbit.azimuth), Math.sin(orbit.elevation), ce * Math.cos(orbit.azimuth)];
  const origin = vec((i) => balls.reduce((s, b) => s + b.center[i], 0) / balls.length);
  const tv = Math.tan(lens.fov / 2);
  const th = tv * lens.aspect;
  // Per axis: how far the ball pushes each side's plane, as `offset + slope * d` of the eye's distance d.
  const axis = (dir: Vec3, t: number, lo: number, hi: number): { readonly need: number; readonly span: readonly [number, number] } => {
    const aHi = hi * t;
    const aLo = -lo * t;
    let pushHi = -Infinity;
    let pushLo = -Infinity;
    for (const { center, radius } of balls) {
      const rel = vec((i) => center[i] - origin[i]);
      const x = dot(rel, dir);
      const z = dot(rel, back);
      pushHi = Math.max(pushHi, x + aHi * z + radius * Math.hypot(1, aHi));
      pushLo = Math.max(pushLo, -x + aLo * z + radius * Math.hypot(1, aLo));
    }
    return { need: (pushHi + pushLo) / Math.max(1e-9, aHi + aLo), span: [pushHi, pushLo] };
  };
  const across = axis(right, th, area.left, area.right);
  const tall = axis(up, tv, area.bottom, area.top);
  const distance = Math.max(across.need, tall.need, MIN_DISTANCE);
  // The target's offset along the axis: the middle of what keeps both sides in.
  const centre = (span: readonly [number, number], t: number, lo: number, hi: number): number => (span[0] - hi * t * distance + (-lo * t * distance - span[1])) / 2;
  const cx = centre(across.span, th, area.left, area.right);
  const cy = centre(tall.span, tv, area.bottom, area.top);
  return { distance, target: vec((i) => origin[i] + right[i] * cx + up[i] * cy) };
};
