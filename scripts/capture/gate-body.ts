// The figure the gates measure and its image projection; shared by scripts/capture/gates.ts and the capture viewer.
import { EQUIPMENT } from '../../src/viewer/equipment';
import { compose as composeM } from '../../src/viewer/mat4';
import type { Mat4 } from '../../src/viewer/mat4';
import { BINDING } from '../../src/viewer/motion/fk';
import { LIMBS, OFFSET_PARENT } from '../../src/viewer/motion/capture/fit2d';
import { CM_SHARE, LOCAL_CENTRE, MASS, skiPoints } from '../../src/viewer/motion/turn';
import { SKELETON_DATA, Side, forwardKinematics, restWorld, rigidInverse } from '../../src/viewer/skeleton';
import { Terrain } from '../../src/viewer/skier';
import type { Frame3, M3, V2, V3 } from './gate-math';
import { addV, apply, col, compose, cross, dot, mulM, norm, project, scale, sub, transpose, unit } from './gate-math';
import type { MassFrame, MassSegment } from './physics-gate';

const DEG = Math.PI / 180;
export const SIDES = [Side.Left, Side.Right] as const;

// COCO-17 index of each skibuddy joint centre.
export const COCO: Readonly<Record<string, number>> = {
  'shoulder.L': 5, 'shoulder.R': 6, 'elbow.L': 7, 'elbow.R': 8, 'wrist.L': 9, 'wrist.R': 10,
  'hip.L': 11, 'hip.R': 12, 'knee.L': 13, 'knee.R': 14, 'ankle.L': 15, 'ankle.R': 16,
};

/** What the gates measure on any subject, figure or capture, in GVHMR's gravity world. */
export interface Body {
  readonly joints: Readonly<Record<string, V3>>;
  /** Where the 2D detectors' convention puts each joint: centre plus the pose file's landmark offset (else the centre). */
  readonly landmarks?: Readonly<Record<string, V3>>;
  /** x anterior, y mid-hips to lumbosacral, z right. */
  readonly pelvis: M3;
  readonly foot: Readonly<Record<Side, Frame3>>;
  readonly ski: Readonly<Record<Side, Frame3>>;
  readonly q: Readonly<Record<string, number>> | null;
}

export interface PoseFrame { readonly t: number; readonly q: Readonly<Record<string, number>>; readonly pelvis: { readonly pos: readonly [number, number, number]; readonly quat: readonly [number, number, number, number] } }
/** Per segment joint-offset scales, from a pose file's limb scales. */
export const segmentLengths = (limbs: Readonly<Record<string, number>> | undefined): Record<string, number> =>
  Object.fromEntries(Object.entries(LIMBS).flatMap(([k, segs]) => segs.map((s) => [s, limbs?.[k] ?? 1])));
/** Pinhole camera: K = [fx, fy, cx, cy], x_cam = R·X + t (OpenCV axes). */
export interface Pinhole { readonly K: ReadonlyArray<number>; readonly w2c: { readonly R: M3; readonly t: V3 } }
export interface ObsFrame extends Pinhole {
  readonly kp2d: Array<[number, number, number]>;
  readonly joints: Record<string, V3>;
  readonly pelvis: M3;
  readonly ski: Record<Side, M3>;
}

const rigid = (m: Mat4): Frame3 => ({
  R: [m[0] ?? 0, m[4] ?? 0, m[8] ?? 0, m[1] ?? 0, m[5] ?? 0, m[9] ?? 0, m[2] ?? 0, m[6] ?? 0, m[10] ?? 0],
  p: [m[12] ?? 0, m[13] ?? 0, m[14] ?? 0],
});
const quatMat = ([x, y, z, w]: readonly number[], [px, py, pz]: readonly number[]): Mat4 =>
  new Float32Array([
    1 - 2 * ((y ?? 0) ** 2 + (z ?? 0) ** 2), 2 * ((x ?? 0) * (y ?? 0) + (z ?? 0) * (w ?? 0)), 2 * ((x ?? 0) * (z ?? 0) - (y ?? 0) * (w ?? 0)), 0,
    2 * ((x ?? 0) * (y ?? 0) - (z ?? 0) * (w ?? 0)), 1 - 2 * ((x ?? 0) ** 2 + (z ?? 0) ** 2), 2 * ((y ?? 0) * (z ?? 0) + (x ?? 0) * (w ?? 0)), 0,
    2 * ((x ?? 0) * (z ?? 0) + (y ?? 0) * (w ?? 0)), 2 * ((y ?? 0) * (z ?? 0) - (x ?? 0) * (w ?? 0)), 1 - 2 * ((x ?? 0) ** 2 + (y ?? 0) ** 2), 0,
    px ?? 0, py ?? 0, pz ?? 0, 1,
  ]);
export const PELVIS_DOFS = new Set(['pelvis_tx', 'pelvis_ty', 'pelvis_tz', 'pelvis_tilt', 'pelvis_list', 'pelvis_rotation']);
const BIND: Readonly<Record<Side, Frame3>> = Object.fromEntries(SIDES.map((s) => [s, { R: BINDING[s].R.map(Number), p: BINDING[s].p.map(Number) as V3 }])) as Record<Side, Frame3>;

/** Pelvis frame from rest joint centres (mid-hips to L5/S1, hip to hip), as export_obs.py builds SMPL-X's. */
export const frameOf = (up: V3, right: V3): M3 => {
  const y = unit(up);
  const z = unit(sub(right, scale(y, dot(right, y))));
  const x = cross(y, z);
  return [x[0], y[0], z[0], x[1], y[1], z[1], x[2], y[2], z[2]];
};
const REST = Object.fromEntries(['pelvis', 'lumbar', 'femur.L', 'femur.R'].map((n) => [n, rigid(restWorld(n))]));
const restMid = scale(addV(REST['femur.L']?.p ?? [0, 0, 0], REST['femur.R']?.p ?? [0, 0, 0]), 0.5);
const PELVIS_IN_SEGMENT = mulM(transpose(REST['pelvis']?.R ?? []), frameOf(sub(REST['lumbar']?.p ?? [0, 0, 0], restMid), sub(REST['femur.R']?.p ?? [0, 0, 0], REST['femur.L']?.p ?? [0, 0, 0])));

/** Segment world matrices as the viewer poses them: FK from q with the fitted lengths, lifted onto the pose JSON's pelvis. */
export const figureWorlds = (f: PoseFrame, lengths: Readonly<Record<string, number>> = {}): Readonly<Record<string, Mat4>> => {
  const q: Record<string, number> = {};
  for (const [k, v] of Object.entries(f.q)) if (!PELVIS_DOFS.has(k)) q[k] = v * DEG;
  const lift = composeM(quatMat(f.pelvis.quat, f.pelvis.pos), rigidInverse(restWorld('pelvis')));
  return Object.fromEntries(Object.entries(forwardKinematics(q, lengths)).map(([k, m]) => [k, composeM(lift, m)]));
};

// The segment whose joint offset carries a limb's length scale.
const DISTAL: Readonly<Record<string, string>> = { femur: 'tibia', tibia: 'foot' };
const limbScale = (seg: string, lengths: Readonly<Record<string, number>>): number => {
  const [base = '', s = ''] = seg.split('.');
  const d = DISTAL[base];
  return d === undefined ? 1 : (lengths[`${d}.${s}`] ?? 1);
};

/** Rest length between a segment's two CM joints (motion/turn.ts CM_SHARE), m. */
const rodLength = (seg: string): number => {
  const [base = '', s = ''] = seg.split('.');
  const share = CM_SHARE[base];
  const j = SKELETON_DATA.joints;
  const key = (k: string): string => (s === '' || k in j ? k : `${k}.${s}`);
  const [a, b] = share === undefined ? [undefined, undefined] : [j[key(share[0])], j[key(share[1])]];
  return a === undefined || b === undefined ? 0 : norm(sub(a, b));
};

/** de-leva-1996 segment masses (motion/turn.ts) placed by the viewer's FK: body CoM and each segment's centre and long axis. */
export const figureMass = (f: PoseFrame, lengths: Readonly<Record<string, number>> = {}): MassFrame => {
  const w = figureWorlds(f, lengths);
  const segments: MassSegment[] = Object.entries(MASS).flatMap(([seg, m]) => {
    const r = w[seg];
    if (r === undefined || m === 0) return [];
    const fr = rigid(r);
    const k = limbScale(seg, lengths);
    return [{ mass: m, centre: apply(fr, scale(LOCAL_CENTRE[seg] ?? [0, 0, 0], k)), axis: col(fr.R, 1), length: rodLength(seg) * k }];
  });
  const total = segments.reduce((t, s) => t + s.mass, 0);
  return { com: scale(segments.reduce<V3>((c, s) => addV(c, scale(s.centre, s.mass)), [0, 0, 0]), 1 / total), segments };
};

/** Landmark offsets in parent segment frames, m, as fit.ts writes them. */
export type LandmarkOffsets = Readonly<Record<string, ReadonlyArray<number>>>;

/** skibuddy's figure as the viewer poses it: FK from q, the pelvis frame from the pose JSON. */
export const figureBody = (f: PoseFrame, lengths: Readonly<Record<string, number>> = {}, offsets: LandmarkOffsets = {}): Body => {
  const w = Object.fromEntries(Object.entries(figureWorlds(f, lengths)).map(([k, m]) => [k, rigid(m)]));
  const o = (n: string): V3 => w[n]?.p ?? [Number.NaN, Number.NaN, Number.NaN];
  const joints: Record<string, V3> = { c7t1: o('neck'), mid_hips: scale(addV(o('femur.L'), o('femur.R')), 0.5) };
  for (const s of SIDES) {
    Object.assign(joints, { [`hip.${s}`]: o(`femur.${s}`), [`knee.${s}`]: o(`tibia.${s}`), [`ankle.${s}`]: o(`foot.${s}`) });
    Object.assign(joints, { [`shoulder.${s}`]: o(`humerus.${s}`), [`elbow.${s}`]: o(`forearm.${s}`), [`wrist.${s}`]: o(`hand.${s}`) });
  }
  const foot = Object.fromEntries(SIDES.map((s) => [s, w[`foot.${s}`] as Frame3])) as Record<Side, Frame3>;
  const landmarks = Object.fromEntries(Object.entries(joints).map(([n, p]) => {
    const o = offsets[n];
    const parent = w[OFFSET_PARENT[n] ?? ''];
    return [n, o === undefined || parent === undefined ? p : apply({ R: parent.R, p }, [o[0] ?? 0, o[1] ?? 0, o[2] ?? 0])];
  }));
  return {
    joints,
    landmarks,
    pelvis: mulM(w['pelvis']?.R ?? [], PELVIS_IN_SEGMENT),
    foot,
    ski: Object.fromEntries(SIDES.map((s) => [s, compose(foot[s], BIND[s])])) as Record<Side, Frame3>,
    q: f.q,
  };
};

/** The SMPL-X capture with skibuddy's skis bound under its feet (ski frame from GVHMR's ankle rotation). */
export const captureBody = (o: ObsFrame): Body => {
  const foot = Object.fromEntries(SIDES.map((s) => [s, { R: mulM(o.ski[s], transpose(BIND[s].R)), p: o.joints[`ankle.${s}`] ?? [0, 0, 0] }])) as Record<Side, Frame3>;
  return { joints: o.joints, pelvis: o.pelvis, foot, ski: Object.fromEntries(SIDES.map((s) => [s, compose(foot[s], BIND[s])])) as Record<Side, Frame3>, q: null };
};

export const SKI = skiPoints(Terrain.Groomed);
export const TIP = SKI.ends.tip;
export const TAIL = SKI.ends.tail;
export const THICK = EQUIPMENT.skiThickness;
export const skiEnds = (ski: Frame3): { tip: V3; tail: V3 } => ({ tip: apply(ski, [0, -THICK, TIP]), tail: apply(ski, [0, -THICK, TAIL]) });

/** A body in image pixels through one frame's camera: the gates' only projection. */
export interface Projected {
  readonly joints: Readonly<Record<string, V2>>;
  readonly landmarks: Readonly<Record<string, V2>>;
  readonly skis: Readonly<Record<Side, { readonly tip: V2; readonly tail: V2 }>>;
}
export const projectBody = (b: Body, cam: Pinhole): Projected => {
  const w2c: Frame3 = { R: cam.w2c.R, p: cam.w2c.t };
  const proj = (X: V3): V2 => project(cam.K, w2c, X);
  return {
    joints: Object.fromEntries(Object.entries(b.joints).map(([k, v]) => [k, proj(v)])),
    landmarks: Object.fromEntries(Object.entries(b.landmarks ?? b.joints).map(([k, v]) => [k, proj(v)])),
    skis: Object.fromEntries(SIDES.map((s) => { const e = skiEnds(b.ski[s]); return [s, { tip: proj(e.tip), tail: proj(e.tail) }]; })) as Record<Side, { tip: V2; tail: V2 }>,
  };
};

/** COCO-17 torso length in px: shoulder midpoint to hip midpoint. */
export const torsoPx = (kp: ReadonlyArray<readonly [number, number, number]>): number => {
  const k = (i: number): readonly [number, number, number] => kp[i] ?? [Number.NaN, Number.NaN, 0];
  const mid = (i: number, j: number): V2 => [(k(i)[0] + k(j)[0]) / 2, (k(i)[1] + k(j)[1]) / 2];
  return Math.hypot(mid(5, 6)[0] - mid(11, 12)[0], mid(5, 6)[1] - mid(11, 12)[1]);
};
