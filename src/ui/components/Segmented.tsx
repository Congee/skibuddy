import { SegmentGroup } from '@ark-ui/solid/segment-group';
import { For } from 'solid-js';
import type { JSX } from 'solid-js';
import { segmented } from './segmented.css';
import { slotClasses } from './slot-recipe';

export interface SegmentOption {
  readonly value: string;
  readonly label: string;
}

export const Segmented = (props: {
  readonly label: string;
  readonly options: ReadonlyArray<SegmentOption>;
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly look: 'stops' | 'tabs';
  readonly class?: string;
}): JSX.Element => {
  const c = (): Record<'root' | 'item' | 'text', string> => slotClasses(segmented, { look: props.look });
  return (
    <SegmentGroup.Root
      class={`${c().root} ${props.class ?? ''}`}
      aria-label={props.label}
      value={props.value}
      onValueChange={(d) => {
        if (d.value !== null) props.onChange(d.value);
      }}
    >
      <For each={props.options}>
        {(option) => (
          <SegmentGroup.Item class={c().item} value={option.value}>
            <SegmentGroup.ItemText class={c().text}>{option.label}</SegmentGroup.ItemText>
            <SegmentGroup.ItemControl />
            <SegmentGroup.ItemHiddenInput />
          </SegmentGroup.Item>
        )}
      </For>
    </SegmentGroup.Root>
  );
};
