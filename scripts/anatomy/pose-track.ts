// Prints the stork-turn pose tracks, one per intensity, and the binding geometry as JSON for
// build_anatomy.py, so both figures share src/viewer/pose.ts and src/viewer/equipment.ts.
import { INTENSITIES, Intensity } from '../../src/content/schema';
import { EQUIPMENT, deltaAngle, stackHeight } from '../../src/viewer/equipment';
import { HEEL_ROOM, TOE_ROOM } from '../../src/viewer/gear-fit';
import { ARM_ABDUCTION, ARM_FLEXION, FOREARM_FLEXION, solvePose } from '../../src/viewer/pose';
import { drillScenarios } from './drill-scenarios';

const scenarios = drillScenarios();

const frames = Number(process.argv[2] ?? 24);
const binding = {
  bootBoardRamp: EQUIPMENT.bootBoardRamp,
  deltaAngle: deltaAngle(EQUIPMENT),
  stackHeight: stackHeight(EQUIPMENT),
  skiThickness: EQUIPMENT.skiThickness,
  heelRoom: HEEL_ROOM,
  toeRoom: TOE_ROOM,
};
const arms = { abduction: ARM_ABDUCTION, flexion: ARM_FLEXION, forearmFlexion: FOREARM_FLEXION };
const track = (i: Intensity): ReadonlyArray<unknown> => Array.from({ length: frames + 1 }, (_, f) => solvePose(f / frames, scenarios[i]));
const tracks = Object.fromEntries(INTENSITIES.map((i) => [i, track(i)]));
// The scenarios ride into the model, so tests can tie the bake to the content.
process.stdout.write(JSON.stringify({ binding, arms, scenarios, frames: tracks[Intensity.Moderate], tracks }));
