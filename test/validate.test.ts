import { assert, describe, it } from '@effect/vitest';
import { Effect } from 'effect';
import { ContentError, findProblems, validateContent } from '../src/content/validate';
import { activation, contentWith, rawContent } from './fixtures';

const movementWith = (patch: Partial<typeof activation>): typeof rawContent.movements =>
  rawContent.movements.map((m) => ({ ...m, activations: [{ ...activation, ...patch }] }));

describe('findProblems', () => {
  it('finds nothing in valid content', () => {
    assert.deepStrictEqual(findProblems(contentWith({})), []);
  });

  it('flags an unknown muscle in a movement', () => {
    assert.deepStrictEqual(findProblems(contentWith({ movements: movementWith({ muscle: 'biceps' }) })), [
      'movement turn, outside biceps: unknown muscle',
    ]);
  });

  it('flags an unknown muscle in an exercise', () => {
    const exercises = rawContent.exercises.map((e) => ({ ...e, targets: [{ muscle: 'biceps', contraction: 'concentric' }] }));
    assert.deepStrictEqual(findProblems(contentWith({ exercises })), ['exercise split-squat: unknown muscle biceps']);
  });

  it('flags an unknown source', () => {
    assert.deepStrictEqual(findProblems(contentWith({ movements: movementWith({ sources: ['nope'] }) })), [
      'movement turn, outside quadriceps: unknown source nope',
    ]);
  });

  it('requires a source for medium confidence but not for low', () => {
    assert.deepStrictEqual(findProblems(contentWith({ movements: movementWith({ sources: [] }) })), [
      'movement turn, outside quadriceps: medium confidence needs at least one source',
    ]);
    assert.deepStrictEqual(findProblems(contentWith({ movements: movementWith({ sources: [], confidence: 'low' }) })), []);
  });

  it('flags duplicate ids', () => {
    const muscles = [...rawContent.muscles, { id: 'obliques', name: 'Again', region: 'trunk' }];
    const tasks = [...rawContent.tasks, ...rawContent.tasks];
    assert.deepStrictEqual(findProblems(contentWith({ muscles, tasks })), [
      'duplicate muscle id: obliques',
      'duplicate task id: psia/Stork Turns',
    ]);
  });

  it('flags a drill pointing at an unknown movement', () => {
    const drills = rawContent.drills.map((d) => ({ ...d, movement: 'missing' }));
    assert.deepStrictEqual(findProblems(contentWith({ drills })), ['drill stork-turns: unknown movement missing']);
  });

  it('flags a task pointing at an unknown drill', () => {
    const tasks = rawContent.tasks.map((t) => ({ ...t, drill: 'missing' }));
    assert.deepStrictEqual(findProblems(contentWith({ tasks })), ['task psia/Stork Turns: unknown drill missing']);
  });
});

describe('validateContent', () => {
  it.effect('succeeds on valid content', () =>
    Effect.gen(function* () {
      const content = yield* validateContent(rawContent);
      assert.strictEqual(content.exercises.length, 1);
    }),
  );

  it.effect('fails with every cross-reference problem', () =>
    Effect.gen(function* () {
      const error = yield* Effect.flip(validateContent({ ...rawContent, movements: movementWith({ muscle: 'biceps', sources: [] }) }));
      assert.instanceOf(error, ContentError);
      assert.strictEqual(error.problems.length, 2);
    }),
  );

  it.effect('fails on a schema error', () =>
    Effect.gen(function* () {
      const error = yield* Effect.flip(validateContent({ ...rawContent, sources: 'none' }));
      assert.strictEqual(error.problems.length, 1);
    }),
  );
});
