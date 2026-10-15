import { assert, describe, it } from '@effect/vitest';
import { DOSING_KEY, DosingView, loadDosingView, parseDosingView, saveDosingView } from '../src/state/preferences';

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

describe('dosing preference', () => {
  it('parses each stored value', () => {
    assert.strictEqual(parseDosingView('off'), DosingView.Off);
    assert.strictEqual(parseDosingView('ranges'), DosingView.Ranges);
    assert.strictEqual(parseDosingView('sets-reps'), DosingView.SetsReps);
  });

  it('falls back to Off for anything else', () => {
    for (const raw of [null, undefined, '', 'Ranges', 'sets', 3]) assert.strictEqual(parseDosingView(raw), DosingView.Off);
  });

  it('round-trips through storage', () => {
    const store = memory();
    assert.strictEqual(loadDosingView(store), DosingView.Off);
    saveDosingView(DosingView.Ranges, store);
    assert.strictEqual(store.data.get(DOSING_KEY), 'ranges');
    assert.strictEqual(loadDosingView(store), DosingView.Ranges);
  });

  it('works without storage', () => {
    assert.strictEqual(loadDosingView(throwing), DosingView.Off);
    assert.doesNotThrow(() => saveDosingView(DosingView.SetsReps, throwing));
    assert.strictEqual(loadDosingView(undefined), DosingView.Off);
  });
});
