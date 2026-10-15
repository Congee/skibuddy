import { For, createMemo, createUniqueId } from 'solid-js';
import type { Accessor, JSX } from 'solid-js';
import { MAX_EFFORT, effortColour } from '../../content/effort';
import type { EffortRamp } from '../../content/effort';
import type { ActivationIntensity, Intensity } from '../../content/schema';
import * as s from './board.css';
import { stripSamples } from './intensity';

/** Vertical position of effort `v` inside a strip, in px from the top. */
export const stripY = (v: number): number => s.STRIP_HEIGHT - (v / MAX_EFFORT) * (s.STRIP_HEIGHT - s.STRIP_TOP);

/** One muscle's effort across the whole turn at one setting, with a playhead and a dot the board moves. */
export const Strip = (props: {
  readonly intensity: ActivationIntensity;
  /** Redraws once when this changes. */
  readonly setting: Intensity;
  readonly label: string;
  readonly ramp: Accessor<EffortRamp>;
  readonly playhead: (el: HTMLSpanElement) => void;
  readonly dot: (el: HTMLSpanElement) => void;
}): JSX.Element => {
  const id = `strip-${createUniqueId()}`;
  const h = s.STRIP_HEIGHT;
  const samples = createMemo(() => stripSamples(props.intensity, props.setting));
  const edge = createMemo(() =>
    samples().map(({ t, v }, i) => `${i === 0 ? 'M' : 'L'}${(t * 100).toFixed(2)},${stripY(v).toFixed(2)}`).join(' '),
  );
  const area = (): string => `${edge()} L100,${h} L0,${h} Z`;
  return (
    <span class={s.strip} role="img" aria-label={props.label}>
      <svg class={s.stripSvg} viewBox={`0 0 100 ${h}`} preserveAspectRatio="none" aria-hidden="true">
        <defs>
          <linearGradient id={id}>
            <For each={samples()}>{(p) => <stop offset={p.t} stop-color={effortColour(p.v, props.ramp())} />}</For>
          </linearGradient>
        </defs>
        <path d={area()} fill={`url(#${id})`} />
        <line class={s.stripTick} x1="33.333" y1="0" x2="33.333" y2={h} vector-effect="non-scaling-stroke" />
        <line class={s.stripTick} x1="66.667" y1="0" x2="66.667" y2={h} vector-effect="non-scaling-stroke" />
        <path class={s.stripEdge} d={edge()} vector-effect="non-scaling-stroke" />
        <line class={s.stripBase} x1="0" y1={h} x2="100" y2={h} vector-effect="non-scaling-stroke" />
      </svg>
      <span class={s.playhead} ref={props.playhead} aria-hidden="true" />
      <span class={s.dot} ref={props.dot} aria-hidden="true" />
    </span>
  );
};
