import { EQUIPMENT, bindingInFoot } from './equipment';
import { CAPSULE_BOOT } from './gear-fit';
import { transformPoint } from './mat4';
import type { Mat4, Vec3 } from './mat4';
import { FIGURE_SKIER, REFERENCE_SKIER, SKI_MOUNT, Terrain } from './skier';
import type { Body, Ski } from './skier';

/** The figure faces +z with y up, so its right side is -x. */
export const BodySide = { Right: 'right', Left: 'left', Center: 'center' } as const;
export type BodySide = (typeof BodySide)[keyof typeof BodySide];

export const SegmentKind = {
  Pelvis: 'pelvis',
  Trunk: 'trunk',
  Head: 'head',
  /** Shoulder blade and collarbone, from the sternoclavicular joint to the shoulder. */
  Girdle: 'girdle',
  UpperArm: 'upper-arm',
  Forearm: 'forearm',
  Thigh: 'thigh',
  Shin: 'shin',
  Boot: 'boot',
  Ski: 'ski',
} as const;
export type SegmentKind = (typeof SegmentKind)[keyof typeof SegmentKind];

export type Shape =
  | { readonly type: 'capsule'; readonly radius: number; readonly length: number; readonly center: Vec3 }
  | { readonly type: 'box'; readonly size: Vec3; readonly center: Vec3 };

export interface Segment {
  readonly name: string;
  readonly kind: SegmentKind;
  readonly side: BodySide;
  /** Index of the parent segment; always lower than this segment's own index. */
  readonly parent: number | null;
  /** Joint position in the parent's frame. */
  readonly joint: Vec3;
  /** Shape in this segment's own frame, whose origin is the joint. */
  readonly shape: Shape;
}

const capsule = (radius: number, length: number, center: Vec3): Shape => ({ type: 'capsule', radius, length, center });
const box = (size: Vec3, center: Vec3): Shape => ({ type: 'box', size, center });

const sideX = (side: BodySide, x: number): number => (side === BodySide.Right ? -x : x);

/** The sternoclavicular joint in the trunk's frame, and the shoulder in the girdle's. */
const STERNOCLAVICULAR = 0.03;
const CLAVICLE = 0.17;

/** Each length over the hand-sized figure's: its shapes and joints scale with it. */
const scaleOf = (body: Body, key: keyof Body): number => body[key] / FIGURE_SKIER.body[key];

const arm = (body: Body, side: BodySide, trunk: number, first: number): ReadonlyArray<Segment> => {
  const t = scaleOf(body, 'trunk');
  const u = scaleOf(body, 'upperArm');
  const g = scaleOf(body, 'grip');
  return [
    { name: `${side}-girdle`, kind: SegmentKind.Girdle, side, parent: trunk, joint: [sideX(side, STERNOCLAVICULAR), 0.44 * t, 0], shape: capsule(0.05, 0, [sideX(side, CLAVICLE), 0.04, 0]) },
    { name: `${side}-upper-arm`, kind: SegmentKind.UpperArm, side, parent: first, joint: [sideX(side, CLAVICLE), 0.04, 0], shape: capsule(0.045, 0.22 * u, [0, -0.15 * u, 0]) },
    { name: `${side}-forearm`, kind: SegmentKind.Forearm, side, parent: first + 1, joint: [0, -body.upperArm, 0], shape: capsule(0.04, 0.2 * g, [0, -0.14 * g, 0]) },
  ];
};

/** The capsule boot's binding frame in its foot's, as `bindingInFoot`. */
export const CAPSULE_BINDING: Mat4 = bindingInFoot(CAPSULE_BOOT, EQUIPMENT);
/** The ski segment origin: mid-thickness under the binding, 15 mm behind the boot centre. */
const SKI_ORIGIN: Vec3 = transformPoint(CAPSULE_BINDING, [0, -EQUIPMENT.skiThickness / 2, -0.015]);

const leg = (body: Body, ski: Ski, side: BodySide, first: number): ReadonlyArray<Segment> => {
  const t = scaleOf(body, 'trunk');
  const th = scaleOf(body, 'thigh');
  const sh = scaleOf(body, 'shin');
  return [
    { name: `${side}-thigh`, kind: SegmentKind.Thigh, side, parent: 0, joint: [sideX(side, body.hipWidth / 2), -0.06 * t, 0], shape: capsule(0.075, 0.3 * th, [0, -0.22 * th, 0]) },
    { name: `${side}-shin`, kind: SegmentKind.Shin, side, parent: first, joint: [0, -body.thigh, 0], shape: capsule(0.055, 0.36 * sh, [0, -0.2 * sh, 0]) },
    { name: `${side}-boot`, kind: SegmentKind.Boot, side, parent: first + 1, joint: [0, -body.shin, 0], shape: box([0.08, 0.07, 0.25], [0, -0.05, 0.03]) },
    { name: `${side}-ski`, kind: SegmentKind.Ski, side, parent: first + 2, joint: SKI_ORIGIN, shape: box([ski.waist, EQUIPMENT.skiThickness, ski.length], [0, 0, SKI_MOUNT]) },
  ];
};

/** The figure for `body` on `ski`. */
export const figureSegments = (body: Body, ski: Ski): ReadonlyArray<Segment> => {
  const t = scaleOf(body, 'trunk');
  return [
    { name: 'pelvis', kind: SegmentKind.Pelvis, side: BodySide.Center, parent: null, joint: [0, 1, 0], shape: box([0.32, 0.2, 0.2], [0, 0, 0]) },
    { name: 'trunk', kind: SegmentKind.Trunk, side: BodySide.Center, parent: 0, joint: [0, 0.08 * t, 0], shape: capsule(0.14, 0.3 * t, [0, 0.3 * t, 0]) },
    { name: 'head', kind: SegmentKind.Head, side: BodySide.Center, parent: 1, joint: [0, 0.6 * t, 0], shape: capsule(0.1, 0.04, [0, 0.12, 0]) },
    ...arm(body, BodySide.Right, 1, 3),
    ...arm(body, BodySide.Left, 1, 6),
    ...leg(body, ski, BodySide.Right, 9),
    ...leg(body, ski, BodySide.Left, 13),
  ];
};

// One ski drawn for every drill; the solver takes each terrain's own ends.
export const SEGMENTS: ReadonlyArray<Segment> = figureSegments(REFERENCE_SKIER.body, REFERENCE_SKIER.skis[Terrain.Groomed]);

export const segmentIndex = (name: string): number => SEGMENTS.findIndex((s) => s.name === name);
