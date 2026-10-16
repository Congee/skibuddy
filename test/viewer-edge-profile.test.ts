import { assert, describe, it } from '@effect/vitest';
import { INTENSITIES, Intensity } from '../src/content/schema';
import { BodySide } from '../src/viewer/figure';
import { transformPoint } from '../src/viewer/mat4';
import { segmentMatrices, skiIndex } from '../src/viewer/pose';
import { poseTable } from '../src/viewer/pose-table';
import { RegularTurn } from '../src/viewer/poses/regular-turn';
import { rideOf } from '../src/viewer/ride';
import { surfaceFor } from '../src/viewer/surface';

const DEG = 180 / Math.PI;
const TIMES = [0.042, 0.083, 0.125, 0.167, 0.25, 0.33, 0.42, 0.5, 0.6, 0.67, 0.75, 0.833, 0.917, 0.96];
/**
 * Outside-ski edge as a share of its peak: flat at the switch, most of it by the fall line, held past it and released
 * through the finish. From the Carv edge traces (carv-ligety-2024), the GS edge build in sporri-2016-sidecut Fig 4
 * and the slalom one in reid-2020 Fig 4.
 */
const TARGET: Readonly<Record<Intensity, ReadonlyArray<number>>> = {
  [Intensity.Dynamic]: [0.3, 0.45, 0.58, 0.69, 0.85, 0.95, 1, 0.98, 0.93, 0.88, 0.79, 0.66, 0.45, 0.28],
  [Intensity.Moderate]: [0.22, 0.37, 0.5, 0.62, 0.8, 0.92, 0.99, 1, 0.95, 0.9, 0.81, 0.67, 0.45, 0.27],
  // Inferred: slower to tip and later to peak than the instructor.
  [Intensity.Gentle]: [0.15, 0.28, 0.4, 0.52, 0.71, 0.86, 0.96, 1, 0.97, 0.92, 0.83, 0.68, 0.44, 0.25],
};
const MEASURED = 0.07;
// Inferred: the carved profile carried over to the skidded and shorter turns, and to the gentle row.
const CARRIED = 0.1;

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
      it(`${kind} ${i} builds its edge from flat at the switch as the measured share of its peak`, () => {
        const share = edgeShares(kind, i);
        const band = kind === RegularTurn.Carving && i !== Intensity.Gentle ? MEASURED : CARRIED;
        assert.isAtMost(share(0), 0.05, 'switch');
        TIMES.forEach((t, j) => assert.closeTo(share(t), TARGET[i][j] ?? Number.NaN, band, `t=${t}`));
      });
});
