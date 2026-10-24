import { describe, expect, it } from 'vitest';
import { boxOverlap, capsuleBoxClearance, fitPlane, flexion3, hipFlexion, lineAngle, lineTurn, project } from '../scripts/capture/gate-math';
import type { Box } from '../scripts/capture/gate-math';
import { keypointReference } from '../scripts/capture/gates';
import { consensus, fuse } from '../src/viewer/motion/capture/detectors';
import type { Detection } from '../src/viewer/motion/capture/detectors';

const I = [1, 0, 0, 0, 1, 0, 0, 0, 1];
const yaw = (deg: number): number[] => {
  const [c, s] = [Math.cos((deg * Math.PI) / 180), Math.sin((deg * Math.PI) / 180)];
  return [c, 0, s, 0, 1, 0, -s, 0, c];
};
// A 1.7 m x 7 cm x 1.5 cm ski along z.
const ski = (x: number, y: number, deg = 0): Box => ({ f: { R: yaw(deg), p: [x, y, 0] }, h: [0.035, 0.0075, 0.85] });

describe('capture gates geometry', () => {
  it('parallel skis a stance apart are separated by the gap', () => {
    expect(boxOverlap(ski(0, 0), ski(0.25, 0))).toBeCloseTo(-(0.25 - 0.07), 6);
  });
  it('skis crossed at 45 degrees in one plane interpenetrate by their thickness', () => {
    expect(boxOverlap(ski(0, 0), ski(0.1, 0, 45))).toBeCloseTo(0.015, 6);
  });
  it('a ski crossing 5 cm above the other clears it', () => {
    expect(boxOverlap(ski(0, 0), ski(0, 0.05, 45))).toBeCloseTo(-(0.05 - 0.015), 6);
  });
  it('capsule clearance is distance to the box surface minus radius', () => {
    expect(capsuleBoxClearance(ski(0, 0), [0.2, -0.3, 0], [0.2, 0.3, 0], 0.05)).toBeCloseTo(0.2 - 0.035 - 0.05, 6);
    expect(capsuleBoxClearance(ski(0, 0), [0, 0.03, -0.1], [0, 0.03, 0.1], 0.05)).toBeLessThan(0);
  });
  it('fits a 20 degree slope plane through points on it', () => {
    const t = (20 * Math.PI) / 180;
    const pts = [[0, 0, 0], [1, 0, 0], [0, -Math.sin(t), Math.cos(t)], [2, -2 * Math.sin(t), 2 * Math.cos(t)], [-1, -0.5 * Math.sin(t), 0.5 * Math.cos(t)]];
    const { n, d } = fitPlane(pts);
    expect(n[0]).toBeCloseTo(0, 6);
    expect(n[1]).toBeCloseTo(Math.cos(t), 6);
    expect(n[2]).toBeCloseTo(Math.sin(t), 6);
    expect(d).toBeCloseTo(0, 6);
  });
  it('knee flexion is zero for a straight leg and 90 for a right angle', () => {
    expect(flexion3([0, 1, 0], [0, 0.5, 0], [0, 0, 0])).toBeCloseTo(0, 6);
    expect(flexion3([0, 1, 0], [0, 0.5, 0], [0, 0.5, -0.4])).toBeCloseTo(90, 6);
  });
  it('hip flexion is the thigh pitch forward in the pelvis frame', () => {
    expect(hipFlexion(I, [0, 0, 0], [0, -0.4, 0])).toBeCloseTo(0, 6);
    expect(hipFlexion(I, [0, 0, 0], [0.4, -0.4, 0])).toBeCloseTo(45, 6);
  });
  it('image line angles are undirected', () => {
    expect(lineAngle([0, 0], [1, 0], [1, 0], [0, 0])).toBeCloseTo(0, 6);
    expect(lineAngle([0, 0], [1, 0], [0, 0], [1, 1])).toBeCloseTo(45, 6);
    expect(lineTurn([0, 0], [1, 0], [1, 1], [0, 0])).toBeCloseTo(45, 6);
    expect(lineTurn([0, 0], [1, 0], [0, 0], [1, -1])).toBeCloseTo(-45, 6);
  });
  it('projects through the principal point', () => {
    expect(project([1000, 1000, 960, 540], { R: I, p: [0, 0, 0] }, [0.5, -0.25, 5])).toEqual([1060, 490]);
  });
});

// Deterministic uniform noise (LCG).
const noise = (seed: number): (() => number) => {
  let x = seed;
  return () => ((x = (x * 1664525 + 1013904223) % 2 ** 32) / 2 ** 32) * 2 - 1;
};
const FRAMES = 200;
const TORSO = Array.from({ length: FRAMES }, () => 200);
const TORSO_PX = 200;
const need = <T>(v: T | undefined): T => {
  if (v === undefined) throw new Error('missing');
  return v;
};
const truthAt = (k: number): [number, number] => [900 + 2 * k, 600 - k];
// Three detectors scattering a few px round the truth, one of them noisier.
const detectors = (): Detection[][] => [3, 5, 12].map((px, d) => {
  const r = noise(d + 1);
  return Array.from({ length: FRAMES }, (_, k): Detection => [truthAt(k)[0] + px * r(), truthAt(k)[1] + px * r(), 0.9]);
});

describe('keypoint gate calibration', () => {
  const dets = detectors();
  const ref = keypointReference({ 'knee.L': dets, 'wrist.L': dets.slice(0, 2) }, TORSO);
  const ratio = (k: number, uv: readonly [number, number]): number => {
    const r = ref[k]?.['knee.L'];
    if (r === undefined) throw new Error('no reference');
    return Math.hypot(uv[0] - r.at[0], uv[1] - r.at[1]) / TORSO_PX / r.tol;
  };
  it('a model on the consensus never fails', () => {
    for (let k = 0; k < FRAMES; k++) expect(ratio(k, need(ref[k]?.['knee.L']).at)).toBe(0);
  });
  it('a model on any one detector fails at most the 5% of frames where the detectors disagree most', () => {
    for (const d of dets) {
      const failed = d.filter((p, k) => p !== undefined && ratio(k, [p[0], p[1]]) > 1).length;
      expect(failed / FRAMES).toBeLessThanOrEqual(0.05 + 1 / FRAMES);
    }
  });
  it('a model off the consensus by more than the detectors ever stray always fails', () => {
    const worst = Math.max(...dets.flat().map((p, i) => { const k = i % FRAMES; const c = need(ref[k]?.['knee.L']).at; return p === undefined ? 0 : Math.hypot(p[0] - c[0], p[1] - c[1]); }));
    for (let k = 0; k < FRAMES; k++) expect(ratio(k, [need(ref[k]?.['knee.L']).at[0] + worst + 1, need(ref[k]?.['knee.L']).at[1]])).toBeGreaterThan(1);
  });
  it('the tolerance follows the noisiest detector, not a fixed number', () => {
    const tight = keypointReference({ j: [3, 4, 5].map((px, d) => { const r = noise(d + 7); return Array.from({ length: FRAMES }, (_, k): Detection => [truthAt(k)[0] + px * r(), truthAt(k)[1] + px * r(), 0.9]); }) }, TORSO);
    expect(need(tight[0]?.['j']).tol).toBeLessThan(need(ref[0]?.['knee.L']).tol);
  });
  it('leaves out joints fewer than three detectors mark and frames fewer than two see', () => {
    expect(ref.every((f) => f['wrist.L'] === undefined)).toBe(true);
    const gaps = keypointReference({ j: dets.map((d, i) => d.map((p, k) => (k === 0 && i > 0 ? undefined : p))) }, TORSO);
    expect(gaps[0]?.['j']).toBeUndefined();
    expect(gaps[1]?.['j']).toBeDefined();
  });
});

describe('detector fusion', () => {
  it('the consensus ignores one stray detector', () => {
    expect(consensus([[100, 100], [102, 99], [300, 400]])).toEqual([102, 100]);
  });
  it('agreeing detectors fuse by inverse variance', () => {
    const f = fuse([{ uv: [100, 100], sigma: 3 }, { uv: [101, 100], sigma: 6 }]);
    expect(f?.uv[0]).toBeCloseTo(100.2, 6);
    expect(f?.sigma).toBeCloseTo(Math.sqrt(1 / (1 / 9 + 1 / 36)), 6);
  });
  it('disagreeing detectors are no more certain than their spread', () => {
    const f = fuse([{ uv: [100, 100], sigma: 3 }, { uv: [140, 100], sigma: 3 }]);
    expect(f?.uv[0]).toBeCloseTo(120, 6);
    expect(f?.sigma).toBeGreaterThan(14);
  });
});
