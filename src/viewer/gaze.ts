// Build time only: where the head looks through a turn, from the turn's shape on the slope.
import { HeadAim } from './pose-definition';
import type { HeadRule } from './pose-definition';
import { headingAt } from './turn-heading';
import type { TurnPath } from './turn-heading';

const DEG = Math.PI / 180;
/** Head on chest at most this far: walkers' head leads their path by up to 25-30° (imai-2001, hicheur-2005); a skier's cap, inferred. */
export const HEAD_LIMIT = 30 * DEG;
/** Seconds the head takes to settle on a new target, inferred. */
export const HEAD_LAG = 0.25;
/** Integration steps per turn along the path. */
const STEPS = 64;
const LAG_STEPS = 16;

/** Heading toward the first turn's inside over a run of mirrored turns, turn k spanning turn time [k, k + 1). */
export const runHeading = (t: number, path: TurnPath): number => (Math.abs(Math.floor(t) % 2) === 0 ? 1 : -1) * headingAt(t, path);

/** Seconds per turn: at the fall line the path's heading turns at speed / radius. */
export const turnSeconds = (path: TurnPath, speed: number): number => {
  const most = -headingAt(0, path);
  return (Math.PI * most * path.radius) / speed;
};

/** Lateral (toward the first turn's inside) and downhill travel from turn time a to b, in units of the turn's own travel. */
const travel = (a: number, b: number, path: TurnPath): readonly [number, number] => {
  const n = Math.max(1, Math.ceil(STEPS * Math.abs(b - a)));
  let x = 0;
  let y = 0;
  for (let i = 0; i < n; i++) {
    const h = runHeading(a + ((i + 0.5) * (b - a)) / n, path);
    x += Math.sin(h);
    y += Math.cos(h);
  }
  return [(x * (b - a)) / n, (y * (b - a)) / n];
};

/** Gaze heading off the fall line toward the first turn's inside at run time t, before the head's lag. */
const gazeAt = (rule: HeadRule, path: TurnPath, seconds: number, t: number): number => {
  switch (rule.aim) {
    case HeadAim.Arc: {
      // Apexes, where the path heads down the fall line, sit at k + 1/2.
      const apex = Math.floor(t + rule.early / seconds - 0.5) + 1.5;
      const [x, y] = travel(t, Math.max(apex, t + rule.lead / seconds), path);
      return Math.atan2(x, y);
    }
    case HeadAim.Line: {
      // The path crosses the centre line at each transition.
      const [x] = travel(Math.floor(t), t, path);
      const [, y] = travel(t, t + rule.turns, path);
      return Math.atan2(-x, y);
    }
    default:
      return 0;
  }
};

/** Gaze heading as `gazeAt`, the head settling on each target over HEAD_LAG. */
export const gazeHeading = (rule: HeadRule, path: TurnPath, speed: number, t: number): number => {
  if (rule.aim === HeadAim.Chest || rule.aim === HeadAim.FallLine) return 0;
  const seconds = turnSeconds(path, speed);
  let sum = 0;
  let weights = 0;
  for (let i = 0; i <= LAG_STEPS; i++) {
    const ago = (4 * HEAD_LAG * i) / LAG_STEPS;
    const w = Math.exp(-ago / HEAD_LAG) * (i === 0 || i === LAG_STEPS ? 0.5 : 1);
    sum += w * gazeAt(rule, path, seconds, t - ago / seconds);
    weights += w;
  }
  return sum / weights;
};
