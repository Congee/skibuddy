import { assert, describe, it } from '@effect/vitest';
import { Effort, effortAt, effortColour, effortWord, hexRgb, steadyOrder } from '../src/content/effort';
import type { EffortRamp } from '../src/content/effort';
import type { Activation, PhaseIntensity } from '../src/content/schema';

const intensity = (initiation: number, shaping: number, finish: number): PhaseIntensity =>
  ({ initiation, shaping, finish }) as PhaseIntensity;

describe('effortAt', () => {
  const v = intensity(1, 2, 3);

  it('hits each phase value at its centre', () => {
    assert.closeTo(effortAt(v, 1 / 6), 1, 1e-9);
    assert.closeTo(effortAt(v, 1 / 2), 2, 1e-9);
    assert.closeTo(effortAt(v, 5 / 6), 3, 1e-9);
  });

  it('blends with smoothstep between centres', () => {
    assert.closeTo(effortAt(v, 1 / 3), 1.5, 1e-9);
    // u = 0.25 → smoothstep 0.15625
    assert.closeTo(effortAt(v, 1 / 6 + 1 / 12), 1.15625, 1e-9);
  });

  it('wraps from finish back to initiation', () => {
    assert.closeTo(effortAt(v, 0), 2, 1e-9);
    assert.closeTo(effortAt(v, 1), effortAt(v, 0), 1e-9);
    assert.closeTo(effortAt(v, -0.25), effortAt(v, 0.75), 1e-9);
    assert.closeTo(effortAt(v, 1.4), effortAt(v, 0.4), 1e-9);
  });

  it('stays within the phase values and is continuous', () => {
    const steps = 600;
    for (let i = 0; i < steps; i++) {
      const a = effortAt(v, i / steps);
      assert.isAtLeast(a, 1 - 1e-9);
      assert.isAtMost(a, 3 + 1e-9);
      assert.isBelow(Math.abs(effortAt(v, (i + 1) / steps) - a), 0.03);
    }
  });

  it('is flat for a constant activation', () => {
    for (const t of [0, 0.2, 0.5, 0.9]) assert.strictEqual(effortAt(intensity(2, 2, 2), t), 2);
  });
});

describe('effortWord', () => {
  it('splits the scale at 0.5, 1.5 and 2.5', () => {
    assert.strictEqual(effortWord(0), Effort.Resting);
    assert.strictEqual(effortWord(0.49), Effort.Resting);
    assert.strictEqual(effortWord(0.5), Effort.Light);
    assert.strictEqual(effortWord(1.49), Effort.Light);
    assert.strictEqual(effortWord(1.5), Effort.Working);
    assert.strictEqual(effortWord(2.49), Effort.Working);
    assert.strictEqual(effortWord(2.5), Effort.Hard);
    assert.strictEqual(effortWord(3), Effort.Hard);
  });
});

describe('effortColour', () => {
  const ramp: EffortRamp = [
    [0, 0, 0],
    [100, 0, 0],
    [100, 200, 0],
    [0, 0, 255],
  ];

  it('lands on each ramp stop at whole values', () => {
    assert.strictEqual(effortColour(0, ramp), 'rgb(0, 0, 0)');
    assert.strictEqual(effortColour(1, ramp), 'rgb(100, 0, 0)');
    assert.strictEqual(effortColour(2, ramp), 'rgb(100, 200, 0)');
    assert.strictEqual(effortColour(3, ramp), 'rgb(0, 0, 255)');
  });

  it('interpolates between neighbours', () => {
    assert.strictEqual(effortColour(0.5, ramp), 'rgb(50, 0, 0)');
    assert.strictEqual(effortColour(1.25, ramp), 'rgb(100, 50, 0)');
    assert.strictEqual(effortColour(2.5, ramp), 'rgb(50, 100, 128)');
  });

  it('clamps outside 0..3', () => {
    assert.strictEqual(effortColour(-1, ramp), 'rgb(0, 0, 0)');
    assert.strictEqual(effortColour(4, ramp), 'rgb(0, 0, 255)');
  });
});

describe('hexRgb', () => {
  it('parses long and short hex', () => {
    assert.deepStrictEqual(hexRgb('#F2B33D'), [242, 179, 61]);
    assert.deepStrictEqual(hexRgb(' #fff '), [255, 255, 255]);
  });

  it('rejects other colour syntax', () => {
    assert.isUndefined(hexRgb('rgb(1, 2, 3)'));
    assert.isUndefined(hexRgb(''));
  });
});

const act = (muscle: string, i: number, s: number, f: number): Activation =>
  ({ muscle, side: 'outside', intensity: intensity(i, s, f) }) as unknown as Activation;

describe('steadyOrder', () => {
  const acts = [act('a', 2, 1, 1), act('b', 1, 3, 2), act('c', 2, 2, 3), act('d', 1, 2, 2), act('e', 2, 2, 1)];

  it('orders by peak, then sum, then content order', () => {
    assert.deepStrictEqual(
      steadyOrder(acts).map((a) => a.muscle),
      ['c', 'b', 'd', 'e', 'a'],
    );
  });

  it('keeps the original activations and leaves the input alone', () => {
    const order = steadyOrder(acts);
    for (const a of order) assert.isTrue(acts.includes(a));
    assert.deepStrictEqual(
      acts.map((a) => a.muscle),
      ['a', 'b', 'c', 'd', 'e'],
    );
  });
});
