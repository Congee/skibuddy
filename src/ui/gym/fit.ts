import { activationsFor } from '../../content/match';
import { contractionsOf, INTENSITIES, phaseContraction } from '../../content/schema';
import type { Contraction, ExerciseTarget, Movement, Muscle } from '../../content/schema';

export const TargetFit = { Same: 'same', OtherContraction: 'other-contraction', Mobilises: 'mobilises', NotInDrill: 'not-in-drill' } as const;
export type TargetFit = (typeof TargetFit)[keyof typeof TargetFit];

export interface TargetMatch {
  readonly fit: TargetFit;
  /** How the drill works this muscle, across sides and settings. */
  readonly drillContractions: ReadonlyArray<Contraction>;
}

/** Whether the drill works an exercise target's muscle, and in the same way. */
export const targetMatch = (
  movement: Movement,
  target: ExerciseTarget,
  muscles: ReadonlyArray<Muscle> = [],
): TargetMatch => {
  const hits = activationsFor(movement, target.muscle, muscles);
  const drillContractions = [...new Set(hits.flatMap((a) => INTENSITIES.flatMap((i) => contractionsOf(phaseContraction(a.contraction, i)))))];
  if (hits.length === 0) return { fit: TargetFit.NotInDrill, drillContractions };
  if (target.contraction === undefined) return { fit: TargetFit.Mobilises, drillContractions };
  return {
    fit: drillContractions.includes(target.contraction) ? TargetFit.Same : TargetFit.OtherContraction,
    drillContractions,
  };
};
