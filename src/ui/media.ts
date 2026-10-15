import { createSignal, onCleanup } from 'solid-js';
import type { Accessor } from 'solid-js';

/** Tracks a media query; false where matchMedia is missing. */
export const createMedia = (query: string): Accessor<boolean> => {
  if (typeof matchMedia !== 'function') return () => false;
  const list = matchMedia(query);
  const [matches, setMatches] = createSignal(list.matches);
  const update = (e: MediaQueryListEvent): void => {
    setMatches(e.matches);
  };
  list.addEventListener('change', update);
  onCleanup(() => list.removeEventListener('change', update));
  return matches;
};

export const REDUCED_MOTION = '(prefers-reduced-motion: reduce)';
export const PHONE = '(max-width: 600px)';
