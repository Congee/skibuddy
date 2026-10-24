// Measured points keyed by the conditions they were measured at (motion-model §3, §8). Checks, never inputs. No consumer yet.

/** Status words of scripts/prior/lit-curves.json `_conventions.status`; Inferred only for values the repo marks inferred. */
export const CheckStatus = {
  Measured: 'measured',
  Digitised: 'digitised',
  EyeRead: 'eye-read',
  RangeOnly: 'range-only',
} as const;
export type CheckStatus = (typeof CheckStatus)[keyof typeof CheckStatus];

export const Quantity = {
  EdgeAngle: 'edge angle',
  Inclination: 'inclination',
  SkidAngle: 'skid angle',
  RollAngle: 'ski roll angle',
  SkiRadius: 'ski path radius',
  GroundReactionForce: 'ground reaction force',
  CentripetalForce: 'centripetal force',
  ForcePeakTiming: 'force-peak timing',
  EventTiming: 'event timing',
  PhaseShare: 'phase share of the turn',
  ForeAftPosition: 'fore-aft position',
  PelvisYaw: 'pelvis yaw',
  PelvisYawVsSkis: 'pelvis yaw against the skis',
  PelvisTilt: 'pelvis tilt',
  PelvisList: 'pelvis list',
  TrunkAngle: 'trunk angle',
  JointAngle: 'joint angle',
  JointMoment: 'joint moment',
  HipAngulation: 'hip angulation',
  KneeAngulation: 'knee angulation',
  CentreOfMassHeight: 'centre of mass height',
  LegLength: 'leg length',
  TurnPeriod: 'turn period',
  BumpHeight: 'bump height',
  MuscleActivation: 'muscle activation',
} as const;
export type Quantity = (typeof Quantity)[keyof typeof Quantity];

export const LitCurve = {
  GsCarving: 'gs_carving',
  Slalom: 'slalom',
  RecreationalParallelShort: 'recreational_parallel_short',
  MogulsZipper: 'moguls_zipper',
} as const;
export type LitCurve = (typeof LitCurve)[keyof typeof LitCurve];

export const DataKind = { Curve: 'curve', Value: 'value' } as const;
export type DataKind = (typeof DataKind)[keyof typeof DataKind];

/** A lit-curves.json series: `curve` -> `channel` -> optional `key` one level down. */
export interface CurveData {
  readonly kind: typeof DataKind.Curve;
  readonly curve: LitCurve;
  readonly channel: string;
  readonly key?: string;
}

/** The numbers a source gives. `t` is turn time 0..1 (switch to switch), `tS` seconds. */
export interface ValueData {
  readonly kind: typeof DataKind.Value;
  readonly unit: string;
  readonly value?: number;
  readonly range?: readonly [number, number];
  readonly peak?: number;
  readonly t?: number | readonly [number, number];
  readonly tS?: number;
  readonly values?: Readonly<Record<string, number>>;
}

export type PointData = CurveData | ValueData;

/** A number or the range a source gives. */
export type Condition = number | readonly [number, number];

export type NumericCondition =
  | 'speedMps'
  | 'radiusM'
  | 'slopeDeg'
  | 'skidShare'
  | 'bumpHeightM'
  | 'bumpSpacingM'
  | 'skiLengthM'
  | 'sidecutRadiusM'
  | 'gateDistanceM'
  | 'corridorM'
  | 'bodyMassKg';

/** As the source reports; an absent field is one the repo does not record. */
export interface Conditions {
  readonly speedMps?: Condition;
  readonly radiusM?: Condition;
  readonly slopeDeg?: Condition;
  readonly skidShare?: Condition;
  readonly bumpHeightM?: Condition;
  readonly bumpSpacingM?: Condition;
  readonly skiLengthM?: Condition;
  readonly sidecutRadiusM?: Condition;
  readonly gateDistanceM?: Condition;
  readonly corridorM?: Condition;
  readonly bodyMassKg?: Condition;
  readonly snow?: string;
  readonly level?: string;
  readonly n?: number;
  readonly course?: string;
  /** Numeric fields the source gives as "about". */
  readonly about?: ReadonlyArray<NumericCondition>;
  readonly note?: string;
}

export interface Uncertainty {
  readonly sd?: number;
  readonly error?: string;
  readonly note?: string;
}

export interface MeasuredPoint {
  readonly id: string;
  /** A content/sources.yaml id. */
  readonly source: string;
  readonly quantity: Quantity;
  readonly detail?: string;
  readonly data: PointData;
  readonly conditions: Conditions;
  readonly uncertainty?: Uncertainty;
  readonly status: CheckStatus;
  readonly where: string;
}

const S = CheckStatus;
const Q = Quantity;
const C = LitCurve;

const curve = (c: LitCurve, channel: string, key?: string): CurveData =>
  key === undefined ? { kind: DataKind.Curve, curve: c, channel } : { kind: DataKind.Curve, curve: c, channel, key };
const num = (unit: string, rest: Omit<ValueData, 'kind' | 'unit'>): ValueData => ({ kind: DataKind.Value, unit, ...rest });

// Conditions per source, as the repo records them.
const KROLL_2015_GS: Conditions = { course: 'GS', level: 'FIS', n: 1 };
const KROLL_2015_SL: Conditions = { course: 'SL', level: 'FIS', n: 1 };
const KROLL_2015_WHERE = 'ISBS 2015, Fig 1A + Table 1 (lit-curves)';
const REID_2010_10: Conditions = { course: 'SL 10 m x 2 m, 3D video', level: 'Norwegian EC', n: 6 };
const REID_2010_13: Conditions = { course: 'SL 13 m x 3 m, 3D video', level: 'Norwegian EC', n: 6 };
const REID_2020_10: Conditions = { slopeDeg: 19, sidecutRadiusM: 14, gateDistanceM: 10, snow: 'hard compact', level: 'Norwegian national team men 17-20 y', n: 6, note: 'skis fitted as a 14 m sidecut model; 12 turns per course' };
const REID_2020_13: Conditions = { ...REID_2020_10, gateDistanceM: 13 };
const HEINRICH_2023: Conditions = {
  speedMps: 12,
  radiusM: 10.7,
  slopeDeg: 12.3,
  sidecutRadiusM: 18,
  level: 'FIS-level male',
  n: 1,
  course: 'carved turns, gates 8 m x 16 m, window 1.4 s',
  about: ['speedMps', 'radiusM'],
  note: 'radiusM is the minimum radius',
};
const HEINRICH_2022: Conditions = {
  speedMps: [13.5, 14.5],
  radiusM: 16,
  level: 'professional ski instructor',
  n: 1,
  course: 'GS skis, right turn, steering window (radius < 32 m) 0-1.32 s',
  note: 'radiusM is the minimum radius in the window; pitch not recorded',
};
const SPORRI_2016_SIDECUT: Conditions = { slopeDeg: 26, level: 'European Cup', n: 6, course: 'GS gates 27 m / 8 m offset', note: 'three GS skis of 30, 35 and 40 m sidecut radius (PMC4717421 abstract), pooled; speed not recorded' };
const SPORRI_2016_SIDECUT_WHERE = 'BJSM 50:14-19 Fig 4 (lit-curves cites it as "sporri-2016")';
const FALDA: Conditions = { course: 'GS', level: 'regional-level racers', n: 11, note: 'pressure insoles; slope steepness varied, values not recorded' };
const NAKAZATO_BASE: Conditions = { snow: 'groomed hard compact, -1.1 ± 2.2 °C', n: 10, note: 'left-leg force plate, 5 kg backpack, 10 double turns per cell, speed not reported' };
const BON: Conditions = { slopeDeg: 20, bodyMassKg: 78.6, level: 'male instructors', n: 9, note: '180 turns; speeds and turn durations not given' };
const THORWARTL: Conditions = { skiLengthM: 1.82, sidecutRadiusM: 19.6, snow: 'compact', level: 'A-level instructor', n: 1, note: 'Atomic Redster G7; 48 carved + 48 steered turns; no speed' };

const nakazato = (level: 'expert' | 'intermediate', carved: boolean, steep: boolean, outsideMean: number, outsidePeak: number, insideMean: number, edgeChangeMin: number): MeasuredPoint => ({
  id: `nakazato-2011-${level}-${carved ? 'carved' : 'steered'}-${steep ? 'steep' : 'flat'}`,
  source: 'nakazato-2011',
  quantity: Q.GroundReactionForce,
  detail: 'left-leg vertical force, outside mean / outside peak / inside mean, and the edge-change minimum (40-60 % of the double turn)',
  data: num('BW', { values: { outsideMean, outsidePeak, insideMean, edgeChangeMin } }),
  conditions: {
    ...NAKAZATO_BASE,
    slopeDeg: steep ? 23 : 15,
    skiLengthM: level === 'expert' ? 1.84 : 1.69,
    sidecutRadiusM: level === 'expert' ? 23 : 15,
    level: level === 'expert' ? 'experts (Atomic FIS GS ski)' : 'intermediates (Atomic Drive Fibre Sport ski)',
    course: carved ? 'short-radius carving' : 'long-radius skidded parallel turn',
  },
  status: S.Measured,
  where: 'Tables 1-2 (force plate); sources.yaml notes',
});

const bon = (kind: 'short' | 'parallel', outsideLeft: number, outsideRight: number, insideLeft: number, insideRight: number): MeasuredPoint => ({
  id: `bon-2021-${kind}-grf`,
  source: 'bon-2021',
  quantity: Q.GroundReactionForce,
  detail: 'max force per turn at the lowest CoM before the outside ski releases, left / right turn',
  data: num('BW', { values: { outsideLeft, outsideRight, insideLeft, insideRight } }),
  conditions: { ...BON, corridorM: kind === 'short' ? 3 : 15, course: kind === 'short' ? 'short turn' : 'parallel turn' },
  status: S.Measured,
  where: 'full text, force results; sources.yaml notes',
});

const thorwartl = (id: string, detail: string, rollAngleMax: number, radialForceMaxN: number, carved: boolean): MeasuredPoint => ({
  id: `thorwartl-2023-${id}`,
  source: 'thorwartl-2023',
  quantity: Q.RollAngle,
  detail: `${detail}; roll angle is the gyro integral, not the edge angle`,
  data: num('deg and N', { values: { rollAngleMax, radialForceMaxN } }),
  conditions: { ...THORWARTL, course: carved ? 'carved turns' : 'steered turns' },
  status: S.Measured,
  where: 'full text; sources.yaml notes',
});

const heinrich2023 = (id: string, quantity: Quantity, channel: string, key?: string): MeasuredPoint => ({
  id: `heinrich-2023-${id}`,
  source: 'heinrich-2023',
  quantity,
  data: curve(C.GsCarving, channel, key),
  conditions: HEINRICH_2023,
  uncertainty: { error: '±1 deg (digitising)' },
  status: S.Digitised,
  where: 'Sci Rep 13:9026 Fig 2, measured trace, 3D video 100 Hz; t = time / 1.4 s inferred switch to switch',
});

const heinrich2022 = (id: string, detail: string, channel: string, key: string): MeasuredPoint => ({
  id: `heinrich-2022-${id}`,
  source: 'heinrich-2022',
  quantity: Q.JointAngle,
  detail,
  data: curve(C.GsCarving, channel, key),
  conditions: HEINRICH_2022,
  status: S.RangeOnly,
  where: 'Table 1 (ranges over the steering phase)',
});

export const CHECKS: ReadonlyArray<MeasuredPoint> = [
  // kroll-2015: one FIS racer, GS and SL; speed, radius and pitch not recorded
  { id: 'kroll-2015-gs-period', source: 'kroll-2015', quantity: Q.TurnPeriod, data: num('s', { value: 1.39 }), conditions: KROLL_2015_GS, uncertainty: { sd: 0.11 }, status: S.Measured, where: 'lit-curves gs_carving.period_s; table not recorded' },
  { id: 'kroll-2015-sl-period', source: 'kroll-2015', quantity: Q.TurnPeriod, data: num('s', { value: 0.83 }), conditions: KROLL_2015_SL, uncertainty: { sd: 0.07 }, status: S.Measured, where: 'lit-curves slalom.period_s; table not recorded' },
  { id: 'kroll-2015-gs-grf-peak', source: 'kroll-2015', quantity: Q.GroundReactionForce, detail: 'peak', data: num('BW', { value: 2.85, t: 0.68 }), conditions: KROLL_2015_GS, status: S.EyeRead, where: 'Fig 1B' },
  { id: 'kroll-2015-gs-grf-plateau', source: 'kroll-2015', quantity: Q.GroundReactionForce, detail: 'plateau before the peak', data: num('BW', { value: 2.3, t: [0.2, 0.36] }), conditions: KROLL_2015_GS, status: S.EyeRead, where: 'Fig 1B' },
  { id: 'kroll-2015-gs-force-peak-time', source: 'kroll-2015', quantity: Q.ForcePeakTiming, data: num('turn fraction', { value: 0.68 }), conditions: KROLL_2015_GS, status: S.EyeRead, where: 'Fig 1B' },
  { id: 'kroll-2015-sl-grf-peak', source: 'kroll-2015', quantity: Q.GroundReactionForce, detail: 'peak', data: num('BW', { value: 3.0, t: 0.4 }), conditions: KROLL_2015_SL, status: S.EyeRead, where: 'Fig 1B (lit-curves slalom.events.grf_peak_kroll)' },
  { id: 'kroll-2015-sl-force-peak-time', source: 'kroll-2015', quantity: Q.ForcePeakTiming, data: num('turn fraction', { value: 0.4 }), conditions: KROLL_2015_SL, status: S.EyeRead, where: 'Fig 1B (lit-curves slalom.events.grf_peak_kroll)' },
  { id: 'kroll-2015-gs-outside-knee', source: 'kroll-2015', quantity: Q.JointAngle, detail: 'outside knee flexion', data: curve(C.GsCarving, 'outside', 'knee_flexion_kroll'), conditions: KROLL_2015_GS, uncertainty: { note: 'Table 1: flexion 42-85, angle 138±8 / 95±8, mean 122±6' }, status: S.EyeRead, where: KROLL_2015_WHERE },
  { id: 'kroll-2015-gs-inside-knee', source: 'kroll-2015', quantity: Q.JointAngle, detail: 'inside knee flexion', data: curve(C.GsCarving, 'inside', 'knee_flexion_kroll'), conditions: KROLL_2015_GS, status: S.EyeRead, where: KROLL_2015_WHERE },
  { id: 'kroll-2015-sl-outside-knee', source: 'kroll-2015', quantity: Q.JointAngle, detail: 'outside knee flexion', data: curve(C.Slalom, 'outside', 'knee_flexion'), conditions: KROLL_2015_SL, uncertainty: { note: 'Table 1: flexion 48-99, angle 132±6 / 81±7, mean 112±5' }, status: S.EyeRead, where: KROLL_2015_WHERE },
  { id: 'kroll-2015-sl-inside-knee', source: 'kroll-2015', quantity: Q.JointAngle, detail: 'inside knee flexion', data: curve(C.Slalom, 'inside', 'knee_flexion'), conditions: KROLL_2015_SL, uncertainty: { note: 'Table 1: flexion 62-100, angle 118±9 / 80±7, mean 101±7' }, status: S.EyeRead, where: KROLL_2015_WHERE },
  { id: 'kroll-2015-inside-knee-max-flexion-time', source: 'kroll-2015', quantity: Q.EventTiming, detail: 'inside knee maximum flexion', data: num('turn fraction', { range: [0.45, 0.55] }), conditions: KROLL_2015_GS, status: S.EyeRead, where: 'lit-curves gs_carving.events.inside_knee_max_flex' },

  // kroll-2011 and kroll-2010: recreational skiers; speed, radius, pitch not recorded
  { id: 'kroll-2011-inside-knee', source: 'kroll-2011', quantity: Q.JointAngle, detail: 'inside knee flexion', data: num('deg', { range: [81, 88] }), conditions: { level: 'recreational skiers' }, status: S.Measured, where: 'full text (biomechanics.md inside-leg claim 3); table not recorded' },
  { id: 'kroll-2011-outside-knee', source: 'kroll-2011', quantity: Q.JointAngle, detail: 'outside knee flexion', data: num('deg', { range: [65, 70] }), conditions: { level: 'recreational skiers' }, status: S.Measured, where: 'full text (biomechanics.md inside-leg claim 3); table not recorded' },
  { id: 'kroll-2010-inside-vl-emg', source: 'kroll-2010', quantity: Q.MuscleActivation, detail: 'inside vastus lateralis against outside, inside rectus femoris equal', data: num('% against outside', { value: -54 }), conditions: { level: 'recreational skiers' }, status: S.Measured, where: 'abstract' },

  // reid-2010: 6 Norwegian EC SL skiers; pitch and snow not recorded for the thesis itself
  { id: 'reid-2010-10m-period', source: 'reid-2010', quantity: Q.TurnPeriod, data: num('s', { value: 0.83 }), conditions: REID_2010_10, uncertainty: { sd: 0.03 }, status: S.Measured, where: 'lit-curves slalom.period_s; page not recorded' },
  { id: 'reid-2010-13m-period', source: 'reid-2010', quantity: Q.TurnPeriod, data: num('s', { value: 0.94 }), conditions: REID_2010_13, uncertainty: { sd: 0.03 }, status: S.Measured, where: 'lit-curves slalom.period_s; page not recorded' },
  { id: 'reid-2010-10m-grf-peak', source: 'reid-2010', quantity: Q.GroundReactionForce, detail: 'maximum', data: num('BW', { value: 3.35, t: 0.51 }), conditions: REID_2010_10, status: S.Measured, where: 'p245' },
  { id: 'reid-2010-13m-grf-peak', source: 'reid-2010', quantity: Q.GroundReactionForce, detail: 'maximum', data: num('BW', { value: 3.53, t: 0.67 }), conditions: REID_2010_13, status: S.Measured, where: 'p245' },
  { id: 'reid-2010-10m-force-peak-time', source: 'reid-2010', quantity: Q.ForcePeakTiming, data: num('turn fraction', { value: 0.51 }), conditions: REID_2010_10, status: S.Measured, where: 'p245' },
  { id: 'reid-2010-13m-force-peak-time', source: 'reid-2010', quantity: Q.ForcePeakTiming, data: num('turn fraction', { value: 0.67 }), conditions: REID_2010_13, status: S.Measured, where: 'p245' },
  { id: 'reid-2010-10m-grf-min', source: 'reid-2010', quantity: Q.GroundReactionForce, detail: 'minimum', data: num('BW', { value: 0.17, t: 0.008 }), conditions: REID_2010_10, status: S.Measured, where: 'p245' },
  { id: 'reid-2010-13m-grf-min', source: 'reid-2010', quantity: Q.GroundReactionForce, detail: 'minimum', data: num('BW', { value: 0.09, t: 0.065 }), conditions: REID_2010_13, status: S.Measured, where: 'p245' },
  { id: 'reid-2010-10m-skid-peak', source: 'reid-2010', quantity: Q.SkidAngle, detail: 'peak; 3.1 ± 2.4 at the switch, under 4 after the gate', data: num('deg', { value: 15.1, t: [0.2, 0.3] }), conditions: REID_2010_10, uncertainty: { sd: 5.3 }, status: S.RangeOnly, where: 'lit-curves slalom.skid_angle; page not recorded' },
  { id: 'reid-2010-13m-skid-peak', source: 'reid-2010', quantity: Q.SkidAngle, detail: 'peak', data: num('deg', { value: 12.1, t: [0.2, 0.3] }), conditions: REID_2010_13, uncertainty: { sd: 4.9 }, status: S.RangeOnly, where: 'lit-curves slalom.events.skid_peak; page not recorded' },
  { id: 'reid-2010-10m-inclination-max', source: 'reid-2010', quantity: Q.Inclination, detail: 'maximum just before the gate (gate at t 0.54)', data: num('deg', { value: 49.9 }), conditions: REID_2010_10, uncertainty: { sd: 1.0 }, status: S.RangeOnly, where: 'pp228-229' },
  { id: 'reid-2010-13m-inclination-max', source: 'reid-2010', quantity: Q.Inclination, detail: 'maximum just before the gate (gate at t 0.60-0.63)', data: num('deg', { value: 56.2 }), conditions: REID_2010_13, uncertainty: { sd: 1.5 }, status: S.RangeOnly, where: 'pp228-229' },
  { id: 'reid-2010-10m-hip-angulation-max', source: 'reid-2010', quantity: Q.HipAngulation, detail: '5-10 by t 0.15-0.2', data: num('deg', { value: 17.1, t: 0.89 }), conditions: REID_2010_10, uncertainty: { sd: 1.9 }, status: S.RangeOnly, where: 'pp229-230' },
  { id: 'reid-2010-13m-hip-angulation-max', source: 'reid-2010', quantity: Q.HipAngulation, data: num('deg', { value: 21.6, t: 0.91 }), conditions: REID_2010_13, uncertainty: { sd: 5.6 }, status: S.RangeOnly, where: 'pp229-230' },
  { id: 'reid-2010-10m-knee-angulation-max', source: 'reid-2010', quantity: Q.KneeAngulation, detail: '4.0 ± 3.3 at the switch', data: num('deg', { value: 7.5, t: 0.43 }), conditions: REID_2010_10, uncertainty: { sd: 1.9 }, status: S.RangeOnly, where: 'pp229-232' },
  { id: 'reid-2010-13m-knee-angulation-max', source: 'reid-2010', quantity: Q.KneeAngulation, detail: '3.1 at the switch', data: num('deg', { value: 6.7, t: 0.63 }), conditions: REID_2010_13, uncertainty: { sd: 0.8 }, status: S.RangeOnly, where: 'pp229-232' },
  { id: 'reid-2010-10m-fore-aft', source: 'reid-2010', quantity: Q.ForeAftPosition, detail: 'CoM against the outside ankle: -11.4 ± 4.4 at t 0, +16.4 ± 4.1 before the gate (t 0.3 inferred), -7.8 ± 4.0 at t 1', data: curve(C.Slalom, 'fore_aft_cm'), conditions: REID_2010_10, status: S.RangeOnly, where: 'p238' },
  { id: 'reid-2010-10m-com-height-max', source: 'reid-2010', quantity: Q.CentreOfMassHeight, detail: 'snow-normal, maximum', data: num('cm', { value: 70.9, t: 0.016 }), conditions: REID_2010_10, uncertainty: { sd: 3.0 }, status: S.Measured, where: 'Fig 6.21 (curve eye-read, extrema measured)' },
  { id: 'reid-2010-10m-com-height-min', source: 'reid-2010', quantity: Q.CentreOfMassHeight, detail: 'snow-normal, minimum', data: num('cm', { value: 42.5, t: 0.538 }), conditions: REID_2010_10, uncertainty: { sd: 1.9 }, status: S.Measured, where: 'Fig 6.21 (curve eye-read, extrema measured)' },
  { id: 'reid-2010-13m-com-height-max', source: 'reid-2010', quantity: Q.CentreOfMassHeight, detail: 'snow-normal, maximum', data: num('cm', { value: 70.2, t: 0.081 }), conditions: REID_2010_13, uncertainty: { sd: 3.9 }, status: S.Measured, where: 'Fig 6.21 (curve eye-read, extrema measured)' },
  { id: 'reid-2010-13m-com-height-min', source: 'reid-2010', quantity: Q.CentreOfMassHeight, detail: 'snow-normal, minimum', data: num('cm', { value: 38.7, t: 0.627 }), conditions: REID_2010_13, uncertainty: { sd: 1.9 }, status: S.Measured, where: 'Fig 6.21 (curve eye-read, extrema measured)' },
  { id: 'reid-2010-10m-leg-length-range', source: 'reid-2010', quantity: Q.LegLength, detail: 'CoM to outside ankle, range of motion', data: num('cm', { value: 20.7 }), conditions: REID_2010_10, uncertainty: { sd: 3.2 }, status: S.Measured, where: 'Fig 6.23 (curve eye-read, ROM measured)' },
  { id: 'reid-2010-13m-leg-length-range', source: 'reid-2010', quantity: Q.LegLength, detail: 'CoM to outside ankle, range of motion', data: num('cm', { value: 28.7 }), conditions: REID_2010_13, uncertainty: { sd: 4.3 }, status: S.Measured, where: 'Fig 6.23 (curve eye-read, ROM measured)' },

  // reid-2020: 19 degree slope, hard compact snow, 14 m sidecut model skis; kinematics only, no speed
  { id: 'reid-2020-10m-edge-curve', source: 'reid-2020', quantity: Q.EdgeAngle, detail: 'outside ski; x = distance to the gate mapped linearly to t, inferred', data: curve(C.Slalom, 'edge_angle', '10m'), conditions: REID_2020_10, uncertainty: { error: '±1.5 deg (digitising)' }, status: S.Digitised, where: 'Front Sports Act Living 2:25 Fig 4B, sample turn' },
  { id: 'reid-2020-13m-edge-curve', source: 'reid-2020', quantity: Q.EdgeAngle, detail: 'outside ski; x = distance to the gate mapped linearly to t, inferred', data: curve(C.Slalom, 'edge_angle', '13m'), conditions: REID_2020_13, uncertainty: { error: '±1.5 deg (digitising)' }, status: S.Digitised, where: 'Fig 4B, sample turn' },
  { id: 'reid-2020-10m-edge-max', source: 'reid-2020', quantity: Q.EdgeAngle, detail: 'maximum just after the gate', data: num('deg', { value: 65.7 }), conditions: REID_2020_10, uncertainty: { sd: 1.7 }, status: S.Measured, where: 'text, results; Fig 4' },
  { id: 'reid-2020-13m-edge-max', source: 'reid-2020', quantity: Q.EdgeAngle, detail: 'maximum at the gate', data: num('deg', { value: 70.2 }), conditions: REID_2020_13, uncertainty: { sd: 1.3 }, status: S.Measured, where: 'text, results; Fig 4' },
  { id: 'reid-2020-10m-edge-switch', source: 'reid-2020', quantity: Q.EdgeAngle, detail: 'at the switch', data: num('deg', { value: 5.1, t: 0 }), conditions: REID_2020_10, status: S.Measured, where: 'text, results' },
  { id: 'reid-2020-13m-edge-switch', source: 'reid-2020', quantity: Q.EdgeAngle, detail: 'at the switch', data: num('deg', { value: 4.5, t: 0 }), conditions: REID_2020_13, status: S.Measured, where: 'text, results' },
  { id: 'reid-2020-10m-attack-max', source: 'reid-2020', quantity: Q.SkidAngle, detail: 'attack angle maximum, early; carving by the gate', data: num('deg', { value: 15.1 }), conditions: REID_2020_10, uncertainty: { sd: 5.3 }, status: S.Measured, where: 'text, results' },
  { id: 'reid-2020-13m-attack-max', source: 'reid-2020', quantity: Q.SkidAngle, detail: 'attack angle maximum, early', data: num('deg', { value: 12.1 }), conditions: REID_2020_13, uncertainty: { sd: 4.9 }, status: S.Measured, where: 'text, results' },
  { id: 'reid-2020-10m-ski-radius-min', source: 'reid-2020', quantity: Q.SkiRadius, detail: 'minimum outside-ski R_ski; k = R_ski / (14 cos ε_max) = 0.69', data: num('m', { value: 3.96 }), conditions: REID_2020_10, uncertainty: { sd: 0.23 }, status: S.Measured, where: 'text, results; Fig 6' },
  { id: 'reid-2020-13m-ski-radius-min', source: 'reid-2020', quantity: Q.SkiRadius, detail: 'minimum outside-ski R_ski; k = 1.04', data: num('m', { value: 4.94 }), conditions: REID_2020_13, uncertainty: { sd: 0.59 }, status: S.Measured, where: 'text, results; Fig 6' },

  // nakazato-2011: speed not reported
  nakazato('expert', true, false, 1.26, 1.91, 0.56, 0.34),
  nakazato('expert', true, true, 1.15, 2.05, 0.62, 0.15),
  nakazato('expert', false, false, 1.27, 1.76, 0.48, 0.37),
  nakazato('expert', false, true, 1.18, 1.86, 0.49, 0.26),
  nakazato('intermediate', true, false, 1.18, 1.68, 0.51, 0.27),
  nakazato('intermediate', true, true, 1.01, 1.61, 0.53, 0.09),
  nakazato('intermediate', false, false, 1.15, 1.59, 0.45, 0.31),
  nakazato('intermediate', false, true, 1.04, 1.6, 0.45, 0.15),
  { id: 'nakazato-2011-force-peak-time', source: 'nakazato-2011', quantity: Q.ForcePeakTiming, detail: '20-30 % of the double turn; carved and steered alike, both levels', data: num('fraction of the outside phase', { range: [0.4, 0.6] }), conditions: { ...NAKAZATO_BASE, slopeDeg: [15, 23], note: 'both pitches, experts and intermediates; speed not reported' }, status: S.EyeRead, where: 'Fig 6 mean force-plate curves' },
  { id: 'nakazato-2011-force-peak-size', source: 'nakazato-2011', quantity: Q.GroundReactionForce, detail: 'peak of the mean curve, minimum at 50 %', data: num('BW', { range: [1.35, 1.7] }), conditions: { ...NAKAZATO_BASE, slopeDeg: [15, 23], note: 'both pitches, experts and intermediates; speed not reported' }, status: S.EyeRead, where: 'Fig 6 mean force-plate curves' },

  // bon-2021: speeds and timing not given
  bon('short', 1.45, 1.37, 0.92, 0.99),
  bon('parallel', 1.06, 1.1, 0.33, 0.28),

  // heinrich-2022: v 13.5-14.5 m/s, outside the swept 3-10 m/s
  heinrich2022('outside-hip-rotation', 'outside hip rotation, internal +', 'outside', 'hip_rotation_heinrich2022'),
  heinrich2022('outside-hip-abduction', 'outside hip abduction', 'outside', 'hip_abduction_heinrich2022'),
  heinrich2022('outside-knee-flexion', 'outside knee flexion', 'outside', 'knee_flexion_heinrich2022'),
  heinrich2022('outside-ankle-dorsiflexion', 'outside ankle dorsiflexion', 'outside', 'ankle_dorsiflexion_heinrich2022'),
  heinrich2022('inside-hip-rotation', 'inside hip rotation, internal +', 'inside', 'hip_rotation_heinrich2022'),
  heinrich2022('inside-knee-flexion', 'inside knee flexion', 'inside', 'knee_flexion_heinrich2022'),
  heinrich2022('inside-ankle-dorsiflexion', 'inside ankle dorsiflexion', 'inside', 'ankle_dorsiflexion_heinrich2022'),
  { id: 'heinrich-2022-pelvis-yaw', source: 'heinrich-2022', quantity: Q.PelvisYaw, detail: 'sign as printed', data: curve(C.GsCarving, 'pelvis_yaw_heinrich2022'), conditions: HEINRICH_2022, status: S.RangeOnly, where: 'Table 1' },
  { id: 'heinrich-2022-outside-hip-flexion-at-peak', source: 'heinrich-2022', quantity: Q.JointAngle, detail: 'outside hip flexion at the force peak (t about 0.87 s); range 50.3-80.6; inside hip about 117', data: num('deg', { value: 79, range: [50.3, 80.6], tS: 0.87 }), conditions: HEINRICH_2022, uncertainty: { error: '±2 deg (figure read by eye)' }, status: S.EyeRead, where: 'sources.yaml notes (Table 2 and figures)' },
  { id: 'heinrich-2022-outside-force-plateau', source: 'heinrich-2022', quantity: Q.GroundReactionForce, detail: 'outside force flat top at t 0.7-0.9 s; the 0.17 s bump (0.86 BW) is an unload-load motion, not the peak', data: num('BW', { value: 1.0, tS: 0.8 }), conditions: HEINRICH_2022, status: S.EyeRead, where: 'Fig 4B' },
  { id: 'heinrich-2022-outside-hip-extension-moment', source: 'heinrich-2022', quantity: Q.JointMoment, detail: 'outside hip extension, internal moment, peak', data: num('Nm/kg', { peak: 1.27, tS: 0.87 }), conditions: HEINRICH_2022, uncertainty: { error: '±0.15 Nm/kg (figure read by eye)' }, status: S.EyeRead, where: 'Table 2, figures; sources.yaml notes' },
  { id: 'heinrich-2022-outside-knee-extension-moment', source: 'heinrich-2022', quantity: Q.JointMoment, detail: 'outside knee extension, internal moment, peak (~0.65 at the force peak)', data: num('Nm/kg', { peak: 1.02, tS: 0.17 }), conditions: HEINRICH_2022, uncertainty: { error: '±0.15 Nm/kg (figure read by eye)' }, status: S.EyeRead, where: 'Table 2, figures; sources.yaml notes' },
  { id: 'heinrich-2022-outside-ankle-plantarflexion-moment', source: 'heinrich-2022', quantity: Q.JointMoment, detail: 'outside ankle plantarflexion, internal moment, peak (~0.5 at the force peak)', data: num('Nm/kg', { peak: 0.85, tS: 0.45 }), conditions: HEINRICH_2022, uncertainty: { error: '±0.15 Nm/kg (figure read by eye)' }, status: S.EyeRead, where: 'Table 2, figures; sources.yaml notes' },
  { id: 'heinrich-2022-lumbar-extension-moment', source: 'heinrich-2022', quantity: Q.JointMoment, detail: 'lumbar extension, range 0.16-1.88, peak at the force peak; whole-spine demand', data: num('Nm/kg', { peak: 1.88, tS: 0.87 }), conditions: HEINRICH_2022, uncertainty: { error: '±0.15 Nm/kg (figure read by eye)' }, status: S.EyeRead, where: 'Table 2, figures; sources.yaml notes' },

  // heinrich-2023: ~12 m/s, outside the swept 3-10 m/s
  heinrich2023('outside-hip-flexion', Q.JointAngle, 'outside', 'hip_flexion'),
  heinrich2023('outside-hip-abduction', Q.JointAngle, 'outside', 'hip_abduction'),
  heinrich2023('outside-hip-rotation', Q.JointAngle, 'outside', 'hip_rotation'),
  heinrich2023('outside-knee-flexion', Q.JointAngle, 'outside', 'knee_flexion'),
  heinrich2023('outside-ankle-dorsiflexion', Q.JointAngle, 'outside', 'ankle_dorsiflexion'),
  heinrich2023('inside-hip-flexion', Q.JointAngle, 'inside', 'hip_flexion'),
  heinrich2023('inside-hip-abduction', Q.JointAngle, 'inside', 'hip_abduction'),
  heinrich2023('inside-hip-rotation', Q.JointAngle, 'inside', 'hip_rotation'),
  heinrich2023('inside-knee-flexion', Q.JointAngle, 'inside', 'knee_flexion'),
  heinrich2023('inside-ankle-dorsiflexion', Q.JointAngle, 'inside', 'ankle_dorsiflexion'),
  heinrich2023('pelvis-yaw', Q.PelvisYaw, 'pelvis_yaw'),
  heinrich2023('pelvis-tilt', Q.PelvisTilt, 'pelvis_tilt'),
  heinrich2023('pelvis-list', Q.PelvisList, 'pelvis_list'),
  heinrich2023('lumbar-flexion-vs-pelvis', Q.JointAngle, 'trunk_pitch', 'lumbar_flexion_vs_pelvis'),
  heinrich2023('lumbar-bend-vs-pelvis', Q.JointAngle, 'trunk_lateral_tilt', 'lumbar_bend_vs_pelvis'),
  heinrich2023('lumbar-rotation-vs-pelvis', Q.JointAngle, 'trunk_lateral_tilt', 'lumbar_rotation_vs_pelvis'),
  { id: 'heinrich-2023-period', source: 'heinrich-2023', quantity: Q.TurnPeriod, detail: 'the captured window', data: num('s', { value: 1.4 }), conditions: HEINRICH_2023, status: S.Measured, where: 'lit-curves gs_carving.period_s' },
  { id: 'heinrich-2023-inside-knee-max-flexion-time', source: 'heinrich-2023', quantity: Q.EventTiming, detail: 'inside knee maximum flexion', data: num('turn fraction', { value: 0.49 }), conditions: HEINRICH_2023, status: S.Digitised, where: 'Fig 2' },
  { id: 'heinrich-2023-outside-hip-rotation-peak-time', source: 'heinrich-2023', quantity: Q.EventTiming, detail: 'outside hip rotation peak', data: num('turn fraction', { value: 0.77 }), conditions: HEINRICH_2023, status: S.Digitised, where: 'Fig 2' },
  { id: 'heinrich-2023-outside-hip-abduction-peak-time', source: 'heinrich-2023', quantity: Q.EventTiming, detail: 'outside hip abduction peak', data: num('turn fraction', { value: 0.91 }), conditions: HEINRICH_2023, status: S.Digitised, where: 'Fig 2' },

  // sporri-2016-sidecut: lit-curves' "sporri-2016 BJSM 50:14-19"; speed not recorded
  { id: 'sporri-2016-sidecut-gs-edge-curve', source: 'sporri-2016-sidecut', quantity: Q.EdgeAngle, detail: 'outside ski, union of three ski-type ±SE bands', data: curve(C.GsCarving, 'edge_angle'), conditions: SPORRI_2016_SIDECUT, status: S.Digitised, where: SPORRI_2016_SIDECUT_WHERE + ' θEdge' },
  { id: 'sporri-2016-sidecut-gs-edge-plateau', source: 'sporri-2016-sidecut', quantity: Q.EdgeAngle, detail: 'plateau at t 0.25-0.75; falls to about 9 at t 1', data: num('deg', { range: [68, 70], t: [0.25, 0.75] }), conditions: SPORRI_2016_SIDECUT, status: S.Digitised, where: SPORRI_2016_SIDECUT_WHERE + ' θEdge' },
  { id: 'sporri-2016-sidecut-gs-skid-curve', source: 'sporri-2016-sidecut', quantity: Q.SkidAngle, detail: 'γSki, includes the initiation pivot', data: curve(C.GsCarving, 'skid_angle'), conditions: SPORRI_2016_SIDECUT, status: S.Digitised, where: SPORRI_2016_SIDECUT_WHERE + ' γSki' },
  { id: 'sporri-2016-sidecut-gs-skid-peak', source: 'sporri-2016-sidecut', quantity: Q.SkidAngle, detail: 'band middle at the peak', data: num('deg', { value: 28, t: 0.2 }), conditions: SPORRI_2016_SIDECUT, status: S.Digitised, where: SPORRI_2016_SIDECUT_WHERE + ' γSki' },
  { id: 'sporri-2016-sidecut-gs-fore-aft', source: 'sporri-2016-sidecut', quantity: Q.ForeAftPosition, detail: 'CoM against the outside ankle along the ski, + forward; zero line merges with the band at t 0.45-0.65', data: curve(C.GsCarving, 'fore_aft_cm'), conditions: SPORRI_2016_SIDECUT, status: S.Digitised, where: SPORRI_2016_SIDECUT_WHERE + ' dFore/Aft' },

  // sporri-2016 (OJSM back paper): sacrum-to-sternum, after the gate; slope, speed, n not recorded
  { id: 'sporri-2016-gs-trunk-frontal', source: 'sporri-2016', quantity: Q.TrunkAngle, detail: 'frontal bending, mean 27, peak 29', data: num('deg', { value: 27, peak: 29 }), conditions: { course: 'GS', note: 'phase after the gate' }, status: S.Measured, where: 'Table 3 (frontal bending)' },
  { id: 'sporri-2016-sl-trunk-frontal', source: 'sporri-2016', quantity: Q.TrunkAngle, detail: 'frontal bending, mean 11, peak 13', data: num('deg', { value: 11, peak: 13 }), conditions: { course: 'SL', note: 'phase after the gate' }, status: S.Measured, where: 'Table 3 (frontal bending)' },
  { id: 'sporri-2016-gs-trunk-lateral', source: 'sporri-2016', quantity: Q.TrunkAngle, detail: 'lateral bending, mean 11, peak 14', data: num('deg', { value: 11, peak: 14 }), conditions: { course: 'GS', note: 'phase after the gate' }, status: S.Measured, where: 'full text; table row not recorded' },
  { id: 'sporri-2016-sl-trunk-lateral', source: 'sporri-2016', quantity: Q.TrunkAngle, detail: 'lateral bending, mean 6, peak 9', data: num('deg', { value: 6, peak: 9 }), conditions: { course: 'SL', note: 'phase after the gate' }, status: S.Measured, where: 'full text; table row not recorded' },
  { id: 'sporri-2016-gs-trunk-torsion', source: 'sporri-2016', quantity: Q.TrunkAngle, detail: 'torsion, mean 6, peak 8', data: num('deg', { value: 6, peak: 8 }), conditions: { course: 'GS', note: 'phase after the gate' }, status: S.Measured, where: 'full text; table row not recorded' },
  { id: 'sporri-2016-sl-trunk-torsion', source: 'sporri-2016', quantity: Q.TrunkAngle, detail: 'torsion, mean 5, peak 7', data: num('deg', { value: 5, peak: 7 }), conditions: { course: 'SL', note: 'phase after the gate' }, status: S.Measured, where: 'full text; table row not recorded' },

  // sporri-2015 and sporri-2012: abstract-level numbers; conditions not recorded
  { id: 'sporri-2015-gs-trunk-at-peak-load', source: 'sporri-2015', quantity: Q.TrunkAngle, detail: 'at peak load: frontal 39, lateral 15, torsion 8', data: num('deg', { values: { frontal: 39, lateral: 15, torsion: 8 } }), conditions: { course: 'GS' }, status: S.Measured, where: 'abstract' },
  { id: 'sporri-2012-gs-lean', source: 'sporri-2012', quantity: Q.Inclination, detail: 'lean angle over the turn, mean and peak', data: num('deg', { value: 43, peak: 59 }), conditions: { course: 'World Cup GS, one world-class racer, explorative case study', n: 1, about: [], note: 'gate offset varied, values not recorded' }, status: S.Measured, where: 'full text; table not recorded' },
  { id: 'sporri-2012-gs-completion-force', source: 'sporri-2012', quantity: Q.CentripetalForce, detail: 'completion phase, smaller then larger gate offset', data: num('BW', { values: { smallerOffset: 0.37, largerOffset: 0.64 } }), conditions: { course: 'World Cup GS, one world-class racer', n: 1, note: 'gate offsets not recorded' }, status: S.Measured, where: 'full text; table not recorded' },

  // falda-buscaiot-2017: pressure insoles; slope values not recorded
  { id: 'falda-buscaiot-2017-outside-force-by-phase', source: 'falda-buscaiot-2017', quantity: Q.GroundReactionForce, detail: 'outside foot mean normal force against its initiation value: steering before the gate, after the gate, completion', data: num('x initiation', { values: { steeringBeforeGate: 2.18, steeringAfterGate: 2.79, completion: 1.87 } }), conditions: FALDA, status: S.Measured, where: 'full text; table not recorded' },
  { id: 'falda-buscaiot-2017-phase-shares', source: 'falda-buscaiot-2017', quantity: Q.PhaseShare, detail: 'initiation, steering before the gate, steering after the gate, completion', data: num('share of the turn', { values: { initiation: 0.21, steeringBeforeGate: 0.33, steeringAfterGate: 0.32, completion: 0.14 } }), conditions: FALDA, status: S.Measured, where: 'full text; table not recorded' },
  { id: 'falda-buscaiot-2017-mean-normal-force', source: 'falda-buscaiot-2017', quantity: Q.GroundReactionForce, detail: 'mean normal force, outside and inside foot; split about 50/50 at initiation to 75/25 at the end of steering', data: num('BW', { values: { outside: 0.68, inside: 0.4 } }), conditions: FALDA, status: S.Measured, where: 'full text; table not recorded' },

  // thorwartl-2023: no speed
  thorwartl('carved-outside', 'carved outer ski', 57, 1111, true),
  thorwartl('carved-inside', 'carved inner ski', 53, 517, true),
  thorwartl('steered-outside', 'steered outer ski', 42, 556, false),
  thorwartl('steered-inside', 'steered inner ski', 45, 56, false),

  // moguls
  { id: 'kurpiers-2020-wave-slope', source: 'kurpiers-2020', quantity: Q.BumpHeight, detail: 'wave slope with six bumps, no turns; not a competition course', data: num('m', { value: 0.5 }), conditions: { bumpHeightM: 0.5, bumpSpacingM: 4, slopeDeg: 19, n: 5, level: 'male skiers', about: ['bumpHeightM'] }, status: S.Measured, where: 'p338 (Methods)' },
  { id: 'arndt-1992-ankle-dorsiflexion', source: 'arndt-1992', quantity: Q.JointAngle, detail: 'ankle dorsiflexion, about 10 to 45 (range about 35)', data: curve(C.MogulsZipper, 'ankle_dorsiflexion'), conditions: { level: 'elite', n: 3, note: '200 Hz, left leg only; bump height and spacing not recorded' }, status: S.RangeOnly, where: 'pp67-68' },
  { id: 'arndt-1992-hip-flexion', source: 'arndt-1992', quantity: Q.JointAngle, detail: 'hip flexion to about 130 at peak absorption, best trial', data: curve(C.MogulsZipper, 'hip_flexion'), conditions: { level: 'elite', n: 3, note: '200 Hz, left leg only; bump height and spacing not recorded' }, status: S.RangeOnly, where: 'p78' },
  { id: 'arndt-1992-trunk-pitch', source: 'arndt-1992', quantity: Q.TrunkAngle, detail: 'vertical to about 80 from vertical at peak flexion; FIS judging p28 conflicts (upper body upright)', data: curve(C.MogulsZipper, 'trunk_pitch'), conditions: { level: 'elite', n: 3, note: '200 Hz, left leg only; bump height and spacing not recorded' }, status: S.RangeOnly, where: 'pp79-80' },
  { id: 'riku-2007-knee-change', source: 'riku-2007', quantity: Q.JointAngle, detail: 'knee-angle change per turn, both knees', data: num('deg', { range: [50, 60] }), conditions: { level: 'World and European Cup mogul skiers', n: 6 }, status: S.RangeOnly, where: 'abstract' },
  { id: 'ando-2024-knee-flexion', source: 'ando-2024', quantity: Q.JointAngle, detail: 'knee flexion from maximum extension, quoting the Horishima 2019 thesis', data: num('deg', { range: [20, 120] }), conditions: {}, status: S.RangeOnly, where: 'abstract-level figure' },
  { id: 'jds-bumps-style-pelvis-yaw-vs-skis', source: 'jds-bumps-style', quantity: Q.PelvisYawVsSkis, detail: 'about 0 at the switch, +35-50 by t 0.3-0.4; round line; torso square to the fall line (source matched to lit-curves "JDS footage" by its initials)', data: curve(C.MogulsZipper, 'pelvis_yaw_vs_skis'), conditions: { course: 'round line, zipper bumps' }, uncertainty: { error: '±15-20 deg (footage)' }, status: S.RangeOnly, where: 'video' },

  // footage
  { id: 'footage-sce-instructor-period', source: 'footage-sce-instructor', quantity: Q.TurnPeriod, data: num('s', { value: 0.66 }), conditions: { course: 'short/medium turns on groomed, rear-oblique follow-cam', note: 'speed and pitch not recorded' }, status: S.Measured, where: 'lit-curves recreational_parallel_short.period_s; 32 frames' },
  { id: 'footage-sce-instructor-pelvis-yaw-vs-skis', source: 'footage-sce-instructor', quantity: Q.PelvisYawVsSkis, detail: '0-20 throughout', data: num('deg', { range: [0, 20] }), conditions: { course: 'short/medium turns on groomed', note: 'speed and pitch not recorded' }, uncertainty: { error: '±15 deg (footage)' }, status: S.RangeOnly, where: 'lit-curves recreational_parallel_short.pelvis_yaw_vs_skis; 32 frames' },
];
