import { useAtom } from '@effect/atom-solid';
import { For, createMemo, createUniqueId } from 'solid-js';
import type { JSX } from 'solid-js';
import { MAX_EFFORT, effortAt, effortColour, effortWord } from '../../content/effort';
import type { EffortRamp } from '../../content/effort';
import type { ActivationIntensity, Intensity } from '../../content/schema';
import { playingAtom, turnTimeAtom } from '../../state/playback';

const SAMPLES = 48;
const W = 300;

/** Effort through one turn: height and colour both rise with effort; a violet playhead marks now. */
export const EffortStrip = (props: {
  readonly intensity: ActivationIntensity;
  readonly setting: Intensity;
  readonly ramp: EffortRamp;
  readonly height: number;
  /** Dragging the strip scrubs the turn. */
  readonly scrub?: boolean;
  readonly label: string;
}): JSX.Element => {
  const id = createUniqueId();
  const [t, setT] = useAtom(() => turnTimeAtom);
  const [, setPlaying] = useAtom(() => playingAtom);
  const h = (): number => props.height;
  const samples = createMemo(() =>
    Array.from({ length: SAMPLES + 1 }, (_, i) => {
      const at = i / SAMPLES;
      return { at, v: effortAt(props.intensity, at, props.setting) };
    }),
  );
  const top = (v: number): number => h() - Math.max(1.5, (v / MAX_EFFORT) * (h() - 2));
  const area = createMemo(
    () => `M0 ${h()} ${samples().map((s) => `L${(s.at * W).toFixed(1)} ${top(s.v).toFixed(1)}`).join(' ')} L${W} ${h()} Z`,
  );
  const now = createMemo(() => effortWord(effortAt(props.intensity, t(), props.setting)));

  const scrubTo = (e: PointerEvent, el: Element): void => {
    const r = el.getBoundingClientRect();
    setPlaying(false);
    setT(Math.min(0.999, Math.max(0, (e.clientX - r.left) / r.width)));
  };

  return (
    <svg
      class="strip"
      viewBox={`0 0 ${W} ${h()}`}
      preserveAspectRatio="none"
      style={{ height: `${h()}px`, cursor: props.scrub === true ? 'ew-resize' : undefined }}
      role="img"
      aria-label={`${props.label}: ${now()} now`}
      onPointerDown={(e) => {
        if (props.scrub !== true) return;
        e.currentTarget.setPointerCapture(e.pointerId);
        scrubTo(e, e.currentTarget);
      }}
      onPointerMove={(e) => {
        if (props.scrub === true && e.currentTarget.hasPointerCapture(e.pointerId)) scrubTo(e, e.currentTarget);
      }}
    >
      <defs>
        <linearGradient id={id} x1="0" x2="1" y1="0" y2="0">
          <For each={samples()}>{(s) => <stop offset={s.at} stop-color={effortColour(s.v, props.ramp)} />}</For>
        </linearGradient>
      </defs>
      <line class="strip-base" x1="0" x2={W} y1={h() - 0.5} y2={h() - 0.5} vector-effect="non-scaling-stroke" />
      <path d={area()} fill={`url(#${id})`} />
      <line class="strip-phase" x1={W / 3} x2={W / 3} y1="0" y2={h()} vector-effect="non-scaling-stroke" />
      <line class="strip-phase" x1={(2 * W) / 3} x2={(2 * W) / 3} y1="0" y2={h()} vector-effect="non-scaling-stroke" />
      <line class="playhead" x1={t() * W} x2={t() * W} y1="0" y2={h()} vector-effect="non-scaling-stroke" />
    </svg>
  );
};
