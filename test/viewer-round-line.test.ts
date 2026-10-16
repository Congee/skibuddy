import { assert, describe, it } from '@effect/vitest';
import { Intensity } from '../src/content/schema';
import { poseTable, samplePose } from '../src/viewer/pose-table';
import { POSE_DEFINITIONS } from '../src/viewer/poses';
import { ROUND, ROUND_PHASE } from '../src/viewer/poses/regular-turn';
import { BodySide } from '../src/viewer/figure';
import { transformPoint } from '../src/viewer/mat4';
import { segmentMatrices, skiIndex } from '../src/viewer/pose';
import { rideOf } from '../src/viewer/ride';
import { poseAngles } from './pose-angles';
import { heightAt, MogulLine, pathAt, ROUND_FIELD, surfaceFor } from '../src/viewer/surface';
import { ROUND_POSE, TOPS_POSE, transitionHeading, turnPath } from '../src/viewer/turn-heading';

const INTENSITIES = [Intensity.Gentle, Intensity.Moderate, Intensity.Dynamic] as const;
// Turn time of the edge set: the path's crossing, ROUND_PHASE before the flat skis at t = 0 / 1.
const SET = 1 - ROUND_PHASE;
const DEG = Math.PI / 180;
const fraction = (intensity: Intensity, t: number): number => {
  const s = surfaceFor(ROUND_POSE, intensity);
  const p = pathAt(s, t);
  return heightAt(s, p.x, p.z) / s.relief;
};
const ts = Array.from({ length: 97 }, (_, k) => k / 96);
const N = 96;
/** The old outside ski's edge on the snow into its turn, degrees, at k/N over two turns; past 1, the mirrored inside ski. */
const edges = (intensity: Intensity): ((k: number) => number) => {
  const s = surfaceFor(ROUND_POSE, intensity);
  const table = poseTable(ROUND_POSE, intensity);
  const at = Array.from({ length: N }, (_, k) => {
    const pose = samplePose(table, k / N);
    const ride = rideOf(s, k / N, pose);
    const w = segmentMatrices({ ...pose, rise: 0 });
    const roll = (side: BodySide): number => {
      const m = w[skiIndex(side)];
      if (m === undefined) return NaN;
      return Math.asin(transformPoint(m, [1, 0, 0])[1] - transformPoint(m, [0, 0, 0])[1]) / DEG;
    };
    return { outside: ride.outsideBank / DEG - roll(BodySide.Right), inside: ride.insideBank / DEG - roll(BodySide.Left) };
  });
  return (k) => (k < N ? (at[k]?.outside ?? NaN) : -(at[k - N]?.inside ?? NaN));
};
/** The edge's peak, its release below 0.9 of it, flat skis and the new edge past 5°, as turn times. */
interface EdgeTiming {
  readonly e: (k: number) => number;
  readonly peakT: number;
  readonly release: number;
  readonly flat: number;
  readonly newEdge: number;
}
const edgeTiming = (intensity: Intensity): EdgeTiming => {
  const e = edges(intensity);
  const ks = Array.from({ length: 2 * N }, (_, k) => k);
  const peakK = ks.filter((k) => k >= 0.3 * N && k < N).reduce((b, k) => (e(k) > e(b) ? k : b));
  const peak = e(peakK);
  const cross = (f: (k: number) => number, level: number, from: number): number => {
    const k = ks.find((j) => j > from && f(j) < level) ?? NaN;
    return (k - 1 + (f(k - 1) - level) / (f(k - 1) - f(k))) / N;
  };
  const flat = cross(e, 0, peakK);
  const newEdge = cross((k) => 5 + e(k), 0, Math.ceil(flat * N));
  return { e, peakT: peakK / N, release: cross(e, 0.9 * peak, peakK), flat, newEdge };
};

describe('round line', () => {
  it('is a mogul line and the first in the switch', () => {
    assert.strictEqual(Object.values(MogulLine)[0], MogulLine.Round);
    assert.strictEqual(surfaceFor(ROUND_POSE, Intensity.Moderate).line, MogulLine.Round);
    assert.isDefined(POSE_DEFINITIONS[ROUND_POSE]);
  });

  it('keeps high on the wall, never in the trough (jds-bumps-style 1:20-1:55; floor 0.3 measured 1:56-2:01)', () => {
    for (const intensity of INTENSITIES) for (const t of ts) assert.isAtLeast(fraction(intensity, t), 0.3, `${intensity} t${t}`);
  });

  it('sets the edges on the uphill face at 0.5-0.8 of the relief (jds-bumps-style 1:56-2:01, measured)', () => {
    for (const intensity of INTENSITIES) {
      const f = fraction(intensity, SET);
      assert.isAtLeast(f, 0.5, intensity);
      assert.isAtMost(f, 0.8, intensity);
    }
  });

  it('sets the edges before the crest, just below it (campbell-rogan-2001; dipiro-2005 pp60-61)', () => {
    for (const intensity of INTENSITIES) {
      const s = surfaceFor(ROUND_POSE, intensity);
      assert.isAbove(s.crest, SET, intensity);
      assert.isBelow(fraction(intensity, SET), fraction(intensity, s.crest), intensity);
    }
  });

  it('finishes heading across the hill (jds-bumps-style 2:12-2:37)', () => {
    const s = surfaceFor(ROUND_POSE, Intensity.Moderate);
    const most = Math.max(...ts.map((t) => Math.abs(pathAt(s, t).heading)));
    assert.isBelow(Math.abs(Math.abs(pathAt(s, SET).heading) - most), 1e-2);
    assert.isAbove(Math.abs(pathAt(s, SET).heading), 45 * DEG);
  });

  it('swings wider than the tops line (jds-bumps-style 2:00)', () => {
    assert.isAbove(transitionHeading(turnPath(ROUND_POSE, Intensity.Moderate)), transitionHeading(turnPath(TOPS_POSE, Intensity.Moderate)));
  });

  it('pivots with flat skis over the shoulder at 0.7-1.0 (jds-bumps-style 1:56-2:01, measured)', () => {
    for (const intensity of INTENSITIES) assert.isAtLeast(fraction(intensity, 0), 0.7, intensity);
  });

  it('plants the pole at release, 0.10-0.15 turn after the set, on the top or shoulder (jds-bumps-style 3:24, 4:25)', () => {
    const release = ROUND.poleTouchAt ?? 0;
    assert.isAtLeast(release - SET, 0.1 - 1e-9);
    assert.isAtMost(release - SET, 0.15 + 1e-9);
    for (const intensity of INTENSITIES) assert.isAtLeast(fraction(intensity, release), 0.7, intensity);
  });

  it('plants the downhill pole: the outside arm of the finishing turn, the inside of the new one', () => {
    const at = ROUND.poleTouchAt ?? 0;
    // Negative is the outside pole touching for the next turn.
    for (const intensity of INTENSITIES) assert.isBelow(samplePose(poseTable(ROUND_POSE, intensity), at).poleTouch, -0.9, intensity);
  });

  // Edge timing targets from the coordinator's digest of jds-bumps-style 1:56-2:37 and 5:11-6:00, dipiro-2005, campbell-rogan-2001.
  it('sets the edges on the uphill face 0.5-1 m above a crest (campbell-rogan-2001; dipiro-2005 pp60-61)', () => {
    for (const intensity of INTENSITIES) {
      const s = surfaceFor(ROUND_POSE, intensity);
      const p = pathAt(s, SET);
      const { pitch, side, at } = ROUND_FIELD;
      const crests = [-1, 0, 1, 2].flatMap((k) => [-3, -2, -1, 0, 1, 2, 3].map((m) => ({ x: (k % 2 === 0 ? 1 : -1) * (side + m * pitch), z: (k + at) * s.spacing })));
      const near = crests.reduce((b, c) => (Math.hypot(p.x - c.x, p.z - c.z) < Math.hypot(p.x - b.x, p.z - b.z) ? c : b));
      const d = Math.hypot(p.x - near.x, p.z - near.z);
      assert.isAtLeast(d, 0.5, intensity);
      assert.isAtMost(d, 1, intensity);
      assert.isBelow(p.z, near.z, `${intensity} uphill of the crest`);
    }
  });

  it('edges hardest at the set: the hockey-stop finish against the face (jds-bumps-style 2:12-2:37)', () => {
    for (const intensity of INTENSITIES) assert.isAtMost(Math.abs(edgeTiming(intensity).peakT - SET), 3 / N, intensity);
  });

  it('releases 0.10-0.15 turn after the set, with the pole plant (jds-bumps-style 3:24, 4:25)', () => {
    for (const intensity of INTENSITIES) {
      const { release } = edgeTiming(intensity);
      assert.isAtLeast(release - SET, 0.1, intensity);
      assert.isAtMost(release - SET, 0.15, intensity);
    }
  });

  it('flattens the skis over the shoulder 0.3-0.4 turn after the set (jds-bumps-style 1:56-2:01, measured)', () => {
    for (const intensity of INTENSITIES) {
      const { flat } = edgeTiming(intensity);
      assert.isAtLeast(flat - SET, 0.3, intensity);
      assert.isAtMost(flat - SET, 0.4, intensity);
      assert.isAtLeast(fraction(intensity, flat), 0.7, intensity);
    }
  });

  it('tips the new edges 0.4-0.5 turn after the set, just after flat (jds-bumps-style 5:11-6:00)', () => {
    for (const intensity of INTENSITIES) {
      const { newEdge } = edgeTiming(intensity);
      assert.isAtLeast(newEdge - SET, 0.4, intensity);
      assert.isAtMost(newEdge - SET, 0.5, intensity);
    }
  });

  it('reaches its longest leg in the trough, t 0.25-0.35 (duncan-smith-2021 4:33-4:55)', () => {
    for (const intensity of INTENSITIES) {
      const table = poseTable(ROUND_POSE, intensity);
      const knee = (t: number): number => poseAngles(samplePose(table, t), 0).knee.right;
      const trough = Math.min(...ts.filter((t) => t >= 0.25 && t <= 0.35).map(knee));
      assert.isAtMost(trough, Math.min(...ts.map(knee)) + 3, intensity);
    }
  });

  it('changes the edges smoothly, at most 5° per 1/96 turn (inferred)', () => {
    for (const intensity of INTENSITIES) {
      const { e } = edgeTiming(intensity);
      for (let k = 0; k < N; k++) assert.isAtMost(Math.abs(e(k + 1) - e(k)), 5, `${intensity} k${k}`);
    }
  });
});
