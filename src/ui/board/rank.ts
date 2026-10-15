import { PHASES } from '../../content/schema';
import type { Activation, Movement, Phase, SourceId } from '../../content/schema';

export const Change = { Up: 'up', Down: 'down', Same: 'same' } as const;
export type Change = (typeof Change)[keyof typeof Change];

export interface RankedSlat {
  /** Index into movement.activations; stable identity across reranks. */
  readonly index: number;
  readonly activation: Activation;
  readonly level: number;
  readonly previousLevel: number;
  readonly change: Change;
}

/** The phase before `phase`; initiation follows the last turn's finish. */
export const previousPhase = (phase: Phase): Phase => {
  const i = PHASES.indexOf(phase);
  return PHASES[(i + PHASES.length - 1) % PHASES.length] ?? phase;
};

const peak = (a: Activation): number => Math.max(...PHASES.map((p) => a.intensity[p]));

const changeOf = (now: number, before: number): Change =>
  now > before ? Change.Up : now < before ? Change.Down : Change.Same;

/** Orders slats by load in `phase`, then by peak load, then by content order. */
export const rankSlats = (activations: ReadonlyArray<Activation>, phase: Phase): ReadonlyArray<RankedSlat> => {
  const before = previousPhase(phase);
  return activations
    .map((activation, index): RankedSlat => {
      const level = activation.intensity[phase];
      const previousLevel = activation.intensity[before];
      return { index, activation, level, previousLevel, change: changeOf(level, previousLevel) };
    })
    .toSorted((a, b) => b.level - a.level || peak(b.activation) - peak(a.activation) || a.index - b.index);
};

/** Numbers each source by its first citation in the movement, from 1. */
export const sourceKeys = (movement: Movement): ReadonlyMap<SourceId, number> => {
  const keys = new Map<SourceId, number>();
  for (const a of movement.activations) {
    for (const s of a.sources) if (!keys.has(s)) keys.set(s, keys.size + 1);
  }
  return keys;
};
