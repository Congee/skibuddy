import {
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  CapsuleGeometry,
  CircleGeometry,
  Color,
  DirectionalLight,
  HemisphereLight,
  Matrix4,
  Mesh,
  MeshStandardNodeMaterial,
  PerspectiveCamera,
  Scene,
  Uint32BufferAttribute,
  WebGPURenderer,
} from 'three/webgpu';
import type { NodeBuilder } from 'three/webgpu';
import { attribute, color, mix, normalLocal, positionLocal, uniformArray, varying, vec4 } from 'three/tsl';
import type { MuscleLevel } from '../content/activation';
import { SEGMENTS, SegmentKind } from './figure';
import type { Segment } from './figure';
import { poseAt, segmentMatrices } from './pose';
import { fillSlotLevels, makeSlotTable, musclePartAt } from './slots';
import type { SlotTable } from './slots';

const HIGHLIGHT = 0xe4572e;
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

/** Merges every segment into one geometry tagged with `segment` and `muscleSlot`, both uint per vertex. */
const buildFigureGeometry = (table: SlotTable): BufferGeometry => {
  const parts = SEGMENTS.map(shapeGeometry);
  const vertexCount = parts.reduce((n, g) => n + g.getAttribute('position').count, 0);
  const indexCount = parts.reduce((n, g) => n + (g.index?.count ?? 0), 0);
  const position = new Float32Array(vertexCount * 3);
  const normal = new Float32Array(vertexCount * 3);
  const colour = new Float32Array(vertexCount * 3);
  const segmentIds = new Uint32Array(vertexCount);
  const slots = new Uint32Array(vertexCount);
  const index = new Uint32Array(indexCount);
  let v = 0;
  let i = 0;
  parts.forEach((part, s) => {
    const segment = SEGMENTS[s];
    if (segment === undefined) return;
    const pos = part.getAttribute('position');
    const nor = part.getAttribute('normal');
    const gear = segment.kind === SegmentKind.Boot || segment.kind === SegmentKind.Ski;
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
  return geometry;
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
    const highlight = color(HIGHLIGHT);
    this.colorNode = mix(attribute('color', 'vec3'), highlight, level);
    this.emissiveNode = highlight.mul(level.mul(0.35));
  }

  override setupPosition(builder: NodeBuilder): ReturnType<MeshStandardNodeMaterial['setupPosition']> {
    const m = this.#matrixNode.element(attribute('segment', 'uint'));
    positionLocal.assign(m.mul(vec4(positionLocal, 1)).xyz);
    normalLocal.assign(m.mul(vec4(normalLocal, 0)).xyz);
    return super.setupPosition(builder);
  }
}

export interface FrameInput {
  readonly t: number;
  readonly levels: ReadonlyArray<MuscleLevel>;
}

export interface Viewer {
  readonly dispose: () => void;
}

export const createViewer = async (
  canvas: HTMLCanvasElement,
  muscles: ReadonlyArray<string>,
  frame: () => FrameInput,
): Promise<Viewer> => {
  const renderer = new WebGPURenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  await renderer.init();

  const scene = new Scene();
  scene.add(new HemisphereLight(0xffffff, 0x8899aa, 1.6));
  const sun = new DirectionalLight(0xffffff, 2.2);
  sun.position.set(2, 4, 3);
  scene.add(sun);

  const ground = new Mesh(new CircleGeometry(1.6, 48).rotateX(-Math.PI / 2), new MeshStandardNodeMaterial({ color: 0xe8eef5, roughness: 1 }));
  ground.position.y = -0.001;
  scene.add(ground);

  const table = makeSlotTable(muscles);
  const geometry = buildFigureGeometry(table);
  const material = new FigureMaterial(table.size);
  const figure = new Mesh(geometry, material);
  // Vertices move in the shader, so the rest-pose bounds are wrong.
  figure.frustumCulled = false;
  scene.add(figure);

  const camera = new PerspectiveCamera(32, 1, 0.1, 50);
  const target = { x: 0, y: 0.7, z: 0 };
  const orbit = { azimuth: 0.7, elevation: 0.25, distance: 4.2 };
  const placeCamera = (): void => {
    const r = orbit.distance * Math.cos(orbit.elevation);
    camera.position.set(target.x + r * Math.sin(orbit.azimuth), target.y + orbit.distance * Math.sin(orbit.elevation), target.z + r * Math.cos(orbit.azimuth));
    camera.lookAt(target.x, target.y, target.z);
  };
  placeCamera();

  let drag: { x: number; y: number } | null = null;
  const onDown = (e: PointerEvent): void => {
    drag = { x: e.clientX, y: e.clientY };
    canvas.setPointerCapture(e.pointerId);
  };
  const onMove = (e: PointerEvent): void => {
    if (drag === null) return;
    orbit.azimuth -= (e.clientX - drag.x) * 0.01;
    orbit.elevation = Math.min(1.2, Math.max(-0.1, orbit.elevation + (e.clientY - drag.y) * 0.01));
    drag = { x: e.clientX, y: e.clientY };
    placeCamera();
  };
  const onUp = (): void => {
    drag = null;
  };
  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerup', onUp);
  canvas.addEventListener('pointercancel', onUp);

  const resize = (): void => {
    const { clientWidth: w, clientHeight: h } = canvas;
    if (w === 0 || h === 0) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };
  const observer = new ResizeObserver(resize);
  observer.observe(canvas);
  resize();

  await renderer.setAnimationLoop(() => {
    const { t, levels } = frame();
    segmentMatrices(poseAt(t)).forEach((m, k) => material.matrices[k]?.fromArray(m));
    fillSlotLevels(table, levels, material.levels);
    renderer.render(scene, camera);
  });

  return {
    dispose: () => {
      void renderer.setAnimationLoop(null);
      observer.disconnect();
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('pointercancel', onUp);
      geometry.dispose();
      material.dispose();
      ground.geometry.dispose();
      ground.material.dispose();
      void renderer.dispose();
    },
  };
};
