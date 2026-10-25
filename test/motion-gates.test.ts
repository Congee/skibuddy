import { assert, describe, it } from '@effect/vitest';
import { INTENSITIES, Intensity } from '../src/content/schema';
import { edgeBandGate, Gate, gateAll, gateTurn, MOGUL_HIPS_DEG, MOGUL_LEAN_RATIO_SPREAD, mogulHipsGate, mogulLegLeanGate, mogulMassPathGate, momentsGate, REPORT_ONLY, THRESHOLD } from '../src/viewer/motion/gates';
import type { GateResult } from '../src/viewer/motion/gates';
import { MIGRATED, Q_FRAMES } from '../src/viewer/motion/q-table';
import { HEINRICH_2022_MOMENTS, NAMES } from '../src/viewer/motion/turn';
import type { PeakValues } from '../src/viewer/motion/turn';
import { REST_POSE } from '../src/viewer/skeleton';

const peak = (z: number, inside: number): PeakValues => ({
  t: 0.68,
  force: 1,
  banded: true,
  moments: HEINRICH_2022_MOMENTS.map((target, i) => ({ target, perBW: target.peak, z: i === 0 ? z : 0 })),
  insideHipRotation: inside,
  kneeRotation: [],
  split: [],
  insideHip: [],
});

describe('motion gates', () => {
  it('fails a frame whose edge is 8 deg over the margin band', () => {
    const r = edgeBandGate([{ edgeDeg: 30, leanDeg: 30 }, { edgeDeg: 43, leanDeg: 30 }], -5, 5);
    assert.strictEqual(r.value, 8);
    assert.isFalse(r.pass);
    assert.isTrue(edgeBandGate([{ edgeDeg: 34, leanDeg: 30 }, { edgeDeg: 26, leanDeg: 30 }], -5, 5).pass);
  });

  it("passes mogul hips only when the hip line's peak toward the lean side lies in the clips' 9.8..23.5 deg, the mass sweeping less than the skis", () => {
    assert.deepStrictEqual(MOGUL_HIPS_DEG, [9.8, 23.5]);
    // M2's clip peaks: bumpB 10.0, bumpA 12.5, jdsB 21.6.
    for (const clip of [10, 12.5, 21.6]) assert.isTrue(mogulHipsGate([0, clip / 2, clip, -1], 0.2, 0.5).pass, `${clip}`);
    assert.isFalse(mogulHipsGate([0, 6, 9], 0.2, 0.5).pass);
    assert.isFalse(mogulHipsGate([2, 24.5], 0.2, 0.5).pass);
    assert.approximately(mogulHipsGate([2, 24.5], 0.2, 0.5).value, 1, 1e-9);
    // The peak is toward the lean side: the outside hip lower does not count.
    assert.isFalse(mogulHipsGate([-15, 2], 0.2, 0.5).pass);
    assert.isFalse(mogulHipsGate([2, 15], 0.5, 0.4).pass);
  });

  it("passes the mogul leg lean only when its peak lies in the clips' 22..33 deg widened to 17..38", () => {
    assert.isTrue(mogulLegLeanGate([3, -25, 30]).pass);
    assert.isFalse(mogulLegLeanGate([3, 16.9, -12]).pass);
    assert.isFalse(mogulLegLeanGate([3, -38.2]).pass);
    assert.approximately(mogulLegLeanGate([-40, 10]).value, 2, 1e-9);
  });

  it("passes the mogul mass path only within the clips' spread of the physics every frame and its peak in their band", () => {
    assert.isTrue(mogulMassPathGate([0.1, -0.38, 0.39], [0.12, -0.37, 0.38]).pass);
    assert.isFalse(mogulMassPathGate([0.1, -0.38], [0.15, -0.38]).pass);
    assert.isFalse(mogulMassPathGate([0.1, 0.3], [0.1, 0.3]).pass);
    assert.isFalse(mogulMassPathGate([0.1, -0.43], [0.1, -0.43]).pass);
    assert.approximately(MOGUL_LEAN_RATIO_SPREAD, (0.4167 - 0.357) / 2, 1e-12);
  });

  it('counts force-peak moment rows beyond 2σ and checks the inside hip rotation sign (heinrich-2022)', () => {
    assert.isTrue(momentsGate(peak(1.9, 0.2)).pass);
    const r = momentsGate(peak(2.1, 0.2));
    assert.strictEqual(r.value, 1);
    assert.isFalse(r.pass);
    assert.isFalse(momentsGate(peak(0, -0.68)).pass);
    assert.isFalse(momentsGate(peak(0, 0.5)).pass);
    assert.match(momentsGate(null).detail, /^n\/a: /);
  });

  it('gives a drill with no model kind no gates', () => {
    assert.deepStrictEqual(gateTurn('stork-turn', Intensity.Gentle, []), {});
  });

  it('reports every gate on a rest-pose turn, n/a ones with a reason', () => {
    const rest = Float64Array.from(NAMES, (n) => REST_POSE[n] ?? 0);
    const g = gateTurn('regular-steered', Intensity.Gentle, Array.from({ length: Q_FRAMES }, () => rest), null);
    assert.deepStrictEqual(Object.keys(g).toSorted(), Object.values(Gate).toSorted());
    for (const [name, r] of Object.entries(g)) {
      assert.strictEqual(r.threshold, THRESHOLD[name as Gate].value);
      assert.isTrue(r.detail.length > 0);
    }
    assert.match(g.insideKnee?.detail ?? '', /^n\/a: /);
    assert.match(g.mogulHips?.detail ?? '', /^n\/a: /);
    assert.match(g.insideLead?.detail ?? '', /^n\/a: /);
  });

  for (const drill of MIGRATED)
    for (const i of INTENSITIES)
      it(`${drill} ${i}: every gate passes on the stored bake`, () => {
        const row = gateAll().find((r) => r.drill === drill && r.intensity === i);
        if (row === undefined) throw new Error(`${drill} ${i}: no q-table`);
        const failed = (Object.entries(row.gates) as Array<[Gate, GateResult]>).filter(([g, r]) => !r.pass && !REPORT_ONLY.has(g)).map(([g, r]) => `${g} ${r.value} > ${r.threshold} ${THRESHOLD[g].unit} (${r.detail})`);
        assert.deepStrictEqual(failed, []);
      });

  it('has a source or "inferred" in every threshold reason', () => {
    for (const t of Object.values(THRESHOLD)) assert.match(t.reason, /inferred|heinrich-2022|konor-2012|nakazato-2011|motion-model|TurnReport|equipment\.ts|lit-curves/);
  });
});
