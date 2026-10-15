import { AnimationMixer, DoubleSide, Matrix4, MeshStandardNodeMaterial, PropertyBinding, SkinnedMesh, Uint32BufferAttribute, Vector3, Vector4 } from 'three/webgpu';
import type { AnimationAction, Object3D, Scene } from 'three/webgpu';
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
import { spreadCandidates } from './anchor-projection';
import type { AnchorPoint } from './anchor-projection';
import type { Vec3 } from './mat4';
import { BodySide } from './figure';
import { createGear, placePole } from './gear';
import type { LegSide } from './gear';
import { bootFitFrom, coveredByBoot, gripFrom, parseGearFit } from './gear-fit';
import type { BootFit, RawFit } from './gear-fit';
import type { GearMode } from './gear-mode';
import { poleDirection, poleTouchAt } from './pose';
import { NodeKind, parseAnatomyNode } from './anatomy-names';
import type { AnatomyNode } from './anatomy-names';
import { fillSlotLevels } from './slots';
import type { SlotTable, TurnSide } from './slots';
import { levelColour } from './level-colour';
import type { Figure } from './scene';

export const ANATOMY_URL = `${import.meta.env.BASE_URL}models/anatomy.glb`;

const MUSCLE_RED = 0xb4483e;
const TENDON = 0xe6dccb;
const BONE = 0xe8dcc2;
const CARTILAGE = 0xc6d9de;
const GEAR = 0x2f4d7a;
const RIM_COOL = 0x9fc6ff;
const GHOST = 0x2a3440;
/** Fibre stripe spacing in metres; the UVs are metres around and along each muscle. */
const FIBRE_SPACING = 0.006;
/** Seconds for the skeleton fade. */
const FADE_SECONDS = 0.35;

type Uniform = ReturnType<typeof uniform<'float'>>;

/**
 * Natural fibred red muscle at rest. Working muscles take the board's level
 * colour and glow: emissive lift and a fresnel rim both grow with level, so the
 * level reads from brightness and halo width, not hue alone. `skeleton` fades
 * muscles to a dark translucent ghost, leaving working muscles partly visible.
 */
const muscleMaterial = (levels: Array<number>, skeleton: Uniform, tendon: boolean): MeshStandardNodeMaterial => {
  const m = new MeshStandardNodeMaterial({ roughness: tendon ? 0.35 : 0.5 });
  const level = varying(uniformArray<'float'>(levels, 'float').element(attribute('muscleSlot', 'uint')));
  const facing = saturate(dot(normalView, positionViewDirection));
  // Higher levels get a wider rim.
  const rim = pow(float(1).sub(facing), mix(float(3.2), float(1.4), level));

  const phase = uv().x.mul((2 * Math.PI) / FIBRE_SPACING).add(sin(uv().y.mul(40)).mul(1.5));
  // Fade the stripes out once they get close to a pixel apart, before they alias.
  const fibre = sin(phase).mul(0.5).add(0.5).mul(float(1).sub(smoothstep(0.15, 0.5, fwidth(phase).div(2 * Math.PI))));

  const base = color(tendon ? TENDON : MUSCLE_RED);
  const hot = levelColour(level);
  const on = smoothstep(0, 0.34, level);
  const lit = mix(base, hot, on.mul(tendon ? 0.3 : 0.75));
  const shaded = lit.mul(float(1).sub(fibre.mul(tendon ? 0.06 : 0.22)));
  m.colorNode = mix(shaded, color(GHOST), skeleton.mul(float(1).sub(on)));
  // level is 0..1: level 1 is a subtle lift, level 3 a strong glow.
  const lift = pow(level, 1.4).mul(tendon ? 0.3 : 1.1);
  const glow = hot.mul(lift).mul(float(0.75).add(fibre.mul(0.25)));
  const rimGain = on.mul(float(0.4).add(pow(level, 2).mul(tendon ? 0.8 : 3.4)));
  const rimColour = mix(hot, color(0xffffff), 0.3);
  m.emissiveNode = glow.add(rimColour.mul(rim.mul(rimGain))).add(color(RIM_COOL).mul(rim.mul(0.06)));
  m.opacityNode = mix(float(1), saturate(rim.mul(0.35).add(0.12).add(level.mul(0.55))), skeleton);
  return m;
};

/** Skins one vertex on the CPU into world space; with w = 0 it maps a direction. */
const skinned = (mesh: SkinnedMesh, index: number, v: Vector4): Vector3 => {
  mesh.applyBoneTransform(index, v);
  const out = new Vector3(v.x, v.y, v.z);
  return v.w === 0 ? out.transformDirection(mesh.matrixWorld) : mesh.localToWorld(out);
};

const vertexIn = (mesh: SkinnedMesh, name: 'position' | 'normal', index: number, w: number): Vector4 => {
  const a = mesh.geometry.getAttribute(name);
  return new Vector4(a.getX(index), a.getY(index), a.getZ(index), w);
};

/** A candidate pin vertex; the scene keeps the one facing the camera most. */
interface Anchor {
  readonly muscle: string;
  readonly side: TurnSide;
  readonly mesh: SkinnedMesh;
  readonly index: number;
}

/** Candidate pin vertices spread around the muscle's middle, picked at the bind pose. */
const ANCHOR_CANDIDATES = 8;
const candidateVertices = (mesh: SkinnedMesh, centre: Vec3, hidden: (p: Vec3) => boolean): ReadonlyArray<number> => {
  const count = mesh.geometry.getAttribute('position').count;
  const all = Array.from({ length: count }, (_, i): Vec3 => {
    const p = skinned(mesh, i, vertexIn(mesh, 'position', i, 1));
    return [p.x, p.y, p.z];
  });
  // Skip points inside the boots unless the whole muscle is.
  const open = all.map((p, i) => ({ p, i })).filter(({ p }) => !hidden(p));
  const pool = open.length > 0 ? open : all.map((p, i) => ({ p, i }));
  return spreadCandidates(pool.map((e) => e.p), centre, ANCHOR_CANDIDATES).flatMap((k) => pool[k]?.i ?? []);
};

/** Boot fits and fists per leg side, with the rest-pose ankles they hang from. */
interface Fitting {
  readonly side: LegSide;
  readonly fit: BootFit;
  readonly ankle: Vec3;
  readonly grip: Vec3;
}

/** Bone names lose their dots in three's loader. */
const boneName = (part: string, side: LegSide): string => PropertyBinding.sanitizeNodeName(`${part}.${side === BodySide.Right ? 'R' : 'L'}`);

const fitting = (side: LegSide, r: RawFit): Fitting => ({ side, fit: bootFitFrom(r), ankle: r.ankle, grip: gripFrom(r) });

const fittings = (root: Object3D): Readonly<Record<LegSide, Fitting>> | null => {
  const raw = parseGearFit(root.getObjectByName('bones')?.userData['gear_fit']);
  if (raw === null) return null;
  return { [BodySide.Right]: fitting(BodySide.Right, raw.right), [BodySide.Left]: fitting(BodySide.Left, raw.left) };
};

/** The parsed name of the nearest named ancestor; multi-material meshes load as a group of primitives. */
const nodeOf = (object: Object3D): { readonly node: AnatomyNode; readonly owner: Object3D } | null => {
  for (let o: Object3D | null = object; o !== null; o = o.parent) {
    const node = parseAnatomyNode(o.name);
    if (node !== null) return { node, owner: o };
  }
  return null;
};

const isAnchor = (value: unknown): value is readonly [number, number, number] =>
  Array.isArray(value) && value.length === 3 && value.every((x) => typeof x === 'number');

const isSkinned = (o: Object3D): o is SkinnedMesh => o instanceof SkinnedMesh;

export interface AnatomyFigure extends Figure {
  readonly setSkeleton: (on: boolean) => void;
}

/** The Z-Anatomy figure from scripts/anatomy; poses come from the baked `stork-turn` clip. */
export const createAnatomyFigure = async (scene: Scene, table: SlotTable, url: string = ANATOMY_URL): Promise<AnatomyFigure> => {
  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);
  const gltf = await loader.loadAsync(url);
  const root = gltf.scene;
  scene.add(root);
  root.updateMatrixWorld(true);

  const levels = Array.from({ length: table.size }, () => 0);
  const skeleton = uniform(0);
  const muscle = muscleMaterial(levels, skeleton, false);
  const tendon = muscleMaterial(levels, skeleton, true);
  const bone = new MeshStandardNodeMaterial({ color: BONE, roughness: 0.55 });
  const cartilage = new MeshStandardNodeMaterial({ color: CARTILAGE, roughness: 0.3 });
  const gear = new MeshStandardNodeMaterial({ color: GEAR, roughness: 0.6, side: DoubleSide });
  const fading = [muscle, tendon];

  // Older models without the bake's fit carry no gear.
  const fitted = fittings(root);
  const hidden = (p: Vec3): boolean => (fitted === null ? [] : Object.values(fitted)).some((f) => coveredByBoot(f.fit, f.ankle, p));

  const anchors: Array<Anchor> = [];
  const seen = new Set<Object3D>();
  root.traverse((o) => {
    if (!isSkinned(o)) return;
    const found = nodeOf(o);
    if (found === null) return;
    const { node, owner } = found;
    const source = Array.isArray(o.material) ? o.material[0] : o.material;
    const name = source?.name ?? '';
    source?.dispose();
    o.frustumCulled = false;
    if (node.kind === NodeKind.Bones) o.material = name === 'cartilage' ? cartilage : bone;
    else if (node.kind === NodeKind.Gear) o.material = gear;
    else {
      o.material = name === 'tendon' ? tendon : muscle;
      const slot = node.kind === NodeKind.Muscle ? table.slotOf(node.muscle, node.side) : 0;
      const count = o.geometry.getAttribute('position').count;
      o.geometry.setAttribute('muscleSlot', new Uint32BufferAttribute(new Uint32Array(count).fill(slot), 1));
      const anchor: unknown = owner.userData['anchor'];
      if (node.kind === NodeKind.Muscle && !seen.has(owner) && isAnchor(anchor)) {
        seen.add(owner);
        for (const index of candidateVertices(o, anchor, hidden)) anchors.push({ muscle: node.muscle, side: node.side, mesh: o, index });
      }
    }
  });

  // Boots ride the foot and shin bones; poles are placed from the fist every frame.
  const kit = fitted === null ? null : createGear({ [BodySide.Right]: fitted.right.fit, [BodySide.Left]: fitted.left.fit });
  const fists: Array<{ readonly side: LegSide; readonly hand: Object3D; readonly local: Vector3 }> = [];
  if (kit !== null && fitted !== null) {
    const attach = (part: string, side: LegSide, mesh: Object3D, ankle: Vec3): void => {
      const joint = root.getObjectByName(boneName(part, side));
      if (joint === undefined) throw new Error(`anatomy model has no ${part} bone`);
      mesh.applyMatrix4(new Matrix4().copy(joint.matrixWorld).invert().multiply(new Matrix4().makeTranslation(...ankle)));
      joint.add(mesh);
    };
    for (const f of Object.values(fitted)) {
      const shell = kit.shells.find((g) => g.side === f.side);
      const cuff = kit.cuffs.find((g) => g.side === f.side);
      if (shell !== undefined) attach('foot', f.side, shell.mesh, f.ankle);
      if (cuff !== undefined) attach('shin', f.side, cuff.mesh, f.ankle);
      const hand = root.getObjectByName(boneName('hand', f.side));
      if (hand !== undefined) fists.push({ side: f.side, hand, local: hand.worldToLocal(new Vector3(...f.grip)) });
    }
    for (const p of kit.poles) scene.add(p.mesh);
  }
  const fist = new Vector3();
  const placePoles = (t: number): void => {
    if (kit === null) return;
    for (const { side, hand, local } of fists) {
      const pole = kit.poles.find((p) => p.side === side);
      if (pole === undefined) continue;
      fist.copy(local).applyMatrix4(hand.matrixWorld);
      const grip: Vec3 = [fist.x, fist.y, fist.z];
      placePole(pole.mesh, grip, poleDirection(grip, side, side === BodySide.Left ? poleTouchAt(t) : 0));
    }
  };

  const clip = gltf.animations.find((a) => a.name === 'stork-turn') ?? gltf.animations[0];
  if (clip === undefined) throw new Error('anatomy model has no stork-turn animation');
  const mixer = new AnimationMixer(root);
  const action: AnimationAction = mixer.clipAction(clip);
  action.play();

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  let target = 0;
  let last = performance.now();

  const setFade = (on: boolean): void => {
    for (const m of fading) {
      m.transparent = on;
      m.depthWrite = !on;
      m.needsUpdate = true;
    }
  };

  return {
    update: (t: number, current: ReadonlyArray<MuscleLevel>) => {
      action.time = (((t % 1) + 1) % 1) * clip.duration;
      mixer.update(0);
      root.updateMatrixWorld(true);
      placePoles(t);
      fillSlotLevels(table, current, levels);
      const now = performance.now();
      const step = reducedMotion.matches ? 1 : (now - last) / 1000 / FADE_SECONDS;
      last = now;
      const before = skeleton.value;
      skeleton.value = target > before ? Math.min(target, before + step) : Math.max(target, before - step);
      if ((before === 0) !== (skeleton.value === 0)) setFade(skeleton.value > 0);
    },
    anchors: (): ReadonlyArray<AnchorPoint> =>
      anchors.map((a) => {
        const p = skinned(a.mesh, a.index, vertexIn(a.mesh, 'position', a.index, 1));
        const n = skinned(a.mesh, a.index, vertexIn(a.mesh, 'normal', a.index, 0));
        return { muscle: a.muscle, side: a.side, position: [p.x, p.y, p.z] as const, normal: [n.x, n.y, n.z] as const };
      }),
    setSkeleton: (on: boolean) => {
      target = on ? 1 : 0;
    },
    setGear: (mode: GearMode) => kit?.setMode(mode),
    dispose: () => {
      kit?.dispose();
      mixer.stopAllAction();
      scene.remove(root);
      root.traverse((o) => {
        if (isSkinned(o)) o.geometry.dispose();
      });
      for (const m of [muscle, tendon, bone, cartilage, gear]) m.dispose();
    },
  };
};
