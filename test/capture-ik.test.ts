import { assert, describe, it } from '@effect/vitest';
import { Dual } from '../src/solve/dual';
import { COORDINATES, REST_POSE } from '../src/viewer/skeleton';
import { forward, value } from '../src/viewer/motion/fk';
import { femurTwist } from '../src/viewer/motion/capture/calibrate';
import { ClearancePair, crossClearances } from '../src/viewer/motion/capture/clearance';
import { dot, mm, rotY } from '../src/viewer/motion/capture/geometry';
import { RHYTHM, lumbarShare, rhythmRatio } from '../src/viewer/motion/capture/rhythm';
import { butterworth2, filtfilt, matrixOf, quatOf } from '../src/viewer/motion/capture/signal';
import { fitPlane, fitSnow } from '../src/viewer/motion/capture/snow';
import type { V3n } from '../src/viewer/motion/capture/geometry';

const DEG = Math.PI / 180;
const FPS = 23.976;
const rotX = (t: number): number[] => [1, 0, 0, 0, Math.cos(t), -Math.sin(t), 0, Math.sin(t), Math.cos(t)];
const rotZ = (t: number): number[] => [Math.cos(t), -Math.sin(t), 0, Math.sin(t), Math.cos(t), 0, 0, 0, 1];
const sine = (hz: number, n: number): number[] => Array.from({ length: n }, (_, k) => Math.sin((2 * Math.PI * hz * k) / FPS));
const midAmplitude = (x: readonly number[]): number => Math.max(...x.slice(60, -60).map(Math.abs));

describe('zero-phase Butterworth', () => {
  const f = butterworth2(6, FPS);

  it('passes a constant unchanged, ends included', () => {
    for (const v of filtfilt(f, Array.from({ length: 30 }, () => 2.5))) assert.closeTo(v, 2.5, 1e-9);
  });

  it('halves the cutoff frequency (−3 dB each pass) and crushes the band near Nyquist', () => {
    assert.closeTo(midAmplitude(filtfilt(f, sine(6, 240))), 0.5, 0.03);
    // Prewarped bilinear response at 10 Hz: (1 + (tan(π·10/fs)/tan(π·6/fs))⁴)^−½ per pass.
    const ratio = Math.tan((Math.PI * 10) / FPS) / Math.tan((Math.PI * 6) / FPS);
    assert.closeTo(midAmplitude(filtfilt(f, sine(10, 240))), 1 / (1 + ratio ** 4), 0.01);
  });
});

describe('quaternions', () => {
  it('round-trips a rotation matrix', () => {
    const R = mm(mm(rotY(0.7), rotX(-1.1)), rotZ(2.9));
    matrixOf(quatOf(R)).forEach((v, i) => assert.closeTo(v, R[i] ?? 0, 1e-12));
  });
});

describe('snow plane', () => {
  const n: V3n = [Math.sin(0.2), Math.cos(0.2), 0];
  const on = (x: number, z: number, h = 0): V3n => [x * n[1] + n[0] * (1.3 + h), -x * n[0] + n[1] * (1.3 + h), z];

  it('recovers a tilted plane with its normal up', () => {
    const p = fitPlane([on(0, 0), on(1, 0), on(0, 1), on(-1, 2), on(0.5, -1)], [1, 1, 1, 1, 1]);
    assert.closeTo(dot(p.n, n), 1, 1e-9);
    assert.closeTo(p.d, 1.3, 1e-9);
  });

  it('drops a lifted foot from the stance, never both', () => {
    const foot = (x: number, h: number): V3n[] => [on(x, -0.1, h), on(x - 0.03, 0.15, h), on(x + 0.03, 0.15, h)];
    const soles = Array.from({ length: 9 }, (_, k) => [foot(-0.1, 0), foot(0.1, k === 4 ? 0.2 : 0)] as const);
    const { stance, planes } = fitSnow(soles, 2, 0.05);
    assert.deepStrictEqual(stance[4], [true, false]);
    assert.isTrue(stance.every((s, k) => k === 4 || (s[0] && s[1])));
    assert.closeTo(dot(planes[4]?.n ?? [0, 0, 0], n), 1, 1e-6);
  });
});

describe('femur twist calibration', () => {
  it('recovers the twist that makes the knee a pure hinge', () => {
    const theta = 17 * DEG;
    const femur = Array.from({ length: 40 }, (_, k) => mm(rotY(0.3 * Math.sin(k / 5)), rotX(-0.2 - 0.4 * Math.sin(k / 7))));
    const tibia = femur.map((F, k) => mm(mm(F, rotY(theta)), rotZ(-(0.3 + 0.6 * (0.5 + 0.5 * Math.sin(k / 4))))));
    const t = femurTwist(femur, tibia, rotY(0));
    assert.closeTo(t.theta, theta, 1e-4);
    assert.isBelow(t.after, 1e-6);
    assert.isAbove(t.before, 5 * DEG);
  });
});

describe('lumbo-pelvic rhythm', () => {
  it('interpolates the cited ratios at their bins', () => {
    assert.closeTo(rhythmRatio(RHYTHM.atEarly * DEG), RHYTHM.ratioEarly, 1e-12);
    assert.closeTo(rhythmRatio(RHYTHM.atLate * DEG), RHYTHM.ratioLate, 1e-12);
  });

  it('splits each increment by the local ratio, and its dual slope matches', () => {
    const t = 40 * DEG;
    const h = 1e-6;
    const slope = ((lumbarShare(t + h) as number) - (lumbarShare(t - h) as number)) / (2 * h);
    const r = rhythmRatio(t);
    assert.closeTo(slope, r / (1 + r), 1e-6);
    const d = lumbarShare(new Dual(t, Float64Array.of(1))) as Dual;
    assert.closeTo(d.v, lumbarShare(t) as number, 1e-12);
    assert.closeTo(d.d[0] ?? 0, slope, 1e-6);
    assert.strictEqual(lumbarShare(0), 0);
  });
});

describe('ski clearance', () => {
  const rest = forward(COORDINATES.map((c) => REST_POSE[c.name] ?? 0));

  it('is clear at rest', () => {
    for (const rows of Object.values(crossClearances(rest))) assert.isAbove(Math.min(...rows.map(value)), 0);
  });

  it('goes negative when the skis overlap', () => {
    const stacked = { ...rest, 'foot.L': rest['foot.R'], 'tibia.L': rest['tibia.R'] } as typeof rest;
    assert.isBelow(Math.min(...crossClearances(stacked)[ClearancePair.Skis].map(value)), 0);
  });
});
