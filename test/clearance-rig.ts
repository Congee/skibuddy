import type { Intensity } from '../src/content/schema';
import { bendCurvatureOf } from '../src/physics/ski-bend';
import { taskFor } from '../src/physics/task';
import { EQUIPMENT } from '../src/viewer/equipment';
import { BodySide, SEGMENTS, segmentIndex } from '../src/viewer/figure';
import { compose, identity, transformPoint, translation } from '../src/viewer/mat4';
import type { Mat4, Vec3 } from '../src/viewer/mat4';
import { axisOf, skiFrame, transform } from '../src/viewer/motion/fk';
import type { Rigid } from '../src/viewer/motion/fk';
import { qTable, rootWorlds } from '../src/viewer/motion/q-table';
import { bootCapsules, runningLength, skiGoal } from '../src/viewer/motion/turn';
import { MID_FOOT, segmentMatrices, skiIndex } from '../src/viewer/pose';
import { poseTable } from '../src/viewer/pose-table';
import { kindOfDrill } from '../src/viewer/poses/regular-turn';
import { SKELETON_DATA, Side, restWorld, rigidInverse } from '../src/viewer/skeleton';
import { REFERENCE_SKIER, SKI_MOUNT, Terrain, skiFor } from '../src/viewer/skier';
import type { Ski } from '../src/viewer/skier';
import { SurfaceKind, surfaceFor } from '../src/viewer/surface';
import { bootParts, segmentDistance } from './clearance-parts';

export type Cap = readonly [Vec3, Vec3, number];

/** A ski as the viewer bends it: `origin` mid-thickness under the binding, the mount SKI_MOUNT ahead along it. */
export interface SkiPose {
  readonly origin: Vec3;
  readonly across: Vec3;
  readonly up: Vec3;
  readonly along: Vec3;
  /** 1/m: the base rises u² · bend / 2 along `up` at u from the mount. */
  readonly bend: number;
  readonly ski: Ski;
}

/** One sample's geometry in world coordinates; index 0 is the outside (right) side, 1 the inside (left). */
export interface Rig {
  readonly skis: readonly [SkiPose, SkiPose];
  readonly boots: readonly [ReadonlyArray<Cap>, ReadonlyArray<Cap>];
  /** Thigh and shin capsules per leg. */
  readonly legs: readonly [ReadonlyArray<Cap>, ReadonlyArray<Cap>];
  /** Boot centre: mid-foot at the binding. */
  readonly centre: readonly [Vec3, Vec3];
}

export interface Frame {
  readonly t: number;
  readonly rig: Rig;
}

export const Source = { Drawn: 'drawn', Q: 'q' } as const;
export type Source = (typeof Source)[keyof typeof Source];

const SIDES = [BodySide.Right, BodySide.Left] as const;
type LegSide = (typeof SIDES)[number];
const ISB = { [BodySide.Right]: Side.Right, [BodySide.Left]: Side.Left } as const;

export const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const add = (a: Vec3, b: Vec3, k = 1): Vec3 => [a[0] + k * b[0], a[1] + k * b[1], a[2] + k * b[2]];
export const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const unit = (a: Vec3): Vec3 => {
  const n = Math.hypot(...a) || 1;
  return [a[0] / n, a[1] / n, a[2] / n];
};
const axis = (m: Mat4, v: Vec3): Vec3 => unit(sub(transformPoint(m, v), transformPoint(m, [0, 0, 0])));
const num = (v: ReadonlyArray<unknown>): Vec3 => [Number(v[0]), Number(v[1]), Number(v[2])];
const triple = <T>(x: ReadonlyArray<T>): readonly [T, T] => [x[0] as T, x[1] as T];

/** The ski the figure rides for this drill: the kind's race or terrain ski, as the solver's. */
export const skiOfDrill = (drill: string, i: Intensity): Ski => {
  const kind = kindOfDrill(drill);
  if (kind !== null) return taskFor(kind, i).ski;
  return skiFor(REFERENCE_SKIER, surfaceFor(drill, i).kind === SurfaceKind.Moguls ? Terrain.Moguls : Terrain.Groomed);
};

/** A figure segment's capsule: its centre, half cylinder length and radius, in the segment's frame. */
const shapeOf = (name: string): { readonly c: Vec3; readonly half: number; readonly r: number } => {
  const s = SEGMENTS[segmentIndex(name)]?.shape;
  if (s === undefined || s.type !== 'capsule') throw new Error(`${name} is not a capsule`);
  return { c: s.center, half: s.length / 2, r: s.radius };
};
/** Length of the bone that ends where `child` joins. */
const boneBefore = (child: string): number => -(SEGMENTS[segmentIndex(child)]?.joint[1] ?? Number.NaN);

/** The pose table's frames as the capsule viewer draws them: segmentMatrices of each pose. */
const drawn = (drill: string, i: Intensity): ReadonlyArray<Frame> => {
  const ski = skiOfDrill(drill, i);
  const table = poseTable(drill, i);
  return table.map((pose, k) => {
    const world = segmentMatrices({ ...pose, rise: 0 });
    const at = (name: string): Mat4 => world[segmentIndex(name)] ?? identity();
    const skis = SIDES.map((side, n): SkiPose => {
      const m = world[skiIndex(side)] ?? identity();
      return { origin: transformPoint(m, [0, 0, 0]), across: axis(m, [1, 0, 0]), up: axis(m, [0, 1, 0]), along: axis(m, [0, 0, 1]), bend: (n === 0 ? pose.outside : pose.inside).bend, ski };
    });
    const leg = (side: LegSide): ReadonlyArray<Cap> =>
      ['thigh', 'shin'].map((part): Cap => {
        const { c, half, r } = shapeOf(`${side}-${part}`);
        const m = at(`${side}-${part}`);
        return [transformPoint(m, [c[0], c[1] - half, c[2]]), transformPoint(m, [c[0], c[1] + half, c[2]]), r];
      });
    const rig: Rig = {
      skis: triple(skis),
      boots: triple(SIDES.map((side) => bootParts(at(`${side}-boot`), ISB[side]))),
      legs: triple(SIDES.map(leg)),
      centre: triple(SIDES.map((side) => transformPoint(at(`${side}-boot`), MID_FOOT))),
    };
    return { t: k / table.length, rig };
  });
};

/** The ankle joint in a foot segment's frame, where the boot capsules hang. */
const ankleIn = (side: LegSide): Vec3 => transformPoint(compose(rigidInverse(restWorld(`foot.${ISB[side]}`)), translation(SKELETON_DATA.gear_fit[ISB[side]].ankle)), [0, 0, 0]);

/** The q-table's frames by forward kinematics, the solve's own figure; null for a drill without one. */
const solved = (drill: string, i: Intensity): ReadonlyArray<Frame> | null => {
  const q = qTable(drill, i);
  if (q === null) return null;
  const ski = skiOfDrill(drill, i);
  const surface = surfaceFor(drill, i);
  return q.map((frame, k) => {
    const t = k / q.length;
    const w = rootWorlds(drill, i, frame, t);
    const at = (name: string): Rigid => {
      const r = w[name];
      if (r === undefined) throw new Error(`no segment ${name}`);
      return r;
    };
    const bends = skiGoal(drill, i, surface, t).bend.map(bendCurvatureOf);
    const skis = SIDES.map((side, n): SkiPose => {
      const f = skiFrame(w, ISB[side]);
      const [across, up, along] = [0, 1, 2].map((c) => num(axisOf(f, c as 0 | 1 | 2)));
      if (across === undefined || up === undefined || along === undefined) throw new Error('frame');
      return { origin: add(num(f.p), up, -EQUIPMENT.skiThickness / 2), across, up, along, bend: bends[n] ?? 0, ski };
    });
    const leg = (side: LegSide): ReadonlyArray<Cap> => {
      const s = ISB[side] === Side.Right ? 'R' : 'L';
      const hip = num(at(`femur.${s}`).p);
      const knee = num(at(`tibia.${s}`).p);
      const ankle = num(transform(at(`foot.${s}`), ankleIn(side)));
      // The figure's capsule fractions along each ISB bone.
      return ([['thigh', hip, knee, 'shin'], ['shin', knee, ankle, 'boot']] as const).map(([part, from, to, child]): Cap => {
        const { c, half, r } = shapeOf(`${side}-${part}`);
        const d = sub(to, from);
        const L = boneBefore(`${side}-${child}`);
        return [add(from, d, -(c[1] - half) / L), add(from, d, -(c[1] + half) / L), r];
      });
    };
    const rig: Rig = {
      skis: triple(skis),
      boots: triple(SIDES.map((side) => bootCapsules(ISB[side]).map((c): Cap => [num(transform(at(`foot.${ISB[side]}`), c.a)), num(transform(at(`foot.${ISB[side]}`), c.b)), c.radius]))),
      legs: triple(SIDES.map(leg)),
      centre: triple(SIDES.map((side) => num(skiFrame(w, ISB[side]).p))),
    };
    return { t, rig };
  });
};

export const framesOf = (drill: string, i: Intensity, source: Source): ReadonlyArray<Frame> | null => (source === Source.Drawn ? drawn(drill, i) : solved(drill, i));

interface Slab {
  readonly c: Vec3;
  readonly a: readonly [Vec3, Vec3, Vec3];
  readonly h: Vec3;
  readonly r: number;
}

const STATION = 0.05;
/** Slabs tiling a ski, each as wide as the plan shape there (sidecut parabola through the end rows, as skiPointsOf) and tilted with the bend. */
export const slabsOf = (s: SkiPose): ReadonlyArray<Slab> => {
  const { ski } = s;
  const half = runningLength(ski) / 2;
  const n = Math.ceil(ski.length / STATION);
  const dz = ski.length / n;
  const b = (ski.tip + ski.tail - 2 * ski.waist) / (2 * half * half);
  const a = (ski.tip - ski.tail) / (2 * half);
  return Array.from({ length: n }, (_, k) => {
    const u = -ski.length / 2 + (k + 0.5) * dz;
    const v = Math.max(-half, Math.min(half, u));
    const width = ski.waist + a * v + b * v * v;
    const along = unit(add(s.along, s.up, s.bend * u));
    const up = unit(add(s.up, s.along, -s.bend * u));
    const c = add(add(s.origin, s.along, SKI_MOUNT + u), s.up, (s.bend * u * u) / 2);
    const h: Vec3 = [dz / 2, EQUIPMENT.skiThickness / 2, width / 2];
    // Axes are ordered along, up, across to match h.
    return { c, a: [along, up, s.across] as const, h, r: Math.hypot(...h) };
  });
};

/** Signed gap of two boxes: the largest separation over the 15 axes; the least overlap, negative, once they cross. */
const gap = (p: Slab, q: Slab): number => {
  const d = sub(q.c, p.c);
  const far = Math.hypot(...d) - p.r - q.r;
  if (far > 0.3) return far;
  const axes: Vec3[] = [...p.a, ...q.a];
  for (const x of p.a) for (const y of q.a) axes.push(cross(x, y));
  let best = -Infinity;
  for (const raw of axes) {
    if (Math.hypot(...raw) < 1e-6) continue;
    const l = unit(raw);
    const reach = (s: Slab): number => Math.abs(dot(s.a[0], l)) * s.h[0] + Math.abs(dot(s.a[1], l)) * s.h[1] + Math.abs(dot(s.a[2], l)) * s.h[2];
    best = Math.max(best, Math.abs(dot(d, l)) - reach(p) - reach(q));
  }
  return best;
};

/** Least gap between the two skis' solid boxes, metres: negative is overlap; a gap past 0.3 m reads as its centre bound. */
export const skiGap = (rig: Rig): number => {
  const [o, n] = [slabsOf(rig.skis[0]), slabsOf(rig.skis[1])];
  let least = Infinity;
  for (const p of o) for (const q of n) least = Math.min(least, gap(p, q));
  return least;
};

const capsGap = (a: ReadonlyArray<Cap>, b: ReadonlyArray<Cap>): number => {
  let least = Infinity;
  for (const [p, q, ra] of a) for (const [c, d, rb] of b) least = Math.min(least, segmentDistance(p, q, c, d) - ra - rb);
  return least;
};
export const bootGap = (rig: Rig): number => capsGap(rig.boots[0], rig.boots[1]);
export const legGap = (rig: Rig): number => capsGap(rig.legs[0], rig.legs[1]);

/** Inside boot centre ahead of the outside's along the skis' mean heading, metres. */
export const lead = (rig: Rig): number => dot(sub(rig.centre[1], rig.centre[0]), unit(add(rig.skis[0].along, rig.skis[1].along)));
