import type { Contraction } from '../../content/schema';
import { Snow } from '../../physics/edge';
import { turnProfile } from '../../physics/turn';
import { COORDINATES, SEGMENT_NAMES } from '../skeleton';
import { LEG_CAPACITIES } from './capacities';
import type { Capacity } from './capacities';
import { ARM_CAPACITIES, TRUNK_CAPACITIES } from './capacities-trunk';
import { distributeFrame, modeOf } from './distribute';
import type { DistributedFrame, MomentFrame } from './distribute';
import { forward, value } from './fk';
import { jointMomentsOf, NAMES, pressuresOf } from './turn';
import type { TurnMotion } from './turn';

/** The solved turn's net joint moments (motion-model.md §6.1), framed for `distribute.ts`. */

/** Each effort coordinate's net moment, N·m along its positive sense: `effortOf` before `normalisedEffort`. */
export const momentsOf = jointMomentsOf;

/** A solved or stored turn: its problem and q per frame over both turns. */
export type SolvedTurn = Pick<TurnMotion, 'problem' | 'q'>;

const ALONG = NAMES.indexOf('pressure_along');

/** The moments at `frame` of the solved turn (below `goals.length`; the next turn is its mirror), as `reportOf` poses it. */
export const momentsAt = (motion: SolvedTurn, frame: number): MomentFrame => {
  const tp = motion.problem;
  const g = tp.goals[frame];
  const x = motion.q[frame];
  if (g === undefined || x === undefined) throw new RangeError(`momentsAt: no frame ${frame}`);
  const q = Array.from(x);
  const w = forward(q.slice(0, COORDINATES.length), g.origin, SEGMENT_NAMES, g.ref);
  const pressures = pressuresOf(w, tp.ski, g.edge, g.normal, q[ALONG] ?? 0);
  return { t: g.t, nm: Object.fromEntries(momentsOf(g, q, w, pressures).map((m) => [m.name, value(m.nm)])) };
};

/** One turn's duration from the kind's profile, s. */
export const turnPeriodOf = (motion: SolvedTurn): number => {
  const { drill, kind, task } = motion.problem;
  if (kind === null || task === null) throw new Error(`${drill}: no turn period on the legacy path`);
  return turnProfile(task, task.snow ?? Snow.HardGroomed).periodS;
};

/** Each coordinate's loaded-group mode at `frame`, from q̇ over the two-turn cycle. */
export const modesAt = (motion: SolvedTurn, frame: number, moments: MomentFrame): Record<string, Contraction | null> => {
  const periodS = 2 * turnPeriodOf(motion);
  return Object.fromEntries(
    Object.entries(moments.nm).map(([name, nm]) => {
      const i = NAMES.indexOf(name);
      return [name, modeOf(motion.q.map((f) => f[i] ?? 0), frame, nm, periodS)];
    }),
  );
};

/** `distributeFrame`'s rows at a frame's hip flexions, degrees: one array per posture, since layouts are cached by identity. */
export type CapsAt = (hipFlexionDeg: { readonly R: number; readonly L: number }) => ReadonlyArray<Capacity>;

const CONSTANT: ReadonlyArray<Capacity> = [...LEG_CAPACITIES, ...TRUNK_CAPACITIES, ...ARM_CAPACITIES];
/** Today's posture-constant rows: the legs at the skiing posture. */
export const constantCaps: CapsAt = () => CONSTANT;

const DEG = 180 / Math.PI;
const HIP_R = NAMES.indexOf('hip_flexion.R');
const HIP_L = NAMES.indexOf('hip_flexion.L');

/** Every frame of the solved turn shared among the muscles. */
export const distributeTurn = (motion: SolvedTurn, capsAt: CapsAt = constantCaps): DistributedFrame[] =>
  motion.problem.goals.map((_, k) => {
    const moments = momentsAt(motion, k);
    const q = motion.q[k];
    return distributeFrame(moments, modesAt(motion, k, moments), capsAt({ R: (q?.[HIP_R] ?? 0) * DEG, L: (q?.[HIP_L] ?? 0) * DEG }));
  });
