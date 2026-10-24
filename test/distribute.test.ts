import { assert, describe, it } from '@effect/vitest';
import { Contraction } from '../src/content/schema';
import type { MuscleId } from '../src/content/schema';
import { LEG_CAPACITIES, legCapacitiesAt } from '../src/viewer/motion/capacities';
import type { Capacity } from '../src/viewer/motion/capacities';
import { ARM_CAPACITIES, TRUNK_CAPACITIES } from '../src/viewer/motion/capacities-trunk';
import { distributeFrame, effortOfActivation, groupActivation, imbalancesOf, MAX_ACTIVATION, modeOf, RHO_KNEE } from '../src/viewer/motion/distribute';
import type { DistributedFrame, Imbalance, MuscleActivation } from '../src/viewer/motion/distribute';

const toy = (muscle: string, coordinate: string, nm: number): Capacity => ({
  muscle: muscle as MuscleId,
  coordinate,
  nm,
  fmaxN: Math.abs(nm),
  armM: Math.sign(nm),
  scale: 1,
  basis: 'inferred',
  sources: [],
  note: 'toy',
});

const find = (f: DistributedFrame, muscle: string, side: 'R' | 'L' = 'R'): MuscleActivation => {
  const m = f.muscles.find((x) => x.muscle === muscle && x.side === side);
  if (m === undefined) throw new Error(`no ${muscle}.${side}`);
  return m;
};

const weightOf = (m: string): number => LEG_CAPACITIES.reduce((s, c) => (c.muscle === m ? s + Math.abs(c.nm) : s), 0);
const swap = (o: Record<string, number>): Record<string, number> => Object.fromEntries(Object.entries(o).map(([k, v]) => [k.replace(/\.R$/, '.L'), v]));
const outside = (f: DistributedFrame): MuscleActivation[] =>
  f.muscles.filter((m) => m.side === 'R' && LEG_CAPACITIES.some((c) => c.muscle === m.muscle)).toSorted((a, b) => b.a - a.a);
const text = (ms: ReadonlyArray<MuscleActivation>): string => ms.map((m) => `${m.muscle}.${m.side} ${m.a.toFixed(3)}`).join(', ');
const shown = (bad: ReadonlyArray<Imbalance>): string => bad.map((b) => `${b.coordinate} ${b.demand.toFixed(1)} → ${b.got.toFixed(1)} N·m, room ${text(b.room)}`).join('; ');

/** A one-muscle frame at activation `a` on a −100 N·m knee-extensor toy. */
const fake = (a: number): DistributedFrame => ({ t: 0, muscles: [{ muscle: 'k' as MuscleId, side: 'R', a, mode: null }], nm: { 'knee_flexion.R': -100 * a }, residual: 0 });
const KNEE_AGONISTS = [toy('a1', 'knee_flexion', -200), toy('a2', 'knee_flexion', -100)];
const M_KNEE = -60;

describe('muscle distribution', () => {
  it('shares one joint moment in proportion to capacity', () => {
    const f = distributeFrame({ t: 0, nm: { 'knee_flexion.R': M_KNEE } }, {}, KNEE_AGONISTS);
    const [a1, a2] = [find(f, 'a1').a, find(f, 'a2').a];
    // Least squared activation: a ∝ C, so activations 2:1 and moment shares 4:1.
    assert.closeTo(a1 / a2, 2, 1e-9);
    assert.closeTo((a1 * 200) / (a2 * 100), 4, 1e-9);
    assert.closeTo(-200 * a1 - 100 * a2, M_KNEE, 1e-6);
    assert.isAtMost(f.residual, 0.02);
    assert.strictEqual(find(f, 'a1', 'L').a, 0);
  });

  it('floors the antagonist and raises the agonists to keep the balance', () => {
    const alone = distributeFrame({ t: 0, nm: { 'knee_flexion.R': M_KNEE } }, {}, KNEE_AGONISTS);
    const modes = { 'knee_flexion.R': Contraction.Concentric };
    const f = distributeFrame({ t: 0, nm: { 'knee_flexion.R': M_KNEE } }, modes, [...KNEE_AGONISTS, toy('h', 'knee_flexion', 150)]);
    const [a1, a2, h] = [find(f, 'a1'), find(f, 'a2'), find(f, 'h')];
    assert.closeTo(h.a, RHO_KNEE * find(alone, 'a1').a, 1e-9);
    assert.isAbove(a1.a, find(alone, 'a1').a);
    assert.isAbove(a2.a, find(alone, 'a2').a);
    assert.closeTo(-200 * a1.a - 100 * a2.a + 150 * h.a, M_KNEE, 1e-6);
    assert.isAtMost(f.residual, 0.02);
    // The loaded group shortens, so the antagonist lengthens.
    assert.strictEqual(a1.mode, Contraction.Concentric);
    assert.strictEqual(h.mode, Contraction.Eccentric);
  });

  it('maps activation to the effort bands of biomechanics.md 0.3', () => {
    assert.strictEqual(effortOfActivation(0), 0);
    assert.closeTo(effortOfActivation(0.05), 0.5, 1e-12);
    assert.closeTo(effortOfActivation(0.2), 1.5, 1e-12);
    assert.closeTo(effortOfActivation(0.5), 2.5, 1e-12);
    assert.closeTo(effortOfActivation(1), 3, 1e-12);
    assert.strictEqual(effortOfActivation(1.4), 3);
  });

  it('weights a group by its parts\' capacities', () => {
    const parts: MuscleActivation[] = [
      { muscle: 'vasti' as MuscleId, side: 'R', a: 0.6, mode: null },
      { muscle: 'rectus-femoris' as MuscleId, side: 'R', a: 0.2, mode: null },
    ];
    const expected = (weightOf('vasti') * 0.6 + weightOf('rectus-femoris') * 0.2) / (weightOf('vasti') + weightOf('rectus-femoris'));
    assert.closeTo(groupActivation(parts, LEG_CAPACITIES), expected, 1e-12);
  });

  it('reads the mode from a sinusoid', () => {
    const q = Array.from({ length: 48 }, (_, i) => 0.5 * Math.sin((2 * Math.PI * i) / 48));
    assert.strictEqual(modeOf(q, 0, 50, 1.2), Contraction.Concentric);
    assert.strictEqual(modeOf(q, 24, 50, 1.2), Contraction.Eccentric);
    assert.strictEqual(modeOf(q, 0, -50, 1.2), Contraction.Eccentric);
    assert.strictEqual(modeOf(q, 12, 50, 1.2), Contraction.Isometric);
    assert.isNull(modeOf(q, 0, 0.5, 1.2));
    // Peak speed 0.01 · 2π / 1.2 s ≈ 3°/s, under the isometric threshold.
    const slow = q.map((v) => v / 50);
    for (let i = 0; i < 48; i++) assert.strictEqual(modeOf(slow, i, 50, 1.2), Contraction.Isometric);
  });

  it('mirrors: swapped sides give swapped activations', () => {
    const caps = [...LEG_CAPACITIES, ...TRUNK_CAPACITIES, ...ARM_CAPACITIES];
    const right = { 'hip_flexion.R': -40, 'knee_flexion.R': -30, 'hip_adduction.R': -10, 'ankle_dorsiflexion.R': -15, 'shoulder_flexion.R': 5 };
    const trunk = { lumbar_flexion: -40, thoracic_flexion: -30, lumbar_bending: -15, thoracic_bending: -10, lumbar_rotation: 4 };
    // Bending right and rotation left are positive on both copies, so the mirror flips them.
    const mirrored = Object.fromEntries(Object.entries(trunk).map(([k, v]) => [k, /_(bending|rotation)$/.test(k) ? -v : v]));
    const f = distributeFrame({ t: 0, nm: { ...right, ...trunk } }, {}, caps);
    const g = distributeFrame({ t: 0, nm: { ...swap(right), ...mirrored } }, {}, caps);
    assert.isAtMost(f.residual, 0.02);
    for (const m of f.muscles) assert.closeTo(find(g, m.muscle, m.side === 'R' ? 'L' : 'R').a, m.a, 1e-6, `${m.muscle}.${m.side}`);
  });

  it('leaves an omitted coordinate free', () => {
    // One muscle extending both knee and hip: holding the hip at zero costs the knee its balance.
    const caps = [toy('b', 'knee_flexion', -100), toy('b', 'hip_flexion', -50)];
    const free = distributeFrame({ t: 0, nm: { 'knee_flexion.R': -30 } }, {}, caps);
    const held = distributeFrame({ t: 0, nm: { 'knee_flexion.R': -30, 'hip_flexion.R': 0 } }, {}, caps);
    assert.closeTo(find(free, 'b').a, 0.3, 1e-6);
    assert.isBelow(free.residual, 1e-6);
    assert.notProperty(free.nm, 'hip_flexion.R');
    assert.strictEqual(find(free, 'b', 'L').a, 0);
    assert.closeTo(find(held, 'b').a, 3000 / 12500, 1e-6);
    assert.closeTo(held.residual, Math.sqrt(36 + 144) / 30, 1e-6);
  });

  it('applies a row suffixed .R to the right side only', () => {
    const caps = [toy('r', 'knee_flexion.R', -100), toy('both', 'knee_flexion', -100)];
    const f = distributeFrame({ t: 0, nm: { 'knee_flexion.R': -60, 'knee_flexion.L': -60 } }, {}, caps);
    assert.closeTo(find(f, 'r').a, 0.3, 1e-6);
    assert.closeTo(find(f, 'both').a, 0.3, 1e-6);
    assert.closeTo(find(f, 'both', 'L').a, 0.6, 1e-6);
    assert.isUndefined(f.muscles.find((m) => m.muscle === 'r' && m.side === 'L'));
  });

  it('flags a residual an agonist below the bound could close, or one past the demand', () => {
    const caps = [toy('k', 'knee_flexion', -100)];
    const short = { t: 0, nm: { 'knee_flexion.R': -200 } };
    assert.isEmpty(imbalancesOf(short, distributeFrame(short, {}, caps), caps));
    assert.deepStrictEqual(imbalancesOf(short, fake(1), caps).map((b) => b.coordinate), ['knee_flexion.R']);
    assert.deepStrictEqual(imbalancesOf({ t: 0, nm: { 'knee_flexion.R': -100 } }, fake(MAX_ACTIVATION), caps).map((b) => b.coordinate), ['knee_flexion.R']);
  });
});

describe('heinrich-2022 force peak, 70 kg', () => {
  // The outside hip is ~79° flexed at the force peak (R2): one posture, so one array.
  const caps = [...legCapacitiesAt(79), ...TRUNK_CAPACITIES, ...ARM_CAPACITIES];
  const KG = 70;
  // Outside leg = R (heinrich's LEFT). Extension, abduction, external rotation and plantarflexion are the negative
  // senses (skeleton.ts); heinrich's hip rotation is + internal too, so its −0.17 is an external-rotation moment.
  const leg = { 'hip_flexion.R': -1.27 * KG, 'knee_flexion.R': -0.65 * KG, 'hip_adduction.R': 0.1 * KG, 'hip_rotation.R': -0.17 * KG, 'ankle_dorsiflexion.R': -0.5 * KG };
  // heinrich's one lumbar joint (+1.88 extension = our −1.88) carries the spine, so the thoracic coordinates stay
  // free. Bending side not stated by the source: toward the inside (left), inferred. Its −0.1 rotation, toward the
  // inside of a right turn, is +0.1 (left) in our left turn.
  const trunk = { lumbar_flexion: -1.88 * KG, lumbar_bending: -0.35 * KG, lumbar_rotation: 0.1 * KG };

  it('balances the outside leg with a gluteus or quadriceps part on top', () => {
    const moments = { t: 0, nm: leg };
    const f = distributeFrame(moments, {}, caps);
    for (const m of f.muscles) assert.isTrue(m.a >= 0 && m.a <= MAX_ACTIVATION, `${m.muscle}.${m.side} ${m.a}`);
    const bad = imbalancesOf(moments, f, caps);
    assert.isEmpty(bad, `residual ${f.residual.toFixed(3)}: ${shown(bad)}`);
    const top = outside(f);
    // heinrich-2023 and hintermeister-1997 name gluteus maximus and the vasti as the outside leg's prime movers.
    assert.include(['gluteus-maximus', 'gluteus-medius', 'gluteus-minimus', 'vasti', 'rectus-femoris'], top[0]?.muscle, `largest: ${text(top.slice(0, 5))}`);
  });

  it('distributes the whole frame within bounds, any residual left at saturated agonists', () => {
    const moments = { t: 0, nm: { ...leg, ...trunk } };
    const f = distributeFrame(moments, {}, caps);
    for (const m of f.muscles) assert.isTrue(m.a >= 0 && m.a <= MAX_ACTIVATION, `${m.muscle}.${m.side} ${m.a}`);
    const trunkTop = text(f.muscles.filter((m) => TRUNK_CAPACITIES.some((c) => c.muscle === m.muscle)).toSorted((a, b) => b.a - a.a).slice(0, 6));
    const bad = imbalancesOf(moments, f, caps);
    assert.isEmpty(bad, `residual ${f.residual.toFixed(3)}: ${shown(bad)}; trunk ${trunkTop}`);
  });
});
