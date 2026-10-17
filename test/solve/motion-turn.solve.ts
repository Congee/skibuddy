// Live whole-turn solves of every regular drill, three seeds each: minutes, so `bun run test:solve`, not `bun run check`.
import { assert, describe, it } from '@effect/vitest';
import { Intensity } from '../../src/content/schema';
import { forward } from '../../src/viewer/motion/fk';
import { buildTurnProblem, centreOfMassOf, formatTurn, LEG_LENGTH, NAMES, seedFor, SeedKind, solveTurn, type TurnMotion } from '../../src/viewer/motion/turn';
import { EQUIPMENT } from '../../src/viewer/equipment';
import { COORDINATES, REST_POSE, SKELETON_DATA, Side } from '../../src/viewer/skeleton';

const DEG = Math.PI / 180;
// Fewer frames than the bake's keep the file quick; the problem's shape is the same.
const FRAMES = 24;
const DRILLS = ['regular-cruising', 'regular-carving', 'regular-short-turns'] as const;
/** Standing tall at rest: base to CoM in leg lengths, the most a flexed skier can reach. */
const STANDING = (() => {
  const com = centreOfMassOf(forward(COORDINATES.map((c) => REST_POSE[c.name] ?? 0))).map(Number);
  return ((com[1] ?? 0) - SKELETON_DATA.gear_fit[Side.Right].sole + EQUIPMENT.standHeight) / LEG_LENGTH;
})();
/** Deepest CoM a regular turn keeps, leg lengths; inferred sanity floor (no recreational CoM height read). */
const CROUCH = 0.6;

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

      it('keeps both skis on the snow, balanced over the pressure centre', { timeout: 120_000 }, () => {
        const r = first(drill).report;
        assert.isBelow(r.insideContact, 1e-3);
        assert.isBelow(r.balance, 0.5 * DEG);
      });

      it('keeps boots and skis apart', { timeout: 120_000 }, () => {
        const r = first(drill).report;
        assert.isAtLeast(r.bootClearance, -1e-6);
        assert.isAtLeast(r.skiClearance, -1e-6);
      });

      it('lets the CoM height emerge between a crouch and standing tall', { timeout: 120_000 }, () => {
        const [lo, hi] = first(drill).report.comHeight;
        assert.isAbove(lo, CROUCH);
        assert.isBelow(hi, STANDING);
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
