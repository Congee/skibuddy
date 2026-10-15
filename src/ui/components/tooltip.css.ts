import { style } from '@vanilla-extract/css';
import { vars } from '../theme/theme.css';

export const tooltipContent = style({
  padding: '6px 10px',
  borderRadius: 3,
  background: vars.color.ink,
  color: vars.color.ground,
  fontSize: 14,
  fontWeight: 600,
  boxShadow: vars.shadow.pop,
  zIndex: 30,
});
