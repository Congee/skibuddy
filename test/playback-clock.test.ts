import { assert, describe, it } from '@effect/vitest';
import { MIN_VISIBLE_FRACTION, createAutoPause } from '../src/state/auto-pause';
import { PLAYBACK_FPS } from '../src/state/playback';
import { createTicker } from '../src/state/ticker';
import type { TickerClock } from '../src/state/ticker';

/** Virtual time whose timers fire `lateMs` after they are due, as real ones do. */
const virtualClock = (lateMs = 0): TickerClock & { readonly advance: (ms: number) => void; readonly wakeups: () => number; readonly idle: () => boolean } => {
  let now = 0;
  let id = 1;
  let wakeups = 0;
  const timers = new Map<number, { readonly at: number; readonly cb: () => void }>();
  return {
    now: () => now,
    setTimer: (cb, ms) => {
      timers.set(id, { at: now + ms + lateMs, cb });
      return id++;
    },
    clearTimer: (t) => {
      timers.delete(t);
    },
    advance: (ms) => {
      const to = now + ms;
      for (;;) {
        const next = [...timers.entries()].toSorted((a, b) => a[1].at - b[1].at)[0];
        if (next === undefined || next[1].at > to) break;
        timers.delete(next[0]);
        now = next[1].at;
        wakeups++;
        next[1].cb();
      }
      now = to;
    },
    wakeups: () => wakeups,
    idle: () => timers.size === 0,
  };
};

describe('createTicker', () => {
  for (const late of [0, 1, 7]) {
    it(`steps at most ${PLAYBACK_FPS} times a second with timers ${late} ms late`, () => {
      const clock = virtualClock(late);
      const steps: Array<number> = [];
      const ticker = createTicker((s) => steps.push(s), PLAYBACK_FPS, clock);
      ticker.start();
      clock.advance(10_000);
      ticker.stop();
      assert.isAtMost(steps.length, PLAYBACK_FPS * 10);
      assert.isAtLeast(steps.length, PLAYBACK_FPS * 10 * 0.8);
      // Steps carry real elapsed time, so the turn's speed does not depend on the rate.
      const total = steps.reduce((a, b) => a + b, 0);
      assert.approximately(total, 10, 0.05);
    });
  }

  it('wakes once per step', () => {
    const clock = virtualClock();
    let steps = 0;
    const ticker = createTicker(() => steps++, PLAYBACK_FPS, clock);
    ticker.start();
    clock.advance(1001);
    ticker.stop();
    assert.strictEqual(steps, PLAYBACK_FPS);
    assert.strictEqual(clock.wakeups(), steps);
  });

  it('leaves nothing scheduled when stopped', () => {
    const clock = virtualClock();
    let steps = 0;
    const ticker = createTicker(() => steps++, PLAYBACK_FPS, clock);
    ticker.start();
    clock.advance(100);
    ticker.stop();
    const before = steps;
    clock.advance(1000);
    assert.strictEqual(steps, before);
    assert.isTrue(clock.idle());
    assert.isFalse(ticker.running());
  });

  it('stays stopped when a step stops it', () => {
    const clock = virtualClock();
    let steps = 0;
    const ticker = createTicker(
      () => {
        steps++;
        ticker.stop();
      },
      PLAYBACK_FPS,
      clock,
    );
    ticker.start();
    clock.advance(1000);
    assert.strictEqual(steps, 1);
    assert.isTrue(clock.idle());
    assert.isFalse(ticker.running());
  });

  it('never schedules anything before start', () => {
    const clock = virtualClock();
    createTicker(() => undefined, PLAYBACK_FPS, clock);
    clock.advance(1000);
    assert.isTrue(clock.idle());
    assert.strictEqual(clock.wakeups(), 0);
  });
});

const setup = (playing = true): { readonly auto: ReturnType<typeof createAutoPause>; readonly pauses: () => number } => {
  let state = playing;
  let pauses = 0;
  const auto = createAutoPause(
    () => state,
    () => {
      pauses++;
      state = false;
    },
  );
  return { auto, pauses: () => pauses };
};

describe('createAutoPause', () => {
  it('pauses when the page hides', () => {
    const { auto, pauses } = setup();
    auto.update({ hidden: true });
    assert.strictEqual(pauses(), 1);
  });

  it('pauses when the figure scrolls below the visible threshold', () => {
    const { auto, pauses } = setup();
    auto.update({ visibleFraction: 0.5 });
    assert.strictEqual(pauses(), 0);
    auto.update({ visibleFraction: MIN_VISIBLE_FRACTION / 2 });
    assert.strictEqual(pauses(), 1);
  });

  it('does not pause what is not playing', () => {
    const { auto, pauses } = setup(false);
    auto.update({ hidden: true, visibleFraction: 0 });
    assert.strictEqual(pauses(), 0);
  });

  it('never resumes on return, and leaves play pressed while out of sight alone', () => {
    let playing = true;
    let calls = 0;
    const auto = createAutoPause(
      () => playing,
      () => {
        calls++;
        playing = false;
      },
    );
    auto.update({ visibleFraction: 0 });
    auto.update({ visibleFraction: 1 });
    assert.isFalse(playing);
    auto.update({ visibleFraction: 0.05 });
    playing = true;
    // Another off-screen report while already off screen is not a new reason to stop.
    auto.update({ visibleFraction: 0.02 });
    assert.isTrue(playing);
    assert.strictEqual(calls, 1);
    // Hiding the page still pauses it.
    auto.update({ hidden: true });
    assert.isFalse(playing);
  });
});
