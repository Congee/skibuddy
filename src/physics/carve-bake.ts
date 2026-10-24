import LIT from '../../scripts/prior/lit-curves.json';
import { REFERENCE_SKIER } from '../viewer/skier';
import CYCLES from './carve-cycles.json';
import { ANGULATION_MAX_DEG, GRIP_RATIO } from './edge';
import type { Snow as SnowT } from './edge';
import { REACH } from './moguls';
import { BEND_RADIUS_MAX_M, BEND_RADIUS_MIN_M, BEND_REFERENCE } from './ski-bend';
import type { TurnTask } from './task';
import { G, HIP_WIDTH_M, ROOT_TOP, SWITCH_SHARE, V_FLOOR, carveRootsOf, carveSetupOf } from './turn';
import type { SolveOptions } from './turn';

/**
 * One baked sample series per key, turn 1 only, t from 0 (switch) to periodS (next switch). psi the mass's heading, psiS
 * the skis', gam the slip angle γ, om the skis' yaw rate off the carve ω, slip the slip speed Π; share the outside ski's
 * (the inside's is 1 − share); branch 1 pressed, 0 bridged, 0.5 on the boundary; pressed 1 unless bridged.
 */
export const CARVE_SAMPLE_KEYS = [
  't', 'lam', 'lamDot', 'h', 'hDot', 'hDdot', 'eps', 'epsDot', 'p', 'pDot', 'psi', 'v', 'kSki', 'load', 'share', 'pressed', 'psiS', 'gam', 'om', 'slip', 'branch',
] as const;
export type CarveSampleKey = (typeof CARVE_SAMPLE_KEYS)[number];

/** A recorded gate: its value and verdict; ok null where R4 set no threshold (reported only, as R4's table did). */
export interface CarveGate {
  readonly value: unknown;
  readonly ok: boolean | null;
}

/** A whole-turn solve's cycle (scripts/solve/carve_cycle.py bake), keyed "<kind>-<intensity>", baked with its verdicts pass or fail. */
export interface CarveCell {
  /** carveBakeInputsOf's layout: { cell, solver, course, python }. */
  readonly inputs: Readonly<Record<string, unknown>>;
  /** The solve's start, not compared. */
  readonly seed: { readonly lamPeak0: number; readonly speedMps: number };
  /** Solved switch headings off the fall line, degrees: the skis' (ψ_ski state) and the mass's. */
  readonly switchSkisOffFallDeg: number;
  readonly switchMassOffFallDeg: number;
  /** The course as solved: mean speed, fall-line distance and gate offset D per turn. */
  readonly course: { readonly meanSpeedMps: number; readonly turnLM: number; readonly dM: number };
  readonly periodS: number;
  readonly speedMps: number;
  readonly lamPeak: number;
  readonly defectDegS: number;
  readonly nodes: number;
  /** max |λ(N) − λ(N/2)| at the N solve's nodes (mesh_change_lam), degrees. */
  readonly meshChangeLamDeg: number;
  /** Both starts' agreement (gates_r4 identified). */
  readonly startsAgreement: CarveGate;
  /** Every gates_r4 entry. */
  readonly gates: Readonly<Record<string, CarveGate>>;
  /** The TS restart replay's worst |Δλ|, degrees, against meshChangeLamDeg. */
  readonly replay: CarveGate;
  readonly samples: Readonly<Record<CarveSampleKey, ReadonlyArray<number>>>;
}

export interface CarveCells {
  readonly version: number;
  readonly cells: Readonly<Record<string, CarveCell>>;
}

export const CARVE_CELLS: CarveCells = CYCLES as unknown as CarveCells;

/** Options the bake does not read; any set means the cycle is not the baked one. */
const UNBAKED: ReadonlyArray<keyof SolveOptions> = ['constantSpeed', 'movementRangeM', 'transitionPhase', 'switchHeadingDeg', 'legStep'];

interface LitSlalom {
  readonly events: { readonly grf_max: string; readonly skid_peak: string };
  readonly leg_length_cm: Readonly<Record<string, unknown>> & { readonly source: string; readonly status: string };
  readonly period_s: { readonly values: Readonly<Record<string, string>> };
}

const LIT_SLALOM = (LIT as unknown as { readonly slalom: LitSlalom }).slalom;

/** The const keys carve_cycle.py reads as c['…'] (a test greps it), the seed lamPeak0 apart. */
export const SOLVER_READ_KEYS = [
  'ANGULATION_MAX_DEG', 'EDGE_RATE_DEG_S', 'F_CEIL_G', 'G', 'GRIP_RATIO', 'HD_MAX', 'REACH', 'ROOT_TOP', 'S', 'SWITCH_SHARE', 'V_FLOOR',
  'bend', 'compliance', 'dragPerV2', 'mass', 'mu', 'ski', 'slopeDeg', 'stance',
] as const;
/** The solve's start: recorded under the cell's seed, never compared. */
export const SOLVER_SEED_KEYS = ['lamPeak0', 'speedMps'] as const;

const skidPeak = LIT_SLALOM.events.skid_peak.match(/^t [^,]*, ([\d.]+) ±/);

/**
 * carve_cycle.py's own constants, each as the Python computes it (the bake records Python's live values, so a change on
 * either side shows stale).
 */
export const SOLVER_CONSTANTS = {
  // reid-2010 SL skid peak mean (slalom.events.skid_peak), inferred as the full-slip attack.
  GAM_REF: (skidPeak === null ? Number.NaN : Number.parseFloat(skidPeak[1] ?? '')) * Math.PI / 180,
  // |ω| and max(0, b − a) smoothings, rad/s and m/s: numerical.
  OM_DELTA: 1e-3,
  P_DELTA: 1e-3,
  // Scholtes homotopy on the bend branch's complementarity.
  TAUS: [1e-2, 1e-3, 1e-4, 1e-5, 1e-6],
  // Hip rotation moment maxima, Nm/kg: outside ER, inside IR (heinrich-2022).
  M_REF_OUT: 0.17,
  M_REF_IN: 0.23,
  // Per ski without binding, kg, by length: Stöckli Laser SL FIS 165 3.59 kg a pair; Völkl Racetiger GS 3.11 kg a pair, the mid of 3020–3200 g.
  SKI_MASS: { '1.65': 3.59 / 2, '1.73': 3.11 / 2 },
  // Marker Race XCell 16 5.19 lb a pair plus a WC Piston plate 709 g a half pair.
  BINDING_MASS: 5.19 * 0.45359 / 2 + 0.709,
  // Atomic Redster Club Sport 130 at 26.5, per boot inferred.
  BOOT_MASS: 2.357,
  // de-leva-1996 Table 4 male: mass share, radius of gyration, length m.
  FOOT: [0.0137, 0.245, 0.2581],
  SHANK: [0.0433, 0.102, 0.4403],
  // The boot's sole length (skier.ts HORISHIMA bsl), the shank (anatomyBody(1.68).shin), stature for the foot's scale.
  BSL: 0.295,
  SHIN: 0.367634 * 1.68 / 1.716251,
  STATURE: 1.68,
  LEVA_STATURE: 1.741,
  // The boot over the ski centre: skier.ts SKI_MOUNT, inferred there.
  MOUNT: 0.05,
  GAM_MAX: 60.0 * Math.PI / 180,
  // Lateral |cos ψ| smoothing: numerical.
  ABS_DELTA: 1e-3,
} as const;

/**
 * The full const file carve_cycle.py's cycle reads for `task` (scripts/solve/const.ts writes it), `cell` its label; null
 * when an option the bake does not read is set or the measured ceilings do not parse.
 */
export const carveSolverConstOf = (task: TurnTask, snow: SnowT, options: SolveOptions, cell: unknown): Record<string, unknown> | null => {
  if (UNBAKED.some((k) => options[k] !== undefined)) return null;
  const st = carveSetupOf(task, snow, options);
  const ski = task.ski;
  const v0 = task.speedMps;
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
    mMax: st.inputs.mMax,
    mDeg: st.mDeg,
    S: st.inputs.share,
    ANGULATION_MAX_DEG,
    stance: st.inputs.stance,
    GRIP_RATIO,
    GRIP_RATIO_SRC: 'src/physics/edge.ts GRIP_RATIO (inferred)',
  };
  // Measured human ceilings (reid-2010 SL): the highest carved-turn ground force, the fastest leg-length step.
  const grfSrc = LIT_SLALOM.events.grf_max;
  const grf = grfSrc.match(/([\d.]+)\s*\/\s*([\d.]+)\s*BW/);
  if (grf === null) return null;
  const legs = LIT_SLALOM.leg_length_cm;
  const rates: Record<string, unknown> = {};
  let hdMax = 0;
  for (const [course, cv] of Object.entries(legs) as [string, { readonly t?: unknown; readonly mean: ReadonlyArray<number>; readonly rom: unknown }][]) {
    const t = cv?.t;
    if (!Array.isArray(t)) continue;
    const pk = `reid-2010 ${course.replace('m', ' m')}`;
    const ps = LIT_SLALOM.period_s.values[pk];
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
  // The cold start's first λ_peak: the fall line's root less mMax at the preset speed.
  const fall = carveRootsOf(st.s, v0, Math.PI / 2, st.inputs.mMax, st.inputs.share);
  out['lamPeak0'] = (Number.isNaN(fall.first) ? fall.nearest : fall.first) - st.inputs.mMax;
  return out;
};

/** A carved preset's course as the solver runs it; null without a gate offset. */
const carveCourseOf = (task: TurnTask): Record<string, unknown> | null =>
  task.gateOffsetM === undefined ? null : { meanSpeedMps: task.speedMps, turnLM: task.turnSizeM, offsetM: task.gateOffsetM, dSolved: task.gateOffsetSolved === true };

/** What the bake records and compares for `task`: { cell, solver: the read keys, course, python: SOLVER_CONSTANTS }; null as carveSolverConstOf, or without a course. */
export const carveBakeInputsOf = (task: TurnTask, snow: SnowT, options: SolveOptions, cell: unknown): Record<string, unknown> | null => {
  const c = carveSolverConstOf(task, snow, options, cell);
  const course = carveCourseOf(task);
  if (c === null || course === null) return null;
  return { cell, solver: Object.fromEntries(SOLVER_READ_KEYS.map((k) => [k, c[k]])), course, python: SOLVER_CONSTANTS };
};

/** JSON values equal key for key, numbers exactly: a JSON round trip of a double is exact. */
export const sameJson = (a: unknown, b: unknown): boolean => {
  if (typeof a !== 'object' || a === null || typeof b !== 'object' || b === null) return a === b;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const [ka, kb] = [Object.keys(a), Object.keys(b)];
  return ka.length === kb.length && ka.every((k) => Object.hasOwn(b, k) && sameJson((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]));
};

/** The baked cell whose inputs equal the task's (the stale-bake test checks each preset finds its own); null runs the forward march. */
export const carveCellFor = (task: TurnTask, snow: SnowT, options: SolveOptions, cells: CarveCells = CARVE_CELLS): CarveCell | null => {
  for (const cell of Object.values(cells.cells)) {
    const want = carveBakeInputsOf(task, snow, options, cell.inputs['cell']);
    if (want !== null && sameJson(want, cell.inputs)) return cell;
  }
  return null;
};
