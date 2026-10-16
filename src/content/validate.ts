import { Effect, Schema } from 'effect';
import { matrixProblems, servedRows, shows, taskFundamentalsProblem } from './matrix';
import {
  citedPages,
  citedSource,
  Confidence,
  Content,
  contractionAt,
  DOFS,
  INTENSITIES,
  isAxial,
  isTurnScenario,
  levelAt,
  MatrixSide,
  PHASES,
  SourceType,
} from './schema';
import type { Citation } from './schema';

export class ContentError extends Schema.TaggedError<ContentError>()('ContentError', {
  problems: Schema.Array(Schema.String),
}) {}

const decodeContent = Schema.decodeUnknownEffect(Content);

const duplicates = (ids: ReadonlyArray<string>): ReadonlyArray<string> =>
  ids.filter((id, i) => ids.indexOf(id) !== i);

/** Cross-reference checks the schema alone cannot express. */
export const findProblems = (content: Content): ReadonlyArray<string> => {
  const muscles = new Map(content.muscles.map((m) => [m.id as string, m]));
  const groups = new Set<string>(content.muscles.flatMap((m) => (m.partOf === undefined ? [] : [m.partOf])));
  const movements = new Map(content.movements.map((m) => [m.id as string, m]));
  const sources = new Map(content.sources.map((s) => [s.id as string, s]));
  const primitives = new Map(content.primitives.map((p) => [p.id as string, p]));
  const drills = new Map(content.drills.map((d) => [d.id as string, d]));
  const problems: Array<string> = [];

  for (const [kind, ids] of [
    ['muscle', content.muscles.map((m) => m.id)],
    ['movement', content.movements.map((m) => m.id)],
    ['primitive', content.primitives.map((p) => p.id)],
    ['primitive code', content.primitives.map((p) => p.code)],
    ['drill', content.drills.map((d) => d.id)],
    ['exercise', content.exercises.map((e) => e.id)],
    ['source', content.sources.map((s) => s.id)],
    ['fundamentals file', content.fundamentals.map((f) => f.association)],
    ['task', content.tasks.map((t) => `${t.association}/${t.task}`)],
  ] as const) {
    for (const id of duplicates(ids)) problems.push(`duplicate ${kind} id: ${id}`);
  }

  const cite = (where: string, citations: ReadonlyArray<Citation>, confidence?: Confidence): void => {
    for (const c of citations) {
      const source = sources.get(citedSource(c));
      if (source === undefined) problems.push(`${where}: unknown source ${citedSource(c)}`);
      else if (citedPages(c) !== undefined && source.type !== SourceType.Book) {
        problems.push(`${where}: pages are only for books, not ${source.type} ${source.id}`);
      }
    }
    if (confidence !== undefined && confidence !== Confidence.Low && citations.length === 0) {
      problems.push(`${where}: ${confidence} confidence needs at least one source`);
    }
  };
  const knownMuscle = (where: string, id: string): void => {
    if (!muscles.has(id)) problems.push(`${where}: unknown muscle ${id}`);
  };

  for (const m of content.muscles) {
    if (m.shortName !== undefined && m.shortName.length >= m.name.length) problems.push(`muscle ${m.id}: short_name must be shorter than its name`);
    if (m.shortName === undefined && m.name.includes('(')) problems.push(`muscle ${m.id}: a name with a list in brackets needs a short_name`);
    if (m.partOf === undefined) continue;
    const parent = muscles.get(m.partOf);
    if (parent === undefined) problems.push(`muscle ${m.id}: unknown group ${m.partOf}`);
    else if (parent.partOf !== undefined) problems.push(`muscle ${m.id}: group ${m.partOf} is itself part of ${parent.partOf}`);
  }

  for (const movement of content.movements) {
    for (const p of matrixProblems(movement.dofMatrix, DOFS)) problems.push(`movement ${movement.id}: ${p}`);
    for (const row of movement.dofMatrix) {
      for (const phase of PHASES) {
        const cell = row.cells[phase];
        cite(`movement ${movement.id}, ${row.dof} ${row.side} ${phase}`, cell.sources, cell.confidence);
      }
    }
    const pairs = movement.activations.map((a) => `${a.side} ${a.muscle}`);
    for (const pair of duplicates(pairs)) problems.push(`movement ${movement.id}: ${pair} appears twice`);
    for (const a of movement.activations) {
      const where = `movement ${movement.id}, ${a.side} ${a.muscle}`;
      if (!muscles.has(a.muscle)) problems.push(`${where}: unknown muscle`);
      else if (groups.has(a.muscle)) problems.push(`${where}: is a group; use its parts`);
      cite(where, a.sources, a.confidence);
      for (const dof of a.serves) {
        if (servedRows(movement, a, dof).length === 0) problems.push(`${where}: serves ${dof} but the matrix has no ${a.side} row`);
      }
      for (const phase of PHASES) {
        const bad = INTENSITIES.filter(
          (i) => (levelAt(a.intensity[phase], i) === 0) !== (contractionAt(a.contraction[phase], i) === null),
        );
        if (bad.length === INTENSITIES.length) {
          problems.push(`${where}: ${phase} contraction must be null exactly when intensity is 0`);
        } else if (bad.length > 0) {
          problems.push(`${where}: ${phase} contraction must be null exactly when intensity is 0 (${bad.join(', ')})`);
        }
      }
    }
    for (const load of movement.structures ?? []) {
      const where = `movement ${movement.id}, ${load.side} ${load.structure}`;
      for (const id of load.protectedBy) knownMuscle(where, id);
      cite(where, load.sources, load.confidence);
    }
  }

  for (const p of content.primitives) {
    for (const ref of p.rows) {
      if (isAxial(ref.dof) !== (ref.side === MatrixSide.Trunk)) {
        problems.push(`primitive ${p.id}: row ${ref.dof} ${ref.side} has the wrong side for its joint`);
      }
    }
  }

  for (const drill of content.drills) {
    const movement = movements.get(drill.movement);
    if (movement === undefined) problems.push(`drill ${drill.id}: unknown movement ${drill.movement}`);
    cite(`drill ${drill.id}`, drill.sources ?? []);
    const turns = INTENSITIES.filter((i) => isTurnScenario(drill.scenarios[i]));
    if (turns.length > 0 && turns.length < INTENSITIES.length) {
      problems.push(`drill ${drill.id}: give radius_m at every setting or at none`);
    }
    for (const id of duplicates(drill.primitives.map((p) => p.primitive))) problems.push(`drill ${drill.id}: primitive ${id} appears twice`);
    for (const { primitive: id } of drill.primitives) {
      const primitive = primitives.get(id);
      if (primitive === undefined) problems.push(`drill ${drill.id}: unknown primitive ${id}`);
      else if (movement !== undefined && !shows(movement, primitive)) {
        problems.push(`drill ${drill.id}: movement ${movement.id} does not work every row of primitive ${id}`);
      }
    }
  }

  for (const file of content.fundamentals) {
    for (const id of duplicates(file.fundamentals.map((f) => f.id))) problems.push(`fundamentals ${file.association}: duplicate ${id}`);
    for (const f of file.fundamentals) {
      for (const r of f.requires) {
        for (const id of typeof r === 'string' ? [r] : r.anyOf) {
          if (!primitives.has(id)) problems.push(`fundamentals ${file.association}/${f.id}: unknown primitive ${id}`);
        }
      }
    }
  }

  for (const task of content.tasks) {
    const where = `task ${task.association}/${task.task}`;
    const drill = drills.get(task.drill);
    if (drill === undefined) {
      problems.push(`${where}: unknown drill ${task.drill}`);
      continue;
    }
    const file = content.fundamentals.find((f) => f.association === task.association);
    const problem = taskFundamentalsProblem(task, drill, file);
    if (problem !== undefined) problems.push(`${where}: ${problem}`);
  }

  for (const exercise of content.exercises) {
    for (const t of exercise.targets) knownMuscle(`exercise ${exercise.id}`, t.muscle);
    cite(`exercise ${exercise.id}`, exercise.sources ?? []);
    for (const range of exercise.dosing?.ranges ?? []) cite(`exercise ${exercise.id}, dosing ${range.goal}`, range.sources);
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
