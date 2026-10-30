import { assert, describe, it } from '@effect/vitest';
import { DRILL_GROUPS, KINDS, KIND_DRILLS, KindId, MogulLine, WITHHELD_DRILLS, WITHHELD_KINDS, withhold } from '../src/prototypes/blend/data';
import { DEFAULT_URL_STATE, readUrlState, writeUrlState } from '../src/prototypes/blend/url-state';

describe('blend URL state', () => {
  it('round-trips every offered kind', () => {
    for (const { id: kind } of KINDS) {
      const back = readUrlState(writeUrlState({ kind, line: MogulLine.Round }, ''));
      assert.strictEqual(back.kind, kind);
      assert.strictEqual(back.line, MogulLine.Round);
    }
  });

  it('leaves defaults out of the link', () => {
    assert.strictEqual(writeUrlState(DEFAULT_URL_STATE, ''), '');
  });

  it('keeps other params and drops a stale line', () => {
    assert.strictEqual(writeUrlState({ kind: KindId.Powder, line: MogulLine.Tops }, '?figure=capsule&kind=moguls&line=tops'), '?figure=capsule&kind=powder');
  });

  it('ignores unknown values', () => {
    assert.deepStrictEqual(readUrlState('?kind=telemark&line=sideways'), DEFAULT_URL_STATE);
  });

  it('does not reach a withheld kind or its line', () => {
    for (const kind of WITHHELD_KINDS) assert.deepStrictEqual(readUrlState(`?kind=${kind}&line=tops`), DEFAULT_URL_STATE);
  });
});

describe('withheld drills', () => {
  it('are not offered as kinds', () => {
    for (const k of KINDS) {
      assert.isFalse(WITHHELD_KINDS.has(k.id));
      assert.isFalse(WITHHELD_DRILLS.has(k.drill), `${k.id} uses ${k.drill}`);
    }
  });

  it('are in no picker group or kind list', () => {
    for (const id of DRILL_GROUPS.flatMap((g) => g.ids)) assert.isFalse(WITHHELD_DRILLS.has(id), id);
    for (const id of Object.values(KIND_DRILLS).flat()) assert.isFalse(WITHHELD_DRILLS.has(id), id);
  });

  it('are dropped from loaded drills', () => {
    const loaded = withhold([...WITHHELD_DRILLS, 'stork-turns'].map((id) => ({ id })));
    assert.deepStrictEqual(loaded, [{ id: 'stork-turns' }]);
  });
});
