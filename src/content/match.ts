import { contractionsOf, INTENSITIES, Intensity, PHASES, phaseContraction, phaseIntensity } from './schema';
import type { Activation, Exercise, Movement, Muscle, MuscleId } from './schema';

export interface ExerciseMatch {
  readonly exercise: Exercise;
  readonly score: number;
  readonly muscles: ReadonlyArray<MuscleId>;
}

/** The activations a target hits: the muscle itself, or the parts of a group such as quadriceps. */
export const activationsFor = (
  movement: Movement,
  muscle: MuscleId,
  muscles: ReadonlyArray<Muscle>,
): ReadonlyArray<Activation> => {
  const ids = new Set<string>([muscle, ...muscles.filter((m) => m.partOf === muscle).map((m) => m.id)]);
  return movement.activations.filter((a) => ids.has(a.muscle));
};

/**
 * Ranks exercises by how much of the movement's work they train: each shared
 * muscle scores its peak intensity at Moderate, doubled when the contraction type matches at any setting;
 * a mobilisation never doubles.
 */
export const matchExercises = (
  movement: Movement,
  exercises: ReadonlyArray<Exercise>,
  catalogue: ReadonlyArray<Muscle> = [],
): ReadonlyArray<ExerciseMatch> =>
  exercises
    .map((exercise) => {
      const muscles: Array<MuscleId> = [];
      let score = 0;
      for (const target of exercise.targets) {
        const hits = activationsFor(movement, target.muscle, catalogue);
        if (hits.length === 0) continue;
        const peak = Math.max(...hits.flatMap((a) => PHASES.map((p) => phaseIntensity(a.intensity, Intensity.Moderate)[p])));
        const { contraction } = target;
        const sameContraction =
          contraction !== undefined && hits.some((a) => INTENSITIES.some((i) => contractionsOf(phaseContraction(a.contraction, i)).includes(contraction)));
        score += peak * (sameContraction ? 2 : 1);
        if (!muscles.includes(target.muscle)) muscles.push(target.muscle);
      }
      return { exercise, score, muscles };
    })
    .filter((m) => m.score > 0)
    .toSorted((a, b) => b.score - a.score || a.exercise.name.localeCompare(b.exercise.name));
