import { createSignal, onCleanup } from 'solid-js';
import type { Accessor } from 'solid-js';
import type { EffortRamp } from '../../content/effort';

export const ThemeChoice = { System: 'system', Light: 'light', Dark: 'dark' } as const;
export type ThemeChoice = (typeof ThemeChoice)[keyof typeof ThemeChoice];
export const Theme = { Light: 'light', Dark: 'dark' } as const;
export type Theme = (typeof Theme)[keyof typeof Theme];

const KEY = 'skibuddy.blend.theme';
const DARK = '(prefers-color-scheme: dark)';

const stored = (): ThemeChoice => {
  try {
    const v = localStorage.getItem(KEY);
    return v === ThemeChoice.Light || v === ThemeChoice.Dark ? v : ThemeChoice.System;
  } catch {
    return ThemeChoice.System;
  }
};

// The shared level ramp the figure glows in (viewer LEVEL_COLOURS); copied so the page needn't load three.
const LEVELS = [
  [142, 203, 255],
  [47, 107, 255],
  [58, 16, 168],
] as const;

/** Rest on this paper, then the shared light, working, hard levels. */
export const RAMPS: Readonly<Record<Theme, EffortRamp>> = {
  [Theme.Light]: [[214, 217, 222], ...LEVELS],
  [Theme.Dark]: [[62, 66, 74], ...LEVELS],
};

/** Ground under the figure, matching `--snow` in blend.css. */
export const GROUND: Readonly<Record<Theme, string>> = { [Theme.Light]: '#ffffff', [Theme.Dark]: '#0f1012' };

export const createTheme = (): {
  readonly choice: Accessor<ThemeChoice>;
  readonly theme: Accessor<Theme>;
  readonly setChoice: (c: ThemeChoice) => void;
} => {
  const media = matchMedia(DARK);
  const [choice, setChoiceSignal] = createSignal<ThemeChoice>(stored());
  const [systemDark, setSystemDark] = createSignal(media.matches);
  const onChange = (e: MediaQueryListEvent): void => {
    setSystemDark(e.matches);
  };
  media.addEventListener('change', onChange);
  onCleanup(() => media.removeEventListener('change', onChange));
  const theme = (): Theme => {
    const c = choice();
    return c === ThemeChoice.System ? (systemDark() ? Theme.Dark : Theme.Light) : c;
  };
  const setChoice = (c: ThemeChoice): void => {
    setChoiceSignal(c);
    try {
      if (c === ThemeChoice.System) localStorage.removeItem(KEY);
      else localStorage.setItem(KEY, c);
    } catch {
      // Private mode: the choice lasts for this visit.
    }
  };
  return { choice, theme, setChoice };
};
