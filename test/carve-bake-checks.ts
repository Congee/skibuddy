import { assert, describe, it } from '@effect/vitest';
import type { CarveCell, CarveCells } from '../src/physics/carve-bake';
import { ANGULATION_MAX_DEG, Snow } from '../src/physics/edge';
import type { TurnTask } from '../src/physics/task';
import { replayLamDeg } from '../src/physics/carve-replay';
import { solveProfile } from '../src/physics/turn';
import type { TurnProfile } from '../src/physics/turn';

const DEG = Math.PI / 180;
const STEPS = 240;
const ts = Array.from({ length: STEPS }, (_, i) => i / STEPS);
const EMPTY: CarveCells = { version: 2, cells: {} };

/** A profile's numbers as text, NaN and ±∞ kept: two runs agree bit for bit when their texts do. */
export const profileText = (p: TurnProfile): string => JSON.stringify(p, (_, v: unknown) => (typeof v === 'number' && !Number.isFinite(v) ? String(v) : v));

/** The baked cells' checks: replay, the measured force ceiling, grip as physics-edge's edge goal, λ ≥ 0, no stop, the fallback. */
export const carveCellChecks = (cells: CarveCells, taskOf: (key: string, cell: CarveCell) => TurnTask): void => {
  for (const [key, cell] of Object.entries(cells.cells))
    describe(`baked ${key}`, () => {
      const task = taskOf(key, cell);
      const options = { carveCells: cells };
      it('is the cycle solveCarved uses for its inputs, linked with no stop', () => {
        const p = solveProfile(task, Snow.HardGroomed, options);
        assert.strictEqual(p.periodS, cell.periodS);
        assert.isNull(p.carve?.stop ?? null);
        assert.isTrue(p.closure.converged);
      });

      it('replays through the TS pendulum and speed law per interval within its own mesh change', () => {
        assert.isAtMost(replayLamDeg(task, cell.lamPeak, cell.samples), cell.meshChangeLamDeg);
      });

      it('keeps the leg force under the measured ceiling and λ on the turn side', () => {
        const ceil = (cell.inputs['solver'] as Record<string, unknown> | undefined)?.['F_CEIL_G'];
        assert.isNumber(ceil);
        for (const f of cell.samples.load) assert.isAtMost(f, ceil as number);
        for (const l of cell.samples.lam) assert.isAtLeast(l, 0);
      });

      it('holds the carved edge above the lean while loaded, under the angulation range, on an arc no wider than R_sc cos ε', () => {
        const p = solveProfile(task, Snow.HardGroomed, options);
        const rsc = task.ski.sidecutRadius;
        for (const t of ts) {
          const g = p.at(t);
          const [edgeDeg, leanDeg] = [g.edge / DEG, g.lean / DEG];
          if (edgeDeg - leanDeg > -1e-9) assert.isAtMost(edgeDeg - leanDeg, ANGULATION_MAX_DEG + 1e-9, `${t}`);
        }
        const pk = p.at(p.events.forcePeak);
        assert.isAtMost(pk.skiRadius, rsc * Math.cos(pk.edge) + 1e-9, 'peak');
        const loaded = ts.filter((t) => p.at(t).arcShare > 0.5);
        assert.isAbove(loaded.length, STEPS / 2);
        for (const t of loaded) {
          const g = p.at(t);
          assert.isAtLeast(g.edge / DEG, g.lean / DEG - 1e-9, `${t}`);
          assert.isAtMost(g.skiRadius, rsc * Math.cos(g.edge) + 1e-9, `${t} radius`);
        }
      });

      it('leaves a task whose inputs differ on the forward march, bit for bit', () => {
        const other = { ...task, slopeDeg: task.slopeDeg + 1 };
        assert.strictEqual(profileText(solveProfile(other, Snow.HardGroomed, options)), profileText(solveProfile(other, Snow.HardGroomed, { carveCells: EMPTY })));
      });
    });
};
