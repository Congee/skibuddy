import type { JSX } from 'solid-js';
import type { Intensity } from '../../content/schema';
import { parseIntensity } from '../../state/preferences';
import { INTENSITY_OPTIONS } from '../board/intensity';
import { Segmented } from '../components/Segmented';

/** How hard the drill is skied: Gentle, Moderate (default) or Dynamic. Styled as the Gear control. */
export const IntensityControl = (props: { readonly value: Intensity; readonly onChange: (i: Intensity) => void }): JSX.Element => (
  <Segmented
    label="Intensity"
    showLabel
    look="joined"
    options={INTENSITY_OPTIONS}
    value={props.value}
    onChange={(v) => props.onChange(parseIntensity(v))}
  />
);
