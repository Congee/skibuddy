import { globalStyle, style } from '@vanilla-extract/css';
import { vars } from './theme.css';

export const phone = 'screen and (max-width: 600px)';
export const reducedMotion = '(prefers-reduced-motion: reduce)';
export const motionOk = '(prefers-reduced-motion: no-preference)';
export const easeOut = 'cubic-bezier(0.16, 1, 0.3, 1)';

globalStyle('*, *::before, *::after', { boxSizing: 'border-box' });

globalStyle('html', {
  WebkitTextSizeAdjust: '100%',
  scrollbarColor: `${vars.color.ink3} transparent`,
});

globalStyle('body', {
  margin: 0,
  minHeight: '100vh',
  background: vars.color.ground,
  color: vars.color.ink,
  fontFamily: vars.font.body,
  fontSize: 16,
  lineHeight: 1.4,
  fontVariantNumeric: 'tabular-nums',
  caretColor: vars.color.focus,
  WebkitFontSmoothing: 'antialiased',
});

globalStyle('::selection', { background: vars.color.selection, color: vars.color.ink });

globalStyle('a', {
  color: 'inherit',
  textDecorationThickness: '1.5px',
  textUnderlineOffset: '3px',
});

globalStyle(':focus-visible', {
  outline: `3px solid ${vars.color.focus}`,
  outlineOffset: 2,
});

globalStyle('button, input, select', { font: 'inherit', color: 'inherit' });

globalStyle('h1, h2, h3, p, ol, ul, dl, dd, figure', { margin: 0 });

export const visuallyHidden = style({
  position: 'absolute',
  width: 1,
  height: 1,
  padding: 0,
  margin: -1,
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  whiteSpace: 'nowrap',
  border: 0,
});

/** Board type: one size, ranked by weight, case and reversal. */
export const caps = style({
  fontWeight: 800,
  fontStretch: '82%',
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
});
