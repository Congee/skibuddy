import { assert, describe, it } from '@effect/vitest';
import type { Activation } from '../src/content/schema';
import { rankSlats } from '../src/ui/board/rank';
import { pinInputs } from '../src/ui/figure/pin-inputs';
import { Column, layoutPins } from '../src/ui/figure/pin-layout';
import type { PinBox, PinInput } from '../src/ui/figure/pin-layout';
import type { MuscleAnchor } from '../src/viewer/anchors';

const box: PinBox = { width: 600, height: 400, labelWidth: 150, labelHeight: 30, gap: 10, pad: 10, maxPins: 10 };
const pin = (key: string, x: number, y: number, priority = 1): PinInput => ({ key, x, y, priority });

const overlaps = (ys: ReadonlyArray<number>, h: number): boolean => {
  const sorted = ys.toSorted((a, b) => a - b);
  return sorted.some((y, i) => i > 0 && y < (sorted[i - 1] ?? 0) + h);
};

describe('layoutPins', () => {
  it('puts pins in the column on their side and near their anchor', () => {
    const placed = layoutPins([pin('l', 200, 100), pin('r', 400, 300)], box);
    const l = placed.find((p) => p.key === 'l');
    const r = placed.find((p) => p.key === 'r');
    assert.strictEqual(l?.column, Column.Left);
    assert.strictEqual(l?.x, 10);
    assert.strictEqual(l?.y, 85);
    assert.strictEqual(r?.column, Column.Right);
    assert.strictEqual(r?.x, 600 - 10 - 150);
  });

  it('stacks crowded pins without overlap and inside the box', () => {
    const placed = layoutPins([1, 2, 3, 4, 5].map((i) => pin(`p${i}`, 250, 380 + i)), box);
    for (const column of [Column.Left, Column.Right]) {
      assert.isFalse(overlaps(placed.filter((p) => p.column === column).map((p) => p.y), 30));
    }
    for (const y of placed.map((p) => p.y)) {
      assert.isAtLeast(y, 10);
      assert.isAtMost(y + 30, 390);
    }
  });

  it('keeps anchor order top to bottom within a column', () => {
    const placed = layoutPins([pin('low', 100, 300), pin('high', 100, 290), pin('mid', 100, 295)], { ...box, width: 2000 });
    const left = placed.filter((p) => p.column === Column.Left);
    assert.deepStrictEqual(
      left.toSorted((a, b) => a.y - b.y).map((p) => p.key),
      left.toSorted((a, b) => a.anchorY - b.anchorY).map((p) => p.key),
    );
  });

  it('balances a crowded side across both columns', () => {
    const placed = layoutPins([1, 2, 3, 4].map((i) => pin(`p${i}`, 100, 50 * i)), box);
    assert.strictEqual(placed.filter((p) => p.column === Column.Left).length, 2);
    assert.strictEqual(placed.filter((p) => p.column === Column.Right).length, 2);
  });

  it('overflows to the other column, then drops the lowest priority', () => {
    const tight: PinBox = { ...box, height: 100 };
    // Capacity is two per column.
    const placed = layoutPins([1, 2, 3, 4, 5].map((i) => pin(`p${i}`, 100, 50, i)), tight);
    assert.strictEqual(placed.length, 4);
    assert.isUndefined(placed.find((p) => p.key === 'p1'));
    assert.strictEqual(placed.filter((p) => p.column === Column.Right).length, 2);
  });

  it('stacks measured labels by their own heights', () => {
    const tall = (key: string, y: number): PinInput => ({ ...pin(key, 100, y), height: 64 });
    const placed = layoutPins([tall('a', 200), pin('b', 100, 205), tall('c', 210), tall('d', 215)], box);
    assert.deepStrictEqual(placed.map((p) => [p.key, p.height]).toSorted(), [['a', 64], ['b', 30], ['c', 64], ['d', 64]]);
    for (const column of [Column.Left, Column.Right]) {
      const sorted = placed.filter((p) => p.column === column).toSorted((a, b) => a.y - b.y);
      sorted.forEach((p, i) => {
        const next = sorted[i + 1];
        if (next !== undefined) assert.isAtLeast(next.y, p.y + p.height + box.gap);
      });
    }
  });

  it('fits a column by measured heights, not the estimate', () => {
    const tight: PinBox = { ...box, height: 200 };
    // Two 80px labels fill a column of 180px usable height.
    const placed = layoutPins([1, 2, 3, 4, 5].map((i): PinInput => ({ key: `p${i}`, x: 100, y: 50, priority: i, height: 80 })), tight);
    assert.strictEqual(placed.length, 4);
    assert.isUndefined(placed.find((p) => p.key === 'p1'));
    for (const p of placed) assert.isAtMost(p.y + p.height, 190);
  });

  it('honours maxPins by priority', () => {
    const placed = layoutPins([pin('a', 1, 1, 1), pin('b', 1, 1, 3), pin('c', 1, 1, 2)], { ...box, maxPins: 2 });
    assert.deepStrictEqual(placed.map((p) => p.key).toSorted(), ['b', 'c']);
  });
});

const act = (muscle: string, side: string, shaping: number): Activation =>
  ({
    muscle,
    side,
    intensity: { initiation: 1, shaping, finish: 1 },
    contraction: ['isometric'],
    role: 'r',
    confidence: 'low',
    basis: 'b',
    sources: [],
  }) as unknown as Activation;
const anchor = (muscle: string, side: 'outside' | 'inside', visible = true): MuscleAnchor => ({ muscle, side, x: 5, y: 6, visible });

describe('pinInputs', () => {
  it('pins working muscles with a visible anchor on the matching side', () => {
    const ranked = rankSlats(
      [act('quads', 'outside', 3), act('calf', 'inside', 2), act('core', 'both', 1), act('idle', 'outside', 0), act('hidden', 'outside', 2)],
      'shaping',
    );
    const anchors = [anchor('quads', 'outside'), anchor('calf', 'outside'), anchor('core', 'inside'), anchor('idle', 'outside'), anchor('hidden', 'outside', false)];
    const keys = pinInputs(ranked, anchors).map((p) => p.key);
    assert.deepStrictEqual(keys, ['quads:outside', 'core:both']);
  });

  it('carries measured label heights', () => {
    const ranked = rankSlats([act('a', 'outside', 2), act('b', 'outside', 2)], 'shaping');
    const inputs = pinInputs(ranked, [anchor('a', 'outside'), anchor('b', 'outside')], new Map([['a:outside', 52]]));
    assert.strictEqual(inputs.find((p) => p.key === 'a:outside')?.height, 52);
    assert.isUndefined(inputs.find((p) => p.key === 'b:outside')?.height);
  });

  it('gives higher-ranked slats higher priority', () => {
    const ranked = rankSlats([act('a', 'outside', 1), act('b', 'outside', 3)], 'shaping');
    const inputs = pinInputs(ranked, [anchor('a', 'outside'), anchor('b', 'outside')]);
    assert.isAbove(inputs.find((p) => p.key === 'b:outside')?.priority ?? 0, inputs.find((p) => p.key === 'a:outside')?.priority ?? 0);
  });
});
