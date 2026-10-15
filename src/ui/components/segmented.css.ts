import { easeOut, motionOk, phone } from '../theme/global.css';
import { vars } from '../theme/theme.css';
import { slotRecipe } from './slot-recipe';

const caps = { fontWeight: 700, fontStretch: '88%', textTransform: 'uppercase' } as const;

/** Phase stops under the lift line or sticky tabs on a phone; joined cells by the switches; buttons on a plate. */
export const segmented = slotRecipe({
  slots: ['root', 'label', 'items', 'item', 'text'],
  base: {
    items: { display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' },
    item: {
      ...caps,
      position: 'relative',
      display: 'flex',
      alignItems: 'center',
      minHeight: 48,
      cursor: 'pointer',
      letterSpacing: '0.06em',
      '@media': { [motionOk]: { transition: `background-color 160ms ${easeOut}, color 160ms ${easeOut}` } },
      selectors: {
        '&:has(input:focus-visible)': { outline: `3px solid ${vars.color.focus}`, outlineOffset: 2 },
      },
    },
    text: {},
  },
  variants: {
    look: {
      stops: {
        item: {
          padding: '6px 10px 6px 0',
          color: vars.color.ink3,
          selectors: {
            '&:hover': { color: vars.color.ink },
            '&[data-state="checked"]': { color: vars.color.ink, fontWeight: 900 },
          },
        },
        text: {
          selectors: { '[data-state="checked"] > &': { boxShadow: `inset 0 -3px 0 ${vars.color.l2}` } },
        },
      },
      tabs: {
        items: { gap: 4 },
        item: {
          justifyContent: 'center',
          minHeight: 52,
          borderRadius: 3,
          border: `1.5px solid ${vars.color.ink2}`,
          fontSize: 15,
          selectors: {
            '&[data-state="checked"]': {
              background: vars.color.ink,
              color: vars.color.ground,
              borderColor: vars.color.ink,
              fontWeight: 900,
            },
          },
        },
      },
      // Label beside cells in one outline, sized like the switches.
      joined: {
        root: {
          display: 'inline-flex',
          alignItems: 'center',
          gap: 10,
          minHeight: 44,
          '@media': { [phone]: { flexBasis: '100%', minHeight: 52, gap: 8 } },
        },
        label: { ...caps, letterSpacing: '0.05em', fontSize: 14 },
        items: {
          gridTemplateColumns: 'repeat(3, auto)',
          border: `2px solid ${vars.color.ink}`,
          borderRadius: 3,
          '@media': { [phone]: { flex: 1, gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' } },
        },
        item: {
          justifyContent: 'center',
          minHeight: 40,
          padding: '0 12px',
          userSelect: 'none',
          letterSpacing: '0.05em',
          fontSize: 13,
          color: vars.color.ink2,
          '@media': { [phone]: { minHeight: 48, padding: '0 6px' } },
          selectors: {
            '&:not(:first-child)': { borderLeft: `1.5px solid ${vars.color.ink2}` },
            '&:hover': { color: vars.color.ink },
            '&[data-state="checked"]': { background: vars.color.ink, color: vars.color.ground, fontWeight: 900 },
          },
        },
      },
      // Label above separate buttons, in the plate's inks.
      plate: {
        root: {
          display: 'grid',
          gap: 6,
          flex: '0 1 auto',
          '@media': { [phone]: { flex: '1 1 100%' } },
        },
        label: { ...caps, fontSize: 13, fontStretch: '85%', letterSpacing: '0.08em', color: vars.color.plateInk2 },
        items: {
          gridTemplateColumns: 'repeat(3, auto)',
          gap: 4,
          '@media': { [phone]: { gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' } },
        },
        item: {
          justifyContent: 'center',
          minHeight: 44,
          padding: '0 14px',
          border: `1.5px solid ${vars.color.plateInk2}`,
          borderRadius: 3,
          color: vars.color.plateInk,
          fontSize: 14,
          whiteSpace: 'nowrap',
          '@media': { [phone]: { minHeight: 52, padding: '0 8px' } },
          selectors: {
            '&:hover': { borderColor: vars.color.plateInk },
            '&[data-state="checked"]': {
              background: vars.color.plateInk,
              borderColor: vars.color.plateInk,
              color: vars.color.plate,
              fontWeight: 900,
            },
            // Magenta focus is too dark on spruce.
            '&:has(input:focus-visible)': { outline: `3px solid ${vars.color.plateInk}`, outlineOffset: 2 },
          },
        },
      },
    },
  },
  defaultVariants: { look: 'stops' },
});
