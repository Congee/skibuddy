import { steadyOrder } from '../../content/effort';
import { BodyRegion, Side } from '../../content/schema';
import type { Activation, Muscle } from '../../content/schema';

export const BoardGroup = { OutsideLeg: 'outside-leg', InsideLeg: 'inside-leg', Trunk: 'trunk', Upper: 'upper' } as const;
export type BoardGroup = (typeof BoardGroup)[keyof typeof BoardGroup];

export const GROUP_TITLES: Readonly<Record<BoardGroup, string>> = {
  [BoardGroup.OutsideLeg]: 'Outside leg',
  [BoardGroup.InsideLeg]: 'Inside leg',
  [BoardGroup.Trunk]: 'Pelvis and trunk',
  [BoardGroup.Upper]: 'Upper body',
};

const GROUPS: ReadonlyArray<BoardGroup> = Object.values(BoardGroup);

/** Arms go to the upper body, trunk muscles to the trunk, leg and hip muscles by side (both legs with outside). */
export const groupOf = (a: Activation, region: BodyRegion | undefined): BoardGroup => {
  if (region === BodyRegion.Arm) return BoardGroup.Upper;
  if (region === BodyRegion.Trunk) return BoardGroup.Trunk;
  return a.side === Side.Inside ? BoardGroup.InsideLeg : BoardGroup.OutsideLeg;
};

/** Non-empty groups in body order, each in steady (peak effort) order. */
export const groupActivations = (
  activations: ReadonlyArray<Activation>,
  muscles: ReadonlyArray<Muscle>,
): ReadonlyArray<{ readonly group: BoardGroup; readonly activations: ReadonlyArray<Activation> }> => {
  const region = new Map<string, BodyRegion>(muscles.map((m) => [m.id, m.region]));
  return GROUPS.flatMap((group) => {
    const members = activations.filter((a) => groupOf(a, region.get(a.muscle)) === group);
    return members.length === 0 ? [] : [{ group, activations: steadyOrder(members) }];
  });
};
