import { readFileSync } from 'node:fs';
import { AnimationMixer } from 'three';
import type { Object3D, Vector3 } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import type { GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

export const MODEL_PATH = new URL('../../public/models/anatomy.glb', import.meta.url);

/** A baked anatomy model read from disk, posed by its clip. */
export interface AnatomyModel {
  readonly gltf: GLTF;
  readonly root: Object3D;
  readonly pose: (t: number) => void;
  readonly bone: (name: string) => Object3D;
  /** A point given in rest-pose world space, carried by `bone` to the current pose. */
  readonly carried: (bone: string, rest: Vector3) => () => Vector3;
}

export const loadAnatomy = async (path: string | URL = MODEL_PATH): Promise<AnatomyModel> => {
  await MeshoptDecoder.ready;
  const file = readFileSync(path);
  const data = file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength);
  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);
  const gltf = await loader.parseAsync(data, '');
  const root = gltf.scene;
  root.updateMatrixWorld(true);
  const clip = gltf.animations.find((a) => a.name === 'stork-turn');
  if (clip === undefined) throw new Error('no stork-turn clip');
  const mixer = new AnimationMixer(root);
  const action = mixer.clipAction(clip);
  action.play();
  const bone = (name: string): Object3D => {
    const b = root.getObjectByName(name.replace('.', ''));
    if (b === undefined) throw new Error(`no bone ${name}`);
    return b;
  };
  return {
    gltf,
    root,
    bone,
    pose: (t) => {
      action.time = (((t % 1) + 1) % 1) * clip.duration;
      mixer.update(0);
      root.updateMatrixWorld(true);
    },
    carried: (name, rest) => {
      const b = bone(name);
      const local = b.worldToLocal(rest.clone());
      return () => local.clone().applyMatrix4(b.matrixWorld);
    },
  };
};
