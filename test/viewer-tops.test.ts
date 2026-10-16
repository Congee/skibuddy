import { assert, describe, it } from '@effect/vitest';
import { drillScenarios, turnScenarios } from '../scripts/anatomy/drill-scenarios';
import { turnForcesAt } from '../src/physics/turn';
import { INTENSITIES } from '../src/content/schema';
import type { Intensity } from '../src/content/schema';
import { BodySide, SEGMENTS, SegmentKind } from '../src/viewer/figure';
import { transformPoint } from '../src/viewer/mat4';
import { ARM_FLEXION, CAPSULE_GRIP, segmentMatrices, skiIndex } from '../src/viewer/pose';
import type { Vec3 } from '../src/viewer/mat4';
import { forceTiltAt } from '../src/viewer/pose-solver';
import { poseTable, samplePose } from '../src/viewer/pose-table';
import { POSE_DEFINITIONS } from '../src/viewer/poses';
import { rideOf } from '../src/viewer/ride';
import { heightAt, pathAt, surfaceFor } from '../src/viewer/surface';
import { TOPS_PLANT } from '../src/viewer/poses/regular-turn';
import { TOPS_POSE } from '../src/viewer/turn-heading';
import { poseAngles, trunkFromVertical } from './pose-angles';
import type { PoseAngles } from './pose-angles';

const DEG = 180 / Math.PI;
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
const handsAt = (i: Intensity, t: number): { readonly sides: readonly [Hand, Hand]; readonly span: number } => {
  const world = segmentMatrices(samplePose(poseTable(TOPS_POSE, i), t));
  const at = (kind: SegmentKind, side: BodySide, p: Vec3): Vec3 => {
    const m = world[segment(kind, side)];
    if (m === undefined) throw new Error(`no ${side} ${kind}`);
    return transformPoint(m, p);
  };
  const up = gravityUp(drillScenarios(TOPS_POSE)[i].slopeDeg, pathAt(surfaceFor(TOPS_POSE, i), t).heading);
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
  it('is flat on the crest, edged again by t 0.1 and edged through the fall line', () => {
    // Tipped early once flat on the backside (duncan-smith-2021 5:26-6:14), clearly edged at the fall line (1:28-1:32).
    for (const i of INTENSITIES) {
      const peak = Math.max(...TIMES.map((t) => edgeAt(i, t)));
      assert.isBelow(edgeAt(i, 0), 3, `${i} crest`);
      assert.isAtLeast(edgeAt(i, 0.1), 10, `${i} t 0.1`);
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
    // band inferred.
    for (const i of INTENSITIES) {
      const knees = TIMES.map((t) => kneeAt(i, t));
      const deepest = TIMES[knees.indexOf(Math.max(...knees))] ?? 0.5;
      assert.isTrue(deepest >= 0.9 || deepest <= 0.1, `${i} deepest at t ${deepest}`);
      assert.approximately(kneeAt(i, 0), 118, 12, `${i} on top`);
      // Long leg into the trough (duncan-smith-2021 4:34-4:40), not straight (fis-freestyle-judging-2025 p28); amounts inferred.
      assert.isAtMost(Math.min(...knees), 40, `${i} trough`);
      assert.isAtLeast(Math.min(...knees), 25, `${i} trough flexed`);
    }
  });

  it('keeps the skis off the troughs, the snow under them at least 0.4 of the relief', () => {
    // Inferred: the snow on the tops is better than in the troughs (campbell-rogan-2001).
    for (const i of INTENSITIES) for (const t of TIMES) assert.isAtLeast(snowShare(i, t), 0.4, `${i} t ${t}`);
  });

  it('comes round to finish heading across the hill', () => {
    // As duncan-smith-2021 1:28-1:32; the 40 and 50 deg are inferred.
    for (const i of INTENSITIES) {
      const s = surfaceFor(TOPS_POSE, i);
      assert.isAtLeast(Math.abs(pathAt(s, 5 / 6).heading) * DEG, 40, i);
      assert.approximately(Math.abs(pathAt(s, 1).heading) * DEG, 50, 0.5, i);
    }
  });

  it('plants the pole at the release on top', () => {
    // Planted downhill at the release (duncan-smith-2021 1:31).
    const plant = POSE_DEFINITIONS[TOPS_POSE]?.constraints.poleTouch?.t ?? 0;
    assert.isTrue(plant > 5 / 6 && plant < 1, `plant at t ${plant}`);
  });

  it('folds compact on the crest, the hips low and the trunk with the shin', () => {
    // Smallest on top (duncan-smith-2021 4:24-5:07, 4:26), trunk along the shin (gellie-2019-moguls-forward), not
    // broken at the waist (fis-freestyle-judging-2025 p29); bands inferred.
    for (const i of INTENSITIES) {
      const a = anglesAt(i, 0);
      assert.isAtLeast(a.hip.right, 70, `${i} hip`);
      assert.isAtMost(a.spineFlex, 21, `${i} low back`);
      assert.approximately(a.trunkForward - a.shinForward.right, -9, 9, `${i} trunk on shin`);
    }
  });

  it('holds the hands wide and in front, below the shoulders, other drills keep the default', () => {
    // Wide and forward at about waist to lower-chest height, never above the shoulders (duncan-smith-2021 1:28-1:32,
    // 4:26). The baked body's grips sit about 0.1 m higher than these, so the margin; bands inferred.
    for (const i of INTENSITIES)
      for (const t of TIMES) {
        const { sides, span } = handsAt(i, t);
        const reaching = t < 1 / 12 || t > 3 / 4;
        for (const [k, h] of sides.entries()) {
          // The plant's reach lifts the planting hand a little.
          assert.isAtMost(h.above, reaching ? -0.15 : -0.2, `${i} t ${t} hand ${k} height`);
          assert.isAtLeast(h.ahead, 0.05, `${i} t ${t} hand ${k} ahead`);
        }
        if (!reaching) assert.isAtLeast(span, 0.1, `${i} t ${t} span`);
      }
    assert.strictEqual(samplePose(poseTable('regular-moguls', 'moderate'), 0.5).armFlexion, ARM_FLEXION);
  });

  it('never sits back: the trunk forward of gravity and of the slope normal', () => {
    // Upright into the face, the feet ahead and the body catching up, never behind them (duncan-smith-2021 3:33-3:51);
    // the slope-normal floor keeps it forward on the slope-level view as well; bands inferred.
    for (const i of INTENSITIES) {
      const slope = drillScenarios(TOPS_POSE)[i].slopeDeg;
      for (const t of TIMES) {
        const a = anglesAt(i, t);
        assert.isAtLeast(trunkFromVertical(a.trunkForward, slope, pathAt(surfaceFor(TOPS_POSE, i), t).heading), 15, `${i} t ${t} gravity`);
        assert.isAtLeast(a.trunkForward, 8, `${i} t ${t} slope normal`);
      }
    }
  });

  it('is centred on top, on the tips down the backside and the feet slightly ahead into the face', () => {
    // Seesaw top centred, tip pressure down the backside (duncan-smith-2021 2:37-3:20); into the face the feet go out in
    // front and the body catches up (3:33-3:51), so the mass is a little behind them along the snow; bands inferred.
    const along = (i: Intensity, from: number, to: number, f: (a: ReturnType<typeof anglesAt>) => number): ReadonlyArray<number> =>
      TIMES.filter((t) => t >= from && t <= to).map((t) => f(anglesAt(i, t)));
    for (const i of INTENSITIES) {
      assert.approximately(anglesAt(i, 0).comAhead, 0, 0.03, `${i} top`);
      assert.isAtLeast(Math.max(...along(i, 1 / 12, 1 / 2, (a) => a.comAhead)), 0.1, `${i} backside`);
      const face = along(i, 2 / 3, 11 / 12, (a) => a.comOnSnow);
      assert.isAtMost(Math.min(...face), -0.03, `${i} feet ahead`);
      assert.isAtLeast(Math.min(...face), -0.1, `${i} not sitting back`);
    }
  });

  it('inclines with the load through the fall line and up the face', () => {
    // Strongly inclined at the fall line and max compression (duncan-smith-2021 1:28-1:32); the lean is the turn's load,
    // its mass on a path twice the skis' arc (inferred).
    for (const i of INTENSITIES) {
      const s = turnScenarios(TOPS_POSE)[i];
      assert.isAtLeast(turnForcesAt(s, 0.5).tilt * DEG, 14, `${i} fall line`);
      assert.isAtLeast(turnForcesAt(s, 5 / 6).tilt * DEG, 18, `${i} face`);
    }
  });

  it('plants the downhill pole', () => {
    // The plant before the crest is the next turn's, the finishing turn's outside, downhill pole (duncan-smith-2021 1:31,
    // 3:24, 4:25), the skis across the hill (as above).
    for (const i of INTENSITIES) assert.isBelow(samplePose(poseTable(TOPS_POSE, i), TOPS_PLANT).poleTouch, -0.9, i);
  });
});
