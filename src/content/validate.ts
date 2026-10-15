import { Effect, Schema } from 'effect';
import { Confidence, Content } from './schema';

export class ContentError extends Schema.TaggedError<ContentError>()('ContentError', {
  problems: Schema.Array(Schema.String),
}) {}

const decodeContent = Schema.decodeUnknownEffect(Content);

const duplicates = (ids: ReadonlyArray<string>): ReadonlyArray<string> =>
  ids.filter((id, i) => ids.indexOf(id) !== i);

/** Cross-reference checks the schema alone cannot express. */
export const findProblems = (content: Content): ReadonlyArray<string> => {
  const muscles = new Set<string>(content.muscles.map((m) => m.id));
  const movements = new Set<string>(content.movements.map((m) => m.id));
  const sources = new Set<string>(content.sources.map((s) => s.id));
  const drills = new Set<string>(content.drills.map((d) => d.id));
  const problems: Array<string> = [];

  for (const [kind, ids] of [
    ['muscle', content.muscles.map((m) => m.id)],
    ['movement', content.movements.map((m) => m.id)],
    ['drill', content.drills.map((d) => d.id)],
    ['exercise', content.exercises.map((e) => e.id)],
    ['source', content.sources.map((s) => s.id)],
    ['task', content.tasks.map((t) => `${t.association}/${t.task}`)],
  ] as const) {
    for (const id of duplicates(ids)) problems.push(`duplicate ${kind} id: ${id}`);
  }

  for (const movement of content.movements) {
    for (const a of movement.activations) {
      const where = `movement ${movement.id}, ${a.side} ${a.muscle}`;
      if (!muscles.has(a.muscle)) problems.push(`${where}: unknown muscle`);
      for (const s of a.sources) if (!sources.has(s)) problems.push(`${where}: unknown source ${s}`);
      if (a.confidence !== Confidence.Low && a.sources.length === 0) {
        problems.push(`${where}: ${a.confidence} confidence needs at least one source`);
      }
    }
  }
  for (const drill of content.drills) {
    if (!movements.has(drill.movement)) problems.push(`drill ${drill.id}: unknown movement ${drill.movement}`);
  }
  for (const task of content.tasks) {
    if (!drills.has(task.drill)) problems.push(`task ${task.association}/${task.task}: unknown drill ${task.drill}`);
  }
  for (const exercise of content.exercises) {
    for (const t of exercise.targets) {
      if (!muscles.has(t.muscle)) problems.push(`exercise ${exercise.id}: unknown muscle ${t.muscle}`);
    }
    for (const range of exercise.dosing?.ranges ?? []) {
      for (const s of range.sources) {
        if (!sources.has(s)) problems.push(`exercise ${exercise.id}, dosing ${range.goal}: unknown source ${s}`);
      }
    }
  }
  return problems;
};

/** Fails with every cross-reference problem in already decoded content. */
export const checkContent = (content: Content): Effect.Effect<Content, ContentError> => {
  const problems = findProblems(content);
  return problems.length > 0 ? Effect.fail(new ContentError({ problems })) : Effect.succeed(content);
};

/** Decodes snake_case content, then runs the cross-reference checks. */
export const validateContent = Effect.fn('validateContent')(function* (
  input: unknown,
): Effect.fn.Return<Content, ContentError> {
  const content = yield* decodeContent(input).pipe(
    Effect.mapError((error) => new ContentError({ problems: [error.message] })),
  );
  return yield* checkContent(content);
});

const encode = Schema.encodeEffect(Content);

/** Content in its snake_case JSON form, as written to content.json. */
export const encodeContent = (content: Content): Effect.Effect<unknown, ContentError> =>
  encode(content).pipe(Effect.mapError((error) => new ContentError({ problems: [error.message] })));
