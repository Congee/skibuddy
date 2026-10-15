import type { Contraction, ExerciseTarget, Movement } from '../../content/schema';

export const TargetFit = { Same: 'same', OtherContraction: 'other-contraction', NotInDrill: 'not-in-drill' } as const;
export type TargetFit = (typeof TargetFit)[keyof typeof TargetFit];

export interface TargetMatch {
  readonly fit: TargetFit;
  /** How the drill works this muscle, across sides. */
  readonly drillContractions: ReadonlyArray<Contraction>;
}

/** Whether the drill works an exercise target's muscle, and in the same way. */
export const targetMatch = (movement: Movement, target: ExerciseTarget): TargetMatch => {
  const hits = movement.activations.filter((a) => a.muscle === target.muscle);
  const drillContractions = [...new Set(hits.flatMap((a) => a.contraction))];
  if (hits.length === 0) return { fit: TargetFit.NotInDrill, drillContractions };
  return {
    fit: drillContractions.includes(target.contraction) ? TargetFit.Same : TargetFit.OtherContraction,
    drillContractions,
  };
};
