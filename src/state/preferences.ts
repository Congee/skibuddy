import * as Atom from 'effect/reactivity/Atom';

/** How much exercise dosing the gym board shows. */
export const DosingView = { Off: 'off', Ranges: 'ranges', SetsReps: 'sets-reps' } as const;
export type DosingView = (typeof DosingView)[keyof typeof DosingView];

export const DOSING_VIEWS: ReadonlyArray<DosingView> = [DosingView.Off, DosingView.Ranges, DosingView.SetsReps];

export const DOSING_KEY = 'skibuddy.dosing';

/** Unknown or missing values fall back to Off, since dosing is optional. */
export const parseDosingView = (raw: unknown): DosingView =>
  DOSING_VIEWS.find((v) => v === raw) ?? DosingView.Off;

type Store = Pick<Storage, 'getItem' | 'setItem'>;

// Accessing localStorage itself can throw (private mode, blocked site data).
const storage = (): Store | undefined => {
  try {
    return globalThis.localStorage;
  } catch {
    return undefined;
  }
};

export const loadDosingView = (store: Store | undefined = storage()): DosingView => {
  try {
    return parseDosingView(store?.getItem(DOSING_KEY));
  } catch {
    return DosingView.Off;
  }
};

export const saveDosingView = (view: DosingView, store: Store | undefined = storage()): void => {
  try {
    store?.setItem(DOSING_KEY, view);
  } catch {
    // The choice still holds for this page.
  }
};

// Null until the viewer picks; storage is read lazily, on first use.
const dosingBase = Atom.keepAlive(Atom.make<DosingView | null>(null));

export const dosingViewAtom = Atom.writable(
  (get) => get(dosingBase) ?? loadDosingView(),
  (ctx, view: DosingView) => {
    ctx.set(dosingBase, view);
    saveDosingView(view);
  },
).pipe(Atom.keepAlive);
