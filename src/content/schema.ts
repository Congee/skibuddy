import { Schema } from 'effect';

// Encoded keys are snake_case, as in content YAML and content.json; encodeKeys maps them to camelCase fields.
// Enum values are lowercase because they are the spellings used in content YAML.
export const Side = { Outside: 'outside', Inside: 'inside', Both: 'both' } as const;
export type Side = (typeof Side)[keyof typeof Side];

/** A DOF matrix row's side: a leg or arm (outside, inside, or both alike), or the midline (trunk). */
export const MatrixSide = { Outside: 'outside', Inside: 'inside', Both: 'both', Trunk: 'trunk' } as const;
export type MatrixSide = (typeof MatrixSide)[keyof typeof MatrixSide];

export const Contraction = { Concentric: 'concentric', Eccentric: 'eccentric', Isometric: 'isometric' } as const;
export type Contraction = (typeof Contraction)[keyof typeof Contraction];

/** High = measured in this movement; Medium = inferred from related studies; Low = mechanics or expert opinion. */
export const Confidence = { High: 'high', Medium: 'medium', Low: 'low' } as const;
export type Confidence = (typeof Confidence)[keyof typeof Confidence];

export const Phase = { Initiation: 'initiation', Shaping: 'shaping', Finish: 'finish' } as const;
export type Phase = (typeof Phase)[keyof typeof Phase];
export const PHASES: ReadonlyArray<Phase> = [Phase.Initiation, Phase.Shaping, Phase.Finish];

// How hard a drill is skied: terrain, speed and dynamism.
export const Intensity = { Gentle: 'gentle', Moderate: 'moderate', Dynamic: 'dynamic' } as const;
export type Intensity = (typeof Intensity)[keyof typeof Intensity];
export const INTENSITIES: ReadonlyArray<Intensity> = [Intensity.Gentle, Intensity.Moderate, Intensity.Dynamic];

export const Association = { Psia: 'psia', Csia: 'csia', Basi: 'basi', Nzsia: 'nzsia', Iasi: 'iasi' } as const;
export type Association = (typeof Association)[keyof typeof Association];

/** How far we read a source: the abstract, the whole work, or only the cited sections in full. */
export const SourceRead = { Abstract: 'abstract', Full: 'full', Partial: 'partial' } as const;
export type SourceRead = (typeof SourceRead)[keyof typeof SourceRead];

/** Only books (and manuals) take page numbers in a citation. */
export const SourceType = { Article: 'article', Book: 'book', Web: 'web' } as const;
export type SourceType = (typeof SourceType)[keyof typeof SourceType];

export const BodyRegion = { Leg: 'leg', Hip: 'hip', Trunk: 'trunk', Arm: 'arm' } as const;
export type BodyRegion = (typeof BodyRegion)[keyof typeof BodyRegion];

export const Joint = {
  Ankle: 'ankle',
  Foot: 'foot',
  Knee: 'knee',
  Hip: 'hip',
  Pelvis: 'pelvis',
  Lumbar: 'lumbar',
  Thoracic: 'thoracic',
  ShoulderGirdle: 'shoulder-girdle',
  Shoulder: 'shoulder',
  Elbow: 'elbow',
  Wrist: 'wrist',
  Neck: 'neck',
} as const;
export type Joint = (typeof Joint)[keyof typeof Joint];

/** Midline joints take one `trunk` row; limb joints take outside and inside rows (or one `both` row). */
export const AXIAL_JOINTS: ReadonlySet<Joint> = new Set([Joint.Pelvis, Joint.Lumbar, Joint.Thoracic, Joint.Neck]);

/** Every degree of freedom a movement's matrix must cover, as `joint.dof`. */
export const Dof = {
  AnkleFlexion: 'ankle.flexion',
  AnkleInversion: 'ankle.inversion',
  FootArch: 'foot.arch',
  KneeFlexion: 'knee.flexion',
  KneeRotation: 'knee.rotation',
  KneeValgus: 'knee.valgus',
  HipFlexion: 'hip.flexion',
  HipAbduction: 'hip.abduction',
  HipRotation: 'hip.rotation',
  PelvisTilt: 'pelvis.tilt',
  PelvisList: 'pelvis.list',
  PelvisRotation: 'pelvis.rotation',
  LumbarFlexion: 'lumbar.flexion',
  LumbarSideBend: 'lumbar.side-bend',
  LumbarRotation: 'lumbar.rotation',
  ThoracicFlexion: 'thoracic.flexion',
  ThoracicSideBend: 'thoracic.side-bend',
  ThoracicRotation: 'thoracic.rotation',
  ShoulderGirdleProtraction: 'shoulder-girdle.protraction',
  ShoulderFlexion: 'shoulder.flexion',
  ShoulderAbduction: 'shoulder.abduction',
  ElbowFlexion: 'elbow.flexion',
  WristGrip: 'wrist.grip',
  NeckFlexion: 'neck.flexion',
  NeckSideBend: 'neck.side-bend',
  NeckRotation: 'neck.rotation',
} as const;
export type Dof = (typeof Dof)[keyof typeof Dof];

/** The required list, ankle up to neck, in matrix order. */
export const DOFS: ReadonlyArray<Dof> = Object.values(Dof);

export const DOF_LABELS: Readonly<Record<Dof, string>> = {
  [Dof.AnkleFlexion]: 'Ankle dorsiflexion and plantarflexion',
  [Dof.AnkleInversion]: 'Ankle inversion and eversion',
  [Dof.FootArch]: 'Foot arch',
  [Dof.KneeFlexion]: 'Knee flexion and extension',
  [Dof.KneeRotation]: 'Knee rotation',
  [Dof.KneeValgus]: 'Knee valgus and varus',
  [Dof.HipFlexion]: 'Hip flexion and extension',
  [Dof.HipAbduction]: 'Hip abduction and adduction',
  [Dof.HipRotation]: 'Hip rotation',
  [Dof.PelvisTilt]: 'Pelvic tilt',
  [Dof.PelvisList]: 'Pelvic list (inside half held up)',
  [Dof.PelvisRotation]: 'Pelvic rotation (counter)',
  [Dof.LumbarFlexion]: 'Low back flexion and extension',
  [Dof.LumbarSideBend]: 'Low back side bend',
  [Dof.LumbarRotation]: 'Low back rotation',
  [Dof.ThoracicFlexion]: 'Upper back flexion and extension',
  [Dof.ThoracicSideBend]: 'Upper back side bend',
  [Dof.ThoracicRotation]: 'Upper back rotation',
  [Dof.ShoulderGirdleProtraction]: 'Shoulder blades',
  [Dof.ShoulderFlexion]: 'Shoulder flexion and extension',
  [Dof.ShoulderAbduction]: 'Shoulder abduction',
  [Dof.ElbowFlexion]: 'Elbow flexion',
  [Dof.WristGrip]: 'Wrist and grip',
  [Dof.NeckFlexion]: 'Neck flexion and extension',
  [Dof.NeckSideBend]: 'Neck side bend',
  [Dof.NeckRotation]: 'Neck rotation',
};

export const jointOf = (dof: Dof): Joint => dof.slice(0, dof.indexOf('.')) as Joint;
export const isAxial = (dof: Dof): boolean => AXIAL_JOINTS.has(jointOf(dof));

/** Loaded passive structures in the optional "structures under load" layer. */
export const Structure = { Acl: 'acl', Mcl: 'mcl', PatellarTendon: 'patellar-tendon', LumbarDiscs: 'lumbar-discs' } as const;
export type Structure = (typeof Structure)[keyof typeof Structure];

export const STRUCTURE_NAMES: Readonly<Record<Structure, string>> = {
  [Structure.Acl]: 'Anterior cruciate ligament',
  [Structure.Mcl]: 'Medial collateral ligament',
  [Structure.PatellarTendon]: 'Patellar tendon and kneecap joint',
  [Structure.LumbarDiscs]: 'Lumbar discs',
};

/** How an association task joins its fundamentals, as the task page prints it. */
export const FundamentalsRelation = { And: 'and', Or: 'or', AndOr: 'and/or' } as const;
export type FundamentalsRelation = (typeof FundamentalsRelation)[keyof typeof FundamentalsRelation];

const Slug = Schema.String.check(Schema.isPattern(/^[a-z0-9]+(-[a-z0-9]+)*$/));
const Text = Schema.String.check(Schema.isMinLength(1));
const HttpUrl = Schema.String.check(Schema.isPattern(/^https?:\/\//));

export const MuscleId = Slug.pipe(Schema.brand('MuscleId'));
export type MuscleId = typeof MuscleId.Type;
export const MovementId = Slug.pipe(Schema.brand('MovementId'));
export type MovementId = typeof MovementId.Type;
export const ExerciseId = Slug.pipe(Schema.brand('ExerciseId'));
export type ExerciseId = typeof ExerciseId.Type;
export const SourceId = Slug.pipe(Schema.brand('SourceId'));
export type SourceId = typeof SourceId.Type;
export const DrillId = Slug.pipe(Schema.brand('DrillId'));
export type DrillId = typeof DrillId.Type;
export const PrimitiveId = Slug.pipe(Schema.brand('PrimitiveId'));
export type PrimitiveId = typeof PrimitiveId.Type;
export const FundamentalId = Slug.pipe(Schema.brand('FundamentalId'));
export type FundamentalId = typeof FundamentalId.Type;

/** Ascending page ranges such as "79-81" or "61-62, 71"; why the string fails, or undefined. */
export const pagesProblem = (pages: string): string | undefined => {
  if (!/^\d+(-\d+)?(, \d+(-\d+)?)*$/.test(pages)) return `pages "${pages}" should look like 79-81 or 61-62, 71`;
  let last = 0;
  for (const part of pages.split(', ')) {
    const [from = 0, to = from] = part.split('-').map(Number);
    if (from < 1 || to < from || from <= last) return `pages "${pages}" must be ascending ranges from page 1`;
    last = to;
  }
  return undefined;
};

/** A single page as a number, or ranges as a string. */
export const Pages = Schema.Union([
  Schema.Number.check(Schema.isInt(), Schema.isGreaterThanOrEqualTo(1)),
  Schema.String.check(Schema.makeFilter(pagesProblem)),
]);
export type Pages = typeof Pages.Type;

/** A source id, or a source with the pages cited (books only). */
export const Citation = Schema.Union([SourceId, Schema.Struct({ source: SourceId, pages: Schema.optionalKey(Pages) })]);
export type Citation = typeof Citation.Type;

export const citedSource = (c: Citation): SourceId => (typeof c === 'string' ? c : c.source);
export const citedPages = (c: Citation): Pages | undefined => (typeof c === 'string' ? undefined : c.pages);

/** "p 81" or "pp 79–81". */
export const formatPages = (pages: Pages): string =>
  typeof pages === 'number' ? `p ${pages}` : `${/[-,]/.test(pages) ? 'pp' : 'p'} ${pages.replaceAll('-', '–')}`;

/** Relative effort, 0 (idle) to 3 (high); never a percentage unless a source measured one. */
export const EffortLevel = Schema.Number.check(Schema.isInt(), Schema.isBetween({ minimum: 0, maximum: 3 }));
export type EffortLevel = typeof EffortLevel.Type;

/** Why per-setting values break gentle <= moderate <= dynamic without a note, or undefined. */
export const orderProblem = (v: {
  readonly gentle: number;
  readonly moderate: number;
  readonly dynamic: number;
  readonly note?: string;
}): string | undefined =>
  v.note !== undefined || (v.gentle <= v.moderate && v.moderate <= v.dynamic)
    ? undefined
    : `gentle ${v.gentle}, moderate ${v.moderate}, dynamic ${v.dynamic} should not fall as intensity rises; add a note to explain`;

/** Effort at each intensity setting; `note` explains any value that falls as intensity rises. */
export const LevelBySetting = Schema.Struct({
  gentle: EffortLevel,
  moderate: EffortLevel,
  dynamic: EffortLevel,
  note: Schema.optionalKey(Text),
}).check(Schema.makeFilter(orderProblem));
export type LevelBySetting = typeof LevelBySetting.Type;

/** One effort for every setting, or one per setting. */
export const SettingLevel = Schema.Union([EffortLevel, LevelBySetting]);
export type SettingLevel = typeof SettingLevel.Type;

/** Per setting, efforts 0..3 at evenly spaced turn times from the switch. */
export const FramesBySetting = Schema.Struct({
  gentle: Schema.Array(Schema.Number),
  moderate: Schema.Array(Schema.Number),
  dynamic: Schema.Array(Schema.Number),
});

/** An activation's effort per phase, as content gives it; `frames` only on effort derived from the solve (motion-model §6.8). */
export const ActivationIntensity = Schema.Struct({
  initiation: SettingLevel,
  shaping: SettingLevel,
  finish: SettingLevel,
  frames: Schema.optionalKey(FramesBySetting),
});
export type ActivationIntensity = typeof ActivationIntensity.Type;

/** Effort per phase at one setting. */
export interface PhaseIntensity {
  readonly initiation: EffortLevel;
  readonly shaping: EffortLevel;
  readonly finish: EffortLevel;
}

const PhaseContractionValue = Schema.NullOr(Schema.Enum(Contraction));

export const ContractionBySetting = Schema.Struct({
  gentle: PhaseContractionValue,
  moderate: PhaseContractionValue,
  dynamic: PhaseContractionValue,
});
export type ContractionBySetting = typeof ContractionBySetting.Type;

/** The contraction in each phase, one for every setting or one per setting; null only where the muscle is idle (intensity 0). */
export const ActivationContraction = Schema.Struct({
  initiation: Schema.Union([PhaseContractionValue, ContractionBySetting]),
  shaping: Schema.Union([PhaseContractionValue, ContractionBySetting]),
  finish: Schema.Union([PhaseContractionValue, ContractionBySetting]),
});
export type ActivationContraction = typeof ActivationContraction.Type;

/** The contraction in each phase at one setting. */
export interface PhaseContraction {
  readonly initiation: Contraction | null;
  readonly shaping: Contraction | null;
  readonly finish: Contraction | null;
}

export const levelAt = (v: SettingLevel, i: Intensity): EffortLevel => (typeof v === 'number' ? v : v[i]);

export const contractionAt = (v: ActivationContraction[Phase], i: Intensity): Contraction | null =>
  v === null || typeof v === 'string' ? v : v[i];

/** Effort per phase at setting `i`. */
export const phaseIntensity = (a: ActivationIntensity, i: Intensity): PhaseIntensity => ({
  initiation: levelAt(a.initiation, i),
  shaping: levelAt(a.shaping, i),
  finish: levelAt(a.finish, i),
});

/** Contraction per phase at setting `i`. */
export const phaseContraction = (c: ActivationContraction, i: Intensity): PhaseContraction => ({
  initiation: contractionAt(c.initiation, i),
  shaping: contractionAt(c.shaping, i),
  finish: contractionAt(c.finish, i),
});

/** The contraction types a muscle uses across the turn, in phase order, without repeats. */
export const contractionsOf = (c: PhaseContraction): ReadonlyArray<Contraction> => [
  ...new Set(PHASES.flatMap((p) => (c[p] === null ? [] : [c[p]]))),
];

export const Muscle = Schema.Struct({
  id: MuscleId,
  name: Text,
  /** For pins and slat titles where the full name would be cut, e.g. "Vasti". */
  shortName: Schema.optionalKey(Text),
  region: Schema.Enum(BodyRegion),
  /** The group this muscle is part of, e.g. vasti in quadriceps; groups stay for exercise targets. */
  partOf: Schema.optionalKey(MuscleId),
  /** Foundational Model of Anatomy id, e.g. "FMA:22315"; omitted until verified. */
  fma: Schema.optionalKey(Schema.String.check(Schema.isPattern(/^FMA:\d+$/))),
}).pipe(Schema.encodeKeys({ partOf: 'part_of', shortName: 'short_name' }));
export type Muscle = typeof Muscle.Type;

/** The name pins and slat titles show. */
export const shortNameOf = (m: Muscle): string => m.shortName ?? m.name;

const needsOne = (c: { readonly action?: unknown; readonly neutral?: unknown }): string | undefined =>
  (c.action === undefined) !== (c.neutral === undefined) ? undefined : 'needs exactly one of action or neutral: true';

/** One joint DOF on one side in one phase: what it does (or that it is held neutral), and how. */
export const MatrixCell = Schema.Struct({
  /** Plain words for the movement or held position. */
  action: Schema.optionalKey(Text),
  /** Held at neutral; the contraction says how it is held. */
  neutral: Schema.optionalKey(Schema.Literal(true)),
  /** The net internal joint moment, where known. */
  moment: Schema.optionalKey(Text),
  /** Of the muscles producing the net moment. */
  contraction: Schema.Enum(Contraction),
  /** What an instructor would say. */
  cue: Text,
  confidence: Schema.Enum(Confidence),
  sources: Schema.Array(Citation),
}).check(Schema.makeFilter(needsOne));
export type MatrixCell = typeof MatrixCell.Type;

export const MatrixRow = Schema.Struct({
  dof: Schema.Enum(Dof),
  side: Schema.Enum(MatrixSide),
  cells: Schema.Struct({ initiation: MatrixCell, shaping: MatrixCell, finish: MatrixCell }),
});
export type MatrixRow = typeof MatrixRow.Type;

export const Activation = Schema.Struct({
  muscle: MuscleId,
  side: Schema.Enum(Side),
  /** The matrix rows (joint actions) this muscle works for, resolved on its side. */
  serves: Schema.Array(Schema.Enum(Dof)).check(Schema.isMinLength(1)),
  intensity: ActivationIntensity,
  contraction: ActivationContraction,
  role: Text,
  confidence: Schema.Enum(Confidence),
  /** Plain-words basis, shown to users next to the confidence. */
  basis: Text,
  sources: Schema.Array(Citation),
});
export type Activation = typeof Activation.Type;

/** A passive structure the movement loads, and what protects it. */
export const StructureLoad = Schema.Struct({
  structure: Schema.Enum(Structure),
  side: Schema.Enum(Side),
  phases: Schema.Array(Schema.Enum(Phase)).check(Schema.isMinLength(1)),
  /** What loads it, in plain words. */
  mechanism: Text,
  protectedBy: Schema.Array(MuscleId),
  confidence: Schema.Enum(Confidence),
  sources: Schema.Array(Citation),
}).pipe(Schema.encodeKeys({ protectedBy: 'protected_by' }));
export type StructureLoad = typeof StructureLoad.Type;

export const Movement = Schema.Struct({
  id: MovementId,
  name: Text,
  dofMatrix: Schema.Array(MatrixRow).check(Schema.isMinLength(1)),
  activations: Schema.Array(Activation).check(Schema.isMinLength(1)),
  structures: Schema.optionalKey(Schema.Array(StructureLoad)),
  reviewedBy: Schema.Array(Text),
}).pipe(Schema.encodeKeys({ dofMatrix: 'dof_matrix', reviewedBy: 'reviewed_by' }));
export type Movement = typeof Movement.Type;

/** A matrix row a primitive owns. */
export const PrimitiveRow = Schema.Struct({ dof: Schema.Enum(Dof), side: Schema.Enum(MatrixSide) });
export type PrimitiveRow = typeof PrimitiveRow.Type;

/** A reusable movement pattern (biomechanics.md 0.4) that drills are composed of. */
export const Primitive = Schema.Struct({
  id: PrimitiveId,
  /** The research doc's label, e.g. P3. */
  code: Schema.String.check(Schema.isPattern(/^P\d+$/)),
  name: Text,
  summary: Text,
  /** Rows a movement must work (not hold neutral) in some phase to show this primitive. */
  rows: Schema.Array(PrimitiveRow).check(Schema.isMinLength(1)),
});
export type Primitive = typeof Primitive.Type;

const Positive = Schema.Number.check(Schema.isGreaterThan(0));

const SlopeDeg = Schema.Number.check(Schema.isBetween({ minimum: 0, maximum: 45 }));
const Share = Schema.Number.check(Schema.isBetween({ minimum: 0, maximum: 1 }));
const SCENARIO_KEYS = {
  speedMps: 'speed_mps',
  slopeDeg: 'slope_deg',
  radiusM: 'radius_m',
  comRadiusM: 'com_radius_m',
  brakingShare: 'braking_share',
  stepRateHz: 'step_rate_hz',
  stopDistanceM: 'stop_distance_m',
} as const;

/** How a drill is skied at one setting: speed and slope, plus what shapes the run. No radius means no round turn. */
export const Scenario = Schema.Struct({
  speedMps: Positive,
  slopeDeg: SlopeDeg,
  radiusM: Schema.optionalKey(Positive),
  /** The centre of mass's path, when wider than the skis' arc. */
  comRadiusM: Schema.optionalKey(Positive),
  /** Share of gravity's pull along the path the snow takes to hold the speed; absent, 0. */
  brakingShare: Schema.optionalKey(Share),
  stepRateHz: Schema.optionalKey(Positive),
  /** Distance the skis brake over to a stop (Lind & Sanders eq 4.7). */
  stopDistanceM: Schema.optionalKey(Positive),
}).pipe(Schema.encodeKeys(SCENARIO_KEYS));
export type Scenario = typeof Scenario.Type;

/** A round turn: a scenario with a radius. */
export const TurnScenario = Schema.Struct({
  speedMps: Positive,
  slopeDeg: SlopeDeg,
  radiusM: Positive,
  comRadiusM: Schema.optionalKey(Positive),
  brakingShare: Schema.optionalKey(Share),
  stepRateHz: Schema.optionalKey(Positive),
  stopDistanceM: Schema.optionalKey(Positive),
}).pipe(Schema.encodeKeys(SCENARIO_KEYS));
export type TurnScenario = typeof TurnScenario.Type;

/** A turn drill's scenarios, which the figure poses for. */
export const Scenarios = Schema.Struct({ gentle: TurnScenario, moderate: TurnScenario, dynamic: TurnScenario });
export type Scenarios = typeof Scenarios.Type;

export const DrillScenarios = Schema.Struct({ gentle: Scenario, moderate: Scenario, dynamic: Scenario });
export type DrillScenarios = typeof DrillScenarios.Type;

export const isTurnScenario = (s: Scenario): s is TurnScenario => s.radiusM !== undefined;
export const isTurnScenarios = (ss: DrillScenarios): ss is Scenarios => INTENSITIES.every((i) => isTurnScenario(ss[i]));

export const DrillPrimitive = Schema.Struct({
  primitive: PrimitiveId,
  /** How the drill bends it, e.g. "tail only". */
  modifier: Schema.optionalKey(Text),
  /**
   * Worked by the other leg, e.g. the stance-leg hold on the inside ski: outside rows are read as inside and the
   * reverse; `both` and trunk rows are unchanged, so the primitive needs a sided row. A primitive is listed once per
   * drill, so it cannot be both plain and mirrored.
   */
  mirrored: Schema.optionalKey(Schema.Literal(true)),
});
export type DrillPrimitive = typeof DrillPrimitive.Type;

/** An association-neutral drill; associations map their own tasks onto it. */
export const Drill = Schema.Struct({
  id: DrillId,
  /** A generic name, not any one association's. */
  name: Text,
  movement: MovementId,
  /** Our own words. */
  summary: Text,
  terrain: Text,
  /** The skiing each intensity setting stands for. */
  scenarios: DrillScenarios,
  /** The kit the efforts assume, and what changes them. */
  equipment: Schema.optionalKey(Text),
  /** Safety points for the drill as a whole. */
  cautions: Schema.optionalKey(Schema.Array(Text)),
  /** Evidence for the drill-level text, such as terrain. */
  sources: Schema.optionalKey(Schema.Array(Citation)),
  primitives: Schema.Array(DrillPrimitive).check(Schema.isMinLength(1)),
  reviewedBy: Schema.Array(Text),
}).pipe(Schema.encodeKeys({ reviewedBy: 'reviewed_by' }));
export type Drill = typeof Drill.Type;

/** One primitive, or any one of several (e.g. either transition style). */
export const Requirement = Schema.Union([
  PrimitiveId,
  Schema.Struct({ anyOf: Schema.Array(PrimitiveId).check(Schema.isMinLength(2)) }).pipe(Schema.encodeKeys({ anyOf: 'any_of' })),
]);
export type Requirement = typeof Requirement.Type;

export const Fundamental = Schema.Struct({
  id: FundamentalId,
  /** The association's own label, kept verbatim. */
  name: Text,
  /** What a drill's movement must show for this fundamental; our reading. */
  requires: Schema.Array(Requirement).check(Schema.isMinLength(1)),
  basis: Text,
});
export type Fundamental = typeof Fundamental.Type;

/** One association's fundamentals, each mapped to the primitives it requires. */
export const AssociationFundamentals = Schema.Struct({
  association: Schema.Enum(Association),
  url: Schema.String.check(Schema.isPattern(/^https:\/\//)),
  fundamentals: Schema.Array(Fundamental).check(Schema.isMinLength(1)),
});
export type AssociationFundamentals = typeof AssociationFundamentals.Type;

/** A level on the association's own scale; `ordinal` only where the scale is numeric. */
export const Level = Schema.Struct({
  label: Text,
  ordinal: Schema.optionalKey(Schema.Number.check(Schema.isInt(), Schema.isGreaterThanOrEqualTo(1))),
});
export type Level = typeof Level.Type;

export const TaskFundamentals = Schema.Struct({
  relation: Schema.Enum(FundamentalsRelation),
  ids: Schema.Array(FundamentalId).check(Schema.isMinLength(1)),
});
export type TaskFundamentals = typeof TaskFundamentals.Type;

/** One association's name and placement for a drill. */
export const AssociationTask = Schema.Struct({
  association: Schema.Enum(Association),
  drill: DrillId,
  /** The association's own task name. */
  task: Text,
  level: Schema.optionalKey(Level),
  category: Schema.optionalKey(Text),
  fundamentals: Schema.optionalKey(TaskFundamentals),
  url: Schema.String.check(Schema.isPattern(/^https:\/\//)),
  reviewedBy: Schema.Array(Text),
}).pipe(Schema.encodeKeys({ reviewedBy: 'reviewed_by' }));
export type AssociationTask = typeof AssociationTask.Type;

export const ExerciseTarget = Schema.Struct({
  muscle: MuscleId,
  /** How the exercise loads the muscle. */
  contraction: Schema.optionalKey(Schema.Enum(Contraction)),
  /** Takes the joint through range instead of loading the muscle. */
  mobilisation: Schema.optionalKey(Schema.Literal(true)),
}).check(
  Schema.makeFilter((t) => ((t.contraction === undefined) !== (t.mobilisation === undefined) ? undefined : 'needs exactly one of contraction or mobilisation: true')),
);
export type ExerciseTarget = typeof ExerciseTarget.Type;

/** What a dosing range trains for. */
export const DosingGoal = { Strength: 'strength', Endurance: 'endurance', Power: 'power', Control: 'control' } as const;
export type DosingGoal = (typeof DosingGoal)[keyof typeof DosingGoal];

const Count = Schema.Number.check(Schema.isInt(), Schema.isGreaterThanOrEqualTo(1));

/** An inclusive whole-number range. */
export const Span = Schema.Struct({ min: Count, max: Count }).check(
  Schema.makeFilter((s) => (s.min <= s.max ? undefined : { path: ['max'], issue: `max ${s.max} is below min ${s.min}` })),
);
export type Span = typeof Span.Type;

/** Exactly one of `reps` or `hold_seconds`; body-weight holds use seconds. */
const oneUnit = (d: { readonly reps?: unknown; readonly holdSeconds?: unknown }): string | undefined =>
  (d.reps === undefined) !== (d.holdSeconds === undefined) ? undefined : 'needs exactly one of reps or hold_seconds';

/** General guidance for one goal, never a prescription. */
export const DosingRange = Schema.Struct({
  goal: Schema.Enum(DosingGoal),
  sets: Span,
  reps: Schema.optionalKey(Span),
  holdSeconds: Schema.optionalKey(Span),
  restSeconds: Span,
  /** Plain words on how it should feel or what to watch. */
  note: Text,
  /** Plain-words basis for this goal's numbers only. */
  basis: Text,
  sources: Schema.Array(Citation).check(Schema.isMinLength(1)),
}).check(Schema.makeFilter(oneUnit)).pipe(
  Schema.encodeKeys({ holdSeconds: 'hold_seconds', restSeconds: 'rest_seconds' }),
);
export type DosingRange = typeof DosingRange.Type;

/** One sets × reps (or hold) that sits inside the range for its goal. */
export const DosingSuggestion = Schema.Struct({
  goal: Schema.Enum(DosingGoal),
  sets: Count,
  reps: Schema.optionalKey(Count),
  holdSeconds: Schema.optionalKey(Count),
}).check(Schema.makeFilter(oneUnit)).pipe(Schema.encodeKeys({ holdSeconds: 'hold_seconds' }));
export type DosingSuggestion = typeof DosingSuggestion.Type;

const inSpan = (n: number, s: Span): boolean => n >= s.min && n <= s.max;

/** Why the suggestion fails its range, or undefined when it fits. */
export const suggestionProblem = (dosing: {
  readonly ranges: ReadonlyArray<DosingRange>;
  readonly suggested: DosingSuggestion;
}): string | undefined => {
  const { suggested } = dosing;
  const range = dosing.ranges.find((r) => r.goal === suggested.goal);
  if (range === undefined) return `suggested goal ${suggested.goal} has no range`;
  if (!inSpan(suggested.sets, range.sets)) return `suggested ${suggested.sets} sets is outside ${range.sets.min}-${range.sets.max}`;
  if (suggested.reps !== undefined) {
    if (range.reps === undefined) return 'suggested reps but the range is a hold';
    if (!inSpan(suggested.reps, range.reps)) return `suggested ${suggested.reps} reps is outside ${range.reps.min}-${range.reps.max}`;
  }
  if (suggested.holdSeconds !== undefined) {
    if (range.holdSeconds === undefined) return 'suggested a hold but the range is reps';
    if (!inSpan(suggested.holdSeconds, range.holdSeconds)) {
      return `suggested ${suggested.holdSeconds} s is outside ${range.holdSeconds.min}-${range.holdSeconds.max}`;
    }
  }
  return undefined;
};

/** Optional general dosing; shown only when the viewer turns it on. */
export const Dosing = Schema.Struct({
  /** Counts are per side (one leg or one side of the body). */
  perSide: Schema.Boolean,
  ranges: Schema.Array(DosingRange).check(Schema.isMinLength(1)),
  suggested: DosingSuggestion,
}).check(
  Schema.makeFilter((d) => {
    const goals = d.ranges.map((r) => r.goal);
    const repeated = goals.find((g, i) => goals.indexOf(g) !== i);
    if (repeated !== undefined) return { path: ['ranges'], issue: `goal ${repeated} appears twice` };
    const problem = suggestionProblem(d);
    return problem === undefined ? undefined : { path: ['suggested'], issue: problem };
  }),
).pipe(Schema.encodeKeys({ perSide: 'per_side' }));
export type Dosing = typeof Dosing.Type;

export const Exercise = Schema.Struct({
  id: ExerciseId,
  name: Text,
  targets: Schema.Array(ExerciseTarget).check(Schema.isMinLength(1)),
  singleLeg: Schema.Boolean,
  matchesOnSnow: Text,
  easier: Text,
  harder: Text,
  cautions: Schema.Array(Text),
  dosing: Schema.optionalKey(Dosing),
  /** Evidence for the exercise and its on-snow match. */
  sources: Schema.optionalKey(Schema.Array(Citation)),
  reviewedBy: Schema.Array(Text),
}).pipe(
  Schema.encodeKeys({ singleLeg: 'single_leg', matchesOnSnow: 'matches_on_snow', reviewedBy: 'reviewed_by' }),
);
export type Exercise = typeof Exercise.Type;

export const Source = Schema.Struct({
  id: SourceId,
  type: Schema.Enum(SourceType),
  citation: Text,
  url: HttpUrl,
  read: Schema.Enum(SourceRead),
});
export type Source = typeof Source.Type;

export const Content = Schema.Struct({
  muscles: Schema.Array(Muscle),
  movements: Schema.Array(Movement),
  primitives: Schema.Array(Primitive),
  drills: Schema.Array(Drill),
  fundamentals: Schema.Array(AssociationFundamentals),
  tasks: Schema.Array(AssociationTask),
  exercises: Schema.Array(Exercise),
  sources: Schema.Array(Source),
});
export type Content = typeof Content.Type;
