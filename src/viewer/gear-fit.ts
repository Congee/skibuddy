import type { Vec3 } from './mat4';
import { CAPSULE_GRIP } from './pose';

/**
 * Boot shape in the boot frame, in metres: origin at the ankle joint, +y up,
 * +z toward the toe, at the rest pose.
 */
export interface BootFit {
  /** Height of the sole, where the ski's top sits. */
  readonly sole: number;
  readonly heel: number;
  readonly toe: number;
  readonly centreX: number;
  readonly halfWidth: number;
  /** The cuff is an ellipse around the lower leg. */
  readonly cuffX: number;
  readonly cuffZ: number;
  readonly cuffRx: number;
  readonly cuffRz: number;
  /** Cuff top above the ankle. */
  readonly cuffTop: number;
}

/** Fits around the capsule figure's foot box and shin; the sole meets its ski. */
export const CAPSULE_BOOT: BootFit = {
  sole: -0.085,
  heel: -0.13,
  toe: 0.2,
  centreX: 0,
  halfWidth: 0.058,
  cuffX: 0,
  cuffZ: 0.005,
  cuffRx: 0.068,
  cuffRz: 0.072,
  cuffTop: 0.2,
};

const CUFF_TOP = 0.2;
/** Liner and shell around the bare foot and leg. */
const SHELL_MARGIN = 0.014;
const CUFF_MARGIN = 0.016;

/**
 * A mitten round the fist: `a` runs along the fingers, `n` out of the palm.
 * Extents are about the grip point along a, n and u = n x a, as min/max pairs.
 */
export interface GloveFit {
  readonly grip: Vec3;
  readonly a: Vec3;
  readonly n: Vec3;
  readonly extents: readonly [number, number, number, number, number, number];
}

/** The capsule's fist, in its forearm frame: fingers point down the forearm, the palm faces in. */
export const capsuleGlove = (medial: 1 | -1): GloveFit => ({
  grip: CAPSULE_GRIP,
  a: [0, -1, 0],
  n: [medial, 0, 0],
  extents: [-0.05, 0.05, -0.035, 0.045, -0.045, 0.045],
});

/** One side's rest-pose extents from build_anatomy.py, in glTF coordinates. */
export interface RawFit {
  readonly ankle: Vec3;
  readonly grip: Vec3;
  readonly fistA: Vec3;
  readonly fistN: Vec3;
  readonly fist: readonly [number, number, number, number, number, number];
  readonly sole: number;
  readonly toe: number;
  readonly heel: number;
  readonly footX: readonly [number, number];
  readonly shinX: readonly [number, number];
  readonly shinZ: readonly [number, number];
}

const isVec = (v: unknown, n: number): boolean => Array.isArray(v) && v.length === n && v.every((x) => typeof x === 'number' && Number.isFinite(x));

const isRawFit = (v: unknown): v is RawFit => {
  if (typeof v !== 'object' || v === null) return false;
  const r = v as Record<string, unknown>;
  return (
    isVec(r['ankle'], 3) &&
    isVec(r['grip'], 3) &&
    isVec(r['fistA'], 3) &&
    isVec(r['fistN'], 3) &&
    isVec(r['fist'], 6) &&
    ['sole', 'toe', 'heel'].every((k) => typeof r[k] === 'number') &&
    ['footX', 'shinX', 'shinZ'].every((k) => isVec(r[k], 2))
  );
};

/** Reads the bake's `gear_fit` extra: a JSON string keyed by the Blender side, R or L. */
export const parseGearFit = (extra: unknown): { readonly right: RawFit; readonly left: RawFit } | null => {
  if (typeof extra !== 'string') return null;
  try {
    const parsed: unknown = JSON.parse(extra);
    if (typeof parsed !== 'object' || parsed === null) return null;
    const { R, L } = parsed as Record<string, unknown>;
    return isRawFit(R) && isRawFit(L) ? { right: R, left: L } : null;
  } catch {
    return null;
  }
};

const mid = ([a, b]: readonly [number, number]): number => (a + b) / 2;
const half = ([a, b]: readonly [number, number]): number => (b - a) / 2;

export const bootFitFrom = (raw: RawFit): BootFit => {
  const [ax, ay, az] = raw.ankle;
  return {
    sole: raw.sole - ay,
    heel: raw.heel - az - 0.025,
    toe: raw.toe - az + 0.03,
    centreX: mid(raw.footX) - ax,
    halfWidth: half(raw.footX) + SHELL_MARGIN,
    cuffX: mid(raw.shinX) - ax,
    cuffZ: mid(raw.shinZ) - az,
    cuffRx: half(raw.shinX) + CUFF_MARGIN,
    cuffRz: half(raw.shinZ) + CUFF_MARGIN,
    cuffTop: CUFF_TOP,
  };
};

export const gloveFrom = (raw: RawFit): GloveFit => ({ grip: raw.grip, a: raw.fistA, n: raw.fistN, extents: raw.fist });

/**
 * True for a rest-pose point inside the boot, given the ankle in the same frame.
 * Pins avoid these so gear never hides an anchor.
 */
export const coveredByBoot = (fit: BootFit, ankle: Vec3, p: Vec3): boolean => {
  const x = p[0] - ankle[0];
  const y = p[1] - ankle[1];
  const z = p[2] - ankle[2];
  return y < fit.cuffTop + 0.03 && Math.abs(x - fit.cuffX) < Math.max(fit.cuffRx, fit.halfWidth) + 0.03 && z > fit.heel - 0.03 && z < fit.toe + 0.03;
};
