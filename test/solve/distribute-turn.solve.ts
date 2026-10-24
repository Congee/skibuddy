// A live solve of the carved dynamic cell, about a minute: `bun run test:solve`, not `bun run check`.
import { assert, describe, it } from '@effect/vitest';
import { Intensity } from '../../src/content/schema';
import { imbalancesOf, MAX_ACTIVATION, RESIDUAL_SHARE } from '../../src/viewer/motion/distribute';
import type { DistributedFrame, MomentFrame, MuscleActivation } from '../../src/viewer/motion/distribute';
import { constantCaps, distributeTurn, momentsAt } from '../../src/viewer/motion/moments';
import { buildTurnProblem, seedFor, SeedKind, solveTurn } from '../../src/viewer/motion/turn';
import type { TurnMotion } from '../../src/viewer/motion/turn';
import { REFERENCE_SKIER } from '../../src/viewer/skier';

const FRAMES = 24;
const LONG = { timeout: 900_000 };

interface Solved {
  readonly motion: TurnMotion;
  readonly moments: ReadonlyArray<MomentFrame>;
  readonly frames: ReadonlyArray<DistributedFrame>;
  readonly peak: number;
}
let solved: Solved | undefined;
const turn = (): Solved => {
  if (solved !== undefined) return solved;
  const tp = buildTurnProblem('regular-gs', Intensity.Dynamic, { frames: FRAMES });
  const motion = solveTurn(tp, seedFor(tp, SeedKind.Prior));
  const S = tp.goals.length;
  solved = { motion, moments: tp.goals.map((_, k) => momentsAt(motion, k)), frames: distributeTurn(motion), peak: Math.round((tp.events?.forcePeak ?? 0) * S) % S };
  return solved;
};
const atPeak = (name: string): number => {
  const { moments, peak } = turn();
  return (moments[peak]?.nm[name] ?? NaN) / REFERENCE_SKIER.mass;
};
const saturated = (f: DistributedFrame): MuscleActivation[] => f.muscles.filter((m) => m.a >= MAX_ACTIVATION - 1e-9);
const top = (f: DistributedFrame | undefined, side: 'R' | 'L'): string =>
  (f?.muscles ?? [])
    .filter((m) => m.side === side)
    .toSorted((a, b) => b.a - a.a)
    .slice(0, 5)
    .map((m) => `${m.muscle} ${m.a.toFixed(2)} ${m.mode ?? '-'}`)
    .join(', ');

// heinrich-2022 at the outside force peak (R2's read-off), N·m/kg in skeleton.ts senses. Outside = R, heinrich's
// LEFT: leg moments are anatomical, so mirroring its right turn to our left one keeps their signs.
const BANDS = [
  { label: 'hip extension', name: 'hip_flexion.R', measured: -1.27 },
  { label: 'knee extension', name: 'knee_flexion.R', measured: -0.65 },
  { label: 'hip adduction', name: 'hip_adduction.R', measured: 0.1 },
  { label: 'hip external rotation', name: 'hip_rotation.R', measured: -0.17 },
  { label: 'ankle plantarflexion', name: 'ankle_dorsiflexion.R', measured: -0.5 },
  { label: 'lumbar extension', name: 'lumbar_flexion', measured: -1.88 },
] as const;
/** heinrich-2022's lateral bending at the force peak, N·m/kg; its side is not stated. */
const BENDING = 0.35;
/** motion-model.md §6.1: another skier and turn, inferred. */
const BAND = [0.5, 1.5] as const;
const within = (ratio: number): boolean => ratio >= BAND[0] && ratio <= BAND[1];

describe('regular-gs dynamic at the force peak against heinrich-2022', () => {
  it('solves', LONG, () => {
    const { result } = turn().motion;
    assert.isTrue(result.converged && result.feasible, 'converged and feasible');
  });

  for (const b of BANDS)
    it(`${b.label} within 0.5–1.5 × ${Math.abs(b.measured)} N·m/kg`, LONG, () => {
      const model = atPeak(b.name);
      assert.isTrue(within(model / b.measured), `${b.name} ${model.toFixed(3)} N·m/kg, ${(model / b.measured).toFixed(2)} × heinrich's ${b.measured}`);
    });

  it(`lumbar bending within 0.5–1.5 × ${BENDING} N·m/kg, either side`, LONG, () => {
    const model = atPeak('lumbar_bending');
    assert.isTrue(within(Math.abs(model) / BENDING), `lumbar_bending ${model.toFixed(3)} N·m/kg, ${(Math.abs(model) / BENDING).toFixed(2)} × ${BENDING}`);
  });

  it('ranks lumbar extension over bending over rotation', LONG, () => {
    const [e = NaN, b = NaN, r = NaN] = ['lumbar_flexion', 'lumbar_bending', 'lumbar_rotation'].map((n) => Math.abs(atPeak(n)));
    assert.isTrue(e > b && b > r, `extension ${e.toFixed(3)}, bending ${b.toFixed(3)}, rotation ${r.toFixed(3)} N·m/kg`);
  });
});

describe('regular-gs dynamic muscle distribution', () => {
  it('balances within 2 % every frame with no muscle at the bound', LONG, () => {
    const { frames } = turn();
    frames.forEach((f, k) => {
      if (saturated(f).length === 0) assert.isAtMost(f.residual, RESIDUAL_SHARE, `frame ${k}`);
    });
  });

  it('keeps a residual only where every agonist is at the bound, short of the demand', LONG, () => {
    const { moments, frames, peak } = turn();
    const worst = frames.reduce((w, f, k) => (f.residual > (frames[w]?.residual ?? 0) ? k : w), 0);
    console.log(
      [
        `worst residual ${frames[worst]?.residual.toFixed(3)} at frame ${worst}, saturated ${saturated(frames[worst] ?? { t: 0, muscles: [], nm: {}, residual: 0 })
          .map((m) => `${m.muscle}.${m.side}`)
          .join(', ')}`,
        `frames with a muscle at the bound: ${frames.filter((f) => saturated(f).length > 0).length} of ${frames.length}`,
        `force peak (frame ${peak}) R: ${top(frames[peak], 'R')}`,
        `force peak (frame ${peak}) L: ${top(frames[peak], 'L')}`,
      ].join('\n'),
    );
    const caps = constantCaps({ R: 0, L: 0 });
    const bad = frames.flatMap((f, k) => {
      const m = moments[k];
      return m === undefined ? [] : imbalancesOf(m, f, caps).map((b) => `${k} ${b.coordinate} ${b.demand.toFixed(1)} → ${b.got.toFixed(1)} N·m (${b.room.length} with room)`);
    });
    assert.isEmpty(bad, `${bad.length} coordinates: ${bad.slice(0, 10).join('; ')}`);
  });
});
