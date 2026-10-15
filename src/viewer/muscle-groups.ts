/**
 * Parent muscle slugs and the slugs they cover, so a target on a parent lights its parts.
 * A parent may own meshes too (vasti owns the lateral and intermediate vasti).
 */
export const MUSCLE_CHILDREN: Readonly<Record<string, ReadonlyArray<string>>> = {
  quadriceps: ['vasti', 'rectus-femoris'],
  vasti: ['vastus-medialis'],
  hamstrings: ['biceps-femoris', 'medial-hamstrings'],
  calf: ['soleus', 'gastrocnemius'],
  obliques: ['external-oblique', 'internal-oblique'],
  // The old name, until content says iliopsoas.
  'hip-flexors': ['iliopsoas'],
};

/** Muscles under superficial ones: a focus on them fades the rest. */
export const DEEP_MUSCLES: ReadonlySet<string> = new Set([
  'transversus-abdominis',
  'multifidus',
  'tibialis-posterior',
  'popliteus',
  'iliopsoas',
  'internal-oblique',
  'quadratus-lumborum',
  'gluteus-minimus',
  'deep-hip-rotators',
]);

const PARENT: ReadonlyMap<string, string> = new Map(Object.entries(MUSCLE_CHILDREN).flatMap(([parent, children]) => children.map((c) => [c, parent] as const)));

// Read every frame, so each answer is kept.
const families = new Map<string, ReadonlyArray<string>>();
const ancestors = new Map<string, ReadonlyArray<string>>();

/** The muscle and every slug under it, parents first. */
export const familyOf = (muscle: string): ReadonlyArray<string> => {
  let found = families.get(muscle);
  if (found === undefined) {
    found = [muscle, ...(MUSCLE_CHILDREN[muscle] ?? []).flatMap(familyOf)];
    families.set(muscle, found);
  }
  return found;
};

/** The parents above a muscle, nearest first. */
export const ancestorsOf = (muscle: string): ReadonlyArray<string> => {
  let found = ancestors.get(muscle);
  if (found === undefined) {
    const parent = PARENT.get(muscle);
    found = parent === undefined ? [] : [parent, ...ancestorsOf(parent)];
    ancestors.set(muscle, found);
  }
  return found;
};

/** A deep muscle, or a parent whose parts are all deep. */
export const isDeep = (muscle: string): boolean => {
  const children = MUSCLE_CHILDREN[muscle];
  return DEEP_MUSCLES.has(muscle) || (children !== undefined && children.every(isDeep));
};
