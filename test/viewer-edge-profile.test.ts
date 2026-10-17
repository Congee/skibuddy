import { assert, describe, it } from '@effect/vitest';
import { turnScenarios } from '../scripts/anatomy/drill-scenarios';
import { INTENSITIES } from '../src/content/schema';
import type { Intensity } from '../src/content/schema';
import { turnForcesAt } from '../src/physics/turn';
import { BodySide } from '../src/viewer/figure';
import { transformPoint } from '../src/viewer/mat4';
import { segmentMatrices, skiIndex } from '../src/viewer/pose';
import { poseTable } from '../src/viewer/pose-table';
import { RegularTurn } from '../src/viewer/poses/regular-turn';
import { rideOf } from '../src/viewer/ride';
import { surfaceFor } from '../src/viewer/surface';

const DEG = 180 / Math.PI;
const N = 96;
const TIMES = Array.from({ length: N + 1 }, (_, k) => k / N);
/**
 * The edge builds ahead of the load, which peaks about two thirds through the turn (carv-ligety-2024, reid-2020 Fig 4,
 * sporri-2016-sidecut Fig 4). The Carv traces and the two race figures put the edge's peak between 0.35 and 0.6 of the
 * turn (spread as transcribed, inferred).
 */
const PEAK: readonly [number, number] = [0.35, 0.6];

const edgeShares = (kind: RegularTurn, i: Intensity): ((t: number) => number) => {
  const s = surfaceFor(kind, i);
  const table = poseTable(kind, i);
  const n = table.length;
  const edges = table.map((p, k) => {
    const bank = rideOf(s, k / n, p).outsideBank;
    const w = segmentMatrices({ ...p, rise: 0 });
    const m = w[skiIndex(BodySide.Right)];
    if (m === undefined) throw new Error('no outside ski');
    const o = transformPoint(m, [0, 0, 0]);
    const a = transformPoint(m, [1, 0, 0]);
    return Math.abs(Math.asin(a[1] - o[1]) - bank) * DEG;
  });
  const peak = Math.max(...edges);
  return (t: number): number => {
    const x = t * n;
    const k = Math.floor(x);
    const u = x - k;
    return ((edges[k % n] ?? 0) * (1 - u) + (edges[(k + 1) % n] ?? 0) * u) / peak;
  };
};

describe('outside edge profile', () => {
  for (const kind of [RegularTurn.Carving, RegularTurn.Cruising, RegularTurn.ShortTurns])
    for (const i of INTENSITIES)
      it(`${kind} ${i} builds its edge from flat at the switch to one peak ahead of the load, then releases it`, () => {
        const share = edgeShares(kind, i);
        assert.isAtMost(share(0), 0.05, 'switch');
        const shares = TIMES.map(share);
        const peak = TIMES[shares.indexOf(Math.max(...shares))] ?? 0;
        assert.isAtLeast(peak, PEAK[0], 'peak');
        assert.isAtMost(peak, PEAK[1], 'peak');
        const scenario = turnScenarios(kind)[i];
        const loads = TIMES.map((t) => turnForcesAt(scenario, t).load);
        assert.isBelow(peak, TIMES[loads.indexOf(Math.max(...loads))] ?? 1, 'ahead of the load');
        // One build and one release, never re-edging within the turn.
        for (const [k, t] of TIMES.entries()) {
          if (k === 0) continue;
          const step = (shares[k] ?? 0) - (shares[k - 1] ?? 0);
          if (t <= peak) assert.isAtLeast(step, -1e-9, `build t=${t.toFixed(3)}`);
          else assert.isAtMost(step, 1e-9, `release t=${t.toFixed(3)}`);
        }
      });
});
