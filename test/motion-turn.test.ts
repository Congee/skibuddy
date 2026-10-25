import { assert, describe, it } from '@effect/vitest';
import { failsUntil } from './legacy';
import { INTENSITIES, Intensity } from '../src/content/schema';
import { checkJacobian } from '../src/solve/problem';
import { BINDING, compose, forward, skiFrame, transform, value } from '../src/viewer/motion/fk';
import type { Rigid } from '../src/viewer/motion/fk';
import { MIGRATED, Q_FRAMES, qEdges, qTable, STORED_Q } from '../src/viewer/motion/q-table';
import { ankleMidOf, axialRotationOf, buildTurnProblem, centreOfMassOf, pressuresOf, isPressed, massHeightOf, skiContactOf, LEG_LENGTH, NAMES, pickEdges, PRESSURE_EDGE_DEG, reportOf, requiredCurvature, runningLength, seedFor, SeedKind, skiGoal, skiPointsOf, snowCurvature, solveTurn, trunkAcrossOf, trunkGravityOf } from '../src/viewer/motion/turn';
import type { SkiGoal, SkiPoints } from '../src/viewer/motion/turn';
import { pathAt, supportAt, surfaceFor } from '../src/viewer/surface';
import type { Surface } from '../src/viewer/surface';
import { BEND_REFERENCE, bendRadiusOf, sagittaOf } from '../src/physics/ski-bend';
import { Snow } from '../src/physics/edge';
import { ANKLE_STAND_M, mogulTrackOf, turnProfile } from '../src/physics/turn';
import { edgedContacts } from '../src/physics/moguls';
import { skiForKind } from './ski-for-kind';
import { kindOfDrill } from '../src/viewer/poses/regular-turn';
import { taskFor, TurnKind } from '../src/physics/task';
import { skiHeadingAt } from '../src/physics/turn';
import { EQUIPMENT } from '../src/viewer/equipment';
import { CARVING_SKIS, REFERENCE_SKIER } from '../src/viewer/skier';
import { transformPoint } from '../src/viewer/mat4';
import { bindingInSegment, COORDINATES, forwardKinematics, REST_POSE, rigidInverse, SEGMENT_NAMES, SKELETON_DATA, Side } from '../src/viewer/skeleton';
import { inputHash } from '../scripts/anatomy/pose-tables';

const DEG = Math.PI / 180;
/** Base to CoM standing tall at rest, in leg lengths: the most a flexed skier can reach. */
const STANDING = (() => {
  const com = centreOfMassOf(forward(COORDINATES.map((c) => REST_POSE[c.name] ?? 0))).map(Number);
  return ((com[1] ?? 0) - SKELETON_DATA.gear_fit[Side.Right].sole + EQUIPMENT.standHeight) / LEG_LENGTH;
})();
/** Deepest CoM a regular turn keeps, leg lengths; inferred sanity floor (no recreational CoM height read). */
const CROUCH = 0.6;
/** The q-tables' storage step, radians or metres: a stored solve sits within it of the solved one. */
const STORED = 1e-4;

describe('motion fk', () => {
  it('matches skeleton.ts forwardKinematics', () => {
    const q = COORDINATES.map((c, i) => (REST_POSE[c.name] ?? 0) + 0.2 * Math.sin(1.7 * i + 0.3));
    const want = forwardKinematics(Object.fromEntries(COORDINATES.map((c, i) => [c.name, q[i] ?? 0])));
    const got = forward(q);
    for (const [name, m] of Object.entries(want)) {
      const r = got[name];
      assert.isDefined(r);
      const R = [m[0], m[4], m[8], m[1], m[5], m[9], m[2], m[6], m[10]];
      R.forEach((v, i) => assert.approximately(Number(r?.R[i]), v ?? 0, 1e-5, `${name} R${i}`));
      [m[12], m[13], m[14]].forEach((v, i) => assert.approximately(Number(r?.p[i]), v ?? 0, 1e-5, `${name} p${i}`));
    }
  });

  failsUntil('step: fast steered solve')('gives exact Jacobians in the turn blocks', () => {
    const tp = buildTurnProblem('regular-steered', Intensity.Moderate, { frames: 4 });
    const x = seedFor(tp, SeedKind.Jitter);
    assert.isTrue(tp.problem.blocks.some((k) => k.name === 'prior trunk pitch 1'), 'measured trunk pitch block');
    for (const b of tp.problem.blocks.filter((k) => k.name.endsWith(' 1'))) assert.isBelow(checkJacobian(b, Float64Array.from(b.vars, (v) => x[v] ?? 0)), 1e-5, b.name);
    const moguls = buildTurnProblem('regular-moguls', Intensity.Moderate, { frames: 4 });
    const xm = seedFor(moguls, SeedKind.Jitter);
    for (const b of moguls.problem.blocks.filter((k) => k.name.endsWith(' 1'))) assert.isBelow(checkJacobian(b, Float64Array.from(b.vars, (v) => xm[v] ?? 0)), 1e-5, `moguls ${b.name}`);
  });

  it('heads the path and the ski goals on the skis\' heading', () => {
    for (const drill of ['regular-steered', 'regular-gs', 'regular-sl'])
      for (const i of INTENSITIES) {
        const kind = kindOfDrill(drill);
        if (kind === null) throw new Error(drill);
        const task = taskFor(kind, i);
        const s = surfaceFor(drill, i);
        for (const t of [0.05, 0.25, 0.5, 0.75, 0.95]) {
          assert.approximately(pathAt(s, t).heading, skiHeadingAt(task, t) - Math.PI / 2, 1e-12, `${drill} ${i} ${t}`);
          const f = skiGoal(drill, i, s, t).forward;
          assert.approximately(Math.atan2(f[0] ?? 0, f[2] ?? 1), pathAt(s, t).heading, 1e-2, `${drill} ${i} ${t} goal`);
        }
      }
  });

  it('measures short turns by the trunk against gravity, not the ski frame', () => {
    const tp = buildTurnProblem('regular-sl', Intensity.Moderate, { frames: 4 });
    const x = seedFor(tp, SeedKind.Jitter);
    const names = tp.problem.blocks.map((k) => k.name);
    for (const n of ['prior trunk gravity 1', 'prior trunk across 1']) assert.include(names, n);
    assert.notInclude(names, 'prior trunk pitch 1');
    for (const b of tp.problem.blocks.filter((k) => k.name.startsWith('prior trunk'))) assert.isBelow(checkJacobian(b, Float64Array.from(b.vars, (v) => x[v] ?? 0)), 1e-5, b.name);
  });

  it('signs the trunk across gravity + toward the turn inside', () => {
    const g = skiGoal('regular-sl', Intensity.Moderate, surfaceFor('regular-sl', Intensity.Moderate), 0.5);
    const lean = (k: number): never => {
      const t = [0, 1, 2].map((j) => (g.up[j] ?? 0) + k * (g.inside[j] ?? 0));
      return { pelvis: { R: [], p: [0, 0, 0] }, neck: { R: [], p: t } } as never;
    };
    assert.approximately(Number(trunkAcrossOf(lean(Math.tan(20 * DEG)), g.up, g.inside)), 20 * DEG, 1e-9);
    assert.approximately(Number(trunkAcrossOf(lean(-Math.tan(20 * DEG)), g.up, g.inside)), -20 * DEG, 1e-9);
    assert.approximately(Number(trunkGravityOf(lean(Math.tan(30 * DEG)), g.up)), 30 * DEG, 1e-6);
    const slope = taskFor(TurnKind.SL, Intensity.Moderate).slopeDeg;
    assert.approximately(g.up[1] ?? 0, Math.cos(slope * DEG), 1e-9);
    assert.approximately(g.up[2] ?? 0, -Math.sin(slope * DEG), 1e-9);
  });
});

/** Each base point's rigid gap and bend sagitta for the goal's ski frame with its lower waist edge at the path point. */
const pressedGaps = (s: Surface, g: SkiGoal, ski: SkiPoints): Array<{ readonly gap: number; readonly sagitta: number }> => {
  const low = g.edge >= 0 ? 0 : 1;
  const px = ski.points[2 + low]?.[0] ?? 0;
  return ski.points.map((p) => {
    const w = [0, 1, 2].map((j) => (g.origin[j] ?? 0) + (p[0] - px) * (g.axes[0]?.[j] ?? 0) + (p[1] - ski.centre[1]) * (g.axes[1]?.[j] ?? 0) + p[2] * (g.axes[2]?.[j] ?? 0));
    return { gap: (w[1] ?? 0) - supportAt(s, w[0] ?? 0, w[2] ?? 0), sagitta: sagittaOf(p[2], g.bend[0]) };
  });
};

describe('ski contact and bend', () => {
  it('bends the ski tighter under more load, clamped', () => {
    assert.closeTo(bendRadiusOf(1111), 3.85, 1e-12);
    assert.closeTo(bendRadiusOf(2222), 1.925, 1e-12);
    assert.strictEqual(bendRadiusOf(10_000), 1.5);
    assert.strictEqual(bendRadiusOf(0), 1000);
    const rs = [0, 10, 100, 500, 1111, 2000, 5000, 20_000].map(bendRadiusOf);
    for (let i = 1; i < rs.length; i++) assert.isAtMost(rs[i] ?? 0, rs[i - 1] ?? 0);
  });

  it('on flat snow the edged rigid ends sit below the snow by the sidecut, inside the bend', () => {
    const task = taskFor(TurnKind.GS, Intensity.Dynamic);
    const s = surfaceFor('regular-gs', Intensity.Dynamic);
    const g = skiGoal('regular-gs', Intensity.Dynamic, s, turnProfile(task, task.snow ?? Snow.HardGroomed).events.forcePeak);
    const ski = skiPointsOf(skiForKind(TurnKind.GS));
    const gaps = pressedGaps(s, g, ski);
    const width = (i: number): number => (ski.points[i]?.[0] ?? 0) - (ski.points[i + 1]?.[0] ?? 0);
    for (const end of [0, 4]) assert.closeTo(gaps[end]?.gap ?? NaN, (-(width(end) - width(2)) / 2) * Math.sin(g.edge), 1e-9);
    // The bend lies along the base normal, ε off the snow's: it lifts by cos ε of its sagitta.
    for (const { gap, sagitta } of gaps) assert.isAtLeast(gap + sagitta * Math.cos(g.edge), 0);
  });

  it('presses an edged ski on a plane once its load bends it to the sidecut, else bridges it', () => {
    const s = surfaceFor('regular-gs', Intensity.Dynamic);
    const ski = skiForKind(TurnKind.GS);
    const g = skiGoal('regular-gs', Intensity.Dynamic, s, 0.5);
    const snow = snowCurvature(s, g.origin[0], g.origin[2], g.forward, runningLength(ski));
    assert.closeTo(snow, 0, 1e-9);
    const need = requiredCurvature(30 * DEG, ski.sidecutRadius, snow);
    // By hand: 1/R_bend ≥ tan 30° / 16.4 = 0.035204 /m, R_bend 28.406 m, F = 3.85 m · 1111 N · 0.035204 = 150.58 N (the sin law gave 130.41 N).
    assert.strictEqual(ski.sidecutRadius, 16.4);
    assert.closeTo(need, 0.0352042847, 1e-9);
    assert.closeTo(BEND_REFERENCE.radiusM * BEND_REFERENCE.forceN * need, 150.581047, 1e-5);
    // The force whose bend radius is exactly 1 / κ_req, by bendRadiusOf's linear law.
    const force = BEND_REFERENCE.radiusM * BEND_REFERENCE.forceN * need;
    assert.isTrue(isPressed(bendRadiusOf(1.01 * force), need), 'loaded: pressed');
    assert.isFalse(isPressed(bendRadiusOf(0.99 * force), need), 'light: bridged');
    assert.isTrue(isPressed(bendRadiusOf(force), requiredCurvature(0, ski.sidecutRadius, snow)), 'flat: pressed');
  });

  it("presses the edged ski on a plane exactly where M4's regime does, over a sweep of edge and bend", () => {
    const s = surfaceFor('regular-gs', Intensity.Dynamic);
    const ski = skiForKind(TurnKind.GS);
    const g = skiGoal('regular-gs', Intensity.Dynamic, s, 0.5);
    for (const deg of [0, 10, 20, 30, 45, 60]) {
      for (const radius of [4, 8, 16, 32, 64, 1000]) {
        const k = skiContactOf(s, g.origin[0], g.origin[2], g.forward, skiPointsOf(ski), radius, deg * DEG, ski.sidecutRadius);
        assert.strictEqual(k.pressed, isPressed(radius, requiredCurvature(deg * DEG, ski.sidecutRadius, snowCurvature(s, g.origin[0], g.origin[2], g.forward, runningLength(ski)))), `${deg} ${radius}`);
      }
    }
  });

  it("samples each ski's sidecut at its R_sc: the tip and tail rows at the running edge's ends, the drawn ski full length", () => {
    for (const ski of [...Object.values(CARVING_SKIS), ...Object.values(REFERENCE_SKIER.skis)]) {
      const p = skiPointsOf(ski);
      const width = (i: number): number => (p.points[i]?.[0] ?? 0) - (p.points[i + 1]?.[0] ?? 0);
      const along = (i: number): number => p.points[i]?.[2] ?? 0;
      // The three rows' half-width second difference about the waist, 1/m.
      const [ht, hw, hl] = [width(0) / 2, width(2) / 2, width(4) / 2];
      const [ut, ul] = [along(0) - along(2), along(4) - along(2)];
      const curvature = (2 * ((ht - hw) / ut - (hl - hw) / ul)) / (ut - ul);
      assert.closeTo(1 / curvature, ski.sidecutRadius, 1e-9, ski.model);
      assert.closeTo(ut, -ul, 1e-12, ski.model);
      assert.closeTo(p.ends.tip - p.ends.tail, ski.length, 1e-9, ski.model);
      assert.isAbove(p.ends.tip, along(0), ski.model);
      assert.isBelow(p.ends.tail, along(4), ski.model);
    }
  });

  it("measures the mass height square to the slope over the bent waists' lower edges, both skis' mean: the physics' h", () => {
    const s = surfaceFor('regular-moguls', Intensity.Moderate);
    const ski = skiPointsOf(skiForKind(TurnKind.Moguls));
    for (const t of [0.1, 0.3, 0.5, 0.7]) {
      const g = skiGoal('regular-moguls', Intensity.Moderate, s, t);
      const w = forward(
        COORDINATES.map((c) => REST_POSE[c.name] ?? 0),
        g.origin,
        SEGMENT_NAMES,
        g.ref,
      );
      const com = value(centreOfMassOf(w)[1]);
      const low = g.edge >= 0 ? 0 : 1;
      const over = (side: Side, e: number): number => {
        // The rows hold bent points, so the frame's mount is the bent waist: no drop below the chord.
        return com - value(transform(skiFrame(w, side), ski.points[2 + e] ?? ski.centre)[1]);
      };
      assert.closeTo(value(massHeightOf(w, ski, g, 1)), (over(Side.Right, low) + over(Side.Left, 1)) / 2, 1e-12, `${t}`);
    }
  });

  it('rests the edged inside ski on the goal lower edge, even where the prior seed rolls it the other way', () => {
    const tp = buildTurnProblem('regular-gs', Intensity.Dynamic, { frames: 24 });
    const x = seedFor(tp, SeedKind.Prior);
    const N = NAMES.length;
    const side = (k: number): number => ((tp.goals[k]?.edge ?? 0) >= 0 ? 0 : 1);
    const lowerInSeed = (k: number, end: number): number => {
      const g = tp.goals[k];
      if (g === undefined) throw new Error('no goal');
      const ins = skiFrame(forward(Array.from(x.slice(k * N, k * N + COORDINATES.length)), g.origin, SEGMENT_NAMES, g.ref), Side.Left);
      const [a = 0, b = 0] = [0, 1].map((e) => {
        const p = transform(ins, tp.ski.points[4 * end + e] ?? tp.ski.centre).map(value);
        return (p[1] ?? 0) - supportAt(tp.surface, p[0] ?? 0, p[2] ?? 0);
      });
      return a <= b ? 0 : 1;
    };
    const edged = tp.goals.flatMap((g, k) => (Math.abs(g.edge) >= PRESSURE_EDGE_DEG * DEG ? [k] : []));
    assert.isTrue(edged.some((k) => [0, 1].some((end) => lowerInSeed(k, end) !== side(k))), 'premise: the seed rolls an edged inside ski the wrong way');
    pickEdges(tp, x);
    for (const k of edged) for (const end of [0, 1]) assert.strictEqual(tp.insideEdges[2 * k + end], side(k), `frame ${k} end ${end}`);
  });

  it('measures the bend allowance from the mount, whatever the pressure centre', () => {
    const tp = buildTurnProblem('regular-gs', Intensity.Dynamic, { frames: 8 });
    const x = seedFor(tp, SeedKind.Prior);
    const along = NAMES.indexOf('pressure_along');
    const rows = (k: number, shift: number): number[] => {
      const b = tp.problem.blocks.find((c) => c.name === `contact ${k}`);
      if (b === undefined) throw new Error('no contact block');
      const r = new Float64Array(b.size);
      b.evaluate(Float64Array.from(b.vars, (v) => (x[v] ?? 0) + (v === k * NAMES.length + along ? shift : 0)), r, null);
      return [...r];
    };
    for (let k = 0; k < tp.goals.length; k++) {
      assert.isTrue(tp.goals[k]?.pressed[0], `frame ${k}: outside pressed`);
      const [a, b] = [rows(k, 0), rows(k, 0.05)];
      a.forEach((v, j) => assert.closeTo(b[j] ?? NaN, v, 1e-12, `frame ${k} row ${j}`));
    }
  });

  failsUntil('step: moguls rebuild')('on the zipper a rigid ski cannot lie at the trough or the hit, the bend can', () => {
    const s = surfaceFor('regular-moguls', Intensity.Moderate);
    const ski = skiPointsOf(skiForKind(TurnKind.Moguls));
    for (const t of [s.trough, mogulTrackOf(taskFor(TurnKind.Moguls, Intensity.Moderate)).hit]) {
      const gaps = pressedGaps(s, skiGoal('regular-moguls', Intensity.Moderate, s, t), ski);
      assert.isBelow(Math.min(...[0, 1, 4, 5].map((i) => gaps[i]?.gap ?? NaN)), -0.01, `rigid end at t ${t}`);
      gaps.forEach(({ gap, sagitta }, j) => assert.isAtLeast(gap + sagitta, 0, `t ${t} point ${j}: gap ${(gap * 1000).toFixed(0)} mm, sagitta ${(sagitta * 1000).toFixed(0)} mm`));
    }
  });
});

describe('motion turn, live', () => {
  it('converges from three seeds to one q on a short steered turn', { timeout: 60_000 }, () => {
    const tp = buildTurnProblem('regular-steered', Intensity.Moderate, { frames: 12 });
    const [a, ...rest] = Object.values(SeedKind).map((k) => solveTurn(tp, seedFor(tp, k)));
    assert.isDefined(a);
    for (const m of [a, ...rest]) {
      assert.isTrue(m.result.converged, 'converged');
      assert.isTrue(m.result.feasible, 'feasible');
    }
    for (const m of rest) assert.isBelow(m.result.x.reduce((s, v, i) => Math.max(s, Math.abs(v - (a?.result.x[i] ?? 0))), 0), 1e-4, 'seed spread');
  });
});

describe('motion turn, stored', () => {
  it('q-tables match their solve inputs; run `bun run poses` if not', () => {
    assert.strictEqual(STORED_Q.hash, inputHash());
    assert.deepStrictEqual(STORED_Q.names, NAMES);
    assert.strictEqual(STORED_Q.frames, Q_FRAMES);
  });

  for (const drill of MIGRATED)
    for (const i of INTENSITIES)
      describe(`${drill} ${i}`, () => {
        const report = (() => {
          let r: ReturnType<typeof reportOf> | undefined;
          return (): ReturnType<typeof reportOf> => {
            if (r !== undefined) return r;
            const q = qTable(drill, i);
            if (q === null) throw new Error(`${drill} ${i}: no q-table`);
            const tp = buildTurnProblem(drill, i, { frames: Q_FRAMES });
            const edges = qEdges(drill, i);
            if (edges === null) throw new Error(`${drill} ${i}: no stored edges`);
            tp.insideEdges.set(edges);
            const x = new Float64Array(tp.cycle.size);
            q.forEach((f, k) => x.set(f, k * NAMES.length));
            r = reportOf(tp, x);
            return r;
          };
        })();

        it('keeps the outside ski on the snow at the physics edge', () => {
          const r = report();
          assert.isBelow(r.outsideContact, 1e-3);
          assert.isAtLeast(r.lowestBase, -1e-3);
          assert.isBelow(r.edgeError, 0.5 * DEG);
        });

        it('keeps both skis on the snow, balanced over the pressure centre', () => {
          const r = report();
          assert.isBelow(r.insideContact, 1e-3);
          assert.isBelow(r.balance, 0.5 * DEG);
        });

        it('keeps boots and skis apart', () => {
          const r = report();
          // Storage step times about a metre of lever.
          assert.isAtLeast(r.bootClearance, -STORED);
          assert.isAtLeast(r.skiClearance, -STORED);
        });

        it('lets the CoM height emerge between a crouch and standing tall', () => {
          const [lo, hi] = report().comHeight;
          assert.isAbove(lo, CROUCH);
          assert.isBelow(hi, STANDING);
        });

        it('stays within the joint limits', () => {
          assert.isAtMost(report().limitExcess, STORED / 2 + 1e-9);
        });
      });
});

// BINDING is rigid to ~1e-6 only, so the foot takes its exact inverse: the ski frame a pure roll.
const inverse = ({ R, p }: Rigid): Rigid => {
  const m = R.map(value);
  const c = (i: number, j: number): number => m[i * 3 + j] ?? 0;
  const cof = (i: number, j: number): number => c((j + 1) % 3, (i + 1) % 3) * c((j + 2) % 3, (i + 2) % 3) - c((j + 1) % 3, (i + 2) % 3) * c((j + 2) % 3, (i + 1) % 3);
  const det = c(0, 0) * cof(0, 0) + c(0, 1) * cof(1, 0) + c(0, 2) * cof(2, 0);
  const Ri = Array.from({ length: 9 }, (_, k) => cof(Math.floor(k / 3), k % 3) / det);
  const t = p.map(value);
  const q = [0, 1, 2].map((i) => -((Ri[i * 3] ?? 0) * (t[0] ?? 0) + (Ri[i * 3 + 1] ?? 0) * (t[1] ?? 0) + (Ri[i * 3 + 2] ?? 0) * (t[2] ?? 0)));
  return { R: Ri as unknown as Rigid['R'], p: q as unknown as Rigid['p'] };
};

const footFor = (s: Side, e: number, x: number): Rigid => compose({ R: [Math.cos(e), Math.sin(e), 0, -Math.sin(e), Math.cos(e), 0, 0, 0, 1], p: [x, 0.3, 0.1] }, inverse(BINDING[s]));

describe('one path point and one pressure-centre geometry (P7e)', () => {
  it('pins the ankles\' midpoint on the path point in every kind', () => {
    for (const drill of ['regular-steered', 'regular-moguls']) {
      const tp = buildTurnProblem(drill, Intensity.Moderate, { frames: 4 });
      const x = seedFor(tp, SeedKind.Jitter);
      const b = tp.problem.blocks.find((k) => k.name === 'outside ski 1');
      const g = tp.goals[1];
      if (b === undefined || g === undefined) throw new Error(drill);
      const xl = Float64Array.from(b.vars, (v) => x[v] ?? 0);
      const mid = ankleMidOf(forward(Array.from(xl.subarray(0, COORDINATES.length)), g.origin, SEGMENT_NAMES, g.ref)).map(value);
      ['pelvis_tx', 'pelvis_ty', 'pelvis_tz'].forEach((name, j) => (xl[NAMES.indexOf(name)] = (xl[NAMES.indexOf(name)] ?? 0) + (g.origin[j] ?? 0) - (mid[j] ?? 0)));
      const r = new Float64Array(b.size);
      b.evaluate(xl, r, null);
      assert.approximately(r[b.size - 5] ?? 1, 0, 1e-12, `${drill} along`);
      assert.approximately(r[b.size - 4] ?? 1, 0, 1e-12, `${drill} across`);
    }
  });
  it("puts the solve's pressure centres where edgedContacts does, each ski rolled about its ankle", () => {
    const { ski } = buildTurnProblem('regular-moguls', Intensity.Moderate, { frames: 4 });
    const half = Math.abs(ski.points[2]?.[0] ?? 0);
    for (const [eo, ei] of [[0.02, -0.01], [0.4, 0.3], [0.7, 0.62], [-0.5, -0.45]] as const) {
      const w = { 'foot.R': footFor(Side.Right, eo, -0.07), 'foot.L': footFor(Side.Left, ei, 0.08) };
      const [po, pi] = pressuresOf(w, ski, eo, [0, 1, 0], 0.12);
      // The ankle sits 0.5 µm off the binding's centre line; the geometry stands it over the base centre.
      const [[yo, so], [yi, si]] = [Side.Right, Side.Left].map((side) => {
        const a = transformPoint(rigidInverse(bindingInSegment(side)), [0, 0, 0]);
        return [value(transform(skiFrame(w, side), [0, a[1], a[2]])[0]), a[1] + EQUIPMENT.skiThickness] as const;
      }) as [readonly [number, number], readonly [number, number]];
      assert.approximately(so, ANKLE_STAND_M, 1e-15);
      assert.approximately(si, ANKLE_STAND_M, 1e-6);
      assert.approximately(value(po[0]), edgedContacts([yo, yi], [eo, ei], { stand: so, half })[0], 1e-9, `${eo} outside`);
      assert.approximately(value(pi[0]), edgedContacts([yo, yi], [eo, ei], { stand: si, half })[1], 1e-9, `${ei} inside`);
    }
  });
});

// Segment axes x anterior, y long, z right; the reference's lateral (left) is −z.
const rx = (a: number): number[] => [1, 0, 0, 0, Math.cos(a), -Math.sin(a), 0, Math.sin(a), Math.cos(a)];
const ry = (a: number): number[] => [Math.cos(a), 0, Math.sin(a), 0, 1, 0, -Math.sin(a), 0, Math.cos(a)];
const rz = (a: number): number[] => [Math.cos(a), -Math.sin(a), 0, Math.sin(a), Math.cos(a), 0, 0, 0, 1];
const mm = (a: number[], b: number[]): number[] => Array.from({ length: 9 }, (_, k) => [0, 1, 2].reduce((t, j) => t + (a[3 * Math.floor(k / 3) + j] ?? 0) * (b[3 * j + (k % 3)] ?? 0), 0));

// Pitch about the lateral axis, then roll about the floating anterior axis, then yaw about the long axis.
const segment = (pitch: number, roll: number, yaw: number): Rigid => ({ R: mm(mm(rz(pitch), rx(roll)), ry(yaw)), p: [0, 0, 0] }) as unknown as Rigid;
const axial = (pitch: number, roll: number, yaw: number): number => Number(axialRotationOf([0, 0, -1], segment(pitch * DEG, roll * DEG, yaw * DEG))) / DEG;

describe('axial rotation by Grood–Suntay joint coordinates (the counter, chest twist)', () => {
  it('reads 0 for pure pitch, pure roll and pitch then roll', () => {
    for (const [p, r] of [[30, 0], [-40, 0], [0, 22], [0, -35], [30, 22], [30.6, 21.9], [-20, 40]] as const) assert.closeTo(axial(p, r, 0), 0, 1e-9, `${p} ${r}`);
  });

  it('reads the yaw, alone and after pitch and roll', () => {
    for (const y of [-25, -10, 5, 15, 40]) {
      assert.closeTo(axial(0, 0, y), y, 1e-9, `${y}`);
      for (const [p, r] of [[30, 0], [0, 22], [30.6, 21.9], [-20, 40]] as const) assert.closeTo(axial(p, r, y), y, 1e-9, `${p} ${r} ${y}`);
    }
  });
});
