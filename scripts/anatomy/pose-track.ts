// Prints the stork-turn pose track as JSON for build_anatomy.py, so both figures share src/viewer/pose.ts.
import { poseAt } from '../../src/viewer/pose';

const frames = Number(process.argv[2] ?? 24);
process.stdout.write(JSON.stringify(Array.from({ length: frames + 1 }, (_, f) => poseAt(f / frames))));
