import type { Intensity } from '../content/schema';
import { TURN_SECONDS } from '../state/playback';
import { surfaceFor } from './surface';
import { turnStyle } from './turn-heading';

/**
 * Real seconds one turn of a pose takes at this intensity: its path length over its speed, or with the feet swinging about
 * a mass on the fall line, the mass's run of one spacing; TURN_SECONDS for a motion with no speed.
 */
export const realTurnSeconds = (pose: string, intensity: Intensity): number => {
  const style = turnStyle(pose);
  if (style === undefined) return TURN_SECONDS;
  const surface = surfaceFor(pose, intensity);
  return (surface.path.feet === undefined ? surface.speed : surface.spacing) / style.scenarios[intensity].speedMps;
};
