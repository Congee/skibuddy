import { assert, describe, it } from '@effect/vitest';
import { Intensity } from '../src/content/schema';
import { PLAYBACK_RATES, PlaybackRate, TURN_SECONDS, cycleAdvance, parseRate } from '../src/state/playback';
import { RegularTurn, TOPS, TURN_STYLES } from '../src/viewer/poses/regular-turn';
import { surfaceFor } from '../src/viewer/surface';
import { TOPS_POSE } from '../src/viewer/turn-heading';
import { realTurnSeconds } from '../src/viewer/turn-time';

describe('playback rate', () => {
  it('plays a left and a right turn in two real turn times at 1×', () => {
    assert.strictEqual(cycleAdvance(2.4, 1.2, PlaybackRate.Full), 1);
    assert.strictEqual(cycleAdvance(1.2, 1.2, PlaybackRate.Full), 0.5);
  });

  it('slows the clock by the rate', () => {
    for (const rate of PLAYBACK_RATES) assert.closeTo(cycleAdvance(1, 1, rate), rate / 2, 1e-12);
    assert.strictEqual(cycleAdvance(8 * 2.4, 1.2, PlaybackRate.Eighth), 1);
  });

  it('reads back a stored rate and falls back to real time', () => {
    for (const rate of PLAYBACK_RATES) assert.strictEqual(parseRate(String(rate)), rate);
    assert.strictEqual(parseRate(null), PlaybackRate.Full);
    assert.strictEqual(parseRate('2'), PlaybackRate.Full);
  });

  it('times a turn as its path length over its speed', () => {
    const cases = [
      [RegularTurn.Moguls, TURN_STYLES[RegularTurn.Moguls].scenarios.moderate.speedMps],
      [TOPS_POSE, TOPS.scenarios.moderate.speedMps],
      [RegularTurn.Carving, TURN_STYLES[RegularTurn.Carving].scenarios.moderate.speedMps],
    ] as const;
    for (const [pose, speed] of cases) {
      const surface = surfaceFor(pose, Intensity.Moderate);
      const seconds = realTurnSeconds(pose, Intensity.Moderate);
      assert.closeTo(seconds, surface.speed / speed, 1e-12);
      // The path is at least the turn's run down the fall line.
      assert.isTrue(seconds >= surface.spacing / speed);
    }
  });

  it('turns about one mogul spacing apart in the zipper, near two turns a second', () => {
    const surface = surfaceFor(RegularTurn.Moguls, Intensity.Moderate);
    const speed = TURN_STYLES[RegularTurn.Moguls].scenarios.moderate.speedMps;
    const seconds = realTurnSeconds(RegularTurn.Moguls, Intensity.Moderate);
    assert.closeTo(seconds, surface.spacing / speed, 0.1 * seconds);
    assert.isTrue(seconds < 0.7);
    assert.isTrue(seconds < realTurnSeconds(TOPS_POSE, Intensity.Moderate));
    assert.isTrue(realTurnSeconds(RegularTurn.Moguls, Intensity.Dynamic) < realTurnSeconds(RegularTurn.Moguls, Intensity.Gentle));
  });

  it('keeps the old fixed turn for a motion with no speed', () => {
    assert.strictEqual(realTurnSeconds('stork-turns', Intensity.Moderate), TURN_SECONDS);
  });
});
