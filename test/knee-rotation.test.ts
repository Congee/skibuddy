import { assert, describe, it } from '@effect/vitest';
import { JOINT_LIMITS, KNEE_INTERNAL_SHARE, KNEE_ROTATION_ARC, kneeRotationLimit } from '../src/viewer/joint-limits';
import { compose, multiply, rotationZ, translation } from '../src/viewer/mat4';
import { NAMES } from '../src/viewer/motion/turn';
import { Q_SCALE, decodeQ } from '../src/viewer/motion/q-table';
import { REST_POSE, Side, forwardKinematics, restWorld, rigidInverse } from '../src/viewer/skeleton';

const DEG = Math.PI / 180;
const SIDES = [Side.Right, Side.Left] as const;
const span = (f: number): readonly [number, number] => {
  const l = kneeRotationLimit(f * DEG);
  return [-l.lower.value / DEG, l.upper.value / DEG];
};

describe('knee rotation limit', () => {
  it('widens with flexion within each source and sits inside the static bound', () => {
    // puah-2018's rows rise to 45°, mossberg-1983's from 70°; 45→60 falls in puah's own table.
    for (const [a, b] of [[0, 45], [70, 110]] as const)
      for (let f = a; f < b; f += 5) {
        const [e0, i0] = span(f);
        const [e1, i1] = span(f + 5);
        assert.isAtLeast(e1, e0, `external ${f}`);
        assert.isAtLeast(i1, i0, `internal ${f}`);
      }
    const bound = JOINT_LIMITS['knee_rotation.R'];
    assert.isDefined(bound);
    for (let f = 0; f <= 150; f += 5) {
      const l = kneeRotationLimit(f * DEG);
      assert.isBelow(l.lower.value, 0);
      assert.isAbove(l.upper.value, 0);
      assert.closeTo(l.upper.value / (l.upper.value - l.lower.value), KNEE_INTERNAL_SHARE, 1e-12);
      assert.isAtLeast(l.lower.value, (bound?.lower.value ?? 0) - 1e-12);
      assert.isAtMost(l.upper.value, (bound?.upper.value ?? 0) + 1e-12);
    }
    assert.deepEqual(span(200), span(KNEE_ROTATION_ARC[KNEE_ROTATION_ARC.length - 1]?.[0] ?? 0));
  });
});

describe('knee rotation in FK', () => {
  it('at 0 leaves the tibia exactly on the hinge alone', () => {
    for (const s of SIDES) {
      const q = { ...REST_POSE, [`hip_flexion.${s}`]: 40 * DEG, [`hip_rotation.${s}`]: 7 * DEG, [`knee_flexion.${s}`]: 70 * DEG, [`knee_rotation.${s}`]: 0 };
      const fk = forwardKinematics(q);
      const femur = fk[`femur.${s}`];
      assert.isDefined(femur);
      const local = multiply(rigidInverse(restWorld(`femur.${s}`)), restWorld(`tibia.${s}`));
      const joint = translation([local[12] ?? 0, local[13] ?? 0, local[14] ?? 0]);
      local[12] = local[13] = local[14] = 0;
      const hinge = rotationZ(-((q[`knee_flexion.${s}`] ?? 0) - (REST_POSE[`knee_flexion.${s}`] ?? 0)));
      assert.deepEqual(Array.from(fk[`tibia.${s}`] ?? []), Array.from(compose(femur ?? new Float32Array(16), joint, hinge, local)));
    }
  });

  it('turns the flexed knee’s toes toward the midline when internal', () => {
    for (const s of SIDES) {
      const toesAcross = (rot: number): number => {
        const fk = forwardKinematics({ ...REST_POSE, [`knee_flexion.${s}`]: 60 * DEG, [`knee_rotation.${s}`]: rot * DEG });
        const [foot, pelvis] = [fk[`foot.${s}`], fk['pelvis']];
        // The foot's anterior axis on the pelvis's rightward axis.
        return (foot?.[0] ?? 0) * (pelvis?.[8] ?? 0) + (foot?.[1] ?? 0) * (pelvis?.[9] ?? 0) + (foot?.[2] ?? 0) * (pelvis?.[10] ?? 0);
      };
      const toward = s === Side.Right ? -1 : 1;
      assert.isAbove(toward * (toesAcross(10) - toesAcross(0)), 0.1, s);
      assert.isBelow(toward * (toesAcross(-10) - toesAcross(0)), -0.1, s);
    }
  });
});

describe('stored q-tables', () => {
  it('load a row stored before knee_rotation with the coordinate at 0', () => {
    const old = NAMES.filter((n) => !n.startsWith('knee_rotation.'));
    const values = Int16Array.from(old, (_, i) => (i % 7) * 100 - 300);
    let text = '';
    for (const b of new Uint8Array(values.buffer)) text += String.fromCharCode(b);
    const [row] = decodeQ(btoa(text), old);
    assert.isDefined(row);
    NAMES.forEach((n, i) => {
      const j = old.indexOf(n);
      assert.strictEqual(row?.[i], j < 0 ? 0 : (values[j] ?? 0) * Q_SCALE, n);
    });
    assert.isTrue(NAMES.some((n) => n.startsWith('knee_rotation.')));
  });
});
