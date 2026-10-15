import { citedSource } from '../../content/schema';
import type { Movement, SourceId } from '../../content/schema';

/** Numbers each source by its first citation in the movement's activations, then its structures, from 1. */
export const sourceKeys = (movement: Movement): ReadonlyMap<SourceId, number> => {
  const keys = new Map<SourceId, number>();
  const cited = [...movement.activations, ...(movement.structures ?? [])].flatMap((x) => x.sources.map(citedSource));
  for (const s of cited) if (!keys.has(s)) keys.set(s, keys.size + 1);
  return keys;
};
