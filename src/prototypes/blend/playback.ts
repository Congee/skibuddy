import { useAtom } from '@effect/atom-solid';
import { createEffect, onCleanup } from 'solid-js';
import type { Accessor } from 'solid-js';
import { MIN_VISIBLE_FRACTION, createAutoPause } from '../../state/auto-pause';
import { PLAYBACK_FPS, TURN_SECONDS, otherTurn, playingAtom, turnDirectionAtom, turnTimeAtom, wrapTurn } from '../../state/playback';
import { createTicker } from '../../state/ticker';

/** Runs the turn clock; pauses for reduced motion, a hidden tab or an off-screen figure. */
export const usePlayback = (reducedMotion: Accessor<boolean>, figure: Accessor<Element | undefined>): void => {
  const [playing, setPlaying] = useAtom(() => playingAtom);
  const [t, setT] = useAtom(() => turnTimeAtom);
  const [, setDirection] = useAtom(() => turnDirectionAtom);
  createEffect(() => {
    if (reducedMotion()) setPlaying(false);
  });

  // Each wrap starts the next turn, the other way.
  const ticker = createTicker((seconds) => {
    const next = t() + seconds / TURN_SECONDS;
    if (Math.floor(next) % 2 === 1) setDirection(otherTurn);
    setT(wrapTurn(next));
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
