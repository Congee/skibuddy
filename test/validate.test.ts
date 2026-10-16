import { assert, describe, it } from '@effect/vitest';
import { Effect } from 'effect';
import { ContentError, encodeContent, findProblems, validateContent } from '../src/content/validate';
import { activation, contentWith, dofMatrix, rawContent } from './fixtures';

const movementWith = (patch: Record<string, unknown>): ReadonlyArray<unknown> =>
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

  it('checks drill and exercise sources like any citation', () => {
    const drills = rawContent.drills.map((d) => ({ ...d, sources: [{ source: 'book-1', pages: 25 }, 'missing'] }));
    assert.deepStrictEqual(findProblems(contentWith({ drills })), ['drill stork-turns: unknown source missing']);
    const exercises = rawContent.exercises.map((e) => ({ ...e, sources: [{ source: 'study-1', pages: 3 }] }));
    assert.deepStrictEqual(findProblems(contentWith({ exercises })), [
      'exercise split-squat: pages are only for books, not article study-1',
    ]);
  });

  it('flags a drill pointing at an unknown movement', () => {
    const drills = rawContent.drills.map((d) => ({ ...d, movement: 'missing' }));
    assert.deepStrictEqual(findProblems(contentWith({ drills })), ['drill stork-turns: unknown movement missing']);
  });

  it('flags a drill whose settings mix turns and runs with no radius', () => {
    const drills = rawContent.drills.map((d) => ({ ...d, scenarios: { ...d.scenarios, gentle: { speed_mps: 2, slope_deg: 15 } } }));
    assert.deepStrictEqual(findProblems(contentWith({ drills })), ['drill stork-turns: give radius_m at every setting or at none']);
  });

  it('flags a task pointing at an unknown drill', () => {
    const tasks = rawContent.tasks.map((t) => ({ ...t, drill: 'missing' }));
    assert.deepStrictEqual(findProblems(contentWith({ tasks })), ['task psia/Stork Turns: unknown drill missing']);
  });
});

const withMovement = (patch: Record<string, unknown>): ReadonlyArray<unknown> =>
  rawContent.movements.map((m) => ({ ...m, ...patch }));

describe('findProblems: matrix and activations', () => {
  it('flags a missing row, a trunk side on a limb joint and a repeated row', () => {
    const [first, ...rest] = dofMatrix;
    if (first === undefined) throw new Error('empty matrix');
    const dof_matrix = [{ ...first, side: 'trunk' }, ...rest, rest[0]];
    const problems = findProblems(contentWith({ movements: withMovement({ dof_matrix }) }));
    assert.deepStrictEqual(problems.slice(0, 3), [
      'movement turn: row ankle.flexion inside appears twice',
      'movement turn: row ankle.flexion trunk: a limb joint cannot take side trunk',
      'movement turn: missing row ankle.flexion outside',
    ]);
  });

  it('flags a serves entry the matrix cannot resolve', () => {
    const dof_matrix = dofMatrix.filter((r) => !(r.dof === 'knee.flexion' && r.side === 'outside'));
    const problems = findProblems(contentWith({ movements: withMovement({ dof_matrix }) }));
    assert.include(problems, 'movement turn, outside quadriceps: serves knee.flexion but the matrix has no outside row');
  });

  it('resolves a one-sided activation to a shared both row and an axial one to the trunk', () => {
    const dof_matrix = [
      ...dofMatrix.filter((r) => r.dof !== 'knee.flexion'),
      { ...dofMatrix.find((r) => r.dof === 'knee.flexion'), side: 'both' },
    ];
    const activations = [{ ...activation, serves: ['knee.flexion', 'pelvis.tilt'] }];
    assert.deepStrictEqual(findProblems(contentWith({ movements: withMovement({ dof_matrix, activations }) })), []);
  });

  it('needs a null contraction exactly when the muscle is idle', () => {
    const idle = { ...activation, intensity: { initiation: 0, shaping: 2, finish: 3 } };
    const nulled = { ...activation, contraction: { ...activation.contraction, finish: null } };
    assert.deepStrictEqual(findProblems(contentWith({ movements: movementWith(idle) })), [
      'movement turn, outside quadriceps: initiation contraction must be null exactly when intensity is 0',
    ]);
    assert.deepStrictEqual(findProblems(contentWith({ movements: movementWith(nulled) })), [
      'movement turn, outside quadriceps: finish contraction must be null exactly when intensity is 0',
    ]);
  });

  it('applies the null-contraction rule at each setting', () => {
    const gentleIdle = { ...activation, intensity: { ...activation.intensity, initiation: { gentle: 0, moderate: 1, dynamic: 2 } } };
    assert.deepStrictEqual(findProblems(contentWith({ movements: movementWith(gentleIdle) })), [
      'movement turn, outside quadriceps: initiation contraction must be null exactly when intensity is 0 (gentle)',
    ]);
    const matched = {
      ...gentleIdle,
      contraction: { ...activation.contraction, initiation: { gentle: null, moderate: 'eccentric', dynamic: 'concentric' } },
    };
    assert.deepStrictEqual(findProblems(contentWith({ movements: movementWith(matched) })), []);
  });

  it('flags a muscle twice on one side', () => {
    const movements = withMovement({ activations: [activation, activation] });
    assert.deepStrictEqual(findProblems(contentWith({ movements })), ['movement turn: outside quadriceps appears twice']);
  });

  it('flags a group used in an activation, and unknown or nested groups', () => {
    const muscles = [
      ...rawContent.muscles,
      { id: 'vasti', name: 'Vasti', region: 'leg', part_of: 'quadriceps' },
      { id: 'vastus-medialis', name: 'VM', region: 'leg', part_of: 'vasti' },
      { id: 'popliteus', name: 'Popliteus', region: 'leg', part_of: 'knee' },
    ];
    assert.deepStrictEqual(findProblems(contentWith({ muscles })), [
      'muscle vastus-medialis: group vasti is itself part of quadriceps',
      'muscle popliteus: unknown group knee',
      'movement turn, outside quadriceps: is a group; use its parts',
    ]);
  });

  it('needs a shorter short_name, and one for a name with a list in brackets', () => {
    const muscles = [
      ...rawContent.muscles,
      { id: 'vasti', name: 'Vasti (vastus lateralis, medialis and intermedius)', short_name: 'Vasti', region: 'leg' },
      { id: 'calf', name: 'Calf (gastrocnemius and soleus)', region: 'leg' },
      { id: 'popliteus', name: 'Popliteus', short_name: 'Popliteus muscle', region: 'leg' },
    ];
    assert.deepStrictEqual(findProblems(contentWith({ muscles })), [
      'muscle calf: a name with a list in brackets needs a short_name',
      'muscle popliteus: short_name must be shorter than its name',
    ]);
  });

  it('allows pages only on book citations', () => {
    const cited = movementWith({ sources: [{ source: 'book-1', pages: '3-4' }, { source: 'study-1', pages: 2 }] });
    assert.deepStrictEqual(findProblems(contentWith({ movements: cited })), [
      'movement turn, outside quadriceps: pages are only for books, not article study-1',
    ]);
  });

  it('applies the source rule to matrix cells and structures', () => {
    const [first, ...rest] = dofMatrix;
    if (first === undefined) throw new Error('empty matrix');
    const cell = { ...first.cells.initiation, confidence: 'medium' };
    const dof_matrix = [{ ...first, cells: { ...first.cells, shaping: cell } }, ...rest];
    const structures = [
      { structure: 'acl', side: 'outside', phases: ['shaping'], mechanism: 'Twist', protected_by: ['biceps'], confidence: 'medium', sources: [] },
    ];
    assert.deepStrictEqual(findProblems(contentWith({ movements: withMovement({ dof_matrix, structures }) })), [
      'movement turn, ankle.flexion outside shaping: medium confidence needs at least one source',
      'movement turn, outside acl: unknown muscle biceps',
      'movement turn, outside acl: medium confidence needs at least one source',
    ]);
  });
});

const tasksWith = (relation: string, ids: ReadonlyArray<string>): ReadonlyArray<unknown> =>
  rawContent.tasks.map((t) => ({ ...t, fundamentals: { relation, ids: [...ids] } }));

describe('findProblems: primitives, drills and fundamentals', () => {
  it('flags a drill primitive its movement does not show', () => {
    const drills = rawContent.drills.map((d) => ({ ...d, primitives: [{ primitive: 'tip' }, { primitive: 'nope' }] }));
    assert.deepStrictEqual(findProblems(contentWith({ drills })), [
      'drill stork-turns: movement turn does not work every row of primitive tip',
      'drill stork-turns: unknown primitive nope',
    ]);
  });

  it('flags a primitive row on the wrong side for its joint', () => {
    const primitives = [...rawContent.primitives, { id: 'tilt', code: 'P3', name: 'Tilt', summary: 'Tilts', rows: [{ dof: 'pelvis.tilt', side: 'outside' }] }];
    assert.deepStrictEqual(findProblems(contentWith({ primitives })), [
      'primitive tilt: row pelvis.tilt outside has the wrong side for its joint',
    ]);
  });

  it('needs every fundamental for and, at least one for or', () => {
    assert.deepStrictEqual(findProblems(contentWith({ tasks: tasksWith('and', ['bend', 'edge']) })), [
      'task psia/Stork Turns: drill stork-turns does not show fundamental edge',
    ]);
    assert.deepStrictEqual(findProblems(contentWith({ tasks: tasksWith('or', ['bend', 'edge']) })), []);
    assert.deepStrictEqual(findProblems(contentWith({ tasks: tasksWith('or', ['edge']) })), [
      'task psia/Stork Turns: drill stork-turns shows none of edge',
    ]);
    assert.deepStrictEqual(findProblems(contentWith({ tasks: tasksWith('and', ['bend', 'spin']) })), [
      'task psia/Stork Turns: unknown fundamental spin',
    ]);
  });

  it('reads any_of as one of several primitives', () => {
    const drills = rawContent.drills.map((d) => ({ ...d, primitives: [{ primitive: 'knee-bend' }] }));
    const fundamentals = rawContent.fundamentals.map((f) => ({
      ...f,
      fundamentals: [{ id: 'bend', name: 'Bend', requires: [{ any_of: ['tip', 'knee-bend'] }], basis: 'Ours' }],
    }));
    const tasks = rawContent.tasks.map((t) => ({ ...t, fundamentals: { relation: 'and', ids: ['bend'] } }));
    assert.deepStrictEqual(findProblems(contentWith({ drills, fundamentals, tasks })), []);
  });

  it('flags unknown primitives in fundamentals and a task without a fundamentals file', () => {
    const fundamentals = rawContent.fundamentals.map((f) => ({
      ...f,
      fundamentals: [...f.fundamentals, { id: 'spin', name: 'Spin', requires: ['twirl'], basis: 'Ours' }],
    }));
    assert.deepStrictEqual(findProblems(contentWith({ fundamentals })), ['fundamentals psia/spin: unknown primitive twirl']);
    assert.deepStrictEqual(findProblems(contentWith({ fundamentals: [] })), ['task psia/Stork Turns: no fundamentals file for psia']);
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

describe('encodeContent', () => {
  it.effect('writes snake_case keys that validateContent reads back', () =>
    Effect.gen(function* () {
      const encoded = yield* encodeContent(contentWith({}));
      assert.deepStrictEqual(encoded, rawContent);
      const content = yield* validateContent(encoded);
      assert.strictEqual(content.exercises[0]?.matchesOnSnow, 'Knee flexion');
    }),
  );
});
