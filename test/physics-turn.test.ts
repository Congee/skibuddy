import { assert, describe, it } from '@effect/vitest';
import { INTENSITIES, Intensity } from '../src/content/schema';
import { turnScenarios } from '../scripts/anatomy/drill-scenarios';
import { Snow } from '../src/physics/edge';
import { REACH } from '../src/physics/moguls';
import { lineHeading } from '../src/physics/zipper';
import { TURN_KINDS, TurnKind, eventsOf, taskFor, type TurnTask } from '../src/physics/task';
import { G, LegReturn, MASS_HEIGHT_M, MOVEMENT_RANGE_MAX_M, PHASE_T, STORK_DRILL, balanceCurvature, bridgeOf, carveSetupOf, carveTurn, carveTurns, mirrorOf, counterBandAt, mogulMassFor, mogulTrackOf, forcesAt, movementHeight, headingAt, massPathForcesAt, mogulLineFor, outsideLoadAt, outsideShare, pendulumForce, pendulumLamAcc, phaseForces, skiHeadingAt, solveProfile, stepHeight, turnForcesAt, turnProfile } from '../src/physics/turn';
import type { TurnProfile } from '../src/physics/turn';
import { failsUntil } from './legacy';

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

const contains = (b: { minDeg: number; maxDeg: number }, lo: number, hi: number): boolean => b.minDeg <= lo + 1e-9 && b.maxDeg >= hi - 1e-9;
const centreOf = (b: { minDeg: number; maxDeg: number }): number => (b.minDeg + b.maxDeg) / 2;
/** The centre's largest step over `n` even steps of the cycle. */
const centreStep = (task: TurnTask, n: number): number => {
  let m = 0;
  for (let k = 1; k < n; k++) m = Math.max(m, Math.abs(centreOf(counterBandAt(task, k / n)) - centreOf(counterBandAt(task, (k - 1) / n))));
  return m;
};

describe('skis heading and counter band from the pelvis facing the mass heading (motion-model §4.5)', () => {
  const ts = Array.from({ length: 96 }, (_, k) => k / 96);
  const GROOMED = [TurnKind.GS, TurnKind.SL, TurnKind.Steered];

  failsUntil('step: fast steered solve')("centres the groomed band on the skis' heading less the mass heading plus the counter habit, ±10°, mirrored into the next turn", () => {
    for (const kind of GROOMED) {
      for (const i of INTENSITIES) {
        const task = taskFor(kind, i);
        for (const t of ts) {
          const h = massPathForcesAt(task, t).heading;
          // A carve holds no counter (user, 2026-10-23): the pelvis faces the skis.
          const centre = (task.skidShare === 0 ? 0 : (skiHeadingAt(task, t) - h) / DEG) + task.style.counterHabitDeg;
          const b = counterBandAt(task, t);
          assert.isFalse(b.aboutFallLine, `${kind} ${i} ${t}`);
          assert.closeTo(b.minDeg, centre - 10, 1e-9, `${kind} ${i} ${t}`);
          assert.closeTo(b.maxDeg, centre + 10, 1e-9, `${kind} ${i} ${t}`);
        }
        // The next turn's outside is the other side: its band at the switch is this one's at the end, negated.
        const start = counterBandAt(task, 1e-9);
        const end = counterBandAt(task, 1 - 1e-9);
        assert.closeTo(end.minDeg, -start.maxDeg, 1e-6, `${kind} ${i}`);
        assert.closeTo(end.maxDeg, -start.minDeg, 1e-6, `${kind} ${i}`);
      }
    }
  });

  failsUntil('step: switch heading')('heads the carved skis with the mass, the centre from the switch swing through 0 at the fall line to its mirror, D13 inside the band', () => {
    for (const kind of [TurnKind.GS, TurnKind.SL]) {
      for (const i of INTENSITIES) {
        const task = taskFor(kind, i);
        const p = turnProfile(task, Snow.HardGroomed);
        const e = eventsOf(task);
        const why = `${kind} ${i}`;
        for (const t of ts) assert.strictEqual(skiHeadingAt(task, t), massPathForcesAt(task, t).heading, `${why} ${t}`);
        // The next turn's outside is the other side: the centre at the end is the start's, negated.
        assert.closeTo(centreOf(counterBandAt(task, 1 - 1e-9)), -centreOf(counterBandAt(task, 1e-9)), 1e-6, why);
        // Through 0 within the profile's one sample step before the fall-line event.
        assert.isBelow(centreOf(counterBandAt(task, e.fallLine - 1 / p.t.length)), 0, why);
        assert.isAtLeast(centreOf(counterBandAt(task, e.fallLine)), 0, why);
      }
    }
    // D13 long carved: 5–10° in shaping, falling toward about 3° at the finish.
    for (const i of INTENSITIES) {
      const task = taskFor(TurnKind.GS, i);
      const e = eventsOf(task);
      assert.isTrue(contains(counterBandAt(task, e.fallLine), 5, 10), i);
      assert.isTrue(contains(counterBandAt(task, e.release), 3, 10), i);
    }
  });

  failsUntil('step: switch heading')('pivots the steered skis past the mass heading; the centre anticipates above the fall line and counters below it', () => {
    for (const i of INTENSITIES) {
      const task = taskFor(TurnKind.Steered, i);
      const e = eventsOf(task);
      const pivot = (t: number): number => (skiHeadingAt(task, t) - massPathForcesAt(task, t).heading) / DEG;
      assert.closeTo(pivot(0), 0, 1e-9, i);
      assert.closeTo(pivot(e.engagement), 0, 1e-9, i);
      // The skis' heading is their path's travel plus the attack σ Γ, so past the mass heading by at least the attack.
      assert.isAtLeast(pivot(e.release), turnProfile(task, Snow.HardGroomed).at(e.release).attack, i);
      for (const t of ts) assert.isAtLeast(pivot(t), -1e-9, `${i} ${t}`);
      const rel = counterBandAt(task, e.release);
      const fl = counterBandAt(task, e.fallLine);
      assert.isAbove(rel.minDeg, fl.minDeg, i);
      assert.isBelow(centreOf(counterBandAt(task, e.engagement)), 0, i);
      assert.isAbove(centreOf(rel), 0, i);
      // The mirrored next turn joins: the skis' heading at the cycle's end is π less the start's.
      assert.closeTo(skiHeadingAt(task, 1 - 1e-9), Math.PI - skiHeadingAt(task, 0), 1e-3, i);
    }
    // D12 short turns: 30–40° at the finish, 20–30° unwinding.
    const dyn = taskFor(TurnKind.Steered, 'dynamic');
    const e = eventsOf(dyn);
    const rel = counterBandAt(dyn, e.release);
    assert.isTrue(contains(rel, 30, 40));
    assert.isAtLeast(centreOf(rel), 30);
    assert.isAtMost(centreOf(rel), 40);
    assert.isTrue(contains(counterBandAt(dyn, (e.release + 1) / 2), 20, 30));
  });

  it('keeps the loaded band inside the hip rotation the femur can follow: |centre| + τ ≤ 30° carved, 45° steered', () => {
    // Carved: heinrich-2022 GS, outside hip 5–28° internal, inside 10–26° external, the femur following the ski.
    // Steered: an inferred 45° on the flexed hip's external rotation; D12's 30–40° finish sits inside it.
    const ceilings = [[TurnKind.GS, 30], [TurnKind.SL, 30], [TurnKind.Steered, 45]] as const;
    for (const [kind, ceiling] of ceilings) {
      for (const i of INTENSITIES) {
        const task = taskFor(kind, i);
        for (let k = 0; k < 1440; k++) {
          const t = k / 1440;
          if (massPathForcesAt(task, t).arcShare <= 0.5) continue;
          const b = counterBandAt(task, t);
          assert.isAtMost(Math.abs(centreOf(b)) + (b.maxDeg - b.minDeg) / 2, ceiling, `${kind} ${i} ${t}`);
        }
      }
    }
  });

  it('moves the centre continuously through the cycle in every cell', () => {
    for (const kind of TURN_KINDS) {
      for (const i of INTENSITIES) {
        const task = taskFor(kind, i);
        // A jump shows at every resolution; a continuous centre moves about a hundredth as far over a hundredth of a frame (24 a cycle).
        assert.isAtMost(centreStep(task, 2400), centreStep(task, 24) / 10 + 1e-12, `${kind} ${i}`);
      }
    }
  });

  it('holds the mogul band on the pelvis against the fall line, ±20°: the share 1', () => {
    for (const i of INTENSITIES) {
      const task = taskFor(TurnKind.Moguls, i);
      for (const t of ts) assert.deepStrictEqual(counterBandAt(task, t), { minDeg: -20, maxDeg: 20, aboutFallLine: true }, `${i} ${t}`);
      // The skis point along the line plus γ; γ is off wherever the snow does not turn them (f ≤ 0).
      const { swing, ride } = mogulLineFor(task);
      const { down } = ride.track;
      const p = turnProfile(task, Snow.HardGroomed);
      const { support } = mogulMassFor(task);
      const course = { spacing: task.bumpSpacingM, relief: task.bumpHeightM, swing };
      const n = down.length;
      assert.strictEqual(p.attack.length, n, i);
      for (let k = 0; k < n; k++) {
        const f = (support[k] ?? 0) * Math.tan(p.lean[k] ?? 0);
        if (f <= 0) assert.strictEqual(p.attack[k], 0, `${i} ${k}`);
        assert.closeTo(skiHeadingAt(task, k / n), Math.PI / 2 + lineHeading(course, down[k] ?? 0) + (p.attack[k] ?? 0) * DEG, 1e-9, `${i} ${k}`);
      }
    }
  });
});

const profileOf = (task: TurnTask): TurnProfile => turnProfile(task, Snow.HardGroomed);
const meanOf = (xs: ArrayLike<number>): number => Array.from(xs).reduce((a, b) => a + b, 0) / xs.length;

describe('the moguls turn rides the absorption and the pendulum (P4)', () => {
  for (const i of INTENSITIES) {
    const task = taskFor(TurnKind.Moguls, i);
    it(`moguls ${i} loads the leg with the resultant, load = s / (g cos λ) sample for sample`, () => {
      const { lean, support } = mogulMassFor(task);
      profileOf(task).load.forEach((l, j) => assert.closeTo(l, (support[j] ?? 0) / (G * Math.cos(lean[j] ?? 0)), 1e-12, `${j}`));
    });
    it(`moguls ${i} leans the resultant about the pressure centre, tan λ = (x_mass − x_P) / h, = ẍ / s where s > 0`, () => {
      const { across, acrossAccel, clearance, pivot: x, support } = mogulMassFor(task);
      profileOf(task).lean.forEach((l, j) => {
        assert.closeTo(Math.tan(l), ((across[j] ?? 0) - (x[j] ?? 0)) / (clearance[j] ?? 1), 1e-12, `${j}`);
        if ((support[j] ?? 0) > 1) assert.closeTo(Math.tan(l), (acrossAccel[j] ?? 0) / (support[j] ?? 1), 1e-6, `${j}`);
      });
    });
    it(`moguls ${i} edges at the lean: a skidding ski sits at the slip threshold, margin 0`, () => {
      const p = profileOf(task);
      p.edge.forEach((e, j) => assert.strictEqual(e, p.lean[j], `${j}`));
    });
    failsUntil('step: moguls rebuild', i === Intensity.Moderate)(`moguls ${i} closes its speed with γ: the closure's work ½(v(1)² − v(0)²) is 0 at the solved amplitude`, () => {
      const p = profileOf(task);
      assert.isTrue(p.closure.root && p.closure.converged, `γ peak ${p.gammaE}°`);
      const v0 = p.speed[0] ?? 0;
      assert.isBelow(Math.abs((p.closure.residual * (2 * v0 + p.closure.residual)) / 2), 1e-9);
    });
    it(`moguls ${i} brakes on the boot track's slope, not the snow's: the bump term s / g · sin φ_boot`, () => {
      const p = profileOf(task);
      const { boot, support } = mogulMassFor(task);
      const { pace, height } = mogulTrackOf(task);
      const n = boot.length;
      const slope = (z: ArrayLike<number>, j: number): number => {
        const tan = (((z[(j + 1) % n] ?? 0) - (z[(j + n - 1) % n] ?? 0)) * n) / 2 / (pace[j] ?? 1);
        return tan / Math.hypot(1, tan);
      };
      const meanBy = (z: ArrayLike<number>): number => {
        let [s, along] = [0, 0];
        for (let j = 0; j < n; j++) {
          s += ((support[j] ?? 0) / G) * slope(z, j) * (p.speed[j] ?? 0);
          along += p.speed[j] ?? 0;
        }
        return s / along;
      };
      assert.closeTo(p.energy.bump, meanBy(boot), 1e-12);
      assert.isAbove(Math.abs(meanBy(boot) - meanBy(height)), 1e-6);
    });
    it(`moguls ${i} reads no mass radius: one set changes nothing`, () => {
      const p = solveProfile(task, Snow.HardGroomed);
      const q = solveProfile({ ...task, massRadiusM: 4 * task.radiusM }, Snow.HardGroomed);
      for (const key of ['heading', 'lean', 'load', 'edge', 'massShare'] as const) assert.deepStrictEqual(q[key], p[key], key);
      assert.strictEqual(q.skisHalfSweep, p.skisHalfSweep);
    });
  }
});

describe('speed along the cycle (motion-model §9 V)', () => {
  const GROOMED = TURN_KINDS.filter((k) => k !== TurnKind.Moguls);
  // Cells whose speed no early skid up to 60° holds: W(60°) > 0 at the preset sweep (rule 7).
  const NO_ROOT = new Set(['gs gentle', 'sl gentle', 'steered gentle', 'steered moderate', 'steered dynamic']);
  // Steered closes its seam in every cell and its speed from moderate up; steered gentle still has no root.
  const NO_CLOSURE = new Set(['gs gentle', 'sl gentle', 'steered gentle']);
  const SEAM_BROKEN = new Map([['gs moderate', 'step: carved seams'], ['gs dynamic', 'step: carved seams'], ['sl moderate', 'step: carved seams'], ['sl dynamic', 'step: carved seams'], ['moguls moderate', 'step: moguls rebuild']]);
  const CLOSURE_BROKEN = new Set(['gs moderate', 'gs dynamic', 'sl moderate', 'sl dynamic']);

  for (const kind of TURN_KINDS) {
    for (const i of INTENSITIES) {
      const task = taskFor(kind, i);
      const cell = `${kind} ${i}`;
      it(`${cell} holds the task's speed as its time mean, never under 0.5 m/s`, () => {
        const p = profileOf(task);
        assert.closeTo(meanOf(p.speed), task.speedMps, 1e-6);
        assert.isAtLeast(Math.min(...p.speed), 0.5);
      });
      // Moguls switch on the pendulum's lean, its own test below.
      if (kind !== TurnKind.Moguls) it(`${cell} rests on flat skis at the switch: λ 0, the mass path bent by gravity alone, w(0) > 0`, () => {
        const p = profileOf(task);
        assert.closeTo(p.at(0).lean, 0, 1e-9);
        // A pure carve's edge is λ, flat at the switch; the skidded margin m need not be 0 there.
        if (task.skidShare === 0) assert.closeTo(p.at(0).edge, 0, 1e-9);
        const v0 = p.speed[0] ?? 0;
        // r_mass = r_ski / w: the mass path's curvature is w over the skis' arc radius (the carved radius on carved cells).
        const kappa = (p.massShare[0] ?? 0) / (p.skiRadius[0] ?? 0);
        assert.closeTo(kappa, (G * Math.sin(task.slopeDeg * DEG) * Math.cos(p.heading[0] ?? 0)) / v0 ** 2, 1e-9);
        assert.isAbove(p.massShare[0] ?? 0, 0);
      });
      failsUntil(SEAM_BROKEN.get(cell) ?? 'V: presets that close', SEAM_BROKEN.has(cell) || (NO_ROOT.has(cell) && kind !== TurnKind.Steered))(`${cell} joins the next turn C1: seam second differences of ε, λ, w, load, speed and attack within twice the interior's`, () => {
        const p = profileOf(task);
        const n = 96;
        for (const [key, sign] of [['edge', -1], ['lean', -1], ['massShare', -1], ['load', 1], ['speed', 1], ['attack', 1]] as const) {
          const y = (j: number): number => (j < n ? p.at(j / n)[key] : sign * p.at(j / n - 1)[key]);
          const d2 = (j: number): number => Math.abs(y(j + 1) - 2 * y(j) + y(j - 1));
          let interior = 0;
          for (let j = 2; j < n - 1; j++) interior = Math.max(interior, d2(j));
          assert.isAtMost(Math.max(d2(n - 1), d2(n), d2(n + 1)), 2 * interior + 1e-12, key);
        }
      });
    }
  }

  for (const kind of GROOMED) {
    for (const i of INTENSITIES) {
      const task = taskFor(kind, i);
      const cell = `${kind} ${i}`;
      failsUntil(CLOSURE_BROKEN.has(cell) ? 'step: carved seams' : 'V: presets that close', NO_CLOSURE.has(cell) || CLOSURE_BROKEN.has(cell))(`${cell} closes its speed: v(1) = v(0) and the five energy means sum to 0`, () => {
        const p = profileOf(task);
        assert.isTrue(p.closure.root && p.closure.converged);
        assert.isBelow(Math.abs(p.closure.residual), 1e-6);
        const e = p.energy;
        assert.closeTo(e.gain - e.friction - e.skid - e.bump - e.drag, 0, 1e-6);
      });
      // The early skid brakes before the fall line, so v tops out in the early arc and bottoms near the fall line.
      failsUntil('V: dissipation after the fall line', kind !== TurnKind.Steered && i !== Intensity.Gentle && cell !== 'gs moderate')(`${cell} runs fastest between the fall line and the release, slowest from the release to the engagement`, () => {
        const p = profileOf(task);
        const v = Array.from(p.speed);
        const n = v.length;
        const top = v.indexOf(Math.max(...v)) / n;
        const low = v.indexOf(Math.min(...v)) / n;
        const { fallLine, release, engagement } = p.events;
        assert.isTrue(top >= fallLine && top <= release, `top ${top}`);
        assert.isTrue(low >= release || low <= engagement, `low ${low}`);
      });
      failsUntil('V: dissipation after the fall line', !['steered gentle', 'gs gentle', 'sl gentle'].includes(cell))(`${cell} peaks its load earlier than at constant speed`, () => {
        const steady = solveProfile(task, Snow.HardGroomed, { constantSpeed: true });
        assert.isBelow(profileOf(task).events.forcePeak, steady.events.forcePeak);
      });
      // A pure carve (σ 0) has no skid at any slope: its edge is the sidecut's, so γ_e stays 0.
      if (task.skidShare === 0) it(`${cell} stays unskidded 3° steeper`, () => {
        const steeper = solveProfile({ ...task, slopeDeg: task.slopeDeg + 3 }, Snow.HardGroomed);
        assert.strictEqual(profileOf(task).gammaE, 0);
        assert.strictEqual(steeper.gammaE, 0);
      });
      else failsUntil('V: presets that close', NO_ROOT.has(cell))(`${cell} skids harder 3° steeper`, () => {
        const steeper = solveProfile({ ...task, slopeDeg: task.slopeDeg + 3 }, Snow.HardGroomed);
        assert.isAbove(steeper.gammaE, profileOf(task).gammaE);
      });
    }
  }

  it('spends one bump spacing per turn on moguls', () => {
    for (const i of INTENSITIES) {
      const task = taskFor(TurnKind.Moguls, i);
      const p = profileOf(task);
      assert.closeTo(p.periodS * meanOf(p.speed), task.bumpSpacingM, 1e-6, i);
    }
  });

  it('times the moguls from the snow: the zipper tops each mogul at the switch (fis-freestyle-judging-2025 pp26, 28)', () => {
    for (const i of INTENSITIES) {
      const task = taskFor(TurnKind.Moguls, i);
      const track = mogulTrackOf(task);
      assert.isBelow(Math.min(track.crest, 1 - track.crest), 0.1, i);
      assert.strictEqual(profileOf(task).events.engagement, track.crest, i);
    }
  });

  for (const i of INTENSITIES) {
    it(`moguls ${i} meets the next face at the hit, where the tip passes the trough's bottom`, () => {
      const task = taskFor(TurnKind.Moguls, i);
      const { trough, hit } = mogulTrackOf(task);
      const { along, length, tip } = bridgeOf(task);
      const n = along.length;
      const alongAt = (t: number): number => {
        const j = Math.floor(t * n);
        return (along[j] ?? 0) + ((j + 1 < n ? (along[j + 1] ?? 0) : length) - (along[j] ?? 0)) * (t * n - j);
      };
      const gap = (alongAt(hit) + tip - (along[Math.round(trough * n) % n] ?? 0)) / length;
      assert.closeTo(gap - Math.round(gap), 0, 1e-12, i);
    });
  }

  failsUntil("P: the hit's placement")("hands P a bump face that brakes nothing net: the bump term's mean within 1e-3 g of 0", () => {
    for (const i of INTENSITIES) assert.closeTo(profileOf(taskFor(TurnKind.Moguls, i)).energy.bump, 0, 1e-3, i);
  });
});

describe('the carve pendulum on the pressure centre', () => {
  it('reduces to the steady balance at λ̈ = ḣ = p̈ = 0, the leg force g cos θ / cos λ, and leans out as the feet pull in', () => {
    for (const slopeDeg of [0, 12, 25]) {
      for (const psiDeg of [10, 90, 170]) {
        for (const lamDeg of [-20, 5, 40]) {
          const [cosT, sinT] = [Math.cos(slopeDeg * DEG), Math.sin(slopeDeg * DEG)];
          const [psi, lam, v] = [psiDeg * DEG, lamDeg * DEG, 11];
          const q = { h: 0.9, hd: 0, hdd: 0, lam, lamDot: 0 };
          const a = v * v * balanceCurvature(cosT, sinT, psi, v, lam);
          const why = `${slopeDeg} ${psiDeg} ${lamDeg}`;
          assert.closeTo(pendulumLamAcc(q, cosT, sinT, psi, a), 0, 1e-9, why);
          assert.closeTo(pendulumForce(q, cosT, sinT, psi, a), (G * cosT) / Math.cos(lam), 1e-9, why);
          assert.isBelow(pendulumLamAcc(q, cosT, sinT, psi, a + 1), 0, why);
        }
      }
    }
  });

  it("carries λ, λ̇, p and the share across the switch within one step's change", () => {
    const task = taskFor(TurnKind.GS, 'moderate');
    const inp = carveSetupOf(task, Snow.HardGroomed, {}).inputs;
    // Inferred: a λ̇0 and λ_peak inside GS moderate's completing window (lane r2a20 scan).
    const [w, peak] = [50 * DEG, 31.8 * DEG];
    const one = carveTurn(inp, { v: (task.entrySpeedMps ?? task.speedMps), psi: Math.atan((inp.height(0).h * w) / (task.entrySpeedMps ?? task.speedMps)), w, y: 0 }, peak);
    assert.isNotNull(one.end);
    if (one.end === null) return;
    const two = carveTurn(inp, mirrorOf(one.end), peak);
    // Turn 1 mirrored into turn 2's side.
    const of = (s: (typeof one.samples)[number], key: 'lam' | 'lamDot' | 'p' | 'share', mirror: boolean): number =>
      key === 'share' ? (mirror ? 1 - s.share : s.share) : mirror ? -s[key] : s[key];
    const seq = [...one.samples.map((s) => [s, true] as const), ...two.samples.map((s) => [s, false] as const)];
    const seamAt = one.samples.length;
    for (const key of ['lam', 'lamDot', 'p', 'share'] as const) {
      const vals = seq.map(([s, m]) => of(s, key, m));
      const steps = vals.slice(1).map((x, k) => Math.abs(x - (vals[k] ?? Number.NaN)));
      const across = Math.max(...steps.slice(seamAt - 2, seamAt + 1));
      const elsewhere = Math.max(...steps.filter((_, k) => k < seamAt - 2 || k > seamAt));
      assert.isAtMost(across, elsewhere, key);
    }
  });

  failsUntil('step: carved seams')("starts turn 1 at the periodic λ̇0: its mirrored end λ̇ equals its start to the root find's resolution", () => {
    for (const kind of [TurnKind.GS, TurnKind.SL])
      for (const intensity of INTENSITIES) {
        const { periodic } = carveTurns(taskFor(kind, intensity), Snow.HardGroomed);
        assert.isTrue(periodic.converged, `${kind} ${intensity}`);
        assert.isAtMost(Math.abs(periodic.residualDegS), periodic.resolutionDegS, `${kind} ${intensity}`);
      }
  });

  it("moves h as one harmonic per turn, lowest at the transition phase, inside REACH", () => {
    const T = 2.5;
    for (const phase of [0, 0.5]) {
      const m = { meanM: MASS_HEIGHT_M, rangeM: MOVEMENT_RANGE_MAX_M, phase };
      const at = movementHeight(m, T);
      const dt = 1e-5;
      for (let k = 0; k <= 20; k++) {
        const t = (k / 20) * T;
        const [a, b, c] = [at(t - dt), at(t), at(t + dt)];
        assert.closeTo(b.hd, (c.h - a.h) / (2 * dt), 1e-6, `ḣ ${phase} ${t}`);
        assert.closeTo(b.hdd, (c.hd - a.hd) / (2 * dt), 1e-5, `ḧ ${phase} ${t}`);
        assert.isAtLeast(b.h, REACH[0] - 1e-12);
        assert.isAtMost(b.h, REACH[1] + 1e-12);
      }
      assert.closeTo(at(phase * T).h, REACH[0], 1e-12, `lowest at ${phase}`);
      assert.closeTo(at(T).h, at(0).h, 1e-12, 'periodic');
    }
  });

  it("rides R2a20's carved turn at movement range 0", () => {
    const task = taskFor(TurnKind.GS, 'moderate');
    const inp = carveSetupOf(task, Snow.HardGroomed, { movementRangeM: 0 }).inputs;
    const constant = { ...inp, height: () => ({ h: MASS_HEIGHT_M, hd: 0, hdd: 0 }) };
    // Inferred: a λ̇0 and λ_peak inside GS moderate's completing window (lane r2a20 scan).
    const [w, peak] = [50 * DEG, 31.8 * DEG];
    const start = { v: (task.entrySpeedMps ?? task.speedMps), psi: Math.atan((MASS_HEIGHT_M * w) / (task.entrySpeedMps ?? task.speedMps)), w, y: 0 };
    assert.deepEqual(carveTurn(inp, start, peak).samples, carveTurn(constant, start, peak).samples);
  });

  it('switches straight across without a switch heading, as at 90° from the fall line', () => {
    const task = taskFor(TurnKind.GS, 'moderate');
    const [absent, across] = [carveSetupOf(task, Snow.HardGroomed, {}).inputs, carveSetupOf(task, Snow.HardGroomed, { switchHeadingDeg: 90 }).inputs];
    assert.notProperty(absent, 'switchHeading');
    // Inferred: a λ̇0 and λ_peak inside GS moderate's completing window (lane r2a20 scan).
    const [w, peak] = [50 * DEG, 31.8 * DEG];
    const start = { v: (task.entrySpeedMps ?? task.speedMps), psi: Math.atan((absent.height(0).h * w) / (task.entrySpeedMps ?? task.speedMps)), w, y: 0 };
    assert.deepEqual(carveTurn(absent, start, peak), carveTurn(across, start, peak));
    for (const kind of [TurnKind.GS, TurnKind.SL]) {
      const t = taskFor(kind, 'moderate');
      assert.deepEqual(carveTurns(t, Snow.HardGroomed), carveTurns(t, Snow.HardGroomed, { switchHeadingDeg: 90 }), kind);
    }
  });

  it('rides the movement harmonic without a stepped leg', () => {
    const task = taskFor(TurnKind.GS, 'moderate');
    const absent = carveSetupOf(task, Snow.HardGroomed, {}).inputs;
    const harmonic = { ...absent, height: movementHeight(absent.movement, absent.periodS) };
    assert.notProperty(absent, 'step');
    assert.notProperty(absent, 'triggerS');
    // Inferred: a λ̇0 and λ_peak inside GS moderate's completing window (lane r2a20 scan).
    const [w, peak] = [50 * DEG, 31.8 * DEG];
    const start = { v: (task.entrySpeedMps ?? task.speedMps), psi: Math.atan((absent.height(0).h * w) / (task.entrySpeedMps ?? task.speedMps)), w, y: 0 };
    assert.deepEqual(carveTurn(absent, start, peak), carveTurn(harmonic, start, peak));
  });

  it('steps the leg from REACH[0] at λ 0 to REACH[1] over the rise and back by the trigger or λ 0', () => {
    const [T, trig, tau] = [1.3, 1.1, 0.25];
    for (const [returnTo, end] of [[LegReturn.Trigger, trig], [LegReturn.Switch, T]] as const) {
      const h = stepHeight({ riseS: tau, returnTo }, T, trig);
      assert.closeTo(h(0).h, REACH[0], 1e-12);
      assert.closeTo(h(0).hd, 0, 1e-12);
      assert.closeTo(h(tau).h, REACH[1], 1e-12);
      assert.closeTo(h(tau).hd, 0, 1e-12);
      assert.closeTo(h(end).h, REACH[0], 1e-12);
      assert.strictEqual(h(end + 0.01).hd, 0);
    }
  });
});
