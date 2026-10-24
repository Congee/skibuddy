import { assert, describe, it } from '@effect/vitest';
import { Intensity } from '../src/content/schema';
import { pack, pickBest, upsample } from '../src/viewer/motion/solve-strategy';
import { buildTurnProblem, MIRROR, NAMES } from '../src/viewer/motion/turn';

const COARSE = buildTurnProblem('regular-steered', Intensity.Gentle, { frames: 6 });
const FINE = buildTurnProblem('regular-steered', Intensity.Gentle, { frames: 12 });
const N = NAMES.length;
/** A fixed non-symmetric coarse x, every coordinate moving. */
const X = Float64Array.from({ length: COARSE.cycle.size }, (_, i) => Math.sin(1.3 * i + 0.7));

describe('solve strategy: upsample', () => {
  it('carries a constant motion through exactly, the mirror seam included', () => {
    // Constant over the cycle only if the mirror maps the pose onto itself.
    const r = Array.from({ length: N }, (_, i) => Math.sin(0.9 * i + 0.2));
    const q = r.map((v, i) => (v + (MIRROR.sign[i] ?? 1) * (r[MIRROR.perm[i] ?? i] ?? 0)) / 2);
    const x = pack(COARSE, Array.from({ length: COARSE.cycle.solved }, () => q));
    const up = upsample(COARSE, x, FINE);
    assert.strictEqual(up.length, FINE.cycle.size);
    // === rather than deep equality: the mirror's sign turns a 0 into −0.
    FINE.cycle.unpack(up).forEach((f, j) => f.forEach((v, i) => assert.strictEqual(v, q[i], `frame ${j} ${NAMES[i]}`)));
  });

  it('keeps the coarse frames on the shared ones', () => {
    const fine = FINE.cycle.unpack(upsample(COARSE, X, FINE));
    const down = pack(COARSE, fine.filter((_, j) => j % 2 === 0));
    down.forEach((v, i) => assert.approximately(v, X[i] ?? NaN, 1e-12, `x${i}`));
  });

  it('puts each new frame midway between its neighbours, the last one through the mirror', () => {
    const S = COARSE.cycle.solved;
    // Past the last solved frame comes the next turn's first: frame 0 mirrored.
    const frame = (k: number): number[] => Array.from({ length: N }, (_, i) => (k < S ? (X[k * N + i] ?? NaN) : (MIRROR.sign[i] ?? 1) * (X[MIRROR.perm[i] ?? i] ?? NaN)));
    const fine = FINE.cycle.unpack(upsample(COARSE, X, FINE));
    for (let j = 1; j < FINE.cycle.solved; j += 2) {
      const [a, b] = [frame((j - 1) / 2), frame((j + 1) / 2)];
      fine[j]?.forEach((v, i) => assert.approximately(v, ((a[i] ?? NaN) + (b[i] ?? NaN)) / 2, 1e-12, `frame ${j} ${NAMES[i]}`));
    }
  });
});

const run = (cost: number, feasible: boolean, violation: number): { result: { cost: number; feasible: boolean; violation: number } } => ({ result: { cost, feasible, violation } });

describe('solve strategy: pick', () => {
  it('takes the lowest cost among the feasible, never a cheaper infeasible one', () => {
    const runs = [run(5, true, 1e-8), run(1, false, 1e-3), run(3, true, 2e-8), run(4, true, 0)];
    assert.strictEqual(pickBest(runs), runs[2]);
  });

  it('falls back to the lowest violation when none is feasible', () => {
    const runs = [run(1, false, 1e-3), run(9, false, 1e-5), run(2, false, Number.NaN)];
    assert.strictEqual(pickBest(runs), runs[1]);
  });
});
