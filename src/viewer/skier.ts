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
  /** Stature, metres. */
  readonly height: number;
  /** Body mass, kg. */
  readonly mass: number;
  readonly body: Body;
  /** Boot sole length. */
  readonly bsl: number;
  readonly skis: Readonly<Record<Terrain, Ski>>;
}

const FIGURE_SKI: Ski = { model: 'slab', length: 1.6, sidecutRadius: Number.POSITIVE_INFINITY, tip: 0.09, waist: 0.09, tail: 0.09 };

/** The hand-sized figure the poses were first solved on, whose lengths scale the figure's shapes; inferred throughout. */
export const FIGURE_SKIER: ReferenceSkier = {
  name: 'figure',
  // Stature its legs give by de-leva-1996's proportions, and that table's male mass.
  height: 1.776,
  mass: 73,
  body: { hipWidth: 0.2, thigh: 0.45, shin: 0.43, trunk: 0.74, upperArm: 0.3 },
  // About a mondopoint 26.5 shell.
  bsl: 0.305,
  skis: { [Terrain.Groomed]: FIGURE_SKI, [Terrain.Moguls]: FIGURE_SKI },
};

/** de-leva-1996 Table 4, males: stature and joint-centre lengths, mm. */
const DE_LEVA_STATURE = 1741;
const DE_LEVA = { thigh: 422.2, shin: 440.3, trunk: 603.3, upperArm: 281.7 } as const;
/** Hip joint centres apart per metre of stature; inferred: the old figure's 0.2 m over its 1.776 m (de-leva-1996 gives none). */
const HIP_WIDTH_SHARE = 0.2 / 1.776;

/** Lengths for `height` metres by de-leva-1996's male proportions; hip width inferred. */
export const deLevaBody = (height: number): Body => {
  const k = height / DE_LEVA_STATURE;
  return { hipWidth: HIP_WIDTH_SHARE * height, thigh: DE_LEVA.thigh * k, shin: DE_LEVA.shin * k, trunk: DE_LEVA.trunk * k, upperArm: DE_LEVA.upperArm * k };
};

/** Ikuma Horishima, JPN moguls. */
export const HORISHIMA: ReferenceSkier = {
  name: 'Ikuma Horishima',
  // User; Wikipedia en/ja give 1.70 m.
  height: 1.68,
  // Sourced: Wikipedia en/ja infobox.
  mass: 66,
  // Derived: de-leva-1996 by height.
  body: deLevaBody(1.68),
  // User.
  bsl: 0.295,
  skis: {
    // User (model, length, radius); widths sourced, alpsport.com.au/products/mr-d.
    [Terrain.Moguls]: { model: 'ID one MR-D', length: 1.66, sidecutRadius: 19.9, tip: 0.095, waist: 0.063, tail: 0.085 },
    // User (model, length, radius); widths sourced, powder7.com.
    [Terrain.Groomed]: { model: 'HEAD Worldcup Rebels e-SL Pro', length: 1.65, sidecutRadius: 12.9, tip: 0.122, waist: 0.068, tail: 0.107 },
  },
};

export const REFERENCE_SKIER: ReferenceSkier = HORISHIMA;

/** Ahead of the ski segment's origin under the binding, the ski's centre; inferred. */
export const SKI_MOUNT = 0.05;

// Whole nanometres, so a sum's last bit doesn't move the stored tables.
const nm = (x: number): number => Math.round(x * 1e9) / 1e9;

/** The ski's tip and tail along it from the segment origin under the binding; the tail negative. */
export const skiEnds = (ski: Ski): { readonly tip: number; readonly tail: number } => ({ tip: nm(SKI_MOUNT + ski.length / 2), tail: nm(SKI_MOUNT - ski.length / 2) });

export const skiFor = (skier: ReferenceSkier, terrain: Terrain): Ski => skier.skis[terrain];
