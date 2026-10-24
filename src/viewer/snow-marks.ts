import { pathAt } from './surface';
import type { Surface } from './surface';

/** Flat triangles on the snow (y = 0), in the field's frame: +z down the fall line. */
export interface Marks {
  readonly positions: Float32Array;
  readonly indices: Uint32Array;
}

type Xz = readonly [number, number];

const TRACK_SAMPLES = 96;
/** Turns drawn before and after the current one, so the track spans the snow disc. */
const TURNS_AROUND = 2;
/** Each ski's line off the path, and a line's half width; metres, inferred. */
const SKI_OFFSET = 0.1;
const LINE_HALF = 0.016;
const FALL_SPACING = 2;
const FALL_HALF_WIDTH = 0.008;

const build = (strips: ReadonlyArray<ReadonlyArray<readonly [Xz, Xz]>>, triangles: ReadonlyArray<readonly [Xz, Xz, Xz]>): Marks => {
  const positions: Array<number> = [];
  const indices: Array<number> = [];
  for (const strip of strips) {
    const base = positions.length / 3;
    strip.forEach(([l, r], i) => {
      positions.push(l[0], 0, l[1], r[0], 0, r[1]);
      if (i > 0) {
        const a = base + 2 * (i - 1);
        indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
    });
  }
  for (const tri of triangles) {
    const base = positions.length / 3;
    for (const [x, z] of tri) positions.push(x, 0, z);
    indices.push(base, base + 1, base + 2);
  }
  return { positions: Float32Array.from(positions), indices: Uint32Array.from(indices) };
};

/** A strip `half` wide either side of the polyline shifted `offset` to its left. */
const ribbon = (points: ReadonlyArray<Xz>, offset: number, half: number): Array<readonly [Xz, Xz]> =>
  points.map(([x, z], i) => {
    const [ax, az] = points[Math.max(0, i - 1)] ?? [x, z];
    const [bx, bz] = points[Math.min(points.length - 1, i + 1)] ?? [x, z];
    const len = Math.hypot(bx - ax, bz - az) || 1;
    const nx = (bz - az) / len;
    const nz = -(bx - ax) / len;
    const at = (d: number): Xz => [x + nx * d, z + nz * d];
    return [at(offset - half), at(offset + half)];
  });

/** The skis' track over the turns around this one, each next turn mirrored in x, as the figure's. */
export const trackMarks = (s: Surface): Marks => {
  const turn: Array<Xz> = Array.from({ length: TRACK_SAMPLES + 1 }, (_, i) => {
    const { x, z } = pathAt(s, i / TRACK_SAMPLES);
    return [x, z];
  });
  const length = (turn[TRACK_SAMPLES]?.[1] ?? 0) - (turn[0]?.[1] ?? 0);
  const line: Array<Xz> = [];
  for (let k = -TURNS_AROUND; k <= TURNS_AROUND; k++) {
    const sign = k % 2 === 0 ? 1 : -1;
    for (const [i, [x, z]] of turn.entries()) if (i > 0 || line.length === 0) line.push([sign * x, z + k * length]);
  }
  return build([ribbon(line, SKI_OFFSET, LINE_HALF), ribbon(line, -SKI_OFFSET, LINE_HALF)], []);
};

/** Faint lines down the fall line, `reach` metres either side of the origin across and along it. */
export const fallLineMarks = (reach: number): Marks => {
  const strips: Array<Array<readonly [Xz, Xz]>> = [];
  for (let x = -Math.floor(reach / FALL_SPACING) * FALL_SPACING; x <= reach; x += FALL_SPACING)
    strips.push(ribbon([[x, -reach], [x, reach]], 0, FALL_HALF_WIDTH));
  return build(strips, []);
};

/** A small arrow pointing down the fall line (+z), centred at `at`. */
export const downhillArrow = (at: Xz): Marks => {
  const [x, z] = at;
  const shaft = ribbon([[x, z - 0.35], [x, z + 0.15]], 0, 0.015);
  return build([shaft], [[[x - 0.09, z + 0.12], [x + 0.09, z + 0.12], [x, z + 0.32]]]);
};
