/**
 * Several 2D keypoint detectors on one clip: their consensus, how far they disagree, and a fused observation
 * weighted by that measured disagreement. Shared by the 2D fit and its gate.
 */

export type Uv = readonly [number, number];
/** One detector's point on one frame: px and a confidence already mapped to 0..1, or nothing. */
export type Detection = readonly [number, number, number] | undefined;

/** Below these the detector guesses: ViTPose and Ski 2DPose heatmap peaks (Ski 2DPose mean 0.70 on reilly; inferred). */
export const DETECTOR_MIN = { vitpose: 0.5, ski2d: 0.5 } as const;
/** RTMW's raw SimCC score of a well-seen body joint on reilly (median ≈ 3.8), and where it starts guessing (inferred). */
export const RTMW_SCORE = { reference: 3.8, min: 1.2 } as const;

/** A detector's point with its score mapped to 0..1 by `scale`, or nothing below `min` (in that 0..1 scale). */
export const detection = (p: ReadonlyArray<number> | undefined, min: number, scale = 1): Detection => {
  const [u, v, c] = [p?.[0], p?.[1], p?.[2]];
  return u === undefined || v === undefined || c === undefined || c / scale < min ? undefined : [u, v, Math.min(1, c / scale)];
};
/** Ski 2DPose marks the hand, not the wrist: its body joints that match COCO's. */
export const SKI2D_BODY = new Set(['shoulder', 'elbow', 'hip', 'knee', 'ankle']);

const median = (xs: ReadonlyArray<number>): number => {
  const s = xs.toSorted((a, b) => a - b);
  const m = s.length >> 1;
  return s.length === 0 ? Number.NaN : s.length % 2 === 1 ? (s[m] ?? 0) : ((s[m - 1] ?? 0) + (s[m] ?? 0)) / 2;
};

export const quantileOf = (xs: ReadonlyArray<number>, q: number): number => {
  const s = xs.filter(Number.isFinite).toSorted((a, b) => a - b);
  if (s.length === 0) return Number.NaN;
  const k = (s.length - 1) * q;
  const lo = Math.floor(k);
  return (s[lo] ?? 0) + ((s[Math.ceil(k)] ?? 0) - (s[lo] ?? 0)) * (k - lo);
};

/** Coordinate-wise median of the points: one detector off by a lot cannot drag it far. */
export const consensus = (pts: ReadonlyArray<Uv>): Uv | undefined =>
  pts.length === 0 ? undefined : [median(pts.map((p) => p[0])), median(pts.map((p) => p[1]))];

/** Farthest detection from the consensus, px. */
export const spreadOf = (pts: ReadonlyArray<Uv>): number => {
  const c = consensus(pts);
  return c === undefined ? Number.NaN : Math.max(...pts.map((p) => Math.hypot(p[0] - c[0], p[1] - c[1])));
};

const seen = (d: Detection, min: number): d is readonly [number, number, number] => d !== undefined && d[2] >= min && Number.isFinite(d[0]);

/**
 * Per frame, the confident detections of one joint (detectors × frames); a frame counts once at least two
 * detectors see it. Returns the consensus and spread per frame and the spread's q-quantile over the clip.
 */
export interface Agreement {
  readonly per: ReadonlyArray<{ readonly at: Uv; readonly spread: number } | undefined>;
  readonly tolerance: number;
}
export const agreement = (dets: ReadonlyArray<ReadonlyArray<Detection>>, min: number, scale: ReadonlyArray<number>, q = 0.95): Agreement => {
  const frames = Math.max(0, ...dets.map((d) => d.length));
  const per = Array.from({ length: frames }, (_, k) => {
    const pts = dets.flatMap((d) => { const p = d[k]; return seen(p, min) ? [[p[0], p[1]] as Uv] : []; });
    return pts.length < 2 ? undefined : { at: consensus(pts) as Uv, spread: spreadOf(pts) / (scale[k] ?? 1) };
  });
  return { per, tolerance: quantileOf(per.flatMap((p) => (p === undefined ? [] : [p.spread])), q) };
};

/** Robust per-axis σ (1.4826·MAD about zero) of one detector's offsets from the consensus, px. */
export const detectorSigma = (det: ReadonlyArray<Detection>, at: ReadonlyArray<Uv | undefined>, min: number): number => {
  const r = det.flatMap((d, k) => { const c = at[k]; return seen(d, min) && c !== undefined ? [Math.abs(d[0] - c[0]), Math.abs(d[1] - c[1])] : []; });
  return 1.4826 * median(r);
};

export interface Fused {
  readonly uv: Uv;
  readonly sigma: number;
}

/**
 * Inverse-variance mean of independent detections (σ px each), its σ inflated by the Birge ratio when they
 * disagree past their own σ, so two detectors never count as more certain than their spread allows.
 */
export const fuse = (obs: ReadonlyArray<{ readonly uv: Uv; readonly sigma: number }>): Fused | undefined => {
  if (obs.length === 0) return undefined;
  const w = obs.map((o) => 1 / (o.sigma * o.sigma));
  const W = w.reduce((a, b) => a + b, 0);
  const uv: Uv = [0, 1].map((i) => obs.reduce((a, o, j) => a + (w[j] ?? 0) * (o.uv[i] ?? 0), 0) / W) as unknown as Uv;
  const chi2 = obs.reduce((a, o, j) => a + (w[j] ?? 0) * ((o.uv[0] - uv[0]) ** 2 + (o.uv[1] - uv[1]) ** 2), 0);
  const dof = 2 * (obs.length - 1);
  return { uv, sigma: Math.sqrt((1 / W) * Math.max(1, dof > 0 ? chi2 / dof : 1)) };
};
