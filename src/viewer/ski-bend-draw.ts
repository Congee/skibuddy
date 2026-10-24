import { MeshStandardNodeMaterial } from 'three/webgpu';
import type { MeshStandardNodeMaterialParameters, Node, NodeBuilder } from 'three/webgpu';
import { dot, normalLocal, positionLocal, uniform, vec3 } from 'three/tsl';
import type { Vec3 } from './mat4';

/** A ski's bend axes in its geometry's space: `mount` is any point at the pressure point, `up` runs base to top. */
export interface SkiBendFrame {
  readonly mount: Vec3;
  readonly along: Vec3;
  readonly up: Vec3;
  /** Metres per unit of the geometry's space. */
  readonly metres: number;
}

/** How far the base rises `u` along the ski from the mount when it bends at curvature `k` (1/m). */
export const skiBendOffset = (u: number, k: number): number => (k * u * u) / 2;

/** The bend in the vertex stage, on the unposed `positionLocal` and `normalLocal`: the base rises along `up`, and the normal tips back with the surface's slope k·u. */
export const bentSki = (k: Node<'float'>, frame: SkiBendFrame): { readonly position: Node<'vec3'>; readonly normal: Node<'vec3'> } => {
  const along = vec3(...frame.along);
  const up = vec3(...frame.up);
  const u = dot(positionLocal.sub(vec3(...frame.mount)), along).mul(frame.metres);
  const position = positionLocal.add(up.mul(k.mul(u).mul(u).mul(0.5 / frame.metres)));
  const normal = normalLocal.sub(along.mul(k.mul(u).mul(dot(normalLocal, up)))).normalize();
  return { position, normal };
};

/** A gear-looking ski that bends in the vertex stage, before the skinning it rides the foot bone by. */
export class BentSkiMaterial extends MeshStandardNodeMaterial {
  /** 1/m; the pose's bend channel for this ski. */
  readonly curvature = uniform(0);
  readonly #frame: SkiBendFrame;

  constructor(frame: SkiBendFrame, parameters: MeshStandardNodeMaterialParameters) {
    super(parameters);
    this.#frame = frame;
  }

  // NodeMaterial offsets positionNode after skinning, so the bend goes in ahead of super.
  override setupPosition(builder: NodeBuilder): ReturnType<MeshStandardNodeMaterial['setupPosition']> {
    const { position, normal } = bentSki(this.curvature, this.#frame);
    positionLocal.assign(position);
    normalLocal.assign(normal);
    return super.setupPosition(builder);
  }
}
