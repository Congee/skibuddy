import * as Atom from 'effect/reactivity/Atom';

/** The viewer's theme choice; System follows the OS. */
export const ThemeChoice = { System: 'system', Light: 'light', Dark: 'dark' } as const;
export type ThemeChoice = (typeof ThemeChoice)[keyof typeof ThemeChoice];

/** The theme actually showing. */
export const Theme = { Light: 'light', Dark: 'dark' } as const;
export type Theme = (typeof Theme)[keyof typeof Theme];

export const THEME_CHOICES: ReadonlyArray<ThemeChoice> = [ThemeChoice.System, ThemeChoice.Light, ThemeChoice.Dark];

/** index.html's inline script reads this key before first paint; keep the two in step. */
export const THEME_KEY = 'skibuddy.theme';

/** The ground colour per theme, for the browser's `theme-color`; matches index.html. */
export const THEME_COLOR: Readonly<Record<Theme, string>> = { [Theme.Light]: '#F3F5F1', [Theme.Dark]: '#0D1915' };

export const DARK_QUERY = '(prefers-color-scheme: dark)';

/** Unknown or missing values fall back to System. */
export const parseThemeChoice = (raw: unknown): ThemeChoice => THEME_CHOICES.find((c) => c === raw) ?? ThemeChoice.System;

export const resolveTheme = (choice: ThemeChoice, systemDark: boolean): Theme => {
  if (choice === ThemeChoice.Light) return Theme.Light;
  if (choice === ThemeChoice.Dark) return Theme.Dark;
  return systemDark ? Theme.Dark : Theme.Light;
};

/** The `data-theme` value on `<html>`; none for System. */
export const themeAttribute = (choice: ThemeChoice): Theme | null => (choice === ThemeChoice.System ? null : choice);

type Store = Pick<Storage, 'getItem' | 'setItem'>;

const storage = (): Store | undefined => {
  try {
    return globalThis.localStorage;
  } catch {
    return undefined;
  }
};

export const loadThemeChoice = (store: Store | undefined = storage()): ThemeChoice => {
  try {
    return parseThemeChoice(store?.getItem(THEME_KEY));
  } catch {
    return ThemeChoice.System;
  }
};

export const saveThemeChoice = (choice: ThemeChoice, store: Store | undefined = storage()): void => {
  try {
    store?.setItem(THEME_KEY, choice);
  } catch {
    // The choice still holds for this page.
  }
};

/** Sets `data-theme` and the `theme-color` metas; with System the metas follow their media queries again. */
export const applyThemeChoice = (choice: ThemeChoice, doc: Document = document): void => {
  const root = doc.documentElement;
  const attribute = themeAttribute(choice);
  if (attribute === null) delete root.dataset['theme'];
  else root.dataset['theme'] = attribute;
  for (const meta of doc.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')) {
    const own: Theme = meta.media.includes('dark') ? Theme.Dark : Theme.Light;
    meta.content = THEME_COLOR[attribute ?? own];
  }
};

const themeBase = Atom.keepAlive(Atom.make<ThemeChoice | null>(null));

// index.html themes the page before this loads.
export const themeChoiceAtom = Atom.writable(
  (get) => get(themeBase) ?? loadThemeChoice(),
  (ctx, choice: ThemeChoice) => {
    // Before the set, so styles read by its subscribers already show the new theme.
    if (typeof document !== 'undefined') applyThemeChoice(choice);
    saveThemeChoice(choice);
    ctx.set(themeBase, choice);
  },
).pipe(Atom.keepAlive);
