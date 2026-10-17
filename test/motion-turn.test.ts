import { assert, describe, it } from '@effect/vitest';
import { INTENSITIES, Intensity } from '../src/content/schema';
import { checkJacobian } from '../src/solve/problem';
import { forward } from '../src/viewer/motion/fk';
import { MIGRATED, Q_FRAMES, qTable, STORED_Q } from '../src/viewer/motion/q-table';
import { buildTurnProblem, centreOfMassOf, LEG_LENGTH, NAMES, reportOf, seedFor, SeedKind, solveTurn } from '../src/viewer/motion/turn';
import { EQUIPMENT } from '../src/viewer/equipment';
import { COORDINATES, forwardKinematics, REST_POSE, SKELETON_DATA, Side } from '../src/viewer/skeleton';
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

  it('gives exact Jacobians in the turn blocks', () => {
    const tp = buildTurnProblem('regular-cruising', Intensity.Moderate, { frames: 4 });
    const x = seedFor(tp, SeedKind.Jitter);
    for (const b of tp.problem.blocks.filter((k) => k.name.endsWith(' 1'))) assert.isBelow(checkJacobian(b, Float64Array.from(b.vars, (v) => x[v] ?? 0)), 1e-5, b.name);
  });
});

describe('motion turn, live', () => {
  it('converges from three seeds to one q on a short cruising turn', { timeout: 60_000 }, () => {
    const tp = buildTurnProblem('regular-cruising', Intensity.Moderate, { frames: 12 });
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
