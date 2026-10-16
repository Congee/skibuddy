// Build time only: scripts/anatomy/pose-tables.ts solves every definition into src/viewer/poses/tables.json.
import { isTurn, phaseForces, turnForcesAt } from '../physics/turn';
import type { DrillScenario } from '../physics/turn';
import { EQUIPMENT, shinAngle } from './equipment';
import { BodySide, SEGMENTS, SegmentKind } from './figure';
import { identity, transformPoint } from './mat4';
import type { Vec3 } from './mat4';
import { touchShare, windowShare } from './pose-definition';
import type { PoseDefinition, PoseKey } from './pose-definition';
import { CAPSULE_ARM, CAPSULE_GRIP, PLANT_AHEAD, SKI_TIP, comAhead, poleDirection, poleSize, segmentMatrices, skiIndex } from './pose';
import type { Pose } from './pose';

type KeyField = Exclude<keyof PoseKey, 't'>;
type KeyValues = Readonly<Record<KeyField, number>>;

const FIELDS: ReadonlyArray<KeyField> = [
  'angulation',
  'hip',
  'pelvisList',
  'lumbarFlex',
  'spineBend',
  'spineTwist',
  'counter',
  'dorsiflexion',
  'insideDorsiflexion',
  'eversion',
  'protraction',
  'elevation',
  'insideTailLift',
  'comAhead',
];

const DEG = Math.PI / 180;

/** Periodic monotone cubic Hermite through the keys, so nothing overshoots a key: no counter into the new turn. */
export const keyValuesAt = (keys: ReadonlyArray<PoseKey>, t: number): KeyValues => {
  const u = ((t % 1) + 1) % 1;
  const sorted = keys.toSorted((a, b) => a.t - b.t);
  const n = sorted.length;
  const at = (i: number): PoseKey & { readonly time: number } => {
    const k = sorted[((i % n) + n) % n];
    if (k === undefined) throw new Error('no key poses');
    return { ...k, time: k.t + Math.floor(i / n) };
  };
  let i = n - 1;
  while (i > 0 && at(i).time > u) i--;
  // Before the first key, interpolate from the last one of the previous turn.
  if (at(i).time > u) i = -1;
  const p0 = at(i - 1);
  const p1 = at(i);
  const p2 = at(i + 1);
  const p3 = at(i + 2);
  const h = p2.time - p1.time;
  const s = (u - p1.time) / h;
  const h00 = 2 * s ** 3 - 3 * s ** 2 + 1;
  const h10 = s ** 3 - 2 * s ** 2 + s;
  const h01 = -2 * s ** 3 + 3 * s ** 2;
  const h11 = s ** 3 - s ** 2;
  // Zero at a turning key, and limited to three times the smaller secant (Fritsch-Carlson).
  const tangent = (a: PoseKey & { readonly time: number }, b: PoseKey & { readonly time: number }, c: PoseKey & { readonly time: number }, f: KeyField): number => {
    const d0 = (b[f] - a[f]) / (b.time - a.time);
    const d1 = (c[f] - b[f]) / (c.time - b.time);
    if (d0 * d1 <= 0) return 0;
    const m = (c[f] - a[f]) / (c.time - a.time);
    return Math.sign(m) * Math.min(Math.abs(m), 3 * Math.abs(d0), 3 * Math.abs(d1));
  };
  const out = Object.fromEntries(FIELDS.map((f) => [f, 0])) as Record<KeyField, number>;
  if (n === 1) return { ...out, ...Object.fromEntries(FIELDS.map((f) => [f, p1[f]])) };
  for (const f of FIELDS) out[f] = h00 * p1[f] + h10 * h * tangent(p0, p1, p2, f) + h01 * p2[f] + h11 * h * tangent(p1, p2, p3, f);
  return out;
};

/** How hard the drill is skied, from its physics. */
export interface Effort {
  /** Outside hip flexion at its most open, degrees. */
  readonly hipMin: number;
  /** Outside hip flexion at its deepest, degrees. */
  readonly hipMax: number;
  /** -1 gentle .. 0 moderate .. +1 dynamic, from the hip depth; scales the milder fields. */
  readonly scale: number;
}

const interpolate = (table: ReadonlyArray<readonly [number, number, number]>, x: number): readonly [number, number] => {
  const first = table[0];
  const last = table.at(-1);
  if (first === undefined || last === undefined) throw new Error('empty table');
  if (x <= first[0]) return [first[1], first[2]];
  for (let i = 1; i < table.length; i++) {
    const a = table[i - 1];
    const b = table[i];
    if (a === undefined || b === undefined || x > b[0]) continue;
    const f = (x - a[0]) / (b[0] - a[0]);
    return [a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];
  }
  return [last[1], last[2]];
};

/** The fall-line load of a turn; a drill that is not a turn stands on the slope's normal share of weight. */
const loadOf = (s: DrillScenario | null): number => {
  if (s === null) return 1;
  return isTurn(s) ? phaseForces(s).shaping.load : Math.cos((s.slopeDeg * Math.PI) / 180);
};

export const effortOf = (def: PoseDefinition, scenario: DrillScenario | null): Effort => {
  const rows = def.constraints.hipByLoad;
  const [hipMin, hipMax] = interpolate(rows, loadOf(scenario));
  const mid = rows[Math.floor(rows.length / 2)]?.[1] ?? hipMin;
  const span = rows.length > 1 ? mid - (rows[0]?.[1] ?? mid) : 0;
  return { hipMin, hipMax, scale: span === 0 ? 0 : (hipMin - mid) / span };
};

const insideTipHeight = (pose: Pose): number => transformPoint(segmentMatrices(pose)[skiIndex(BodySide.Left)] ?? identity(), SKI_TIP)[1];

const segmentOf = (kind: SegmentKind, side: BodySide): number => SEGMENTS.findIndex((s) => s.kind === kind && s.side === side);

/** How far ahead of the inside ankle a full touch lands. */
const touchAhead = (pose: Pose, basket: number): number => {
  const world = segmentMatrices(pose);
  const at = (kind: SegmentKind, p: Vec3): Vec3 => transformPoint(world[segmentOf(kind, BodySide.Left)] ?? identity(), p);
  const grip = at(SegmentKind.Forearm, CAPSULE_GRIP);
  const ankle = at(SegmentKind.Boot, [0, 0, 0]);
  const elbow = at(SegmentKind.Forearm, [0, 0, 0]);
  const forearm: Vec3 = [grip[0] - elbow[0], grip[1] - elbow[1], grip[2] - elbow[2]];
  return grip[2] + poleDirection(grip, BodySide.Left, 1, ankle, basket, forearm)[2] * basket - ankle[2];
};

/**
 * The exact pose at turn time `t`, solved by bisection; about 125 skeleton passes, so it runs at build time only.
 * The shin follows the ankle's dorsiflexion plus the boot's ramp, the outside hip holds its keyed flexion on the
 * pelvis, the knee bends until the centre of mass sits `comAhead` of mid-foot, and the inside hip flexes until
 * its ski tip just touches the snow. `scenario` null, or one without a radius, stands without turning.
 */
export const solvePose = (def: PoseDefinition, t: number, scenario: DrillScenario | null): Pose => {
  const c = def.constraints;
  const k = keyValuesAt(def.keys, t);
  const effort = effortOf(def, scenario);
  const mild = (f: KeyField): number => k[f] * (1 + (c.gains[f] ?? 0) * effort.scale);
  const lean = scenario !== null && isTurn(scenario) ? turnForcesAt(scenario, t).tilt : 0;
  const angulation = mild('angulation');
  const dorsiflexion = mild('dorsiflexion');
  const ankleFlex = shinAngle(dorsiflexion, EQUIPMENT);
  // Hip flexion on the pelvis is set; the knee and the pelvis's pitch follow from balance.
  const hip = (effort.hipMin + k.hip * (effort.hipMax - effort.hipMin)) * DEG;
  const lifted = windowShare(c.tailLift, t);
  const fullLift = Math.max(0, mild('insideTailLift')) * lifted;
  const femurRotation = c.femurRotation * angulation;
  const poleTouch = touchShare(c.poleTouch, t);
  const girdle = { protraction: k.protraction, elevation: k.elevation };
  const insideAnkle = (tailLift: number): number => shinAngle(dorsiflexion + (k.insideDorsiflexion - dorsiflexion) * lifted, EQUIPMENT) + tailLift;
  const base = (knee: number, extra: number, tailLift = fullLift): Pose => {
    const hipFlex = knee - ankleFlex;
    return {
      lean,
      hipAngulation: c.hipAngulation * angulation,
      eversion: mild('eversion'),
      pelvisList: mild('pelvisList'),
      pelvisPitch: hip - hipFlex,
      counter: mild('counter'),
      spineFlex: mild('lumbarFlex'),
      spineBend: mild('spineBend'),
      spineTwist: mild('spineTwist'),
      poleTouch,
      insideReach: 0,
      outside: { hipFlex, ankleFlex, femurRotation: femurRotation + c.kneesIn, tailLift: 0, adduction: c.stance },
      // The inside leg shortens, its foot leading as a result (lemaster-2010 pp61-62); the shin stays
      // forward on the tongue as the ski pitches tip-down under it.
      inside: {
        hipFlex: hipFlex + extra,
        ankleFlex: insideAnkle(tailLift),
        femurRotation: c.insideFemurShare * femurRotation - c.kneesIn,
        tailLift,
        adduction: c.stance,
      },
      outsideGirdle: girdle,
      insideGirdle: girdle,
    };
  };
  // Flex the inside hip until its ski tip just touches the snow; the tip rises with flex. The spine moves no leg.
  const tipFlex = (knee: number, tailLift: number): number => {
    let lo = -0.3;
    let hi = 1.5;
    for (let i = 0; i < 24; i++) {
      const mid = (lo + hi) / 2;
      if (insideTipHeight(base(knee, mid, tailLift)) > 0) hi = mid;
      else lo = mid;
    }
    return (lo + hi) / 2;
  };
  // The lifted inside knee stops at insideKneeMax: past it the tail lifts less instead, so the tip stays on the snow.
  const insideLeg = (knee: number): { readonly extra: number; readonly tailLift: number } => {
    const capped = (tailLift: number): number => c.insideKneeMax - (knee - ankleFlex) - insideAnkle(tailLift);
    const extra = tipFlex(knee, fullLift);
    if (extra <= capped(fullLift)) return { extra, tailLift: fullLift };
    let lo = 0;
    let hi = fullLift;
    for (let i = 0; i < 20; i++) {
      const mid = (lo + hi) / 2;
      if (insideTipHeight(base(knee, capped(mid), mid)) > 0) lo = mid;
      else hi = mid;
    }
    const tailLift = (lo + hi) / 2;
    return { extra: capped(tailLift), tailLift };
  };
  // Bend the knee until the centre of mass sits comAhead of mid-foot; more knee moves it back, as the hips
  // sink behind the foot and the trunk, at a set hip angle, stands up with the thigh (lemaster-2010 p9, p16).
  const balance = (extra: number, tailLift: number): number => {
    let lo = 30 * DEG;
    let hi = 120 * DEG;
    for (let i = 0; i < 24; i++) {
      const mid = (lo + hi) / 2;
      if (comAhead(segmentMatrices(base(mid, extra, tailLift))) > k.comAhead) lo = mid;
      else hi = mid;
    }
    return (lo + hi) / 2;
  };
  // The lifted leg and the outside knee depend on each other a little; two rounds settle them.
  let knee = 65 * DEG;
  let inside = insideLeg(knee);
  for (let round = 0; round < 2; round++) {
    knee = balance(inside.extra, inside.tailLift);
    inside = insideLeg(knee);
  }
  const legs = base(knee, inside.extra, inside.tailLift);
  if (legs.poleTouch <= 0) return legs;
  const reach = legs.poleTouch * solveReach(legs, c.scapularRhythm, poleSize(CAPSULE_ARM, c.poleTrim).basket);
  return { ...legs, insideReach: reach, insideGirdle: { ...girdle, protraction: girdle.protraction + c.scapularRhythm * reach } };
};

/** Shoulder flexion, with the shoulder blade's share, that lands the touch PLANT_AHEAD in front of the ankle; mirrored in build_anatomy.py. */
const solveReach = (pose: Pose, rhythm: number, basket: number): number => {
  let lo = -0.5;
  let hi = 0.8;
  for (let i = 0; i < 20; i++) {
    const mid = (lo + hi) / 2;
    const girdle = { ...pose.insideGirdle, protraction: pose.insideGirdle.protraction + rhythm * mid };
    if (touchAhead({ ...pose, insideReach: mid, insideGirdle: girdle }, basket) < PLANT_AHEAD) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
};

/** Solved poses per turn; a multiple of the bake's 24 frames, so those frames are exact. */
export const POSE_SAMPLES = 96;

/** One turn of poses, `samples` evenly spaced from t = 0. */
export const solveTable = (def: PoseDefinition, scenario: DrillScenario | null, samples = POSE_SAMPLES): ReadonlyArray<Pose> =>
  Array.from({ length: samples }, (_, i) => solvePose(def, i / samples, scenario));
