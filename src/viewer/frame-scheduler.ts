/** requestAnimationFrame and cancelAnimationFrame, injectable for tests. */
export interface FrameClock {
  readonly request: (callback: (now: number) => void) => number;
  readonly cancel: (id: number) => void;
}

export interface FrameScheduler {
  /** Asks for one frame; calls before it runs coalesce into it. */
  readonly invalidate: () => void;
  readonly pending: () => boolean;
  readonly dispose: () => void;
}

export const browserFrameClock: FrameClock = {
  request: (callback) => requestAnimationFrame(callback),
  cancel: (id) => cancelAnimationFrame(id),
};

/**
 * Draws on demand: no loop runs while nothing asks for a frame. `draw` returns
 * true while it still moves on its own (camera damping, fades) to get the next one.
 */
export const createFrameScheduler = (draw: (now: number) => boolean, clock: FrameClock = browserFrameClock): FrameScheduler => {
  let id: number | null = null;
  let disposed = false;
  const tick = (now: number): void => {
    id = null;
    if (draw(now)) invalidate();
  };
  const invalidate = (): void => {
    if (id !== null || disposed) return;
    id = clock.request(tick);
  };
  return {
    invalidate,
    pending: () => id !== null,
    dispose: () => {
      disposed = true;
      if (id !== null) clock.cancel(id);
      id = null;
    },
  };
};
