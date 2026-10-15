import { style } from '@vanilla-extract/css';
import { easeOut, motionOk, phone } from '../theme/global.css';
import { vars } from '../theme/theme.css';

/** "Gear" label beside a three-way segmented control, sized like the switches. */
export const gear = style({
  display: 'inline-flex',
  alignItems: 'center',
  gap: 10,
  minHeight: 44,
  '@media': { [phone]: { flexBasis: '100%', minHeight: 52, gap: 8 } },
});

export const label = style({
  fontWeight: 700,
  fontStretch: '88%',
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  fontSize: 14,
});

export const cells = style({
  display: 'grid',
  gridTemplateColumns: 'repeat(3, auto)',
  border: `2px solid ${vars.color.ink}`,
  borderRadius: 3,
  '@media': { [phone]: { flex: 1, gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' } },
});

export const cell = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  minHeight: 40,
  padding: '0 12px',
  cursor: 'pointer',
  userSelect: 'none',
  fontWeight: 700,
  fontStretch: '88%',
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  fontSize: 13,
  color: vars.color.ink2,
  '@media': {
    [motionOk]: { transition: `background-color 160ms ${easeOut}, color 160ms ${easeOut}` },
    [phone]: { minHeight: 48, padding: '0 6px' },
  },
  selectors: {
    '&:not(:first-child)': { borderLeft: `1.5px solid ${vars.color.ink2}` },
    '&:hover': { color: vars.color.ink },
    '&[data-state="checked"]': { background: vars.color.ink, color: vars.color.ground, fontWeight: 900 },
    '&:has(input:focus-visible)': { outline: `3px solid ${vars.color.focus}`, outlineOffset: 2 },
  },
});
