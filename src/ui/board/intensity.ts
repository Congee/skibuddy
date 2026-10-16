import { effortAt, effortsFor, effortWord } from '../../content/effort';
import { INTENSITIES, Intensity, PHASES } from '../../content/schema';
import { isTurnScenario } from '../../content/schema';
import type { Activation, ActivationIntensity, Scenario, TurnScenario } from '../../content/schema';
import { G, phaseForces } from '../../physics/turn';

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
export const peakLoad = (s: TurnScenario): number => phaseForces(s).finish.load;

/**
 * Snow force over body weight while braking to a stop over `d` metres: Lind & Sanders eq 4.7 in the slope
 * plane, m·v²/(2d) + W sin α, with the slope's normal share W cos α. Constant force assumed; real peaks run higher.
 */
export const stopLoad = (speedMps: number, slopeDeg: number, d: number): number => {
  const alpha = (slopeDeg * Math.PI) / 180;
  return Math.hypot(speedMps ** 2 / (2 * G * d) + Math.sin(alpha), Math.cos(alpha));
};

/** "Moderate: about 30 km/h, 12 m turns on a 12° slope. Load on the outside leg peaks below the fall line, about 1.2 × body weight." */
export const scenarioLine = (i: Intensity, s: Scenario): string => {
  const head = `${INTENSITY_LABELS[i]}: about ${roundTo(kmh(s.speedMps), 5)} km/h`;
  const slope = `${Math.round(s.slopeDeg)}° slope`;
  if (isTurnScenario(s)) {
    return `${head}, ${Math.round(s.radiusM)} m turns on a ${slope}. Load on the outside leg peaks below the fall line, about ${peakLoad(s).toFixed(1)} × body weight.`;
  }
  if (s.stopDistanceM === undefined) {
    // At a steady speed the snow's force balances gravity, so it averages about body weight.
    if (s.stepRateHz !== undefined) {
      return `${head} on a ${slope}, no round turns, stepping about ${Number(s.stepRateHz.toFixed(1))} times a second; the legs carry about body weight on average, each push briefly more.`;
    }
    return `${head} on a ${slope}, no round turns; the legs carry about body weight at a steady speed.`;
  }
  return (
    `${head} on a ${slope}, braking to a stop within about ${s.stopDistanceM} m. ` +
    `The load on the legs rises to about ${stopLoad(s.speedMps, s.slopeDeg, s.stopDistanceM).toFixed(1)} × body weight while braking.`
  );
};

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
