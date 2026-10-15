import { Effect, Schema } from 'effect';
import { parse } from 'yaml';
import { AssociationFundamentals, AssociationTask, Drill, Exercise, Movement, Muscle, Primitive, Source } from './schema';
import type { Content } from './schema';
import { checkContent, ContentError } from './validate';

/** A content file's path relative to `content/` and its raw text. */
export interface ContentFile {
  readonly path: string;
  readonly text: string;
}

// YAML flow maps split on commas; stray keys must fail, not vanish.
const STRICT = { onExcessProperty: 'error' } as const;

const decodeMuscles = Schema.decodeUnknownEffect(Schema.Array(Muscle), STRICT);
const decodeSources = Schema.decodeUnknownEffect(Schema.Array(Source), STRICT);
const decodePrimitives = Schema.decodeUnknownEffect(Schema.Array(Primitive), STRICT);
const decodeFundamentals = Schema.decodeUnknownEffect(AssociationFundamentals, STRICT);
const decodeMovement = Schema.decodeUnknownEffect(Movement, STRICT);
const decodeDrill = Schema.decodeUnknownEffect(Drill, STRICT);
const decodeTask = Schema.decodeUnknownEffect(AssociationTask, STRICT);
const decodeExercise = Schema.decodeUnknownEffect(Exercise, STRICT);

const parseYaml = (file: ContentFile): Effect.Effect<unknown, ContentError> =>
  Effect.try({
    try: (): unknown => parse(file.text),
    catch: (error) => new ContentError({ problems: [`${file.path}: ${String(error)}`] }),
  });

const inFile =
  (path: string) =>
  (error: Schema.SchemaError): ContentError =>
    new ContentError({ problems: [`${path}: ${error.message}`] });

const sortedBy = (files: ReadonlyArray<ContentFile>, pattern: RegExp): ReadonlyArray<ContentFile> =>
  files.filter((f) => pattern.test(f.path)).toSorted((a, b) => a.path.localeCompare(b.path));

/**
 * Decodes each file on its own so problems name their file, then runs the
 * cross-reference checks over the assembled whole. Pure: takes file contents, does no I/O.
 */
export const assembleContent = Effect.fn('assembleContent')(function* (
  files: ReadonlyArray<ContentFile>,
): Effect.fn.Return<Content, ContentError> {
  const problems: Array<string> = [];
  const collect = <A>(effect: Effect.Effect<A, ContentError>): Effect.Effect<ReadonlyArray<A>> =>
    effect.pipe(
      Effect.map((a) => [a]),
      Effect.catch((error) =>
        Effect.sync((): ReadonlyArray<A> => {
          problems.push(...error.problems);
          return [];
        }),
      ),
    );
  const decodeFile = <A>(
    file: ContentFile,
    decode: (u: unknown) => Effect.Effect<A, Schema.SchemaError>,
  ): Effect.Effect<ReadonlyArray<A>> =>
    collect(Effect.flatMap(parseYaml(file), (u) => decode(u).pipe(Effect.mapError(inFile(file.path)))));
  const required = <A>(
    path: string,
    decode: (u: unknown) => Effect.Effect<ReadonlyArray<A>, Schema.SchemaError>,
  ): Effect.Effect<ReadonlyArray<A>> => {
    const file = files.find((f) => f.path === path);
    if (file === undefined) {
      problems.push(`${path}: missing`);
      return Effect.succeed<ReadonlyArray<A>>([]);
    }
    return decodeFile(file, decode).pipe(Effect.map((all) => all.flat()));
  };

  const muscles = yield* required('anatomy/muscles.yaml', decodeMuscles);
  const sources = yield* required('sources.yaml', decodeSources);
  const primitives = yield* required('primitives.yaml', decodePrimitives);
  const movements = yield* Effect.forEach(sortedBy(files, /^movements\/[^/]+\.ya?ml$/), (f) =>
    decodeFile(f, decodeMovement),
  );
  const drills = yield* Effect.forEach(sortedBy(files, /^drills\/[^/]+\.ya?ml$/), (f) => decodeFile(f, decodeDrill));
  const exercises = yield* Effect.forEach(sortedBy(files, /^exercises\/[^/]+\.ya?ml$/), (f) =>
    decodeFile(f, decodeExercise),
  );
  const fundamentals = yield* Effect.forEach(sortedBy(files, /^fundamentals\/[^/]+\.ya?ml$/), (f) =>
    decodeFile(f, decodeFundamentals).pipe(
      Effect.tap((decoded) =>
        Effect.sync(() => {
          const name = f.path.slice('fundamentals/'.length).replace(/\.ya?ml$/, '');
          for (const d of decoded) {
            if (d.association !== name) problems.push(`${f.path}: association ${d.association} does not match file name ${name}`);
          }
        }),
      ),
    ),
  );
  const tasks = yield* Effect.forEach(sortedBy(files, /^associations\/[^/]+\/[^/]+\.ya?ml$/), (f) =>
    decodeFile(f, decodeTask).pipe(
      Effect.tap((decoded) =>
        Effect.sync(() => {
          const folder = f.path.split('/')[1];
          for (const t of decoded) {
            if (t.association !== folder) {
              problems.push(`${f.path}: association ${t.association} does not match folder ${String(folder)}`);
            }
          }
        }),
      ),
    ),
  );

  if (problems.length > 0) return yield* new ContentError({ problems });
  return yield* checkContent({
    muscles,
    sources,
    movements: movements.flat(),
    primitives,
    fundamentals: fundamentals.flat(),
    drills: drills.flat(),
    exercises: exercises.flat(),
    tasks: tasks.flat(),
  });
});
