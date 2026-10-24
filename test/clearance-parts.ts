import { bootFitFrom } from '../src/viewer/gear-fit';
import { transformPoint } from '../src/viewer/mat4';
import type { Mat4, Vec3 } from '../src/viewer/mat4';
import { bootSegmentsOf } from '../src/viewer/motion/turn';
import { SKELETON_DATA, Side } from '../src/viewer/skeleton';

const BOOT_SEGMENTS = { [Side.Right]: bootSegmentsOf(bootFitFrom(SKELETON_DATA.gear_fit[Side.Right])), [Side.Left]: bootSegmentsOf(bootFitFrom(SKELETON_DATA.gear_fit[Side.Left])) } as const;
// The solver's fitted boot (bootSegmentsOf), sole and cuff capsules per side.
export const bootParts = (m: Mat4, side: Side): ReadonlyArray<readonly [Vec3, Vec3, number]> => {
  const b = BOOT_SEGMENTS[side];
  const on = ([p, q]: readonly [Vec3, Vec3]): readonly [Vec3, Vec3] => [transformPoint(m, p), transformPoint(m, q)];
  return [
    [...on(b.sole), b.soleR],
    [...on(b.cuff), b.cuffR],
  ];
};

const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const clamp = (x: number): number => Math.min(1, Math.max(0, x));
/** Shortest distance between segments ab and cd. */
export const segmentDistance = (a: Vec3, b: Vec3, c: Vec3, d: Vec3): number => {
  const [u, v, w] = [sub(b, a), sub(d, c), sub(a, c)];
  const [uu, uv, vv, uw, vw] = [dot(u, u), dot(u, v), dot(v, v), dot(u, w), dot(v, w)];
  const den = uu * vv - uv * uv;
  let s = den < 1e-12 ? 0 : clamp((uv * vw - vv * uw) / den);
  const t = clamp((uv * s + vw) / vv);
  s = clamp((uv * t - uw) / uu);
  const p = sub([a[0] + u[0] * s, a[1] + u[1] * s, a[2] + u[2] * s], [c[0] + v[0] * t, c[1] + v[1] * t, c[2] + v[2] * t]);
  return Math.hypot(...p);
};
