import { Side } from '../content/schema';
import type { TurnSide } from './slots';

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
