import { useAtom } from '@effect/atom-solid';
import { Show } from 'solid-js';
import type { JSX } from 'solid-js';
import { ThemeChoice, parseThemeChoice, themeChoiceAtom } from '../state/theme';
import * as s from './app.css';
import { Segmented } from './components/Segmented';
import { Select } from './components/Select';
import { Moon, Screen, Sun } from './icons';
import { PHONE, createMedia } from './media';

const OPTIONS: ReadonlyArray<{ readonly value: ThemeChoice; readonly label: string }> = [
  { value: ThemeChoice.System, label: 'System' },
  { value: ThemeChoice.Light, label: 'Light' },
  { value: ThemeChoice.Dark, label: 'Dark' },
];

const ICONS: Readonly<Record<ThemeChoice, (props: { readonly class: string }) => JSX.Element>> = {
  [ThemeChoice.System]: Screen,
  [ThemeChoice.Light]: Sun,
  [ThemeChoice.Dark]: Moon,
};

/** System, Light or Dark: joined cells in the bar, an icon menu on a phone. */
export const ThemeControl = (): JSX.Element => {
  const [choice, setChoice] = useAtom(() => themeChoiceAtom);
  const compact = createMedia(PHONE);
  const onChange = (v: string): void => setChoice(parseThemeChoice(v));
  return (
    <div class={s.theme}>
      <Show
        when={compact()}
        fallback={<Segmented label="Theme" showLabel look="joined" options={OPTIONS} value={choice()} onChange={onChange} />}
      >
        <Select label="Theme" options={OPTIONS} value={choice()} onChange={onChange} icon={(p) => ICONS[choice()](p)} />
      </Show>
    </div>
  );
};
