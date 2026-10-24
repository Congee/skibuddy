import { assert, describe, it } from '@effect/vitest';
import { Boundary, Cycle } from '../src/solve/cycle';
import { BOUNDS, diagnose, formatDiagnosis } from '../src/solve/diagnose';
import { constant, type Dual } from '../src/solve/dual';
import { autodiff, BlockKind, checkJacobian, linear, plain, prior, type Block, type Problem } from '../src/solve/problem';
import { solve } from '../src/solve/solve';

const refs = (n: number, from = 0): ReturnType<typeof plain>[] => Array.from({ length: n }, (_, i) => plain(from + i));

// Planar chain tip from relative joint angles.
const tip = (theta: readonly Dual[], lengths: readonly number[]): [Dual, Dual] => {
  const n = theta[0]?.d.length ?? 0;
  let phi = constant(0, n);
  let x = constant(0, n);
  let y = constant(0, n);
  theta.forEach((t, i) => {
    phi = phi.add(t);
    x = x.add(phi.cos().mul(lengths[i] ?? 0));
    y = y.add(phi.sin().mul(lengths[i] ?? 0));
  });
  return [x, y];
};

const tipBlock = (
  kind: BlockKind,
  lengths: readonly number[],
  target: readonly [number, number],
  weight = 1,
  base: readonly [number, number] = [0, 0],
): Block =>
  autodiff({ name: 'tip', kind, size: 2, weight }, refs(lengths.length), (v) => {
    const [x, y] = tip(v, lengths);
    return [x.add(base[0] - target[0]), y.add(base[1] - target[1])];
  });

const lcg = (seed: number): (() => number) => {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
};

const allFinite = (x: ArrayLike<number>): boolean => Array.from(x).every(Number.isFinite);

describe('bounded Levenberg–Marquardt', () => {
  it('solves Rosenbrock from (−1.2, 1)', () => {
    const block = autodiff({ name: 'rosenbrock', kind: BlockKind.Goal, size: 2 }, refs(2), ([a, b]) => {
      if (!a || !b) throw new Error('two variables');
      return [b.sub(a.square()).mul(10), a.neg().add(1)];
    });
    const result = solve({ size: 2, blocks: [block] }, [-1.2, 1]);
    assert.isTrue(result.converged);
    assert.closeTo(result.x[0] ?? 0, 1, 1e-8);
    assert.closeTo(result.x[1] ?? 0, 1, 1e-8);
    assert.isBelow(result.iterations, 60);
  });

  const lengths = [1, 0.8, 0.6];
  // Knees cannot fully straighten, so an out-of-reach target presses them onto the bound.
  const lower = Float64Array.from([-Math.PI, 0.3, 0.3]);
  const upper = Float64Array.from([Math.PI, 2.6, 2.6]);
  const rest = prior('rest', refs(3), [0, 0.5, 0.5], [1, 1, 1]);

  it('3-link IK reaches a target in reach as an equality', () => {
    const problem: Problem = { size: 3, blocks: [tipBlock(BlockKind.Equality, lengths, [1.2, 1]), rest], lower, upper };
    const result = solve(problem, [0, 1, 1]);
    assert.isTrue(result.feasible);
    assert.isBelow(result.violation, 1e-8);
    result.x.forEach((v, i) => assert.isTrue(v >= (lower[i] ?? 0) && v <= (upper[i] ?? 0)));
  });

  it('3-link IK out of reach ends on the knee bounds, finite, pointing at the target', () => {
    const goal = tipBlock(BlockKind.Goal, lengths, [5, 1], 1e3);
    const result = solve({ size: 3, blocks: [goal, rest], lower, upper }, [0, 1, 1]);
    assert.isTrue(allFinite(result.x));
    assert.strictEqual(result.x[1], 0.3);
    assert.strictEqual(result.x[2], 0.3);
    assert.deepStrictEqual(Array.from(result.atBound), [0, 1, 1]);
    const r = new Float64Array(2);
    goal.evaluate(result.x, r, null);
    assert.closeTo(Math.atan2(1 - (r[1] ?? 0), 5 - (r[0] ?? 0)), Math.atan2(1, 5), 1e-5);
  });

  it('an infeasible equality stays finite and reports infeasible', () => {
    const goal = tipBlock(BlockKind.Equality, lengths, [5, 1]);
    const result = solve({ size: 3, blocks: [goal, rest], lower, upper }, [0, 1, 1]);
    assert.isTrue(allFinite(result.x));
    assert.isFalse(result.feasible);
    assert.isAbove(result.violation, 2);
    assert.strictEqual(result.x[1], 0.3);
  });

  it('converges to one point from every seed on a convex bounded problem', () => {
    const rand = lcg(7);
    const rows = Array.from({ length: 12 }, () => ({
      terms: Array.from({ length: 6 }, (_, j) => [plain(j), rand() * 2 - 1] as const),
      offset: rand() * 2 - 1,
    }));
    const problem: Problem = {
      size: 6,
      blocks: [linear({ name: 'ls', kind: BlockKind.Goal }, rows)],
      lower: Float64Array.from([-0.2, -0.2, -Infinity, -Infinity, -0.1, -Infinity]),
      upper: Float64Array.from([0.2, 0.2, Infinity, Infinity, 0.1, Infinity]),
    };
    const solutions = Array.from({ length: 5 }, () => solve(problem, Array.from({ length: 6 }, () => rand() * 6 - 3)).x);
    const first = solutions[0] ?? new Float64Array(6);
    for (const x of solutions) x.forEach((v, i) => assert.closeTo(v, first[i] ?? 0, 1e-8));
  });
});

describe('inequality contact', () => {
  // Base 1.5 above the floor; the tip must stay at y ≥ 0.
  const lengths = [1, 1];
  const floor = autodiff({ name: 'floor', kind: BlockKind.Inequality, size: 1 }, refs(2), (v) => [tip(v, lengths)[1].add(1.5)]);
  const contact = (target: [number, number]): ReturnType<typeof solve> & { problem: Problem } => {
    const problem: Problem = { size: 2, blocks: [tipBlock(BlockKind.Goal, lengths, target, 1, [0, 1.5]), floor] };
    return { ...solve(problem, [-1, 0.5]), problem };
  };

  it('is active with a positive multiplier when the goal is below the floor', () => {
    const result = contact([0.5, -0.5]);
    assert.isTrue(result.feasible);
    const y = 1.5 + Math.sin(result.x[0] ?? 0) + Math.sin((result.x[0] ?? 0) + (result.x[1] ?? 0));
    assert.closeTo(y, 0, 1e-7);
    assert.isAbove(result.multipliers.get(floor)?.[0] ?? 0, 0.1);
    assert.strictEqual(diagnose(result.problem, result).groups.find((g) => g.group === 'floor')?.activeRows, 1);
  });

  it('is inactive with a zero multiplier when the goal is above the floor', () => {
    const result = contact([0.5, 1]);
    assert.isBelow(result.cost, 1e-14);
    assert.strictEqual(result.multipliers.get(floor)?.[0], 0);
  });
});

describe('Jacobians', () => {
  it('forward-mode chain FK matches central differences', () => {
    const block = tipBlock(BlockKind.Goal, [1, 0.7, 0.5, 0.3], [0.4, 0.9]);
    const rand = lcg(3);
    for (let t = 0; t < 5; t++) {
      assert.isBelow(checkJacobian(block, Float64Array.from({ length: 4 }, () => rand() * 4 - 2)), 1e-7);
    }
  });

  it('mirror-signed smoothness and seam-spanning frame blocks match central differences', () => {
    const cycle = new Cycle({ frames: 8, coords: 3, extras: 1, boundary: Boundary.Mirror, mirror: { perm: [0, 2, 1], sign: [-1, 1, 1] } });
    const seam = cycle.frameBlock({ name: 'seam', kind: BlockKind.Goal, size: 2 }, [3, 4, 5], (qs, ex) => {
      const [a, b, c] = qs;
      const e = ex[0];
      if (!a || !b || !c || !e) throw new Error('frames');
      return [(a[0] as Dual).mul(c[1] as Dual).sin().add(e), (b[2] as Dual).square().sub((c[0] as Dual).cos())];
    });
    const rand = lcg(11);
    for (const block of [...cycle.smoothness(2), seam]) {
      assert.isBelow(checkJacobian(block, Float64Array.from(block.vars, () => rand() * 2 - 1)), 1e-7);
    }
  });
});

describe('cycle with a mirror boundary', () => {
  const K = 24;
  const mirror = { perm: [0, 2, 1], sign: [-1, 1, 1] };
  const cycle = new Cycle({ frames: K, coords: 3, boundary: Boundary.Mirror, mirror });
  // Phase 0.7 keeps the priors' own curvature peaks off the seams.
  const priors = Array.from({ length: cycle.solved }, (_, k) => {
    const phase = (2 * Math.PI * k) / K + 0.7;
    const c = Math.cos(phase);
    return prior(`prior ${k}`, cycle.frameRefs(k), [Math.sin(phase), 0.5 + 0.3 * c, 0.5 - 0.3 * c], [0.2, 0.2, 0.2], 'prior');
  });
  const pin = cycle.frameBlock({ name: 'pin', kind: BlockKind.Equality, size: 1 }, [3], ([q]) => [((q as Dual[])[0] as Dual).sub(1.2)]);
  const problem: Problem = { size: cycle.size, blocks: [...priors, pin, ...cycle.smoothness(5)], structure: cycle.structure };
  const result = solve(problem, new Float64Array(cycle.size));
  const q = cycle.unpack(result.x);

  // Largest |Δ²q| at the frames beside a seam vs in the interior, away from the pin and its mirror.
  const kinks = (frames: readonly Float64Array[]): { seam: number; interior: number } => {
    const d2 = (k: number): number =>
      Math.max(...[0, 1, 2].map((i) => Math.abs((frames[(k + 1) % K]?.[i] ?? 0) - 2 * (frames[k]?.[i] ?? 0) + (frames[(k + K - 1) % K]?.[i] ?? 0))));
    const seamFrames = [0, K / 2 - 1, K / 2, K - 1];
    const interior = Array.from({ length: K }, (_, k) => k).filter((k) => !seamFrames.includes(k) && Math.abs((k % (K / 2)) - 3) > 2);
    return { seam: Math.max(...seamFrames.map(d2)), interior: Math.max(...interior.map(d2)) };
  };

  it('holds q(φ + ½) = M·q(φ) and the pin', () => {
    assert.isTrue(result.feasible);
    assert.closeTo(q[3]?.[0] ?? 0, 1.2, 1e-8);
    for (let k = 0; k < K / 2; k++) {
      for (let i = 0; i < 3; i++) {
        assert.strictEqual(q[k + K / 2]?.[i], (mirror.sign[i] ?? 0) * (q[k]?.[mirror.perm[i] ?? 0] ?? 0));
      }
    }
  });

  it('is C1 across both seams: second differences there no larger than in the interior', () => {
    const { seam, interior } = kinks(q);
    assert.isAtMost(seam, interior);
  });

  it('kinks at the seam once the wrapped smoothness terms are dropped', () => {
    const smooth = cycle.smoothness(5);
    const unwrapped = smooth.filter((_, k) => k !== 0 && k !== smooth.length - 1);
    const open = solve({ ...problem, blocks: [...priors, pin, ...unwrapped] }, new Float64Array(cycle.size));
    const { seam, interior } = kinks(cycle.unpack(open.x));
    assert.isAbove(seam, interior);
  });

  it('banded + Schur solve equals the natural-order solve', () => {
    const { structure: _banded, ...natural } = problem;
    const dense = solve(natural, new Float64Array(cycle.size));
    dense.x.forEach((v, i) => assert.closeTo(v, result.x[i] ?? 0, 1e-9));
  });
});

describe('diagnostics', () => {
  it('attributes a prior moved through smoothness to the pin, and a clipped prior to the bounds', () => {
    const cycle = new Cycle({ frames: 5, coords: 1, boundary: Boundary.Open });
    const priors = Array.from({ length: 5 }, (_, k) => prior(`p${k}`, cycle.frameRefs(k), [0], [1], 'prior'));
    const pin = cycle.frameBlock({ name: 'pin', kind: BlockKind.Equality, size: 1 }, [2], ([q]) => [((q as Dual[])[0] as Dual).sub(1)]);
    const problem: Problem = { size: 5, blocks: [...priors, pin, ...cycle.smoothness(3)], structure: cycle.structure };
    const d = diagnose(problem, solve(problem, new Float64Array(5)));
    const why = d.attribution.find((a) => a.group === 'prior');
    assert.closeTo(why?.shares.find((s) => s.source === 'pin')?.share ?? 0, 1, 1e-6);
    assert.closeTo(why?.rest ?? 1, 0, 1e-6);
    assert.include(formatDiagnosis(d), 'why prior');
    assert.strictEqual(d.groups.find((g) => g.group === 'smoothness')?.at, 'smoothness 2[0]');

    const clipped: Problem = { size: 1, blocks: [prior('reach', [plain(0)], [2], [1])], upper: Float64Array.from([1]) };
    const c = diagnose(clipped, solve(clipped, [0]));
    assert.closeTo(c.attribution[0]?.shares.find((s) => s.source === BOUNDS)?.share ?? 0, 1, 1e-6);
  });
});
