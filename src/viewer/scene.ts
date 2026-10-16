import { BufferAttribute, BufferGeometry, CircleGeometry, Color, DirectionalLight, Group, HemisphereLight, MathUtils, Matrix4, Mesh, MeshBasicNodeMaterial, PerspectiveCamera, PlaneGeometry, Raycaster, Scene, Vector2, Vector3, WebGPURenderer } from 'three/webgpu';
import { color, dot, float, length, normalWorld, positionLocal, positionWorld, smoothstep, uniform, vec2, vec3 } from 'three/tsl';
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
import { ViewLock, hipLock, slopeLock } from './hip-lock';
import { chooseView, highlightSlots, highlightStrength, pointsFor, revealsDeep } from './highlight';
import type { FigureHighlight, Occluder } from './highlight';
import { DRAG_DAMPING, TURN_DAMPING, dampOrbit, dampStep } from './orbit';
import type { Orbit } from './orbit';
import { pickOf } from './pick';
import type { Pose } from './pose';
import { rideOf } from './ride';
import { SurfaceKind, fieldMesh, heightAt, pathAt, surfaceFor } from './surface';
import type { Surface } from './surface';
import { headingAt, turnPath } from './turn-heading';
import type { MusclePick } from './pick';
import { pixelRatio } from './pixel-ratio';
import { makeSlotTable } from './slots';
import type { MusclePart } from './slots';
import { FOLLOW_ORBIT, HOME_FRAME, HOME_ORBIT, SLOPE_ORBIT, ballsOf, clearSnow, dampFrame, fitFrame, panBy, surfaceDepth, turnAim, zoomAbout } from './view';
import type { Ball, CameraFrame, GearStops, Ground, Lens } from './view';

export const FigureKind = { Capsule: 'capsule', Anatomy: 'anatomy' } as const;
export type FigureKind = (typeof FigureKind)[keyof typeof FigureKind];

/** A posable figure in the scene. */
export interface Figure {
  readonly update: (t: number, levels: ReadonlyArray<MuscleLevel>) => void;
  /** The pose the next update at `t` shows. */
  readonly pose: (t: number) => Pose;
  /** One point per muscle and side, in world space, for the current pose. */
  readonly anchors: () => ReadonlyArray<AnchorPoint>;
  /** Limbs and trunk as capsules in the current pose, for whether a muscle is in view. */
  readonly occluders?: () => ReadonlyArray<Occluder>;
  /** Skis, boots and poles as posed, for where a zoom stops; computed on demand. */
  readonly gearStops?: () => GearStops;
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
  /** Skis fixed by default. */
  readonly viewLock?: ViewLock;
  /** CSS px along the canvas's edges that overlays cover; the fitted figure keeps out of them. */
  readonly margin?: ViewMargin;
}

export interface ViewMargin {
  readonly top: number;
  readonly bottom: number;
  readonly side: number;
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
  /** Position through the turn, and whether the turn is drawn mirrored; draws a frame when either changed. */
  readonly setTime: (t: number, mirrored?: boolean) => void;
  /** Playback draws at a lower pixel ratio. */
  readonly setPlaying: (on: boolean) => void;
  /** Pin anchors are projected only while pins show. */
  readonly setPins: (on: boolean) => void;
  /** Singles out one muscle; a focus also turns the figure toward it if it faces away. */
  readonly setHighlight: (highlight: FigureHighlight | null) => void;
  readonly setZoom: (on: boolean) => void;
  /** Skis, hips or slope held still; eases to that mode's home view. */
  readonly setViewLock: (lock: ViewLock) => void;
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
const IDENTITY = new Matrix4().elements;
/** Poses per turn sampled for the fitted frame; the other turn is their mirror. */
const FIT_SAMPLES = 24;
/** A margin of `px` on a side `size` px long, in NDC; overlays never take most of the view. */
const edge = (px: number, size: number): number => Math.min(0.8, (2 * px) / size);
const MIRROR = new Matrix4().makeScale(-1, 1, 1);
/** The field's grid: half its side covers the fade's radius wherever the turn puts the skier; metres. */
const FIELD_HALF = 12;
const FIELD_STEP: Readonly<Record<SurfaceKind, number>> = { groomed: 1, moguls: 0.1, powder: 0.25 };
/** Loose snow lets the buried gear show through faintly. */
const SNOW_SOLID: Readonly<Record<SurfaceKind, number>> = { groomed: 1, moguls: 1, powder: 0.8 };
/** A fixed light, up and to the left of the home view, that tints the snow by its slope. */
const SNOW_LIGHT = new Vector3(-0.5, 0.8, 0.35).normalize();
/** How much a face turned toward or away from the light lightens or darkens, and a lift that reads on dark snow. */
const SNOW_SHADE = 1.2;
const SNOW_GLOW = 0.15;
const sameSurface = (a: Surface, b: Surface): boolean =>
  a.kind === b.kind && a.spacing === b.spacing && a.relief === b.relief && a.depth === b.depth && a.columns === b.columns;

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

  // Bumps and loose snow: the same colour and fade, tinted by how each face turns to SNOW_LIGHT.
  const fieldMaterial = new MeshBasicNodeMaterial({ transparent: true });
  const lit = dot(normalWorld, vec3(SNOW_LIGHT.x, SNOW_LIGHT.y, SNOW_LIGHT.z)).sub(SNOW_LIGHT.y);
  fieldMaterial.colorNode = groundColour.mul(lit.mul(SNOW_SHADE).add(1)).add(lit.mul(SNOW_GLOW));
  const fieldSolid = uniform(1);
  fieldMaterial.opacityNode = smoothstep(float(GROUND_RADIUS), float(GROUND_SOLID), length(positionWorld.xz)).mul(fieldSolid);
  let field: Mesh<BufferGeometry, MeshBasicNodeMaterial> | null = null;
  const fieldInverse = new Matrix4();
  const fieldTurn = new Matrix4();
  const fieldShift = new Matrix4();
  const probe = new Vector3();
  // Metres the figure rides up so its skis rest on the field, whose datum stays at y = 0.
  let lift = 0;
  const lifted = new Matrix4();
  const unlifted = new Matrix4();

  // A soft contact shadow along the skis.
  const shadowMaterial = new MeshBasicNodeMaterial({ transparent: true, depthWrite: false });
  shadowMaterial.colorNode = color(0x050c0a);
  shadowMaterial.opacityNode = smoothstep(float(1), float(0.15), length(positionLocal.xz.div(vec2(0.42, 1.0)))).mul(0.6);
  const contact = new Mesh(new PlaneGeometry(0.84, 2).rotateX(-Math.PI / 2), shadowMaterial);
  contact.position.y = -0.001;
  contact.renderOrder = 1;
  // The figure's root: the hip lock moves it, so the snow and lights stay with the view.
  const rig = new Group();
  rig.matrixAutoUpdate = false;
  rig.add(contact);
  scene.add(rig);

  const table = makeSlotTable(muscles);
  const loadAnatomy = async (): Promise<Figure | null> => {
    try {
      const { createAnatomyFigure } = await import('./anatomy');
      return await createAnatomyFigure(rig, table);
    } catch (e: unknown) {
      console.warn('anatomy figure unavailable, showing the capsule', e);
      return null;
    }
  };
  const anatomyFigure = options.figure === FigureKind.Anatomy ? await loadAnatomy() : null;
  const anatomy = anatomyFigure !== null;
  const figure: Figure = anatomyFigure ?? createCapsuleFigure(rig, table, muscles);
  if (anatomy) {
    // A cool back light separates the figure's silhouette from the background.
    const rim = new DirectionalLight(0xbfd8ff, 1.4);
    rim.position.set(-2, 3, -4);
    scene.add(rim);
  }

  const camera = new PerspectiveCamera(32, 1, 0.05, 50);
  let lock: ViewLock = options.viewLock ?? ViewLock.SkisFixed;
  // Hips fixed follows from behind, down the fall line the hips face; slope fixed watches from below.
  const homeOrbit = (): Orbit => (lock === ViewLock.HipsFixed ? FOLLOW_ORBIT : lock === ViewLock.SlopeFixed ? SLOPE_ORBIT : HOME_ORBIT);
  // Gestures move `aim` and `frameAim`; the camera eases toward them and stops once there.
  let aim: Orbit = homeOrbit();
  let orbit: Orbit = aim;
  // The whole figure through the two-turn cycle, fitted once per drill, intensity, view and view size.
  let home: CameraFrame = HOME_FRAME;
  let cycle: ReadonlyArray<Ball> | null = null;
  let fitStale = true;
  let fitted = false;
  // A user zoom, pan or orbit holds until a reset.
  let userMoved = false;
  let frameAim: CameraFrame = HOME_FRAME;
  let frame: CameraFrame = frameAim;
  let damping = DRAG_DAMPING;
  const placeCamera = (): void => {
    const { distance, target } = frame;
    // The eased orbit and frame can dip below the snow between two aims that clear it.
    const { azimuth, elevation } = clearSnow(frame, orbit, snowAt);
    const r = distance * Math.cos(elevation);
    camera.position.set(target[0] + r * Math.sin(azimuth), target[1] + distance * Math.sin(elevation), target[2] + r * Math.cos(azimuth));
    camera.lookAt(target[0], target[1], target[2]);
  };

  // Inputs to the next frame; a draw runs only when one of them changed.
  let time = 0;
  let posedAt = Number.NaN;
  let mirrored = false;
  let posedMirrored = false;
  let levels = options.levels;
  let playing = false;
  let pins = options.onAnchors !== undefined;
  let lastDraw = 0;
  let anchors: ReadonlyArray<MuscleAnchor> = [];
  let highlight: FigureHighlight | null = null;
  let intensity: Intensity = Intensity.Moderate;
  let drill = options.drill;
  figure.setMotion?.(drill, intensity);
  let surface = surfaceFor(drill, intensity);
  const buildField = (): void => {
    if (field !== null) {
      scene.remove(field);
      field.geometry.dispose();
      field = null;
    }
    const groomed = surface.kind === SurfaceKind.Groomed;
    ground.visible = groomed;
    // A flat shadow would float over the troughs or sit under loose snow.
    contact.visible = groomed;
    if (groomed) return;
    fieldSolid.value = SNOW_SOLID[surface.kind];
    const { positions, normals, indices } = fieldMesh(surface, FIELD_HALF, FIELD_STEP[surface.kind]);
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new BufferAttribute(positions, 3));
    geometry.setAttribute('normal', new BufferAttribute(normals, 3));
    geometry.setIndex(new BufferAttribute(indices, 1));
    field = new Mesh(geometry, fieldMaterial);
    field.matrixAutoUpdate = false;
    field.renderOrder = -1;
    scene.add(field);
  };
  buildField();
  /** Slides the field so the skier at `time` stands on its path: rotated off the skis by the heading, mirrored with the figure. */
  const placeField = (root: ArrayLike<number>): void => {
    if (field === null) return;
    const p = pathAt(surface, time);
    field.matrix.fromArray(root).multiply(fieldTurn.makeRotationY(-p.heading)).multiply(fieldShift.makeTranslation(-p.x, -lift, -p.z));
    if (mirrored) field.matrix.premultiply(MIRROR);
    fieldInverse.copy(field.matrix).invert();
    field.matrixWorldNeedsUpdate = true;
  };
  const snowAt: Ground = (x, z) => {
    if (field === null) return 0;
    probe.set(x, 0, z).applyMatrix4(fieldInverse);
    return heightAt(surface, probe.x, probe.z);
  };
  placeCamera();
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
    ({ orbit: aim, frame: frameAim } = turnAim(aim, frameAim, view.azimuth, home));
    damping = TURN_DAMPING;
  };

  const rootAt = (t: number): ArrayLike<number> => {
    lift = rideOf(surface, t, figure.pose(t)).lift;
    return lifted.makeTranslation(0, lift, 0).multiply(unlifted.fromArray(lockedAt(t))).elements;
  };
  const lockedAt = (t: number): ArrayLike<number> => {
    switch (lock) {
      case ViewLock.HipsFixed:
        return hipLock(figure.pose(t));
      case ViewLock.SlopeFixed:
        return slopeLock(figure.pose(t), headingAt(t, turnPath(drill, intensity)));
      default:
        return IDENTITY;
    }
  };

  // Each pose of both turns, as balls round the body and gear in world space.
  const sampleCycle = (): ReadonlyArray<Ball> => {
    const balls: Array<Ball> = [];
    for (let i = 0; i < FIT_SAMPLES; i++) {
      const t = i / FIT_SAMPLES;
      rig.matrix.fromArray(rootAt(t));
      rig.updateMatrixWorld(true);
      figure.update(t, levels(t));
      const gear = figure.gearStops?.() ?? { capsules: [], boxes: [] };
      balls.push(...ballsOf([...(figure.occluders?.() ?? []), ...gear.capsules], gear.boxes));
    }
    // The other turn is this one mirrored in x.
    const mirror = balls.map(({ center: [x, y, z], radius }): Ball => ({ center: [-x, y, z], radius }));
    posedAt = Number.NaN;
    return [...balls, ...mirror];
  };

  const refit = (): void => {
    if (width === 0 || height === 0) return;
    cycle ??= sampleCycle();
    fitStale = false;
    const w = width;
    const h = Math.max(1, height - insetAim);
    const m = options.margin ?? { top: 0, bottom: 0, side: 0 };
    const area = { left: -1 + edge(m.side, w), right: 1 - edge(m.side, w), bottom: -1 + edge(m.bottom, h), top: 1 - edge(m.top, h) };
    home = fitFrame(cycle, homeOrbit(), { fov: MathUtils.degToRad(camera.fov), aspect: w / h }, area);
    if (userMoved) return;
    frameAim = home;
    // The first fit shows the figure at once instead of easing in from the default frame.
    if (!fitted) {
      frame = home;
      placeCamera();
    }
    fitted = true;
  };

  const draw = (now: number): boolean => {
    const seconds = lastDraw === 0 ? 0 : (now - lastDraw) / 1000;
    lastDraw = now;
    let moving = false;
    if (fitStale) refit();
    if (time !== posedAt || mirrored !== posedMirrored) {
      posedAt = time;
      posedMirrored = mirrored;
      const root = rootAt(time);
      rig.matrix.fromArray(root);
      placeField(root);
      // The other turn is this one reflected: outside and inside keep their meshes, so levels and slots hold.
      if (mirrored) rig.matrix.premultiply(MIRROR);
      rig.updateMatrixWorld(true);
      figure.update(time, levels(time));
      // The snow moved under the camera.
      if (field !== null) placeCamera();
    }
    if (turnPending) {
      turnPending = false;
      turnToward();
    }
    aim = clearSnow(frameAim, aim, snowAt);
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
    const gear: GearStops = figure.gearStops?.() ?? { capsules: [], boxes: [] };
    const at = viewNdc(p);
    const hit = surfaceDepth(frameAim, aim, at, lens(), [...body, ...gear.capsules], gear.boxes);
    const snow = surfaceDepth(frameAim, aim, at, lens(), [], [], snowAt);
    // Off the body, zooming in stops while most of the figure is still in view, not in empty air.
    const step = hit === null && ratio < 1 ? Math.min(1, Math.max(ratio, OFF_BODY_DISTANCE / frameAim.distance)) : ratio;
    frameAim = zoomAbout(frameAim, aim, at, step, lens(), hit === null ? snow : snow === null ? hit : Math.min(hit, snow), home);
    userMoved = true;
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
    userMoved = false;
    aim = homeOrbit();
    frameAim = home;
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
      frameAim = panBy(frameAim, aim, next.mid.x - pinch.mid.x, next.mid.y - pinch.mid.y, viewHeight(), lens(), home);
      pinch = next;
      invalidate();
      return;
    }
    if (pointers.size !== 1) return;
    if (gesture !== null) gesture.travel = Math.max(gesture.travel, Math.hypot(p.x - gesture.start.x, p.y - gesture.start.y));
    if (gesture !== null && !isTap(gesture.travel, false)) userMoved = true;
    aim = clearSnow(
      frameAim,
      {
        azimuth: aim.azimuth - (p.x - before.x) * 0.01,
        elevation: Math.min(1.2, Math.max(-0.1, aim.elevation + (p.y - before.y) * 0.01)),
      },
      snowAt,
    );
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
    fitStale = true;
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
      // Hidden poles leave the frame.
      cycle = null;
      fitStale = true;
      invalidate();
    },
    setMotion: (nextDrill, next) => {
      if (next === intensity && nextDrill === drill) return;
      intensity = next;
      drill = nextDrill;
      figure.setMotion?.(nextDrill, next);
      const nextSurface = surfaceFor(nextDrill, next);
      if (!sameSurface(surface, nextSurface)) {
        surface = nextSurface;
        buildField();
      }
      posedAt = Number.NaN;
      cycle = null;
      fitStale = true;
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
    setTime: (t, flip = false) => {
      if (t === time && flip === mirrored) return;
      time = t;
      mirrored = flip;
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
    setViewLock: (next) => {
      if (next === lock) return;
      lock = next;
      posedAt = Number.NaN;
      cycle = null;
      refit();
      resetView();
    },
    setInset: (bottom) => {
      insetWanted = Math.max(0, bottom);
      const next = height === 0 ? 0 : Math.min(insetWanted, height * MAX_INSET);
      if (next === insetAim) return;
      insetAim = next;
      fitStale = true;
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
      field?.geometry.dispose();
      fieldMaterial.dispose();
      void renderer.dispose();
    },
  };
};
