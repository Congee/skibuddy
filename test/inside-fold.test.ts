import { assert, describe, it } from '@effect/vitest';
import LIT from '../scripts/prior/lit-curves.json';
import { priorAt } from '../src/viewer/prior/prior';
import { buildTurnProblem, insideFold, insideRise, priorFor } from '../src/viewer/motion/turn';

const DEG = Math.PI / 180;
const fold = (leanDeg: number, edgeDeg: number, kneeDeg: number): number => insideFold(insideRise(leanDeg * DEG, edgeDeg * DEG), kneeDeg * DEG) / DEG;
// heinrich-2023's loaded phases (lit-curves gs_carving), the brief's sample.
const LOADED = [0.2, 0.4, 0.5, 0.65, 0.8];
const curve = (c: { readonly t: ReadonlyArray<number>; readonly mean: ReadonlyArray<number> }, t: number): number => c.mean[c.t.findIndex((x) => Math.abs(x - t) < 1e-9)] ?? Number.NaN;

describe('inside fold', () => {
  it('is zero at the switch whatever the edge and knee', () => {
    for (const edge of [0, 10, 30, 50]) for (const knee of [40, 70, 100]) assert.approximately(fold(0, edge, knee), 0, 1e-9);
  });

  it('grows with lean at a fixed edge', () => {
    for (const edge of [20, 35, 55]) {
      const xs = [5, 15, 25, 35, 45].map((lean) => fold(lean, edge, 70));
      xs.slice(1).forEach((x, i) => assert.isAbove(x, xs[i] ?? Infinity));
    }
  });

  it("at heinrich-2023's lean reaches at least that skier's inside−outside knee difference", () => {
    // λ 54° (heinrich-2023 context), edge from sporri-2016 Fig 4 at the same t: inferred pairing of two sources.
    const gs = LIT.gs_carving;
    for (const t of LOADED) {
      const out = curve(gs.outside.knee_flexion, t);
      const source = curve(gs.inside.knee_flexion, t) - out;
      assert.isAbove(source, 25, `t ${t}`);
      assert.isAtLeast(fold(54, curve(gs.edge_angle, t), out), source, `t ${t}`);
    }
  });

  it('folds the inside hip by the knee’s amount and keeps the inside ankle’s own prior', () => {
    const tp = buildTurnProblem('regular-gs', 'dynamic', { frames: 24 });
    let folded = 0;
    for (const g of tp.goals) {
      const dk = (priorFor(tp.prior, g, 'knee_flexion.L')?.mu ?? 0) - (priorAt(tp.prior, 'knee_flexion.R', g.phase)?.mu ?? 0);
      const dh = (priorFor(tp.prior, g, 'hip_flexion.L')?.mu ?? 0) - (priorAt(tp.prior, 'hip_flexion.R', g.phase)?.mu ?? 0);
      assert.approximately(dh, dk, 1e-12);
      assert.deepStrictEqual(priorFor(tp.prior, g, 'ankle_dorsiflexion.L'), priorAt(tp.prior, 'ankle_dorsiflexion.L', g.phase));
      assert.strictEqual(priorFor(tp.prior, g, 'knee_flexion.L')?.sigma, priorAt(tp.prior, 'knee_flexion.L', g.phase)?.sigma);
      if (g.rise > 0) folded++;
    }
    assert.isAbove(folded, 0);
  });
});
