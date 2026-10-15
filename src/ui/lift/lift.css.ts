import { style } from '@vanilla-extract/css';
import { easeOut, motionOk, phone } from '../theme/global.css';
import { vars } from '../theme/theme.css';

export const lift = style({
  display: 'grid',
  gridTemplateColumns: '52px minmax(0, 1fr)',
  columnGap: 16,
  alignItems: 'start',
  marginTop: 12,
  '@media': { [phone]: { padding: '0 16px', columnGap: 12, gridTemplateColumns: '48px minmax(0, 1fr)' } },
});

export const play = style({
  display: 'grid',
  placeItems: 'center',
  width: 52,
  height: 52,
  borderRadius: '50%',
  border: `2px solid ${vars.color.ink}`,
  background: 'transparent',
  color: vars.color.ink,
  cursor: 'pointer',
  '@media': {
    [motionOk]: { transition: `background-color 160ms ${easeOut}, color 160ms ${easeOut}` },
    [phone]: { width: 48, height: 48 },
  },
  selectors: { '&:hover': { background: vars.color.ink, color: vars.color.ground } },
});

export const playIcon = style({ width: 18, height: 18 });

export const root = style({ width: '100%' });

export const control = style({
  position: 'relative',
  height: 52,
  cursor: 'pointer',
  touchAction: 'none',
});

export const track = style({
  position: 'absolute',
  left: 0,
  right: 0,
  top: 8,
  height: 2,
  background: vars.color.ink,
});

export const range = style({ height: 4, marginTop: -1, background: vars.color.l2 });

export const tower = style({
  position: 'absolute',
  top: 2,
  width: 3,
  height: 18,
  marginLeft: -1.5,
  background: vars.color.ink,
  pointerEvents: 'none',
});

export const thumb = style({
  top: 0,
  width: 28,
  height: 44,
  outline: 'none',
  cursor: 'grab',
  selectors: {
    '&[data-dragging]': { cursor: 'grabbing' },
    '&[data-focus-visible]': { outline: `3px solid ${vars.color.focus}`, outlineOffset: 2, borderRadius: 3 },
  },
});

export const chair = style({ display: 'block', width: 28, height: 44, overflow: 'visible' });
export const chairInk = style({ fill: vars.color.ink, stroke: vars.color.ink });
export const chairSeat = style({ fill: vars.color.l2, stroke: vars.color.ink, strokeWidth: 1.5 });

export const below = style({
  display: 'flex',
  alignItems: 'center',
  gap: 12,
  marginTop: -6,
});

export const stops = style({
  flex: 1,
  '@media': { [phone]: { display: 'none' } },
});

export const pinsToggle = style({ marginLeft: 'auto', flex: 'none' });

export const phoneTabs = style({
  display: 'none',
  '@media': {
    [phone]: {
      display: 'block',
      position: 'sticky',
      top: 0,
      zIndex: 5,
      padding: '8px 16px',
      background: vars.color.ground,
      borderBottom: `1px solid ${vars.color.rule}`,
    },
  },
});
