import type { BootFit } from './gear-fit';
import { compose, rotationX, translation } from './mat4';
import type { Mat4 } from './mat4';

const DEG = Math.PI / 180;

/** Boot and binding geometry that shapes the stance; metres and radians. */
export interface Equipment {
  /** Boot cuff's forward lean from the boot sole's normal. */
  readonly forwardLean: number;
  /** Boot-board (zeppa) ramp: the foot's heel-up pitch inside the shell. */
  readonly bootBoardRamp: number;
  /** Binding heel stand height minus toe stand height. */
  readonly bindingDelta: number;
  /** Boot sole length the delta spans. */
  readonly soleLength: number;
  /** Boot sole centre above the ski base: ski, plate and binding, as FIS measures it. */
  readonly standHeight: number;
  /** The plate's share of the stand height. */
  readonly plateHeight: number;
  /** Ski thickness underfoot. */
  readonly skiThickness: number;
}

export const EQUIPMENT: Equipment = {
  // Typical; varies by model: recreational to race boots quote about 12–17°.
  forwardLean: 15 * DEG,
  // Typical; varies by model: boot boards ship at about 2–4°.
  bootBoardRamp: 3 * DEG,
  // Typical; varies by model: alpine bindings run about 0 to +6 mm heel over toe.
  bindingDelta: 0.003,
  // About a mondopoint 26.5 shell; varies by size.
  soleLength: 0.305,
  // Typical recreational; varies by model: FIS caps race skis at 50 mm.
  standHeight: 0.045,
  // Typical; varies by model.
  plateHeight: 0.012,
  // A simplified slab; real skis run about 15–20 mm underfoot.
  skiThickness: 0.02,
};

/** FIS limit on stand height, sole to base, for race skis. */
export const FIS_STAND_HEIGHT_MAX = 0.05;

/** Typical forward lean across boots. */
export const FORWARD_LEAN_RANGE = [12 * DEG, 17 * DEG] as const;

/** The binding delta as a heel-up pitch. */
export const deltaAngle = (eq: Equipment): number => Math.atan2(eq.bindingDelta, eq.soleLength);

/** The foot's heel-up pitch relative to the ski base. */
export const totalRamp = (eq: Equipment): number => eq.bootBoardRamp + deltaAngle(eq);

/** Least shin angle from the ski-base normal: the cuff's lean on a sole the delta pitches. */
export const minShinAngle = (eq: Equipment): number => eq.forwardLean + deltaAngle(eq);

/**
 * Shin angle from the ski-base normal for an ankle dorsiflexed `dorsiflexion` from
 * the foot; the cuff holds the shin at its lean until the skier flexes past it.
 */
export const shinAngle = (dorsiflexion: number, eq: Equipment): number => Math.max(dorsiflexion + totalRamp(eq), minShinAngle(eq));

/** Binding plus plate: the sole centre above the ski's top. */
export const stackHeight = (eq: Equipment): number => eq.standHeight - eq.skiThickness;

/** Shell sole height above the ski's top at `z` along the sole from its centre; the heel (-z) is higher. */
export const soleHeight = (z: number, eq: Equipment): number => stackHeight(eq) - z * Math.tan(deltaAngle(eq));

/**
 * The shell's frame in the foot's, both with the ankle at the origin at rest: the
 * board's ramp taken back out about the shell toe, so the foot's heel rides up inside.
 */
export const shellInFoot = (fit: BootFit, eq: Equipment): Mat4 =>
  compose(translation([0, fit.sole, fit.toe]), rotationX(-eq.bootBoardRamp), translation([0, -fit.sole, -fit.toe]));

/**
 * The binding's frame in the foot's: on the ski's top surface under the shell sole's
 * centre and the ankle, along the ski. The shell sole sits the stack height above it.
 */
export const bindingInFoot = (fit: BootFit, eq: Equipment): Mat4 =>
  compose(shellInFoot(fit, eq), translation([0, fit.sole, (fit.heel + fit.toe) / 2]), rotationX(-deltaAngle(eq)), translation([0, -stackHeight(eq), 0]));
