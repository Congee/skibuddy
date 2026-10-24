import { INTENSITIES } from '../../content/schema';
import type { Contraction, Intensity, MuscleId } from '../../content/schema';
import { MUSCLE_CHILDREN } from '../muscle-groups';
import { legCapacitiesAt } from './capacities';
import type { Capacity } from './capacities';
import { ARM_CAPACITIES, TRUNK_CAPACITIES } from './capacities-trunk';
import { effortOfActivation, groupActivation, imbalancesOf, MAX_ACTIVATION, RESIDUAL_SHARE } from './distribute';
import type { DistributedFrame, MuscleActivation } from './distribute';
import { encodeEffort, encodeModes } from './effort-table';
import type { EffortCell, EffortTables } from './effort-table';
import { distributeTurn, momentsAt } from './moments';
import type { CapsAt, SolvedTurn } from './moments';
import { decodeQ } from './q-table';
import type { QTables } from './q-table';
import { pack } from './solve-strategy';
import { buildTurnProblem, NAMES, reportOf } from './turn';
import type { TurnProblem } from './turn';

const DEG = 180 / Math.PI;
const HIP_R = NAMES.indexOf('hip_flexion.R');
const HIP_L = NAMES.indexOf('hip_flexion.L');
const ALONG = NAMES.indexOf('pressure_along');

const sided = (rows: ReadonlyArray<Capacity>, side: 'R' | 'L'): Capacity[] => rows.map((c) => ({ ...c, coordinate: `${c.coordinate}.${side}` }));

/** Each leg's rows at its own hip flexion (one `legCapacitiesAt` call per side); trunk and arm rows unchanged. */
export const postureCaps: CapsAt = ({ R, L }) => [...sided(legCapacitiesAt(R), 'R'), ...sided(legCapacitiesAt(L), 'L'), ...TRUNK_CAPACITIES, ...ARM_CAPACITIES];

/** Groups the content names, stored as their parts' capacity-weighted activation. */
export const EFFORT_GROUPS = ['quadriceps', 'hamstrings', 'calf', 'obliques'] as const;

export interface SolvedCell {
  readonly tp: TurnProblem;
  readonly x: Float64Array;
  readonly motion: SolvedTurn;
}

/** The stored solve of one cell, its edges restored, unpacked over the two-turn cycle. */
export const solvedCell = (q: QTables, drill: string, intensity: Intensity): SolvedCell => {
  const text = q.drills[drill]?.[intensity];
  if (text === undefined) throw new Error(`${drill} ${intensity}: no solved q`);
  const tp = buildTurnProblem(drill, intensity, { frames: q.frames });
  const edges = q.edges[drill]?.[intensity];
  if (edges !== undefined) tp.insideEdges.set(Uint8Array.from(edges, Number));
  const x = pack(tp, decodeQ(text, q.names));
  return { tp, x, motion: { problem: tp, q: tp.cycle.unpack(x) } };
};

const capsOf = (motion: SolvedTurn, k: number): ReadonlyArray<Capacity> => {
  const q = motion.q[k];
  return postureCaps({ R: (q?.[HIP_R] ?? 0) * DEG, L: (q?.[HIP_L] ?? 0) * DEG });
};

export interface CellBake {
  readonly cell: EffortCell;
  readonly frames: ReadonlyArray<DistributedFrame>;
  readonly solved: SolvedCell;
}

/** One cell distributed frame by frame at its posture (motion-model §6.8): leaf rows, then group rows. */
export const bakeCell = (q: QTables, drill: string, intensity: Intensity): CellBake => {
  const solved = solvedCell(q, drill, intensity);
  const frames = distributeTurn(solved.motion, postureCaps);
  type MuscleRow = { muscle: string; side: 'R' | 'L'; a: number[]; modes: Array<Contraction | null> };
  const rows = new Map<string, MuscleRow>();
  const row = (muscle: string, side: 'R' | 'L'): MuscleRow => {
    const key = `${muscle}.${side}`;
    const r = rows.get(key) ?? { muscle, side, a: frames.map(() => 0), modes: frames.map(() => null) };
    rows.set(key, r);
    return r;
  };
  frames.forEach((f, k) => {
    for (const m of f.muscles) {
      const r = row(m.muscle, m.side);
      r.a[k] = m.a;
      r.modes[k] = m.mode;
    }
    const caps = capsOf(solved.motion, k);
    for (const group of EFFORT_GROUPS) {
      const children = MUSCLE_CHILDREN[group] ?? [];
      for (const side of ['R', 'L'] as const) {
        const parts = f.muscles.filter((m) => m.side === side && (children.includes(m.muscle) || children.some((c) => (MUSCLE_CHILDREN[c] ?? []).includes(m.muscle))));
        if (parts.length === 0) continue;
        const r = row(group, side);
        r.a[k] = groupActivation(parts, caps);
        r.modes[k] = parts.reduce((best, p) => (p.a > best.a ? p : best)).mode;
      }
    }
  });
  const muscles = [...rows.values()].map((r) => ({ muscle: r.muscle, side: r.side, a: encodeEffort(r.a), modes: encodeModes(r.modes) }));
  return { cell: { muscles, residualMax: Math.max(...frames.map((f) => f.residual)) }, frames, solved };
};

/** Every migrated cell of `q` distributed, under q's hash. */
export const bakeEffort = (q: QTables, drills: ReadonlyArray<string>): { tables: EffortTables; cells: ReadonlyArray<{ drill: string; intensity: Intensity; bake: CellBake }> } => {
  const cells = drills.flatMap((drill) => INTENSITIES.map((intensity) => ({ drill, intensity, bake: bakeCell(q, drill, intensity) })));
  const tables: EffortTables = {
    hash: q.hash,
    drills: Object.fromEntries(drills.map((d) => [d, Object.fromEntries(cells.filter((c) => c.drill === d).map((c) => [c.intensity, c.bake.cell]))])),
  };
  return { tables, cells };
};

export const EffortGate = {
  MomentBalance: 'momentBalance',
  EffortRange: 'effortRange',
} as const;

const f3 = (v: number, d = 3): string => v.toFixed(d);
const pass = (ok: boolean): string => (ok ? 'pass' : 'FAIL');
const saturated = (f: DistributedFrame): ReadonlyArray<MuscleActivation> => f.muscles.filter((m) => m.a >= MAX_ACTIVATION - 1e-9);

/** momentBalance and effortRange rows of one cell; failures returned for the exit code. */
export const effortRows = (drill: string, intensity: Intensity, bake: CellBake): { lines: string[]; failed: boolean } => {
  const { frames, solved } = bake;
  const k = frames.reduce((w, f, i) => (f.residual > (frames[w]?.residual ?? -1) ? i : w), 0);
  const worst = frames[k] as DistributedFrame;
  const off = imbalancesOf(momentsAt(solved.motion, k), worst, capsOf(solved.motion, k));
  const balanced = worst.residual <= RESIDUAL_SHARE;
  const efforts = frames.flatMap((f) => f.muscles.map((m) => effortOfActivation(m.a)));
  const bad = efforts.filter((e) => !Number.isFinite(e) || e < 0 || e > 3).length;
  const detail = off.map((i) => `${i.coordinate} ${f3(i.demand, 1)}→${f3(i.got, 1)} N·m${i.room.length === 0 ? ' (agonists saturated)' : ''}`).join(', ');
  return {
    lines: [
      `${pass(balanced)} ${drill} ${intensity} ${EffortGate.MomentBalance}: ${f3(worst.residual, 4)} (<= ${RESIDUAL_SHARE} of |M|) worst t ${f3(worst.t, 3)}${detail === '' ? '' : `: ${detail}`}`,
      `${pass(bad === 0)} ${drill} ${intensity} ${EffortGate.EffortRange}: ${bad} (<= 0 efforts outside [0, 3]) range ${f3(Math.min(...efforts), 2)}..${f3(Math.max(...efforts), 2)}`,
    ],
    failed: !balanced || bad > 0,
  };
};

/** The bake's report line per cell (TurnReport): CoM, fore-aft and pressure-along ranges, the along bound, the worst residual frame. */
export const reportLines = (drill: string, intensity: Intensity, bake: CellBake): string[] => {
  const { tp, x } = bake.solved;
  const r = reportOf(tp, x);
  const n = NAMES.length;
  const S = x.length / n;
  const atBound = Array.from({ length: S }, (_, k) => k * n + ALONG).filter((j) => Math.abs((x[j] ?? 0) - (tp.upper[j] ?? Infinity)) <= 1e-4 || Math.abs((x[j] ?? 0) - (tp.lower[j] ?? -Infinity)) <= 1e-4).length;
  const cm = (v: readonly [number, number]): string => `${f3(v[0] * 100, 1)}..${f3(v[1] * 100, 1)}`;
  const k = bake.frames.reduce((w, f, i) => (f.residual > (bake.frames[w]?.residual ?? -1) ? i : w), 0);
  const worst = bake.frames[k] as DistributedFrame;
  const sat = saturated(worst).map((m) => `${m.muscle}.${m.side}`);
  return [
    `${drill} ${intensity}: CoM height ${f3(r.comHeight[0])}..${f3(r.comHeight[1])} legs, fore-aft ${cm(r.foreAft)} cm, pressure along ${cm(r.pressureAlong)} cm, ${atBound}/${S} frames at the along bound`,
    `${drill} ${intensity}: residual max ${f3(worst.residual, 4)} at frame ${k} (t ${f3(worst.t)}), saturated there: ${sat.length === 0 ? 'none' : sat.join(', ')}`,
  ];
};

/** The muscle ids the solve carries bilaterally in the trunk. */
export const TRUNK_MUSCLES: ReadonlySet<MuscleId> = new Set(TRUNK_CAPACITIES.map((c) => c.muscle));
