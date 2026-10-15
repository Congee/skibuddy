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
  top: 1,
  width: 18,
  height: 32,
  marginLeft: -9,
  overflow: 'visible',
  pointerEvents: 'none',
});

export const towerInk = style({ fill: vars.color.ink, stroke: vars.color.ink, strokeLinecap: 'square' });

export const thumb = style({
  top: 0,
  width: 32,
  height: 48,
  outline: 'none',
  cursor: 'grab',
  selectors: {
    '&[data-dragging]': { cursor: 'grabbing' },
    '&[data-focus-visible]': { outline: `3px solid ${vars.color.focus}`, outlineOffset: 2, borderRadius: 3 },
  },
});

export const chair = style({ display: 'block', width: 32, height: 48, overflow: 'visible' });
export const chairInk = style({ fill: vars.color.ink });
export const chairLine = style({ fill: 'none', stroke: vars.color.ink, strokeLinejoin: 'round' });
export const chairSeat = style({ fill: vars.color.l2, stroke: vars.color.ink, strokeWidth: 1.75, strokeLinejoin: 'round' });

export const below = style({
  gridColumn: 2,
  display: 'flex',
  flexWrap: 'wrap',
  alignItems: 'center',
  gap: '0 12px',
  '@media': { [phone]: { gridColumn: '1 / -1' } },
});

export const stops = style({
  flex: '1 1 300px',
  '@media': { [phone]: { display: 'none' } },
});

export const toggles = style({
  display: 'flex',
  flexWrap: 'wrap',
  alignItems: 'center',
  gap: '0 16px',
  marginLeft: 'auto',
  '@media': { [phone]: { width: '100%', justifyContent: 'space-between', gap: 8 } },
});

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
