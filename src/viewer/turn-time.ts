import type { Intensity } from '../content/schema';
import { taskFor } from '../physics/task';
import { turnProfile } from '../physics/turn';
import { Snow } from '../physics/edge';
import { TURN_SECONDS } from '../state/playback';
import { kindOfDrill } from './poses/regular-turn';
import { surfaceFor } from './surface';
import { turnStyle } from './turn-heading';

/**
 * Real seconds one turn of a pose takes at this intensity: its path length over its speed, or with the feet swinging about
 * a mass on the fall line, the mass's run of one spacing; a migrated drill's profile period; TURN_SECONDS for a motion with no speed.
 */
export const realTurnSeconds = (pose: string, intensity: Intensity): number => {
  const style = turnStyle(pose);
  if (style === undefined) return TURN_SECONDS;
  const kind = kindOfDrill(pose);
  if (kind !== null) {
    const task = taskFor(kind, intensity);
    return turnProfile(task, task.snow ?? Snow.HardGroomed).periodS;
  }
  const surface = surfaceFor(pose, intensity);
  return (surface.path.feet === undefined ? surface.speed : surface.spacing) / style.scenarios[intensity].speedMps;
};
