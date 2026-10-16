import { assert, describe, it } from '@effect/vitest';
import { drillScenarios } from '../scripts/anatomy/drill-scenarios';
import { INTENSITIES } from '../src/content/schema';
import type { Intensity } from '../src/content/schema';
import { BodySide } from '../src/viewer/figure';
import { transformPoint } from '../src/viewer/mat4';
import { segmentMatrices, skiIndex } from '../src/viewer/pose';
import { forceTiltAt } from '../src/viewer/pose-solver';
import { poseTable, samplePose } from '../src/viewer/pose-table';
import { POSE_DEFINITIONS } from '../src/viewer/poses';
import { rideOf } from '../src/viewer/ride';
import { heightAt, pathAt, surfaceFor } from '../src/viewer/surface';
import { TOPS_POSE } from '../src/viewer/turn-heading';
import { poseAngles } from './pose-angles';

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
const kneeAt = (i: Intensity, t: number): number =>
  poseAngles(samplePose(poseTable(TOPS_POSE, i), t), forceTiltAt(drillScenarios(TOPS_POSE)[i], surfaceFor(TOPS_POSE, i), t)).knee.right;
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

  it('is deepest on the crest, knees near 90 deg', () => {
    // Smallest on top while releasing (duncan-smith-2021 4:24-5:07), knees near 90 deg (6:56-7:04); band inferred.
    for (const i of INTENSITIES) {
      const knees = TIMES.map((t) => kneeAt(i, t));
      const deepest = TIMES[knees.indexOf(Math.max(...knees))] ?? 0.5;
      assert.isTrue(deepest >= 0.9 || deepest <= 0.1, `${i} deepest at t ${deepest}`);
      assert.approximately(kneeAt(i, 0), 92, 12, `${i} on top`);
      // Long leg into the trough (duncan-smith-2021 4:34-4:40); amount inferred.
      assert.isAtMost(Math.min(...knees), 40, `${i} trough`);
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

  it('holds the hands wide and plants the pole at the release on top', () => {
    // Hands wide, poles out to the side (duncan-smith-2021 1:28-1:32); planted downhill at the release (1:31).
    const c = POSE_DEFINITIONS[TOPS_POSE]?.constraints;
    assert.isAtLeast((c?.armAbduction ?? 0) * DEG, 25);
    const plant = c?.poleTouch?.t ?? 0;
    assert.isTrue(plant > 5 / 6 && plant < 1, `plant at t ${plant}`);
  });
});
