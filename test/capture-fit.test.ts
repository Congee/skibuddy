import { assert, describe, it } from '@effect/vitest';
import { Dual } from '../src/solve/dual';
import { BlockKind, autodiff, checkJacobian, plain } from '../src/solve/problem';
import { COORDINATES, REST_POSE, SEGMENT_NAMES, Side } from '../src/viewer/skeleton';
import { axisOf, forward, skiFrame, transform, value } from '../src/viewer/motion/fk';
import type { V3 } from '../src/viewer/motion/fk';
import { LANDMARKS, OFFSET_PARENT, SKI_STATIONS, buildFitProblem, cauchy, fitSeed, imageRows, landmarkOf, landmarkOffsets, lengthsOf, limbScales, project } from '../src/viewer/motion/capture/fit2d';
import type { FitOptions } from '../src/viewer/motion/capture/fit2d';
import type { Camera, FrameEvidence, V2 } from '../src/viewer/motion/capture/fit2d';
import { limits, solveCapture } from '../src/viewer/motion/capture/ik';
import type { CaptureTargets } from '../src/viewer/motion/capture/ik';
import { cross, minus, rotY, unit } from '../src/viewer/motion/capture/geometry';
import type { V3n } from '../src/viewer/motion/capture/geometry';

const DEG = Math.PI / 180;
const NC = COORDINATES.length;
const at = (name: string): number => COORDINATES.findIndex((c) => c.name === name);
// reilly's frame-0 camera: 1920×1080, looking at the skier from ~5.5 m.
const CAMERA: Camera = { K: [2202.9, 2202.9, 960, 540], R: [-0.99985, 0.00886, 0.01462, -0.00903, -0.99989, -0.01136, 0.01452, -0.01149, 0.99983], t: [0.12, 1.33, 5.49] };

describe('projection', () => {
  it('matches the pinhole derivative and its dual Jacobian matches central differences', () => {
    const cam: Camera = { K: [1000, 900, 960, 540], R: [1, 0, 0, 0, 1, 0, 0, 0, 1], t: [0, 0, 0] };
    const X = [0.3, -0.2, 4];
    const block = autodiff({ name: 'p', kind: BlockKind.Goal, size: 2 }, [0, 1, 2].map(plain), (v) => [...project(cam, [v[0], v[1], v[2]] as unknown as V3)] as Dual[]);
    const J = new Float64Array(6);
    block.evaluate(Float64Array.from(X), new Float64Array(2), J);
    assert.closeTo(J[0] ?? 0, 1000 / 4, 1e-9);
    assert.closeTo(J[2] ?? 0, (-1000 * 0.3) / 16, 1e-9);
    assert.closeTo(J[4] ?? 0, 900 / 4, 1e-9);
    assert.isBelow(checkJacobian(block, Float64Array.from(X)), 1e-6);
  });

  it('keeps the Cauchy residual exact in value and slope', () => {
    for (const r of [0, 1e-5, 0.5, 2, 10]) {
      const d = cauchy(new Dual(r, Float64Array.of(1)), 2) as Dual;
      assert.closeTo(d.v * d.v, 4 * Math.log1p((r * r) / 4), 1e-9);
      const h = 1e-6;
      assert.closeTo(d.d[0] ?? 0, ((cauchy(r + h, 2) as number) - (cauchy(r - h, 2) as number)) / (2 * h), 1e-6);
    }
  });
});

/** A crouched skier with both hips turned the same way, so the skis stay parallel and clear. */
const clamped = (set: Readonly<Record<string, number>>): number[] => {
  const { lo, hi } = limits();
  return COORDINATES.map((c, i) => Math.min(hi[i] ?? Infinity, Math.max(lo[i] ?? -Infinity, set[c.name] ?? REST_POSE[c.name] ?? 0)));
};
const truthOf = (k: number): number[] => {
  const set: Record<string, number> = {
    pelvis_ty: 0.1 - 0.02 * k, pelvis_tx: 0.05 * k, pelvis_tilt: 15 * DEG, lumbar_flexion: 20 * DEG,
    'hip_flexion.R': 55 * DEG, 'hip_flexion.L': 50 * DEG, 'knee_flexion.R': 65 * DEG, 'knee_flexion.L': 60 * DEG,
    'ankle_dorsiflexion.R': 20 * DEG, 'ankle_dorsiflexion.L': 18 * DEG, 'hip_rotation.R': (12 + 2 * k) * DEG, 'hip_rotation.L': (-10 - 2 * k) * DEG,
  };
  return clamped(set);
};
/** A skier sinking and turning through a wide range of flexion and heading, spine and hip rotation where their priors sit. */
const variedOf = (k: number): number[] =>
  clamped({
    pelvis_ty: 0.1 - 0.03 * k, pelvis_tx: 0.05 * k, pelvis_rotation: (-30 + 12 * k) * DEG,
    'hip_flexion.R': (25 + 10 * k) * DEG, 'hip_flexion.L': (30 + 8 * k) * DEG, 'knee_flexion.R': (30 + 12 * k) * DEG, 'knee_flexion.L': (40 + 10 * k) * DEG,
    'ankle_dorsiflexion.R': (10 + 2 * k) * DEG, 'ankle_dorsiflexion.L': (12 + 2 * k) * DEG,
    'shoulder_flexion.R': (10 + 8 * k) * DEG, 'shoulder_flexion.L': (40 - 5 * k) * DEG, 'elbow_flexion.R': (30 + 10 * k) * DEG, 'elbow_flexion.L': (60 - 5 * k) * DEG,
  });

interface RoundTrip {
  readonly K: number;
  readonly ref: ReturnType<typeof rotY>;
  readonly truth: number[][];
  readonly worlds: ReadonlyArray<ReturnType<typeof forward>>;
  readonly evidence: FrameEvidence[];
  readonly cp: ReturnType<typeof buildFitProblem>;
  readonly truthX: () => Float64Array;
}

const roundTrip = (limbs: readonly [number, number], offsets: Readonly<Record<string, V3n>> = {}, opts: FitOptions = {}, K = 3, pose = truthOf, sigma = 6): RoundTrip => {
  const ref = rotY(0.4);
  const truth = Array.from({ length: K }, (_, k) => pose(k));
  const worlds = truth.map((q) => forward(q, [0, 0, 0], SEGMENT_NAMES, ref, lengthsOf(limbs)));
  const R = (w: (typeof worlds)[number], s: string): number[] => (w[s]?.R ?? []).map(value);
  const p = (w: (typeof worlds)[number], s: string): V3n => (w[s]?.p ?? [0, 0, 0]).map(value) as V3n;
  const targets: CaptureTargets = {
    frames: K,
    fps: 24,
    scale: 1,
    ref: worlds.map(() => ref),
    heading: worlds.map(() => 0.4),
    orient: Object.fromEntries(['pelvis', 'thorax', 'femur.R', 'femur.L', 'humerus.R', 'humerus.L', 'forearm.R', 'forearm.L'].map((s) => [s, worlds.map((w) => R(w, s))])),
    points: { mid_hips: worlds.map((w) => p(w, 'pelvis')) },
    skiAxis: {},
    coords: Object.fromEntries(['knee_flexion.R', 'knee_flexion.L', 'hip_flexion.R', 'hip_flexion.L'].map((n) => [n, truth.map((q) => q[at(n)] ?? 0)])),
    trunk: worlds.map((w) => unit(minus(p(w, 'neck'), p(w, 'pelvis')))),
    snow: worlds.map(() => ({ n: [0, 1, 0] as V3n, d: 0 })),
    // Snow left out: the round trip tests the image terms alone.
    stance: worlds.map(() => [false, false] as const),
    twist: {},
  };
  const evidence: FrameEvidence[] = worlds.map((w) => ({
    camera: CAMERA,
    points: Object.keys(LANDMARKS).filter((n) => !n.startsWith('ski')).map((n) => {
      return { landmark: n, uv: project(CAMERA, landmarkOf(w, n, offsets as never)).map(value) as unknown as V2, sigma };
    }),
    lines: [Side.Left, Side.Right].map((side) => {
      const [tip, , tail] = SKI_STATIONS.map((x) => project(CAMERA, transform(skiFrame(w, side), x as unknown as V3)).map(value) as unknown as V2);
      return { side, a: tail as V2, b: tip as V2, sigma: 4 };
    }),
  }));
  const cp = buildFitProblem(targets, evidence, undefined, opts);
  /** The truth as a solve vector, template limbs. */
  const truthX = (): Float64Array => {
    const x = fitSeed(cp);
    truth.forEach((q, k) => q.forEach((v, i) => (x[k * NC + i] = v)));
    return x;
  };
  return { K, ref, truth, worlds, evidence, cp, truthX };
};

describe('2D fit round trip', () => {
  const { K, ref, truth, worlds, evidence, cp, truthX } = roundTrip([1, 1]);

  it('has exact image-row Jacobians', () => {
    const block = cp.problem.blocks.find((b) => b.group === 'image');
    if (block === undefined) throw new Error('no image block');
    const x0 = truthX();
    const x = Float64Array.from(block.vars, (i) => (x0[i] ?? 0) + 0.05);
    assert.isBelow(checkJacobian(block, x), 1e-5);
  });

  it('is at rest on the truth: image residuals vanish', () => {
    const rows = imageRows(worlds[0] as never, evidence[0] as FrameEvidence).map(value);
    assert.isBelow(Math.max(...rows.map(Math.abs)), 1e-6);
  });

  it('recovers both skis from a seed with the hips turned 20° wrong', () => {
    const seed = truthX();
    for (let k = 0; k < K; k++) {
      seed[k * NC + at('hip_rotation.R')] = (truth[k]?.[at('hip_rotation.R')] ?? 0) - 20 * DEG;
      seed[k * NC + at('hip_rotation.L')] = (truth[k]?.[at('hip_rotation.L')] ?? 0) + 20 * DEG;
    }
    const qs = cp.cycle.unpack(solveCapture(cp, seed).x);
    qs.forEach((q, k) => {
      const w = forward(Array.from(q), [0, 0, 0], SEGMENT_NAMES, ref);
      for (const s of [Side.Left, Side.Right]) {
        const [a, b] = [axisOf(skiFrame(w, s), 2).map(value), axisOf(skiFrame(worlds[k] as never, s), 2).map(value)];
        const angle = Math.asin(Math.min(1, Math.hypot(...cross(a, b)))) / DEG;
        assert.isBelow(angle, 2, `frame ${k} ski ${s}`);
      }
    });
  });
});

describe('2D fit subject shape', () => {
  // A subject with a shorter thigh and longer shin than the template, as reilly's capture shows.
  const limbs = [0.92, 1.12] as const;
  const { truth, cp, truthX } = roundTrip(limbs);

  it('recovers the limb lengths and the knee flexion from a template-limbed seed', () => {
    const r = solveCapture(cp, truthX());
    // Three frames leave the thigh within its prior's pull toward the template.
    limbScales(cp, r.x).forEach((v, j) => assert.closeTo(v, limbs[j] ?? 1, 0.03));
    cp.cycle.unpack(r.x).forEach((q, k) => {
      for (const n of ['knee_flexion.R', 'knee_flexion.L']) assert.closeTo((q[at(n)] ?? 0) / DEG, (truth[k]?.[at(n)] ?? 0) / DEG, 1, `frame ${k} ${n}`);
    });
  });
});

describe('2D fit landmark offsets', () => {
  // 1 px keypoints, so the image rather than the priors decides: at 6 px a 2 cm offset is weakly identified against pose.
  // Labels off the joint centres by a constant amount in the parent segment, across the limbs (inferred sizes).
  const truthOff: Record<string, V3n> = { 'knee.R': [0.02, 0, 0], 'knee.L': [0.02, 0, 0.01], 'ankle.L': [0.015, 0, 0], 'elbow.R': [0, 0, 0.02] };
  const K = 8;
  const { truth, cp, truthX } = roundTrip([1, 1], truthOff, { offsets: true }, K, variedOf, 1);

  it('recovers a constant landmark offset without biasing the pose', () => {
    const r = solveCapture(cp, truthX());
    const got = landmarkOffsets(cp, r.x);
    // The zero-mean prior shrinks axes the image sees weakly (elbow depth), so 8 mm, not exact.
    for (const n of Object.keys(OFFSET_PARENT)) (truthOff[n] ?? [0, 0, 0]).forEach((v, c) => assert.closeTo(got[n]?.[c] ?? 0, v, 0.008, `${n}[${c}]`));
    limbScales(cp, r.x).forEach((v) => assert.closeTo(v, 1, 0.01));
    cp.cycle.unpack(r.x).forEach((q, k) => {
      for (const n of ['knee_flexion.R', 'knee_flexion.L', 'hip_flexion.R', 'hip_flexion.L']) assert.closeTo((q[at(n)] ?? 0) / DEG, (truth[k]?.[at(n)] ?? 0) / DEG, 1, `frame ${k} ${n}`);
    });
  }, 60_000);

  it('keeps held-out frames from informing the offsets', () => {
    const held = Array.from({ length: K }, (_, k) => k % 2 === 1);
    const hcp = roundTrip([1, 1], truthOff, { offsets: true, held }, K, variedOf).cp;
    const offsets = new Set(Array.from({ length: hcp.cycle.extras - 2 }, (_, j) => hcp.cycle.extra(2 + j).index));
    hcp.problem.blocks.filter((b) => b.group === 'image').forEach((b, k) => assert.strictEqual(Array.from(b.vars).some((v) => offsets.has(v)), !(held[k] ?? false), `frame ${k}`));
  });

  it('applies fixed offsets as constants: the truth is at rest', () => {
    const fcp = roundTrip([1, 1], truthOff, { fixed: truthOff as never }, K, variedOf).cp;
    assert.strictEqual(fcp.cycle.extras, 2);
    const x = fitSeed(fcp);
    truth.forEach((q, k) => q.forEach((v, i) => (x[k * NC + i] = v)));
    for (const b of fcp.problem.blocks.filter((bl) => bl.group === 'image')) {
      const r = new Float64Array(b.size);
      b.evaluate(Float64Array.from(b.vars, (i) => x[i] ?? 0), r, null);
      assert.isBelow(Math.max(...Array.from(r, Math.abs)), 1e-6);
    }
  });
});
