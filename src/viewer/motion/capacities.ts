import type { MuscleId } from '../../content/schema';
import { ANDERSON_TORQUE as MAX_TORQUE } from './anderson';

/**
 * Muscle moment capacities about the leg coordinates at the skiing posture (hip 60°, knee 70°, ankle 15°
 * dorsiflexed): `nm = fmaxN · armM · scale`, signed by the coordinate's positive sense in `skeleton.ts` (flexion,
 * adduction, internal rotation, knee flexion and rotation, dorsiflexion). Posture-constant except the hip rotation
 * arms (`legCapacitiesAt`); no force–length, pennation or wrapping. Knee rotation is constant too, though
 * hrycyna-2011's peaks are at 30° (external) and 90° (internal).
 */
export interface Capacity {
  readonly muscle: MuscleId;
  /** Skeleton coordinate without the `.R`/`.L` suffix. */
  readonly coordinate: string;
  /** Signed, N·m, at the skiing posture, calibrated. */
  readonly nm: number;
  /** Raw model F_max. */
  readonly fmaxN: number;
  /** Moment arm used, signed. */
  readonly armM: number;
  /** The direction's calibration factor. */
  readonly scale: number;
  readonly basis: 'source' | 'inferred';
  /** sources.yaml ids actually read. */
  readonly sources: ReadonlyArray<string>;
  /** One line when inferred: what was borrowed from where. */
  readonly note?: string;
}

const RAJAGOPAL = 'rajagopal-2016';

/** rajagopal-2016 `max_isometric_force`, right side, N; the content's merged muscles sum the model's parts. */
const F = {
  vasti: 5148.77 + 2747.82 + 1697.36,
  rectusFemoris: 2191.74,
  gluteusMaximus: 983.78 + 1406.05 + 947.75,
  gluteusMedius: 1093.47 + 765.09 + 871.2,
  gluteusMinimus: 374.05 + 394.82 + 446.77,
  bicepsLong: 1313.18,
  bicepsShort: 557.11,
  medialHamstrings: 2200.99 + 591.3,
  // Longus + brevis; the model has no pectineus.
  adductors: 916.8 + 625.82,
  adductorMagnus: 4 * 597.3,
  gracilis: 281.31,
  tensorFasciaeLatae: 411.21,
  sartorius: 249.41,
  iliopsoas: 1021.14 + 1426.79,
  // Piriformis only; the model has no obturators, gemelli or quadratus femoris.
  deepHipRotators: 1029.79,
  tibialisAnterior: 1227.45,
  // EDL + EHL.
  toeExtensors: 603.5 + 285.87,
  tibialisPosterior: 1730.15,
  soleus: 6194.84,
  gastrocnemius: 1575.06 + 3115.51,
  peroneals: 521.2 + 1115.37,
} as const;

/** Hip flexion of the skiing posture, °: anderson-2007's maxima calibrate the model there. */
const SKIING_HIP_DEG = 60;

const row = (muscle: string, coordinate: string, fmaxN: number, armM: number, sources: ReadonlyArray<string>, note?: string): Capacity => ({
  muscle: muscle as MuscleId,
  coordinate,
  nm: fmaxN * armM,
  fmaxN,
  armM,
  scale: 1,
  basis: note === undefined ? 'source' : 'inferred',
  sources,
  ...(note === undefined ? {} : { note }),
});

const NEMETH = [RAJAGOPAL, 'nemeth-1985'];
const ABDUCTOR = 'no abductor arm read: 5 cm shared by the abductors';
const ADDUCTOR = 'no adductor arm read: 5 cm shared by the adductors';
const NO_DELP = 'no delp-1999 data: constant inferred arm';
const KNEE_EXT = 'patellar tendon arm peaks 4–6 cm near 45° and falls past 40°: 4 cm at 70° inferred';
const ACHILLES = 'rest arm ~4 cm inferred + 1–1.5 cm at MVC (maganaris-1998)';
// hrycyna-2011's maxima (30° external, 90° internal flexion; this file holds knee 70°) bound the whole shank-foot unit.
const HRYCYNA_EXTERNAL_NM = 55.2;
const HRYCYNA_INTERNAL_NM = 42.6;
const KNEE_ROT_EXTERNAL_F = F.bicepsLong + F.bicepsShort + F.tensorFasciaeLatae;
const KNEE_ROT_INTERNAL_F = F.medialHamstrings + F.gracilis + F.sartorius + F.gracilis;
const KNEE_ROT_SOURCES = [RAJAGOPAL, 'hrycyna-2011', 'cleather-2018'];
const KNEE_ROT_EXTERNAL = `no arm in mm read: one round arm so the direction totals hrycyna-2011's ${HRYCYNA_EXTERNAL_NM} N·m (inferred upper bound)`;
const KNEE_ROT_INTERNAL = `no arm in mm read: one round arm so the direction totals hrycyna-2011's ${HRYCYNA_INTERNAL_NM} N·m (inferred upper bound)`;
const TIBIALIS = 'rest arm ~3.5 cm inferred, largest dorsiflexed (rugg-1990), + 0.9–1.5 cm at MVC (maganaris-1999)';

type DelpMuscle = 'gluteus-maximus' | 'gluteus-medius' | 'gluteus-minimus' | 'deep-hip-rotators' | 'iliopsoas';
/** One delp-1999 line's rotation arm, mm (+ internal), at hip flexion 0 / 60 / 90°; null: no 60° value, linear 0–90°. */
type Line = readonly [deg0: number, deg60: number | null, deg90: number];

// Table 1 (0°, 90°) and the plotted 60° means (read by eye, ±5 mm); a content muscle's arm is the plain mean of its lines.
const DELP: Readonly<Record<DelpMuscle, ReadonlyArray<Line>>> = {
  // GMAX1 (anterior, superior) to GMAX6 (posterior, inferior).
  'gluteus-maximus': [[-20, 32, 46], [-26, 14, 33], [-28, 5, 13], [-29, -6, 1], [-15, -6, -3], [-18, -11, -12]],
  // GMED1 (anterior) to GMED4 (posterior).
  'gluteus-medius': [[7, 53, 58], [-11, 44, 55], [-20, 29, 39], [-41, 8, 22]],
  'gluteus-minimus': [[18, null, 35], [-10, null, 42], [-30, null, 26]],
  // Piriformis, obturator internus, quadratus femoris, obturator externus.
  'deep-hip-rotators': [[-29, null, 14], [-30, -19, -7], [-22, -33, -27], [-14, -25, -26]],
  iliopsoas: [[2, 0, -4]],
};

const lineAt = ([mm0, mm60, mm90]: Line, deg: number): number => {
  if (mm60 === null) return mm0 + ((mm90 - mm0) * deg) / 90;
  return deg <= 60 ? mm0 + ((mm60 - mm0) * deg) / 60 : mm60 + ((mm90 - mm60) * (deg - 60)) / 30;
};

/** The muscle's mean rotation arm at `hipFlexionDeg` (clamped to 0–90°), m. */
const delpArm = (muscle: DelpMuscle, hipFlexionDeg: number): number => {
  if (Number.isNaN(hipFlexionDeg)) throw new RangeError(`${muscle}: hip flexion is NaN`);
  const deg = Math.min(90, Math.max(0, hipFlexionDeg));
  const lines = DELP[muscle];
  return lines.reduce((sum, line) => sum + lineAt(line, deg), 0) / lines.length / 1000;
};

const delp = (muscle: DelpMuscle, fmaxN: number, hipFlexionDeg: number): Capacity =>
  row(muscle, 'hip_rotation', fmaxN, delpArm(muscle, hipFlexionDeg), [RAJAGOPAL, 'delp-1999']);

const rowsAt = (hipFlexionDeg: number): ReadonlyArray<Capacity> => [
  // Hip flexion (+) / extension (−).
  row('iliopsoas', 'hip_flexion', F.iliopsoas, 0.035, [RAJAGOPAL], 'no hip flexor arm read: 3.5 cm'),
  row('rectus-femoris', 'hip_flexion', F.rectusFemoris, 0.04, [RAJAGOPAL], 'no hip flexor arm read: 4 cm'),
  row('tensor-fasciae-latae', 'hip_flexion', F.tensorFasciaeLatae, 0.04, [RAJAGOPAL], 'borrowed the rectus femoris row'),
  row('sartorius', 'hip_flexion', F.sartorius, 0.04, [RAJAGOPAL], 'borrowed the rectus femoris row'),
  row('adductors', 'hip_flexion', F.adductors, 0.01, [RAJAGOPAL], 'longus and brevis flex less as the hip flexes: 1 cm'),
  row('gracilis', 'hip_flexion', F.gracilis, 0.01, [RAJAGOPAL], 'borrowed the adductors row'),
  row('gluteus-minimus', 'hip_flexion', F.gluteusMinimus, 0.01, [RAJAGOPAL], 'anterior fibres flex: 1 cm'),
  row('gluteus-medius', 'hip_flexion', F.gluteusMedius, -0.01, [RAJAGOPAL], 'posterior fibres extend: net 1 cm'),
  row('gluteus-maximus', 'hip_flexion', F.gluteusMaximus, -0.079, NEMETH, '79 mm at 0° (nemeth-1985), falls with flexion'),
  row('biceps-femoris', 'hip_flexion', F.bicepsLong, -0.061, NEMETH, 'hamstrings 61 mm at 0° (nemeth-1985), peak at 35°; long head only'),
  row('medial-hamstrings', 'hip_flexion', F.medialHamstrings, -0.061, NEMETH, 'hamstrings 61 mm at 0° (nemeth-1985), peak at 35°'),
  row('adductor-magnus', 'hip_flexion', F.adductorMagnus, -0.015, NEMETH, '15 mm at 0° (nemeth-1985), rises to 75°'),
  row('deep-hip-rotators', 'hip_flexion', F.deepHipRotators, -0.01, [RAJAGOPAL], 'piriformis behind the axis: 1 cm'),
  // Hip adduction (+) / abduction (−).
  row('adductors', 'hip_adduction', F.adductors, 0.05, [RAJAGOPAL], ADDUCTOR),
  row('adductor-magnus', 'hip_adduction', F.adductorMagnus, 0.05, [RAJAGOPAL], ADDUCTOR),
  row('gracilis', 'hip_adduction', F.gracilis, 0.05, [RAJAGOPAL], ADDUCTOR),
  row('iliopsoas', 'hip_adduction', F.iliopsoas, 0.01, [RAJAGOPAL], 'lesser trochanter medial: 1 cm'),
  row('biceps-femoris', 'hip_adduction', F.bicepsLong, 0.01, [RAJAGOPAL], 'hamstrings adduct: 1 cm'),
  row('medial-hamstrings', 'hip_adduction', F.medialHamstrings, 0.01, [RAJAGOPAL], 'hamstrings adduct: 1 cm'),
  row('gluteus-medius', 'hip_adduction', F.gluteusMedius, -0.05, [RAJAGOPAL], ABDUCTOR),
  row('gluteus-minimus', 'hip_adduction', F.gluteusMinimus, -0.05, [RAJAGOPAL], ABDUCTOR),
  row('tensor-fasciae-latae', 'hip_adduction', F.tensorFasciaeLatae, -0.05, [RAJAGOPAL], ABDUCTOR),
  row('gluteus-maximus', 'hip_adduction', F.gluteusMaximus, -0.01, [RAJAGOPAL], 'upper fibres abduct, lower adduct: net 1 cm'),
  row('deep-hip-rotators', 'hip_adduction', F.deepHipRotators, -0.02, [RAJAGOPAL], 'piriformis abducts the flexed hip: 2 cm'),
  row('sartorius', 'hip_adduction', F.sartorius, -0.01, [RAJAGOPAL], 'abducts: 1 cm'),
  row('rectus-femoris', 'hip_adduction', F.rectusFemoris, -0.01, [RAJAGOPAL], 'abducts: 1 cm'),
  // Hip internal (+) / external (−) rotation: delp-1999's arms follow hip flexion, the others are constant.
  delp('gluteus-medius', F.gluteusMedius, hipFlexionDeg),
  delp('gluteus-minimus', F.gluteusMinimus, hipFlexionDeg),
  row('tensor-fasciae-latae', 'hip_rotation', F.tensorFasciaeLatae, 0.02, [RAJAGOPAL], `${NO_DELP}; internal rotator like the gluteus medius: 2 cm`),
  row('adductors', 'hip_rotation', F.adductors, 0.01, [RAJAGOPAL], `${NO_DELP}; internal rotators in flexion: 1 cm`),
  row('adductor-magnus', 'hip_rotation', F.adductorMagnus, 0.01, [RAJAGOPAL], `${NO_DELP}; borrowed the adductors row`),
  row('gracilis', 'hip_rotation', F.gracilis, 0.01, [RAJAGOPAL], `${NO_DELP}; borrowed the adductors row`),
  row('medial-hamstrings', 'hip_rotation', F.medialHamstrings, 0.01, [RAJAGOPAL], `${NO_DELP}; medial insertion: 1 cm`),
  delp('gluteus-maximus', F.gluteusMaximus, hipFlexionDeg),
  delp('deep-hip-rotators', F.deepHipRotators, hipFlexionDeg),
  row('biceps-femoris', 'hip_rotation', F.bicepsLong, -0.01, [RAJAGOPAL], `${NO_DELP}; lateral insertion: 1 cm`),
  row('sartorius', 'hip_rotation', F.sartorius, -0.01, [RAJAGOPAL], `${NO_DELP}; external rotator: 1 cm`),
  delp('iliopsoas', F.iliopsoas, hipFlexionDeg),
  // Knee flexion (+) / extension (−).
  row('vasti', 'knee_flexion', F.vasti, -0.04, [RAJAGOPAL, 'krevolin-2004', 'arnold-2010'], KNEE_EXT),
  row('rectus-femoris', 'knee_flexion', F.rectusFemoris, -0.04, [RAJAGOPAL, 'krevolin-2004', 'arnold-2010'], KNEE_EXT),
  // Peak 3.0 cm at 55° (arnold-2010, matching its cadaver data).
  row('biceps-femoris', 'knee_flexion', F.bicepsLong + F.bicepsShort, 0.03, [RAJAGOPAL, 'arnold-2010']),
  row('medial-hamstrings', 'knee_flexion', F.medialHamstrings, 0.03, [RAJAGOPAL, 'arnold-2010'], 'borrowed the biceps femoris row'),
  row('gracilis', 'knee_flexion', F.gracilis, 0.03, [RAJAGOPAL, 'arnold-2010'], 'borrowed the biceps femoris row'),
  row('sartorius', 'knee_flexion', F.sartorius, 0.03, [RAJAGOPAL, 'arnold-2010'], 'borrowed the biceps femoris row'),
  row('gastrocnemius', 'knee_flexion', F.gastrocnemius, 0.02, [RAJAGOPAL], 'no gastrocnemius knee arm read: 2 cm'),
  row('tensor-fasciae-latae', 'knee_flexion', F.tensorFasciaeLatae, 0.005, [RAJAGOPAL], 'iliotibial band behind the flexed knee: 0.5 cm'),
  row('popliteus', 'knee_flexion', F.gracilis, 0.01, [], 'not in rajagopal-2016: F_max borrowed from gracilis, arm 1 cm'),
  // Knee internal (+) / external (−) rotation: directions from cleather-2018, uncalibrated (hrycyna-2011 sets the totals).
  row('medial-hamstrings', 'knee_rotation', F.medialHamstrings, HRYCYNA_INTERNAL_NM / KNEE_ROT_INTERNAL_F, KNEE_ROT_SOURCES, KNEE_ROT_INTERNAL),
  row('gracilis', 'knee_rotation', F.gracilis, HRYCYNA_INTERNAL_NM / KNEE_ROT_INTERNAL_F, KNEE_ROT_SOURCES, KNEE_ROT_INTERNAL),
  row('sartorius', 'knee_rotation', F.sartorius, HRYCYNA_INTERNAL_NM / KNEE_ROT_INTERNAL_F, KNEE_ROT_SOURCES, KNEE_ROT_INTERNAL),
  row('popliteus', 'knee_rotation', F.gracilis, HRYCYNA_INTERNAL_NM / KNEE_ROT_INTERNAL_F, ['hrycyna-2011', 'cleather-2018'], `${KNEE_ROT_INTERNAL}; F_max borrowed from gracilis`),
  row('biceps-femoris', 'knee_rotation', F.bicepsLong + F.bicepsShort, -HRYCYNA_EXTERNAL_NM / KNEE_ROT_EXTERNAL_F, KNEE_ROT_SOURCES, KNEE_ROT_EXTERNAL),
  row('tensor-fasciae-latae', 'knee_rotation', F.tensorFasciaeLatae, -HRYCYNA_EXTERNAL_NM / KNEE_ROT_EXTERNAL_F, KNEE_ROT_SOURCES, `${KNEE_ROT_EXTERNAL}; via the iliotibial band`),
  // Ankle dorsiflexion (+) / plantarflexion (−).
  row('tibialis-anterior', 'ankle_dorsiflexion', F.tibialisAnterior, 0.045, [RAJAGOPAL, 'rugg-1990', 'maganaris-1999'], TIBIALIS),
  row('toe-extensors', 'ankle_dorsiflexion', F.toeExtensors, 0.045, [RAJAGOPAL], 'borrowed the tibialis anterior row'),
  row('soleus', 'ankle_dorsiflexion', F.soleus, -0.05, [RAJAGOPAL, 'maganaris-1998'], ACHILLES),
  row('gastrocnemius', 'ankle_dorsiflexion', F.gastrocnemius, -0.05, [RAJAGOPAL, 'maganaris-1998'], ACHILLES),
  row('tibialis-posterior', 'ankle_dorsiflexion', F.tibialisPosterior, -0.01, [RAJAGOPAL], 'tendon behind the medial malleolus: 1 cm'),
  row('peroneals', 'ankle_dorsiflexion', F.peroneals, -0.01, [RAJAGOPAL], 'tendons behind the lateral malleolus: 1 cm'),
];

/** Σ fmaxN · |armM| per coordinate: [against, along], uncalibrated. */
export const rawSums = (caps: ReadonlyArray<Capacity>): Readonly<Record<string, readonly [number, number]>> => {
  const sums: Record<string, [number, number]> = {};
  for (const c of caps) {
    const s = (sums[c.coordinate] ??= [0, 0]);
    s[c.armM < 0 ? 0 : 1] += c.fmaxN * Math.abs(c.armM);
  }
  return sums;
};

// rajagopal-2016's 60 N/cm² model exceeds measured MVC, so the measurement (anderson-2007) sets the scale and the model the split.
// Open item: a biarticular muscle (gastrocnemius) gets a different factor at each joint it crosses.
// The factors are fixed at the skiing posture, where anderson-2007 measured: no other posture rescales them.
const RAW_SUMS = rawSums(rowsAt(SKIING_HIP_DEG));
const factor = (coordinate: string, k: 0 | 1): number => (MAX_TORQUE[coordinate]?.[k] ?? Number.NaN) / (RAW_SUMS[coordinate]?.[k] ?? Number.NaN);
const HIP = (factor('hip_flexion', 0) + factor('hip_flexion', 1)) / 2;
const SCALE: Readonly<Record<string, readonly [number, number]>> = {
  hip_flexion: [factor('hip_flexion', 0), factor('hip_flexion', 1)],
  knee_flexion: [factor('knee_flexion', 0), factor('knee_flexion', 1)],
  ankle_dorsiflexion: [factor('ankle_dorsiflexion', 0), factor('ankle_dorsiflexion', 1)],
  // Not measured there: the mean of the hip's sagittal factors, inferred.
  hip_adduction: [HIP, HIP],
  hip_rotation: [HIP, HIP],
  // hrycyna-2011 sets the direction totals through the arms, so no factor.
  knee_rotation: [1, 1],
};

/**
 * Right leg at a hip flexion (clamped to 0–90°), calibrated per direction; absent muscle–coordinate pairs are 0.
 * Only delp-1999's hip rotation arms move with the posture, linearly between its 0 / 60 / 90° columns. Pure: each
 * call builds its own rows.
 */
export const legCapacitiesAt = (hipFlexionDeg: number): ReadonlyArray<Capacity> =>
  rowsAt(hipFlexionDeg).map((c) => {
    const scale = SCALE[c.coordinate]?.[c.armM < 0 ? 0 : 1] ?? Number.NaN;
    return Object.assign({}, c, { scale, nm: c.fmaxN * c.armM * scale });
  });

/** The skiing posture's rows. */
export const LEG_CAPACITIES: ReadonlyArray<Capacity> = legCapacitiesAt(SKIING_HIP_DEG);

/** `skeleton.ts` makes each leg coordinate's positive sense anatomical on both sides, so no sign flips. */
export const capacitiesOf = (_side: 'R' | 'L'): ReadonlyArray<Capacity> => LEG_CAPACITIES;

/** Σ |negative| and Σ positive capacities per coordinate: [against, along], the shape of `MAX_TORQUE`. */
export const capacitySums = (caps: ReadonlyArray<Capacity>): Readonly<Record<string, readonly [number, number]>> => {
  const sums: Record<string, [number, number]> = {};
  for (const c of caps) {
    const s = (sums[c.coordinate] ??= [0, 0]);
    if (c.nm < 0) s[0] -= c.nm;
    else s[1] += c.nm;
  }
  return sums;
};
