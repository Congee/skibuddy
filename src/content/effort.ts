import { PHASES } from './schema';
import type { Activation, PhaseIntensity } from './schema';

export const Effort = { Resting: 'Resting', Light: 'Light', Working: 'Working', Hard: 'Hard' } as const;
export type Effort = (typeof Effort)[keyof typeof Effort];

export const EFFORTS: ReadonlyArray<Effort> = [Effort.Resting, Effort.Light, Effort.Working, Effort.Hard];

/** The top of the effort scale; content intensities run 0..3. */
export const MAX_EFFORT = 3;

/** Where each phase's own value sits in the turn: the centre of its third. */
export const PHASE_CENTRES: ReadonlyArray<number> = [1 / 6, 1 / 2, 5 / 6];

const smoothstep = (u: number): number => u * u * (3 - 2 * u);

/**
 * Effort at `t` in [0, 1) through one turn, smoothstep-blended between phase
 * centres and wrapping from finish back to initiation. For display only.
 */
export const effortAt = (intensity: PhaseIntensity, t: number): number => {
  const values = PHASES.map((p) => intensity[p]);
  const n = values.length;
  const first = PHASE_CENTRES[0] ?? 0;
  const wrapped = ((t % 1) + 1) % 1;
  const x = wrapped < first ? wrapped + 1 : wrapped;
  for (let i = 0; i < n; i++) {
    const a = PHASE_CENTRES[i] ?? 0;
    const b = i + 1 < n ? (PHASE_CENTRES[i + 1] ?? 1) : first + 1;
    if (x <= b) {
      const va = values[i] ?? 0;
      const vb = values[(i + 1) % n] ?? 0;
      return va + (vb - va) * smoothstep((x - a) / (b - a));
    }
  }
  return values[0] ?? 0;
};

export const effortWord = (v: number): Effort =>
  v < 0.5 ? Effort.Resting : v < 1.5 ? Effort.Light : v < 2.5 ? Effort.Working : Effort.Hard;

export type Rgb = readonly [number, number, number];

/** Colours for rest, l1, l2 and l3. */
export type EffortRamp = readonly [Rgb, Rgb, Rgb, Rgb];

/** Parses `#rgb` or `#rrggbb`; undefined for anything else. */
export const hexRgb = (hex: string): Rgb | undefined => {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  const digits = m?.[1];
  if (digits === undefined) return undefined;
  const full = digits.length === 3 ? [...digits].map((d) => d + d).join('') : digits;
  const ch = (i: number): number => Number.parseInt(full.slice(i, i + 2), 16);
  return [ch(0), ch(2), ch(4)];
};

/** Interpolates rest, l1, l2, l3 in sRGB; `v` is clamped to 0..3. */
export const effortColour = (v: number, ramp: EffortRamp): string => {
  const x = Math.min(MAX_EFFORT, Math.max(0, v));
  const i = Math.min(MAX_EFFORT - 1, Math.floor(x));
  const u = x - i;
  const a = ramp[i] ?? ramp[0];
  const b = ramp[i + 1] ?? a;
  const c = a.map((ch, j) => Math.round(ch + ((b[j] ?? ch) - ch) * u));
  return `rgb(${c.join(', ')})`;
};

const peak = (a: Activation): number => Math.max(...PHASES.map((p) => a.intensity[p]));
const sum = (a: Activation): number => PHASES.reduce((s, p) => s + a.intensity[p], 0);

/** A fixed order for a drill: peak across the turn, then total, then content order. */
export const steadyOrder = (activations: ReadonlyArray<Activation>): ReadonlyArray<Activation> =>
  activations
    .map((activation, index) => ({ activation, index }))
    .toSorted((a, b) => peak(b.activation) - peak(a.activation) || sum(b.activation) - sum(a.activation) || a.index - b.index)
    .map((x) => x.activation);
