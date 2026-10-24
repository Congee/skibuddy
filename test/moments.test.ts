import { assert, describe, it } from '@effect/vitest';
import { Intensity } from '../src/content/schema';
import { MAX_ACTIVATION } from '../src/viewer/motion/distribute';
import { normalisedEffort } from '../src/viewer/motion/effort';
import { forward, skiFrame, value } from '../src/viewer/motion/fk';
import { distributeTurn, momentsAt, momentsOf } from '../src/viewer/motion/moments';
import { buildTurnProblem, EFFORT_WEIGHT, edgeOf, effortOf, NAMES, pressuresOf, reportOf, seedFor, SeedKind } from '../src/viewer/motion/turn';
import type { SkiGoal } from '../src/viewer/motion/turn';
import { COORDINATES, SEGMENT_NAMES, Side } from '../src/viewer/skeleton';

// The carved dynamic cell at its prior seed: the moments' plumbing, no solve.
const tp = buildTurnProblem('regular-gs', Intensity.Dynamic, { frames: 24 });
const x = seedFor(tp, SeedKind.Prior);
const motion = { problem: tp, q: tp.cycle.unpack(x) };
const S = tp.goals.length;
const PEAK = Math.round((tp.events?.forcePeak ?? 0) * S) % S;

const DEG = Math.PI / 180;
const at = (name: string): number => NAMES.indexOf(name);
const worldOf = (g: SkiGoal, q: number[]): ReturnType<typeof forward> => forward(q.slice(0, COORDINATES.length), g.origin, SEGMENT_NAMES, g.ref);
/** Outside and inside ski edge on the snow normal, rad. */
const edgesOf = (g: SkiGoal, q: number[]): [number, number] => {
  const w = worldOf(g, q);
  return [value(edgeOf(skiFrame(w, Side.Right), g.normal)), value(edgeOf(skiFrame(w, Side.Left), g.normal))];
};
const insideHipRotation = (g: SkiGoal, q: number[]): number => {
  const w = worldOf(g, q);
  const p = pressuresOf(w, tp.ski, g.edge, g.normal, q[at('pressure_along')] ?? 0);
  return value(momentsOf(g, q, w, p).find((m) => m.name === 'hip_rotation.L')?.nm ?? NaN);
};
/** The root of an increasing or decreasing f on [lo, hi]. */
const root = (f: (x: number) => number, lo: number, hi: number): number => {
  let [a, b] = [lo, hi];
  for (let i = 0; i < 60; i++) {
    const m = (a + b) / 2;
    if (Math.sign(f(m)) === Math.sign(f(a))) a = m;
    else b = m;
  }
  return (a + b) / 2;
};

describe('joint moments', () => {
  it('normalise to the solver effort to 1e-9, so the K2 bake stays valid', () => {
    const g = tp.goals[PEAK];
    if (g === undefined) throw new Error('no force peak frame');
    const q = Array.from(motion.q[PEAK] ?? []);
    const w = forward(q.slice(0, COORDINATES.length), g.origin, SEGMENT_NAMES, g.ref);
    const p = pressuresOf(w, tp.ski, g.edge, g.normal, q[NAMES.indexOf('pressure_along')] ?? 0);
    const efforts = effortOf(g, q, w, p);
    const moments = momentsOf(g, q, w, p);
    assert.deepStrictEqual(
      moments.map((m) => m.name),
      efforts.map((e) => e.name),
    );
    moments.forEach((m, i) => assert.closeTo(EFFORT_WEIGHT * value(normalisedEffort(m.name, m.nm)), value(efforts[i]?.r ?? NaN), 1e-9, m.name));
  });

  it("are the numbers reportOf's largest efforts normalise", () => {
    const worst = reportOf(tp, x).effortWorst;
    assert.isNotEmpty(worst);
    for (const e of worst) {
      const k = tp.goals.findIndex((g) => g.t === e.t);
      const nm = momentsAt(motion, k).nm[e.name];
      assert.isDefined(nm, e.name);
      assert.closeTo(EFFORT_WEIGHT * value(normalisedEffort(e.name, nm ?? NaN)), e.z, 1e-9, `${e.name} at ${e.t}`);
    }
  });

  it('demand internal inside hip rotation with parallel shins under R, external in the A-frame (heinrich-2022, E4)', () => {
    const g0 = tp.goals[PEAK];
    if (g0 === undefined) throw new Error('no force peak frame');
    // Inside femur 15° external, knee 90°, hip 40° flexed and 30° adducted (inferred); the outside rotated to the inside's edge.
    const q = Array.from(motion.q[PEAK] ?? []);
    q[at('knee_flexion.L')] = 90 * DEG;
    q[at('hip_rotation.L')] = -15 * DEG;
    q[at('hip_flexion.L')] = 40 * DEG;
    q[at('hip_adduction.L')] = 30 * DEG;
    const inside = edgesOf(g0, q)[1];
    q[at('hip_rotation.R')] = root((r) => edgesOf(g0, q.with(at('hip_rotation.R'), r))[0] - inside, -60 * DEG, 60 * DEG);
    const [eo, ei] = edgesOf(g0, q);
    assert.closeTo(eo, ei, 1e-6);
    assert.isAbove(ei, 10 * DEG);
    // R tilted off the normal by that edge, in the goal's own lateral direction.
    const [rx, , rz] = g0.resultant;
    const h = Math.hypot(rx, rz);
    const g: SkiGoal = { ...g0, resultant: [(Math.sin(ei) * rx) / h, Math.cos(ei), (Math.sin(ei) * rz) / h] };
    assert.isAbove(insideHipRotation(g, q), 0);
    // The A-frame: inside femur 30° internal, inside ski flat by its adduction.
    const a = q.with(at('hip_rotation.L'), 30 * DEG);
    a[at('hip_adduction.L')] = root((d) => edgesOf(g, a.with(at('hip_adduction.L'), d))[1], -40 * DEG, 60 * DEG);
    assert.closeTo(edgesOf(g, a)[1], 0, 1e-6);
    assert.isBelow(insideHipRotation(g, a), 0);
  });

  it('distribute every frame of the turn within the activation bounds', () => {
    const frames = distributeTurn(motion);
    assert.strictEqual(frames.length, S);
    frames.forEach((f, k) => {
      assert.strictEqual(f.t, tp.goals[k]?.t);
      for (const m of f.muscles) assert.isTrue(m.a >= 0 && m.a <= MAX_ACTIVATION, `${k} ${m.muscle}.${m.side} ${m.a}`);
      for (const [j, v] of Object.entries(momentsAt(motion, k).nm)) assert.isTrue(Number.isFinite(v) && j in f.nm, `${k} ${j} carried`);
    });
  });
});
