import type { Intensity } from '../content/schema';
import { comRadius, turnForcesAt } from '../physics/turn';
import type { TurnScenario } from '../physics/turn';
import { SEGMENTS, SegmentKind } from './figure';
import type { Travel } from './pose-definition';
import { CLOSED_STANCE, CORRIDOR_SHARE, ROUND, ROUND_CORRIDOR, ROUND_FORCES, ROUND_PHASE, RegularTurn, TOPS, TOPS_CORRIDOR_SHARE, TURN_STYLES, ZIPPER_CORRIDOR, headingPhase, travelOf } from './poses/regular-turn';
import type { TurnStyle } from './poses/regular-turn';

export { CORRIDOR_SHARE };

/** A turn's shape on the slope: arc radius and the width of the corridor it swings across, metres. */
export interface TurnPath {
  readonly radius: number;
  readonly corridor: number;
  /** Turn time the track runs ahead of the edges: the round line crosses its centre line at the edge set, before the switch; absent, 0. */
  readonly phase?: number;
  /** Turn time the pivoted skis are most across, flat in the fall line at the switch; absent, they point along the track. */
  readonly set?: number;
  /** Turn time the braking load runs ahead of the keys; absent, 0. */
  readonly forces?: number;
  /** The feet's own peak-to-peak corridor about a mass running down the fall line, metres; absent, the feet run the arc's corridor. */
  readonly feet?: number;
  /** Downhill length of one turn with `feet`, metres: the mass's speed times the turn's period. */
  readonly length?: number;
  /** Skid off the track at `set`, radians, building from none at the switch; absent, the skis swing from the fall line at the switch. */
  readonly skid?: number;
}

/**
 * Most heading off the fall line, at the transition (the pivoted skis', at the set), radians: an arc of radius r from the fall line, where the path
 * reaches the corridor's edge, back to its centre line w/2 across, turns acos(1 - w/2r).
 */
export const transitionHeading = ({ radius, corridor }: TurnPath): number => Math.acos(Math.max(-1, 1 - corridor / (2 * radius)));

/** Most heading of a sinusoid w peak-to-peak across, L downhill per turn, off its centre line: atan(πw / 2L). */
export const sinusoidHeading = (corridor: number, length: number): number => Math.atan((Math.PI * corridor) / (2 * length));

/** Most heading of the feet's track off the fall line, radians, at the switch: their own sinusoid, else the arc's. */
export const trackMost = (path: TurnPath): number =>
  path.feet === undefined || path.length === undefined ? transitionHeading(path) : sinusoidHeading(path.feet, path.length);

const wrap = (t: number): number => ((t % 1) + 1) % 1;

/**
 * The feet's track heading off the fall line at turn time t, radians from downhill toward the turn's inside (+x): an
 * S-path, from the outside at the transition (t = 0), through the fall line mid-turn, to the inside at the next
 * transition (t = 1), where the mirrored next turn takes over with the opposite sign and no kink.
 */
export const trackHeadingAt = (t: number, path: TurnPath): number => -trackMost(path) * Math.cos(Math.PI * (wrap(t) + (path.phase ?? 0)));

/**
 * The skis' yaw off the fall line at turn time u in 0..1, unwrapped: carved, along the track; pivoted, the track plus a
 * skid from none at the switch to `skid` at the set, or without one, from the fall line at the switch to most across at the set.
 */
export const skisHeading = (u: number, path: TurnPath): number => {
  const track = -trackMost(path) * Math.cos(Math.PI * (u + (path.phase ?? 0)));
  if (path.set === undefined) return track;
  const swing = -Math.cos(Math.PI * headingPhase(u, path.set));
  return path.skid === undefined ? transitionHeading(path) * swing : track + path.skid * swing;
};

/** The skis' yaw off the fall line at turn time t, as skisHeading. */
export const headingAt = (t: number, path: TurnPath): number => skisHeading(wrap(t), path);

/** How far the skis are yawed off their track at turn time t, radians toward the turn's inside: the skid. */
export const pivotAt = (t: number, path: TurnPath): number => headingAt(t, path) - trackHeadingAt(t, path);

const jointDrop = (kind: SegmentKind): number => Math.abs(SEGMENTS.find((s) => s.kind === kind)?.joint[1] ?? 0);
/** The figure's hip-to-ankle length, metres. */
export const LEG_LENGTH = jointDrop(SegmentKind.Shin) + jointDrop(SegmentKind.Boot);

/**
 * Peak-to-peak swing of the feet about the mass, metres: the leg inclined by the turn's peak lean puts the feet
 * leg·sin(lean) out at the apex and under the mass at the switch; inferred, the mass taken at the hips.
 */
export const feetCorridor = (s: TurnScenario): number =>
  2 * LEG_LENGTH * Math.sin(Math.max(...Array.from({ length: 48 }, (_, k) => Math.abs(turnForcesAt(s, k / 48).tilt))));

/** For a motion with no turn of its own, such as a drill's: a short turn. */
const FALLBACK_RADIUS = 7;
/** The closed-stance drill runs in a corridor about 2 m wide, as regular-turn.ts sets its counter. */
const CLOSED_STANCE_CORRIDOR = 2;

export const MOGUL_POSE = RegularTurn.Moguls;
export const POWDER_POSE = RegularTurn.Powder;
export const TOPS_POSE = 'turns-on-the-tops';
export const CLOSED_STANCE_POSE = 'closed-stance-short-turns';
export const ROUND_POSE = 'round-line';
const STYLES: Readonly<Record<string, TurnStyle>> = { ...TURN_STYLES, [TOPS_POSE]: TOPS, [CLOSED_STANCE_POSE]: CLOSED_STANCE, [ROUND_POSE]: ROUND };

/** The path a pose's turn follows at this intensity. */
export const turnPath = (pose: string, intensity: Intensity): TurnPath => {
  const style = STYLES[pose];
  const radius = style?.scenarios[intensity].radiusM ?? FALLBACK_RADIUS;
  const set = style?.set === undefined ? {} : { set: style.set };
  if (pose === ROUND_POSE) return { radius, corridor: ROUND_CORRIDOR, phase: ROUND_PHASE, ...set, forces: ROUND_FORCES };
  const corridor =
    pose === MOGUL_POSE ? ZIPPER_CORRIDOR : pose === TOPS_POSE ? TOPS_CORRIDOR_SHARE * radius : pose === CLOSED_STANCE_POSE ? CLOSED_STANCE_CORRIDOR : CORRIDOR_SHARE * radius;
  const scenario = style?.scenarios[intensity];
  if (scenario === undefined || style?.period === undefined) return { radius, corridor, ...set };
  return { ...travelPath(scenario, style.set, travelOf(style) ?? { period: style.period }), corridor };
};

/** The feet's path under a mass running down the fall line, the feet swinging about it (arndt-1992, fis-freestyle-judging-2025). */
export const travelPath = (s: TurnScenario, set: number | undefined, travel: Pick<Travel, 'period'> & Partial<Pick<Travel, 'skid'>>): TurnPath => ({
  radius: s.radiusM,
  corridor: CORRIDOR_SHARE * s.radiusM,
  ...(set === undefined ? {} : { set }),
  feet: feetCorridor(s),
  length: s.speedMps * travel.period,
  ...(travel.skid === undefined ? {} : { skid: travel.skid }),
});

/** Most heading of the mass's sinusoid off the fall line: v·P downhill per turn, bending no tighter than its radius r, atan(vP / πr). */
export const massMost = (s: TurnScenario, travel: Travel): number => Math.atan((s.speedMps * travel.period) / (Math.PI * comRadius(s)));

/** The mass's travel heading off the fall line at turn time t, radians toward the inside, in step with the feet's track. */
export const massHeadingAt = (t: number, s: TurnScenario, travel: Travel): number => -massMost(s, travel) * Math.cos(Math.PI * wrap(t));

/** The pelvis's heading off the fall line, `lag` behind the mass's travel; before the switch, the mirrored last turn's. */
export const pelvisHeadingAt = (t: number, s: TurnScenario, travel: Travel): number => -massMost(s, travel) * Math.cos(Math.PI * (wrap(t) - travel.lag));

/** A pose's regular-turn style, with its speeds; none for a drill's own motion. */
export const turnStyle = (pose: string): TurnStyle | undefined => STYLES[pose];
