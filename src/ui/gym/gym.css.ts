import { globalStyle, style } from '@vanilla-extract/css';
import { phone } from '../theme/global.css';
import { vars } from '../theme/theme.css';

export const gym = style({ marginTop: 24, '@media': { [phone]: { marginTop: 16 } } });

export const intro = style({ marginTop: 6, maxWidth: '62ch', color: vars.color.plateInk });

export const list = style({ listStyle: 'none', margin: '4px 0 0', padding: 0, display: 'grid', gap: 4 });

export const exercise = style({
  display: 'grid',
  gridTemplateColumns: 'minmax(0, 1.15fr) minmax(0, 1fr)',
  gap: '6px 20px',
  padding: '12px 14px',
  background: vars.color.slat,
  color: vars.color.ink,
  borderRadius: 2,
  '@media': { [phone]: { gridTemplateColumns: 'minmax(0, 1fr)', padding: 12 } },
});

export const main = style({ display: 'grid', gap: 6, alignContent: 'start' });

export const title = style({
  fontSize: 16,
  fontWeight: 800,
  fontStretch: '85%',
  textTransform: 'uppercase',
  letterSpacing: '0.03em',
});

export const oneLeg = style({
  display: 'inline-block',
  marginLeft: 8,
  padding: '0 5px',
  border: `1.5px solid ${vars.color.ink2}`,
  borderRadius: 2,
  fontWeight: 700,
  fontStretch: '85%',
  fontSize: 14,
  letterSpacing: '0.05em',
  color: vars.color.ink2,
  verticalAlign: 1,
});

export const onSnow = style({ color: vars.color.ink2 });

export const versions = style({
  display: 'grid',
  gridTemplateColumns: 'auto minmax(0, 1fr)',
  gap: '2px 10px',
  margin: 0,
});

export const term = style({
  fontWeight: 800,
  fontStretch: '85%',
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
});

export const side = style({ display: 'grid', gap: 8, alignContent: 'start' });

export const trains = style({ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 4 });

export const target = style({ display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', gap: '0 8px' });

export const targetMuscle = style({ fontWeight: 700 });

export const contraction = style({ color: vars.color.ink2 });

export const fit = style({
  fontSize: 14,
  fontWeight: 700,
  color: vars.color.ink3,
});

export const cautions = style({ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 4 });

export const caution = style({ display: 'flex', gap: 8, alignItems: 'flex-start', fontWeight: 600 });

globalStyle(`${caution} svg`, { width: 16, height: 16, flex: 'none', marginTop: 2, color: vars.color.ink });

export const empty = style({ padding: '12px 6px', color: vars.color.plateInk2 });
