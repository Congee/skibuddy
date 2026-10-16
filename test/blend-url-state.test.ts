import { assert, describe, it } from '@effect/vitest';
import { KindId, MogulLine } from '../src/prototypes/blend/data';
import { DEFAULT_URL_STATE, readUrlState, writeUrlState } from '../src/prototypes/blend/url-state';

describe('blend URL state', () => {
  it('round-trips every kind and line', () => {
    for (const kind of Object.values(KindId))
      for (const line of Object.values(MogulLine)) {
        const back = readUrlState(writeUrlState({ kind, line }, ''));
        assert.strictEqual(back.kind, kind);
        // Only moguls keeps a line in the link.
        assert.strictEqual(back.line, kind === KindId.Moguls ? line : MogulLine.Zipper);
      }
  });

  it('leaves defaults out of the link', () => {
    assert.strictEqual(writeUrlState(DEFAULT_URL_STATE, ''), '');
    assert.strictEqual(writeUrlState({ kind: KindId.Moguls, line: MogulLine.Zipper }, ''), '?kind=moguls');
    assert.strictEqual(writeUrlState({ kind: KindId.Moguls, line: MogulLine.Tops }, ''), '?kind=moguls&line=tops');
  });

  it('keeps other params and drops a stale line', () => {
    assert.strictEqual(writeUrlState({ kind: KindId.Powder, line: MogulLine.Tops }, '?figure=capsule&kind=moguls&line=tops'), '?figure=capsule&kind=powder');
  });

  it('ignores unknown values', () => {
    assert.deepStrictEqual(readUrlState('?kind=telemark&line=sideways'), DEFAULT_URL_STATE);
  });
});
