import { assert, describe, it } from '@effect/vitest';
import { INTENSITIES } from '../src/content/schema';
import { turnScenarios } from '../scripts/anatomy/drill-scenarios';
import { PHASE_T, STORK_DRILL, forcesAt, headingAt, outsideLoadAt, outsideShare, phaseForces, turnForcesAt } from '../src/physics/turn';

const DEG = Math.PI / 180;
const SCENARIOS = turnScenarios();
const moderate = SCENARIOS.moderate;

describe('Lind & Sanders eq 4.9', () => {
  it('matches the worked stork numbers: 8 m/s, R 12 m, 12 deg, the finish below the fall line', () => {
    assert.deepStrictEqual(moderate, { speedMps: 8, radiusM: 12, slopeDeg: 12 });
    const p = phaseForces(moderate);
    assert.closeTo(p.initiation.load, 1.03, 0.01);
    assert.closeTo(p.shaping.load, 1.12, 0.01);
    assert.closeTo(p.finish.load, 1.2, 0.01);
    assert.closeTo(p.initiation.tilt / DEG, 19, 0.5);
    assert.closeTo(p.shaping.tilt / DEG, 29, 0.5);
    assert.closeTo(p.finish.tilt / DEG, 35, 0.5);
  });

  it('peaks the load past the fall line at every setting', () => {
    const peaks = { gentle: 1.09, moderate: 1.2, dynamic: 1.33 } as const;
    for (const i of INTENSITIES) {
      const s = SCENARIOS[i];
      assert.closeTo(phaseForces(s).finish.load, peaks[i], 0.01, i);
      let best = { t: 0, load: 0 };
      for (let t = 0; t < 1; t += 1 / 240) {
        const { load } = turnForcesAt(s, t);
        if (load > best.load) best = { t, load };
      }
      // Least radius in COM direction change II, 62-83 % (sporri-2016-sidecut Fig 4); Ligety's pressure peak about 70 % (carv-ligety-2024); the model's 0.61 inferred.
      assert.closeTo(best.load, peaks[i], 0.01, i);
      assert.isAbove(best.t, PHASE_T.shaping, i);
      assert.isAtMost(best.t, PHASE_T.finish, i);
    }
    assert.isNull(headingAt(0.95));
  });

  it('matches the worked numbers at 45 and 135 deg and on a blue run', () => {
    assert.closeTo(forcesAt(moderate, 45 * DEG).load, 1.06, 0.01);
    assert.closeTo(forcesAt(moderate, 135 * DEG).tilt / DEG, 35, 0.5);
    const blue = { speedMps: 10, radiusM: 15, slopeDeg: 15 };
    assert.closeTo(forcesAt(blue, Math.PI).load, 1.35, 0.01);
    assert.closeTo(forcesAt(blue, Math.PI).tilt / DEG, 44, 0.5);
  });

  it('goes light above the fall line on the book steep example', () => {
    const steep = { speedMps: 6.7, radiusM: 12.2, slopeDeg: 30 };
    assert.closeTo(forcesAt(steep, 0).load, 0.87, 0.01);
    assert.closeTo(forcesAt(steep, 0).tilt / DEG, -8, 0.5);
  });

  it('reduces to the flat-ground balance', () => {
    const flat = forcesAt({ speedMps: 8, radiusM: 12, slopeDeg: 0 }, 1);
    assert.closeTo(flat.load, 1 / Math.cos(flat.tilt), 1e-12);
    assert.closeTo(Math.tan(flat.tilt), 64 / (9.81 * 12), 1e-12);
  });
});

describe('turn time', () => {
  it('maps the phases onto the heading', () => {
    assert.closeTo(headingAt(PHASE_T.initiation) ?? Number.NaN, 0, 1e-12);
    assert.closeTo(headingAt(PHASE_T.shaping) ?? Number.NaN, Math.PI / 2, 1e-12);
    assert.closeTo(headingAt(PHASE_T.finish) ?? Number.NaN, (3 * Math.PI) / 4, 1e-12);
    assert.isNull(headingAt(0));
    assert.isNull(headingAt(0.95));
  });


  it('tips from flat at the switch to its peak and eases flat again, joining the mirrored turn smoothly', () => {
    const h = 1e-6;
    for (const i of INTENSITIES) {
      const s = SCENARIOS[i];
      assert.strictEqual(turnForcesAt(s, 0).tilt, 0, i);
      assert.closeTo(turnForcesAt(s, 0).load, Math.cos(s.slopeDeg * DEG), 1e-12, i);
      const tilts = Array.from({ length: 241 }, (_, k) => turnForcesAt(s, k / 240).tilt);
      const top = tilts.indexOf(Math.max(...tilts));
      // Edge angle up from the switch and down to it with no plateau at the ends (sporri-2016-sidecut Fig 4, reid-2020 Fig 4).
      tilts.forEach((v, k) => {
        if (k > 0 && k <= top) assert.isAbove(v, tilts[k - 1] ?? v, `${i} rising ${k}/240`);
        if (k > top) assert.isBelow(v, tilts[k - 1] ?? v, `${i} easing ${k}/240`);
      });
      // C1 at the switch: the release rate equals the next turn's tipping rate.
      const out = (turnForcesAt(s, 1 - h).tilt - turnForcesAt(s, 1 - 2 * h).tilt) / h;
      const into = (turnForcesAt(s, 2 * h).tilt - turnForcesAt(s, h).tilt) / h;
      assert.closeTo(-out, into, 1e-3 * into, i);
      // No kink at the old initiation key.
      const at = (t: number): number => (turnForcesAt(s, t + h).tilt - turnForcesAt(s, t - h).tilt) / (2 * h);
      assert.closeTo(at(PHASE_T.initiation - 1e-3), at(PHASE_T.initiation + 1e-3), 0.02 * at(PHASE_T.initiation), i);
      assert.closeTo(turnForcesAt(s, 1.3).tilt, turnForcesAt(s, 0.3).tilt, 1e-12);
    }
  });

  it('loads and tilts more with intensity, phase by phase', () => {
    const [gentle, moderateP, dynamic] = INTENSITIES.map((i) => phaseForces(SCENARIOS[i]));
    if (gentle === undefined || moderateP === undefined || dynamic === undefined) throw new Error('three intensities');
    for (const phase of ['initiation', 'shaping', 'finish'] as const) {
      assert.isBelow(gentle[phase].load, moderateP[phase].load, phase);
      assert.isBelow(moderateP[phase].load, dynamic[phase].load, phase);
      assert.isBelow(gentle[phase].tilt, moderateP[phase].tilt, phase);
      assert.isBelow(moderateP[phase].tilt, dynamic[phase].tilt, phase);
    }
  });
});

describe('outside-leg share', () => {
  it('carries everything once the inside ski is lifted, a share of it otherwise', () => {
    assert.strictEqual(outsideShare(STORK_DRILL, 1), 1);
    assert.strictEqual(outsideShare(STORK_DRILL, 0), STORK_DRILL.outsideShare);
    assert.strictEqual(outsideShare({ outsideShare: 0.7, liftsInside: false }, 1), 0.7);
    assert.isAtLeast(STORK_DRILL.outsideShare, 0.6);
    assert.isAtMost(STORK_DRILL.outsideShare, 0.75);
  });

  it('puts the whole stork-turn load on the outside leg in the fall line', () => {
    const load = turnForcesAt(moderate, PHASE_T.shaping).load;
    assert.strictEqual(outsideLoadAt(moderate, STORK_DRILL, PHASE_T.shaping, 1), load);
    assert.closeTo(outsideLoadAt(moderate, { outsideShare: 0.6, liftsInside: false }, PHASE_T.shaping, 1), 0.6 * load, 1e-12);
    // Still building in the fall line, below the peak past it (carv-ligety-2024 pressure chart, sporri-2016-sidecut Fig 4).
    assert.isAbove(load, phaseForces(moderate).shaping.load - 0.01);
    assert.isBelow(load, phaseForces(moderate).finish.load);
  });
});
