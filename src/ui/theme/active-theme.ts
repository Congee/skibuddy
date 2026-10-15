import { useAtomValue } from '@effect/atom-solid';
import { createMemo } from 'solid-js';
import type { Accessor } from 'solid-js';
import { DARK_QUERY, resolveTheme, themeChoiceAtom } from '../../state/theme';
import type { Theme } from '../../state/theme';
import { createMedia } from '../media';

/** The theme showing: the viewer's choice, or the OS's live under System. */
export const useActiveTheme = (): Accessor<Theme> => {
  const choice = useAtomValue(() => themeChoiceAtom);
  const systemDark = createMedia(DARK_QUERY);
  return createMemo(() => resolveTheme(choice(), systemDark()));
};
