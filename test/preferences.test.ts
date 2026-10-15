import { assert, describe, it } from '@effect/vitest';
import { Intensity } from '../src/content/schema';
import {
  DOSING_KEY,
  DosingView,
  INTENSITY_KEY,
  loadDosingView,
  loadIntensity,
  parseDosingView,
  parseIntensity,
  saveDosingView,
  saveIntensity,
  startIntensity,
} from '../src/state/preferences';

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

describe('intensity preference', () => {
  it('defaults to Moderate', () => {
    assert.strictEqual(loadIntensity(memory()), Intensity.Moderate);
    for (const raw of [null, undefined, '', 'Dynamic', 'hard', 2]) assert.strictEqual(parseIntensity(raw), Intensity.Moderate);
  });

  it('round-trips through storage', () => {
    const store = memory();
    saveIntensity(Intensity.Gentle, store);
    assert.strictEqual(store.data.get(INTENSITY_KEY), 'gentle');
    assert.strictEqual(loadIntensity(store), Intensity.Gentle);
  });

  it('works without storage', () => {
    assert.strictEqual(loadIntensity(throwing), Intensity.Moderate);
    assert.doesNotThrow(() => saveIntensity(Intensity.Dynamic, throwing));
  });

  it('starts from ?intensity= when valid, without saving it, else the saved choice', () => {
    const store = memory();
    saveIntensity(Intensity.Gentle, store);
    assert.strictEqual(startIntensity('?intensity=dynamic', store), Intensity.Dynamic);
    assert.strictEqual(store.data.get(INTENSITY_KEY), 'gentle');
    assert.strictEqual(startIntensity('?intensity=wild', store), Intensity.Gentle);
    assert.strictEqual(startIntensity('', store), Intensity.Gentle);
    assert.strictEqual(startIntensity('', memory()), Intensity.Moderate);
  });
});
