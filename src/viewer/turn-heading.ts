import type { Intensity } from '../content/schema';
import { CLOSED_STANCE, CORRIDOR_SHARE, ROUND, ROUND_CORRIDOR, ROUND_FORCES, ROUND_PHASE, RegularTurn, TOPS, TOPS_CORRIDOR_SHARE, TURN_STYLES, ZIPPER_CORRIDOR } from './poses/regular-turn';
import type { TurnStyle } from './poses/regular-turn';

export { CORRIDOR_SHARE };

/** A turn's shape on the slope: arc radius and the width of the corridor it swings across, metres. */
export interface TurnPath {
  readonly radius: number;
  readonly corridor: number;
  /** Turn time the path runs ahead of the edges: the round line crosses its centre line at the edge set, before the switch; absent, 0. */
  readonly phase?: number;
  /** Turn time the braking load runs ahead of the keys; absent, 0. */
  readonly forces?: number;
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
export const headingAt = (t: number, path: TurnPath): number => -transitionHeading(path) * Math.cos(Math.PI * ((((t % 1) + 1) % 1) + (path.phase ?? 0)));

/** The closed-stance drill runs in a corridor about 2 m wide, as regular-turn.ts sets its counter. */
const CLOSED_STANCE_CORRIDOR = 2;
/** For a motion with no turn of its own, such as a drill's: a short turn. */
const FALLBACK_RADIUS = 7;

export const MOGUL_POSE = RegularTurn.Moguls;
export const POWDER_POSE = RegularTurn.Powder;
export const TOPS_POSE = 'turns-on-the-tops';
export const CLOSED_STANCE_POSE = 'closed-stance-short-turns';
export const ROUND_POSE = 'round-line';
const STYLES: Readonly<Record<string, TurnStyle>> = { ...TURN_STYLES, [TOPS_POSE]: TOPS, [CLOSED_STANCE_POSE]: CLOSED_STANCE, [ROUND_POSE]: ROUND };

/** The path a pose's turn follows at this intensity. */
export const turnPath = (pose: string, intensity: Intensity): TurnPath => {
  const radius = STYLES[pose]?.scenarios[intensity].radiusM ?? FALLBACK_RADIUS;
  if (pose === ROUND_POSE) return { radius, corridor: ROUND_CORRIDOR, phase: ROUND_PHASE, forces: ROUND_FORCES };
  const corridor =
    pose === MOGUL_POSE ? ZIPPER_CORRIDOR : pose === TOPS_POSE ? TOPS_CORRIDOR_SHARE * radius : pose === CLOSED_STANCE_POSE ? CLOSED_STANCE_CORRIDOR : CORRIDOR_SHARE * radius;
  return { radius, corridor };
};

/** A pose's regular-turn style, with its speeds; none for a drill's own motion. */
export const turnStyle = (pose: string): TurnStyle | undefined => STYLES[pose];
