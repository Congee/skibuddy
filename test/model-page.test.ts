import { assert, describe, it } from '@effect/vitest';
import { failsUntil } from './legacy';
import { INTENSITIES, Intensity, Side } from '../src/content/schema';
import type { Activation } from '../src/content/schema';
import { TurnKind } from '../src/physics/task';
import { KIND_DRILL, frameIndex, quatOfRows, solvedAt } from '../src/prototypes/model/adapter';
import { figureWorlds } from '../scripts/capture/gate-body';
import { qTable } from '../src/viewer/motion/q-table';
import { effortLevelsAt, effortNote, effortStrips } from '../src/prototypes/model/effort-strips';
import { encodeEffort, encodeModes } from '../src/viewer/motion/effort-table';
import type { EffortCell, EffortTables } from '../src/viewer/motion/effort-table';

const rotY = (a: number): number[] => [Math.cos(a), 0, Math.sin(a), 0, 1, 0, -Math.sin(a), 0, Math.cos(a)];

describe('model page adapter', () => {
  it('quatOfRows recovers a rotation through every branch', () => {
    for (const R of [rotY(0.3), rotY(Math.PI - 0.01), [1, 0, 0, 0, -1, 0, 0, 0, -1], [-1, 0, 0, 0, 1, 0, 0, 0, -1], [-1, 0, 0, 0, -1, 0, 0, 0, 1]]) {
      const [x, y, z, w] = quatOfRows(R);
      const back = [1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w), 2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w), 2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)];
      back.forEach((v, i) => assert.approximately(v, R[i] ?? 0, 1e-9));
    }
  });

  it('wraps turn time onto the stored frames', () => {
    assert.strictEqual(frameIndex(0.999).k, 0);
    assert.strictEqual(frameIndex(0.5).t, 0.5);
  });

  failsUntil('step: fast steered solve')('the stage figure lands on the solved root frames', () => {
    const drill = KIND_DRILL[TurnKind.Steered];
    let checked = 0;
    for (const intensity of INTENSITIES) {
      const qs = qTable(drill, intensity);
      if (qs === null) continue;
      for (const k of [0, 13, 30]) {
        const q = qs[k];
        if (q === undefined) continue;
        const s = solvedAt(drill, intensity, q, k / qs.length);
        const w = figureWorlds(s.frame);
        for (const [name, r] of Object.entries(s.worlds)) {
          const m = w[name];
          assert.isDefined(m, name);
          if (m === undefined) continue;
          [0, 1, 2].forEach((i) => assert.approximately(m[12 + i] ?? 0, Number(r.p[i as 0 | 1 | 2]), 1e-4, `${name} p${i}`));
          // Column-major Mat4 against row-major R.
          [0, 1, 2].forEach((c) => [0, 1, 2].forEach((row) => assert.approximately(m[4 * c + row] ?? 0, Number(r.R[3 * row + c]), 1e-4, `${name} R${row}${c}`)));
          checked++;
        }
      }
    }
    assert.isAbove(checked, 0);
  });
});

const N = 48;
// Activations at efforts 1, 2 and 3.
const A1 = 0.125;
const A2 = 0.35;
const A3 = 1;
const cellOf = (rows: ReadonlyArray<readonly [string, 'R' | 'L', number]>, residualMax: number): EffortCell => ({
  residualMax,
  muscles: rows.map(([muscle, side, a]) => ({ muscle, side, a: encodeEffort(Array.from({ length: N }, () => a)), modes: encodeModes(Array.from({ length: N }, () => null)) })),
});
// quadriceps is a group row; rectus-abdominis a trunk leaf, shown once from its larger side.
const ROWS = [['vasti', 'R', A2], ['vasti', 'L', A1], ['quadriceps', 'R', A2], ['rectus-abdominis', 'R', 0.01], ['rectus-abdominis', 'L', A3]] as const;
const TABLES: EffortTables = { hash: 'test', drills: { drill: Object.fromEntries(INTENSITIES.map((i) => [i, cellOf(ROWS, 0.3)])) } };
const authored = (muscle: string, side: Side, finish: number): Activation => ({ muscle, side, intensity: { initiation: 1, shaping: { gentle: 1, moderate: 2, dynamic: 3 }, finish } }) as unknown as Activation;

describe('model page effort strips', () => {
  it('gives 48 finite efforts in [0, 3] per lane of every solved steered muscle', () => {
    for (const i of INTENSITIES) {
      const strips = effortStrips(KIND_DRILL[TurnKind.Steered], i);
      assert.isNotNull(strips, i);
      assert.isAbove(strips?.length ?? 0, 0);
      for (const s of strips ?? []) {
        for (const lane of s.lanes) {
          assert.strictEqual(lane.effort.length, N, `${s.muscle} ${lane.side} ${i}`);
          for (const v of [...lane.effort, lane.end]) assert.isTrue(Number.isFinite(v) && v >= 0 && v <= 3, `${s.muscle} ${lane.side} ${i}: ${v}`);
        }
      }
    }
  });

  it('keeps solved leaves only: outside and inside lanes, trunk once', () => {
    const strips = effortStrips('drill', Intensity.Moderate, [], TABLES) ?? [];
    assert.deepStrictEqual(strips.map((s) => `${s.muscle} ${s.lanes.map((l) => l.side).join(' ')}`), ['vasti outside inside', 'rectus-abdominis both']);
    const [outside, inside] = strips[0]?.lanes ?? [];
    assert.approximately(outside?.effort[0] ?? NaN, 2, 1e-6);
    assert.approximately(inside?.effort[0] ?? NaN, 1, 1e-6);
    // The outside leg is the next turn's inside leg.
    assert.approximately(outside?.end ?? NaN, 1, 1e-6);
    assert.approximately(inside?.end ?? NaN, 2, 1e-6);
    assert.approximately(strips[1]?.lanes[0]?.effort[0] ?? NaN, 3, 1e-6);
  });

  it('steps the authored level per third; a trunk lane takes the larger sided level', () => {
    const content = [authored('vasti', Side.Outside, 2), authored('rectus-abdominis', Side.Outside, 1), authored('rectus-abdominis', Side.Inside, 3)];
    const strips = effortStrips('drill', Intensity.Dynamic, content, TABLES) ?? [];
    assert.deepStrictEqual(strips[0]?.lanes.map((l) => l.authored), [[1, 3, 2], null]);
    assert.deepStrictEqual(strips[1]?.lanes[0]?.authored, [1, 3, 3]);
  });

  it('lights the figure from the same lanes, and notes a failing moment balance', () => {
    const levels = effortLevelsAt('drill', Intensity.Gentle, 0.5, TABLES) ?? [];
    assert.deepStrictEqual(levels.map((l) => [l.muscle, l.side, Math.round(l.level * 1e3) / 1e3]), [['vasti', Side.Outside, 2], ['vasti', Side.Inside, 1], ['rectus-abdominis', Side.Both, 3]]);
    // Half a frame before the switch each leg is halfway to the other's first frame, as the strip's end.
    const wrap = effortLevelsAt('drill', Intensity.Gentle, 1 - 0.5 / N, TABLES) ?? [];
    assert.deepStrictEqual(wrap.slice(0, 2).map((l) => Math.round(l.level * 1e3) / 1e3), [1.5, 1.5]);
    assert.strictEqual(effortNote('drill', Intensity.Gentle, TABLES)?.balanced, false);
    const balanced: EffortTables = { hash: 'test', drills: { drill: Object.fromEntries(INTENSITIES.map((i) => [i, cellOf(ROWS, 0.01)])) } };
    assert.strictEqual(effortNote('drill', Intensity.Gentle, balanced)?.balanced, true);
  });

  it('leaves an unbaked kind without strips, glow or note', () => {
    assert.isNull(effortStrips('nothing', Intensity.Moderate, [], TABLES));
    assert.isNull(effortLevelsAt('nothing', Intensity.Moderate, 0.5, TABLES));
    assert.isNull(effortNote('nothing', Intensity.Moderate, TABLES));
  });
});
