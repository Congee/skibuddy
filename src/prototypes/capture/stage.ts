import { Bone, Color, DirectionalLight, Group, HemisphereLight, Matrix4, Mesh, MeshStandardNodeMaterial, PerspectiveCamera, PropertyBinding, Scene, SkinnedMesh, Vector3, WebGPURenderer } from 'three/webgpu';
import type { Object3D } from 'three/webgpu';
import type { MuscleLevel } from '../../content/activation';
import type { MuscleId } from '../../content/schema';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { ANATOMY_URL, buildAnatomyFigure } from '../../viewer/anatomy';
import { makeSlotTable } from '../../viewer/slots';
import { SKELETON_DATA, restWorld, rigidInverse } from '../../viewer/skeleton';
import { compose } from '../../viewer/mat4';
import type { CameraPose, CaptureFrame } from './data';
import { segmentWorlds } from './data';
import type { ThreeView } from './overlay';

export const ViewMode = { Footage: 'footage', Orbit: 'orbit', Overlay: 'overlay' } as const;
export type ViewMode = (typeof ViewMode)[keyof typeof ViewMode];

/** One Z-Anatomy figure posed straight from segment frames. */
interface Posable {
  readonly rig: Group;
  readonly pose: (f: Shown) => void;
  /** Lights the slot table's muscles; resets the bones to the still clip, so pose after it. */
  readonly lit: (levels: ReadonlyArray<MuscleLevel>) => void;
}

/** A frame and the limb scales its pose file was fitted with. */
export interface Shown {
  readonly frame: CaptureFrame;
  readonly limbs?: Readonly<Record<string, number>> | undefined;
}

const SEGMENTS = Object.entries(SKELETON_DATA.segments);

const loadFigure = async (scene: Scene, ghost: MeshStandardNodeMaterial | null, muscles: ReadonlyArray<MuscleId> = []): Promise<Posable> => {
  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);
  const gltf = await loader.loadAsync(ANATOMY_URL);
  const rig = new Group();
  scene.add(rig);
  const figure = buildAnatomyFigure(rig, makeSlotTable(muscles), gltf);
  const root = gltf.scene;
  // Poles are placed from drill tables the capture doesn't have.
  for (const c of rig.children) if (c !== root) c.visible = false;
  root.updateMatrixWorld(true);
  const skinned: Array<SkinnedMesh> = [];
  root.traverse((o) => {
    if (o instanceof SkinnedMesh) skinned.push(o);
    if (ghost !== null && o instanceof Mesh) o.material = ghost;
  });
  // Bone world = segment world * segment rest^-1 * bone rest, as the bake places bones.
  const bones = SEGMENTS.map(([name, s]) => {
    const bone = root.getObjectByName(PropertyBinding.sanitizeNodeName(s.bone));
    if (!(bone instanceof Bone)) throw new Error(`anatomy model has no bone ${s.bone}`);
    return { name, bone, offset: compose(rigidInverse(restWorld(name)), new Float32Array(bone.matrixWorld.elements)) };
  });
  const parentWorld = new Matrix4();
  const world = new Matrix4();
  const placed = new Map<Object3D, Matrix4>();
  return {
    rig,
    pose: (f) => {
      // Scaled offsets move child bones; skin weighted across a joint stretches with them.
      const w = segmentWorlds(f.frame, f.limbs);
      placed.clear();
      for (const { name, bone, offset } of bones) {
        const seg = w[name];
        if (seg === undefined) continue;
        const target = new Matrix4().fromArray(compose(seg, offset));
        const parent = bone.parent;
        if (parent === null) continue;
        parentWorld.copy(placed.get(parent) ?? parent.matrixWorld);
        world.copy(parentWorld).invert().multiply(target);
        world.decompose(bone.position, bone.quaternion, bone.scale);
        placed.set(bone, target);
      }
      root.updateMatrixWorld(true);
      for (const m of skinned) m.skeleton.update();
    },
    lit: (levels) => figure.update(0, levels),
  };
};

export interface Stage {
  /** `pinhole` is the gates' camera, used by the overlay view; `levels` light the main figure's muscles. */
  readonly show: (main: Shown, other: Shown | null, camera: CameraPose | null, pinhole: ThreeView | null, levels?: ReadonlyArray<MuscleLevel>) => void;
  readonly setView: (mode: ViewMode) => void;
  /** Metres the compared figure stands to the camera's right; 0 overlays it. */
  readonly setBeside: (metres: number) => void;
  readonly dispose: () => void;
}

const UP = new Vector3(0, 1, 0);

export const createStage = async (canvas: HTMLCanvasElement, dark: boolean, muscles: ReadonlyArray<MuscleId> = []): Promise<Stage> => {
  const renderer = new WebGPURenderer({ canvas, antialias: true, alpha: true });
  await renderer.init();
  // three idles a rAF loop from init; render() needs none of it.
  const animation: unknown = Reflect.get(renderer, '_animation');
  if (typeof animation === 'object' && animation !== null && 'stop' in animation && typeof animation.stop === 'function') animation.stop();
  const clear = new Color(dark ? 0x101114 : 0xf4f5f7);
  renderer.setClearColor(clear);

  const scene = new Scene();
  scene.add(new HemisphereLight(0xffffff, 0x8899aa, 1.6));
  const sun = new DirectionalLight(0xffffff, 2.2);
  sun.position.set(2, 4, 3);
  scene.add(sun);
  const rim = new DirectionalLight(0xbfd8ff, 1.4);
  rim.position.set(-2, 3, -4);
  scene.add(rim);

  const ghostMaterial = new MeshStandardNodeMaterial({ color: 0x2f7bff, roughness: 0.6, transparent: true, opacity: 0.35, depthWrite: false });
  const [main, other] = await Promise.all([loadFigure(scene, null, muscles), loadFigure(scene, ghostMaterial)]);
  other.rig.renderOrder = 2;

  const camera = new PerspectiveCamera(30, 16 / 9, 0.05, 200);
  let mode: ViewMode = ViewMode.Footage;
  let beside = 0;
  let last: { main: Shown; other: Shown | null; cam: CameraPose | null; pin: ThreeView | null } | null = null;
  // Orbit about the pelvis: azimuth from +z, elevation, distance.
  const orbit = { az: 0, el: 0.15, dist: 4.5, seeded: false };
  const target = new Vector3();
  const right = new Vector3();

  const resize = (): boolean => {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (w === 0 || h === 0) return false;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    return true;
  };

  const draw = (): void => {
    if (last === null || !resize()) return;
    const { cam, pin } = last;
    target.set(...last.main.frame.pelvis.pos);
    if (cam !== null && !orbit.seeded) {
      orbit.az = Math.atan2(cam.pos[0] - target.x, cam.pos[2] - target.z);
      orbit.dist = Math.hypot(cam.pos[0] - target.x, cam.pos[2] - target.z);
      orbit.seeded = true;
    }
    renderer.setClearColor(clear, mode === ViewMode.Overlay ? 0 : 1);
    camera.clearViewOffset();
    if (mode === ViewMode.Overlay && pin !== null) {
      const [w, h] = pin.size;
      camera.position.set(...pin.pos);
      camera.quaternion.set(...pin.quat);
      camera.fov = pin.fovY;
      camera.aspect = w / h;
      camera.setViewOffset(w, h, pin.offset[0], pin.offset[1], w, h);
    } else if ((mode === ViewMode.Footage || mode === ViewMode.Overlay) && cam !== null) {
      camera.position.set(...cam.pos);
      camera.quaternion.set(...cam.quat);
      camera.fov = cam.fovY;
    } else {
      camera.fov = 30;
      camera.position.set(
        target.x + orbit.dist * Math.cos(orbit.el) * Math.sin(orbit.az),
        target.y + orbit.dist * Math.sin(orbit.el),
        target.z + orbit.dist * Math.cos(orbit.el) * Math.cos(orbit.az),
      );
      camera.lookAt(target);
    }
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();
    other.rig.visible = last.other !== null;
    if (last.other !== null) {
      right.setFromMatrixColumn(camera.matrixWorld, 0).projectOnPlane(UP).normalize().multiplyScalar(beside);
      const o = last.other.frame;
      const [x, y, z] = o.pelvis.pos;
      other.pose({ ...last.other, frame: { ...o, pelvis: { ...o.pelvis, pos: [x + right.x, y, z + right.z] } } });
    }
    renderer.render(scene, camera);
  };

  // Drag orbits (switching to orbit view), wheel zooms; nothing redraws on its own.
  let drag: { x: number; y: number } | null = null;
  const onDown = (e: PointerEvent): void => {
    if (mode === ViewMode.Overlay) return;
    drag = { x: e.clientX, y: e.clientY };
    canvas.setPointerCapture(e.pointerId);
  };
  const onMove = (e: PointerEvent): void => {
    if (drag === null) return;
    orbit.az -= (e.clientX - drag.x) * 0.008;
    orbit.el = Math.min(1.4, Math.max(-0.3, orbit.el + (e.clientY - drag.y) * 0.008));
    drag = { x: e.clientX, y: e.clientY };
    mode = ViewMode.Orbit;
    canvas.dispatchEvent(new CustomEvent('viewmode', { detail: mode }));
    draw();
  };
  const onUp = (): void => {
    drag = null;
  };
  const onWheel = (e: WheelEvent): void => {
    e.preventDefault();
    orbit.dist = Math.min(30, Math.max(1, orbit.dist * Math.exp(e.deltaY * 0.001)));
    if (mode === ViewMode.Orbit) draw();
  };
  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerup', onUp);
  canvas.addEventListener('wheel', onWheel, { passive: false });
  const observer = new ResizeObserver(() => draw());
  observer.observe(canvas);

  return {
    show: (m, o, cam, pin, levels) => {
      if (levels !== undefined) main.lit(levels);
      main.pose(m);
      last = { main: m, other: o, cam, pin };
      draw();
    },
    setView: (v) => {
      mode = v;
      draw();
    },
    setBeside: (metres) => {
      beside = metres;
      draw();
    },
    dispose: () => {
      observer.disconnect();
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('wheel', onWheel);
      renderer.dispose();
    },
  };
};
