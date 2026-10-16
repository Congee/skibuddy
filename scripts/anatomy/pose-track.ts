// Prints the pose tracks build_anatomy.py bakes, one clip per posed drill and intensity plus the neutral
// stance, and the binding geometry, as JSON; both figures read the same tables (src/viewer/poses/tables.json).
import { INTENSITIES } from '../../src/content/schema';
import { NEUTRAL_CLIP, motionClipName } from '../../src/viewer/anatomy-names';
import { EQUIPMENT, deltaAngle, stackHeight } from '../../src/viewer/equipment';
import { HEEL_ROOM, TOE_ROOM } from '../../src/viewer/gear-fit';
import { ARM_ABDUCTION, ARM_FLEXION, ARM_LEAN, ARM_LEAN_SHOULDER, ARM_REACH_ELBOW, CARRY_HEADING, CARRY_TRAIL, FOREARM_FLEXION, PLANT_AHEAD, PLANT_SIDE, POLE, balanceRoll, mirrorPose } from '../../src/viewer/pose';
import type { Pose } from '../../src/viewer/pose';
import { hasTable, poseTable, samplePose } from '../../src/viewer/pose-table';
import { POSE_DEFINITIONS, poleTrimOf } from '../../src/viewer/poses';
import { rideOf } from '../../src/viewer/ride';
import { SurfaceKind, surfaceFor } from '../../src/viewer/surface';
import { drillScenarios } from './drill-scenarios';

const frames = Number(process.argv[2] ?? 24);
const binding = {
  bootBoardRamp: EQUIPMENT.bootBoardRamp,
  deltaAngle: deltaAngle(EQUIPMENT),
  stackHeight: stackHeight(EQUIPMENT),
  skiThickness: EQUIPMENT.skiThickness,
  heelRoom: HEEL_ROOM,
  toeRoom: TOE_ROOM,
};
const arms = { abduction: ARM_ABDUCTION, flexion: ARM_FLEXION, forearmFlexion: FOREARM_FLEXION, lean: ARM_LEAN, leanShoulder: ARM_LEAN_SHOULDER, reachElbow: ARM_REACH_ELBOW };
const drills = Object.keys(POSE_DEFINITIONS);
const trim = Object.fromEntries(drills.flatMap((d) => INTENSITIES.map((i) => [motionClipName(d, i), poleTrimOf(d)])));
const pole = { basketUp: POLE.basketUp, carry: POLE.carry, carryHeading: CARRY_HEADING, carryTrail: CARRY_TRAIL, plantSide: PLANT_SIDE, plantAhead: PLANT_AHEAD, trim };
type Frame = Pose & { readonly roll: number; readonly insideTip?: number };
const track = (drill: string | null, i: (typeof INTENSITIES)[number]): ReadonlyArray<Frame> => {
  const table = poseTable(drill, i);
  const surface = drill === null ? null : surfaceFor(drill, i);
  // On moguls the inside tip stands over the outside one by the snow between them.
  const ridden = (pose: Pose, t: number, sign: number): Frame => {
    const rolled = { ...pose, roll: balanceRoll(pose) };
    return surface?.kind === SurfaceKind.Moguls ? { ...rolled, insideTip: sign * rideOf(surface, t, samplePose(table, t)).insideTip } : rolled;
  };
  // The last frame is the next turn's first, mirrored.
  return Array.from({ length: frames + 1 }, (_, f) =>
    f === frames ? ridden(mirrorPose(samplePose(table, 0)), 0, -1) : ridden(samplePose(table, f / frames), f / frames, 1),
  );
};
for (const d of drills) if (!hasTable(d)) throw new Error(`${d} has no pose table; run \`bun run poses\``);
const tracks: Record<string, ReadonlyArray<Frame>> = { [NEUTRAL_CLIP]: track(null, 'moderate') };
for (const d of drills) for (const i of INTENSITIES) tracks[motionClipName(d, i)] = track(d, i);
// The scenarios ride into the model, so tests can tie the bake to the content.
const scenarios = Object.fromEntries(drills.map((d) => [d, drillScenarios(d)]));
process.stdout.write(JSON.stringify({ binding, arms, pole, scenarios, tracks }));
