import { Intensity, PHASES, levelAt } from './schema';
import { framesAt } from './effort';
import type { Activation, Movement, MuscleId, Side } from './schema';

/** One lit muscle on one side at a moment in the turn, 0..1. */
export interface MuscleLevel {
  readonly muscle: MuscleId;
  readonly side: Side;
  readonly level: number;
}

const MAX_INTENSITY = 3;

/**
 * Intensity at `t` in [0, 1) through one turn. Each phase owns a third of the
 * turn and peaks at its centre; the finish blends back into the next initiation.
 */
export const intensityAt = (activation: Activation, t: number, setting: Intensity = Intensity.Moderate): number => {
  const frames = activation.intensity.frames?.[setting];
  if (frames !== undefined) return framesAt(frames, frames, t) / MAX_INTENSITY;
  const values = PHASES.map((p) => levelAt(activation.intensity[p], setting));
  const n = values.length;
  const pos = (((t % 1) + 1) % 1) * n - 0.5;
  const i = Math.floor(pos);
  const frac = pos - i;
  const a = values.at(((i % n) + n) % n) ?? 0;
  const b = values.at((i + 1) % n) ?? 0;
  return (a + (b - a) * frac) / MAX_INTENSITY;
};

export const levelsAt = (movement: Movement, t: number, setting: Intensity = Intensity.Moderate): ReadonlyArray<MuscleLevel> =>
  movement.activations.map((a) => ({ muscle: a.muscle, side: a.side, level: intensityAt(a, t, setting) }));
