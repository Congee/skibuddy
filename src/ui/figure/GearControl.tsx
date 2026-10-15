import { SegmentGroup } from '@ark-ui/solid/segment-group';
import { For } from 'solid-js';
import type { JSX } from 'solid-js';
import { GearMode, isGearMode } from '../../viewer/gear-mode';
import * as s from './gear.css';

const OPTIONS: ReadonlyArray<{ readonly value: GearMode; readonly label: string }> = [
  { value: GearMode.Translucent, label: 'Translucent' },
  { value: GearMode.Solid, label: 'Solid' },
  { value: GearMode.Off, label: 'Off' },
];

/** Boots and poles on the figure: see-through so the shin muscles stay readable, solid, or hidden. */
export const GearControl = (props: { readonly value: GearMode; readonly onChange: (mode: GearMode) => void }): JSX.Element => (
  <SegmentGroup.Root
    class={s.gear}
    value={props.value}
    onValueChange={(d) => {
      if (isGearMode(d.value)) props.onChange(d.value);
    }}
  >
    <SegmentGroup.Label class={s.label}>Gear</SegmentGroup.Label>
    <div class={s.cells}>
      <For each={OPTIONS}>
        {(option) => (
          <SegmentGroup.Item class={s.cell} value={option.value}>
            <SegmentGroup.ItemText>{option.label}</SegmentGroup.ItemText>
            <SegmentGroup.ItemControl />
            <SegmentGroup.ItemHiddenInput />
          </SegmentGroup.Item>
        )}
      </For>
    </div>
  </SegmentGroup.Root>
);
