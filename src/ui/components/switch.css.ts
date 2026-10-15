import { easeOut, motionOk, phone } from '../theme/global.css';
import { vars } from '../theme/theme.css';
import { slotRecipe } from './slot-recipe';

export const switchParts = slotRecipe({
  slots: ['root', 'control', 'thumb', 'label'],
  base: {
    root: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: 10,
      minHeight: 44,
      cursor: 'pointer',
      userSelect: 'none',
      // Glove-sized on a phone.
      '@media': { [phone]: { minHeight: 52, gap: 8 } },
    },
    control: {
      position: 'relative',
      width: 44,
      height: 26,
      flex: 'none',
      borderRadius: 3,
      border: `2px solid ${vars.color.ink}`,
      background: 'transparent',
      '@media': {
        [motionOk]: { transition: `background-color 160ms ${easeOut}` },
        [phone]: { width: 52, height: 32 },
      },
      selectors: {
        '&[data-state="checked"]': { background: vars.color.ink },
        '&[data-focus-visible]': { outline: `3px solid ${vars.color.focus}`, outlineOffset: 2 },
      },
    },
    thumb: {
      position: 'absolute',
      top: 2,
      left: 2,
      width: 18,
      height: 18,
      borderRadius: 2,
      background: vars.color.ink,
      '@media': {
        [motionOk]: { transition: `transform 200ms ${easeOut}, background-color 160ms ${easeOut}` },
        [phone]: { width: 24, height: 24, selectors: { '&[data-state="checked"]': { transform: 'translateX(20px)' } } },
      },
      selectors: {
        '&[data-state="checked"]': { transform: 'translateX(18px)', background: vars.color.ground },
      },
    },
    label: {
      fontWeight: 700,
      fontStretch: '88%',
      textTransform: 'uppercase',
      letterSpacing: '0.05em',
      fontSize: 14,
    },
  },
});
