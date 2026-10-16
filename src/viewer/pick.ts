import { NodeKind, parseAnatomyNode } from './anatomy-names';
import type { AnatomyNode } from './anatomy-names';
import { ancestorsOf } from './muscle-groups';
import type { MusclePart } from './slots';

/** A muscle tapped on the figure, by the content's id and the skier's side. */
export type MusclePick = MusclePart;

/** The muscle itself or its nearest parent the content names; null when the content names neither. */
export const contentMuscle = (muscle: string, muscles: ReadonlySet<string>): string | null =>
  [muscle, ...ancestorsOf(muscle)].find((m) => muscles.has(m)) ?? null;

/** A figure hit as the content's muscle and side. */
export const pickOf = (hit: MusclePart | null, muscles: ReadonlySet<string>): MusclePick | null => {
  if (hit === null) return null;
  const muscle = contentMuscle(hit.muscle, muscles);
  return muscle === null ? null : { muscle, side: hit.side };
};

/** A muscle mesh's node name, such as `muscle_vastus-medialis_outside`, as the content's muscle and side. */
export const pickOfName = (name: string, muscles: ReadonlySet<string>): MusclePick | null => {
  const node = parseAnatomyNode(name);
  return node?.kind === NodeKind.Muscle ? pickOf({ muscle: node.muscle, side: node.side }, muscles) : null;
};

export const PickRole = { Muscle: 'muscle', Block: 'block', Skip: 'skip' } as const;
export type PickRole = (typeof PickRole)[keyof typeof PickRole];

/** What the figure shows: the skeleton fade and a deep focus's veil over unmarked muscles. */
export interface PickState {
  readonly skeleton: boolean;
  readonly reveal: boolean;
}

/**
 * How a hit on a mesh counts: a muscle reports, bone and gear stop the ray, and a
 * faded muscle lets it through, so a deep one shows only when nothing covers it.
 */
export const pickRole = (node: AnatomyNode, state: PickState, slot: { readonly level: number; readonly marked: boolean }): PickRole => {
  switch (node.kind) {
    case NodeKind.Bones:
    case NodeKind.Gear:
      return PickRole.Block;
    case NodeKind.RestingMuscle:
      return state.skeleton || state.reveal ? PickRole.Skip : PickRole.Block;
    case NodeKind.Muscle:
      if (state.reveal && !slot.marked) return PickRole.Skip;
      if (state.skeleton && !slot.marked && slot.level <= 0) return PickRole.Skip;
      return PickRole.Muscle;
  }
};
