import { assert, describe, it } from '@effect/vitest';
import { BASE_NAMES, EdgeChange, Evidence, PRIOR_FILE, Parity, evalDeg, examplesFor, interpolate, mirrorName, parityOf, priorAt } from '../src/viewer/prior/prior';
import type { CoordinatePrior, Example, PriorFile, Series } from '../src/viewer/prior/prior';
import { COORDINATES } from '../src/viewer/skeleton';

const PHIS = Array.from({ length: 20 }, (_, i) => i / 20 + 0.013);
const allExamples = (): ReadonlyArray<readonly [string, Example]> =>
  Object.entries(PRIOR_FILE.drills).flatMap(([drill, sets]) => Object.values(sets).flatMap((xs) => (xs ?? []).map((x) => [drill, x] as const)));

const series = (seed: number, order = 6): Series => ({
  a0: seed,
  cos: Array.from({ length: order }, (_, i) => Math.sin(seed + i)),
  sin: Array.from({ length: order }, (_, i) => Math.cos(seed * 2 + i)),
});
const prior = (parity: Parity, seed: number): CoordinatePrior => ({
  parity,
  mu: series(seed),
  logSigma: series(seed / 10),
  provenance: { roles: {}, notes: [] },
});

// The next turn mirrors this one: sides swapped, bending and axial rotation negated.
const assertMirror = (c: CoordinatePrior, name: string): void => {
  const sign = parityOf(name) === Parity.Odd ? -1 : 1;
  for (const phi of PHIS) {
    const a = evalDeg(c, name, phi, 0);
    const b = evalDeg(c, mirrorName(name), phi, 1);
    if (a === null || b === null) return assert.strictEqual(a, b);
    assert.approximately(b.mu, sign * a.mu, 1e-9, `${name} φ ${phi}`);
    assert.approximately(b.sigma, a.sigma, 1e-9, `${name} σ φ ${phi}`);
    const c2 = evalDeg(c, name, phi, 2);
    assert.approximately(c2?.mu ?? Number.NaN, a.mu, 1e-9, `${name} two turns on`);
  }
};

describe('half-cycle mirror', () => {
  it('holds by construction for any coefficients of each parity', () => {
    assertMirror(prior(Parity.Sided, 3), 'knee_flexion.R');
    assertMirror(prior(Parity.Sided, 3), 'hip_rotation.L');
    assertMirror(prior(Parity.Odd, 2), 'lumbar_rotation');
    assertMirror(prior(Parity.Even, 5), 'lumbar_flexion');
  });

  it('holds for every coordinate of every committed example', () => {
    for (const [drill, ex] of allExamples())
      for (const coord of COORDINATES) {
        const base = coord.name.replace(/\.[RL]$/, '');
        const c = ex.coordinates[base];
        assert.isDefined(c, `${drill} ${coord.name}`);
        if (c !== undefined) assertMirror(c, coord.name);
      }
  });

  it('gives odd coordinates no mean over the cycle', () => {
    const odd = prior(Parity.Odd, 2);
    const mean = PHIS.reduce((s, p) => s + (evalDeg(odd, 'lumbar_bending', p, 0)?.mu ?? 0) + (evalDeg(odd, 'lumbar_bending', p, 1)?.mu ?? 0), 0);
    assert.approximately(mean, 0, 1e-9);
  });
});

const synthetic = (id: string, arcLoad: number, a0: number, cos1: number): Example => ({
  id,
  arcLoad,
  indexProvenance: 'synthetic',
  coordinates: {
    knee_flexion: {
      parity: Parity.Sided,
      mu: { a0, cos: [cos1], sin: [0] },
      logSigma: { a0: Math.log(a0 / 10), cos: [0], sin: [0] },
      provenance: { roles: { outside: { evidence: Evidence.Inferred, sigma: null, sources: [] } }, notes: [] },
    },
  },
  limitFlags: [],
});

describe('interpolation over intensity', () => {
  const xs = [synthetic('hard', 2.4, 70, -20), synthetic('easy', 1.2, 40, -5), synthetic('mid', 1.6, 55, 10)];

  it('reproduces each example at its own index', () => {
    for (const ex of xs) assert.deepStrictEqual(priorAt(interpolate(xs, ex.arcLoad), 'knee_flexion.R', 0.3), priorAt(interpolate([ex], 0), 'knee_flexion.R', 0.3));
  });

  it('is monotone between neighbouring examples, phase by phase', () => {
    for (const phi of PHIS) {
      const at = (x: number): number => priorAt(interpolate(xs, x), 'knee_flexion.R', phi)?.mu ?? Number.NaN;
      for (const [lo, hi] of [[1.2, 1.6], [1.6, 2.4]] as const) {
        const steps = Array.from({ length: 11 }, (_, i) => at(lo + ((hi - lo) * i) / 10));
        const up = (steps.at(-1) ?? 0) >= (steps[0] ?? 0);
        for (let i = 1; i < steps.length; i++) assert.isTrue(up ? (steps[i] ?? 0) >= (steps[i - 1] ?? 0) - 1e-12 : (steps[i] ?? 0) <= (steps[i - 1] ?? 0) + 1e-12, `φ ${phi} [${lo}, ${hi}]`);
      }
    }
  });

  it('never extrapolates: past the ends the nearest example holds (input selection)', () => {
    const low = interpolate(xs, 0.2);
    const high = interpolate(xs, 9);
    assert.strictEqual(low.arcLoad, 1.2);
    assert.strictEqual(high.arcLoad, 2.4);
    assert.deepStrictEqual(low.between, ['easy', 'mid']);
    assert.strictEqual(low.weight, 0);
    assert.deepStrictEqual(high.between, ['mid', 'hard']);
    assert.strictEqual(high.weight, 1);
    for (const phi of PHIS) {
      assert.deepStrictEqual(priorAt(low, 'knee_flexion.R', phi), priorAt(interpolate(xs, 1.2), 'knee_flexion.R', phi));
      assert.deepStrictEqual(priorAt(high, 'knee_flexion.R', phi), priorAt(interpolate(xs, 2.4), 'knee_flexion.R', phi));
    }
  });

  it('holds a single example at every index', () => {
    const one = [synthetic('only', 1.5, 50, 3)];
    assert.deepStrictEqual(priorAt(interpolate(one, 0), 'knee_flexion.L', 0.4), priorAt(interpolate(one, 5), 'knee_flexion.L', 0.4));
  });
});

describe('example lookup', () => {
  it('falls back to the style-unstated examples and follows aliases', () => {
    const file: PriorFile = {
      unit: 'deg',
      turn0: '',
      drills: { a: { [EdgeChange.Unstated]: [synthetic('u', 1, 50, 0)], [EdgeChange.CrossUnder]: [synthetic('x', 1, 60, 0)] } },
      aliases: { b: { from: 'a', why: 'test' } },
      evidence: {},
    };
    assert.strictEqual(examplesFor('a', EdgeChange.CrossOver, file)?.[0]?.id, 'u');
    assert.strictEqual(examplesFor('a', EdgeChange.CrossUnder, file)?.[0]?.id, 'x');
    assert.strictEqual(examplesFor('b', EdgeChange.CrossOver, file)?.[0]?.id, 'u');
    assert.isNull(examplesFor('c', EdgeChange.Unstated, file));
  });

  it('reads out radians', () => {
    const p = priorAt(interpolate([synthetic('r', 1, 90, 0)], 1), 'knee_flexion.R', 0.2);
    assert.approximately(p?.mu ?? 0, Math.PI / 2, 1e-12);
  });

  it('keys every committed example by the skeleton base names only', () => {
    for (const [drill, ex] of allExamples()) assert.deepStrictEqual(Object.keys(ex.coordinates).toSorted(), BASE_NAMES.toSorted(), drill);
  });
});
