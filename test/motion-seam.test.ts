import { assert, describe, it } from '@effect/vitest';
import { Intensity } from '../src/content/schema';
import { forward, transform } from '../src/viewer/motion/fk';
import { buildTurnProblem, MIRROR, NAMES, seedFor, SeedKind, skiFrame } from '../src/viewer/motion/turn';
import { COORDINATES, Side } from '../src/viewer/skeleton';

const DEG = Math.PI / 180;
/** Metres: the skis' per-side gear fit leaves them ~30 µm off exact mirror images. */
const MIRROR_TOL = 1e-4;
const at = (name: string): number => NAMES.indexOf(name);
const tp = buildTurnProblem('regular-gs', Intensity.Dynamic, { frames: 4 });
const N = NAMES.length;
const block = tp.problem.blocks.find((b) => b.name === 'outside ski 0');
const goal = tp.goals[0];
const seed = Array.from(seedFor(tp, SeedKind.Prior).subarray(0, N));
const T = ['pelvis_tx', 'pelvis_ty', 'pelvis_tz'].map(at);
const ROOT = forward(COORDINATES.map(() => 0))['pelvis']?.p.map(Number) ?? [0, 0, 0];
const dot = (u: readonly number[], v: readonly number[]): number => u.reduce((s, x, j) => s + x * (v[j] ?? 0), 0);
/** The seam's mirror taken at goal 0: `MIRROR` pairs q with the mirrored goal, so the pelvis reflects across this goal's `across`. */
const mirrored = (q: readonly number[]): number[] => {
  const m = q.map((_, i) => (MIRROR.sign[i] ?? 1) * (q[MIRROR.perm[i] ?? i] ?? 0));
  const a = goal?.across ?? [1, 0, 0];
  const p = T.map((i, j) => (q[i] ?? 0) + (ROOT[j] ?? 0));
  const s = dot(p, a);
  T.forEach((i, j) => (m[i] = (p[j] ?? 0) - 2 * s * (a[j] ?? 0) - (ROOT[j] ?? 0)));
  return m;
};
const shifted = (q: readonly number[], d: Record<string, number>): number[] => q.map((v, i) => v + (d[NAMES[i] ?? ''] ?? 0));

/** The block's two pinning rows, along and across the path, at frame-0 coordinates `q`. */
const pins = (q: readonly number[]): [number, number] => {
  if (block === undefined) throw new Error('no outside ski 0');
  const r = new Float64Array(block.size);
  block.evaluate(Float64Array.from(block.vars, (v, j) => (j < N ? (q[j] ?? 0) : v)), r, null);
  return [r[block.size - 5] ?? NaN, r[block.size - 4] ?? NaN];
};

/** The two ski centres relative to the path point, by plain fk. */
const centres = (q: readonly number[]): [number[], number[]] => {
  if (goal === undefined) throw new Error('no goal 0');
  const w = forward(q.slice(0, COORDINATES.length), goal.origin, undefined, goal.ref);
  const rel = (s: Side): number[] => transform(skiFrame(w, s), tp.ski.centre).map((v, j) => Number(v) - (goal.origin[j] ?? 0));
  return [rel(Side.Right), rel(Side.Left)];
};

describe('outside ski pinning at the seam', () => {
  it('is mirror-invariant: along equal, across negated', () => {
    assert.deepEqual(block?.vars.slice(0, N), Int32Array.from({ length: N }, (_, i) => i), 'frame 0 is unmirrored');
    const qs = [
      seed,
      shifted(seed, { 'hip_adduction.R': 10 * DEG, pelvis_tx: 0.1 }),
      shifted(seed, { 'hip_adduction.L': -10 * DEG, pelvis_tx: -0.1 }),
    ];
    qs.forEach((q, n) => {
      const [along, across] = pins(q);
      const [alongM, acrossM] = pins(mirrored(q));
      assert.approximately(alongM, along, MIRROR_TOL, `q ${n} along`);
      assert.approximately(acrossM, -across, MIRROR_TOL, `q ${n} across`);
    });
  });

  it('holds the stance centre, not the outside ski, on the path point', () => {
    if (goal === undefined) throw new Error('no goal 0');
    // A mirror-symmetric pose, translated so the skis' midpoint lands on the path point.
    const sym = seed.map((v, i) => (v + (mirrored(seed)[i] ?? 0)) / 2);
    const [c, ci] = centres(sym);
    const q = shifted(sym, Object.fromEntries(['pelvis_tx', 'pelvis_ty', 'pelvis_tz'].map((n, j) => [n, -((c[j] ?? 0) + (ci[j] ?? 0)) / 2])));
    const [o, i] = centres(q);
    assert.approximately(dot(o, goal.forward), dot(i, goal.forward), MIRROR_TOL, 'skis level along');
    assert.approximately(dot(o, goal.across), -dot(i, goal.across), MIRROR_TOL, 'skis mirrored across');
    assert.isAbove(Math.abs(dot(o, goal.across)), 0.05, 'the outside ski is off the path point');
    pins(q).forEach((r, j) => assert.approximately(r, 0, 1e-9, `row ${j}`));
  });
});
