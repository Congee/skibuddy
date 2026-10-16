import { assert, describe, it } from '@effect/vitest';
import { drillScenarios } from '../scripts/anatomy/drill-scenarios';
import { INTENSITIES, Intensity } from '../src/content/schema';
import { BodySide, SegmentKind, SEGMENTS } from '../src/viewer/figure';
import { transformPoint } from '../src/viewer/mat4';
import { poseToChannels, segmentMatrices } from '../src/viewer/pose';
import { solvePose, solveTable } from '../src/viewer/pose-solver';
import { TABLE_SCALE, decodeTable, encodeTable, hasTable, poseTable, samplePose } from '../src/viewer/pose-table';
import { POSE_DEFINITIONS, hasPose } from '../src/viewer/poses';
import { NEUTRAL } from '../src/viewer/poses/neutral';
import { STORK_TURNS } from '../src/viewer/poses/stork-turns';
import TABLES from '../src/viewer/poses/tables.json';
import { poseAngles } from './pose-angles';
import { MODERATE, poseAt } from './stork-poses';

const DEG = Math.PI / 180;
const close = (a: ReadonlyArray<number>, b: ReadonlyArray<number>, label: string): void =>
  a.forEach((x, i) => assert.closeTo(x, b[i] ?? Number.NaN, 1.5 * TABLE_SCALE, `${label}, channel ${i}`));

describe('pose tables', () => {
  it('hold every posed drill and nothing else', () => {
    assert.sameMembers(Object.keys(TABLES.drills), Object.keys(POSE_DEFINITIONS));
    for (const d of Object.keys(POSE_DEFINITIONS)) assert.isTrue(hasPose(d) && hasTable(d), d);
    assert.isFalse(hasPose('no-such-drill'));
  });

  it('match a fresh solve of each definition and the content scenarios; run `bun run poses` if not', () => {
    for (const [drill, def] of Object.entries(POSE_DEFINITIONS)) {
      const scenarios = drillScenarios(drill);
      for (const i of INTENSITIES) {
        const fresh = solveTable(def, scenarios[i]);
        const stored = poseTable(drill, i);
        assert.strictEqual(stored.length, fresh.length);
        fresh.forEach((p, k) => close(poseToChannels(stored[k] ?? p), poseToChannels(p), `${drill} ${i} sample ${k}`));
      }
    }
    close(poseToChannels(poseTable(null, Intensity.Moderate)[0] ?? NEUTRAL_POSE), poseToChannels(NEUTRAL_POSE), 'neutral');
  });

  it('round-trip a table through its encoding', () => {
    const table = solveTable(STORK_TURNS, MODERATE, 8);
    decodeTable(encodeTable(table)).forEach((p, k) => close(poseToChannels(p), poseToChannels(table[k] ?? p), `sample ${k}`));
  });

  it('fall back to the neutral stance for a drill without a pose', () => {
    assert.strictEqual(poseTable('no-such-drill', Intensity.Dynamic), poseTable(null, Intensity.Gentle));
  });
});

const NEUTRAL_POSE = solvePose(NEUTRAL, 0, null);

describe('neutral stance', () => {
  const pose = samplePose(poseTable(null, Intensity.Moderate), 0.37);
  const angles = poseAngles(pose);
  const world = segmentMatrices(pose);
  const ski = (side: BodySide): ReturnType<typeof segmentMatrices>[number] => {
    const m = world[SEGMENTS.findIndex((s) => s.kind === SegmentKind.Ski && s.side === side)];
    if (m === undefined) throw new Error('no ski');
    return m;
  };

  it('stands still and square, with no lean, lift or touch', () => {
    assert.deepStrictEqual(samplePose(poseTable(null, Intensity.Moderate), 0.9), pose);
    assert.strictEqual(pose.lean, 0);
    assert.strictEqual(pose.poleTouch, 0);
    assert.strictEqual(pose.counter, 0);
    assert.closeTo(angles.pelvisList, 0, 0.1);
  });

  it('stands both skis flat on the snow', () => {
    for (const side of [BodySide.Right, BodySide.Left]) {
      for (const z of [-0.7, 0, 0.8]) assert.closeTo(transformPoint(ski(side), [0, -0.01, z])[1], 0, 2e-3, `${side} at z=${z}`);
    }
  });

  it('flexes ankles, knees and hips into an athletic stance over mid-foot', () => {
    for (const side of [BodySide.Right, BodySide.Left]) {
      assert.isAbove(angles.knee[side], 50, side);
      assert.isBelow(angles.knee[side], 85, side);
      assert.closeTo(angles.dorsiflexion[side], 20, 1.5, side);
    }
    assert.isAbove(angles.comAhead, 0);
    assert.isBelow(angles.comAhead, 0.05);
    assert.isAtLeast(angles.trunkForward, 18);
  });

  it('is what a drill without radius stands in while its definition is a turn', () => {
    const straight = { speedMps: 8, slopeDeg: 12 };
    assert.strictEqual(solvePose(STORK_TURNS, 0.5, straight).lean, 0);
  });
});

const roll = (t: number): number => poseAngles(poseAt(t)).footRoll[BodySide.Right];

describe('stork joints the content names', () => {
  it('everts the outside foot at the subtalar joint, most in late shaping, released in the transition', () => {
    // Content ankle.inversion: begins in initiation, builds past the fall line, holds, then releases.
    assert.isAbove(roll(1 / 6), roll(0) + 0.3);
    assert.isAbove(roll(0.65), roll(1 / 6));
    assert.isAbove(roll(0.65), roll(5 / 6));
    assert.isBelow(Math.abs(poseAt(0).eversion), 1e-3);
  });

  it('draws the inside shoulder blade forward with the reach of the pole touch', () => {
    const touch = poseAt(1 / 24);
    const carry = poseAt(0.5);
    assert.isAbove(touch.insideGirdle.protraction, carry.insideGirdle.protraction + 2 * DEG);
    // Slightly forward and level otherwise (content shoulder-girdle.protraction).
    for (const p of [carry.outsideGirdle, carry.insideGirdle]) {
      assert.closeTo(p.protraction, 6 * DEG, 1e-3);
      assert.strictEqual(p.elevation, 0);
    }
  });
});
