import { assert, describe, it } from '@effect/vitest';
import { INTENSITIES } from '../src/content/schema';
import type { Intensity } from '../src/content/schema';
import { BodySide } from '../src/viewer/figure';
import { mirrorPose } from '../src/viewer/pose';
import { poseTable } from '../src/viewer/pose-table';
import { RegularTurn } from '../src/viewer/poses/regular-turn';
import { surfaceFor } from '../src/viewer/surface';
import { ALONG, SIDES, clearance, ridden } from './ride-probes';
import type { Ridden } from './ride-probes';

const DEG = 180 / Math.PI;
const FALL_LINE_KINDS = [RegularTurn.Moguls, 'closed-stance-short-turns'] as const;

const table = (drill: string, i: Intensity): ReadonlyArray<Ridden> => {
  const s = surfaceFor(drill, i);
  const poses = poseTable(drill, i);
  return poses.map((p, k) => ridden(s, k / poses.length, p));
};

const height = (r: Ridden): readonly number[] => [r.ride.lift, r.com[1]];

describe('ride on moguls', () => {
  it('rests each rigid ski on the snow: its lowest point touches, none sinks in', () => {
    for (const drill of FALL_LINE_KINDS)
      for (const i of INTENSITIES)
        table(drill, i).forEach((r, k) => {
          for (const side of SIDES) {
            assert.closeTo(clearance(r, side), 0, 0.01, `${drill} ${i} ${k} ${side}`);
          }
        });
  });

  it('pitches each ski with the snow along it, within a few degrees', () => {
    for (const drill of FALL_LINE_KINDS)
      for (const i of INTENSITIES)
        table(drill, i).forEach((r, k) => {
          for (const side of SIDES) {
            const line = r.ski[side];
            const tail = line[0] ?? [0, 0, 0];
            const tip = line[ALONG] ?? [0, 0, 0];
            const run = tip[2] - tail[2];
            const ski = Math.atan2(tip[1] - tail[1], run) * DEG;
            const snow = Math.atan2(r.snow(tip) - r.snow(tail), run) * DEG;
            assert.closeTo(ski, snow, 3, `${drill} ${i} ${k} ${side}`);
          }
        });
  });

  it('carries the mass steadier than the snow under the boots rises and falls', () => {
    for (const drill of FALL_LINE_KINDS)
      for (const i of INTENSITIES) {
        const rows = table(drill, i);
        const com = rows.map((r) => r.com[1]);
        const boot = rows.map((r) => r.snow(r.ski[BodySide.Right][ALONG / 2] ?? [0, 0, 0]));
        const swing = Math.max(...com) - Math.min(...com);
        const relief = Math.max(...boot) - Math.min(...boot);
        assert.isAbove(relief, 0.3, `${drill} ${i}`);
        // Closed stance folds shallower, so its legs take less of the bumps; shares inferred.
        assert.isBelow(swing, (drill === RegularTurn.Moguls ? 0.65 : 0.85) * relief, `${drill} ${i}`);
      }
  });

  it('rides into the mirrored turn without a jump', () => {
    for (const drill of FALL_LINE_KINDS)
      for (const i of INTENSITIES) {
        const s = surfaceFor(drill, i);
        const poses = poseTable(drill, i);
        const first = poses[0];
        if (first === undefined) throw new Error(drill);
        const seq = [...poses.map((p, k) => ridden(s, k / poses.length, p)), ridden(s, 0, mirrorPose(first))].map(height);
        const steps = seq.slice(1).map((v, j) => Math.max(...v.map((x, n) => Math.abs(x - (seq[j]?.[n] ?? x)))));
        assert.isAtMost(steps.at(-1) ?? 0, 1.5 * Math.max(...steps.slice(0, -1)), `${drill} ${i}`);
      }
  });
});
