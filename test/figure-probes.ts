import { Vector3 } from 'three';
import type { Mesh, Object3D } from 'three';
import { BodySide, SEGMENTS, SegmentKind } from '../src/viewer/figure';
import { gloveFrom, parseGearFit } from '../src/viewer/gear-fit';
import { transformPoint } from '../src/viewer/mat4';
import type { Mat4, Vec3 } from '../src/viewer/mat4';
import { CAPSULE_GRIP, SKI_TIP, poseAt, segmentMatrices } from '../src/viewer/pose';
import { loadAnatomy } from './anatomy-model';

export type LegSide = typeof BodySide.Left | typeof BodySide.Right;

/** Where a figure's fists, ankles and skis are at turn time `t`, in world space. */
export interface FigureProbe {
  readonly name: string;
  readonly at: (t: number) => {
    readonly grip: (side: LegSide) => Vec3;
    readonly ankle: (side: LegSide) => Vec3;
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
  at: (t) => {
    const world = segmentMatrices(poseAt(t));
    return {
      grip: (side) => transformPoint(segment(world, SegmentKind.Forearm, side), CAPSULE_GRIP),
      ankle: (side) => transformPoint(segment(world, SegmentKind.Boot, side), [0, 0, 0]),
      ski: (side) => ({
        tip: transformPoint(segment(world, SegmentKind.Ski, side), SKI_TIP),
        tail: transformPoint(segment(world, SegmentKind.Ski, side), [0, SKI_TIP[1], -0.7]),
      }),
    };
  },
};

const vec = (v: Vector3): Vec3 => [v.x, v.y, v.z];

const letter = (side: LegSide): string => (side === BodySide.Right ? 'R' : 'L');

/** The committed, baked anatomy model. */
export const anatomyProbe = async (): Promise<FigureProbe> => {
  const model = await loadAnatomy();
  const raw = parseGearFit(model.root.getObjectByName('bones')?.userData['gear_fit']);
  if (raw === null) throw new Error('anatomy model has no gear fit');
  // Ski ends at the rest pose, from the ski mesh itself.
  const skiEnds = (side: LegSide): { readonly tip: () => Vector3; readonly tail: () => Vector3 } => {
    let mesh: Mesh | undefined;
    model.root.getObjectByName(`gear_ski_${letter(side)}`)?.traverse((o: Object3D) => {
      if ((o as Mesh).isMesh) mesh = o as Mesh;
    });
    const ski = mesh;
    if (ski === undefined) throw new Error('no ski mesh');
    const pos = ski.geometry.getAttribute('position');
    const pts = Array.from({ length: pos.count }, (_, i) => new Vector3(pos.getX(i), pos.getY(i), pos.getZ(i)).applyMatrix4(ski.matrixWorld));
    const low = Math.min(...pts.map((p) => p.y));
    const base = pts.filter((p) => p.y < low + 1e-3);
    const tip = base.reduce((a, b) => (b.z > a.z ? b : a));
    const tail = base.reduce((a, b) => (b.z < a.z ? b : a));
    const x = (tip.x + tail.x) / 2;
    return { tip: model.carried(`foot.${letter(side)}`, new Vector3(x, low, tip.z)), tail: model.carried(`foot.${letter(side)}`, new Vector3(x, low, tail.z)) };
  };
  const ends = { [BodySide.Right]: skiEnds(BodySide.Right), [BodySide.Left]: skiEnds(BodySide.Left) };
  const grips = {
    [BodySide.Right]: model.carried('hand.R', new Vector3(...gloveFrom(raw.right).grip)),
    [BodySide.Left]: model.carried('hand.L', new Vector3(...gloveFrom(raw.left).grip)),
  };
  return {
    name: 'anatomy',
    at: (t) => {
      model.pose(t);
      return {
        grip: (side) => vec(grips[side]()),
        ankle: (side) => vec(model.bone(`foot.${letter(side)}`).getWorldPosition(new Vector3())),
        ski: (side) => ({ tip: vec(ends[side].tip()), tail: vec(ends[side].tail()) }),
      };
    },
  };
};
