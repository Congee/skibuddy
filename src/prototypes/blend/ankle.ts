import type { Intensity } from '../../content/schema';

const DEG = 180 / Math.PI;

/** Deepest ankle bend (dorsiflexion, degrees) in a pose's turn, on either leg; loads the pose tables lazily. */
export const ankleBend = async (pose: string, i: Intensity): Promise<number> => {
  const [{ poseTable }, { EQUIPMENT, totalRamp }] = await Promise.all([import('../../viewer/pose-table'), import('../../viewer/equipment')]);
  // The pose's ankle angle is the shin's from the ski: it includes the boot and binding ramp and any tail lift.
  const shin = Math.max(...poseTable(pose, i).flatMap((p) => [p.outside, p.inside].map((l) => l.ankleFlex - l.tailLift)));
  return (shin - totalRamp(EQUIPMENT)) * DEG;
};
