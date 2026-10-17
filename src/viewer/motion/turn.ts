import LIT from '../../../scripts/prior/lit-curves.json';
import type { Intensity } from '../../content/schema';
import { arcLoad, turnForcesAt } from '../../physics/turn';
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
import { EQUIPMENT, shellInFoot } from '../equipment';
import { bootFitFrom } from '../gear-fit';
import { ANKLE_DORSIFLEXION_KNEE_FLEXED, JOINT_LIMITS } from '../joint-limits';
import { compose as composeM, transformPoint, translation } from '../mat4';
import type { Vec3 } from '../mat4';
import { brakingTiltAt } from '../pose-solver';
import { weightSplit } from '../poses/regular-turn';
import { examplesFor, interpolate, parityOf, Parity, priorAt, mirrorName } from '../prior/prior';
import type { PriorAt } from '../prior/prior';
import { COORDINATES, DofKind, REST_POSE, restWorld, rigidInverse, SKELETON_DATA, Side } from '../skeleton';
import { REFERENCE_SKIER, SKI_MOUNT, skiEnds, skiFor, Terrain } from '../skier';
import { normalAt, pathAt, supportAt, surfaceFor, SurfaceKind } from '../surface';
import type { Surface } from '../surface';
import { turnStyle } from '../turn-heading';
import { add, asin, axisOf, BINDING, chainOf, cross3, dot3, forward, mul, neg, skiFrame, sub, sub3, transform, value } from './fk';
import type { Rigid, Scalar, V3 } from './fk';

/**
 * Step 3a of the motion pipeline: one drill × intensity as a whole-cycle weighted least-squares problem over
 * the ISB coordinates. Turn 0 is a left turn (right ski outside), slope frame as surface.ts (x across toward
 * the inside, y up from the slope, z down the fall line); turn 1 is its mirror. Each frame's pelvis translation
 * is relative to the path point, so the variables stay small.
 */

const DEG = Math.PI / 180;

/**
 * Per-frame scalars after the skeleton's coordinates: the inside ski's lead along and gap across the outside's track,
 * and the pressure centre's place along both skis in the binding frame.
 */
export const EXTRA_NAMES = ['inside_lead', 'inside_gap', 'pressure_along'] as const;
export const NAMES: ReadonlyArray<string> = [...COORDINATES.map((c) => c.name), ...EXTRA_NAMES];
const N = NAMES.length;
const LEAD = COORDINATES.length;
const GAP = LEAD + 1;
const ALONG = LEAD + 2;
const at = (name: string): number => NAMES.indexOf(name);

/** Inside ski's yaw off the outside's, one σ of its soft parallel term; inferred. */
const PARALLEL_SIGMA = 5 * DEG;
/** Inside ski's base gap per unit of its load share, one σ, metres; inferred. */
const INSIDE_GAP_SIGMA = 0.01;
/** Second difference per frame at 96 frames a turn, one σ; inferred. */
const SMOOTH_SIGMA = 0.1 * DEG;
/** Barrier width inside each joint bound; inferred. */
const BARRIER = 3 * DEG;
/** CoM's fore-aft over the outside ankle along the ski, one σ, metres; inferred. */
const FORE_AFT_SIGMA = 0.05;
/** Stance width square to the body, one σ, metres; inferred. */
const STANCE_SIGMA = 0.03;
/** Moguls: boot centre to centre in boot widths (refskier notes: Horishima, measured 1 frame). */
const MOGUL_STANCE_BOOTS = 1.1;
/** Drills whose content lifts the inside ski (primitive inside-leg-lift): its contact stays soft. */
const LIFTS_INSIDE: ReadonlySet<string> = new Set(['stork-turns', 'outside-ski-turns']);

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

/**
 * de-leva-1996 Table 4 male CM as a share of the way from the first joint to the second. The trunk's
 * landmarks (SUPR, XYPH, OMPH; head VERT–CERV) stand on the nearest spine joints: inferred.
 */
const CM_SHARE: Readonly<Record<string, readonly [string, string, number]>> = {
  pelvis: ['l5s1', 'pelvis', 0.6115],
  lumbar: ['t12l1', 'l5s1', 0.4502],
  thorax: ['c7t1', 't12l1', 0.2999],
  head: ['crown', 'c7t1', 0.5002],
  femur: ['hip', 'knee', 0.4095],
  tibia: ['knee', 'ankle', 0.4395],
  humerus: ['shoulder', 'elbow', 0.5772],
  forearm: ['elbow', 'wrist', 0.4574],
  hand: ['wrist', 'knuckle', 0.79],
};
/** Foot: HEEL–TTIP 44.15 % (de-leva-1996 Table 4), halfway down from the ankle to the sole (inferred). */
const FOOT_CM = 0.4415;

const restCentre = (seg: string): Vec3 => {
  const j = SKELETON_DATA.joints;
  const [base = '', s = ''] = seg.split('.');
  if (base === 'foot') {
    const fit = SKELETON_DATA.gear_fit[s as Side];
    return [fit.ankle[0], (fit.ankle[1] + fit.sole) / 2, fit.heel + FOOT_CM * (fit.toe - fit.heel)];
  }
  const share = CM_SHARE[base];
  if (share === undefined) throw new Error(`no CM for ${seg}`);
  const key = (k: string): string => (s === '' || k in j ? k : `${k}.${s}`);
  const a = j[key(share[0])];
  const b = j[key(share[1])];
  if (a === undefined || b === undefined) throw new Error(`no joints for ${seg}`);
  return [0, 1, 2].map((i) => (a[i] ?? 0) + share[2] * ((b[i] ?? 0) - (a[i] ?? 0))) as unknown as Vec3;
};
const LOCAL_CENTRE: Readonly<Record<string, Vec3>> = Object.fromEntries(
  Object.entries(MASS).flatMap(([seg, m]) => {
    if (m === 0) return [];
    const r = SKELETON_DATA.segments[seg];
    if (r === undefined) throw new Error(`no segment ${seg}`);
    const c = restCentre(seg);
    const d = [c[0] - r.origin[0], c[1] - r.origin[1], c[2] - r.origin[2]] as const;
    const proj = (a: Vec3): number => a[0] * d[0] + a[1] * d[1] + a[2] * d[2];
    return [[seg, [proj(r.x), proj(r.y), proj(r.z)] as Vec3]];
  }),
);

/** Hip joint over the boot sole standing at rest: the leg length CoM heights are reported in. */
/** Hip joint centres apart: the groomed stance's mean (inferred; no groomed stance width read). */
const HIP_WIDTH = Math.abs((SKELETON_DATA.joints['hip.L']?.[0] ?? 0) - (SKELETON_DATA.joints['hip.R']?.[0] ?? 0));
/** The outside ankle's place along the binding frame's z. */
const ANKLE_ALONG = -value(dot3(axisOf(BINDING[Side.Right], 2), BINDING[Side.Right].p));

export const LEG_LENGTH = (SKELETON_DATA.joints['hip.R']?.[1] ?? 0) - SKELETON_DATA.gear_fit[Side.Right].sole;

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
  /** Tail half and tip half as capsules along the base, each as wide as its end (inferred, conservative). */
  readonly capsules: readonly [BootCapsule, BootCapsule];
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
    capsules: [
      { a: [0, y, tail + ski.tail / 2], b: [0, y, SKI_MOUNT], radius: ski.tail / 2 },
      { a: [0, y, SKI_MOUNT], b: [0, y, tip - ski.tip / 2], radius: ski.tip / 2 },
    ],
  };
};

/** A boot as two capsules in its foot segment's frame: the shell's sole run heel to toe, and the cuff up the shin. */
export interface BootCapsule {
  readonly a: Vec3;
  readonly b: Vec3;
  readonly radius: number;
}

/** gear-fit.ts's shell (the bake's fit, as the binding) as capsules; the cuff's lateral semi-axis is its radius. */
export const bootCapsules = (s: Side): readonly [BootCapsule, BootCapsule] => {
  const raw = SKELETON_DATA.gear_fit[s];
  const fit = bootFitFrom(raw);
  const m = composeM(rigidInverse(restWorld(`foot.${s}`)), translation(raw.ankle), shellInFoot(fit, EQUIPMENT));
  const r = fit.halfWidth;
  const y = fit.sole + r;
  return [
    { a: transformPoint(m, [fit.centreX, y, fit.heel + r]), b: transformPoint(m, [fit.centreX, y, fit.toe - r]), radius: r },
    { a: transformPoint(m, [fit.cuffX, 0, fit.cuffZ]), b: transformPoint(m, [fit.cuffX, fit.cuffTop, fit.cuffZ]), radius: fit.cuffRx },
  ];
};
const BOOTS = { [Side.Right]: bootCapsules(Side.Right), [Side.Left]: bootCapsules(Side.Left) } as const;
/** Boot width across its sole, for stances measured in boot widths. */
const BOOT_WIDTH = 2 * bootFitFrom(SKELETON_DATA.gear_fit[Side.Right]).halfWidth;

const dotN = (u: ReadonlyArray<number>, v: ReadonlyArray<number>): number => (u[0] ?? 0) * (v[0] ?? 0) + (u[1] ?? 0) * (v[1] ?? 0) + (u[2] ?? 0) * (v[2] ?? 0);
const unit = (x: number): number => Math.min(1, Math.max(0, x));
const lerp = (u: V3, v: V3, k: number): V3 => [add(u[0], mul(k, sub(v[0], u[0]))), add(u[1], mul(k, sub(v[1], u[1]))), add(u[2], mul(k, sub(v[2], u[2])))];

/** Closest parameters on segments p0p1 and q0q1 (Ericson, Real-Time Collision Detection 5.1.9). */
const closest = (p0: Vec3, p1: Vec3, q0: Vec3, q1: Vec3): readonly [number, number] => {
  const d1 = [p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]] as const;
  const d2 = [q1[0] - q0[0], q1[1] - q0[1], q1[2] - q0[2]] as const;
  const r = [p0[0] - q0[0], p0[1] - q0[1], p0[2] - q0[2]] as const;
  const a = dotN(d1, d1);
  const e = dotN(d2, d2);
  const f = dotN(d2, r);
  const c = dotN(d1, r);
  const b = dotN(d1, d2);
  const den = a * e - b * b;
  let sP = den > 1e-12 ? unit((b * f - c * e) / den) : 0;
  let tQ = (b * sP + f) / e;
  if (tQ < 0) [tQ, sP] = [0, unit(-c / a)];
  else if (tQ > 1) [tQ, sP] = [1, unit((b - c) / a)];
  return [sP, tQ];
};

/** Clearance between two capsules in world frames: distance between their axes less both radii. */
const clearance = (fa: Rigid, ca: BootCapsule, fb: Rigid, cb: BootCapsule): Scalar => {
  const [a0, a1, b0, b1] = [transform(fa, ca.a), transform(fa, ca.b), transform(fb, cb.a), transform(fb, cb.b)];
  const [sP, tQ] = closest(a0.map(value) as unknown as Vec3, a1.map(value) as unknown as Vec3, b0.map(value) as unknown as Vec3, b1.map(value) as unknown as Vec3);
  const d = sub3(lerp(a0, a1, sP), lerp(b0, b1, tQ));
  const l2 = dot3(d, d);
  const l = typeof l2 === 'number' ? Math.sqrt(l2) : l2.sqrt();
  return sub(l, ca.radius + cb.radius);
};

/** Every ski capsule pair's clearance, right against left. */
const skiClearances = (world: Readonly<Record<string, Rigid>>, ski: SkiPoints): Scalar[] => {
  const r = skiFrame(world, Side.Right);
  const l = skiFrame(world, Side.Left);
  return ski.capsules.flatMap((cr) => ski.capsules.map((cl) => clearance(r, cr, l, cl)));
};

/** Every boot capsule pair's clearance, right against left. */
const bootClearances = (world: Readonly<Record<string, Rigid>>): Scalar[] => {
  const fr = world['foot.R'];
  const fl = world['foot.L'];
  if (fr === undefined || fl === undefined) throw new Error('feet not solved');
  return BOOTS[Side.Right].flatMap((cr) => BOOTS[Side.Left].map((cl) => clearance(fr, cr, fl, cl)));
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
  /** The snow's required resultant, unit: −(g + a_c + braking) per forcesAt and brakingTilt. */
  readonly resultant: Vec3;
  /** CoM ahead of the outside ankle along the ski, metres: the prior's mean. */
  readonly foreAft: number;
  /** Ski centres apart square to the body, metres: the prior's mean. */
  readonly stance: number;
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

/** sporri-2016 Fig 4 mean of 6 European Cup GS racers, CoM vs outside ankle along the ski, + forward, cm. */
const SPORRI_FORE_AFT = LIT.gs_carving.fore_aft_cm;

/** Fore-aft mean at turn time `t`: Spörri's GS curve for carving; elsewhere mid-foot (inferred). */
const foreAftAt = (drill: string, t: number): number => {
  if (drill !== 'regular-carving') return -ANKLE_ALONG;
  const ts = SPORRI_FORE_AFT.t;
  const ys = SPORRI_FORE_AFT.mean;
  const u = ((t % 1) + 1) % 1;
  const i = Math.min(ts.length - 2, Math.max(0, ts.findIndex((x) => x > u) - 1));
  const [t0 = 0, t1 = 1, y0 = 0, y1 = 0] = [ts[i], ts[i + 1], ys[i], ys[i + 1]];
  return (y0 + ((y1 - y0) * (u - t0)) / (t1 - t0)) / 100;
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
  const braking = brakingTiltAt(scenario, surface, t);
  const r = [0, 1, 2].map((i) => (normal[i] ?? 0) + Math.tan(edge) * (across[i] ?? 0) - Math.tan(braking) * (fwd[i] ?? 0)) as unknown as Vec3;
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
    resultant: normalise(r),
    foreAft: foreAftAt(drill, t),
    stance: surface.kind === SurfaceKind.Moguls ? MOGUL_STANCE_BOOTS * BOOT_WIDTH : HIP_WIDTH,
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
  sign: NAMES.map((n) => (parityOf(n) === Parity.Odd ? -1 : 1)),
};

const limitsOf = (): { lo: number[]; hi: number[] } => {
  const lo = COORDINATES.map((c) => JOINT_LIMITS[c.name]?.lower.value ?? -Infinity);
  const hi = COORDINATES.map((c) => (c.name.startsWith('ankle_dorsiflexion') ? ANKLE_DORSIFLEXION_KNEE_FLEXED.value : (JOINT_LIMITS[c.name]?.upper.value ?? Infinity)));
  // The pressure centre stays under the boot sole.
  const fit = bootFitFrom(SKELETON_DATA.gear_fit[Side.Right]);
  const half = (fit.toe - fit.heel) / 2;
  return { lo: [...lo, -Infinity, -Infinity, -half], hi: [...hi, Infinity, Infinity, half] };
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
  const { lo, hi } = limitsOf();
  const lifts = LIFTS_INSIDE.has(drill);
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
      cycle.frameBlock({ name: `contact ${k}`, group: 'contact', kind: BlockKind.Inequality, size: 2 * ski.points.length }, [k], ([q = []]) => {
        const { out, ins } = legs(q);
        return [...ski.points.map((p) => gapOver(surface, transform(out, p))), ...ski.points.map((p) => gapOver(surface, transform(ins, p)))] as Dual[];
      }),
      cycle.frameBlock({ name: `boots ${k}`, group: 'boot clearance', kind: BlockKind.Inequality, size: 4 }, [k], ([q = []]) => bootClearances(forward(q45(q), g.origin, LEGS)) as Dual[]),
      cycle.frameBlock({ name: `skis ${k}`, group: 'ski clearance', kind: BlockKind.Inequality, size: 4 }, [k], ([q = []]) => skiClearances(forward(q45(q), g.origin, LEGS), ski) as Dual[]),
    );
    // Two-footed: the inside ski's tip and tail on the snow on its lower edge, as the outside's.
    const lowIn = lowEdge;
    const insideEnds = [ski.points[lowIn], ski.points[4 + lowIn]].map((p) => p ?? ski.centre);
    if (!lifts)
      blocks.push(
        cycle.frameBlock({ name: `inside contact ${k}`, group: 'inside contact', kind: BlockKind.Equality, size: 2 }, [k], ([q = []]) => {
          const { ins } = legs(q);
          return insideEnds.map((p) => gapOver(surface, transform(ins, p))) as Dual[];
        }),
      );
    blocks.push(
      cycle.frameBlock({ name: `inside ski ${k}`, group: 'inside ski', kind: BlockKind.Goal, size: lifts ? 2 : 1 }, [k], ([q = []]) => {
        const { ins } = legs(q);
        const yaw = mul(1 / PARALLEL_SIGMA, dot3(axisOf(ins, 2), a));
        return (lifts ? [mul(g.insideShare / INSIDE_GAP_SIGMA, gapOver(surface, transform(ins, ski.contact[lowIn]))), yaw] : [yaw]) as Dual[];
      }),
    );
    const R = g.resultant;
    // Two axes square to the resultant, for the balance's two rows.
    const e1 = normalise(crossN(R, g.forward));
    const e2 = crossN(R, e1);
    const pressure = (q: Dual[], w: Readonly<Record<string, Rigid>>): V3 => {
      const along = q[ALONG] ?? 0;
      const po = transform(skiFrame(w, Side.Right), [ski.points[2 + lowEdge]?.[0] ?? 0, ski.centre[1], along]);
      const pi = transform(skiFrame(w, Side.Left), [ski.points[2 + lowIn]?.[0] ?? 0, ski.centre[1], along]);
      const s = g.insideShare;
      return [0, 1, 2].map((j) => add(mul(1 - s, po[j as 0 | 1 | 2]), mul(s, pi[j as 0 | 1 | 2]))) as unknown as V3;
    };
    blocks.push(
      cycle.frameBlock({ name: `balance ${k}`, group: 'balance', kind: BlockKind.Equality, size: 2 }, [k], ([q = []]) => {
        const w = forward(q45(q), g.origin);
        const d = sub3(centreOfMassOf(w), pressure(q, w));
        return [dot3(d, e1), dot3(d, e2)] as Dual[];
      }),
      cycle.frameBlock({ name: `fore-aft ${k}`, group: 'fore-aft', kind: BlockKind.Goal, size: 1 }, [k], ([q = []]) => {
        const w = forward(q45(q), g.origin);
        const foot = w['foot.R'];
        if (foot === undefined) throw new Error('foot.R not solved');
        const ahead = dot3(sub3(centreOfMassOf(w), foot.p), axisOf(skiFrame(w, Side.Right), 2));
        return [mul(1 / FORE_AFT_SIGMA, sub(ahead, g.foreAft))] as Dual[];
      }),
      cycle.frameBlock({ name: `stance ${k}`, group: 'stance width', kind: BlockKind.Goal, size: 1 }, [k], ([q = []]) => [
        mul(1 / STANCE_SIGMA, sub(mul(Math.cos(g.edge), q[GAP] ?? 0), g.stance)),
      ] as Dual[]),
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

type Range = readonly [number, number];

export interface TurnReport {
  /** Most |gap| of the outside ski's lower contact edge, metres. */
  readonly outsideContact: number;
  /** Most |gap| of the inside ski's lower edge at tip and tail, metres. */
  readonly insideContact: number;
  /** Least base-point height over the snow, both skis, metres. */
  readonly lowestBase: number;
  /** Most |outside edge − physics edge|, radians. */
  readonly edgeError: number;
  /** Inside edge less the outside's, radians. */
  readonly edgeDifference: Range;
  /** Most distance past a joint bound, radians or metres. */
  readonly limitExcess: number;
  /** Most angle between pressure centre → CoM and the required resultant, radians. */
  readonly balance: number;
  /** Least boot and ski capsule clearance, metres. */
  readonly bootClearance: number;
  readonly skiClearance: number;
  /** Pressure centre to CoM along the resultant, in LEG_LENGTH. */
  readonly comHeight: Range;
  /** CoM ahead of the outside ankle along the ski, metres. */
  readonly foreAft: Range;
  readonly pressureAlong: Range;
  /** Ski centres apart square to the body, metres. */
  readonly stance: Range;
  /** Outside knee flexion less the inside's, radians. */
  readonly kneeDifference: Range;
  readonly pelvisList: Range;
  /** Share of prior terms within 2σ. */
  readonly priorWithin2Sigma: number;
  /** Worst prior terms, in σ. */
  readonly priorWorst: ReadonlyArray<{ readonly name: string; readonly t: number; readonly z: number }>;
  readonly lead: Range;
  readonly gap: Range;
}

const rangeOf = (xs: ReadonlyArray<number>): Range => [Math.min(...xs), Math.max(...xs)];

export const reportOf = (tp: TurnProblem, x: ArrayLike<number>): TurnReport => {
  const frames = tp.cycle.unpack(x);
  let outsideContact = 0;
  let insideContact = 0;
  let lowestBase = Infinity;
  let edgeError = 0;
  let limitExcess = 0;
  let balance = 0;
  let bootClearance = Infinity;
  let skiClearance = Infinity;
  let inside = 0;
  let total = 0;
  const worst: { name: string; t: number; z: number }[] = [];
  const series: Record<'lead' | 'gap' | 'edge' | 'com' | 'foreAft' | 'along' | 'stance' | 'knee' | 'list', number[]> = {
    lead: [],
    gap: [],
    edge: [],
    com: [],
    foreAft: [],
    along: [],
    stance: [],
    knee: [],
    list: [],
  };
  tp.goals.forEach((g, k) => {
    const q = Array.from(frames[k] ?? []);
    const w = forward(q.slice(0, LEAD), g.origin);
    const out = skiFrame(w, Side.Right);
    const ins = skiFrame(w, Side.Left);
    const low = g.edge >= 0 ? 0 : 1;
    outsideContact = Math.max(outsideContact, Math.abs(value(gapOver(tp.surface, transform(out, tp.ski.contact[low])))));
    for (const p of [tp.ski.points[low], tp.ski.points[4 + low]]) if (p !== undefined) insideContact = Math.max(insideContact, Math.abs(value(gapOver(tp.surface, transform(ins, p)))));
    for (const m of [out, ins]) for (const p of tp.ski.points) lowestBase = Math.min(lowestBase, value(gapOver(tp.surface, transform(m, p))));
    const eo = value(edgeOf(out, g.normal));
    edgeError = Math.max(edgeError, Math.abs(eo - g.edge));
    series.edge.push(value(edgeOf(ins, g.normal)) - eo);
    q.forEach((v, i) => (limitExcess = Math.max(limitExcess, (tp.lower[k * N + i] ?? -Infinity) - v, v - (tp.upper[k * N + i] ?? Infinity))));
    for (const c of bootClearances(w)) bootClearance = Math.min(bootClearance, value(c));
    for (const c of skiClearances(w, tp.ski)) skiClearance = Math.min(skiClearance, value(c));
    const com = centreOfMassOf(w).map(value);
    const along = q[ALONG] ?? 0;
    const po = transform(out, [tp.ski.points[2 + low]?.[0] ?? 0, tp.ski.centre[1], along]).map(value);
    const pi = transform(ins, [tp.ski.points[2 + low]?.[0] ?? 0, tp.ski.centre[1], along]).map(value);
    const d = [0, 1, 2].map((j) => (com[j] ?? 0) - (1 - g.insideShare) * (po[j] ?? 0) - g.insideShare * (pi[j] ?? 0));
    const h = dotN(d, g.resultant);
    balance = Math.max(balance, Math.acos(Math.min(1, h / Math.hypot(...d))));
    series.com.push(h / LEG_LENGTH);
    const foot = w['foot.R'];
    series.foreAft.push(foot === undefined ? 0 : dotN([0, 1, 2].map((j) => (com[j] ?? 0) - value(foot.p[j as 0 | 1 | 2])), axisOf(out, 2).map(value)));
    series.along.push(along);
    series.stance.push(Math.cos(g.edge) * (q[GAP] ?? 0));
    series.knee.push((q[at('knee_flexion.R')] ?? 0) - (q[at('knee_flexion.L')] ?? 0));
    series.list.push(q[at('pelvis_list')] ?? 0);
    series.lead.push(q[LEAD] ?? 0);
    series.gap.push(q[GAP] ?? 0);
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
    insideContact,
    lowestBase,
    edgeError,
    edgeDifference: rangeOf(series.edge),
    limitExcess,
    balance,
    bootClearance,
    skiClearance,
    comHeight: rangeOf(series.com),
    foreAft: rangeOf(series.foreAft),
    pressureAlong: rangeOf(series.along),
    stance: rangeOf(series.stance),
    kneeDifference: rangeOf(series.knee),
    pelvisList: rangeOf(series.list),
    priorWithin2Sigma: total === 0 ? 1 : inside / total,
    priorWorst: worst.slice(0, 5),
    lead: rangeOf(series.lead),
    gap: rangeOf(series.gap),
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
const deg = (r: Range): string => `${f3(r[0] / DEG, 1)}..${f3(r[1] / DEG, 1)}`;
const cm = (r: Range): string => `${f3(r[0] * 100, 1)}..${f3(r[1] * 100, 1)}`;
/** Reference boot sole length, metres (refskier notes: Horishima). */
const BSL = 0.295;

export const formatTurn = (m: TurnMotion): string => {
  const r = m.report;
  const p = m.problem;
  return [
    `${p.drill} ${p.intensity}: ${p.cycle.size} variables, ${p.problem.blocks.length} blocks; ${m.result.iterations} iterations, ${m.result.outer} outer, ${f3(m.milliseconds / 1000, 1)} s; converged ${m.result.converged}, feasible ${m.result.feasible}, violation ${m.result.violation.toExponential(1)}`,
    `outside contact ${f3(r.outsideContact * 1000)} mm, lowest base ${f3(r.lowestBase * 1000)} mm, edge error ${f3(r.edgeError / DEG)}°, limit excess ${r.limitExcess.toExponential(1)}`,
    `prior within 2σ ${f3(r.priorWithin2Sigma * 100, 1)} %, worst ${r.priorWorst.map((w) => `${w.name}@${f3(w.t, 2)} ${f3(w.z, 1)}σ`).join(', ')}`,
    `inside contact ${f3(r.insideContact * 1000)} mm, balance ${f3(r.balance / DEG, 2)}°, boot clearance ${f3(r.bootClearance * 1000, 1)} mm, ski clearance ${f3(r.skiClearance * 1000, 1)} mm, inside−outside edge ${deg(r.edgeDifference)}°`,
    `CoM height ${f3(r.comHeight[0])}..${f3(r.comHeight[1])} legs, fore-aft ${cm(r.foreAft)} cm, pressure along ${cm(r.pressureAlong)} cm, stance ${cm(r.stance)} cm`,
    `inside lead ${f3(r.lead[0] / BSL, 2)}..${f3(r.lead[1] / BSL, 2)} BSL, gap ${cm(r.gap)} cm, knee O−I ${deg(r.kneeDifference)}°, pelvis list ${deg(r.pelvisList)}°`,
    formatDiagnosis(m.diagnosis),
  ].join('\n');
};
