import { assert, describe, it } from '@effect/vitest';
import type { Activation, ExerciseTarget, Movement } from '../src/content/schema';
import { sourceKeys } from '../src/ui/board/source-keys';
import { TargetFit, targetMatch } from '../src/ui/gym/fit';

const act = (muscle: string, i: number, s: number, f: number, extra: Partial<Record<string, unknown>> = {}): Activation =>
  ({
    muscle,
    side: 'outside',
    intensity: { initiation: i, shaping: s, finish: f },
    contraction: ['isometric'],
    role: 'r',
    confidence: 'medium',
    basis: 'b',
    sources: [],
    ...extra,
  }) as unknown as Activation;

const movement = (activations: ReadonlyArray<Activation>): Movement =>
  ({ id: 'm', name: 'M', activations, jointActions: [], reviewedBy: [] }) as unknown as Movement;

const target = (muscle: string, contraction: string): ExerciseTarget => ({ muscle, contraction }) as unknown as ExerciseTarget;

describe('sourceKeys', () => {
  it('numbers sources by first citation', () => {
    const keys = sourceKeys(
      movement([act('a', 1, 1, 1, { sources: ['x', 'y'] }), act('b', 1, 1, 1, { sources: ['z', 'x'] })]),
    );
    assert.deepStrictEqual([...keys], [
      ['x', 1],
      ['y', 2],
      ['z', 3],
    ]);
  });
});

describe('targetMatch', () => {
  const m = movement([
    act('quadriceps', 1, 1, 1, { contraction: ['eccentric', 'isometric'] }),
    act('quadriceps', 1, 1, 1, { side: 'inside', contraction: ['concentric'] }),
  ]);

  it('matches the same muscle and contraction on any side', () => {
    assert.strictEqual(targetMatch(m, target('quadriceps', 'concentric')).fit, TargetFit.Same);
  });

  it('flags a different contraction with what the drill does', () => {
    const r = targetMatch(movement([act('hamstrings', 1, 1, 1)]), target('hamstrings', 'eccentric'));
    assert.strictEqual(r.fit, TargetFit.OtherContraction);
    assert.deepStrictEqual(r.drillContractions, ['isometric']);
  });

  it('flags muscles the drill does not use', () => {
    assert.strictEqual(targetMatch(m, target('obliques', 'isometric')).fit, TargetFit.NotInDrill);
  });
});
