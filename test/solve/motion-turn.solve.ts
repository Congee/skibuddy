// Live whole-turn solves of every regular drill, three seeds each: minutes, so `bun run test:solve`, not `bun run check`.
import { assert, describe, it } from '@effect/vitest';
import { Intensity } from '../../src/content/schema';
import { forward } from '../../src/viewer/motion/fk';
import { buildTurnProblem, centreOfMassOf, formatTurn, LEG_LENGTH, NAMES, seedFor, SeedKind, solveTurn, type TurnMotion } from '../../src/viewer/motion/turn';
import { edgeGoalAt } from '../../src/physics/edge';
import { TurnKind } from '../../src/physics/task';
import { kindOfDrill } from '../../src/viewer/poses/regular-turn';
import { EQUIPMENT } from '../../src/viewer/equipment';
import { COORDINATES, REST_POSE, SKELETON_DATA, Side } from '../../src/viewer/skeleton';

const DEG = Math.PI / 180;
// Fewer frames than the bake's keep the file quick; the problem's shape is the same.
const FRAMES = 24;
// One cell per kind: GS, SL, Steered, Moguls.
const DRILLS = ['regular-gs', 'regular-sl', 'regular-steered', 'regular-moguls'] as const;
/** Mogul pelvis list ceiling, degrees; inferred (docs/motion-model.md moguls row). */
const MOGUL_LIST = 10;
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
    describe(`${kindOfDrill(drill)} (${drill})`, () => {
      it('converges from three seeds to one q', { timeout: 900_000 }, () => {
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

      it('holds the counter inside its band while loaded', { timeout: 120_000 }, () => {
        assert.isAtMost(Math.max(...first(drill).report.counterExcess), 0.5 * DEG);
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

      if (kindOfDrill(drill) === TurnKind.GS) {
        it('carves the sidecut arc and flexes the inside knee more at the force peak', { timeout: 120_000 }, () => {
          const m = first(drill);
          const { kind, task, events } = m.problem;
          if (kind === null || task === null || events === null) throw new Error('no kind');
          const peak = m.report.atEvents?.forcePeak;
          if (peak === undefined) throw new Error('no force peak');
          const goal = edgeGoalAt(task, events.forcePeak).radiusM;
          assert.isBelow(Math.abs(peak.skiRadius / goal - 1), 0.05, 'r_ski vs the profile radius');
          // heinrich-2022: inside knee 10–40° more flexed than the outside.
          const d = (peak.insideKnee - peak.outsideKnee) / DEG;
          assert.isAtLeast(d, 10);
          assert.isAtMost(d, 40);
        });
      }

      if (kindOfDrill(drill) === TurnKind.Moguls) {
        it('keeps the pelvis level and straighter than the skis', { timeout: 120_000 }, () => {
          const m = first(drill);
          for (const v of m.report.pelvisList) assert.isAtMost(Math.abs(v) / DEG, MOGUL_LIST);
          const skis = Math.max(...m.problem.goals.map((g) => Math.abs(Math.atan2(g.forward[0] ?? 0, g.forward[2] ?? 1))));
          const pelvis = Math.max(...m.report.pelvisToFall.map(Math.abs));
          assert.isBelow(pelvis, skis);
        });
      }

      it('prints its diagnostics', { timeout: 120_000 }, () => {
        const text = formatTurn(first(drill));
        console.log(text);
        assert.include(text, 'outside contact');
        assert.include(text, 'why');
      });
    });
  }
});
