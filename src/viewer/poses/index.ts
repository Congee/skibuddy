import type { PoseDefinition } from '../pose-definition';
import { STORK_TURNS } from './stork-turns';

/**
 * Pose definitions by drill id. A drill missing here shows the neutral stance.
 * After adding one, run `bun run poses` to solve its tables.
 */
export const POSE_DEFINITIONS: Readonly<Record<string, PoseDefinition>> = {
  'stork-turns': STORK_TURNS,
};

/** The drill's motion is modelled. */
export const hasPose = (drill: string): boolean => Object.hasOwn(POSE_DEFINITIONS, drill);
