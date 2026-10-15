import { assert, describe, it } from '@effect/vitest';
import { Effect } from 'effect';
import { assembleContent } from '../src/content/assemble';
import type { ContentFile } from '../src/content/assemble';
import { activation, rawContent } from './fixtures';

const muscles = `
- { id: quadriceps, name: Quadriceps, region: leg }
`;
const sources = `
- id: study-1
  type: article
  citation: A study
  url: https://example.org/1
  read: abstract
`;
// JSON is YAML; the matrix is too long to write out.
const movement = JSON.stringify({ ...rawContent.movements[0], activations: [activation] });
const primitives = JSON.stringify(rawContent.primitives);
const fundamentals = JSON.stringify(rawContent.fundamentals[0]);
const drill = `
id: stork-turns
name: Stork turns
movement: turn
summary: Our words
terrain: Easy
scenarios:
  gentle: { speed_mps: 6, radius_m: 10, slope_deg: 8 }
  moderate: { speed_mps: 8, radius_m: 12, slope_deg: 12 }
  dynamic: { speed_mps: 11, radius_m: 14, slope_deg: 18 }
primitives: [{ primitive: knee-bend }]
reviewed_by: []
`;
const task = (association: string): string => `
association: ${association}
drill: stork-turns
task: Stork Turns
level: { label: Level 2, ordinal: 2 }
category: Individual
fundamentals: { relation: and/or, ids: [bend, edge] }
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
  { path: 'primitives.yaml', text: primitives },
  { path: 'fundamentals/psia.yaml', text: fundamentals },
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
      assert.strictEqual(content.movements[0]?.dofMatrix.length, rawContent.movements[0]?.dof_matrix.length);
      assert.deepStrictEqual<unknown>(content.movements[0]?.activations[0]?.contraction, activation.contraction);
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

  it.effect('decodes scenarios to camelCase', () =>
    Effect.gen(function* () {
      const content = yield* assembleContent(files);
      assert.deepStrictEqual(content.drills[0]?.scenarios.dynamic, { speedMps: 11, radiusM: 14, slopeDeg: 18 });
    }),
  );

  it.effect('names the file for a per-setting value out of order', () =>
    Effect.gen(function* () {
      const bad = { ...activation, intensity: { ...activation.intensity, shaping: { gentle: 3, moderate: 2, dynamic: 2 } } };
      const text = JSON.stringify({ ...rawContent.movements[0], activations: [bad] });
      const error = yield* Effect.flip(assembleContent(replace('movements/turn.yaml', text)));
      assert.strictEqual(error.problems.length, 1);
      assert.isTrue(error.problems[0]?.startsWith('movements/turn.yaml: '));
      assert.include(error.problems[0], 'should not fall as intensity rises');
    }),
  );

  it.effect('names the file for a missing scenario', () =>
    Effect.gen(function* () {
      const error = yield* Effect.flip(assembleContent(replace('drills/stork-turns.yaml', drill.replace(/^  dynamic:.*$/m, ''))));
      assert.isTrue(error.problems[0]?.startsWith('drills/stork-turns.yaml: '));
      assert.include(error.problems[0], 'dynamic');
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

  it.effect('requires a fundamentals file to match its name', () =>
    Effect.gen(function* () {
      const error = yield* Effect.flip(assembleContent([...files, { path: 'fundamentals/csia.yaml', text: fundamentals }]));
      assert.deepStrictEqual(error.problems, ['fundamentals/csia.yaml: association psia does not match file name csia']);
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
