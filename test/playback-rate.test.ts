import { assert, describe, it } from '@effect/vitest';
import { Intensity } from '../src/content/schema';
import { PLAYBACK_RATES, PlaybackRate, TURN_SECONDS, cycleAdvance, parseRate } from '../src/state/playback';
import { RegularTurn } from '../src/viewer/poses/regular-turn';
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

  it('times a turn from its speed and shape, quicker as it is skied harder', () => {
    const gentle = realTurnSeconds(RegularTurn.Moguls, Intensity.Gentle);
    const dynamic = realTurnSeconds(RegularTurn.Moguls, Intensity.Dynamic);
    assert.isTrue(dynamic < gentle);
    assert.isTrue(realTurnSeconds(RegularTurn.Moguls, Intensity.Moderate) < realTurnSeconds(RegularTurn.Carving, Intensity.Moderate));
  });

  it('keeps the old fixed turn for a motion with no speed', () => {
    assert.strictEqual(realTurnSeconds('stork-turns', Intensity.Moderate), TURN_SECONDS);
  });
});
