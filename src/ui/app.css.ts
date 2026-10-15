import { style } from '@vanilla-extract/css';
import { phone } from './theme/global.css';
import { vars } from './theme/theme.css';

export const bar = style({
  display: 'flex',
  alignItems: 'center',
  gap: 20,
  minHeight: 56,
  padding: '6px 24px',
  borderBottom: `1px solid ${vars.color.rule}`,
  '@media': { [phone]: { gap: 10, padding: '6px 16px' } },
});

export const mark = style({
  fontSize: 22,
  fontWeight: 800,
  fontStretch: '112%',
  letterSpacing: '-0.01em',
  color: vars.color.ink,
});

export const picker = style({ minWidth: 0, '@media': { [phone]: { marginLeft: 'auto' } } });

export const theme = style({ flex: 'none' });

export const note = style({
  marginLeft: 'auto',
  fontSize: 14,
  color: vars.color.ink3,
  textAlign: 'right',
  '@media': { [phone]: { display: 'none' } },
});

export const lodge = style({
  display: 'grid',
  gridTemplateColumns: 'minmax(0, 54fr) minmax(0, 46fr)',
  gap: 24,
  alignItems: 'start',
  padding: '20px 20px 48px',
  '@media': {
    'screen and (max-width: 960px)': { gridTemplateColumns: 'minmax(0, 1fr)' },
    [phone]: { gap: 0, padding: '0 0 32px' },
  },
});

export const stage = style({
  position: 'sticky',
  top: 20,
  '@media': { 'screen and (max-width: 960px)': { position: 'static' } },
});

export const boards = style({ minWidth: 0, '@media': { [phone]: { padding: '10px 8px 0' } } });

export const status = style({ padding: '48px 24px', fontSize: 18, fontWeight: 600, color: vars.color.ink2 });

export const failure = style({
  maxWidth: '62ch',
  margin: '48px auto',
  padding: '0 24px',
  display: 'grid',
  gap: 10,
});

export const failureTitle = style({ fontSize: 26, fontWeight: 900, fontStretch: '80%', textTransform: 'uppercase' });

export const failureDetail = style({
  marginTop: 6,
  padding: 12,
  background: vars.color.well,
  borderRadius: 2,
  fontSize: 14,
  whiteSpace: 'pre-wrap',
  overflowWrap: 'anywhere',
  color: vars.color.ink2,
});

export const detailToggle = style({
  justifySelf: 'start',
  minHeight: 44,
  padding: '0 14px',
  border: `1.5px solid ${vars.color.ink2}`,
  borderRadius: 3,
  background: 'transparent',
  fontWeight: 700,
  cursor: 'pointer',
});

export const foot = style({
  padding: '20px 24px 40px',
  borderTop: `1px solid ${vars.color.rule}`,
  fontSize: 14,
  color: vars.color.ink3,
  display: 'grid',
  gap: 6,
  '@media': { [phone]: { padding: 16 } },
});
