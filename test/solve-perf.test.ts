import { assert, describe, it } from '@effect/vitest';
import { Boundary, Cycle, type Mirror } from '../src/solve/cycle';
import { constant } from '../src/solve/dual';
import { BlockKind, prior, type Problem } from '../src/solve/problem';
import { solve } from '../src/solve/solve';

const COORDS = 45;
const FRAMES = 96;

// Each frame: a 45-link planar chain whose tip follows a circle offset by two shared extras.
const synthetic = (boundary: Boundary, mirror?: Mirror): { cycle: Cycle; problem: Problem } => {
  const cycle = new Cycle({ frames: FRAMES, coords: COORDS, extras: 2, boundary, ...(mirror ? { mirror } : {}) });
  const blocks = [];
  for (let k = 0; k < cycle.solved; k++) {
    const phase = (2 * Math.PI * k) / FRAMES;
    const target = [0.5 + 0.2 * Math.cos(phase), 0.4 + 0.2 * Math.sin(phase)];
    blocks.push(
      cycle.frameBlock({ name: `tip ${k}`, group: 'tip', kind: BlockKind.Goal, size: 2, weight: 10 }, [k], ([q], [ex, ey]) => {
        const theta = q ?? [];
        const n = theta[0]?.d.length ?? 0;
        let phi = constant(0, n);
        let x = constant(0, n);
        let y = constant(0, n);
        for (const t of theta) {
          phi = phi.add(t);
          x = x.add(phi.cos().mul(1 / COORDS));
          y = y.add(phi.sin().mul(1 / COORDS));
        }
        if (!ex || !ey) throw new Error('extras');
        return [x.sub(ex).sub(target[0] ?? 0), y.sub(ey).sub(target[1] ?? 0)];
      }),
    );
    blocks.push(
      prior(`prior ${k}`, cycle.frameRefs(k), Array.from({ length: COORDS }, () => 0.03), Array.from({ length: COORDS }, () => 0.5), 'prior'),
    );
  }
  blocks.push(prior('extras', [cycle.extra(0), cycle.extra(1)], [0, 0], [0.1, 0.1]));
  blocks.push(...cycle.smoothness(3));
  const { lower, upper } = cycle.bounds(
    Array.from({ length: COORDS }, () => -0.6),
    Array.from({ length: COORDS }, () => 0.6),
  );
  return { cycle, problem: { size: cycle.size, blocks, lower, upper, structure: cycle.structure } };
};

describe('96 frames × 45 coordinates', () => {
  it('periodic: converges in a bounded number of LM iterations', { timeout: 120_000 }, () => {
    const { cycle, problem } = synthetic(Boundary.Periodic);
    const start = performance.now();
    const result = solve(problem, new Float64Array(cycle.size));
    const ms = performance.now() - start;
    console.info(`periodic 96×45 + 2: ${result.iterations} iterations, ${ms.toFixed(0)} ms`);
    assert.isTrue(result.converged);
    assert.isBelow(result.iterations, 40);
  });

  it('mirror: solves half the frames in a bounded number of LM iterations', { timeout: 120_000 }, () => {
    const swap = Array.from({ length: COORDS }, (_, i) => COORDS - 1 - i);
    const { cycle, problem } = synthetic(Boundary.Mirror, { perm: swap, sign: swap.map(() => -1) });
    assert.strictEqual(cycle.solved, FRAMES / 2);
    const start = performance.now();
    const result = solve(problem, new Float64Array(cycle.size));
    const ms = performance.now() - start;
    console.info(`mirror 96×45 (48 solved) + 2: ${result.iterations} iterations, ${ms.toFixed(0)} ms`);
    assert.isTrue(result.converged);
    assert.isBelow(result.iterations, 40);
  });
});
