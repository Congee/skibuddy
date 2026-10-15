import { assert, describe, it } from '@effect/vitest';
import { matchExercises } from '../src/content/match';
import { activation, contentWith, exercise } from './fixtures';

const content = contentWith({
  movements: [
    {
      id: 'turn',
      name: 'Turn',
      activations: [
        activation,
        { ...activation, muscle: 'gluteus-medius', intensity: { initiation: 1, shaping: 1, finish: 1 }, contraction: ['isometric'] },
      ],
      joint_actions: [],
      reviewed_by: [],
    },
  ],
  exercises: [
    { ...exercise, id: 'iso-squat', name: 'Isometric squat', targets: [{ muscle: 'quadriceps', contraction: 'isometric' }] },
    { ...exercise, id: 'eccentric-squat', name: 'Eccentric squat', targets: [{ muscle: 'quadriceps', contraction: 'eccentric' }] },
    {
      ...exercise,
      id: 'combo',
      name: 'Combo',
      targets: [
        { muscle: 'quadriceps', contraction: 'eccentric' },
        { muscle: 'gluteus-medius', contraction: 'isometric' },
      ],
    },
    { ...exercise, id: 'pallof', name: 'Pallof press', targets: [{ muscle: 'obliques', contraction: 'isometric' }] },
  ],
});

describe('matchExercises', () => {
  const movement = content.movements[0];
  if (movement === undefined) throw new Error('fixture has no movement');
  const matches = matchExercises(movement, content.exercises);

  it('ranks by shared peak intensity, doubled for a matching contraction', () => {
    assert.deepStrictEqual(
      matches.map((m) => [m.exercise.id, m.score]),
      [
        ['combo', 8],
        ['eccentric-squat', 6],
        ['iso-squat', 3],
      ],
    );
  });

  it('drops exercises that share no muscle', () => {
    assert.isFalse(matches.some((m) => m.exercise.id === 'pallof'));
  });

  it('lists the shared muscles', () => {
    assert.deepStrictEqual<ReadonlyArray<string> | undefined>(matches[0]?.muscles, ['quadriceps', 'gluteus-medius']);
  });

  it('breaks score ties by name', () => {
    const squat = content.exercises[1];
    if (squat === undefined) throw new Error('fixture has no squat');
    const tied = matchExercises(movement, [
      { ...squat, name: 'B' },
      { ...squat, name: 'A' },
    ]);
    assert.deepStrictEqual(tied.map((m) => m.exercise.name), ['A', 'B']);
  });
});
