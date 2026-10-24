import { assert, describe, it } from '@effect/vitest';
import { distalOf, jointMoment, MAX_TORQUE, normalisedEffort } from '../src/viewer/motion/effort';
import { value } from '../src/viewer/motion/fk';

const nums = (v: ReadonlyArray<unknown>): number[] => v.map((x) => value(x as number));

describe('joint effort', () => {
  it('holds a horizontal two-segment arm against its weights and a tip load', () => {
    // Joint at the origin; 2 kg at 0.5 m, 1 kg at 1 m, 10 N up at 1.2 m, g down: hand-summed z moment.
    const m = jointMoment(
      [0, 0, 0],
      [
        { mass: 2, at: [0.5, 0, 0] },
        { mass: 1, at: [1, 0, 0] },
      ],
      [{ force: [0, 10, 0], at: [1.2, 0, 0] }],
      [0, -9.81, 0],
    );
    const [x = NaN, y = NaN, z = NaN] = nums(m);
    assert.closeTo(x, 0, 1e-12);
    assert.closeTo(y, 0, 1e-12);
    assert.closeTo(z, 2 * 9.81 * 0.5 + 9.81 - 12, 1e-12);
  });

  it('needs no moment when the load passes through the joint', () => {
    const m = nums(jointMoment([0, 1, 0], [], [{ force: [0, 700, 0], at: [0, 0, 0] }], [0, -9.81, 0]));
    for (const c of m) assert.closeTo(c, 0, 1e-12);
  });

  it('divides by the maximum in the force direction', () => {
    const [ext, flex] = MAX_TORQUE['knee_flexion'] ?? [NaN, NaN];
    assert.closeTo(value(normalisedEffort('knee_flexion.R', -ext)), -1, 1e-12);
    assert.closeTo(value(normalisedEffort('knee_flexion.L', flex)), 1, 1e-12);
    // anderson-2007 Table 3: knee extensors outpull the flexors.
    assert.isAbove(ext, flex);
  });

  it('takes a leg joint\'s distal chain', () => {
    assert.deepStrictEqual(distalOf('femur.R'), ['femur.R', 'tibia.R', 'foot.R']);
  });
});
