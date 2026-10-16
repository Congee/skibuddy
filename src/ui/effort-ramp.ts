import { hexRgb } from '../content/effort';
import type { EffortRamp, Rgb } from '../content/effort';
import { vars } from './theme/theme.css';

/** The effort ramp (rest, l1, l2, l3) from the live theme. */
export const readEffortRamp = (): EffortRamp => {
  const style = typeof document === 'undefined' ? undefined : getComputedStyle(document.documentElement);
  const read = (v: string, fallback: Rgb): Rgb => {
    const name = /^var\((--[^,)]+)/.exec(v)?.[1];
    return (name === undefined ? undefined : hexRgb(style?.getPropertyValue(name) ?? '')) ?? fallback;
  };
  return [
    read(vars.color.rest, [185, 197, 191]),
    read(vars.color.l1, [142, 203, 255]),
    read(vars.color.l2, [47, 107, 255]),
    read(vars.color.l3, [58, 16, 168]),
  ];
};
