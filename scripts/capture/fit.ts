// Usage: bun scripts/capture/fit.ts <capture dir> <clip> [--diagnose] [--offsets] [--calibrate even|odd] [--out <path>]
// 2D fit of skibuddy's skier to the footage: reads <clip>_targets.json (GVHMR seed and priors), <clip>_obs.json (camera),
// <clip>_kp2d.json (RTMW-x), <clip>_ski2d_kp.json (Ski 2DPose ViTPose-B), <clip>_skis2d_seg.json; writes <clip>_fit.json for the viewer.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { FIT_SIGMA, KP_MIN, KP_PX, KP_REFERENCE, LIMBS, OFFSET_PARENT, buildFitProblem, fitSeed, keypointSigma, landmarkOffsets, limbScales, skiLineSigma, snowFromSkis } from '../../src/viewer/motion/capture/fit2d';
import { DETECTOR_MIN, SKI2D_BODY, agreement, detection, detectorSigma, fuse, quantileOf } from '../../src/viewer/motion/capture/detectors';
import type { FitOptions, FrameEvidence, LineObs, PointObs, V2 } from '../../src/viewer/motion/capture/fit2d';
import type { V3n } from '../../src/viewer/motion/capture/geometry';
import type { CaptureProblem } from '../../src/viewer/motion/capture/ik';
import type { SolveResult } from '../../src/solve/solve';
import { prepare, solveCapture } from '../../src/viewer/motion/capture/ik';
import type { CaptureClip } from '../../src/viewer/motion/capture/ik';
import { pelvisOf } from '../../src/viewer/motion/capture/report';
import { quatOf } from '../../src/viewer/motion/capture/signal';
import { diagnose, formatDiagnosis } from '../../src/solve/diagnose';
import { COORDINATES, DofKind, Side } from '../../src/viewer/skeleton';

const [dir, clipName] = process.argv.slice(2);
if (dir === undefined || clipName === undefined) throw new Error('usage: fit.ts <capture dir> <clip>');
const DEG = Math.PI / 180;
const SNOW_ROUNDS = 3;
const flag = (name: string): string | undefined => { const i = process.argv.indexOf(name); return i < 0 ? undefined : process.argv[i + 1]; };
// Held-out validation: offsets calibrate on one half of the frames; the other half uses them without informing them.
const calibrate = flag('--calibrate');
const read = <T>(name: string): T => JSON.parse(readFileSync(join(dir, `${clipName}_${name}.json`), 'utf8')) as T;

type Kp = readonly [number, number, number];
interface ObsFrame { readonly K: number[]; readonly w2c: { readonly R: number[]; readonly t: number[] }; readonly kp2d: Kp[] }
interface SegSki { readonly tip: V2; readonly tail: V2; readonly conf: number; readonly rms_px: number }
interface SegFrame { readonly L: SegSki | null; readonly R: SegSki | null }

const clip = read<CaptureClip>('targets');
const obs = read<{ fps: number; frames: ObsFrame[] }>('obs').frames;
const kp2d = read<{ frames: Array<{ kp: Record<string, Kp> }> }>('kp2d').frames;
const seg = read<{ frames: SegFrame[] }>('skis2d_seg').frames;
const ski2d = read<{ frames: Array<Record<string, Kp>> }>('ski2d_kp').frames;
const vitpose = obs.map((o) => o.kp2d);

const RTMW_MIN = KP_MIN / KP_REFERENCE;
const SKI2D_MIN = DETECTOR_MIN.ski2d;
const det = detection;

const COCO17: Readonly<Record<string, number>> = { shoulder: 5, elbow: 7, wrist: 9, hip: 11, knee: 13, ankle: 15 };
const DETECTED = [Side.Left, Side.Right].flatMap((s) => Object.keys(COCO17).map((j) => [j, s] as const));

/** Each fitted detector's σ per joint, measured about the three detectors' consensus (ViTPose only calibrates). */
const bodyDetectors = DETECTED.map(([j, s]) => {
  const n = s === Side.Left ? 'left' : 'right';
  const rt = Array.from({ length: clip.frames }, (_, k) => det(kp2d[k]?.kp[`${n}_${j}`], RTMW_MIN, KP_REFERENCE));
  const sk = SKI2D_BODY.has(j) ? Array.from({ length: clip.frames }, (_, k) => det(ski2d[k]?.[`${j}_${n}`], SKI2D_MIN)) : [];
  const vp = Array.from({ length: clip.frames }, (_, k) => det(vitpose[k]?.[(COCO17[j] ?? 0) + (s === Side.Left ? 0 : 1)], DETECTOR_MIN.vitpose));
  const { per } = agreement([rt, sk, vp], 0, []);
  const at = per.map((p) => p?.at);
  const used = [rt, sk].filter((d) => d.length > 0).map((d) => ({ d, sigma: Math.max(1, detectorSigma(d, at, 0)), conf: quantileOf(d.flatMap((x) => (x === undefined ? [] : [x[2]])), 0.5) }));
  return { landmark: `${j}.${s}`, used };
});
console.error('detector σ px:', Object.fromEntries(bodyDetectors.map((b) => [b.landmark, b.used.map((u) => Number(u.sigma.toFixed(1)))])));

// RTMW's foot points, and Ski 2DPose's boot and ski ends.
const RTMW_FEET: ReadonlyArray<readonly [string, string]> = [Side.Left, Side.Right].flatMap((s) => {
  const n = s === Side.Left ? 'left' : 'right';
  return [[`${n}_big_toe`, `big.${s}`], [`${n}_small_toe`, `small.${s}`], [`${n}_heel`, `heel.${s}`]] as const;
});
const SKI2D_FEET: ReadonlyArray<readonly [string, string]> = [Side.Left, Side.Right].flatMap((s) => {
  const n = s === Side.Left ? 'left' : 'right';
  return [[`toes_${n}`, `bootToe.${s}`], [`heel_${n}`, `bootHeel.${s}`], [`ski_tip_${n}`, `skiTip.${s}`], [`ski_tail_${n}`, `skiTail.${s}`]] as const;
});
const skiConf = Object.fromEntries(SKI2D_FEET.map(([kp]) => [kp, quantileOf(ski2d.flatMap((f) => { const d = det(f[kp], SKI2D_MIN); return d === undefined ? [] : [d[2]]; }), 0.5)]));

const evidence: FrameEvidence[] = Array.from({ length: clip.frames }, (_, k) => {
  const o = obs[k];
  if (o === undefined) throw new Error(`no camera for frame ${k}`);
  const points: PointObs[] = bodyDetectors.flatMap(({ landmark, used }) => {
    // σ grows as conf falls below the detector's clip median: weight ∝ conf².
    const f = fuse(used.flatMap(({ d, sigma, conf }) => { const p = d[k]; return p === undefined ? [] : [{ uv: [p[0], p[1]] as V2, sigma: sigma * Math.max(1, conf / p[2]) }]; }));
    return f === undefined ? [] : [{ landmark, uv: f.uv, sigma: Math.hypot(f.sigma, KP_PX.joint) }];
  });
  for (const [kp, landmark] of RTMW_FEET) {
    const p = kp2d[k]?.kp[kp];
    const sigma = p === undefined ? undefined : keypointSigma(KP_PX.foot, p[2]);
    if (p !== undefined && sigma !== undefined) points.push({ landmark, uv: [p[0], p[1]], sigma });
  }
  for (const [kp, landmark] of SKI2D_FEET) {
    const p = det(ski2d[k]?.[kp], SKI2D_MIN);
    if (p !== undefined) points.push({ landmark, uv: [p[0], p[1]], sigma: KP_PX.foot * Math.max(1, (skiConf[kp] ?? 1) / p[2]) });
  }
  const lines: LineObs[] = [Side.Left, Side.Right].flatMap((side) => {
    const s = seg[k]?.[side];
    const sigma = s === null || s === undefined ? undefined : skiLineSigma(s.rms_px, s.conf);
    return s === null || s === undefined || sigma === undefined ? [] : [{ side, a: s.tail, b: s.tip, sigma }];
  });
  return { camera: { K: o.K, R: o.w2c.R, t: o.w2c.t }, points, lines };
});

/** three's camera (looks down −z, y up) from OpenCV world→camera, as the viewer's frames carry it. */
const viewerCamera = (o: ObsFrame): { pos: number[]; quat: number[]; fovY: number } => {
  const [R, t] = [o.w2c.R, o.w2c.t];
  const c2w = [0, 1, 2].flatMap((r) => [0, 1, 2].map((c) => (R[3 * c + r] ?? 0) * (c === 0 ? 1 : -1)));
  const pos = [0, 1, 2].map((r) => -[0, 1, 2].reduce((a, c) => a + (R[3 * c + r] ?? 0) * (t[c] ?? 0), 0));
  return { pos: pos.map((v) => Number(v.toFixed(4))), quat: quatOf(c2w).map((v) => Number(v.toFixed(6))), fovY: Number(((2 * Math.atan((o.K[3] ?? 0) / (o.K[1] ?? 1))) / DEG).toFixed(3)) };
};

/** The footage's own frame rate: pose frame i is video frame i, which GVHMR's resampled fps does not time. */
const videoFps = ((): number | null => {
  const video = join(dir, `${clipName}.mp4`);
  if (!existsSync(video)) return null;
  const r = Bun.spawnSync(['ffprobe', '-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=avg_frame_rate', '-of', 'csv=p=0', video]);
  const [n, d] = r.stdout.toString().trim().split('/').map(Number);
  return r.success && n !== undefined && d !== undefined && n > 0 && d > 0 ? Number((n / d).toFixed(3)) : null;
})();

const start = performance.now();
const targets = prepare(clip);
const fitClip = (opts: FitOptions): { cp: CaptureProblem; result: SolveResult } => {
  let cp = buildFitProblem(targets, evidence, FIT_SIGMA.snowHeight, opts);
  let result = solveCapture(cp, fitSeed(cp));
  // The first pass stands on GVHMR's sole plane; later ones on the plane the fitted skis share.
  for (let round = 0; round < SNOW_ROUNDS; round++) {
    const snow = snowFromSkis(cp, result.x);
    cp = buildFitProblem({ ...targets, snow }, evidence, FIT_SIGMA.snowRefit, opts);
    result = solveCapture(cp, result.x);
    console.error(`snow round ${round}: cost ${result.cost.toFixed(1)}`);
  }
  return { cp, result };
};
const solveOffsets = process.argv.includes('--offsets');
let { cp, result } = fitClip({ offsets: solveOffsets, held: calibrate === undefined ? undefined : Array.from({ length: clip.frames }, (_, k) => k % 2 !== (calibrate === 'odd' ? 1 : 0)) });
let fixed: Record<string, V3n> | null = null;
if (calibrate !== undefined) {
  // The held-out half then refits with the calibrated offsets fixed.
  fixed = landmarkOffsets(cp, result.x);
  ({ cp, result } = fitClip({ fixed }));
}
const qs = cp.cycle.unpack(result.x);
const limbs = Object.fromEntries(Object.keys(LIMBS).map((k, j) => [k, Number((limbScales(cp, result.x)[j] ?? 1).toFixed(4))]));
const offsets = Object.fromEntries(Object.entries(fixed ?? landmarkOffsets(cp, result.x)).map(([n, o]) => [n, o.map((v) => Number(v.toFixed(4)))]));
const solver = { converged: result.converged, feasible: result.feasible, violation: result.violation, iterations: result.iterations, outer: result.outer, cost: result.cost, seconds: (performance.now() - start) / 1000 };

const doc = {
  clip: clipName,
  video: `${clipName}.mp4`,
  fps: clip.fps,
  videoFps,
  stage: 'fit',
  solver,
  // Subject's thigh and shin over the template's: the figure's tibia and foot joint offsets scale by these.
  limbs,
  // Detector landmark minus joint centre in the parent segment's frame, m: keypoint gates and overlays add these.
  landmarkOffsets: offsets,
  landmarkParents: OFFSET_PARENT,
  calibrate: calibrate ?? null,
  frames: qs.map((q, k) => {
    const pel = pelvisOf(cp, q, k);
    const [x, y, z, w] = quatOf(pel.R);
    return {
      t: k / clip.fps,
      q: Object.fromEntries(COORDINATES.flatMap((c, i) => (c.kind === DofKind.Rotation ? [[c.name, Number(((q[i] ?? 0) / DEG).toFixed(3))]] : []))),
      pelvis: { pos: pel.p.map((v) => Number(v.toFixed(5))), quat: [x, y, z, w].map((v) => Number(v.toFixed(6))) },
      camera: viewerCamera(obs[k] as ObsFrame),
    };
  }),
};
writeFileSync(flag('--out') ?? join(dir, `${clipName}_fit.json`), JSON.stringify(doc));
if (process.argv.includes('--diagnose')) console.error(formatDiagnosis(diagnose(cp.problem, result)));
console.log(JSON.stringify({ solver, limbs, offsets }, null, 1));
