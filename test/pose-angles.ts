import { BodySide, SEGMENTS, SegmentKind } from '../src/viewer/figure';
import { transformPoint } from '../src/viewer/mat4';
import type { Mat4, Vec3 } from '../src/viewer/mat4';
import { MID_FOOT, SKI_TIP, centreOfMass, balanceRoll, comAhead, segmentMatrices } from '../src/viewer/pose';
import type { Pose } from '../src/viewer/pose';

export type LegSide = typeof BodySide.Right | typeof BodySide.Left;

const DEG = 180 / Math.PI;
const SHIN_LENGTH = 0.43;
const THIGH_LENGTH = 0.45;
const SKI_TAIL: Vec3 = [0, SKI_TIP[1], -0.7];

const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const unit = (v: Vec3): Vec3 => {
  const n = Math.hypot(...v) || 1;
  return [v[0] / n, v[1] / n, v[2] / n];
};
const axis = (m: Mat4, local: Vec3): Vec3 => sub(transformPoint(m, local), transformPoint(m, [0, 0, 0]));

/** Joint and segment angles of the capsule figure, in degrees, measured from its world matrices. */
export interface PoseAngles {
  /** Shin forward of the foot's normal (anatomical dorsiflexion). */
  readonly dorsiflexion: Readonly<Record<LegSide, number>>;
  readonly knee: Readonly<Record<LegSide, number>>;
  /** Thigh forward of the pelvis's long axis. */
  readonly hip: Readonly<Record<LegSide, number>>;
  /** Thigh away from the midline relative to the pelvis; negative is adduction. */
  readonly hipAbduction: Readonly<Record<LegSide, number>>;
  /** Foot rolled toward the turn relative to its shin: outside eversion, inside inversion. */
  readonly footRoll: Readonly<Record<LegSide, number>>;
  /** Knee inside the hip-to-ankle line, in metres, seen along the ski. */
  readonly kneeInside: Readonly<Record<LegSide, number>>;
  /** Ski edged toward the inside of the turn. */
  readonly edge: Readonly<Record<LegSide, number>>;
  /** Pelvis tipped up on the inside, against the world's horizontal and against the balance axis. */
  readonly pelvisList: number;
  readonly pelvisListToAxis: number;
  /** Pelvis tipped forward from upright. */
  readonly pelvisPitch: number;
  /** Pelvis facing toward the outside of the turn. */
  readonly counter: number;
  /** Trunk forward of the pelvis: positive rounds the low back. */
  readonly spineFlex: number;
  /** Trunk forward of the slope normal, in the skis' pitch plane. */
  readonly trunkForward: number;
  /** Trunk forward of the balance axis in the pelvis's sagittal plane, as body-frame studies measure it. */
  readonly trunkPitch: number;
  /** Shin forward of the slope normal, as trunkForward. */
  readonly shinForward: Readonly<Record<LegSide, number>>;
  /** Shoulders tipped up on the inside. */
  readonly shoulderList: number;
  /** Inside ski tail and tip heights above the snow, metres. */
  readonly insideTail: number;
  readonly insideTip: number;
  /** Inside ankle ahead of the outside one, metres. */
  readonly lead: number;
  /** Hip joints ahead of the outside mid-foot, metres; this and the mass's, from the snow's force line. */
  readonly hipsAhead: number;
  /** Centre of mass ahead of the outside mid-foot, metres. */
  readonly comAhead: number;
  /** As comAhead, along the snow's mean rather than the ski, which the bumps pitch. */
  readonly comOnSnow: number;
  /** Ski tail above its tip: the inside ski's tail lift, degrees. */
  readonly tailLift: number;
}

const perLeg = (f: (side: LegSide) => number): Record<LegSide, number> => ({ [BodySide.Right]: f(BodySide.Right), [BodySide.Left]: f(BodySide.Left) });
const lateral = (side: LegSide): number => (side === BodySide.Right ? -1 : 1);

const indexOf = (kind: SegmentKind, side: BodySide): number => SEGMENTS.findIndex((s) => s.kind === kind && s.side === side);

/** `brake`: the snow's force line tilt uphill of the slope normal, radians, as the solver's brakingTiltAt. */
export const poseAngles = (pose: Pose, brake = 0): PoseAngles => {
  const world = segmentMatrices(pose);
  const seg = (kind: SegmentKind, side: BodySide): Mat4 => {
    const m = world[indexOf(kind, side)];
    if (m === undefined) throw new Error(`no ${side} ${kind}`);
    return m;
  };
  const pelvis = seg(SegmentKind.Pelvis, BodySide.Center);
  const trunk = seg(SegmentKind.Trunk, BodySide.Center);
  const px = axis(pelvis, [1, 0, 0]);
  const py = axis(pelvis, [0, 1, 0]);
  const pz = axis(pelvis, [0, 0, 1]);
  const hipAt = (side: LegSide): Vec3 => transformPoint(seg(SegmentKind.Thigh, side), [0, 0, 0]);
  const kneeAt = (side: LegSide): Vec3 => transformPoint(seg(SegmentKind.Thigh, side), [0, -THIGH_LENGTH, 0]);
  const ankleAt = (side: LegSide): Vec3 => transformPoint(seg(SegmentKind.Shin, side), [0, -SHIN_LENGTH, 0]);
  const thighDown = (side: LegSide): Vec3 => unit(sub(kneeAt(side), hipAt(side)));
  const shinUp = (side: LegSide): Vec3 => unit(sub(kneeAt(side), ankleAt(side)));
  const ski = (side: LegSide): Mat4 => seg(SegmentKind.Ski, side);
  const boot = (side: LegSide): Mat4 => seg(SegmentKind.Boot, side);
  const shoulders = axis(trunk, [1, 0, 0]);
  const trunkUp = axis(trunk, [0, 1, 0]);
  const pelvisList = Math.atan2(px[1], Math.hypot(px[0], px[2]));
  // In the body frame, so the lean does not read as counter or pitch.
  const body = pose.lean - balanceRoll(pose);
  const unlean = ([x, y, z]: Vec3): Vec3 => [x * Math.cos(body) - y * Math.sin(body), x * Math.sin(body) + y * Math.cos(body), z];
  const by = unlean(py);
  const bx = unlean(px);
  const foot = transformPoint(boot(BodySide.Right), MID_FOOT);
  const com = centreOfMass(world);
  const [hr, hl] = [hipAt(BodySide.Right), hipAt(BodySide.Left)];
  const hips: Vec3 = [(hr[0] + hl[0]) / 2, (hr[1] + hl[1]) / 2, (hr[2] + hl[2]) / 2];
  const line = (p: Vec3): number => Math.tan(brake) * Math.hypot(p[0] - foot[0], p[1] - foot[1]);
  return {
    dorsiflexion: perLeg((side) => {
      const f = boot(side);
      const s = shinUp(side);
      return Math.atan2(dot(s, axis(f, [0, 0, 1])), dot(s, axis(f, [0, 1, 0]))) * DEG;
    }),
    knee: perLeg((side) => Math.acos(Math.min(1, dot(thighDown(side), unit(sub(ankleAt(side), kneeAt(side)))))) * DEG),
    hip: perLeg((side) => Math.atan2(dot(thighDown(side), pz), -dot(thighDown(side), py)) * DEG),
    hipAbduction: perLeg((side) => Math.asin(lateral(side) * dot(thighDown(side), unit(px))) * DEG),
    footRoll: perLeg((side) => {
      const shin = seg(SegmentKind.Shin, side);
      const x = axis(boot(side), [1, 0, 0]);
      return -Math.atan2(dot(x, axis(shin, [0, 1, 0])), dot(x, axis(shin, [1, 0, 0]))) * DEG;
    }),
    kneeInside: perLeg((side) => {
      const along = unit(axis(ski(side), [0, 0, 1]));
      const flat = (p: Vec3): Vec3 => sub(p, [along[0] * dot(p, along), along[1] * dot(p, along), along[2] * dot(p, along)]);
      const h = flat(hipAt(side));
      const a = flat(ankleAt(side));
      const k = flat(kneeAt(side));
      const line = unit(sub(h, a));
      const off = sub(sub(k, a), [line[0] * dot(sub(k, a), line), line[1] * dot(sub(k, a), line), line[2] * dot(sub(k, a), line)]);
      // Medial is toward the other leg: -x for the left leg, +x for the right.
      return -lateral(side) * off[0];
    }),
    edge: perLeg((side) => {
      const x = axis(ski(side), [1, 0, 0]);
      return Math.atan2(-x[1], Math.hypot(x[0], x[2])) * DEG;
    }),
    pelvisList: pelvisList * DEG,
    pelvisListToAxis: (pelvisList + pose.lean) * DEG,
    pelvisPitch: Math.atan2(by[2], by[1]) * DEG,
    // The inside hip ahead of the outside one.
    counter: Math.atan2(bx[2], Math.hypot(bx[0], bx[1])) * DEG,
    spineFlex: Math.atan2(dot(trunkUp, pz), dot(trunkUp, py)) * DEG,
    trunkForward: Math.atan2(trunkUp[2], trunkUp[1]) * DEG,
    trunkPitch: Math.atan2(dot(unlean(trunkUp), unit([-bx[2], 0, bx[0]])), unlean(trunkUp)[1]) * DEG,
    shinForward: perLeg((side) => Math.atan2(shinUp(side)[2], shinUp(side)[1]) * DEG),
    shoulderList: Math.atan2(shoulders[1], Math.hypot(shoulders[0], shoulders[2])) * DEG,
    insideTail: transformPoint(ski(BodySide.Left), SKI_TAIL)[1],
    insideTip: transformPoint(ski(BodySide.Left), SKI_TIP)[1],
    lead: ankleAt(BodySide.Left)[2] - ankleAt(BodySide.Right)[2],
    hipsAhead: hips[2] - foot[2] + line(hips),
    comAhead: comAhead(world) + line(com),
    comOnSnow: com[2] - foot[2] + line(com),
    tailLift: (() => {
      const tail = transformPoint(ski(BodySide.Left), SKI_TAIL);
      const tip = transformPoint(ski(BodySide.Left), SKI_TIP);
      return Math.asin((tail[1] - tip[1]) / Math.hypot(tail[0] - tip[0], tail[1] - tip[1], tail[2] - tip[2])) * DEG;
    })(),
  };
};

/** Trunk forward of gravity's vertical, degrees: `trunkForward` plus the slope's pitch along skis heading `heading` off the fall line. */
export const trunkFromVertical = (trunkForward: number, slopeDeg: number, heading: number): number =>
  trunkForward + Math.atan(Math.tan(slopeDeg / DEG) * Math.cos(heading)) * DEG;
