import * as Atom from 'effect/reactivity/Atom';
import { PHASES, Phase } from '../content/schema';
import type { DrillId } from '../content/schema';

/** Seconds per turn while playing. */
export const TURN_SECONDS = 3;

/** Position through one turn, in [0, 1). */
export const turnTimeAtom = Atom.keepAlive(Atom.make(0.5));
/** Starts paused; the UI starts playback unless reduced motion is set. */
export const playingAtom = Atom.keepAlive(Atom.make(false));
/** The chosen drill; null means the first one. */
export const drillIdAtom = Atom.keepAlive(Atom.make<DrillId | null>(null));
/** Muscle-name pins on the figure. */
export const pinsAtom = Atom.keepAlive(Atom.make(true));

export const wrapTurn = (t: number): number => ((t % 1) + 1) % 1;

export const phaseAt = (t: number): Phase => PHASES[Math.min(PHASES.length - 1, Math.floor(wrapTurn(t) * PHASES.length))] ?? Phase.Initiation;

/** The middle of a phase, where its level peaks. */
export const phaseCentre = (phase: Phase): number => (PHASES.indexOf(phase) + 0.5) / PHASES.length;
