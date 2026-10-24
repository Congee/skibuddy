import LIT from '../../../scripts/prior/lit-curves.json';
import type { Intensity } from '../../content/schema';
import { carvedRadius, edgeGoalAt, GLIDING_FRICTION, SNOW_COMPLIANCE, Snow } from '../../physics/edge';
import { taskFor } from '../../physics/task';
import type { ForeAft, TurnEvents, TurnKind, TurnTask } from '../../physics/task';
import { edgeContactOf, edgeCurvatureOf, PRESSURE_EDGE_DEG } from '../../physics/moguls';
import { bendRadiusOf, sagittaOf } from '../../physics/ski-bend';
import { arcLoad, counterBandAt, G, HIP_WIDTH_M, MOGUL_STANCE_M, turnForcesAt, turnProfile } from '../../physics/turn';
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
import { BodySide, SEGMENTS, segmentIndex } from '../figure';
import { CUFF, shinPitch } from './cuff';
import { bootFitFrom } from '../gear-fit';
import type { BootFit } from '../gear-fit';
import { ANKLE_DORSIFLEXION_KNEE_FLEXED, JOINT_LIMITS, KNEE_INTERNAL_SHARE, kneeRotationArc } from '../joint-limits';
import { compose as composeM, transformPoint, translation } from '../mat4';
import type { Vec3 } from '../mat4';
import { brakingTiltAt } from '../pose-solver';
import { kindOfDrill, weightSplit } from '../poses/regular-turn';
import { anchorsFor, Derived, derivedAt, examplesFor, fallLineLean, interpolate, parityOf, Parity, phaseMapOf, phaseOn, priorAt, mirrorName } from '../prior/prior';
import type { PhaseMap, PriorAt } from '../prior/prior';
import { COORDINATES, DofKind, REST_POSE, restWorld, rigidInverse, SEGMENT_NAMES, SKELETON_DATA, Side } from '../skeleton';
import { REFERENCE_SKIER, SKI_MOUNT, skiEnds, skiFor, Terrain } from '../skier';
import type { Ski } from '../skier';
import { normalAt, pathAt, skisAt, supportAt, surfaceFor, SurfaceKind } from '../surface';
import type { Surface } from '../surface';
import { turnStyle } from '../turn-heading';
import { distalOf, jointMoment, MAX_TORQUE, normalisedEffort } from './effort';
import { add, asin, atan2, axisOf, BINDING, chainOf, cross3, dofAxes, dot3, forward, mul, neg, skiFrame, sub, sub3, transform, value } from './fk';
import type { Rigid, Scalar, V3 } from './fk';

export { skiFrame };

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
/** Inside edge off the outside's, either way: parallel shins, the boot locks inversion; inferred. */
export const INSIDE_EDGE_PLAY = 5 * DEG;
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
/** CoM height over the ski bases against the physics' clearance, one σ, metres: FORE_AFT_SIGMA's CoM-over-the-feet tolerance; inferred. */
const MASS_HEIGHT_SIGMA = FORE_AFT_SIGMA;
/** Drills whose content lifts the inside ski (primitive inside-leg-lift): its contact stays soft. */
const LIFTS_INSIDE: ReadonlySet<string> = new Set(['stork-turns', 'outside-ski-turns']);

/** de-leva-1996 male mass shares onto the ISB segments; head and neck ride the head, the scapulae carry none. */
export const MASS: Readonly<Record<string, number>> = {
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
export const CM_SHARE: Readonly<Record<string, readonly [string, string, number]>> = {
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
export const LOCAL_CENTRE: Readonly<Record<string, Vec3>> = Object.fromEntries(
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
/** Hip joint centres apart: the groomed stance with the thighs parallel, no hip ab- or adduction (no measured carving width found). */
const HIP_WIDTH = HIP_WIDTH_M;
const jointGap = (a: string, b: string): number => {
  const [p, q] = [SKELETON_DATA.joints[a], SKELETON_DATA.joints[b]];
  return Math.hypot(...[0, 1, 2].map((i) => (p?.[i] ?? 0) - (q?.[i] ?? 0)));
};
const THIGH = jointGap('hip.R', 'knee.R');
const SHANK = jointGap('knee.R', 'ankle.R');
/** Hip-to-ankle distance at knee flexion `knee`, the leg as two links. */
const legSpan = (knee: number): number => Math.sqrt(THIGH ** 2 + SHANK ** 2 + 2 * THIGH * SHANK * Math.cos(knee));
/** The inside ankle's rise over the outside's along the lean axis when the stance goal holds: gap = stance / cos ε. */
export const insideRise = (lean: number, edge: number, stance = HIP_WIDTH): number => (stance * Math.sin(lean)) / Math.cos(edge);
/** Knee flexion past `outsideKnee` that shortens that leg's hip-to-ankle span by `rise`. */
export const insideFold = (rise: number, outsideKnee: number): number => {
  const d = legSpan(outsideKnee) - rise;
  return Math.acos(Math.min(1, Math.max(-1, (d * d - THIGH ** 2 - SHANK ** 2) / (2 * THIGH * SHANK)))) - outsideKnee;
};
/** Inside coordinates whose prior folds from the outside's by insideFold; the ankle keeps its own. */
const FOLDED = new Set(['knee_flexion.L', 'hip_flexion.L']);
/** The outside ankle's place along the binding frame's z. */
export const ANKLE_ALONG = -value(dot3(axisOf(BINDING[Side.Right], 2), BINDING[Side.Right].p));

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

/** Ski base contact points in the binding frame: the running edge's tip, waist and tail rows on both edges, [across, along]. */
export interface SkiPoints {
  readonly points: ReadonlyArray<Vec3>;
  /** The ski's physical tip and tail along the binding frame (skiEnds), past the running edge's rows. */
  readonly ends: { readonly tip: number; readonly tail: number };
  /** The wider end's edges toward +x and toward -x: a rigid edged ski touches there, sidecut lifting its waist. */
  readonly contact: readonly [Vec3, Vec3];
  readonly centre: Vec3;
  readonly width: number;
  /** Tail half and tip half as capsules along the base, each as wide as its end (inferred, conservative). */
  readonly capsules: readonly [BootCapsule, BootCapsule];
}

export const skiPoints = (terrain: Terrain): SkiPoints => skiPointsOf(skiFor(REFERENCE_SKIER, terrain));

/** The running edge's length L, L² = 8 D R_sc: the end widths' chord whose sidecut is R_sc (carvedRadius's L). */
export const runningLength = (ski: Ski): number => Math.sqrt(2 * (ski.tip + ski.tail - 2 * ski.waist) * ski.sidecutRadius);

export const skiPointsOf = (ski: Ski): SkiPoints => {
  const { tip, tail } = skiEnds(ski);
  const half = runningLength(ski) / 2;
  const y = -EQUIPMENT.skiThickness;
  const row = (along: number, width: number): Vec3[] => [
    [width / 2, y, along],
    [-width / 2, y, along],
  ];
  const points = [...row(SKI_MOUNT + half, ski.tip), ...row(SKI_MOUNT, ski.waist), ...row(SKI_MOUNT - half, ski.tail)];
  const end = ski.tip >= ski.tail ? 0 : 4;
  return {
    points,
    ends: { tip, tail },
    contact: [points[end] ?? [0, y, 0], points[end + 1] ?? [0, y, 0]],
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

/** A boot's sole and cuff axes with their radii. */
export interface BootSegments {
  readonly sole: readonly [Vec3, Vec3];
  readonly soleR: number;
  readonly cuff: readonly [Vec3, Vec3];
  readonly cuffR: number;
}

/**
 * The one boot geometry of solver and tests, in the boot frame (ankle at the origin, rest axes): the shell's sole run
 * heel to toe and the cuff up the shin, the board's ramp out (shellInFoot); the cuff's lateral semi-axis is its radius.
 */
export const bootSegmentsOf = (fit: BootFit): BootSegments => {
  const m = shellInFoot(fit, EQUIPMENT);
  const r = fit.halfWidth;
  const y = fit.sole + r;
  return {
    sole: [transformPoint(m, [fit.centreX, y, fit.heel + r]), transformPoint(m, [fit.centreX, y, fit.toe - r])],
    soleR: r,
    cuff: [transformPoint(m, [fit.cuffX, 0, fit.cuffZ]), transformPoint(m, [fit.cuffX, fit.cuffTop, fit.cuffZ])],
    cuffR: fit.cuffRx,
  };
};

/** gear-fit.ts's shell (the bake's fit, as the binding) as capsules in the foot segment's frame. */
export const bootCapsules = (s: Side): readonly [BootCapsule, BootCapsule] => {
  const raw = SKELETON_DATA.gear_fit[s];
  const b = bootSegmentsOf(bootFitFrom(raw));
  const m = composeM(rigidInverse(restWorld(`foot.${s}`)), translation(raw.ankle));
  return [
    { a: transformPoint(m, b.sole[0]), b: transformPoint(m, b.sole[1]), radius: b.soleR },
    { a: transformPoint(m, b.cuff[0]), b: transformPoint(m, b.cuff[1]), radius: b.cuffR },
  ];
};
const BOOTS = { [Side.Right]: bootCapsules(Side.Right), [Side.Left]: bootCapsules(Side.Left) } as const;

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

const distance = (u: V3, v: V3): Scalar => {
  const d = sub3(u, v);
  const l2 = dot3(d, d);
  return typeof l2 === 'number' ? Math.sqrt(l2) : l2.sqrt();
};
const vals = (p: V3): Vec3 => p.map(value) as unknown as Vec3;
/** Parameter of p's nearest point on segment s0s1, held at its value (exact first order by the envelope). */
const nearest = (p: V3, s0: V3, s1: V3): number => {
  const [pv, a, b] = [vals(p), vals(s0), vals(s1)];
  const d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  return unit(dotN([pv[0] - a[0], pv[1] - a[1], pv[2] - a[2]], d) / Math.max(1e-12, dotN(d, d)));
};
const idleLike = (s: Scalar): Scalar => (typeof s === 'number' ? 1 : s.mul(0).add(1));

/**
 * Clearance rows between two capsules in world frames, axis distance less both radii: each axis end against the other
 * axis, and the axes' closest pair when it lies inside both (else idle). Their least is the capsule clearance, but
 * each row is smooth where that least is kinked, as for side-by-side skis whose nearest ends swap at parallel.
 */
const clearanceOf = (a0: V3, a1: V3, b0: V3, b1: V3, r: number): Scalar[] => {
  const toAxis = (p: V3, s0: V3, s1: V3): Scalar => sub(distance(p, lerp(s0, s1, nearest(p, s0, s1))), r);
  const ends = [toAxis(a0, b0, b1), toAxis(a1, b0, b1), toAxis(b0, a0, a1), toAxis(b1, a0, a1)];
  const [sP, tQ] = closest(vals(a0), vals(a1), vals(b0), vals(b1));
  const inside = sP > 0 && sP < 1 && tQ > 0 && tQ < 1;
  return [...ends, inside ? sub(distance(lerp(a0, a1, sP), lerp(b0, b1, tQ)), r) : idleLike(ends[0] ?? 0)];
};
const clearance = (fa: Rigid, ca: BootCapsule, fb: Rigid, cb: BootCapsule): Scalar[] =>
  clearanceOf(transform(fa, ca.a), transform(fa, ca.b), transform(fb, cb.a), transform(fb, cb.b), ca.radius + cb.radius);

/** Every ski capsule pair's clearance, right against left. */
const skiClearances = (world: Readonly<Record<string, Rigid>>, ski: SkiPoints): Scalar[] => {
  const r = skiFrame(world, Side.Right);
  const l = skiFrame(world, Side.Left);
  return ski.capsules.flatMap((cr) => ski.capsules.flatMap((cl) => clearance(r, cr, l, cl)));
};

/** Every boot capsule pair's clearance, right against left. */
const bootClearances = (world: Readonly<Record<string, Rigid>>): Scalar[] => {
  const fr = world['foot.R'];
  const fl = world['foot.L'];
  if (fr === undefined || fl === undefined) throw new Error('feet not solved');
  return BOOTS[Side.Right].flatMap((cr) => BOOTS[Side.Left].flatMap((cl) => clearance(fr, cr, fl, cl)));
};

/** A leg capsule: the figure's thigh or shin as fractions along its ISB bone, as the clearance rig places it. */
interface LegCapsule {
  readonly from: number;
  readonly to: number;
  readonly radius: number;
}
const legCapsuleOf = (part: string, child: string): LegCapsule => {
  const shape = SEGMENTS[segmentIndex(part)]?.shape;
  const bone = -(SEGMENTS[segmentIndex(child)]?.joint[1] ?? Number.NaN);
  if (shape === undefined || shape.type !== 'capsule') throw new Error(`${part} is not a capsule`);
  const half = shape.length / 2;
  return { from: -(shape.center[1] - half) / bone, to: -(shape.center[1] + half) / bone, radius: shape.radius };
};
const LEG_CAPSULES = Object.fromEntries(
  ([[Side.Right, BodySide.Right], [Side.Left, BodySide.Left]] as const).map(([s, b]) => [
    s,
    {
      thigh: legCapsuleOf(`${b}-thigh`, `${b}-shin`),
      shin: legCapsuleOf(`${b}-shin`, `${b}-boot`),
      ankle: transformPoint(composeM(rigidInverse(restWorld(`foot.${s}`)), translation(SKELETON_DATA.gear_fit[s].ankle)), [0, 0, 0]),
    },
  ]),
) as Readonly<Record<Side, { readonly thigh: LegCapsule; readonly shin: LegCapsule; readonly ankle: Vec3 }>>;

/** A leg's thigh and shin capsules in world coordinates: hip to knee, knee to ankle. */
const legCapsules = (world: Readonly<Record<string, Rigid>>, s: Side): ReadonlyArray<readonly [V3, V3, number]> => {
  const [femur, tibia, foot] = [world[`femur.${s}`], world[`tibia.${s}`], world[`foot.${s}`]];
  if (femur === undefined || tibia === undefined || foot === undefined) throw new Error('legs not solved');
  const { thigh, shin, ankle } = LEG_CAPSULES[s];
  const at = (u: V3, v: V3, c: LegCapsule): readonly [V3, V3, number] => [lerp(u, v, c.from), lerp(u, v, c.to), c.radius];
  return [at(femur.p, tibia.p, thigh), at(tibia.p, transform(foot, ankle), shin)];
};

/** Every leg capsule pair's clearance, right against left. */
const legClearances = (world: Readonly<Record<string, Rigid>>): Scalar[] => {
  const l = legCapsules(world, Side.Left);
  return legCapsules(world, Side.Right).flatMap(([a0, a1, ra]) => l.flatMap(([b0, b1, rb]) => clearanceOf(a0, a1, b0, b1, ra + rb)));
};

/** Gap of whichever edge is lower. */
const lowerGap = (a: Scalar, b: Scalar): Scalar => (value(a) <= value(b) ? a : b);
/** The inside ski's tip and tail gaps, each on its own lower edge. */
const insideEndGaps = (surface: Surface, ins: Rigid, ski: SkiPoints): Scalar[] =>
  [0, 4].map((i) => lowerGap(gapOver(surface, transform(ins, ski.points[i] ?? ski.centre)), gapOver(surface, transform(ins, ski.points[i + 1] ?? ski.centre))));

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

const NORMAL_STEP = 1e-4;
/** Snow normal at `p`, exact in value and first order in its (x, z), so a tangent row's Jacobian carries the curvature. */
const normalOver = (surface: Surface, p: V3): V3 => {
  const x = value(p[0]);
  const z = value(p[2]);
  const n = normalAt(surface, x, z);
  const [x1, x0] = [normalAt(surface, x + NORMAL_STEP, z), normalAt(surface, x - NORMAL_STEP, z)];
  const [z1, z0] = [normalAt(surface, x, z + NORMAL_STEP), normalAt(surface, x, z - NORMAL_STEP)];
  const dx = sub(p[0], x);
  const dz = sub(p[2], z);
  const h = 1 / (2 * NORMAL_STEP);
  return [0, 1, 2].map((i) => add(add(n[i] ?? 0, mul(h * ((x1[i] ?? 0) - (x0[i] ?? 0)), dx)), mul(h * ((z1[i] ?? 0) - (z0[i] ?? 0)), dz))) as unknown as V3;
};

/** A ski's lower edge at `along` in its binding frame, bent at `radius` about the mount: where the pressed ski touches the snow. */
const pressedPoint = (ski: SkiPoints, edge: number, along: Scalar, radius: number): V3 => {
  const u = sub(along, ski.centre[2]);
  return [ski.points[2 + edge]?.[0] ?? 0, add(ski.centre[1], mul(1 / (2 * radius), mul(u, u))), along];
};

/** The bent ski's long axis at `along`: the mount's axis `z` tipped toward its base normal `y` by u / R. */
const bentAxis = (ski: SkiPoints, z: V3, y: V3, along: Scalar, radius: number): V3 => {
  const k = mul(1 / radius, sub(along, ski.centre[2]));
  return [add(z[0], mul(k, y[0])), add(z[1], mul(k, y[1])), add(z[2], mul(k, y[2]))];
};

/** Snow samples along a ski from its tail to its tip for its contact; inferred. */
const CONTACT_SAMPLES = 64;

/** A ski at rest on the snow (edgeContactOf): the waist on it, or the binding-frame along of its two touching points. */
export interface SkiContact {
  readonly pressed: boolean;
  /** Tail-side and tip-side touching points along the binding frame; both the mount when pressed. */
  readonly touch: readonly [number, number];
}

/** edgeContactOf on the snow along `f` through (x, z), from the ski's tail to its tip about the mount. */
export const skiContactOf = (surface: Surface, x: number, z: number, f: Vec3, ski: SkiPoints, bendRadius: number, edge: number, sidecutRadius: number): SkiContact => {
  const [tail, tip] = [ski.points[4]?.[2] ?? 0, ski.points[0]?.[2] ?? 0];
  const along = Array.from({ length: CONTACT_SAMPLES + 1 }, (_, j) => (j === 0 ? tail : j === CONTACT_SAMPLES ? tip : tail + ((tip - tail) * j) / CONTACT_SAMPLES));
  along.splice(along.findIndex((a) => a >= SKI_MOUNT), along.includes(SKI_MOUNT) ? 1 : 0, SKI_MOUNT);
  const l = Math.hypot(f[0], f[2]);
  const u = along.map((a) => a - SKI_MOUNT);
  const c = edgeContactOf(u, u.map((v) => supportAt(surface, x + (v * f[0]) / l, z + (v * f[2]) / l)), edgeCurvatureOf(bendRadius, edge, sidecutRadius));
  const alongAt = (v: number): number => along[u.indexOf(v)] ?? SKI_MOUNT;
  return { pressed: c.pressed, touch: [alongAt(c.touch[0]), alongAt(c.touch[1])] };
};

/** Lower edge `e` at `along` in the binding frame: a sampled row's own point, else the sidecut through the three rows. */
const edgePointAt = (ski: SkiPoints, e: number, along: number): Vec3 => {
  const rows = [ski.points[e], ski.points[2 + e], ski.points[4 + e]].filter((p): p is Vec3 => p !== undefined);
  const own = rows.find((p) => p[2] === along);
  if (own !== undefined) return own;
  const x = rows.reduce((s, p, i) => s + p[0] * rows.reduce((w, o, j) => (j === i ? w : (w * (along - o[2])) / (p[2] - o[2])), 1), 0);
  return [x, ski.centre[1], along];
};

/** Indices of edge `e`'s sampled rows at `along`: the points a bridged ski's equalities hold. */
const heldAt = (ski: SkiPoints, e: number, along: number): number[] => ski.points.flatMap((p, j) => (j % 2 === e && p[2] === along ? [j] : []));

/** The CoM over the bent waists' lower edges (the bend leaves the mount in place), square to the slope, both skis' mean: the physics' h. */
export const massHeightOf = (w: Readonly<Record<string, Rigid>>, ski: SkiPoints, g: SkiGoal, insideEdge: number): Scalar => {
  const com = centreOfMassOf(w);
  const lowEdge = g.edge >= 0 ? 0 : 1;
  const over = (m: Rigid, e: number): Scalar => sub(com[1], transform(m, ski.points[2 + e] ?? ski.centre)[1]);
  return mul(0.5, add(over(skiFrame(w, Side.Right), lowEdge), over(skiFrame(w, Side.Left), insideEdge)));
};

/** Bend sagitta of base point `p` bending at `radius`, off the mount: the pressure centre must not buy contact slack. */
const sagittaAt = (ski: SkiPoints, p: Vec3, radius: number): number => sagittaOf(p[2] - ski.centre[2], radius);

/** Binding-frame point `p` of the ski bent at `radius` about the mount: raised u² / 2R along the base normal. */
export const bentAt = (ski: SkiPoints, p: Vec3, radius: number): Vec3 => [p[0], p[1] + sagittaAt(ski, p, radius), p[2]];

/** The outside ski's goal at one frame, in the frame's local coordinates (path point at the origin). */
export interface SkiGoal {
  readonly t: number;
  /** Path point in the slope frame; the pelvis translation is relative to it. */
  readonly origin: Vec3;
  /** Snow normal, forward and across (toward +x) in the snow's plane. */
  readonly normal: Vec3;
  readonly forward: Vec3;
  readonly across: Vec3;
  /** The heading frame the pelvis rotation is relative to, row-major: columns across, normal, forward. */
  readonly ref: readonly number[];
  /** Physics edge angle toward the turn's inside, radians. */
  readonly edge: number;
  /** Band the outside edge may move in, radians: lean + the kind's margins while loaded, else both the goal edge. */
  readonly edgeMin: number;
  readonly edgeMax: number;
  /** Balance-axis lean of the mass path toward the turn's inside, radians; the legacy path's is its edge. */
  readonly lean: number;
  /** The mass path's heading off the fall line toward +x, radians; the legacy path's is the skis'. */
  readonly massHeading: number;
  /** Share of the skis' curvature the mass path takes; loaded above one half. Legacy: 0. */
  readonly arcShare: number;
  /** Counter band while loaded, radians (counterBandAt); legacy: unbounded. */
  readonly counterMin: number;
  readonly counterMax: number;
  /** The band holds pelvisToFallOf, not counterOf. */
  readonly counterAboutFallLine: boolean;
  /** Ski axes the goal asks for: binding x, y, z. */
  readonly axes: readonly [Vec3, Vec3, Vec3];
  readonly insideShare: number;
  /** The snow's required resultant, unit: −(g + a_c + braking) per forcesAt and brakingTilt. */
  readonly resultant: Vec3;
  /** Snow force over body weight, per turnForcesAt. */
  readonly load: number;
  /** CoM ahead of the outside ankle along the ski, metres: the prior's mean. */
  readonly foreAft: number;
  /** One σ of the fore-aft goal, metres: FORE_AFT_SIGMA or the curve's band, the larger. */
  readonly foreAftSigma: number;
  /** The prior phase φ the cell's turn time `t` registers to by its events; `t` on the legacy path. */
  readonly phase: number;
  /** Ski centres apart square to the body, metres: the prior's mean. */
  readonly stance: number;
  /** insideRise at the goal's lean, edge and stance, metres; 0 on moguls and the legacy path. */
  readonly rise: number;
  /** The physics' mass height over the ski bases along their normal, metres; null where it lays none. */
  readonly clearance: number | null;
  /** Gravity up: (0, cos α, −sin α) on the drill's slope α. */
  readonly up: Vec3;
  /** Across the heading made square to gravity, toward the turn's inside (the new turn's at the switch). */
  readonly inside: Vec3;
  /** Outside and inside ski bend radius under their share of the load, metres (bendRadiusOf). */
  readonly bend: readonly [number, number];
  /** Outside and inside: the curvature the whole edge needs to touch, requiredCurvature, 1/m. */
  readonly required: readonly [number, number];
  /** Outside and inside: pressed at P and bent to the snow, else bridged on its touching points (skiContactOf). */
  readonly pressed: readonly [boolean, boolean];
  /** Outside and inside at rest on the snow along the heading through its own place, stance / 2 off the path point. */
  readonly contact: readonly [SkiContact, SkiContact];
  /** Outside and inside: the snow normal under that ski's own place. */
  readonly normals: readonly [Vec3, Vec3];
}

/** The snow's curvature along heading `f` over a ski of `length` at (x, z), concave +, 1/m: the chord value. */
export const snowCurvature = (surface: Surface, x: number, z: number, f: Vec3, length: number): number => {
  const h = length / 2;
  const l = Math.hypot(f[0], f[2]);
  const [dx, dz] = [(h * f[0]) / l, (h * f[2]) / l];
  return (supportAt(surface, x + dx, z + dz) + supportAt(surface, x - dx, z - dz) - 2 * supportAt(surface, x, z)) / (h * h);
};

/** Bend curvature 1/R_bend an edged ski needs to touch along its whole edge: edgeCurvatureOf ≥ snow, (sin|ε| / R_sc + κ_snow) / cos ε. */
export const requiredCurvature = (edge: number, sidecutRadius: number, snow: number): number => (Math.sin(Math.abs(edge)) / sidecutRadius + snow) / Math.cos(edge);

/** The load bends the ski onto the snow at P (pressed), else it rests on its tip and tail (bridged); both hold at equality. */
export const isPressed = (bendRadius: number, required: number): boolean => 1 / bendRadius >= required;

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

/** A lit-curves.json fore-aft curve, cm: sporri-2016 Fig 4 with its ±SE band envelope, reid-2010's anchors with their sd. */
interface ForeAftCurve {
  readonly t: ReadonlyArray<number>;
  readonly mean: ReadonlyArray<number>;
  readonly range?: readonly [ReadonlyArray<number>, ReadonlyArray<number>];
  readonly sd?: ReadonlyArray<number>;
}
const FORE_AFT_CURVES: Readonly<Record<'gs_carving' | 'slalom', ForeAftCurve>> = {
  gs_carving: LIT.gs_carving.fore_aft_cm as unknown as ForeAftCurve,
  slalom: LIT.slalom.fore_aft_cm as unknown as ForeAftCurve,
};
/** The legacy drills' mid-foot: the CoM over the ski frame's origin; inferred. */
const LEGACY_FORE_AFT: ForeAft = { aheadM: -ANKLE_ALONG };

/** Fore-aft goal at prior phase `phase` from the kind's preset, metres; σ the floor or the curve's band, the larger. */
export const foreAftAt = (foreAft: ForeAft, phase: number): { readonly mean: number; readonly sigma: number } => {
  if ('aheadM' in foreAft) return { mean: foreAft.aheadM, sigma: FORE_AFT_SIGMA };
  const c = FORE_AFT_CURVES[foreAft.curve];
  const u = ((phase % 1) + 1) % 1;
  const i = Math.min(c.t.length - 2, Math.max(0, c.t.findIndex((x) => x > u) - 1));
  const f = (u - (c.t[i] ?? 0)) / ((c.t[i + 1] ?? 1) - (c.t[i] ?? 0));
  const read = (ys: ReadonlyArray<number>): number => (ys[i] ?? 0) + ((ys[i + 1] ?? 0) - (ys[i] ?? 0)) * f;
  const half = c.range !== undefined ? (read(c.range[1]) - read(c.range[0])) / 2 : c.sd !== undefined ? read(c.sd) : 0;
  const seam = seamOf(c);
  const closed = read(c.mean) + (seam - (c.mean[0] ?? 0)) * (1 - u) + (seam - (c.mean[c.mean.length - 1] ?? 0)) * u;
  return { mean: closed / 100, sigma: Math.max(FORE_AFT_SIGMA, half / 100) };
};

/** Where the mirrored turn's ends must meet: the ends' inverse-variance mean by their sd or band half, cm. */
const seamOf = (c: ForeAftCurve): number => {
  const ends = [0, c.mean.length - 1].map((j) => {
    const half = c.range !== undefined ? ((c.range[1][j] ?? 0) - (c.range[0][j] ?? 0)) / 2 : (c.sd?.[j] ?? 1);
    return { m: c.mean[j] ?? 0, w: 1 / (half * half) };
  });
  return ends.reduce((s, e) => s + e.m * e.w, 0) / ends.reduce((s, e) => s + e.w, 0);
};

/** The cell's turn time onto its prior's phase by V's events (motion-model §9 F); null on the legacy path. */
export const registrationOf = (drill: string, intensity: Intensity): PhaseMap | null => {
  const kind = kindOfDrill(drill);
  if (kind === null) return null;
  const task = taskFor(kind, intensity);
  return phaseMapOf(anchorsFor(drill), turnProfile(task, snowOf(task)).events);
};

/** The task's snow; hard groomed until a penetration source is read. */
const snowOf = (task: TurnTask): Snow => task.snow ?? Snow.HardGroomed;

/** The physics a goal takes at turn time `t`: the legacy scenario's, or module A's for a kind. */
interface GoalPhysics {
  readonly heading: number;
  readonly massHeading: number;
  readonly edge: number;
  readonly edgeMin: number;
  readonly edgeMax: number;
  readonly lean: number;
  readonly load: number;
  readonly braking: number;
  readonly arcShare: number;
  readonly slopeDeg: number;
  readonly counterMin: number;
  readonly counterMax: number;
  readonly counterAboutFallLine: boolean;
  readonly clearance: number | null;
  readonly bendRadius: number | null;
}

const goalPhysics = (drill: string, scenario: TurnScenario, intensity: Intensity, surface: Surface, t: number, skis: number): GoalPhysics => {
  const kind = kindOfDrill(drill);
  if (kind === null) {
    const edge = physicsEdge(scenario, t);
    const braking = brakingTiltAt(scenario, surface, t);
    return {
      heading: skis,
      massHeading: skis,
      edge,
      edgeMin: edge,
      edgeMax: edge,
      lean: edge,
      load: turnForcesAt(scenario, t).load,
      braking,
      arcShare: 0,
      slopeDeg: scenario.slopeDeg,
      counterMin: -Infinity,
      counterMax: Infinity,
      counterAboutFallLine: false,
      clearance: null,
      bendRadius: null,
    };
  }
  const task = taskFor(kind, intensity);
  const p = turnProfile(task, snowOf(task)).at(t);
  const goal = edgeGoalAt(task, t);
  const massHeading = p.heading - Math.PI / 2;
  // The surface path's skis: skiHeadingAt, the travel plus the attack, on groomed snow and over the bumps.
  const heading = skis;
  const edge = goal.edgeDeg * DEG;
  const lean = goal.leanDeg * DEG;
  // A carved edge is pinned by the sidecut to the arc; skidded tasks trade it inside the band while loaded.
  const open = task.skidShare > 0 && p.arcShare > 0.5;
  const braking = Math.atan(GLIDING_FRICTION[snowOf(task)] * Math.cos(p.attack * DEG));
  const counter = counterBandAt(task, t);
  return {
    heading,
    massHeading,
    edge,
    edgeMin: open ? lean + goal.marginMinDeg * DEG : edge,
    edgeMax: open ? lean + goal.marginMaxDeg * DEG : edge,
    lean,
    load: p.load,
    braking,
    arcShare: p.arcShare,
    slopeDeg: task.slopeDeg,
    counterMin: counter.minDeg * DEG,
    counterMax: counter.maxDeg * DEG,
    counterAboutFallLine: counter.aboutFallLine,
    clearance: p.clearance,
    bendRadius: p.bendRadius,
  };
};

/** Unit `heading` off the fall line, in the snow's plane. */
const inPlane = (heading: number, normal: Vec3): Vec3 => {
  const f0: Vec3 = [Math.sin(heading), 0, Math.cos(heading)];
  const k = f0[0] * normal[0] + f0[1] * normal[1] + f0[2] * normal[2];
  return normalise([f0[0] - k * normal[0], f0[1] - k * normal[1], f0[2] - k * normal[2]]);
};

export const skiGoal = (drill: string, intensity: Intensity, surface: Surface, t: number): SkiGoal => {
  const style = turnStyle(drill);
  if (style === undefined) throw new Error(`${drill}: no regular turn`);
  const scenario = style.scenarios[intensity];
  // The skis' place and heading: on moguls their line, under the root's mass path.
  const p = { ...pathAt(surface, t), ...skisAt(surface, t) };
  const origin: Vec3 = [p.x, supportAt(surface, p.x, p.z), p.z];
  const normal = normalAt(surface, p.x, p.z);
  const phys = goalPhysics(drill, scenario, intensity, surface, t, p.heading);
  const kind = kindOfDrill(drill);
  const reg = registrationOf(drill, intensity);
  const phase = reg === null ? t : phaseOn(reg, t);
  const fa = foreAftAt(kind === null ? LEGACY_FORE_AFT : taskFor(kind, intensity).legacy.foreAft, phase);
  const fwd = inPlane(phys.heading, normal);
  const across = crossN(normal, fwd);
  const { edge, braking } = phys;
  // The balance axis leans square to the mass's travel; braking tilts it back along that travel.
  const fm = inPlane(phys.massHeading, normal);
  const am = crossN(normal, fm);
  const r = [0, 1, 2].map((i) => (normal[i] ?? 0) + Math.tan(phys.lean) * (am[i] ?? 0) - Math.tan(braking) * (fm[i] ?? 0)) as unknown as Vec3;
  const [c, s] = [Math.cos(edge), Math.sin(edge)];
  const up: Vec3 = [c * normal[0] + s * across[0], c * normal[1] + s * across[1], c * normal[2] + s * across[2]];
  const slope = phys.slopeDeg * DEG;
  const g: Vec3 = [0, Math.cos(slope), -Math.sin(slope)];
  const fg = dotN(fwd, g);
  const level = crossN(g, normalise([fwd[0] - fg * g[0], fwd[1] - fg * g[1], fwd[2] - fg * g[2]]));
  const side = edge >= 0 ? 1 : -1;
  const x: Vec3 = [c * across[0] - s * normal[0], c * across[1] - s * normal[1], c * across[2] - s * normal[2]];
  const task = kind !== null ? taskFor(kind, intensity) : null;
  // The carve's share is the physics' pressure centre (§7), one p(t) for solve and physics.
  const insideShare = task?.skidShare === 0 ? 1 - (turnProfile(task, snowOf(task)).at(t).outsideShare ?? task.style.outsideShare) : weightSplit(style, intensity, t).inside;
  const sk = kind !== null ? taskFor(kind, intensity).ski : skiFor(REFERENCE_SKIER, surface.kind === SurfaceKind.Moguls ? Terrain.Moguls : Terrain.Groomed);
  // The physics' bend where it lays one (moguls: its share of the load square to the base), else each ski's share.
  const bend = phys.bendRadius !== null ? ([phys.bendRadius, phys.bendRadius] as const) : ([bendRadiusOf(phys.load * (1 - insideShare) * REFERENCE_SKIER.mass * G), bendRadiusOf(phys.load * insideShare * REFERENCE_SKIER.mass * G)] as const);
  const pts = skiPointsOf(sk);
  const stance = surface.kind === SurfaceKind.Moguls ? MOGUL_STANCE_M : HIP_WIDTH;
  // Each ski on its own snow at its mount, the ankles on the path point; the outside away from the turn's inside.
  const ahead = SKI_MOUNT - ANKLE_ALONG;
  const spots = [-side, side].map((s) => [p.x + (s * stance * across[0]) / 2 + ahead * fwd[0], p.z + (s * stance * across[2]) / 2 + ahead * fwd[2]] as const);
  const contact = bend.map((b, n) => skiContactOf(surface, spots[n]?.[0] ?? p.x, spots[n]?.[1] ?? p.z, fwd, pts, b, edge, sk.sidecutRadius)) as unknown as readonly [SkiContact, SkiContact];
  // The inside ski's edge band is centred on the outside's goal edge; each needs the curvature of its own snow.
  const required = spots.map(([x, z]) => requiredCurvature(edge, sk.sidecutRadius, snowCurvature(surface, x, z, fwd, runningLength(sk)))) as unknown as readonly [number, number];
  const normals = spots.map(([x, z]) => normalAt(surface, x, z)) as unknown as readonly [Vec3, Vec3];
  return {
    t,
    origin,
    normal,
    forward: fwd,
    across,
    ref: [across[0], normal[0], fwd[0], across[1], normal[1], fwd[1], across[2], normal[2], fwd[2]],
    edge,
    edgeMin: phys.edgeMin,
    edgeMax: phys.edgeMax,
    lean: phys.lean,
    massHeading: phys.massHeading,
    arcShare: phys.arcShare,
    counterMin: phys.counterMin,
    counterMax: phys.counterMax,
    counterAboutFallLine: phys.counterAboutFallLine,
    axes: [x, up, fwd],
    insideShare,
    resultant: normalise(r),
    load: phys.load,
    foreAft: fa.mean,
    foreAftSigma: fa.sigma,
    phase,
    stance,
    rise: kind === null || surface.kind === SurfaceKind.Moguls ? 0 : insideRise(phys.lean, edge),
    clearance: phys.clearance,
    up: g,
    inside: [side * level[0], side * level[1], side * level[2]],
    bend,
    required,
    pressed: [contact[0].pressed, contact[1].pressed],
    contact,
    normals,
  };
};

/** Edge of a ski frame toward +x off the snow normal: the bank of its across axis. */
export const edgeOf = (ski: Rigid, normal: Vec3): Scalar => asin(neg(dot3(axisOf(ski, 0), normal)));

/** edgeOf against the snow under the ski's own centre, first order in where that centre is. */
const edgeOnSnow = (surface: Surface, ski: Rigid, centre: Vec3): Scalar => asin(neg(dot3(axisOf(ski, 0), normalOver(surface, transform(ski, centre)))));

const pelvisOf = (w: Readonly<Record<string, Rigid>>): Rigid => {
  const p = w['pelvis'];
  if (p === undefined) throw new Error('pelvis not solved');
  return p;
};
/**
 * Axial rotation of segment `s` (x anterior, y long) in a Grood–Suntay joint coordinate system (sporri-2016's trunk
 * torsion): e1 the reference's `lateral` axis (toward +x of a frame facing +z), e3 the segment's long axis, e2 = e1 × e3
 * floating; + right-handed about e3 from e2 to the anterior axis. Flexion about e1 and bending about e2 read 0.
 */
export const axialRotationOf = (lateral: V3, s: Rigid): Scalar => {
  const [e3, x] = [axisOf(s, 1), axisOf(s, 0)];
  const e2 = cross3(lateral, e3);
  return atan2(dot3(cross3(e2, x), e3), dot3(e2, x));
};
/**
 * The counter (motion-model §4.5, biomechanics D12, D13): the pelvis's axial rotation against the outside ski's frame
 * levelled onto the snow (long axis the snow normal), + when the pelvis faces the turn's outside (the fall line) more
 * than the ski, so a steered finish reads positive.
 */
export const counterOf = (w: Readonly<Record<string, Rigid>>, normal: Vec3): Scalar => neg(axialRotationOf(cross3(normal as unknown as V3, axisOf(skiFrame(w, Side.Right), 2)), pelvisOf(w)));
/** The pelvis's axial rotation against the fall-line frame on the snow, + toward +x (turn 0's inside); the mogul band about it is symmetric. */
export const pelvisToFallOf = (w: Readonly<Record<string, Rigid>>, normal: Vec3): Scalar => axialRotationOf(cross3(normal as unknown as V3, inPlane(0, normal) as unknown as V3), pelvisOf(w));
/** Thorax axial rotation against the pelvis (sporri-2016's torsion, sacrum to sternum), + toward the pelvis's left. */
export const chestTwistOf = (w: Readonly<Record<string, Rigid>>): Scalar => {
  const t = w['thorax'];
  if (t === undefined) throw new Error('thorax not solved');
  return axialRotationOf(axisOf(pelvisOf(w), 2).map(neg) as unknown as V3, t);
};
/** chestTwistOf in degrees, for the gate. */
export const chestTwistDeg = (w: Readonly<Record<string, Rigid>>): number => value(chestTwistOf(w)) / DEG;
/** counterOf in degrees, for the gate. */
export const counterDeg = (w: Readonly<Record<string, Rigid>>, normal: Vec3): number => value(counterOf(w, normal)) / DEG;
/** pelvisToFallOf in degrees, for the gate. */
export const pelvisToFallDeg = (w: Readonly<Record<string, Rigid>>, normal: Vec3): number => value(pelvisToFallOf(w, normal)) / DEG;
/** The counter the goal's band holds: about the fall line or against the outside ski. */
const bandCounterOf = (g: SkiGoal, w: Readonly<Record<string, Rigid>>): Scalar => (g.counterAboutFallLine ? pelvisToFallOf(w, g.normal) : counterOf(w, g.normal));

/** Joint effort's weight against the prior's z²; inferred (1: a maximal torque costs as much as a 1σ prior). */
export const EFFORT_WEIGHT = 1;
/** Segments whose joint above carries effort, each with its massive distal segments. */
export const EFFORT_JOINTS = SEGMENT_NAMES.filter((seg) => COORDINATES.some((c) => c.segment === seg && c.name.replace(/\.[RL]$/, '') in MAX_TORQUE)).map(
  (seg) => {
    const [base = '', s] = seg.split('.');
    return { seg, distal: distalOf(seg).filter((d) => (MASS[d] ?? 0) > 0), side: ['femur', 'tibia', 'foot'].includes(base) ? (s as Side) : null };
  },
);

/**
 * Each effort coordinate's net moment, N·m along its positive sense, quasi-static in the turn's effective field: the
 * snow pushes each ski's share of M·g·load along the resultant at its pressure centre, every segment weighs m·g·load.
 * `also` adds coordinates of those joints that carry no effort, for reports.
 */
export const jointMomentsOf = (
  g: SkiGoal,
  q: ReadonlyArray<Scalar>,
  w: Readonly<Record<string, Rigid>>,
  pressures: readonly [V3, V3],
  also: ReadonlySet<string> = new Set(),
): Array<{ readonly name: string; readonly nm: Scalar }> => {
  const gl = G * g.load;
  const M = REFERENCE_SKIER.mass;
  const field: V3 = [-gl * g.resultant[0], -gl * g.resultant[1], -gl * g.resultant[2]];
  const snow = (share: number): V3 => [share * M * gl * g.resultant[0], share * M * gl * g.resultant[1], share * M * gl * g.resultant[2]];
  return EFFORT_JOINTS.flatMap(({ seg, distal, side }) => {
    const frame = w[seg];
    if (frame === undefined) throw new Error(`${seg} not solved`);
    const bodies = distal.map((d) => {
      const f = w[d];
      if (f === undefined) throw new Error(`${d} not solved`);
      return { mass: (MASS[d] ?? 0) * M, at: transform(f, LOCAL_CENTRE[d] ?? [0, 0, 0]) };
    });
    const loads = side === null ? [] : [{ force: snow(side === Side.Right ? 1 - g.insideShare : g.insideShare), at: pressures[side === Side.Right ? 0 : 1] }];
    const moment = jointMoment(frame.p, bodies, loads, field);
    return dofAxes(q, w, seg).flatMap(({ index, axis }) => {
      const name = COORDINATES[index]?.name ?? '';
      return name.replace(/\.[RL]$/, '') in MAX_TORQUE || also.has(name) ? [{ name, nm: dot3(moment, axis) }] : [];
    });
  });
};

/** Each effort coordinate's net moment over its maximum, weighted. */
export const effortOf = (g: SkiGoal, q: ReadonlyArray<Scalar>, w: Readonly<Record<string, Rigid>>, pressures: readonly [V3, V3]): Array<{ readonly name: string; readonly r: Scalar }> =>
  jointMomentsOf(g, q, w, pressures).map(({ name, nm }) => ({ name, r: mul(EFFORT_WEIGHT, normalisedEffort(name, nm)) }));

/** A heinrich-2022 moment on the outside leg (R in turn 0) or the lumbar joint, N·m/kg per BW of outside-ski force, skeleton.ts senses. */
export interface MomentTarget {
  readonly label: string;
  readonly name: string;
  /** Table 2's band over the turn; ±Infinity where the table bounds one side only. */
  readonly lo: number;
  readonly hi: number;
  /** At the force peak (R2's read of Fig 5, ±0.15). */
  readonly peak: number;
}
/**
 * heinrich-2022 Table 2 and Fig 5 at the outside force peak (1.00 BW): extension, abduction, external rotation and
 * plantarflexion are negative here; its right turn mirrors onto our left one, so the odd lumbar bending flips sign.
 */
export const HEINRICH_2022_MOMENTS: ReadonlyArray<MomentTarget> = [
  { label: 'hip adduction', name: 'hip_adduction.R', lo: -0.39, hi: 0.52, peak: 0.1 },
  { label: 'hip rotation', name: 'hip_rotation.R', lo: -0.17, hi: 0.06, peak: -0.17 },
  { label: 'hip flexion', name: 'hip_flexion.R', lo: -1.27, hi: Infinity, peak: -1.27 },
  { label: 'knee flexion', name: 'knee_flexion.R', lo: -1.02, hi: Infinity, peak: -0.65 },
  { label: 'ankle dorsiflexion', name: 'ankle_dorsiflexion.R', lo: -0.85, hi: Infinity, peak: -0.5 },
  { label: 'lumbar flexion', name: 'lumbar_flexion', lo: -1.88, hi: -0.16, peak: -1.88 },
  // Side unstated in heinrich-2022: toward the turn's inside, as the distribute tests hold it; inferred.
  { label: 'lumbar bending', name: 'lumbar_bending', lo: -0.75, hi: -0.01, peak: -0.35 },
];
/** One σ of a force-peak moment row, N·m/kg: R2's read error 0.15 plus the per-BW scaling; inferred. */
export const MOMENT_SIGMA = 0.25;
/** The outside ski's force, BW: heinrich-2022's peak is 1.00, so his values scale by it; inferred. */
export const outsideForceOf = (g: SkiGoal): number => g.load * (1 - g.insideShare);
const BAND_ROWS = HEINRICH_2022_MOMENTS.reduce((n, m) => n + Number(Number.isFinite(m.lo)) + Number(Number.isFinite(m.hi)), 0);

/** Inequality rows (≥ 0 inside) of each moment `nmPerKg` against its band scaled by `force` BW. */
export const momentBandRows = (nmPerKg: (name: string) => Scalar, force: number, targets: ReadonlyArray<MomentTarget> = HEINRICH_2022_MOMENTS): Scalar[] =>
  targets.flatMap((m) => {
    const v = nmPerKg(m.name);
    return [...(Number.isFinite(m.lo) ? [sub(v, m.lo * force)] : []), ...(Number.isFinite(m.hi) ? [sub(m.hi * force, v)] : [])];
  });

/** Prior rows z = (moment − peak · force) / MOMENT_SIGMA at the force-peak frame. */
export const momentPeakRows = (nmPerKg: (name: string) => Scalar, force: number, targets: ReadonlyArray<MomentTarget> = HEINRICH_2022_MOMENTS): Scalar[] =>
  targets.map((m) => mul(1 / MOMENT_SIGMA, sub(nmPerKg(m.name), m.peak * force)));

/** The frame's moments per kg by name, for the band and peak rows. */
const perKgOf = (g: SkiGoal, q: ReadonlyArray<Scalar>, w: Readonly<Record<string, Rigid>>, pressures: readonly [V3, V3]): ((name: string) => Scalar) => {
  const byName = new Map(jointMomentsOf(g, q, w, pressures, REPORTED_MOMENTS).map((m) => [m.name, m.nm]));
  return (name) => {
    const nm = byName.get(name);
    if (nm === undefined) throw new Error(`no moment for ${name}`);
    return mul(1 / REFERENCE_SKIER.mass, nm);
  };
};
const EFFORT_SIZE = EFFORT_JOINTS.reduce((n, j) => n + COORDINATES.filter((c) => c.segment === j.seg && c.name.replace(/\.[RL]$/, '') in MAX_TORQUE).length, 0);

export { PRESSURE_EDGE_DEG };

/** Share of the half waist the pressure centre sits toward +x at edge `e`: an odd C¹ smoothstep, ±1 beyond PRESSURE_EDGE_DEG. */
const acrossShare = (e: Scalar): Scalar => {
  const u = mul(1 / (PRESSURE_EDGE_DEG * DEG), e);
  const v = value(u);
  if (v >= 1) return 1;
  if (v <= -1) return -1;
  const abs = v >= 0 ? u : neg(u);
  return sub(mul(3, mul(u, abs)), mul(2, mul(u, mul(u, u))));
};

/**
 * Outside and inside pressure centres at `along` in each binding frame, across the base by the ski's own edge: the
 * outside's goal edge `edge`, the inside's solved roll on `normal`.
 */
export const pressuresOf = (w: Readonly<Record<string, Rigid>>, ski: SkiPoints, edge: number, normal: Vec3, along: Scalar): readonly [V3, V3] => {
  const half = Math.abs(ski.points[2]?.[0] ?? 0);
  const ins = skiFrame(w, Side.Left);
  return [
    transform(skiFrame(w, Side.Right), [mul(half, acrossShare(edge)), ski.centre[1], along]),
    transform(ins, [mul(half, acrossShare(edgeOf(ins, normal))), ski.centre[1], along]),
  ];
};

const q45 = (q: Dual[]): Dual[] => q.slice(0, COORDINATES.length);

const unit3 = (v: V3): V3 => {
  const l2 = dot3(v, v);
  const inv: Scalar = typeof l2 === 'number' ? 1 / Math.sqrt(l2) : l2.sqrt().chain(1 / Math.sqrt(l2.v), -1 / l2.v);
  return v.map((c) => mul(inv, c)) as unknown as V3;
};
/**
 * Total trunk pitch as SAM 3D Body measures it (scripts/prior/sam3d-curves.ts): pelvis origin → neck origin against
 * the two skis' mean base normal, in the plane of their mean axis, + forward.
 */
export const trunkPitchOf = (w: Readonly<Record<string, Rigid>>): Scalar => {
  const [pelvis, neck] = [w['pelvis'], w['neck']];
  if (pelvis === undefined || neck === undefined) throw new Error('pelvis or neck not solved');
  const [r, l] = [skiFrame(w, Side.Right), skiFrame(w, Side.Left)];
  const n = unit3([0, 1, 2].map((j) => add(axisOf(r, 1)[j as 0 | 1 | 2], axisOf(l, 1)[j as 0 | 1 | 2])) as unknown as V3);
  const a0 = [0, 1, 2].map((j) => add(axisOf(r, 2)[j as 0 | 1 | 2], axisOf(l, 2)[j as 0 | 1 | 2])) as unknown as V3;
  const an = dot3(a0, n);
  const a = unit3([0, 1, 2].map((j) => sub(a0[j as 0 | 1 | 2], mul(an, n[j as 0 | 1 | 2]))) as unknown as V3);
  const t = sub3(neck.p, pelvis.p);
  return atan2(dot3(t, a), dot3(t, n));
};
const trunkOf = (w: Readonly<Record<string, Rigid>>): V3 => {
  const [pelvis, neck] = [w['pelvis'], w['neck']];
  if (pelvis === undefined || neck === undefined) throw new Error('pelvis or neck not solved');
  return sub3(neck.p, pelvis.p);
};
/** Total trunk angle (pelvis origin → neck origin) off gravity `up`, as the SAM 3D trunk_gravity. */
export const trunkGravityOf = (w: Readonly<Record<string, Rigid>>, up: Vec3): Scalar => {
  const t = trunkOf(w);
  const c = dot3(t, up as unknown as V3);
  // ε keeps the derivative finite on a vertical trunk.
  const h2 = add(sub(dot3(t, t), mul(c, c)), 1e-10);
  return atan2(typeof h2 === 'number' ? Math.sqrt(h2) : h2.sqrt(), c);
};
/** The trunk in the plane of gravity `up` and `inside`, + toward the turn's inside, as the SAM 3D trunk_across. */
export const trunkAcrossOf = (w: Readonly<Record<string, Rigid>>, up: Vec3, inside: Vec3): Scalar => {
  const t = trunkOf(w);
  return atan2(dot3(t, inside as unknown as V3), dot3(t, up as unknown as V3));
};
const LEGS = chainOf(['foot.R', 'foot.L']);

export interface TurnProblem {
  readonly drill: string;
  readonly intensity: Intensity;
  /** The drill's turn kind and module A's task and events; null on the legacy path. */
  readonly kind: TurnKind | null;
  readonly task: TurnTask | null;
  readonly events: TurnEvents | null;
  /** Cell t → prior φ; null on the legacy path or without anchors. */
  readonly registration: PhaseMap | null;
  readonly cycle: Cycle;
  readonly problem: Problem;
  readonly goals: ReadonlyArray<SkiGoal>;
  readonly surface: Surface;
  readonly prior: PriorAt;
  readonly ski: SkiPoints;
  /** Per frame, tip then tail: the inside ski's touching edge, 0 for +x, 1 for −x; fixed per solve so contact stays smooth. */
  readonly insideEdges: Uint8Array;
  readonly lower: Float64Array;
  readonly upper: Float64Array;
}

/** Each coordinate's mirror in the next turn: sides swapped; lateral translation, list, yaw, bending and axial rotation negated. */
export const MIRROR: Mirror = {
  perm: NAMES.map((n) => at(mirrorName(n))),
  sign: NAMES.map((n) => (parityOf(n) === Parity.Odd ? -1 : 1)),
};

/** Joint limits, and the bounds: those with the boot cuff on the ankles. */
const limitsOf = (): { lo: number[]; hi: number[]; jointLo: number[]; jointHi: number[] } => {
  const jointLo = COORDINATES.map((c) => JOINT_LIMITS[c.name]?.lower.value ?? -Infinity);
  const jointHi = COORDINATES.map((c) => (c.name.startsWith('ankle_dorsiflexion') ? ANKLE_DORSIFLEXION_KNEE_FLEXED.value : (JOINT_LIMITS[c.name]?.upper.value ?? Infinity)));
  const lo = COORDINATES.map((c, i) => Math.max(jointLo[i] ?? -Infinity, CUFF[c.name]?.[0] ?? -Infinity));
  const hi = COORDINATES.map((c, i) => Math.min(jointHi[i] ?? Infinity, CUFF[c.name]?.[1] ?? Infinity));
  // The pressure centre stays under the boot sole.
  const fit = bootFitFrom(SKELETON_DATA.gear_fit[Side.Right]);
  const half = (fit.toe - fit.heel) / 2;
  return { lo: [...lo, -Infinity, -Infinity, -half], hi: [...hi, Infinity, Infinity, half], jointLo, jointHi };
};

/** knee_rotation slots and their knee_flexion slots. */
const KNEE_ROTATIONS: ReadonlyMap<number, number> = new Map([Side.Right, Side.Left].map((s) => [at(`knee_rotation.${s}`), at(`knee_flexion.${s}`)]));

/** The limit barrier at kneeRotationLimit of the frame's own flexion: still a goal, no hard row. */
const kneeRotationBarrier = (v: Dual, flexion: Dual): Dual => {
  const { arc, slope } = kneeRotationArc(flexion.v);
  const span = flexion.mul(slope).add(arc - slope * flexion.v);
  const lo = span.mul(-(1 - KNEE_INTERNAL_SHARE));
  const hi = span.mul(KNEE_INTERNAL_SHARE);
  if ((v.v - lo.v) / BARRIER < 1) return v.sub(lo).mul(-1 / BARRIER).add(1).square();
  if ((hi.v - v.v) / BARRIER < 1) return hi.sub(v).mul(-1 / BARRIER).add(1).square();
  return v.mul(0);
};

export interface BuildOptions {
  /** Frames per turn. */
  readonly frames?: number;
}

/** A frame's prior: the inside knee and hip flexion are the outside's plus insideFold at the goal's rise, σ their own. */
export const priorFor = (pri: PriorAt, g: SkiGoal, name: string): { readonly mu: number; readonly sigma: number } | null => {
  const p = priorAt(pri, name, g.phase);
  if (p === null || g.rise === 0 || !FOLDED.has(name)) return p;
  const out = priorAt(pri, mirrorName(name), g.phase);
  const knee = priorAt(pri, 'knee_flexion.R', g.phase);
  return out === null || knee === null ? p : { mu: out.mu + insideFold(g.rise, knee.mu), sigma: p.sigma };
};

export const buildTurnProblem = (drill: string, intensity: Intensity, options: BuildOptions = {}): TurnProblem => {
  const S = options.frames ?? 96;
  const style = turnStyle(drill);
  if (style === undefined) throw new Error(`${drill}: no regular turn`);
  const examples = examplesFor(drill);
  if (examples === null) throw new Error(`${drill}: no prior`);
  const kind = kindOfDrill(drill);
  const task = kind === null ? null : taskFor(kind, intensity);
  const profile = kind === null || task === null ? null : turnProfile(task, snowOf(task));
  const [key, slopeDeg] =
    task === null || profile === null ? [arcLoad(style.scenarios[intensity]), style.scenarios[intensity].slopeDeg] : [profileArcLoad(task, profile.at(profile.events.fallLine).skiRadius), task.slopeDeg];
  const pri = interpolate(examples, key, fallLineLean(key, slopeDeg));
  const surface = surfaceFor(drill, intensity);
  const ski = task !== null ? skiPointsOf(task.ski) : skiPoints(surface.kind === SurfaceKind.Moguls ? Terrain.Moguls : Terrain.Groomed);
  const cycle = new Cycle({ frames: 2 * S, coords: N, boundary: Boundary.Mirror, mirror: MIRROR });
  const goals = Array.from({ length: S }, (_, k) => skiGoal(drill, intensity, surface, k / S));
  const { lo, hi, jointLo, jointHi } = limitsOf();
  const lifts = LIFTS_INSIDE.has(drill);
  // Each ski pressed or bridged by its goal's regime; the legacy path and lifted drills keep end contact.
  const regimes = kind !== null && !lifts;
  const blocks: Block[] = [];
  const insideEdges = Uint8Array.from(goals.flatMap((g) => [g.edge >= 0 ? 0 : 1, g.edge >= 0 ? 0 : 1]));

  goals.forEach((g, k) => {
    const f = g.forward;
    const a = g.across;
    // The lower edge carries the outside ski; at the switch either edge.
    const lowEdge = g.edge >= 0 ? 0 : 1;
    const [outPressed, inPressed] = regimes ? g.pressed : [false, false];
    const legs = (q: Dual[]): { out: Rigid; ins: Rigid; mid: V3 } => {
      const w = forward(q45(q), g.origin, LEGS, g.ref);
      return { out: skiFrame(w, Side.Right), ins: skiFrame(w, Side.Left), mid: ankleMidOf(w) };
    };
    const rel = (p: V3): V3 => sub3(p, g.origin);
    // The ankles' midpoint sits on the path point, mirror-symmetric at the seam; a kind holds the outside ski's heading, pitch and edge (goal or band).
    const closed = kind === null || g.edgeMax - g.edgeMin < 1e-9;
    blocks.push(
      cycle.frameBlock({ name: `outside ski ${k}`, group: 'outside ski', kind: BlockKind.Equality, size: kind === null || closed ? 8 : 7 }, [k], ([q = []]) => {
        const { out, ins, mid } = legs(q);
        const z = axisOf(out, 2);
        const p = transform(out, pressedPoint(ski, lowEdge, q[ALONG] ?? 0, g.bend[0]));
        // Pressed: P on the snow, the bent ski tangent there; bridged: tip and tail lower edges, bent, on the snow.
        const [touch, rest] = !regimes
          ? [dot3(z, g.normal), gapOver(surface, transform(out, ski.contact[lowEdge]))]
          : outPressed
            ? [dot3(bentAxis(ski, z, axisOf(out, 1), q[ALONG] ?? 0, g.bend[0]), normalOver(surface, p)), gapOver(surface, p)]
            : [g.contact[0].touch[1], g.contact[0].touch[0]].map((t) => gapOver(surface, transform(out, bentAt(ski, edgePointAt(ski, lowEdge, t), g.bend[0]))));
        let r: Scalar[];
        if (kind === null) {
          const rot = [0, 1, 2].map((i) => cross3(g.axes[i as 0 | 1 | 2], axisOf(out, i as 0 | 1 | 2)));
          r = [0, 1, 2].map((c) => mul(0.5, add(add(rot[0]?.[c] ?? 0, rot[1]?.[c] ?? 0), rot[2]?.[c] ?? 0)));
        } else r = [dot3(z, a), touch ?? 0, ...(closed ? [sub(edgeOnSnow(surface, out, ski.centre), g.edge)] : [])];
        const d = sub3(transform(ins, ski.centre), transform(out, ski.centre));
        return [
          ...r,
          dot3(rel(mid), f),
          dot3(rel(mid), a),
          rest ?? 0,
          sub(dot3(d, f), q[LEAD] ?? 0),
          sub(dot3(d, a), q[GAP] ?? 0),
        ] as Dual[];
      }),
    );
    if (!closed)
      blocks.push(
        cycle.frameBlock({ name: `edge band ${k}`, group: 'edge band', kind: BlockKind.Inequality, size: 2 }, [k], ([q = []]) => {
          const e = edgeOnSnow(surface, legs(q).out, ski.centre);
          return [sub(e, g.edgeMin), sub(g.edgeMax, e)] as Dual[];
        }),
      );
    if (!lifts)
      blocks.push(
        cycle.frameBlock({ name: `inside edge ${k}`, group: 'inside edge', kind: BlockKind.Inequality, size: 2 }, [k], ([q = []]) => {
          const { out, ins } = legs(q);
          const d = sub(edgeOnSnow(surface, ins, ski.centre), edgeOnSnow(surface, out, ski.centre));
          return [sub(INSIDE_EDGE_PLAY, d), add(INSIDE_EDGE_PLAY, d)] as Dual[];
        }),
      );
    if (g.arcShare > 0.5)
      blocks.push(
        cycle.frameBlock({ name: `counter band ${k}`, group: 'counter band', kind: BlockKind.Inequality, size: 2 }, [k], ([q = []]) => {
          const c = bandCounterOf(g, forward(q45(q), g.origin, LEGS, g.ref));
          return [sub(c, g.counterMin), sub(g.counterMax, c)] as Dual[];
        }),
      );
    blocks.push(
      cycle.frameBlock({ name: `contact ${k}`, group: 'contact', kind: BlockKind.Inequality, size: 2 * ski.points.length }, [k], ([q = []]) => {
        const { out, ins } = legs(q);
        // A point an equality already holds on the snow gets an idle row: a twin ≥ 0 row there is degenerate and
        // flips active every step, so the Gauss–Newton model never fits. Pressed, the lower waist edge is P's twin
        // whenever `along` sits at the mount.
        const heldOut = !regimes ? [ski.points.indexOf(ski.contact[lowEdge] ?? ski.centre)] : outPressed ? [2 + lowEdge] : g.contact[0].touch.flatMap((t) => heldAt(ski, lowEdge, t));
        const heldIn = lifts ? [] : inPressed ? [2 + (insideEdges[2 * k] ?? 0)] : [...heldAt(ski, insideEdges[2 * k] ?? 0, g.contact[1].touch[1]), ...heldAt(ski, insideEdges[2 * k + 1] ?? 0, g.contact[1].touch[0])];
        const q0 = q[0];
        if (q0 === undefined) throw new Error('missing coordinate');
        const idle = q0.mul(0).add(1);
        // Each base point where the ski bent at its goal radius has it, pressed or bridged.
        const row = (m: Rigid, p: Vec3, radius: number | null): Scalar => gapOver(surface, transform(m, radius === null ? p : bentAt(ski, p, radius)));
        return [
          ...ski.points.map((p, j) => (heldOut.includes(j) ? idle : row(out, p, regimes ? g.bend[0] : null))),
          ...ski.points.map((p, j) => (heldIn.includes(j) ? idle : row(ins, p, regimes ? g.bend[1] : null))),
        ] as Dual[];
      }),
      cycle.frameBlock({ name: `boots ${k}`, group: 'boot clearance', kind: BlockKind.Inequality, size: 20 }, [k], ([q = []]) => bootClearances(forward(q45(q), g.origin, LEGS, g.ref)) as Dual[]),
      cycle.frameBlock({ name: `skis ${k}`, group: 'ski clearance', kind: BlockKind.Inequality, size: 20 }, [k], ([q = []]) => skiClearances(forward(q45(q), g.origin, LEGS, g.ref), ski) as Dual[]),
      cycle.frameBlock({ name: `legs ${k}`, group: 'leg clearance', kind: BlockKind.Inequality, size: 20 }, [k], ([q = []]) => legClearances(forward(q45(q), g.origin, LEGS, g.ref)) as Dual[]),
    );
    // Two-footed: the pressed inside ski's P on the snow and its axis tangent there; bridged, tip and tail on the snow.
    if (!lifts)
      blocks.push(
        cycle.frameBlock({ name: `inside contact ${k}`, group: 'inside contact', kind: BlockKind.Equality, size: 2 }, [k], ([q = []]) => {
          const { ins } = legs(q);
          if (inPressed) {
            const p = transform(ins, pressedPoint(ski, insideEdges[2 * k] ?? 0, q[ALONG] ?? 0, g.bend[1]));
            return [gapOver(surface, p), dot3(bentAxis(ski, axisOf(ins, 2), axisOf(ins, 1), q[ALONG] ?? 0, g.bend[1]), normalOver(surface, p))] as Dual[];
          }
          const ends = [
            [g.contact[1].touch[1], insideEdges[2 * k] ?? 0],
            [g.contact[1].touch[0], insideEdges[2 * k + 1] ?? 0],
          ] as const;
          return ends.map(([t, e]) => gapOver(surface, transform(ins, bentAt(ski, edgePointAt(ski, e, t), g.bend[1])))) as Dual[];
        }),
      );
    blocks.push(
      cycle.frameBlock({ name: `inside ski ${k}`, group: 'inside ski', kind: BlockKind.Goal, size: lifts ? 2 : 1 }, [k], ([q = []]) => {
        const { ins } = legs(q);
        const yaw = mul(1 / PARALLEL_SIGMA, dot3(axisOf(ins, 2), a));
        return (lifts ? [mul(g.insideShare / INSIDE_GAP_SIGMA, gapOver(surface, transform(ins, ski.contact[insideEdges[2 * k] ?? 0] ?? ski.centre))), yaw] : [yaw]) as Dual[];
      }),
    );
    const R = g.resultant;
    // Two axes square to the resultant, for the balance's two rows.
    const e1 = normalise(crossN(R, g.forward));
    const e2 = crossN(R, e1);
    const pressure = (q: Dual[], w: Readonly<Record<string, Rigid>>): V3 => {
      const [po, pi] = pressuresOf(w, ski, g.edge, g.normal, q[ALONG] ?? 0);
      const s = g.insideShare;
      return [0, 1, 2].map((j) => add(mul(1 - s, po[j as 0 | 1 | 2]), mul(s, pi[j as 0 | 1 | 2]))) as unknown as V3;
    };
    blocks.push(
      cycle.frameBlock({ name: `balance ${k}`, group: 'balance', kind: BlockKind.Equality, size: 2 }, [k], ([q = []]) => {
        const w = forward(q45(q), g.origin, SEGMENT_NAMES, g.ref);
        const d = sub3(centreOfMassOf(w), pressure(q, w));
        return [dot3(d, e1), dot3(d, e2)] as Dual[];
      }),
      cycle.frameBlock({ name: `effort ${k}`, group: 'joint effort', kind: BlockKind.Goal, size: EFFORT_SIZE }, [k], ([q = []]) => {
        const w = forward(q45(q), g.origin, SEGMENT_NAMES, g.ref);
        return effortOf(g, q, w, pressuresOf(w, ski, g.edge, g.normal, q[ALONG] ?? 0)).map((e) => e.r) as Dual[];
      }),
      cycle.frameBlock({ name: `fore-aft ${k}`, group: 'fore-aft', kind: BlockKind.Goal, size: 1 }, [k], ([q = []]) => {
        const w = forward(q45(q), g.origin, SEGMENT_NAMES, g.ref);
        const foot = w['foot.R'];
        if (foot === undefined) throw new Error('foot.R not solved');
        const ahead = dot3(sub3(centreOfMassOf(w), foot.p), axisOf(skiFrame(w, Side.Right), 2));
        return [mul(1 / g.foreAftSigma, sub(ahead, g.foreAft))] as Dual[];
      }),
      cycle.frameBlock({ name: `stance ${k}`, group: 'stance width', kind: BlockKind.Goal, size: 1 }, [k], ([q = []]) => [
        mul(1 / STANCE_SIGMA, sub(mul(Math.cos(g.edge), q[GAP] ?? 0), g.stance)),
      ] as Dual[]),
    );
    const massHeight = g.clearance;
    if (massHeight !== null) {
      blocks.push(
        cycle.frameBlock({ name: `mass height ${k}`, group: 'mass height', kind: BlockKind.Goal, size: 1 }, [k], ([q = []]) => {
          const h = massHeightOf(forward(q45(q), g.origin, SEGMENT_NAMES, g.ref), ski, g, insideEdges[2 * k] ?? 0);
          return [mul(1 / MASS_HEIGHT_SIGMA, sub(h, massHeight))] as Dual[];
        }),
      );
    }
    const bands = task?.legacy.momentBands ?? null;
    const ev = profile?.events;
    if (bands !== null && ev !== undefined && g.t >= ev.engagement && g.t <= ev.release) {
      const force = outsideForceOf(g);
      const perKg = (q: Dual[]): ((name: string) => Scalar) => {
        const w = forward(q45(q), g.origin, SEGMENT_NAMES, g.ref);
        return perKgOf(g, q, w, pressuresOf(w, ski, g.edge, g.normal, q[ALONG] ?? 0));
      };
      blocks.push(cycle.frameBlock({ name: `moment band ${k}`, group: 'moment band', kind: BlockKind.Inequality, size: BAND_ROWS }, [k], ([q = []]) => momentBandRows(perKg(q), force) as Dual[]));
      if (k === Math.round(ev.forcePeak * S) % S)
        blocks.push(
          cycle.frameBlock({ name: `prior moments ${k}`, group: 'prior moments', kind: BlockKind.Prior, size: HEINRICH_2022_MOMENTS.length }, [k], ([q = []]) => momentPeakRows(perKg(q), force) as Dual[]),
        );
    }
    const bounded = NAMES.flatMap((_, i) => (Number.isFinite(jointLo[i] ?? -Infinity) && Number.isFinite(jointHi[i] ?? Infinity) && (jointHi[i] ?? 0) - (jointLo[i] ?? 0) > 2 * BARRIER && i < LEAD ? [i] : []));
    blocks.push(
      cycle.frameBlock({ name: `limit barrier ${k}`, group: 'limit barrier', kind: BlockKind.Goal, size: bounded.length }, [k], ([q = []]) =>
        bounded.map((i) => {
          const v = q[i];
          if (v === undefined) throw new Error('missing coordinate');
          const flex = KNEE_ROTATIONS.get(i);
          if (flex !== undefined) return kneeRotationBarrier(v, q[flex] ?? v.mul(0));
          const dl = (v.v - (jointLo[i] ?? 0)) / BARRIER;
          const dh = ((jointHi[i] ?? 0) - v.v) / BARRIER;
          // (1 − d/m)² inside the band, 0 beyond it: C1 at its edge. The cuff is no joint limit: no barrier.
          if (dl < 1) return v.sub(jointLo[i] ?? 0).mul(-1 / BARRIER).add(1).square();
          if (dh < 1) return v.neg().add(jointHi[i] ?? 0).mul(-1 / BARRIER).add(1).square();
          return v.mul(0);
        }),
      ),
    );
    // Measured derived quantities, like IK markers: their z² beside the coordinates' priors.
    for (const d of Object.values(Derived)) {
      const dp = derivedAt(pri, d, g.phase);
      if (dp !== null)
        blocks.push(
          cycle.frameBlock({ name: `prior ${d.replace('_', ' ')} ${k}`, group: `prior ${d}`, kind: BlockKind.Prior, size: 1 }, [k], ([q = []]) => [
            mul(1 / dp.sigma, sub(derivedOf(d, g, forward(q45(q), g.origin, SEGMENT_NAMES, g.ref)), dp.mu)),
          ] as Dual[]),
        );
    }
    COORDINATES.forEach((c, i) => {
      const p = priorFor(pri, g, c.name);
      if (p === null || c.kind === DofKind.Translation) return;
      blocks.push(prior(`prior ${c.name} ${k}`, [cycle.ref(k, i)], [p.mu], [p.sigma], `prior ${c.name.replace(/\.[RL]$/, '')}`));
    });
  });
  blocks.push(...cycle.smoothness(1 / (SMOOTH_SIGMA * (96 / S) ** 2)));
  const { lower, upper } = cycle.bounds(lo, hi);
  return { drill, intensity, kind, task, events: profile?.events ?? null, registration: registrationOf(drill, intensity), cycle, problem: { size: cycle.size, blocks, lower, upper, structure: cycle.structure }, goals, surface, prior: pri, ski, insideEdges, lower, upper };
};

/** arcLoad's key on A's profile: the fall-line load were the mass on the skis' arc of radius `skiRadius`. */
const profileArcLoad = (task: TurnTask, skiRadius: number): number => Math.hypot(task.speedMps ** 2 / (G * skiRadius), Math.cos(task.slopeDeg * DEG));

const derivedOf = (d: Derived, g: SkiGoal, w: Readonly<Record<string, Rigid>>): Scalar =>
  d === Derived.TrunkGravity ? trunkGravityOf(w, g.up) : d === Derived.TrunkAcross ? trunkAcrossOf(w, g.up, g.inside) : trunkPitchOf(w);

/** The two ankle joint centres' midpoint, the path point every kind pins. */
export const ankleMidOf = (w: Readonly<Record<string, Rigid>>): V3 => {
  const [r, l] = [w['foot.R'], w['foot.L']];
  if (r === undefined || l === undefined) throw new Error('feet not solved');
  return [mul(0.5, add(r.p[0], l.p[0])), mul(0.5, add(r.p[1], l.p[1])), mul(0.5, add(r.p[2], l.p[2]))];
};

/** Pelvis translation that puts the stance centre (the ankles' midpoint, B3's pin) on the goal, the rest of q held. */
const placePelvis = (tp: TurnProblem, k: number, q: number[]): void => {
  const g = tp.goals[k];
  if (g === undefined) return;
  for (const name of ['pelvis_tx', 'pelvis_ty', 'pelvis_tz']) q[at(name)] = 0;
  const w = forward(q.slice(0, LEAD), g.origin, LEGS, g.ref);
  const c = transform(skiFrame(w, Side.Right), tp.ski.centre).map(value);
  const ci = transform(skiFrame(w, Side.Left), tp.ski.centre).map(value);
  const m = ankleMidOf(w).map(value);
  // Lift a little so the start is clear of the snow.
  ['pelvis_tx', 'pelvis_ty', 'pelvis_tz'].forEach((name, j) => (q[at(name)] = (g.origin[j] ?? 0) - (m[j] ?? 0) + (j === 1 ? 0.05 : 0)));
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
      const p = i < LEAD && g !== undefined ? priorFor(tp.prior, g, name) : null;
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

/** Solved values at one phase event (motion-model §4.7), the nearest frame's; radians, BW, leg lengths. */
export interface EventValues {
  readonly t: number;
  /** Outside ski's edge, edgeOf. */
  readonly edge: number;
  readonly leanGoal: number;
  readonly loadGoal: number;
  /** Carving: the sidecut's arc on the solved edge, k R_sc cos ε; else the profile's, metres. */
  readonly skiRadius: number;
  readonly counter: number;
  readonly insideLead: number;
  readonly outsideKnee: number;
  readonly insideKnee: number;
  readonly outsideAnkle: number;
  readonly pelvisList: number;
  readonly comHeight: number;
}
export type EventName = keyof TurnEvents;
const EVENT_NAMES: ReadonlyArray<EventName> = ['switch', 'engagement', 'fallLine', 'forcePeak', 'release'];

/**
 * heinrich-2022 Table 1's kinematic split, deg: min/max over the whole turn, global frame. Pelvis list is his raw
 * value (our list > 0 tilts toward the turn centre); bending is negated, as ours bends opposite to list (FK).
 */
export const HEINRICH_2022_SPLIT: ReadonlyArray<{ readonly label: string; readonly names: ReadonlyArray<string>; readonly lo: number; readonly hi: number }> = [
  { label: 'outside hip adduction', names: ['hip_adduction.R'], lo: -27.0, hi: -2.6 },
  { label: 'pelvis list', names: ['pelvis_list'], lo: 14.6, hi: 33.4 },
  { label: 'lumbar + thoracic bending', names: ['lumbar_bending', 'thoracic_bending'], lo: -0.4, hi: 4.6 },
];
/** heinrich-2022 Table 2's knee rotation moments, N·m/kg, internal +: reported beside the solve, not banded. */
export const HEINRICH_2022_KNEE_ROTATION: ReadonlyArray<{ readonly label: string; readonly name: string; readonly lo: number; readonly hi: number }> = [
  { label: 'outside', name: 'knee_rotation.R', lo: -0.08, hi: 0.22 },
  { label: 'inside', name: 'knee_rotation.L', lo: 0.05, hi: 0.28 },
];
const REPORTED_MOMENTS: ReadonlySet<string> = new Set(HEINRICH_2022_KNEE_ROTATION.map((row) => row.name));
/** heinrich-2022 Table 1's inside hip, deg; abduction and external rotation negative. */
export const HEINRICH_2022_INSIDE_HIP: ReadonlyArray<{ readonly label: string; readonly name: string; readonly lo: number; readonly hi: number }> = [
  { label: 'flexion', name: 'hip_flexion.L', lo: 70, hi: 117 },
  { label: 'adduction', name: 'hip_adduction.L', lo: -13, hi: 11 },
  { label: 'rotation', name: 'hip_rotation.L', lo: -26, hi: -10 },
];

/** Solved values at the cell's force-peak frame. */
export interface PeakValues {
  readonly t: number;
  /** Outside ski force, BW. */
  readonly force: number;
  /** Whether the kind holds the moment bands and point rows. */
  readonly banded: boolean;
  /** Per heinrich-2022 moment target: the solved N·m/kg per BW of outside force and its point-row z, banded or not. */
  readonly moments: ReadonlyArray<{ readonly target: MomentTarget; readonly perBW: number; readonly z: number }>;
  /** Inside hip rotation moment, N·m/kg, internal +. */
  readonly insideHipRotation: number;
  /** HEINRICH_2022_KNEE_ROTATION's moments, N·m/kg per BW of outside force. */
  readonly kneeRotation: ReadonlyArray<number>;
  /** HEINRICH_2022_SPLIT's rows, coordinates summed, radians. */
  readonly split: ReadonlyArray<number>;
  /** HEINRICH_2022_INSIDE_HIP's rows, radians, beside the prior's μ (null without one). */
  readonly insideHip: ReadonlyArray<{ readonly q: number; readonly mu: number | null }>;
}

export interface TurnReport {
  /** Most |gap| of the outside ski's pressure point, bridged its tip and tail lower edges (legacy: its lower contact edge), metres. */
  readonly outsideContact: number;
  /** Most |gap| of the inside ski's lower edge at tip and tail (pressed: its pressure point), metres. */
  readonly insideContact: number;
  /** Least base-point height over the snow plus its bend sagitta (legacy: none), both skis, metres. */
  readonly lowestBase: number;
  /** Most bend a base point uses to reach the snow, clamp(−gap, 0, sagitta), metres. */
  readonly bendLift: number;
  /** Bend radius per frame, outside and inside ski, metres. */
  readonly bendOut: ReadonlyArray<number>;
  readonly bendIn: ReadonlyArray<number>;
  /** Per frame, outside and inside ski pressed (true) or bridged; null on the legacy path and lifted drills. */
  readonly pressed: ReadonlyArray<readonly [boolean, boolean]> | null;
  /** At the force peak, outside and inside: the curvature the whole edge needs and the load's, 1/m. */
  readonly curvatureAtPeak: { readonly required: readonly [number, number]; readonly bend: readonly [number, number] } | null;
  /** Most distance of the outside edge outside its goal band (the goal edge itself where the band is closed), radians. */
  readonly edgeError: number;
  /** Outside edge less the mass path's lean over the loaded frames, radians; [0, 0] on the legacy path. */
  readonly edgeMargin: Range;
  /** Pelvis yaw less the outside ski's, + toward the turn's outside, radians. */
  readonly counter: Range;
  /** Pelvis yaw off the fall line, + toward +x, radians. */
  readonly pelvisToFall: Range;
  /** Per frame, radians past the counter band while loaded; 0 inside it or unloaded. */
  readonly counterExcess: ReadonlyArray<number>;
  /** Solved values at the kind's phase events; null on the legacy path. */
  readonly atEvents: Readonly<Record<EventName, EventValues>> | null;
  /** At the force peak; null on the legacy path. */
  readonly peak: PeakValues | null;
  /** The fore-aft goal's mean over the frames, metres. */
  readonly foreAftGoal: Range;
  /** Per frame, outside then inside ski edge, radians. */
  readonly edges: ReadonlyArray<readonly [number, number]>;
  /** Per frame: the goal's rise (m), the prior's inside−outside knee μ, and the source's raw knee and hip μ differences (rad). */
  readonly fold: ReadonlyArray<{ readonly rise: number; readonly knee: number; readonly sourceKnee: number; readonly sourceHip: number }>;
  /** Share of the inside hip's coordinate prior rows within 2σ. */
  readonly insideHipWithin2Sigma: number;
  /** Inside edge less the outside's, radians. */
  readonly edgeDifference: Range;
  /** Subtalar inversion over the cycle, right then left, radians. */
  readonly inversion: readonly [Range, Range];
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
  /** Outside and inside shin pitch off the ski base's normal, radians. */
  readonly shin: readonly [Range, Range];
  readonly pelvisList: Range;
  /** Pelvis vertical axis's lean across the outside ski's track, toward +x, radians. */
  readonly pelvisLean: Range;
  /** Hip centre ahead of the two ankles' midpoint along the outside ski, metres. */
  readonly pelvisAhead: Range;
  /** Total trunk (pelvis to C7/T1) pitch off the snow normal toward the heading, radians. */
  readonly trunkPitch: Range;
  /** Total trunk pitch off the resultant toward the heading, in their plane, radians. */
  readonly trunkPitchR: Range;
  /** Total trunk pitch as measured (trunkPitchOf: off the skis' base normal along their axis), radians. */
  readonly trunkPitchSki: Range;
  /** Total trunk angle off gravity (trunkGravityOf), radians. */
  readonly trunkGravity: Range;
  /** Trunk across the heading against gravity, + inside (trunkAcrossOf), radians. */
  readonly trunkAcross: Range;
  /** Total trunk angle off the snow normal, radians. */
  readonly trunkNormal: Range;
  /** Hip centre ahead of the pressure centre, square to the resultant along the heading, metres. */
  readonly hipOverPressure: Range;
  /** Share of prior terms within 2σ. */
  readonly priorWithin2Sigma: number;
  /** Worst prior terms, in σ. */
  readonly priorWorst: ReadonlyArray<{ readonly name: string; readonly t: number; readonly z: number }>;
  /** Largest joint efforts, τ over its maximum. */
  readonly effortWorst: ReadonlyArray<{ readonly name: string; readonly t: number; readonly z: number }>;
  /** Σ effort² over Σ prior z², the cost's two shares. */
  readonly effortCost: number;
  readonly priorCost: number;
  readonly lead: Range;
  readonly gap: Range;
}

const rangeOf = (xs: ReadonlyArray<number>): Range => [Math.min(...xs), Math.max(...xs)];

export const reportOf = (tp: TurnProblem, x: ArrayLike<number>): TurnReport => {
  const frames = tp.cycle.unpack(x);
  let outsideContact = 0;
  let insideContact = 0;
  let lowestBase = Infinity;
  let bendLift = 0;
  const regimes = tp.kind !== null && !LIFTS_INSIDE.has(tp.drill);
  let edgeError = 0;
  let limitExcess = 0;
  let balance = 0;
  let bootClearance = Infinity;
  let skiClearance = Infinity;
  let inside = 0;
  let total = 0;
  const worst: { name: string; t: number; z: number }[] = [];
  const efforts: { name: string; t: number; z: number }[] = [];
  const margins: number[] = [];
  const counterExcess: number[] = [];
  const perFrame: Omit<EventValues, 't' | 'insideLead' | 'comHeight'>[] = [];
  const edges: Array<readonly [number, number]> = [];
  const hipRows = { inside: 0, total: 0 };
  const peakK = tp.events === null ? -1 : Math.round(tp.events.forcePeak * tp.goals.length) % tp.goals.length;
  let peak: PeakValues | null = null;
  const series: Record<'counter' | 'toFall' | 'lead' | 'gap' | 'edge' | 'com' | 'foreAft' | 'along' | 'stance' | 'knee' | 'list' | 'lean' | 'shinOut' | 'shinIn' | 'pelvisAhead' | 'trunk' | 'trunkR' | 'trunkSki' | 'trunkG' | 'trunkA' | 'trunkN' | 'hip' | 'invR' | 'invL', number[]> = {
    counter: [],
    toFall: [],
    lead: [],
    gap: [],
    edge: [],
    com: [],
    foreAft: [],
    along: [],
    stance: [],
    knee: [],
    list: [],
    lean: [],
    shinOut: [],
    shinIn: [],
    pelvisAhead: [],
    trunk: [],
    trunkR: [],
    trunkSki: [],
    trunkG: [],
    trunkA: [],
    trunkN: [],
    hip: [],
    invR: [],
    invL: [],
  };
  tp.goals.forEach((g, k) => {
    const q = Array.from(frames[k] ?? []);
    const w = forward(q.slice(0, LEAD), g.origin, SEGMENT_NAMES, g.ref);
    const out = skiFrame(w, Side.Right);
    const ins = skiFrame(w, Side.Left);
    const low = g.edge >= 0 ? 0 : 1;
    const along = q[ALONG] ?? 0;
    if (regimes) {
      const [po, pi] = g.pressed;
      const outGaps = po ? [gapOver(tp.surface, transform(out, pressedPoint(tp.ski, low, along, g.bend[0])))] : g.contact[0].touch.map((a) => gapOver(tp.surface, transform(out, bentAt(tp.ski, edgePointAt(tp.ski, low, a), g.bend[0]))));
      for (const gap of outGaps) outsideContact = Math.max(outsideContact, Math.abs(value(gap)));
      const inGaps = pi
        ? [gapOver(tp.surface, transform(ins, pressedPoint(tp.ski, tp.insideEdges[2 * k] ?? 0, along, g.bend[1])))]
        : [gapOver(tp.surface, transform(ins, bentAt(tp.ski, edgePointAt(tp.ski, tp.insideEdges[2 * k] ?? 0, g.contact[1].touch[1]), g.bend[1]))), gapOver(tp.surface, transform(ins, bentAt(tp.ski, edgePointAt(tp.ski, tp.insideEdges[2 * k + 1] ?? 0, g.contact[1].touch[0]), g.bend[1])))];
      for (const gap of inGaps) insideContact = Math.max(insideContact, Math.abs(value(gap)));
      for (const [m, radius] of [[out, g.bend[0]], [ins, g.bend[1]]] as const)
        for (const p of tp.ski.points) {
          const gap = value(gapOver(tp.surface, transform(m, p)));
          const sag = sagittaAt(tp.ski, p, radius);
          lowestBase = Math.min(lowestBase, gap + sag);
          bendLift = Math.max(bendLift, Math.min(Math.max(-gap, 0), sag));
        }
    } else {
      outsideContact = Math.max(outsideContact, Math.abs(value(gapOver(tp.surface, transform(out, tp.ski.contact[low])))));
      for (const gap of insideEndGaps(tp.surface, ins, tp.ski)) insideContact = Math.max(insideContact, Math.abs(value(gap)));
      for (const m of [out, ins]) for (const p of tp.ski.points) lowestBase = Math.min(lowestBase, value(gapOver(tp.surface, transform(m, p))));
    }
    const eo = value(edgeOf(out, g.normal));
    edgeError = Math.max(edgeError, eo - g.edgeMax, g.edgeMin - eo, 0);
    if (tp.kind !== null && g.arcShare > 0.5) margins.push(eo - g.lean);
    const counter = value(counterOf(w, g.normal));
    series.counter.push(counter);
    series.toFall.push(value(pelvisToFallOf(w, g.normal)));
    const held = g.arcShare > 0.5 ? value(bandCounterOf(g, w)) : null;
    counterExcess.push(held === null ? 0 : Math.max(0, g.counterMin - held, held - g.counterMax));
    const ski = tp.kind === null || tp.task === null ? null : tp.task.ski;
    perFrame.push({
      edge: eo,
      leanGoal: g.lean,
      loadGoal: g.load,
      skiRadius:
        tp.task !== null && tp.task.skidShare === 0 && ski !== null
          ? carvedRadius(ski, Math.abs(eo), SNOW_COMPLIANCE[snowOf(tp.task)] * g.load * REFERENCE_SKIER.mass * G * tp.task.style.outsideShare)
          : tp.kind !== null && tp.task !== null
            ? turnProfile(tp.task, snowOf(tp.task)).at(g.t).skiRadius
            : 0,
      counter,
      outsideKnee: q[at('knee_flexion.R')] ?? 0,
      insideKnee: q[at('knee_flexion.L')] ?? 0,
      outsideAnkle: q[at('ankle_dorsiflexion.R')] ?? 0,
      pelvisList: q[at('pelvis_list')] ?? 0,
    });
    const ei = value(edgeOf(ins, g.normal));
    series.edge.push(ei - eo);
    edges.push([eo, ei]);
    q.forEach((v, i) => (limitExcess = Math.max(limitExcess, (tp.lower[k * N + i] ?? -Infinity) - v, v - (tp.upper[k * N + i] ?? Infinity))));
    for (const c of bootClearances(w)) bootClearance = Math.min(bootClearance, value(c));
    for (const c of skiClearances(w, tp.ski)) skiClearance = Math.min(skiClearance, value(c));
    const com = centreOfMassOf(w).map(value);
    const [po, pi] = pressuresOf(w, tp.ski, g.edge, g.normal, along).map((p) => p.map(value)) as [number[], number[]];
    for (const e of effortOf(g, q, w, [po, pi] as unknown as readonly [V3, V3])) efforts.push({ name: e.name, t: g.t, z: value(e.r) });
    if (k === peakK) {
      const perKg = perKgOf(g, q, w, [po, pi] as unknown as readonly [V3, V3]);
      const force = outsideForceOf(g);
      peak = {
        t: g.t,
        force,
        banded: (tp.task?.legacy.momentBands ?? null) !== null,
        moments: HEINRICH_2022_MOMENTS.map((target) => ({ target, perBW: value(perKg(target.name)) / force, z: value(momentPeakRows(perKg, force, [target])[0] ?? 0) })),
        insideHipRotation: value(perKg('hip_rotation.L')),
        kneeRotation: HEINRICH_2022_KNEE_ROTATION.map((row) => value(perKg(row.name)) / force),
        split: HEINRICH_2022_SPLIT.map((row) => row.names.reduce((a, n) => a + (q[at(n)] ?? 0), 0)),
        insideHip: HEINRICH_2022_INSIDE_HIP.map((row) => ({ q: q[at(row.name)] ?? 0, mu: priorFor(tp.prior, g, row.name)?.mu ?? null })),
      };
    }
    const d = [0, 1, 2].map((j) => (com[j] ?? 0) - (1 - g.insideShare) * (po[j] ?? 0) - g.insideShare * (pi[j] ?? 0));
    const h = dotN(d, g.resultant);
    balance = Math.max(balance, Math.acos(Math.min(1, h / Math.hypot(...d))));
    // Heading square to the resultant.
    const fr0 = dotN(g.forward, g.resultant);
    const headR = normalise([0, 1, 2].map((j) => g.forward[j as 0 | 1 | 2] - fr0 * g.resultant[j as 0 | 1 | 2]) as unknown as Vec3);
    series.com.push(h / LEG_LENGTH);
    const foot = w['foot.R'];
    series.foreAft.push(foot === undefined ? 0 : dotN([0, 1, 2].map((j) => (com[j] ?? 0) - value(foot.p[j as 0 | 1 | 2])), axisOf(out, 2).map(value)));
    series.along.push(along);
    series.stance.push(Math.cos(g.edge) * (q[GAP] ?? 0));
    series.knee.push((q[at('knee_flexion.R')] ?? 0) - (q[at('knee_flexion.L')] ?? 0));
    series.list.push(q[at('pelvis_list')] ?? 0);
    const pelvis = w['pelvis'];
    if (pelvis !== undefined) series.lean.push(Math.asin(value(dot3(axisOf(pelvis, 1), g.across))));
    const [fr, fl, neck] = [w['foot.R'], w['foot.L'], w['neck']];
    if (pelvis !== undefined && fr !== undefined && fl !== undefined) {
      const feet = [0, 1, 2].map((j) => (value(fr.p[j as 0 | 1 | 2]) + value(fl.p[j as 0 | 1 | 2])) / 2);
      series.pelvisAhead.push(dotN([0, 1, 2].map((j) => value(pelvis.p[j as 0 | 1 | 2]) - (feet[j] ?? 0)), axisOf(out, 2).map(value)));
    }
    const [hr, hl] = [w['femur.R'], w['femur.L']];
    if (hr !== undefined && hl !== undefined) {
      const centre = [0, 1, 2].map((j) => (value(hr.p[j as 0 | 1 | 2]) + value(hl.p[j as 0 | 1 | 2])) / 2);
      const pc = [0, 1, 2].map((j) => (1 - g.insideShare) * (po[j] ?? 0) + g.insideShare * (pi[j] ?? 0));
      series.hip.push(dotN([0, 1, 2].map((j) => (centre[j] ?? 0) - (pc[j] ?? 0)), headR));
    }
    if (pelvis !== undefined && neck !== undefined) {
      const t = [0, 1, 2].map((j) => value(neck.p[j as 0 | 1 | 2]) - value(pelvis.p[j as 0 | 1 | 2]));
      series.trunk.push(Math.atan2(dotN(t, g.forward), dotN(t, g.normal)));
      series.trunkR.push(Math.atan2(dotN(t, headR), dotN(t, g.resultant)));
      series.trunkN.push(Math.acos(Math.min(1, dotN(t, g.normal) / Math.hypot(...t))));
    }
    series.trunkSki.push(value(trunkPitchOf(w)));
    series.trunkG.push(value(trunkGravityOf(w, g.up)));
    series.trunkA.push(value(trunkAcrossOf(w, g.up, g.inside)));
    for (const name of Object.values(Derived)) {
      const dp = derivedAt(tp.prior, name, g.phase);
      if (dp === null) continue;
      const z = (value(derivedOf(name, g, w)) - dp.mu) / dp.sigma;
      total++;
      if (Math.abs(z) <= 2) inside++;
      worst.push({ name, t: g.t, z });
    }
    series.shinOut.push(value(shinPitch(w, Side.Right)));
    series.shinIn.push(value(shinPitch(w, Side.Left)));
    series.lead.push(q[LEAD] ?? 0);
    series.gap.push(q[GAP] ?? 0);
    series.invR.push(q[at('subtalar_inversion.R')] ?? 0);
    series.invL.push(q[at('subtalar_inversion.L')] ?? 0);
    COORDINATES.forEach((c, i) => {
      const p = priorFor(tp.prior, g, c.name);
      if (p === null || c.kind === DofKind.Translation) return;
      const z = ((q[i] ?? 0) - p.mu) / p.sigma;
      total++;
      if (Math.abs(z) <= 2) inside++;
      if (/^hip_.*\.L$/.test(c.name)) {
        hipRows.total++;
        if (Math.abs(z) <= 2) hipRows.inside++;
      }
      worst.push({ name: c.name, t: g.t, z });
    });
  });
  const S = tp.goals.length;
  const atEvents =
    tp.events === null
      ? null
      : (Object.fromEntries(
          EVENT_NAMES.map((name) => {
            const k = Math.round((tp.events?.[name] ?? 0) * S) % S;
            const f = perFrame[k];
            if (f === undefined) throw new Error(`no frame ${k}`);
            return [name, { ...f, t: tp.goals[k]?.t ?? 0, insideLead: series.lead[k] ?? 0, comHeight: series.com[k] ?? 0 }];
          }),
        ) as Record<EventName, EventValues>);
  const priorCost = worst.reduce((c, w) => c + w.z * w.z, 0);
  const effortCost = efforts.reduce((c, e) => c + e.z * e.z, 0);
  worst.sort((a, b) => Math.abs(b.z) - Math.abs(a.z));
  efforts.sort((a, b) => Math.abs(b.z) - Math.abs(a.z));
  const gp = tp.goals[peakK];
  return {
    outsideContact,
    insideContact,
    lowestBase,
    bendLift,
    bendOut: tp.goals.map((g) => g.bend[0]),
    bendIn: tp.goals.map((g) => g.bend[1]),
    pressed: regimes ? tp.goals.map((g) => g.pressed) : null,
    curvatureAtPeak: regimes && gp !== undefined ? { required: gp.required, bend: [1 / gp.bend[0], 1 / gp.bend[1]] } : null,
    edgeError,
    edgeMargin: margins.length === 0 ? [0, 0] : rangeOf(margins),
    counter: rangeOf(series.counter),
    pelvisToFall: rangeOf(series.toFall),
    counterExcess,
    atEvents,
    peak,
    foreAftGoal: rangeOf(tp.goals.map((g) => g.foreAft)),
    edges,
    fold: tp.goals.map((g) => {
      const mu = (name: string): number => priorAt(tp.prior, name, g.phase)?.mu ?? 0;
      return { rise: g.rise, knee: (priorFor(tp.prior, g, 'knee_flexion.L')?.mu ?? 0) - mu('knee_flexion.R'), sourceKnee: mu('knee_flexion.L') - mu('knee_flexion.R'), sourceHip: mu('hip_flexion.L') - mu('hip_flexion.R') };
    }),
    insideHipWithin2Sigma: hipRows.total === 0 ? 1 : hipRows.inside / hipRows.total,
    edgeDifference: rangeOf(series.edge),
    inversion: [rangeOf(series.invR), rangeOf(series.invL)],
    limitExcess,
    balance,
    bootClearance,
    skiClearance,
    comHeight: rangeOf(series.com),
    foreAft: rangeOf(series.foreAft),
    pressureAlong: rangeOf(series.along),
    stance: rangeOf(series.stance),
    kneeDifference: rangeOf(series.knee),
    shin: [rangeOf(series.shinOut), rangeOf(series.shinIn)],
    pelvisList: rangeOf(series.list),
    pelvisLean: rangeOf(series.lean),
    pelvisAhead: rangeOf(series.pelvisAhead),
    trunkPitch: rangeOf(series.trunk),
    trunkPitchR: rangeOf(series.trunkR),
    trunkPitchSki: rangeOf(series.trunkSki),
    trunkGravity: rangeOf(series.trunkG),
    trunkAcross: rangeOf(series.trunkA),
    trunkNormal: rangeOf(series.trunkN),
    hipOverPressure: rangeOf(series.hip),
    priorWithin2Sigma: total === 0 ? 1 : inside / total,
    priorWorst: worst.slice(0, 5),
    effortWorst: efforts.slice(0, 5),
    effortCost,
    priorCost,
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

/** Multiplier above which a resting edge is pushing back, so the ski would roll over onto it (inferred, numerical). */
const PUSHING = 1e-6;
/** Most re-picks of the inside edges before giving up. */
const MAX_PICKS = 4;

/** Flips each inside end whose other edge sits on the snow pushing back, zeroing its stale multipliers; true when any flipped. */
const repick = (tp: TurnProblem, result: SolveResult): boolean => {
  const P = tp.ski.points.length;
  const pinned = new Map([...result.multipliers].map(([b, lam]) => [b.name, lam] as const));
  let flipped = false;
  for (const [b, lam] of result.multipliers) {
    const m = /^contact (\d+)$/.exec(b.name);
    if (m === null) continue;
    const k = Number(m[1]);
    for (const end of [0, 1] as const) {
      const e = tp.insideEdges[2 * k + end] ?? 0;
      if ((lam[P + 4 * end + 1 - e] ?? 0) <= PUSHING) continue;
      tp.insideEdges[2 * k + end] = 1 - e;
      lam[P + 4 * end + 1 - e] = 0;
      const pin = pinned.get(`inside contact ${k}`);
      if (pin !== undefined) pin[end] = 0;
      flipped = true;
    }
  }
  return flipped;
};

/** Per frame and end, the inside ski's lower edge: the goal edge's side once edged, else whichever sits lower in pose `x`. */
export const pickEdges = (tp: TurnProblem, x: ArrayLike<number>): void =>
  tp.goals.forEach((g, k) => {
    if (Math.abs(g.edge) >= PRESSURE_EDGE_DEG * DEG) {
      tp.insideEdges.fill(g.edge >= 0 ? 0 : 1, 2 * k, 2 * k + 2);
      return;
    }
    const q = Array.from({ length: LEAD }, (_, i) => x[k * N + i] ?? 0);
    const ins = skiFrame(forward(q, g.origin, LEGS, g.ref), Side.Left);
    for (const end of [0, 1] as const) {
      const [a, b] = [0, 1].map((e) => value(gapOver(tp.surface, transform(ins, tp.ski.points[4 * end + e] ?? tp.ski.centre))));
      tp.insideEdges[2 * k + end] = (a ?? 0) <= (b ?? 0) ? 0 : 1;
    }
  });

export const solveTurn = (tp: TurnProblem, x0: ArrayLike<number> = seedFor(tp, SeedKind.Prior), options: SolveOptions = {}): TurnMotion => {
  const start = performance.now();
  const opts = { maxIterations: 300, tolCost: 1e-9, tolConstraint: 1e-7, ...options };
  // From the prior seed whatever the start, so every start solves the same problem.
  pickEdges(tp, seedFor(tp, SeedKind.Prior));
  let result = solve(tp.problem, x0, opts);
  let [iterations, outer] = [result.iterations, result.outer];
  // A feasible solve that ran out of outer steps resumes warm too.
  for (let n = 0; n < MAX_PICKS && (repick(tp, result) || (result.feasible && !result.converged)); n++) {
    // An infeasible solve's multipliers have run away on the wrong edges, so only a feasible one warms the next.
    result = solve(tp.problem, result.x, result.feasible ? { ...opts, multipliers: result.multipliers, penalty: result.penalty } : opts);
    iterations += result.iterations;
    outer += result.outer;
  }
  result = { ...result, iterations, outer };
  const milliseconds = performance.now() - start;
  return { problem: tp, result, q: tp.cycle.unpack(result.x), report: reportOf(tp, result.x), diagnosis: diagnose(tp.problem, result), milliseconds };
};

const f3 = (x: number, d = 3): string => x.toFixed(d);
const deg = (r: Range): string => `${f3(r[0] / DEG, 1)}..${f3(r[1] / DEG, 1)}`;
const cm = (r: Range): string => `${f3(r[0] * 100, 1)}..${f3(r[1] * 100, 1)}`;
/** Reference boot sole length, metres (refskier notes: Horishima). */
const BSL = 0.295;

/** Section D and G5 lines: registration, fore-aft goal, force-peak moments and kinematics, per-frame edges. */
const peakLines = (r: TurnReport, p: TurnProblem): string[] => {
  const d = (x: number): string => f3(x / DEG, 1);
  const reg = p.registration;
  const pk = r.peak;
  return [
    `registration ${reg === null ? 'none (φ = t)' : reg.pairs.map(([t, phi]) => `${f3(t, 2)}→${f3(phi, 2)}`).join(', ')}${reg !== null && reg.dropped.length > 0 ? `; dropped ${reg.dropped.join(', ')}` : ''}`,
    `fore-aft ${cm(r.foreAft)} cm vs goal ${cm(r.foreAftGoal)} cm`,
    ...(pk === null
      ? []
      : [
          `force peak @${f3(pk.t, 2)}, outside ${f3(pk.force, 2)} BW: ${pk.banded ? '' : 'unbanded, '}${pk.moments.map((m) => `${m.target.label} ${f3(m.perBW, 2)} (heinrich ${f3(m.target.peak, 2)}, band ${f3(m.target.lo, 2)}..${f3(m.target.hi, 2)}, z ${f3(m.z, 1)})`).join('; ')} N·m/kg per BW`,
          `  inside hip rotation moment ${f3(pk.insideHipRotation, 2)} N·m/kg (internal +, heinrich ≤ 0.23)`,
          `  knee rotation moment: ${HEINRICH_2022_KNEE_ROTATION.map((row, i) => `${row.label} ${f3(pk.kneeRotation[i] ?? 0, 2)} (Table 2 ${row.lo}..${row.hi})`).join(', ')} N·m/kg per BW, internal +`,
          `  split: ${HEINRICH_2022_SPLIT.map((row, i) => `${row.label} ${d(pk.split[i] ?? 0)}° (Table 1 ${row.lo}..${row.hi})`).join(', ')}`,
          `  inside hip: ${HEINRICH_2022_INSIDE_HIP.map((row, i) => { const h = pk.insideHip[i]; return `${row.label} ${d(h?.q ?? 0)}° (μ ${h?.mu == null ? '—' : d(h.mu)}, Table 1 ${row.lo}..${row.hi})`; }).join(', ')}; inside hip priors within 2σ ${f3(r.insideHipWithin2Sigma * 100, 1)} %`,
        ]),
    `edges out/in °: ${r.edges.map(([o, i]) => `${d(o)}/${d(i)}`).join(' ')}`,
    `inside fold rise cm / Δκ° / source knee Δ° / source hip Δ°: ${r.fold.map((f) => `${f3(f.rise * 100, 1)}/${d(f.knee)}/${d(f.sourceKnee)}/${d(f.sourceHip)}`).join(' ')}`,
  ];
};

export const formatTurn = (m: TurnMotion): string => {
  const r = m.report;
  const p = m.problem;
  return [
    `${p.drill} ${p.intensity}: ${p.cycle.size} variables, ${p.problem.blocks.length} blocks; ${m.result.iterations} iterations, ${m.result.outer} outer, ${f3(m.milliseconds / 1000, 1)} s; converged ${m.result.converged}, feasible ${m.result.feasible}, violation ${m.result.violation.toExponential(1)}`,
    `outside contact ${f3(r.outsideContact * 1000)} mm, lowest base ${f3(r.lowestBase * 1000)} mm, bend lift ${f3(r.bendLift * 1000, 1)} mm, edge error ${f3(r.edgeError / DEG)}°, limit excess ${r.limitExcess.toExponential(1)}`,
    `prior within 2σ ${f3(r.priorWithin2Sigma * 100, 1)} %, worst ${r.priorWorst.map((w) => `${w.name}@${f3(w.t, 2)} ${f3(w.z, 1)}σ`).join(', ')}`,
    `effort Σ ${f3(r.effortCost, 1)} vs prior Σz² ${f3(r.priorCost, 1)}, largest ${r.effortWorst.map((w) => `${w.name}@${f3(w.t, 2)} ${f3(w.z, 2)}`).join(', ')}`,
    `inside contact ${f3(r.insideContact * 1000)} mm, balance ${f3(r.balance / DEG, 2)}°, boot clearance ${f3(r.bootClearance * 1000, 1)} mm, ski clearance ${f3(r.skiClearance * 1000, 1)} mm, inside−outside edge ${deg(r.edgeDifference)}°, inside edge play max ${f3(Math.max(...r.edgeDifference.map(Math.abs)) / DEG, 1)}°, inversion R ${deg(r.inversion[0])}° L ${deg(r.inversion[1])}°`,
    `CoM height ${f3(r.comHeight[0])}..${f3(r.comHeight[1])} legs, fore-aft ${cm(r.foreAft)} cm, pressure along ${cm(r.pressureAlong)} cm, stance ${cm(r.stance)} cm`,
    `inside lead ${f3(r.lead[0] / BSL, 2)}..${f3(r.lead[1] / BSL, 2)} BSL, gap ${cm(r.gap)} cm, knee O−I ${deg(r.kneeDifference)}°, shin O ${deg(r.shin[0])}° I ${deg(r.shin[1])}°, pelvis list ${deg(r.pelvisList)}° lean ${deg(r.pelvisLean)}°`,
    `pelvis vs feet ${cm(r.pelvisAhead)} cm (${f3(r.pelvisAhead[0] / BSL, 2)}..${f3(r.pelvisAhead[1] / BSL, 2)} BSL), total trunk pitch ${deg(r.trunkPitch)}° off the snow normal, ${deg(r.trunkPitchSki)}° off the ski base (as measured)`,
    `trunk off gravity ${deg(r.trunkGravity)}°, across ${deg(r.trunkAcross)}° (+ inside), off the snow normal ${deg(r.trunkNormal)}°`,
    `vs the resultant: trunk pitch ${deg(r.trunkPitchR)}°, hip centre over the pressure centre ${cm(r.hipOverPressure)} cm (${f3(r.hipOverPressure[0] / BSL, 2)}..${f3(r.hipOverPressure[1] / BSL, 2)} BSL)`,
    ...(p.kind === null
      ? []
      : [
          ...(r.pressed === null
            ? []
            : [
                `regimes (P pressed, b bridged) out ${r.pressed.map(([o]) => (o ? 'P' : 'b')).join('')} in ${r.pressed.map(([, i]) => (i ? 'P' : 'b')).join('')}${r.curvatureAtPeak === null ? '' : `; at the force peak κ_req ${r.curvatureAtPeak.required.map((v) => f3(v, 4)).join('/')}, κ_bend ${r.curvatureAtPeak.bend.map((v) => f3(v, 4)).join('/')} 1/m (out/in)`}`,
              ]),
          `${p.kind}: loaded edge margin ${deg(r.edgeMargin)}°, counter ${deg(r.counter)}° (+ outside), pelvis off the fall line ${deg(r.pelvisToFall)}°`,
          ...EVENT_NAMES.map((name) => {
            const e = r.atEvents?.[name];
            if (e === undefined) return name;
            const d = (x: number): string => f3(x / DEG, 1);
            const kb = Math.round(e.t * r.bendOut.length) % r.bendOut.length;
            return `  ${name}@${f3(e.t, 2)}: R bend ${f3(r.bendOut[kb] ?? 0, 2)}/${f3(r.bendIn[kb] ?? 0, 2)} m, edge ${d(e.edge)}° (lean ${d(e.leanGoal)}°, load ${f3(e.loadGoal, 2)} BW, r_ski ${f3(e.skiRadius, 2)} m), counter ${d(e.counter)}°, lead ${f3(e.insideLead / BSL, 2)} BSL, knee O ${d(e.outsideKnee)}° I ${d(e.insideKnee)}°, ankle O ${d(e.outsideAnkle)}°, list ${d(e.pelvisList)}°, CoM ${f3(e.comHeight)} legs`;
          }),
          ...peakLines(r, p),
        ]),
    formatDiagnosis(m.diagnosis),
  ].join('\n');
};
