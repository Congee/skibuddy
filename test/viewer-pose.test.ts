import { assert, describe, it } from '@effect/vitest';
import { BodySide, SEGMENTS, SegmentKind } from '../src/viewer/figure';
import { transformPoint } from '../src/viewer/mat4';
import type { Mat4, Vec3 } from '../src/viewer/mat4';
import { CAPSULE_GRIP, POLE, POLE_TOUCH_T, SKI_TIP as TIP, poleDirection, poleTouchAt, poseAt, segmentMatrices, turnDepth } from '../src/viewer/pose';

const indexOf = (kind: SegmentKind, side: BodySide): number => SEGMENTS.findIndex((s) => s.kind === kind && s.side === side);
const matrixAt = (t: number, kind: SegmentKind, side: BodySide): Mat4 => {
  const m = segmentMatrices(poseAt(t))[indexOf(kind, side)];
  if (m === undefined) throw new Error(`no ${side} ${kind}`);
  return m;
};
const point = (t: number, kind: SegmentKind, side: BodySide, local: Vec3): Vec3 => transformPoint(matrixAt(t, kind, side), local);
const headX = (t: number): number => point(t, SegmentKind.Head, BodySide.Center, [0, 0.1, 0])[0];
const SKI_TAIL: Vec3 = [0, -0.01, -0.7];
const SKI_TIP: Vec3 = [0, -0.01, 0.8];

describe('figure', () => {
  it('lists parents before children', () => {
    SEGMENTS.forEach((s, i) => assert.isTrue(s.parent === null || s.parent < i, s.name));
  });
});

describe('turnDepth', () => {
  it('is 0 at the transition, 1 mid-turn and wraps', () => {
    assert.closeTo(turnDepth(0), 0, 1e-9);
    assert.closeTo(turnDepth(0.5), 1, 1e-9);
    assert.closeTo(turnDepth(1.25), turnDepth(0.25), 1e-9);
  });
});

describe('segmentMatrices', () => {
  it('keeps the outside ski base on the snow through the turn', () => {
    for (const t of [0, 0.2, 0.5, 0.8]) {
      const [, y] = point(t, SegmentKind.Ski, BodySide.Right, [0, -0.01, 0]);
      assert.closeTo(y, 0, 1e-5);
    }
  });

  it('has both skis flat on the snow at the transition', () => {
    for (const side of [BodySide.Right, BodySide.Left]) {
      assert.closeTo(point(0, SegmentKind.Ski, side, SKI_TAIL)[1], 0, 1e-3);
      assert.closeTo(point(0, SegmentKind.Ski, side, SKI_TIP)[1], 0, 1e-3);
    }
  });

  it('lifts the inside ski tail above its tip mid-turn', () => {
    const tail = point(0.5, SegmentKind.Ski, BodySide.Left, SKI_TAIL)[1];
    const tip = point(0.5, SegmentKind.Ski, BodySide.Left, SKI_TIP)[1];
    assert.isAbove(tail, tip);
    assert.isAbove(tail, 0.15);
  });

  it('leans the body toward the inside (+x) mid-turn', () => {
    assert.isAbove(headX(0.5), headX(0) + 0.1);
  });

  it('only rotates and translates', () => {
    for (const m of segmentMatrices(poseAt(0.37))) {
      for (const col of [0, 4, 8]) {
        assert.closeTo(Math.hypot(m[col] ?? 0, m[col + 1] ?? 0, m[col + 2] ?? 0), 1, 1e-5);
      }
    }
  });

  it('keeps the hips over mid-foot, never in the back seat', () => {
    for (const t of [0, 1 / 6, 0.5, 5 / 6]) {
      const hip = point(t, SegmentKind.Pelvis, BodySide.Center, [0, 0, 0])[2];
      const ankle = point(t, SegmentKind.Boot, BodySide.Right, [0, 0, 0])[2];
      assert.isAbove(hip, ankle - 0.01, `t=${t}`);
      assert.isBelow(hip, ankle + 0.12, `t=${t}`);
    }
  });

  it('keeps the inside ski tip on the snow while its tail lifts', () => {
    for (const t of [1 / 6, 0.5, 5 / 6]) {
      assert.closeTo(point(t, SegmentKind.Ski, BodySide.Left, TIP)[1], 0, 1e-3, `t=${t}`);
    }
  });

  it('flexes the inside knee more than the outside mid-turn', () => {
    const { inside, outside } = poseAt(0.5);
    assert.isAbove(inside.hipFlex + inside.ankleFlex, outside.hipFlex + outside.ankleFlex + 0.2);
  });

  it('leans the torso forward 30-40 degrees', () => {
    for (const t of [0, 0.5]) {
      const [, py, pz] = point(t, SegmentKind.Trunk, BodySide.Center, [0, 0, 0]);
      const [, hy, hz] = point(t, SegmentKind.Trunk, BodySide.Center, [0, 1, 0]);
      const angle = Math.atan2(hz - pz, hy - py);
      assert.isAbove(angle, 0.5, `t=${t}`);
      assert.isBelow(angle, 0.7, `t=${t}`);
    }
  });

  it('holds the hands forward, wider than the hips, between hip and chest height', () => {
    for (const side of [BodySide.Left, BodySide.Right]) {
      const pelvis = point(0, SegmentKind.Pelvis, BodySide.Center, [0, 0, 0]);
      const hand = point(0, SegmentKind.Forearm, side, [0, -0.28, 0]);
      assert.isAbove(hand[2], pelvis[2] + 0.25, side);
      assert.isAbove(Math.abs(hand[0] - pelvis[0]), 0.2, side);
      assert.isAbove(hand[1], pelvis[1] - 0.05, side);
      assert.isBelow(hand[1], pelvis[1] + 0.45, side);
    }
  });

  it('keeps the shoulders level as the legs incline', () => {
    const left = point(0.5, SegmentKind.UpperArm, BodySide.Left, [0, 0, 0])[1];
    const right = point(0.5, SegmentKind.UpperArm, BodySide.Right, [0, 0, 0])[1];
    assert.closeTo(left, right, 0.02);
  });

  it('turns the torso toward the outside ski mid-turn', () => {
    const [x, , z] = point(0.5, SegmentKind.Trunk, BodySide.Center, [0, 0, 1]);
    const [ox, , oz] = point(0.5, SegmentKind.Trunk, BodySide.Center, [0, 0, 0]);
    assert.isBelow(Math.atan2(x - ox, z - oz), -0.05);
  });
});

const basket = (t: number, side: typeof BodySide.Left | typeof BodySide.Right): Vec3 => {
  const grip = point(t, SegmentKind.Forearm, side, CAPSULE_GRIP);
  const d = poleDirection(grip, side, side === BodySide.Left ? poseAt(t).poleTouch : 0);
  return [grip[0] + d[0] * POLE.basket, grip[1] + d[1] * POLE.basket, grip[2] + d[2] * POLE.basket];
};

describe('poles', () => {
  const times = Array.from({ length: 96 }, (_, i) => i / 96);

  it('touches the inside basket to the snow beside the inside ski tip at initiation', () => {
    const b = basket(POLE_TOUCH_T, BodySide.Left);
    const tip = point(POLE_TOUCH_T, SegmentKind.Ski, BodySide.Left, TIP);
    assert.closeTo(b[1], 0, 0.005);
    assert.isBelow(Math.hypot(b[0] - tip[0], b[2] - tip[2]), 0.4);
    // Beside the ski, not on it.
    assert.isAbove(b[0], tip[0] + 0.1);
  });

  it('keeps the inside basket off the snow outside the touch', () => {
    for (const t of times.filter((x) => poleTouchAt(x) < 0.9)) {
      assert.isAbove(basket(t, BodySide.Left)[1], 0.002, `t=${t}`);
    }
    for (const t of times.filter((x) => poleTouchAt(x) === 0)) {
      assert.isAbove(basket(t, BodySide.Left)[1], 0.25, `t=${t}`);
    }
  });

  it('never plants the outside pole', () => {
    for (const t of times) assert.isAbove(basket(t, BodySide.Right)[1], 0.25, `t=${t}`);
  });

  it('touches only around initiation', () => {
    assert.strictEqual(poleTouchAt(POLE_TOUCH_T), 1);
    for (const t of [0.4, 0.5, 0.75, 0.95]) assert.strictEqual(poleTouchAt(t), 0, `t=${t}`);
  });

  it('carries the poles back and down, tips behind the hands', () => {
    for (const side of [BodySide.Left, BodySide.Right] as const) {
      const grip = point(0.5, SegmentKind.Forearm, side, CAPSULE_GRIP);
      const b = basket(0.5, side);
      assert.isBelow(b[2], grip[2] - 0.3, side);
      assert.isBelow(b[1], grip[1] - 0.5, side);
    }
  });
});
