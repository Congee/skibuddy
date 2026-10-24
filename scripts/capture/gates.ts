// Usage: bun scripts/capture/gates.ts <clip_stage.json | clip_obs.json>
// Independent pose checker for the video capture: skibuddy FK per frame (or the SMPL-X capture itself, given an obs file)
// against GVHMR's capture, ViTPose keypoints and skis segmented in the footage. Writes <clip>_<stage>_gates.json beside it.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { JOINT_LIMITS } from '../../src/viewer/joint-limits';
import { CUFF } from '../../src/viewer/motion/cuff';
import { bootCapsules } from '../../src/viewer/motion/turn';
import { DETECTOR_MIN, RTMW_SCORE, SKI2D_BODY, agreement, detection } from '../../src/viewer/motion/capture/detectors';
import type { Detection } from '../../src/viewer/motion/capture/detectors';
import { Side } from '../../src/viewer/skeleton';
import type { Body, ObsFrame, PoseFrame } from './gate-body';
import { COCO, PELVIS_DOFS, SKI, SIDES, TAIL, THICK, TIP, captureBody, figureBody, figureMass, projectBody, segmentLengths, torsoPx } from './gate-body';
import { FIT_SIGMA } from '../../src/viewer/motion/capture/fit2d';
import type { PhysicsClip } from './physics-gate';
import { physicsGate, skiScale } from './physics-gate';
import type { Box, Frame3, V2, V3 } from './gate-math';
import { angle, apply, boxOverlap, capsuleBoxClearance, col, compose, dot, fitPlane, flexion3, hipFlexion, lineAngle, lineTurn, quantile, sub } from './gate-math';

export { captureBody, figureBody, frameOf, segmentLengths } from './gate-body';
export type { Body } from './gate-body';

const DEG = Math.PI / 180;

export const Gate = {
  SkiSplay: 'skiSplay',
  SkiHeading: 'skiHeading',
  Collision: 'collision',
  Snow: 'snow',
  Limits: 'limits',
  Trunk: 'trunk',
  Flexion: 'flexion',
  Joints2d: 'joints2d',
  Keypoints: 'keypoints',
  Physics: 'physics',
} as const;
export type Gate = (typeof Gate)[keyof typeof Gate];

/** Thresholds; a gate fails when its value exceeds the threshold. */
const THRESHOLD: Readonly<Record<Gate, { readonly value: number; readonly unit: string; readonly reason: string }>> = {
  [Gate.SkiSplay]: { value: 5, unit: 'deg', reason: 'image angle between the two skis vs the segmented pair; segmented splay jitters 0.7 deg median per frame and sits within -2..2.5 deg (p10..p90)' },
  [Gate.SkiHeading]: { value: 5, unit: 'deg', reason: 'each ski image line vs its segmented line; 5 deg is ~2 ski widths of tip offset on a 1.7 m ski' },
  [Gate.Collision]: { value: 0.01, unit: 'm', reason: 'boxes ignore sidecut (~1 cm narrower waist), so overlap under 1 cm is model slack' },
  [Gate.Snow]: { value: 0.02, unit: 'm', reason: 'lowest edge at tip and tail within 2 cm of the snow plane fitted to both skis over +-0.5 s' },
  [Gate.Limits]: { value: 0.01, unit: 'deg', reason: 'joint-limits.ts and CUFF are hard bounds; pose JSON rounds to 0.001 deg' },
  [Gate.Trunk]: { value: 5, unit: 'deg', reason: 'mid-hips to C7/T1 direction vs SMPL-X; GVHMR trunk pitch agrees with SAM3D to ~1 deg (design.md)' },
  [Gate.Flexion]: { value: 8, unit: 'deg', reason: 'knee/hip flexion vs SMPL-X; GVHMR knee within 4 deg of 3-pt and SAM3D, so 8 deg is 2x its spread' },
  [Gate.Joints2d]: { value: 0.3, unit: 'torso', reason: 'calibrated: SMPL-X capture worst joint p95 0.24, max 0.26 torso (COCO vs SMPL joint offsets)' },
  [Gate.Physics]: { value: 1, unit: 'interval', reason: "Newton-Euler: the snow force the centre of mass's acceleration needs (f = a - g) must meet the snow inside the skis' base corners across and along the heading (angular momentum rate included), push into the snow, and not tilt past the more edged base unless the skis skid; each miss over its 95 % interval propagated from the clip's own noise and scale" },
  [Gate.Keypoints]: { value: 1, unit: 'tolerance', reason: "each model landmark's miss from the detectors' consensus over its tolerance (the p95 over the clip of how far ViTPose, RTMW and Ski 2DPose stray from it); the landmark is the joint centre plus the pose file's calibrated landmark offset in its parent segment, the bare centre when it has none" },
};
/** Quantile of the detectors' per-frame spread that sets a joint's tolerance. */
const KEYPOINT_Q = 0.95;
/** ViTPose keypoints below this are mostly occluded guesses (inferred). */
const KP_CONF = 0.5;
/** Segmented ski lines below this sit far from the ankle: usually a pole (seg_skis.py confidence). */
const SKI_CONF = 0.3;
/** Calf as a capsule round the knee-ankle line (inferred: ~10 cm calf width). */
const SHIN_RADIUS = 0.05;
/** Snow-plane window half width in frames: 0.5 s at 24 fps, about one edge change (inferred). */
const SNOW_HALF = 12;

interface Ski2d { readonly tip: V2; readonly tail: V2; readonly conf: number }
interface SkisFrame { readonly skis: Record<Side, Ski2d | null> }

const BOOTS = { [Side.Left]: bootCapsules(Side.Left), [Side.Right]: bootCapsules(Side.Right) } as const;
const skiBox = (ski: Frame3): Box => ({ f: compose(ski, { R: [1, 0, 0, 0, 1, 0, 0, 0, 1], p: [0, -THICK / 2, (TIP + TAIL) / 2] }), h: [SKI.width / 2, THICK / 2, (TIP - TAIL) / 2] });
/** Lowest edge point at the tip and at the tail: where an edged or flat ski meets the snow. */
const contacts = (ski: Frame3): V3[] =>
  [TIP, TAIL].map((z) => {
    const [a, b] = [apply(ski, [SKI.width / 2, -THICK, z]), apply(ski, [-SKI.width / 2, -THICK, z])];
    return a[1] < b[1] ? a : b;
  });

export interface GateResult { readonly value: number; readonly threshold: number; readonly pass: boolean; readonly detail?: unknown }
const result = (g: Gate, value: number, detail?: unknown): GateResult => ({ value: Math.round(value * 1e4) / 1e4, threshold: THRESHOLD[g].value, pass: !(value > THRESHOLD[g].value), detail });
const r1 = (v: number): number => Math.round(v * 10) / 10;
const px = (v: V2): V2 => [r1(v[0]), r1(v[1])];

export interface KeypointRef { readonly at: readonly [number, number]; readonly tol: number }

/** Fewer detectors can share a bias their agreement never shows (RTMW and ViTPose wrists agree to ~2 px). */
const KEYPOINT_DETECTORS = 3;

/**
 * Per frame and joint: the detectors' consensus and the joint's tolerance over the clip, torso units. Joints fewer
 * than three detectors mark, and frames fewer than two see, are left out.
 */
export const keypointReference = (dets: Readonly<Record<string, ReadonlyArray<ReadonlyArray<Detection>>>>, torso: ReadonlyArray<number>): Array<Record<string, KeypointRef>> => {
  const out = torso.map((): Record<string, KeypointRef> => ({}));
  for (const [n, d] of Object.entries(dets)) {
    if (d.length < KEYPOINT_DETECTORS) continue;
    const { per, tolerance } = agreement(d, 0, torso, KEYPOINT_Q);
    per.forEach((p, k) => { if (p !== undefined && Number.isFinite(tolerance)) (out[k] as Record<string, KeypointRef>)[n] = { at: p.at, tol: tolerance }; });
  }
  return out;
};

/** Every gate on one frame; `window` holds neighbouring frames' bodies for the snow plane. */
export const gateFrame = (b: Body, ref: ObsFrame, skis: SkisFrame | null, window: ReadonlyArray<Body>, kps: Readonly<Record<string, KeypointRef>> | null = null): Partial<Record<Gate, GateResult>> => {
  const out: Partial<Record<Gate, GateResult>> = {};
  const P = projectBody(b, ref);
  const J = (n: string): V3 => b.joints[n] ?? [Number.NaN, Number.NaN, Number.NaN];
  const C = (n: string): V3 => ref.joints[n] ?? [Number.NaN, Number.NaN, Number.NaN];
  const kp = (i: number): [number, number, number] => ref.kp2d[i] ?? [Number.NaN, Number.NaN, 0];
  const torso = torsoPx(ref.kp2d);

  // Skis against the footage, in the image.
  const fig = P.skis;
  const seen = (s: Side): Ski2d | null => { const k = skis?.skis[s] ?? null; return k !== null && k.conf >= SKI_CONF ? k : null; };
  const head: Record<string, number> = {};
  for (const s of SIDES) { const k = seen(s); if (k !== null) head[s] = lineAngle(fig[s].tail, fig[s].tip, k.tail, k.tip); }
  const horiz = (s: Side): V3 => { const z = col(b.ski[s].R, 2); return [z[0], 0, z[2]]; };
  const skis3d = angle(horiz(Side.Left), horiz(Side.Right));
  const figPx = { L: { tip: px(fig.L.tip), tail: px(fig.L.tail) }, R: { tip: px(fig.R.tip), tail: px(fig.R.tail) }, skis3dDeg: r1(skis3d) };
  if (Object.keys(head).length > 0) out[Gate.SkiHeading] = result(Gate.SkiHeading, Math.max(...Object.values(head)), { ...Object.fromEntries(Object.entries(head).map(([k, v]) => [k, r1(v)])), figure: figPx });
  const [sl, sr] = [seen(Side.Left), seen(Side.Right)];
  if (sl !== null && sr !== null) {
    const f = lineTurn(fig.L.tail, fig.L.tip, fig.R.tail, fig.R.tip);
    const v = lineTurn(sl.tail, sl.tip, sr.tail, sr.tip);
    out[Gate.SkiSplay] = result(Gate.SkiSplay, Math.abs(f - v), { figure: r1(f), footage: r1(v) });
  }

  // Ski-ski and ski-other-leg interpenetration.
  const [boxL, boxR] = [skiBox(b.ski.L), skiBox(b.ski.R)];
  const leg = (box: Box, s: Side): number => Math.min(
    ...BOOTS[s].map((c) => capsuleBoxClearance(box, apply(b.foot[s], c.a.map(Number)), apply(b.foot[s], c.b.map(Number)), c.radius)),
    capsuleBoxClearance(box, J(`knee.${s}`), J(`ankle.${s}`), SHIN_RADIUS),
  );
  const pen = { skis: boxOverlap(boxL, boxR), skiLvsLegR: -leg(boxL, Side.Right), skiRvsLegL: -leg(boxR, Side.Left) };
  out[Gate.Collision] = result(Gate.Collision, Math.max(...Object.values(pen)), Object.fromEntries(Object.entries(pen).map(([k, v]) => [k, Math.round(v * 1000) / 1000])));

  // Skis on a snow plane fitted to both skis' contacts over the window.
  const plane = fitPlane(window.flatMap((w) => SIDES.flatMap((s) => contacts(w.ski[s]))));
  const h = Object.fromEntries(SIDES.flatMap((s) => contacts(b.ski[s]).map((p, i) => [`${s}.${i === 0 ? 'tip' : 'tail'}`, dot(plane.n, p) - plane.d])));
  out[Gate.Snow] = result(Gate.Snow, Math.max(...Object.values(h).map(Math.abs)), Object.fromEntries(Object.entries(h).map(([k, v]) => [k, Math.round(v * 1000) / 1000])));

  if (b.q !== null) {
    const bad = Object.entries(b.q).flatMap(([name, v]) => {
      const l = JOINT_LIMITS[name];
      const lim = CUFF[name] ?? (l === undefined || PELVIS_DOFS.has(name) ? undefined : [l.lower.value, l.upper.value]);
      if (lim === undefined) return [];
      const [lo, hi] = [lim[0] / DEG, lim[1] / DEG];
      const over = Math.max(lo - v, v - hi);
      return over > 0 ? [{ name, value: v, bound: v < lo ? r1(lo) : r1(hi), over: Math.round(over * 100) / 100, cuff: name in CUFF }] : [];
    });
    out[Gate.Limits] = result(Gate.Limits, Math.max(0, ...bad.map((x) => x.over)), bad);
  }

  out[Gate.Trunk] = result(Gate.Trunk, angle(sub(J('c7t1'), J('mid_hips')), sub(C('c7t1'), C('mid_hips'))));

  const flex: Record<string, number> = {};
  for (const s of SIDES) {
    flex[`knee.${s}`] = flexion3(J(`hip.${s}`), J(`knee.${s}`), J(`ankle.${s}`)) - flexion3(C(`hip.${s}`), C(`knee.${s}`), C(`ankle.${s}`));
    flex[`hip.${s}`] = hipFlexion(b.pelvis, J(`hip.${s}`), J(`knee.${s}`)) - hipFlexion(ref.pelvis, C(`hip.${s}`), C(`knee.${s}`));
  }
  out[Gate.Flexion] = result(Gate.Flexion, Math.max(...Object.values(flex).map(Math.abs)), Object.fromEntries(Object.entries(flex).map(([k, v]) => [k, r1(v)])));

  const err: Record<string, number> = {};
  for (const [n, i] of Object.entries(COCO)) {
    const k = kp(i);
    if (k[2] < KP_CONF) continue;
    const p = P.joints[n] ?? [Number.NaN, Number.NaN];
    err[n] = Math.round((Math.hypot(p[0] - k[0], p[1] - k[1]) / torso) * 1000) / 1000;
  }
  if (Object.keys(err).length > 0) out[Gate.Joints2d] = result(Gate.Joints2d, Math.max(...Object.values(err)), { torsoPx: r1(torso), perJoint: err });

  const miss: Record<string, { px: number; torso: number; tol: number }> = {};
  for (const [n, k] of Object.entries(kps ?? {})) {
    const p = P.landmarks[n] ?? [Number.NaN, Number.NaN];
    const d = Math.hypot(p[0] - k.at[0], p[1] - k.at[1]);
    miss[n] = { px: r1(d), torso: Math.round((d / torso) * 1000) / 1000, tol: Math.round(k.tol * 1000) / 1000 };
  }
  const ratio = Object.values(miss).map((m) => m.torso / m.tol);
  if (ratio.length > 0) out[Gate.Keypoints] = result(Gate.Keypoints, Math.max(...ratio), miss);
  return out;
};

const r3 = (v: number): number => Math.round(v * 1000) / 1000;
const roundAll = (x: unknown): unknown =>
  typeof x === 'number' ? r3(x) : Array.isArray(x) ? x.map(roundAll) : x !== null && typeof x === 'object' ? Object.fromEntries(Object.entries(x).map(([k, v]) => [k, roundAll(v)])) : x;

interface ClipPhysics { readonly clip: PhysicsClip; readonly scale: ReturnType<typeof skiScale>; readonly dt: number }

/** Newton-Euler checks over a pose file, its metric scale from the detected skis' image length against the figure's. */
export const clipPhysics = (poses: ReadonlyArray<PoseFrame>, bodies: ReadonlyArray<Body>, cams: ReadonlyArray<ObsFrame>, ski2d: ReadonlyArray<Record<string, number[]>> | null, lengths: Readonly<Record<string, number>>, fps: number): ClipPhysics => {
  const ratios = ski2d === null ? [] : bodies.flatMap((b, k) => {
    const cam = cams[k];
    if (cam === undefined) return [];
    const P = projectBody(b, cam);
    return SIDES.flatMap((s) => {
      const n = s === Side.Left ? 'left' : 'right';
      const [tip, tail] = [detection(ski2d[k]?.[`ski_tip_${n}`], DETECTOR_MIN.ski2d), detection(ski2d[k]?.[`ski_tail_${n}`], DETECTOR_MIN.ski2d)];
      const m = P.skis[s];
      const model = Math.hypot(m.tip[0] - m.tail[0], m.tip[1] - m.tail[1]);
      return tip === undefined || tail === undefined || model <= 0 ? [] : [Math.hypot(tip[0] - tail[0], tip[1] - tail[1]) / model];
    });
  });
  const scale = skiScale(ratios);
  const dt = 1 / fps;
  const clip = physicsGate(poses.map((f, k) => ({ mass: figureMass(f, lengths), skis: (bodies[k] as Body).ski })), {
    dt, scaleSigma: scale.sigma, snowHalf: FIT_SIGMA.snowHalf, ski: { tip: TIP, tail: TAIL, base: -THICK, halfWidth: SKI.width / 2 },
  });
  return { clip, scale, dt };
};

const physicsResult = (p: PhysicsClip['frames'][number]): GateResult => {
  const failed = Object.entries(p.checks).filter(([, c]) => c !== null && !c.pass).map(([k]) => k);
  const value = Math.max(0, ...Object.values(p.checks).map((c) => c?.score ?? 0));
  return { value: r3(value), threshold: THRESHOLD[Gate.Physics].value, pass: failed.length === 0, detail: roundAll({ failed, ...p }) };
};

const physicsSummary = (p: ClipPhysics): unknown => roundAll({
  dt: p.dt,
  half: p.clip.half,
  windowSeconds: p.clip.windowSeconds,
  comNoiseM: p.clip.comNoise,
  scale: p.scale,
  angularMomentum: p.clip.angularMomentum,
  loaded: p.clip.frames.filter((f) => f.loaded).length,
  skidding: p.clip.frames.filter((f) => f.skid.evident).length,
  failed: Object.fromEntries(['balance', 'foreAft', 'contact', 'edge'].map((c) => {
    const fr = p.clip.frames.flatMap((f, i) => (f.checks[c as keyof typeof f.checks]?.pass === false ? [i] : []));
    return [c, { count: fr.length, evaluated: p.clip.frames.filter((f) => f.checks[c as keyof typeof f.checks] !== null).length, frames: fr }];
  })),
});

if (import.meta.main) {
  const path = process.argv[2];
  if (path === undefined) throw new Error('usage: bun scripts/capture/gates.ts <clip_stage.json | clip_obs.json>');
  const doc = JSON.parse(readFileSync(path, 'utf8')) as { clip: string; stage?: string; limbs?: Record<string, number>; landmarkOffsets?: Record<string, number[]>; frames: Array<PoseFrame | ObsFrame> };
  const dir = dirname(path);
  const isObs = 'joints' in (doc.frames[0] ?? {});
  const stage = isObs ? 'capture' : (doc.stage ?? path.replace(/.*_/, '').replace(/\.json$/, ''));
  const obs = (isObs ? doc : JSON.parse(readFileSync(join(dir, `${doc.clip}_obs.json`), 'utf8'))) as { frames: ObsFrame[] };
  const skisPath = join(dir, `${doc.clip}_skis2d.json`);
  const skis = existsSync(skisPath) ? (JSON.parse(readFileSync(skisPath, 'utf8')) as { frames: SkisFrame[] }).frames : null;
  if (obs.frames.length !== doc.frames.length) throw new Error(`frame count ${doc.frames.length} != obs ${obs.frames.length}`);
  // Every 2D detector on the clip; the gate's ViTPose is always there.
  const torso = obs.frames.map((f) => torsoPx(f.kp2d));
  const rtmwPath = join(dir, `${doc.clip}_kp2d.json`);
  const ski2dPath = join(dir, `${doc.clip}_ski2d_kp.json`);
  const rtmw = existsSync(rtmwPath) ? (JSON.parse(readFileSync(rtmwPath, 'utf8')) as { frames: Array<{ kp: Record<string, number[]> }> }).frames : null;
  const ski2d = existsSync(ski2dPath) ? (JSON.parse(readFileSync(ski2dPath, 'utf8')) as { frames: Array<Record<string, number[]>> }).frames : null;
  const per = (f: (k: number) => Detection): Detection[] => obs.frames.map((_, k) => f(k));
  const kps = keypointReference(Object.fromEntries(Object.entries(COCO).map(([n, i]) => {
    const [j, s] = n.split('.') as [string, string];
    const name = `${j}_${s === 'L' ? 'left' : 'right'}`;
    const dets = [per((k) => detection(obs.frames[k]?.kp2d[i], DETECTOR_MIN.vitpose))];
    if (rtmw !== null) dets.push(per((k) => detection(rtmw[k]?.kp[`${s === 'L' ? 'left' : 'right'}_${j}`], RTMW_SCORE.min / RTMW_SCORE.reference, RTMW_SCORE.reference)));
    if (ski2d !== null && SKI2D_BODY.has(j)) dets.push(per((k) => detection(ski2d[k]?.[name], DETECTOR_MIN.ski2d)));
    return [n, dets];
  })), torso);
  const bodies = doc.frames.map((f) => (isObs ? captureBody(f as ObsFrame) : figureBody(f as PoseFrame, segmentLengths(doc.limbs), doc.landmarkOffsets)));
  const fps = (doc as { fps?: number }).fps ?? 24;
  const physics = isObs ? null : clipPhysics(doc.frames as PoseFrame[], bodies, obs.frames, ski2d, segmentLengths(doc.limbs), (doc as { videoFps?: number | null }).videoFps ?? fps);
  const frames = bodies.map((b, i) => {
    const gates = gateFrame(b, obs.frames[i] as ObsFrame, skis?.[i] ?? null, bodies.slice(Math.max(0, i - SNOW_HALF), i + SNOW_HALF + 1), kps[i] ?? null);
    const ph = physics?.clip.frames[i];
    if (ph !== undefined) gates[Gate.Physics] = physicsResult(ph);
    const failed = Object.entries(gates).filter(([, g]) => !g.pass).map(([k]) => k);
    return { i, t: (doc.frames[i] as { t?: number }).t ?? i / fps, pass: failed.length === 0, failed, gates };
  });
  const summary = Object.fromEntries(Object.values(Gate).map((g) => {
    const vs = frames.flatMap((f) => (f.gates[g] === undefined ? [] : [f.gates[g].value]));
    const failed = frames.filter((f) => f.gates[g]?.pass === false).map((f) => f.i);
    return [g, { evaluated: vs.length, failed: failed.length, failedFrames: failed, median: quantile(vs, 0.5), p95: quantile(vs, 0.95), max: vs.length ? Math.max(...vs) : null, ...THRESHOLD[g] }];
  }));
  const out = {
    clip: doc.clip, stage, source: path, subject: isObs ? 'SMPL-X capture' : 'skibuddy FK',
    references: { capture: `${doc.clip}_obs.json`, skis2d: skis === null ? null : `${doc.clip}_skis2d.json`, keypoints: ['vitpose', ...(rtmw === null ? [] : ['rtmw']), ...(ski2d === null ? [] : ['ski2d'])] },
    keypointTolerance: Object.fromEntries(Object.keys(COCO).map((n) => [n, kps.find((f) => f[n] !== undefined)?.[n]?.tol ?? null])),
    pass: frames.every((f) => f.pass), failedFrames: frames.filter((f) => !f.pass).map((f) => f.i), summary,
    physics: physics === null ? null : physicsSummary(physics),
    frames,
  };
  const outPath = join(dir, `${doc.clip}_${stage}_gates.json`);
  writeFileSync(outPath, JSON.stringify(out));
  console.log(`${outPath}: ${out.pass ? 'PASS' : 'FAIL'} (${out.failedFrames.length}/${frames.length} frames fail)`);
  if (out.physics !== null) console.log(`  physics: ${JSON.stringify(out.physics)}`);
  for (const [g, s] of Object.entries(summary)) console.log(`  ${g.padEnd(10)} fail ${String(s.failed).padStart(2)}/${s.evaluated}  median ${s.median.toFixed(3)} p95 ${s.p95.toFixed(3)} max ${s.max?.toFixed(3)}  thr ${s.value} ${s.unit}`);
}
