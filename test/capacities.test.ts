import { assert, describe, it } from '@effect/vitest';
import { parse } from 'yaml';
import musclesYaml from '../content/anatomy/muscles.yaml?raw';
import sourcesYaml from '../content/sources.yaml?raw';
import { LEG_CAPACITIES, capacitiesOf, capacitySums, legCapacitiesAt, rawSums } from '../src/viewer/motion/capacities';
import type { Capacity } from '../src/viewer/motion/capacities';
import { ARM_CAPACITIES, TRUNK_BILATERAL, TRUNK_CAPACITIES, trunkSums } from '../src/viewer/motion/capacities-trunk';
import { MAX_TORQUE } from '../src/viewer/motion/effort';
import { REFERENCE_SKIER } from '../src/viewer/skier';

const COORDINATES = ['hip_flexion', 'hip_adduction', 'hip_rotation', 'knee_flexion', 'knee_rotation', 'ankle_dorsiflexion'];
const muscles = parse(musclesYaml) as ReadonlyArray<{ id: string; part_of?: string }>;
const parents = new Set(muscles.flatMap((m) => (m.part_of === undefined ? [] : [m.part_of])));
const leaves = new Set(muscles.map((m) => m.id).filter((id) => !parents.has(id)));
const sourceIds = new Set((parse(sourcesYaml) as ReadonlyArray<{ id: string }>).map((s) => s.id));
const sums = capacitySums(LEG_CAPACITIES);
const sum = (coordinate: string): readonly [number, number] => sums[coordinate] ?? [0, 0];

describe('leg muscle capacities', () => {
  it('tabulates leaf muscles on the six leg coordinates with finite, non-zero moments', () => {
    for (const c of LEG_CAPACITIES) {
      const at = `${c.muscle} ${c.coordinate}`;
      assert.isTrue(leaves.has(c.muscle), `${at}: not a leaf of muscles.yaml`);
      assert.include(COORDINATES, c.coordinate, at);
      // delp-1999's iliopsoas rotation arm is 0 mm at 60°.
      const zeroArm = c.armM === 0 && c.sources.includes('delp-1999');
      assert.isTrue(Number.isFinite(c.nm) && (c.nm !== 0 || zeroArm), `${at}: nm ${c.nm}`);
      assert.isAbove(c.fmaxN, 0, at);
      assert.isBelow(Math.abs(c.armM), 0.15, at);
      for (const s of c.sources) assert.isTrue(sourceIds.has(s), `${at}: ${s} not in sources.yaml`);
      assert.strictEqual(c.basis === 'inferred', c.note !== undefined, `${at}: an inferred row carries its note`);
    }
  });

  it('lists each muscle and coordinate once', () => {
    const keys = LEG_CAPACITIES.map((c) => `${c.muscle} ${c.coordinate}`);
    assert.strictEqual(new Set(keys).size, keys.length);
  });

  // anderson-2007 measured the lower-limb sagittal maxima (MAX_TORQUE); calibration makes the sums equal them.
  const MEASURED = ['hip_flexion', 'knee_flexion', 'ankle_dorsiflexion'];
  it('calibrates each measured direction to its measured maximum', () => {
    for (const coordinate of MEASURED) {
      const max = MAX_TORQUE[coordinate] ?? [0, 0];
      for (const k of [0, 1] as const) assert.approximately(sum(coordinate)[k], max[k], 1e-6, `${coordinate}[${k}]`);
    }
  });

  it('keeps the raw model sums within 1–8 × the measured maxima', () => {
    // rajagopal-2016's 60 N/cm² exceeds MVC; a 10× arm error would still fall out.
    const raw = rawSums(LEG_CAPACITIES);
    const ratios = MEASURED.flatMap((c) => [0, 1].map((k) => [`${c}[${k}]`, (raw[c]?.[k] ?? 0) / (MAX_TORQUE[c]?.[k] ?? 1)] as const));
    const text = ratios.map(([c, r]) => `${c} ${r.toFixed(2)}`).join(', ');
    for (const [, r] of ratios) assert.isTrue(r >= 1 && r <= 8, `raw / MAX_TORQUE: ${text}`);
  });

  it('orders the directions as measured: knee extension over flexion, hip extension over flexion', () => {
    // anderson-2007: the extensors' maxima exceed the flexors' at both joints.
    assert.isAbove(sum('knee_flexion')[0], sum('knee_flexion')[1]);
    assert.isAbove(sum('hip_flexion')[0], sum('hip_flexion')[1]);
  });

  it('gives hip abduction more capacity than either hip rotation', () => {
    assert.isAbove(sum('hip_adduction')[0], Math.max(...sum('hip_rotation')));
  });

  it('mirrors the right leg to the left without sign flips', () => {
    // skeleton.ts signs every leg coordinate so its positive sense is anatomical on both sides.
    assert.deepStrictEqual(capacitiesOf('L'), capacitiesOf('R'));
  });
});

const rotationRow = (deg: number, muscle: string): Capacity | undefined => legCapacitiesAt(deg).find((c) => c.muscle === muscle && c.coordinate === 'hip_rotation');
const armMm = (deg: number, muscle: string): number => 1000 * (rotationRow(deg, muscle)?.armM ?? Number.NaN);
const nmAt = (deg: number, muscle: string): number => rotationRow(deg, muscle)?.nm ?? Number.NaN;
const externalCapacity = (deg: number): number => capacitySums(legCapacitiesAt(deg))['hip_rotation']?.[0] ?? Number.NaN;
const DELP_MUSCLES = ['gluteus-maximus', 'gluteus-medius', 'gluteus-minimus', 'deep-hip-rotators', 'iliopsoas'];
const GLUTEALS = ['gluteus-maximus', 'gluteus-medius', 'gluteus-minimus'];

describe('leg capacities by hip flexion', () => {
  it('builds the skiing posture at 60° and shares no rows between calls', () => {
    assert.deepStrictEqual(legCapacitiesAt(60), LEG_CAPACITIES);
    const before = LEG_CAPACITIES.map((c) => ({ ...c }));
    legCapacitiesAt(0);
    legCapacitiesAt(90);
    assert.deepStrictEqual(LEG_CAPACITIES, before);
  });

  it('rejects a NaN hip flexion', () => {
    assert.throws(() => legCapacitiesAt(Number.NaN), RangeError);
  });

  it('turns the gluteals from external rotators at 0° to internal ones at 79°; the deep rotators stay external', () => {
    // delp-1999: the arms cross zero between ~10° and ~85° of hip flexion.
    for (const m of [...GLUTEALS, 'deep-hip-rotators']) assert.isBelow(nmAt(0, m), 0, `${m} at 0°`);
    for (const m of GLUTEALS) assert.isAbove(nmAt(79, m), 0, `${m} at 79°`);
    assert.isBelow(nmAt(79, 'deep-hip-rotators'), 0);
    assert.isAbove(externalCapacity(0), externalCapacity(79));
  });

  it('moves each delp-1999 arm monotonically between its 0, 60 and 90° columns and holds it outside 0–90°', () => {
    for (const m of DELP_MUSCLES) {
      for (const [from, to] of [[0, 60], [60, 90]] as const) {
        const arms = Array.from({ length: to - from + 1 }, (_, i) => armMm(from + i, m));
        const steps = arms.slice(1).map((mm, i) => mm - (arms[i] ?? Number.NaN));
        assert.isTrue(steps.every((d) => d >= -1e-9) || steps.every((d) => d <= 1e-9), `${m} ${from}–${to}°`);
      }
      assert.strictEqual(armMm(-45, m), armMm(0, m), `${m} below 0°`);
      assert.strictEqual(armMm(135, m), armMm(90, m), `${m} above 90°`);
    }
  });

  it('takes the plain mean of delp-1999 lines at its columns', () => {
    // mm, + internal: gluteus maximus GMAX1–6, gluteus medius GMED1–4, iliopsoas.
    const columns: ReadonlyArray<readonly [string, readonly [number, number, number]]> = [
      ['gluteus-maximus', [-136 / 6, 28 / 6, 78 / 6]],
      ['gluteus-medius', [-65 / 4, 134 / 4, 174 / 4]],
      ['iliopsoas', [2, 0, -4]],
    ];
    for (const [m, mm] of columns) {
      [0, 60, 90].forEach((deg, i) => assert.approximately(armMm(deg, m), mm[i] ?? Number.NaN, 1e-9, `${m} at ${deg}°`));
    }
  });

  it('keeps the muscles without delp-1999 data on constant arms', () => {
    const constant = LEG_CAPACITIES.filter((c) => c.coordinate === 'hip_rotation' && !c.sources.includes('delp-1999'));
    assert.strictEqual(constant.length, 7);
    for (const c of constant) {
      for (const deg of [0, 90]) assert.strictEqual(rotationRow(deg, c.muscle)?.armM, c.armM, `${c.muscle} at ${deg}°`);
      assert.include(c.note ?? '', 'no delp-1999 data', c.muscle);
    }
  });

  // Skiing-posture sums before hip rotation took delp-1999's arms: calibration is fixed at 60°, so only hip_rotation moves.
  const UNMOVED: ReadonlyArray<readonly [string, number, number]> = [
    ['hip_flexion', 175.12498080000003, 122.9138064],
    ['hip_adduction', 123.23750814904477, 114.90704341204706],
    ['knee_flexion', 177.3004464, 94.63275359999999],
    ['ankle_dorsiflexion', 103.334616, 35.8951824],
  ];
  it('leaves the sagittal and adduction sums where they were at every posture', () => {
    for (const deg of [0, 30, 60, 79, 90]) {
      const at = capacitySums(legCapacitiesAt(deg));
      for (const [coordinate, against, along] of UNMOVED) {
        assert.approximately(at[coordinate]?.[0] ?? Number.NaN, against, 1e-9, `${coordinate}[0] at ${deg}°`);
        assert.approximately(at[coordinate]?.[1] ?? Number.NaN, along, 1e-9, `${coordinate}[1] at ${deg}°`);
      }
    }
  });
});

describe('trunk flexion maxima', () => {
  it('sets lumbar and thoracic flexion and extension to the hildebrandt-2017 male skiers, bending and rotation to pan-2025', () => {
    const trunk = trunkSums();
    const kg = REFERENCE_SKIER.mass;
    for (const region of ['lumbar', 'thoracic']) {
      const [extension, flexion] = trunk[`${region}_flexion`] ?? [Number.NaN, Number.NaN];
      assert.approximately(extension, 4.53 * kg, 1e-9, `${region} extension`);
      assert.approximately(flexion, 2.44 * kg, 1e-9, `${region} flexion`);
      for (const [direction, perKg] of [['bending', 0.93], ['rotation', 0.69]] as const) {
        for (const s of trunk[`${region}_${direction}`] ?? []) assert.approximately(s, perKg * kg, 1e-9, `${region} ${direction}`);
      }
    }
  });

  it('keeps the maximum\'s protocol in the flexion rows\' notes', () => {
    const rows = TRUNK_CAPACITIES.filter((c) => c.coordinate.endsWith('_flexion') && !c.coordinate.startsWith('neck'));
    assert.isAbove(rows.length, 0);
    for (const c of rows) assert.match(c.note ?? '', /hildebrandt-2017.*isokinetic/, `${c.muscle} ${c.coordinate}`);
  });
});

describe('knee rotation capacities', () => {
  const rows = LEG_CAPACITIES.filter((c) => c.coordinate === 'knee_rotation');
  const ids = (sign: number): string[] => rows.filter((c) => Math.sign(c.nm) === sign).map((c) => c.muscle).toSorted();

  // hrycyna-2011's static maxima, whole shank-foot unit: external at 30°, internal at 90° flexion.
  it('totals hrycyna-2011\'s external and internal maxima', () => {
    const [external, internal] = capacitySums(rows)['knee_rotation'] ?? [Number.NaN, Number.NaN];
    assert.approximately(external, 55.2, 1e-9);
    assert.approximately(internal, 42.6, 1e-9);
  });

  it('puts cleather-2018\'s rotators on each side, inferred', () => {
    assert.deepStrictEqual(ids(-1), ['biceps-femoris', 'tensor-fasciae-latae']);
    assert.deepStrictEqual(ids(1), ['gracilis', 'medial-hamstrings', 'popliteus', 'sartorius']);
    for (const c of rows) {
      assert.strictEqual(c.basis, 'inferred', c.muscle);
      assert.include(c.sources, 'cleather-2018', c.muscle);
      assert.include(c.sources, 'hrycyna-2011', c.muscle);
    }
  });

  it('gives every effort coordinate a muscle in each sense', () => {
    const caps = [...LEG_CAPACITIES, ...TRUNK_BILATERAL, ...ARM_CAPACITIES];
    for (const [coordinate, max] of Object.entries(MAX_TORQUE)) {
      for (const k of [0, 1] as const) {
        assert.isAbove(max[k], 0, `${coordinate}[${k}]`);
        const carriers = caps.filter((c) => c.coordinate === coordinate && (k === 0 ? c.nm < 0 : c.nm > 0));
        assert.isAbove(carriers.length, 0, `${coordinate}: no muscle ${k === 0 ? 'against' : 'along'}`);
      }
    }
    assert.isDefined(MAX_TORQUE['knee_rotation']);
  });
});
