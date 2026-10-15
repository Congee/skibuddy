import { For, createUniqueId } from 'solid-js';
import type { Accessor, JSX } from 'solid-js';
import { MAX_EFFORT, effortAt, effortColour } from '../../content/effort';
import type { EffortRamp } from '../../content/effort';
import type { PhaseIntensity } from '../../content/schema';
import * as s from './board.css';

const SAMPLES = 60;

/** Vertical position of effort `v` inside a strip, in px from the top. */
export const stripY = (v: number): number => s.STRIP_HEIGHT - (v / MAX_EFFORT) * (s.STRIP_HEIGHT - s.STRIP_TOP);

/** One muscle's effort across the whole turn, with a playhead and a dot at `--board-t`. */
export const Strip = (props: {
  readonly intensity: PhaseIntensity;
  readonly label: string;
  readonly ramp: Accessor<EffortRamp>;
  readonly dot: (el: HTMLSpanElement) => void;
}): JSX.Element => {
  const id = `strip-${createUniqueId()}`;
  const h = s.STRIP_HEIGHT;
  const samples = Array.from({ length: SAMPLES + 1 }, (_, i) => {
    const t = i / SAMPLES;
    return { t, v: effortAt(props.intensity, t) };
  });
  const edge = samples.map(({ t, v }, i) => `${i === 0 ? 'M' : 'L'}${(t * 100).toFixed(2)},${stripY(v).toFixed(2)}`).join(' ');
  const area = `${edge} L100,${h} L0,${h} Z`;
  return (
    <span class={s.strip} role="img" aria-label={props.label}>
      <svg class={s.stripSvg} viewBox={`0 0 100 ${h}`} preserveAspectRatio="none" aria-hidden="true">
        <defs>
          <linearGradient id={id}>
            <For each={samples}>{(p) => <stop offset={p.t} stop-color={effortColour(p.v, props.ramp())} />}</For>
          </linearGradient>
        </defs>
        <path d={area} fill={`url(#${id})`} />
        <line class={s.stripTick} x1="33.333" y1="0" x2="33.333" y2={h} vector-effect="non-scaling-stroke" />
        <line class={s.stripTick} x1="66.667" y1="0" x2="66.667" y2={h} vector-effect="non-scaling-stroke" />
        <path class={s.stripEdge} d={edge} vector-effect="non-scaling-stroke" />
        <line class={s.stripBase} x1="0" y1={h} x2="100" y2={h} vector-effect="non-scaling-stroke" />
      </svg>
      <span class={s.playhead} aria-hidden="true" />
      <span class={s.dot} ref={props.dot} aria-hidden="true" />
    </span>
  );
};
