// Build time only: scripts/anatomy/pose-tables.ts solves every definition into src/viewer/poses/tables.json.
import { arcLoad, isTurn, turnForcesAt } from '../physics/turn';
import type { DrillScenario } from '../physics/turn';
import { EQUIPMENT, minShinAngle, shinAngle } from './equipment';
import { BodySide, SEGMENTS, SegmentKind } from './figure';
import { compose, identity, inverseRotation, rotationX, rotationY, rotationZ, transformPoint } from './mat4';
import type { Mat4, Vec3 } from './mat4';
import { HeadAim, keyValuesAt, touchShare, windowShare, wrapTime } from './pose-definition';
import type { HeadRule, KeyField, PoseDefinition } from './pose-definition';
import { HEAD_LIMIT, gazeHeading } from './gaze';
import { CORRIDOR_SHARE, headingAt } from './turn-heading';

const DEG = Math.PI / 180;
/** The shin's forward limit in a shell, inferred. */
const SHIN_MAX = 50 * DEG;
/** Lean by which a fold turned toward the inside is fully answered by hip angulation; inferred. */
const FOLD_HANDOVER = 20 * DEG;
const smooth = (u: number): number => u * u * (3 - 2 * u);
import { ARM_ABDUCTION, CAPSULE_ARM, CAPSULE_GRIP, PLANT_AHEAD, SKI_TIP, MID_FOOT, aheadOnSki, centreOfMass, outsideWeight, pelvisRotation, poleDirection, poleSize, segmentMatrices, skiIndex, touchSide, turnDepth } from './pose';
import type { Pose } from './pose';

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
  return isTurn(s) ? arcLoad(s) : Math.cos((s.slopeDeg * Math.PI) / 180);
};

export const effortOf = (def: PoseDefinition, scenario: DrillScenario | null): Effort => {
  const rows = def.constraints.hipByLoad;
  const [hipMin, hipMax] = interpolate(rows, loadOf(scenario));
  const mid = rows[Math.floor(rows.length / 2)]?.[1] ?? hipMin;
  const span = rows.length > 1 ? mid - (rows[0]?.[1] ?? mid) : 0;
  return { hipMin, hipMax, scale: span === 0 ? 0 : (hipMin - mid) / span };
};

/** Head yaw beyond the chest, toward the outside, that `rule` asks for at turn time `t` given the chest's heading on the skis. */
export const headYawOf = (rule: HeadRule | undefined, scenario: DrillScenario | null, t: number, chest: number): number => {
  if (rule === undefined || rule.aim === HeadAim.Chest || scenario === null || !isTurn(scenario)) return 0;
  const corridor = rule.aim === HeadAim.FallLine ? rule.corridor : CORRIDOR_SHARE * scenario.radiusM;
  const path = { radius: scenario.radiusM, corridor };
  // The gaze lies the skis' heading, less its own, off the fall line toward the outside.
  const yaw = headingAt(t, path) - gazeHeading(rule, path, scenario.speedMps, t) - chest;
  return Math.min(HEAD_LIMIT, Math.max(-HEAD_LIMIT, yaw));
};

// Above the outside tip, which sits on the snow unless both skis pitch.
const insideTipHeight = (pose: Pose): number => {
  const world = segmentMatrices(pose);
  const tip = (side: BodySide): number => transformPoint(world[skiIndex(side)] ?? identity(), SKI_TIP)[1];
  return tip(BodySide.Left) - tip(BodySide.Right);
};

/**
 * On firm snow the boots stand `clearance` over it, or higher if a tip-down tip would dip under it; a tip-up ski's
 * tail stays under it, drawn so for the bent, loaded tail.
 */
const riseOf = (pose: Pose, clearance: number): number => {
  const world = segmentMatrices({ ...pose, rise: 0 });
  const tip = (side: BodySide): number => transformPoint(world[skiIndex(side)] ?? identity(), SKI_TIP)[1];
  return Math.max(0, clearance, -Math.min(tip(BodySide.Left), tip(BodySide.Right)));
};

const segmentOf = (kind: SegmentKind, side: BodySide): number => SEGMENTS.findIndex((s) => s.kind === kind && s.side === side);

/**
 * The centre of mass ahead of the outside mid-foot; near the transition, where the outside foot changes, ahead of
 * a point between both, so a turn's end balances as the mirrored next turn's start. Along the ski, or on firm snow
 * along the snow, which takes the load of a pitched ski at its tail or tip.
 */
const balanceAhead = (world: ReadonlyArray<Mat4>, t: number, firm: boolean): number => {
  const w = 0.5 * (1 - turnDepth(t)) ** 8;
  const right = transformPoint(world[segmentOf(SegmentKind.Boot, BodySide.Right)] ?? identity(), MID_FOOT);
  const left = transformPoint(world[segmentOf(SegmentKind.Boot, BodySide.Left)] ?? identity(), MID_FOOT);
  const foot: Vec3 = [(1 - w) * right[0] + w * left[0], (1 - w) * right[1] + w * left[1], (1 - w) * right[2] + w * left[2]];
  const com = centreOfMass(world);
  return firm ? com[2] - foot[2] : aheadOnSki(world, com, foot);
};

type Spine = Pick<Pose, 'spineFlex' | 'spineBend' | 'spineTwist'>;

/** The spine that tips the trunk `outward` about the body frame's fore-aft axis, so the tip adds no pitch. */
const spineTipped = (pelvis: Mat4, spine: Spine, outward: number): Spine => {
  if (outward === 0) return spine;
  const keyed = compose(rotationY(-spine.spineTwist), rotationZ(spine.spineBend), rotationX(spine.spineFlex));
  const m = compose(inverseRotation(pelvis), rotationZ(outward), pelvis, keyed);
  // Back to the trunk's twist, bend and flex, in that order.
  return { spineTwist: -Math.atan2(-(m[2] ?? 0), m[0] ?? 1), spineBend: Math.asin(m[1] ?? 0), spineFlex: Math.atan2(-(m[9] ?? 0), m[5] ?? 1) };
};

/** The centre of mass toward the inside of the snow's force line through the skis, which tilts by the lean. */
const inwardOfForce = (pose: Pose): number => {
  const world = segmentMatrices(pose);
  const o = outsideWeight(pose.lean);
  const right = transformPoint(world[skiIndex(BodySide.Right)] ?? identity(), [0, SKI_TIP[1], 0]);
  const left = transformPoint(world[skiIndex(BodySide.Left)] ?? identity(), [0, SKI_TIP[1], 0]);
  const com = centreOfMass(world);
  const dx = com[0] - (o * right[0] + (1 - o) * left[0]);
  const dy = com[1] - (o * right[1] + (1 - o) * left[1]);
  return dx * Math.cos(pose.lean) - dy * Math.sin(pose.lean);
};

/** How far ahead of its own ankle the touching pole's full touch lands. */
const touchAhead = (pose: Pose, basket: number): number => {
  const world = segmentMatrices(pose);
  const side = touchSide(pose);
  const at = (kind: SegmentKind, p: Vec3): Vec3 => transformPoint(world[segmentOf(kind, side)] ?? identity(), p);
  const grip = at(SegmentKind.Forearm, CAPSULE_GRIP);
  const ankle = at(SegmentKind.Boot, [0, 0, 0]);
  const elbow = at(SegmentKind.Forearm, [0, 0, 0]);
  const forearm: Vec3 = [grip[0] - elbow[0], grip[1] - elbow[1], grip[2] - elbow[2]];
  return grip[2] + poleDirection(grip, side, 1, ankle, basket, forearm)[2] * basket - ankle[2];
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
  const turning = scenario !== null && isTurn(scenario);
  const lean = turning ? turnForcesAt(scenario, t).tilt : 0;
  const angulation = mild('angulation');
  const [gentle, moderate, dynamic] = c.crossUnder ?? [0, 0, 0];
  const under = Math.min(1, Math.max(0, effort.scale < 0 ? moderate + (moderate - gentle) * effort.scale : moderate + (dynamic - moderate) * effort.scale));
  const dorsiflexion = mild('dorsiflexion') + (c.underAnkle ?? 0) * under * k.hipUnder;
  const keyedShin = shinAngle(dorsiflexion, EQUIPMENT);
  // Hip flexion on the pelvis is set; the knee and the pelvis's pitch follow from balance.
  const hipShare = k.hip + (k.hipUnder - k.hip) * under;
  const hip = (effort.hipMin + hipShare * (effort.hipMax - effort.hipMin)) * DEG;
  const lifted = windowShare(c.tailLift, t);
  const fullLift = Math.max(0, mild('insideTailLift')) * lifted;
  const pitch = mild('skiPitch');
  const femurRotation = c.femurRotation * angulation;
  // Past mid-turn the touch is the next turn's, made by this turn's outside arm.
  const poleTouch = touchShare(c.poleTouch, t) * (wrapTime(t) < 0.5 ? 1 : -1);
  const girdle = { protraction: k.protraction, elevation: k.elevation };
  // Shin-first: the inside ankle closes with the outside one and takes a share of the inside leg's extra flexion.
  const shinFirst = c.trunkOverShin !== undefined;
  const firm = c.firmSnow === true;
  const insideShare = shinFirst ? (c.insideAnkleShare ?? 0) : 0;
  const insideAnkle = (tailLift: number, shin: number): number =>
    (shinFirst ? shin : shinAngle(dorsiflexion + (k.insideDorsiflexion - dorsiflexion) * lifted, EQUIPMENT)) + tailLift;
  // Near the switch the legs share the difference in length, so neither kinks as outside and inside swap.
  const split = 1 - outsideWeight(lean);
  // The trunk tipped outward about the skis' axis beyond its keys, solved below.
  let tip = 0;
  const spine = { spineFlex: mild('lumbarFlex'), spineBend: mild('spineBend'), spineTwist: mild('spineTwist') };
  const base = (knee: number, extra: number, tailLift: number, ankleFlex: number, outward = tip): Pose => {
    const hipFlex = knee - ankleFlex;
    const insideExtra = (1 - split) * extra;
    const trunk = spineTipped(pelvisRotation(mild('counter'), mild('pelvisList'), hip - hipFlex), spine, outward);
    return {
      lean,
      hipAngulation: c.hipAngulation * angulation,
      eversion: mild('eversion'),
      pelvisList: mild('pelvisList'),
      pelvisPitch: hip - hipFlex,
      counter: mild('counter'),
      ...trunk,
      headYaw: 0,
      armAbduction: c.armAbduction ?? ARM_ABDUCTION,
      poleTouch,
      reach: 0,
      rise: 0,
      outside: { hipFlex: hipFlex - split * extra, ankleFlex, femurRotation: femurRotation + c.kneesIn, tailLift: -pitch, adduction: c.stance },
      // The inside leg shortens, its foot leading as a result (lemaster-2010 pp61-62); the shin stays
      // forward on the tongue as the ski pitches tip-down under it.
      inside: {
        hipFlex: hipFlex + insideExtra * (1 - insideShare),
        ankleFlex: insideAnkle(tailLift, ankleFlex) + insideShare * insideExtra,
        femurRotation: c.insideFemurShare * femurRotation - c.kneesIn,
        tailLift: tailLift - pitch,
        adduction: c.stance,
      },
      outsideGirdle: girdle,
      insideGirdle: girdle,
    };
  };
  // Flex the inside hip until its ski tip just touches the snow; the tip rises with flex. The spine moves no leg.
  const tipFlex = (knee: number, tailLift: number, shin: number): number => {
    let lo = -0.3;
    let hi = 1.5;
    for (let i = 0; i < 24; i++) {
      const mid = (lo + hi) / 2;
      if (insideTipHeight(base(knee, mid, tailLift, shin)) > 0) hi = mid;
      else lo = mid;
    }
    return (lo + hi) / 2;
  };
  // The lifted inside knee stops at insideKneeMax: past it the tail lifts less instead, so the tip stays on the snow.
  const insideLeg = (knee: number, shin: number): { readonly extra: number; readonly tailLift: number } => {
    const capped = (tailLift: number): number => (c.insideKneeMax - (knee - shin) - insideAnkle(tailLift, shin)) / (1 - split);
    const extra = tipFlex(knee, fullLift, shin);
    if (extra <= capped(fullLift)) return { extra, tailLift: fullLift };
    let lo = 0;
    let hi = fullLift;
    for (let i = 0; i < 20; i++) {
      const mid = (lo + hi) / 2;
      if (insideTipHeight(base(knee, capped(mid), mid, shin)) > 0) lo = mid;
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
      if (balanceAhead(segmentMatrices(base(mid, extra, tailLift, keyedShin)), t, firm) > k.comAhead) lo = mid;
      else hi = mid;
    }
    return (lo + hi) / 2;
  };
  // Shin-first: the trunk keeps its lean on the shin, so the knee is the hip's depth less that lean; closing the
  // ankle draws the feet back under the mass, opening it slides them ahead (lemaster-2010 p81). The cuff stops it open.
  const target = mild('comAhead');
  const depthKnee = hip + mild('lumbarFlex') - (c.trunkOverShin ?? 0) * (1 + (c.trunkOverShinGain ?? 0) * effort.scale);
  const balanceShin = (extra: number, tailLift: number): number => {
    // The cuff stops the shin on the boot, which pitches with the ski.
    let lo = minShinAngle(EQUIPMENT) - pitch;
    let hi = SHIN_MAX;
    for (let i = 0; i < 24; i++) {
      const mid = (lo + hi) / 2;
      if (balanceAhead(segmentMatrices(base(depthKnee, extra, tailLift, mid)), t, firm) < target) lo = mid;
      else hi = mid;
    }
    return (lo + hi) / 2;
  };
  // Hip angulation answers a fold turned toward the inside: as the lean builds, the spine tips the trunk outward until
  // the fold moves the mass no further inside the snow's force than a square fold would (lemaster-2010 pp70-71, 126).
  // At the switch the anticipated fold still leads the mass into the new turn.
  const settled = smooth(Math.min(1, Math.abs(lean) / FOLD_HANDOVER));
  const squareFold = (knee: number, extra: number, tailLift: number, shin: number): number => {
    const pose = base(knee, extra, tailLift, shin, 0);
    const inward = inwardOfForce(pose);
    const excess = inward - inwardOfForce({ ...pose, counter: 0, spineTwist: 0 });
    if (excess <= 0 || settled === 0) return 0;
    const goal = inward - settled * excess;
    let lo = 0;
    let hi = 1.2;
    for (let i = 0; i < 24; i++) {
      const mid = (lo + hi) / 2;
      if (inwardOfForce(base(knee, extra, tailLift, shin, mid)) > goal) lo = mid;
      else hi = mid;
    }
    return (lo + hi) / 2;
  };
  // The lifted leg and the balance depend on each other a little; two rounds settle them.
  let knee = shinFirst ? depthKnee : 65 * DEG;
  let shin = keyedShin;
  let inside = insideLeg(knee, shin);
  for (let round = 0; round < 2; round++) {
    if (turning) tip = squareFold(knee, inside.extra, inside.tailLift, shin);
    if (shinFirst) shin = balanceShin(inside.extra, inside.tailLift);
    else knee = balance(inside.extra, inside.tailLift);
    inside = insideLeg(knee, shin);
  }
  const solved = base(knee, inside.extra, inside.tailLift, shin);
  // The head moves no mass to speak of, so it turns only once the trunk is set.
  const turned = { ...solved, headYaw: headYawOf(c.head, scenario, t, solved.counter + solved.spineTwist) };
  const legs = firm ? { ...turned, rise: riseOf(turned, mild('skiClearance')) } : turned;
  if (legs.poleTouch === 0) return legs;
  const reach = Math.abs(legs.poleTouch) * solveReach(legs, c.scapularRhythm, poleSize(CAPSULE_ARM, c.poleTrim).basket);
  const reaching = { ...girdle, protraction: girdle.protraction + c.scapularRhythm * reach };
  return { ...legs, reach, ...(legs.poleTouch > 0 ? { insideGirdle: reaching } : { outsideGirdle: reaching }) };
};

/** Shoulder flexion, with the shoulder blade's share, that lands the touch PLANT_AHEAD in front of the ankle; mirrored in build_anatomy.py. */
const solveReach = (pose: Pose, rhythm: number, basket: number): number => {
  let lo = -0.5;
  let hi = 0.8;
  for (let i = 0; i < 20; i++) {
    const mid = (lo + hi) / 2;
    const key = touchSide(pose) === BodySide.Left ? 'insideGirdle' : 'outsideGirdle';
    const girdle = { ...pose[key], protraction: pose[key].protraction + rhythm * mid };
    if (touchAhead({ ...pose, reach: mid, [key]: girdle }, basket) < PLANT_AHEAD) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
};

/** Solved poses per turn; a multiple of the bake's 24 frames, so those frames are exact. */
export const POSE_SAMPLES = 96;

/** One turn of poses, `samples` evenly spaced from t = 0. */
export const solveTable = (def: PoseDefinition, scenario: DrillScenario | null, samples = POSE_SAMPLES): ReadonlyArray<Pose> =>
  Array.from({ length: samples }, (_, i) => solvePose(def, i / samples, scenario));
