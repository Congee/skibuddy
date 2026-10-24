import { assert, describe, it } from '@effect/vitest';
import type { Intensity } from '../src/content/schema';
import { CARVE_CELLS, carveBakeInputsOf, sameJson } from '../src/physics/carve-bake';
import { Snow } from '../src/physics/edge';
import { PRESETS, TurnKind, taskFor } from '../src/physics/task';
import { carveCellChecks } from './carve-bake-checks';

const carvedSlopes = [TurnKind.GS, TurnKind.SL].flatMap((k) => Object.values(PRESETS[k]).map((pr) => pr.task.slopeDeg));
const labelOf = (key: string): { readonly kind: TurnKind; readonly intensity: Intensity } => {
  const [kind, intensity] = key.split('-') as [TurnKind, Intensity];
  return { kind, intensity };
};

describe('carve-cycles.json', () => {
  it('bakes each cell from its preset’s current inputs; rerun scripts/solve/carve_cycle.py if not', () => {
    assert.strictEqual(CARVE_CELLS.version, 1);
    for (const [key, cell] of Object.entries(CARVE_CELLS.cells)) {
      const { kind, intensity } = labelOf(key);
      assert.deepStrictEqual(cell.inputs['cell'], { kind, intensity }, key);
      assert.isTrue(sameJson(carveBakeInputsOf(taskFor(kind, intensity), Snow.HardGroomed, {}, { kind, intensity }, carvedSlopes), cell.inputs), key);
    }
  });
});

carveCellChecks(CARVE_CELLS, (key) => {
  const { kind, intensity } = labelOf(key);
  return taskFor(kind, intensity);
});
