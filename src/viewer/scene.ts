import { CircleGeometry, Color, DirectionalLight, HemisphereLight, Matrix4, Mesh, MeshBasicNodeMaterial, PerspectiveCamera, PlaneGeometry, Scene, WebGPURenderer } from 'three/webgpu';
import { color, float, length, positionLocal, smoothstep, uniform, vec2 } from 'three/tsl';
import type { MuscleLevel } from '../content/activation';
import { bestAnchors, sameAnchors } from './anchor-projection';
import type { AnchorPoint } from './anchor-projection';
import type { AnchorsListener, MuscleAnchor } from './anchors';
import { createCapsuleFigure } from './capsule';
import { createFrameScheduler } from './frame-scheduler';
import type { GearMode } from './gear-mode';
import { highlightSlots, highlightStrength, pointsFor, turnAzimuth } from './highlight';
import type { FigureHighlight } from './highlight';
import { DRAG_DAMPING, TURN_DAMPING, dampOrbit } from './orbit';
import type { Orbit } from './orbit';
import { pixelRatio } from './pixel-ratio';
import { makeSlotTable } from './slots';

export const FigureKind = { Capsule: 'capsule', Anatomy: 'anatomy' } as const;
export type FigureKind = (typeof FigureKind)[keyof typeof FigureKind];

/** A posable figure in the scene. */
export interface Figure {
  readonly update: (t: number, levels: ReadonlyArray<MuscleLevel>) => void;
  /** One point per muscle and side, in world space, for the current pose. */
  readonly anchors: () => ReadonlyArray<AnchorPoint>;
  readonly setSkeleton?: (on: boolean) => void;
  /** Steps motion the figure runs on its own, such as the skeleton fade; true while it still moves. */
  readonly animate?: (now: number) => boolean;
  readonly setGear?: (mode: GearMode) => void;
  /** The field behind the figure is dark. */
  readonly setDark?: (dark: boolean) => void;
  /** Marks these slots and dims the rest by `strength` (0 clears). */
  readonly setHighlight?: (slots: ReadonlyArray<number>, strength: number) => void;
  readonly dispose: () => void;
}

export interface ViewerOptions {
  readonly figure: FigureKind;
  /** Pin positions in CSS px relative to the canvas; called only when a pin moved. */
  readonly onAnchors?: AnchorsListener;
  readonly forceWebGL?: boolean;
  /** Each muscle's 0..1 level at turn time `t`. */
  readonly levels: (t: number) => ReadonlyArray<MuscleLevel>;
}

export interface Viewer {
  /** The figure actually shown; anatomy falls back to the capsule when its model fails to load. */
  readonly figure: FigureKind;
  /** Fades the muscles to show the skeleton; the capsule figure ignores it. */
  readonly setSkeleton: (on: boolean) => void;
  /** Boots and poles: translucent, solid or hidden. */
  readonly setGear: (mode: GearMode) => void;
  /** CSS colour of the ground. */
  readonly setGround: (css: string) => void;
  /** Each muscle's level through the turn, such as another drill's; draws a frame. */
  readonly setLevels: (levels: (t: number) => ReadonlyArray<MuscleLevel>) => void;
  /** Position through the turn; draws a frame when it changed. */
  readonly setTime: (t: number) => void;
  /** Playback draws at a lower pixel ratio. */
  readonly setPlaying: (on: boolean) => void;
  /** Pin anchors are projected only while pins show. */
  readonly setPins: (on: boolean) => void;
  /** Singles out one muscle; a focus also turns the figure toward it if it faces away. */
  readonly setHighlight: (highlight: FigureHighlight | null) => void;
  readonly dispose: () => void;
}

/** three runs a requestAnimationFrame loop from init even with no animation loop set; render() needs none of it. */
const stopIdleLoop = (renderer: WebGPURenderer): void => {
  const animation: unknown = Reflect.get(renderer, '_animation');
  if (typeof animation === 'object' && animation !== null && 'stop' in animation && typeof animation.stop === 'function') animation.stop();
};

/** The ground fades out between these radii, so the horizon follows the camera. */
const GROUND_SOLID = 1.6;
const GROUND_RADIUS = 6.5;

export const createViewer = async (
  canvas: HTMLCanvasElement,
  muscles: ReadonlyArray<string>,
  options: ViewerOptions,
): Promise<Viewer> => {
  const renderer = new WebGPURenderer({ canvas, antialias: true, alpha: true, forceWebGL: options.forceWebGL ?? false });
  await renderer.init();
  stopIdleLoop(renderer);

  const scene = new Scene();
  scene.add(new HemisphereLight(0xffffff, 0x8899aa, 1.6));
  const sun = new DirectionalLight(0xffffff, 2.2);
  sun.position.set(2, 4, 3);
  scene.add(sun);

  // Unlit snow at y = 0 in the page's own colour, fading into the field with distance.
  const groundColour = uniform(new Color(0xe4ebe7));
  const groundMaterial = new MeshBasicNodeMaterial({ transparent: true, depthWrite: false });
  groundMaterial.colorNode = groundColour;
  groundMaterial.opacityNode = smoothstep(float(GROUND_RADIUS), float(GROUND_SOLID), length(positionLocal.xz));
  const ground = new Mesh(new CircleGeometry(GROUND_RADIUS, 96).rotateX(-Math.PI / 2), groundMaterial);
  ground.position.y = -0.002;
  scene.add(ground);

  // A soft contact shadow along the skis.
  const shadowMaterial = new MeshBasicNodeMaterial({ transparent: true, depthWrite: false });
  shadowMaterial.colorNode = color(0x050c0a);
  shadowMaterial.opacityNode = smoothstep(float(1), float(0.15), length(positionLocal.xz.div(vec2(0.42, 1.0)))).mul(0.6);
  const contact = new Mesh(new PlaneGeometry(0.84, 2).rotateX(-Math.PI / 2), shadowMaterial);
  contact.position.y = -0.001;
  contact.renderOrder = 1;
  scene.add(contact);

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
  const DISTANCE = 4.2;
  // The drag moves `aim`; the camera eases toward it and stops once there.
  let aim: Orbit = { azimuth: 0.7, elevation: 0.25 };
  let orbit: Orbit = aim;
  let damping = DRAG_DAMPING;
  const placeCamera = (): void => {
    const r = DISTANCE * Math.cos(orbit.elevation);
    camera.position.set(target.x + r * Math.sin(orbit.azimuth), target.y + DISTANCE * Math.sin(orbit.elevation), target.z + r * Math.cos(orbit.azimuth));
    camera.lookAt(target.x, target.y, target.z);
  };
  placeCamera();

  // Inputs to the next frame; a draw runs only when one of them changed.
  let time = 0;
  let posedAt = Number.NaN;
  let levels = options.levels;
  let playing = false;
  let pins = options.onAnchors !== undefined;
  let lastDraw = 0;
  let anchors: ReadonlyArray<MuscleAnchor> = [];
  let highlight: FigureHighlight | null = null;
  // Set by a new focus; the turn is worked out once the pose is current.
  let turnPending = false;
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const viewProjection = new Matrix4();
  const vp = new Float32Array(16);
  const eye: [number, number, number] = [0, 0, 0];

  const publishAnchors = (): void => {
    if (options.onAnchors === undefined || !pins) return;
    camera.updateMatrixWorld();
    viewProjection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    vp.set(viewProjection.elements);
    eye[0] = camera.position.x;
    eye[1] = camera.position.y;
    eye[2] = camera.position.z;
    const next = bestAnchors(vp, eye, figure.anchors(), width, height);
    if (sameAnchors(anchors, next)) return;
    anchors = next;
    options.onAnchors(next);
  };

  const turnToward = (): void => {
    if (highlight === null || drag !== null) return;
    const points = pointsFor(figure.anchors(), highlight);
    const azimuth = turnAzimuth(points, [camera.position.x, camera.position.y, camera.position.z], orbit.azimuth);
    if (azimuth === null) return;
    aim = { azimuth, elevation: aim.elevation };
    damping = TURN_DAMPING;
  };

  const draw = (now: number): boolean => {
    const seconds = lastDraw === 0 ? 0 : (now - lastDraw) / 1000;
    lastDraw = now;
    let moving = false;
    if (time !== posedAt) {
      posedAt = time;
      figure.update(time, levels(time));
    }
    if (turnPending) {
      turnPending = false;
      turnToward();
    }
    if (orbit !== aim) {
      const step = reducedMotion.matches ? { orbit: aim, settled: true } : dampOrbit(orbit, aim, seconds, damping);
      orbit = step.orbit;
      moving = !step.settled;
      placeCamera();
    }
    if (figure.animate?.(now) === true) moving = true;
    // No bloom pass: the muscle material carries its own glow.
    renderer.render(scene, camera);
    publishAnchors();
    // The next draw after a pause steps from now, not from the last frame.
    if (!moving) lastDraw = 0;
    return moving;
  };
  let drag: { x: number; y: number } | null = null;
  const scheduler = createFrameScheduler(draw);
  const invalidate = scheduler.invalidate;

  const onDown = (e: PointerEvent): void => {
    drag = { x: e.clientX, y: e.clientY };
    damping = DRAG_DAMPING;
    // A drag takes over from a focus turn where the camera is now.
    aim = orbit;
    canvas.setPointerCapture(e.pointerId);
  };
  const onMove = (e: PointerEvent): void => {
    if (drag === null) return;
    aim = {
      azimuth: aim.azimuth - (e.clientX - drag.x) * 0.01,
      elevation: Math.min(1.2, Math.max(-0.1, aim.elevation + (e.clientY - drag.y) * 0.01)),
    };
    drag = { x: e.clientX, y: e.clientY };
    invalidate();
  };
  const onUp = (): void => {
    drag = null;
  };
  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerup', onUp);
  canvas.addEventListener('pointercancel', onUp);

  // Canvas size in CSS px, kept from the observer so frames never read layout.
  let width = 0;
  let height = 0;
  const coarse = window.matchMedia('(pointer: coarse)');
  const applyPixelRatio = (): void => {
    const ratio = pixelRatio({ devicePixelRatio: window.devicePixelRatio, handheld: coarse.matches || Math.min(window.innerWidth, window.innerHeight) <= 600, playing });
    if (ratio !== renderer.getPixelRatio()) renderer.setPixelRatio(ratio);
  };
  const resize = (entries: ReadonlyArray<ResizeObserverEntry>): void => {
    const box = entries.at(-1)?.contentRect;
    const w = Math.round(box?.width ?? 0);
    const h = Math.round(box?.height ?? 0);
    if (w === 0 || h === 0 || (w === width && h === height)) return;
    width = w;
    height = h;
    applyPixelRatio();
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    invalidate();
  };
  const observer = new ResizeObserver(resize);
  observer.observe(canvas);
  const onPointerKind = (): void => {
    applyPixelRatio();
    invalidate();
  };
  coarse.addEventListener('change', onPointerKind);

  if (anatomy) performance.mark('skibuddy:figure-ready');

  return {
    figure: anatomy ? FigureKind.Anatomy : FigureKind.Capsule,
    setSkeleton: (on) => {
      figure.setSkeleton?.(on);
      invalidate();
    },
    setGear: (mode) => {
      figure.setGear?.(mode);
      invalidate();
    },
    setGround: (css) => {
      const before = groundColour.value.getHex();
      groundColour.value.set(css);
      if (groundColour.value.getHex() === before) return;
      // Dark snow means the dark theme.
      const { r, g, b } = groundColour.value;
      figure.setDark?.(0.2126 * r + 0.7152 * g + 0.0722 * b < 0.25);
      invalidate();
    },
    setLevels: (next) => {
      if (next === levels) return;
      levels = next;
      posedAt = Number.NaN;
      invalidate();
    },
    setTime: (t) => {
      if (t === time) return;
      time = t;
      invalidate();
    },
    setPlaying: (on) => {
      if (on === playing) return;
      playing = on;
      applyPixelRatio();
      invalidate();
    },
    setPins: (on) => {
      if (on === pins) return;
      pins = on && options.onAnchors !== undefined;
      // Fresh anchors when pins come back.
      anchors = [];
      invalidate();
    },
    setHighlight: (next) => {
      if (next?.muscle === highlight?.muscle && next?.side === highlight?.side && next?.focus === highlight?.focus) return;
      highlight = next;
      figure.setHighlight?.(highlightSlots(table, next), highlightStrength(next));
      // Only a new focus turns the camera; hover and collapse leave it.
      if (next?.focus === true) turnPending = true;
      invalidate();
    },
    dispose: () => {
      scheduler.dispose();
      observer.disconnect();
      coarse.removeEventListener('change', onPointerKind);
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('pointercancel', onUp);
      figure.dispose();
      for (const m of [ground, contact]) {
        m.geometry.dispose();
        m.material.dispose();
      }
      void renderer.dispose();
    },
  };
};
