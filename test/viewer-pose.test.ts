import { assert, describe, it } from '@effect/vitest';
import { INTENSITIES, Intensity } from '../src/content/schema';
import { PHASE_T, turnForcesAt } from '../src/physics/turn';
import type { TurnScenario } from '../src/physics/turn';
import { EQUIPMENT, FIS_STAND_HEIGHT_MAX, FORWARD_LEAN_RANGE, deltaAngle, minShinAngle, shellInFoot, shinAngle, totalRamp } from '../src/viewer/equipment';
import type { Equipment } from '../src/viewer/equipment';
import { BodySide, SEGMENTS, SegmentKind } from '../src/viewer/figure';
import { CAPSULE_BOOT } from '../src/viewer/gear-fit';
import { compose, transformPoint, translation } from '../src/viewer/mat4';
import type { Mat4, Vec3 } from '../src/viewer/mat4';
import { touchShare, windowShare } from '../src/viewer/pose-definition';
import { FOREARM_FLEXION, SKI_TIP as TIP, segmentMatrices, turnDepth } from '../src/viewer/pose';
import { POSE_SAMPLES, effortOf } from '../src/viewer/pose-solver';
import { STORK_TURNS } from '../src/viewer/poses/stork-turns';
import { MODERATE, SCENARIOS, poseAt, solvedPose } from './stork-poses';
import { poseAngles } from './pose-angles';

const tailLiftShare = (t: number): number => windowShare(STORK_TURNS.constraints.tailLift, t);
const poleTouchAt = (t: number): number => touchShare(STORK_TURNS.constraints.poleTouch, t);
const indexOf = (kind: SegmentKind, side: BodySide): number => SEGMENTS.findIndex((s) => s.kind === kind && s.side === side);
const matrixAt = (t: number, kind: SegmentKind, side: BodySide, s: TurnScenario = MODERATE): Mat4 => {
  const m = segmentMatrices(poseAt(t, s))[indexOf(kind, side)];
  if (m === undefined) throw new Error(`no ${side} ${kind}`);
  return m;
};
const point = (t: number, kind: SegmentKind, side: BodySide, local: Vec3, s: TurnScenario = MODERATE): Vec3 => transformPoint(matrixAt(t, kind, side, s), local);
const pelvisX = (t: number): number => point(t, SegmentKind.Pelvis, BodySide.Center, [0, 0, 0])[0];
const SKI_TAIL: Vec3 = [0, -0.01, -0.7];
const SKI_TIP: Vec3 = [0, -0.01, 0.8];

const SIDES = [BodySide.Right, BodySide.Left] as const;
const TIMES = Array.from({ length: POSE_SAMPLES }, (_, i) => i / POSE_SAMPLES);
const DEG = Math.PI / 180;
const ALL = INTENSITIES.map((i) => [i, SCENARIOS[i]] as const);

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
    for (const [i, s] of ALL) {
      for (const t of [0, 0.2, 0.5, 0.8]) {
        const [, y] = point(t, SegmentKind.Ski, BodySide.Right, [0, -0.01, 0], s);
        assert.closeTo(y, 0, 1e-5, `${i} at t=${t}`);
      }
    }
  });

  it('has both skis flat on the snow at the transition', () => {
    for (const [i, s] of ALL) {
      for (const side of SIDES) {
        assert.closeTo(point(0, SegmentKind.Ski, side, SKI_TAIL, s)[1], 0, 1e-3, i);
        assert.closeTo(point(0, SegmentKind.Ski, side, SKI_TIP, s)[1], 0, 1e-3, i);
      }
    }
  });

  it('lifts the inside ski tail above its tip mid-turn', () => {
    for (const [i, s] of ALL) {
      const tail = point(0.5, SegmentKind.Ski, BodySide.Left, SKI_TAIL, s)[1];
      const tip = point(0.5, SegmentKind.Ski, BodySide.Left, SKI_TIP, s)[1];
      assert.isAbove(tail, tip, i);
      assert.isAbove(tail, 0.15, i);
    }
  });

  it('leans the body toward the inside (+x) mid-turn', () => {
    assert.isAbove(pelvisX(0.5), pelvisX(0) + 0.1);
  });

  it('only rotates and translates', () => {
    for (const m of segmentMatrices(poseAt(0.37, MODERATE))) {
      for (const col of [0, 4, 8]) {
        assert.closeTo(Math.hypot(m[col] ?? 0, m[col + 1] ?? 0, m[col + 2] ?? 0), 1, 1e-5);
      }
    }
  });

  it('balances the centre of mass over the foot, between arch and ball', () => {
    for (const [i, s] of ALL) {
      for (const t of TIMES) {
        // lemaster-2010 p57, p85; fore-aft is across the balance axis, since the lean is about the fore-aft axis.
        const com = poseAngles(poseAt(t, s)).comAhead;
        assert.isAbove(com, -0.02, `${i} at t=${t}`);
        assert.isBelow(com, 0.058, `${i} at t=${t}`);
      }
    }
  });

  it('keeps the inside ski tip on the snow while its tail lifts', () => {
    for (const [i, s] of ALL) {
      for (const t of [1 / 6, 0.5, 5 / 6]) {
        assert.closeTo(point(t, SegmentKind.Ski, BodySide.Left, TIP, s)[1], 0, 1e-3, `${i} at t=${t}`);
      }
    }
  });

  it('flexes the inside knee more than the outside mid-turn', () => {
    for (const [i, s] of ALL) {
      const { inside, outside } = poseAt(0.5, s);
      assert.isAbove(inside.hipFlex + inside.ankleFlex, outside.hipFlex + outside.ankleFlex + 0.2, i);
    }
  });

  it('folds at the hips with the low back slightly flattened and nearly constant, and the thorax forward', () => {
    for (const [i, s] of ALL) {
      const lumbar = TIMES.map((t) => poseAngles(poseAt(t, s)).spineFlex);
      // lemaster-2010 pp62-63: never arched or slumped; racers' 23-29 deg lumbar flexion is the ceiling (heinrich-2022).
      assert.isAtLeast(Math.min(...lumbar), 5, i);
      assert.isAtMost(Math.max(...lumbar), 20, i);
      assert.isBelow(Math.max(...lumbar) - Math.min(...lumbar), 1.5, i);
      for (const t of TIMES) {
        const a = poseAngles(poseAt(t, s));
        // Never the tall, upright stance; never folded past the turn's needs.
        assert.isAtLeast(a.trunkForward, 18, `${i} at t=${t}`);
        assert.isAtMost(a.trunkForward, 35, `${i} at t=${t}`);
      }
    }
  });

  it('keeps the outside knee in its intensity band and both ankles in the measured ranges', () => {
    // The solved bands, mid-turn to transition, as the content states them; heinrich-2022's GS 56-80 deg is the race reference.
    const KNEE_BANDS: Readonly<Record<Intensity, readonly [number, number]>> = { gentle: [60, 68], moderate: [65, 74], dynamic: [71, 81] };
    for (const [i, s] of ALL) {
      const [low, high] = KNEE_BANDS[i];
      const knees = TIMES.map((t) => poseAngles(poseAt(t, s)).knee[BodySide.Right]);
      assert.closeTo(Math.min(...knees), low, 3, `${i} most extended knee`);
      assert.closeTo(Math.max(...knees), high, 3, `${i} deepest knee`);
      // heinrich-2022 Table 1: outside ankle 18-27, inside 17-21 deg; a gentle turn opens the outside ankle a little further.
      const outsideLow = i === Intensity.Gentle ? 17.5 : 18;
      for (const t of TIMES) {
        const a = poseAngles(poseAt(t, s));
        assert.isAtLeast(a.dorsiflexion[BodySide.Right], outsideLow, `${i} outside ankle at t=${t}`);
        assert.isAtMost(a.dorsiflexion[BodySide.Right], 27, `${i} outside ankle at t=${t}`);
        // Before the lift both feet are weighted alike; once lifted, the inside ankle sits in the inside range.
        if (tailLiftShare(t) >= 0.5) {
          assert.isAtLeast(a.dorsiflexion[BodySide.Left], 17, `${i} inside ankle at t=${t}`);
          assert.isAtMost(a.dorsiflexion[BodySide.Left], 21, `${i} inside ankle at t=${t}`);
        }
        // Never the tall stance; within heinrich-2022's GS 50-81 deg but for a gentle mid-turn a little under it.
        assert.isAtLeast(a.hip[BodySide.Right], 45, `${i} hip at t=${t}`);
        assert.isAtMost(a.hip[BodySide.Right], 81, `${i} hip at t=${t}`);
        // Lifted, so deeper than heinrich-2022's weighted inside knee, but capped.
        assert.isAtMost(a.knee[BodySide.Left], 120.5, `${i} inside knee at t=${t}`);
      }
    }
  });

  it('holds the hands forward and wide, between hip and chest height', () => {
    for (const side of SIDES) {
      // Elbows bent about 75 deg (lemaster-2010 p142).
      assert.closeTo(FOREARM_FLEXION / DEG, 75, 5);
      // Mid-turn, carried: at the transition the inside hand reaches for the touch.
      const pelvis = point(0.5, SegmentKind.Pelvis, BodySide.Center, [0, 0, 0]);
      const hand = point(0.5, SegmentKind.Forearm, side, [0, -0.28, 0]);
      assert.isAbove(hand[2], pelvis[2] + 0.25, side);
      // Less than the keyed carriage, the body rolled back upright onto the balance axis.
      assert.isAbove(Math.abs(hand[0] - pelvis[0]), 0.2, side);
      assert.isAbove(hand[1], pelvis[1] - 0.05, side);
      assert.isBelow(hand[1], pelvis[1] + 0.45, side);
    }
  });

  it('tips the shoulders outward of the balance axis, a little more than the pelvis', () => {
    for (const [i, s] of ALL) {
      const a = poseAngles(poseAt(0.5, s));
      const shoulders = a.shoulderList + poseAt(0.5, s).lean / DEG;
      assert.isAbove(shoulders, a.pelvisListToAxis, i);
      assert.isBelow(shoulders, a.pelvisListToAxis + 12, i);
    }
  });

  it('turns the torso toward the outside ski mid-turn', () => {
    const [x, , z] = point(0.5, SegmentKind.Trunk, BodySide.Center, [0, 0, 1]);
    const [ox, , oz] = point(0.5, SegmentKind.Trunk, BodySide.Center, [0, 0, 0]);
    assert.isBelow(Math.atan2(x - ox, z - oz), -0.05);
  });
});

describe('poseAt', () => {
  it('returns the solved pose at each table sample, to the table precision', () => {
    for (const [, s] of ALL) {
      for (const i of [0, 4, 16, 48, 80]) {
        const stored = segmentMatrices(poseAt(i / POSE_SAMPLES, s));
        const solved = segmentMatrices(solvedPose(i / POSE_SAMPLES, s));
        stored.forEach((m, k) => m.forEach((x, j) => assert.closeTo(x, solved[k]?.[j] ?? Number.NaN, 2e-4, `sample ${i}, segment ${k}`)));
      }
    }
  });

  it('stays within a few millimetres of the solved pose between samples', () => {
    const ski = indexOf(SegmentKind.Ski, BodySide.Left);
    for (const [name, s] of ALL) {
      for (let i = 0; i < POSE_SAMPLES; i++) {
        const t = (i + 0.5) / POSE_SAMPLES;
        const table = segmentMatrices(poseAt(t, s));
        const solved = segmentMatrices(solvedPose(t, s));
        table.forEach((m, k) => {
          const p = transformPoint(m, [0, 0.3, 0]);
          const q = transformPoint(solved[k] ?? m, [0, 0.3, 0]);
          // The tilt and the balance roll swing fastest through the release and transition.
          assert.isBelow(Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]), 5e-3, `${name} at t=${t}, segment ${k}`);
        });
        const m = table[ski];
        if (m === undefined) throw new Error('no inside ski');
        assert.closeTo(transformPoint(m, TIP)[1], 0, 1e-3, `${name} tip at t=${t}`);
      }
    }
  }, 30_000);

  it('wraps like the turn', () => {
    assert.deepStrictEqual(poseAt(1.25, MODERATE), poseAt(0.25, MODERATE));
    assert.deepStrictEqual(poseAt(-0.75, MODERATE), poseAt(0.25, MODERATE));
  });
});

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
const above = (t: number, side: BodySide, p: Vec3, s: TurnScenario): number => {
  const ski = matrixAt(t, SegmentKind.Ski, side, s);
  const base = transformPoint(ski, [0, -EQUIPMENT.skiThickness / 2, 0]);
  const up = between(base, transformPoint(ski, [0, 1 - EQUIPMENT.skiThickness / 2, 0]));
  return dot(between(base, transformPoint(compose(matrixAt(t, SegmentKind.Boot, side, s), SHELL), p)), up);
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

  for (const [name, s] of ALL) {
    describe(name, () => {
      it('never stands the shin up past the forward lean', () => {
        for (const t of TIMES) {
          for (const side of SIDES) {
            const ankle = point(t, SegmentKind.Shin, side, [0, -SHIN_LENGTH, 0], s);
            const knee = point(t, SegmentKind.Shin, side, [0, 0, 0], s);
            const shin = pitchIn(matrixAt(t, SegmentKind.Ski, side, s), between(ankle, knee));
            assert.isAtLeast(shin, EQUIPMENT.forwardLean, `${side} at t=${t}`);
            assert.isAtLeast(shin, minShinAngle(EQUIPMENT) - 1e-4, `${side} at t=${t}`);
          }
        }
      });

      it('pitches each foot heel-up on its ski by the total ramp', () => {
        for (const t of TIMES) {
          for (const side of SIDES) {
            const foot = matrixAt(t, SegmentKind.Boot, side, s);
            const toe = between(transformPoint(foot, [0, 0, 0]), transformPoint(foot, [0, 0, 1]));
            // Pitch of the toe direction away from the ski's forward axis, toe down.
            assert.closeTo(pitchIn(matrixAt(t, SegmentKind.Ski, side, s), toe) - Math.PI / 2, totalRamp(EQUIPMENT), 1e-5, `${side} at t=${t}`);
          }
        }
      });

      it('stands the boot sole at stand height above the ski base, heel higher than toe', () => {
        const { sole, heel, toe } = CAPSULE_BOOT;
        for (const t of [0, 1 / 6, 0.5, 5 / 6]) {
          for (const side of SIDES) {
            assert.closeTo(above(t, side, [0, sole, (heel + toe) / 2], s), EQUIPMENT.standHeight, 1e-5, `${side} at t=${t}`);
            const rise = above(t, side, [0, sole, heel], s) - above(t, side, [0, sole, toe], s);
            assert.closeTo(rise, (EQUIPMENT.bindingDelta * (toe - heel)) / EQUIPMENT.soleLength, 1e-5, `${side} at t=${t}`);
          }
        }
      });

      it('keeps the cuff canted forward of the shell sole by at least the forward lean', () => {
        for (const t of TIMES) {
          for (const side of SIDES) {
            const shell = compose(matrixAt(t, SegmentKind.Boot, side, s), SHELL);
            const cuff = compose(matrixAt(t, SegmentKind.Shin, side, s), translation([0, -SHIN_LENGTH, 0]));
            const axis = between(transformPoint(cuff, [0, 0, 0]), transformPoint(cuff, [0, 1, 0]));
            assert.isAtLeast(pitchIn(shell, axis), EQUIPMENT.forwardLean - 1e-4, `${side} at t=${t}`);
          }
        }
      });
    });
  }
});

const PHASES = { transition: 0, initiation: 1 / 6, shaping: 1 / 2, finish: 5 / 6 } as const;
const TURNING = [PHASES.initiation, PHASES.shaping, PHASES.finish];

const mechanics = (name: string, s: TurnScenario): void => {
  describe(`stork pose mechanics, ${name}`, () => {
    const at = (t: number): ReturnType<typeof poseAngles> => poseAngles(poseAt(t, s));
    const outside = (t: number): number => at(t).dorsiflexion[BodySide.Right];
    const edge = (t: number): number => at(t).edge[BodySide.Right];
    const lean = (t: number): number => poseAt(t, s).lean / DEG;

    it('holds the outside ankle flexed from initiation to the fall line, then opens it through the finish', () => {
      const cuff = (minShinAngle(EQUIPMENT) - totalRamp(EQUIPMENT)) / DEG;
      for (const t of TIMES) {
        for (const side of SIDES) {
          assert.isAbove(at(t).dorsiflexion[side], 0, `${side} at t=${t}`);
          assert.isAbove(at(t).dorsiflexion[side], cuff, `${side} at t=${t}`);
        }
      }
      // lemaster-2010 pp79, 85-86, 182-183.
      const most = Math.max(...TIMES.map(outside));
      assert.closeTo(outside(PHASES.initiation), most, 0.5);
      assert.closeTo(outside(PHASES.shaping), outside(PHASES.initiation), 0.5);
      assert.isAbove(outside(PHASES.initiation), outside(PHASES.transition));
      assert.isAbove(outside(PHASES.shaping), outside(PHASES.finish) + 1.5);
      assert.isAbove(outside(0.65), outside(PHASES.finish));
      // Flexes again through the transition.
      assert.isAbove(outside(PHASES.transition), outside(PHASES.finish));
    });

    it('tilts with the physics', () => {
      for (const t of TIMES) assert.closeTo(poseAt(t, s).lean, turnForcesAt(s, t).tilt, 0.02, `t=${t}`);
    });

    it('extends the outside knee a little into the turn, holds it through shaping and flexes it through the finish', () => {
      // lemaster-2010 pp40-42, pritchard-taylor-2023 p27, iasi-2021 pp65-66: deepest in the transition, longest mid-turn.
      const knee = (t: number): number => at(t).knee[BodySide.Right];
      const hip = (t: number): number => at(t).hip[BodySide.Right];
      assert.closeTo(Math.max(...TIMES.map(knee)), knee(PHASES.transition), 0.5);
      assert.isBelow(knee(PHASES.initiation), knee(PHASES.transition) - 3);
      assert.isBelow(knee(PHASES.shaping), knee(PHASES.initiation));
      assert.closeTo(Math.min(...TIMES.map(knee)), knee(PHASES.shaping), 1);
      // Quasi-isometric through shaping.
      assert.isBelow(Math.abs(knee(0.4) - knee(0.6)), 2.5);
      // Flexes from late shaping through the finish into the transition, by a modest 8-12 deg in all.
      assert.isAbove(knee(PHASES.finish), knee(0.65));
      assert.isAbove(knee(0.95), knee(PHASES.finish) + 3);
      const swing = knee(PHASES.transition) - knee(PHASES.shaping);
      assert.isAtLeast(swing, 7.5);
      assert.isAtMost(swing, 12);
      // The hip follows suit.
      assert.isBelow(hip(PHASES.initiation), hip(PHASES.transition));
      assert.isBelow(hip(PHASES.shaping), hip(PHASES.initiation));
      assert.isAbove(hip(PHASES.finish), hip(PHASES.shaping) + 5);
    });

    it('shortens the inside leg, so the inside foot leads by less than half a boot', () => {
      for (const t of TURNING) {
        const a = at(t);
        assert.isAbove(a.hip[BodySide.Left], a.hip[BodySide.Right] + 5, `t=${t}`);
        assert.isAbove(a.knee[BodySide.Left], a.knee[BodySide.Right] + 10, `t=${t}`);
        assert.isAbove(a.lead, 0.03, `t=${t}`);
        // The boot keeps the inside ankle near the outside one (heinrich-2022).
        assert.isBelow(Math.abs(a.dorsiflexion[BodySide.Left] - a.dorsiflexion[BodySide.Right]), 4, `t=${t}`);
      }
      // Half a boot sole at most. The inside ski pivots on its tip, so the lead comes from the hip: the inside leg
      // shortens by the tail's lift at the binding plus hip width times the lean, all by hip flexion.
      for (const t of TIMES) assert.isBelow(at(t).lead, EQUIPMENT.soleLength / 2, `t=${t}`);
    });

    it('lifts the inside ski at the tail with its tip on the snow', () => {
      for (const t of TURNING) {
        const a = at(t);
        assert.isAbove(a.insideTail, a.insideTip + 0.05, `t=${t}`);
        assert.closeTo(a.insideTip, 0, 1e-3, `t=${t}`);
      }
      // Up through mid-initiation and down through mid-finish, as pose and content say (psia-c-stork-turns).
      assert.isBelow(at(0.08).insideTail, 0.02);
      assert.isBelow(at(PHASES.finish).insideTail, at(0.65).insideTail);
      assert.isBelow(at(0.92).insideTail, 0.02);
    });

    it('tips the pelvis outward of the balance axis over the outside hip, never dropping the inside', () => {
      for (const t of TURNING) {
        const a = at(t);
        // lemaster-2010 p70: outward relative to the balance axis, not level to the world.
        assert.isAbove(a.pelvisListToAxis, 4, `t=${t}`);
        assert.isAbove(a.pelvisList, -lean(t) + 4, `t=${t}`);
      }
    });

    it('counters by turning the pelvis in the hip sockets, never into the new turn', () => {
      for (const t of TURNING) {
        assert.isAbove(at(t).counter, 2, `t=${t}`);
        assert.isBelow(at(t).counter, 12, `t=${t}`);
      }
      // Square through the release: no rotation toward the new turn.
      for (const t of TIMES) assert.isAtLeast(poseAt(t, s).counter, 0, `t=${t}`);
      assert.isBelow(at(PHASES.finish).counter, at(PHASES.shaping).counter);
    });

    it('builds the edge angle into shaping and releases it through the finish', () => {
      assert.isAbove(edge(PHASES.shaping), edge(PHASES.initiation) + 8);
      const peak = Math.max(...TIMES.map(edge));
      // The lean peaks late, so the balance roll gives back less edge at the finish.
      assert.isBelow(edge(PHASES.finish), peak - 2);
      for (const t of TURNING) {
        const a = at(t);
        const angulation = a.edge[BodySide.Right] - lean(t);
        // lind-sanders-2004: low speed, so modest angulation; most of it at the hip.
        assert.isAbove(angulation, 2, `t=${t}`);
        assert.isBelow(angulation, 14, `t=${t}`);
        assert.isAbove(poseAt(t, s).hipAngulation / DEG, angulation / 3, `t=${t}`);
        assert.closeTo(a.edge[BodySide.Left], a.edge[BodySide.Right], 1, `parallel at t=${t}`);
        // Outside foot slightly everted, inside slightly inverted, both toward the turn.
        for (const side of SIDES) {
          assert.isAbove(a.footRoll[side], 0.5, `${side} at t=${t}`);
          assert.isBelow(a.footRoll[side], 10, `${side} at t=${t}`);
        }
        assert.isAbove(a.hipAbduction[BodySide.Right], 0, `outside hip abducted at t=${t}`);
      }
    });

    it('keeps the outside knee from collapsing inward', () => {
      for (const t of TIMES) {
        const a = at(t);
        // On or just inside the femoral-head-to-edge line (lemaster-2010 p69).
        assert.isBelow(a.kneeInside[BodySide.Right], 0.025, `t=${t}`);
        assert.isAbove(a.knee[BodySide.Right], 40, `t=${t}`);
      }
    });
  });
};
for (const [name, s] of ALL) mechanics(name, s);

describe('moderate pose', () => {
  it('keeps the initiation edge low while it builds', () => {
    assert.isBelow(poseAngles(poseAt(PHASES.initiation, MODERATE)).edge[BodySide.Right], 30);
  });

  it('touches the inside pole at the transition, not in shaping', () => {
    assert.isAbove(poleTouchAt(PHASES.transition), 0.5);
    assert.strictEqual(poleTouchAt(PHASES.shaping), 0);
  });
});

describe('intensity', () => {
  const peaks = INTENSITIES.map((i) => {
    const s = SCENARIOS[i];
    const a = (t: number): ReturnType<typeof poseAngles> => poseAngles(poseAt(t, s));
    return {
      name: i,
      knee: Math.max(...TIMES.map((t) => a(t).knee[BodySide.Right])),
      tilt: Math.max(...TIMES.map((t) => poseAt(t, s).lean)),
      edge: Math.max(...TIMES.map((t) => a(t).edge[BodySide.Right])),
      shaping: a(PHASE_T.shaping),
      lean: poseAt(PHASE_T.shaping, s).lean,
    };
  });

  it('flexes, tilts and edges more from gentle to dynamic', () => {
    for (let k = 1; k < peaks.length; k++) {
      const a = peaks[k - 1];
      const b = peaks[k];
      if (a === undefined || b === undefined) throw new Error('three intensities');
      const label = `${a.name} < ${b.name}`;
      assert.isBelow(a.knee, b.knee - 4, label);
      assert.isBelow(a.tilt, b.tilt, label);
      assert.isBelow(a.edge, b.edge, label);
      assert.isBelow(a.shaping.knee[BodySide.Right], b.shaping.knee[BodySide.Right], label);
      assert.isBelow(a.lean, b.lean, label);
      assert.isBelow(a.shaping.edge[BodySide.Right], b.shaping.edge[BodySide.Right], label);
    }
  });

  it('scales the knee depth with the fall-line load', () => {
    const scales = INTENSITIES.map((i) => effortOf(STORK_TURNS, SCENARIOS[i]).scale);
    const [gentle, moderate, dynamic] = scales;
    assert.isBelow(gentle ?? 0, -0.5);
    assert.closeTo(moderate ?? 1, 0, 0.05);
    assert.isAbove(dynamic ?? 0, 0.5);
    assert.strictEqual(SCENARIOS[Intensity.Moderate], MODERATE);
  });
});
