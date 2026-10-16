import { assert, describe, it } from '@effect/vitest';
import { INTENSITIES } from '../src/content/schema';
import { BodySide, SEGMENTS, SegmentKind } from '../src/viewer/figure';
import { hipLock, slopeLock } from '../src/viewer/hip-lock';
import { compose, identity, transformPoint } from '../src/viewer/mat4';
import type { Mat4, Vec3 } from '../src/viewer/mat4';
import { MIRROR, POSE_CHANNELS, mirrorPose, poseToChannels, segmentMatrices } from '../src/viewer/pose';
import type { Pose } from '../src/viewer/pose';
import { poseTable, samplePose } from '../src/viewer/pose-table';
import TABLES from '../src/viewer/poses/tables.json';
import { headingAt, turnPath } from '../src/viewer/turn-heading';

const ORIGIN: Vec3 = [0, 0, 0];
const DRILLS = Object.keys(TABLES.drills);
const END = 1 - 1e-6;
const other = (side: BodySide): BodySide => (side === BodySide.Left ? BodySide.Right : side === BodySide.Right ? BodySide.Left : side);
/** Each segment's twin across the midline. */
const TWIN = SEGMENTS.map((s) => SEGMENTS.findIndex((t) => t.kind === s.kind && t.side === other(s.side)));

const points = (root: Mat4, pose: Pose): ReadonlyArray<Vec3> =>
  segmentMatrices(pose).map((m) => transformPoint(compose(root, m), [0, 0.1, 0.05]));
const FEET: ReadonlyArray<SegmentKind> = [SegmentKind.Boot, SegmentKind.Ski];
/** Farthest gap over the body, or over the boots and skis alone. */
const farthest = (a: ReadonlyArray<Vec3>, b: ReadonlyArray<Vec3>, feet = false): number =>
  Math.max(
    ...a.map((p, i) => (FEET.includes(SEGMENTS[i]?.kind ?? SegmentKind.Pelvis) === feet ? Math.hypot(...p.map((v, k) => v - (b[i]?.[k] ?? Number.NaN))) : 0)),
  );
/** The boots take their edge from the outside shin alone, so they step a few mm at the switch. */
const FEET_GAP = 1e-2;

describe('alternating turns', () => {
  it('mirrors a pose back onto itself', () => {
    const pose = samplePose(poseTable('regular-moguls', 'moderate'), 0.3);
    const twice = poseToChannels(mirrorPose(mirrorPose(pose)));
    poseToChannels(pose).forEach((v, i) => assert.strictEqual(twice[i], v, POSE_CHANNELS[i]));
  });

  it('draws the mirrored pose as the reflected body at the transition', () => {
    for (const drill of DRILLS) {
      const start = samplePose(poseTable(drill, 'moderate'), 0);
      const reflected = points(MIRROR, start);
      const twin = points(identity(), mirrorPose(start));
      const mirrored = TWIN.map((j) => twin[j] ?? ORIGIN);
      assert.isBelow(farthest(reflected, mirrored), 1e-3, drill);
      assert.isBelow(farthest(reflected, mirrored, true), FEET_GAP, drill);
    }
  });

  it('ends each turn on the mirror of its start', () => {
    for (const drill of DRILLS)
      for (const i of INTENSITIES) {
        const table = poseTable(drill, i);
        const end = poseToChannels(samplePose(table, END));
        const next = poseToChannels(mirrorPose(samplePose(table, 0)));
        end.forEach((v, k) => assert.isBelow(Math.abs(v - (next[k] ?? Number.NaN)), 1e-4, `${drill} ${i} ${POSE_CHANNELS[k]}`));
      }
  });

  it('carries the counter on through the transition in moguls', () => {
    for (const drill of ['regular-moguls', 'closed-stance-short-turns']) {
      const table = poseTable(drill, 'moderate');
      const at = (t: number): number => samplePose(table, t).counter;
      // The next turn's counter, in this turn's terms, is its own with the sign flipped.
      assert.isBelow(Math.abs(at(END) + at(0)), 1e-4, drill);
      assert.isBelow(Math.abs(at(END) - at(0.98) - (-at(0.02) + at(0))), 5e-3, drill);
    }
  });

  it('keeps the figure still across the transition when the hips or the slope hold', () => {
    for (const drill of DRILLS) {
      const table = poseTable(drill, 'moderate');
      const path = turnPath(drill, 'moderate');
      const end = samplePose(table, END);
      const start = samplePose(table, 0);
      const locks: ReadonlyArray<readonly [string, Mat4, Mat4]> = [
        ['skis', identity(), identity()],
        ['hips', hipLock(end), hipLock(start)],
        ['slope', slopeLock(end, headingAt(END, path)), slopeLock(start, headingAt(0, path))],
      ];
      for (const [name, before, after] of locks) {
        // The next turn draws each body part with its twin segment, reflected.
        const next = points(compose(MIRROR, after), start);
        const mirrored = TWIN.map((j) => next[j] ?? ORIGIN);
        assert.isBelow(farthest(points(before, end), mirrored), 2e-3, `${drill} ${name}`);
        assert.isBelow(farthest(points(before, end), mirrored, true), FEET_GAP, `${drill} ${name} feet`);
      }
    }
  });
});
