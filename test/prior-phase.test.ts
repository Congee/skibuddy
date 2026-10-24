import { assert, describe, it } from '@effect/vitest';
import { phaseAt, phaseMapOf, phaseOn } from '../src/viewer/prior/prior';
import type { CellEvents, PhaseAnchors } from '../src/viewer/prior/prior';

// regular-gs's canonical anchors (scripts/prior/build.ts EVENTS: sporri-2016, kroll-2015).
const GS: PhaseAnchors = { engagement: 0.25, fallLine: 0.5, forcePeak: 0.68, release: 0.8, sources: ['sporri-2016', 'kroll-2015'] };
const OPTIONAL = ['engagement', 'forcePeak', 'release'] as const;

const increasing = (pairs: ReadonlyArray<readonly [number, number]>): boolean =>
  pairs.every(([t, p], i) => i === 0 || (t > (pairs[i - 1]?.[0] ?? -1) && p > (pairs[i - 1]?.[1] ?? -1)));

const steps = (lo: number, hi: number, n: number): number[] => Array.from({ length: n }, (_, i) => lo + ((hi - lo) * i) / (n - 1));

describe('phase registration', () => {
  it('is the identity when the cell events equal the canonical anchors', () => {
    const events: CellEvents = { engagement: 0.25, fallLine: 0.5, forcePeak: 0.68, release: 0.8 };
    assert.deepStrictEqual(phaseMapOf(GS, events).dropped, []);
    for (let t = 0; t < 1; t += 0.01) assert.closeTo(phaseAt(GS, events, t), t, 1e-12);
  });

  it('maps the cell fall line to ½ for any monotone event set', () => {
    for (const fallLine of [0.3, 0.42, 0.55, 0.7]) {
      const events: CellEvents = { engagement: fallLine - 0.2, fallLine, forcePeak: fallLine + 0.1, release: fallLine + 0.25 };
      assert.closeTo(phaseAt(GS, events, fallLine), 0.5, 1e-12);
    }
  });

  it('stays monotone over a sweep of event sets and drops only an offending anchor', () => {
    for (const engagement of steps(0.05, 0.45, 5))
      for (const fallLine of steps(0.3, 0.7, 5))
        for (const forcePeak of steps(0.35, 0.8, 5))
          for (const release of steps(0.6, 0.98, 5)) {
            const events: CellEvents = { engagement, fallLine, forcePeak, release };
            const map = phaseMapOf(GS, events);
            assert.isTrue(increasing(map.pairs));
            for (const name of map.dropped as ReadonlyArray<(typeof OPTIONAL)[number]>) {
              const phi = GS[name] ?? 0;
              assert.isFalse(increasing([...map.pairs, [events[name], phi] as const].toSorted((a, b) => a[0] - b[0])), name);
            }
            for (const name of OPTIONAL) if (!map.dropped.includes(name)) assert.isTrue(map.pairs.some(([t, p]) => t === events[name] && p === GS[name]), name);
            let last = -1;
            for (let t = 0; t < 1; t += 0.02) {
              const phi = phaseOn(map, t);
              assert.isTrue(phi > last);
              last = phi;
            }
          }
  });

  it('is two segments through the fall line with no anchors', () => {
    const events: CellEvents = { engagement: 0.2, fallLine: 0.4, forcePeak: 0.6, release: 0.9 };
    const map = phaseMapOf(null, events);
    assert.deepStrictEqual(map.pairs, [[0, 0], [0.4, 0.5], [1, 1]]);
    assert.closeTo(phaseOn(map, 0.2), 0.25, 1e-12);
    assert.closeTo(phaseOn(map, 0.7), 0.75, 1e-12);
  });
});
