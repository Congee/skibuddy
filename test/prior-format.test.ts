import { assert, describe, it } from '@effect/vitest';
import { BASE_NAMES, Derived, EdgeChange, Evidence, PRIOR_FILE, Parity, WHOLE_SCALED_DERIVED, evalDeg, examplesFor, interpolate, mirrorName, parityOf, priorAt } from '../src/viewer/prior/prior';
import type { CoordinatePrior, Example, PriorAt, PriorFile, Series } from '../src/viewer/prior/prior';
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

const synthetic = (id: string, arcLoad: number, a0: number, cos1: number, lean = 40 * arcLoad): Example => ({
  id,
  arcLoad,
  lean,
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
    for (const ex of xs) assert.deepStrictEqual(priorAt(interpolate(xs, ex.arcLoad, ex.lean), 'knee_flexion.R', 0.3), priorAt(interpolate([ex], ex.arcLoad, ex.lean), 'knee_flexion.R', 0.3));
  });

  it('is monotone between neighbouring examples, phase by phase', () => {
    for (const phi of PHIS) {
      const at = (x: number): number => priorAt(interpolate(xs, x, 60), 'knee_flexion.R', phi)?.mu ?? Number.NaN;
      for (const [lo, hi] of [[1.2, 1.6], [1.6, 2.4]] as const) {
        const steps = Array.from({ length: 11 }, (_, i) => at(lo + ((hi - lo) * i) / 10));
        const up = (steps.at(-1) ?? 0) >= (steps[0] ?? 0);
        for (let i = 1; i < steps.length; i++) assert.isTrue(up ? (steps[i] ?? 0) >= (steps[i - 1] ?? 0) - 1e-12 : (steps[i] ?? 0) <= (steps[i - 1] ?? 0) + 1e-12, `φ ${phi} [${lo}, ${hi}]`);
      }
    }
  });

  it('never extrapolates: past the ends the nearest example holds at its own lean (input selection)', () => {
    const low = interpolate(xs, 0.2, 48);
    const high = interpolate(xs, 9, 0);
    assert.strictEqual(low.arcLoad, 1.2);
    assert.strictEqual(high.arcLoad, 2.4);
    assert.deepStrictEqual(low.between, ['easy', 'mid']);
    assert.strictEqual(low.weight, 0);
    assert.deepStrictEqual(high.between, ['mid', 'hard']);
    assert.strictEqual(high.weight, 1);
    for (const phi of PHIS) {
      assert.deepStrictEqual(priorAt(low, 'knee_flexion.R', phi), priorAt(interpolate(xs, 1.2, 48), 'knee_flexion.R', phi));
      assert.deepStrictEqual(priorAt(high, 'knee_flexion.R', phi), priorAt(interpolate(xs, 2.4, 96), 'knee_flexion.R', phi));
    }
  });

  it('holds a single example at every index', () => {
    const one = [synthetic('only', 1.5, 50, 3)];
    assert.deepStrictEqual(priorAt(interpolate(one, 1.5, 0), 'knee_flexion.L', 0.4), priorAt(interpolate(one, 5, 0), 'knee_flexion.L', 0.4));
  });
});

// Every committed example set with a measured lean; the sets hold one example each today.
const leaned = (): ReadonlyArray<readonly [string, ReadonlyArray<Example>]> =>
  Object.entries(PRIOR_FILE.drills).flatMap(([drill, sets]) => Object.entries(sets).flatMap(([style, xs]) => (xs !== undefined && xs.some((x) => x.lean > 0) ? [[`${drill} ${style}`, xs] as const] : [])));
const lightest = (xs: ReadonlyArray<Example>): Example => xs.reduce((a, b) => (b.arcLoad < a.arcLoad ? b : a));
const allOf = (p: PriorAt): ReadonlyArray<readonly [string, CoordinatePrior]> => [...Object.entries(p.coordinates), ...Object.entries(p.derived)];
const sidedNames = (base: string): readonly [string, string] => [`${base}.R`, `${base}.L`];
const LEANS = [0, 1e-6, 5, 12.5, 19.3, 32.5, 45];

const acrossExample = (id: string, arcLoad: number, a: number): Example => ({ ...synthetic(id, arcLoad, 0, 0), derived: { [Derived.TrunkAcross]: { parity: Parity.Even, mu: { a0: a, cos: [0, a / 2], sin: [] }, logSigma: { a0: 0, cos: [], sin: [] }, provenance: { roles: { outside: { evidence: Evidence.Inferred, sigma: null, sources: [] } }, notes: [] } } } });

describe('lean scaling below the lightest example (motion-model §5)', () => {
  it('reproduces the lightest example at its own lean, whatever the load key', () => {
    for (const [set, xs] of leaned()) {
      const ex = lightest(xs);
      assert.deepStrictEqual(interpolate(xs, ex.arcLoad * 0.7, ex.lean).coordinates, interpolate(xs, ex.arcLoad, ex.lean).coordinates, set);
      assert.deepStrictEqual(interpolate(xs, ex.arcLoad * 0.7, ex.lean).derived, interpolate(xs, ex.arcLoad, ex.lean).derived, set);
      assert.strictEqual(interpolate(xs, ex.arcLoad * 0.7, ex.lean).scale, 1, set);
    }
  });

  it('gives both sides the same μ and odd coordinates none at λ 0', () => {
    for (const [set, xs] of leaned()) {
      const p = interpolate(xs, 1, 0);
      for (const [base, c] of allOf(p)) {
        if (c.mu === null) continue;
        for (const phi of PHIS) {
          if (c.parity === Parity.Odd) assert.approximately(evalDeg(c, base, phi)?.mu ?? Number.NaN, 0, 1e-12, `${set} ${base} φ ${phi}`);
          if (c.parity !== Parity.Sided) continue;
          const [r, l] = sidedNames(base);
          assert.approximately(evalDeg(c, r, phi)?.mu ?? Number.NaN, evalDeg(c, l, phi)?.mu ?? Number.NaN, 1e-9, `${set} ${base} φ ${phi}`);
        }
      }
    }
  });

  it('keeps even harmonics and logSigma at every lean', () => {
    for (const [set, xs] of leaned()) {
      const ex = lightest(xs);
      const ref = allOf(interpolate(xs, ex.arcLoad, ex.lean));
      for (const lean of LEANS) {
        const p = new Map(allOf(interpolate(xs, ex.arcLoad / 2, lean)));
        for (const [base, c] of ref) {
          const q = p.get(base);
          assert.deepStrictEqual(q?.logSigma, c.logSigma, `${set} ${base} λ ${lean}`);
          if (c.mu === null || WHOLE_SCALED_DERIVED.has(base)) continue;
          assert.strictEqual(q?.mu?.a0, c.mu.a0, `${set} ${base}`);
          for (const k of ['cos', 'sin'] as const) assert.deepStrictEqual(q?.mu?.[k].filter((_, i) => i % 2 === 1), c.mu[k].filter((_, i) => i % 2 === 1), `${set} ${base} ${k}`);
        }
      }
    }
  });

  it('scales trunk_across whole with the lean and leaves trunk_pitch and trunk_gravity alone', () => {
    let seen = 0;
    for (const [set, xs] of leaned()) {
      const ex = lightest(xs);
      const ref = interpolate(xs, ex.arcLoad, ex.lean).derived;
      const across = ref[Derived.TrunkAcross];
      if (across?.mu == null) continue;
      seen++;
      for (const lean of [0, ...LEANS, ex.lean, 2 * ex.lean]) {
        const p = interpolate(xs, ex.arcLoad / 2, lean).derived;
        const f = Math.min(1, lean / ex.lean);
        for (const phi of PHIS)
          for (const turn of [0, 1]) {
            const mu = (d: typeof p | typeof ref, k: Derived): number => evalDeg(d[k] as CoordinatePrior, k, phi, turn)?.mu ?? Number.NaN;
            assert.approximately(mu(p, Derived.TrunkAcross), f * mu(ref, Derived.TrunkAcross), 1e-9, `${set} λ ${lean} φ ${phi}`);
            for (const k of [Derived.TrunkPitch, Derived.TrunkGravity]) if (ref[k] !== undefined) assert.strictEqual(mu(p, k), mu(ref, k), `${set} ${k} λ ${lean}`);
          }
        assert.deepStrictEqual(p[Derived.TrunkAcross]?.logSigma, across.logSigma, set);
      }
      for (const phi of PHIS) assert.approximately(evalDeg(interpolate(xs, ex.arcLoad / 2, 0).derived[Derived.TrunkAcross] as CoordinatePrior, 'trunk_across', phi)?.mu ?? Number.NaN, 0, 1e-12, set);
    }
    assert.isAbove(seen, 0);
  });

  it('keeps trunk_across whole between examples and above the heaviest', () => {
    const xs = [acrossExample('easy', 1.2, 4), acrossExample('hard', 2.4, 8)];
    for (const x of [1.2, 1.8, 2.4, 3]) {
      const ref = interpolate(xs, x, 1e3).derived[Derived.TrunkAcross];
      for (const lean of [0, 10, 48]) assert.deepStrictEqual(interpolate(xs, x, lean).derived[Derived.TrunkAcross], ref, `key ${x} λ ${lean}`);
    }
    assert.strictEqual(interpolate(xs, 1, 24).derived[Derived.TrunkAcross]?.mu?.a0, 2);
  });

  it('makes the side-against-side part linear in λ, and the odd coordinates with it', () => {
    for (const [set, xs] of leaned()) {
      const ex = lightest(xs);
      const ref = new Map(allOf(interpolate(xs, ex.arcLoad, ex.lean)));
      const diff = (c: CoordinatePrior | undefined, base: string, phi: number): number => {
        if (c === undefined) return Number.NaN;
        if (c.parity === Parity.Odd) return evalDeg(c, base, phi)?.mu ?? Number.NaN;
        const [r, l] = sidedNames(base);
        return ((evalDeg(c, r, phi)?.mu ?? Number.NaN) - (evalDeg(c, l, phi)?.mu ?? Number.NaN)) / 2;
      };
      for (const lean of LEANS.filter((x) => x < ex.lean)) {
        const p = interpolate(xs, ex.arcLoad / 2, lean);
        assert.approximately(p.scale, lean / ex.lean, 1e-12, set);
        for (const [base, c] of allOf(p)) {
          if (c.mu === null || c.parity === Parity.Even) continue;
          for (const phi of PHIS) assert.approximately(diff(c, base, phi), (lean / ex.lean) * diff(ref.get(base), base, phi), 1e-9, `${set} ${base} λ ${lean} φ ${phi}`);
        }
      }
    }
  });

  it('leaves the blend between examples and above the heaviest independent of the lean', () => {
    const xs = [synthetic('hard', 2.4, 70, -20), synthetic('easy', 1.2, 40, -5), synthetic('mid', 1.6, 55, 10)];
    for (const x of [1.2, 1.4, 1.6, 2, 2.4, 3]) {
      const ref = interpolate(xs, x, 1e3);
      for (const lean of LEANS) {
        const p = interpolate(xs, x, lean);
        assert.strictEqual(p.scale, 1);
        assert.deepStrictEqual(p.coordinates, ref.coordinates, `key ${x} λ ${lean}`);
      }
    }
    for (const [set, xs2] of leaned())
      for (const lean of LEANS) assert.deepStrictEqual(interpolate(xs2, 9, lean).coordinates, interpolate(xs2, 9, 90).coordinates, set);
  });

  it('clamps the factor to [0, 1]', () => {
    const xs = [synthetic('easy', 1.2, 40, -5, 48)];
    assert.strictEqual(interpolate(xs, 1, 60).scale, 1);
    assert.strictEqual(interpolate(xs, 1, -5).scale, 0);
    assert.strictEqual(interpolate(xs, 1, 24).scale, 0.5);
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
    const p = priorAt(interpolate([synthetic('r', 1, 90, 0)], 1, 40), 'knee_flexion.R', 0.2);
    assert.approximately(p?.mu ?? 0, Math.PI / 2, 1e-12);
  });

  it('keys every committed example by the skeleton base names only', () => {
    for (const [drill, ex] of allExamples()) assert.deepStrictEqual(Object.keys(ex.coordinates).toSorted(), BASE_NAMES.toSorted(), drill);
  });
});
