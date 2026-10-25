import type { Intensity } from '../content/schema';
import { taskFor } from '../physics/task';
import type { TurnTask } from '../physics/task';
import { Snow } from '../physics/edge';
import { ZIPPER, lineHeading, trackX, zipperField } from '../physics/zipper';
import type { ZipperCourse } from '../physics/zipper';
import { mogulLineFor, skiHeadingAt, turnProfile } from '../physics/turn';
import { edgeContactOf } from '../physics/moguls';
import { kindOfDrill } from './poses/regular-turn';
import { MOGUL_POSE, POWDER_POSE, ROUND_POSE, TOPS_POSE, skisHeading, trackMost, turnPath } from './turn-heading';
import type { TurnPath } from './turn-heading';
import type { Vec3 } from './mat4';

/**
 * Snow surfaces in the slope's own frame: x across the slope toward the first turn's inside, z down the fall
 * line, y up from the slope. The turn starts at the origin, on the field's centre line; the mirrored next turn
 * is the same field reflected in x and moved a spacing down, which every surface here is symmetric under.
 */
export const SurfaceKind = { Groomed: 'groomed', Moguls: 'moguls', Powder: 'powder' } as const;
export type SurfaceKind = (typeof SurfaceKind)[keyof typeof SurfaceKind];

/**
 * The line through moguls: the zipper tops each mogul down one line at the switch, briefly in the rut between, the tips
 * meeting the next face mid-turn (fis-freestyle-judging-2025 pp26, 28); the tops line turns over each crest, as a drill;
 * the round line skis round each bump high on its wall (jds-bumps-style 1:20-1:55).
 */
export const MogulLine = { Round: 'round', Zipper: 'zipper', Tops: 'tops' } as const;
export type MogulLine = (typeof MogulLine)[keyof typeof MogulLine];

export interface Surface {
  readonly kind: SurfaceKind;
  /** The line through the moguls; null off them. */
  readonly line: MogulLine | null;
  readonly path: TurnPath;
  /** Metres down the fall line per turn; on moguls also the bump spacing along the line. */
  readonly spacing: number;
  /** Metres across between mogul columns; the columns either side are offset half a spacing. */
  readonly columns: number;
  /** Mogul crest-to-trough height, metres; 0 off moguls. */
  readonly relief: number;
  /** Loose snow over the packed base the skis ride on, metres; 0 off powder. */
  readonly depth: number;
  /** Metres of path per unit of turn time: the steady speed, or a groomed task's path length per turn. */
  readonly speed: number;
  /** Turn times where the snow under the path is highest and lowest. */
  readonly crest: number;
  readonly trough: number;
  /** A groomed model kind's task: the skis head as `skiHeadingAt`; null keeps the path's own swing. */
  readonly task: TurnTask | null;
  /** The zipper line's swing across, metres: the bump task's own (mogulLineFor); absent off it. */
  readonly swing?: number;
  /** The bump task's one path (mogulLineFor): the root on the physics' mass path, the skis on the line; absent off it. */
  readonly mogul?: MogulPath;
}

/** Per turn time i / n: the mass across, metres, and the skis' track down the fall line from the switch. */
export interface MogulPath {
  readonly mass: Float64Array;
  readonly down: Float64Array;
}

/** The tops line's recreational fields, gentle smaller, within what the legs absorb; competition moguls run 1-1.5 m, an indication only (arndt-1992 p1); inferred. */
const MOGUL_RELIEF: Readonly<Record<Intensity, number>> = { gentle: 0.4, moderate: 0.55, dynamic: 0.7 };
/** Diagonal neighbours about 3.8 m apart, close to the spacing along the line; inferred. */
const MOGUL_COLUMNS = 3;
/**
 * Snow over the ski base: 15 cm or less still skis like packed snow, deeper calls for near even weighting
 * (lemaster-2010 p197), which the powder pose uses; depths inferred, boots partly buried.
 */
/**
 * The round line's natural field: raised-cosine bumps `reach` wide, one per turn on alternate sides of the line,
 * `side` off it and `at` spacings down, in rows `pitch` apart, so the edge set lands on a face just below a crest and
 * the path keeps to the walls, never the troughs (jds-bumps-style 1:20-2:00, dipiro-2005 pp60-61); placement and sizes inferred.
 */
export const ROUND_FIELD = { pitch: 5.4, reach: 3.4, side: 0.75, at: 0.85, rows: 3 } as const;
const POWDER_DEPTH: Readonly<Record<Intensity, number>> = { gentle: 0.15, moderate: 0.2, dynamic: 0.25 };
/** Soft swells on loose snow, so its top reads as a surface; height and length inferred. */
const SWELL = 0.03;
const SWELL_LENGTH = 3;
const SWELL_ACROSS = 5;

const SAMPLES = 256;

/** The feet's track heading off the fall line through one turn, t in 0..1, as trackHeadingAt without its wrap at 1. */
const heading = (t: number, most: number): number => -most * Math.cos(Math.PI * t);

/** Cumulative path offsets per unit speed at SAMPLES + 1 steps through the turn, by the trapezoid rule. */
const integrate = (most: number): { readonly xs: Float64Array; readonly zs: Float64Array } => {
  const xs = new Float64Array(SAMPLES + 1);
  const zs = new Float64Array(SAMPLES + 1);
  for (let i = 1; i <= SAMPLES; i++) {
    const a = heading((i - 1) / SAMPLES, most);
    const b = heading(i / SAMPLES, most);
    xs[i] = (xs[i - 1] ?? 0) + (Math.sin(a) + Math.sin(b)) / (2 * SAMPLES);
    zs[i] = (zs[i - 1] ?? 0) + (Math.cos(a) + Math.cos(b)) / (2 * SAMPLES);
  }
  return { xs, zs };
};

/** As integrate, the heading `phase` turn time ahead, the path centred so that the next turn mirrors it. */
const integratePhased = (most: number, phase: number): ReturnType<typeof integrate> => {
  const xs = new Float64Array(SAMPLES + 1);
  const zs = new Float64Array(SAMPLES + 1);
  for (let i = 1; i <= SAMPLES; i++) {
    const a = heading((i - 1) / SAMPLES + phase, most);
    const b = heading(i / SAMPLES + phase, most);
    xs[i] = (xs[i - 1] ?? 0) + (Math.sin(a) + Math.sin(b)) / (2 * SAMPLES);
    zs[i] = (zs[i - 1] ?? 0) + (Math.cos(a) + Math.cos(b)) / (2 * SAMPLES);
  }
  const mid = (xs[SAMPLES] ?? 0) / 2;
  for (let i = 0; i <= SAMPLES; i++) xs[i] = (xs[i] ?? 0) - mid;
  return { xs, zs };
};

const tables = new Map<string, ReturnType<typeof integrate>>();
const tableFor = (most: number, phase = 0): ReturnType<typeof integrate> => {
  const key = `${most}:${phase}`;
  let table = tables.get(key);
  if (table === undefined) {
    table = phase === 0 ? integrate(most) : integratePhased(most, phase);
    tables.set(key, table);
  }
  return table;
};

type ProfileTable = {
  readonly xs: Float64Array;
  readonly zs: Float64Array;
  readonly track: Float64Array;
  readonly total: number;
  /** A baked carve's skis' path, the mass path's units; null where the skis ride the mass path. */
  readonly skis: { readonly xs: Float64Array; readonly zs: Float64Array } | null;
};
const profileTables = new WeakMap<TurnTask, ProfileTable>();

/** A groomed task's mass path per metre of it: the profile's heading over ds = v T dτ, centred so that x(0) = −x(1). */
const profileTable = (task: TurnTask): ProfileTable => {
  const hit = profileTables.get(task);
  if (hit !== undefined) return hit;
  const p = turnProfile(task, task.snow ?? Snow.HardGroomed);
  const n = p.t.length;
  const total = p.pathM[n] ?? 0;
  // The profile's heading is π/2 on the fall line, the field's 0; the next turn starts mirrored.
  const track = Float64Array.from({ length: n + 1 }, (_, i) => (i < n ? (p.heading[i] ?? 0) - Math.PI / 2 : Math.PI / 2 - (p.heading[0] ?? 0)));
  const xs = new Float64Array(n + 1);
  const zs = new Float64Array(n + 1);
  for (let i = 1; i <= n; i++) {
    const ds = ((p.pathM[i] ?? 0) - (p.pathM[i - 1] ?? 0)) / (2 * total);
    const [a, b] = [track[i - 1] ?? 0, track[i] ?? 0];
    xs[i] = (xs[i - 1] ?? 0) + (Math.sin(a) + Math.sin(b)) * ds;
    zs[i] = (zs[i - 1] ?? 0) + (Math.cos(a) + Math.cos(b)) * ds;
  }
  const mid = (xs[n] ?? 0) / 2;
  for (let i = 0; i <= n; i++) xs[i] = (xs[i] ?? 0) - mid;
  const off = p.skiOffset;
  // The skis toward the turn's outside, −x at the fall line; the next turn's outside is the other side.
  const o = (i: number): number => (i < n ? (off?.[i] ?? 0) : -(off?.[0] ?? 0));
  const skis =
    off === undefined
      ? null
      : {
          xs: xs.map((x, i) => x - (o(i) * Math.cos(track[i] ?? 0)) / total),
          zs: zs.map((z, i) => z + (o(i) * Math.sin(track[i] ?? 0)) / total),
        };
  const table = { xs, zs, track, total, skis };
  profileTables.set(task, table);
  return table;
};

const lineOf = (pose: string): MogulLine | null =>
  pose === MOGUL_POSE ? MogulLine.Zipper : pose === TOPS_POSE ? MogulLine.Tops : pose === ROUND_POSE ? MogulLine.Round : null;

const kindOf = (pose: string): SurfaceKind =>
  lineOf(pose) !== null ? SurfaceKind.Moguls : pose === POWDER_POSE ? SurfaceKind.Powder : SurfaceKind.Groomed;

const PROFILE_SAMPLES = 64;

/** The tops field's own path: the bumps are spaced as a turn swinging across 2 m, whatever line is skied over them. */
const TOPS_FIELD_CORRIDOR = 2;

const taskOf = (pose: string, intensity: Intensity): TurnTask | null => {
  const kind = kindOfDrill(pose);
  return kind === null ? null : taskFor(kind, intensity);
};

/** The snow a pose's turn is skied on at this intensity. */
export const surfaceFor = (pose: string, intensity: Intensity): Surface => {
  const path = turnPath(pose, intensity);
  const kind = kindOf(pose);
  const line = kind === SurfaceKind.Moguls ? lineOf(pose) : null;
  const modelTask = taskOf(pose, intensity);
  const task = modelTask !== null && modelTask.bumpHeightM === 0 ? modelTask : null;
  // The zipper sized by a bump task's own course; other zipper users keep the course constants.
  const bumpTask = line === MogulLine.Zipper && modelTask !== null && modelTask.bumpHeightM > 0 ? modelTask : null;
  const ride = bumpTask === null ? null : mogulLineFor(bumpTask).ride;
  const table = task === null ? null : profileTable(task);
  const { spacing, speed } =
    table !== null
      ? { spacing: (table.zs[table.zs.length - 1] ?? 0) * table.total, speed: table.total }
      : bumpTask !== null && ride !== null
        ? { spacing: bumpTask.bumpSpacingM, speed: ride.track.pace[0] ?? 0 }
        : line === MogulLine.Tops
          ? overField(path, { ...path, corridor: TOPS_FIELD_CORRIDOR })
          : overField(path, path);
  // A groomed task's corridor is its profile's mass path, so the drawn corridor, the path and the skis agree.
  const drawn = table === null ? path : { ...path, corridor: 2 * Math.max(...table.xs.map(Math.abs)) * table.total };
  // Surface.task stays null on moguls: the root rides the mass path, the skis their own line (mogul).
  const surface: Surface = {
    kind,
    line,
    path: drawn,
    spacing,
    columns: line === MogulLine.Zipper ? ZIPPER.pitch : line === MogulLine.Round ? ROUND_FIELD.pitch : MOGUL_COLUMNS,
    relief: bumpTask !== null ? bumpTask.bumpHeightM : line === MogulLine.Zipper ? ZIPPER.height : kind === SurfaceKind.Moguls ? MOGUL_RELIEF[intensity] : 0,
    depth: kind === SurfaceKind.Powder ? POWDER_DEPTH[intensity] : 0,
    speed,
    crest: 0,
    trough: 0.5,
    task,
    ...(bumpTask === null || ride === null ? {} : { swing: mogulLineFor(bumpTask).swing, mogul: { mass: ride.mass.across, down: ride.track.down } }),
  };
  if (line === MogulLine.Round) return { ...surface, ...roundExtremes(surface) };
  return line === MogulLine.Zipper ? { ...surface, ...extremes(surface) } : surface;
};

/** Turn times of the highest and lowest snow under the round line's path. */
const roundExtremes = (s: Surface): { readonly crest: number; readonly trough: number } => {
  const hs = Array.from({ length: PROFILE_SAMPLES }, (_, i) => {
    const { x, z } = pathAt(s, i / PROFILE_SAMPLES);
    return heightAt(s, x, z);
  });
  return { crest: hs.indexOf(Math.max(...hs)) / PROFILE_SAMPLES, trough: hs.indexOf(Math.min(...hs)) / PROFILE_SAMPLES };
};

/** Spacing as `field` sets it, and the steady speed that carries `path` one spacing per turn. */
const overField = (path: TurnPath, field: TurnPath): { readonly spacing: number; readonly speed: number } => {
  const { xs, zs } = tableFor(trackMost(field), field.phase);
  // Steady speed that reaches the corridor's edge on the fall line, as turnPath's corridor says.
  const edge = field.phase === undefined ? -(xs[SAMPLES / 2] ?? 0) : Math.max(...xs.map(Math.abs));
  const spacing = edge > 1e-9 ? (((field.feet ?? field.corridor) / 2) * (zs[SAMPLES] ?? 0)) / edge : 0;
  return { spacing, speed: speedOver(path, spacing) };
};

/** The steady speed that carries `path` one `spacing` per turn. */
const speedOver = (path: TurnPath, spacing: number): number => {
  const along = tableFor(trackMost(path), path.phase).zs[SAMPLES] ?? 0;
  return along > 1e-9 ? spacing / along : 0;
};

/** Turn times of the highest and lowest snow along the skis' track. */
const extremes = (s: Surface): { readonly crest: number; readonly trough: number } => {
  let crest = 0;
  let trough = 0;
  let hi = -Infinity;
  let lo = Infinity;
  for (let i = 0; i < PROFILE_SAMPLES; i++) {
    const t = i / PROFILE_SAMPLES;
    const { z } = pathAt(s, t);
    const h = heightAt(s, trackX(courseOf(s), z), z);
    if (h > hi) [hi, crest] = [h, t];
    if (h < lo) [lo, trough] = [h, t];
  }
  return { crest, trough };
};

/** Height of the snow's top at (x, z), metres. */
export const heightAt = (s: Surface, x: number, z: number): number => {
  if (s.line === MogulLine.Zipper) return zipper(s, x, z);
  if (s.line === MogulLine.Round) return round(s, x, z);
  const w = wave(s);
  if (w === null) return 0;
  return s.depth + w.a * Math.cos(w.kz * z) * Math.cos(w.kx * x);
};

/** The top as depth + a cos(kz z) cos(kx x): even in x, a whole number of waves per turn; null when flat. */
const wave = (s: Surface): { readonly a: number; readonly kz: number; readonly kx: number } | null => {
  if (s.spacing <= 0 || s.kind === SurfaceKind.Groomed) return null;
  // An egg crate: crests on the line at each switch and on the columns either side between them.
  if (s.kind === SurfaceKind.Moguls) return { a: s.relief / 2, kz: (2 * Math.PI) / s.spacing, kx: Math.PI / s.columns };
  return { a: SWELL, kz: (2 * Math.PI * Math.max(1, Math.round(s.spacing / SWELL_LENGTH))) / s.spacing, kx: (2 * Math.PI) / SWELL_ACROSS };
};

/** The wave's slopes along x and z at (x, z). */
const slopes = (s: Surface, x: number, z: number): { readonly dx: number; readonly dz: number } => {
  const w = wave(s);
  if (w === null) return { dx: 0, dz: 0 };
  const { a, kz, kx } = w;
  return { dx: -a * kx * Math.cos(kz * z) * Math.sin(kx * x), dz: -a * kz * Math.sin(kz * z) * Math.cos(kx * x) };
};

/** The zipper's exact slopes, so a tangent row's Jacobian carries no finite-difference noise. */
const zipperSlopes = (s: Surface, x: number, z: number): { readonly dx: number; readonly dz: number } => {
  const [, dx, dz] = zipperField(courseOf(s), x, z);
  return { dx, dz };
};

/** The round field's bumps summed at (x, z), before scaling: the next turn's row mirrored in x a spacing down. */
const roundBumps = (s: Surface, x: number, z: number): number => {
  const { pitch, reach, side, at, rows } = ROUND_FIELD;
  const first = Math.floor((z - reach) / s.spacing - at);
  const last = Math.ceil((z + reach) / s.spacing - at);
  let h = 0;
  for (let k = first; k <= last; k++) {
    const sign = k % 2 === 0 ? 1 : -1;
    for (let m = -rows; m <= rows; m++) {
      const r = Math.hypot(x - sign * (side + m * pitch), z - (k + at) * s.spacing);
      if (r < reach) h += Math.cos((Math.PI * r) / (2 * reach)) ** 2;
    }
  }
  return h;
};

/** The round field's lowest and highest raw sums near the line, by spacing. */
const roundRanges = new Map<number, readonly [number, number]>();
const roundRange = (s: Surface): readonly [number, number] => {
  let range = roundRanges.get(s.spacing);
  if (range === undefined) {
    let lo = Infinity;
    let hi = -Infinity;
    for (let x = -4; x <= 4; x += 0.1)
      for (let z = 0; z <= 2 * s.spacing; z += 0.1) {
        const h = roundBumps(s, x, z);
        lo = Math.min(lo, h);
        hi = Math.max(hi, h);
      }
    range = [lo, hi];
    roundRanges.set(s.spacing, range);
  }
  return range;
};

/** The round field's top, its troughs at 0 and crests at the relief. */
const round = (s: Surface, x: number, z: number): number => {
  const [lo, hi] = roundRange(s);
  return (s.relief * (roundBumps(s, x, z) - lo)) / (hi - lo);
};

const roundSlopes = (s: Surface, x: number, z: number): { readonly dx: number; readonly dz: number } => {
  const e = 1e-5;
  return { dx: (round(s, x + e, z) - round(s, x - e, z)) / (2 * e), dz: (round(s, x, z + e) - round(s, x, z - e)) / (2 * e) };
};

/** The zipper course a surface lays, cached so the hot gap rows allocate nothing. */
const courses = new WeakMap<Surface, ZipperCourse>();
const courseOf = (s: Surface): ZipperCourse => {
  let c = courses.get(s);
  if (c === undefined) {
    c = { spacing: s.spacing, relief: s.relief, swing: s.swing ?? 0 };
    courses.set(s, c);
  }
  return c;
};

const zipper = (s: Surface, x: number, z: number): number => zipperField(courseOf(s), x, z)[0];

/** Height of what the skis ride on: the packed base under any loose snow. */
export const supportAt = (s: Surface, x: number, z: number): number => (s.kind === SurfaceKind.Powder ? 0 : heightAt(s, x, z));

/** The unit normal of the snow's top at (x, z). */
export const normalAt = (s: Surface, x: number, z: number): Vec3 => {
  const { dx, dz } = s.line === MogulLine.Zipper ? zipperSlopes(s, x, z) : s.line === MogulLine.Round ? roundSlopes(s, x, z) : slopes(s, x, z);
  if (dx === 0 && dz === 0) return [0, 1, 0];
  const n = Math.hypot(dx, 1, dz);
  return [-dx / n, 1 / n, -dz / n];
};

/** The skier on the field at turn time t (0..1): where the skis' centre is on the track and their yaw off the fall line. */
export interface OnField {
  readonly x: number;
  readonly z: number;
  readonly heading: number;
  /** The track's heading there; pivoted skis skid off it by heading - track. */
  readonly track: number;
}

/** Where the turn's path is at time t: from the centre line at the switch, across to the corridor's edge on the fall line, back to the centre line a spacing down at t = 1. */
export const pathAt = (s: Surface, t: number): OnField => {
  if (s.mogul !== undefined) {
    const { mass, down } = s.mogul;
    const n = mass.length;
    const u = Math.min(1, Math.max(0, t)) * n;
    const i = Math.min(n - 1, Math.floor(u));
    const f = u - i;
    // Past the last sample the mirrored next turn's first, a spacing down.
    const [x1, z1] = i + 1 < n ? [mass[i + 1] ?? 0, down[i + 1] ?? 0] : [-(mass[0] ?? 0), s.spacing + (down[0] ?? 0)];
    const z = (down[i] ?? 0) * (1 - f) + z1 * f;
    // The skis' yaw is their line's plus the attack (skiHeadingAt), read by every consumer through the path.
    return { x: (mass[i] ?? 0) * (1 - f) + x1 * f, z, heading: skisHeading(Math.min(1, Math.max(0, t)), s.path), track: lineHeading(courseOf(s), z) };
  }
  if (s.task !== null) {
    const { xs, zs, track } = profileTable(s.task);
    const n = xs.length - 1;
    const at = Math.min(1, Math.max(0, t));
    const i = Math.min(n - 1, Math.floor(at * n));
    const f = at * n - i;
    const lerp = (a: Float64Array): number => (a[i] ?? 0) * (1 - f) + (a[i + 1] ?? 0) * f;
    return { x: lerp(xs) * s.speed, z: lerp(zs) * s.speed, heading: skiHeadingAt(s.task, at) - Math.PI / 2, track: lerp(track) };
  }
  const most = trackMost(s.path);
  const { xs, zs } = tableFor(most, s.path.phase);
  const at = Math.min(1, Math.max(0, t));
  const u = at * SAMPLES;
  const i = Math.min(SAMPLES - 1, Math.floor(u));
  const f = u - i;
  const lerp = (a: Float64Array): number => ((a[i] ?? 0) * (1 - f) + (a[i + 1] ?? 0) * f) * s.speed;
  return { x: lerp(xs), z: lerp(zs), heading: skisHeading(at, s.path), track: heading(at + (s.path.phase ?? 0), most) };
};

/** Where the skis' centre is at turn time t: on the moguls line under the mass, a baked carve's skis' path, else the path itself. */
export const skisAt = (s: Surface, t: number): { readonly x: number; readonly z: number } => {
  const p = pathAt(s, t);
  const skis = s.mogul === undefined && s.task !== null ? profileTable(s.task).skis : null;
  if (skis !== null) {
    const n = skis.xs.length - 1;
    const at = Math.min(1, Math.max(0, t));
    const i = Math.min(n - 1, Math.floor(at * n));
    const f = at * n - i;
    const lerp = (a: Float64Array): number => ((a[i] ?? 0) * (1 - f) + (a[i + 1] ?? 0) * f) * s.speed;
    return { x: lerp(skis.xs), z: lerp(skis.zs) };
  }
  return s.mogul === undefined ? p : { x: trackX(courseOf(s), p.z), z: p.z };
};

/** The root path's own heading off the fall line toward +x at turn time t, radians: on moguls the mass's travel. */
export const massHeadingAt = (s: Surface, t: number): number => {
  if (s.mogul === undefined) return pathAt(s, t).track;
  const e = 1 / (4 * s.mogul.mass.length);
  const [a, b] = [pathAt(s, Math.max(0, t - e)), pathAt(s, Math.min(1, t + e))];
  return Math.atan2(b.x - a.x, b.z - a.z);
};

/** A point under the skier: on the field, the snow's top and the support there, and the top's normal. */
export interface UnderFoot {
  readonly x: number;
  readonly z: number;
  readonly height: number;
  readonly support: number;
  readonly normal: Vec3;
}

/**
 * The snow under a point fixed to the skis at turn time t: `local` is [across, along] the skis from their centre,
 * across toward the turn's inside (+x of the figure's root). `mirrored` is the next turn, drawn reflected in x.
 */
export const underFoot = (s: Surface, t: number, local: readonly [number, number], mirrored = false): UnderFoot => {
  const p = pathAt(s, t);
  const across = mirrored ? -local[0] : local[0];
  const c = Math.cos(p.heading);
  const sn = Math.sin(p.heading);
  const x = p.x + across * c + local[1] * sn;
  const z = p.z - across * sn + local[1] * c;
  // The next turn, reflected in x a spacing down, meets the same field.
  return { x, z, height: heightAt(s, x, z), support: supportAt(s, x, z), normal: normalAt(s, x, z) };
};

/**
 * A ski resting on the support: its pitch tip-up at the boot, its roll toward +x as the snow under the binding banks it
 * across the skis, and the heights of its base at the binding and the tip.
 */
export interface SkiRest {
  readonly pitch: number;
  readonly roll: number;
  readonly base: number;
  readonly tip: number;
}

const REST_SAMPLES = 32;

/**
 * Where a ski bent at `curvature` (1/m, bendCurvatureOf) at `at` = [across, along] from the skis' centre, `ahead` to
 * its tip and `behind` to its tail, rests at turn time t: the physics' edgeContactOf on the support along it, so it
 * never cuts the snow and touches at the boot (pressed) or at a tail-side and a tip-side point (bridged).
 */
export const skiRest = (s: Surface, t: number, at: readonly [number, number], ahead: number, behind: number, curvature = 0): SkiRest => {
  const under = (along: number): number => underFoot(s, t, [at[0], at[1] + along]).support;
  const u = Array.from({ length: REST_SAMPLES + 1 }, (_, i) => -behind + ((ahead + behind) * i) / REST_SAMPLES);
  if (!u.includes(0)) u.splice(u.findIndex((v) => v > 0), 0, 0);
  const c = edgeContactOf(u, u.map(under), curvature);
  const { normal } = underFoot(s, t, at);
  const h = pathAt(s, t).heading;
  const roll = Math.atan((normal[0] * Math.cos(h) - normal[2] * Math.sin(h)) / normal[1]);
  return { pitch: Math.atan(c.pitch), roll, base: c.rest, tip: c.rest + ahead * c.pitch + (curvature * ahead * ahead) / 2 };
};

/** A ski's rest on the zipper where the skis cross the path's z at turn time t, as skiRest. */
export const trackRest = (s: Surface, t: number, ahead: number, behind: number, curvature = 0): SkiRest => {
  const p = pathAt(s, t);
  let across = 0;
  for (let i = 0; i < 2; i++) across = (trackX(courseOf(s), p.z - across * Math.sin(p.heading)) - p.x) / Math.cos(p.heading);
  return skiRest(s, t, [across, 0], ahead, behind, curvature);
};

/** A grid over the field's square of half side `half`, `step` apart: positions, normals and triangle indices. */
export const fieldMesh = (
  s: Surface,
  half: number,
  step: number,
): { readonly positions: Float32Array; readonly normals: Float32Array; readonly indices: Uint32Array } => {
  const n = Math.max(1, Math.round((2 * half) / step));
  const row = n + 1;
  const positions = new Float32Array(row * row * 3);
  const normals = new Float32Array(row * row * 3);
  for (let j = 0; j <= n; j++)
    for (let i = 0; i <= n; i++) {
      const x = -half + (2 * half * i) / n;
      const z = -half + (2 * half * j) / n;
      const k = 3 * (j * row + i);
      const [nx, ny, nz] = normalAt(s, x, z);
      positions.set([x, heightAt(s, x, z), z], k);
      normals.set([nx, ny, nz], k);
    }
  const indices = new Uint32Array(n * n * 6);
  for (let j = 0; j < n; j++)
    for (let i = 0; i < n; i++) {
      const a = j * row + i;
      // Counter-clockwise seen from above.
      indices.set([a, a + row, a + 1, a + 1, a + row, a + row + 1], 6 * (j * n + i));
    }
  return { positions, normals, indices };
};
