// Usage: bun scripts/anatomy/stamp-anchors.ts <anatomy.glb>
// Picks each muscle's candidate pin vertices and stores them in the glb as the node extra `anchor_vertices`,
// so the viewer never skins whole muscles at load. Runs after gltfpack, whose vertex order it records.
import { readFileSync, writeFileSync } from 'node:fs';
import { SkinnedMesh, Vector3, Vector4 } from 'three';
import type { Object3D } from 'three';
import { spreadCandidates } from '../../src/viewer/anchor-projection';
import { NodeKind, nodeOf } from '../../src/viewer/anatomy-names';
import { bootFitFrom, coveredByBoot, parseGearFit } from '../../src/viewer/gear-fit';
import type { Vec3 } from '../../src/viewer/mat4';
import { loadAnatomy } from './model';
import type { AnatomyModel } from './model';

/** Candidate pins per muscle, spread around its middle. */
export const ANCHOR_CANDIDATES = 8;

const isVec3 = (value: unknown): value is Vec3 => Array.isArray(value) && value.length === 3 && value.every((x) => typeof x === 'number');

/** glTF node index to its muscle's candidate vertices in the first primitive, picked at the bind pose. */
export const anchorCandidates = (model: AnatomyModel): ReadonlyMap<number, ReadonlyArray<number>> => {
  const raw = parseGearFit(model.root.getObjectByName('bones')?.userData['gear_fit']);
  const boots = raw === null ? [] : [raw.right, raw.left].map((r) => ({ fit: bootFitFrom(r), ankle: r.ankle }));
  const hidden = (p: Vec3): boolean => boots.some((b) => coveredByBoot(b.fit, b.ankle, p));
  const out = new Map<number, ReadonlyArray<number>>();
  const seen = new Set<Object3D>();
  const v = new Vector4();
  const p = new Vector3();
  model.root.traverse((o) => {
    if (!(o instanceof SkinnedMesh)) return;
    const found = nodeOf(o);
    if (found === null || found.node.kind !== NodeKind.Muscle || seen.has(found.owner)) return;
    seen.add(found.owner);
    const centre: unknown = found.owner.userData['anchor'];
    const index = model.gltf.parser.associations.get(found.owner)?.nodes;
    if (!isVec3(centre) || index === undefined) return;
    const position = o.geometry.getAttribute('position');
    const all: Array<{ readonly p: Vec3; readonly i: number }> = [];
    for (let i = 0; i < position.count; i++) {
      o.applyBoneTransform(i, v.set(position.getX(i), position.getY(i), position.getZ(i), 1));
      o.localToWorld(p.set(v.x, v.y, v.z));
      all.push({ p: [p.x, p.y, p.z], i });
    }
    // Skip points inside the boots unless the whole muscle is.
    const open = all.filter((e) => !hidden(e.p));
    const pool = open.length > 0 ? open : all;
    out.set(index, spreadCandidates(pool.map((e) => e.p), centre, ANCHOR_CANDIDATES).flatMap((k) => pool[k]?.i ?? []));
  });
  return out;
};

const GLB_MAGIC = 0x46546c67;
const JSON_CHUNK = 0x4e4f534a;

/** Rewrites the glb's JSON chunk; the binary chunk is copied unchanged. */
export const withJson = (glb: Uint8Array, edit: (json: Record<string, unknown>) => void): Uint8Array => {
  const view = new DataView(glb.buffer, glb.byteOffset, glb.byteLength);
  if (view.getUint32(0, true) !== GLB_MAGIC || view.getUint32(16, true) !== JSON_CHUNK) throw new Error('not a glb with a JSON chunk');
  const length = view.getUint32(12, true);
  const json: unknown = JSON.parse(new TextDecoder().decode(glb.subarray(20, 20 + length)));
  if (typeof json !== 'object' || json === null) throw new Error('glb JSON is not an object');
  edit(json as Record<string, unknown>);
  const encoded = new TextEncoder().encode(JSON.stringify(json));
  // Chunks are 4-byte aligned; JSON pads with spaces.
  const bytes = new Uint8Array(Math.ceil(encoded.length / 4) * 4).fill(0x20);
  bytes.set(encoded);
  const rest = glb.subarray(20 + length);
  const out = new Uint8Array(20 + bytes.length + rest.length);
  const w = new DataView(out.buffer);
  w.setUint32(0, GLB_MAGIC, true);
  w.setUint32(4, 2, true);
  w.setUint32(8, out.length, true);
  w.setUint32(12, bytes.length, true);
  w.setUint32(16, JSON_CHUNK, true);
  out.set(bytes, 20);
  out.set(rest, 20 + bytes.length);
  return out;
};

if (import.meta.main) {
  const path = process.argv[2];
  if (path === undefined) throw new Error('usage: stamp-anchors.ts <anatomy.glb>');
  const candidates = anchorCandidates(await loadAnatomy(path));
  const stamped = withJson(readFileSync(path), (json) => {
    const nodes = json['nodes'];
    if (!Array.isArray(nodes)) throw new Error('glb has no nodes');
    for (const [index, vertices] of candidates) {
      const node: unknown = nodes[index];
      if (typeof node !== 'object' || node === null) throw new Error(`no node ${index}`);
      const n = node as { extras?: Record<string, unknown> };
      n.extras = { ...n.extras, anchor_vertices: vertices };
    }
  });
  writeFileSync(path, stamped);
  console.log(`${path}: anchor candidates for ${candidates.size} muscles`);
}
