import { Boundary, Cycle } from '../../../solve/cycle';
import type { Dual } from '../../../solve/dual';
import { BlockKind, prior, type Block, type Problem } from '../../../solve/problem';
import { solve, type SolveResult } from '../../../solve/solve';
import { ANKLE_DORSIFLEXION_KNEE_FLEXED, JOINT_LIMITS } from '../../joint-limits';
import { COORDINATES, REST_POSE, SEGMENT_NAMES, SKELETON_DATA, Side } from '../../skeleton';
import { Terrain } from '../../skier';
import { CUFF } from '../cuff';
import { add, axisOf, chainOf, cross3, dot3, forward, mul, skiFrame, sub, sub3, transform, value } from '../fk';
import type { Rigid, Scalar, V3 } from '../fk';
import { LEG_LENGTH, skiPoints } from '../turn';
import { femurTwist } from './calibrate';
import { crossClearances } from './clearance';
import { column, cross, dot, minus, mm, mt, rotY, unit } from './geometry';
import type { M3n, V3n } from './geometry';
import { lumbarShare } from './rhythm';
import { butterworth2, filterRotations, filterSeries, filtfilt } from './signal';
import { fitSnow, lowered } from './snow';
import type { Plane } from './snow';

const DEG = Math.PI / 180;
const SIDES = [Side.Right, Side.Left] as const;
const NC = COORDINATES.length;
const at = (name: string): number => COORDINATES.findIndex((c) => c.name === name);

/** Retargeted capture as scripts/capture exports it: derived frames and positions only, gravity world (y up), metres. */
export interface CaptureClip {
  readonly clip: string;
  readonly fps: number;
  readonly frames: number;
  /** The capture body's hip height over its sole at rest. */
  readonly legLength: number;
  /** Sequential retarget per coordinate name, radians per frame: the IK's seed and its knee/hip targets. */
  readonly seed: Readonly<Record<string, ReadonlyArray<number>>>;
  /** Per ISB segment, its world rotation per frame (row-major). */
  readonly frames3: Readonly<Record<string, ReadonlyArray<ReadonlyArray<number>>>>;
  /** Per side, the captured ski (binding) frame per frame. */
  readonly ski: Readonly<Record<string, ReadonlyArray<ReadonlyArray<number>>>>;
  /** Named joint centres and sole points per frame. */
  readonly points: Readonly<Record<string, ReadonlyArray<ReadonlyArray<number>>>>;
  /** Observed ski yaw per side and frame (radians about +y, atan2(x, z) of the ski's long axis), null where unseen. */
  readonly skiYaw?: Readonly<Record<string, ReadonlyArray<number | null>>>;
}

/** Trust as σ per segment axis [x, y (long axis), z], degrees; absent means no orientation target (design.md). */
export const ORIENT_SIGMA: Readonly<Record<string, readonly [number, number, number]>> = {
  // Heading and list fair-good; tilt left to the trunk target and the rhythm prior.
  pelvis: [6, 4, 90],
  // Spine shape is prior-driven: only the thorax's axial heading.
  thorax: [90, 15, 90],
  neck: [15, 15, 15],
  // Thigh direction only: the capture's foot and shin rotations are unreliable, so femur twist is unobserved.
  'femur.R': [3, 90, 3],
  'femur.L': [3, 90, 3],
  'scapula.R': [20, 20, 20],
  'scapula.L': [20, 20, 20],
  'humerus.R': [8, 15, 8],
  'humerus.L': [8, 15, 8],
  'forearm.R': [10, 20, 10],
  'forearm.L': [10, 20, 10],
  'hand.R': [20, 20, 20],
  'hand.L': [20, 20, 20],
};

/** Joint-centre targets: the segment that carries each, and σ in metres. */
const POINT_SEGMENT: Readonly<Record<string, readonly [string, string, number]>> = {
  mid_hips: ['pelvis', 'pelvis', 0.015],
  'knee.R': ['tibia.R', 'knee.R', 0.03],
  'knee.L': ['tibia.L', 'knee.L', 0.03],
  'ankle.R': ['foot.R', 'ankle.R', 0.03],
  'ankle.L': ['foot.L', 'ankle.L', 0.03],
  'shoulder.R': ['humerus.R', 'shoulder.R', 0.05],
  'shoulder.L': ['humerus.L', 'shoulder.L', 0.05],
  'elbow.R': ['forearm.R', 'elbow.R', 0.05],
  'elbow.L': ['forearm.L', 'elbow.L', 0.05],
  'wrist.R': ['hand.R', 'wrist.R', 0.06],
  'wrist.L': ['hand.L', 'wrist.L', 0.06],
};

/** Coordinate targets from the sequential retarget, σ radians. */
const COORD_SIGMA: Readonly<Record<string, number>> = {
  'knee_flexion.R': 3 * DEG,
  'knee_flexion.L': 3 * DEG,
  // Inherits the capture's pelvis tilt, which the spine prior overrides: the thigh's world direction carries it.
  'hip_flexion.R': 10 * DEG,
  'hip_flexion.L': 10 * DEG,
};

const SKI_HEADING_SIGMA = 3 * DEG;
/** Unobserved hip rotation held near neutral, inferred: skis roughly along the pelvis heading. */
const HIP_ROTATION_SIGMA = 10 * DEG;
const RHYTHM_SIGMA = 5 * DEG;
/** Thoracic/lumbar flexion, inferred from Tafazzol 2014's peak means: thorax 121° − pelvis 53.0° − lumbar 60.2°. */
export const THORACIC_PER_LUMBAR = (121 - 53.0 - 60.2) / 60.2;
const THORACIC_SIGMA = 3 * DEG;
const SMOOTH_SIGMA = 1 * DEG;
export const CUTOFF_HZ = 6;
const SNOW_HALF = 6;
const SNOW_LIFT = 0.05;

const REST_Q = COORDINATES.map((c) => REST_POSE[c.name] ?? 0);
const REST = forward(REST_Q);
export const restR = (seg: string): number[] => (REST[seg]?.R ?? []).map(value);
export const restP = (seg: string): V3n => (REST[seg]?.p ?? [0, 0, 0]).map(value) as V3n;

/** A rest-world joint in its carrying segment's frame. */
export const localPoint = (seg: string, joint: string): V3n => {
  const o = restP(seg);
  const world: ReadonlyArray<number> = joint === 'pelvis' ? o : (SKELETON_DATA.joints[joint] ?? o);
  const d = minus(world, o);
  return [0, 1, 2].map((c) => dot(column(restR(seg), c), d)) as V3n;
};
const LOCAL_POINT: Readonly<Record<string, V3n>> = Object.fromEntries(Object.entries(POINT_SEGMENT).map(([k, [seg, j]]) => [k, localPoint(seg, j)]));

const SKI = skiPoints(Terrain.Groomed);
const SKI_HALF_WIDTH = SKI.width / 2;
const SKI_HALF_LENGTH = (SKI.ends.tip - SKI.ends.tail) / 2;
/** Foot sole to ski base at rest: binding stack plus ski. */
export const SKI_CENTRE = SKI.centre;
const CLEARANCE_ROWS = Object.values(crossClearances(REST)).flat().length;
export const STACK = (SKELETON_DATA.gear_fit[Side.Right].sole) - value(transform(skiFrame(REST, Side.Right), SKI.centre)[1]);

export interface CaptureTargets {
  readonly frames: number;
  readonly fps: number;
  /** Template leg length over the capture's. */
  readonly scale: number;
  /** Per frame, the root reference: yaw of the captured pelvis (fk.ts `ref`). */
  readonly ref: ReadonlyArray<M3n>;
  readonly heading: ReadonlyArray<number>;
  readonly orient: Readonly<Record<string, ReadonlyArray<M3n>>>;
  readonly points: Readonly<Record<string, ReadonlyArray<V3n>>>;
  /** Observed ski long axis per side and frame, absent where unseen. */
  readonly skiAxis: Readonly<Record<string, ReadonlyArray<V3n | undefined>>>;
  readonly coords: Readonly<Record<string, ReadonlyArray<number>>>;
  /** Unit mid-hips → C7T1 per frame. */
  readonly trunk: ReadonlyArray<V3n>;
  /** Ski-base plane per frame. */
  readonly snow: ReadonlyArray<Plane>;
  readonly stance: ReadonlyArray<readonly [boolean, boolean]>;
  readonly twist: Readonly<Record<string, { readonly theta: number; readonly before: number; readonly after: number }>>;
}

/** Scale to the template by leg length, low-pass every target, calibrate femur twist, fit the snow. */
export const prepare = (clip: CaptureClip): CaptureTargets => {
  const K = clip.frames;
  const f = butterworth2(CUTOFF_HZ, clip.fps);
  const scale = LEG_LENGTH / clip.legLength;
  const points: Record<string, V3n[]> = Object.fromEntries(
    Object.entries(clip.points).map(([k, ps]) => [k, filterSeries(f, ps.map((p) => p.map((v) => v * scale))) as V3n[]]),
  );
  const orient: Record<string, M3n[]> = Object.fromEntries(Object.entries(clip.frames3).map(([k, Rs]) => [k, filterRotations(f, Rs)]));
  const coords: Record<string, number[]> = Object.fromEntries(Object.entries(clip.seed).map(([k, xs]) => [k, filtfilt(f, xs)]));
  const twist: Record<string, { theta: number; before: number; after: number }> = {};
  for (const s of SIDES) {
    const local = mm(mt(restR(`femur.${s}`)), restR(`tibia.${s}`));
    const t = femurTwist(orient[`femur.${s}`] ?? [], orient[`tibia.${s}`] ?? [], local);
    // Diagnostic only: it leans on the capture's shin rotation, which is unreliable.
    twist[s] = t;
  }
  const heading = Array.from({ length: K }, (_, k) => {
    const z = column(orient['pelvis']?.[k] ?? rotY(0), 2);
    return Math.atan2(z[0], z[2]);
  });
  const soles = Array.from({ length: K }, (_, k) =>
    SIDES.map((s) => ['heel', 'big', 'small'].map((p) => points[`${p}.${s}`]?.[k] ?? ([0, 0, 0] as V3n))) as unknown as readonly [V3n[], V3n[]],
  );
  const fit = fitSnow(soles, SNOW_HALF, SNOW_LIFT);
  const trunk = Array.from({ length: K }, (_, k) => unit(minus(points['c7t1']?.[k] ?? [0, 1, 0], points['mid_hips']?.[k] ?? [0, 0, 0])));
  return {
    frames: K,
    fps: clip.fps,
    scale,
    ref: heading.map(rotY),
    heading,
    orient,
    points,
    skiAxis: Object.fromEntries(SIDES.map((s) => [s, Array.from({ length: K }, (_, k) => {
      const yaw = clip.skiYaw?.[s]?.[k];
      return yaw === null || yaw === undefined ? undefined : ([Math.sin(yaw), 0, Math.cos(yaw)] as V3n);
    })])),
    coords,
    trunk,
    snow: fit.planes.map((p) => lowered(p, STACK)),
    stance: fit.stance,
    twist,
  };
};

/** Joint limits ∩ the boot cuff, as turn.ts's bounds; translations free. */
export const limits = (): { lo: number[]; hi: number[] } => ({
  lo: COORDINATES.map((c) => Math.max(JOINT_LIMITS[c.name]?.lower.value ?? -Infinity, CUFF[c.name]?.[0] ?? -Infinity)),
  hi: COORDINATES.map((c) =>
    Math.min(c.name.startsWith('ankle_dorsiflexion') ? ANKLE_DORSIFLEXION_KNEE_FLEXED.value : (JOINT_LIMITS[c.name]?.upper.value ?? Infinity), CUFF[c.name]?.[1] ?? Infinity),
  ),
});

const v3 = (v: ReadonlyArray<number>): V3 => [v[0] ?? 0, v[1] ?? 0, v[2] ?? 0];
const TRUNK_CHAIN = chainOf(['neck']);
const LEGS = chainOf(['foot.R', 'foot.L']);

/** Orientation misfit target → actual as a small rotation vector in the target's axes. */
export const orientRows = (actual: Rigid, target: M3n): V3 => {
  const cols = [0, 1, 2].map((i) => cross3(v3(column(target, i)), axisOf(actual, i as 0 | 1 | 2)));
  const e = [0, 1, 2].map((c) => mul(0.5, add(add(cols[0]?.[c] ?? 0, cols[1]?.[c] ?? 0), cols[2]?.[c] ?? 0))) as unknown as V3;
  return [0, 1, 2].map((j) => dot3(e, v3(column(target, j)))) as unknown as V3;
};

/** Signed height of the ski's lower edge over the plane, and its long axis's climb over the half length. */
export const skiOnSnow = (ski: Rigid, plane: Plane): readonly [Scalar, Scalar] => {
  const n = v3(plane.n);
  const c = transform(ski, SKI.centre);
  const across = dot3(axisOf(ski, 0), n);
  const a2 = add(mul(across, across), 1e-8);
  const abs = typeof a2 === 'number' ? Math.sqrt(a2) : a2.sqrt();
  return [sub(sub(dot3(c, n), plane.d), mul(SKI_HALF_WIDTH, abs)), mul(SKI_HALF_LENGTH, dot3(axisOf(ski, 2), n))];
};

export interface CaptureProblem {
  readonly targets: CaptureTargets;
  readonly cycle: Cycle;
  readonly problem: Problem;
  readonly lower: Float64Array;
  readonly upper: Float64Array;
}

export const buildCaptureProblem = (tg: CaptureTargets): CaptureProblem => {
  const K = tg.frames;
  const cycle = new Cycle({ frames: K, coords: NC, boundary: Boundary.Open });
  const blocks: Block[] = [];
  const segs = Object.keys(ORIENT_SIGMA);
  const pts = Object.keys(POINT_SEGMENT).filter((k) => tg.points[k] !== undefined);
  const [iTilt, iLumbar, iThoracic] = [at('pelvis_tilt'), at('lumbar_flexion'), at('thoracic_flexion')];
  for (let k = 0; k < K; k++) {
    const ref = tg.ref[k] ?? rotY(0);
    const plane = tg.snow[k] ?? { n: [0, 1, 0] as V3n, d: 0 };
    blocks.push(
      cycle.frameBlock({ name: `capture ${k}`, group: 'capture', kind: BlockKind.Goal, size: 3 * segs.length + 3 * pts.length }, [k], ([q = []]) => {
        const w = forward(q, [0, 0, 0], SEGMENT_NAMES, ref);
        const rows: Scalar[] = [];
        for (const seg of segs) {
          const T = tg.orient[seg]?.[k];
          const sg = ORIENT_SIGMA[seg] ?? [1, 1, 1];
          const m = w[seg];
          if (T === undefined || m === undefined) throw new Error(`no target for ${seg}`);
          orientRows(m, T).forEach((r, j) => rows.push(mul(1 / ((sg[j] ?? 1) * DEG), r)));
        }
        for (const p of pts) {
          const [seg, , sigma] = POINT_SEGMENT[p] ?? ['pelvis', '', 1];
          const m = w[seg];
          if (m === undefined) throw new Error(`${seg} not solved`);
          const x = transform(m, v3(LOCAL_POINT[p] ?? [0, 0, 0]));
          const t = tg.points[p]?.[k] ?? [0, 0, 0];
          x.forEach((c, j) => rows.push(mul(1 / sigma, sub(c, t[j] ?? 0))));
        }
        return rows as Dual[];
      }),
    );
    const seen = SIDES.filter((s) => tg.skiAxis[s]?.[k] !== undefined);
    if (seen.length > 0)
      blocks.push(
        cycle.frameBlock({ name: `ski heading ${k}`, group: 'ski heading', kind: BlockKind.Goal, size: seen.length }, [k], ([q = []]) => {
          const w = forward(q, [0, 0, 0], LEGS, ref);
          return seen.map((s) => {
            const across = unit(cross(plane.n, tg.skiAxis[s]?.[k] ?? [0, 0, 1]));
            return mul(1 / SKI_HEADING_SIGMA, dot3(axisOf(skiFrame(w, s), 2), v3(across)));
          }) as Dual[];
        }),
      );
    blocks.push(
      cycle.frameBlock({ name: `clearance ${k}`, group: 'ski clearance', kind: BlockKind.Inequality, size: CLEARANCE_ROWS }, [k], ([q = []]) =>
        Object.values(crossClearances(forward(q, [0, 0, 0], LEGS, ref))).flat() as Dual[],
      ),
    );
    const d = tg.trunk[k] ?? [0, 1, 0];
    const e1 = unit(cross(d, Math.abs(d[0]) < 0.9 ? [1, 0, 0] : [0, 0, 1]));
    const e2 = cross(d, e1);
    blocks.push(
      cycle.frameBlock({ name: `trunk ${k}`, group: 'trunk direction', kind: BlockKind.Equality, size: 2 }, [k], ([q = []]) => {
        const w = forward(q, [0, 0, 0], TRUNK_CHAIN, ref);
        const t = sub3(w['neck']?.p ?? [0, 0, 0], w['pelvis']?.p ?? [0, 0, 0]);
        return [dot3(t, v3(e1)), dot3(t, v3(e2))] as Dual[];
      }),
    );
    const down = SIDES.filter((_, i) => tg.stance[k]?.[i] ?? true);
    if (down.length > 0)
      blocks.push(
        cycle.frameBlock({ name: `snow ${k}`, group: 'skis on snow', kind: BlockKind.Equality, size: 2 * down.length }, [k], ([q = []]) => {
          const w = forward(q, [0, 0, 0], LEGS, ref);
          return down.flatMap((s) => skiOnSnow(skiFrame(w, s), plane)) as Dual[];
        }),
      );
    blocks.push(
      cycle.frameBlock({ name: `spine prior ${k}`, group: 'spine prior', kind: BlockKind.Prior, size: 2 }, [k], ([q = []]) => {
        const [tilt, lumbar, thoracic] = [q[iTilt], q[iLumbar], q[iThoracic]];
        if (tilt === undefined || lumbar === undefined || thoracic === undefined) throw new Error('missing spine coordinate');
        return [
          mul(1 / RHYTHM_SIGMA, sub(lumbar, lumbarShare(add(tilt, lumbar)))),
          mul(1 / THORACIC_SIGMA, sub(thoracic, mul(THORACIC_PER_LUMBAR, lumbar))),
        ] as Dual[];
      }),
    );
    for (const s of SIDES) blocks.push(prior(`hip rotation prior ${s} ${k}`, [cycle.ref(k, at(`hip_rotation.${s}`))], [REST_POSE[`hip_rotation.${s}`] ?? 0], [HIP_ROTATION_SIGMA], 'hip rotation prior'));
    for (const [name, sigma] of Object.entries(COORD_SIGMA)) {
      const mu = tg.coords[name]?.[k];
      if (mu !== undefined) blocks.push(prior(`capture ${name} ${k}`, [cycle.ref(k, at(name))], [mu], [sigma], `capture ${name.replace(/\.[RL]$/, '')}`));
    }
  }
  blocks.push(...cycle.smoothness(1 / SMOOTH_SIGMA));
  const { lo, hi } = limits();
  const { lower, upper } = cycle.bounds(lo, hi);
  return { targets: tg, cycle, problem: { size: cycle.size, blocks, lower, upper, structure: cycle.structure }, lower, upper };
};

/** The sequential retarget, the pelvis on the captured mid-hips, clamped into the bounds. */
export const seedOf = (cp: CaptureProblem): Float64Array => {
  const x = new Float64Array(cp.cycle.size);
  const o = restP('pelvis');
  for (let k = 0; k < cp.targets.frames; k++) {
    const mid = cp.targets.points['mid_hips']?.[k] ?? o;
    COORDINATES.forEach((c, i) => {
      const t = ['pelvis_tx', 'pelvis_ty', 'pelvis_tz'].indexOf(c.name);
      const v = t >= 0 ? (mid[t] ?? 0) - (o[t] ?? 0) : (cp.targets.coords[c.name]?.[k] ?? REST_POSE[c.name] ?? 0);
      x[k * NC + i] = Math.min(cp.upper[k * NC + i] ?? Infinity, Math.max(cp.lower[k * NC + i] ?? -Infinity, v));
    });
  }
  return x;
};

export const solveCapture = (cp: CaptureProblem, x0: ArrayLike<number> = seedOf(cp)): SolveResult => {
  const opts = { maxIterations: 300, tolCost: 1e-10, tolConstraint: 1e-8 };
  let r = solve(cp.problem, x0, opts);
  for (let n = 0; n < 4 && !(r.converged && r.feasible); n++) r = solve(cp.problem, r.x, r.feasible ? { ...opts, multipliers: r.multipliers, penalty: r.penalty } : opts);
  return r;
};

/** World frames of frame k's solution. */
export const worldOf = (cp: CaptureProblem, q: ArrayLike<number>, k: number): Readonly<Record<string, Rigid>> =>
  forward(Array.from({ length: NC }, (_, i) => q[i] ?? 0), [0, 0, 0], SEGMENT_NAMES, cp.targets.ref[k] ?? rotY(0));
