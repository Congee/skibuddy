import { assert, describe, it } from '@effect/vitest';
import { drillScenarios, turnScenarios } from '../scripts/anatomy/drill-scenarios';
import { INTENSITIES } from '../src/content/schema';
import { PHASE_T, turnForcesAt } from '../src/physics/turn';
import { BodySide, SEGMENTS, SegmentKind } from '../src/viewer/figure';
import { transformPoint } from '../src/viewer/mat4';
import type { Mat4, Vec3 } from '../src/viewer/mat4';
import { centreOfMass, segmentMatrices } from '../src/viewer/pose';
import type { Pose } from '../src/viewer/pose';
import { solvePose } from '../src/viewer/pose-solver';
import { poseTable } from '../src/viewer/pose-table';
import { POSE_DEFINITIONS } from '../src/viewer/poses';
import { RegularTurn } from '../src/viewer/poses/regular-turn';

const H = 1e-4;
const DEG = Math.PI / 180;

const at = (world: ReadonlyArray<Mat4>, kind: SegmentKind, side: BodySide, local: Vec3): Vec3 => {
  const m = world[SEGMENTS.findIndex((s) => s.kind === kind && s.side === side)];
  if (m === undefined) throw new Error(`no ${side} ${kind}`);
  return transformPoint(m, local);
};
const legLength = (world: ReadonlyArray<Mat4>, side: BodySide): number => {
  const [a, b] = [at(world, SegmentKind.Thigh, side, [0, 0, 0]), at(world, SegmentKind.Ski, side, [0, 0, 0])];
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
};
const skiRoll = (world: ReadonlyArray<Mat4>, side: BodySide): number => {
  const [a, b] = [at(world, SegmentKind.Ski, side, [-0.045, 0, 0]), at(world, SegmentKind.Ski, side, [0.045, 0, 0])];
  return Math.atan2(b[1] - a[1], Math.hypot(b[0] - a[0], b[2] - a[2]));
};

const other = (s: BodySide): BodySide => (s === BodySide.Right ? BodySide.Left : s === BodySide.Left ? BodySide.Right : s);

/** Channels in one turn's frame; `mirror` flips them into the other turn's (odd channels negate, sides swap). */
const channels = (pose: Pose, mirror: boolean): Readonly<Record<string, number>> => {
  const world = segmentMatrices(pose);
  const com = centreOfMass(world);
  const sign = mirror ? -1 : 1;
  const side = (s: BodySide): BodySide => (mirror ? other(s) : s);
  const [hip, neck] = [at(world, SegmentKind.Trunk, BodySide.Center, [0, 0, 0]), at(world, SegmentKind.Trunk, BodySide.Center, [0, 1, 0])];
  const [rs, ls] = [at(world, SegmentKind.UpperArm, side(BodySide.Right), [0, 0, 0]), at(world, SegmentKind.UpperArm, side(BodySide.Left), [0, 0, 0])];
  return {
    trunkTilt: sign * Math.atan2(neck[0] - hip[0], neck[1] - hip[1]),
    trunkPitch: Math.atan2(neck[2] - hip[2], neck[1] - hip[1]),
    hipZ: hip[2],
    shoulderList: Math.atan2(rs[1] - ls[1], Math.hypot(rs[0] - ls[0], rs[2] - ls[2])),
    lean: sign * pose.lean,
    counter: sign * pose.counter,
    comX: sign * com[0],
    comY: com[1],
    comZ: com[2],
    rightLeg: legLength(world, side(BodySide.Right)),
    leftLeg: legLength(world, side(BodySide.Left)),
    rightRoll: sign * skiRoll(world, side(BodySide.Right)),
  };
};

const CASES = [...Object.values(RegularTurn), 'closed-stance-short-turns'].flatMap((drill) => INTENSITIES.map((i) => [drill, i] as const));

describe('turn transition', () => {
  it.each(CASES)('%s %s passes C1 from one turn into the next, either way', (drill, intensity) => {
    const def = POSE_DEFINITIONS[drill];
    if (def === undefined) throw new Error(`no ${drill}`);
    const scenario = drillScenarios(drill)[intensity];
    for (const mirrorOld of [false, true]) {
      // s < 0 ends the old turn, s > 0 starts the next one in the mirrored frame.
      const w = (s: number): Readonly<Record<string, number>> => channels(solvePose(def, s < 0 ? 1 + s : s, scenario), s < 0 ? mirrorOld : !mirrorOld);
      const [a, b, c, d] = [w(-2 * H), w(-H), w(H), w(2 * H)];
      for (const key of Object.keys(a)) {
        const [left, right] = [((b[key] ?? 0) - (a[key] ?? 0)) / H, ((d[key] ?? 0) - (c[key] ?? 0)) / H];
        const gap = ((c[key] ?? 0) - (b[key] ?? 0)) / (2 * H);
        const tol = 0.1 * Math.max(Math.abs(left), Math.abs(right)) + 0.05;
        assert.isBelow(Math.abs(left - right), tol, `${key} slope ${left.toFixed(3)} → ${right.toFixed(3)}`);
        assert.isBelow(Math.abs(gap - (left + right) / 2), tol, `${key} jumps at the switch`);
      }
    }
  });

  it.each(CASES)('%s %s rolls through the switch without dwelling flat', (drill, intensity) => {
    const def = POSE_DEFINITIONS[drill];
    if (def === undefined) throw new Error(`no ${drill}`);
    const scenario = drillScenarios(drill)[intensity];
    // A turn that starts barely tilted may pass flat slowly.
    if (turnForcesAt(turnScenarios(drill)[intensity], PHASE_T.initiation).tilt < 5 * DEG) return;
    assert.isAbove(solvePose(def, H, scenario).lean / H, 1, 'lean rad per turn');
    assert.isAbove(solvePose(def, 1 - H, scenario).lean / H, 1, 'lean rad per turn');
  });

  it.each(CASES)('%s %s switches on flat skis and even legs', (drill, intensity) => {
    const def = POSE_DEFINITIONS[drill];
    if (def === undefined) throw new Error(`no ${drill}`);
    const moguls = drill === RegularTurn.Moguls;
    // On moguls the switch is on a crest, so it is solved on that snow, not flat.
    const pose = moguls ? (poseTable(drill, intensity)[0] ?? solvePose(def, 0, null)) : solvePose(def, 0, drillScenarios(drill)[intensity]);
    const world = segmentMatrices(pose);
    assert.closeTo(pose.lean, 0, 1e-6);
    for (const side of [BodySide.Right, BodySide.Left]) assert.isBelow(Math.abs(skiRoll(world, side)), 3 * DEG, `${side} ski edged`);
    // The rigid skis rest at their own snow heights on a bump, so the legs differ by the boots' height step.
    const step = moguls ? at(world, SegmentKind.Ski, BodySide.Left, [0, 0, 0])[1] - at(world, SegmentKind.Ski, BodySide.Right, [0, 0, 0])[1] : 0;
    assert.closeTo(legLength(world, BodySide.Right) - legLength(world, BodySide.Left), step, 0.02);
  });
});
