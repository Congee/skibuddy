import { easeOut, motionOk } from '../theme/global.css';
import { vars } from '../theme/theme.css';
import { slotRecipe } from './slot-recipe';

/** Phase stops under the lift line, or sticky tabs on a phone. */
export const segmented = slotRecipe({
  slots: ['root', 'item', 'text'],
  base: {
    root: { display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' },
    item: {
      position: 'relative',
      display: 'flex',
      alignItems: 'center',
      minHeight: 48,
      cursor: 'pointer',
      fontWeight: 700,
      fontStretch: '88%',
      textTransform: 'uppercase',
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
        root: { gap: 4 },
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
    },
  },
  defaultVariants: { look: 'stops' },
});
