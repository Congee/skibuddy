import { CircleGeometry, Color, DirectionalLight, HemisphereLight, MathUtils, Matrix4, Mesh, MeshBasicNodeMaterial, PerspectiveCamera, PlaneGeometry, Raycaster, Scene, Vector2, WebGPURenderer } from 'three/webgpu';
import { color, float, length, positionLocal, smoothstep, uniform, vec2 } from 'three/tsl';
import type { MuscleLevel } from '../content/activation';
import { Intensity } from '../content/schema';
import { bestAnchors, sameAnchors } from './anchor-projection';
import type { AnchorPoint } from './anchor-projection';
import type { AnchorsListener, MuscleAnchor } from './anchors';
import { createCapsuleFigure } from './capsule';
import { createFrameScheduler } from './frame-scheduler';
import type { GearMode } from './gear-mode';
import { isDoubleTap, isTap, midpoint, pinchRatio, span, toNdc, wheelRatio } from './gestures';
import type { Point, TapAt } from './gestures';
import { chooseView, highlightSlots, highlightStrength, pointsFor, revealsDeep } from './highlight';
import type { FigureHighlight, Occluder } from './highlight';
import { DRAG_DAMPING, TURN_DAMPING, dampOrbit, dampStep } from './orbit';
import type { Orbit } from './orbit';
import { pickOf } from './pick';
import type { MusclePick } from './pick';
import { pixelRatio } from './pixel-ratio';
import { makeSlotTable } from './slots';
import type { MusclePart } from './slots';
import { HOME_FRAME, HOME_ORBIT, dampFrame, panBy, surfaceDepth, turnAim, zoomAbout } from './view';
import type { CameraFrame, Lens } from './view';

export const FigureKind = { Capsule: 'capsule', Anatomy: 'anatomy' } as const;
export type FigureKind = (typeof FigureKind)[keyof typeof FigureKind];

/** A posable figure in the scene. */
export interface Figure {
  readonly update: (t: number, levels: ReadonlyArray<MuscleLevel>) => void;
  /** One point per muscle and side, in world space, for the current pose. */
  readonly anchors: () => ReadonlyArray<AnchorPoint>;
  /** Limbs and trunk as capsules in the current pose, for whether a muscle is in view. */
  readonly occluders?: () => ReadonlyArray<Occluder>;
  readonly setSkeleton?: (on: boolean) => void;
  /** Steps motion the figure runs on its own, such as the skeleton fade; true while it still moves. */
  readonly animate?: (now: number) => boolean;
  readonly setGear?: (mode: GearMode) => void;
  /** The drill (null or one without a pose: the neutral stance) and how hard it is skied; the next update poses for it. */
  readonly setMotion?: (drill: string | null, intensity: Intensity) => void;
  /** The field behind the figure is dark. */
  readonly setDark?: (dark: boolean) => void;
  /** Marks these slots and dims the rest by `strength` (0 clears); `reveal` fades the unmarked muscles to show deep ones. */
  readonly setHighlight?: (slots: ReadonlyArray<number>, strength: number, reveal: boolean) => void;
  /** The shown muscle nearest along the ray, by its mesh's own id; null for bone, gear or nothing. */
  readonly pick?: (raycaster: Raycaster) => MusclePart | null;
  readonly dispose: () => void;
}

export interface ViewerOptions {
  readonly figure: FigureKind;
  /** Pin positions in CSS px relative to the canvas; called only when a pin moved. */
  readonly onAnchors?: AnchorsListener;
  readonly forceWebGL?: boolean;
  /** Each muscle's 0..1 level at turn time `t`. */
  readonly levels: (t: number) => ReadonlyArray<MuscleLevel>;
  /** The drill shown; its poses come from the build's tables and the anatomy model's clips. */
  readonly drill: string;
  /** A tap on the figure: the muscle under it, or null off any muscle. */
  readonly onPick?: (pick: MusclePick | null) => void;
  /** Pinch, wheel and two-finger pan; true by default. */
  readonly zoom?: boolean;
}

export interface Viewer {
  /** The figure actually shown; anatomy falls back to the capsule when its model fails to load. */
  readonly figure: FigureKind;
  /** Fades the muscles to show the skeleton; the capsule figure ignores it. */
  readonly setSkeleton: (on: boolean) => void;
  /** Boots and poles: translucent, solid or hidden. */
  readonly setGear: (mode: GearMode) => void;
  /** The drill and how hard it is skied: re-poses the figure from its tables and draws one frame. */
  readonly setMotion: (drill: string, intensity: Intensity) => void;
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
  readonly setZoom: (on: boolean) => void;
  /** CSS px of the canvas's bottom covered by a panel; the figure is framed in the rest. */
  readonly setInset: (bottom: number) => void;
  /** Eases back to the whole figure from the default angle. */
  readonly resetView: () => void;
  readonly dispose: () => void;
}

/** three runs a requestAnimationFrame loop from init even with no animation loop set; render() needs none of it. */
const stopIdleLoop = (renderer: WebGPURenderer): void => {
  const animation: unknown = Reflect.get(renderer, '_animation');
  if (typeof animation === 'object' && animation !== null && 'stop' in animation && typeof animation.stop === 'function') animation.stop();
};

/** An event's point in canvas px; the canvas has no border or padding. offsetX is wrong for synthetic events. */
const local = (e: MouseEvent): Point => {
  const r = (e.currentTarget as Element).getBoundingClientRect();
  return { x: e.clientX - r.left, y: e.clientY - r.top };
};

/** The ground fades out between these radii, so the horizon follows the camera. */
const GROUND_SOLID = 1.6;
/** A panel covers at most this share of the canvas; the figure keeps the rest. */
const MAX_INSET = 0.6;
/** Metres; a wheel or pinch off the body zooms no closer than this. */
const OFF_BODY_DISTANCE = 2.2;
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

  const camera = new PerspectiveCamera(32, 1, 0.05, 50);
  // Gestures move `aim` and `frameAim`; the camera eases toward them and stops once there.
  let aim: Orbit = HOME_ORBIT;
  let orbit: Orbit = aim;
  let frameAim: CameraFrame = HOME_FRAME;
  let frame: CameraFrame = frameAim;
  let damping = DRAG_DAMPING;
  const placeCamera = (): void => {
    const { distance, target } = frame;
    const r = distance * Math.cos(orbit.elevation);
    camera.position.set(target[0] + r * Math.sin(orbit.azimuth), target[1] + distance * Math.sin(orbit.elevation), target[2] + r * Math.cos(orbit.azimuth));
    camera.lookAt(target[0], target[1], target[2]);
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
  let intensity: Intensity = Intensity.Moderate;
  let drill = options.drill;
  figure.setMotion?.(drill, intensity);
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

  const eyeAt = (azimuth: number): readonly [number, number, number] => {
    const { distance, target } = frameAim;
    const r = distance * Math.cos(aim.elevation);
    return [target[0] + r * Math.sin(azimuth), target[1] + distance * Math.sin(aim.elevation), target[2] + r * Math.cos(azimuth)];
  };

  const turnToward = (): void => {
    if (highlight === null || pointers.size > 0) return;
    const points = pointsFor(figure.anchors(), highlight);
    const view = chooseView(points, eyeAt, figure.occluders?.() ?? [], orbit.azimuth);
    // Hidden from every side, such as between the legs: fade the muscles over it, as for a deep one.
    if (!view.seen && !revealsDeep(highlight)) figure.setHighlight?.(highlightSlots(table, highlight), highlightStrength(highlight), true);
    if (view.azimuth === null) return;
    ({ orbit: aim, frame: frameAim } = turnAim(aim, frameAim, view.azimuth));
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
    if (orbit !== aim || frame !== frameAim) {
      const step = reducedMotion.matches ? { orbit: aim, settled: true } : dampOrbit(orbit, aim, seconds, damping);
      const zoom = reducedMotion.matches ? { frame: frameAim, settled: true } : dampFrame(frame, frameAim, seconds, damping);
      orbit = step.orbit;
      frame = zoom.frame;
      moving = !step.settled || !zoom.settled;
      placeCamera();
    }
    if (inset !== insetAim) {
      const k = reducedMotion.matches ? 1 : dampStep(seconds, TURN_DAMPING);
      inset = Math.abs(insetAim - inset) < 0.5 ? insetAim : inset + (insetAim - inset) * k;
      project();
      moving = inset !== insetAim;
    }
    if (figure.animate?.(now) === true) moving = true;
    // No bloom pass: the muscle material carries its own glow.
    renderer.render(scene, camera);
    publishAnchors();
    // The next draw after a pause steps from now, not from the last frame.
    if (!moving) lastDraw = 0;
    return moving;
  };
  const scheduler = createFrameScheduler(draw);
  const invalidate = scheduler.invalidate;

  let zoomOn = options.zoom ?? true;
  const lens = (): Lens => ({ fov: MathUtils.degToRad(camera.fov), aspect: camera.aspect });
  // The uncovered part of the canvas is the camera's full view; the covered strip below extends it.
  const viewHeight = (): number => height - inset;
  const viewNdc = (p: Point): readonly [number, number] => toNdc(p, width, viewHeight());
  const zoomAt = (p: Point, ratio: number): void => {
    const body = figure.occluders?.() ?? [];
    const at = viewNdc(p);
    const hit = surfaceDepth(frameAim, aim, at, lens(), body);
    // Off the body, zooming in stops while most of the figure is still in view, not in empty air.
    const step = hit === null && ratio < 1 ? Math.min(1, Math.max(ratio, OFF_BODY_DISTANCE / frameAim.distance)) : ratio;
    frameAim = zoomAbout(frameAim, aim, at, step, lens(), hit);
  };

  // Pointers down on the canvas, in canvas px; one orbits, two pinch and pan.
  const pointers = new Map<number, Point>();
  // The gesture so far: where it began, how far its first pointer travelled, and whether it pinched.
  let gesture: { readonly start: Point; travel: number; pinched: boolean } | null = null;
  let pinch: { span: number; mid: Point } | null = null;
  let lastTap: TapAt | null = null;
  const raycaster = new Raycaster();
  const ndc = new Vector2();
  const known = new Set(muscles);

  const startPinch = (): void => {
    const [a, b] = [...pointers.values()];
    pinch = a === undefined || b === undefined ? null : { span: span(a, b), mid: midpoint(a, b) };
    if (gesture !== null) gesture.pinched = true;
  };

  const pickAt = (p: Point): MusclePick | null => {
    if (figure.pick === undefined || width === 0) return null;
    const [x, y] = toNdc(p, width, height);
    camera.updateMatrixWorld();
    raycaster.setFromCamera(ndc.set(x, y), camera);
    return pickOf(figure.pick(raycaster), known);
  };

  const resetView = (): void => {
    aim = HOME_ORBIT;
    frameAim = HOME_FRAME;
    damping = TURN_DAMPING;
    invalidate();
  };

  const onTap = (p: Point): void => {
    const picked = pickAt(p);
    const tap: TapAt = { ...p, at: performance.now() };
    // A double tap off the figure's muscles brings the whole figure back.
    if (picked === null && zoomOn && isDoubleTap(lastTap, tap)) {
      lastTap = null;
      resetView();
      return;
    }
    lastTap = picked === null ? tap : null;
    options.onPick?.(picked);
  };

  const onDown = (e: PointerEvent): void => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    // A pointer whose up never arrived must not turn the next press into a pinch.
    for (const id of pointers.keys()) if (id === e.pointerId || !canvas.hasPointerCapture(id)) pointers.delete(id);
    if (pointers.size === 0) pinch = null;
    const p = local(e);
    pointers.set(e.pointerId, p);
    canvas.setPointerCapture(e.pointerId);
    damping = DRAG_DAMPING;
    // A gesture takes over from a focus turn where the camera is now.
    aim = orbit;
    frameAim = frame;
    if (pointers.size === 1) gesture = { start: p, travel: 0, pinched: false };
    else if (pointers.size === 2 && zoomOn) startPinch();
    else if (gesture !== null) gesture.pinched = true;
  };
  const onMove = (e: PointerEvent): void => {
    const before = pointers.get(e.pointerId);
    if (before === undefined) return;
    // A mouse with no button held has been released somewhere we did not hear.
    if (e.pointerType === 'mouse' && e.buttons === 0) {
      lose(e);
      return;
    }
    const p = local(e);
    pointers.set(e.pointerId, p);
    if (pinch !== null && pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      if (a === undefined || b === undefined) return;
      const next = { span: span(a, b), mid: midpoint(a, b) };
      zoomAt(next.mid, pinchRatio(pinch.span, next.span));
      frameAim = panBy(frameAim, aim, next.mid.x - pinch.mid.x, next.mid.y - pinch.mid.y, viewHeight(), lens());
      pinch = next;
      invalidate();
      return;
    }
    if (pointers.size !== 1) return;
    if (gesture !== null) gesture.travel = Math.max(gesture.travel, Math.hypot(p.x - gesture.start.x, p.y - gesture.start.y));
    aim = {
      azimuth: aim.azimuth - (p.x - before.x) * 0.01,
      elevation: Math.min(1.2, Math.max(-0.1, aim.elevation + (p.y - before.y) * 0.01)),
    };
    invalidate();
  };
  const onUp = (e: PointerEvent): void => {
    if (!pointers.delete(e.pointerId)) return;
    // The finger left behind orbits on from where it is, without a jump.
    if (pointers.size < 2) pinch = null;
    if (pointers.size > 0 || gesture === null) return;
    const done = gesture;
    gesture = null;
    if (e.type === 'pointerup' && isTap(done.travel, done.pinched)) onTap(local(e));
  };
  const lose = (e: PointerEvent): void => {
    if (!pointers.delete(e.pointerId)) return;
    if (pointers.size < 2) pinch = null;
    if (pointers.size === 0) gesture = null;
  };
  const onWheel = (e: WheelEvent): void => {
    if (!zoomOn || e.deltaY === 0) return;
    e.preventDefault();
    damping = DRAG_DAMPING;
    zoomAt(local(e), wheelRatio(e.deltaY, e.deltaMode, e.ctrlKey));
    invalidate();
  };
  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerup', onUp);
  canvas.addEventListener('pointercancel', onUp);
  canvas.addEventListener('lostpointercapture', lose);
  canvas.addEventListener('wheel', onWheel, { passive: false });

  // Canvas size in CSS px, kept from the observer so frames never read layout.
  let width = 0;
  let height = 0;
  // CSS px covered at the bottom, eased toward the aim.
  let inset = 0;
  let insetAim = 0;
  let insetWanted = 0;
  const project = (): void => {
    const h = Math.max(1, height - inset);
    camera.aspect = width / h;
    camera.setViewOffset(width, h, 0, 0, width, height);
  };
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
    insetAim = Math.min(insetWanted, h * MAX_INSET);
    inset = Math.min(inset, h * MAX_INSET);
    project();
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
    setMotion: (nextDrill, next) => {
      if (next === intensity && nextDrill === drill) return;
      intensity = next;
      drill = nextDrill;
      figure.setMotion?.(nextDrill, next);
      posedAt = Number.NaN;
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
      figure.setHighlight?.(highlightSlots(table, next), highlightStrength(next), revealsDeep(next));
      // Only a new focus turns the camera; hover and collapse leave it.
      if (next?.focus === true) turnPending = true;
      invalidate();
    },
    setZoom: (on) => {
      zoomOn = on;
      if (!on) resetView();
    },
    setInset: (bottom) => {
      insetWanted = Math.max(0, bottom);
      const next = height === 0 ? 0 : Math.min(insetWanted, height * MAX_INSET);
      if (next === insetAim) return;
      insetAim = next;
      invalidate();
    },
    resetView,
    dispose: () => {
      scheduler.dispose();
      observer.disconnect();
      coarse.removeEventListener('change', onPointerKind);
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('pointercancel', onUp);
      canvas.removeEventListener('lostpointercapture', lose);
      canvas.removeEventListener('wheel', onWheel);
      figure.dispose();
      for (const m of [ground, contact]) {
        m.geometry.dispose();
        m.material.dispose();
      }
      void renderer.dispose();
    },
  };
};
