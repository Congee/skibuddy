/**
 * The zipper mogul course in the slope's own frame (x across toward the first turn's inside, z down the fall line, y
 * up from the slope): its moguls, the rut the skis' track cuts through them, and the snow along that track.
 */

/**
 * The zipper's competition course: moguls 3.5 m apart along the line (inferred: the FIS pace over its time per bump,
 * see MOGUL_SPACING_M; kurpiers-2020 p338 has 4 m on a wave slope), crests MOGUL_RELIEF_M high (derived:
 * ridableReliefOf), the same at every intensity. Each line tops a mogul at its switch (fis-freestyle-judging-2025
 * p26–28: absorb to the top, the turn starts as the extension begins); every line crosses x 0 there, so only a crest
 * at the switch on x 0 (stagger 0, crestAt 0) tops each cell's line whatever its swing: derived. Inferred: the 1 m
 * pick over the trough, the lines' pitch, the raised-cosine footprint, the five lines (a symmetric strip, as the
 * mirrored next turn needs) and the skied-in rut, flat-floored, deepest in the trough and shallow over each top.
 */
export const ZIPPER = {
  height: 1,
  pitch: 3.5,
  columns: 5,
  stagger: 0,
  reach: 2.0,
  crestAt: 0,
  floor: 0.25,
  wall: 0.8,
  deep: 0.15,
  shallow: 0.05,
  rutAt: 0.45,
} as const;

/** One course: metres down the line per turn (the bump spacing), crest-to-trough relief, and the skis' swing across, metres. */
export interface ZipperCourse {
  readonly spacing: number;
  readonly relief: number;
  /** The line's amplitude across: each cell cuts its own (mogulLineFor). */
  readonly swing: number;
}

/** A height with its slopes along x and z. */
export type Field = readonly [number, number, number];

/** Where the skis cross z on the zipper: the course's swing across, the turn's half sine. */
export const trackX = (c: ZipperCourse, z: number): number => -c.swing * Math.sin((Math.PI * z) / c.spacing);

/**
 * The course's moguls without the rut, unit crests: raised-cosine bumps in lines a pitch apart, one mogul per spacing
 * down each line, on it (stagger 0), so each line's moguls repeat every spacing.
 */
export const bumpsField = (c: ZipperCourse, x: number, z: number): Field => {
  let [h, hx, hz] = [0, 0, 0];
  const z0 = z - ZIPPER.crestAt * c.spacing;
  const first = Math.floor((z0 - ZIPPER.reach) / c.spacing);
  const last = Math.ceil((z0 + ZIPPER.reach) / c.spacing);
  const half = (ZIPPER.columns - 1) / 2;
  for (let k = first; k <= last; k++) {
    // A stagger sets alternate moguls either side of the line; 0 puts each on it.
    const side = k % 2 === 0 ? ZIPPER.stagger : -ZIPPER.stagger;
    for (let m = -half; m <= half; m++) {
      const dx = x - side - m * ZIPPER.pitch;
      const dz = z0 - k * c.spacing;
      const r = Math.hypot(dx, dz);
      if (r >= ZIPPER.reach) continue;
      const u = (Math.PI * r) / (2 * ZIPPER.reach);
      h += Math.cos(u) ** 2;
      const g = r > 0 ? (-Math.sin(2 * u) * Math.PI) / (2 * ZIPPER.reach * r) : 0;
      hx += g * dx;
      hz += g * dz;
    }
  }
  return [h, hx, hz];
};

/** Metres per unit crest, so a crest stands the course's relief over the trough between it and the next down the line. */
const scales = new Map<number, number>();
export const scaleOf = (c: ZipperCourse): number => {
  let k = scales.get(c.spacing);
  if (k === undefined) {
    k = 1 / (bumpsField(c, ZIPPER.stagger, ZIPPER.crestAt * c.spacing)[0] - bumpsField(c, 0, (0.5 + ZIPPER.crestAt) * c.spacing)[0]);
    scales.set(c.spacing, k);
  }
  return c.relief * k;
};

/**
 * The zipper course with a flat-floored rut cut along the skis' track, its depth swelling once per turn, and its slopes
 * along x and z, differentiated by hand. The floor lies level across the track, so the pressed skis rest on it edge to
 * edge, and never stands proud of the snow beside it. Reflected in x and moved a spacing down it is unchanged, so the
 * mirrored next turn rides the same snow.
 */
export const zipperField = (c: ZipperCourse, x: number, z: number): Field => {
  const k = scaleOf(c);
  const [b, bx, bz] = bumpsField(c, x, z);
  const base: Field = [k * b, k * bx, k * bz];
  const amp = c.swing;
  const w = Math.PI / c.spacing;
  const off = x - trackX(c, z);
  const slope = -amp * w * Math.cos(w * z);
  const slopeZ = amp * w * w * Math.sin(w * z);
  const offZ = -slope;
  const q = 1 + slope * slope;
  const qZ = 2 * slope * slopeZ;
  // The nearest point on the track, so the floor is level across it rather than across x.
  const along = z + (off * slope) / q;
  const alongX = slope / q;
  const alongZ = 1 + (offZ * slope + off * slopeZ) / q - (off * slope * qZ) / (q * q);
  const root = Math.sqrt(q);
  const a = Math.abs(off) / root;
  if (a >= ZIPPER.wall) return base;
  const sign = off >= 0 ? 1 : -1;
  const aX = sign / root;
  const aZ = (sign * offZ) / root - (Math.abs(off) * qZ) / (2 * q * root);
  const span = ZIPPER.wall - ZIPPER.floor;
  const p = (Math.PI * (a - ZIPPER.floor)) / span;
  const rut = a <= ZIPPER.floor ? 1 : (1 + Math.cos(p)) / 2;
  const rutA = a <= ZIPPER.floor ? 0 : (-Math.sin(p) * Math.PI) / (2 * span);
  const phase = (2 * Math.PI * (along - ZIPPER.rutAt * c.spacing)) / c.spacing;
  const swell = (1 + Math.cos(phase)) / 2;
  const swellAlong = (-Math.sin(phase) * Math.PI) / c.spacing;
  // The rut deepens with the course's relief, so the track's crest-to-trough is the relief; inferred.
  const deepen = ((ZIPPER.deep - ZIPPER.shallow) * c.relief) / ZIPPER.height;
  const depth = ((ZIPPER.shallow + (ZIPPER.deep - ZIPPER.shallow) * swell) * c.relief) / ZIPPER.height;
  const [fb, fbx, fbz] = bumpsField(c, trackX(c, along), along);
  const floor = k * fb - depth;
  const floorAlong = k * (fbx * -amp * w * Math.cos(w * along) + fbz) - deepen * swellAlong;
  const excess = base[0] - floor;
  if (excess <= 0) return base;
  const [exX, exZ] = [base[1] - floorAlong * alongX, base[2] - floorAlong * alongZ];
  return [base[0] - rut * excess, base[1] - rutA * aX * excess - rut * exX, base[2] - rutA * aZ * excess - rut * exZ];
};

/** The line's heading off the fall line toward +x at z, radians: the skis' own, atan of trackX's slope. */
export const lineHeading = (c: ZipperCourse, z: number): number => Math.atan((-c.swing * Math.PI * Math.cos((Math.PI * z) / c.spacing)) / c.spacing);

/** The snow along the skis' track at n turn times i / n, the turn closing on the mirrored next one at n. */
export interface ZipperTrack {
  /** Height over the mean slope, metres. */
  readonly height: Float64Array;
  /** Its rate per unit turn time, metres. */
  readonly rate: Float64Array;
  /** Its curvature along the track, concave positive, 1/m. */
  readonly curvature: Float64Array;
  /** Track length per unit turn time, metres. */
  readonly pace: Float64Array;
  /** Where the skis cross, metres across toward the first turn's inside (trackX). */
  readonly across: Float64Array;
  /** Metres down the fall line from the switch. */
  readonly down: Float64Array;
  /** Turn times of the highest snow, the lowest, and the most concave: the crest, the trough and the hit. */
  readonly crest: number;
  readonly trough: number;
  readonly hit: number;
}

const LINE_STEPS = 4096;

/**
 * The track sampled at steady speed along the line itself, one spacing down per turn: z where the line's arc length
 * reaches i / n of a turn's; the curvature by central differences over the samples.
 */
export const zipperTrack = (c: ZipperCourse, n: number): ZipperTrack => {
  const amp = c.swing;
  const w = Math.PI / c.spacing;
  const secant = (z: number): number => Math.hypot(1, amp * w * Math.cos(w * z));
  const arc = new Float64Array(LINE_STEPS + 1);
  const dz = c.spacing / LINE_STEPS;
  for (let j = 1; j <= LINE_STEPS; j++) arc[j] = (arc[j - 1] ?? 0) + ((secant((j - 1) * dz) + secant(j * dz)) * dz) / 2;
  const length = arc[LINE_STEPS] ?? 1;
  const height = new Float64Array(n);
  const rate = new Float64Array(n);
  const pace = new Float64Array(n);
  const across = new Float64Array(n);
  const down = new Float64Array(n);
  const grade = new Float64Array(n);
  let j = 0;
  for (let i = 0; i < n; i++) {
    const s = (length * i) / n;
    while (j + 1 < LINE_STEPS && (arc[j + 1] ?? 0) <= s) j++;
    const [a0, a1] = [arc[j] ?? 0, arc[j + 1] ?? length];
    // One Newton step on the trapezoid's linear guess.
    let z = (j + (s - a0) / (a1 - a0)) * dz;
    z -= (a0 + ((secant(j * dz) + secant(z)) * (z - j * dz)) / 2 - s) / secant(z);
    const zt = length / secant(z);
    const xz = -amp * w * Math.cos(w * z);
    down[i] = z;
    across[i] = trackX(c, z);
    const [h, hx, hz] = zipperField(c, across[i] ?? 0, z);
    const q = Math.hypot(1, xz);
    height[i] = h;
    rate[i] = (hx * xz + hz) * zt;
    pace[i] = q * zt;
    grade[i] = (hx * xz + hz) / q;
  }
  // The height along the track repeats each turn: the next turn's track is this one mirrored a spacing down.
  const at = (a: Float64Array, i: number): number => a[((i % n) + n) % n] ?? 0;
  const curvature = Float64Array.from({ length: n }, (_, i) => {
    const ds = (at(pace, i - 1) + 2 * at(pace, i) + at(pace, i + 1)) / (2 * n);
    const g = at(grade, i);
    return (at(grade, i + 1) - at(grade, i - 1)) / ds / (1 + g * g) ** 1.5;
  });
  const argOf = (a: Float64Array, pick: (u: number, v: number) => boolean): number => {
    let best = 0;
    for (let i = 1; i < n; i++) if (pick(a[i] ?? 0, a[best] ?? 0)) best = i;
    return best / n;
  };
  return {
    height,
    rate,
    curvature,
    pace,
    across,
    down,
    crest: argOf(height, (u, v) => u > v),
    trough: argOf(height, (u, v) => u < v),
    hit: argOf(curvature, (u, v) => u > v),
  };
};
