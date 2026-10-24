import { assert, describe, it } from '@effect/vitest';
import type { CarveCell, CarveCells } from '../src/physics/carve-bake';
import { ANGULATION_MAX_DEG, Snow } from '../src/physics/edge';
import type { TurnTask } from '../src/physics/task';
import { CARVE_DT, G, SWITCH_SHARE, V_FLOOR, carveFreeFall, carveSetupOf, massCurvatureOf, shareLawOf, skiCurvatureOf, solveProfile } from '../src/physics/turn';
import type { TurnProfile } from '../src/physics/turn';

const DEG = Math.PI / 180;
const STEPS = 240;
const ts = Array.from({ length: STEPS }, (_, i) => i / STEPS);
const EMPTY: CarveCells = { version: 1, cells: {} };

/** A profile's numbers as text, NaN and ±∞ kept: two runs agree bit for bit when their texts do. */
export const profileText = (p: TurnProfile): string => JSON.stringify(p, (_, v: unknown) => (typeof v === 'number' && !Number.isFinite(v) ? String(v) : v));

/**
 * Restart replay: from each sample, TS's free pendulum (carveFreeFall, the share law at the cell's λ_peak) and speed law
 * on the bake's ε (ε̇ constant) and h (ḧ constant) over the span to the next sample, Heun at CARVE_DT; the worst |Δλ|, degrees.
 */
export const replayLamDeg = (task: TurnTask, cell: CarveCell): number => {
  const st = carveSetupOf(task, Snow.HardGroomed, {});
  const { s, accel, share: S, stance } = st.inputs;
  const lawOf = shareLawOf(-(S - SWITCH_SHARE) * stance, cell.lamPeak);
  const c = cell.samples;
  const at = (k: keyof CarveCell['samples'], i: number): number => c[k][i] ?? Number.NaN;
  let worst = 0;
  for (let i = 0; i + 1 < c.t.length; i++) {
    const [t0, t1] = [at('t', i), at('t', i + 1)];
    const [e0, ed, h0, hd0, hdd] = [at('eps', i), at('epsDot', i + 1), at('h', i), at('hDot', i), at('hDdot', i + 1)];
    const rates = (tt: number, x: readonly [number, number, number, number]): [number, number, number, number] => {
      const [lam, w, psi, v] = x;
      const u = tt - t0;
      const q = { h: h0 + hd0 * u + 0.5 * hdd * u * u, hd: hd0 + hdd * u, hdd, lam, lamDot: w };
      const eps = e0 + ed * u;
      const law = lawOf(lam, w);
      const share = SWITCH_SHARE - law.p / stance;
      const f = carveFreeFall(s, q, law, v, psi, eps, share, skiCurvatureOf(s, eps, s.cos / Math.cos(lam), share));
      return [w, f.lamAcc, v * massCurvatureOf(f.load, lam, G * s.sin * Math.cos(psi), v), accel(psi, v, f.load)];
    };
    let x: [number, number, number, number] = [at('lam', i), at('lamDot', i), at('psi', i), at('v', i)];
    let tt = t0;
    while (tt < t1) {
      const dt = Math.min(CARVE_DT, t1 - tt);
      const a = rates(tt, x);
      const xb = x.map((xi, j) => xi + dt * (a[j] ?? 0)) as [number, number, number, number];
      xb[3] = Math.max(V_FLOOR, xb[3]);
      const b = rates(tt + dt, xb);
      x = x.map((xi, j) => xi + (dt * ((a[j] ?? 0) + (b[j] ?? 0))) / 2) as [number, number, number, number];
      x[3] = Math.max(V_FLOOR, x[3]);
      tt += dt;
    }
    worst = Math.max(worst, Math.abs(x[0] - at('lam', i + 1)) / DEG);
  }
  return worst;
};

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
        assert.isAtMost(replayLamDeg(task, cell), cell.meshChangeLamDeg);
      });

      it('keeps the leg force under the measured ceiling and λ on the turn side', () => {
        const ceil = cell.inputs['F_CEIL_G'];
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
