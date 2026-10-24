import { INTENSITIES, Intensity, PHASES, Side, phaseContraction, phaseIntensity } from './schema';
import type { Activation, ActivationIntensity, PhaseContraction, PhaseIntensity } from './schema';

export const Effort = { Resting: 'Resting', Light: 'Light', Working: 'Working', Hard: 'Hard' } as const;
export type Effort = (typeof Effort)[keyof typeof Effort];

export const EFFORTS: ReadonlyArray<Effort> = [Effort.Resting, Effort.Light, Effort.Working, Effort.Hard];

/** The top of the effort scale; content intensities run 0..3. */
export const MAX_EFFORT = 3;

/** Where each phase's own value sits in the turn: the centre of its third. */
export const PHASE_CENTRES: ReadonlyArray<number> = [1 / 6, 1 / 2, 5 / 6];

const smoothstep = (u: number): number => u * u * (3 - 2 * u);

/** An activation's effort per phase at setting `i`. */
export const effortsFor = (a: Activation, i: Intensity): PhaseIntensity => phaseIntensity(a.intensity, i);

/** An activation's contraction per phase at setting `i`. */
export const contractionsFor = (a: Activation, i: Intensity): PhaseContraction => phaseContraction(a.contraction, i);

/**
 * Effort at `t` in [0, 1) through one turn at `setting`, smoothstep-blended between phase
 * centres and wrapping from finish into the next turn's initiation. The next turn swaps the
 * legs, so across the switch the blend runs to or from `twin`, this muscle on the other leg
 * (by default the same intensity, for a muscle that does not change sides). For display only.
 */
/** Linear between frames; past the last frame toward the twin leg's first, as the cycle mirrors at the switch. */
export const framesAt = (frames: ReadonlyArray<number>, twin: ReadonlyArray<number>, t: number): number => {
  const p = (((t % 1) + 1) % 1) * frames.length;
  const k = Math.floor(p);
  const a = frames[k] ?? 0;
  const b = k + 1 < frames.length ? (frames[k + 1] ?? a) : (twin[0] ?? a);
  return a + (b - a) * (p - k);
};

export const effortAt = (intensity: ActivationIntensity, t: number, setting: Intensity = Intensity.Moderate, twin: ActivationIntensity = intensity): number => {
  const own = intensity.frames?.[setting];
  if (own !== undefined) return framesAt(own, twin.frames?.[setting] ?? own, t);
  const resolved = phaseIntensity(intensity, setting);
  const other = phaseIntensity(twin, setting);
  const values = PHASES.map((p) => resolved[p]);
  const n = values.length;
  const first = PHASE_CENTRES[0] ?? 0;
  const wrapped = ((t % 1) + 1) % 1;
  const x = wrapped < first ? wrapped + 1 : wrapped;
  for (let i = 0; i < n; i++) {
    const a = PHASE_CENTRES[i] ?? 0;
    const b = i + 1 < n ? (PHASE_CENTRES[i + 1] ?? 1) : first + 1;
    if (x <= b) {
      const crossing = i + 1 === n;
      // Before the switch this leg heads for the other leg's initiation; after it, it comes from the other leg's finish.
      const va = crossing && wrapped < first ? other.finish : (values[i] ?? 0);
      const vb = crossing ? (wrapped < first ? resolved.initiation : other.initiation) : (values[i + 1] ?? 0);
      return va + (vb - va) * smoothstep((x - a) / (b - a));
    }
  }
  return values[0] ?? 0;
};

const RESTING: ActivationIntensity = { initiation: 0, shaping: 0, finish: 0 };

/** The same muscle on the other leg, which takes this one's place in the next turn; resting when it has none. */
export const twinOf = (a: Activation, all: ReadonlyArray<Activation>): ActivationIntensity => {
  if (a.side === Side.Both) return a.intensity;
  const other = a.side === Side.Outside ? Side.Inside : Side.Outside;
  return all.find((x) => x.muscle === a.muscle && x.side === other)?.intensity ?? RESTING;
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

const allLevels = (a: Activation): ReadonlyArray<number> =>
  INTENSITIES.flatMap((i) => PHASES.map((p) => effortsFor(a, i)[p]));
const peak = (a: Activation): number => Math.max(...allLevels(a));
const sum = (a: Activation): number => allLevels(a).reduce((s, v) => s + v, 0);

/** A fixed order for a drill, the same at every setting: peak across the turn and settings, then total, then content order. */
export const steadyOrder = (activations: ReadonlyArray<Activation>): ReadonlyArray<Activation> =>
  activations
    .map((activation, index) => ({ activation, index }))
    .toSorted((a, b) => peak(b.activation) - peak(a.activation) || sum(b.activation) - sum(a.activation) || a.index - b.index)
    .map((x) => x.activation);

export { derivedActivations, derivedProblems } from './derived';
