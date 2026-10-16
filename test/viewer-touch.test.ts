import { assert, describe, it } from '@effect/vitest';
import { Side } from '../src/content/schema';
import { NodeKind } from '../src/viewer/anatomy-names';
import { MIN_PINCH_SPAN, TAP_SLOP, isDoubleTap, isTap, midpoint, pinchRatio, span, toNdc, wheelRatio } from '../src/viewer/gestures';
import { PickRole, contentMuscle, pickOfName, pickRole } from '../src/viewer/pick';
import { HOME_FRAME, HOME_ORBIT, MAX_DISTANCE, MIN_DISTANCE, PAN_MAX, PAN_MIN, cameraAxes, clampDistance, clampFrame, clampTarget, dampFrame, eyeOf, panBy, surfaceDepth, turnAim, zoomAbout } from '../src/viewer/view';
import type { Lens } from '../src/viewer/view';

const LENS: Lens = { fov: (32 * Math.PI) / 180, aspect: 1.5 };
const close = (a: number, b: number, eps = 1e-9): boolean => Math.abs(a - b) < eps;

/** Where a world point lands on screen, as ndc, for a camera framed like scene.ts. */
const project = (frame: typeof HOME_FRAME, orbit: typeof HOME_ORBIT, p: readonly [number, number, number]): readonly [number, number] => {
  const { right, up } = cameraAxes(orbit);
  const back = [Math.cos(orbit.elevation) * Math.sin(orbit.azimuth), Math.sin(orbit.elevation), Math.cos(orbit.elevation) * Math.cos(orbit.azimuth)];
  const eye = [0, 1, 2].map((i) => (frame.target[i] ?? 0) + (back[i] ?? 0) * frame.distance);
  const d = [0, 1, 2].map((i) => (p[i] ?? 0) - (eye[i] ?? 0));
  const dot = (v: ReadonlyArray<number>): number => v.reduce((s, x, i) => s + x * (d[i] ?? 0), 0);
  const depth = -dot(back);
  const hh = Math.tan(LENS.fov / 2);
  return [dot(right) / depth / hh / LENS.aspect, dot(up) / depth / hh];
};

describe('taps', () => {
  it('tells a tap from a drag or a pinch', () => {
    assert.isTrue(isTap(0, false));
    assert.isTrue(isTap(TAP_SLOP - 1, false));
    assert.isFalse(isTap(TAP_SLOP, false));
    assert.isFalse(isTap(0, true));
  });

  it('pairs quick near taps into a double tap', () => {
    const first = { x: 100, y: 100, at: 1000 };
    assert.isTrue(isDoubleTap(first, { x: 110, y: 104, at: 1250 }));
    assert.isFalse(isDoubleTap(first, { x: 110, y: 104, at: 1500 }));
    assert.isFalse(isDoubleTap(first, { x: 180, y: 100, at: 1100 }));
    assert.isFalse(isDoubleTap(null, first));
  });
});

describe('pinch and wheel', () => {
  it('measures the fingers', () => {
    assert.strictEqual(span({ x: 0, y: 0 }, { x: 3, y: 4 }), 5);
    assert.deepStrictEqual(midpoint({ x: 0, y: 10 }, { x: 4, y: 20 }), { x: 2, y: 15 });
  });

  it('moves closer as the fingers spread', () => {
    assert.strictEqual(pinchRatio(100, 125), 0.8);
    assert.strictEqual(pinchRatio(125, 100), 1.25);
    assert.strictEqual(pinchRatio(0, 100), 1);
  });

  it('ignores near-coincident pointers and caps one step', () => {
    // A stale pointer next to a new press once leapt to the closest zoom on the first move.
    assert.strictEqual(pinchRatio(MIN_PINCH_SPAN - 1, 300), 1);
    assert.strictEqual(pinchRatio(100, 1000), 1 / 1.5);
    assert.strictEqual(pinchRatio(1000, 100), 1.5);
  });

  it('zooms in on a wheel up and a trackpad spread', () => {
    assert.isBelow(wheelRatio(-100, 0, false), 1);
    assert.isAbove(wheelRatio(100, 0, false), 1);
    assert.isBelow(wheelRatio(-5, 0, true), wheelRatio(-5, 0, false));
    assert.isTrue(close(wheelRatio(3, 1, false), wheelRatio(48, 0, false)));
    assert.isAtMost(wheelRatio(1e6, 0, false), Math.E);
  });

  it('maps canvas px to ndc', () => {
    assert.deepStrictEqual(toNdc({ x: 0, y: 0 }, 200, 100), [-1, 1]);
    assert.deepStrictEqual(toNdc({ x: 100, y: 50 }, 200, 100), [0, 0]);
    assert.deepStrictEqual(toNdc({ x: 5, y: 5 }, 0, 0), [0, 0]);
  });
});

describe('camera frame', () => {
  it('clamps the distance between a forearm and the whole figure', () => {
    assert.strictEqual(clampDistance(0.01), MIN_DISTANCE);
    assert.strictEqual(clampDistance(99), MAX_DISTANCE);
    assert.strictEqual(clampDistance(2), 2);
  });

  it('keeps the orbit point in the figure, home when zoomed out', () => {
    assert.deepStrictEqual(clampTarget([5, 5, 5], MAX_DISTANCE), HOME_FRAME.target);
    assert.deepStrictEqual(clampTarget([5, 5, 5], MIN_DISTANCE), PAN_MAX);
    assert.deepStrictEqual(clampTarget([-5, -5, -5], MIN_DISTANCE), PAN_MIN);
  });

  it('keeps the point under the fingers in place as it zooms', () => {
    const start = { distance: 2, target: [0, 0.9, 0] as const };
    const ndc = [0.4, -0.3] as const;
    const before = zoomAbout(start, HOME_ORBIT, ndc, 1, LENS);
    const after = zoomAbout(start, HOME_ORBIT, ndc, 0.5, LENS);
    assert.strictEqual(after.distance, 1);
    // The point on the target plane under ndc, found from the start frame.
    const { right, up } = cameraAxes(HOME_ORBIT);
    const hh = start.distance * Math.tan(LENS.fov / 2);
    const at = (i: 0 | 1 | 2): number => start.target[i] + right[i] * ndc[0] * hh * LENS.aspect + up[i] * ndc[1] * hh;
    const p = [at(0), at(1), at(2)] as const;
    const [x, y] = project(after, HOME_ORBIT, p);
    assert.isTrue(close(x, ndc[0], 1e-9) && close(y, ndc[1], 1e-9), `${x}, ${y}`);
    assert.deepStrictEqual(before, start);
  });

  it('wheels in on a raised hand without flying through it', () => {
    // Eight wheel notches at 470,306 on a 1020x696 canvas, over a hand 1.2 m in front of the orbit point.
    const ndc = toNdc({ x: 470, y: 306 }, 1020, 696);
    const ratio = wheelRatio(-120, 0, false);
    const eye = eyeOf(HOME_FRAME, HOME_ORBIT);
    const { right, up } = cameraAxes(HOME_ORBIT);
    const t = Math.tan(LENS.fov / 2);
    const handDepth = HOME_FRAME.distance - 1.2;
    const xyz = (f: (i: 0 | 1 | 2) => number): readonly [number, number, number] => [f(0), f(1), f(2)];
    const hand = xyz((i) => eye[i] + ((HOME_FRAME.target[i] - eye[i]) / HOME_FRAME.distance + right[i] * ndc[0] * t * LENS.aspect + up[i] * ndc[1] * t) * handDepth);
    const forearm = { a: [hand[0] - right[0] * 0.15, hand[1], hand[2] - right[2] * 0.15] as const, b: hand, radius: 0.04 };
    const depthOf = (frame: typeof HOME_FRAME): number => {
      const e = eyeOf(frame, HOME_ORBIT);
      const v = xyz((i) => (hand[i] - e[i]) * (frame.target[i] - e[i]));
      return (v[0] + v[1] + v[2]) / frame.distance;
    };
    let blind = HOME_FRAME;
    let frame = HOME_FRAME;
    for (let i = 0; i < 8; i++) {
      blind = zoomAbout(blind, HOME_ORBIT, ndc, ratio, LENS);
      frame = zoomAbout(frame, HOME_ORBIT, ndc, ratio, LENS, surfaceDepth(frame, HOME_ORBIT, ndc, LENS, [forearm]));
      assert.isAtLeast(frame.distance, MIN_DISTANCE);
      frame.target.forEach((v, j) => assert.isTrue(v >= (PAN_MIN[j] ?? 0) - 1e-9 && v <= (PAN_MAX[j] ?? 0) + 1e-9, `${j}: ${v}`));
    }
    // Zooming about the orbit plane alone puts the camera past the hand.
    assert.isBelow(depthOf(blind), 0);
    assert.isAtLeast(depthOf(frame), MIN_DISTANCE - 0.05);
    const [x, y] = project(frame, HOME_ORBIT, hand);
    assert.isTrue(close(x, ndc[0], 0.05) && close(y, ndc[1], 0.05), `${x}, ${y}`);
  });

  it('finds no surface off the body', () => {
    const forearm = { a: [3, 0, 3] as const, b: [3, 1, 3] as const, radius: 0.04 };
    assert.isNull(surfaceDepth(HOME_FRAME, HOME_ORBIT, [0, 0], LENS, [forearm]));
  });

  it('stops zooming at the clamp', () => {
    const near = zoomAbout({ distance: MIN_DISTANCE, target: [0, 0.9, 0] }, HOME_ORBIT, [0.5, 0.5], 0.5, LENS);
    assert.deepStrictEqual(near, { distance: MIN_DISTANCE, target: [0, 0.9, 0] });
  });

  it('pans with the fingers', () => {
    const start = { distance: 1, target: [0, 0.9, 0] as const };
    const moved = panBy(start, HOME_ORBIT, 0, 100, 500, LENS);
    // A drag down moves the scene down, so the camera looks higher.
    assert.isAbove(moved.target[1], start.target[1]);
    const right = panBy(start, HOME_ORBIT, 100, 0, 500, LENS);
    const [x] = project(right, HOME_ORBIT, start.target);
    assert.isTrue(close(x, (100 / 500) * 2 / LENS.aspect, 1e-9), String(x));
  });

  it('turns toward a focus by azimuth alone, keeping the zoom and pan', () => {
    const zoomed = { distance: 1.2, target: [0.1, 1.1, 0.2] as const };
    const turned = turnAim({ azimuth: 0.7, elevation: 0.3 }, zoomed, -1.9);
    assert.deepStrictEqual(turned.orbit, { azimuth: -1.9, elevation: 0.3 });
    assert.strictEqual(turned.frame, zoomed);
    assert.deepStrictEqual(turnAim(HOME_ORBIT, HOME_FRAME, 2).frame, HOME_FRAME);
    // A frame outside the clamps comes back inside them.
    assert.deepStrictEqual(turnAim(HOME_ORBIT, { distance: 0.01, target: [9, 9, 9] }, 2).frame, { distance: MIN_DISTANCE, target: PAN_MAX });
    assert.strictEqual(clampFrame(zoomed), zoomed);
  });

  it('eases to the aim and settles', () => {
    let frame = HOME_FRAME;
    const aim = { distance: 1, target: [0.2, 1, 0] as const };
    let settled = false;
    for (let i = 0; i < 200 && !settled; i++) ({ frame, settled } = dampFrame(frame, aim, 1 / 60, 0.05));
    assert.isTrue(settled);
    assert.strictEqual(frame, aim);
  });
});

describe('picking', () => {
  const muscles = new Set(['quadriceps', 'rectus-femoris', 'gluteus-medius']);

  it('names the content muscle a mesh stands for', () => {
    assert.strictEqual(contentMuscle('rectus-femoris', muscles), 'rectus-femoris');
    assert.strictEqual(contentMuscle('vastus-medialis', muscles), 'quadriceps');
    assert.isNull(contentMuscle('soleus', muscles));
  });

  it('reads the side from the mesh name', () => {
    assert.deepStrictEqual(pickOfName('muscle_vastus-medialis_outside', muscles), { muscle: 'quadriceps', side: Side.Outside });
    assert.deepStrictEqual(pickOfName('muscle_gluteus-medius_inside', muscles), { muscle: 'gluteus-medius', side: Side.Inside });
    assert.isNull(pickOfName('bones', muscles));
    assert.isNull(pickOfName('gear_helmet', muscles));
    assert.isNull(pickOfName('muscle_rest', muscles));
  });

  it('lets faded muscles through and stops at bone', () => {
    const muscle = { kind: NodeKind.Muscle, muscle: 'soleus', side: Side.Outside } as const;
    const plain = { skeleton: false, reveal: false };
    const idle = { level: 0, marked: false };
    assert.strictEqual(pickRole(muscle, plain, idle), PickRole.Muscle);
    assert.strictEqual(pickRole(muscle, { skeleton: true, reveal: false }, idle), PickRole.Skip);
    assert.strictEqual(pickRole(muscle, { skeleton: true, reveal: false }, { level: 0.4, marked: false }), PickRole.Muscle);
    assert.strictEqual(pickRole(muscle, { skeleton: false, reveal: true }, idle), PickRole.Skip);
    assert.strictEqual(pickRole(muscle, { skeleton: false, reveal: true }, { level: 0, marked: true }), PickRole.Muscle);
    assert.strictEqual(pickRole({ kind: NodeKind.Bones }, { skeleton: true, reveal: true }, idle), PickRole.Block);
    assert.strictEqual(pickRole({ kind: NodeKind.RestingMuscle }, plain, idle), PickRole.Block);
    assert.strictEqual(pickRole({ kind: NodeKind.RestingMuscle }, { skeleton: true, reveal: false }, idle), PickRole.Skip);
  });
});
