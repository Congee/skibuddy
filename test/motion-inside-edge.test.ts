import { assert, describe, it } from '@effect/vitest';
import { Intensity } from '../src/content/schema';
import { forward, transform } from '../src/viewer/motion/fk';
import { buildTurnProblem, INSIDE_EDGE_PLAY, MIRROR, NAMES, seedFor, SeedKind, skiFrame } from '../src/viewer/motion/turn';
import { COORDINATES, REST_POSE, Side } from '../src/viewer/skeleton';

const DEG = Math.PI / 180;
const N = NAMES.length;
const tp = buildTurnProblem('regular-gs', Intensity.Dynamic, { frames: 4 });
const block = tp.problem.blocks.find((b) => b.name === 'inside edge 0');
const seed = Array.from(seedFor(tp, SeedKind.Prior).subarray(0, N));
const rest = NAMES.map((n) => REST_POSE[n] ?? 0);
const mirrored = (q: readonly number[]): number[] => q.map((_, i) => (MIRROR.sign[i] ?? 1) * (q[MIRROR.perm[i] ?? i] ?? 0));
const shifted = (q: readonly number[], d: Record<string, number>): number[] => q.map((v, i) => v + (d[NAMES[i] ?? ''] ?? 0));

/** The band's two rows at frame-0 coordinates `q`. */
const rows = (q: readonly number[]): [number, number] => {
  if (block === undefined) throw new Error('no inside edge 0');
  const r = new Float64Array(block.size);
  block.evaluate(Float64Array.from(block.vars, (v, j) => (j < N ? (q[j] ?? 0) : v)), r, null);
  return [r[0] ?? NaN, r[1] ?? NaN];
};

describe('inside edge band', () => {
  it('is mirror-invariant: the skis swap and both edges negate', () => {
    assert.strictEqual(block?.size, 2);
    const qs = [seed, shifted(seed, { 'hip_adduction.L': 10 * DEG }), shifted(seed, { pelvis_tx: 0.1 }), shifted(seed, { 'subtalar_inversion.R': 4 * DEG, 'subtalar_inversion.L': -4 * DEG })];
    qs.forEach((q, n) => {
      const [a, b] = rows(q);
      const [am, bm] = rows(mirrored(q));
      assert.approximately(am, a, 1e-9, `q ${n} row 0`);
      assert.approximately(bm, b, 1e-9, `q ${n} row 1`);
    });
  });

  it('holds flat parallel skis at the play and flags a splayed inside ski', () => {
    const flat = rows(rest);
    assert.approximately(flat[0] + flat[1], 2 * INSIDE_EDGE_PLAY, 1e-12, 'rows sum');
    // The rest skis splay 1.1 µrad each, mirror-symmetric.
    flat.forEach((r, j) => assert.approximately(r, INSIDE_EDGE_PLAY, 1e-5, `rest row ${j}`));
    const splayed = rows(shifted(rest, { 'hip_adduction.L': 15 * DEG }));
    assert.strictEqual(splayed.filter((r) => r < 0).length, 1, `rows ${splayed.join(', ')}`);
  });
});

describe('prior seed', () => {
  it('puts the stance centre on the path point', () => {
    const x = seedFor(tp, SeedKind.Prior);
    tp.goals.forEach((g, k) => {
      const q = Array.from(x.subarray(k * N, k * N + COORDINATES.length));
      const w = forward(q, g.origin, undefined, g.ref);
      const [c, ci] = [Side.Right, Side.Left].map((s) => transform(skiFrame(w, s), tp.ski.centre).map(Number));
      const mid = [0, 1, 2].map((j) => ((c?.[j] ?? 0) + (ci?.[j] ?? 0)) / 2 - (g.origin[j] ?? 0));
      const dot = (u: readonly number[]): number => mid.reduce((s, m, j) => s + m * (u[j] ?? 0), 0);
      assert.approximately(dot(g.forward), 0, 1e-9, `frame ${k} along`);
      assert.approximately(dot(g.across), 0, 1e-9, `frame ${k} across`);
    });
  });
});
