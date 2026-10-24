import { JOINT_LIMITS } from '../../viewer/joint-limits';
import type { Mat4 } from '../../viewer/mat4';
import { PELVIS_DOFS, figureWorlds, segmentLengths } from '../../../scripts/capture/gate-body';
import type { ObsCamera, RtmwFrame } from './overlay';

const DEG = Math.PI / 180;
export const DATA = '/capture-data/';

export type V3 = readonly [number, number, number];
export type Quat = readonly [number, number, number, number];

export interface CameraPose {
  readonly pos: V3;
  /** three's camera frame (looks down -z, y up), [x, y, z, w]. */
  readonly quat: Quat;
  readonly fovY: number;
}

export interface CaptureFrame {
  readonly t: number;
  /** Skibuddy coordinates in degrees (translations in metres). */
  readonly q: Readonly<Record<string, number>>;
  /** The pelvis segment's world frame: origin and ISB axes as [x, y, z, w]. */
  readonly pelvis: { readonly pos: V3; readonly quat: Quat };
  readonly camera?: CameraPose;
}

export interface CaptureClip {
  readonly clip: string;
  readonly stage?: string;
  readonly video: string;
  readonly fps: number;
  /** Frame i shows video frame i at this rate; otherwise frames sync by `t`. */
  readonly videoFps?: number | null;
  readonly frames: ReadonlyArray<CaptureFrame>;
  /** Fitted limb scales (thigh, shin); absent means template proportions. */
  readonly limbs?: Readonly<Record<string, number>>;
}

export interface PoseFile {
  readonly file: string;
  readonly clip: string;
  readonly stage: string;
}

export const listPoses = async (): Promise<ReadonlyArray<PoseFile>> => {
  const r = await fetch(`${DATA}index.json`);
  if (!r.ok) throw new Error(`index: ${r.status}`);
  return (await r.json()) as ReadonlyArray<PoseFile>;
};

export const loadClip = async (file: string): Promise<CaptureClip> => {
  const r = await fetch(`${DATA}${encodeURIComponent(file)}`);
  if (!r.ok) throw new Error(`${file}: ${r.status}`);
  const c = (await r.json()) as CaptureClip;
  if (!Array.isArray(c.frames) || c.frames.length === 0) throw new Error(`${file}: no frames`);
  return c;
};

/** Pose frame i is video frame i (GVHMR, keypoints and gates all index by frame); `t` is only a fallback. */
export const videoTime = (c: CaptureClip, i: number, duration = Number.NaN): number => {
  if (typeof c.videoFps === 'number' && c.videoFps > 0) return (i + 0.5) / c.videoFps;
  if (Number.isFinite(duration) && duration > 0) return ((i + 0.5) * duration) / c.frames.length;
  return c.frames[i]?.t ?? 0;
};

/** Segment world matrices exactly as the gates pose the figure: the captured pelvis, FK from q, the fitted limb lengths. */
export const segmentWorlds = (f: CaptureFrame, limbs?: Readonly<Record<string, number>>): Readonly<Record<string, Mat4>> => figureWorlds(f, segmentLengths(limbs));

/** The gates' per-frame camera and ViTPose keypoints; null when the clip has no obs file. */
export const loadObs = async (clip: string): Promise<ReadonlyArray<ObsCamera> | null> => {
  const r = await fetch(`${DATA}${encodeURIComponent(`${clip}_obs.json`)}`);
  if (!r.ok) return null;
  const d = (await r.json()) as { frames?: ReadonlyArray<ObsCamera> };
  return Array.isArray(d.frames) && d.frames.every((f) => Array.isArray(f.K) && f.w2c !== undefined) ? d.frames : null;
};

/** RTMW body keypoints per frame; null when absent. */
export const loadRtmw = async (clip: string): Promise<ReadonlyArray<RtmwFrame> | null> => {
  const r = await fetch(`${DATA}${encodeURIComponent(`${clip}_kp2d.json`)}`);
  if (!r.ok) return null;
  const d = (await r.json()) as { frames?: ReadonlyArray<{ readonly kp: RtmwFrame }> };
  return Array.isArray(d.frames) ? d.frames.map((f) => f.kp) : null;
};

export interface Readout {
  readonly knee: readonly [number, number];
  readonly hip: readonly [number, number];
  /** Pelvis origin to C7/T1 against gravity, degrees. */
  readonly trunk: number;
  /** DOFs at or past a joint limit, with the value and the bound, degrees. */
  readonly clamped: ReadonlyArray<{ readonly name: string; readonly value: number; readonly bound: number }>;
}

const TOUCH = 0.25;

export const readout = (f: CaptureFrame, limbs?: Readonly<Record<string, number>>): Readout => {
  const w = segmentWorlds(f, limbs);
  const p = w['pelvis'];
  const n = w['neck'];
  const d = p === undefined || n === undefined ? [0, 1, 0] : [0, 1, 2].map((k) => (n[12 + k] ?? 0) - (p[12 + k] ?? 0));
  const trunk = Math.acos((d[1] ?? 0) / (Math.hypot(...d) || 1)) / DEG;
  const clamped = Object.entries(f.q).flatMap(([name, value]) => {
    const l = JOINT_LIMITS[name];
    if (l === undefined || PELVIS_DOFS.has(name)) return [];
    const lo = l.lower.value / DEG;
    const hi = l.upper.value / DEG;
    if (value <= lo + TOUCH) return [{ name, value, bound: lo }];
    if (value >= hi - TOUCH) return [{ name, value, bound: hi }];
    return [];
  });
  const q = (k: string): number => f.q[k] ?? Number.NaN;
  return { knee: [q('knee_flexion.L'), q('knee_flexion.R')], hip: [q('hip_flexion.L'), q('hip_flexion.R')], trunk, clamped };
};
