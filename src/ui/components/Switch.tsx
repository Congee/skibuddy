import { Switch as ArkSwitch } from '@ark-ui/solid/switch';
import type { JSX } from 'solid-js';
import { slotClasses } from './slot-recipe';
import { switchParts } from './switch.css';

export const Switch = (props: {
  readonly label: string;
  readonly checked: boolean;
  readonly onChange: (checked: boolean) => void;
  readonly class?: string;
}): JSX.Element => {
  const c = slotClasses(switchParts);
  return (
    <ArkSwitch.Root
      class={`${c.root} ${props.class ?? ''}`}
      checked={props.checked}
      onCheckedChange={(d) => props.onChange(d.checked)}
    >
      <ArkSwitch.Control class={c.control}>
        <ArkSwitch.Thumb class={c.thumb} />
      </ArkSwitch.Control>
      <ArkSwitch.Label class={c.label}>{props.label}</ArkSwitch.Label>
      <ArkSwitch.HiddenInput />
    </ArkSwitch.Root>
  );
};
