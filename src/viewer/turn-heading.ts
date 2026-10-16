import type { Intensity } from '../content/schema';
import { CLOSED_STANCE, CORRIDOR_SHARE, RegularTurn, TURN_STYLES } from './poses/regular-turn';
import type { TurnStyle } from './poses/regular-turn';

export { CORRIDOR_SHARE };

/** A turn's shape on the slope: arc radius and the width of the corridor it swings across, metres. */
export interface TurnPath {
  readonly radius: number;
  readonly corridor: number;
}

/**
 * Heading off the fall line at the transition, radians: an arc of radius r from the fall line, where the path
 * reaches the corridor's edge, back to its centre line w/2 across, turns acos(1 - w/2r).
 */
export const transitionHeading = ({ radius, corridor }: TurnPath): number => Math.acos(Math.max(-1, 1 - corridor / (2 * radius)));

/**
 * The skis' heading off the fall line at turn time t, radians from downhill toward the turn's inside (+x): an
 * S-path, from the outside at the transition (t = 0), through the fall line mid-turn, to the inside at the next
 * transition (t = 1), where the mirrored next turn takes over with the opposite sign and no kink.
 */
export const headingAt = (t: number, path: TurnPath): number => -transitionHeading(path) * Math.cos(Math.PI * (((t % 1) + 1) % 1));

/** Mogul lines run in a corridor about 2 m wide, as regular-turn.ts sets their counter. */
const MOGUL_CORRIDOR = 2;
/** For a motion with no turn of its own, such as a drill's: a short turn. */
const FALLBACK_RADIUS = 7;

export const MOGUL_POSE = RegularTurn.Moguls;
export const POWDER_POSE = RegularTurn.Powder;
export const CLOSED_STANCE_POSE = 'closed-stance-short-turns';
const STYLES: Readonly<Record<string, TurnStyle>> = { ...TURN_STYLES, [CLOSED_STANCE_POSE]: CLOSED_STANCE };
/** The closed-stance drill rehearses the mogul line on groomed snow, in the same corridor. */
const MOGUL_POSES: ReadonlySet<string> = new Set([MOGUL_POSE, CLOSED_STANCE_POSE]);

/** The path a pose's turn follows at this intensity. */
export const turnPath = (pose: string, intensity: Intensity): TurnPath => {
  const radius = STYLES[pose]?.scenarios[intensity].radiusM ?? FALLBACK_RADIUS;
  return { radius, corridor: MOGUL_POSES.has(pose) ? MOGUL_CORRIDOR : CORRIDOR_SHARE * radius };
};
