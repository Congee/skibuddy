import { useAtom } from '@effect/atom-solid';
import { Slider } from '@ark-ui/solid/slider';
import { For, createEffect, createMemo, onCleanup } from 'solid-js';
import type { Accessor, JSX } from 'solid-js';
import { PHASES } from '../../content/schema';
import type { Phase } from '../../content/schema';
import { MIN_VISIBLE_FRACTION, createAutoPause } from '../../state/auto-pause';
import { PLAYBACK_FPS, TURN_SECONDS, phaseAt, phaseCentre, pinsAtom, playingAtom, turnTimeAtom, wrapTurn } from '../../state/playback';
import { createTicker } from '../../state/ticker';
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

/**
 * Runs the turn while playing, at most PLAYBACK_FPS steps a second. It starts
 * paused and pauses itself when the page hides or `figure` scrolls out of sight.
 */
export const usePlayback = (reducedMotion: Accessor<boolean>, figure: Accessor<Element | undefined>): void => {
  const [playing, setPlaying] = useAtom(() => playingAtom);
  const [, setT] = useAtom(() => turnTimeAtom);
  createEffect(() => {
    if (reducedMotion()) setPlaying(false);
  });

  const ticker = createTicker((seconds) => setT((prev) => wrapTurn(prev + seconds / TURN_SECONDS)), PLAYBACK_FPS);
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
        const next = phaseCentre(v);
        if (next !== t()) setT(next);
      }}
    />
  );
};

/** A side-on lift tower: crossarm, sheaves on the cable, pole and footing. */
const Tower = (props: { readonly at: number }): JSX.Element => (
  <svg class={s.tower} style={{ left: `${props.at * 100}%` }} viewBox="0 0 18 32" aria-hidden="true">
    <path class={s.towerInk} d="M2 4H16M9 4V30M5 30.5H13" stroke-width="2.5" />
    <path class={s.towerInk} d="M4 4V7.5M14 4V7.5" stroke-width="1.5" />
    <circle class={s.towerInk} cx="4" cy="8.5" r="1.6" />
    <circle class={s.towerInk} cx="14" cy="8.5" r="1.6" />
  </svg>
);

export const LiftLine = (props: {
  readonly skeleton: boolean;
  readonly onSkeleton: (on: boolean) => void;
  /** More figure controls after the switches. */
  readonly controls?: JSX.Element;
}): JSX.Element => {
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
          if (next !== t()) setT(next);
        }}
      >
        <Slider.Control class={s.control}>
          <Slider.Track class={s.track}>
            <Slider.Range class={s.range} />
          </Slider.Track>
          <For each={towers}>{(at) => <Tower at={at} />}</For>
          <Slider.Thumb index={0} class={s.thumb}>
            <svg class={s.chair} viewBox="0 0 32 48" aria-hidden="true">
              <path class={s.chairLine} d="M16 11V16Q16 18 14 18H8.5V21M21 38L24.5 45H30" stroke-width="2.25" />
              <path class={s.chairSeat} d="M5.5 20.5H10.5L12 32.5H27V38.5H8Z" />
              <circle class={s.chairInk} cx="16" cy="9" r="3.5" />
            </svg>
            <Slider.HiddenInput />
          </Slider.Thumb>
        </Slider.Control>
      </Slider.Root>
      <div class={s.below}>
        <PhaseStops look="stops" class={s.stops} />
        <div class={s.toggles}>
          <Switch label="Names on figure" checked={pins()} onChange={setPins} />
          <Switch label="Skeleton" checked={props.skeleton} onChange={props.onSkeleton} />
          {props.controls}
        </div>
      </div>
      <p class={visuallyHidden} aria-live="polite">
        {playing() ? '' : phaseLabel(phase())}
      </p>
    </div>
  );
};
