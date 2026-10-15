/** Timers, injectable for tests. */
export interface TickerClock {
  readonly now: () => number;
  readonly setTimer: (callback: () => void, ms: number) => number;
  readonly clearTimer: (id: number) => void;
}

export interface Ticker {
  readonly start: () => void;
  readonly stop: () => void;
  readonly running: () => boolean;
}

/** Longer gaps (a throttled tab) advance by this much at most. */
const MAX_STEP_MS = 100;

export const browserTickerClock: TickerClock = {
  now: () => performance.now(),
  setTimer: (callback, ms) => window.setTimeout(callback, ms),
  clearTimer: (id) => window.clearTimeout(id),
};

/**
 * Calls `step` with the elapsed seconds at most `fps` times a second. It runs on
 * a timer, not on animation frames: the frame that draws the step is the viewer's
 * own, so nothing wakes at the display's rate.
 */
export const createTicker = (step: (seconds: number) => void, fps: number, clock: TickerClock = browserTickerClock): Ticker => {
  const interval = 1000 / fps;
  let timer: number | null = null;
  let last = 0;

  const schedule = (): void => {
    timer = clock.setTimer(tick, Math.max(0, last + interval - clock.now()));
  };
  const tick = (): void => {
    timer = null;
    const now = clock.now();
    step(Math.min(now - last, MAX_STEP_MS) / 1000);
    last = now;
    schedule();
  };

  return {
    start: () => {
      if (timer !== null) return;
      last = clock.now();
      schedule();
    },
    stop: () => {
      if (timer !== null) clock.clearTimer(timer);
      timer = null;
    },
    running: () => timer !== null,
  };
};
