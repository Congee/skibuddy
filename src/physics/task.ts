import { Intensity } from '../content/schema';
import { CARVING_SKIS, REFERENCE_SKIER, Terrain, skiFor } from '../viewer/skier';
import type { CarvingKind, Ski } from '../viewer/skier';
import { ANGULATION_MAX_DEG, GRIP_RATIO, Snow, marginBandDeg } from './edge';
import type { Snow as SnowT } from './edge';
import { REACH } from './moguls';
import type { MogulMass } from './moguls';
import { Boundary, LEAST_HALF_SWEEP, MOGUL_COM, MOGUL_OUTSIDE_SHARE, TopBound, arcPeakTOf, bridgeOf, mogulMassFor, outsideShareFrom, turnProfile } from './turn';
import type { TurnScenario } from './turn';

const DEG = Math.PI / 180;

/** A kind names the mechanism that turns the ski (motion-model §1); it is only a preset of `TurnTask`. */
export const TurnKind = { GS: 'gs', SL: 'sl', Steered: 'steered', Moguls: 'moguls' } as const;
export type TurnKind = (typeof TurnKind)[keyof typeof TurnKind];
export const TURN_KINDS: ReadonlyArray<TurnKind> = [TurnKind.GS, TurnKind.SL, TurnKind.Steered, TurnKind.Moguls];
export const KIND_LABEL: Readonly<Record<TurnKind, string>> = { [TurnKind.GS]: 'GS', [TurnKind.SL]: 'SL', [TurnKind.Steered]: 'Steered', [TurnKind.Moguls]: 'Moguls' };

/** Digitised curve that scales a carved edge; `lean-plus-set` rides the lean with the set margin. */
export const EdgeShape = { GsCarving: 'gs_carving', Slalom: 'slalom', LeanPlusSet: 'lean-plus-set' } as const;
export type EdgeShape = (typeof EdgeShape)[keyof typeof EdgeShape];

/** The fore-aft goal: a lit-curves.json curve over the prior phase, or a constant, metres. */
export type ForeAft = { readonly curve: 'gs_carving' | 'slalom' } | { readonly aheadM: number };
/** A measured moment set the solve holds on the outside leg and the lowest spine joint. */
export type MomentBands = 'heinrich-2022';

/** Rule 4's load band, BW. */
export interface LoadBand {
  readonly meanMin: number;
  readonly meanMax: number;
  readonly peakMin: number;
  readonly peakMax: number;
  readonly status: string;
}

/** The style amounts of motion-model §7 a task holds. */
export interface TaskStyle {
  /** Counter the pelvis holds beyond the physics' own, degrees; 0 everywhere. */
  readonly counterHabitDeg: number;
  /** Angulation M, degrees: the edge margin m = M s(t) at the loaded phase's middle on groomed snow; 0 until the user picks one. */
  readonly angulationDeg: number;
  /** The outside foot's share of the load mid-turn: the peak of outsideShareFrom. */
  readonly outsideShare: number;
  /** Carved: §7's transition phase, the turn phase of the lowest mass height (0 cross-under, ½ cross-over). */
  readonly transitionPhase?: number;
  /** Carved: §7's movement range, the mass height's amplitude about the stance depth, m; absent: h constant. */
  readonly movementRangeM?: number;
}

/** Rules 5 and 6's ceilings of a dynamic preset: the bump period window and the speed. */
export interface TaskCeilings {
  readonly periodS: readonly [number, number] | null;
  readonly speedMps: number;
}

/** Fields removed by the physics lane (motion-model §9 R2). */
export interface TaskLegacy {
  /** Band of ε − λ while loaded. */
  readonly marginBandDeg: readonly [number, number];
  readonly loadBand: LoadBand;
  /** The counter band about its centre, symmetric (motion-model §4.5); at share 1 about the fall line. */
  readonly counterToleranceDeg: readonly [number, number];
  /** Bumps: share of the way the pelvis faces from the mass heading to the fall line, 1 quiet (motion-model §4.5); groomed: unread. */
  readonly pelvisShare?: number;
  /** Unread: the groomed edge comes from the sidecut and σ. */
  readonly edgeShape?: EdgeShape;
  /** Unread: the groomed attack is σ Γ, and the bump closure's attack alone yaws the skis. */
  readonly setDeg?: number;
  /** The fore-aft goal (motion-model §4.6): a digitised lit-curves.json curve, or the CoM a constant ahead of the outside ankle along the ski. */
  readonly foreAft: ForeAft;
  /** Measured outside-leg moment bands and force-peak values the solve holds (motion-model §9 F); null: effort only. */
  readonly momentBands: MomentBands | null;
  /** Rule 8: the measured force-peak window, cycle fractions; null reports only. */
  readonly forcePeakWindow: readonly [number, number] | null;
  readonly forcePeakSource: string;
  /** The ZIPPER_SCENARIOS cell the inside share reads (bump presets), else null. */
  readonly shareScenario: TurnScenario | null;
  /** Rules 5 and 6 of a dynamic preset; null: neither applies. */
  readonly ceilings: TaskCeilings | null;
}

/** The complete parameter vector of a turn (motion-model §3); the presets below are named points of it. */
export interface TurnTask {
  /** The cycle's time-mean speed on the mass path (motion-model §9 V); it was the constant speed. */
  readonly speedMps: number;
  /** The forward march's switch speed; absent (every preset): speedMps. */
  readonly entrySpeedMps?: number;
  /** Bumps: the skis' arc; groomed: legacy, unread; carved presets: 0, unread (the profile's skiRadius is the carved radius). */
  readonly radiusM: number;
  readonly slopeDeg: number;
  /** Turn size L: the mass path's fall-line distance per turn, metres; carved: the solver's course; bumps: the spacing. */
  readonly turnSizeM: number;
  /** Carved: the gate offset D, the mass's lateral travel per turn, metres; the solver's course (its seed when solved). */
  readonly gateOffsetM?: number;
  /** Carved: D solved by the energy balance, gateOffsetM only its seed. */
  readonly gateOffsetSolved?: boolean;
  /** Legacy, unread: the groomed mass path comes from the balance. */
  readonly massRadiusM?: number;
  /** Legacy, unread: the turn size and the closure set the period. */
  readonly periodS?: number;
  /** Legacy, unread: the closure sets the half sweep. */
  readonly halfSweepDeg?: number;
  /** Legacy, unread: the sidecut and σ set the edge; only the model panel reads it. */
  readonly edgeMaxDeg?: number;
  /** 0 on groomed snow. */
  readonly bumpSpacingM: number;
  /** 0 on groomed snow; above 0 the bump's normal term and the mogul set apply. */
  readonly bumpHeightM: number;
  readonly snow?: SnowT;
  readonly ski: Ski;
  /** σ: 0 carved, the edge at the sidecut's ε_c; 1 the edge at the lean, attack σ Γ. */
  readonly skidShare: number;
  /** The arc share's peak time; absent: ARC_PEAK_T (arcPeakTOf reports the one rule 8's window asks for). */
  readonly arcPeakT?: number;
  readonly style: TaskStyle;
  readonly legacy: TaskLegacy;
}

/** A named point of the parameters: the menu's kind and intensity, the pick's status, and the task. */
export interface Preset {
  readonly kind: TurnKind;
  readonly intensity: Intensity;
  /** Status and anchor of the pick. */
  readonly why: string;
  readonly task: TurnTask;
}

const I = Intensity;
const K = TurnKind;

/** A drill's scenario per setting; the drill's content is the only source. */
export type TurnScenarios = Readonly<Record<Intensity, TurnScenario>>;

// FIS course angles: FIS level 25 ± 3°, World Cup 28 ± 4° (fis-course-standards-2023 p3); gentle's 18° inferred.
// Dynamic nears the pace speeds, 9.0 and 10.3 m/s down the course (fis-icr-book6-2025 §4207.2), 235 m in 25-30 s (fis-moguls-101-2026):
// one radius at every intensity keeps one turn per mogul on the course's 3.5 m spacing (surface.ts), 1.6, 2.1 and 2.7 turns a second.
// A quarter of the braking is fore-aft at the feet, inferred: at a level hip line the faces average none, the edges skidding take the rest.
export const ZIPPER_SCENARIOS: TurnScenarios = {
  gentle: { speedMps: 6, radiusM: 5, slopeDeg: 18, comRadiusM: MOGUL_COM * 5, brakingShare: 0.25 },
  moderate: { speedMps: 8, radiusM: 5, slopeDeg: 25, comRadiusM: MOGUL_COM * 5, brakingShare: 0.25 },
  dynamic: { speedMps: 10, radiusM: 5, slopeDeg: 28, comRadiusM: MOGUL_COM * 5, brakingShare: 0.25 },
};

const SHARE_STEP: Readonly<Record<Intensity, number>> = { gentle: 0, moderate: 0.5, dynamic: 1 };
/** The outside share's peak at an intensity: `range` gentle to dynamic. */
const outsidePeakOf = (range: readonly [number, number], intensity: Intensity): number => range[0] + (range[1] - range[0]) * SHARE_STEP[intensity];

/** Load share of the outside foot at turn time `t` in a drill's scenario: the mid-turn split `range` gives at this intensity. */
export const outsideShareAt = (range: readonly [number, number], intensity: Intensity, s: TurnScenario, t: number): number =>
  outsideShareFrom(outsidePeakOf(range, intensity), s, t);

// The presets below are the one place a name becomes numbers.
const GROOMED_STYLE: TaskStyle = {
  counterHabitDeg: 0,
  angulationDeg: 0,
  // Off bumps only the carve's snow sink reads it; the drill path's gentle value.
  outsideShare: MOGUL_OUTSIDE_SHARE[0],
};
/** The outside ski's share of the load mid-turn in a carve: measured 0.62-0.72 (nakazato-2011 Table 1, falda-buscaiot-2017, kroll-2015, thorwartl-2023). */
export const CARVE_OUTSIDE_SHARE = 0.68;
// Groomed dynamic presets: no period window, no speed ceiling; bumps: the 0.35-0.4 s window and FIS's 10.3 m/s.
const groomedCeilings = (intensity: Intensity): TaskCeilings | null => (intensity === I.Dynamic ? { periodS: null, speedMps: Number.POSITIVE_INFINITY } : null);
// Symmetric about the share's centre; inferred.
const COUNTER_TOLERANCE = [-10, 10] as const;
const MOGUL_COUNTER = [-20, 20] as const;
const OPEN = { meanMin: 0, meanMax: Number.POSITIVE_INFINITY, peakMin: 0, peakMax: 2.1 };
const MEAN_LOAD: LoadBand = { ...OPEN, meanMin: 1, meanMax: 1.3, status: 'nakazato-2011 outside-phase mean 1.0–1.3, peak ≤ 2.1' };
const CARVED_PEAK: LoadBand = { ...OPEN, peakMin: 1.6, status: 'nakazato-2011 carved peak 1.6–2.1' };
const MOGUL_LOAD: LoadBand = { ...OPEN, peakMin: 1, peakMax: 2.5, status: 'inferred: no mogul force curve read; 1.0–2.5 with the bump spike' };
/** CoM over the ski frame's origin (the mount), metres ahead of the outside ankle: −ANKLE_ALONG in motion/turn.ts, a test holds them equal; inferred. */
const MID_FOOT_AHEAD_M = 0.0528;
const FORE_AFT: Readonly<Record<TurnKind, ForeAft>> = {
  // sporri-2016 Fig 4 dFore/Aft.
  [K.GS]: { curve: 'gs_carving' },
  // reid-2010 p238, three range-only anchors.
  [K.SL]: { curve: 'slalom' },
  [K.Steered]: { aheadM: MID_FOOT_AHEAD_M },
  [K.Moguls]: { aheadM: MID_FOOT_AHEAD_M },
};
/** heinrich-2022 measured GS; SL scaled per BW of outside force is inferred; skidded kinds unmeasured. */
const MOMENT_BANDS: Readonly<Record<TurnKind, MomentBands | null>> = { [K.GS]: 'heinrich-2022', [K.SL]: 'heinrich-2022', [K.Steered]: null, [K.Moguls]: null };
/** Rule 8's force-peak window per kind (scripts/prior/lit-curves.json events); the ±0.08 half-width is inferred. */
const FORCE_PEAK: Readonly<Record<TurnKind, Pick<TaskLegacy, 'forcePeakWindow' | 'forcePeakSource'>>> = {
  [K.GS]: { forcePeakWindow: [0.6, 0.76], forcePeakSource: 'kroll-2015 Fig 1B t ≈0.68, eye-read; ±0.08 inferred' },
  [K.SL]: { forcePeakWindow: [0.43, 0.59], forcePeakSource: 'reid-2010 p245 grf_max t 0.51, 10 m course; ±0.08 inferred' },
  [K.Steered]: { forcePeakWindow: [0.4, 0.6], forcePeakSource: 'nakazato-2011 Fig 6, 0.4–0.6 of the outside phase, eye-read' },
  [K.Moguls]: { forcePeakWindow: null, forcePeakSource: 'at the hit, where the tip passes the trough (mogulTrackOf), report only' },
};

/** §7's preset transition phase per carved kind: cross-over GS, cross-under SL. */
const TRANSITION_PHASE: Readonly<Record<CarvingKind, number>> = { [K.GS]: 0.5, [K.SL]: 0 };

/** A kind's ski: the carved kinds' race skis, else the reference skier's for the terrain. */
export const skiForKind = (kind: TurnKind): Ski =>
  kind === K.SL || kind === K.GS ? CARVING_SKIS[kind] : skiFor(REFERENCE_SKIER, kind === K.Moguls ? Terrain.Moguls : Terrain.Groomed);

/** A carved preset's course as the whole-turn solver runs it (scripts/solve/carve_cycle.py cycle --speed --turn-l --offset --free-d). */
interface CarveCourse {
  readonly meanSpeedMps: number;
  readonly turnLM: number;
  readonly offsetM: number;
  readonly dSolved: boolean;
}

// M: hip angulation, degrees. No counter in a carve. The bake's inputs carry slope and course (test/carve-bake.test.ts fails a stale cell).
const carved = (kind: CarvingKind, intensity: Intensity, course: CarveCourse, slopeDeg: number, angulationDeg: number, loadBand: LoadBand, why: string): Preset => {
  const ski = skiForKind(kind);
  return {
    kind, intensity, why,
    task: {
      speedMps: course.meanSpeedMps, radiusM: 0, slopeDeg, turnSizeM: course.turnLM, gateOffsetM: course.offsetM, gateOffsetSolved: course.dSolved,
      bumpSpacingM: 0, bumpHeightM: 0, ski, skidShare: 0,
      style: { ...GROOMED_STYLE, angulationDeg, outsideShare: CARVE_OUTSIDE_SHARE, transitionPhase: TRANSITION_PHASE[kind] },
      legacy: {
        marginBandDeg: [0, ANGULATION_MAX_DEG], loadBand, counterToleranceDeg: COUNTER_TOLERANCE, foreAft: FORE_AFT[kind],
        momentBands: MOMENT_BANDS[kind], ...FORCE_PEAK[kind], shareScenario: null, ceilings: groomedCeilings(intensity),
      },
    },
  };
};

// D seeds the solve; the energy balance solves it (the baked cell's course.dM).
const raceCourse = (meanSpeedMps: number, turnLM: number, offsetM: number): CarveCourse => ({ meanSpeedMps, turnLM, offsetM, dSolved: true });
const SL_SLOPE_DEG = 19;
const SL_WHY = 'θ 19° inside FIS SL 18–24° (fis-icr-alpine-2026 §802.1.1), the pick inferred; course reid-2010 10 m × 2 m (lit-curves slalom._context): L √(10² − 2²) 9.80 m, D 2 m the seed';
const slCourse = (v: number): CarveCourse => raceCourse(v, 9.79796, 2);
const GS_SLOPE_DEG = 18;
const GS_WHY = 'θ 18° from the World Cup GS terrain median 17.8° (gilgien-2015 Table 1), inferred; course gilgien-2015 Table 1 medians (the R1 brief: 26.24 m apart, 7.47 m aside; biomechanics.md: 26 m, 7.5 m): L 25.15 m, D 7.47 m the seed';
const gsCourse = (v: number): CarveCourse => raceCourse(v, 25.15, 7.47);

const steered = (intensity: Intensity, v: number, r: number, slopeDeg: number, skidShare: number, turnSizeM: number, why: string): Preset => ({
  kind: K.Steered, intensity, why,
  task: {
    speedMps: v, radiusM: r, slopeDeg, turnSizeM, bumpSpacingM: 0, bumpHeightM: 0,
    ski: skiFor(REFERENCE_SKIER, Terrain.Groomed), skidShare, style: GROOMED_STYLE,
    legacy: {
      marginBandDeg: [-5, 10], loadBand: MEAN_LOAD, counterToleranceDeg: COUNTER_TOLERANCE, foreAft: FORE_AFT[K.Steered], momentBands: MOMENT_BANDS[K.Steered], ...FORCE_PEAK[K.Steered], shareScenario: null, ceilings: groomedCeilings(intensity),
    },
  },
});

/** Bump spacing, metres; inferred, no read source; kurpiers-2020 p338 measured 4 m on a wave slope. */
export const MOGUL_SPACING_M = 3.5;
/** The one field's relief, metres: ridableReliefOf the dynamic cell on its own line, the skis bridging, the leg leaning; a test holds it. */
export const MOGUL_RELIEF_M = 0.32;

// One field at every intensity; each cell cuts its own line through it (mogulLineFor).
const moguls = (intensity: Intensity, v: number, slopeDeg: number, why: string): Preset => ({
  kind: K.Moguls, intensity, why,
  task: {
    speedMps: v, radiusM: 5, slopeDeg, turnSizeM: MOGUL_SPACING_M, bumpSpacingM: MOGUL_SPACING_M, bumpHeightM: MOGUL_RELIEF_M, ski: skiFor(REFERENCE_SKIER, Terrain.Moguls),
    // Skidded wherever the attack is on; the energy closure, not a set or a band share, sizes it (solveProfile).
    skidShare: 1, style: { counterHabitDeg: 0, angulationDeg: 0, outsideShare: outsidePeakOf(MOGUL_OUTSIDE_SHARE, intensity) },
    legacy: {
      marginBandDeg: [0, ANGULATION_MAX_DEG], loadBand: MOGUL_LOAD, counterToleranceDeg: MOGUL_COUNTER, pelvisShare: 1, foreAft: FORE_AFT[K.Moguls], momentBands: MOMENT_BANDS[K.Moguls], ...FORCE_PEAK[K.Moguls], shareScenario: ZIPPER_SCENARIOS[intensity],
      ceilings: intensity === I.Dynamic ? { periodS: [0.35, 0.4], speedMps: 10.3 } : null,
    },
  },
});

export const PRESETS: Readonly<Record<TurnKind, Readonly<Record<Intensity, Preset>>>> = {
  [K.GS]: {
    [I.Gentle]: carved(K.GS, I.Gentle, gsCourse(9), GS_SLOPE_DEG, 5, MEAN_LOAD, `${GS_WHY}; M 5°, mean speed 9 m/s inferred`),
    [I.Moderate]: carved(K.GS, I.Moderate, gsCourse(11), GS_SLOPE_DEG, 10, MEAN_LOAD, `${GS_WHY}; M 10°, mean speed 11 m/s inferred`),
    [I.Dynamic]: carved(K.GS, I.Dynamic, gsCourse(13), GS_SLOPE_DEG, 15, MEAN_LOAD, `${GS_WHY}; M 15°, mean speed 13 m/s inferred`),
  },
  [K.SL]: {
    [I.Gentle]: carved(K.SL, I.Gentle, slCourse(8), SL_SLOPE_DEG, 5, MEAN_LOAD, `${SL_WHY}; M 5°, mean speed 8 m/s inferred`),
    [I.Moderate]: carved(K.SL, I.Moderate, slCourse(9.5), SL_SLOPE_DEG, 10, MEAN_LOAD, `${SL_WHY}; M 10°, mean speed 9.5 m/s inferred`),
    [I.Dynamic]: carved(K.SL, I.Dynamic, slCourse(11), SL_SLOPE_DEG, 15, CARVED_PEAK, `${SL_WHY}; M 15°, mean speed 11 m/s inferred`),
  },
  [K.Steered]: {
    [I.Gentle]: steered(I.Gentle, 6, 14, 12, 0.3, 26.693, 'inferred, middle of §3 (recreational medium skidded turns); mean 1.01 at the foot of nakazato-2011 1.0–1.3'),
    [I.Moderate]: steered(I.Moderate, 7, 10, 17, 0.5, 11.726, 'inferred, middle of §3 (nakazato-2016, bon-2021 recreational short turns)'),
    [I.Dynamic]: steered(I.Dynamic, 7, 7.5, 25, 0.7, 7.784, 'inferred, middle of §3 short-swing; fall-line λ 35.7° under the 40° cap (rule 3)'),
  },
  [K.Moguls]: {
    [I.Gentle]: moguls(I.Gentle, 5, 17, 'inferred pace and pitch: recreational bumps, F1.5 mass path; the dynamic cell\'s field (rule 9) on its own slower line'),
    [I.Moderate]: moguls(I.Moderate, 7, 22, 'inferred pace and pitch: §3 worked point; the dynamic cell\'s field (rule 9) on its own slower line'),
    [I.Dynamic]: moguls(I.Dynamic, 9.5, 26, 'ceiling: FIS pace 9.0–10.3 m/s (fis-icr-book6-2025 §4207) on 25–28° (inferred in 28°±4°, fis-moguls-101-2026), 0.35–0.4 s per bump = spacing / pace; the field\'s relief the largest it rides on its own line (rule 9), the leg\'s reach along its lean, the line\'s swing from the clips\' mass lean (M2)'),
  },
};

/** The one place that knows presets. */
export const presetOf = (kind: TurnKind, intensity: Intensity): Preset => PRESETS[kind][intensity];
export const taskFor = (kind: TurnKind, intensity: Intensity): TurnTask => PRESETS[kind][intensity].task;

/** Phase events as cycle fractions in [0, 1), motion-model §4.7. */
export interface TurnEvents {
  readonly switch: number;
  /** Groomed and carved: the arc share reaches half (threshold inferred); moguls: the mass's crest. */
  readonly engagement: number;
  /** The mass heads down the fall line. */
  readonly fallLine: number;
  /** Largest snow force on the mass path. */
  readonly forcePeak: number;
  /** The arc share falls below half: edge release (inferred). */
  readonly release: number;
}

export const eventsOf = (task: TurnTask, snow: SnowT = task.snow ?? Snow.HardGroomed): TurnEvents => turnProfile(task, snow).events;

export interface FeasibilityCheck {
  readonly rule: number;
  readonly ok: boolean;
  readonly detail: string;
}

const f1 = (x: number): string => x.toFixed(1);
const f2 = (x: number): string => x.toFixed(2);
const f3 = (x: number): string => x.toFixed(3);

export { GRIP_RATIO } from './edge';

// Rule 8, groomed and bumps alike: the force peak inside the task's measured window.
const forcePeakRule = (task: TurnTask, peak: number): FeasibilityCheck => {
  const win = task.legacy.forcePeakWindow;
  const arc = `the window asks the arc share to peak at ${f3(arcPeakTOf(task))}, not applied`;
  if (win === null) return { rule: 8, ok: true, detail: `force peak τ ${f3(peak)}, ${arc}; ${task.legacy.forcePeakSource}` };
  return { rule: 8, ok: peak >= win[0] && peak <= win[1], detail: `force peak τ ${f3(peak)} in ${f2(win[0])}…${f2(win[1])} (${task.legacy.forcePeakSource}), ${arc}` };
};

const groomedFeasibility = (task: TurnTask, snow: SnowT): ReadonlyArray<FeasibilityCheck> => {
  const p = turnProfile(task, snow);
  const n = p.t.length;
  const carve = p.carveMargin ?? [];
  let lo = Number.POSITIVE_INFINITY;
  let at = Number.NaN;
  for (let i = 0; i < n; i++) {
    if ((p.arcShare[i] ?? 0) > 0.5 && (carve[i] ?? 0) < lo) [lo, at] = [carve[i] ?? 0, i / n];
  }
  const most = Math.max(...p.edge.map((e, i) => Math.abs(e - (p.lean[i] ?? 0)))) / DEG;
  const grip = p.gripDemand ?? Math.max(...p.lean.map((l) => Math.abs(Math.tan(l))));
  const c = p.closure;
  const e = p.energy;
  const top = p.topHalfSweep ?? Math.PI / 2;
  const stop = p.topBound === TopBound.Cap ? 'the 90° cap: straight across the hill' : p.topBound === TopBound.Edge ? 'a flag edge' : 'f(0) = 0 closes no wider';
  const bound = p.halfSweep >= top ? ` (at its ${f1(top / DEG)}° bound: ${stop})` : p.halfSweep <= LEAST_HALF_SWEEP ? ' (at its least: outside the skiable space)' : '';
  const gained = p.boundary === Boundary.SpeedsUp ? `speeds up ${f2(c.residual)} m/s per cycle at its roundest, ` : '';
  const means = `gain ${f3(e.gain)} − friction ${f3(e.friction)} − skid ${f3(e.skid)} − drag ${f3(e.drag)} g`;
  return [
    // Rule 1: at σ 0 the sidecut carves the skis' arc on an edge no lower than the lean while loaded.
    { rule: 1, ok: task.skidShare > 0 || lo >= 0, detail: task.skidShare > 0 ? `carving margin ε_c − λ ≥ ${f1(lo / DEG)}° at t ${f3(at)} while loaded, σ > 0: report only` : `identity m ≥ 0 over the arc interval: min m ${f1(lo / DEG)}° at t ${f3(at)}` },
    // Rule 2: the legs make no more margin than the angulation range.
    { rule: 2, ok: most <= ANGULATION_MAX_DEG + 1e-9, detail: `margin ≤ ${f1(most)}° ≤ A_max ${ANGULATION_MAX_DEG}°` },
    // Rule 3: a check, never a solve input.
    { rule: 3, ok: grip <= GRIP_RATIO, detail: `grip demand |f| / cos θ ≤ ${f2(grip)} against ${GRIP_RATIO} (inferred)` },
    // Rule 4: the closure.
    {
      rule: 4,
      ok: c.root && c.converged && Math.abs(c.residual) < 1e-6,
      detail: `β_h ${f1(p.halfSweep / DEG)}°${bound}, no skid added, ${means}, ${gained}${c.root ? '' : 'no root, '}${c.converged ? '' : 'not converged, '}v(1) − v(0) ${c.residual.toExponential(1)} m/s, ${c.passes} passes`,
    },
    // Rules 5 (bump period) and 7 (bump closure, rule 4's here) have no groomed meaning and are omitted.
    forcePeakRule(task, p.events.forcePeak),
  ];
};

/** motion-model §4.3: groomed rules 1–4 and 8 (5 and 7 omitted), bump rules 1–9, over the cell's whole cycle. */
export const feasibilityOf = (task: TurnTask, snow: SnowT = task.snow ?? Snow.HardGroomed): ReadonlyArray<FeasibilityCheck> => {
  if (task.bumpHeightM <= 0) return groomedFeasibility(task, snow);
  const p = turnProfile(task, snow);
  const band = marginBandDeg(task);
  const n = p.t.length;
  const idx = Array.from({ length: n }, (_, i) => i);
  const loaded = idx.filter((i) => (p.arcShare[i] ?? 0) > 0.5);
  const margin = (i: number): number => ((p.edge[i] ?? 0) - (p.lean[i] ?? 0)) / DEG;
  const lo = Math.min(...loaded.map(margin));
  const hi = Math.max(...loaded.map(margin));
  const edgePeak = Math.max(...p.edge) / DEG;
  const loadPeak = Math.max(...p.load);
  const out: FeasibilityCheck[] = [];

  // Rule 1: skidded skis slip inside their band.
  out.push({ rule: 1, ok: lo >= band.min - 1e-9 && hi <= band.max + 1e-9, detail: `loaded margin ${f1(lo)}…${f1(hi)}° in ${band.min}…${band.max}°` });

  // Rule 2: the legs make no more margin than the angulation range.
  const most = Math.max(...idx.map(margin));
  out.push({ rule: 2, ok: most <= ANGULATION_MAX_DEG + 1e-9, detail: `margin ≤ ${f1(most)}° ≤ A_max ${ANGULATION_MAX_DEG}°` });

  // Rule 4: load inside the task's band.
  const lb = task.legacy.loadBand;
  const mean = loaded.reduce((s, i) => s + (p.load[i] ?? 0), 0) / Math.max(1, loaded.length);
  out.push({
    rule: 4,
    ok: mean >= lb.meanMin && mean <= lb.meanMax && loadPeak >= lb.peakMin && loadPeak <= lb.peakMax,
    detail: `loaded mean ${f2(mean)}, peak ${f2(loadPeak)} BW (${lb.status})`,
  });

  // Rule 5: period and heading sweep agree with the task.
  const sweep = p.skisHalfSweep / DEG;
  const window = task.legacy.ceilings?.periodS ?? null;
  const perBump = window === null ? true : p.periodS >= window[0] && p.periodS <= window[1];
  out.push({ rule: 5, ok: perBump, detail: `T ${f2(p.periodS)} s = spacing / v; skis' half sweep ${f1(sweep)}° (the rest is pivot)` });

  // Rule 6: dynamic cells below their racing ceilings.
  if (task.legacy.ceilings !== null) {
    const vMax = task.legacy.ceilings.speedMps;
    // reid-2020 slalom edge 66–70° and the load band's ceiling.
    const ok = task.speedMps <= vMax && edgePeak < 66 && loadPeak <= lb.peakMax;
    out.push({ rule: 6, ok, detail: `v ${f1(task.speedMps)} ≤ ${vMax}, ε_peak ${f1(edgePeak)} < 66°, load ${f2(loadPeak)} ≤ ${lb.peakMax} BW` });
  }

  // Rule 7: the cycle's closure, reported.
  const e = p.energy;
  const c = p.closure;
  const means = `gain ${f3(e.gain)} − friction ${f3(e.friction)} − skid ${f3(e.skid)} − bump ${f3(e.bump)} − drag ${f3(e.drag)} g`;
  const closure = `${c.root ? '' : 'no root, '}${c.converged ? '' : 'not converged, '}v(1) − v(0) ${c.residual.toExponential(1)} m/s, ${c.passes} passes`;
  out.push({ rule: 7, ok: true, detail: `closure needs P's hit placement; γ peak ${f1(p.gammaE)}°, ${means}, ${closure}` });

  // Rule 8: the force peak inside the task's measured window; bon-2021 gives no timing, so the short swing takes the steered one.
  out.push(forcePeakRule(task, p.events.forcePeak));

  // Rule 9: the legs absorb the track within their reach, the snow only pushing (motion-model §4.8).
  {
    const m = mogulRideOf(task);
    const a = m.absorption;
    const fit = a.ridable ? `ridable, the leg in reach ${f3(REACH[0])}…${f3(REACH[1])} m along its lean` : `the snow holds the mass ${f3(a.short)} m under the fold`;
    const bend = `${m.settled ? 'load and bend settle' : 'load and bend do not settle (the ski snaps through)'} in ${m.iterations} passes, last ${m.change.toExponential(1)} m`;
    const lean = `${m.leanSettled ? 'reach and lean settle' : 'reach and lean do not settle'} in ${m.leanPasses} passes, last ${m.leanChange.toExponential(1)} rad`;
    const ride = `boot relief ${f3(Math.max(...m.boot) - Math.min(...m.boot))} m, bridged ${f2(m.bridged / m.boot.length)}`;
    out.push({ rule: 9, ok: a.ridable && m.settled && m.leanSettled, detail: `${fit}; ${bend}; ${lean}; ${ride}; least support ${f2(m.leastSupport)} g, peak load ${f2(m.peakLoad)} BW (${lb.status}; report only)` });
  }
  return out;
};

export { bridgeOf };

/** The legs' absorption over the boot's track under the bent, edged ski of a bump task (rule 9), the leg leaning: the turn's ride. */
export const mogulRideOf = (task: TurnTask): MogulMass => mogulMassFor(task);

/** Largest course relief, metres rounded down to the cm, a bump task rides under rule 9 at its own spacing, pace and pitch. */
export const ridableReliefOf = (task: TurnTask): number => {
  const from = Math.round(task.bumpHeightM * 100);
  const ridable = (cm: number): boolean => {
    const m = mogulRideOf({ ...task, bumpHeightM: cm / 100 });
    return m.absorption.ridable && m.settled && m.leanSettled;
  };
  // The track scales with the relief and every bound tightens with it, so ridability is monotone: gallop from the
  // task's own relief to a bracket, then halve it.
  let [lo, hi] = [from, from];
  let step = 1;
  if (ridable(from)) {
    while (lo + step <= 400 && ridable(lo + step)) [lo, step] = [lo + step, 2 * step];
    hi = lo + step;
  } else {
    while (hi - step > 0 && !ridable(hi - step)) [hi, step] = [hi - step, 2 * step];
    lo = Math.max(0, hi - step);
  }
  while (hi - lo > 1) {
    const mid = Math.floor((lo + hi) / 2);
    if (ridable(mid)) lo = mid;
    else hi = mid;
  }
  return lo / 100;
};

/** Groomed: the solved half sweep β_h, degrees; null at either bound. Bumps: none. */
export const closingSweepDeg = (task: TurnTask, snow: SnowT): number | null => {
  if (task.bumpHeightM > 0) return null;
  const p = turnProfile(task, snow);
  const h = p.halfSweep;
  return h >= (p.topHalfSweep ?? Math.PI / 2) || h <= LEAST_HALF_SWEEP ? null : h / DEG;
};
