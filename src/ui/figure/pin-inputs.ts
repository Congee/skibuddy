import { Side } from '../../content/schema';
import type { MuscleAnchor } from '../../viewer/anchors';
import type { RankedSlat } from '../board/rank';
import type { PinInput } from './pin-layout';

/** Key shared by a slat and its pin. */
export const slatKey = (slat: RankedSlat): string => `${slat.activation.muscle}:${slat.activation.side}`;

const anchorFor = (slat: RankedSlat, anchors: ReadonlyArray<MuscleAnchor>): MuscleAnchor | undefined => {
  const { muscle, side } = slat.activation;
  const visible = anchors.filter((a) => a.visible && a.muscle === muscle);
  if (side !== Side.Both) return visible.find((a) => a.side === side);
  return visible.find((a) => a.side === Side.Outside) ?? visible[0];
};

/** Working slats that have a visible anchor, ready for layout, with any measured label heights. */
export const pinInputs = (
  ranked: ReadonlyArray<RankedSlat>,
  anchors: ReadonlyArray<MuscleAnchor>,
  heights: ReadonlyMap<string, number> = new Map(),
): ReadonlyArray<PinInput> =>
  ranked.flatMap((slat, rank) => {
    if (slat.level <= 0) return [];
    const anchor = anchorFor(slat, anchors);
    if (anchor === undefined) return [];
    const key = slatKey(slat);
    const height = heights.get(key);
    return [{ key, x: anchor.x, y: anchor.y, priority: ranked.length - rank, ...(height === undefined ? {} : { height }) }];
  });
