import { assert, describe, it } from '@effect/vitest';
import { Intensity } from '../src/content/schema';
import { checkJacobian } from '../src/solve/problem';
import { forward } from '../src/viewer/motion/fk';
import { buildTurnProblem, formatTurn, NAMES, seedFor, SeedKind, solveTurn, type TurnMotion } from '../src/viewer/motion/turn';
import { COORDINATES, forwardKinematics, REST_POSE } from '../src/viewer/skeleton';

const DEG = Math.PI / 180;
// Fewer frames than the bake's keep the file quick; the problem's shape is the same.
const FRAMES = 24;
const DRILLS = ['regular-cruising', 'regular-carving'] as const;

const solved = new Map<string, ReadonlyArray<TurnMotion>>();
const motions = (drill: string): ReadonlyArray<TurnMotion> => {
  const hit = solved.get(drill);
  if (hit !== undefined) return hit;
  const tp = buildTurnProblem(drill, Intensity.Moderate, { frames: FRAMES });
  const out = Object.values(SeedKind).map((k) => solveTurn(tp, seedFor(tp, k)));
  solved.set(drill, out);
  return out;
};
const first = (drill: string): TurnMotion => {
  const m = motions(drill)[0];
  if (m === undefined) throw new Error('no solve');
  return m;
};

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

  it('gives exact Jacobians in the turn blocks', () => {
    const tp = buildTurnProblem('regular-cruising', Intensity.Moderate, { frames: 4 });
    const x = seedFor(tp, SeedKind.Jitter);
    for (const b of tp.problem.blocks.filter((k) => k.name.endsWith(' 1'))) assert.isBelow(checkJacobian(b, Float64Array.from(b.vars, (v) => x[v] ?? 0)), 1e-5, b.name);
  });
});

describe('motion turn', () => {
  for (const drill of DRILLS) {
    describe(drill, () => {
      it('converges from three seeds to one q', { timeout: 120_000 }, () => {
        const [a, ...rest] = motions(drill);
        assert.isDefined(a);
        for (const m of [a, ...rest]) {
          assert.isTrue(m.result.converged, `${drill} converged`);
          assert.isTrue(m.result.feasible, `${drill} feasible`);
        }
        for (const m of rest) {
          const spread = m.result.x.reduce((s, v, i) => Math.max(s, Math.abs(v - (a?.result.x[i] ?? 0))), 0);
          assert.isBelow(spread, 1e-4, `${drill} seed spread`);
        }
      });

      it('keeps the outside ski on the snow at the physics edge', { timeout: 120_000 }, () => {
        const r = first(drill).report;
        assert.isBelow(r.outsideContact, 1e-3);
        assert.isAtLeast(r.lowestBase, -1e-3);
        assert.isBelow(r.edgeError, 0.5 * DEG);
      });

      it('stays within the joint limits', { timeout: 120_000 }, () => {
        const m = first(drill);
        assert.isAtMost(m.report.limitExcess, 1e-9);
        const { lower, upper } = m.problem;
        m.result.x.forEach((v, i) => {
          assert.isAtLeast(v, (lower[i] ?? -Infinity) - 1e-9, NAMES[i % NAMES.length]);
          assert.isAtMost(v, (upper[i] ?? Infinity) + 1e-9, NAMES[i % NAMES.length]);
        });
      });

      it('prints its diagnostics', { timeout: 120_000 }, () => {
        const text = formatTurn(first(drill));
        console.log(text);
        assert.include(text, 'outside contact');
        assert.include(text, 'why');
      });
    });
  }
});
