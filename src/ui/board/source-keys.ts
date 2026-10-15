import type { Movement, SourceId } from '../../content/schema';

/** Numbers each source by its first citation in the movement, from 1. */
export const sourceKeys = (movement: Movement): ReadonlyMap<SourceId, number> => {
  const keys = new Map<SourceId, number>();
  for (const a of movement.activations) {
    for (const s of a.sources) if (!keys.has(s)) keys.set(s, keys.size + 1);
  }
  return keys;
};
