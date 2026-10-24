import { assert, describe, it } from '@effect/vitest';
import { drillScenarios, turnScenarios } from '../scripts/anatomy/drill-scenarios';
import { turnForcesAt } from '../src/physics/turn';
import { INTENSITIES } from '../src/content/schema';
import type { Intensity } from '../src/content/schema';
import { BodySide, SEGMENTS, SegmentKind } from '../src/viewer/figure';
import { transformPoint } from '../src/viewer/mat4';
import { CAPSULE_BOOT, HEEL_ROOM } from '../src/viewer/gear-fit';
import { ARM_FLEXION, CAPSULE_GRIP, MID_FOOT, segmentMatrices, skiIndex } from '../src/viewer/pose';
import type { Vec3 } from '../src/viewer/mat4';
import { forceTiltAt } from '../src/viewer/pose-solver';
import { poseTable, samplePose } from '../src/viewer/pose-table';
import { POSE_DEFINITIONS } from '../src/viewer/poses';
import { rideOf } from '../src/viewer/ride';
import { heightAt, pathAt, surfaceFor } from '../src/viewer/surface';
import { RegularTurn, TOPS_PLANT } from '../src/viewer/poses/regular-turn';
import { ROUND_POSE, TOPS_POSE, transitionHeading, turnPath } from '../src/viewer/turn-heading';
import { poseAngles, trunkFromVertical } from './pose-angles';
import type { PoseAngles } from './pose-angles';
import { legacyIt } from './legacy';

const DEG = 180 / Math.PI;
// The bare foot's heel inside the capsule shell, behind mid-foot.
const HEEL = CAPSULE_BOOT.heel + HEEL_ROOM - MID_FOOT[2];
const N = 48;
const TIMES = Array.from({ length: N }, (_, k) => k / N);

/** The outside ski's edge on the snow under it, degrees. */
const edgeAt = (i: Intensity, t: number): number => {
  const s = surfaceFor(TOPS_POSE, i);
  const pose = samplePose(poseTable(TOPS_POSE, i), t);
  const ski = segmentMatrices({ ...pose, rise: 0 })[skiIndex(BodySide.Right)];
  if (ski === undefined) throw new Error('no ski');
  const o = transformPoint(ski, [0, 0, 0]);
  const a = transformPoint(ski, [1, 0, 0]);
  return Math.abs((Math.asin(a[1] - o[1]) - rideOf(s, t, pose).outsideBank) * DEG);
};
const anglesAt = (i: Intensity, t: number): PoseAngles =>
  poseAngles(samplePose(poseTable(TOPS_POSE, i), t), forceTiltAt(drillScenarios(TOPS_POSE)[i], surfaceFor(TOPS_POSE, i), t));
const kneeAt = (i: Intensity, t: number): number => anglesAt(i, t).knee.right;
/** Gravity's up in the figure's root, the skis heading `h` off the fall line of a `slopeDeg` slope. */
const gravityUp = (slopeDeg: number, h: number): Vec3 => {
  const a = slopeDeg / DEG;
  return [Math.sin(a) * Math.sin(h), Math.cos(a), -Math.sin(a) * Math.cos(h)];
};
const segment = (kind: SegmentKind, side: BodySide): number => SEGMENTS.findIndex((g) => g.kind === kind && g.side === side);
/** Each grip's height over its shoulder along gravity and ahead of it toward the chest's facing, and the grips' span over the shoulders', metres. */
interface Hand {
  readonly shoulder: Vec3;
  readonly grip: Vec3;
  readonly above: number;
  readonly ahead: number;
}
const handsAt = (i: Intensity, t: number, drill: string = TOPS_POSE): { readonly sides: readonly [Hand, Hand]; readonly span: number } => {
  const world = segmentMatrices(samplePose(poseTable(drill, i), t));
  const at = (kind: SegmentKind, side: BodySide, p: Vec3): Vec3 => {
    const m = world[segment(kind, side)];
    if (m === undefined) throw new Error(`no ${side} ${kind}`);
    return transformPoint(m, p);
  };
  const up = gravityUp(drillScenarios(drill)[i].slopeDeg, drill === TOPS_POSE ? pathAt(surfaceFor(drill, i), t).heading : 0);
  const origin = at(SegmentKind.Trunk, BodySide.Center, [0, 0, 0]);
  const axis = (p: Vec3): Vec3 => {
    const q = at(SegmentKind.Trunk, BodySide.Center, p);
    return [q[0] - origin[0], q[1] - origin[1], q[2] - origin[2]];
  };
  const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const lateral = axis([1, 0, 0]);
  // The chest's facing, level along gravity.
  const chest = axis([0, 0, 1]);
  const lift = dot(chest, up);
  const front: Vec3 = [chest[0] - lift * up[0], chest[1] - lift * up[1], chest[2] - lift * up[2]];
  const across = (a: Vec3, b: Vec3): number => dot([a[0] - b[0], a[1] - b[1], a[2] - b[2]], lateral);
  const side = (s: BodySide): Hand => {
    const shoulder = at(SegmentKind.UpperArm, s, [0, 0, 0]);
    const grip = at(SegmentKind.Forearm, s, CAPSULE_GRIP);
    const d: Vec3 = [grip[0] - shoulder[0], grip[1] - shoulder[1], grip[2] - shoulder[2]];
    return { shoulder, grip, above: dot(d, up), ahead: dot(d, front) / Math.hypot(...front) };
  };
  const r = side(BodySide.Right);
  const l = side(BodySide.Left);
  return { sides: [r, l], span: across(l.grip, r.grip) - across(l.shoulder, r.shoulder) };
};
/** Snow under the skis' centre as a share of the relief above the troughs. */
const snowShare = (i: Intensity, t: number): number => {
  const s = surfaceFor(TOPS_POSE, i);
  const p = pathAt(s, t);
  return (heightAt(s, p.x, p.z) + s.relief / 2) / s.relief;
};

describe('turns on the tops', () => {
  legacyIt('is flat on the crest, edged again by t 0.1 and edged through the fall line', () => {
    // Tipped early once flat on the backside (duncan-smith-2021 5:26-6:14), clearly edged at the fall line (1:28-1:32).
    for (const i of INTENSITIES) {
      const peak = Math.max(...TIMES.map((t) => edgeAt(i, t)));
      assert.isBelow(edgeAt(i, 0), 3, `${i} crest`);
      assert.isAbove(edgeAt(i, 0.1), 0.5 * peak, `${i} t 0.1`);
      assert.isAtLeast(edgeAt(i, 0.5), 0.8 * peak, `${i} fall line`);
    }
  });

  it('releases the edges on the top, before the crest', () => {
    // Early edging from the apex, about a foot before leaving the bump (user's rule, as duncan-smith-2021 4:24-5:07).
    for (const i of INTENSITIES) {
      assert.isBelow(edgeAt(i, 11 / 12), edgeAt(i, 5 / 6), `${i} releasing`);
      assert.isBelow(edgeAt(i, 23 / 24), 0.5 * edgeAt(i, 5 / 6), `${i} nearly flat`);
      assert.isAtLeast(snowShare(i, 11 / 12), 0.9, `${i} on top`);
    }
  });

  it('is deepest on the crest, the thighs near level, and still flexed in the trough', () => {
    // Smallest on top while releasing (duncan-smith-2021 4:24-5:07), a deep squat with the thighs near level (4:26 freeze);
    // the thighs' level is one freeze frame, so only the knee's timing is tested.
    for (const i of INTENSITIES) {
      const knees = TIMES.map((t) => kneeAt(i, t));
      const deepest = TIMES[knees.indexOf(Math.max(...knees))] ?? 0.5;
      assert.isTrue(deepest >= 0.9 || deepest <= 0.1, `${i} deepest at t ${deepest}`);
      // Long leg into the trough (duncan-smith-2021 4:34-4:40), never locked straight (fis-freestyle-judging-2025 p28).
      assert.isBelow(Math.min(...knees), kneeAt(i, 0), `${i} trough`);
      assert.isAtLeast(Math.min(...knees), 15, `${i} trough flexed`);
    }
  });

  legacyIt('keeps the skis off the troughs, the snow under them at least 0.4 of the relief', () => {
    // Inferred: the snow on the tops is better than in the troughs (campbell-rogan-2001).
    for (const i of INTENSITIES) for (const t of TIMES) assert.isAtLeast(snowShare(i, t), 0.4, `${i} t ${t}`);
  });

  it('comes round to finish heading across the hill, wider than the zipper, tighter than the round line', () => {
    // As duncan-smith-2021 1:28-1:32, most across at the finish, released before the crest (1:31); the zipper keeps
    // within 30 deg of the fall line (fis-freestyle-judging-2025 p28).
    for (const i of INTENSITIES) {
      const s = surfaceFor(TOPS_POSE, i);
      const set = s.path.set ?? 1;
      assert.isTrue(set > 5 / 6 && set < 1, `${i} set ${set}`);
      const headings = TIMES.map((t) => Math.abs(pathAt(s, t).heading));
      assert.isAtLeast(Math.abs(pathAt(s, set).heading), Math.max(...headings), `${i} widest at the set`);
      const tops = transitionHeading(turnPath(TOPS_POSE, i));
      assert.isAbove(tops, transitionHeading(turnPath(RegularTurn.Moguls, i)), `${i} zipper`);
      assert.isBelow(tops, transitionHeading(turnPath(ROUND_POSE, i)), `${i} round line`);
    }
  });

  it('plants the pole at the release on top', () => {
    // Planted downhill at the release (duncan-smith-2021 1:31).
    const plant = POSE_DEFINITIONS[TOPS_POSE]?.constraints.poleTouch?.t ?? 0;
    assert.isTrue(plant > 5 / 6 && plant < 1, `plant at t ${plant}`);
  });

  legacyIt('folds compact on the crest, the hips low and the trunk with the shin', () => {
    // Smallest on top (duncan-smith-2021 4:24-5:07, 4:26), trunk about parallel to the shin, as the zipper's
    // (gellie-2019-moguls-forward 06:00-06:20; 10 deg inferred), not broken at the waist (fis-freestyle-judging-2025 p29).
    for (const i of INTENSITIES) {
      const a = anglesAt(i, 0);
      const knees = TIMES.map((t) => kneeAt(i, t));
      const trough = TIMES[knees.indexOf(Math.min(...knees))] ?? 0.5;
      assert.isAbove(a.hip.right, anglesAt(i, trough).hip.right, `${i} hip`);
      // Racers' 23-29 deg lumbar flexion is the ceiling (heinrich-2022).
      assert.isAtMost(a.spineFlex, 29, `${i} low back`);
      // Both feet bear on the crest, so the shins' mean.
      assert.isAtMost(Math.abs(a.trunkForward - (a.shinForward.right + a.shinForward.left) / 2), 10, `${i} trunk on shin`);
    }
  });

  legacyIt('holds the hands wide and in front, below the shoulders, other drills keep the default', () => {
    // Wide and forward at about waist to lower-chest height, never above the shoulders (duncan-smith-2021 1:28-1:32, 4:26):
    // wider than the steered kind's hands away from the pole plant's swing.
    for (const i of INTENSITIES)
      for (const t of TIMES) {
        const { sides, span } = handsAt(i, t);
        for (const [k, h] of sides.entries()) {
          assert.isBelow(h.above, 0, `${i} t ${t} hand ${k} height`);
          assert.isAbove(h.ahead, 0, `${i} t ${t} hand ${k} ahead`);
        }
        const swinging = (drill: string): boolean => Math.abs(samplePose(poseTable(drill, i), t).poleTouch) > 0.1;
        if (!swinging(TOPS_POSE) && !swinging(RegularTurn.Steered)) assert.isAbove(span, handsAt(i, t, RegularTurn.Steered).span, `${i} t ${t} span`);
      }
    assert.strictEqual(samplePose(poseTable('regular-moguls', 'moderate'), 0.5).armFlexion, ARM_FLEXION);
  });

  it('never sits back: the trunk forward of gravity and of the slope normal', () => {
    // Upright into the face, the feet ahead and the body catching up, never behind them (duncan-smith-2021 3:33-3:51);
    // the slope-normal floor keeps it forward on the slope-level view as well.
    for (const i of INTENSITIES) {
      const slope = drillScenarios(TOPS_POSE)[i].slopeDeg;
      for (const t of TIMES) {
        const a = anglesAt(i, t);
        assert.isAbove(trunkFromVertical(a.trunkForward, slope, pathAt(surfaceFor(TOPS_POSE, i), t).heading), 0, `${i} t ${t} gravity`);
        assert.isAbove(a.trunkForward, 0, `${i} t ${t} slope normal`);
      }
    }
  });

  it('is centred on top, on the tips down the backside and the feet slightly ahead into the face', () => {
    // Seesaw top centred, tip pressure down the backside (duncan-smith-2021 2:37-3:20); into the face the feet go out in
    // front and the body catches up (3:33-3:51), so the mass is a little behind them along the snow, never behind the heel.
    const along = (i: Intensity, from: number, to: number, f: (a: ReturnType<typeof anglesAt>) => number): ReadonlyArray<number> =>
      TIMES.filter((t) => t >= from && t <= to).map((t) => f(anglesAt(i, t)));
    for (const i of INTENSITIES) {
      const backside = Math.max(...along(i, 1 / 12, 1 / 2, (a) => a.comAhead));
      assert.isAbove(backside, 0, `${i} backside`);
      assert.isBelow(Math.abs(anglesAt(i, 0).comAhead), backside, `${i} top`);
      const face = along(i, 2 / 3, 11 / 12, (a) => a.comOnSnow);
      assert.isBelow(Math.min(...face), 0, `${i} feet ahead`);
      assert.isAbove(Math.min(...face), HEEL, `${i} not sitting back`);
    }
  });

  it('inclines with the load through the fall line and up the face', () => {
    // Strongly inclined at the fall line and more at max compression up the face (duncan-smith-2021 1:28-1:32).
    for (const i of INTENSITIES) {
      const s = turnScenarios(TOPS_POSE)[i];
      assert.isAbove(turnForcesAt(s, 0.5).tilt, 0, `${i} fall line`);
      assert.isAbove(turnForcesAt(s, 5 / 6).tilt, turnForcesAt(s, 0.5).tilt, `${i} face`);
    }
  });

  it('plants the downhill pole', () => {
    // The plant before the crest is the next turn's, the finishing turn's outside, downhill pole (duncan-smith-2021 1:31,
    // 3:24, 4:25), the skis across the hill (as above).
    for (const i of INTENSITIES) assert.isBelow(samplePose(poseTable(TOPS_POSE, i), TOPS_PLANT).poleTouch, -0.9, i);
  });
});
