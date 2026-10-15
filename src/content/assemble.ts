import { Effect, Schema } from 'effect';
import { parse } from 'yaml';
import { AssociationTask, Exercise, Movement, Muscle, Source } from './schema';
import type { Content } from './schema';
import { ContentError, validateContent } from './validate';

/** A content file's path relative to `content/` and its raw text. */
export interface ContentFile {
  readonly path: string;
  readonly text: string;
}

const decodeMuscles = Schema.decodeUnknownEffect(Schema.Array(Muscle));
const decodeSources = Schema.decodeUnknownEffect(Schema.Array(Source));
const decodeMovement = Schema.decodeUnknownEffect(Movement);
const decodeTask = Schema.decodeUnknownEffect(AssociationTask);
const decodeExercise = Schema.decodeUnknownEffect(Exercise);

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
  const movements = yield* Effect.forEach(sortedBy(files, /^movements\/[^/]+\.ya?ml$/), (f) =>
    decodeFile(f, decodeMovement),
  );
  const exercises = yield* Effect.forEach(sortedBy(files, /^exercises\/[^/]+\.ya?ml$/), (f) =>
    decodeFile(f, decodeExercise),
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
  return yield* validateContent({
    muscles,
    sources,
    movements: movements.flat(),
    exercises: exercises.flat(),
    tasks: tasks.flat(),
  });
});
