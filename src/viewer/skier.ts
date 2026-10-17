/** Snow a ski is chosen for. */
export const Terrain = { Groomed: 'groomed', Moguls: 'moguls' } as const;
export type Terrain = (typeof Terrain)[keyof typeof Terrain];

/** A ski's plan shape; metres. */
export interface Ski {
  readonly model: string;
  readonly length: number;
  readonly sidecutRadius: number;
  readonly tip: number;
  readonly waist: number;
  readonly tail: number;
}

/** Lengths between joint centres, metres. */
export interface Body {
  /** Between the hip joint centres. */
  readonly hipWidth: number;
  /** Hip to knee joint centre. */
  readonly thigh: number;
  /** Knee to ankle joint centre. */
  readonly shin: number;
  /** Mid-hip to cervicale. */
  readonly trunk: number;
  /** Shoulder to elbow joint centre. */
  readonly upperArm: number;
}

/** The skier the figure is built for: body, boot sole and skis by terrain. */
export interface ReferenceSkier {
  readonly name: string;
  readonly body: Body;
  /** Boot sole length. */
  readonly bsl: number;
  readonly skis: Readonly<Record<Terrain, Ski>>;
}

const FIGURE_SKI: Ski = { model: 'slab', length: 1.6, sidecutRadius: Number.POSITIVE_INFINITY, tip: 0.09, waist: 0.09, tail: 0.09 };

/** The hand-sized figure the poses were first solved on; inferred throughout. */
export const FIGURE_SKIER: ReferenceSkier = {
  name: 'figure',
  body: { hipWidth: 0.2, thigh: 0.45, shin: 0.43, trunk: 0.74, upperArm: 0.3 },
  // About a mondopoint 26.5 shell.
  bsl: 0.305,
  skis: { [Terrain.Groomed]: FIGURE_SKI, [Terrain.Moguls]: FIGURE_SKI },
};

export const REFERENCE_SKIER: ReferenceSkier = FIGURE_SKIER;

/** Ahead of the ski segment's origin under the binding, the ski's centre; inferred. */
export const SKI_MOUNT = 0.05;

// Whole nanometres, so a sum's last bit doesn't move the stored tables.
const nm = (x: number): number => Math.round(x * 1e9) / 1e9;

/** The ski's tip and tail along it from the segment origin under the binding; the tail negative. */
export const skiEnds = (ski: Ski): { readonly tip: number; readonly tail: number } => ({ tip: nm(SKI_MOUNT + ski.length / 2), tail: nm(SKI_MOUNT - ski.length / 2) });

export const skiFor = (skier: ReferenceSkier, terrain: Terrain): Ski => skier.skis[terrain];
