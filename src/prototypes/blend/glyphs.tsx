import type { JSX } from 'solid-js';

/** Head centre and limb strokes on a 24 grid, drawn in the Munich manner: one stroke, round ends. */
interface Pose {
  readonly head: readonly [number, number];
  readonly lines: ReadonlyArray<string>;
  /** Props such as a step, a wall or a band. */
  readonly props?: ReadonlyArray<string>;
}

const POSES = {
  squat: { head: [11, 4], lines: ['M11 7 L9 12 L15 13 L14 20 L17 20', 'M10.5 8.5 L17 9.5'] },
  singleSquat: { head: [10, 4], lines: ['M10 7 L8 12 L13 13 L12 20 L15 20', 'M8 12 L19 15', 'M9.5 8.5 L16 9'] },
  split: { head: [12, 3.5], lines: ['M12 6.5 L12 12 L17 13 L17 20', 'M12 12 L8 16 L4 19', 'M12 8 L12 11.5'] },
  step: { head: [12, 3.5], lines: ['M12 6.5 L12 12 L14 15 L14 16', 'M12 12 L9 16 L9 20', 'M12 8 L15 10'], props: ['M13 16 H21 V21'] },
  sidePlank: { head: [5, 7], lines: ['M7 9 L19 17 L21 18', 'M7.5 9.5 L7 15', 'M15 14.5 L19 11'], props: ['M3 20 H21'] },
  plank: { head: [4, 9], lines: ['M6 11 L20 15', 'M7 11.5 L7 18', 'M20 15 L20 18'], props: ['M3 20 H21'] },
  hinge: { head: [4, 9], lines: ['M6.5 10 L13 11 L13 20', 'M13 11 L21 9', 'M8 10.5 L8 16'] },
  bound: { head: [13, 3.5], lines: ['M13 6.5 L11 12 L15 15 L15 20', 'M11 12 L5 14', 'M12 8 L6 6', 'M12 8 L18 11'] },
  calf: { head: [12, 3.5], lines: ['M12 6.5 L12 13 L12 18 L13 20', 'M12 13 L12 20', 'M12 8 L15 12'], props: ['M8 21 H17'] },
  balance: { head: [12, 3.5], lines: ['M12 6.5 L12 13 L12 20', 'M12 13 L16 13 L16 17', 'M12 8 L8 11', 'M12 8 L16 10'] },
  airplane: { head: [5, 8], lines: ['M7 9 L13 11 L13 20', 'M13 11 L20 8', 'M10 10 L9 4', 'M10 10 L11 15'] },
  deadBug: { head: [4, 15], lines: ['M6 16 L15 16', 'M8 16 L8 9', 'M15 16 L15 10 L20 10', 'M15 16 L21 15'], props: ['M3 19 H21'] },
  press: { head: [9, 3.5], lines: ['M9 6.5 L9 13 L7 20', 'M9 13 L11 20', 'M9 8 L16 9'], props: ['M16 9 L22 9', 'M22 6 V12'] },
  march: { head: [11, 3.5], lines: ['M11 6.5 L11 13 L11 20', 'M11 13 L16 13 L16 18', 'M11 8 L11 12'], props: ['M8 16 L19 15'] },
  supineMarch: { head: [4, 16], lines: ['M6 17 L14 17', 'M14 17 L17 12 L20 15', 'M14 17 L21 17', 'M8 17 L10 13'], props: ['M3 20 H21'] },
  nordic: { head: [15, 6], lines: ['M14 8.5 L9 15 L9 19 L18 19', 'M12 11 L17 13'], props: ['M18 21 H21', 'M3 21 H21'] },
  ankle: { head: [10, 3.5], lines: ['M10 6.5 L10 12 L15 15 L16 20', 'M10 12 L6 16 L4 20', 'M10 8 L14 10'], props: ['M19 3 V21'] },
} as const satisfies Record<string, Pose>;

type GlyphName = keyof typeof POSES;

const BY_EXERCISE: Readonly<Record<string, GlyphName>> = {
  'banded-dorsiflexion': 'ankle',
  'banded-march-hold': 'march',
  'copenhagen-plank': 'sidePlank',
  'dead-bug': 'deadBug',
  'deep-single-leg-squat': 'singleSquat',
  'hip-airplane': 'airplane',
  'isometric-squat': 'squat',
  'nordic-curl': 'nordic',
  'pallof-press': 'press',
  'side-plank-leg-lift': 'sidePlank',
  'single-leg-balance': 'balance',
  'single-leg-rdl': 'hinge',
  'skater-bound': 'bound',
  'slow-step-down': 'step',
  'split-squat-hold': 'split',
  'stork-hold': 'balance',
  'supine-banded-march': 'supineMarch',
  'tibialis-calf-raise': 'calf',
};

export const Glyph = (props: { readonly exercise: string; readonly class?: string }): JSX.Element => {
  const pose = (): Pose => POSES[BY_EXERCISE[props.exercise] ?? 'squat'];
  return (
    <svg class={props.class} viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">
      <circle cx={pose().head[0]} cy={pose().head[1]} r="2.3" fill="currentColor" stroke="none" />
      {pose().lines.map((d) => (
        <path d={d} stroke-width="2.4" />
      ))}
      {(pose().props ?? []).map((d) => (
        <path d={d} stroke-width="1.2" />
      ))}
    </svg>
  );
};
