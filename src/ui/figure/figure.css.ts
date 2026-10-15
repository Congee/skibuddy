import { globalStyle, style } from '@vanilla-extract/css';
import { easeOut, motionOk, phone } from '../theme/global.css';
import { vars } from '../theme/theme.css';

export const field = style({
  position: 'relative',
  height: 'max(420px, calc(100vh - 56px - 40px - 132px))',
  '@media': { [phone]: { height: '45vh', minHeight: 300 } },
});

// The viewer's own DOM: the canvas owns the spruce field, the caption sits below it.
globalStyle(`${field} figure`, {
  display: 'grid',
  gridTemplateRows: 'minmax(0, 1fr) auto',
  height: '100%',
});

globalStyle(`${field} canvas`, {
  display: 'block',
  width: '100%',
  height: '100%',
  borderRadius: 4,
  touchAction: 'none',
  cursor: 'grab',
  background: `linear-gradient(to bottom, ${vars.color.field} 0 76%, ${vars.color.snowLine} 76% calc(76% + 1px), ${vars.color.snow} calc(76% + 1px))`,
  '@media': { [phone]: { borderRadius: 0 } },
});

globalStyle(`${field} figcaption`, {
  padding: '6px 2px 0',
  fontSize: 14,
  color: vars.color.ink3,
  '@media': { [phone]: { padding: '6px 16px 0' } },
});

globalStyle(`${field} figcaption[role="alert"]`, {
  position: 'absolute',
  top: '40%',
  left: '50%',
  transform: 'translate(-50%, -50%)',
  width: 'min(32ch, 80%)',
  padding: 0,
  textAlign: 'center',
  fontSize: 16,
  fontWeight: 600,
  color: vars.color.plateInk,
});

export const overlay = style({
  position: 'absolute',
  top: 0,
  left: 0,
  pointerEvents: 'none',
  overflow: 'hidden',
  borderRadius: 4,
});

export const leaders = style({ position: 'absolute', inset: 0, width: '100%', height: '100%', overflow: 'visible' });

export const leaderUnder = style({ stroke: vars.color.field, strokeWidth: 3.5, fill: 'none', opacity: 0.55 });
export const leaderLine = style({ stroke: vars.color.leader, strokeWidth: 1.5, fill: 'none' });
export const leaderDot = style({ fill: vars.color.leader, stroke: vars.color.field, strokeWidth: 2 });

export const pin = style({
  position: 'absolute',
  top: 0,
  left: 0,
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  padding: '0 10px 0 4px',
  borderRadius: 3,
  background: vars.color.pinBg,
  color: vars.color.pinInk,
  boxShadow: vars.shadow.pop,
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  '@media': {
    [motionOk]: { transition: `transform 320ms ${easeOut}` },
    [phone]: { gap: 6, padding: '0 6px 0 3px' },
  },
});

export const pinName = style({
  minWidth: 0,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  fontSize: 14,
  fontWeight: 800,
  fontStretch: '80%',
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
  '@media': { [phone]: { fontSize: 12, letterSpacing: '0.02em' } },
});

export const pinSide = style({
  marginLeft: 'auto',
  fontSize: 12,
  fontWeight: 600,
  opacity: 0.9,
  '@media': { [phone]: { display: 'none' } },
});
