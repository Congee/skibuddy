import {
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  CapsuleGeometry,
  Color,
  Group,
  Matrix4,
  Mesh,
  MeshStandardNodeMaterial,
  Uint32BufferAttribute,
  Vector3,
} from 'three/webgpu';
import type { NodeBuilder, Object3D } from 'three/webgpu';
import {
  attribute,
  color,
  dot,
  float,
  mix,
  normalLocal,
  normalView,
  positionLocal,
  positionViewDirection,
  pow,
  saturate,
  uniform,
  uniformArray,
  varying,
  vec4,
} from 'three/tsl';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import type { MuscleLevel } from '../content/activation';
import { Intensity, Side } from '../content/schema';
import { spreadCandidates } from './anchor-projection';
import type { AnchorPoint } from './anchor-projection';
import { levelColour, levelOn } from './level-colour';
import type { Vec3 } from './mat4';
import { EQUIPMENT, shellInFoot } from './equipment';
import { BodySide, CAPSULE_BINDING, SEGMENTS, SegmentKind } from './figure';
import type { Segment } from './figure';
import { createGear, gearStops, placePole } from './gear';
import type { LegSide } from './gear';
import { CAPSULE_BOOT, coveredByBoot } from './gear-fit';
import { GearMode } from './gear-mode';
import { compose, transformPoint, translation } from './mat4';
import { CAPSULE_ARM, CAPSULE_GRIP, poleDirection, poleSize, poleTouchOf, segmentMatrices } from './pose';
import { poleTrimOf } from './poses';
import { poseTable, samplePose } from './pose-table';
import { markChanges } from './highlight';
import { fillSlotLevels, musclePartAt } from './slots';
import type { SlotTable } from './slots';
import type { Occluder } from './highlight';
import type { Figure } from './scene';
import { boxIn } from './view';
import type { Box, GearStops } from './view';

const SKIN = new Color(0xb9bec6);
const MUSCLE = new Color(0xc7b2a6);
const GEAR = new Color(0x34373c);

const shapeGeometry = (segment: Segment): BufferGeometry => {
  const { shape } = segment;
  const geometry =
    shape.type === 'capsule'
      ? new CapsuleGeometry(shape.radius, shape.length, 6, 20, 8)
      : new BoxGeometry(shape.size[0], shape.size[1], shape.size[2], 6, 4, 8);
  geometry.translate(shape.center[0], shape.center[1], shape.center[2]);
  return geometry;
};

/** A pin's point in its segment's frame. */
interface LocalAnchor {
  readonly slot: number;
  readonly segment: number;
  readonly position: Vector3;
  readonly normal: Vector3;
}

interface SlotPoint {
  readonly segment: number;
  readonly position: Vector3;
  readonly normal: Vector3;
}

/** Per slot, candidate pins spread around the middle of the slot's patch on its largest segment. */
const pickAnchors = (points: Map<number, Array<SlotPoint>>): ReadonlyArray<LocalAnchor> =>
  [...points].flatMap(([slot, all]) => {
    const counts = new Map<number, number>();
    for (const p of all) counts.set(p.segment, (counts.get(p.segment) ?? 0) + 1);
    const segment = [...counts].reduce((a, b) => (b[1] > a[1] ? b : a))[0];
    const own = all.filter((p) => p.segment === segment);
    const centre = own.reduce((c, p) => c.add(p.position), new Vector3()).divideScalar(own.length);
    const picked = spreadCandidates(own.map((p): Vec3 => [p.position.x, p.position.y, p.position.z]), [centre.x, centre.y, centre.z], 8);
    return picked.flatMap((i) => {
      const p = own[i];
      return p === undefined ? [] : [{ slot, segment, position: p.position, normal: p.normal }];
    });
  });

/** The ankle in the shin's frame. */
const ANKLE: Vec3 = SEGMENTS.find((s) => s.kind === SegmentKind.Boot)?.joint ?? [0, 0, 0];

const SHELL = shellInFoot(CAPSULE_BOOT, EQUIPMENT);

const FEET = new Set(SEGMENTS.flatMap((s, i) => (s.kind === SegmentKind.Boot ? [i] : [])));
const HIDDEN = new Vector3(0, 0, 0);

const segmentOf = (kind: SegmentKind, side: LegSide): number => SEGMENTS.findIndex((s) => s.kind === kind && s.side === side);

/** Merges every segment into one geometry tagged with `segment` and `muscleSlot`, both uint per vertex. */
const buildFigureGeometry = (table: SlotTable): { readonly geometry: BufferGeometry; readonly anchors: ReadonlyArray<LocalAnchor> } => {
  const parts = SEGMENTS.map(shapeGeometry);
  const vertexCount = parts.reduce((n, g) => n + g.getAttribute('position').count, 0);
  const indexCount = parts.reduce((n, g) => n + (g.index?.count ?? 0), 0);
  const position = new Float32Array(vertexCount * 3);
  const normal = new Float32Array(vertexCount * 3);
  const colour = new Float32Array(vertexCount * 3);
  const segmentIds = new Uint32Array(vertexCount);
  const slots = new Uint32Array(vertexCount);
  const index = new Uint32Array(indexCount);
  const points = new Map<number, Array<SlotPoint>>();
  let v = 0;
  let i = 0;
  parts.forEach((part, s) => {
    const segment = SEGMENTS[s];
    if (segment === undefined) return;
    const pos = part.getAttribute('position');
    const nor = part.getAttribute('normal');
    const gear = segment.kind === SegmentKind.Ski;
    // Pins skip the shin inside the boot cuff.
    const booted = segment.kind === SegmentKind.Shin;
    for (const k of part.index?.array ?? []) index[i++] = k + v;
    for (let k = 0; k < pos.count; k++, v++) {
      const p = [pos.getX(k), pos.getY(k), pos.getZ(k)] as const;
      position.set(p, v * 3);
      normal.set([nor.getX(k), nor.getY(k), nor.getZ(k)], v * 3);
      const muscle = musclePartAt(segment, p);
      slots[v] = muscle === null ? 0 : table.slotOf(muscle.muscle, muscle.side);
      const base = gear ? GEAR : slots[v] === 0 ? SKIN : MUSCLE;
      colour.set([base.r, base.g, base.b], v * 3);
      segmentIds[v] = s;
      const slot = slots[v] ?? 0;
      if (slot > 0 && !(booted && coveredByBoot(CAPSULE_BOOT, ANKLE, p))) {
        const list = points.get(slot) ?? [];
        list.push({ segment: s, position: new Vector3(...p), normal: new Vector3(nor.getX(k), nor.getY(k), nor.getZ(k)) });
        points.set(slot, list);
      }
    }
    part.dispose();
  });
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(position, 3));
  geometry.setAttribute('normal', new BufferAttribute(normal, 3));
  geometry.setAttribute('color', new BufferAttribute(colour, 3));
  geometry.setAttribute('segment', new Uint32BufferAttribute(segmentIds, 1));
  geometry.setAttribute('muscleSlot', new Uint32BufferAttribute(slots, 1));
  geometry.setIndex(new BufferAttribute(index, 1));
  return { geometry, anchors: pickAnchors(points) };
};

/** Poses rigid segments in the vertex stage, like skinning with one bone per vertex. */
class FigureMaterial extends MeshStandardNodeMaterial {
  readonly matrices = SEGMENTS.map(() => new Matrix4());
  readonly levels: Array<number>;
  readonly marks: Array<number>;
  readonly strength = uniform(0);
  readonly #matrixNode = uniformArray<'mat4'>(this.matrices, 'mat4');

  constructor(slotCount: number) {
    super({ roughness: 0.75 });
    this.levels = Array.from({ length: slotCount }, () => 0);
    this.marks = Array.from({ length: slotCount }, () => 0);
    const slot = attribute('muscleSlot', 'uint');
    const marked = varying(uniformArray<'float'>(this.marks, 'float').element(slot));
    // Unmarked muscles dim while one is highlighted; the marked one gains a pale outline.
    const others = this.strength.mul(float(1).sub(marked));
    const level = varying(uniformArray<'float'>(this.levels, 'float').element(slot)).mul(float(1).sub(others.mul(0.97)));
    const highlight = levelColour(level);
    const on = levelOn(level);
    const outline = pow(float(1).sub(saturate(dot(normalView, positionViewDirection))), 2.4).mul(marked.mul(this.strength).mul(1.5));
    this.colorNode = mix(attribute('color', 'vec3'), highlight, on);
    this.emissiveNode = highlight.mul(on.mul(0.15)).add(color(0xf3f5f1).mul(outline));
  }

  override setupPosition(builder: NodeBuilder): ReturnType<MeshStandardNodeMaterial['setupPosition']> {
    const m = this.#matrixNode.element(attribute('segment', 'uint'));
    positionLocal.assign(m.mul(vec4(positionLocal, 1)).xyz);
    normalLocal.assign(m.mul(vec4(normalLocal, 0)).xyz);
    return super.setupPosition(builder);
  }
}

/**
 * A fist closed on the pole grip, in a frame with the grip up +y, the fingers
 * toward +z and the palm's far side toward `medial` x; the thumb lies over it.
 */
const createFist = (material: MeshStandardNodeMaterial, medial: 1 | -1): Group => {
  const hand = new RoundedBoxGeometry(0.065, 0.09, 0.075, 3, 0.02);
  hand.translate(medial * -0.0025, 0, 0.0025);
  const thumb = new CapsuleGeometry(0.011, 0.03, 4, 10);
  thumb.rotateX(Math.PI / 2);
  thumb.translate(medial * 0.026, 0.034, 0.006);
  const fist = new Group();
  fist.add(new Mesh(hand, material), new Mesh(thumb, material));
  return fist;
};

const fistBasis = new Matrix4();
const up = new Vector3();
const ahead = new Vector3();
const across = new Vector3();

/** The placeholder capsule skier. */
export const createCapsuleFigure = (parent: Object3D, table: SlotTable, muscles: ReadonlyArray<string>): Figure => {
  const { geometry, anchors } = buildFigureGeometry(table);
  const material = new FigureMaterial(table.size);
  const figure = new Mesh(geometry, material);
  // Vertices move in the shader, so the rest-pose bounds are wrong.
  figure.frustumCulled = false;
  parent.add(figure);

  const gear = createGear({ [BodySide.Right]: CAPSULE_BOOT, [BodySide.Left]: CAPSULE_BOOT });
  for (const part of [...gear.shells, ...gear.soles, ...gear.cuffs, ...gear.plates, ...gear.bindings]) {
    part.mesh.matrixAutoUpdate = false;
    parent.add(part.mesh);
  }
  for (const part of gear.poles) parent.add(part.mesh);
  // The midline is +x for the right hand once the fist's grip points up and its fingers forward.
  const skin = new MeshStandardNodeMaterial({ color: SKIN, roughness: 0.75 });
  const fists = [
    { side: BodySide.Right, fist: createFist(skin, 1) },
    { side: BodySide.Left, fist: createFist(skin, -1) },
  ] as const;
  for (const { fist } of fists) parent.add(fist);

  const owners = new Map<number, { readonly muscle: string; readonly side: typeof Side.Outside | typeof Side.Inside }>();
  for (const muscle of muscles) for (const side of [Side.Outside, Side.Inside]) owners.set(table.slotOf(muscle, side), { muscle, side });
  const p = new Vector3();
  const n = new Vector3();
  const toWorld = new Matrix4();
  let marked: ReadonlyArray<number> = [];
  let poses = poseTable(null, Intensity.Moderate);
  let size = poleSize(CAPSULE_ARM);
  // The box foot reads as a block through the translucent shell, so the boot stands in for it.
  let footShown = false;

  return {
    setMotion: (drill: string | null, intensity: Intensity) => {
      poses = poseTable(drill, intensity);
      size = poleSize(CAPSULE_ARM, poleTrimOf(drill));
      gear.setPole(size);
    },
    pose: (t: number) => samplePose(poses, t),
    update: (t: number, levels: ReadonlyArray<MuscleLevel>) => {
      const pose = samplePose(poses, t);
      const world = segmentMatrices(pose);
      world.forEach((m, k) => {
        const target = material.matrices[k];
        if (target === undefined) return;
        target.fromArray(m);
        if (!footShown && FEET.has(k)) target.scale(HIDDEN);
      });
      for (const [parts, local] of [[[...gear.shells, ...gear.soles], SHELL], [[...gear.plates, ...gear.bindings], CAPSULE_BINDING]] as const) {
        for (const { mesh, side } of parts) {
          const foot = world[segmentOf(SegmentKind.Boot, side)];
          if (foot !== undefined) mesh.matrix.fromArray(compose(foot, local));
        }
      }
      for (const { mesh, side } of gear.cuffs) {
        const shin = world[segmentOf(SegmentKind.Shin, side)];
        if (shin !== undefined) mesh.matrix.fromArray(compose(shin, translation(ANKLE)));
      }
      for (const { side, fist } of fists) {
        const forearm = world[segmentOf(SegmentKind.Forearm, side)];
        if (forearm === undefined) continue;
        const grip = transformPoint(forearm, CAPSULE_GRIP);
        const ankle = transformPoint(world[segmentOf(SegmentKind.Boot, side)] ?? forearm, [0, 0, 0]);
        const elbow = transformPoint(forearm, [0, 0, 0]);
        const axis: Vec3 = [grip[0] - elbow[0], grip[1] - elbow[1], grip[2] - elbow[2]];
        const direction = poleDirection(grip, side, poleTouchOf(pose, side), ankle, size.basket, axis);
        const pole = gear.poles.find((g) => g.side === side);
        if (pole !== undefined) placePole(pole.mesh, grip, direction);
        // The fist closes round the grip, its fingers along the forearm.
        up.set(-direction[0], -direction[1], -direction[2]);
        const wrist = transformPoint(forearm, [0, -0.28, 0]);
        ahead.set(grip[0] - wrist[0], grip[1] - wrist[1], grip[2] - wrist[2]);
        ahead.addScaledVector(up, -ahead.dot(up)).normalize();
        across.crossVectors(up, ahead);
        fist.position.set(grip[0], grip[1], grip[2]);
        fist.quaternion.setFromRotationMatrix(fistBasis.makeBasis(across, up, ahead));
      }
      // The capsule draws parents, so parts light them.
      fillSlotLevels(table, levels, material.levels, true);
    },
    anchors: (): ReadonlyArray<AnchorPoint> =>
      anchors.flatMap((a) => {
        const owner = owners.get(a.slot);
        const m = material.matrices[a.segment];
        if (owner === undefined || m === undefined) return [];
        // Segment matrices are in the figure's root; the hip lock moves that root.
        p.copy(a.position).applyMatrix4(m).applyMatrix4(figure.matrixWorld);
        n.copy(a.normal).transformDirection(m).transformDirection(figure.matrixWorld);
        return [{ ...owner, position: [p.x, p.y, p.z] as const, normal: [n.x, n.y, n.z] as const }];
      }),
    occluders: (): ReadonlyArray<Occluder> =>
      SEGMENTS.flatMap((segment, k): ReadonlyArray<Occluder> => {
        const m = material.matrices[k];
        const { shape } = segment;
        if (m === undefined || shape.type !== 'capsule' || shape.length === 0) return [];
        const end = (dy: number): Vec3 => {
          p.set(shape.center[0], shape.center[1] + dy, shape.center[2]).applyMatrix4(m).applyMatrix4(figure.matrixWorld);
          return [p.x, p.y, p.z];
        };
        return [{ a: end(-shape.length / 2), b: end(shape.length / 2), radius: shape.radius }];
      }),
    gearStops: (): GearStops => {
      const worn = gearStops(gear);
      const skis = SEGMENTS.flatMap((segment, k): ReadonlyArray<Box> => {
        const m = material.matrices[k];
        const { shape } = segment;
        if (m === undefined || segment.kind !== SegmentKind.Ski || shape.type !== 'box') return [];
        figure.updateWorldMatrix(true, false);
        return [boxIn(toWorld.copy(figure.matrixWorld).multiply(m).elements, shape.center, shape.size)];
      });
      return { capsules: worn.capsules, boxes: [...worn.boxes, ...skis] };
    },
    setGear: (mode: GearMode) => {
      footShown = mode === GearMode.Off;
      gear.setMode(mode);
    },
    setDark: (dark: boolean) => gear.setDark(dark),
    setHighlight: (slots: ReadonlyArray<number>, strength: number) => {
      for (const [slot, value] of markChanges(marked, slots)) material.marks[slot] = value;
      marked = slots;
      material.strength.value = strength;
    },
    dispose: () => {
      gear.dispose();
      for (const { fist } of fists) {
        fist.removeFromParent();
        fist.traverse((o) => {
          if (o instanceof Mesh) o.geometry.dispose();
        });
      }
      skin.dispose();
      geometry.dispose();
      material.dispose();
    },
  };
};
