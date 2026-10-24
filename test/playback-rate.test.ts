import { assert, describe, it } from '@effect/vitest';
import { Intensity } from '../src/content/schema';
import { PLAYBACK_RATES, PlaybackRate, TURN_SECONDS, cycleAdvance, parseRate } from '../src/state/playback';
import { Snow } from '../src/physics/edge';
import { TurnKind, taskFor } from '../src/physics/task';
import { turnProfile } from '../src/physics/turn';
import { RegularTurn, TOPS } from '../src/viewer/poses/regular-turn';
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
    const surface = surfaceFor(TOPS_POSE, Intensity.Moderate);
    const speed = TOPS.scenarios.moderate.speedMps;
    const seconds = realTurnSeconds(TOPS_POSE, Intensity.Moderate);
    assert.closeTo(seconds, surface.speed / speed, 1e-12);
    // The path is at least the turn's run down the fall line.
    assert.isTrue(seconds >= surface.spacing / speed);
    // A migrated groomed cell: its profile's period, its path per turn at about the task's speed (2%, inferred).
    for (const i of [Intensity.Gentle, Intensity.Moderate, Intensity.Dynamic]) {
      const task = taskFor(TurnKind.GS, i);
      const p = turnProfile(task, Snow.HardGroomed);
      const cell = surfaceFor(RegularTurn.GS, i);
      const t = realTurnSeconds(RegularTurn.GS, i);
      assert.strictEqual(t, p.periodS, i);
      assert.closeTo(cell.speed / t, task.speedMps, 0.02 * task.speedMps, i);
      assert.isTrue(cell.speed >= cell.spacing, i);
    }
  });

  it('turns about one mogul spacing apart in the zipper, near two turns a second', () => {
    const task = taskFor(TurnKind.Moguls, Intensity.Moderate);
    const seconds = realTurnSeconds(RegularTurn.Moguls, Intensity.Moderate);
    // The cell's own spacing and speed, inside motion-model §3's moderate 3–4 m at 6–8 m/s (inferred).
    assert.closeTo(seconds, task.bumpSpacingM / task.speedMps, 1e-12);
    assert.isTrue(task.bumpSpacingM >= 3 && task.bumpSpacingM <= 4 && task.speedMps >= 6 && task.speedMps <= 8);
    // FIS pace 0.35–0.4 s per bump is the dynamic cell's (motion-model §3, measured rules).
    const fis = realTurnSeconds(RegularTurn.Moguls, Intensity.Dynamic);
    assert.isTrue(fis >= 0.35 && fis <= 0.4, `${fis}`);
    assert.isTrue(seconds < 0.7);
    assert.isTrue(seconds < realTurnSeconds(TOPS_POSE, Intensity.Moderate));
    assert.isTrue(realTurnSeconds(RegularTurn.Moguls, Intensity.Dynamic) < realTurnSeconds(RegularTurn.Moguls, Intensity.Gentle));
  });

  it('keeps the old fixed turn for a motion with no speed', () => {
    assert.strictEqual(realTurnSeconds('stork-turns', Intensity.Moderate), TURN_SECONDS);
  });
});
