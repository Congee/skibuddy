import type { Intensity } from '../content/schema';
import { TURN_SECONDS } from '../state/playback';
import { turnSeconds } from './gaze';
import { turnPath, turnStyle } from './turn-heading';

/** Real seconds one turn of a pose takes at this intensity; TURN_SECONDS for a motion with no speed. */
export const realTurnSeconds = (pose: string, intensity: Intensity): number => {
  const style = turnStyle(pose);
  return style === undefined ? TURN_SECONDS : turnSeconds(turnPath(pose, intensity), style.scenarios[intensity].speedMps);
};
