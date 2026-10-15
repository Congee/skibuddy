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
  // The scene draws its own ground.
  background: vars.color.field,
  '@media': { [phone]: { borderRadius: 0 } },
});

/** Stands in for the canvas while the 3D code loads. */
export const pending = style({
  borderRadius: 4,
  background: vars.color.field,
  '@media': { [phone]: { borderRadius: 0 } },
});

export const loading = style({
  position: 'absolute',
  top: '40%',
  left: '50%',
  transform: 'translate(-50%, -50%)',
  margin: 0,
  fontSize: 16,
  fontWeight: 600,
  color: vars.color.plateInk2,
  pointerEvents: 'none',
});

globalStyle(`${field} figcaption a`, { color: vars.color.ink2 });

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

globalStyle(`[data-mark="focus"] > ${leaderLine}`, { strokeWidth: 2.5 });
globalStyle(`[data-mark="focus"] > ${leaderUnder}`, { strokeWidth: 5.5 });
globalStyle(`${overlay}[data-focused] g:not([data-mark])`, { opacity: 0.6 });

/** A sign-white slat: white margin, then an ink rule, no soft shadow. */
export const pin = style({
  position: 'absolute',
  top: 0,
  left: 0,
  display: 'grid',
  gridTemplateColumns: 'auto minmax(0, 1fr)',
  alignItems: 'start',
  columnGap: 8,
  padding: '7px 9px 7px 7px',
  borderRadius: 3,
  background: vars.color.pinBg,
  color: vars.color.pinInk,
  boxShadow: `inset 0 0 0 2px ${vars.color.pinBg}, inset 0 0 0 3.5px ${vars.color.pinInk}`,
  // The overlay lets drags through to the canvas; pins themselves open their slat.
  pointerEvents: 'auto',
  cursor: 'pointer',
  '@media': {
    [motionOk]: { transition: `transform 320ms ${easeOut}, opacity 160ms ${easeOut}` },
    [phone]: { columnGap: 6, padding: '6px 7px 6px 6px' },
  },
});

// A pale outer ring like the figure's focus outline: full for the focused muscle, thin for a preview or hover.
const ring = (width: number): string => `inset 0 0 0 2px ${vars.color.pinBg}, inset 0 0 0 3.5px ${vars.color.pinInk}, 0 0 0 ${width}px ${vars.color.leader}`;

globalStyle(`${pin}[data-mark="focus"]`, {
  zIndex: 1,
  boxShadow: `inset 0 0 0 2px ${vars.color.pinBg}, inset 0 0 0 4.5px ${vars.color.pinInk}, 0 0 0 3.5px ${vars.color.leader}`,
});
globalStyle(`${pin}[data-mark="preview"], ${pin}:hover`, { boxShadow: ring(2) });

// While a slat is focused the other pins step back, as their muscles do.
globalStyle(`${overlay}[data-focused] ${pin}:not([data-mark])`, { opacity: 0.6 });

// Pins follow every played frame; easing each step would keep the compositor busy.
globalStyle(`${overlay}[data-playing] ${pin}`, { transition: 'none' });

export const pinBody = style({ display: 'grid', rowGap: 4, minWidth: 0 });

export const pinName = style({
  display: '-webkit-box',
  WebkitBoxOrient: 'vertical',
  WebkitLineClamp: 2,
  overflow: 'hidden',
  whiteSpace: 'normal',
  overflowWrap: 'break-word',
  fontSize: 14,
  lineHeight: 1.15,
  fontWeight: 800,
  fontStretch: '80%',
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
  '@media': { [phone]: { fontSize: 13, letterSpacing: '0.02em' } },
});

export const pinMeta = style({ display: 'flex', alignItems: 'center', gap: 6 });

export const pinSide = style({ fontSize: 12, fontWeight: 600 });

/** Filled with the effort colour by direct writes as the turn plays. */
export const pinSwatch = style({
  width: 14,
  height: 14,
  marginTop: 2,
  borderRadius: 2,
  boxShadow: `inset 0 0 0 1.5px ${vars.color.pinInk}`,
  '@media': { [phone]: { width: 12, height: 12 } },
});

export const pinWord = style({ fontSize: 12, fontWeight: 700, lineHeight: 1 });
