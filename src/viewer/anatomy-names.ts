import type { Object3D } from 'three';
import { Intensity, Side } from '../content/schema';
import type { TurnSide } from './slots';

/** The baked turn clip per intensity; moderate keeps the original name. */
export const turnClipName = (intensity: Intensity): string => (intensity === Intensity.Moderate ? 'stork-turn' : `stork-turn-${intensity}`);

export const NodeKind = { Muscle: 'muscle', RestingMuscle: 'resting-muscle', Bones: 'bones', Gear: 'gear' } as const;
export type NodeKind = (typeof NodeKind)[keyof typeof NodeKind];

export type AnatomyNode =
  | { readonly kind: typeof NodeKind.Muscle; readonly muscle: string; readonly side: TurnSide }
  | { readonly kind: typeof NodeKind.RestingMuscle | typeof NodeKind.Bones | typeof NodeKind.Gear };

/**
 * Reads the node names written by scripts/anatomy/build_anatomy.py:
 * `muscle_<id>_<outside|inside>`, `muscle_rest`, `bones`, `gear_<name>`.
 */
export const parseAnatomyNode = (name: string): AnatomyNode | null => {
  if (name === 'bones') return { kind: NodeKind.Bones };
  if (name === 'muscle_rest') return { kind: NodeKind.RestingMuscle };
  if (name.startsWith('gear_')) return { kind: NodeKind.Gear };
  const m = /^muscle_([a-z0-9-]+)_(outside|inside)$/.exec(name);
  if (m === null) return null;
  const [, muscle, side] = m;
  if (muscle === undefined) return null;
  return { kind: NodeKind.Muscle, muscle, side: side === 'outside' ? Side.Outside : Side.Inside };
};

/** The parsed name of the nearest named ancestor; multi-material meshes load as a group of primitives. */
export const nodeOf = (object: Object3D): { readonly node: AnatomyNode; readonly owner: Object3D } | null => {
  for (let o: Object3D | null = object; o !== null; o = o.parent) {
    const node = parseAnatomyNode(o.name);
    if (node !== null) return { node, owner: o };
  }
  return null;
};
