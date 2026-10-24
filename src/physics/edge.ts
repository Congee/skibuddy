import type { Ski } from '../viewer/skier';
import type { TurnTask } from './task';
import { turnProfile } from './turn';

const DEG = Math.PI / 180;

/** Snow the skis carve; only hard groomed until a penetration source is read. */
export const Snow = { HardGroomed: 'hard-groomed' } as const;
export type Snow = (typeof Snow)[keyof typeof Snow];

/** Bend-and-penetration factor k in r = k R_sc cos ε: range-only 0.7–1.0 (thorwartl-2023, values still to read); 0.85 inferred default. */
export const BEND_FACTOR: Readonly<Record<Snow, number>> = { [Snow.HardGroomed]: 0.85 };

/** Gliding friction μ_k of the base along the ski: 0.04 on hard snow, inferred (no source read); softer snow, when added, higher. */
export const GLIDING_FRICTION: Readonly<Record<Snow, number>> = { [Snow.HardGroomed]: 0.04 };

/** Flat-ski gliding COF by snow condition, ski rows as printed (wolfsperger-2021 Table 5): overall mean 5–15 m/s, σ, COF at 10 m/s. */
export const FLAT_SKI_FRICTION = [
  { snow: 'spring dry', overall: 0.026, sd: 0.004, at10: 0.025 },
  { snow: 'spring dry', overall: 0.028, sd: 0.004, at10: 0.027 },
  { snow: 'spring dry', overall: 0.037, sd: 0.001, at10: 0.037 },
  { snow: 'spring wet', overall: 0.043, sd: 0.003, at10: 0.042 },
  { snow: 'spring wet', overall: 0.044, sd: 0.005, at10: 0.045 },
  { snow: 'spring wet', overall: 0.054, sd: 0.006, at10: 0.053 },
  { snow: 'spring very wet', overall: 0.082, sd: 0.006, at10: 0.082 },
  { snow: 'winter warm', overall: 0.048, sd: 0.002, at10: 0.046 },
  { snow: 'winter warm', overall: 0.059, sd: 0.003, at10: 0.059 },
  { snow: 'winter warm', overall: 0.059, sd: 0.003, at10: 0.054 },
  { snow: 'winter mid', overall: 0.042, sd: 0.001, at10: 0.04 },
  { snow: 'winter mid', overall: 0.045, sd: 0.001, at10: 0.045 },
  { snow: 'winter cold', overall: 0.052, sd: 0.001, at10: 0.051 },
  { snow: 'winter cold', overall: 0.059, sd: 0.001, at10: 0.059 },
  { snow: 'new dry', overall: 0.06, sd: 0.008, at10: 0.056 },
  { snow: 'new dry snowfall', overall: 0.079, sd: 0.007, at10: 0.075 },
  { snow: 'new wet', overall: 0.087, sd: 0.01, at10: 0.078 },
  { snow: 'new very wet', overall: 0.138, sd: 0.015, at10: 0.133 },
] as const;

/** Ski on edge: 0.064 traversing at up to 10.6 m/s (kaps-1996 Tab. 2), the nearest datum, no clean-carve measurement; soft-snow input 0.080 + 0.004 v (moessner-2008). */
export const EDGE_FRICTION = 0.064;
export const SOFT_SNOW_EDGE_FRICTION = { a: 0.08, b: 0.004 } as const;

/** Mid-extended CdA 0.529 m² at 10 m/s, air 1 kg/m³ (wolfsperger-2021 error budget). */
export const DRAG_AREA_M2 = 0.529;

/**
 * Most edge margin the legs make over the lean, degrees; range-only: outside hip abduction 3–27° plus lumbar lateral
 * 0–5° (heinrich-2022 Table 1) plus a small knee share (F2.3), about 20–35° (motion-model §4.2).
 */
export const ANGULATION_MAX_DEG = 30;

/** Most margin the legs reach at counter `counterDeg`, degrees; counter's effect is pending the research lane. */
export const angulationReach = (_counterDeg: number): number => ANGULATION_MAX_DEG;

/** Snow compliance c, m/N, the edge's sink d = c F under the outside ski's load: hard groomed 6e-7–1.0e-6 from federolf-2005 Table 4 hard snow and moessner-2013's race piste; inferred. */
export const SNOW_COMPLIANCE: Readonly<Record<Snow, number>> = { [Snow.HardGroomed]: 8e-7 };
/** Soft snow's c, fitted to federolf-2005 Table 7 FE radii at 20–50°, 1000–1400 N (rms 0.29 m); inferred. */
export const SOFT_SNOW_COMPLIANCE = 4.4e-6;
/** Above this edge federolf-2005's soft-snow radius levels near 0.5 R_sc, which carvedRadius does not; flagged. */
export const SOFT_LEVEL_EDGE_DEG = 55;

/**
 * Carved radius on edge `edgeRad` with the edge sunk `sinkM`, metres: L² / (8 (D / cos ε + d sin ε)) (federolf-2005 eq 91,
 * kaps-2001 eq 4), D the sidecut depth, L from R_sc so d 0 is Howe's R_sc cos ε.
 */
export const carvedRadius = (ski: Ski, edgeRad: number, sinkM: number): number => {
  const depth = (ski.tip + ski.tail - 2 * ski.waist) / 4;
  return (8 * depth * ski.sidecutRadius) / (8 * (depth / Math.cos(edgeRad) + sinkM * Math.sin(edgeRad)));
};

/** Band of the edge margin ε − λ while loaded, degrees (motion-model §4.2): carved [0, A_max], steered [−5, 10] (inferred), moguls [0, A_max]. */
export const marginBandDeg = (task: TurnTask): { readonly min: number; readonly max: number } => ({ min: task.legacy.marginBandDeg[0], max: task.legacy.marginBandDeg[1] });

export interface EdgeGoal {
  readonly edgeDeg: number;
  /** Balance-axis lean of the mass path. */
  readonly leanDeg: number;
  /** Band for the margin ε − λ. */
  readonly marginMinDeg: number;
  readonly marginMaxDeg: number;
  /** The skis' arc. */
  readonly radiusM: number;
}

/** Edge goal at turn time `t` (0 switch, 1 next switch), from the mass path and the task's edge rule. */
export const edgeGoalAt = (task: TurnTask, t: number, snow: Snow = task.snow ?? Snow.HardGroomed): EdgeGoal => {
  const p = turnProfile(task, snow).at(t);
  const band = marginBandDeg(task);
  return { edgeDeg: p.edge / DEG, leanDeg: p.lean / DEG, marginMinDeg: band.min, marginMaxDeg: band.max, radiusM: p.skiRadius };
};
