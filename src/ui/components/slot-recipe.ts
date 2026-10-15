import type { StyleRule } from '@vanilla-extract/css';
import { recipe } from '@vanilla-extract/recipes';

type SlotStyles<S extends string> = Partial<Record<S, StyleRule>>;
type SlotVariants<S extends string> = Record<string, Record<string, SlotStyles<S>>>;

/** A variant value; booleans map to the `true` / `false` keys. */
type VariantKey<T> = T extends 'true' | 'false' ? boolean | T : T;

export type VariantSelection<V> = { readonly [K in keyof V]?: VariantKey<keyof V[K] & string> | undefined };

export interface SlotRecipeConfig<S extends string, V extends SlotVariants<S>> {
  readonly slots: ReadonlyArray<S>;
  readonly base?: SlotStyles<S>;
  readonly variants?: V;
  readonly defaultVariants?: VariantSelection<V>;
}

export interface ProjectedRecipe {
  readonly base: StyleRule;
  readonly variants: Record<string, Record<string, StyleRule>>;
  readonly defaultVariants: Record<string, string>;
}

/** Splits a multi-part config into one plain recipe config per slot. */
export const projectSlots = <S extends string, V extends SlotVariants<S>>(
  config: SlotRecipeConfig<S, V>,
): Record<S, ProjectedRecipe> => {
  const defaults: Record<string, string> = {};
  for (const [name, value] of Object.entries(config.defaultVariants ?? {})) {
    if (value !== undefined) defaults[name] = String(value);
  }
  const entries = config.slots.map((slot): [S, ProjectedRecipe] => {
    const variants: Record<string, Record<string, StyleRule>> = {};
    for (const [name, values] of Object.entries(config.variants ?? {})) {
      variants[name] = Object.fromEntries(Object.entries(values).map(([value, styles]) => [value, styles[slot] ?? {}]));
    }
    return [slot, { base: config.base?.[slot] ?? {}, variants, defaultVariants: defaults }];
  });
  return Object.fromEntries(entries) as Record<S, ProjectedRecipe>;
};

export type SlotRecipe<S extends string, V> = Record<S, (selection?: VariantSelection<V>) => string>;

/** Call from a `.css.ts` file; the result is one recipe per slot. */
export const slotRecipe = <S extends string, V extends SlotVariants<S>>(config: SlotRecipeConfig<S, V>): SlotRecipe<S, V> => {
  const projected = projectSlots(config);
  const out = {} as Record<S, (selection?: VariantSelection<V>) => string>;
  for (const slot of config.slots) {
    out[slot] = recipe(projected[slot]) as (selection?: VariantSelection<V>) => string;
  }
  return out;
};

/** Resolves every slot's class for one variant selection. */
export const slotClasses = <S extends string, V>(
  recipes: SlotRecipe<S, V>,
  selection: VariantSelection<V> = {},
): Record<S, string> => {
  const out = {} as Record<S, string>;
  for (const slot of Object.keys(recipes) as Array<S>) out[slot] = recipes[slot](selection);
  return out;
};
