/** thorwartl-2023's measured local bend of a loaded carving ski at 57° roll: the one measured ski bend read. */
export const BEND_REFERENCE = { radiusM: 3.85, forceN: 1111 } as const;
/** Tightest bend the allowance grants under a hit, metres; inferred. */
export const BEND_RADIUS_MIN_M = 1.5;
/** An unloaded ski's radius, metres: nearly straight; inferred. */
export const BEND_RADIUS_MAX_M = 1000;

/** Bend radius under `forceN`: a linear beam's curvature grows with the load (inferred), scaled from BEND_REFERENCE. */
export const bendRadiusOf = (forceN: number): number => {
  const r = forceN > 0 ? (BEND_REFERENCE.radiusM * BEND_REFERENCE.forceN) / forceN : BEND_RADIUS_MAX_M;
  return Math.min(BEND_RADIUS_MAX_M, Math.max(BEND_RADIUS_MIN_M, r));
};

/** How far a base point `dM` from the pressure point sits above the chord when the ski bends at `radiusM`. */
export const sagittaOf = (dM: number, radiusM: number): number => (dM * dM) / (2 * radiusM);

/** The drawn and baked curvature at `radiusM`, 1/m: the cap draws straight. */
export const bendCurvatureOf = (radiusM: number): number => (radiusM >= BEND_RADIUS_MAX_M ? 0 : 1 / radiusM);
