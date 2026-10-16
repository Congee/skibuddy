import { assert, describe, it } from '@effect/vitest';
import { Intensity } from '../src/content/schema';
import { POSE_DEFINITIONS } from '../src/viewer/poses';
import { ROUND, ROUND_PHASE } from '../src/viewer/poses/regular-turn';
import { heightAt, MogulLine, pathAt, surfaceFor } from '../src/viewer/surface';
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
});
