import LIT from '../../scripts/prior/lit-curves.json';
import { REFERENCE_SKIER } from '../viewer/skier';
import CYCLES from './carve-cycles.json';
import { ANGULATION_MAX_DEG } from './edge';
import type { Snow as SnowT } from './edge';
import { REACH } from './moguls';
import { BEND_RADIUS_MAX_M, BEND_RADIUS_MIN_M, BEND_REFERENCE } from './ski-bend';
import type { TurnTask } from './task';
import { G, HIP_WIDTH_M, ROOT_TOP, SWITCH_SHARE, V_FLOOR, carveRootsOf, carveSetupOf } from './turn';
import type { SolveOptions } from './turn';

/** One baked sample series per key, turn 1 only, t from 0 (switch) to periodS (next switch). */
export const CARVE_SAMPLE_KEYS = ['t', 'lam', 'lamDot', 'h', 'hDot', 'hDdot', 'eps', 'epsDot', 'p', 'pDot', 'psi', 'v', 'kSki', 'load', 'share', 'pressed'] as const;
export type CarveSampleKey = (typeof CARVE_SAMPLE_KEYS)[number];

/** A whole-turn solve's linked cycle (scripts/solve/carve_cycle.py), keyed "<kind>-<intensity>". */
export interface CarveCell {
  readonly inputs: Readonly<Record<string, unknown>>;
  readonly switchHeadingDeg: number;
  readonly periodS: number;
  readonly speedMps: number;
  readonly lamPeak: number;
  readonly defectDegS: number;
  readonly nodes: number;
  readonly meshChangeLamDeg: number;
  readonly replayLamDeg: number;
  readonly replayLoadG: number;
  readonly samples: Readonly<Record<CarveSampleKey, ReadonlyArray<number>>>;
}

export interface CarveCells {
  readonly version: number;
  readonly cells: Readonly<Record<string, CarveCell>>;
}

export const CARVE_CELLS: CarveCells = CYCLES as CarveCells;

/** Options the bake does not read; any set means the cycle is not the baked one. */
const UNBAKED: ReadonlyArray<keyof SolveOptions> = ['constantSpeed', 'movementRangeM', 'transitionPhase', 'switchHeadingDeg', 'legStep'];

interface LitSlalom {
  readonly events: { readonly grf_max: string };
  readonly leg_length_cm: Readonly<Record<string, unknown>> & { readonly source: string; readonly status: string };
  readonly period_s: { readonly values: Readonly<Record<string, string>> };
}

/**
 * The solve's inputs for `task` as the bake records them (scratchpad r2a25 dump.ts, key for key), `cell` the label it
 * was baked under, `carvedSlopes` the carved presets' slopes (task.ts imports this module's importer, so it is passed in);
 * null when an option the bake does not read is set or the measured ceilings do not parse.
 */
export const carveBakeInputsOf = (task: TurnTask, snow: SnowT, options: SolveOptions, cell: unknown, carvedSlopes: ReadonlyArray<number>): Record<string, unknown> | null => {
  if (UNBAKED.some((k) => options[k] !== undefined)) return null;
  const st = carveSetupOf(task, snow, options);
  const ski = task.ski;
  const v0 = task.entrySpeedMps ?? task.speedMps;
  const out: Record<string, unknown> = {
    cell,
    G,
    REACH,
    EDGE_RATE_DEG_S: st.rateDeg,
    HIP_WIDTH_M,
    ROOT_TOP,
    SWITCH_SHARE,
    V_FLOOR,
    mass: REFERENCE_SKIER.mass,
    slopeDeg: task.slopeDeg,
    speedMps: v0,
    compliance: st.compliance,
    ski: { sidecutRadius: ski.sidecutRadius, tip: ski.tip, tail: ski.tail, waist: ski.waist, length: ski.length },
    bend: { radiusM: BEND_REFERENCE.radiusM, forceN: BEND_REFERENCE.forceN, min: BEND_RADIUS_MIN_M, max: BEND_RADIUS_MAX_M },
    mu: st.muAt(v0),
    muSpeedLaw: st.muAt(1) !== st.muAt(20),
    dragPerV2: st.dragPerV2,
    carvedSlopes,
    mapPitches: [0, 1, 2, 3].map((i) => Math.min(...carvedSlopes) + (i * (Math.max(...carvedSlopes) - Math.min(...carvedSlopes))) / 3),
    mMax: st.inputs.mMax,
    mDeg: st.mDeg,
    S: st.inputs.share,
    ANGULATION_MAX_DEG,
    stance: st.inputs.stance,
  };
  // Measured human ceilings (reid-2010 SL): the highest carved-turn ground force, the fastest leg-length step.
  const lit = (LIT as unknown as { readonly slalom: LitSlalom }).slalom;
  const grfSrc = lit.events.grf_max;
  const grf = grfSrc.match(/([\d.]+)\s*\/\s*([\d.]+)\s*BW/);
  if (grf === null) return null;
  const legs = lit.leg_length_cm;
  const rates: Record<string, unknown> = {};
  let hdMax = 0;
  for (const [course, cv] of Object.entries(legs) as [string, { readonly t?: unknown; readonly mean: ReadonlyArray<number>; readonly rom: unknown }][]) {
    const t = cv?.t;
    if (!Array.isArray(t)) continue;
    const pk = `reid-2010 ${course.replace('m', ' m')}`;
    const ps = lit.period_s.values[pk];
    if (ps === undefined) return null;
    const period = Number.parseFloat(ps);
    let best = 0;
    for (let k = 1; k < t.length; k++) best = Math.max(best, Math.abs((cv.mean[k] ?? 0) - (cv.mean[k - 1] ?? 0)) / 100 / (((t[k] as number) - (t[k - 1] as number)) * period));
    rates[course] = { periodS: period, periodSrc: `${pk}: ${ps}`, maxStepRateMps: best, rom: cv.rom };
    hdMax = Math.max(hdMax, best);
  }
  Object.assign(out, {
    F_CEIL_G: Math.max(Number(grf[1]), Number(grf[2])),
    F_CEIL_SRC: `slalom.events.grf_max: ${grfSrc}`,
    HD_MAX: hdMax,
    HD_MAX_SRC: `slalom.leg_length_cm (${legs.source}, ${legs.status}) per course on slalom.period_s`,
    HD_RATES: rates,
  });
  // carveCycle's first λ_peak: the fall line's root less mMax at the preset speed.
  const fall = carveRootsOf(st.s, v0, Math.PI / 2, st.inputs.mMax, st.inputs.share);
  out['lamPeak0'] = (Number.isNaN(fall.first) ? fall.nearest : fall.first) - st.inputs.mMax;
  return out;
};

/** JSON values equal key for key, numbers exactly: a JSON round trip of a double is exact. */
export const sameJson = (a: unknown, b: unknown): boolean => {
  if (typeof a !== 'object' || a === null || typeof b !== 'object' || b === null) return a === b;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const [ka, kb] = [Object.keys(a), Object.keys(b)];
  return ka.length === kb.length && ka.every((k) => Object.hasOwn(b, k) && sameJson((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]));
};

/** The baked cell whose inputs equal the task's, the preset slope table the cell's own (the stale-bake test checks it); null runs the forward march. */
export const carveCellFor = (task: TurnTask, snow: SnowT, options: SolveOptions, cells: CarveCells = CARVE_CELLS): CarveCell | null => {
  for (const cell of Object.values(cells.cells)) {
    const slopes = cell.inputs['carvedSlopes'];
    if (!Array.isArray(slopes)) continue;
    const want = carveBakeInputsOf(task, snow, options, cell.inputs['cell'], slopes as number[]);
    if (want !== null && sameJson(want, cell.inputs)) return cell;
  }
  return null;
};
