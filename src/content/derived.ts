import { LEG_CAPACITIES } from '../viewer/motion/capacities';
import { ARM_CAPACITIES, TRUNK_CAPACITIES } from '../viewer/motion/capacities-trunk';
import { effortTable, STORED_EFFORT } from '../viewer/motion/effort-table';
import type { EffortRow, EffortTables } from '../viewer/motion/effort-table';
import { MUSCLE_CHILDREN } from '../viewer/muscle-groups';
import { Confidence, Contraction, INTENSITIES, orderProblem, Side } from './schema';
import type { Activation, Citation, Dof, Intensity, MuscleId } from './schema';

const PHASES = ['initiation', 'shaping', 'finish'] as const;
type PhaseName = (typeof PHASES)[number];

/** Solve coordinate → the content's joint action; shoulder rotation has none. */
const DOF_OF: Readonly<Record<string, Dof>> = {
  hip_flexion: 'hip.flexion',
  hip_adduction: 'hip.abduction',
  hip_rotation: 'hip.rotation',
  knee_flexion: 'knee.flexion',
  ankle_dorsiflexion: 'ankle.flexion',
  lumbar_flexion: 'lumbar.flexion',
  lumbar_bending: 'lumbar.side-bend',
  lumbar_rotation: 'lumbar.rotation',
  thoracic_flexion: 'thoracic.flexion',
  thoracic_bending: 'thoracic.side-bend',
  thoracic_rotation: 'thoracic.rotation',
  neck_flexion: 'neck.flexion',
  neck_bending: 'neck.side-bend',
  neck_rotation: 'neck.rotation',
  shoulder_flexion: 'shoulder.flexion',
  shoulder_abduction: 'shoulder.abduction',
  elbow_flexion: 'elbow.flexion',
} as Readonly<Record<string, Dof>>;

const CAPS = [...LEG_CAPACITIES, ...TRUNK_CAPACITIES, ...ARM_CAPACITIES];
const TRUNK_LEAVES: ReadonlySet<string> = new Set(TRUNK_CAPACITIES.map((c) => c.muscle));
// A group of trunk leaves (obliques) is bilateral too.
const TRUNK: ReadonlySet<string> = new Set([
  ...TRUNK_LEAVES,
  ...Object.entries(MUSCLE_CHILDREN).flatMap(([g, kids]) => (kids.length > 0 && kids.every((k) => TRUNK_LEAVES.has(k)) ? [g] : [])),
]);

const servesOf = (muscle: string): Dof[] => {
  const parts = new Set([muscle, ...(MUSCLE_CHILDREN[muscle] ?? []), ...(MUSCLE_CHILDREN[muscle] ?? []).flatMap((c) => MUSCLE_CHILDREN[c] ?? [])]);
  const dofs = [...new Set(CAPS.filter((c) => parts.has(c.muscle)).flatMap((c) => (DOF_OF[c.coordinate] === undefined ? [] : [DOF_OF[c.coordinate] as Dof])))];
  return dofs.length > 0 ? dofs : ['knee.flexion' as Dof];
};

/** Frames [a, b) of the phase's third of the turn, from the switch at t = 0. */
const windowOf = (n: number, p: number): readonly [number, number] => [Math.round((p * n) / 3), Math.round(((p + 1) * n) / 3)];

const meanOver = (v: ArrayLike<number>, [a, b]: readonly [number, number]): number => {
  let s = 0;
  for (let k = a; k < b; k++) s += v[k] ?? 0;
  return s / Math.max(1, b - a);
};

/** Mean effort over each phase window, rounded to the content's 0..3 steps. */
export const phaseLevel = (row: EffortRow, p: number): number => Math.min(3, Math.max(0, Math.round(meanOver(row.effort, windowOf(row.effort.length, p)))));

/** The mode carrying the most activation over the phase window. */
const dominantMode = (row: EffortRow, p: number): Contraction | null => {
  const [a, b] = windowOf(row.a.length, p);
  const sums = new Map<Contraction, number>();
  for (let k = a; k < b; k++) {
    const m = row.modes[k];
    if (m !== null && m !== undefined) sums.set(m, (sums.get(m) ?? 0) + (row.a[k] ?? 0));
  }
  return [...sums.entries()].reduce<[Contraction | null, number]>((best, e) => (e[1] > best[1] ? e : best), [null, 0])[0];
};

const ZERO = (n: number): EffortRow => ({ muscle: '' as MuscleId, side: 'R', a: new Float64Array(n), effort: new Float64Array(n), modes: Array.from({ length: n }, () => null) });

const cycleMean = (r: EffortRow): number => meanOver(r.effort, [0, r.effort.length]);

const perIntensity = (pick: (i: Intensity) => EffortRow): Record<Intensity, EffortRow> => Object.fromEntries(INTENSITIES.map((i) => [i, pick(i)])) as Record<Intensity, EffortRow>;

/** One content row: R → outside, L → inside; bilateral trunk rows → both, from the larger side per setting. */
export interface DerivedRow {
  readonly muscle: MuscleId;
  readonly side: Side;
  readonly rows: Readonly<Record<Intensity, EffortRow>>;
}

export const derivedRows = (drill: string, tables: EffortTables = STORED_EFFORT): ReadonlyArray<DerivedRow> | null => {
  const cells = effortTable(drill, tables);
  if (cells === null) return null;
  const muscles = [...new Set(INTENSITIES.flatMap((i) => cells[i].map((r) => r.muscle)))];
  const find = (i: Intensity, muscle: MuscleId, side: 'R' | 'L'): EffortRow => cells[i].find((r) => r.muscle === muscle && r.side === side) ?? ZERO(cells[i][0]?.a.length ?? 48);
  return muscles.flatMap((muscle): DerivedRow[] => {
    if (TRUNK.has(muscle)) return [{ muscle, side: Side.Both, rows: perIntensity((i) => [find(i, muscle, 'R'), find(i, muscle, 'L')].reduce((a, b) => (cycleMean(b) > cycleMean(a) ? b : a))) }];
    return [
      { muscle, side: Side.Outside, rows: perIntensity((i) => find(i, muscle, 'R')) },
      { muscle, side: Side.Inside, rows: perIntensity((i) => find(i, muscle, 'L')) },
    ];
  });
};

const DERIVED_SOURCES: ReadonlyArray<Citation> = ['heinrich-2022', 'hermann-2023'] as unknown as ReadonlyArray<Citation>;

/**
 * The drill's activations from its baked effort (motion-model §6.8), or null when it is not baked; serves, role, basis,
 * sources and confidence come from `base`'s activation of the same muscle and side where there is one.
 */
export const derivedActivations = (drill: string, base: ReadonlyArray<Activation> = [], tables: EffortTables = STORED_EFFORT): Activation[] | null => {
  const rows = derivedRows(drill, tables);
  if (rows === null) return null;
  return rows.map(({ muscle, side, rows: r }) => {
    const from = base.find((a) => a.muscle === muscle && a.side === side);
    const per = <T,>(f: (row: EffortRow, p: number) => T): Record<PhaseName, Record<Intensity, T>> => Object.fromEntries(PHASES.map((ph, p) => [ph, Object.fromEntries(INTENSITIES.map((i) => [i, f(r[i], p)]))])) as Record<PhaseName, Record<Intensity, T>>;
    const levels = per(phaseLevel);
    const modes = per((row, p) => (phaseLevel(row, p) === 0 ? null : (dominantMode(row, p) ?? Contraction.Isometric)));
    return {
      muscle,
      side,
      serves: from?.serves ?? servesOf(muscle),
      intensity: { ...levels, frames: Object.fromEntries(INTENSITIES.map((i) => [i, Array.from(r[i].effort)])) as Record<Intensity, number[]> },
      contraction: modes,
      role: from?.role ?? `Carries its share of the solved turn's joint moments (${servesOf(muscle).join(', ')}).`,
      confidence: from?.confidence ?? Confidence.Low,
      basis: from?.basis ?? 'derived (motion-model §6)',
      sources: from?.sources ?? DERIVED_SOURCES,
    } as Activation;
  });
};

/** Derived phase levels that fall as intensity rises, by muscle, side and phase. */
export const derivedProblems = (drill: string, tables: EffortTables = STORED_EFFORT): string[] =>
  (derivedActivations(drill, [], tables) ?? []).flatMap((a) =>
    PHASES.flatMap((p) => {
      const v = a.intensity[p];
      const problem = typeof v === 'number' ? undefined : orderProblem(v);
      return problem === undefined ? [] : [`${a.muscle} ${a.side} ${p}: ${problem.replace(/; add a note.*$/, '')}`];
    }),
  );
