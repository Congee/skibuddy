import { describe, expect, it } from 'vitest';
import { figureBody, projectBody, segmentLengths } from '../scripts/capture/gate-body';
import type { ObsFrame, PoseFrame } from '../scripts/capture/gate-body';
import { project } from '../scripts/capture/gate-math';
import { gateFrame } from '../scripts/capture/gates';
import { segmentWorlds } from '../src/prototypes/capture/data';
import { overlayFrame, threeView } from '../src/prototypes/capture/overlay';
import type { Kp } from '../src/prototypes/capture/overlay';

// A crouched frame seen by reilly's frame-45 gate camera (rounded).
const POSE: PoseFrame = {
  t: 0,
  q: { 'knee_flexion.L': 95, 'knee_flexion.R': 80, 'hip_flexion.L': 70, 'hip_flexion.R': 60 },
  pelvis: { pos: [0.1, 0.75, -0.2], quat: [0, Math.sin(0.3), 0, Math.cos(0.3)] },
};
const LIMBS = { thigh: 0.948, shin: 1.118 };
const CAM = {
  K: [2202.907, 2202.907, 950, 552],
  w2c: { R: [-0.9999197, 0.0044475, -0.0118706, -0.0020484, -0.9808141, -0.1949345, -0.0125098, -0.1948945, 0.9807444], t: [0.23245, 0.62124, 4.54428] as [number, number, number] },
};
const SIZE = [1920, 1080] as const;

const body = figureBody(POSE, segmentLengths(LIMBS));
const truth = projectBody(body, CAM);
// Keypoints off the model by known, joint-specific amounts.
const COCO_NAMES = ['nose', '', '', '', '', 'shoulder.L', 'shoulder.R', 'elbow.L', 'elbow.R', 'wrist.L', 'wrist.R', 'hip.L', 'hip.R', 'knee.L', 'knee.R', 'ankle.L', 'ankle.R'];
const kp2d = COCO_NAMES.map((n, i): [number, number, number] => {
  const p = truth.joints[n];
  return p === undefined ? [0, 0, 0] : [p[0] + 3 * i, p[1] - 2 * i, 0.9];
});
const OBS: ObsFrame = { ...CAM, kp2d, joints: body.joints as Record<string, [number, number, number]>, pelvis: body.pelvis, ski: { L: body.ski.L.R, R: body.ski.R.R } };
const SEG = { skis: { L: { tip: [600, 700] as [number, number], tail: [1400, 760] as [number, number], conf: 0.9 }, R: { tip: [610, 690] as [number, number], tail: [1380, 740] as [number, number], conf: 0.9 } } };

describe('capture overlay projection', () => {
  const gates = gateFrame(body, OBS, SEG, [body]);
  const view = overlayFrame(POSE, LIMBS, OBS, null);

  it('scores the same per-joint 2D error as the joints2d gate', () => {
    const per = ((gates.joints2d?.detail ?? {}) as { perJoint?: Record<string, number> }).perJoint ?? {};
    expect(Object.keys(per).length).toBe(12);
    for (const e of view.vitpose) expect(Math.abs(e.torso - (per[e.joint] ?? Number.NaN))).toBeLessThanOrEqual(0.0005 + 1e-9);
    expect(view.vitpose.length).toBe(12);
  });

  it('draws the figure skis where the skiHeading gate measures them', () => {
    const fig = ((gates.skiHeading?.detail ?? {}) as { figure?: Record<'L' | 'R', { tip: [number, number]; tail: [number, number] }> }).figure;
    expect(fig).toBeDefined();
    for (const s of ['L', 'R'] as const)
      for (const end of ['tip', 'tail'] as const)
        for (const k of [0, 1]) expect(Math.abs((view.projected.skis[s][end][k] ?? Number.NaN) - (fig?.[s][end][k] ?? Number.NaN))).toBeLessThanOrEqual(0.05 + 1e-9);
  });

  it('poses the mesh skeleton with the fitted limb lengths the gates use', () => {
    const w = segmentWorlds(POSE, LIMBS);
    const at = (seg: string): number[] => [12, 13, 14].map((i) => w[seg]?.[i] ?? Number.NaN);
    for (const s of ['L', 'R'] as const) {
      expect(at(`tibia.${s}`).map((v, i) => Math.abs(v - (body.joints[`knee.${s}`]?.[i] ?? 0))).reduce((a, b) => Math.max(a, b))).toBeLessThan(1e-5);
      expect(at(`foot.${s}`).map((v, i) => Math.abs(v - (body.joints[`ankle.${s}`]?.[i] ?? 0))).reduce((a, b) => Math.max(a, b))).toBeLessThan(1e-5);
    }
    const template = segmentWorlds(POSE);
    expect(Math.abs((template['foot.L']?.[13] ?? 0) - (w['foot.L']?.[13] ?? 0))).toBeGreaterThan(0.01);
  });

  it('builds a three.js camera that reproduces the pinhole', () => {
    const v = threeView(CAM, SIZE);
    const [x, y, z, w] = v.quat;
    // Rotation columns of the quaternion: three's camera axes in the world.
    const Q = [
      [1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)],
      [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)],
      [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)],
    ];
    const f = SIZE[1] / (2 * Math.tan((v.fovY * Math.PI) / 360));
    for (const X of Object.values(body.joints)) {
      const d = [0, 1, 2].map((i) => (X[i] ?? 0) - (v.pos[i] ?? 0));
      const c = [0, 1, 2].map((j) => (Q[0]?.[j] ?? 0) * (d[0] ?? 0) + (Q[1]?.[j] ?? 0) * (d[1] ?? 0) + (Q[2]?.[j] ?? 0) * (d[2] ?? 0));
      const u = ((c[0] ?? 0) / -(c[2] ?? 1)) * f + SIZE[0] / 2 - v.offset[0];
      const vv = (-(c[1] ?? 0) / -(c[2] ?? 1)) * f + SIZE[1] / 2 - v.offset[1];
      const p = project(CAM.K, { R: CAM.w2c.R, p: CAM.w2c.t }, X);
      // R is rounded to 7 digits, so not exactly a rotation.
      expect(Math.abs(u - p[0])).toBeLessThan(1e-3);
      expect(Math.abs(vv - p[1])).toBeLessThan(1e-3);
    }
  });

  it('reads RTMW keypoints by name against the same projection', () => {
    const rt: Record<string, Kp> = { left_knee: [10, 20, 4], left_shoulder: [0, 0, 4], right_shoulder: [0, 0, 4], left_hip: [0, 100, 4], right_hip: [0, 100, 4] };
    const o = overlayFrame(POSE, LIMBS, OBS, rt);
    const k = truth.joints['knee.L'] ?? [0, 0];
    const e = o.rtmw.find((x) => x.joint === 'knee.L');
    expect(e?.px).toBeCloseTo(Math.hypot(k[0] - 10, k[1] - 20), 9);
    expect(e?.torso).toBeCloseTo((e?.px ?? 0) / 100, 9);
  });
});
