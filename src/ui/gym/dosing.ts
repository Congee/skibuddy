import { DosingGoal } from '../../content/schema';
import type { DosingRange, DosingSuggestion, Span } from '../../content/schema';

export const DOSING_DISCLAIMER = 'General guidance, not a prescription; adjust with a coach or physio.';

const span = (s: Span): string => (s.min === s.max ? `${s.min}` : `${s.min}–${s.max}`);

/** Rest in seconds, or in minutes when both ends are whole minutes. */
export const formatRest = (s: Span): string =>
  s.min % 60 === 0 && s.max % 60 === 0 ? `${span({ min: s.min / 60, max: s.max / 60 })} min` : `${span(s)} s`;

const each = (perSide: boolean): string => (perSide ? ' each side' : '');

/** "2–3 sets × 8–12 reps each side" or "2–3 sets × 20–30 s hold each side". */
export const formatRange = (r: DosingRange, perSide: boolean): string => {
  const work = r.reps === undefined ? `${span(r.holdSeconds ?? { min: 0, max: 0 })} s hold` : `${span(r.reps)} reps`;
  return `${span(r.sets)} sets × ${work}${each(perSide)}`;
};

/** "3 × 8 reps each side" or "3 × 30 s hold". */
export const formatSuggestion = (s: DosingSuggestion, perSide: boolean): string => {
  const work = s.reps === undefined ? `${s.holdSeconds ?? 0} s hold` : `${s.reps} reps`;
  return `${s.sets} × ${work}${each(perSide)}`;
};

const GOAL_NAMES: Record<DosingGoal, string> = {
  [DosingGoal.Strength]: 'Strength',
  [DosingGoal.Endurance]: 'Endurance',
  [DosingGoal.Power]: 'Power',
  [DosingGoal.Control]: 'Control',
};

export const goalName = (goal: DosingGoal): string => GOAL_NAMES[goal];

/** "Petersen J et al 2011" from a full citation: authors before the first full stop, plus the year. */
export const shortCitation = (citation: string): string => {
  const authors = citation.split('. ')[0] ?? citation;
  const year = /\b(19|20)\d{2}\b/.exec(citation)?.[0];
  return year === undefined ? authors : `${authors} ${year}`;
};
