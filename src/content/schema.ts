import { Schema } from 'effect';

// Encoded keys are snake_case, as in content YAML and content.json; encodeKeys maps them to camelCase fields.
// Enum values are lowercase because they are the spellings used in content YAML.
export const Side = { Outside: 'outside', Inside: 'inside', Both: 'both' } as const;
export type Side = (typeof Side)[keyof typeof Side];

export const Contraction = { Concentric: 'concentric', Eccentric: 'eccentric', Isometric: 'isometric' } as const;
export type Contraction = (typeof Contraction)[keyof typeof Contraction];

/** High = measured in this movement; Medium = inferred from related studies; Low = mechanics or expert opinion. */
export const Confidence = { High: 'high', Medium: 'medium', Low: 'low' } as const;
export type Confidence = (typeof Confidence)[keyof typeof Confidence];

export const Phase = { Initiation: 'initiation', Shaping: 'shaping', Finish: 'finish' } as const;
export type Phase = (typeof Phase)[keyof typeof Phase];
export const PHASES: ReadonlyArray<Phase> = [Phase.Initiation, Phase.Shaping, Phase.Finish];

export const Association = { Psia: 'psia', Csia: 'csia', Basi: 'basi', Nzsia: 'nzsia' } as const;
export type Association = (typeof Association)[keyof typeof Association];

/** Whether we read a source's full text or only its abstract. */
export const SourceRead = { Abstract: 'abstract', Full: 'full' } as const;
export type SourceRead = (typeof SourceRead)[keyof typeof SourceRead];

export const BodyRegion = { Leg: 'leg', Hip: 'hip', Trunk: 'trunk', Arm: 'arm' } as const;
export type BodyRegion = (typeof BodyRegion)[keyof typeof BodyRegion];

const Slug = Schema.String.check(Schema.isPattern(/^[a-z0-9]+(-[a-z0-9]+)*$/));
const Text = Schema.String.check(Schema.isMinLength(1));

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

/** Relative effort, 0 (idle) to 3 (high); never a percentage unless a source measured one. */
export const Intensity = Schema.Number.check(Schema.isInt(), Schema.isBetween({ minimum: 0, maximum: 3 }));
export type Intensity = typeof Intensity.Type;

export const PhaseIntensity = Schema.Struct({
  initiation: Intensity,
  shaping: Intensity,
  finish: Intensity,
});
export type PhaseIntensity = typeof PhaseIntensity.Type;

export const Muscle = Schema.Struct({
  id: MuscleId,
  name: Text,
  region: Schema.Enum(BodyRegion),
  /** Foundational Model of Anatomy id, e.g. "FMA:22315"; omitted until verified. */
  fma: Schema.optionalKey(Schema.String.check(Schema.isPattern(/^FMA:\d+$/))),
});
export type Muscle = typeof Muscle.Type;

export const Activation = Schema.Struct({
  muscle: MuscleId,
  side: Schema.Enum(Side),
  intensity: PhaseIntensity,
  contraction: Schema.Array(Schema.Enum(Contraction)).check(Schema.isMinLength(1)),
  role: Text,
  confidence: Schema.Enum(Confidence),
  /** Plain-words basis, shown to users next to the confidence. */
  basis: Text,
  sources: Schema.Array(SourceId),
});
export type Activation = typeof Activation.Type;

export const JointAction = Schema.Struct({
  joint: Text,
  side: Schema.Enum(Side),
  action: Text,
  confidence: Schema.Enum(Confidence),
});
export type JointAction = typeof JointAction.Type;

export const Movement = Schema.Struct({
  id: MovementId,
  name: Text,
  activations: Schema.Array(Activation).check(Schema.isMinLength(1)),
  jointActions: Schema.Array(JointAction),
  reviewedBy: Schema.Array(Text),
}).pipe(Schema.encodeKeys({ jointActions: 'joint_actions', reviewedBy: 'reviewed_by' }));
export type Movement = typeof Movement.Type;

/** An association-neutral drill; associations map their own tasks onto it. */
export const Drill = Schema.Struct({
  id: DrillId,
  /** A generic name, not any one association's. */
  name: Text,
  movement: MovementId,
  /** Our own words. */
  summary: Text,
  terrain: Text,
  reviewedBy: Schema.Array(Text),
}).pipe(Schema.encodeKeys({ reviewedBy: 'reviewed_by' }));
export type Drill = typeof Drill.Type;

/** One association's name and placement for a drill. */
export const AssociationTask = Schema.Struct({
  association: Schema.Enum(Association),
  drill: DrillId,
  /** The association's own task name. */
  task: Text,
  /** In the association's own level scale. */
  level: Schema.optionalKey(Schema.Number.check(Schema.isInt(), Schema.isBetween({ minimum: 1, maximum: 4 }))),
  category: Schema.optionalKey(Text),
  /** The association's own fundamental names, kept verbatim. */
  fundamentals: Schema.Array(Text),
  url: Schema.String.check(Schema.isPattern(/^https:\/\//)),
  reviewedBy: Schema.Array(Text),
}).pipe(Schema.encodeKeys({ reviewedBy: 'reviewed_by' }));
export type AssociationTask = typeof AssociationTask.Type;

export const ExerciseTarget = Schema.Struct({
  muscle: MuscleId,
  contraction: Schema.Enum(Contraction),
});
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
  sources: Schema.Array(SourceId).check(Schema.isMinLength(1)),
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
  reviewedBy: Schema.Array(Text),
}).pipe(
  Schema.encodeKeys({ singleLeg: 'single_leg', matchesOnSnow: 'matches_on_snow', reviewedBy: 'reviewed_by' }),
);
export type Exercise = typeof Exercise.Type;

export const Source = Schema.Struct({
  id: SourceId,
  citation: Text,
  url: Schema.String.check(Schema.isPattern(/^https?:\/\//)),
  read: Schema.Enum(SourceRead),
});
export type Source = typeof Source.Type;

export const Content = Schema.Struct({
  muscles: Schema.Array(Muscle),
  movements: Schema.Array(Movement),
  drills: Schema.Array(Drill),
  tasks: Schema.Array(AssociationTask),
  exercises: Schema.Array(Exercise),
  sources: Schema.Array(Source),
});
export type Content = typeof Content.Type;
