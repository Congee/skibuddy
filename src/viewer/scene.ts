import { CircleGeometry, DirectionalLight, HemisphereLight, Matrix4, Mesh, MeshStandardNodeMaterial, PerspectiveCamera, RenderPipeline, Scene, WebGPURenderer } from 'three/webgpu';
import { emissive, float, length, luminance, max, mrt, output, pass, positionLocal, smoothstep, vec4 } from 'three/tsl';
import { bloom } from 'three/addons/tsl/display/BloomNode.js';
import type { MuscleLevel } from '../content/activation';
import { bestAnchors, sameAnchors } from './anchor-projection';
import type { AnchorPoint } from './anchor-projection';
import type { AnchorsListener, MuscleAnchor } from './anchors';
import { createCapsuleFigure } from './capsule';
import { makeSlotTable } from './slots';

export const FigureKind = { Capsule: 'capsule', Anatomy: 'anatomy' } as const;
export type FigureKind = (typeof FigureKind)[keyof typeof FigureKind];

/** A posable figure in the scene. */
export interface Figure {
  readonly update: (t: number, levels: ReadonlyArray<MuscleLevel>) => void;
  /** One point per muscle and side, in world space, for the current pose. */
  readonly anchors: () => ReadonlyArray<AnchorPoint>;
  readonly setSkeleton?: (on: boolean) => void;
  readonly dispose: () => void;
}

export interface FrameInput {
  readonly t: number;
  readonly levels: ReadonlyArray<MuscleLevel>;
}

export interface ViewerOptions {
  readonly figure: FigureKind;
  /** Pin positions in CSS px relative to the canvas; called only when a pin moved. */
  readonly onAnchors?: AnchorsListener;
  readonly forceWebGL?: boolean;
}

export interface Viewer {
  /** The figure actually shown; anatomy falls back to the capsule when its model fails to load. */
  readonly figure: FigureKind;
  /** Fades the muscles to show the skeleton; the capsule figure ignores it. */
  readonly setSkeleton: (on: boolean) => void;
  readonly dispose: () => void;
}

const GROUND_RADIUS = 1.1;

export const createViewer = async (
  canvas: HTMLCanvasElement,
  muscles: ReadonlyArray<string>,
  frame: () => FrameInput,
  options: ViewerOptions,
): Promise<Viewer> => {
  const renderer = new WebGPURenderer({ canvas, antialias: true, alpha: true, forceWebGL: options.forceWebGL ?? false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  await renderer.init();

  const scene = new Scene();
  scene.add(new HemisphereLight(0xffffff, 0x8899aa, 1.6));
  const sun = new DirectionalLight(0xffffff, 2.2);
  sun.position.set(2, 4, 3);
  scene.add(sun);

  // A small patch of snow that fades into the background instead of a hard disc.
  const groundMaterial = new MeshStandardNodeMaterial({ color: 0xc9d3de, roughness: 1, transparent: true, depthWrite: false });
  groundMaterial.opacityNode = smoothstep(float(GROUND_RADIUS), float(GROUND_RADIUS * 0.35), length(positionLocal.xz)).mul(0.55);
  const ground = new Mesh(new CircleGeometry(GROUND_RADIUS, 48).rotateX(-Math.PI / 2), groundMaterial);
  ground.position.y = -0.001;
  scene.add(ground);

  const table = makeSlotTable(muscles);
  const loadAnatomy = async (): Promise<Figure | null> => {
    try {
      const { createAnatomyFigure } = await import('./anatomy');
      return await createAnatomyFigure(scene, table);
    } catch (e: unknown) {
      console.warn('anatomy figure unavailable, showing the capsule', e);
      return null;
    }
  };
  const anatomyFigure = options.figure === FigureKind.Anatomy ? await loadAnatomy() : null;
  const anatomy = anatomyFigure !== null;
  const figure: Figure = anatomyFigure ?? createCapsuleFigure(scene, table, muscles);
  if (anatomy) {
    // A cool back light separates the figure's silhouette from the background.
    const rim = new DirectionalLight(0xbfd8ff, 1.4);
    rim.position.set(-2, 3, -4);
    scene.add(rim);
  }

  const camera = new PerspectiveCamera(32, 1, 0.1, 50);
  const target = { x: 0, y: 0.7, z: 0 };
  const orbit = { azimuth: 0.7, elevation: 0.25, distance: 4.2 };
  const placeCamera = (): void => {
    const r = orbit.distance * Math.cos(orbit.elevation);
    camera.position.set(target.x + r * Math.sin(orbit.azimuth), target.y + orbit.distance * Math.sin(orbit.elevation), target.z + r * Math.cos(orbit.azimuth));
    camera.lookAt(target.x, target.y, target.z);
  };
  placeCamera();

  // Only emissive light blooms, so working muscles glow and nothing else does.
  let pipeline: RenderPipeline | null = null;
  if (anatomy) {
    pipeline = new RenderPipeline(renderer);
    const scenePass = pass(scene, camera);
    scenePass.setMRT(mrt({ output, emissive }));
    const glow = bloom(scenePass.getTextureNode('emissive'), 0.9, 0.4, 0);
    const colour = scenePass.getTextureNode('output');
    // Keep the canvas transparent around the figure, but let the glow spill past its edge.
    pipeline.outputNode = vec4(colour.rgb.add(glow.rgb), max(colour.a, luminance(glow.rgb)));
  }

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

  const viewProjection = new Matrix4();
  let anchors: ReadonlyArray<MuscleAnchor> = [];
  const publishAnchors = (): void => {
    if (options.onAnchors === undefined) return;
    camera.updateMatrixWorld();
    viewProjection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    const m = new Float32Array(viewProjection.elements);
    const eye = [camera.position.x, camera.position.y, camera.position.z] as const;
    const next = bestAnchors(m, eye, figure.anchors(), canvas.clientWidth, canvas.clientHeight);
    if (sameAnchors(anchors, next)) return;
    anchors = next;
    options.onAnchors(next);
  };

  if (anatomy) performance.mark('skibuddy:figure-ready');
  await renderer.setAnimationLoop(() => {
    const { t, levels } = frame();
    figure.update(t, levels);
    if (pipeline === null) renderer.render(scene, camera);
    else pipeline.render();
    publishAnchors();
  });

  return {
    figure: anatomy ? FigureKind.Anatomy : FigureKind.Capsule,
    setSkeleton: (on) => figure.setSkeleton?.(on),
    dispose: () => {
      void renderer.setAnimationLoop(null);
      observer.disconnect();
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('pointercancel', onUp);
      figure.dispose();
      pipeline?.dispose();
      ground.geometry.dispose();
      ground.material.dispose();
      void renderer.dispose();
    },
  };
};
