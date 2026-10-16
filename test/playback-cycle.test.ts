import { assert, describe, it } from '@effect/vitest';
import { TurnDirection, cycleOf, turnAt } from '../src/state/playback';

describe('two-turn cycle', () => {
  it('puts the left turn in the first half and the right turn in the second', () => {
    assert.strictEqual(cycleOf(TurnDirection.Left, 0), 0);
    assert.strictEqual(cycleOf(TurnDirection.Left, 0.5), 0.25);
    assert.strictEqual(cycleOf(TurnDirection.Right, 0), 0.5);
    assert.strictEqual(cycleOf(TurnDirection.Right, 0.5), 0.75);
  });

  it('maps a cycle position back to the turn and its time', () => {
    assert.deepStrictEqual(turnAt(0.25), { direction: TurnDirection.Left, t: 0.5 });
    assert.deepStrictEqual(turnAt(0.5), { direction: TurnDirection.Right, t: 0 });
    assert.deepStrictEqual(turnAt(0.75), { direction: TurnDirection.Right, t: 0.5 });
  });

  it('wraps past either end', () => {
    assert.deepStrictEqual(turnAt(1), { direction: TurnDirection.Left, t: 0 });
    assert.deepStrictEqual(turnAt(1.25), { direction: TurnDirection.Left, t: 0.5 });
    assert.deepStrictEqual(turnAt(-0.25), { direction: TurnDirection.Right, t: 0.5 });
  });

  it('round-trips', () => {
    for (const direction of [TurnDirection.Left, TurnDirection.Right]) {
      for (const t of [0, 0.1, 0.333, 0.5, 0.9, 0.999]) {
        const back = turnAt(cycleOf(direction, t));
        assert.strictEqual(back.direction, direction);
        assert.closeTo(back.t, t, 1e-12);
      }
    }
  });

  it('runs left, right, left as the cycle advances', () => {
    const seen = [0.1, 0.4, 0.6, 0.9, 1.1].map((c) => turnAt(c).direction);
    assert.deepStrictEqual(seen, [TurnDirection.Left, TurnDirection.Left, TurnDirection.Right, TurnDirection.Right, TurnDirection.Left]);
  });
});
