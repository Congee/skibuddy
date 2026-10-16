import { useAtom } from '@effect/atom-solid';
import { batch, createEffect, onCleanup } from 'solid-js';
import type { Accessor } from 'solid-js';
import { MIN_VISIBLE_FRACTION, createAutoPause } from '../../state/auto-pause';
import { PLAYBACK_FPS, cycleAdvance, cycleOf, parseRate, playbackRateAtom, playingAtom, turnAt, turnDirectionAtom, turnTimeAtom } from '../../state/playback';
import type { PlaybackRate } from '../../state/playback';
import { createTicker } from '../../state/ticker';

const RATE = 'skibuddy.blend.speed';

/** The viewer's playback speed, kept per browser. */
export const usePlaybackRate = (): readonly [Accessor<PlaybackRate>, (r: PlaybackRate) => void] => {
  const [rate, setRate] = useAtom(() => playbackRateAtom);
  try {
    setRate(parseRate(localStorage.getItem(RATE)));
  } catch {
    // Storage blocked: real time.
  }
  const choose = (r: PlaybackRate): void => {
    setRate(r);
    try {
      localStorage.setItem(RATE, String(r));
    } catch {
      // Private mode: the speed resets next visit.
    }
  };
  return [rate, choose];
};

/** Runs the turn clock at the turn's real time times the rate; pauses for reduced motion, a hidden tab or an off-screen figure. */
export const usePlayback = (reducedMotion: Accessor<boolean>, figure: Accessor<Element | undefined>, turnSeconds: Accessor<number>): void => {
  const [playing, setPlaying] = useAtom(() => playingAtom);
  const [rate] = useAtom(() => playbackRateAtom);
  const [t, setT] = useAtom(() => turnTimeAtom);
  const [direction, setDirection] = useAtom(() => turnDirectionAtom);
  createEffect(() => {
    if (reducedMotion()) setPlaying(false);
  });

  // Loops left turn, right turn until paused.
  const ticker = createTicker((seconds) => {
    const next = turnAt(cycleOf(direction(), t()) + cycleAdvance(seconds, turnSeconds(), rate()));
    // One update, so no frame shows the new side at the old time.
    batch(() => {
      if (next.direction !== direction()) setDirection(next.direction);
      setT(next.t);
    });
  }, PLAYBACK_FPS);
  createEffect(() => {
    if (playing()) ticker.start();
    else ticker.stop();
  });
  onCleanup(() => ticker.stop());

  const auto = createAutoPause(playing, () => setPlaying(false), { hidden: document.hidden, visibleFraction: 1 });
  const onVisibility = (): void => auto.update({ hidden: document.hidden });
  document.addEventListener('visibilitychange', onVisibility);
  onCleanup(() => document.removeEventListener('visibilitychange', onVisibility));
  createEffect(() => {
    const el = figure();
    if (el === undefined) return;
    const seen = new IntersectionObserver((entries) => {
      const last = entries.at(-1);
      if (last !== undefined) auto.update({ visibleFraction: last.intersectionRatio });
    }, { threshold: [0, MIN_VISIBLE_FRACTION] });
    seen.observe(el);
    onCleanup(() => seen.disconnect());
  });
};
