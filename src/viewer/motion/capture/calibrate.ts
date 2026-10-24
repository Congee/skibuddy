import { mm, mt, rotY, zxy } from './geometry';

/**
 * Functional knee-axis calibration: the femur frame twist θ about its own long axis (F_femur · Ry(θ)) that
 * minimises the knee's varus/valgus (the Grood–Suntay x angle of the tibia on the femur) over the clip, so the
 * capture's flexion lies on skibuddy's 1-DOF knee hinge instead of leaking into a varus it cannot express.
 */

/** Knee x angle per frame for femur twist θ; `local` is the tibia's rest rotation in the femur's rest frame. */
export const kneeVarus = (femur: ReadonlyArray<ReadonlyArray<number>>, tibia: ReadonlyArray<ReadonlyArray<number>>, local: ReadonlyArray<number>, theta: number): number[] => {
  const twist = rotY(theta);
  const lt = mt(local);
  return femur.map((F, k) => zxy(mm(mt(mm(F, twist)), mm(tibia[k] ?? [], lt))).x);
};

const cost = (xs: readonly number[]): number => xs.reduce((s, x) => s + x * x, 0) / Math.max(1, xs.length);

/** θ in (−π/2, π/2) minimising mean varus²: a 1° grid, then golden-section on the best cell. */
export const femurTwist = (femur: ReadonlyArray<ReadonlyArray<number>>, tibia: ReadonlyArray<ReadonlyArray<number>>, local: ReadonlyArray<number>): { theta: number; before: number; after: number } => {
  const f = (t: number): number => cost(kneeVarus(femur, tibia, local, t));
  const step = Math.PI / 180;
  let best = 0;
  for (let t = -89 * step; t <= 89 * step; t += step) if (f(t) < f(best)) best = t;
  let [a, b] = [best - step, best + step];
  const g = (Math.sqrt(5) - 1) / 2;
  for (let n = 0; n < 40; n++) {
    const c = b - g * (b - a);
    const d = a + g * (b - a);
    if (f(c) < f(d)) b = d;
    else a = c;
  }
  const theta = (a + b) / 2;
  return { theta, before: Math.sqrt(f(0)), after: Math.sqrt(f(theta)) };
};
