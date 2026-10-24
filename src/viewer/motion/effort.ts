import { SKELETON_DATA, SEGMENT_NAMES } from '../skeleton';
import { ANDERSON_TORQUE } from './anderson';
import { capacitySums, LEG_CAPACITIES } from './capacities';
import type { Capacity } from './capacities';
import { ARM_CAPACITIES, ARM_COORDINATES, TRUNK_BILATERAL, TRUNK_COORDINATES } from './capacities-trunk';
import { add, cross3, dot3, mul, neg, sub3, value } from './fk';
import type { Scalar, V3 } from './fk';

/**
 * Quasi-static joint effort, as static optimisation and Moco's control-effort goal settle what constraints leave
 * open: each joint's net moment under the effective field, over its maximum voluntary torque.
 */

/** A point mass in the world. */
export interface Body {
  readonly mass: number;
  readonly at: V3;
}
/** A force on the distal chain, applied at a point. */
export interface Load {
  readonly force: V3;
  readonly at: V3;
}

/**
 * The moment the joint's muscles exert on the distal chain to hold it still: minus the external moments about
 * `joint` of `loads` and of `bodies` in the field `field` (acceleration, so weight is mass × field).
 */
export const jointMoment = (joint: V3, bodies: ReadonlyArray<Body>, loads: ReadonlyArray<Load>, field: V3): V3 => {
  let m: V3 = [0, 0, 0];
  const acc = (r: V3, f: V3): void => {
    const c = cross3(sub3(r, joint), f);
    m = [add(m[0], c[0]), add(m[1], c[1]), add(m[2], c[2])];
  };
  for (const b of bodies) acc(b.at, [mul(b.mass, field[0]), mul(b.mass, field[1]), mul(b.mass, field[2])]);
  for (const l of loads) acc(l.at, l.force);
  return [neg(m[0]), neg(m[1]), neg(m[2])];
};

/**
 * Maximum voluntary torque per coordinate (sides alike), N·m: [against the coordinate, along it], so a negative
 * generalised force divides by the first. Lower-limb sagittal: anderson-2007 (`anderson.ts`). Every other row is
 * the direction sum of the calibrated capacities: legs (`capacities.ts`, hip adduction and rotation by the hip's
 * mean sagittal factor, knee rotation uncalibrated: hrycyna-2011's totals), spine and neck (`capacities-trunk.ts`, both copies of each bilateral muscle:
 * hildebrandt-2017 trunk flexion and extension, pan-2025 bending and rotation, mortensen-2018 neck) and arm
 * (`capacities-trunk.ts`: holzbaur-2007, kritzer-2024, simpson-2019, dourado-2025).
 */
const sumsOf = (caps: ReadonlyArray<Capacity>, coordinates: ReadonlyArray<string>): Record<string, readonly [number, number]> => {
  const sums = capacitySums(caps);
  return Object.fromEntries(coordinates.map((c) => [c, sums[c] ?? [Number.NaN, Number.NaN]]));
};

export const MAX_TORQUE: Readonly<Record<string, readonly [number, number]>> = {
  ...ANDERSON_TORQUE,
  ...sumsOf(LEG_CAPACITIES, ['hip_adduction', 'hip_rotation', 'knee_rotation']),
  ...sumsOf(TRUNK_BILATERAL, TRUNK_COORDINATES),
  ...sumsOf(ARM_CAPACITIES, ARM_COORDINATES),
};

/** Generalised force over the maximum in its direction: C0 at zero, so its square is C1. */
export const normalisedEffort = (coordinate: string, q: Scalar): Scalar => {
  const t = MAX_TORQUE[coordinate.replace(/\.[RL]$/, '')];
  if (t === undefined) throw new Error(`no maximum torque for ${coordinate}`);
  return mul(1 / (value(q) < 0 ? t[0] : t[1]), q);
};

/** Generalised force along a coordinate's signed world axis. */
export const generalisedForce = (moment: V3, axis: V3): Scalar => dot3(moment, axis);

/** Each segment and every segment below it. */
export const distalOf = (segment: string): string[] => {
  const below = (s: string): boolean => s === segment || (SKELETON_DATA.segments[s]?.parent != null && below(SKELETON_DATA.segments[s]?.parent ?? ''));
  return SEGMENT_NAMES.filter(below);
};
