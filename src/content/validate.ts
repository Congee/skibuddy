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
  const problems: Array<string> = [];

  for (const [kind, ids] of [
    ['muscle', content.muscles.map((m) => m.id)],
    ['movement', content.movements.map((m) => m.id)],
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
  for (const task of content.tasks) {
    if (!movements.has(task.movement)) problems.push(`task ${task.association}/${task.task}: unknown movement ${task.movement}`);
  }
  for (const exercise of content.exercises) {
    for (const t of exercise.targets) {
      if (!muscles.has(t.muscle)) problems.push(`exercise ${exercise.id}: unknown muscle ${t.muscle}`);
    }
  }
  return problems;
};

export const validateContent = Effect.fn('validateContent')(function* (
  input: unknown,
): Effect.fn.Return<Content, ContentError> {
  const content = yield* decodeContent(input).pipe(
    Effect.mapError((error) => new ContentError({ problems: [error.message] })),
  );
  const problems = findProblems(content);
  if (problems.length > 0) return yield* new ContentError({ problems });
  return content;
});
