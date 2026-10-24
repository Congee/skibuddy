import { COCO, figureBody, projectBody, segmentLengths, torsoPx } from '../../../scripts/capture/gate-body';
import type { Pinhole, PoseFrame, Projected } from '../../../scripts/capture/gate-body';
import type { V2 } from '../../../scripts/capture/gate-math';
import type { Quat, V3 } from './data';

export type Kp = readonly [number, number, number];
/** RTMW COCO-WholeBody body keypoints by name, full-image px with raw SimCC confidence. */
export type RtmwFrame = Readonly<Record<string, Kp>>;
/** The gates' reference camera and ViTPose keypoints for one frame (`<clip>_obs.json`). */
export interface ObsCamera extends Pinhole {
  readonly kp2d: ReadonlyArray<Kp>;
}

export const OVERLAY_JOINTS = ['shoulder', 'elbow', 'wrist', 'hip', 'knee', 'ankle'] as const;
const RTMW_PREFIX = { L: 'left_', R: 'right_' } as const;
/** RTMW keypoint name for a skibuddy joint name such as `knee.L`. */
export const rtmwName = (joint: string): string => {
  const [j, s] = joint.split('.');
  return `${RTMW_PREFIX[s === 'R' ? 'R' : 'L']}${j ?? ''}`;
};
/** RTMW body keypoints as COCO-17 order, for the torso length. */
const rtmwCoco = (k: RtmwFrame): ReadonlyArray<Kp> => {
  const out: Kp[] = Array.from({ length: 17 }, () => [Number.NaN, Number.NaN, 0] as const);
  for (const [n, i] of Object.entries(COCO)) out[i] = k[rtmwName(n)] ?? [Number.NaN, Number.NaN, 0];
  return out;
};

export interface JointError {
  readonly joint: string;
  readonly px: number;
  readonly torso: number;
  readonly conf: number;
}
export interface OverlayFrame {
  readonly projected: Projected;
  readonly torso: { readonly rtmw: number; readonly vitpose: number };
  /** Projected joint to keypoint, px and fraction of the keypoint torso; vitpose is what the joints2d gate scores. */
  readonly rtmw: ReadonlyArray<JointError>;
  readonly vitpose: ReadonlyArray<JointError>;
}

const errors = (p: Projected, kp: (joint: string) => Kp | undefined, torso: number): ReadonlyArray<JointError> =>
  Object.keys(COCO).flatMap((joint) => {
    const k = kp(joint);
    const j = p.joints[joint];
    if (k === undefined || j === undefined || !Number.isFinite(k[0])) return [];
    const px = Math.hypot(j[0] - k[0], j[1] - k[1]);
    return [{ joint, px, torso: px / torso, conf: k[2] }];
  });

/** The figure through the gates' camera with the pose file's limb lengths, and its misses against both keypoint sets. */
export const overlayFrame = (pose: PoseFrame, limbs: Readonly<Record<string, number>> | undefined, cam: ObsCamera, rtmw: RtmwFrame | null): OverlayFrame => {
  const projected = projectBody(figureBody(pose, segmentLengths(limbs)), cam);
  const vt = torsoPx(cam.kp2d);
  const rt = rtmw === null ? Number.NaN : torsoPx(rtmwCoco(rtmw));
  return {
    projected,
    torso: { rtmw: rt, vitpose: vt },
    rtmw: rtmw === null ? [] : errors(projected, (j) => rtmw[rtmwName(j)], rt),
    vitpose: errors(projected, (j) => cam.kp2d[COCO[j] ?? -1], vt),
  };
};

/** Lines drawn through the projected joints, so the fitted proportions show even where the skinned mesh lags. */
export const BONES: ReadonlyArray<readonly [string, string]> = [
  ...(['L', 'R'] as const).flatMap((s) => [
    [`hip.${s}`, `knee.${s}`],
    [`knee.${s}`, `ankle.${s}`],
    [`shoulder.${s}`, `elbow.${s}`],
    [`elbow.${s}`, `wrist.${s}`],
  ] as const),
  ['hip.L', 'hip.R'],
  ['shoulder.L', 'shoulder.R'],
  ['mid_hips', 'c7t1'],
];

/** A three.js camera reproducing a pinhole exactly: pose, vertical fov and the principal-point view offset. */
export interface ThreeView {
  readonly pos: V3;
  /** three's camera frame (looks down -z, y up), [x, y, z, w]. */
  readonly quat: Quat;
  readonly fovY: number;
  readonly size: readonly [number, number];
  /** setViewOffset(size, offset, size): the window's top-left in the centred full frame. */
  readonly offset: readonly [number, number];
}

const quatOf = (m: ReadonlyArray<number>): Quat => {
  // Row-major 3 × 3 to [x, y, z, w] (Shepperd).
  const g = (i: number): number => m[i] ?? 0;
  const tr = g(0) + g(4) + g(8);
  if (tr > 0) {
    const s = Math.sqrt(tr + 1) * 2;
    return [(g(7) - g(5)) / s, (g(2) - g(6)) / s, (g(3) - g(1)) / s, s / 4];
  }
  if (g(0) > g(4) && g(0) > g(8)) {
    const s = Math.sqrt(1 + g(0) - g(4) - g(8)) * 2;
    return [s / 4, (g(1) + g(3)) / s, (g(2) + g(6)) / s, (g(7) - g(5)) / s];
  }
  if (g(4) > g(8)) {
    const s = Math.sqrt(1 + g(4) - g(0) - g(8)) * 2;
    return [(g(1) + g(3)) / s, s / 4, (g(5) + g(7)) / s, (g(2) - g(6)) / s];
  }
  const s = Math.sqrt(1 + g(8) - g(0) - g(4)) * 2;
  return [(g(2) + g(6)) / s, (g(5) + g(7)) / s, s / 4, (g(3) - g(1)) / s];
};

export const threeView = (cam: Pinhole, size: readonly [number, number]): ThreeView => {
  const R = cam.w2c.R;
  const t = cam.w2c.t;
  const r = (i: number): number => R[i] ?? 0;
  // Camera centre -Rᵀt; three's axes are OpenCV's with y and z flipped.
  const c = (k: number): number => -(r(k) * t[0] + r(3 + k) * t[1] + r(6 + k) * t[2]);
  const pos: V3 = [c(0), c(1), c(2)];
  const m = [r(0), -r(3), -r(6), r(1), -r(4), -r(7), r(2), -r(5), -r(8)];
  const [, fy = 1, cx = size[0] / 2, cy = size[1] / 2] = cam.K;
  return { pos, quat: quatOf(m), fovY: (2 * Math.atan(size[1] / (2 * fy)) * 180) / Math.PI, size, offset: [size[0] / 2 - cx, size[1] / 2 - cy] };
};

export type { V2 };
