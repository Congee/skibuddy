import { assert, describe, it } from '@effect/vitest';
import type { Activation, ExerciseTarget, Movement } from '../src/content/schema';
import { Change, previousPhase, rankSlats, sourceKeys } from '../src/ui/board/rank';
import type { RankedSlat } from '../src/ui/board/rank';
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

describe('rankSlats', () => {
  const acts = [act('a', 2, 1, 1), act('b', 1, 3, 2), act('c', 2, 2, 3), act('d', 1, 2, 2)];

  it('orders by load in the phase, then peak, then content order', () => {
    assert.deepStrictEqual(
      rankSlats(acts, 'shaping').map((r) => r.activation.muscle),
      ['b', 'c', 'd', 'a'],
    );
    assert.deepStrictEqual(
      rankSlats(acts, 'initiation').map((r) => r.activation.muscle),
      ['c', 'a', 'b', 'd'],
    );
  });

  it('marks change against the previous phase, wrapping initiation to finish', () => {
    const shaping = new Map<string, Change>(rankSlats(acts, 'shaping').map((r) => [r.activation.muscle, r.change]));
    assert.strictEqual(shaping.get('a'), Change.Down);
    assert.strictEqual(shaping.get('b'), Change.Up);
    assert.strictEqual(shaping.get('c'), Change.Same);
    const initiation = new Map<string, RankedSlat>(rankSlats(acts, 'initiation').map((r) => [r.activation.muscle, r]));
    assert.strictEqual(initiation.get('a')?.change, Change.Up);
    assert.strictEqual(initiation.get('c')?.previousLevel, 3);
    assert.strictEqual(initiation.get('c')?.change, Change.Down);
  });

  it('keeps each slat tied to its content index', () => {
    for (const r of rankSlats(acts, 'finish')) assert.strictEqual(acts[r.index], r.activation);
  });

  it('steps phases backwards cyclically', () => {
    assert.strictEqual(previousPhase('initiation'), 'finish');
    assert.strictEqual(previousPhase('finish'), 'shaping');
  });
});

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
