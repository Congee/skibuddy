import { assert, describe, it } from '@effect/vitest';
import { BodySide, SEGMENTS, SegmentKind } from '../src/viewer/figure';
import { transformPoint } from '../src/viewer/mat4';
import type { Mat4, Vec3 } from '../src/viewer/mat4';
import { poseAt, segmentMatrices, turnDepth } from '../src/viewer/pose';

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
});
