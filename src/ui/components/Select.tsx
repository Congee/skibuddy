import { Select as ArkSelect, createListCollection } from '@ark-ui/solid/select';
import { For, Show, createMemo } from 'solid-js';
import type { JSX } from 'solid-js';
import { Portal } from 'solid-js/web';
import { Check, ChevronDown } from '../icons';
import { visuallyHidden } from '../theme/global.css';
import { indicatorIcon, select, triggerIcon } from './select.css';
import { slotClasses } from './slot-recipe';

export interface SelectOption {
  readonly value: string;
  readonly label: string;
  readonly detail?: string;
}

export const Select = (props: {
  readonly label: string;
  readonly options: ReadonlyArray<SelectOption>;
  readonly value: string;
  readonly onChange: (value: string) => void;
  /** Shows this icon alone in the trigger; the value stays as hidden text. */
  readonly icon?: (props: { readonly class: string }) => JSX.Element;
}): JSX.Element => {
  const c = slotClasses(select, { compact: props.icon !== undefined });
  const collection = createMemo(() =>
    createListCollection({ items: [...props.options], itemToValue: (o) => o.value, itemToString: (o) => o.label }),
  );
  return (
    <ArkSelect.Root
      class={c.root}
      collection={collection()}
      value={[props.value]}
      onValueChange={(d) => {
        const next = d.value[0];
        if (next !== undefined) props.onChange(next);
      }}
      positioning={{ placement: 'bottom-start', gutter: 6 }}
    >
      <ArkSelect.Label class={visuallyHidden}>{props.label}</ArkSelect.Label>
      <ArkSelect.Control>
        <ArkSelect.Trigger class={c.trigger}>
          <Show
            when={props.icon}
            fallback={
              <>
                <ArkSelect.ValueText class={c.value} />
                <ArkSelect.Indicator class={c.indicator}>
                  <ChevronDown class={indicatorIcon} />
                </ArkSelect.Indicator>
              </>
            }
          >
            {(icon) => (
              <>
                {icon()({ class: triggerIcon })}
                <ArkSelect.ValueText class={visuallyHidden} />
              </>
            )}
          </Show>
        </ArkSelect.Trigger>
      </ArkSelect.Control>
      <Portal>
        <ArkSelect.Positioner>
          <ArkSelect.Content class={c.content}>
            <For each={props.options}>
              {(option) => (
                <ArkSelect.Item class={c.item} item={option}>
                  <ArkSelect.ItemText class={c.itemText}>{option.label}</ArkSelect.ItemText>
                  <Show when={option.detail}>{(d) => <span class={c.itemDetail}>{d()}</span>}</Show>
                  <ArkSelect.ItemIndicator class={c.itemIndicator}>
                    <Check />
                  </ArkSelect.ItemIndicator>
                </ArkSelect.Item>
              )}
            </For>
          </ArkSelect.Content>
        </ArkSelect.Positioner>
      </Portal>
      <ArkSelect.HiddenSelect />
    </ArkSelect.Root>
  );
};
