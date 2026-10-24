import { assert, describe, it } from '@effect/vitest';
import { parse } from 'yaml';
import musclesYaml from '../content/anatomy/muscles.yaml?raw';
import sourcesYaml from '../content/sources.yaml?raw';
import { capacitySums } from '../src/viewer/motion/capacities';
import {
  ARM_CAPACITIES,
  ARM_COORDINATES,
  TRUNK_BILATERAL,
  TRUNK_CAPACITIES,
  TRUNK_COORDINATES,
  armCapacitiesOf,
  trunkCapacitiesOf,
} from '../src/viewer/motion/capacities-trunk';
import { LEG_CAPACITIES } from '../src/viewer/motion/capacities';
import { MAX_TORQUE } from '../src/viewer/motion/effort';

const muscles = parse(musclesYaml) as ReadonlyArray<{ id: string; part_of?: string }>;
const parents = new Set(muscles.flatMap((m) => (m.part_of === undefined ? [] : [m.part_of])));
const leaves = new Set(muscles.map((m) => m.id).filter((id) => !parents.has(id)));
const sourceIds = new Set((parse(sourcesYaml) as ReadonlyArray<{ id: string }>).map((s) => s.id));
const trunkSums = capacitySums(TRUNK_BILATERAL);
const armSums = capacitySums(ARM_CAPACITIES);
const trunk = (coordinate: string): readonly [number, number] => trunkSums[coordinate] ?? [0, 0];
const arm = (coordinate: string): readonly [number, number] => armSums[coordinate] ?? [0, 0];

describe('trunk, neck and arm muscle capacities', () => {
  it('tabulates leaf muscles on the listed coordinates with finite, non-zero moments', () => {
    for (const [rows, coordinates] of [
      [TRUNK_CAPACITIES, TRUNK_COORDINATES],
      [ARM_CAPACITIES, ARM_COORDINATES],
    ] as const) {
      for (const c of rows) {
        const at = `${c.muscle} ${c.coordinate} ${Math.sign(c.armM)}`;
        assert.isTrue(leaves.has(c.muscle), `${at}: not a leaf of muscles.yaml`);
        assert.include(coordinates, c.coordinate, at);
        assert.isTrue(Number.isFinite(c.nm) && c.nm !== 0, `${at}: nm ${c.nm}`);
        assert.isAbove(c.fmaxN, 0, at);
        assert.isBelow(Math.abs(c.armM), 0.15, at);
        for (const s of c.sources) assert.isTrue(sourceIds.has(s), `${at}: ${s} not in sources.yaml`);
        assert.strictEqual(c.basis === 'inferred', c.note !== undefined, `${at}: an inferred row carries its note`);
      }
    }
  });

  it('lists each muscle, coordinate and sense once', () => {
    for (const rows of [TRUNK_CAPACITIES, ARM_CAPACITIES]) {
      const keys = rows.map((c) => `${c.muscle} ${c.coordinate} ${Math.sign(c.armM)}`);
      assert.deepStrictEqual(keys.filter((k, i) => keys.indexOf(k) !== i), []);
    }
  });

  // hildebrandt-2017 skiers' trunk torque: extension 4.53 > flexion 2.44 Nm/kg; pan-2025 rotation 0.69 Nm/kg.
  it('ranks trunk extension above flexion above rotation (hildebrandt-2017, pan-2025)', () => {
    for (const region of ['lumbar', 'thoracic']) {
      const [extension, flexion] = trunk(`${region}_flexion`);
      const [rotation] = trunk(`${region}_rotation`);
      assert.isAbove(extension, flexion, `${region} extension vs flexion`);
      assert.isAbove(flexion, rotation, `${region} flexion vs rotation`);
    }
  });

  // mortensen-2018 Table 3: neck extension 52 Nm > flexion 30 Nm.
  it('ranks neck extension above flexion (mortensen-2018)', () => {
    const [extension, flexion] = trunk('neck_flexion');
    assert.isAbove(extension, flexion);
  });

  // dourado-2025 (males, isometric) flexion 54.0 Nm vs simpson-2019 extension 48.7 Nm: two cohorts.
  it('ranks elbow flexion above extension (dourado-2025 against simpson-2019)', () => {
    const [extension, flexion] = arm('elbow_flexion');
    assert.isAbove(flexion, extension);
  });

  it('mirrors the left spine copy: bending and rotation flip, flexion does not', () => {
    const left = trunkCapacitiesOf('L');
    TRUNK_CAPACITIES.forEach((r, i) => {
      const l = left[i];
      const flips = /_(bending|rotation)$/.test(r.coordinate);
      assert.strictEqual(l?.nm, flips ? -r.nm : r.nm, `${r.muscle} ${r.coordinate}`);
    });
    for (const coordinate of TRUNK_COORDINATES.filter((c) => /_(bending|rotation)$/.test(c))) {
      const [against, along] = trunk(coordinate);
      assert.approximately(against, along, 1e-9, coordinate);
    }
  });

  it('gives the left arm the right arm rows (skeleton.ts arm signs are anatomical on both sides)', () => {
    assert.deepStrictEqual(armCapacitiesOf('L'), armCapacitiesOf('R'));
    assert.deepStrictEqual(armCapacitiesOf('R'), ARM_CAPACITIES);
  });

  it('builds MAX_TORQUE from the sums of the tables', () => {
    const legSums = capacitySums(LEG_CAPACITIES);
    const expected: Record<string, readonly [number, number]> = {
      hip_adduction: legSums['hip_adduction'] ?? [NaN, NaN],
      hip_rotation: legSums['hip_rotation'] ?? [NaN, NaN],
      ...Object.fromEntries(TRUNK_COORDINATES.map((c) => [c, trunk(c)])),
      ...Object.fromEntries(ARM_COORDINATES.map((c) => [c, arm(c)])),
    };
    for (const [coordinate, [against, along]] of Object.entries(expected)) {
      const max = MAX_TORQUE[coordinate] ?? [NaN, NaN];
      assert.approximately(max[0], against, 1e-9, `${coordinate} against`);
      assert.approximately(max[1], along, 1e-9, `${coordinate} along`);
    }
  });
});
