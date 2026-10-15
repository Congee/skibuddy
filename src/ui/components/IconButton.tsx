import { Tooltip } from '@ark-ui/solid/tooltip';
import type { JSX } from 'solid-js';
import { Portal } from 'solid-js/web';
import { tooltipContent } from './tooltip.css';

/** A button named by `label`, shown as a tooltip on hover and focus. */
export const IconButton = (props: {
  readonly label: string;
  readonly hint?: string;
  readonly class: string;
  readonly onClick: () => void;
  readonly pressed?: boolean;
  readonly children: JSX.Element;
}): JSX.Element => (
  <Tooltip.Root openDelay={400} closeDelay={0} positioning={{ placement: 'top' }}>
    <Tooltip.Trigger class={props.class} aria-label={props.label} aria-pressed={props.pressed} onClick={() => props.onClick()}>
      {props.children}
    </Tooltip.Trigger>
    <Portal>
      <Tooltip.Positioner>
        <Tooltip.Content class={tooltipContent}>{props.hint ?? props.label}</Tooltip.Content>
      </Tooltip.Positioner>
    </Portal>
  </Tooltip.Root>
);
