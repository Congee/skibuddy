import { assert, describe, it } from '@effect/vitest';
import { INTENSITIES } from '../src/content/schema';
import { ANGULATION_MAX_DEG, BEND_FACTOR, Snow, carvedRadius, edgeGoalAt, marginBandDeg } from '../src/physics/edge';
import { TURN_KINDS, TurnKind, eventsOf, taskFor } from '../src/physics/task';
import { failsUntil } from './legacy';
import { skiForKind } from './ski-for-kind';
import { forcesAt, massPathForcesAt, turnProfile } from '../src/physics/turn';
import type { TurnProfile } from '../src/physics/turn';
import type { TurnTask } from '../src/physics/task';

const DEG = Math.PI / 180;
const turnProfileOf = (task: TurnTask): TurnProfile => turnProfile(task, Snow.HardGroomed);
const K = BEND_FACTOR[Snow.HardGroomed];
const SL = skiForKind(TurnKind.SL);
const STEPS = 240;
const ts = Array.from({ length: STEPS }, (_, i) => i / STEPS);

describe('sidecut and snow', () => {
  it('keeps k and the angulation range inside their sources', () => {
    // thorwartl-2023 range-only 0.7–1.0; heinrich-2022 hip 3–27° + lumbar 0–5° + small knee, about 20–35°.
    assert.isAtLeast(K, 0.7);
    assert.isAtMost(K, 1);
    assert.isAtLeast(ANGULATION_MAX_DEG, 20);
    assert.isAtMost(ANGULATION_MAX_DEG, 35);
  });

  it('carves the SL arc: R_sc cos ε with no sink, one hand-worked sunk edge', () => {
    assert.strictEqual(SL.sidecutRadius, 13.6);
    // D = (tip + tail − 2 waist) / 4 = (0.12 + 0.098 − 0.132) / 4 = 0.0215 m.
    [[20, 12.780], [45, 9.617], [60, 6.8]].forEach(([e = 0, r = 0]) => assert.closeTo(carvedRadius(SL, e * DEG, 0), r, 0.005, `${e}`));
    // 45°, d 1 mm: R_sc / (1 / cos ε + (d / D) sin ε) = 13.6 / (1.41421 + 0.04651 × 0.70711) = 9.398 m.
    assert.closeTo(carvedRadius(SL, 45 * DEG, 0.001), 9.398, 0.005);
    assert.strictEqual(skiForKind(TurnKind.Moguls).sidecutRadius, 19.9);
  });

  it('leans the mass at tan⁻¹(v² / (g r cos θ)) on the carved arc, one hand-worked case', () => {
    // v 8, ε 45°, θ 17°: r 9.617 m, v² / (g r) 0.6786, over cos 17° 0.9563 gives 35.35°, margin 9.65°.
    const hand = { speedMps: 8, radiusM: carvedRadius(SL, 45 * DEG, 0), slopeDeg: 17 };
    assert.closeTo(forcesAt(hand, Math.PI / 2).tilt / DEG, 35.35, 0.05);
    assert.closeTo(45 - forcesAt(hand, Math.PI / 2).tilt / DEG, 9.65, 0.05);
    for (const c of [{ v: 6, e: 30, th: 12 }, { v: 8, e: 45, th: 17 }, { v: 9, e: 58, th: 22 }]) {
      const r = carvedRadius(SL, c.e * DEG, 0);
      const s = { speedMps: c.v, radiusM: r, slopeDeg: c.th };
      const want = Math.atan2(c.v ** 2 / (9.80665 * r), Math.cos(c.th * DEG)) / DEG;
      assert.closeTo(forcesAt(s, Math.PI / 2).tilt / DEG, want, 0.05, `${c.e}`);
    }
  });
});

/** The solved edge over the cycle, as a share of its peak: the shape reid-2020 and sporri-2016 measure (motion-model §4.2). */
const shapeOf = (task: TurnTask): ((t: number) => number) => {
  const p = turnProfileOf(task);
  const peak = Math.max(...ts.map((t) => p.at(t).edge));
  return (t) => p.at(t).edge / peak;
};
const peakT = (task: TurnTask): number => {
  const shape = shapeOf(task);
  return ts.find((t) => shape(t) > 1 - 1e-9) ?? 1;
};

describe('edge goal', () => {
  it('holds the carved edge above the lean while loaded, under the angulation range, on an arc no wider than R_sc cos ε', () => {
    for (const [kind, i] of [TurnKind.GS, TurnKind.SL].flatMap((k) => INTENSITIES.map((x) => [k, x] as const))) {
      const task = taskFor(kind, i);
      for (const t of ts) {
        const g = edgeGoalAt(task, t);
        if ((g.edgeDeg - g.leanDeg) > -1e-9) assert.isAtMost(g.edgeDeg - g.leanDeg, ANGULATION_MAX_DEG + 1e-9, `${i} ${t}`);
      }
      // At the force peak, sinking only tightens the arc: no wider than R_sc cos ε.
      const pk = edgeGoalAt(task, eventsOf(task).forcePeak);
      assert.isAtMost(pk.radiusM, skiForKind(kind).sidecutRadius * Math.cos(pk.edgeDeg * DEG) + 1e-9, `${kind} ${i} peak`);
      const loaded = ts.filter((t) => massPathForcesAt(task, t).arcShare > 0.5);
      assert.isAbove(loaded.length, STEPS / 2, i);
      for (const t of loaded) {
        const g = edgeGoalAt(task, t);
        assert.isAtLeast(g.edgeDeg, g.leanDeg - 1e-9, `${kind} ${i} ${t}`);
        assert.isAtMost(g.radiusM, skiForKind(kind).sidecutRadius * Math.cos(g.edgeDeg * DEG) + 1e-9, `${kind} ${i} ${t} radius`);
      }
      // Plateau at the solved ε_max: ε = λ + m (§4.2), so the peak edge sits at or above the peak lean and within the angulation M of it.
      const goals = ts.map((t) => edgeGoalAt(task, t));
      const peakEdge = Math.max(...goals.map((g) => g.edgeDeg));
      const peakLean = Math.max(...goals.map((g) => g.leanDeg));
      assert.isAtLeast(peakEdge, peakLean - 1e-9, `${kind} ${i}`);
      assert.isAtMost(peakEdge, peakLean + task.style.angulationDeg + 1e-9, `${kind} ${i}`);
    }
  });

  failsUntil('step: edge shape')('builds the slalom edge slower than the GS one (reid-2020 against sporri-2016)', () => {
    // At t 0.2: reid-2020 50.0° of 69.4°, sporri-2016 58.4° of 70.3°.
    for (const i of INTENSITIES) {
      const sl = shapeOf(taskFor(TurnKind.SL, i));
      const gs = shapeOf(taskFor(TurnKind.GS, i));
      assert.isBelow(sl(0.2), gs(0.2) - 0.1, i);
    }
  });

  failsUntil('step: edge shape')('peaks both carved edges at t 0.65, less the switch-to-switch baseline (reid-2020 10 m 68.9°, sporri-2016 70.3°)', () => {
    for (const kind of [TurnKind.SL, TurnKind.GS]) for (const i of INTENSITIES) assert.closeTo(peakT(taskFor(kind, i)), 0.65, 0.01, `${kind} ${i}`);
  });

  failsUntil('step: steered rebuild')('keeps the steered margin inside −5…10° while loaded, growing with the skid', () => {
    for (const kind of [TurnKind.Steered]) {
      const mid: number[] = [];
      for (const i of INTENSITIES) {
        const task = taskFor(kind, i);
        const band = marginBandDeg(task);
        assert.deepStrictEqual(band, { min: -5, max: 10 });
        const g0 = edgeGoalAt(task, 0.6);
        mid.push(g0.edgeDeg - g0.leanDeg);
        for (const t of ts.filter((x) => x > 0.2 && x < 0.85)) {
          const g = edgeGoalAt(task, t);
          assert.isAtLeast(g.edgeDeg - g.leanDeg, band.min - 1e-9, `${kind} ${i} ${t}`);
          assert.isAtMost(g.edgeDeg - g.leanDeg, band.max + 1e-9, `${kind} ${i} ${t}`);
          assert.strictEqual(g.marginMinDeg, band.min);
          assert.strictEqual(g.marginMaxDeg, band.max);
        }
      }
      // Gentle about 0, short-swing about 5° (inferred).
      assert.closeTo(mid[0] ?? 0, 0, 1);
      assert.closeTo(mid[2] ?? 0, 5, 1);
      assert.isBelow(mid[0] ?? 0, mid[1] ?? 0);
      assert.isBelow(mid[1] ?? 0, mid[2] ?? 0);
    }
  });

  failsUntil('step: moguls rebuild')('plans the mogul edge at the lean wherever the skis skid (γ > 0): the slip threshold, margin 0', () => {
    for (const i of INTENSITIES) {
      const task = taskFor(TurnKind.Moguls, i);
      const e = eventsOf(task);
      const p = turnProfileOf(task);
      let skidding = 0;
      p.attack.forEach((g, k) => {
        if (g <= 0) return;
        skidding++;
        assert.strictEqual(p.edge[k], p.lean[k], `${i} ${k}`);
      });
      assert.isAbove(skidding, 0, i);
      const edge = ts.map((t) => edgeGoalAt(task, t).edgeDeg);
      const top = ts[edge.indexOf(Math.max(...edge))] ?? 0;
      assert.isAbove(top, e.fallLine, i);
      assert.closeTo(top, e.forcePeak, 0.1, i);
    }
  });

  failsUntil('step: edge shape')('builds one edge peak per turn and joins the mirrored turn', () => {
    for (const kind of TURN_KINDS) {
      for (const i of INTENSITIES) {
        const task = taskFor(kind, i);
        const e = ts.map((t) => edgeGoalAt(task, t).edgeDeg);
        const top = e.indexOf(Math.max(...e));
        e.forEach((x, k) => {
          if (k > 0 && k <= top) assert.isAtLeast(x, (e[k - 1] ?? x) - 1e-9, `${kind} ${i} rising ${k}`);
          if (k > top) assert.isAtMost(x, (e[k - 1] ?? x) + 1e-9, `${kind} ${i} falling ${k}`);
        });
        // No step: at most 7° per 1/96 of the cycle (the carved release); the mirror below closes the switch.
        for (let k = 0; k < 96; k++) {
          const a = edgeGoalAt(task, k / 96).edgeDeg;
          const b = edgeGoalAt(task, Math.min((k + 1) / 96, 1 - 1e-9)).edgeDeg;
          assert.isAtMost(Math.abs(b - a), 7, `${kind} ${i} step ${k}`);
        }
        // The cycle's end is the next turn's start, mirrored.
        assert.closeTo(edgeGoalAt(task, 1 - 1e-9).edgeDeg, -(e[0] ?? 0), 0.05, `${kind} ${i} mirror`);
      }
    }
  });
});
