import { effortsFor } from '../../content/effort';
import { Confidence, Contraction, PHASES, citedPages, citedSource, contractionsOf, formatPages, phaseContraction } from '../../content/schema';
import type { Activation, Citation, Exercise, Intensity, Movement, Muscle, Source } from '../../content/schema';
import type { BlendData } from './data';

export const keyOf = (a: Activation): string => `${a.muscle}:${a.side}`;

export const CONFIDENCE_LABEL: Readonly<Record<Confidence, string>> = {
  [Confidence.High]: 'Measured in this movement',
  [Confidence.Medium]: 'Inferred from related studies',
  [Confidence.Low]: 'Expert opinion',
};

export const CONTRACTION_LABEL: Readonly<Record<Contraction, string>> = {
  [Contraction.Concentric]: 'Shortening (concentric)',
  [Contraction.Eccentric]: 'Lengthening under load (eccentric)',
  [Contraction.Isometric]: 'Holding (isometric)',
};

export const SIDE_LABEL: Readonly<Record<Activation['side'], string>> = {
  outside: 'Outside leg',
  inside: 'Inside leg',
  both: 'Both sides',
};

export const PHASE_LABEL = { initiation: 'Initiation', shaping: 'Shaping', finish: 'Finish' } as const;

export const muscleOf = (data: BlendData, id: string): Muscle | undefined => data.muscles.find((m) => m.id === id);

/** The muscle and its group, such as vasti and quadriceps. */
const lineage = (data: BlendData, id: string): ReadonlySet<string> => {
  const parent = muscleOf(data, id)?.partOf;
  return new Set(parent === undefined ? [id] : [id, parent]);
};

export interface ExerciseFit {
  readonly exercise: Exercise;
  /** The exercise trains the same contraction this muscle does on snow. */
  readonly sameContraction: boolean;
  readonly mobilisation: boolean;
}

/** Exercises that train this muscle, same contraction first. */
export const exercisesFor = (data: BlendData, a: Activation, i: Intensity): ReadonlyArray<ExerciseFit> => {
  const ids = lineage(data, a.muscle);
  const onSnow = new Set(contractionsOf(phaseContraction(a.contraction, i)));
  return data.exercises
    .flatMap((exercise): ReadonlyArray<ExerciseFit> => {
      const hits = exercise.targets.filter((t) => ids.has(t.muscle));
      if (hits.length === 0) return [];
      const sameContraction = hits.some((t) => t.contraction !== undefined && onSnow.has(t.contraction));
      return [{ exercise, sameContraction, mobilisation: hits.every((t) => t.mobilisation === true) }];
    })
    .toSorted((x, y) => Number(y.sameContraction) - Number(x.sameContraction) || Number(x.mobilisation) - Number(y.mobilisation));
};

const peakOf = (a: Activation, i: Intensity): number => Math.max(...PHASES.map((p) => effortsFor(a, i)[p]));

/** Other drills that work this muscle on this side hardest. */
export const drillsFor = (data: BlendData, a: Activation, i: Intensity, current: string | null): ReadonlyArray<{ id: string; name: string; peak: number }> =>
  data.drills
    .filter((d) => d.id !== current)
    .flatMap((d) => {
      const hit = data.movements.get(d.movement)?.activations.find((x) => x.muscle === a.muscle && x.side === a.side);
      return hit === undefined ? [] : [{ id: d.id as string, name: d.name, peak: peakOf(hit, i) }];
    })
    .filter((d) => d.peak >= 2)
    .toSorted((x, y) => y.peak - x.peak || x.name.localeCompare(y.name))
    .slice(0, 4);

export interface TrainTag {
  readonly activation: Activation;
  readonly exercise: Exercise;
}

/** The few muscles worth training for this movement and setting, one per group, each with a gym exercise; steady order. */
export const trainThese = (data: BlendData, order: ReadonlyArray<Activation>, i: Intensity, size = 4): ReadonlyArray<TrainTag> => {
  const family = (id: string): string => muscleOf(data, id)?.partOf ?? id;
  const plan: Array<TrainTag> = [];
  const used = new Set<string>();
  for (const a of order) {
    if (plan.length >= size) break;
    if (peakOf(a, i) < 2 || plan.some((p) => family(p.activation.muscle) === family(a.muscle))) continue;
    const fits = exercisesFor(data, a, i).filter((f) => !f.mobilisation);
    const fit = fits.find((f) => !used.has(f.exercise.id)) ?? fits[0];
    if (fit === undefined) continue;
    used.add(fit.exercise.id);
    plan.push({ activation: a, exercise: fit.exercise });
  }
  return plan;
};

const profile = (m: Movement, i: Intensity): ReadonlyMap<string, number> => new Map(m.activations.map((a) => [keyOf(a), peakOf(a, i)]));

const norm = (p: ReadonlyMap<string, number>): number => Math.sqrt([...p.values()].reduce((s, v) => s + v * v, 0));

/** Drills ranked by how closely their muscle load matches a movement's (cosine of peaks). */
export const drillsLike = (data: BlendData, m: Movement, i: Intensity): ReadonlyArray<string> => {
  const target = profile(m, i);
  return data.drills
    .flatMap((d) => {
      const other = data.movements.get(d.movement);
      if (other === undefined) return [];
      const p = profile(other, i);
      const dot = [...target].reduce((s, [k, v]) => s + v * (p.get(k) ?? 0), 0);
      return [{ id: d.id as string, score: dot / (norm(target) * norm(p) || 1) }];
    })
    .toSorted((x, y) => y.score - x.score)
    .slice(0, 4)
    .map((x) => x.id);
};

export const structuresFor = (data: BlendData, m: Movement, a: Activation): NonNullable<Movement['structures']> => {
  const ids = lineage(data, a.muscle);
  return (m.structures ?? []).filter((s) => s.protectedBy.some((p) => ids.has(p)));
};

/** Content text ends without a full stop; add one unless it has its own. */
export const sentence = (s: string): string => (/[.!?]$/.test(s.trim()) ? s : `${s}.`);

export interface CitedSource {
  readonly source: Source | undefined;
  readonly id: string;
  readonly pages: string | undefined;
}

export const cite = (data: BlendData, c: Citation): CitedSource => {
  const id = citedSource(c);
  const pages = citedPages(c);
  return { id, source: data.sources.find((s) => s.id === id), pages: pages === undefined ? undefined : formatPages(pages) };
};
