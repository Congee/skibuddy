import type { JSX } from 'solid-js';

const PATHS = {
  dumbbell: 'M6.5 6.5v11M3.5 9v6M17.5 6.5v11M20.5 9v6M6.5 12h11',
  up: 'M6 15l6-6 6 6',
  gate: 'M6 21V4M6 4h11l-3 4.5L17 13H6',
  close: 'M6 6l12 12M18 6L6 18',
  back: 'M15 6l-6 6 6 6',
  list: 'M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01',
  sliders: 'M4 7h9M17 7h3M4 17h3M11 17h9M15 5v4M9 15v4',
  play: 'M8 5.5v13l10.5-6.5z',
  pause: 'M7 5.5h3.5v13H7zM13.5 5.5H17v13h-3.5z',
} as const;

export type IconName = keyof typeof PATHS;

/** One stroke, one weight; decorative, so labels live on the buttons. */
export const Icon = (props: { readonly name: IconName }): JSX.Element => (
  <svg class={props.name === 'play' || props.name === 'pause' ? 'icon icon-fill' : 'icon'} viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
    <path d={PATHS[props.name]} />
  </svg>
);
