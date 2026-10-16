import type { PoseDefinition } from '../pose-definition';
import { CLOSED_STANCE, DEFAULT_REGULAR_TURN, REGULAR_TURNS, regularTurn } from './regular-turn';
import { STORK_TURNS } from './stork-turns';

/**
 * Pose definitions by id: a drill's own, or a kind of skiing's regular turn. A drill missing here
 * shows a regular turn if it turns, else the neutral stance. After adding one, run `bun run poses`.
 */
export const POSE_DEFINITIONS: Readonly<Record<string, PoseDefinition>> = {
  'stork-turns': STORK_TURNS,
  ...REGULAR_TURNS,
  'closed-stance-short-turns': regularTurn(CLOSED_STANCE),
};

/** The drill's motion is modelled. */
export const hasPose = (drill: string): boolean => Object.hasOwn(POSE_DEFINITIONS, drill);

/** The pose a drill shows: its own, a regular turn if it turns, else none (the neutral stance). */
export const motionFor = (drill: string, turns: boolean): string | null => (hasPose(drill) ? drill : turns ? DEFAULT_REGULAR_TURN : null);

/** How much shorter than regular the pose's poles are, metres. */
export const poleTrimOf = (pose: string | null): number => (pose === null ? 0 : (POSE_DEFINITIONS[pose]?.constraints.poleTrim ?? 0));
