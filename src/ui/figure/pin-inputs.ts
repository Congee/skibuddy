import { PHASES, Side } from '../../content/schema';
import type { Activation } from '../../content/schema';
import type { MuscleAnchor } from '../../viewer/anchors';
import type { PinInput } from './pin-layout';

/** Key shared by a slat and its pin. */
export const pinKey = (a: Activation): string => `${a.muscle}:${a.side}`;

const anchorFor = (a: Activation, anchors: ReadonlyArray<MuscleAnchor>): MuscleAnchor | undefined => {
  const visible = anchors.filter((x) => x.visible && x.muscle === a.muscle);
  if (a.side !== Side.Both) return visible.find((x) => x.side === a.side);
  return visible.find((x) => x.side === Side.Outside) ?? visible[0];
};

const works = (a: Activation): boolean => PHASES.some((p) => a.intensity[p] > 0);

/**
 * Muscles that work at some point in the turn and have a visible anchor, ready
 * for layout. `order` is the board's steady order, so pins keep their priority through the turn.
 */
export const pinInputs = (
  order: ReadonlyArray<Activation>,
  anchors: ReadonlyArray<MuscleAnchor>,
  heights: ReadonlyMap<string, number> = new Map(),
): ReadonlyArray<PinInput> =>
  order.flatMap((a, rank) => {
    if (!works(a)) return [];
    const anchor = anchorFor(a, anchors);
    if (anchor === undefined) return [];
    const key = pinKey(a);
    const height = heights.get(key);
    return [{ key, x: anchor.x, y: anchor.y, priority: order.length - rank, ...(height === undefined ? {} : { height }) }];
  });
