import { drillScenarios } from '../scripts/anatomy/drill-scenarios';
import type { Intensity } from '../src/content/schema';
import { MIGRATED } from '../src/viewer/motion/q-table';
import { solveTable } from '../src/viewer/pose-solver';
import { type PoseTable, decodeTable, encodeTable, poseTable } from '../src/viewer/pose-table';
import { POSE_DEFINITIONS } from '../src/viewer/poses';
import { surfaceFor } from '../src/viewer/surface';

// The old solver's table: migrated drills ship the new motion, so their old-solver checks solve it afresh.
const solved = new Map<string, PoseTable>();
export const oldTable = (drill: string, i: Intensity): PoseTable => {
  const def = POSE_DEFINITIONS[drill];
  if (!MIGRATED.has(drill) || def === undefined) return poseTable(drill, i);
  const key = `${drill} ${i}`;
  const hit = solved.get(key);
  if (hit !== undefined) return hit;
  const table = decodeTable(encodeTable(solveTable(def, drillScenarios(drill)[i], surfaceFor(drill, i))));
  solved.set(key, table);
  return table;
};
