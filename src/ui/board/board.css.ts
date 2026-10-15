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
  containerType: 'inline-size',
  '@media': { [phone]: { padding: 6, borderRadius: 3 } },
});

/** Below this board width the strip drops to full width under the name. */
const stacked = '(max-width: 580px)';

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

/** The intensity setting in plain words, under the terrain line. */
export const scenario = style({ marginTop: 6, maxWidth: '62ch', fontSize: 14, color: vars.color.plateInk2 });

export const drillSources = style({ marginTop: 8, maxWidth: '62ch', fontSize: 13, color: vars.color.plateInk2 });

export const cautions = style({ marginTop: 8, paddingLeft: '1.2em', maxWidth: '62ch', fontSize: 15, color: vars.color.plateInk });

/** The summary plate when it follows the slats on a phone. */
export const plateAfter = style({ marginTop: 4, paddingTop: 4 });

// Shared grid for the column heads and every slat row.
const columns = {
  display: 'grid',
  gridTemplateColumns: 'minmax(13ch, 1fr) 96px minmax(0, 2.6fr) 14px',
  columnGap: 12,
  alignItems: 'center',
} as const;

const stackedColumns = {
  gridTemplateColumns: 'minmax(0, 1fr) auto',
  columnGap: 8,
  rowGap: 8,
  padding: '8px 10px',
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
  '@container': { [stacked]: stackedColumns },
});

export const headTitle = style({
  gridColumn: '1 / span 2',
  font: 'inherit',
  letterSpacing: 'inherit',
  '@container': { [stacked]: { gridColumn: '1 / -1' } },
});

/** The phase labels sit over the strip column, a third each. */
export const headPhases = style({
  display: 'grid',
  gridTemplateColumns: 'repeat(3, 1fr)',
  gap: 4,
  '@container': { [stacked]: { gridColumn: '1 / -1' } },
});

export const headPhase = recipe({
  base: { textAlign: 'center', color: vars.color.plateInk2, letterSpacing: '0.03em', padding: '3px 0', borderRadius: 2 },
  variants: {
    now: {
      true: {
        background: vars.color.plateInk,
        color: vars.color.plate,
        fontWeight: 900,
        fontStretch: '75%',
        letterSpacing: 0,
      },
      false: {},
    },
  },
});

export const group = style({ marginTop: 4 });

/** A body-part label on its own plate strip above its slats. */
export const groupTitle = style({
  padding: '6px 10px',
  background: vars.color.plate,
  color: vars.color.plateInk2,
  fontSize: 13,
  fontWeight: 700,
  fontStretch: '85%',
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
  borderRadius: 2,
});

export const slats = style({ listStyle: 'none', margin: '4px 0 0', padding: 0, display: 'grid', gap: 4 });

export const slat = style({
  background: vars.color.slat,
  color: vars.color.ink,
  borderRadius: 2,
  // Clears the sticky phase tabs when a pin scrolls its slat into view.
  scrollMarginTop: 12,
  selectors: {
    '&[data-open]': { background: vars.color.slatOpen },
    // The slat whose muscle the figure shows: an ink bar inset from its leading edge, so it never merges with the frame.
    '&[data-focus]': { boxShadow: `inset 3px 0 0 ${vars.color.slatOpen}, inset 7px 0 0 ${vars.color.ink}` },
  },
  '@media': { [phone]: { scrollMarginTop: 80 } },
});

export const slatRow = style({
  ...columns,
  width: '100%',
  minHeight: 58,
  padding: '8px 10px',
  border: 0,
  borderRadius: 2,
  background: 'transparent',
  textAlign: 'left',
  cursor: 'pointer',
  fontSize: 16,
  selectors: {
    '&:hover': { boxShadow: `inset 0 0 0 2px ${vars.color.ink3}` },
  },
  '@container': { [stacked]: { ...stackedColumns, minHeight: 68 } },
});

// Wraps instead of truncating; the side word sits on its own line.
export const name = style({ minWidth: 0, lineHeight: 1.2 });

export const muscle = style({
  fontWeight: 800,
  fontStretch: '82%',
  textTransform: 'uppercase',
  letterSpacing: '0.03em',
});

export const side = style({ display: 'block', fontWeight: 400, color: vars.color.ink3 });

export const evidence = style({
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'flex-start',
  gap: 6,
  '@container': { [stacked]: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', flexWrap: 'wrap' } },
});

/** Strip height in px; the area tops out STRIP_TOP px below it so the dot stays inside. */
export const STRIP_HEIGHT = 40;
export const STRIP_TOP = 5;

export const strip = style({
  position: 'relative',
  display: 'block',
  height: STRIP_HEIGHT,
  // Playhead and dot move by transform in cqw, so a playback step never lays out.
  containerType: 'inline-size',
  '@container': { [stacked]: { gridColumn: '1 / -1' } },
});

export const stripSvg = style({ position: 'absolute', inset: 0, width: '100%', height: '100%', overflow: 'visible' });

export const stripEdge = style({ fill: 'none', stroke: vars.color.ink2, strokeWidth: 1.5, strokeLinejoin: 'round' });

export const stripBase = style({ stroke: vars.color.rule, strokeWidth: 1.5 });

export const stripTick = style({ stroke: vars.color.rule, strokeWidth: 1, strokeDasharray: '2 3' });

export const playhead = style({
  position: 'absolute',
  top: -5,
  bottom: -5,
  left: -1,
  width: 2,
  transform: 'translateX(50cqw)',
  background: vars.color.ink,
  borderRadius: 1,
});

export const dot = style({
  position: 'absolute',
  top: 0,
  left: 0,
  width: 14,
  height: 14,
  margin: '-7px 0 0 -7px',
  borderRadius: '50%',
  border: `2px solid ${vars.color.ink}`,
  background: vars.color.rest,
  transform: 'translateX(50cqw)',
});

export const caret = style({
  width: 14,
  height: 14,
  color: vars.color.ink2,
  '@media': { [motionOk]: { transition: `transform 200ms ${easeOut}` } },
  '@container': { [stacked]: { display: 'none' } },
  selectors: { '[data-state="open"] > &': { transform: 'rotate(180deg)' } },
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
      pin: {
        fontSize: 12,
        padding: '1px 5px',
        borderWidth: 1.5,
        borderColor: vars.color.pinInk,
        color: vars.color.pinInk,
        '@media': { [phone]: { fontSize: 12, padding: '1px 4px' } },
      },
    },
  },
  compoundVariants: [
    { variants: { confidence: 'high', tone: 'plate' }, style: { background: vars.color.plateInk2, color: vars.color.plate } },
    { variants: { confidence: 'high', tone: 'pin' }, style: { background: vars.color.pinInk, color: vars.color.pinBg } },
    { variants: { confidence: 'low', tone: 'pin' }, style: { borderColor: vars.color.pinInk, color: vars.color.pinInk } },
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

export const swatch = style({ display: 'inline-flex', alignItems: 'center', gap: 6, minHeight: 22 });

/** Legend bars for Resting, Light, Working, Hard: colour and height together. */
export const scaleBars = [vars.color.rest, vars.color.l1, vars.color.l2, vars.color.l3].map((colour, i) =>
  style({ display: 'inline-block', width: 22, height: 3 + i * 4, alignSelf: 'flex-end', marginBottom: 3, background: colour, borderRadius: 1 }),
);

export const legendNote = style({ flexBasis: '100%', margin: 0, maxWidth: '70ch' });

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

export const structuresTitle = style([groupTitle, { padding: 0 }]);

export const structures = style({ listStyle: 'none', margin: '6px 0 0', padding: 0, display: 'grid', gap: 10, maxWidth: '70ch' });

export const structure = style({ display: 'grid', gap: 2 });

export const structurePhases = style({ color: vars.color.plateInk2 });
