import { FORWARD_LEAN_RANGE } from './equipment';
import { COORDINATES } from './skeleton';

/**
 * Bounds on every skeleton coordinate, each with its provenance. Anatomical ROM only:
 * OpenSim's (Rajagopal's) coordinate ranges are software bounds, not ROM, and aren't used.
 */

export const Provenance = { Sourced: 'sourced', Equipment: 'equipment', Inferred: 'inferred', Locked: 'locked', Free: 'free' } as const;
export type Provenance = (typeof Provenance)[keyof typeof Provenance];

export interface Bound {
  /** Radians, or metres for a translation. */
  readonly value: number;
  readonly provenance: Provenance;
  /** A sources.yaml id with where in it, or why the value is inferred. */
  readonly source: string;
}

export interface Limit {
  readonly lower: Bound;
  readonly upper: Bound;
}

const DEG = Math.PI / 180;

const SOUCIE = 'soucie-2011, CDC reference table, males 20–44, mean';
const WOLAN = 'wolan-nieroda-2025 Table 2, rater 1 measurement A, mean';
const sourced = (deg: number, source: string): Bound => ({ value: deg * DEG, provenance: Provenance.Sourced, source });
const inferred = (deg: number, why: string): Bound => ({ value: deg * DEG, provenance: Provenance.Inferred, source: why });
const free: Bound = { value: Number.POSITIVE_INFINITY, provenance: Provenance.Free, source: 'root: unbounded' };
const freeLimit: Limit = { lower: { ...free, value: Number.NEGATIVE_INFINITY }, upper: free };
const both = (lower: Bound, upper: Bound): Limit => ({ lower, upper });

const TYPICAL = 'inferred: typical clinical ROM, no source read';
/** Shin roll off the ski inside the boot: cuff, liner and foot; carried by the shell; inferred. Degrees. */
export const BOOT_LATERAL_PLAY = 6;
const BOOT_PLAY = 'inferred: cuff lateral flex, liner and foot in the shell, no source read';

/** Tibial rotation's total arc by knee flexion, degrees: [flexion, arc]; zero at the standing pose. */
export const KNEE_ROTATION_ARC: ReadonlyArray<readonly [number, number]> = [
  // puah-2018 (read): cadaver tibial-tubercle bone marker, total arc (IR + ER) at 3 N·m.
  [0, 16.3],
  [30, 33.1],
  [45, 40.3],
  [60, 34.7],
  // mossberg-1983 (abstract only): active total arc, 85 women; held past 110°.
  [70, 35],
  [90, 40],
  [110, 44],
];
/** Internal share of the arc: mossberg-1983 "ER about twice IR" (abstract only), so the split is inferred. */
export const KNEE_INTERNAL_SHARE = 1 / 3;
const KNEE_ARC_MAX = Math.max(...KNEE_ROTATION_ARC.map((r) => r[1]));
const KNEE_ARC_WHY = 'inferred: puah-2018 / mossberg-1983 (abstract only) total arc, split ⅓ internal, linear in flexion';

/** The arc at knee flexion `flexion` (radians), linear between rows and held past either end, with its slope; radians. */
export const kneeRotationArc = (flexion: number): { readonly arc: number; readonly slope: number } => {
  const f = flexion / DEG;
  const rows = KNEE_ROTATION_ARC;
  const first = rows[0] ?? [0, 0];
  const last = rows[rows.length - 1] ?? first;
  if (f <= first[0]) return { arc: first[1] * DEG, slope: 0 };
  if (f >= last[0]) return { arc: last[1] * DEG, slope: 0 };
  const j = rows.findIndex((r) => r[0] > f);
  const [a, b] = [rows[j - 1] ?? first, rows[j] ?? last];
  const slope = (b[1] - a[1]) / (b[0] - a[0]);
  return { arc: (a[1] + slope * (f - a[0])) * DEG, slope };
};

/** knee_rotation's limit at knee flexion `flexion`, radians; internal positive. */
export const kneeRotationLimit = (flexion: number): Limit => {
  const { arc } = kneeRotationArc(flexion);
  return both(inferred(-(1 - KNEE_INTERNAL_SHARE) * arc / DEG, KNEE_ARC_WHY), inferred((KNEE_INTERNAL_SHARE * arc) / DEG, KNEE_ARC_WHY));
};

/** Per coordinate base name (without the side), lower and upper in the name's positive sense. */
const BASE: Readonly<Record<string, Limit>> = {
  pelvis_tx: freeLimit,
  pelvis_ty: freeLimit,
  pelvis_tz: freeLimit,
  pelvis_tilt: freeLimit,
  pelvis_list: freeLimit,
  pelvis_rotation: freeLimit,
  lumbar_flexion: both(inferred(-20, TYPICAL), inferred(50, TYPICAL)),
  lumbar_bending: both(inferred(-25, TYPICAL), inferred(25, TYPICAL)),
  lumbar_rotation: both(inferred(-10, TYPICAL), inferred(10, TYPICAL)),
  thoracic_flexion: both(inferred(-20, TYPICAL), inferred(30, TYPICAL)),
  thoracic_bending: both(inferred(-25, TYPICAL), inferred(25, TYPICAL)),
  thoracic_rotation: both(inferred(-35, TYPICAL), inferred(35, TYPICAL)),
  // Whole cervical spine; the head rides the neck.
  neck_flexion: both(sourced(-71.7, `${WOLAN} (extension)`), sourced(61.7, `${WOLAN} (flexion)`)),
  neck_bending: both(sourced(-44.5, `${WOLAN} (side bend L)`), sourced(45.2, `${WOLAN} (side bend R)`)),
  neck_rotation: both(sourced(-71.4, `${WOLAN} (rotation R)`), sourced(76.8, `${WOLAN} (rotation L)`)),
  hip_flexion: both(sourced(-17.4, `${SOUCIE} (hip extension)`), sourced(130.4, `${SOUCIE} (hip flexion)`)),
  hip_adduction: both(inferred(-45, TYPICAL), inferred(30, TYPICAL)),
  hip_rotation: both(inferred(-45, TYPICAL), inferred(40, TYPICAL)),
  knee_flexion: both(sourced(-1.0, `${SOUCIE} (knee extension)`), sourced(137.7, `${SOUCIE} (knee flexion)`)),
  // The widest of kneeRotationLimit's: the bound; the flexion-dependent limit is the solver's barrier.
  knee_rotation: both(inferred(-(1 - KNEE_INTERNAL_SHARE) * KNEE_ARC_MAX, KNEE_ARC_WHY), inferred(KNEE_INTERNAL_SHARE * KNEE_ARC_MAX, KNEE_ARC_WHY)),
  ankle_dorsiflexion: both(sourced(-54.6, `${SOUCIE} (plantar flexion)`), sourced(12.7, `${SOUCIE} (dorsiflexion)`)),
  subtalar_inversion: both(inferred(-BOOT_LATERAL_PLAY, BOOT_PLAY), inferred(BOOT_LATERAL_PLAY, BOOT_PLAY)),
  scapula_elevation: both(inferred(-10, TYPICAL), inferred(40, TYPICAL)),
  scapula_protraction: both(inferred(-15, TYPICAL), inferred(20, TYPICAL)),
  shoulder_flexion: both(inferred(-50, TYPICAL), sourced(168.8, `${SOUCIE} (shoulder flexion)`)),
  shoulder_abduction: both(inferred(-30, TYPICAL), inferred(170, TYPICAL)),
  shoulder_rotation: both(inferred(-90, TYPICAL), inferred(70, TYPICAL)),
  elbow_flexion: both(sourced(-0.8, `${SOUCIE} (elbow extension)`), sourced(144.6, `${SOUCIE} (elbow flexion)`)),
  forearm_pronation: both(sourced(-85.0, `${SOUCIE} (elbow supination)`), sourced(76.9, `${SOUCIE} (elbow pronation)`)),
  wrist_flexion: both(inferred(-70, TYPICAL), inferred(80, TYPICAL)),
  wrist_deviation: both(inferred(-20, TYPICAL), inferred(30, TYPICAL)),
};

const baseName = (name: string): string => name.replace(/\.[RL]$/, '');

/** Every coordinate's limit, keyed as COORDINATES; a missing base name is a hole the tests catch. */
export const JOINT_LIMITS: Readonly<Record<string, Limit | undefined>> = Object.fromEntries(COORDINATES.map((c) => [c.name, BASE[baseName(c.name)]]));

/** Not a coordinate: the boot cuff's forward lean off the sole normal, which bounds the shank in the boot. */
export const CUFF_FORWARD_LEAN: Limit = {
  lower: { value: FORWARD_LEAN_RANGE[0], provenance: Provenance.Equipment, source: 'equipment.ts FORWARD_LEAN_RANGE' },
  upper: { value: FORWARD_LEAN_RANGE[1], provenance: Provenance.Equipment, source: 'equipment.ts FORWARD_LEAN_RANGE' },
};

/**
 * Ankle dorsiflexion with the knee flexed and the foot loaded, soleus-limited, as a skier stands in the boot:
 * the weight-bearing lunge's tibial inclination, barefoot (Soucie's 12.7° is knee-extended, gastrocnemius-limited).
 */
export const ANKLE_DORSIFLEXION_KNEE_FLEXED: Bound = sourced(38.8, 'konor-2012 Table 1, weight-bearing lunge, digital inclinometer, mean');
