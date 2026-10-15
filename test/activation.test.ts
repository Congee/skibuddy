import { assert, describe, it } from '@effect/vitest';
import { intensityAt, levelsAt } from '../src/content/activation';
import { contentWith } from './fixtures';

const movement = contentWith({}).movements[0];
const activation = movement?.activations[0];

describe('intensityAt', () => {
  if (movement === undefined || activation === undefined) throw new Error('fixture has no activation');

  it('hits each phase value exactly at the phase centre', () => {
    assert.closeTo(intensityAt(activation, 1 / 6), 1 / 3, 1e-9);
    assert.closeTo(intensityAt(activation, 3 / 6), 2 / 3, 1e-9);
    assert.closeTo(intensityAt(activation, 5 / 6), 1, 1e-9);
  });

  it('blends finish back into initiation across the wrap', () => {
    assert.closeTo(intensityAt(activation, 0), 2 / 3, 1e-9);
    assert.closeTo(intensityAt(activation, 1), intensityAt(activation, 0), 1e-9);
    assert.closeTo(intensityAt(activation, 1.25), intensityAt(activation, 0.25), 1e-9);
    assert.closeTo(intensityAt(activation, -0.25), intensityAt(activation, 0.75), 1e-9);
  });

  it('is continuous through the turn', () => {
    const steps = 600;
    for (let i = 0; i < steps; i++) {
      const jump = Math.abs(intensityAt(activation, (i + 1) / steps) - intensityAt(activation, i / steps));
      assert.isBelow(jump, 0.02);
    }
  });

  it('stays within 0..1', () => {
    for (let i = 0; i <= 100; i++) {
      const v = intensityAt(activation, i / 100);
      assert.isAtLeast(v, 0);
      assert.isAtMost(v, 1);
    }
  });

  it('levelsAt returns one level per activation', () => {
    assert.deepStrictEqual(levelsAt(movement, 1 / 6), [{ muscle: activation.muscle, side: 'outside', level: intensityAt(activation, 1 / 6) }]);
  });
});
