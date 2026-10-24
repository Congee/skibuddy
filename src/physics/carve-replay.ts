import type { CarveCell } from './carve-bake';
import { Snow } from './edge';
import type { TurnTask } from './task';
import { CARVE_DT, G, SWITCH_SHARE, V_FLOOR, carveFreeFall, carveSetupOf, massCurvatureOf, shareLawOf, skiCurvatureOf } from './turn';

const DEG = Math.PI / 180;

/**
 * Restart replay: from each sample, TS's free pendulum (carveFreeFall, the share law at the cell's λ_peak) and speed law
 * on the bake's ε (ε̇ constant) and h (ḧ constant) over the span to the next sample, Heun at CARVE_DT; the worst |Δλ|, degrees.
 */
export const replayLamDeg = (task: TurnTask, lamPeak: number, samples: CarveCell['samples']): number => {
  const st = carveSetupOf(task, Snow.HardGroomed, {});
  const { s, accel, share: S, stance } = st.inputs;
  const lawOf = shareLawOf(-(S - SWITCH_SHARE) * stance, lamPeak);
  const c = samples;
  const at = (k: keyof CarveCell['samples'], i: number): number => c[k][i] ?? Number.NaN;
  let worst = 0;
  for (let i = 0; i + 1 < c.t.length; i++) {
    const [t0, t1] = [at('t', i), at('t', i + 1)];
    const [e0, ed, h0, hd0, hdd] = [at('eps', i), at('epsDot', i + 1), at('h', i), at('hDot', i), at('hDdot', i + 1)];
    const rates = (tt: number, x: readonly [number, number, number, number]): [number, number, number, number] => {
      const [lam, w, psi, v] = x;
      const u = tt - t0;
      const q = { h: h0 + hd0 * u + 0.5 * hdd * u * u, hd: hd0 + hdd * u, hdd, lam, lamDot: w };
      const eps = e0 + ed * u;
      const law = lawOf(lam, w);
      const share = SWITCH_SHARE - law.p / stance;
      const f = carveFreeFall(s, q, law, v, psi, eps, share, skiCurvatureOf(s, eps, s.cos / Math.cos(lam), share));
      return [w, f.lamAcc, v * massCurvatureOf(f.load, lam, G * s.sin * Math.cos(psi), v), accel(psi, v, f.load)];
    };
    let x: [number, number, number, number] = [at('lam', i), at('lamDot', i), at('psi', i), at('v', i)];
    let tt = t0;
    while (tt < t1) {
      const dt = Math.min(CARVE_DT, t1 - tt);
      const a = rates(tt, x);
      const xb = x.map((xi, j) => xi + dt * (a[j] ?? 0)) as [number, number, number, number];
      xb[3] = Math.max(V_FLOOR, xb[3]);
      const b = rates(tt + dt, xb);
      x = x.map((xi, j) => xi + (dt * ((a[j] ?? 0) + (b[j] ?? 0))) / 2) as [number, number, number, number];
      x[3] = Math.max(V_FLOOR, x[3]);
      tt += dt;
    }
    worst = Math.max(worst, Math.abs(x[0] - at('lam', i + 1)) / DEG);
  }
  return worst;
};
