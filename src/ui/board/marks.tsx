import type { JSX } from 'solid-js';
import { Confidence } from '../../content/schema';
import type { Phase } from '../../content/schema';
import { stamp } from './board.css';

export const LEVEL_WORDS = ['rest', 'light', 'working', 'hard'] as const;

export const CONFIDENCE_WORDS: Record<Confidence, string> = {
  [Confidence.High]: 'Measured',
  [Confidence.Medium]: 'Inferred',
  [Confidence.Low]: 'Opinion',
};

/** Drops parenthetical detail, e.g. "Calf (gastrocnemius and soleus)". */
export const shortName = (name: string): string => name.replace(/\s*\(.*\)\s*$/, '');

export const phaseLabel = (phase: Phase): string => phase.charAt(0).toUpperCase() + phase.slice(1);

export const Stamp = (props: { readonly confidence: Confidence; readonly tone?: 'slat' | 'plate' | 'pin' }): JSX.Element => (
  <span class={stamp({ confidence: props.confidence, tone: props.tone ?? 'slat' })}>
    {CONFIDENCE_WORDS[props.confidence]}
  </span>
);
