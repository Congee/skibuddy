import { assert, describe, it } from '@effect/vitest';
import { Side } from '../src/content/schema';
import { BodySide, SEGMENTS, SegmentKind } from '../src/viewer/figure';
import type { Segment } from '../src/viewer/figure';
import type { Vec3 } from '../src/viewer/mat4';
import { fillSlotLevels, makeSlotTable, musclePartAt } from '../src/viewer/slots';

const MUSCLES = [
  'quadriceps',
  'hamstrings',
  'adductors',
  'gluteus-maximus',
  'gluteus-medius',
  'deep-hip-rotators',
  'hip-flexors',
  'tibialis-anterior',
  'calf',
  'peroneals',
  'obliques',
  'erector-spinae',
];

const segment = (kind: SegmentKind, side: BodySide): Segment => {
  const s = SEGMENTS.find((x) => x.kind === kind && x.side === side);
  if (s === undefined) throw new Error(`no ${side} ${kind}`);
  return s;
};

/** A point on the segment surface at `angle` around its long axis (0 = front, +z). */
const around = (s: Segment, angle: number, dy = 0, r = 0.06): Vec3 => [
  s.shape.center[0] + r * Math.sin(angle),
  s.shape.center[1] + dy,
  s.shape.center[2] + r * Math.cos(angle),
];

describe('musclePartAt', () => {
  const rightThigh = segment(SegmentKind.Thigh, BodySide.Right);
  const leftThigh = segment(SegmentKind.Thigh, BodySide.Left);

  it('splits the thigh into front, back and inner muscles', () => {
    assert.deepStrictEqual(musclePartAt(rightThigh, around(rightThigh, 0)), { muscle: 'quadriceps', side: Side.Outside });
    assert.deepStrictEqual(musclePartAt(rightThigh, around(rightThigh, Math.PI)), { muscle: 'hamstrings', side: Side.Outside });
    // The right thigh's inner face points to +x.
    assert.deepStrictEqual(musclePartAt(rightThigh, around(rightThigh, Math.PI / 2)), { muscle: 'adductors', side: Side.Outside });
    assert.deepStrictEqual(musclePartAt(leftThigh, around(leftThigh, -Math.PI / 2)), { muscle: 'adductors', side: Side.Inside });
  });

  it('maps the left leg to the inside of the turn', () => {
    assert.strictEqual(musclePartAt(leftThigh, around(leftThigh, 0))?.side, Side.Inside);
  });

  it('splits centre segments by the side of the body', () => {
    const trunk = segment(SegmentKind.Trunk, BodySide.Center);
    assert.deepStrictEqual(musclePartAt(trunk, around(trunk, Math.PI + 0.2, 0, 0.14)), { muscle: 'erector-spinae', side: Side.Outside });
    assert.deepStrictEqual(musclePartAt(trunk, around(trunk, Math.PI - 0.2, 0, 0.14)), { muscle: 'erector-spinae', side: Side.Inside });
  });

  it('leaves non-muscle segments unmapped', () => {
    const head = segment(SegmentKind.Head, BodySide.Center);
    assert.isNull(musclePartAt(head, around(head, 0)));
    const ski = segment(SegmentKind.Ski, BodySide.Right);
    assert.isNull(musclePartAt(ski, ski.shape.center));
  });

  it('places every content muscle somewhere on both sides', () => {
    const found = new Set<string>();
    for (const s of SEGMENTS) {
      for (let a = 0; a < 32; a++) {
        for (const dy of [-0.2, -0.1, -0.05, 0, 0.05, 0.1, 0.2]) {
          const radius = s.shape.type === 'capsule' ? s.shape.radius : s.shape.size[0] / 2;
          const part = musclePartAt(s, around(s, (a / 32) * 2 * Math.PI, dy, radius));
          if (part !== null) found.add(`${part.side}:${part.muscle}`);
        }
      }
    }
    for (const muscle of MUSCLES) {
      assert.isTrue(found.has(`outside:${muscle}`), `outside ${muscle}`);
      assert.isTrue(found.has(`inside:${muscle}`), `inside ${muscle}`);
    }
  });
});

describe('slot table', () => {
  const table = makeSlotTable(MUSCLES);

  it('gives each (muscle, side) its own non-zero slot', () => {
    const slots = MUSCLES.flatMap((m) => [table.slotOf(m, Side.Outside), table.slotOf(m, Side.Inside)]);
    assert.strictEqual(new Set(slots).size, MUSCLES.length * 2);
    assert.isFalse(slots.includes(0));
    assert.strictEqual(table.size, MUSCLES.length * 2 + 1);
    assert.isTrue(slots.every((s) => s < table.size));
  });

  it('returns slot 0 for unknown muscles', () => {
    assert.strictEqual(table.slotOf('biceps', Side.Outside), 0);
  });

  it('fills levels per side and lights both sides for "both"', () => {
    const out = Array.from({ length: table.size }, () => 0.9);
    fillSlotLevels(
      table,
      [
        { muscle: 'quadriceps', side: Side.Outside, level: 0.5 },
        { muscle: 'obliques', side: Side.Both, level: 0.25 },
      ],
      out,
    );
    assert.strictEqual(out[table.slotOf('quadriceps', Side.Outside)], 0.5);
    assert.strictEqual(out[table.slotOf('quadriceps', Side.Inside)], 0);
    assert.strictEqual(out[table.slotOf('obliques', Side.Outside)], 0.25);
    assert.strictEqual(out[table.slotOf('obliques', Side.Inside)], 0.25);
    assert.strictEqual(out[0], 0);
  });
});
