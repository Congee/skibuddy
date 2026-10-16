import { turnScenarios } from '../scripts/anatomy/drill-scenarios';
import { INTENSITIES } from '../src/content/schema';
import type { TurnScenario } from '../src/physics/turn';
import type { Pose } from '../src/viewer/pose';
import { solvePose } from '../src/viewer/pose-solver';
import { poseTable, samplePose } from '../src/viewer/pose-table';
import { STORK_TURNS } from '../src/viewer/poses/stork-turns';

export const SCENARIOS = turnScenarios();
export const MODERATE = SCENARIOS.moderate;

const intensityOf = (s: TurnScenario): (typeof INTENSITIES)[number] => {
  const i = INTENSITIES.find((k) => SCENARIOS[k] === s);
  if (i === undefined) throw new Error('not one of the stork scenarios');
  return i;
};

/** The stork pose the browser shows: a lookup in the stored tables. */
export const poseAt = (t: number, s: TurnScenario = MODERATE): Pose => samplePose(poseTable('stork-turns', intensityOf(s)), t);

/** The stork pose solved afresh. */
export const solvedPose = (t: number, s: TurnScenario = MODERATE): Pose => solvePose(STORK_TURNS, t, s);
