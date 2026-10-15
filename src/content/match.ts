import type { Exercise, Movement, MuscleId } from './schema';

export interface ExerciseMatch {
  readonly exercise: Exercise;
  readonly score: number;
  readonly muscles: ReadonlyArray<MuscleId>;
}

/**
 * Ranks exercises by how much of the movement's work they train: each shared
 * muscle scores its peak intensity, doubled when the contraction type matches.
 */
export const matchExercises = (
  movement: Movement,
  exercises: ReadonlyArray<Exercise>,
): ReadonlyArray<ExerciseMatch> =>
  exercises
    .map((exercise) => {
      const muscles: Array<MuscleId> = [];
      let score = 0;
      for (const target of exercise.targets) {
        const hits = movement.activations.filter((a) => a.muscle === target.muscle);
        if (hits.length === 0) continue;
        const peak = Math.max(...hits.flatMap((a) => [a.intensity.initiation, a.intensity.shaping, a.intensity.finish]));
        const sameContraction = hits.some((a) => a.contraction.includes(target.contraction));
        score += peak * (sameContraction ? 2 : 1);
        if (!muscles.includes(target.muscle)) muscles.push(target.muscle);
      }
      return { exercise, score, muscles };
    })
    .filter((m) => m.score > 0)
    .toSorted((a, b) => b.score - a.score || a.exercise.name.localeCompare(b.exercise.name));
