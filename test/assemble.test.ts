import { assert, describe, it } from '@effect/vitest';
import { Effect } from 'effect';
import { assembleContent } from '../src/content/assemble';
import type { ContentFile } from '../src/content/assemble';

const muscles = `
- { id: quadriceps, name: Quadriceps, region: leg }
`;
const sources = `
- id: study-1
  citation: A study
  url: https://example.org/1
  read: abstract
`;
const movement = `
id: turn
name: Turn
activations:
  - muscle: quadriceps
    side: outside
    intensity: { initiation: 1, shaping: 2, finish: 3 }
    contraction: [eccentric]
    role: Holds the knee
    confidence: medium
    basis: Measured
    sources: [study-1]
joint_actions: []
reviewed_by: []
`;
const drill = `
id: stork-turns
name: Stork turns
movement: turn
summary: Our words
terrain: Easy
reviewed_by: []
`;
const task = (association: string): string => `
association: ${association}
drill: stork-turns
task: Stork Turns
level: 2
category: Individual
fundamentals: []
url: https://example.org/task
reviewed_by: []
`;
const exercise = `
id: split-squat
name: Split squat
targets: [{ muscle: quadriceps, contraction: eccentric }]
single_leg: false
matches_on_snow: Knee flexion
easier: Shallower
harder: Deeper
cautions: []
reviewed_by: []
`;

const files: ReadonlyArray<ContentFile> = [
  { path: 'anatomy/muscles.yaml', text: muscles },
  { path: 'sources.yaml', text: sources },
  { path: 'movements/turn.yaml', text: movement },
  { path: 'drills/stork-turns.yaml', text: drill },
  { path: 'associations/psia/stork-turns.yaml', text: task('psia') },
  { path: 'exercises/split-squat.yaml', text: exercise },
];

const replace = (path: string, text: string): ReadonlyArray<ContentFile> =>
  files.map((f) => (f.path === path ? { path, text } : f));

describe('assembleContent', () => {
  it.effect('assembles every file into content', () =>
    Effect.gen(function* () {
      const content = yield* assembleContent(files);
      assert.strictEqual(content.muscles.length, 1);
      assert.strictEqual(content.movements[0]?.id, 'turn');
      assert.strictEqual(content.drills[0]?.id, 'stork-turns');
      assert.strictEqual(content.tasks[0]?.association, 'psia');
      assert.strictEqual(content.exercises[0]?.id, 'split-squat');
    }),
  );

  it.effect('decodes snake_case keys into camelCase fields', () =>
    Effect.gen(function* () {
      const content = yield* assembleContent(files);
      assert.strictEqual(content.exercises[0]?.matchesOnSnow, 'Knee flexion');
      assert.strictEqual(content.exercises[0]?.singleLeg, false);
      assert.deepStrictEqual(content.movements[0]?.jointActions, []);
      assert.deepStrictEqual(content.drills[0]?.reviewedBy, []);
    }),
  );

  it.effect('rejects a camelCase key', () =>
    Effect.gen(function* () {
      const camel = exercise.replace('matches_on_snow:', 'matchesOnSnow:');
      const error = yield* Effect.flip(assembleContent(replace('exercises/split-squat.yaml', camel)));
      assert.strictEqual(error.problems.length, 1);
      assert.isTrue(error.problems[0]?.startsWith('exercises/split-squat.yaml: '));
      assert.include(error.problems[0], 'matches_on_snow');
    }),
  );

  it.effect('requires the association to match its folder', () =>
    Effect.gen(function* () {
      const error = yield* Effect.flip(assembleContent(replace('associations/psia/stork-turns.yaml', task('csia'))));
      assert.deepStrictEqual(error.problems, [
        'associations/psia/stork-turns.yaml: association csia does not match folder psia',
      ]);
    }),
  );

  it.effect('names the file of every schema and YAML problem', () =>
    Effect.gen(function* () {
      const broken = [...replace('exercises/split-squat.yaml', 'id: ['), { path: 'movements/broken.yaml', text: 'id: turn' }];
      const error = yield* Effect.flip(assembleContent(broken));
      assert.strictEqual(error.problems.length, 2);
      assert.isTrue(error.problems[0]?.startsWith('movements/broken.yaml: '));
      assert.isTrue(error.problems[1]?.startsWith('exercises/split-squat.yaml: '));
    }),
  );

  it.effect('reports a missing required file', () =>
    Effect.gen(function* () {
      const error = yield* Effect.flip(assembleContent(files.filter((f) => f.path !== 'sources.yaml')));
      assert.deepStrictEqual(error.problems, ['sources.yaml: missing']);
    }),
  );

  it.effect('runs cross-reference checks after assembly', () =>
    Effect.gen(function* () {
      const error = yield* Effect.flip(assembleContent(replace('sources.yaml', '[]')));
      assert.deepStrictEqual(error.problems, ['movement turn, outside quadriceps: unknown source study-1']);
    }),
  );
});
