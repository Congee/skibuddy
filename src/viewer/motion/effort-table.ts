import { Contraction, INTENSITIES } from '../../content/schema';
import type { Intensity, MuscleId } from '../../content/schema';
import { effortOfActivation } from './distribute';
import EFFORT_TABLES from './effort-tables.json';

/** Activation per stored unit. */
const A_SCALE = 1e-3;

/** One muscle on one side of the solve (R the outside leg): activations as int16 × 1e-3 base64, modes as c e i -. */
export interface EffortMuscle {
  readonly muscle: string;
  readonly side: string;
  readonly a: string;
  readonly modes: string;
}

export interface EffortCell {
  readonly muscles: ReadonlyArray<EffortMuscle>;
  /** Worst frame's ‖Cᵀa − M‖ / ‖M‖ (distributeFrame). */
  readonly residualMax: number;
}

/** Per migrated drill and intensity, the distributed turn (motion-model §6.8), under the q-tables' hash. */
export interface EffortTables {
  readonly hash: string;
  readonly drills: Readonly<Record<string, Readonly<Record<string, EffortCell>>>>;
}

export const encodeEffort = (a: ArrayLike<number>): string => {
  const values = Int16Array.from(Array.from(a), (v) => {
    const s = Math.round(v / A_SCALE);
    if (!Number.isFinite(s) || Math.abs(s) > 0x7fff) throw new Error(`activation out of range: ${v}`);
    return s;
  });
  let s = '';
  for (const b of new Uint8Array(values.buffer)) s += String.fromCharCode(b);
  return btoa(s);
};

export const decodeEffort = (text: string): Float64Array => {
  const bytes = Uint8Array.from(atob(text), (ch) => ch.charCodeAt(0));
  const view = new DataView(bytes.buffer);
  return Float64Array.from({ length: bytes.byteLength / 2 }, (_, k) => view.getInt16(k * 2, true) * A_SCALE);
};

const MODE_CHAR: Readonly<Record<Contraction, string>> = { [Contraction.Concentric]: 'c', [Contraction.Eccentric]: 'e', [Contraction.Isometric]: 'i' };
const CHAR_MODE: ReadonlyMap<string, Contraction> = new Map(Object.entries(MODE_CHAR).map(([m, c]) => [c, m as Contraction]));

export const encodeModes = (modes: ReadonlyArray<Contraction | null>): string => modes.map((m) => (m === null ? '-' : MODE_CHAR[m])).join('');

export const decodeModes = (text: string): ReadonlyArray<Contraction | null> => Array.from(text, (ch) => CHAR_MODE.get(ch) ?? null);

export const STORED_EFFORT: EffortTables = EFFORT_TABLES;

/** One decoded muscle row: activation, effort 0..3 and mode per frame from the switch. */
export interface EffortRow {
  readonly muscle: MuscleId;
  readonly side: 'R' | 'L';
  readonly a: Float64Array;
  readonly effort: Float64Array;
  readonly modes: ReadonlyArray<Contraction | null>;
}

const sideOf = (s: string): 'R' | 'L' => {
  if (s !== 'R' && s !== 'L') throw new Error(`effort table: side ${s}`);
  return s;
};

export const decodeCell = (cell: EffortCell): ReadonlyArray<EffortRow> =>
  cell.muscles.map((m) => {
    const a = decodeEffort(m.a);
    return { muscle: m.muscle as MuscleId, side: sideOf(m.side), a, effort: a.map(effortOfActivation), modes: decodeModes(m.modes) };
  });

/** The drill's baked effort per intensity, or null unless all three cells are baked. */
export const effortTable = (drill: string, tables: EffortTables = STORED_EFFORT): Readonly<Record<Intensity, ReadonlyArray<EffortRow>>> | null => {
  const cells = tables.drills[drill];
  if (cells === undefined || INTENSITIES.some((i) => cells[i] === undefined)) return null;
  return Object.fromEntries(INTENSITIES.map((i) => [i, decodeCell(cells[i] as EffortCell)])) as Record<Intensity, ReadonlyArray<EffortRow>>;
};
