import type { Intensity } from '../../content/schema';
import { Boundary } from '../../solve/cycle';
import type { SolveResult } from '../../solve/solve';
import { buildTurnProblem, NAMES, seedFor, SeedKind, solveTurn } from './turn';
import type { TurnMotion, TurnProblem, TurnReport } from './turn';

const DEG = Math.PI / 180;
const KNEES = [NAMES.indexOf('knee_flexion.R'), NAMES.indexOf('knee_flexion.L')];
const SEEDS: ReadonlyArray<SeedKind> = [SeedKind.Prior, SeedKind.Rest, SeedKind.Jitter];

/** The first `cycle.solved` frames as the problem's x; the inverse of `cycle.unpack` on them. */
export const pack = (tp: Pick<TurnProblem, 'cycle'>, frames: ReadonlyArray<ArrayLike<number>>): Float64Array => {
  const { coords, solved, size } = tp.cycle;
  const x = new Float64Array(size);
  for (let k = 0; k < solved; k++) {
    const q = frames[k];
    if (q === undefined) throw new Error(`pack: ${frames.length} frames, ${solved} solved`);
    for (let i = 0; i < coords; i++) x[k * coords + i] = q[i] ?? 0;
  }
  return x;
};

/**
 * The coarse solve's frames interpolated linearly in phase to the fine frame count, across the seam through the
 * mirror, as the fine problem's x. The x carries every NAMES coordinate (extras included) and no edge or multiplier
 * state: `solveTurn` re-picks the inside edges and starts its multipliers cold.
 */
export const upsample = (coarse: Pick<TurnProblem, 'cycle'>, x: ArrayLike<number>, fine: Pick<TurnProblem, 'cycle'>): Float64Array => {
  const c = coarse.cycle;
  const f = fine.cycle;
  if (c.coords !== f.coords || c.extras !== f.extras || c.boundary !== f.boundary || c.boundary === Boundary.Open) throw new Error('upsample: needs one closed cycle layout');
  const frames = c.unpack(x);
  const at = (k: number): Float64Array => frames[k % c.frames] ?? new Float64Array(c.coords);
  const out = pack(
    fine,
    Array.from({ length: f.solved }, (_, j) => {
      const p = (j * c.frames) / f.frames;
      const k = Math.floor(p);
      const w = p - k;
      const [a, b] = [at(k), at(k + 1)];
      return w === 0 ? a : a.map((v, i) => (1 - w) * v + w * (b[i] ?? 0));
    }),
  );
  for (let e = 0; e < f.extras; e++) out[f.solved * f.coords + e] = x[c.solved * c.coords + e] ?? 0;
  return out;
};

type Scored = { readonly result: Pick<SolveResult, 'cost' | 'feasible' | 'violation'> };
const orInf = (v: number): number => (Number.isNaN(v) ? Infinity : v);

/** Lowest solver cost among the feasible; with none feasible, lowest violation. */
export const pickBest = <T extends Scored>(runs: ReadonlyArray<T>): T => {
  const feasible = runs.filter((m) => m.result.feasible);
  const key = (m: T): number => orInf(feasible.length > 0 ? m.result.cost : m.result.violation);
  const best = (feasible.length > 0 ? feasible : runs).reduce<T | undefined>((b, m) => (b === undefined || key(m) < key(b) ? m : b), undefined);
  if (best === undefined) throw new Error('pickBest: no runs');
  return best;
};

export const Path = { Coarse: 'coarse', CoarseToFine: 'coarse→fine', ColdFine: 'cold fine' } as const;
export type Path = (typeof Path)[keyof typeof Path];

/** One solve, as the solver reports it. */
export interface Run {
  readonly cost: number;
  readonly iterations: number;
  readonly seconds: number;
  readonly feasible: boolean;
  readonly violation: number;
}

export interface Summary {
  /** Least CoM height, leg lengths (reportOf). */
  readonly comHeight: number;
  /** Most knee flexion, either leg, degrees. */
  readonly knee: number;
  /** Counter range, degrees (reportOf). */
  readonly counter: readonly [number, number];
}

export interface Candidate extends Summary {
  readonly seed: SeedKind;
  readonly path: Path;
  readonly coarse: Run | null;
  readonly fine: Run | null;
  /** The row's last solve: the fine one where it ran. */
  readonly feasible: boolean;
  /** The row whose fine solve the strategy returns. */
  readonly picked: boolean;
}

export interface Strategy {
  readonly motion: TurnMotion;
  readonly candidates: ReadonlyArray<Candidate>;
}

export interface StrategyOptions {
  /** Fine frames per turn, even; the coarse solves take half. */
  readonly frames: number;
  /** Also today's path, one cold fine solve from the prior seed, as a candidate the pick may take. */
  readonly compare?: boolean;
  /** Told after each solve, for long logs. */
  readonly progress?: (line: string) => void;
}

export const summaryOf = (report: TurnReport, q: ReadonlyArray<ArrayLike<number>>): Summary => ({
  comHeight: report.comHeight[0],
  knee: Math.max(...q.flatMap((f) => KNEES.map((i) => f[i] ?? -Infinity))) / DEG,
  counter: [report.counter[0] / DEG, report.counter[1] / DEG],
});

const runOf = (m: TurnMotion): Run => ({ cost: m.result.cost, iterations: m.result.iterations, seconds: m.milliseconds / 1000, feasible: m.result.feasible, violation: m.result.violation });

const solveFrom = (drill: string, intensity: Intensity, frames: number, x0: (tp: TurnProblem) => Float64Array): TurnMotion => {
  // A problem per solve: solveTurn re-picks its inside edges in place.
  const tp = buildTurnProblem(drill, intensity, { frames });
  return solveTurn(tp, x0(tp));
};

/** Coarse solves from the three seeds, the best upsampled and solved warm at `frames` (motion-model §10, T2). */
export const solveTurnStrategy = (drill: string, intensity: Intensity, options: StrategyOptions): Strategy => {
  const S = options.frames;
  if (!Number.isInteger(S) || S < 4 || S % 2 !== 0) throw new Error(`solveTurnStrategy: ${S} frames, want an even count ≥ 4`);
  const tell = (path: Path, seed: SeedKind, m: TurnMotion): void =>
    options.progress?.(`${drill} ${intensity} ${seed} ${path}: cost ${m.result.cost.toFixed(4)}, ${m.result.iterations} iterations, ${(m.milliseconds / 1000).toFixed(1)} s, feasible ${m.result.feasible}`);
  const coarse = SEEDS.map((seed) => {
    const m = solveFrom(drill, intensity, S / 2, (tp) => seedFor(tp, seed));
    tell(Path.Coarse, seed, m);
    return { seed, m };
  });
  const best = pickBest(coarse.map((c) => c.m));
  const warm = solveFrom(drill, intensity, S, (tp) => upsample(best.problem, best.result.x, tp));
  tell(Path.CoarseToFine, coarse.find((c) => c.m === best)?.seed ?? SeedKind.Prior, warm);
  const cold = options.compare === true ? solveFrom(drill, intensity, S, (tp) => seedFor(tp, SeedKind.Prior)) : null;
  if (cold !== null) tell(Path.ColdFine, SeedKind.Prior, cold);
  const motion = pickBest(cold === null ? [warm] : [warm, cold]);
  const row = (seed: SeedKind, path: Path, c: TurnMotion | null, f: TurnMotion | null, last: TurnMotion): Candidate => ({
    seed,
    path,
    coarse: c === null ? null : runOf(c),
    fine: f === null ? null : runOf(f),
    feasible: last.result.feasible,
    ...summaryOf(last.report, last.q),
    picked: last === motion,
  });
  return {
    motion,
    candidates: [
      ...coarse.map(({ seed, m }) => (m === best ? row(seed, Path.CoarseToFine, m, warm, warm) : row(seed, Path.Coarse, m, null, m))),
      ...(cold === null ? [] : [row(SeedKind.Prior, Path.ColdFine, null, cold, cold)]),
    ],
  };
};

const cols = (cells: ReadonlyArray<string>, widths: ReadonlyArray<number>): string => cells.map((s, i) => s.padStart(widths[i] ?? 0)).join(' ');
const RUN = [12, 5, 7, 8];
const SUMMARY = [7, 8, 13];
const runText = (r: Run | null): string =>
  r === null ? '—'.padStart(RUN.reduce((a, b) => a + b + 1, -1)) : cols([r.cost.toFixed(4), String(r.iterations), r.seconds.toFixed(1), r.violation.toExponential(1)], RUN);

export const formatSummary = (s: Summary): string => cols([s.comHeight.toFixed(3), s.knee.toFixed(1), `${s.counter[0].toFixed(1)}..${s.counter[1].toFixed(1)}`], SUMMARY);

const seconds = (r: Run | null): number => r?.seconds ?? 0;

/** A header, one line per candidate, and the default path's wall time against the cold fine solve's. */
export const formatCandidates = (cs: ReadonlyArray<Candidate>): string[] => {
  const path = cs.reduce((s, c) => s + seconds(c.coarse) + (c.path === Path.CoarseToFine ? seconds(c.fine) : 0), 0);
  const cold = cs.find((c) => c.path === Path.ColdFine)?.fine ?? null;
  return [
    `${'seed'.padEnd(6)} ${'path'.padEnd(11)} | ${cols(['coarse cost', 'iter', 's', 'viol'], RUN)} | ${cols(['fine cost', 'iter', 's', 'viol'], RUN)} | ${'feasible'} ${cols(['CoM min', 'knee max', 'counter °'], SUMMARY)}`,
    ...cs.map((c) => `${c.seed.padEnd(6)} ${c.path.padEnd(11)} | ${runText(c.coarse)} | ${runText(c.fine)} | ${(c.feasible ? 'yes' : 'no').padEnd(8)} ${formatSummary(c)}${c.picked ? '  ← pick' : ''}`),
    `wall: three coarse + warm fine ${path.toFixed(1)} s${cold === null ? '' : `, one cold fine ${cold.seconds.toFixed(1)} s`}`,
  ];
};
