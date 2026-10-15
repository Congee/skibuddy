import { assert, describe, it } from '@effect/vitest';
import { createFrameScheduler } from '../src/viewer/frame-scheduler';
import type { FrameClock } from '../src/viewer/frame-scheduler';
import { dampOrbit } from '../src/viewer/orbit';
import { pixelRatio } from '../src/viewer/pixel-ratio';

/** A manual animation-frame queue. */
const fakeFrames = (): FrameClock & { readonly queued: () => number; readonly flush: (now: number) => void } => {
  let next = 1;
  const queue = new Map<number, (now: number) => void>();
  return {
    request: (cb) => {
      queue.set(next, cb);
      return next++;
    },
    cancel: (id) => {
      queue.delete(id);
    },
    queued: () => queue.size,
    flush: (now) => {
      const due = [...queue.values()];
      queue.clear();
      for (const cb of due) cb(now);
    },
  };
};

describe('createFrameScheduler', () => {
  it('schedules nothing until asked', () => {
    const clock = fakeFrames();
    const draws: Array<number> = [];
    const s = createFrameScheduler((now) => (draws.push(now), false), clock);
    assert.isFalse(s.pending());
    assert.strictEqual(clock.queued(), 0);
    clock.flush(16);
    assert.deepStrictEqual(draws, []);
  });

  it('coalesces requests into one frame', () => {
    const clock = fakeFrames();
    let draws = 0;
    const s = createFrameScheduler(() => (draws++, false), clock);
    s.invalidate();
    s.invalidate();
    s.invalidate();
    assert.strictEqual(clock.queued(), 1);
    clock.flush(16);
    assert.strictEqual(draws, 1);
  });

  it('stops after a frame that does not ask for more', () => {
    const clock = fakeFrames();
    let draws = 0;
    const s = createFrameScheduler(() => (draws++, false), clock);
    s.invalidate();
    clock.flush(16);
    clock.flush(32);
    assert.strictEqual(draws, 1);
    assert.isFalse(s.pending());
    assert.strictEqual(clock.queued(), 0);
  });

  it('keeps drawing while the draw still moves, then idles', () => {
    const clock = fakeFrames();
    let left = 3;
    const s = createFrameScheduler(() => --left > 0, clock);
    s.invalidate();
    for (let i = 1; i <= 5; i++) clock.flush(i * 16);
    assert.strictEqual(left, 0);
    assert.isFalse(s.pending());
  });

  it('cancels its frame on dispose and ignores later requests', () => {
    const clock = fakeFrames();
    let draws = 0;
    const s = createFrameScheduler(() => (draws++, false), clock);
    s.invalidate();
    s.dispose();
    s.invalidate();
    clock.flush(16);
    assert.strictEqual(draws, 0);
    assert.strictEqual(clock.queued(), 0);
  });
});

describe('dampOrbit', () => {
  it('eases toward the aim and settles exactly on it', () => {
    let orbit = { azimuth: 0, elevation: 0 };
    const aim = { azimuth: 1, elevation: 0.5 };
    let frames = 0;
    for (; frames < 200; frames++) {
      const step = dampOrbit(orbit, aim, 1 / 30);
      orbit = step.orbit;
      if (step.settled) break;
    }
    assert.isBelow(frames, 30);
    assert.deepStrictEqual(orbit, aim);
  });

  it('is settled at once when already there', () => {
    const aim = { azimuth: 0.7, elevation: 0.25 };
    assert.isTrue(dampOrbit(aim, aim, 0.016).settled);
  });

  it('caps the step after a long idle', () => {
    const first = dampOrbit({ azimuth: 0, elevation: 0 }, { azimuth: 1, elevation: 0 }, 10);
    assert.isBelow(first.orbit.azimuth, 1);
    assert.isFalse(first.settled);
  });
});

describe('pixelRatio', () => {
  it('caps desktop at 2 and handheld at 1.5', () => {
    assert.strictEqual(pixelRatio({ devicePixelRatio: 3, handheld: false, playing: false }), 2);
    assert.strictEqual(pixelRatio({ devicePixelRatio: 3, handheld: true, playing: false }), 1.5);
    assert.strictEqual(pixelRatio({ devicePixelRatio: 1, handheld: false, playing: false }), 1);
  });

  it('draws fewer pixels while playing, but not below 1', () => {
    assert.strictEqual(pixelRatio({ devicePixelRatio: 2, handheld: false, playing: true }), 1.5);
    assert.strictEqual(pixelRatio({ devicePixelRatio: 3, handheld: true, playing: true }), 1.125);
    assert.strictEqual(pixelRatio({ devicePixelRatio: 1, handheld: false, playing: true }), 1);
    assert.strictEqual(pixelRatio({ devicePixelRatio: 0.8, handheld: false, playing: true }), 0.8);
  });
});
