import { assert, describe, it } from '@effect/vitest';
import { Intensity } from '../src/content/schema';
import { taskFor, TurnKind } from '../src/physics/task';
import type { TurnTask } from '../src/physics/task';
import { foreAftAt, HEINRICH_2022_MOMENTS, MOMENT_SIGMA, momentBandRows, momentPeakRows } from '../src/viewer/motion/turn';
import type { MomentTarget } from '../src/viewer/motion/turn';
import { value } from '../src/viewer/motion/fk';

const BAND: MomentTarget = { label: 'test', name: 'x', lo: -1, hi: 1, peak: 0 };
// The solver's penalty on an inequality row: 0 while ≥ 0, the row itself below.
const violation = (rows: ReadonlyArray<number>): number => rows.reduce((s, r) => s + Math.min(0, r), 0);
const band = (v: number, force: number): number => violation(momentBandRows(() => v, force, [BAND]).map(value));

describe('moment goals (heinrich-2022 Table 2, Fig 5)', () => {
  it('holds a band row at 0 inside and grows it linearly outside', () => {
    for (const v of [-1, -0.3, 0, 0.9, 1]) assert.strictEqual(band(v, 1), 0);
    assert.closeTo(band(1.5, 1), -0.5, 1e-12);
    assert.closeTo(band(2, 1), -1, 1e-12);
    assert.closeTo(band(-3, 1), -2, 1e-12);
    // Scaled by the outside force: half the force, half the band.
    assert.closeTo(band(0.75, 0.5), -0.25, 1e-12);
  });

  it('carries Table 2 bands and the force-peak reads on the outside leg and lumbar joint', () => {
    const by = Object.fromEntries(HEINRICH_2022_MOMENTS.map((m) => [m.name, m]));
    assert.deepInclude(by['hip_adduction.R'], { lo: -0.39, hi: 0.52, peak: 0.1 });
    assert.deepInclude(by['hip_rotation.R'], { lo: -0.17, hi: 0.06, peak: -0.17 });
    assert.deepInclude(by['hip_flexion.R'], { lo: -1.27, peak: -1.27 });
    assert.deepInclude(by['lumbar_flexion'], { lo: -1.88, hi: -0.16, peak: -1.88 });
    assert.deepInclude(by['lumbar_bending'], { lo: -0.75, hi: -0.01, peak: -0.35 });
    for (const m of HEINRICH_2022_MOMENTS) assert.isTrue(m.peak >= m.lo && m.peak <= m.hi, m.name);
  });

  it("puts the force-peak rows' z at 0 on heinrich's values and at 2 one 2σ off, per BW", () => {
    for (const force of [1, 1.6]) {
      const at = (shift: number): number[] => momentPeakRows((name) => (HEINRICH_2022_MOMENTS.find((m) => m.name === name)?.peak ?? NaN) * force + shift, force).map(value);
      for (const z of at(0)) assert.closeTo(z, 0, 1e-12);
      for (const z of at(2 * MOMENT_SIGMA)) assert.closeTo(z, 2, 1e-12);
    }
  });
});

describe('fore-aft goal keyed by the preset (sporri-2016 Fig 4, reid-2010)', () => {
  it('returns the GS curve for a GS preset under another kind', () => {
    const steered = taskFor(TurnKind.Steered, Intensity.Moderate);
    const relabelled: TurnTask = { ...steered, legacy: { ...steered.legacy, foreAft: taskFor(TurnKind.GS, Intensity.Moderate).legacy.foreAft } };
    for (const phi of [0.1, 0.2, 0.55, 0.9]) assert.deepStrictEqual(foreAftAt(relabelled.legacy.foreAft, phi), foreAftAt({ curve: 'gs_carving' }, phi));
    const flat = foreAftAt(steered.legacy.foreAft, 0.2);
    assert.deepStrictEqual(foreAftAt(steered.legacy.foreAft, 0.7), flat);
    assert.notDeepEqual(foreAftAt(relabelled.legacy.foreAft, 0.2), flat);
  });
});
