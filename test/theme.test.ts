import { assert, describe, it } from '@effect/vitest';
import { THEME_KEY, Theme, ThemeChoice, loadThemeChoice, parseThemeChoice, resolveTheme, saveThemeChoice, themeAttribute } from '../src/state/theme';

const memory = (): Pick<Storage, 'getItem' | 'setItem'> & { readonly data: Map<string, string> } => {
  const data = new Map<string, string>();
  return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v) };
};

const throwing: Pick<Storage, 'getItem' | 'setItem'> = {
  getItem: () => {
    throw new Error('blocked');
  },
  setItem: () => {
    throw new Error('blocked');
  },
};

describe('theme choice', () => {
  it('parses each stored value', () => {
    assert.strictEqual(parseThemeChoice('system'), ThemeChoice.System);
    assert.strictEqual(parseThemeChoice('light'), ThemeChoice.Light);
    assert.strictEqual(parseThemeChoice('dark'), ThemeChoice.Dark);
  });

  it('falls back to System for anything else', () => {
    for (const raw of [null, undefined, '', 'Dark', 'auto', 1]) assert.strictEqual(parseThemeChoice(raw), ThemeChoice.System);
  });

  it('resolves System from the OS and the others regardless of it', () => {
    assert.strictEqual(resolveTheme(ThemeChoice.System, false), Theme.Light);
    assert.strictEqual(resolveTheme(ThemeChoice.System, true), Theme.Dark);
    for (const dark of [false, true]) {
      assert.strictEqual(resolveTheme(ThemeChoice.Light, dark), Theme.Light);
      assert.strictEqual(resolveTheme(ThemeChoice.Dark, dark), Theme.Dark);
    }
  });

  it('sets data-theme only for an explicit choice', () => {
    assert.isNull(themeAttribute(ThemeChoice.System));
    assert.strictEqual(themeAttribute(ThemeChoice.Light), 'light');
    assert.strictEqual(themeAttribute(ThemeChoice.Dark), 'dark');
  });

  it('round-trips through storage', () => {
    const store = memory();
    assert.strictEqual(loadThemeChoice(store), ThemeChoice.System);
    saveThemeChoice(ThemeChoice.Dark, store);
    assert.strictEqual(store.data.get(THEME_KEY), 'dark');
    assert.strictEqual(loadThemeChoice(store), ThemeChoice.Dark);
  });

  it('works without storage', () => {
    assert.strictEqual(loadThemeChoice(throwing), ThemeChoice.System);
    assert.doesNotThrow(() => saveThemeChoice(ThemeChoice.Light, throwing));
    assert.strictEqual(loadThemeChoice(undefined), ThemeChoice.System);
  });
});
