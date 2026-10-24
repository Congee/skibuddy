import { Boundary, Cycle } from '../../../solve/cycle';
import type { Dual } from '../../../solve/dual';
import { BlockKind, prior, type Block } from '../../../solve/problem';
import { EQUIPMENT, shellInFoot } from '../../equipment';
import { bootFitFrom } from '../../gear-fit';
import { compose as composeM, transformPoint, translation } from '../../mat4';
import { COORDINATES, REST_POSE, SKELETON_DATA, Side, restWorld, rigidInverse } from '../../skeleton';
import { Terrain } from '../../skier';
import { BINDING, add, axisOf, chainOf, forward, mul, skiFrame, sub, sub3, transform, value } from '../fk';
import type { Rigid, Scalar, V3 } from '../fk';
import { skiPoints } from '../turn';
import { crossClearances } from './clearance';
import { RTMW_SCORE } from './detectors';
import { cross, minus, rotY, unit } from './geometry';
import type { M3n, V3n } from './geometry';
import { THORACIC_PER_LUMBAR, limits, localPoint, orientRows, restP, restR, seedOf, skiOnSnow } from './ik';
import type { CaptureProblem, CaptureTargets } from './ik';
import { lumbarShare } from './rhythm';
import { fitPlane } from './snow';
import type { Plane } from './snow';

/**
 * Whole-clip fit of skibuddy's skier (body, boots locked to skis, cuff range, shared snow) to 2D image evidence
 * through the capture's camera. The 3D capture only seeds it and holds weak priors on what it measured well.
 */

const DEG = Math.PI / 180;
const SIDES = [Side.Right, Side.Left] as const;
const NC = COORDINATES.length;
const at = (name: string): number => COORDINATES.findIndex((c) => c.name === name);

/** Pinhole camera: K = [fx, fy, cx, cy], x_cam = R·X + t (R row-major, world → camera). */
export interface Camera {
  readonly K: ReadonlyArray<number>;
  readonly R: ReadonlyArray<number>;
  readonly t: ReadonlyArray<number>;
}

export type V2 = readonly [number, number];

/** A detected landmark, σ in px (already scaled by the detector's confidence). */
export interface PointObs {
  readonly landmark: string;
  readonly uv: V2;
  readonly sigma: number;
}

/** A segmented ski as an image line through a and b; endpoints are unreliable (occlusion, frame edge). */
export interface LineObs {
  readonly side: Side;
  readonly a: V2;
  readonly b: V2;
  readonly sigma: number;
}

export interface FrameEvidence {
  readonly camera: Camera;
  readonly points: ReadonlyArray<PointObs>;
  readonly lines: ReadonlyArray<LineObs>;
}

const inv = (a: Scalar): Scalar => (typeof a === 'number' ? 1 / a : a.chain(1 / a.v, -1 / (a.v * a.v)));

export const toCamera = (cam: Camera, X: V3): V3 =>
  [0, 1, 2].map((i) => add(add(add(mul(cam.R[3 * i] ?? 0, X[0]), mul(cam.R[3 * i + 1] ?? 0, X[1])), mul(cam.R[3 * i + 2] ?? 0, X[2])), cam.t[i] ?? 0)) as unknown as V3;

export const project = (cam: Camera, X: V3): readonly [Scalar, Scalar] => {
  const c = toCamera(cam, X);
  const iz = inv(c[2]);
  return [add(mul(cam.K[0] ?? 1, mul(c[0], iz)), cam.K[2] ?? 0), add(mul(cam.K[1] ?? 1, mul(c[1], iz)), cam.K[3] ?? 0)];
};

/** Residual r rescaled so ½r̃² is the Cauchy loss ½c²·log(1 + r²/c²): outliers stop pulling past ~c. */
export const cauchy = (r: Scalar, c: number): Scalar => {
  const v = value(r);
  const u = (v * v) / (c * c);
  const f = u < 1e-8 ? 1 - u / 4 : Math.sqrt(Math.log1p(u) / u);
  const slope = u < 1e-8 ? 1 - (3 * u) / 4 : f + (u / (1 + u) - Math.log1p(u)) / (f * u);
  return typeof r === 'number' ? v * f : r.chain(v * f, slope);
};

export const KP_REFERENCE = RTMW_SCORE.reference;
export const KP_MIN = RTMW_SCORE.min;
/** Landmark σ in px at the reference score: joint centres vs COCO's surface keypoints, wider for boot points (inferred). */
export const KP_PX = { joint: 6, foot: 10 } as const;
/** σ grows as the score falls: weight ∝ score². */
export const keypointSigma = (px: number, score: number): number | undefined => (score < KP_MIN ? undefined : (px * KP_REFERENCE) / score);
/** Segmentation lines below this conf are usually a pole (seg_skis.py heuristic). */
export const SKI_LINE_MIN = 0.3;
export const skiLineSigma = (rmsPx: number, conf: number): number | undefined => (conf < SKI_LINE_MIN ? undefined : Math.max(3, rmsPx) / Math.min(1, conf));

/** Robust scale in σ units. */
const CAUCHY_C = 2;

const SKI = skiPoints(Terrain.Groomed);
const SKI_BASE = SKI.centre[1];
const SKI_HALF_WIDTH = SKI.width / 2;
/** Tip, binding centre and tail on the base, ski frame. */
export const SKI_STATIONS: ReadonlyArray<V3n> = [SKI.ends.tip, SKI.centre[2], SKI.ends.tail].map((z) => [0, SKI_BASE, z]);
const v3 = (v: ReadonlyArray<number>): V3 => [v[0] ?? 0, v[1] ?? 0, v[2] ?? 0];

/** Rest-world point in a segment's frame. */
const localOf = (seg: string, world: ReadonlyArray<number>): V3n => {
  const d = minus(world, restP(seg));
  const R = restR(seg);
  return [0, 1, 2].map((c) => (R[c] ?? 0) * (d[0] ?? 0) + (R[3 + c] ?? 0) * (d[1] ?? 0) + (R[6 + c] ?? 0) * (d[2] ?? 0)) as V3n;
};

/** Boot landmarks from gear_fit's foot box: big toe medial, small toe lateral and shorter, heel above the sole (inferred). */
const footLandmarks = (s: Side): Record<string, [string, V3n]> => {
  const g = SKELETON_DATA.gear_fit[s];
  const [x0, x1] = g.footX;
  const [medial, lateral] = Math.abs(x0) < Math.abs(x1) ? [x0, x1] : [x1, x0];
  const seg = `foot.${s}`;
  return {
    [`big.${s}`]: [seg, localOf(seg, [medial + 0.25 * (lateral - medial), g.sole + 0.015, g.toe])],
    [`small.${s}`]: [seg, localOf(seg, [lateral - 0.2 * (lateral - medial), g.sole + 0.015, g.toe - 0.035])],
    [`heel.${s}`]: [seg, localOf(seg, [0.5 * (medial + lateral), g.sole + 0.03, g.heel])],
  };
};

/** Boot shell's toe and heel where its sole meets the binding, as Ski 2DPose marks them (inferred from its overlays). */
const bootLandmarks = (s: Side): Record<string, [string, V3n]> => {
  const raw = SKELETON_DATA.gear_fit[s];
  const fit = bootFitFrom(raw);
  const m = composeM(rigidInverse(restWorld(`foot.${s}`)), translation(raw.ankle), shellInFoot(fit, EQUIPMENT));
  const soleAt = (z: number): V3n => transformPoint(m, [fit.centreX, fit.sole, z]) as unknown as V3n;
  return { [`bootToe.${s}`]: [`foot.${s}`, soleAt(fit.toe)], [`bootHeel.${s}`]: [`foot.${s}`, soleAt(fit.heel)] };
};

/** Model landmarks: carrying segment and its local position. */
export const LANDMARKS: Readonly<Record<string, readonly [string, V3n]>> = Object.fromEntries(
  SIDES.flatMap((s) => [
    [`hip.${s}`, [`femur.${s}`, localPoint(`femur.${s}`, `hip.${s}`)]],
    [`knee.${s}`, [`tibia.${s}`, localPoint(`tibia.${s}`, `knee.${s}`)]],
    [`ankle.${s}`, [`foot.${s}`, localPoint(`foot.${s}`, `ankle.${s}`)]],
    [`shoulder.${s}`, [`humerus.${s}`, localPoint(`humerus.${s}`, `shoulder.${s}`)]],
    [`elbow.${s}`, [`forearm.${s}`, localPoint(`forearm.${s}`, `elbow.${s}`)]],
    [`wrist.${s}`, [`hand.${s}`, localPoint(`hand.${s}`, `wrist.${s}`)]],
    ...Object.entries(footLandmarks(s)),
    ...Object.entries(bootLandmarks(s)),
    [`skiTip.${s}`, [`foot.${s}`, transform(BINDING[s], v3(SKI_STATIONS[0] ?? [0, 0, 0])).map(value) as V3n]],
    [`skiTail.${s}`, [`foot.${s}`, transform(BINDING[s], v3(SKI_STATIONS[2] ?? [0, 0, 0])).map(value) as V3n]],
  ]),
);

/**
 * Detector convention vs joint centre: each body keypoint's offset in its parent segment's frame, one per clip
 * (OpenSim-style marker registration), carried as solve extras after the limb scales.
 */
export const OFFSET_PARENT: Readonly<Record<string, string>> = Object.fromEntries(
  SIDES.flatMap((s) => [
    [`hip.${s}`, 'pelvis'],
    [`knee.${s}`, `femur.${s}`],
    [`ankle.${s}`, `tibia.${s}`],
    [`shoulder.${s}`, 'thorax'],
    [`elbow.${s}`, `humerus.${s}`],
    [`wrist.${s}`, `forearm.${s}`],
  ]),
);
const OFFSET_KEYS = Object.keys(OFFSET_PARENT);
/** Zero-mean prior σ and per-axis bound on a landmark offset, m: labels sit centimetres off joint centres (inferred). */
export const LANDMARK_OFFSET = { sigma: 0.03, max: 0.08 } as const;

/** Weak priors on what GVHMR measured well; σ in degrees unless noted. */
export const FIT_SIGMA = {
  /** GVHMR knee agrees with 3-point and SAM3D to ~4° (design.md). */
  knee: 4,
  hip: 8,
  trunk: 4,
  /** Unobserved hip rotation, only a tie-break: the ski lines set it through the boot (inferred). */
  hipRotation: 20,
  /** Monocular depth of mid-hips along the camera axis, m. */
  depth: 0.1,
  /** Ski lower edge over GVHMR's sole plane, m: the snow's absolute height is only as good as the capture's feet. */
  snowHeight: 0.05,
  /** Ski edges over the snow refitted to the fit's own skis, m. */
  snowRefit: 0.01,
  /** Snow is one plane over ±this many frames (~0.5 s, about one edge change; inferred). */
  snowHalf: 12,
  /** Both skis on one plane and flat along it, m. */
  snowShared: 0.01,
  rhythm: 5,
  thoracic: 3,
  smooth: 1,
  /** Subject's thigh or shin over the template's, as a fraction (inferred). */
  limbLength: 0.1,
} as const;

/** Per-clip subject shape: thigh and shin length scales, shared by both sides and every frame (the solve's extras). */
export const LIMBS = { thigh: ['tibia.R', 'tibia.L'], shin: ['foot.R', 'foot.L'] } as const;
const LIMB_KEYS = Object.keys(LIMBS) as ReadonlyArray<keyof typeof LIMBS>;
/** Inferred bounds on a limb scale: well past adult variation, short of degenerate. */
const LIMB_RANGE = [0.75, 1.3] as const;
export const lengthsOf = (e: ReadonlyArray<Scalar>): Record<string, Scalar> =>
  Object.fromEntries(LIMB_KEYS.flatMap((k, j) => LIMBS[k].map((seg) => [seg, e[j] ?? 1])));

/** Orientation priors per segment axis, degrees: pelvis/trunk heading and thigh direction, arms loosely; shins and feet left to the image. */
const FIT_ORIENT: Readonly<Record<string, readonly [number, number, number]>> = {
  pelvis: [8, 6, 90],
  thorax: [90, 20, 90],
  'femur.R': [10, 90, 10],
  'femur.L': [10, 90, 10],
  'humerus.R': [15, 30, 15],
  'humerus.L': [15, 30, 15],
  'forearm.R': [20, 40, 20],
  'forearm.L': [20, 40, 20],
};

const COORD_PRIOR: Readonly<Record<string, number>> = {
  'knee_flexion.R': FIT_SIGMA.knee * DEG,
  'knee_flexion.L': FIT_SIGMA.knee * DEG,
  'hip_flexion.R': FIT_SIGMA.hip * DEG,
  'hip_flexion.L': FIT_SIGMA.hip * DEG,
};

const dot3n = (a: V3, b: ReadonlyArray<number>): Scalar => add(add(mul(a[0], b[0] ?? 0), mul(a[1], b[1] ?? 0)), mul(a[2], b[2] ?? 0));
const BODY = chainOf([...new Set([...Object.values(LANDMARKS).map(([seg]) => seg), 'neck', 'thorax'])]);
const LEGS = chainOf(['foot.R', 'foot.L']);
const TRUNK_LEN = (() => {
  const w = forward(COORDINATES.map((c) => REST_POSE[c.name] ?? 0), [0, 0, 0], chainOf(['neck']));
  return Math.hypot(...sub3(w['neck']?.p ?? [0, 0, 0], w['pelvis']?.p ?? [0, 0, 0]).map(value));
})();
const CLEARANCE_ROWS = Object.values(crossClearances(forward(COORDINATES.map((c) => REST_POSE[c.name] ?? 0)))).flat().length;

/** Landmark offsets by name, from the solve's extras (none when the problem has no offset extras). */
export type Offsets = Readonly<Record<string, V3>>;
export const offsetsOf = (e: ReadonlyArray<Scalar>): Offsets =>
  e.length < LIMB_KEYS.length + 3 * OFFSET_KEYS.length ? {} : Object.fromEntries(OFFSET_KEYS.map((n, i) => [n, [0, 1, 2].map((c) => e[LIMB_KEYS.length + 3 * i + c] ?? 0) as unknown as V3]));

/** A solved frame's landmark: the joint centre plus its calibrated offset in the parent segment. */
export const landmarkOf = (w: Readonly<Record<string, Rigid>>, name: string, offsets: Offsets = {}): V3 => {
  const [seg, local] = LANDMARKS[name] ?? ['pelvis', [0, 0, 0] as V3n];
  const m = w[seg];
  if (m === undefined) throw new Error(`${seg} not solved`);
  const p = transform(m, v3(local));
  const o = offsets[name];
  const parent = w[OFFSET_PARENT[name] ?? ''];
  return o === undefined || parent === undefined ? p : transform({ R: parent.R, p }, o);
};

/** Signed px distance of a point from the line ab. */
const lineDistance = (p: readonly [Scalar, Scalar], a: V2, b: V2): Scalar => {
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
  const [nx, ny] = [-(b[1] - a[1]) / len, (b[0] - a[0]) / len];
  return add(mul(nx, sub(p[0], a[0])), mul(ny, sub(p[1], a[1])));
};

/** Image rows of one frame, each already in robust σ units. */
export const imageRows = (w: Readonly<Record<string, Rigid>>, ev: FrameEvidence, offsets: Offsets = {}): Scalar[] => {
  const rows: Scalar[] = [];
  for (const o of ev.points) {
    const uv = project(ev.camera, landmarkOf(w, o.landmark, offsets));
    rows.push(cauchy(mul(1 / o.sigma, sub(uv[0], o.uv[0])), CAUCHY_C), cauchy(mul(1 / o.sigma, sub(uv[1], o.uv[1])), CAUCHY_C));
  }
  for (const l of ev.lines) {
    const ski = skiFrame(w, l.side);
    for (const s of SKI_STATIONS) rows.push(cauchy(mul(1 / l.sigma, lineDistance(project(ev.camera, transform(ski, v3(s))), l.a, l.b)), CAUCHY_C));
  }
  return rows;
};

export interface FitOptions {
  /** Solve landmark offsets. */
  readonly offsets?: boolean | undefined;
  /** Frames whose image rows leave the solved offsets out, so they do not inform them (held-out calibration). */
  readonly held?: ReadonlyArray<boolean> | undefined;
  /** Offsets fixed from an earlier calibration, applied to every frame; no offset extras. */
  readonly fixed?: Offsets | undefined;
}

export const buildFitProblem = (tg: CaptureTargets, evidence: ReadonlyArray<FrameEvidence>, snowHeight: number = FIT_SIGMA.snowHeight, opts: FitOptions = {}): CaptureProblem => {
  const K = tg.frames;
  if (evidence.length !== K) throw new Error(`evidence for ${evidence.length} frames, targets ${K}`);
  const nOff = opts.offsets === true ? 3 * OFFSET_KEYS.length : 0;
  const cycle = new Cycle({ frames: K, coords: NC, extras: LIMB_KEYS.length + nOff, boundary: Boundary.Open });
  const blocks: Block[] = [];
  const segs = Object.keys(FIT_ORIENT).filter((s) => tg.orient[s] !== undefined);
  const [iTilt, iLumbar, iThoracic] = [at('pelvis_tilt'), at('lumbar_flexion'), at('thoracic_flexion')];
  for (let k = 0; k < K; k++) {
    const ref = tg.ref[k] ?? rotY(0);
    const ev = evidence[k] as FrameEvidence;
    const size = 2 * ev.points.length + SKI_STATIONS.length * ev.lines.length;
    if (size > 0)
      blocks.push(
        cycle.frameBlock({ name: `image ${k}`, group: 'image', kind: BlockKind.Goal, size }, [k], ([q = []], e) =>
          imageRows(forward(q, [0, 0, 0], BODY, ref, lengthsOf(e)), ev, opts.fixed ?? (opts.held?.[k] === true ? {} : offsetsOf(e))) as Dual[],
        opts.held?.[k] === true ? LIMB_KEYS.length : undefined,
        ),
      );

    const d = tg.trunk[k] ?? [0, 1, 0];
    const e1 = unit(cross(d, Math.abs(d[0]) < 0.9 ? [1, 0, 0] : [0, 0, 1]));
    const e2 = cross(d, e1);
    const mid = tg.points['mid_hips']?.[k];
    const depth = mid === undefined ? undefined : value(toCamera(ev.camera, v3(mid))[2]);
    blocks.push(
      cycle.frameBlock({ name: `capture prior ${k}`, group: 'capture prior', kind: BlockKind.Prior, size: 3 * segs.length + 2 + (depth === undefined ? 0 : 1) }, [k], ([q = []], e) => {
        const w = forward(q, [0, 0, 0], BODY, ref, lengthsOf(e));
        const rows: Scalar[] = [];
        for (const seg of segs) {
          const sg = FIT_ORIENT[seg] ?? [1, 1, 1];
          orientRows(w[seg] as Rigid, tg.orient[seg]?.[k] as M3n).forEach((r, j) => rows.push(mul(1 / ((sg[j] ?? 1) * DEG), r)));
        }
        const t = sub3(w['neck']?.p ?? [0, 0, 0], w['pelvis']?.p ?? [0, 0, 0]);
        const st = 1 / (TRUNK_LEN * FIT_SIGMA.trunk * DEG);
        rows.push(mul(st, dot3n(t, e1)), mul(st, dot3n(t, e2)));
        if (depth !== undefined) rows.push(mul(1 / FIT_SIGMA.depth, sub(toCamera(ev.camera, w['pelvis']?.p ?? [0, 0, 0])[2], depth)));
        return rows as Dual[];
      }, LIMB_KEYS.length),
    );

    blocks.push(
      cycle.frameBlock({ name: `clearance ${k}`, group: 'ski clearance', kind: BlockKind.Inequality, size: CLEARANCE_ROWS }, [k], ([q = []], e) =>
        Object.values(crossClearances(forward(q, [0, 0, 0], LEGS, ref, lengthsOf(e)))).flat() as Dual[],
      LIMB_KEYS.length),
    );

    const plane = tg.snow[k] ?? { n: [0, 1, 0] as V3n, d: 0 };
    const down = SIDES.filter((_, i) => tg.stance[k]?.[i] ?? true);
    if (down.length > 0)
      blocks.push(
        cycle.frameBlock({ name: `snow ${k}`, group: 'skis on snow', kind: BlockKind.Goal, size: 2 * down.length + (down.length === 2 ? 1 : 0) }, [k], ([q = []], e) => {
          const w = forward(q, [0, 0, 0], LEGS, ref, lengthsOf(e));
          const on = down.map((s) => skiOnSnow(skiFrame(w, s), plane));
          const rows: Scalar[] = on.flatMap(([h, climb]) => [mul(1 / snowHeight, h), mul(1 / FIT_SIGMA.snowShared, climb)]);
          if (on.length === 2) rows.push(mul(1 / FIT_SIGMA.snowShared, sub(on[0]?.[0] ?? 0, on[1]?.[0] ?? 0)));
          return rows as Dual[];
        }, LIMB_KEYS.length),
      );

    blocks.push(
      cycle.frameBlock({ name: `spine prior ${k}`, group: 'spine prior', kind: BlockKind.Prior, size: 2 }, [k], ([q = []]) => {
        const [tilt, lumbar, thoracic] = [q[iTilt], q[iLumbar], q[iThoracic]];
        if (tilt === undefined || lumbar === undefined || thoracic === undefined) throw new Error('missing spine coordinate');
        return [
          mul(1 / (FIT_SIGMA.rhythm * DEG), sub(lumbar, lumbarShare(add(tilt, lumbar)))),
          mul(1 / (FIT_SIGMA.thoracic * DEG), sub(thoracic, mul(THORACIC_PER_LUMBAR, lumbar))),
        ] as Dual[];
      }, 0),
    );
    for (const s of SIDES)
      blocks.push(prior(`hip rotation prior ${s} ${k}`, [cycle.ref(k, at(`hip_rotation.${s}`))], [REST_POSE[`hip_rotation.${s}`] ?? 0], [FIT_SIGMA.hipRotation * DEG], 'hip rotation prior'));
    for (const [name, sigma] of Object.entries(COORD_PRIOR)) {
      const mu = tg.coords[name]?.[k];
      if (mu !== undefined) blocks.push(prior(`capture ${name} ${k}`, [cycle.ref(k, at(name))], [mu], [sigma], `capture ${name.replace(/\.[RL]$/, '')}`));
    }
  }
  blocks.push(...cycle.smoothness(1 / (FIT_SIGMA.smooth * DEG)));
  blocks.push(prior('limb lengths', LIMB_KEYS.map((_, j) => cycle.extra(j)), LIMB_KEYS.map(() => 1), LIMB_KEYS.map(() => FIT_SIGMA.limbLength), 'limb length prior'));
  const offRefs = Array.from({ length: nOff }, (_, j) => cycle.extra(LIMB_KEYS.length + j));
  if (nOff > 0) blocks.push(prior('landmark offsets', offRefs, offRefs.map(() => 0), offRefs.map(() => LANDMARK_OFFSET.sigma), 'landmark offset prior'));
  const { lo, hi } = limits();
  const { lower, upper } = cycle.bounds(
    lo,
    hi,
    [...LIMB_KEYS.map(() => LIMB_RANGE[0]), ...offRefs.map(() => -LANDMARK_OFFSET.max)],
    [...LIMB_KEYS.map(() => LIMB_RANGE[1]), ...offRefs.map(() => LANDMARK_OFFSET.max)],
  );
  return { targets: tg, cycle, problem: { size: cycle.size, blocks, lower, upper, structure: cycle.structure }, lower, upper };
};

/** Image tip/tail and long-axis direction of each ski, for reports and tests. */
export const skiImage = (w: Readonly<Record<string, Rigid>>, cam: Camera, s: Side): { tip: V2; tail: V2; axis: V3n } => {
  const ski = skiFrame(w, s);
  const p = (x: V3n): V2 => project(cam, transform(ski, v3(x))).map(value) as unknown as V2;
  return { tip: p(SKI_STATIONS[0] as V3n), tail: p(SKI_STATIONS[2] as V3n), axis: axisOf(ski, 2).map(value) as V3n };
};

/** The solve's limb scales. */
export const limbScales = (cp: CaptureProblem, x: ArrayLike<number>): number[] => LIMB_KEYS.map((_, j) => x[cp.cycle.extra(j).index] ?? 1);

/** The solve's landmark offsets in their parent segments, m. */
export const landmarkOffsets = (cp: CaptureProblem, x: ArrayLike<number>): Record<string, V3n> =>
  cp.cycle.extras < LIMB_KEYS.length + 3 * OFFSET_KEYS.length
    ? {}
    : Object.fromEntries(OFFSET_KEYS.map((n, i) => [n, [0, 1, 2].map((c) => x[cp.cycle.extra(LIMB_KEYS.length + 3 * i + c).index] ?? 0) as V3n]));

/** The capture seed with the template's limb lengths and no landmark offsets. */
export const fitSeed = (cp: CaptureProblem): Float64Array => {
  const x = seedOf(cp);
  for (let j = 0; j < cp.cycle.extras; j++) x[cp.cycle.extra(j).index] = j < LIMB_KEYS.length ? 1 : 0;
  return x;
};

/** Per frame, the plane through both standing skis' lower tip and tail edges over ±half frames: one locally flat snow. */
export const snowFromSkis = (cp: CaptureProblem, x: ArrayLike<number>, half: number = FIT_SIGMA.snowHalf): Plane[] => {
  const tg = cp.targets;
  const qs = cp.cycle.unpack(x);
  const lengths = lengthsOf(limbScales(cp, x));
  const contacts = qs.map((q, k) => {
    const w = forward(Array.from({ length: NC }, (_, i) => q[i] ?? 0), [0, 0, 0], LEGS, tg.ref[k] ?? rotY(0), lengths);
    return SIDES.flatMap((s, i) => {
      if (!(tg.stance[k]?.[i] ?? true)) return [];
      const ski = skiFrame(w, s);
      return [SKI_STATIONS[0], SKI_STATIONS[2]].map((st) => {
        const z = st?.[2] ?? 0;
        const [a, b] = [1, -1].map((e) => transform(ski, [e * SKI_HALF_WIDTH, SKI_BASE, z]).map(value));
        return (a?.[1] ?? 0) < (b?.[1] ?? 0) ? a : b;
      });
    });
  });
  return qs.map((_, k) => {
    const pts = contacts.slice(Math.max(0, k - half), k + half + 1).flat().filter((p): p is number[] => p !== undefined);
    return pts.length >= 3 ? fitPlane(pts, pts.map(() => 1)) : (tg.snow[k] ?? { n: [0, 1, 0], d: 0 });
  });
};
