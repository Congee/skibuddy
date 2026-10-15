import { effortAt, effortsFor, effortWord } from '../../content/effort';
import { INTENSITIES, Intensity, PHASES } from '../../content/schema';
import type { Activation, ActivationIntensity, Scenario } from '../../content/schema';
import { phaseForces } from '../../physics/turn';

export const INTENSITY_LABELS: Readonly<Record<Intensity, string>> = {
  [Intensity.Gentle]: 'Gentle',
  [Intensity.Moderate]: 'Moderate',
  [Intensity.Dynamic]: 'Dynamic',
};

export const INTENSITY_OPTIONS: ReadonlyArray<{ readonly value: Intensity; readonly label: string }> = INTENSITIES.map((i) => ({
  value: i,
  label: INTENSITY_LABELS[i],
}));

const roundTo = (x: number, step: number): number => Math.round(x / step) * step;

const kmh = (mps: number): number => mps * 3.6;

/** Load builds past the fall line and peaks early in the finish, as the radius opens toward the traverse. */
export const peakLoad = (s: Scenario): number => phaseForces(s).finish.load;

/** "Moderate: about 30 km/h, 12 m turns on a 12° slope. Load on the outside leg peaks below the fall line, about 1.2 × body weight." */
export const scenarioLine = (i: Intensity, s: Scenario): string =>
  `${INTENSITY_LABELS[i]}: about ${roundTo(kmh(s.speedMps), 5)} km/h, ${Math.round(s.radiusM)} m turns on a ${Math.round(s.slopeDeg)}° slope. ` +
  `Load on the outside leg peaks below the fall line, about ${peakLoad(s).toFixed(1)} × body weight.`;

/** "initiation Working, shaping Working, finish Hard" at setting `i`. */
export const phaseWords = (a: Activation, i: Intensity): string => {
  const e = effortsFor(a, i);
  return PHASES.map((p) => `${p} ${effortWord(e[p])}`).join(', ');
};

/** The activation's effort differs between settings somewhere in the turn. */
export const variesBySetting = (a: Activation): boolean => PHASES.some((p) => typeof a.intensity[p] !== 'number');

/** Notes that explain a value falling as intensity rises. */
export const settingNotes = (a: Activation): ReadonlyArray<string> =>
  PHASES.flatMap((p) => {
    const v = a.intensity[p];
    return typeof v === 'number' || v.note === undefined ? [] : [v.note];
  });

export const STRIP_SAMPLES = 60;

/** One turn of effort at setting `i`, sampled evenly for a strip. */
export const stripSamples = (
  intensity: ActivationIntensity,
  i: Intensity,
  samples: number = STRIP_SAMPLES,
): ReadonlyArray<{ readonly t: number; readonly v: number }> =>
  Array.from({ length: samples + 1 }, (_, k) => {
    const t = k / samples;
    return { t, v: effortAt(intensity, t, i) };
  });
