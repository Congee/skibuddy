import { G } from '../../physics/turn';
import { REFERENCE_SKIER } from '../skier';

/** Body weight × height, N·m: anderson-2007 Table 3 normalises C1 by it. */
const BWH = REFERENCE_SKIER.mass * G * REFERENCE_SKIER.height;

/** Lower-limb sagittal maximum voluntary torque, N·m: [against the coordinate, along it], anderson-2007 Table 3, 18–25 M isometric C1 × BWH. */
export const ANDERSON_TORQUE: Readonly<Record<string, readonly [number, number]>> = {
  hip_flexion: [0.161 * BWH, 0.113 * BWH],
  knee_flexion: [0.163 * BWH, 0.087 * BWH],
  ankle_dorsiflexion: [0.095 * BWH, 0.033 * BWH],
};
