import { assert, describe, it } from '@effect/vitest';
import { DEEP_MUSCLES, MUSCLE_CHILDREN, ancestorsOf, familyOf, isDeep } from '../src/viewer/muscle-groups';
import { parseAnatomyNode } from '../src/viewer/anatomy-names';
import map from '../scripts/anatomy/muscle-map.json';

const MESHED = new Set(Object.keys(map));

describe('muscle groups', () => {
  it('names only slugs the model has meshes for, or parents of them', () => {
    for (const [parent, children] of Object.entries(MUSCLE_CHILDREN)) {
      for (const child of children) assert.isTrue(MESHED.has(child) || child in MUSCLE_CHILDREN, `${parent} > ${child}`);
    }
    for (const m of DEEP_MUSCLES) assert.isTrue(MESHED.has(m), m);
  });

  it('gives every parent at least one meshed part', () => {
    for (const parent of Object.keys(MUSCLE_CHILDREN)) assert.isTrue(familyOf(parent).some((m) => MESHED.has(m)), parent);
  });

  it('maps each mesh to one slug the viewer can parse', () => {
    const seen = new Set<string>();
    for (const [slug, names] of Object.entries(map)) {
      assert.deepStrictEqual(parseAnatomyNode(`muscle_${slug}_inside`), { kind: 'muscle', muscle: slug, side: 'inside' });
      for (const name of names) {
        assert.isFalse(seen.has(name), name);
        seen.add(name);
      }
    }
  });

  it('walks parts and parents', () => {
    assert.deepStrictEqual(familyOf('quadriceps'), ['quadriceps', 'vasti', 'vastus-medialis', 'rectus-femoris']);
    assert.deepStrictEqual(ancestorsOf('vastus-medialis'), ['vasti', 'quadriceps']);
    assert.deepStrictEqual(ancestorsOf('soleus'), ['calf']);
    assert.deepStrictEqual(familyOf('soleus'), ['soleus']);
    assert.isTrue(isDeep('hip-flexors'));
    assert.isFalse(isDeep('obliques'));
  });
});
