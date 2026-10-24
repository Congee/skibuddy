import type { MuscleLevel } from '../../content/activation';
import { derivedProblems, derivedRows } from '../../content/derived';
import type { DerivedRow } from '../../content/derived';
import { framesAt } from '../../content/effort';
import { Side, levelAt } from '../../content/schema';
import type { Activation, Intensity, MuscleId } from '../../content/schema';
import { LEG_CAPACITIES } from '../../viewer/motion/capacities';
import { ARM_CAPACITIES, TRUNK_CAPACITIES } from '../../viewer/motion/capacities-trunk';
import { RESIDUAL_SHARE } from '../../viewer/motion/distribute';
import { STORED_EFFORT } from '../../viewer/motion/effort-table';
import type { EffortTables } from '../../viewer/motion/effort-table';

const PHASES = ['initiation', 'shaping', 'finish'] as const;

/** Muscles the solve carries itself; the table's group rows (quadriceps, calf, …) are built from these. */
const LEAVES: ReadonlySet<string> = new Set([...LEG_CAPACITIES, ...TRUNK_CAPACITIES, ...ARM_CAPACITIES].map((c) => c.muscle));

export interface EffortLane {
  readonly side: Side;
  /** Effort 0–3 per stored frame from the switch. */
  readonly effort: ReadonlyArray<number>;
  /** Effort at t = 1: the other lane's first frame, as the legs swap roles at the switch. */
  readonly end: number;
  /** The content's hand-authored initiation, shaping and finish levels; null where it has no such muscle. */
  readonly authored: readonly [number, number, number] | null;
}

export interface EffortStrip {
  readonly muscle: MuscleId;
  readonly lanes: ReadonlyArray<EffortLane>;
}

// A trunk row shown once takes the larger of the content's sided levels, as derivedRows takes the larger side.
const authoredLevels = (authored: ReadonlyArray<Activation>, muscle: MuscleId, side: Side, intensity: Intensity): EffortLane['authored'] => {
  const own = authored.filter((a) => a.muscle === muscle && (a.side === side || side === Side.Both || a.side === Side.Both));
  if (own.length === 0) return null;
  const [initiation, shaping, finish] = PHASES.map((p) => Math.max(...own.map((a) => levelAt(a.intensity[p], intensity))));
  return [initiation ?? 0, shaping ?? 0, finish ?? 0];
};

const leafRows = (drill: string, tables: EffortTables): ReadonlyArray<DerivedRow> | null => derivedRows(drill, tables)?.filter((r) => LEAVES.has(r.muscle)) ?? null;

/** One strip per solved leaf muscle of a baked drill (outside and inside lanes, trunk once); null when it is not baked. */
export const effortStrips = (drill: string, intensity: Intensity, authored: ReadonlyArray<Activation> = [], tables: EffortTables = STORED_EFFORT): ReadonlyArray<EffortStrip> | null => {
  const rows = leafRows(drill, tables);
  if (rows === null) return null;
  const byMuscle = new Map<MuscleId, DerivedRow[]>();
  for (const r of rows) byMuscle.set(r.muscle, [...(byMuscle.get(r.muscle) ?? []), r]);
  return [...byMuscle].map(([muscle, own]) => ({
    muscle,
    lanes: own.map((r, j): EffortLane => {
      const effort = Array.from(r.rows[intensity].effort);
      const next = own.length === 2 ? own[1 - j] : r;
      return { side: r.side, effort, end: next?.rows[intensity].effort[0] ?? 0, authored: authoredLevels(authored, muscle, r.side, intensity) };
    }),
  }));
};

/** The figure's levels at turn time `t` from the same leaf rows as the strips; null when the drill is not baked. */
export const effortLevelsAt = (drill: string, intensity: Intensity, t: number, tables: EffortTables = STORED_EFFORT): ReadonlyArray<MuscleLevel> | null => {
  const rows = leafRows(drill, tables);
  return (
    rows?.map((r) => {
      const twin = rows.find((o) => o.muscle === r.muscle && o.side !== r.side) ?? r;
      return { muscle: r.muscle, side: r.side, level: framesAt(Array.from(r.rows[intensity].effort), Array.from(twin.rows[intensity].effort), t) };
    }) ?? null
  );
};

export interface EffortNote {
  readonly residual: number;
  readonly balanced: boolean;
  /** Derived phase levels that fall as intensity rises, across the drill's three settings. */
  readonly problems: ReadonlyArray<string>;
}

/** The cell's momentBalance (worst residual against the distribution's limit) and the drill's derived problems. */
export const effortNote = (drill: string, intensity: Intensity, tables: EffortTables = STORED_EFFORT): EffortNote | null => {
  const cell = tables.drills[drill]?.[intensity];
  if (cell === undefined) return null;
  return { residual: cell.residualMax, balanced: cell.residualMax <= RESIDUAL_SHARE, problems: derivedProblems(drill, tables) };
};

export { RESIDUAL_SHARE };
