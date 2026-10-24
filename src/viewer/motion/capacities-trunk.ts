import type { MuscleId } from '../../content/schema';
import { REFERENCE_SKIER } from '../skier';
import { capacitySums, rawSums } from './capacities';
import type { Capacity } from './capacities';

/**
 * Muscle moment capacities about the spine, neck and right-arm coordinates, as capacities.ts: `nm = fmaxN · armM ·
 * scale`, signed by `skeleton.ts` (spine + flexion, + right bending, + left rotation; arm + flexion, abduction,
 * internal rotation). Spine and neck rows are one (right) copy of each bilateral muscle; the left copy flips the
 * sign of bending and rotation. The arm needs no flip: `skeleton.ts` makes its signs anatomical on both sides.
 * Posture-constant; every arm is a round inferred value (no moment-arm table read), so no row is `source`.
 */

const HAMNER = 'hamner-2010';
const ARM26 = 'holzbaur-2005';
const ROOS = 'roos-2020';

/** Muscles not in hamner-2010's trunk (rectus, transversus, quadratus lumborum, multifidus, latissimus): the oblique's F_max. */
const BORROWED = 'no F_max read: the obliques\' 900 N (hamner-2010)';
const ERECTOR = 2500;
const OBLIQUE = 900;

type Row = { -readonly [K in keyof Capacity]: Capacity[K] };

const row = (muscle: string, coordinate: string, fmaxN: number, armM: number, sources: ReadonlyArray<string>, note: string): Row => ({
  muscle: muscle as MuscleId,
  coordinate,
  nm: fmaxN * armM,
  fmaxN,
  armM,
  scale: 1,
  basis: 'inferred',
  sources,
  note,
});

/** Trunk rows, one region: `region` is `lumbar` or `thoracic`; the quadratus lumborum and transversus cross only the lumbar. */
const spine = (region: 'lumbar' | 'thoracic'): ReadonlyArray<Row> => {
  const f = `${region}_flexion`;
  const b = `${region}_bending`;
  const r = `${region}_rotation`;
  const lumbar = region === 'lumbar';
  return [
    // Flexion (+) / extension (−).
    row('rectus-abdominis', f, OBLIQUE, 0.07, [HAMNER], `${BORROWED}, arm 7 cm inferred`),
    row('external-oblique', f, OBLIQUE, 0.04, [HAMNER], 'arm 4 cm inferred'),
    row('internal-oblique', f, OBLIQUE, 0.04, [HAMNER], 'arm 4 cm inferred'),
    row('erector-spinae', f, ERECTOR, -0.06, [HAMNER], 'arm 6 cm inferred'),
    row('multifidus', f, OBLIQUE, -0.03, [HAMNER], `${BORROWED}, arm 3 cm inferred`),
    row('latissimus-dorsi', f, OBLIQUE, -0.02, [HAMNER], `${BORROWED}, thoracolumbar fascia arm 2 cm inferred`),
    ...(lumbar ? [row('quadratus-lumborum', f, OBLIQUE, -0.03, [HAMNER], `${BORROWED}, arm 3 cm inferred`)] : []),
    // Bending: + right, the right copy bends right.
    row('external-oblique', b, OBLIQUE, 0.05, [HAMNER], 'arm 5 cm inferred'),
    row('internal-oblique', b, OBLIQUE, 0.05, [HAMNER], 'arm 5 cm inferred'),
    row('erector-spinae', b, ERECTOR, 0.04, [HAMNER], 'arm 4 cm inferred'),
    row('multifidus', b, OBLIQUE, 0.01, [HAMNER], `${BORROWED}, arm 1 cm inferred`),
    row('rectus-abdominis', b, OBLIQUE, 0.02, [HAMNER], `${BORROWED}, arm 2 cm inferred`),
    row('latissimus-dorsi', b, OBLIQUE, 0.02, [HAMNER], `${BORROWED}, arm 2 cm inferred`),
    ...(lumbar
      ? [
          row('quadratus-lumborum', b, OBLIQUE, 0.05, [HAMNER], `${BORROWED}, arm 5 cm inferred`),
          // Stabiliser: transverse fibres, so 1 cm against the obliques' 5 cm.
          row('transversus-abdominis', b, OBLIQUE, 0.01, [HAMNER], `${BORROWED}, stabiliser: arm 1 cm inferred`),
        ]
      : []),
    // Rotation: + left; the right external oblique and the multifidus turn left, the right internal oblique and erector right.
    row('external-oblique', r, OBLIQUE, 0.05, [HAMNER], 'contralateral rotator, arm 5 cm inferred'),
    row('internal-oblique', r, OBLIQUE, -0.05, [HAMNER], 'ipsilateral rotator, arm 5 cm inferred'),
    row('multifidus', r, OBLIQUE, 0.02, [HAMNER], `${BORROWED}, contralateral rotator, arm 2 cm inferred`),
    row('erector-spinae', r, ERECTOR, -0.01, [HAMNER], 'ipsilateral rotator, arm 1 cm inferred'),
    ...(lumbar ? [row('transversus-abdominis', r, OBLIQUE, -0.01, [HAMNER], `${BORROWED}, stabiliser: arm 1 cm inferred, sign with the internal oblique`)] : []),
  ];
};

/** roos-2020 Table 4 "original model" (the vasavada-1998 neck), N: SCM = sternomastoid + cleidomastoid + cleido-occipital; splenius capitis both parts; trapezius clavicular + acromial. */
const NECK = { scm: 86.1 + 43.1 + 43.1, splenius: 55.0 + 53.2, trapezius: 132.0 + 348.6 } as const;
const VASAVADA = [ROOS, 'vasavada-1998'];

const neck: ReadonlyArray<Row> = [
  // Flexion (+) / extension (−).
  row('neck-stabilisers', 'neck_flexion', NECK.scm, 0.04, VASAVADA, 'sternocleidomastoid; arm 4 cm inferred'),
  row('neck-stabilisers', 'neck_flexion', NECK.splenius, -0.04, VASAVADA, 'splenius capitis, extends; arm 4 cm inferred'),
  row('trapezius', 'neck_flexion', NECK.trapezius, -0.03, VASAVADA, 'upper fibres extend; arm 3 cm inferred'),
  // Bending: + right, all ipsilateral.
  row('neck-stabilisers', 'neck_bending', NECK.scm + NECK.splenius, 0.03, VASAVADA, 'sternocleidomastoid + splenius capitis; arm 3 cm inferred'),
  row('trapezius', 'neck_bending', NECK.trapezius, 0.03, VASAVADA, 'arm 3 cm inferred'),
  // Rotation: + left; sternocleidomastoid and trapezius turn the head away, splenius capitis toward the side.
  row('neck-stabilisers', 'neck_rotation', NECK.scm, 0.02, VASAVADA, 'sternocleidomastoid, contralateral; arm 2 cm inferred'),
  row('neck-stabilisers', 'neck_rotation', NECK.splenius, -0.02, VASAVADA, 'splenius capitis, ipsilateral; arm 2 cm inferred'),
  row('trapezius', 'neck_rotation', NECK.trapezius, 0.03, VASAVADA, 'largest axial-rotation capacity (vasavada-1998 abstract); arm 3 cm inferred'),
];

/** Nominal F_max per shoulder sense where no model file was read, N. */
const NOMINAL = 1000;
const SHOULDER = 'no F_max or arm read: 1000 N shared evenly per sense, arm 3 cm';
const sh = (muscle: string, coordinate: string, sign: 1 | -1, what: string): Row => row(muscle, coordinate, NOMINAL, sign * 0.03, [], `${SHOULDER} (${what})`);

/** arm26.osim (adapted from holzbaur-2005) `max_isometric_force`, right arm, N. */
const ARM_F = { biceps: 624.3 + 435.56, triceps: 798.52 + 624.3 + 624.3 } as const;

const armRows: ReadonlyArray<Row> = [
  // Shoulder flexion (+) / extension (−).
  sh('anterior-deltoid', 'shoulder_flexion', 1, 'flexor'),
  sh('biceps-brachii', 'shoulder_flexion', 1, 'long head'),
  sh('latissimus-dorsi', 'shoulder_flexion', -1, 'extensor'),
  sh('teres-major', 'shoulder_flexion', -1, 'extensor'),
  sh('triceps-brachii', 'shoulder_flexion', -1, 'long head'),
  // Shoulder abduction (+) / adduction (−).
  sh('anterior-deltoid', 'shoulder_abduction', 1, 'abductor'),
  sh('rotator-cuff', 'shoulder_abduction', 1, 'supraspinatus'),
  sh('latissimus-dorsi', 'shoulder_abduction', -1, 'adductor'),
  sh('teres-major', 'shoulder_abduction', -1, 'adductor'),
  sh('triceps-brachii', 'shoulder_abduction', -1, 'long head'),
  // Shoulder internal (+) / external (−) rotation; the cuff splits into its two signed rows.
  sh('anterior-deltoid', 'shoulder_rotation', 1, 'internal rotator'),
  sh('latissimus-dorsi', 'shoulder_rotation', 1, 'internal rotator'),
  sh('teres-major', 'shoulder_rotation', 1, 'internal rotator'),
  sh('rotator-cuff', 'shoulder_rotation', 1, 'subscapularis'),
  sh('rotator-cuff', 'shoulder_rotation', -1, 'infraspinatus and teres minor'),
  // Elbow flexion (+) / extension (−); the content has no brachialis, so the biceps carries the flexion.
  row('biceps-brachii', 'elbow_flexion', ARM_F.biceps, 0.03, [ARM26], 'F_max from arm26.osim, arm 3 cm inferred'),
  row('triceps-brachii', 'elbow_flexion', ARM_F.triceps, -0.03, [ARM26], 'F_max from arm26.osim, arm 3 cm inferred'),
];

/** Each shoulder sense shares NOMINAL evenly, so the sense's muscle count does not set its capacity. */
const arm: ReadonlyArray<Row> = armRows.map((r) => {
  if (!r.coordinate.startsWith('shoulder')) return r;
  const n = armRows.filter((o) => o.coordinate === r.coordinate && Math.sign(o.armM) === Math.sign(r.armM)).length;
  return Object.assign({}, r, { fmaxN: NOMINAL / n, nm: (NOMINAL / n) * r.armM });
});

/** Maximum voluntary moments, N·m: [against, along]; null where no measurement was read (the opposite sense's factor is borrowed). */
const MVC: Readonly<Record<string, readonly [number | null, number | null]>> = {
  // Nm/kg × the reference skier's mass: flexion from hildebrandt-2017 (male FIS skiers), bending and rotation pan-2025 males, the mean of the two sides.
  ...Object.fromEntries(
    (['lumbar', 'thoracic'] as const).flatMap((r) => [
      [`${r}_flexion`, [4.53 * REFERENCE_SKIER.mass, 2.44 * REFERENCE_SKIER.mass]],
      [`${r}_bending`, [0.93 * REFERENCE_SKIER.mass, 0.93 * REFERENCE_SKIER.mass]],
      [`${r}_rotation`, [0.69 * REFERENCE_SKIER.mass, 0.69 * REFERENCE_SKIER.mass]],
    ]),
  ),
  // mortensen-2018 Table 3, the vasavada experiment (flexion 30, extension 52, lateral 36, axial 15 Nm).
  neck_flexion: [52, 30],
  neck_bending: [36, 36],
  neck_rotation: [15, 15],
  // Extension 54.41 Nm (Huberman 2020), adduction 67.9 Nm (holzbaur-2007), external rotation 26.4 Nm (Lannersten 1993); the other sense borrows the factor.
  shoulder_flexion: [54.41, null],
  shoulder_abduction: [67.9, null],
  shoulder_rotation: [26.4, null],
  // Extension: simpson-2019 mean of two tests; flexion: dourado-2025 isometric peak torque, males.
  elbow_flexion: [(48.47 + 49.02) / 2, 54.0],
};

/** The flexion maxima's protocol, appended to their rows' notes: it differs from the other maxima's. */
const HILDEBRANDT = 'hildebrandt-2017 male FIS skiers, standing, hips fixed, concentric isokinetic 150°/s over 0–60° flexion';
const MVC_NOTE: Readonly<Record<string, string>> = {
  lumbar_flexion: `maximum: ${HILDEBRANDT} (pan-2025's seated isometric 1.74 / 1.15 Nm/kg sit 2.6× / 2.1× lower)`,
  thoracic_flexion: `maximum: the lumbar value copied (inferred); ${HILDEBRANDT}, about the lumbosacral axis`,
};

export const TRUNK_COORDINATES: ReadonlyArray<string> = ['lumbar', 'thoracic', 'neck'].flatMap((r) => [`${r}_flexion`, `${r}_bending`, `${r}_rotation`]);
export const ARM_COORDINATES: ReadonlyArray<string> = ['shoulder_flexion', 'shoulder_abduction', 'shoulder_rotation', 'elbow_flexion'];

/** The left copy's bending and rotation point the other way. */
const FLIPPED = /_(bending|rotation)$/;
const flip = (c: Capacity): Capacity => (FLIPPED.test(c.coordinate) ? { ...c, armM: -c.armM, nm: -c.nm } : c);

/** Scale each direction so the sum over `caps` equals its measured moment; an unmeasured sense takes the other's factor. */
const calibrate = (rows: ReadonlyArray<Row>, caps: ReadonlyArray<Capacity>): ReadonlyArray<Capacity> => {
  const raw = rawSums(caps);
  const factor = (coordinate: string, k: 0 | 1): { scale: number; borrowed: boolean } => {
    const mvc = MVC[coordinate];
    const own = mvc?.[k] ?? null;
    if (own !== null) return { scale: own / (raw[coordinate]?.[k] ?? Number.NaN), borrowed: false };
    const other = mvc?.[k === 0 ? 1 : 0] ?? Number.NaN;
    return { scale: other / (raw[coordinate]?.[k === 0 ? 1 : 0] ?? Number.NaN), borrowed: true };
  };
  return rows.map((c) => {
    const { scale, borrowed } = factor(c.coordinate, c.armM < 0 ? 0 : 1);
    const mvcNote = MVC_NOTE[c.coordinate];
    const note = `${c.note ?? ''}${mvcNote ? `; ${mvcNote}` : ''}${borrowed ? '; no measurement for this sense: the opposite sense\'s factor' : ''}`;
    return { ...c, scale, nm: c.fmaxN * c.armM * scale, note };
  });
};

const unscaled = (rows: ReadonlyArray<Row>): ReadonlyArray<Capacity> => rows;
const SPINE_RAW: ReadonlyArray<Row> = [...spine('lumbar'), ...spine('thoracic'), ...neck];
const SPINE_BOTH = [...unscaled(SPINE_RAW), ...unscaled(SPINE_RAW).map(flip)];

/** Right-copy spine and neck capacities, calibrated so both copies together sum to the measured moments. */
export const TRUNK_CAPACITIES: ReadonlyArray<Capacity> = calibrate(SPINE_RAW, SPINE_BOTH);

/** Right arm, calibrated per direction; the left is identical (`skeleton.ts` signs are anatomical on both sides). */
export const ARM_CAPACITIES: ReadonlyArray<Capacity> = calibrate(arm, arm);

/** The spine and neck's copy for one side: the left flips bending and rotation. */
export const trunkCapacitiesOf = (side: 'R' | 'L'): ReadonlyArray<Capacity> => (side === 'R' ? TRUNK_CAPACITIES : TRUNK_CAPACITIES.map(flip));

/** Both copies, whose direction sums are the maximum moments. */
export const TRUNK_BILATERAL: ReadonlyArray<Capacity> = [...trunkCapacitiesOf('R'), ...trunkCapacitiesOf('L')];

export const armCapacitiesOf = (_side: 'R' | 'L'): ReadonlyArray<Capacity> => ARM_CAPACITIES;

export const trunkSums = (): Readonly<Record<string, readonly [number, number]>> => capacitySums(TRUNK_BILATERAL);
