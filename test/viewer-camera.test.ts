import { assert, describe, it } from '@effect/vitest';
import type { Vec3 } from '../src/viewer/mat4';
import type { Orbit } from '../src/viewer/orbit';
import {
  FOLLOW_ORBIT,
  HOME_FRAME,
  MIN_DISTANCE,
  SLOPE_ORBIT,
  SNOW_CLEARANCE,
  boxIn,
  boxRound,
  clearSnow,
  eyeOf,
  surfaceDepth,
  zoomAbout,
} from '../src/viewer/view';
import type { Box, CameraFrame, Lens } from '../src/viewer/view';

const LENS: Lens = { fov: (32 * Math.PI) / 180, aspect: 1.5 };
const IDENTITY = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
/** A ski on the snow along z, 9 cm wide, 2 cm thick, 1.6 m long. */
const SKI = boxIn(IDENTITY, [0, 0.01, 0], [0.09, 0.02, 1.6]);

describe('clearSnow', () => {
  it('keeps an orbit that clears the snow', () => {
    const orbit: Orbit = { azimuth: 0.4, elevation: 0.2 };
    assert.strictEqual(clearSnow(HOME_FRAME, orbit), orbit);
  });

  it('raises a low orbit just to the clearance', () => {
    const frame: CameraFrame = { distance: 2.4, target: [0, 0.1, 0] };
    const raised = clearSnow(frame, { azimuth: 1, elevation: -0.1 });
    assert.strictEqual(raised.azimuth, 1);
    assert.closeTo(eyeOf(frame, raised)[1], SNOW_CLEARANCE, 1e-9);
    // Clamped once, it stays put, so the eased camera settles.
    assert.strictEqual(clearSnow(frame, raised), raised);
  });

  it('keeps every lock’s home orbit and every low zoom above the snow', () => {
    for (const orbit of [FOLLOW_ORBIT, SLOPE_ORBIT, { azimuth: 2, elevation: -0.1 }])
      for (const distance of [MIN_DISTANCE, 1, 2.4, HOME_FRAME.distance])
        for (const y of [0.1, 0.4, 1.65]) {
          const frame: CameraFrame = { distance, target: [0.3, y, -0.2] };
          assert.isAtLeast(eyeOf(frame, clearSnow(frame, orbit))[1], SNOW_CLEARANCE - 1e-9);
        }
  });
});

describe('boxes', () => {
  it('places a box in a frame', () => {
    // Turned a quarter about y and moved 1 m along x.
    const m = [0, 0, -1, 0, 0, 1, 0, 0, 1, 0, 0, 0, 1, 0, 0, 1];
    const box = boxIn(m, [0, 0, 0], [2, 1, 4]);
    assert.deepStrictEqual(box.corner.map((v) => Math.round(v * 1e9) / 1e9), [-1, -0.5, 1]);
    assert.deepStrictEqual(box.edges[0], [0, 0, -2]);
    assert.deepStrictEqual(box.edges[2], [4, 0, 0]);
  });

  it('fits a box round points along its axes', () => {
    const points: ReadonlyArray<Vec3> = [
      [0.045, 0, 0.8],
      [-0.045, -0.02, -0.8],
      [0, -0.01, 0.2],
    ];
    const box = boxRound(points, [
      [1, 0, 0],
      [0, 1, 0],
      [0, 0, 1],
    ]);
    assert.isNotNull(box);
    assert.deepStrictEqual(box?.corner, [-0.045, -0.02, -0.8]);
    assert.closeTo(box?.edges[2][2] ?? 0, 1.6, 1e-12);
    assert.isNull(boxRound([], [[1, 0, 0], [0, 1, 0], [0, 0, 1]]));
  });

  it('finds the ski under the cursor and its top surface', () => {
    // Straight down onto the ski from 1 m above its top.
    const frame: CameraFrame = { distance: 1, target: [0, 0.02, 0] };
    const orbit: Orbit = { azimuth: 0, elevation: Math.PI / 2 - 1e-6 };
    assert.closeTo(surfaceDepth(frame, orbit, [0, 0], LENS, [], [SKI]) ?? -1, 1, 1e-4);
    // Off to the side, the ray misses it.
    assert.isNull(surfaceDepth({ distance: 1, target: [0.5, 0.02, 0] }, orbit, [0, 0], LENS, [], [SKI]));
  });

  it('misses a box behind the camera', () => {
    const frame: CameraFrame = { distance: 1, target: [0, 0.01, -3] };
    assert.isNull(surfaceDepth(frame, { azimuth: 0, elevation: 0 }, [0, 0], LENS, [], [SKI]));
  });

  it('takes the nearer of a capsule and a box', () => {
    const frame: CameraFrame = { distance: 3, target: [0, 0.01, 0] };
    const orbit: Orbit = { azimuth: 0, elevation: 0 };
    const pole = { a: [0, 0.01, 1.5] as const, b: [0, 1, 1.5] as const, radius: 0.02 };
    // The camera at z = 3 looks down -z: the ski's tip is at 2.2 m, the pole at 1.48 m.
    assert.closeTo(surfaceDepth(frame, orbit, [0, 0], LENS, [], [SKI]) ?? -1, 2.2, 1e-9);
    assert.closeTo(surfaceDepth(frame, orbit, [0, 0], LENS, [pole], [SKI]) ?? -1, 1.48, 1e-9);
  });

  it('stops a zoom toward a lifted ski short of it', () => {
    // An inside ski held up at knee height, its tip under the cursor.
    const lifted = boxIn(IDENTITY, [0, 0.6, 0.3], [0.09, 0.02, 1.6]);
    const orbit: Orbit = { azimuth: 0.3, elevation: 0.5 };
    const start: CameraFrame = { distance: 2.4, target: [0, 0.6, 0] };
    const tip: Vec3 = [0, 0.61, 0.9];
    const eye = eyeOf(start, orbit);
    const toTip = tip.map((v, i) => v - (eye[i] ?? 0));
    const back = [Math.cos(orbit.elevation) * Math.sin(orbit.azimuth), Math.sin(orbit.elevation), Math.cos(orbit.elevation) * Math.cos(orbit.azimuth)];
    const right = [Math.cos(orbit.azimuth), 0, -Math.sin(orbit.azimuth)];
    const up = [-Math.sin(orbit.elevation) * Math.sin(orbit.azimuth), Math.cos(orbit.elevation), -Math.sin(orbit.elevation) * Math.cos(orbit.azimuth)];
    const along = (axis: ReadonlyArray<number>): number => toTip.reduce((s, v, i) => s + v * (axis[i] ?? 0), 0);
    const t = Math.tan(LENS.fov / 2);
    const ndc: readonly [number, number] = [along(right) / -along(back) / t / LENS.aspect, along(up) / -along(back) / t];
    const zoom = (stops: ReadonlyArray<Box>): number | null => {
      let frame = start;
      for (let i = 0; i < 30; i++) frame = zoomAbout(frame, orbit, ndc, 0.8, LENS, surfaceDepth(frame, orbit, ndc, LENS, [], stops));
      return surfaceDepth(frame, orbit, ndc, LENS, [], [lifted]);
    };
    assert.isAtLeast(zoom([lifted]) ?? 0, MIN_DISTANCE - 0.05);
    // Without the stop the camera ends up past the tip.
    assert.isBelow(zoom([]) ?? 0, MIN_DISTANCE - 0.05);
  });
});
