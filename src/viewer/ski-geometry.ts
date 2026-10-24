import { BoxGeometry, BufferAttribute, Matrix4, Vector3 } from 'three/webgpu';
import type { BufferGeometry } from 'three/webgpu';
import type { Vec3 } from './mat4';

/** Box rows along a ski, so its bend draws as a curve: about 3 cm each. */
export const SKI_ROWS = 56;

/** A ski box's own axes, in its geometry's space. */
export interface SkiBox {
  readonly centre: Vec3;
  /** Unit axes: tail to tip, base to top, and across. */
  readonly along: Vec3;
  readonly up: Vec3;
  readonly across: Vec3;
  readonly length: number;
  readonly thickness: number;
  readonly width: number;
}

const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const norm = (a: Vec3): number => Math.hypot(a[0], a[1], a[2]);
const unit = (a: Vec3): Vec3 => {
  const n = norm(a) || 1;
  return [a[0] / n, a[1] / n, a[2] / n];
};

const dotOf = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const crossOf = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

const signed = (axis: Vec3, hint: Vec3): Vec3 => (dotOf(axis, hint) < 0 ? [-axis[0], -axis[1], -axis[2]] : axis);

/** The dominant axis of the offsets by power iteration on their scatter, started on `start`; the ski's sizes are far enough apart for it to settle fast. */
const principal = (offsets: ReadonlyArray<Vec3>, start: Vec3): Vec3 => {
  let v = unit(start);
  for (let i = 0; i < 64; i++) {
    let x = 0;
    let y = 0;
    let z = 0;
    for (const o of offsets) {
      const w = dotOf(o, v);
      x += w * o[0];
      y += w * o[1];
      z += w * o[2];
    }
    v = unit([x, y, z]);
  }
  return v;
};

/**
 * The box through eight corners in any order, by principal axes: length, width, thickness. `upHint` and `forwardHint` only
 * choose the signs, base to top and tail to tip; null for any other count.
 */
export const skiBoxOf = (corners: ReadonlyArray<Vec3>, upHint: Vec3, forwardHint: Vec3): SkiBox | null => {
  if (corners.length !== 8) return null;
  const centre: Vec3 = [0, 1, 2].map((k) => corners.reduce((s, c) => s + (c[k] ?? 0), 0) / 8) as unknown as Vec3;
  const offsets = corners.map((c) => sub(c, centre));
  const first = offsets[0] ?? [1, 0, 0];
  const long = principal(offsets, first);
  // Past the length, the offsets' share along it is removed so the width is next.
  const flat = offsets.map((o): Vec3 => [o[0] - dotOf(o, long) * long[0], o[1] - dotOf(o, long) * long[1], o[2] - dotOf(o, long) * long[2]]);
  const wide = principal(flat, flat.reduce((best, o) => (norm(o) > norm(best) ? o : best), flat[0] ?? [0, 1, 0]));
  const thin = crossOf(long, wide);
  const extent = (axis: Vec3): number => {
    const along = offsets.map((o) => dotOf(o, axis));
    return Math.max(...along) - Math.min(...along);
  };
  return {
    centre,
    along: signed(long, forwardHint),
    up: signed(thin, upHint),
    across: wide,
    length: extent(long),
    thickness: extent(thin),
    width: extent(wide),
  };
};

const cornersOf = (geometry: BufferGeometry): ReadonlyArray<Vec3> => {
  const position = geometry.getAttribute('position');
  return Array.from({ length: position.count }, (_, i): Vec3 => [position.getX(i), position.getY(i), position.getZ(i)]);
};

/**
 * `source`'s ski box cut into `rows` along its length, so a bend draws as a curve; the corners, extent and skin are the source's.
 * `up` and `forward` are the directions the base-to-top and tail-to-tip axes point, in the source's space; null unless the source is an eight-corner box.
 */
export const skiGeometryOf = (source: BufferGeometry, rows: number, upHint: Vec3, forwardHint: Vec3): { readonly geometry: BufferGeometry; readonly box: SkiBox } | null => {
  const box = skiBoxOf(cornersOf(source), upHint, forwardHint);
  const index = source.getAttribute('skinIndex');
  const weight = source.getAttribute('skinWeight');
  if (box === null || index === undefined || weight === undefined) return null;
  const geometry = new BoxGeometry(box.width, box.thickness, box.length, 1, 1, rows);
  // A mirrored frame would wind the faces inside out; the box is symmetric across.
  const across = new Vector3(...box.across);
  const along = new Vector3(...box.along);
  const up = new Vector3(...box.up);
  if (new Vector3().crossVectors(across, up).dot(along) < 0) across.negate();
  geometry.applyMatrix4(new Matrix4().makeBasis(across, up, along).setPosition(...box.centre));
  // Every vertex rides the source's first one: the bake skins the whole ski to one bone.
  const count = geometry.getAttribute('position').count;
  for (const [name, from] of [['skinIndex', index], ['skinWeight', weight]] as const) {
    const array = new (from.array.constructor as new (n: number) => Uint16Array | Float32Array)(count * 4);
    for (let i = 0; i < count; i++) for (let k = 0; k < 4; k++) array[i * 4 + k] = from.array[k] ?? 0;
    geometry.setAttribute(name, new BufferAttribute(array, 4, from.normalized));
  }
  return { geometry, box };
};
