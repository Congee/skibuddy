import { Intensity, PHASES, Side, levelAt } from '../../content/schema';
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

const works = (a: Activation, i: Intensity): boolean => PHASES.some((p) => levelAt(a.intensity[p], i) > 0);

/**
 * Muscles that work at some point in the turn at `intensity` and have a visible anchor, ready
 * for layout. `order` is the board's steady order, so pins keep their priority through the turn;
 * the `focused` pin outranks them all, so it shows even outside the top pins.
 */
export const pinInputs = (
  order: ReadonlyArray<Activation>,
  anchors: ReadonlyArray<MuscleAnchor>,
  heights: ReadonlyMap<string, number> = new Map(),
  focused: string | null = null,
  intensity: Intensity = Intensity.Moderate,
): ReadonlyArray<PinInput> =>
  order.flatMap((a, rank) => {
    const key = pinKey(a);
    const focus = key === focused;
    if (!works(a, intensity) && !focus) return [];
    const anchor = anchorFor(a, anchors);
    if (anchor === undefined) return [];
    const height = heights.get(key);
    return [{ key, x: anchor.x, y: anchor.y, priority: focus ? order.length + 1 : order.length - rank, ...(height === undefined ? {} : { height }) }];
  });
