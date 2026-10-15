import { useAtom } from '@effect/atom-solid';
import { Slider } from '@ark-ui/solid/slider';
import { For, createEffect, createMemo, onCleanup, onMount } from 'solid-js';
import type { Accessor, JSX } from 'solid-js';
import { PHASES } from '../../content/schema';
import type { Phase } from '../../content/schema';
import { TURN_SECONDS, phaseAt, phaseCentre, pinsAtom, playingAtom, turnTimeAtom, wrapTurn } from '../../state/playback';
import { phaseLabel } from '../board/marks';
import { IconButton } from '../components/IconButton';
import { Segmented } from '../components/Segmented';
import { Switch } from '../components/Switch';
import { Pause, Play } from '../icons';
import { visuallyHidden } from '../theme/global.css';
import * as s from './lift.css';

const MAX = 0.999;
const PHASE_OPTIONS = PHASES.map((p) => ({ value: p, label: phaseLabel(p) }));
const isPhase = (v: string): v is Phase => (PHASES as ReadonlyArray<string>).includes(v);

/** Autoplays the turn unless reduced motion is set. */
export const usePlayback = (reducedMotion: Accessor<boolean>): void => {
  const [playing, setPlaying] = useAtom(() => playingAtom);
  const [, setT] = useAtom(() => turnTimeAtom);
  onMount(() => setPlaying(!reducedMotion()));
  createEffect(() => {
    if (reducedMotion()) setPlaying(false);
  });
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
};

/** Phase picker; jumps the playhead to the phase's middle. */
export const PhaseStops = (props: { readonly look: 'stops' | 'tabs'; readonly class?: string }): JSX.Element => {
  const [t, setT] = useAtom(() => turnTimeAtom);
  const [, setPlaying] = useAtom(() => playingAtom);
  return (
    <Segmented
      label="Turn phase"
      look={props.look}
      class={props.class ?? ''}
      options={PHASE_OPTIONS}
      value={phaseAt(t())}
      onChange={(v) => {
        if (!isPhase(v)) return;
        setPlaying(false);
        setT(phaseCentre(v));
      }}
    />
  );
};

export const LiftLine = (): JSX.Element => {
  const [t, setT] = useAtom(() => turnTimeAtom);
  const [playing, setPlaying] = useAtom(() => playingAtom);
  const [pins, setPins] = useAtom(() => pinsAtom);
  const phase = createMemo(() => phaseAt(t()));
  const towers = [0, 1 / 3, 2 / 3, 1];

  return (
    <div class={s.lift}>
      <IconButton
        class={s.play}
        label={playing() ? 'Pause the turn' : 'Play the turn'}
        onClick={() => setPlaying((p) => !p)}
      >
        {playing() ? <Pause class={s.playIcon} /> : <Play class={s.playIcon} />}
      </IconButton>
      <div>
        <Slider.Root
          class={s.root}
          min={0}
          max={MAX}
          step={0.001}
          largeStep={0.1}
          value={[t()]}
          thumbAlignment="center"
          aria-label={['Position in the turn']}
          getAriaValueText={(d) => `${phaseLabel(phaseAt(d.value))}, ${Math.round((d.value / MAX) * 100)}% through the turn`}
          onValueChange={(d) => {
            const next = d.value[0];
            if (next === undefined) return;
            setPlaying(false);
            setT(next);
          }}
        >
          <Slider.Control class={s.control}>
            <Slider.Track class={s.track}>
              <Slider.Range class={s.range} />
            </Slider.Track>
            <For each={towers}>{(at) => <span class={s.tower} style={{ left: `${at * 100}%` }} aria-hidden="true" />}</For>
            <Slider.Thumb index={0} class={s.thumb}>
              <svg class={s.chair} viewBox="0 0 28 44" aria-hidden="true">
                <circle class={s.chairInk} cx="14" cy="9" r="4.5" />
                <path class={s.chairInk} d="M14 9v20" stroke-width="2.5" fill="none" />
                <path class={s.chairInk} d="M6 22v10h16" stroke-width="2.5" fill="none" />
                <rect class={s.chairSeat} x="6" y="29" width="17" height="6" rx="1" />
              </svg>
              <Slider.HiddenInput />
            </Slider.Thumb>
          </Slider.Control>
        </Slider.Root>
        <div class={s.below}>
          <PhaseStops look="stops" class={s.stops} />
          <Switch class={s.pinsToggle} label="Names on figure" checked={pins()} onChange={setPins} />
        </div>
        <p class={visuallyHidden} aria-live="polite">
          {playing() ? '' : phaseLabel(phase())}
        </p>
      </div>
    </div>
  );
};
