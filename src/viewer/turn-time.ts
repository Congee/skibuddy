import type { Intensity } from '../content/schema';
import { TURN_SECONDS } from '../state/playback';
import { surfaceFor } from './surface';
import { turnStyle } from './turn-heading';

/** Real seconds one turn of a pose takes at this intensity: its path length over its speed; TURN_SECONDS for a motion with no speed. */
export const realTurnSeconds = (pose: string, intensity: Intensity): number => {
  const style = turnStyle(pose);
  return style === undefined ? TURN_SECONDS : surfaceFor(pose, intensity).speed / style.scenarios[intensity].speedMps;
};
