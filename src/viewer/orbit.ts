export interface Orbit {
  readonly azimuth: number;
  readonly elevation: number;
}

/** Seconds for the camera to close most of the gap to where the drag left it. */
export const DRAG_DAMPING = 0.05;
/** A gentler ease for turning the figure toward a focused muscle. */
export const TURN_DAMPING = 0.14;
/** Radians; closer than this the camera snaps and stops. */
const SETTLED = 1e-4;
/** A frame after a long idle steps as if this long had passed. */
const MAX_STEP = 1 / 30;

/** The share of the gap one frame of `seconds` closes. */
export const dampStep = (seconds: number, damping: number): number => 1 - Math.exp(-Math.min(Math.max(seconds, 0), MAX_STEP) / damping);

/** Eases `current` toward `target`; `settled` means it arrived and no more frames are needed. */
export const dampOrbit = (
  current: Orbit,
  target: Orbit,
  seconds: number,
  damping: number = DRAG_DAMPING,
): { readonly orbit: Orbit; readonly settled: boolean } => {
  const k = dampStep(seconds, damping);
  const azimuth = current.azimuth + (target.azimuth - current.azimuth) * k;
  const elevation = current.elevation + (target.elevation - current.elevation) * k;
  const settled = Math.abs(target.azimuth - azimuth) < SETTLED && Math.abs(target.elevation - elevation) < SETTLED;
  return { orbit: settled ? target : { azimuth, elevation }, settled };
};
