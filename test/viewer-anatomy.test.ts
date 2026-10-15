import { assert, describe, it } from '@effect/vitest';
import { AnimationClip, Bone, BoxGeometry, Group, MeshStandardMaterial, Object3D, Scene, Skeleton, SkinnedMesh } from 'three/webgpu';
import type { BufferGeometry } from 'three/webgpu';
import { buildAnatomyFigure } from '../src/viewer/anatomy';
import { makeSlotTable } from '../src/viewer/slots';

const FIT = { ankle: [0.07, 0.066, -0.035], grip: [0.28, 0.78, 0.05], sole: -0.021, toe: 0.137, heel: -0.092, footX: [0.049, 0.146], shinX: [0.037, 0.133], shinZ: [-0.102, 0.001] };

/** A tiny rigged model: one muscle, a `bones` node carrying the gear fit, and only the bones named. */
const model = (bones: ReadonlyArray<string>, clip: boolean): { readonly root: Group; readonly geometries: ReadonlyArray<BufferGeometry>; readonly animations: ReadonlyArray<AnimationClip> } => {
  const root = new Group();
  const rig = bones.map((name) => Object.assign(new Bone(), { name }));
  const pelvis = new Bone();
  for (const b of rig) pelvis.add(b);
  root.add(pelvis);
  const muscle = new SkinnedMesh(new BoxGeometry(0.1, 0.1, 0.1), new MeshStandardMaterial());
  muscle.name = 'muscle_calf_outside';
  muscle.userData['anchor'] = [0, 0, 0];
  muscle.bind(new Skeleton([pelvis]));
  root.add(muscle);
  const skeleton = new Object3D();
  skeleton.name = 'bones';
  skeleton.userData['gear_fit'] = JSON.stringify({ R: FIT, L: FIT });
  root.add(skeleton);
  return { root, geometries: [muscle.geometry], animations: clip ? [new AnimationClip('stork-turn', 1, [])] : [] };
};

const ALL_BONES = ['footR', 'shinR', 'handR', 'footL', 'shinL', 'handL'];

/** Builds the figure and expects it to fail; returns the scene and which geometries were freed. */
const failing = (bones: ReadonlyArray<string>, clip: boolean): { readonly scene: Scene; readonly freed: () => number; readonly total: number } => {
  const scene = new Scene();
  const m = model(bones, clip);
  let freed = 0;
  for (const g of m.geometries) g.addEventListener('dispose', () => freed++);
  assert.throws(() => buildAnatomyFigure(scene, makeSlotTable(['calf']), { scene: m.root, animations: m.animations }));
  return { scene, freed: () => freed, total: m.geometries.length };
};

describe('buildAnatomyFigure', () => {
  it('leaves nothing in the scene when a bone is missing', () => {
    const { scene, freed, total } = failing(['footR', 'shinR', 'footL', 'shinL'], true);
    assert.strictEqual(scene.children.length, 0);
    assert.strictEqual(freed(), total);
  });

  it('leaves nothing in the scene when the clip is missing', () => {
    const { scene, freed, total } = failing(ALL_BONES, false);
    assert.strictEqual(scene.children.length, 0);
    assert.strictEqual(freed(), total);
  });
});
