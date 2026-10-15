// Prints the stork-turn pose track and the binding geometry as JSON for build_anatomy.py,
// so both figures share src/viewer/pose.ts and src/viewer/equipment.ts.
import { EQUIPMENT, deltaAngle, stackHeight } from '../../src/viewer/equipment';
import { HEEL_ROOM, TOE_ROOM } from '../../src/viewer/gear-fit';
import { solvePose } from '../../src/viewer/pose';

const frames = Number(process.argv[2] ?? 24);
const binding = {
  bootBoardRamp: EQUIPMENT.bootBoardRamp,
  deltaAngle: deltaAngle(EQUIPMENT),
  stackHeight: stackHeight(EQUIPMENT),
  skiThickness: EQUIPMENT.skiThickness,
  heelRoom: HEEL_ROOM,
  toeRoom: TOE_ROOM,
};
process.stdout.write(JSON.stringify({ binding, frames: Array.from({ length: frames + 1 }, (_, f) => solvePose(f / frames)) }));
