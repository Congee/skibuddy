import type { JSX } from 'solid-js';
import { GearMode, isGearMode } from '../../viewer/gear-mode';
import { Segmented } from '../components/Segmented';

const OPTIONS: ReadonlyArray<{ readonly value: GearMode; readonly label: string }> = [
  { value: GearMode.Translucent, label: 'Translucent' },
  { value: GearMode.Solid, label: 'Solid' },
  { value: GearMode.Off, label: 'Off' },
];

/** Boots and poles on the figure: see-through so the shin muscles stay readable, solid, or hidden. */
export const GearControl = (props: { readonly value: GearMode; readonly onChange: (mode: GearMode) => void }): JSX.Element => (
  <Segmented
    label="Gear"
    showLabel
    look="joined"
    options={OPTIONS}
    value={props.value}
    onChange={(v) => {
      if (isGearMode(v)) props.onChange(v);
    }}
  />
);
