// Usage: bun scripts/capture/solve.ts <clip_targets.json> <gvhmr_trunk.csv> <video.mp4> <out dir>
// Cleanup IK of a retargeted video capture (scratchpad export, derived angles/positions only) into skibuddy q.
// Writes <clip>_pose.json (q-table encoding, NAMES order) and <clip>_ik.json (per-frame degrees for the capture viewer).
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { buildCaptureProblem, prepare, solveCapture } from '../../src/viewer/motion/capture/ik';
import type { CaptureClip } from '../../src/viewer/motion/capture/ik';
import { gatesOf, pelvisOf, reportOf } from '../../src/viewer/motion/capture/report';
import { quatOf } from '../../src/viewer/motion/capture/signal';
import { encodeQ } from '../../src/viewer/motion/q-table';
import { NAMES } from '../../src/viewer/motion/turn';
import { COORDINATES, DofKind } from '../../src/viewer/skeleton';

const [targetsPath, csvPath, video, outDir] = process.argv.slice(2);
if (targetsPath === undefined || csvPath === undefined || video === undefined || outDir === undefined) throw new Error('usage: solve.ts <targets.json> <trunk.csv> <video> <out dir>');

const DEG = Math.PI / 180;
const raw = JSON.parse(readFileSync(targetsPath, 'utf8')) as CaptureClip;
// Pluggable ski observation: {"yawDeg": {"R": [deg | null, ...], "L": [...]}}, capture world, yaw = atan2(x, z) about +y.
const skisPath = join(dirname(targetsPath), `${raw.clip}_skis2d.json`);
const skis = existsSync(skisPath) ? (JSON.parse(readFileSync(skisPath, 'utf8')) as { yawDeg: Record<string, Array<number | null>> }) : undefined;
const clip: CaptureClip = skis === undefined ? raw : { ...raw, skiYaw: Object.fromEntries(Object.entries(skis.yawDeg).map(([s, ys]) => [s, ys.map((y) => (y === null ? null : y * DEG))])) };
const [head = '', ...rows] = readFileSync(csvPath, 'utf8').trim().split('\n');
const cols = head.split(',');
const csv = (name: string): number[] => rows.map((r) => Number(r.split(',')[cols.indexOf(name)]));

/** Which DOFs the capture determines and which come from priors (design.md trust levels). */
const PROVENANCE: Readonly<Record<string, string>> = {
  pelvis_tx: 'capture', pelvis_ty: 'capture', pelvis_tz: 'capture', pelvis_rotation: 'capture', pelvis_list: 'capture',
  pelvis_tilt: 'prior: trunk direction (capture) split by lumbo-pelvic rhythm',
  lumbar_flexion: 'prior: lumbo-pelvic rhythm', thoracic_flexion: 'prior: thoracic/lumbar ratio',
  hip_flexion: 'capture', knee_flexion: 'capture', hip_adduction: 'capture (fair)',
  hip_rotation: 'prior: neutral (σ 10°) + ski clearance; ski heading when <clip>_skis2d.json exists', ankle_dorsiflexion: 'skis on snow + cuff',
};
const provenanceOf = (name: string): string => PROVENANCE[name] ?? PROVENANCE[name.replace(/\.[RL]$/, '')] ?? 'capture (low trust) + smoothness';

const start = performance.now();
const targets = prepare(clip);
const cp = buildCaptureProblem(targets);
const result = solveCapture(cp);
const qs = cp.cycle.unpack(result.x);
const seed = Array.from({ length: clip.frames }, (_, k) => COORDINATES.map((c) => clip.seed[c.name]?.[k] ?? 0));
const report = reportOf(cp, qs, seed, { R: csv('knee_flex_R_deg'), L: csv('knee_flex_L_deg') });
const gates = gatesOf(cp, qs);
const solver = { converged: result.converged, feasible: result.feasible, violation: result.violation, iterations: result.iterations, outer: result.outer, cost: result.cost, seconds: (performance.now() - start) / 1000 };

const padded = qs.map((q) => Float64Array.from(NAMES, (_, i) => (i < COORDINATES.length ? (q[i] ?? 0) : 0)));
const pose = {
  clip: clip.clip,
  fps: clip.fps,
  frames: clip.frames,
  // As QTables: one base64 int16 run of frames × names, 1e-4 rad (or m) per unit; decode with q-table.ts decodeQ.
  names: NAMES,
  q: encodeQ(padded),
  root: {
    note: 'forward(q, [0,0,0], SEGMENT_NAMES, ref): ref = yaw(heading) row-major about +y; gravity world, y up, template scale, metres',
    heading: targets.heading,
  },
  scale: targets.scale,
  femurTwistDeg: report.twistDeg,
  snow: targets.snow.map((p, k) => ({ n: p.n, d: p.d, stance: targets.stance[k] })),
  provenance: Object.fromEntries(COORDINATES.map((c) => [c.name, provenanceOf(c.name)])),
  solver,
  skiObservation: skis === undefined ? null : skisPath,
  checks: report,
  gates,
};
writeFileSync(join(outDir, `${clip.clip}_pose.json`), JSON.stringify(pose));

const ik = {
  clip: clip.clip,
  video,
  fps: clip.fps,
  frames: qs.map((q, k) => {
    const pel = pelvisOf(cp, q, k);
    const [x, y, z, w] = quatOf(pel.R);
    return {
      t: k / clip.fps,
      q: Object.fromEntries(COORDINATES.flatMap((c, i) => (c.kind === DofKind.Rotation ? [[c.name, Number(((q[i] ?? 0) / DEG).toFixed(3))]] : []))),
      pelvis: { pos: pel.p.map((v) => Number(v.toFixed(5))), quat: [x, y, z, w].map((v) => Number(v.toFixed(6))) },
    };
  }),
};
writeFileSync(join(outDir, `${clip.clip}_ik.json`), JSON.stringify(ik));
console.log(JSON.stringify({ solver, ...report, gates: { worst: gates.worst, pass: gates.pass } }, (_k, v: unknown) => (typeof v === 'number' ? Number(v.toFixed(2)) : v), 1));
