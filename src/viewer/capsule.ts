import {
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  CapsuleGeometry,
  Color,
  Matrix4,
  Mesh,
  MeshStandardNodeMaterial,
  Uint32BufferAttribute,
  Vector3,
} from 'three/webgpu';
import type { NodeBuilder, Scene } from 'three/webgpu';
import { attribute, mix, normalLocal, positionLocal, uniformArray, varying, vec4 } from 'three/tsl';
import type { MuscleLevel } from '../content/activation';
import { Side } from '../content/schema';
import { spreadCandidates } from './anchor-projection';
import type { AnchorPoint } from './anchor-projection';
import { levelColour, levelOn } from './level-colour';
import type { Vec3 } from './mat4';
import { BodySide, SEGMENTS, SegmentKind } from './figure';
import type { Segment } from './figure';
import { createGear, placePole } from './gear';
import type { LegSide } from './gear';
import { CAPSULE_BOOT, capsuleGlove, coveredByBoot } from './gear-fit';
import type { GearMode } from './gear-mode';
import { compose, transformPoint, translation } from './mat4';
import { CAPSULE_GRIP, poleDirection, poseAt, segmentMatrices } from './pose';
import { fillSlotLevels, musclePartAt } from './slots';
import type { SlotTable } from './slots';
import type { Figure } from './scene';

const SKIN = new Color(0xb9bec6);
const MUSCLE = new Color(0xc7b2a6);
const GEAR = new Color(0x2f4d7a);

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
  readonly #matrixNode = uniformArray<'mat4'>(this.matrices, 'mat4');

  constructor(slotCount: number) {
    super({ roughness: 0.75 });
    this.levels = Array.from({ length: slotCount }, () => 0);
    const level = varying(uniformArray<'float'>(this.levels, 'float').element(attribute('muscleSlot', 'uint')));
    const highlight = levelColour(level);
    const on = levelOn(level);
    this.colorNode = mix(attribute('color', 'vec3'), highlight, on);
    this.emissiveNode = highlight.mul(level.mul(0.35));
  }

  override setupPosition(builder: NodeBuilder): ReturnType<MeshStandardNodeMaterial['setupPosition']> {
    const m = this.#matrixNode.element(attribute('segment', 'uint'));
    positionLocal.assign(m.mul(vec4(positionLocal, 1)).xyz);
    normalLocal.assign(m.mul(vec4(normalLocal, 0)).xyz);
    return super.setupPosition(builder);
  }
}

/** The placeholder capsule skier. */
export const createCapsuleFigure = (scene: Scene, table: SlotTable, muscles: ReadonlyArray<string>): Figure => {
  const { geometry, anchors } = buildFigureGeometry(table);
  const material = new FigureMaterial(table.size);
  const figure = new Mesh(geometry, material);
  // Vertices move in the shader, so the rest-pose bounds are wrong.
  figure.frustumCulled = false;
  scene.add(figure);

  // The glove's palm faces the midline: -x for the left hand.
  const gear = createGear({ [BodySide.Right]: CAPSULE_BOOT, [BodySide.Left]: CAPSULE_BOOT }, { [BodySide.Right]: capsuleGlove(1), [BodySide.Left]: capsuleGlove(-1) });
  for (const part of [...gear.shells, ...gear.soles, ...gear.cuffs, ...gear.gloves]) {
    part.mesh.matrixAutoUpdate = false;
    scene.add(part.mesh);
  }
  for (const part of gear.poles) scene.add(part.mesh);

  const owners = new Map<number, { readonly muscle: string; readonly side: typeof Side.Outside | typeof Side.Inside }>();
  for (const muscle of muscles) for (const side of [Side.Outside, Side.Inside]) owners.set(table.slotOf(muscle, side), { muscle, side });
  const p = new Vector3();
  const n = new Vector3();

  return {
    update: (t: number, levels: ReadonlyArray<MuscleLevel>) => {
      const pose = poseAt(t);
      const world = segmentMatrices(pose);
      world.forEach((m, k) => material.matrices[k]?.fromArray(m));
      for (const { mesh, side } of [...gear.shells, ...gear.soles]) {
        const boot = world[segmentOf(SegmentKind.Boot, side)];
        if (boot !== undefined) mesh.matrix.fromArray(boot);
      }
      for (const { mesh, side } of gear.gloves) {
        const forearm = world[segmentOf(SegmentKind.Forearm, side)];
        if (forearm !== undefined) mesh.matrix.fromArray(forearm);
      }
      for (const { mesh, side } of gear.cuffs) {
        const shin = world[segmentOf(SegmentKind.Shin, side)];
        if (shin !== undefined) mesh.matrix.fromArray(compose(shin, translation(ANKLE)));
      }
      for (const { mesh, side } of gear.poles) {
        const forearm = world[segmentOf(SegmentKind.Forearm, side)];
        if (forearm === undefined) continue;
        const grip = transformPoint(forearm, CAPSULE_GRIP);
        const ankle = transformPoint(world[segmentOf(SegmentKind.Boot, side)] ?? forearm, [0, 0, 0]);
        placePole(mesh, grip, poleDirection(grip, side, side === BodySide.Left ? pose.poleTouch : 0, ankle));
      }
      fillSlotLevels(table, levels, material.levels);
    },
    anchors: (): ReadonlyArray<AnchorPoint> =>
      anchors.flatMap((a) => {
        const owner = owners.get(a.slot);
        const m = material.matrices[a.segment];
        if (owner === undefined || m === undefined) return [];
        p.copy(a.position).applyMatrix4(m);
        n.copy(a.normal).transformDirection(m);
        return [{ ...owner, position: [p.x, p.y, p.z] as const, normal: [n.x, n.y, n.z] as const }];
      }),
    setGear: (mode: GearMode) => gear.setMode(mode),
    setDark: (dark: boolean) => gear.setDark(dark),
    dispose: () => {
      gear.dispose();
      geometry.dispose();
      material.dispose();
    },
  };
};
