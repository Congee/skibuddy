import { AnimationMixer, DoubleSide, Matrix4, MeshStandardNodeMaterial, PropertyBinding, SkinnedMesh, Uint32BufferAttribute, Vector3, Vector4 } from 'three/webgpu';
import type { AnimationAction, AnimationClip, Intersection, Mesh, Object3D, Raycaster, Skeleton } from 'three/webgpu';
import {
  attribute,
  color,
  dot,
  float,
  fwidth,
  mix,
  normalView,
  positionViewDirection,
  pow,
  saturate,
  sin,
  smoothstep,
  uniform,
  uniformArray,
  uv,
  varying,
} from 'three/tsl';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import type { MuscleLevel } from '../content/activation';
import { Intensity } from '../content/schema';
import type { AnchorPoint } from './anchor-projection';
import { EQUIPMENT, bindingInFoot, shellInFoot } from './equipment';
import type { Mat4, Vec3 } from './mat4';
import { BodySide } from './figure';
import { createGear, placePole } from './gear';
import type { Gear, LegSide } from './gear';
import { bootFitFrom, parseGearFit, standingArm } from './gear-fit';
import type { BootFit, RawFit } from './gear-fit';
import type { GearMode } from './gear-mode';
import { CAPSULE_ARM, poleDirection, poleSize, poleTouchOf } from './pose';
import type { StandingArm } from './pose';
import { poleTrimOf } from './poses';
import { poseTable, samplePose } from './pose-table';
import type { PoseTable } from './pose-table';
import { NEUTRAL_CLIP, NodeKind, motionClipName, nodeOf } from './anatomy-names';
import type { AnatomyNode } from './anatomy-names';
import { markChanges } from './highlight';
import type { Occluder } from './highlight';
import { ancestorsOf } from './muscle-groups';
import { PickRole, pickRole } from './pick';
import { fillSlotLevels } from './slots';
import type { MusclePart, SlotTable, TurnSide } from './slots';
import { levelColour, levelOn } from './level-colour';
import type { Figure } from './scene';

export const ANATOMY_URL = `${import.meta.env.BASE_URL}models/anatomy.glb`;

const MUSCLE_RED = 0xb4483e;
const TENDON = 0xe6dccb;
const BONE = 0xe8dcc2;
const CARTILAGE = 0xc6d9de;
const GEAR = 0x34373c;
const RIM_COOL = 0x9fc6ff;
const GHOST = 0x2a3440;
/** The focus outline: the pins' leader colour, so a focused muscle and its pin match. */
const FOCUS_RIM = 0xf3f5f1;
/** Fibre stripe spacing in metres; the UVs are metres around and along each muscle. */
const FIBRE_SPACING = 0.006;
/** Seconds for the skeleton fade. */
const FADE_SECONDS = 0.35;

type Uniform = ReturnType<typeof uniform<'float'>>;

/** Marks per slot, how strongly the marked muscle stands out, and how far the rest fade to show a deep one. */
interface HighlightInputs {
  readonly marks: Array<number>;
  readonly strength: Uniform;
  readonly reveal: Uniform;
}

/**
 * Natural fibred red muscle at rest. Working muscles take the board's level
 * colour as albedo, darker with effort, plus a faint same-hue glow and a rim
 * that widens with level, so the level reads from lightness and halo width, not hue alone. `skeleton` fades
 * muscles to a dark translucent ghost, leaving working muscles partly visible.
 * A highlighted muscle keeps its effort and gains a pale outline; the rest dim toward resting red,
 * or, for a deep muscle, fade to a faint ghost over it.
 */
const muscleMaterial = (levels: Array<number>, highlight: HighlightInputs, skeleton: Uniform, tendon: boolean): MeshStandardNodeMaterial => {
  const m = new MeshStandardNodeMaterial({ roughness: tendon ? 0.35 : 0.5 });
  const slot = attribute('muscleSlot', 'uint');
  const marked = varying(uniformArray<'float'>(highlight.marks, 'float').element(slot));
  const mark = marked.mul(highlight.strength);
  const others = highlight.strength.mul(float(1).sub(marked));
  const veil = highlight.reveal.mul(float(1).sub(marked));
  const level = varying(uniformArray<'float'>(levels, 'float').element(slot)).mul(float(1).sub(others.mul(0.97)));
  const facing = saturate(dot(normalView, positionViewDirection));
  // Higher levels get a wider rim.
  const rim = pow(float(1).sub(facing), mix(float(3.2), float(0.8), level));

  const phase = uv().x.mul((2 * Math.PI) / FIBRE_SPACING).add(sin(uv().y.mul(40)).mul(1.5));
  // Fade the stripes out once they get close to a pixel apart, before they alias.
  const fibre = sin(phase).mul(0.5).add(0.5).mul(float(1).sub(smoothstep(0.15, 0.5, fwidth(phase).div(2 * Math.PI))));

  const base = color(tendon ? TENDON : MUSCLE_RED);
  const hot = levelColour(level);
  const on = levelOn(level);
  const lit = mix(base, hot, on.mul(tendon ? 0.3 : 1));
  const shaded = lit.mul(float(1).sub(fibre.mul(tendon ? 0.06 : 0.22))).mul(float(1).sub(others.mul(0.3)));
  m.colorNode = mix(mix(shaded, color(GHOST), skeleton.mul(float(1).sub(on))), color(GHOST), veil.mul(0.6));
  // Albedo carries the level; a small same-hue glow and rim keep it legible, never paler, so darker reads as harder.
  const glow = hot.mul(on.mul(tendon ? 0.06 : 0.18)).mul(float(0.75).add(fibre.mul(0.25)));
  const rimGain = on.mul(float(0.4).add(level.mul(tendon ? 0.3 : 0.8)));
  const outline = color(FOCUS_RIM).mul(pow(float(1).sub(facing), 2.4).mul(mark.mul(tendon ? 1 : 2.6)));
  const lifted = base.mul(mark.mul(0.18));
  const emissive = glow.add(hot.mul(rim.mul(rimGain))).add(color(RIM_COOL).mul(rim.mul(0.06))).add(outline).add(lifted);
  m.emissiveNode = emissive.mul(float(1).sub(veil.mul(0.8)));
  const ghost = mix(float(1), saturate(rim.mul(0.35).add(0.12).add(level.mul(0.55)).add(mark.mul(0.5))), skeleton);
  m.opacityNode = ghost.mul(mix(float(1), saturate(rim.mul(0.4).add(0.05)), veil));
  return m;
};

/** Skins one vertex on the CPU into world space, into `out`; with w = 0 it maps a direction. */
const skinned = (mesh: SkinnedMesh, index: number, v: Vector4, out: Vector3 = new Vector3()): Vector3 => {
  mesh.applyBoneTransform(index, v);
  out.set(v.x, v.y, v.z);
  return v.w === 0 ? out.transformDirection(mesh.matrixWorld) : mesh.localToWorld(out);
};

const vertexIn = (mesh: SkinnedMesh, name: 'position' | 'normal', index: number, w: number, out: Vector4 = new Vector4()): Vector4 => {
  const a = mesh.geometry.getAttribute(name);
  return out.set(a.getX(index), a.getY(index), a.getZ(index), w);
};

/** A candidate pin vertex; the scene keeps the one facing the camera most. */
interface Anchor {
  /** The mesh's muscle, then the parents the board may name instead. */
  readonly muscles: ReadonlyArray<string>;
  readonly side: TurnSide;
  readonly mesh: SkinnedMesh;
  readonly index: number;
}

/** Boot fits and pole grips per leg side, with the rest-pose ankles the boots hang from. */
interface Fitting {
  readonly side: LegSide;
  readonly fit: BootFit;
  readonly ankle: Vec3;
  readonly grip: Vec3;
  readonly arm: StandingArm;
}

const own = (parts: ReadonlyArray<{ readonly mesh: Object3D; readonly side: LegSide }>, side: LegSide): Object3D | undefined =>
  parts.find((g) => g.side === side)?.mesh;

/** Bone names lose their dots in three's loader. */
const boneName = (part: string, side: LegSide): string => PropertyBinding.sanitizeNodeName(`${part}.${side === BodySide.Right ? 'R' : 'L'}`);

const fitting = (side: LegSide, r: RawFit): Fitting => ({ side, fit: bootFitFrom(r), ankle: r.ankle, grip: r.grip, arm: standingArm(r) ?? CAPSULE_ARM });

const fittings = (root: Object3D): Readonly<Record<LegSide, Fitting>> | null => {
  const raw = parseGearFit(root.getObjectByName('bones')?.userData['gear_fit']);
  if (raw === null) return null;
  return { [BodySide.Right]: fitting(BodySide.Right, raw.right), [BodySide.Left]: fitting(BodySide.Left, raw.left) };
};

/** The bake's candidate pin vertices for a muscle mesh, from scripts/anatomy/stamp-anchors.ts. */
const anchorVertices = (value: unknown, count: number): ReadonlyArray<number> =>
  Array.isArray(value) ? value.filter((i): i is number => Number.isInteger(i) && i >= 0 && i < count) : [];

const isSkinned = (o: Object3D): o is SkinnedMesh => o instanceof SkinnedMesh;

/** Bone pairs along each limb and the trunk, and the rough radius of the body round them. */
const LIMBS: ReadonlyArray<readonly [string, string, number]> = [
  ['pelvis', 'neck', 0.13],
  ['neck', 'head', 0.06],
  ...['R', 'L'].flatMap((s): ReadonlyArray<readonly [string, string, number]> => [
    [`thigh.${s}`, `shin.${s}`, 0.075],
    [`shin.${s}`, `foot.${s}`, 0.055],
    [`upper_arm.${s}`, `forearm.${s}`, 0.045],
    [`forearm.${s}`, `hand.${s}`, 0.04],
  ]),
];

export interface AnatomyFigure extends Figure {
  readonly setSkeleton: (on: boolean) => void;
}

/** The Z-Anatomy figure from scripts/anatomy; poses come from its baked clip per posed drill and intensity. */
export const createAnatomyFigure = async (rig: Object3D, table: SlotTable, url: string = ANATOMY_URL): Promise<AnatomyFigure> => {
  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);
  return buildAnatomyFigure(rig, table, await loader.loadAsync(url));
};

/** The parts of a loaded glTF the figure reads. */
export interface AnatomyModel {
  readonly scene: Object3D;
  readonly animations: ReadonlyArray<AnimationClip>;
}

export const buildAnatomyFigure = (rig: Object3D, table: SlotTable, gltf: AnatomyModel): AnatomyFigure => {
  const root = gltf.scene;
  root.updateMatrixWorld(true);

  const levels = Array.from({ length: table.size }, () => 0);
  const skeleton = uniform(0);
  const highlight: HighlightInputs = { marks: Array.from({ length: table.size }, () => 0), strength: uniform(0), reveal: uniform(0) };
  const muscle = muscleMaterial(levels, highlight, skeleton, false);
  const tendon = muscleMaterial(levels, highlight, skeleton, true);
  let marked: ReadonlyArray<number> = [];
  const bone = new MeshStandardNodeMaterial({ color: BONE, roughness: 0.55 });
  const cartilage = new MeshStandardNodeMaterial({ color: CARTILAGE, roughness: 0.3 });
  const gear = new MeshStandardNodeMaterial({ color: GEAR, roughness: 0.6, side: DoubleSide });
  const fading = [muscle, tendon];

  const fitted = fittings(root);
  let kit: Gear | null = null;
  const release = (): void => {
    kit?.dispose();
    root.removeFromParent();
    root.traverse((o) => {
      if (isSkinned(o)) o.geometry.dispose();
    });
    for (const m of [muscle, tendon, bone, cartilage, gear]) m.dispose();
  };

  const anchors: Array<Anchor> = [];
  // Skinned meshes a tap may hit; `posed` is the pose their bounding sphere was taken in.
  const pickables = new Map<Object3D, { readonly mesh: SkinnedMesh; readonly node: AnatomyNode; readonly slot: number; posed: number }>();
  const skeletons = new Set<Skeleton>();
  const seen = new Set<Object3D>();
  const dress = (o: Object3D): void => {
    if (!isSkinned(o)) return;
    const found = nodeOf(o);
    if (found === null) return;
    const { node, owner } = found;
    const source = Array.isArray(o.material) ? o.material[0] : o.material;
    const name = source?.name ?? '';
    source?.dispose();
    o.frustumCulled = false;
    skeletons.add(o.skeleton);
    if (node.kind === NodeKind.Bones) o.material = name === 'cartilage' ? cartilage : bone;
    else if (node.kind === NodeKind.Gear) o.material = gear;
    const slot = node.kind === NodeKind.Muscle ? table.slotOf(node.muscle, node.side) : 0;
    pickables.set(o, { mesh: o, node, slot, posed: -1 });
    if (node.kind !== NodeKind.Bones && node.kind !== NodeKind.Gear) {
      o.material = name === 'tendon' ? tendon : muscle;
      const count = o.geometry.getAttribute('position').count;
      o.geometry.setAttribute('muscleSlot', new Uint32BufferAttribute(new Uint32Array(count).fill(slot), 1));
      if (node.kind === NodeKind.Muscle && !seen.has(owner)) {
        seen.add(owner);
        const muscles = [node.muscle, ...ancestorsOf(node.muscle).filter((m) => table.slotOf(m, node.side) > 0)];
        for (const index of anchorVertices(owner.userData['anchor_vertices'], count)) anchors.push({ muscles, side: node.side, mesh: o, index });
      }
    }
  };

  const joint = (part: string, side: LegSide): Object3D => {
    const found = root.getObjectByName(boneName(part, side));
    if (found === undefined) throw new Error(`anatomy model has no ${part} bone`);
    return found;
  };
  const fists: Array<{ readonly side: LegSide; readonly hand: Object3D; readonly forearm: Object3D; readonly foot: Object3D; readonly local: Vector3 }> = [];
  // Geometry built about `origin` in rest-pose world space, in its `local` frame there, re-expressed in the bone's frame.
  const attach = (part: string, side: LegSide, mesh: Object3D, origin: Vec3, local?: Mat4): void => {
    const parent = joint(part, side);
    const placed = new Matrix4().copy(parent.matrixWorld).invert().multiply(new Matrix4().makeTranslation(...origin));
    if (local !== undefined) placed.multiply(new Matrix4().fromArray(local));
    mesh.applyMatrix4(placed);
    parent.add(mesh);
  };
  // Boots ride the foot and shin bones; poles are placed from the fist every frame.
  const fitGear = (worn: Gear, sides: Readonly<Record<LegSide, Fitting>>): void => {
    for (const f of Object.values(sides)) {
      const shell = shellInFoot(f.fit, EQUIPMENT);
      const mount = bindingInFoot(f.fit, EQUIPMENT);
      for (const [parts, part, local] of [
        [worn.shells, 'foot', shell],
        [worn.soles, 'foot', shell],
        [worn.plates, 'foot', mount],
        [worn.bindings, 'foot', mount],
        [worn.cuffs, 'shin', undefined],
      ] as const) {
        const mesh = own(parts, f.side);
        if (mesh !== undefined) attach(part, f.side, mesh, f.ankle, local);
      }
      const hand = joint('hand', f.side);
      fists.push({ side: f.side, hand, forearm: joint('forearm', f.side), foot: joint('foot', f.side), local: hand.worldToLocal(new Vector3(...f.grip)) });
    }
  };
  const fist = new Vector3();
  const ankle = new Vector3();
  const wrist = new Vector3();
  const elbow = new Vector3();
  const toRoot = new Matrix4();
  // Poles hang from the figure's root, so they are placed in its frame, not the world's.
  const placePoles = (t: number): void => {
    if (kit === null) return;
    const pose = samplePose(poses, t);
    toRoot.copy(rig.matrixWorld).invert();
    for (const { side, hand, forearm, foot, local } of fists) {
      const pole = kit.poles.find((p) => p.side === side);
      if (pole === undefined) continue;
      fist.copy(local).applyMatrix4(hand.matrixWorld).applyMatrix4(toRoot);
      foot.getWorldPosition(ankle).applyMatrix4(toRoot);
      hand.getWorldPosition(wrist).applyMatrix4(toRoot).sub(forearm.getWorldPosition(elbow).applyMatrix4(toRoot));
      const grip: Vec3 = [fist.x, fist.y, fist.z];
      placePole(pole.mesh, grip, poleDirection(grip, side, poleTouchOf(pose, side), [ankle.x, ankle.y, ankle.z], size.basket, [wrist.x, wrist.y, wrist.z]));
    }
  };

  let clip: AnimationClip | undefined;
  try {
    root.traverse(dress);
    // Older models without the bake's fit carry no gear.
    if (fitted !== null) {
      kit = createGear({ [BodySide.Right]: fitted.right.fit, [BodySide.Left]: fitted.left.fit }, poleSize(fitted.left.arm));
      fitGear(kit, fitted);
    }
    clip = gltf.animations.find((a) => a.name === NEUTRAL_CLIP) ?? gltf.animations[0];
    if (clip === undefined) throw new Error('anatomy model has no animation');
  } catch (e: unknown) {
    release();
    throw e;
  }
  // Nothing joins the scene until the figure is whole, so a failed build leaves no trace.
  rig.add(root);
  for (const p of kit?.poles ?? []) rig.add(p.mesh);
  const still = clip;
  const mixer = new AnimationMixer(root);
  // One baked clip per posed drill and intensity, from the same tables as `poses`; others stand still.
  const actions = new Map<string, { readonly clip: AnimationClip; readonly action: AnimationAction }>();
  const actionFor = (name: string): { readonly clip: AnimationClip; readonly action: AnimationAction } => {
    let found = actions.get(name);
    if (found === undefined) {
      const c = gltf.animations.find((a) => a.name === name) ?? still;
      found = { clip: c, action: mixer.clipAction(c) };
      actions.set(name, found);
    }
    return found;
  };
  let playing = actionFor(NEUTRAL_CLIP);
  playing.action.play();
  let poses: PoseTable = poseTable(null, Intensity.Moderate);
  // Mirrors the bake's poles, sized from the left arm.
  const arm = fitted?.left.arm ?? CAPSULE_ARM;
  let size = poleSize(arm);

  const limbs = LIMBS.flatMap(([from, to, radius]) => {
    const a = root.getObjectByName(PropertyBinding.sanitizeNodeName(from));
    const b = root.getObjectByName(PropertyBinding.sanitizeNodeName(to));
    return a === undefined || b === undefined ? [] : [{ a, b, radius }];
  });
  const ends = new Vector3();

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  // Bumped by each update, so a tap re-measures only meshes posed since the last one.
  let pose = 0;
  const hits: Array<Intersection> = [];
  const kitMeshes = (): ReadonlyArray<Mesh> =>
    kit === null ? [] : [...kit.shells, ...kit.soles, ...kit.cuffs, ...kit.plates, ...kit.bindings, ...kit.poles].map((g) => g.mesh);
  let target = 0;
  let revealTarget = 0;
  let last = 0;
  const v4 = new Vector4();
  const p3 = new Vector3();
  const n3 = new Vector3();

  const setFade = (on: boolean): void => {
    for (const m of fading) {
      m.transparent = on;
      m.depthWrite = !on;
      m.needsUpdate = true;
    }
  };

  return {
    pose: (t: number) => samplePose(poses, t),
    update: (t: number, current: ReadonlyArray<MuscleLevel>) => {
      playing.action.time = (((t % 1) + 1) % 1) * playing.clip.duration;
      mixer.update(0);
      root.updateMatrixWorld(true);
      // Otherwise the bone matrices upload a draw late and the hands trail their poles.
      for (const s of skeletons) s.update();
      placePoles(t);
      fillSlotLevels(table, current, levels);
      pose++;
    },
    pick: (raycaster: Raycaster): MusclePart | null => {
      const state = { skeleton: target > 0, reveal: revealTarget > 0 };
      hits.length = 0;
      for (const p of pickables.values()) {
        if (pickRole(p.node, state, { level: levels[p.slot] ?? 0, marked: (highlight.marks[p.slot] ?? 0) > 0 }) === PickRole.Skip) continue;
        // three's skinned raycast tests this posed sphere, then the posed triangles; nothing computes a box.
        if (p.posed !== pose) {
          p.mesh.computeBoundingSphere();
          p.posed = pose;
        }
        p.mesh.raycast(raycaster, hits);
      }
      // Translucent gear lets taps through to the muscle under it.
      for (const mesh of kitMeshes()) {
        const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        if (mesh.visible && materials.every((m) => !m.transparent)) mesh.raycast(raycaster, hits);
      }
      let nearest: Intersection | undefined;
      for (const h of hits) if (nearest === undefined || h.distance < nearest.distance) nearest = h;
      hits.length = 0;
      const node = nearest === undefined ? undefined : pickables.get(nearest.object)?.node;
      return node?.kind === NodeKind.Muscle ? { muscle: node.muscle, side: node.side } : null;
    },
    animate: (now: number): boolean => {
      if (skeleton.value === target && highlight.reveal.value === revealTarget) return false;
      const step = reducedMotion.matches ? 1 : Math.max(0, now - last) / 1000 / FADE_SECONDS;
      last = now;
      const wasFaded = skeleton.value > 0 || highlight.reveal.value > 0;
      const toward = (u: Uniform, goal: number): void => {
        u.value = goal > u.value ? Math.min(goal, u.value + step) : Math.max(goal, u.value - step);
      };
      toward(skeleton, target);
      toward(highlight.reveal, revealTarget);
      const isFaded = skeleton.value > 0 || highlight.reveal.value > 0;
      if (wasFaded !== isFaded) setFade(isFaded);
      return skeleton.value !== target || highlight.reveal.value !== revealTarget;
    },
    anchors: (): ReadonlyArray<AnchorPoint> =>
      anchors.flatMap((a) => {
        const p = skinned(a.mesh, a.index, vertexIn(a.mesh, 'position', a.index, 1, v4), p3);
        const position = [p.x, p.y, p.z] as const;
        const n = skinned(a.mesh, a.index, vertexIn(a.mesh, 'normal', a.index, 0, v4), n3);
        const normal = [n.x, n.y, n.z] as const;
        return a.muscles.map((name) => ({ muscle: name, side: a.side, position, normal }));
      }),
    occluders: (): ReadonlyArray<Occluder> =>
      limbs.map(({ a, b, radius }) => {
        a.getWorldPosition(ends);
        const from: Vec3 = [ends.x, ends.y, ends.z];
        b.getWorldPosition(ends);
        return { a: from, b: [ends.x, ends.y, ends.z], radius };
      }),
    setSkeleton: (on: boolean) => {
      target = on ? 1 : 0;
      last = performance.now();
    },
    setMotion: (drill: string | null, i: Intensity) => {
      const named = motionClipName(drill, i);
      const next = actionFor(gltf.animations.some((a) => a.name === named) ? named : NEUTRAL_CLIP);
      // The poles' touch must match the clip, so a drill the model has no clip for stands still.
      poses = next.clip.name === named ? poseTable(drill, i) : poseTable(null, i);
      size = poleSize(arm, next.clip.name === named ? poleTrimOf(drill) : 0);
      kit?.setPole(size);
      if (next === playing) return;
      playing.action.stop();
      next.action.play();
      playing = next;
    },
    setGear: (mode: GearMode) => kit?.setMode(mode),
    setDark: (dark: boolean) => kit?.setDark(dark),
    setHighlight: (slots: ReadonlyArray<number>, strength: number, reveal: boolean) => {
      for (const [slot, value] of markChanges(marked, slots)) highlight.marks[slot] = value;
      marked = slots;
      highlight.strength.value = strength;
      revealTarget = reveal ? 1 : 0;
      last = performance.now();
    },
    dispose: () => {
      mixer.stopAllAction();
      release();
    },
  };
};
