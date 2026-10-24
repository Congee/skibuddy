import type { Scalar } from '../fk';

/**
 * Lumbo-pelvic rhythm prior: monocular capture cannot split trunk flexion between pelvis tilt and the lumbar
 * spine, so the split comes from Tafazzol et al. 2014 (Clin Biomech 29:7–13, abstract, 8 asymptomatic males,
 * standing forward flexion, inertial sensors): incremental lumbar/pelvic ratio 2.51 over 0–30° trunk flexion,
 * 1.34 over 90–120°. Inferred: the ratio is linear between those bins' midpoints (15°, 105°) and extrapolated
 * beyond them, and a standing bend's rhythm holds for a skier's flexed stance.
 */
export const RHYTHM = { ratioEarly: 2.51, atEarly: 15, ratioLate: 1.34, atLate: 105 } as const;

const DEG = Math.PI / 180;
const SLOPE = (RHYTHM.ratioLate - RHYTHM.ratioEarly) / ((RHYTHM.atLate - RHYTHM.atEarly) * DEG);
const R0 = RHYTHM.ratioEarly - SLOPE * RHYTHM.atEarly * DEG;

/** Incremental lumbar/pelvic ratio at combined pelvis + lumbar flexion θ (radians). */
export const rhythmRatio = (theta: number): number => R0 + SLOPE * theta;

/**
 * Lumbar share of combined flexion θ: ∫₀^θ r/(1 + r) = θ − ln((1 + r(θ))/(1 + r(0)))/b, r = r₀ + bθ.
 * Valid while r stays positive (θ below ~ 195°).
 */
export const lumbarShare = (theta: Scalar): Scalar => {
  if (typeof theta === 'number') return theta - Math.log((1 + R0 + SLOPE * theta) / (1 + R0)) / SLOPE;
  const v = theta.v;
  const u = 1 + R0 + SLOPE * v;
  return theta.chain(v - Math.log(u / (1 + R0)) / SLOPE, 1 - 1 / u);
};
