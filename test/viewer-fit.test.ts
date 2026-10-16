import { assert, describe, it } from '@effect/vitest';
import type { Vec3 } from '../src/viewer/mat4';
import type { Orbit } from '../src/viewer/orbit';
import { FOLLOW_ORBIT, HOME_ORBIT, MIN_DISTANCE, SLOPE_ORBIT, ballsOf, boxIn, cameraAxes, clampDistance, eyeOf, fitFrame, turnAim, zoomAbout } from '../src/viewer/view';
import type { Ball, CameraFrame, Lens, ViewArea } from '../src/viewer/view';

const FOV = (32 * Math.PI) / 180;
const PHONE: Lens = { fov: FOV, aspect: 390 / 640 };
const DESKTOP: Lens = { fov: FOV, aspect: 1400 / 696 };
const IDENTITY = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

const dot = (p: Vec3, q: Vec3): number => p[0] * q[0] + p[1] * q[1] + p[2] * q[2];

/** NDC of `p` and its distance ahead of the camera. */
const project = (frame: CameraFrame, orbit: Orbit, lens: Lens, p: Vec3): { readonly x: number; readonly y: number; readonly depth: number } => {
  const eye = eyeOf(frame, orbit);
  const { right, up } = cameraAxes(orbit);
  const rel: Vec3 = [p[0] - eye[0], p[1] - eye[1], p[2] - eye[2]];
  const forward: Vec3 = [frame.target[0] - eye[0], frame.target[1] - eye[1], frame.target[2] - eye[2]].map((v) => v / frame.distance) as unknown as Vec3;
  const depth = dot(rel, forward);
  const t = Math.tan(lens.fov / 2);
  return { x: dot(rel, right) / depth / (t * lens.aspect), y: dot(rel, up) / depth / t, depth };
};

/** A skier-sized cloud as points: a body column, skis across the view and a pole out to the side. */
const SKIER: ReadonlyArray<Ball> = ballsOf(
  [
    { a: [0.6, 0.9, 0.2], b: [0.3, 1.7, -0.1], radius: 0 },
    { a: [-0.5, 0.1, 0.3], b: [-0.2, 1.1, 0], radius: 0 },
  ],
  [boxIn(IDENTITY, [0.3, 0.02, 0.1], [1.7, 0.04, 0.3])],
);

const extremes = (balls: ReadonlyArray<Ball>, frame: CameraFrame, orbit: Orbit, lens: Lens): ViewArea => {
  let [left, right, bottom, top] = [Infinity, -Infinity, Infinity, -Infinity];
  for (const { center } of balls) {
    const p = project(frame, orbit, lens, center);
    left = Math.min(left, p.x);
    right = Math.max(right, p.x);
    bottom = Math.min(bottom, p.y);
    top = Math.max(top, p.y);
  }
  return { left, right, bottom, top };
};

describe('fitFrame', () => {
  it('keeps every ball in view and touches the tighter axis', () => {
    for (const orbit of [HOME_ORBIT, FOLLOW_ORBIT, SLOPE_ORBIT])
      for (const lens of [PHONE, DESKTOP]) {
        const frame = fitFrame(SKIER, orbit, lens);
        const e = extremes(SKIER, frame, orbit, lens);
        for (const v of [e.left, e.right, e.bottom, e.top]) assert.isAtMost(Math.abs(v), 1 + 1e-9);
        assert.approximately(Math.max(e.right - e.left, e.top - e.bottom), 2, 1e-9);
      }
  });

  it('centres the figure across a narrow phone view', () => {
    const frame = fitFrame(SKIER, HOME_ORBIT, PHONE);
    const e = extremes(SKIER, frame, HOME_ORBIT, PHONE);
    assert.approximately(e.left + e.right, 0, 0.05);
    assert.approximately(e.bottom + e.top, 0, 0.05);
  });

  it('stands farther back for a narrower view', () => {
    assert.isAbove(fitFrame(SKIER, HOME_ORBIT, PHONE).distance, fitFrame(SKIER, HOME_ORBIT, DESKTOP).distance);
  });

  it('keeps balls clear of the edges by their radius', () => {
    const ball: Ball = { center: [0, 1, 0], radius: 0.5 };
    const frame = fitFrame([ball], HOME_ORBIT, DESKTOP);
    // A ball of radius r filling the vertical field: d = r / sin(fov / 2).
    assert.approximately(frame.distance, 0.5 / Math.sin(FOV / 2), 1e-9);
    assert.deepStrictEqual(
      frame.target.map((v) => Math.round(v * 1e9) / 1e9),
      [0, 1, 0],
    );
  });

  it('fits inside a smaller area, away from the overlays', () => {
    const area: ViewArea = { left: -0.9, right: 0.9, bottom: -0.7, top: 0.8 };
    const frame = fitFrame(SKIER, HOME_ORBIT, PHONE, area);
    const e = extremes(SKIER, frame, HOME_ORBIT, PHONE);
    assert.isAtLeast(e.left, area.left - 1e-9);
    assert.isAtMost(e.right, area.right + 1e-9);
    assert.isAtLeast(e.bottom, area.bottom - 1e-9);
    assert.isAtMost(e.top, area.top + 1e-9);
    assert.isAbove(frame.distance, fitFrame(SKIER, HOME_ORBIT, PHONE).distance);
  });

  it('does not move closer than the nearest zoom', () => {
    assert.strictEqual(fitFrame([{ center: [0, 1, 0], radius: 0.01 }], HOME_ORBIT, DESKTOP).distance, MIN_DISTANCE);
  });
});

describe('the fitted home frame', () => {
  const home: CameraFrame = { distance: 7, target: [0.2, 0.9, 0.1] };

  it('lets the zoom go out to it and no farther', () => {
    assert.strictEqual(clampDistance(99, home), 7);
    assert.strictEqual(zoomAbout(home, HOME_ORBIT, [0.3, 0.2], 1.5, PHONE, null, home).distance, 7);
  });

  it('survives a focus turn unchanged', () => {
    assert.deepStrictEqual(turnAim(HOME_ORBIT, home, 2, home).frame, home);
  });
});
