import { EQUIPMENT, bindingInFoot } from './equipment';
import { CAPSULE_BOOT } from './gear-fit';
import { transformPoint } from './mat4';
import type { Mat4, Vec3 } from './mat4';

/** The figure faces +z with y up, so its right side is -x. */
export const BodySide = { Right: 'right', Left: 'left', Center: 'center' } as const;
export type BodySide = (typeof BodySide)[keyof typeof BodySide];

export const SegmentKind = {
  Pelvis: 'pelvis',
  Trunk: 'trunk',
  Head: 'head',
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

const arm = (side: BodySide, trunk: number): ReadonlyArray<Segment> => [
  { name: `${side}-upper-arm`, kind: SegmentKind.UpperArm, side, parent: trunk, joint: [sideX(side, 0.2), 0.48, 0], shape: capsule(0.045, 0.22, [0, -0.15, 0]) },
  { name: `${side}-forearm`, kind: SegmentKind.Forearm, side, parent: trunk + (side === BodySide.Right ? 2 : 4), joint: [0, -0.3, 0], shape: capsule(0.04, 0.2, [0, -0.14, 0]) },
];

/** The capsule boot's binding frame in its foot's, as `bindingInFoot`. */
export const CAPSULE_BINDING: Mat4 = bindingInFoot(CAPSULE_BOOT, EQUIPMENT);
/** The ski segment origin: mid-thickness under the binding, 15 mm behind the boot centre. */
const SKI_ORIGIN: Vec3 = transformPoint(CAPSULE_BINDING, [0, -EQUIPMENT.skiThickness / 2, -0.015]);

const leg = (side: BodySide, first: number): ReadonlyArray<Segment> => [
  { name: `${side}-thigh`, kind: SegmentKind.Thigh, side, parent: 0, joint: [sideX(side, 0.1), -0.06, 0], shape: capsule(0.075, 0.3, [0, -0.22, 0]) },
  { name: `${side}-shin`, kind: SegmentKind.Shin, side, parent: first, joint: [0, -0.45, 0], shape: capsule(0.055, 0.36, [0, -0.2, 0]) },
  { name: `${side}-boot`, kind: SegmentKind.Boot, side, parent: first + 1, joint: [0, -0.43, 0], shape: box([0.08, 0.07, 0.25], [0, -0.05, 0.03]) },
  { name: `${side}-ski`, kind: SegmentKind.Ski, side, parent: first + 2, joint: SKI_ORIGIN, shape: box([0.09, EQUIPMENT.skiThickness, 1.6], [0, 0, 0.05]) },
];

export const SEGMENTS: ReadonlyArray<Segment> = [
  { name: 'pelvis', kind: SegmentKind.Pelvis, side: BodySide.Center, parent: null, joint: [0, 1, 0], shape: box([0.32, 0.2, 0.2], [0, 0, 0]) },
  { name: 'trunk', kind: SegmentKind.Trunk, side: BodySide.Center, parent: 0, joint: [0, 0.08, 0], shape: capsule(0.14, 0.3, [0, 0.3, 0]) },
  { name: 'head', kind: SegmentKind.Head, side: BodySide.Center, parent: 1, joint: [0, 0.6, 0], shape: capsule(0.1, 0.04, [0, 0.12, 0]) },
  ...arm(BodySide.Right, 1),
  ...arm(BodySide.Left, 1),
  ...leg(BodySide.Right, 7),
  ...leg(BodySide.Left, 11),
];

export const segmentIndex = (name: string): number => SEGMENTS.findIndex((s) => s.name === name);
