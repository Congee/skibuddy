import { assert, describe, it } from '@effect/vitest';
import { INTENSITIES } from '../src/content/schema';
import type { Intensity } from '../src/content/schema';
import { BodySide } from '../src/viewer/figure';
import { mirrorPose } from '../src/viewer/pose';
import { poseTable } from '../src/viewer/pose-table';
import { RegularTurn } from '../src/viewer/poses/regular-turn';
import { surfaceFor } from '../src/viewer/surface';
import { TOPS_POSE } from '../src/viewer/turn-heading';
import { ALONG, SIDES, clearance, ridden } from './ride-probes';
import type { Ridden } from './ride-probes';

const DEG = 180 / Math.PI;
const FALL_LINE_KINDS = [RegularTurn.Moguls, TOPS_POSE] as const;

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
        // The zipper's rut rides lower bumps than the crests it passes.
        assert.isAbove(relief, 0.4 * surfaceFor(drill, i).relief, `${drill} ${i}`);
        // The legs take most of the bumps; share inferred.
        assert.isBelow(swing, 0.35 * relief, `${drill} ${i}`);
      }
  });

  it('lays the zipper snow level under each pressed ski, both edges within 2 cm of it', () => {
    // The skis edge on the rut's floor, not on its walls; the drawn edges neither float nor sink.
    for (const i of INTENSITIES)
      table(RegularTurn.Moguls, i).forEach((r, k) => {
        for (const side of SIDES) {
          const line = r.ski[side];
          const gap = Math.min(...line.map((p) => p[1] - r.ground(p)));
          for (const edge of r.edges[side])
            edge.forEach((p, j) => {
              const c = line[j] ?? p;
              assert.isAtMost(Math.abs(gap) + Math.abs(r.ground(p) - r.ground(c)), 0.02, `${i} ${k} ${side} ${j}`);
            });
          assert.isAtMost(Math.abs(r.ride.outsideBank) * DEG, 4, `${i} ${k}`);
          assert.isAtMost(Math.abs(r.ride.insideBank) * DEG, 4, `${i} ${k}`);
        }
      });
  });

  it('meets the next mogul tip first, the snow rising ahead from mid-turn', () => {
    // The tip touches the next mogul before any other part of the ski (fis-freestyle-judging-2025 p28).
    for (const i of INTENSITIES) {
      const { trough } = surfaceFor(RegularTurn.Moguls, i);
      const rows = table(RegularTurn.Moguls, i);
      rows.forEach((r, k) => {
        const t = k / rows.length;
        for (const side of SIDES) {
          if (t >= 0.55 && t <= 0.9) assert.isAbove(side === BodySide.Right ? r.ride.outside : r.ride.inside, 0, `${i} ${k} ${side} tip up`);
          const tip = r.ski[side][ALONG] ?? [0, 0, 0];
          if (t >= trough && t <= trough + 0.1) assert.closeTo(tip[1] - r.snow(tip), 0, 0.003, `${i} ${k} ${side} tip on the face`);
        }
      });
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
