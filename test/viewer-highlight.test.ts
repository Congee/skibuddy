import { assert, describe, it } from '@effect/vitest';
import { Side } from '../src/content/schema';
import type { AnchorPoint } from '../src/viewer/anchor-projection';
import { chooseView, highlightSlots, markChanges, pointsFor, revealsDeep, segmentDistance, turnAzimuth, visibleShare } from '../src/viewer/highlight';
import type { Occluder } from '../src/viewer/highlight';
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
    assert.deepStrictEqual(highlightSlots(table, { muscle: 'soleus', side: Side.Inside, focus: true }), [table.slotOf('soleus', Side.Inside)]);
    assert.deepStrictEqual(highlightSlots(table, { muscle: 'soleus', side: Side.Both, focus: true }), [
      table.slotOf('soleus', Side.Outside),
      table.slotOf('soleus', Side.Inside),
    ]);
    assert.deepStrictEqual(highlightSlots(table, null), []);
    assert.deepStrictEqual(highlightSlots(table, { muscle: 'unknown', side: Side.Outside, focus: false }), []);
  });

  it('marks a parent with its parts, and a part alone', () => {
    const slots = highlightSlots(table, { muscle: 'quadriceps', side: Side.Outside, focus: true });
    for (const m of ['quadriceps', 'vasti', 'vastus-medialis', 'rectus-femoris']) assert.include(slots, table.slotOf(m, Side.Outside), m);
    assert.notInclude(slots, table.slotOf('calf', Side.Outside));
    assert.deepStrictEqual(highlightSlots(table, { muscle: 'rectus-femoris', side: Side.Outside, focus: true }), [table.slotOf('rectus-femoris', Side.Outside)]);
  });

  it('finds the pins of a parent among its parts', () => {
    const parts = [
      { ...point([0, 0, 1]), muscle: 'soleus' },
      { ...point([0, 0, 1]), muscle: 'gastrocnemius' },
      { ...point([0, 0, 1]), muscle: 'vasti' },
    ];
    assert.deepStrictEqual(
      pointsFor(parts, { muscle: 'calf', side: Side.Outside, focus: true }).map((p) => p.muscle),
      ['soleus', 'gastrocnemius'],
    );
  });

  it('reveals deep muscles on focus only', () => {
    for (const muscle of ['transversus-abdominis', 'multifidus', 'tibialis-posterior', 'popliteus', 'iliopsoas', 'hip-flexors']) {
      assert.isTrue(revealsDeep({ muscle, side: Side.Inside, focus: true }), muscle);
      assert.isFalse(revealsDeep({ muscle, side: Side.Inside, focus: false }), `${muscle} preview`);
    }
    for (const muscle of ['vasti', 'calf', 'obliques']) assert.isFalse(revealsDeep({ muscle, side: Side.Inside, focus: true }), muscle);
    assert.isFalse(revealsDeep(null));
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

const eyeAt = (azimuth: number): readonly [number, number, number] => [4 * Math.sin(azimuth), 0.25, 4 * Math.cos(azimuth)];

describe('view of a focused muscle', () => {
  // Two shins along y at x = ±0.1; the inner face of the left one looks at the right one.
  const legs: ReadonlyArray<Occluder> = [
    { a: [-0.1, 0, 0], b: [-0.1, 0.5, 0], radius: 0.055 },
    { a: [0.1, 0, 0], b: [0.1, 0.5, 0], radius: 0.055 },
  ];
  const inner = point([-1, 0, 0], [0.045, 0.25, 0]);

  it('measures the gap between segments', () => {
    assert.closeTo(segmentDistance([0, 0, 0], [1, 0, 0], [0.5, 1, 0], [0.5, 2, 0]), 1, 1e-9);
    assert.closeTo(segmentDistance([0, 0, 0], [0, 0, 0], [-1, 0.3, 0], [1, 0.3, 0]), 0.3, 1e-9);
  });

  it('counts a point behind the other leg as hidden, and its own leg never hides it', () => {
    assert.strictEqual(visibleShare([inner], [-4, 0.25, 0], legs), 0);
    assert.strictEqual(visibleShare([inner], [-4, 0.25, 4], legs), 1);
    assert.strictEqual(visibleShare([inner], [4, 0.25, 0], legs), 0);
  });

  it('turns past the facing view to one the other leg does not block', () => {
    // Facing the normal straight on (azimuth -π/2) looks through the right leg.
    const view = chooseView([inner], eyeAt, legs, 0.4);
    assert.isTrue(view.seen);
    assert.isNotNull(view.azimuth);
    assert.isAbove(visibleShare([inner], eyeAt(view.azimuth ?? 0), legs), 0.5);
    assert.isAbove(Math.abs(Math.sin(view.azimuth ?? 0) + 1), 0.05);
  });

  it('keeps a view that already shows the muscle', () => {
    assert.deepStrictEqual(chooseView([point([0, 0, 1], [0, 0.25, 0.2])], eyeAt, legs, 0), { azimuth: null, seen: true });
  });

  it('asks for the reveal fade when no view shows the muscle', () => {
    const walled: ReadonlyArray<Occluder> = Array.from({ length: 12 }, (_, k) => {
      const a = (2 * Math.PI * k) / 12;
      return { a: [Math.sin(a) * 0.3, 0, Math.cos(a) * 0.3], b: [Math.sin(a) * 0.3, 0.5, Math.cos(a) * 0.3], radius: 0.12 };
    });
    assert.isFalse(chooseView([point([0, 0, 1], [0, 0.25, 0])], eyeAt, walled, 0).seen);
  });
});
