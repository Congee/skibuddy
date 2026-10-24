import type { Intensity } from '../../content/schema';
import { BodySide, segmentIndex } from '../figure';
import type { Mat4 } from '../mat4';
import { POSE_CHANNELS, poseFromChannels, poseToChannels, segmentMatrices } from '../pose';
import type { Pose } from '../pose';
import { samplePose } from '../pose-table';
import type { PoseTable } from '../pose-table';
import type { Rigid } from './fk';
import { REST_WORLD, rootWorlds } from './q-table';
import { bendCurvatureOf } from '../../physics/ski-bend';
import { surfaceFor } from '../surface';
import { skiGoal } from './turn';

/**
 * Legacy-channel adapter: the Pose channels the viewer still reads (poles, capsule figure, camera locks), fitted so
 * the capsule figure's segments turn as the solved ISB segments do. Lean, pole timing, reach and rise come from the old table.
 */

/** Capsule segment, ISB segment, weight; arms count less, their legacy rig being coarser. The girdles keep the old table's. */
const PAIRS: ReadonlyArray<readonly [string, string, number]> = [
  ['pelvis', 'pelvis', 1],
  ['trunk', 'thorax', 1],
  ['head', 'head', 0.5],
  ...[BodySide.Right, BodySide.Left].flatMap((side) => {
    const s = side === BodySide.Right ? 'R' : 'L';
    return [
      [`${side}-thigh`, `femur.${s}`, 1],
      [`${side}-shin`, `tibia.${s}`, 1],
      [`${side}-boot`, `foot.${s}`, 2],
      [`${side}-upper-arm`, `humerus.${s}`, 0.3],
      [`${side}-forearm`, `forearm.${s}`, 0.3],
    ] as const;
  }),
];
const INDEX = PAIRS.map(([leg]) => segmentIndex(leg));
// The lean is the balance axis the physics sets; fitted, it trades against list and angulation.
const FIXED: ReadonlySet<string> = new Set(['lean', 'poleTouch', 'reach', 'rise', 'balance', ...POSE_CHANNELS.filter((c) => c.includes('Girdle'))]);
const FREE = POSE_CHANNELS.flatMap((c, i) => (FIXED.has(c) ? [] : [i]));
/** Pull toward the old pose, per radian against one of segment misfit; keeps redundant channels put (inferred). */
const ANCHOR = 0.1;

const rot = (m: Mat4): number[] => [m[0], m[4], m[8], m[1], m[5], m[9], m[2], m[6], m[10]].map((v) => v ?? 0);
const mul3 = (a: ReadonlyArray<number>, b: ReadonlyArray<number>): number[] =>
  [0, 1, 2].flatMap((r) => [0, 1, 2].map((c) => (a[3 * r] ?? 0) * (b[c] ?? 0) + (a[3 * r + 1] ?? 0) * (b[3 + c] ?? 0) + (a[3 * r + 2] ?? 0) * (b[6 + c] ?? 0)));
const transpose = (a: ReadonlyArray<number>): number[] => [0, 3, 6, 1, 4, 7, 2, 5, 8].map((i) => a[i] ?? 0);

/** The capsule figure's rest frames, where the ISB rest pose maps. */
const LEGACY_REST = segmentMatrices(poseFromChannels(POSE_CHANNELS.map(() => 0)), false);
/** Per pair: ISB rest → capsule rest, so a target is R_isb · this. */
const ALIGN = PAIRS.map(([, isb], k) => {
  const r = REST_WORLD[isb];
  if (r === undefined) throw new Error(`no segment ${isb}`);
  return mul3(transpose(r.R.map(Number)), rot(LEGACY_REST[INDEX[k] ?? 0] ?? new Float32Array(16)));
});

const residuals = (channels: ReadonlyArray<number>, targets: ReadonlyArray<ReadonlyArray<number>>, anchor: ReadonlyArray<number>): number[] => {
  const world = segmentMatrices(poseFromChannels(channels), false);
  const out: number[] = [];
  PAIRS.forEach(([, , w], k) => {
    const R = rot(world[INDEX[k] ?? 0] ?? new Float32Array(16));
    const T = targets[k] ?? [];
    // Half the sum of column crosses: the small-angle rotation from fitted to target.
    for (let i = 0; i < 3; i++) {
      let v = 0;
      for (let c = 0; c < 3; c++) {
        const [j, l] = [(i + 1) % 3, (i + 2) % 3];
        v += (R[3 * j + c] ?? 0) * (T[3 * l + c] ?? 0) - (R[3 * l + c] ?? 0) * (T[3 * j + c] ?? 0);
      }
      out.push(0.5 * w * v);
    }
  });
  for (const i of FREE) out.push(ANCHOR * ((channels[i] ?? 0) - (anchor[i] ?? 0)));
  return out;
};

const solveDense = (A: number[][], b: number[]): number[] => {
  const n = b.length;
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(A[r]?.[c] ?? 0) > Math.abs(A[p]?.[c] ?? 0)) p = r;
    [A[c], A[p]] = [A[p] ?? [], A[c] ?? []];
    [b[c], b[p]] = [b[p] ?? 0, b[c] ?? 0];
    for (let r = c + 1; r < n; r++) {
      const f = (A[r]?.[c] ?? 0) / (A[c]?.[c] ?? 1);
      for (let k = c; k < n; k++) (A[r] as number[])[k] = (A[r]?.[k] ?? 0) - f * (A[c]?.[k] ?? 0);
      b[r] = (b[r] ?? 0) - f * (b[c] ?? 0);
    }
  }
  const x = Array.from({ length: n }, () => 0);
  for (let r = n - 1; r >= 0; r--) {
    let s = b[r] ?? 0;
    for (let k = r + 1; k < n; k++) s -= (A[r]?.[k] ?? 0) * (x[k] ?? 0);
    x[r] = s / (A[r]?.[r] ?? 1);
  }
  return x;
};

const norm2 = (r: ReadonlyArray<number>): number => r.reduce((s, v) => s + v * v, 0);

/** Least-squares legacy channels for one frame's ISB root frames, from `start`, anchored to `old`; returns the rms misfit too. */
export const fitPose = (world: Readonly<Record<string, Rigid>>, old: Pose, start: Pose = old): { readonly pose: Pose; readonly misfit: number } => {
  const targets = PAIRS.map(([, isb], k) => {
    const m = world[isb];
    if (m === undefined) throw new Error(`no segment ${isb}`);
    return mul3(m.R.map(Number), ALIGN[k] ?? []);
  });
  const anchor = poseToChannels({ ...old, balance: 0 });
  const keep = poseToChannels({ ...old, balance: 0 });
  let x = poseToChannels(start).map((v, i) => (FREE.includes(i) ? v : (keep[i] ?? 0)));
  let r = residuals(x, targets, anchor);
  let lambda = 1e-3;
  const h = 1e-4;
  for (let it = 0; it < 200; it++) {
    const J = FREE.map((i) => {
      const y = [...x];
      y[i] = (y[i] ?? 0) + h;
      return residuals(y, targets, anchor).map((v, k) => (v - (r[k] ?? 0)) / h);
    });
    const g = J.map((col) => col.reduce((s, v, k) => s + v * (r[k] ?? 0), 0));
    const H = J.map((a) => J.map((b) => a.reduce((s, v, k) => s + v * (b[k] ?? 0), 0)));
    let improved = false;
    for (let tries = 0; tries < 8 && !improved; tries++) {
      const A = H.map((row, i) => row.map((v, j) => (i === j ? v * (1 + lambda) + 1e-12 : v)));
      const dx = solveDense(A, g.map((v) => -v));
      const y = [...x];
      FREE.forEach((i, k) => (y[i] = (y[i] ?? 0) + (dx[k] ?? 0)));
      const ry = residuals(y, targets, anchor);
      if (norm2(ry) < norm2(r)) {
        improved = norm2(r) - norm2(ry) > 1e-20;
        [x, r] = [y, ry];
        lambda = Math.max(1e-7, lambda / 3);
        if (!improved) break;
      } else lambda *= 10;
    }
    if (!improved) break;
  }
  const seg = r.slice(0, 3 * PAIRS.length);
  return { pose: poseFromChannels(x), misfit: Math.sqrt(norm2(seg) / PAIRS.length) };
};

/** The legacy table of a migrated drill: one adapted pose per solved frame. */
export const adaptTable = (drill: string, intensity: Intensity, q: ReadonlyArray<ArrayLike<number>>, old: PoseTable): { readonly table: PoseTable; readonly misfit: number } => {
  let prev: Pose | undefined;
  let misfit = 0;
  const surface = surfaceFor(drill, intensity);
  const table = q.map((frame, k) => {
    const t = k / q.length;
    const was = samplePose(old, t);
    const fit = fitPose(rootWorlds(drill, intensity, frame, t), was, prev ?? was);
    prev = fit.pose;
    misfit = Math.max(misfit, fit.misfit);
    // The solve's own bend per frame and side; the fit leaves it alone.
    const [out, ins] = skiGoal(drill, intensity, surface, t).bend.map(bendCurvatureOf);
    return { ...fit.pose, outside: { ...fit.pose.outside, bend: out ?? 0 }, inside: { ...fit.pose.inside, bend: ins ?? 0 } };
  });
  return { table, misfit };
};
