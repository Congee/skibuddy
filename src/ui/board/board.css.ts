import { globalStyle, keyframes, style } from '@vanilla-extract/css';
import { recipe } from '@vanilla-extract/recipes';
import { slotRecipe } from '../components/slot-recipe';
import { easeOut, motionOk, phone } from '../theme/global.css';
import { vars } from '../theme/theme.css';

/** The spruce frame every board hangs in. */
export const frame = style({
  background: vars.color.frame,
  borderRadius: 4,
  padding: 8,
  '@media': { [phone]: { padding: 6, borderRadius: 3 } },
});

export const plate = style({
  background: vars.color.plate,
  color: vars.color.plateInk,
  padding: '14px 16px 16px',
  borderRadius: 2,
  '@media': { [phone]: { padding: 12 } },
});

export const drillTitle = style({
  fontSize: 'clamp(28px, 2.6vw, 38px)',
  lineHeight: 1.02,
  fontWeight: 900,
  fontStretch: '78%',
  textTransform: 'uppercase',
  letterSpacing: '0.01em',
  textWrap: 'balance',
});

export const plateTitle = style([drillTitle, { fontSize: 26 }]);

export const meta = style({
  display: 'flex',
  flexWrap: 'wrap',
  gap: '4px 14px',
  marginTop: 8,
  fontSize: 13,
  fontWeight: 700,
  fontStretch: '88%',
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
  color: vars.color.plateInk2,
});

export const summary = style({ marginTop: 8, maxWidth: '62ch', fontSize: 16, color: vars.color.plateInk });

// Shared grid for the column heads and every slat row.
const columns = {
  display: 'grid',
  gridTemplateColumns: '16px minmax(0, 1fr) 46px 46px 46px 92px 96px 14px',
  columnGap: 6,
  alignItems: 'center',
} as const;

export const heads = style({
  ...columns,
  marginTop: 8,
  padding: '8px 10px',
  minHeight: 36,
  background: vars.color.plate,
  color: vars.color.plateInk,
  fontSize: 13,
  fontWeight: 700,
  fontStretch: '85%',
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
  borderRadius: 2,
  '@media': { [phone]: { display: 'none' } },
});

export const headTitle = style({
  gridColumn: '1 / span 2',
  font: 'inherit',
  letterSpacing: 'inherit',
});

export const headPhase = recipe({
  base: { textAlign: 'center', color: vars.color.plateInk2, letterSpacing: '0.03em' },
  variants: {
    now: {
      true: {
        background: vars.color.plateInk,
        color: vars.color.plate,
        borderRadius: 2,
        padding: '3px 0',
        margin: '0 -5px',
        fontWeight: 900,
      },
      false: {},
    },
  },
});

export const slats = style({ listStyle: 'none', margin: '4px 0 0', padding: 0, display: 'grid', gap: 4 });

export const slat = style({
  background: vars.color.slat,
  color: vars.color.ink,
  borderRadius: 2,
  selectors: { '&[data-open]': { background: vars.color.slatOpen } },
});

export const slatRow = style({
  ...columns,
  width: '100%',
  minHeight: 58,
  padding: '6px 10px',
  border: 0,
  borderRadius: 2,
  background: 'transparent',
  textAlign: 'left',
  cursor: 'pointer',
  fontSize: 16,
  selectors: {
    '&:hover': { boxShadow: `inset 0 0 0 2px ${vars.color.ink3}` },
  },
  '@media': {
    [phone]: {
      gridTemplateColumns: '16px minmax(0, 1fr) 46px 46px 46px',
      columnGap: 4,
      gridTemplateRows: 'auto auto',
      rowGap: 6,
      minHeight: 68,
      padding: 8,
    },
  },
});

export const change = style({
  width: 14,
  height: 14,
  color: vars.color.ink,
  '@media': { [phone]: { gridColumn: 1, gridRow: 1 } },
});

export const changeSame = style({ color: vars.color.ink3 });

export const name = style({
  minWidth: 0,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  '@media': { [phone]: { gridColumn: 2, gridRow: 1, whiteSpace: 'normal' } },
});

export const muscle = style({
  fontWeight: 800,
  fontStretch: '82%',
  textTransform: 'uppercase',
  letterSpacing: '0.03em',
});

export const side = style({ marginLeft: 6, color: vars.color.ink3 });

/** Phone grid cells for the initiation, shaping and finish tags. */
export const tagCells = [3, 4, 5].map((column) => style({ '@media': { [phone]: { gridColumn: column, gridRow: '1 / span 2' } } }));

export const evidence = style({
  display: 'contents',
  '@media': {
    [phone]: {
      gridColumn: 2,
      gridRow: 2,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 8,
    },
  },
});

export const caret = style({
  width: 14,
  height: 14,
  color: vars.color.ink2,
  '@media': {
    [motionOk]: { transition: `transform 200ms ${easeOut}` },
    [phone]: { display: 'none' },
  },
  selectors: { '[data-state="open"] > &': { transform: 'rotate(180deg)' } },
});

const flip = keyframes({
  from: { transform: 'perspective(240px) rotateX(-80deg)', filter: 'brightness(0.7)' },
  to: { transform: 'none', filter: 'none' },
});

/** Enamel flip-tag: numeral, fill and hatch density all carry the level. */
export const tag = recipe({
  base: {
    position: 'relative',
    justifySelf: 'center',
    display: 'grid',
    placeItems: 'start center',
    width: 30,
    height: 40,
    paddingTop: 9,
    borderRadius: 3,
    fontWeight: 800,
    fontStretch: '75%',
    fontSize: 22,
    lineHeight: 1,
    overflow: 'hidden',
    boxShadow: `inset 0 0 0 1.5px ${vars.color.tagRim}, ${vars.shadow.tag}`,
    transformOrigin: '50% 0',
    selectors: {
      // The hanging hole.
      '&::before': {
        content: '""',
        position: 'absolute',
        top: 3,
        left: '50%',
        width: 4,
        height: 4,
        marginLeft: -2,
        borderRadius: '50%',
        background: 'currentColor',
        opacity: 0.6,
      },
      '&::after': {
        content: '""',
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 0,
        height: 9,
        borderTop: '1px solid currentColor',
      },
    },
  },
  variants: {
    level: {
      0: {
        background: 'transparent',
        color: vars.color.ink3,
        boxShadow: `inset 0 0 0 1.5px ${vars.color.ink3}`,
        selectors: { '&::after': { borderTopStyle: 'dashed' } },
      },
      1: {
        background: vars.color.l1,
        color: vars.color.l1Ink,
        selectors: { '&::after': { background: 'repeating-linear-gradient(135deg, currentColor 0 1.5px, transparent 1.5px 9px)' } },
      },
      2: {
        background: vars.color.l2,
        color: vars.color.l2Ink,
        selectors: { '&::after': { background: 'repeating-linear-gradient(135deg, currentColor 0 1.5px, transparent 1.5px 5px)' } },
      },
      3: {
        background: vars.color.l3,
        color: vars.color.l3Ink,
        selectors: { '&::after': { background: 'repeating-linear-gradient(135deg, currentColor 0 1.5px, transparent 1.5px 3px)' } },
      },
    },
    size: {
      small: {},
      now: {
        width: 44,
        height: 50,
        paddingTop: 10,
        fontSize: 30,
        selectors: { '&::after': { height: 11 } },
        '@media': { [motionOk]: { animation: `${flip} 420ms ${easeOut}` } },
      },
      mini: {
        width: 22,
        height: 26,
        paddingTop: 4,
        fontSize: 15,
        boxShadow: 'none',
        selectors: { '&::before': { display: 'none' }, '&::after': { height: 6 } },
      },
    },
  },
  defaultVariants: { level: 0, size: 'small' },
});

/** solid = measured, outlined = inferred, dashed = opinion. */
export const stamp = recipe({
  base: {
    justifySelf: 'start',
    fontWeight: 800,
    fontStretch: '80%',
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
    padding: '3px 7px',
    borderRadius: 2,
    whiteSpace: 'nowrap',
    border: `2px solid ${vars.color.ink}`,
    fontSize: 16,
    lineHeight: 1.1,
    '@media': { [phone]: { fontSize: 14, padding: '2px 6px' } },
  },
  variants: {
    confidence: {
      high: { background: vars.color.ink, color: vars.color.slat },
      medium: {},
      low: { borderStyle: 'dashed', borderColor: vars.color.ink2, color: vars.color.ink2 },
    },
    tone: {
      slat: {},
      plate: {
        fontSize: 13,
        padding: '1px 5px',
        borderColor: vars.color.plateInk2,
        color: vars.color.plateInk2,
      },
    },
  },
  compoundVariants: [
    { variants: { confidence: 'high', tone: 'plate' }, style: { background: vars.color.plateInk2, color: vars.color.plate } },
  ],
  defaultVariants: { confidence: 'medium', tone: 'slat' },
});

export const keys = style({ display: 'flex', gap: 4, justifySelf: 'start' });

export const key = style({
  display: 'grid',
  placeItems: 'center',
  minWidth: 28,
  height: 28,
  padding: '0 4px',
  borderRadius: 2,
  border: `1.5px solid ${vars.color.ink2}`,
  fontWeight: 700,
  fontStretch: '85%',
  lineHeight: 1,
  selectors: {
    '[data-state="open"] &': { background: vars.color.ink, color: vars.color.slat, borderColor: vars.color.ink },
  },
});

export const noKey = style({ color: vars.color.ink3, fontStretch: '85%' });

export const detail = style({
  overflow: 'hidden',
  '@media': {
    [motionOk]: {
      selectors: {
        '&[data-state="open"]': { animation: `${keyframes({ from: { height: 0 }, to: { height: 'var(--height)' } })} 260ms ${easeOut}` },
        '&[data-state="closed"]': { animation: `${keyframes({ from: { height: 'var(--height)' }, to: { height: 0 } })} 200ms ${easeOut}` },
      },
    },
  },
});

export const detailBody = style({
  display: 'grid',
  gap: 6,
  margin: '0 10px',
  padding: '10px 0 14px 22px',
  borderTop: `1px solid ${vars.color.rule}`,
  '@media': { [phone]: { paddingLeft: 0 } },
});

export const line = style({ maxWidth: '66ch' });

export const label = style({
  marginRight: 8,
  fontWeight: 800,
  fontStretch: '85%',
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
});

export const cites = style({ listStyle: 'none', margin: '4px 0 0', padding: 0, display: 'grid', gap: 4 });

export const cite = style({
  display: 'grid',
  gridTemplateColumns: '28px minmax(0, 1fr)',
  gap: 10,
  alignItems: 'start',
  padding: '10px 12px',
  background: vars.color.well,
  borderRadius: 2,
});

export const citeKey = style([key, { background: vars.color.ink, color: vars.color.slat, borderColor: vars.color.ink }]);

export const citeLink = style({ fontWeight: 600 });

globalStyle(`${citeLink} svg`, { width: 11, height: 11, marginLeft: 5, verticalAlign: 0 });

export const citeNote = style({ display: 'block', marginTop: 2, fontSize: 14, color: vars.color.ink3 });

export const legend = style({
  display: 'flex',
  flexWrap: 'wrap',
  alignItems: 'center',
  gap: '8px 18px',
  padding: '12px 6px 4px',
  color: vars.color.plateInk2,
  fontSize: 14,
});

export const swatch = style({ display: 'inline-flex', alignItems: 'center', gap: 6 });

globalStyle(`${legend} [data-level="0"]`, { color: vars.color.plateInk2, boxShadow: `inset 0 0 0 1.5px ${vars.color.plateInk2}` });

export const unreviewed = style({ padding: '6px 6px 6px', color: vars.color.plateInk2, fontSize: 14, maxWidth: '70ch' });

export const assoc = slotRecipe({
  slots: ['root', 'title', 'list', 'row', 'trigger', 'link', 'fundamentals'],
  base: {
    root: { marginTop: 14, paddingTop: 12, borderTop: `1px solid ${vars.color.plateInk2}` },
    title: {
      fontSize: 13,
      fontWeight: 700,
      fontStretch: '85%',
      textTransform: 'uppercase',
      letterSpacing: '0.08em',
      color: vars.color.plateInk2,
    },
    list: { listStyle: 'none', margin: '6px 0 0', padding: 0, display: 'grid', gap: 2 },
    row: { display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', alignItems: 'center', columnGap: 12 },
    trigger: {
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      minHeight: 44,
      padding: 0,
      border: 0,
      background: 'transparent',
      color: vars.color.plateInk,
      textAlign: 'left',
      cursor: 'pointer',
      fontWeight: 600,
      selectors: { '&:hover': { textDecoration: 'underline', textUnderlineOffset: 3 } },
    },
    link: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: 5,
      minHeight: 44,
      fontWeight: 600,
      color: vars.color.plateInk,
      whiteSpace: 'nowrap',
    },
    fundamentals: {
      gridColumn: '1 / -1',
      margin: '0 0 8px',
      paddingLeft: 22,
      color: vars.color.plateInk2,
      maxWidth: '64ch',
    },
  },
});

globalStyle(`${assoc.trigger()} svg, ${assoc.link()} svg`, { width: 12, height: 12, flex: 'none' });
