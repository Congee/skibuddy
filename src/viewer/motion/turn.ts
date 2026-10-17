import type { Intensity } from '../../content/schema';
import { turnForcesAt } from '../../physics/turn';
import type { TurnScenario } from '../../physics/turn';
import { Boundary, Cycle } from '../../solve/cycle';
import type { Mirror } from '../../solve/cycle';
import { diagnose, formatDiagnosis } from '../../solve/diagnose';
import type { Diagnosis } from '../../solve/diagnose';
import type { Dual } from '../../solve/dual';
import { BlockKind, prior } from '../../solve/problem';
import type { Block, Problem } from '../../solve/problem';
import { solve } from '../../solve/solve';
import type { SolveOptions, SolveResult } from '../../solve/solve';
import { EQUIPMENT } from '../equipment';
import { BodySide } from '../figure';
import { ANKLE_DORSIFLEXION_KNEE_FLEXED, JOINT_LIMITS } from '../joint-limits';
import type { Vec3 } from '../mat4';
import { centreOfMass, SKI_BASE, segmentMatrices, skiIndex } from '../pose';
import { poseTable, samplePose } from '../pose-table';
import { weightSplit } from '../poses/regular-turn';
import { examplesFor, interpolate, parityOf, Parity, priorAt, mirrorName } from '../prior/prior';
import type { PriorAt } from '../prior/prior';
import { COORDINATES, DofKind, REST_POSE, SKELETON_DATA, Side } from '../skeleton';
import { REFERENCE_SKIER, SKI_MOUNT, skiEnds, skiFor, Terrain } from '../skier';
import { normalAt, pathAt, supportAt, surfaceFor, SurfaceKind } from '../surface';
import type { Surface } from '../surface';
import { turnStyle } from '../turn-heading';
import { add, asin, axisOf, chainOf, cross3, dot3, forward, mul, neg, skiFrame, sub, sub3, transform, value } from './fk';
import type { Rigid, Scalar, V3 } from './fk';
import { arcLoad } from '../../physics/turn';

/**
 * Step 3a of the motion pipeline: one drill × intensity as a whole-cycle weighted least-squares problem over
 * the ISB coordinates. Turn 0 is a left turn (right ski outside), slope frame as surface.ts (x across toward
 * the inside, y up from the slope, z down the fall line); turn 1 is its mirror. Each frame's pelvis translation
 * is relative to the path point, so the variables stay small.
 */

const DEG = Math.PI / 180;

/** Per-frame scalars after the skeleton's coordinates: the inside ski's lead along and gap across the outside's track. */
export const EXTRA_NAMES = ['inside_lead', 'inside_gap'] as const;
export const NAMES: ReadonlyArray<string> = [...COORDINATES.map((c) => c.name), ...EXTRA_NAMES];
const N = NAMES.length;
const LEAD = COORDINATES.length;
const GAP = LEAD + 1;
const at = (name: string): number => NAMES.indexOf(name);

/** Inside edge within this of the outside's; inferred: no measured inside-outside difference read. */
export const EDGE_DIFFERENCE = 5 * DEG;
/** Inside ski's yaw off the outside's, one σ of its soft parallel term; inferred. */
const PARALLEL_SIGMA = 5 * DEG;
/** Inside ski's base gap per unit of its load share, one σ, metres; inferred. */
const INSIDE_GAP_SIGMA = 0.01;
/** Second difference per frame at 96 frames a turn, one σ; inferred. */
const SMOOTH_SIGMA = 0.1 * DEG;
/** Barrier width inside each joint bound; inferred. */
const BARRIER = 3 * DEG;
/** TEMPORARY: CoM height's σ about the current solver's; inferred. */
const COM_SIGMA = 0.05;

/** de-leva-1996 male mass shares onto the ISB segments; head and neck ride the head, the scapulae carry none. */
const MASS: Readonly<Record<string, number>> = {
  pelvis: 0.1117,
  lumbar: 0.1633,
  thorax: 0.1596,
  neck: 0,
  head: 0.0694,
  ...Object.fromEntries(
    [Side.Right, Side.Left].flatMap((s) => [
      [`femur.${s}`, 0.1416],
      [`tibia.${s}`, 0.0433],
      [`foot.${s}`, 0.0137],
      [`scapula.${s}`, 0],
      [`humerus.${s}`, 0.0271],
      [`forearm.${s}`, 0.0162],
      [`hand.${s}`, 0.0061],
    ]),
  ),
};

/** Each segment's mass centre at rest, between its joint centres (inferred: de Leva's % positions not applied). */
const restCentre = (seg: string): Vec3 => {
  const j = SKELETON_DATA.joints;
  const [base, s] = seg.split('.');
  const pair: Readonly<Record<string, readonly [string, string]>> = {
    pelvis: ['pelvis', 'l5s1'],
    lumbar: ['l5s1', 't12l1'],
    thorax: ['t12l1', 'c7t1'],
    neck: ['c7t1', 'c1'],
    head: ['c1', 'crown'],
    femur: [`hip.${s}`, `knee.${s}`],
    tibia: [`knee.${s}`, `ankle.${s}`],
    foot: [`ankle.${s}`, `ankle.${s}`],
    scapula: [`sc.${s}`, `shoulder.${s}`],
    humerus: [`shoulder.${s}`, `elbow.${s}`],
    forearm: [`elbow.${s}`, `wrist.${s}`],
    hand: [`wrist.${s}`, `knuckle.${s}`],
  };
  const [a, b] = (pair[base ?? ''] ?? ['pelvis', 'pelvis']).map((k) => j[k] ?? [0, 0, 0]);
  return [((a?.[0] ?? 0) + (b?.[0] ?? 0)) / 2, ((a?.[1] ?? 0) + (b?.[1] ?? 0)) / 2, ((a?.[2] ?? 0) + (b?.[2] ?? 0)) / 2];
};
const LOCAL_CENTRE: Readonly<Record<string, Vec3>> = Object.fromEntries(
  Object.keys(MASS).map((seg) => {
    const r = SKELETON_DATA.segments[seg];
    if (r === undefined) throw new Error(`no segment ${seg}`);
    const c = restCentre(seg);
    const d = [c[0] - r.origin[0], c[1] - r.origin[1], c[2] - r.origin[2]] as const;
    const proj = (a: Vec3): number => a[0] * d[0] + a[1] * d[1] + a[2] * d[2];
    return [seg, [proj(r.x), proj(r.y), proj(r.z)] as Vec3];
  }),
);

export const centreOfMassOf = (world: Readonly<Record<string, Rigid>>): V3 => {
  let c: V3 = [0, 0, 0];
  for (const [seg, m] of Object.entries(MASS)) {
    const w = world[seg];
    if (w === undefined || m === 0) continue;
    const p = transform(w, LOCAL_CENTRE[seg] ?? [0, 0, 0]);
    c = [add(c[0], mul(m, p[0])), add(c[1], mul(m, p[1])), add(c[2], mul(m, p[2]))];
  }
  return c;
};

/** Ski base contact points in the binding frame: tip, waist and tail on both edges, [across, along]. */
export interface SkiPoints {
  readonly points: ReadonlyArray<Vec3>;
  /** The wider end's edges toward +x and toward -x: a rigid edged ski touches there, sidecut lifting its waist. */
  readonly contact: readonly [Vec3, Vec3];
  readonly centre: Vec3;
  readonly width: number;
}

export const skiPoints = (terrain: Terrain): SkiPoints => {
  const ski = skiFor(REFERENCE_SKIER, terrain);
  const { tip, tail } = skiEnds(ski);
  const y = -EQUIPMENT.skiThickness;
  const row = (along: number, width: number): Vec3[] => [
    [width / 2, y, along],
    [-width / 2, y, along],
  ];
  const end = ski.tip >= ski.tail ? row(tip, ski.tip) : row(tail, ski.tail);
  return {
    points: [...row(tip, ski.tip), ...row(SKI_MOUNT, ski.waist), ...row(tail, ski.tail)],
    contact: [end[0] ?? [0, y, 0], end[1] ?? [0, y, 0]],
    centre: [0, y, SKI_MOUNT],
    width: Math.max(ski.tip, ski.tail),
  };
};

/** Height of `p` over the support, exact in value and first order in its slope through the snow's normal. */
const gapOver = (surface: Surface, p: V3): Scalar => {
  const x = value(p[0]);
  const z = value(p[2]);
  const n = normalAt(surface, x, z);
  const h = supportAt(surface, x, z);
  const hx = -n[0] / n[1];
  const hz = -n[2] / n[1];
  return sub(sub(sub(p[1], h), mul(hx, sub(p[0], value(p[0])))), mul(hz, sub(p[2], value(p[2]))));
};

/** The outside ski's goal at one frame, in the frame's local coordinates (path point at the origin). */
export interface SkiGoal {
  readonly t: number;
  /** Path point in the slope frame; the pelvis translation is relative to it. */
  readonly origin: Vec3;
  /** Snow normal, forward and across (toward +x) in the snow's plane. */
  readonly normal: Vec3;
  readonly forward: Vec3;
  readonly across: Vec3;
  /** Physics edge angle toward the turn's inside, radians. */
  readonly edge: number;
  /** Ski axes the goal asks for: binding x, y, z. */
  readonly axes: readonly [Vec3, Vec3, Vec3];
  readonly insideShare: number;
  /** TEMPORARY: the current solver's CoM height over the outside ski's base, metres. */
  readonly comHeight: number;
}

const normalise = (v: Vec3): Vec3 => {
  const l = Math.hypot(...v);
  return [v[0] / l, v[1] / l, v[2] / l];
};
const crossN = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

/**
 * The edge the physics asks of the outside ski: its base square to the resultant (lemaster-2010 p9), so the edge
 * matches the resultant's tilt off the slope normal; skid share not yet applied.
 */
export const physicsEdge = (s: TurnScenario, t: number): number => turnForcesAt(s, t).tilt;

/** The current solver's CoM over the outside ski's base under the binding (TEMPORARY, step 3b replaces it). */
const legacyComHeight = (drill: string, intensity: Intensity, t: number): number => {
  const world = segmentMatrices({ ...samplePose(poseTable(drill, intensity), t), rise: 0 });
  const ski = world[skiIndex(BodySide.Right)];
  const com = centreOfMass(world);
  return ski === undefined ? com[1] : com[1] - ((ski[13] ?? 0) + (ski[5] ?? 0) * SKI_BASE + (ski[9] ?? 0) * SKI_MOUNT);
};

export const skiGoal = (drill: string, intensity: Intensity, surface: Surface, t: number): SkiGoal => {
  const style = turnStyle(drill);
  if (style === undefined) throw new Error(`${drill}: no regular turn`);
  const scenario = style.scenarios[intensity];
  const p = pathAt(surface, t);
  const origin: Vec3 = [p.x, supportAt(surface, p.x, p.z), p.z];
  const normal = normalAt(surface, p.x, p.z);
  const f0: Vec3 = [Math.sin(p.heading), 0, Math.cos(p.heading)];
  const k = f0[0] * normal[0] + f0[1] * normal[1] + f0[2] * normal[2];
  const fwd = normalise([f0[0] - k * normal[0], f0[1] - k * normal[1], f0[2] - k * normal[2]]);
  const across = crossN(normal, fwd);
  const edge = physicsEdge(scenario, t);
  const [c, s] = [Math.cos(edge), Math.sin(edge)];
  const up: Vec3 = [c * normal[0] + s * across[0], c * normal[1] + s * across[1], c * normal[2] + s * across[2]];
  const x: Vec3 = [c * across[0] - s * normal[0], c * across[1] - s * normal[1], c * across[2] - s * normal[2]];
  return {
    t,
    origin,
    normal,
    forward: fwd,
    across,
    edge,
    axes: [x, up, fwd],
    insideShare: weightSplit(style, intensity, t).inside,
    comHeight: legacyComHeight(drill, intensity, t),
  };
};

/** Edge of a ski frame toward +x off the snow normal: the bank of its across axis. */
export const edgeOf = (ski: Rigid, normal: Vec3): Scalar => asin(neg(dot3(axisOf(ski, 0), normal)));

const q45 = (q: Dual[]): Dual[] => q.slice(0, COORDINATES.length);
const LEGS = chainOf(['foot.R', 'foot.L']);

export interface TurnProblem {
  readonly drill: string;
  readonly intensity: Intensity;
  readonly cycle: Cycle;
  readonly problem: Problem;
  readonly goals: ReadonlyArray<SkiGoal>;
  readonly surface: Surface;
  readonly prior: PriorAt;
  readonly ski: SkiPoints;
  readonly lower: Float64Array;
  readonly upper: Float64Array;
}

/** Each coordinate's mirror in the next turn: sides swapped; lateral translation, list, yaw, bending and axial rotation negated. */
export const MIRROR: Mirror = {
  perm: NAMES.map((n) => at(mirrorName(n))),
  // pelvis_tx is world x, across the slope (skeleton.ts translates the pelvis in world axes).
  sign: NAMES.map((n) => (n === 'pelvis_tx' ? -1 : n === 'pelvis_tz' ? 1 : parityOf(n) === Parity.Odd ? -1 : 1)),
};

const limitsOf = (ski: SkiPoints): { lo: number[]; hi: number[] } => {
  const lo = COORDINATES.map((c) => JOINT_LIMITS[c.name]?.lower.value ?? -Infinity);
  const hi = COORDINATES.map((c) => (c.name.startsWith('ankle_dorsiflexion') ? ANKLE_DORSIFLEXION_KNEE_FLEXED.value : (JOINT_LIMITS[c.name]?.upper.value ?? Infinity)));
  // TEMPORARY(step 3b): boot capsules replace this floor on the skis' gap.
  return { lo: [...lo, -Infinity, ski.width], hi: [...hi, Infinity, Infinity] };
};

export interface BuildOptions {
  /** Frames per turn. */
  readonly frames?: number;
}

export const buildTurnProblem = (drill: string, intensity: Intensity, options: BuildOptions = {}): TurnProblem => {
  const S = options.frames ?? 96;
  const style = turnStyle(drill);
  if (style === undefined) throw new Error(`${drill}: no regular turn`);
  const examples = examplesFor(drill);
  if (examples === null) throw new Error(`${drill}: no prior`);
  const pri = interpolate(examples, arcLoad(style.scenarios[intensity]));
  const surface = surfaceFor(drill, intensity);
  const ski = skiPoints(surface.kind === SurfaceKind.Moguls ? Terrain.Moguls : Terrain.Groomed);
  const cycle = new Cycle({ frames: 2 * S, coords: N, boundary: Boundary.Mirror, mirror: MIRROR });
  const goals = Array.from({ length: S }, (_, k) => skiGoal(drill, intensity, surface, k / S));
  const { lo, hi } = limitsOf(ski);
  const blocks: Block[] = [];

  goals.forEach((g, k) => {
    const f = g.forward;
    const a = g.across;
    // The lower edge carries the outside ski; at the switch either edge.
    const lowEdge = g.edge >= 0 ? 0 : 1;
    const legs = (q: Dual[]): { out: Rigid; ins: Rigid } => {
      const w = forward(q45(q), g.origin, LEGS);
      return { out: skiFrame(w, Side.Right), ins: skiFrame(w, Side.Left) };
    };
    const rel = (p: V3): V3 => sub3(p, g.origin);
    blocks.push(
      cycle.frameBlock({ name: `outside ski ${k}`, group: 'outside ski', kind: BlockKind.Equality, size: 8 }, [k], ([q = []]) => {
        const { out, ins } = legs(q);
        const rot = [0, 1, 2].map((i) => cross3(g.axes[i as 0 | 1 | 2], axisOf(out, i as 0 | 1 | 2)));
        const r = [0, 1, 2].map((c) => mul(0.5, add(add(rot[0]?.[c] ?? 0, rot[1]?.[c] ?? 0), rot[2]?.[c] ?? 0)));
        const c = transform(out, ski.centre);
        const ci = transform(ins, ski.centre);
        const d = sub3(ci, c);
        return [
          ...r,
          dot3(rel(c), f),
          dot3(rel(c), a),
          gapOver(surface, transform(out, ski.contact[lowEdge])),
          sub(dot3(d, f), q[LEAD] ?? 0),
          sub(dot3(d, a), q[GAP] ?? 0),
        ] as Dual[];
      }),
    );
    blocks.push(
      cycle.frameBlock({ name: `contact ${k}`, group: 'contact', kind: BlockKind.Inequality, size: 2 * ski.points.length + 2 }, [k], ([q = []]) => {
        const { out, ins } = legs(q);
        const diff = sub(edgeOf(ins, g.normal), edgeOf(out, g.normal));
        return [
          ...ski.points.map((p) => gapOver(surface, transform(out, p))),
          ...ski.points.map((p) => gapOver(surface, transform(ins, p))),
          add(EDGE_DIFFERENCE, neg(diff)),
          add(EDGE_DIFFERENCE, diff),
        ] as Dual[];
      }),
    );
    const lowIn = g.edge >= 0 ? 0 : 1;
    blocks.push(
      cycle.frameBlock({ name: `inside ski ${k}`, group: 'inside ski', kind: BlockKind.Goal, size: 2 }, [k], ([q = []]) => {
        const { ins } = legs(q);
        return [
          mul(g.insideShare / INSIDE_GAP_SIGMA, gapOver(surface, transform(ins, ski.contact[lowIn]))),
          mul(1 / PARALLEL_SIGMA, dot3(axisOf(ins, 2), a)),
        ] as Dual[];
      }),
    );
    // TODO(step 3b): replace with the force-line balance; this only keeps the free pelvis well-posed.
    blocks.push(
      cycle.frameBlock({ name: `com height ${k}`, group: 'com height (temporary)', kind: BlockKind.Goal, size: 1 }, [k], ([q = []]) => {
        const w = forward(q45(q), g.origin);
        const com = centreOfMassOf(w);
        const base = transform(skiFrame(w, Side.Right), ski.centre);
        return [mul(1 / COM_SIGMA, sub(dot3(sub3(com, base), g.normal), g.comHeight))] as Dual[];
      }),
    );
    const bounded = NAMES.flatMap((_, i) => (Number.isFinite(lo[i] ?? -Infinity) && Number.isFinite(hi[i] ?? Infinity) && (hi[i] ?? 0) - (lo[i] ?? 0) > 2 * BARRIER && i < LEAD ? [i] : []));
    blocks.push(
      cycle.frameBlock({ name: `limit barrier ${k}`, group: 'limit barrier', kind: BlockKind.Goal, size: bounded.length }, [k], ([q = []]) =>
        bounded.map((i) => {
          const v = q[i];
          if (v === undefined) throw new Error('missing coordinate');
          const dl = (v.v - (lo[i] ?? 0)) / BARRIER;
          const dh = ((hi[i] ?? 0) - v.v) / BARRIER;
          // (1 − d/m)² inside the band, 0 beyond it: C1 at its edge.
          if (dl < 1) return v.sub(lo[i] ?? 0).mul(-1 / BARRIER).add(1).square();
          if (dh < 1) return v.neg().add(hi[i] ?? 0).mul(-1 / BARRIER).add(1).square();
          return v.mul(0);
        }),
      ),
    );
    COORDINATES.forEach((c, i) => {
      const p = priorAt(pri, c.name, g.t);
      if (p === null || c.kind === DofKind.Translation) return;
      blocks.push(prior(`prior ${c.name} ${k}`, [cycle.ref(k, i)], [p.mu], [p.sigma], `prior ${c.name.replace(/\.[RL]$/, '')}`));
    });
  });
  blocks.push(...cycle.smoothness(1 / (SMOOTH_SIGMA * (96 / S) ** 2)));
  const { lower, upper } = cycle.bounds(lo, hi);
  return { drill, intensity, cycle, problem: { size: cycle.size, blocks, lower, upper, structure: cycle.structure }, goals, surface, prior: pri, ski, lower, upper };
};

/** Pelvis translation that puts the outside ski's centre on the goal, the rest of q held. */
const placePelvis = (tp: TurnProblem, k: number, q: number[]): void => {
  const g = tp.goals[k];
  if (g === undefined) return;
  for (const name of ['pelvis_tx', 'pelvis_ty', 'pelvis_tz']) q[at(name)] = 0;
  const w = forward(q.slice(0, LEAD), g.origin, LEGS);
  const c = transform(skiFrame(w, Side.Right), tp.ski.centre).map(value);
  const ci = transform(skiFrame(w, Side.Left), tp.ski.centre).map(value);
  // Lift a little so the start is clear of the snow.
  ['pelvis_tx', 'pelvis_ty', 'pelvis_tz'].forEach((name, j) => (q[at(name)] = (g.origin[j] ?? 0) - (c[j] ?? 0) + (j === 1 ? 0.05 : 0)));
  const d = [0, 1, 2].map((j) => (ci[j] ?? 0) - (c[j] ?? 0));
  q[LEAD] = (d[0] ?? 0) * g.forward[0] + (d[1] ?? 0) * g.forward[1] + (d[2] ?? 0) * g.forward[2];
  q[GAP] = (d[0] ?? 0) * g.across[0] + (d[1] ?? 0) * g.across[1] + (d[2] ?? 0) * g.across[2];
};

export const SeedKind = { Prior: 'prior', Rest: 'rest', Jitter: 'jitter' } as const;
export type SeedKind = (typeof SeedKind)[keyof typeof SeedKind];

/** A start: prior means, the template's rest pose, or prior means jittered by a fixed ±½σ pattern. */
export const seedFor = (tp: TurnProblem, kind: SeedKind): Float64Array => {
  const x = new Float64Array(tp.cycle.size);
  for (let k = 0; k < tp.cycle.solved; k++) {
    const g = tp.goals[k];
    const q = NAMES.map((name, i) => {
      const rest = REST_POSE[name] ?? 0;
      const p = i < LEAD && g !== undefined ? priorAt(tp.prior, name, g.t) : null;
      if (kind === SeedKind.Rest || p === null) return rest;
      const jitter = kind === SeedKind.Jitter ? 0.5 * p.sigma * Math.sin(7.3 * i + 1.1) : 0;
      return p.mu + jitter;
    });
    q.forEach((v, i) => (q[i] = Math.min(tp.upper[k * N + i] ?? Infinity, Math.max(tp.lower[k * N + i] ?? -Infinity, v))));
    placePelvis(tp, k, q);
    q.forEach((v, i) => (x[k * N + i] = Math.min(tp.upper[k * N + i] ?? Infinity, Math.max(tp.lower[k * N + i] ?? -Infinity, v))));
  }
  return x;
};

export interface TurnReport {
  /** Most |gap| of the outside ski's lower contact edge, metres. */
  readonly outsideContact: number;
  /** Least base-point height over the snow, both skis, metres. */
  readonly lowestBase: number;
  /** Most |outside edge − physics edge|, radians. */
  readonly edgeError: number;
  /** Most |inside − outside edge|, radians. */
  readonly edgeDifference: number;
  /** Most distance past a joint bound, radians or metres. */
  readonly limitExcess: number;
  /** Share of prior terms within 2σ. */
  readonly priorWithin2Sigma: number;
  /** Worst prior terms, in σ. */
  readonly priorWorst: ReadonlyArray<{ readonly name: string; readonly t: number; readonly z: number }>;
  readonly lead: readonly [number, number];
  readonly gap: readonly [number, number];
  /** Most |CoM height − the current solver's|, metres. */
  readonly comError: number;
}

export const reportOf = (tp: TurnProblem, x: ArrayLike<number>): TurnReport => {
  const frames = tp.cycle.unpack(x);
  let outsideContact = 0;
  let lowestBase = Infinity;
  let edgeError = 0;
  let edgeDifference = 0;
  let limitExcess = 0;
  let comError = 0;
  let inside = 0;
  let total = 0;
  const worst: { name: string; t: number; z: number }[] = [];
  const leads: number[] = [];
  const gaps: number[] = [];
  tp.goals.forEach((g, k) => {
    const q = Array.from(frames[k] ?? []);
    const w = forward(q.slice(0, LEAD), g.origin);
    const out = skiFrame(w, Side.Right);
    const ins = skiFrame(w, Side.Left);
    const low = g.edge >= 0 ? 0 : 1;
    outsideContact = Math.max(outsideContact, Math.abs(value(gapOver(tp.surface, transform(out, tp.ski.contact[low])))));
    for (const m of [out, ins]) for (const p of tp.ski.points) lowestBase = Math.min(lowestBase, value(gapOver(tp.surface, transform(m, p))));
    const eo = value(edgeOf(out, g.normal));
    edgeError = Math.max(edgeError, Math.abs(eo - g.edge));
    edgeDifference = Math.max(edgeDifference, Math.abs(value(edgeOf(ins, g.normal)) - eo));
    q.forEach((v, i) => (limitExcess = Math.max(limitExcess, (tp.lower[k * N + i] ?? -Infinity) - v, v - (tp.upper[k * N + i] ?? Infinity))));
    const com = centreOfMassOf(w).map(value);
    const base = transform(out, tp.ski.centre).map(value);
    const h = [0, 1, 2].reduce((s, j) => s + ((com[j] ?? 0) - (base[j] ?? 0)) * (g.normal[j] ?? 0), 0);
    comError = Math.max(comError, Math.abs(h - g.comHeight));
    leads.push(q[LEAD] ?? 0);
    gaps.push(q[GAP] ?? 0);
    COORDINATES.forEach((c, i) => {
      const p = priorAt(tp.prior, c.name, g.t);
      if (p === null || c.kind === DofKind.Translation) return;
      const z = ((q[i] ?? 0) - p.mu) / p.sigma;
      total++;
      if (Math.abs(z) <= 2) inside++;
      worst.push({ name: c.name, t: g.t, z });
    });
  });
  worst.sort((a, b) => Math.abs(b.z) - Math.abs(a.z));
  return {
    outsideContact,
    lowestBase,
    edgeError,
    edgeDifference,
    limitExcess,
    priorWithin2Sigma: total === 0 ? 1 : inside / total,
    priorWorst: worst.slice(0, 5),
    lead: [Math.min(...leads), Math.max(...leads)],
    gap: [Math.min(...gaps), Math.max(...gaps)],
    comError,
  };
};

export interface TurnMotion {
  readonly problem: TurnProblem;
  readonly result: SolveResult;
  /** q per frame over both turns, NAMES order. */
  readonly q: ReadonlyArray<Float64Array>;
  readonly report: TurnReport;
  readonly diagnosis: Diagnosis;
  readonly milliseconds: number;
}

export const solveTurn = (tp: TurnProblem, x0: ArrayLike<number> = seedFor(tp, SeedKind.Prior), options: SolveOptions = {}): TurnMotion => {
  const start = performance.now();
  const result = solve(tp.problem, x0, { maxIterations: 300, tolCost: 1e-9, tolConstraint: 1e-7, ...options });
  const milliseconds = performance.now() - start;
  return { problem: tp, result, q: tp.cycle.unpack(result.x), report: reportOf(tp, result.x), diagnosis: diagnose(tp.problem, result), milliseconds };
};

const f3 = (x: number, d = 3): string => x.toFixed(d);

export const formatTurn = (m: TurnMotion): string => {
  const r = m.report;
  const p = m.problem;
  return [
    `${p.drill} ${p.intensity}: ${p.cycle.size} variables, ${p.problem.blocks.length} blocks; ${m.result.iterations} iterations, ${m.result.outer} outer, ${f3(m.milliseconds / 1000, 1)} s; converged ${m.result.converged}, feasible ${m.result.feasible}, violation ${m.result.violation.toExponential(1)}`,
    `outside contact ${f3(r.outsideContact * 1000)} mm, lowest base ${f3(r.lowestBase * 1000)} mm, edge error ${f3(r.edgeError / DEG)}°, inside-outside edge ${f3(r.edgeDifference / DEG, 1)}°, limit excess ${r.limitExcess.toExponential(1)}`,
    `prior within 2σ ${f3(r.priorWithin2Sigma * 100, 1)} %, worst ${r.priorWorst.map((w) => `${w.name}@${f3(w.t, 2)} ${f3(w.z, 1)}σ`).join(', ')}`,
    `inside lead ${f3(r.lead[0])}..${f3(r.lead[1])} m, gap ${f3(r.gap[0])}..${f3(r.gap[1])} m, CoM height off the current solver's ≤ ${f3(r.comError * 100, 1)} cm`,
    formatDiagnosis(m.diagnosis),
  ].join('\n');
};
