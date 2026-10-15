import { Show } from 'solid-js';
import type { JSX } from 'solid-js';
import { Confidence } from '../../content/schema';
import type { Phase } from '../../content/schema';
import { visuallyHidden } from '../theme/global.css';
import { stamp, tag } from './board.css';

export const LEVEL_WORDS = ['rest', 'light', 'working', 'hard'] as const;

export const CONFIDENCE_WORDS: Record<Confidence, string> = {
  [Confidence.High]: 'Measured',
  [Confidence.Medium]: 'Inferred',
  [Confidence.Low]: 'Opinion',
};

/** Drops parenthetical detail, e.g. "Calf (gastrocnemius and soleus)". */
export const shortName = (name: string): string => name.replace(/\s*\(.*\)\s*$/, '');

export const phaseLabel = (phase: Phase): string => phase.charAt(0).toUpperCase() + phase.slice(1);

const clampLevel = (level: number): 0 | 1 | 2 | 3 => (level >= 3 ? 3 : level >= 2 ? 2 : level >= 1 ? 1 : 0);

export const Tag = (props: {
  readonly level: number;
  readonly size?: 'small' | 'now' | 'mini';
  readonly phase?: Phase;
  readonly class?: string;
}): JSX.Element => {
  const level = (): 0 | 1 | 2 | 3 => clampLevel(props.level);
  return (
    <span class={`${tag({ level: level(), size: props.size ?? 'small' })} ${props.class ?? ''}`} data-level={level()}>
      <Show when={props.phase}>{(p) => <span class={visuallyHidden}>{phaseLabel(p())} </span>}</Show>
      {level()}
    </span>
  );
};

export const Stamp = (props: { readonly confidence: Confidence; readonly tone?: 'slat' | 'plate' }): JSX.Element => (
  <span class={stamp({ confidence: props.confidence, tone: props.tone ?? 'slat' })}>
    {CONFIDENCE_WORDS[props.confidence]}
  </span>
);
