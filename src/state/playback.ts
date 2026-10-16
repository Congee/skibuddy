import * as Atom from 'effect/reactivity/Atom';
import { PHASES, Phase } from '../content/schema';

/** Seconds per turn while playing. */
export const TURN_SECONDS = 3;

/** Playback advances the turn, and so draws the figure, at most this often a second. */
export const PLAYBACK_FPS = 30;

/** Position through one turn, in [0, 1). */
export const turnTimeAtom = Atom.keepAlive(Atom.make(0.5));
/** Which way the shown turn goes; playback and the scrubber run left then right. */
export const TurnDirection = { Left: 'left', Right: 'right' } as const;
export type TurnDirection = (typeof TurnDirection)[keyof typeof TurnDirection];
/** The pose tables' turn has the right leg outside, a left turn; a right turn draws it mirrored. */
export const turnDirectionAtom = Atom.keepAlive(Atom.make<TurnDirection>(TurnDirection.Left));
export const otherTurn = (d: TurnDirection): TurnDirection => (d === TurnDirection.Left ? TurnDirection.Right : TurnDirection.Left);
/** The figure is drawn mirrored. */
export const isMirrored = (d: TurnDirection): boolean => d === TurnDirection.Right;
/** Names the turn and its outside ski under the figure. */
export const turnNote = (d: TurnDirection): string =>
  d === TurnDirection.Left ? "Turning left; outside ski is the skier's right." : "Turning right; outside ski is the skier's left.";
/** Starts paused; play is always the user's choice. */
export const playingAtom = Atom.keepAlive(Atom.make(false));

export const wrapTurn = (t: number): number => ((t % 1) + 1) % 1;

export const phaseAt = (t: number): Phase => PHASES[Math.min(PHASES.length - 1, Math.floor(wrapTurn(t) * PHASES.length))] ?? Phase.Initiation;

/** A left turn then a right turn, as one position in [0, 1). */
export const cycleOf = (direction: TurnDirection, t: number): number => ((direction === TurnDirection.Left ? 0 : 1) + wrapTurn(t)) / 2;

/** The turn, and the position in it, at a cycle position; wraps. */
export const turnAt = (cycle: number): { readonly direction: TurnDirection; readonly t: number } => {
  const c = wrapTurn(cycle) * 2;
  return c < 1 ? { direction: TurnDirection.Left, t: c } : { direction: TurnDirection.Right, t: c - 1 };
};
