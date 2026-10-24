import { assert, describe, it } from '@effect/vitest';
import { Intensity } from '../src/content/schema';
import { readFileSync } from 'node:fs';
import { CARVE_CELLS, SOLVER_READ_KEYS, carveBakeInputsOf, carveCellFor, carveSolverConstOf, sameJson } from '../src/physics/carve-bake';
import { Snow } from '../src/physics/edge';
import { PRESETS, TurnKind, taskFor } from '../src/physics/task';
import { solveProfile } from '../src/physics/turn';
import { carveCellChecks } from './carve-bake-checks';

const carved = [TurnKind.GS, TurnKind.SL].flatMap((kind) => Object.values(PRESETS[kind]).map((pr) => ({ kind, intensity: pr.intensity })));
const labelOf = (key: string): { readonly kind: TurnKind; readonly intensity: Intensity } => {
  const [kind, intensity] = key.split('-') as [TurnKind, Intensity];
  return { kind, intensity };
};

describe('carve-cycles.json', () => {
  it('bakes each cell from its preset’s current inputs; rerun scripts/solve/carve_cycle.py if not', () => {
    assert.strictEqual(CARVE_CELLS.version, 2);
    for (const [key, cell] of Object.entries(CARVE_CELLS.cells)) {
      const { kind, intensity } = labelOf(key);
      assert.deepStrictEqual(cell.inputs['cell'], { kind, intensity }, key);
      assert.isTrue(sameJson(carveBakeInputsOf(taskFor(kind, intensity), Snow.HardGroomed, {}, { kind, intensity }), cell.inputs), key);
    }
  });

  it('gives each carved preset its baked cycle, never the forward march', () => {
    for (const { kind, intensity } of carved) {
      const task = taskFor(kind, intensity);
      assert.isNotNull(carveCellFor(task, Snow.HardGroomed, {}), `${kind}-${intensity}`);
      assert.isTrue(solveProfile(task, Snow.HardGroomed, {}).closure.converged, `${kind}-${intensity}`);
    }
  });

  it('compares every const key carve_cycle.py reads, the seed apart', () => {
    const src = readFileSync(new URL('../scripts/solve/carve_cycle.py', import.meta.url), 'utf8');
    const read = new Set([...src.matchAll(/c\['(\w+)'\]/g)].map((m) => m[1]));
    const c = carveSolverConstOf(taskFor(TurnKind.SL, Intensity.Moderate), Snow.HardGroomed, {}, null);
    assert.isNotNull(c);
    const keys = [...read].filter((k) => k !== undefined && c !== null && Object.hasOwn(c, k) && k !== 'lamPeak0').toSorted();
    assert.deepStrictEqual(keys, [...SOLVER_READ_KEYS].toSorted());
  });
});

carveCellChecks(CARVE_CELLS, (key) => {
  const { kind, intensity } = labelOf(key);
  return taskFor(kind, intensity);
});
