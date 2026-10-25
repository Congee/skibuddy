import { assert, describe, it } from '@effect/vitest';
import { INTENSITIES, Intensity } from '../src/content/schema';
import { ANGULATION_MAX_DEG, Snow, edgeGoalAt, marginBandDeg } from '../src/physics/edge';
import { KIND_LABEL, MOGUL_RELIEF_M, TURN_KINDS, TurnKind, closingSweepDeg, eventsOf, feasibilityOf, presetOf, ridableReliefOf, taskFor } from '../src/physics/task';
import type { TurnTask } from '../src/physics/task';
import { skiForKind } from './ski-for-kind';
import { failsUntil, legacyIt } from './legacy';
import { counterBandAt, forcesAt, massPathForcesAt, skiHeadingAt, turnProfile } from '../src/physics/turn';
import LIT from '../scripts/prior/lit-curves.json';
import { ANKLE_ALONG, foreAftAt } from '../src/viewer/motion/turn';

const DEG = Math.PI / 180;
const HEADINGS = [0, Math.PI / 2, (3 * Math.PI) / 4];
const rule9 = (t: TurnTask): boolean => feasibilityOf(t).find((c) => c.rule === 9)?.ok ?? false;

/** motion-model §3 table: v (the carved kinds' race-cell mean speeds), skis' radius (or ε_max for carved kinds), slope, period. */
const RANGES: Record<TurnKind, Record<Intensity, { v: readonly [number, number]; r?: readonly [number, number]; e?: number; th: readonly [number, number]; T?: readonly [number, number] }>> = {
  [TurnKind.GS]: { gentle: { v: [9, 9], e: 20, th: [18, 18] }, moderate: { v: [11, 11], e: 27, th: [18, 18] }, dynamic: { v: [13, 13], e: 35, th: [18, 18] } },
  [TurnKind.SL]: { gentle: { v: [8, 8], e: 45, th: [19, 19] }, moderate: { v: [9.5, 9.5], e: 52, th: [19, 19] }, dynamic: { v: [11, 11], e: 58, th: [19, 19] } },
  [TurnKind.Steered]: { gentle: { v: [5, 7], r: [12, 20], th: [10, 15] }, moderate: { v: [6, 8], r: [8, 12], th: [15, 20], T: [1.5, 2] }, dynamic: { v: [6, 8], r: [6, 8], th: [22, 30], T: [1, 1.3] } },
  [TurnKind.Moguls]: { gentle: { v: [4, 6], r: [5, 5], th: [15, 20] }, moderate: { v: [6, 8], r: [5, 5], th: [20, 25] }, dynamic: { v: [9, 10], r: [5, 5], th: [25, 28] } },
};

const inside = (x: number, [a, b]: readonly [number, number]): boolean => x >= a - 1e-9 && x <= b + 1e-9;
// The mirrored ends meet at their inverse-variance mean; the shift ramps linearly from one end to the other.
const closure = (m: ReadonlyArray<number>, half: readonly [number, number], t: number): number => {
  const [m0 = 0, m1 = 0] = [m[0], m[m.length - 1]];
  const [w0, w1] = [1 / half[0] ** 2, 1 / half[1] ** 2];
  const seam = (m0 * w0 + m1 * w1) / (w0 + w1);
  return (seam - m0) * (1 - t) + (seam - m1) * t;
};
interface Rated { readonly label: string; readonly task: TurnTask; readonly rate: number }
/** The skis' yaw rate, deg/s: their heading swing over the cycle per period. */
const yawRateOf = (task: TurnTask): number => {
  const hs = Array.from({ length: 720 }, (_, k) => skiHeadingAt(task, k / 720));
  return (Math.max(...hs) - Math.min(...hs)) / DEG / turnProfile(task, task.snow ?? Snow.HardGroomed).periodS;
};
/** The counter's centre swing (motion-model §4.5): the skis' heading less the mass heading, degrees, peak over the cycle. */
const counterSwingOf = (task: TurnTask): number => Math.max(...Array.from({ length: 480 }, (_, k) => Math.abs(skiHeadingAt(task, k / 480) - massPathForcesAt(task, k / 480).heading))) / DEG;

describe('task table', () => {
  failsUntil('step: smooth load')('passes every feasibility rule in every cell', () => {
    for (const kind of TURN_KINDS) {
      for (const i of INTENSITIES) {
        const task = taskFor(kind, i);
        assert.strictEqual(presetOf(kind, i).kind, kind);
        assert.strictEqual(presetOf(kind, i).intensity, i);
        for (const c of feasibilityOf(task)) assert.isTrue(c.ok, `${kind} ${i} rule ${c.rule}: ${c.detail}`);
        const rules = feasibilityOf(task).map((c) => c.rule);
        for (const r of [1, 2, 4, 8]) assert.include(rules, r, `${kind} ${i}`);
        // Rules 5 (bump period) and 7 (bump closure) have no groomed meaning.
        for (const r of [5, 7]) assert.strictEqual(rules.includes(r), kind === TurnKind.Moguls, `${kind} ${i} rule ${r}`);
        if (i === Intensity.Dynamic) assert.include(rules, 6, kind);
      }
    }
  });

  it('sits inside the motion-model ranges', () => {
    for (const kind of TURN_KINDS) {
      for (const i of INTENSITIES) {
        const task = taskFor(kind, i);
        const r = RANGES[kind][i];
        assert.isTrue(inside(task.slopeDeg, r.th), `${kind} ${i} slope`);
        if (r.T !== undefined) assert.isTrue(inside(turnProfile(task, Snow.HardGroomed).periodS, r.T), `${kind} ${i} period`);
        assert.isTrue(inside(task.speedMps, r.v), `${kind} ${i} speed`);
        if (r.r !== undefined) assert.isTrue(inside(task.radiusM, r.r), `${kind} ${i} radius`);
        assert.isAbove(presetOf(kind, i).why.length, 0);
      }
    }
    // Moguls: no mass radius, the pendulum lays the mass path.
    for (const i of INTENSITIES) assert.isUndefined(taskFor(TurnKind.Moguls, i).massRadiusM);
  });

  it('labels the kinds in mixed case and in order', () => {
    assert.deepStrictEqual(TURN_KINDS, [TurnKind.GS, TurnKind.SL, TurnKind.Steered, TurnKind.Moguls]);
    assert.deepStrictEqual(TURN_KINDS.map((k) => KIND_LABEL[k]), ['GS', 'SL', 'Steered', 'Moguls']);
  });

  failsUntil('step: steered rebuild')('carries every preset number on the task', () => {
    for (const kind of TURN_KINDS) {
      for (const i of INTENSITIES) {
        const t = taskFor(kind, i);
        assert.strictEqual(t.ski, skiForKind(kind), `${kind} ${i}`);
        assert.deepStrictEqual(t.legacy.counterToleranceDeg, kind === TurnKind.Moguls ? [-20, 20] : [-10, 10], `${kind} ${i}`);
        const carved = kind === TurnKind.GS || kind === TurnKind.SL;
        assert.strictEqual(t.skidShare === 0, carved, `${kind} ${i}`);
        // The attack is σ Γ (§4.2) where the skis skid; a baked carve's is the whole-turn solve's slip angle γ.
        const attack = Math.max(...Array.from({ length: 240 }, (_, k) => Math.abs(turnProfile(t, Snow.HardGroomed).at(k / 240).attack)));
        assert.isAbove(attack, 0, `${kind} ${i}`);
        assert.strictEqual(t.style.counterHabitDeg, 0, `${kind} ${i}`);
        assert.strictEqual(t.bumpHeightM > 0, kind === TurnKind.Moguls, `${kind} ${i}`);
        assert.strictEqual(t.bumpSpacingM > 0, kind === TurnKind.Moguls, `${kind} ${i}`);
        assert.deepStrictEqual(t.legacy.marginBandDeg, kind === TurnKind.Steered ? [-5, 10] : [0, ANGULATION_MAX_DEG], `${kind} ${i}`);
      }
    }
    // Steered: skid 0.3 / 0.5 / 0.7 (inferred), the attack σ Γ growing with it; the dynamic release centre on D12's 30–40° finish.
    const st = INTENSITIES.map((i) => taskFor(TurnKind.Steered, i));
    assert.deepStrictEqual(st.map((t) => t.skidShare), [0.3, 0.5, 0.7]);
    const releaseAttack = st.map((t) => turnProfile(t, Snow.HardGroomed).at(eventsOf(t).release).attack);
    releaseAttack.forEach((a, k) => k > 0 && assert.isAbove(a, releaseAttack[k - 1] ?? Infinity));
    const dyn = taskFor(TurnKind.Steered, Intensity.Dynamic);
    const rel = counterBandAt(dyn, eventsOf(dyn).release);
    // D12: 30–40° at the finish of short turns; the counter is an output now (§4.5), not a fitted centre.
    assert.isAtLeast((rel.minDeg + rel.maxDeg) / 2, 30);
    assert.isAtMost((rel.minDeg + rel.maxDeg) / 2, 40);
  });

  legacyIt('puts the dynamic steered release centre at 35 ±0.05 (fitted point)', () => {
    const dyn = taskFor(TurnKind.Steered, Intensity.Dynamic);
    const rel = counterBandAt(dyn, eventsOf(dyn).release);
    assert.closeTo((rel.minDeg + rel.maxDeg) / 2, 35, 0.05);
  });

  it("widens the counter with the skis' yaw rate within each groomed kind, the pelvis facing the mass heading (motion-model §4.5)", () => {
    // Counter = skis' heading less mass heading: the mass runs straighter than quicker skis, so the swing grows with their yaw rate.
    // Moguls apart: their skis follow the line, and the counter band is held about the fall line.
    // Carved kinds hold no counter (user, 2026-10-23): the band centred on the skis all cycle.
    for (const kind of [TurnKind.GS, TurnKind.SL])
      for (const i of INTENSITIES)
        for (let k = 0; k < 96; k++) {
          const b = counterBandAt(taskFor(kind, i), k / 96);
          assert.closeTo(b.minDeg + b.maxDeg, 0, 1e-9, `${kind} ${i} ${k}`);
        }
    for (const kind of [TurnKind.Steered]) {
      const cells = INTENSITIES.map((i): Rated => ({ label: `${kind} ${i}`, task: taskFor(kind, i), rate: yawRateOf(taskFor(kind, i)) }));
      const byRate = cells.toSorted((a, b) => a.rate - b.rate);
      byRate.forEach((c, k) => k > 0 && assert.isAtLeast(counterSwingOf(c.task), counterSwingOf(byRate[k - 1]?.task ?? c.task), c.label));
    }
  });

  failsUntil('step: steered rebuild')('swings the carved kinds less than the steered kind (cross-family)', () => {
    const swings = (kind: TurnKind): number[] => INTENSITIES.map((i) => counterSwingOf(taskFor(kind, i)));
    const carved = [...swings(TurnKind.GS), ...swings(TurnKind.SL)];
    assert.isAtMost(Math.max(...carved), Math.min(...swings(TurnKind.Steered)));
  });

  it('rises in speed, slope and load with intensity in every kind', () => {
    for (const kind of TURN_KINDS) {
      const peaks = INTENSITIES.map((i) => Math.max(...Array.from({ length: 240 }, (_, k) => massPathForcesAt(taskFor(kind, i), k / 240).load)));
      INTENSITIES.forEach((i, k) => {
        if (k === 0) return;
        const prev = INTENSITIES[k - 1] ?? i;
        assert.isAtLeast(taskFor(kind, i).slopeDeg, taskFor(kind, prev).slopeDeg, `${kind} ${i}`);
        assert.isAtLeast(taskFor(kind, i).speedMps, taskFor(kind, prev).speedMps, `${kind} ${i}`);
        assert.isAbove(peaks[k] ?? 0, (peaks[k - 1] ?? 0) - 0.03, `${kind} ${i} load`);
      });
    }
  });
});

describe('lean and load, lind-sanders-2004 eq 4.9', () => {
  it('matches the worked points of motion-model §3 on the skis arc', () => {
    const cases = [
      { s: { speedMps: 9, radiusM: 13, slopeDeg: 17 }, lean: [19.7, 33.6, 41.4], load: [1.02, 1.15, 1.27] },
      { s: { speedMps: 7, radiusM: 6.5, slopeDeg: 17 }, lean: [26.5, 38.8, 45.6], load: [1.07, 1.23, 1.37] },
      // Moguls: the mass on its own 20 m path, the gravity term at the skis' heading.
      { s: { speedMps: 7, radiusM: 20, slopeDeg: 23 }, lean: [-8.7, 15.2, 29.7], load: [0.93, 0.95, 1.06] },
    ];
    for (const c of cases) {
      HEADINGS.forEach((b, j) => {
        assert.closeTo(forcesAt(c.s, b).tilt / DEG, c.lean[j] ?? 0, 0.1, `${c.s.radiusM} lean ${j}`);
        assert.closeTo(forcesAt(c.s, b).load, c.load[j] ?? 0, 0.01, `${c.s.radiusM} load ${j}`);
      });
    }
    // The skis' own 5 m arc leans 47°, not the 28° the spec's moguls note quotes.
    assert.closeTo(forcesAt({ speedMps: 7, radiusM: 5, slopeDeg: 23 }, Math.PI / 2).tilt / DEG, 47.3, 0.1);
  });

  it('heads down the fall line at the fall-line event and joins the mirrored turn', () => {
    for (const kind of TURN_KINDS) {
      for (const i of INTENSITIES) {
        const task = taskFor(kind, i);
        const e = eventsOf(task);
        assert.closeTo(massPathForcesAt(task, e.fallLine).heading, Math.PI / 2, 0.01, `${kind} ${i}`);
        assert.closeTo(massPathForcesAt(task, 0).arcShare, 0, 5e-10);
        assert.closeTo(massPathForcesAt(task, 1 - 1e-9).lean, -massPathForcesAt(task, 0).lean, 0.01, `${kind} ${i}`);
        assert.closeTo(massPathForcesAt(task, 1 - 1e-9).load, massPathForcesAt(task, 0).load, 0.01, `${kind} ${i}`);
      }
    }
  });

  it('peaks the load after the fall line in every cell', () => {
    for (const kind of TURN_KINDS) {
      for (const i of INTENSITIES) {
        const task = taskFor(kind, i);
        const e = eventsOf(task);
        let best = { t: 0, load: 0 };
        for (let k = 0; k < 480; k++) {
          const { load } = massPathForcesAt(task, k / 480);
          if (load > best.load) best = { t: k / 480, load };
        }
        assert.isAbove(best.t, e.fallLine, `${kind} ${i}`);
        assert.closeTo(best.t, e.forcePeak, 2 / 480, `${kind} ${i}`);
      }
    }
  });

  failsUntil('step: smooth load')('peaks the GS load in steering after the gate, 54–86 % of the turn (falda-buscaiot-2017)', () => {
    for (const i of INTENSITIES) {
      const e = eventsOf(taskFor(TurnKind.GS, i));
      assert.isAtLeast(e.forcePeak, 0.54, i);
      assert.isAtMost(e.forcePeak, 0.86, i);
    }
  });
});

describe('phase events', () => {
  failsUntil('step: smooth load')('orders switch, engagement, fall line, force peak and release within one turn', () => {
    for (const kind of TURN_KINDS) {
      for (const i of INTENSITIES) {
        const e = eventsOf(taskFor(kind, i));
        const order = [e.switch, e.engagement, e.fallLine, e.forcePeak, e.release];
        order.forEach((x, k) => {
          assert.isAtLeast(x, 0, `${kind} ${i} ${k}`);
          assert.isBelow(x, 1, `${kind} ${i} ${k}`);
          if (k > 0) assert.isAbove(x, order[k - 1] ?? 1, `${kind} ${i} ${k}`);
        });
      }
    }
  });

  it('sets the mogul period by the bump spacing, the FIS pace about 0.35–0.4 s per bump', () => {
    const t = taskFor(TurnKind.Moguls, Intensity.Dynamic);
    const p = (t.bumpSpacingM ?? 0) / t.speedMps;
    assert.isAtLeast(p, 0.35);
    assert.isAtMost(p, 0.4);
    assert.isAtMost(t.speedMps, 10.3);
  });

  failsUntil('step: moguls rebuild')("rides the field the legs can absorb (rule 9): P1's metre at 3.6 m fails, the derived relief passes and 1 cm more fails", () => {
    const dyn = taskFor(TurnKind.Moguls, Intensity.Dynamic);
    assert.isFalse(rule9({ ...dyn, bumpSpacingM: 3.6, bumpHeightM: 1 }));
    for (const i of INTENSITIES) assert.isTrue(rule9(taskFor(TurnKind.Moguls, i)), i);
    assert.strictEqual(dyn.bumpHeightM, MOGUL_RELIEF_M);
    assert.isFalse(rule9({ ...dyn, bumpHeightM: MOGUL_RELIEF_M + 0.01 }));
  });
  failsUntil('step: moguls rebuild')('derives the relief as the largest the FIS pace rides, the skis bridging the troughs (rule 9)', () => {
    assert.strictEqual(ridableReliefOf(taskFor(TurnKind.Moguls, Intensity.Dynamic)), MOGUL_RELIEF_M);
  });
});

describe('kinds are presets', () => {
  const ts = [0, 0.1, 0.3, 0.52, 0.7, 0.9, 0.97];
  failsUntil('step: fast steered solve')('gives the same answer for two kinds whose tasks are equal', () => {
    for (const kind of TURN_KINDS) {
      for (const i of INTENSITIES) {
        const task = taskFor(kind, i);
        const other = TURN_KINDS.find((k) => k !== kind) ?? kind;
        const twin: TurnTask = { ...task };
        const why = `${kind} ${i} as ${other}`;
        assert.deepStrictEqual(marginBandDeg(twin), marginBandDeg(task), why);
        assert.deepStrictEqual(eventsOf(twin), eventsOf(task), why);
        assert.deepStrictEqual(feasibilityOf(twin), feasibilityOf(task), why);
        for (const t of ts) {
          assert.deepStrictEqual(edgeGoalAt(twin, t), edgeGoalAt(task, t), `${why} ${t}`);
          assert.deepStrictEqual(massPathForcesAt(twin, t), massPathForcesAt(task, t), `${why} ${t}`);
          assert.strictEqual(skiHeadingAt(twin, t), skiHeadingAt(task, t), `${why} ${t}`);
          assert.deepStrictEqual(counterBandAt(twin, t), counterBandAt(task, t), `${why} ${t}`);
        }
      }
    }
  });
});

describe('rules 7 and 8: energy and peak timing (motion-model §9 V)', () => {
  it("names the force peak τ in every rule 8 message, judged on the kind's window off moguls", () => {
    for (const kind of TURN_KINDS) {
      for (const i of INTENSITIES) {
        const task = taskFor(kind, i);
        const r8 = feasibilityOf(task).find((c) => c.rule === 8);
        const peak = eventsOf(task).forcePeak;
        assert.include(r8?.detail ?? '', peak.toFixed(3), `${kind} ${i}`);
        const win = task.legacy.forcePeakWindow;
        if (win !== null) assert.strictEqual(r8?.ok, peak >= win[0] && peak <= win[1], `${kind} ${i}`);
        else assert.strictEqual(kind, TurnKind.Moguls);
      }
    }
  });

  it('reports rule 7 on moguls only, pending the hit placement', () => {
    for (const i of INTENSITIES) {
      const r7 = feasibilityOf(taskFor(TurnKind.Moguls, i)).find((c) => c.rule === 7);
      assert.isTrue(r7?.ok);
      assert.include(r7?.detail ?? '', "closure needs P's hit placement");
    }
  });

  it('closes GS dynamic at γ_e 15° only with a half sweep above 45°', () => {
    const sweep = closingSweepDeg(taskFor(TurnKind.GS, Intensity.Dynamic), Snow.HardGroomed);
    assert.isTrue(sweep === null || sweep > 45, `${sweep}`);
  });
});

describe('fore-aft and moment presets (motion-model §9 F)', () => {
  it('gives every kind its fore-aft goal and moment bands at every intensity', () => {
    for (const i of INTENSITIES) {
      assert.deepStrictEqual(taskFor(TurnKind.GS, i).legacy.foreAft, { curve: 'gs_carving' });
      assert.deepStrictEqual(taskFor(TurnKind.SL, i).legacy.foreAft, { curve: 'slalom' });
      for (const k of [TurnKind.Steered, TurnKind.Moguls]) {
        const fa = taskFor(k, i).legacy.foreAft;
        assert.isTrue('aheadM' in fa);
        // The mid-foot constant is the CoM over the ski-frame origin: −ANKLE_ALONG.
        if ('aheadM' in fa) assert.closeTo(fa.aheadM, -ANKLE_ALONG, 5e-5);
      }
      assert.strictEqual(taskFor(TurnKind.GS, i).legacy.momentBands, 'heinrich-2022');
      assert.strictEqual(taskFor(TurnKind.SL, i).legacy.momentBands, 'heinrich-2022');
      assert.isNull(taskFor(TurnKind.Steered, i).legacy.momentBands);
      assert.isNull(taskFor(TurnKind.Moguls, i).legacy.momentBands);
    }
  });

  it('reads the GS curve at its anchors as sporri-2016 Fig 4 in lit-curves, closed within 2 SE', () => {
    const c = LIT.gs_carving.fore_aft_cm;
    const halfAt = (j: number): number => ((c.range[1]?.[j] ?? 0) - (c.range[0]?.[j] ?? 0)) / 2;
    const ends = [halfAt(0), halfAt(c.t.length - 1)] as const;
    c.t.slice(0, -1).forEach((t, j) => {
      const g = foreAftAt({ curve: 'gs_carving' }, t);
      const shift = closure(c.mean, ends, t);
      assert.closeTo(g.mean * 100, (c.mean[j] ?? NaN) + shift, 1e-9);
      assert.isAtMost(Math.abs(shift), 2 * halfAt(j), `${t}`);
      assert.closeTo(g.sigma * 100, Math.max(5, halfAt(j)), 1e-9);
    });
    assert.closeTo(foreAftAt({ curve: 'gs_carving' }, 1 - 1e-12).mean, foreAftAt({ curve: 'gs_carving' }, 0).mean, 1e-9);
  });

  it("reads SL's three reid-2010 anchors closed within one sd, σ the larger of the floor and the sd", () => {
    const c = LIT.slalom.fore_aft_cm as unknown as { t: number[]; mean: number[]; sd: number[] };
    assert.deepStrictEqual(c.t, [0, 0.3, 1]);
    const ends = [c.sd[0] ?? NaN, c.sd[2] ?? NaN] as const;
    for (const [j, t] of [[0, 0], [1, 0.3]] as const) {
      const g = foreAftAt({ curve: 'slalom' }, t);
      const shift = closure(c.mean, ends, t);
      assert.closeTo(g.mean * 100, (c.mean[j] ?? NaN) + shift, 1e-9);
      assert.isAtMost(Math.abs(shift), c.sd[j] ?? NaN);
      assert.closeTo(g.sigma, 0.05, 1e-12);
    }
    assert.closeTo(foreAftAt({ curve: 'slalom' }, 0.65).mean * 100, (16.4 + -7.8) / 2 + closure(c.mean, ends, 0.65), 1e-9);
    assert.closeTo(foreAftAt({ curve: 'slalom' }, 1 - 1e-12).mean, foreAftAt({ curve: 'slalom' }, 0).mean, 1e-9);
  });
});
