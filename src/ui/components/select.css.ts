import { style } from '@vanilla-extract/css';
import { easeOut, motionOk } from '../theme/global.css';
import { vars } from '../theme/theme.css';
import { slotRecipe } from './slot-recipe';

export const select = slotRecipe({
  slots: ['root', 'trigger', 'value', 'indicator', 'content', 'item', 'itemText', 'itemDetail', 'itemIndicator'],
  base: {
    root: { display: 'inline-flex', minWidth: 0 },
    trigger: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: 10,
      minHeight: 44,
      minWidth: 0,
      padding: '0 12px 0 14px',
      border: `1.5px solid ${vars.color.ink2}`,
      borderRadius: 3,
      background: 'transparent',
      fontWeight: 700,
      cursor: 'pointer',
      selectors: {
        '&:hover': { borderColor: vars.color.ink, background: vars.color.well },
        '&[data-state="open"]': { borderColor: vars.color.ink, background: vars.color.well },
      },
    },
    value: { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
    indicator: {
      display: 'grid',
      width: 14,
      height: 14,
      flex: 'none',
      '@media': { [motionOk]: { transition: `transform 200ms ${easeOut}` } },
      selectors: { '[data-state="open"] > &': { transform: 'rotate(180deg)' } },
    },
    content: {
      minWidth: 240,
      padding: 4,
      background: vars.color.slat,
      color: vars.color.ink,
      border: `1.5px solid ${vars.color.ink2}`,
      borderRadius: 3,
      boxShadow: vars.shadow.pop,
      outline: 'none',
      zIndex: 20,
    },
    item: {
      display: 'grid',
      gridTemplateColumns: '1fr 16px',
      alignItems: 'center',
      columnGap: 12,
      minHeight: 44,
      padding: '6px 10px',
      borderRadius: 2,
      cursor: 'pointer',
      selectors: {
        '&[data-highlighted]': { background: vars.color.ink, color: vars.color.slat },
      },
    },
    itemText: { fontWeight: 700 },
    itemDetail: { gridColumn: 1, fontSize: 14, color: 'inherit', opacity: 0.85 },
    itemIndicator: { gridColumn: 2, gridRow: '1 / span 2', width: 16, height: 16 },
  },
  variants: {
    // An icon-only trigger at glove size.
    compact: {
      true: {
        trigger: { justifyContent: 'center', width: 48, minHeight: 48, padding: 0 },
        content: { minWidth: 180 },
      },
      false: {},
    },
  },
});

export const triggerIcon = style({ width: 22, height: 22 });

export const indicatorIcon = style({ width: 14, height: 14 });
