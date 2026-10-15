import { assert, describe, it } from '@effect/vitest';
import { Side } from '../src/content/schema';
import type { AnchorPoint } from '../src/viewer/anchor-projection';
import { highlightSlots, markChanges, turnAzimuth } from '../src/viewer/highlight';
import { makeSlotTable } from '../src/viewer/slots';

const point = (normal: readonly [number, number, number], position: readonly [number, number, number] = [0, 1, 0]): AnchorPoint => ({
  muscle: 'calf',
  side: Side.Outside,
  position,
  normal,
});

describe('figure highlight', () => {
  const table = makeSlotTable(['quadriceps', 'calf']);

  it('marks one side, or both for "both"', () => {
    assert.deepStrictEqual(highlightSlots(table, { muscle: 'calf', side: Side.Inside, focus: true }), [table.slotOf('calf', Side.Inside)]);
    assert.deepStrictEqual(highlightSlots(table, { muscle: 'calf', side: Side.Both, focus: true }), [
      table.slotOf('calf', Side.Outside),
      table.slotOf('calf', Side.Inside),
    ]);
    assert.deepStrictEqual(highlightSlots(table, null), []);
    assert.deepStrictEqual(highlightSlots(table, { muscle: 'unknown', side: Side.Outside, focus: false }), []);
  });

  it('writes only the slots whose mark changed', () => {
    assert.deepStrictEqual(markChanges([1, 2], [2, 3]), [
      [1, 0],
      [3, 1],
    ]);
    assert.deepStrictEqual(markChanges([4], [4]), []);
  });

  it('leaves the camera when the muscle already faces it', () => {
    // Eye on +z, normal toward it.
    assert.isNull(turnAzimuth([point([0, 0, 1])], [0, 1, 5], 0));
  });

  it('turns by the shortest way to face a muscle on the far side', () => {
    const azimuth = turnAzimuth([point([0, 0, -1])], [0, 1, 5], 0.2);
    assert.isNotNull(azimuth);
    assert.closeTo(azimuth ?? 0, Math.PI, 1e-9);
    // A muscle facing -x turns the camera a quarter turn negative, not three quarters positive.
    assert.closeTo(turnAzimuth([point([-1, 0, 0])], [0, 1, 5], 0) ?? 0, -Math.PI / 2, 1e-9);
  });

  it('turns toward the mean of a muscle whose candidates mostly face away', () => {
    const points = [point([0.6, 0, -0.8]), point([-0.6, 0, -0.8]), point([0, 0, 1])];
    assert.closeTo(turnAzimuth(points, [0, 1, 5], 0) ?? 0, Math.PI, 1e-9);
  });

  it('gives no heading for a muscle facing straight up or down', () => {
    assert.isNull(turnAzimuth([point([0, -1, 0])], [0, 5, 0.1], 0));
    assert.isNull(turnAzimuth([], [0, 1, 5], 0));
  });
});
