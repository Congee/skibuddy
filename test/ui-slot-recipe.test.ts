import { assert, describe, it } from '@effect/vitest';
import { projectSlots, slotClasses } from '../src/ui/components/slot-recipe';
import type { SlotRecipe } from '../src/ui/components/slot-recipe';

describe('projectSlots', () => {
  const config = {
    slots: ['root', 'label'] as const,
    base: { root: { display: 'flex' } },
    variants: {
      tone: { plain: { label: { color: 'black' } }, loud: { root: { color: 'red' }, label: { fontWeight: 900 } } },
      open: { true: { root: { gap: 4 } }, false: {} },
    },
    defaultVariants: { tone: 'plain', open: false },
  } as const;

  it('gives every slot its own base, defaulting to empty', () => {
    const p = projectSlots(config);
    assert.deepStrictEqual(p.root.base, { display: 'flex' });
    assert.deepStrictEqual(p.label.base, {});
  });

  it('projects each variant value onto each slot', () => {
    const p = projectSlots(config);
    assert.deepStrictEqual(p.root.variants['tone'], { plain: {}, loud: { color: 'red' } });
    assert.deepStrictEqual(p.label.variants['tone'], { plain: { color: 'black' }, loud: { fontWeight: 900 } });
    assert.deepStrictEqual(p.label.variants['open'], { true: {}, false: {} });
  });

  it('stringifies boolean defaults for every slot', () => {
    const p = projectSlots(config);
    assert.deepStrictEqual(p.root.defaultVariants, { tone: 'plain', open: 'false' });
    assert.deepStrictEqual(p.label.defaultVariants, p.root.defaultVariants);
  });
});

describe('slotClasses', () => {
  it('resolves every slot with one selection', () => {
    const recipes: SlotRecipe<'root' | 'label', { tone: { a: object; b: object } }> = {
      root: (sel) => `root-${String(sel?.tone ?? 'a')}`,
      label: (sel) => `label-${String(sel?.tone ?? 'a')}`,
    };
    assert.deepStrictEqual(slotClasses(recipes, { tone: 'b' }), { root: 'root-b', label: 'label-b' });
    assert.deepStrictEqual(slotClasses(recipes), { root: 'root-a', label: 'label-a' });
  });
});
