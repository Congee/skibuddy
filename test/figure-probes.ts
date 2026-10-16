import type { ProbeFrame } from '../scripts/anatomy/probe-fixture';
import { BodySide, SEGMENTS, SegmentKind } from '../src/viewer/figure';
import { transformPoint } from '../src/viewer/mat4';
import type { Mat4, Vec3 } from '../src/viewer/mat4';
import { CAPSULE_ARM, CAPSULE_GRIP, SKI_TIP, poleSize, segmentMatrices } from '../src/viewer/pose';
import { poseAt } from './stork-poses';
import fixture from './anatomy-probe.json';

export type LegSide = typeof BodySide.Left | typeof BodySide.Right;

/** Where a figure's fists, ankles and skis are at turn time `t`, in world space. */
export interface FigureProbe {
  readonly name: string;
  /** Fist to basket. */
  readonly basket: number;
  readonly at: (t: number) => {
    readonly grip: (side: LegSide) => Vec3;
    /** Head of the humerus. */
    readonly shoulder: (side: LegSide) => Vec3;
    readonly ankle: (side: LegSide) => Vec3;
    /** Elbow to wrist. */
    readonly forearm: (side: LegSide) => Vec3;
    /** Base of the ski's tip and tail. */
    readonly ski: (side: LegSide) => { readonly tip: Vec3; readonly tail: Vec3 };
  };
}

const segment = (world: ReadonlyArray<Mat4>, kind: SegmentKind, side: LegSide): Mat4 => {
  const m = world[SEGMENTS.findIndex((s) => s.kind === kind && s.side === side)];
  if (m === undefined) throw new Error(`no ${side} ${kind}`);
  return m;
};

export const capsuleProbe: FigureProbe = {
  name: 'capsule',
  basket: poleSize(CAPSULE_ARM).basket,
  at: (t) => {
    const world = segmentMatrices(poseAt(t));
    return {
      grip: (side) => transformPoint(segment(world, SegmentKind.Forearm, side), CAPSULE_GRIP),
      shoulder: (side) => transformPoint(segment(world, SegmentKind.UpperArm, side), [0, 0, 0]),
      ankle: (side) => transformPoint(segment(world, SegmentKind.Boot, side), [0, 0, 0]),
      forearm: (side) => {
        const grip = transformPoint(segment(world, SegmentKind.Forearm, side), CAPSULE_GRIP);
        const elbow = transformPoint(segment(world, SegmentKind.Forearm, side), [0, 0, 0]);
        return [grip[0] - elbow[0], grip[1] - elbow[1], grip[2] - elbow[2]];
      },
      ski: (side) => ({
        tip: transformPoint(segment(world, SegmentKind.Ski, side), SKI_TIP),
        tail: transformPoint(segment(world, SegmentKind.Ski, side), [0, SKI_TIP[1], -0.7]),
      }),
    };
  },
};

const isVec3 = (v: unknown): v is Vec3 => Array.isArray(v) && v.length === 3 && v.every((x) => typeof x === 'number');
const isSided = (v: unknown): v is Readonly<Record<LegSide, Vec3>> =>
  typeof v === 'object' && v !== null && isVec3((v as Record<string, unknown>)[BodySide.Right]) && isVec3((v as Record<string, unknown>)[BodySide.Left]);
const isFrame = (v: unknown): v is ProbeFrame =>
  typeof v === 'object' && v !== null && ['grip', 'shoulder', 'ankle', 'forearm', 'tip', 'tail'].every((k) => isSided((v as Record<string, unknown>)[k]));

/**
 * The baked anatomy model, sampled by scripts/anatomy/probe-fixture.ts when the model is built;
 * `bun run test:model` checks the fixture still matches the model.
 */
export const anatomyProbe = (): FigureProbe => {
  const raw: ReadonlyArray<unknown> = fixture.frames;
  const frames = raw.filter(isFrame);
  if (frames.length !== fixture.samples) throw new Error('anatomy probe fixture is malformed');
  return {
    name: 'anatomy',
    basket: poleSize(fixture.arm).basket,
    at: (t) => {
      const u = (((t % 1) + 1) % 1) * fixture.samples;
      const frame = Math.abs(u - Math.round(u)) < 1e-9 ? frames[Math.round(u) % fixture.samples] : undefined;
      if (frame === undefined) throw new Error(`anatomy probe has no sample at t=${t}`);
      return {
        grip: (side) => frame.grip[side],
        shoulder: (side) => frame.shoulder[side],
        ankle: (side) => frame.ankle[side],
        forearm: (side) => frame.forearm[side],
        ski: (side) => ({ tip: frame.tip[side], tail: frame.tail[side] }),
      };
    },
  };
};
