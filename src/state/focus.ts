import * as Atom from 'effect/reactivity/Atom';

/** Open slats, oldest first, and the slat under the pointer or keyboard; keys are `muscle:side`. */
export interface FocusState {
  readonly open: ReadonlyArray<string>;
  readonly hover: string | null;
}

export const NO_FOCUS: FocusState = { open: [], hover: null };

/** Focus comes from an opened slat; a preview from hover or keyboard focus. */
export const Emphasis = { Focus: 'focus', Preview: 'preview' } as const;
export type Emphasis = (typeof Emphasis)[keyof typeof Emphasis];

export interface Highlight {
  readonly key: string;
  readonly emphasis: Emphasis;
}

/** Opening a slat, or opening it again, makes it the most recent. */
export const openSlat = (state: FocusState, key: string): FocusState => ({
  ...state,
  open: [...state.open.filter((k) => k !== key), key],
});

export const closeSlat = (state: FocusState, key: string): FocusState =>
  state.open.includes(key) ? { ...state, open: state.open.filter((k) => k !== key) } : state;

export const hoverSlat = (state: FocusState, key: string): FocusState => (state.hover === key ? state : { ...state, hover: key });

/** Clears the hover only if it is still this slat's. */
export const leaveSlat = (state: FocusState, key: string): FocusState => (state.hover === key ? { ...state, hover: null } : state);

export const isOpen = (state: FocusState, key: string): boolean => state.open.includes(key);

/** The most recently opened slat still open. */
export const focusedKey = (state: FocusState): string | null => state.open.at(-1) ?? null;

/** What the figure shows: the focus wins; a hover previews only while nothing is focused. */
export const highlight = (state: FocusState): Highlight | null => {
  const focused = focusedKey(state);
  if (focused !== null) return { key: focused, emphasis: Emphasis.Focus };
  return state.hover === null ? null : { key: state.hover, emphasis: Emphasis.Preview };
};

export const sameHighlight = (a: Highlight | null, b: Highlight | null): boolean =>
  a === b || (a !== null && b !== null && a.key === b.key && a.emphasis === b.emphasis);

/** Shared by the board's slats, the pins and the figure. */
export const focusAtom = Atom.keepAlive(Atom.make<FocusState>(NO_FOCUS));
