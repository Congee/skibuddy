import { useAtom } from '@effect/atom-solid';
import { For, createEffect, onCleanup } from 'solid-js';
import type { JSX } from 'solid-js';
import { PHASES } from '../content/schema';
import { TURN_SECONDS, phaseAt, playingAtom, turnTimeAtom, wrapTurn } from '../state/playback';

const label = (phase: string): string => phase.charAt(0).toUpperCase() + phase.slice(1);

export const Scrubber = (): JSX.Element => {
  const [t, setT] = useAtom(() => turnTimeAtom);
  const [playing, setPlaying] = useAtom(() => playingAtom);

  createEffect(() => {
    if (!playing()) return;
    let last = performance.now();
    let frame = requestAnimationFrame(function tick(now) {
      setT((prev) => wrapTurn(prev + (now - last) / 1000 / TURN_SECONDS));
      last = now;
      frame = requestAnimationFrame(tick);
    });
    onCleanup(() => cancelAnimationFrame(frame));
  });

  return (
    <div class="scrubber">
      <button type="button" onClick={() => setPlaying((p) => !p)} aria-pressed={playing()}>
        {playing() ? 'Pause' : 'Play'}
      </button>
      <div class="scrubber-track">
        <input
          type="range"
          min="0"
          max="0.999"
          step="0.001"
          value={t()}
          aria-label="Position in the turn"
          onInput={(e) => {
            setPlaying(false);
            setT(Number(e.currentTarget.value));
          }}
        />
        <ol class="phases">
          <For each={PHASES}>{(phase) => <li classList={{ current: phaseAt(t()) === phase }}>{label(phase)}</li>}</For>
        </ol>
      </div>
    </div>
  );
};
