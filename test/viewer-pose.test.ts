import { assert, describe, it } from '@effect/vitest';
import { EQUIPMENT, FIS_STAND_HEIGHT_MAX, FORWARD_LEAN_RANGE, deltaAngle, minShinAngle, shellInFoot, shinAngle, totalRamp } from '../src/viewer/equipment';
import type { Equipment } from '../src/viewer/equipment';
import { BodySide, SEGMENTS, SegmentKind } from '../src/viewer/figure';
import { CAPSULE_BOOT } from '../src/viewer/gear-fit';
import { compose, transformPoint, translation } from '../src/viewer/mat4';
import type { Mat4, Vec3 } from '../src/viewer/mat4';
import { MID_FOOT, POSE_SAMPLES, SKI_TIP as TIP, poseAt, segmentMatrices, solvePose, turnDepth } from '../src/viewer/pose';

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
      assert.closeTo(hip, point(t, SegmentKind.Boot, BodySide.Right, MID_FOOT)[2], 1e-4, `t=${t}`);
      assert.isAbove(hip, ankle, `t=${t}`);
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

describe('poseAt', () => {
  it('returns the solved pose at each table sample', () => {
    for (const i of [0, 4, 16, 48, 80]) assert.deepStrictEqual(poseAt(i / POSE_SAMPLES), solvePose(i / POSE_SAMPLES));
  });

  it('stays within a millimetre of the solved pose between samples', () => {
    const ski = indexOf(SegmentKind.Ski, BodySide.Left);
    for (let i = 0; i < POSE_SAMPLES; i++) {
      const t = (i + 0.5) / POSE_SAMPLES;
      const table = segmentMatrices(poseAt(t));
      const solved = segmentMatrices(solvePose(t));
      table.forEach((m, k) => {
        const p = transformPoint(m, [0, 0.3, 0]);
        const q = transformPoint(solved[k] ?? m, [0, 0.3, 0]);
        assert.isBelow(Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]), 1e-3, `t=${t}, segment ${k}`);
      });
      const m = table[ski];
      if (m === undefined) throw new Error('no inside ski');
      assert.closeTo(transformPoint(m, TIP)[1], 0, 1e-3, `tip at t=${t}`);
    }
  });

  it('wraps like the turn', () => {
    assert.deepStrictEqual(poseAt(1.25), poseAt(0.25));
    assert.deepStrictEqual(poseAt(-0.75), poseAt(0.25));
  });
});

const SIDES = [BodySide.Right, BodySide.Left] as const;
const TIMES = Array.from({ length: POSE_SAMPLES }, (_, i) => i / POSE_SAMPLES);
const DEG = Math.PI / 180;

const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/** Pitch of `v` forward of `frame`'s y axis, in the frame's y-z plane. */
const pitchIn = (frame: Mat4, v: Vec3): number => {
  const [ox, oy, oz] = transformPoint(frame, [0, 0, 0]);
  const axis = (local: Vec3): Vec3 => {
    const [x, y, z] = transformPoint(frame, local);
    return [x - ox, y - oy, z - oz];
  };
  return Math.atan2(dot(v, axis([0, 0, 1])), dot(v, axis([0, 1, 0])));
};
const between = (a: Vec3, b: Vec3): Vec3 => [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
const SHIN_LENGTH = 0.43;
const SHELL = shellInFoot(CAPSULE_BOOT, EQUIPMENT);

/** Height of a point in the shell's frame above the ski base, along the ski's normal. */
const above = (t: number, side: BodySide, p: Vec3): number => {
  const ski = matrixAt(t, SegmentKind.Ski, side);
  const base = transformPoint(ski, [0, -EQUIPMENT.skiThickness / 2, 0]);
  const up = between(base, transformPoint(ski, [0, 1 - EQUIPMENT.skiThickness / 2, 0]));
  return dot(between(base, transformPoint(compose(matrixAt(t, SegmentKind.Boot, side), SHELL), p)), up);
};

describe('equipment', () => {
  it('defaults to a typical boot and binding', () => {
    assert.isAtLeast(EQUIPMENT.forwardLean, FORWARD_LEAN_RANGE[0]);
    assert.isAtMost(EQUIPMENT.forwardLean, FORWARD_LEAN_RANGE[1]);
    assert.closeTo(deltaAngle(EQUIPMENT) / DEG, 0.88, 0.01);
    assert.closeTo(totalRamp(EQUIPMENT), EQUIPMENT.bootBoardRamp + deltaAngle(EQUIPMENT), 1e-12);
  });

  it('keeps the stand height within the FIS race limit', () => {
    // A recreational setup sits below what race skis may use.
    assert.isAtMost(EQUIPMENT.standHeight, FIS_STAND_HEIGHT_MAX);
    assert.isAbove(EQUIPMENT.standHeight - EQUIPMENT.skiThickness, EQUIPMENT.plateHeight);
  });

  it('holds the shin at the cuff until the ankle flexes past it', () => {
    const stiff: Equipment = { ...EQUIPMENT, forwardLean: 17 * DEG };
    assert.closeTo(shinAngle(0, stiff), minShinAngle(stiff), 1e-12);
    assert.closeTo(shinAngle(0.5, stiff), 0.5 + totalRamp(stiff), 1e-12);
  });

  it('never stands the shin up past the forward lean', () => {
    for (const t of TIMES) {
      for (const side of SIDES) {
        const ankle = point(t, SegmentKind.Shin, side, [0, -SHIN_LENGTH, 0]);
        const knee = point(t, SegmentKind.Shin, side, [0, 0, 0]);
        const shin = pitchIn(matrixAt(t, SegmentKind.Ski, side), between(ankle, knee));
        assert.isAtLeast(shin, EQUIPMENT.forwardLean, `${side} at t=${t}`);
        assert.isAtLeast(shin, minShinAngle(EQUIPMENT) - 1e-4, `${side} at t=${t}`);
      }
    }
  });

  it('pitches each foot heel-up on its ski by the total ramp', () => {
    for (const t of TIMES) {
      for (const side of SIDES) {
        const foot = matrixAt(t, SegmentKind.Boot, side);
        const toe = between(transformPoint(foot, [0, 0, 0]), transformPoint(foot, [0, 0, 1]));
        // Pitch of the toe direction away from the ski's forward axis, toe down.
        assert.closeTo(pitchIn(matrixAt(t, SegmentKind.Ski, side), toe) - Math.PI / 2, totalRamp(EQUIPMENT), 1e-5, `${side} at t=${t}`);
      }
    }
  });

  it('stands the boot sole at stand height above the ski base, heel higher than toe', () => {
    const { sole, heel, toe } = CAPSULE_BOOT;
    for (const t of [0, 1 / 6, 0.5, 5 / 6]) {
      for (const side of SIDES) {
        assert.closeTo(above(t, side, [0, sole, (heel + toe) / 2]), EQUIPMENT.standHeight, 1e-5, `${side} at t=${t}`);
        const rise = above(t, side, [0, sole, heel]) - above(t, side, [0, sole, toe]);
        assert.closeTo(rise, (EQUIPMENT.bindingDelta * (toe - heel)) / EQUIPMENT.soleLength, 1e-5, `${side} at t=${t}`);
      }
    }
  });

  it('keeps the cuff canted forward of the shell sole by at least the forward lean', () => {
    for (const t of TIMES) {
      for (const side of SIDES) {
        const shell = compose(matrixAt(t, SegmentKind.Boot, side), SHELL);
        const cuff = compose(matrixAt(t, SegmentKind.Shin, side), translation([0, -SHIN_LENGTH, 0]));
        const axis = between(transformPoint(cuff, [0, 0, 0]), transformPoint(cuff, [0, 1, 0]));
        assert.isAtLeast(pitchIn(shell, axis), EQUIPMENT.forwardLean - 1e-4, `${side} at t=${t}`);
      }
    }
  });
});
