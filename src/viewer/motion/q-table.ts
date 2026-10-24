import type { Intensity } from '../../content/schema';
import { COORDINATES, REST_POSE, SEGMENT_NAMES, Side } from '../skeleton';
import { Terrain } from '../skier';
import { pathAt, surfaceFor } from '../surface';
import { forward, skiFrame, transform } from './fk';
import type { Rigid, V3 } from './fk';
import { NAMES, skiGoal, skiPoints } from './turn';
import Q_TABLES from './q-tables.json';
import { MIGRATED } from './migrated';

export { MIGRATED };

/** Solved frames per turn: a multiple of the bake's 24, so its frames are exact. */
export const Q_FRAMES = 48;
/** Radians or metres per stored unit, as the pose tables'. */
export const Q_SCALE = 1e-4;

/** Per migrated drill and intensity, one base64 int16 run of frames × NAMES; `hash` is the solve's inputs'. */
export interface QTables {
  readonly names: ReadonlyArray<string>;
  readonly frames: number;
  readonly hash: string;
  readonly drills: Readonly<Record<string, Readonly<Record<string, string>>>>;
  /** Per drill and intensity, the solve's inside-ski edges, tip then tail per frame, as TurnProblem.insideEdges. */
  readonly edges: Readonly<Record<string, Readonly<Record<string, string>>>>;
}

export const encodeQ = (frames: ReadonlyArray<ArrayLike<number>>): string => {
  const n = NAMES.length;
  const values = new Int16Array(frames.length * n);
  frames.forEach((q, k) => {
    for (let i = 0; i < n; i++) {
      const v = Math.round((q[i] ?? 0) / Q_SCALE);
      if (Math.abs(v) > 0x7fff) throw new Error(`${NAMES[i]} out of range: ${q[i]}`);
      values[k * n + i] = v;
    }
  });
  let s = '';
  for (const b of new Uint8Array(values.buffer)) s += String.fromCharCode(b);
  return btoa(s);
};

/** Frames stored over `names` onto today's NAMES; a coordinate the store lacks reads 0. */
export const decodeQ = (text: string, names: ReadonlyArray<string> = NAMES): ReadonlyArray<Float64Array> => {
  const bytes = Uint8Array.from(atob(text), (ch) => ch.charCodeAt(0));
  const view = new DataView(bytes.buffer);
  const n = names.length;
  const from = NAMES.map((name) => names.indexOf(name));
  return Array.from({ length: bytes.byteLength / 2 / n }, (_, k) => Float64Array.from(from, (i) => (i < 0 ? 0 : view.getInt16((k * n + i) * 2, true) * Q_SCALE)));
};

export const encodeEdges = (edges: ArrayLike<number>): string => Array.from(edges, String).join('');

export const STORED_Q: QTables = Q_TABLES;

/** The inside edges the drill's stored solve settled on, or null when it is not migrated or not yet solved. */
export const qEdges = (drill: string, intensity: Intensity, tables: QTables = STORED_Q): Uint8Array | null => {
  const text = MIGRATED.has(drill) ? tables.edges[drill]?.[intensity] : undefined;
  return text === undefined ? null : Uint8Array.from(text, Number);
};

/** The drill's solved turn, one q per frame from t = 0, or null when it is not migrated or not yet solved. */
export const qTable = (drill: string, intensity: Intensity, tables: QTables = STORED_Q): ReadonlyArray<Float64Array> | null => {
  const text = MIGRATED.has(drill) ? tables.drills[drill]?.[intensity] : undefined;
  return text === undefined ? null : decodeQ(text, tables.names);
};


/** The outside ski's centre at rest, on the root's snow: where the legacy figure keeps its ski. */
const REST_SKI: readonly [number, number, number] = (() => {
  const c = transform(skiFrame(forward(COORDINATES.map((co) => REST_POSE[co.name] ?? 0)), Side.Right), skiPoints(Terrain.Groomed).centre).map(Number);
  return [c[0] ?? 0, 0, c[2] ?? 0];
})();

/** Rest world frame per segment, as the root frames below at the rest pose. */
export const REST_WORLD: Readonly<Record<string, Rigid>> = forward(COORDINATES.map((c) => REST_POSE[c.name] ?? 0));

/**
 * Segment world frames at turn time `t` in the figure's root: the slope frame turned onto the outside ski's track
 * (x across toward the inside, y the snow normal, z along), its centre at the rest ski's place.
 */
export const rootWorlds = (drill: string, intensity: Intensity, q: ArrayLike<number>, t: number): Readonly<Record<string, Rigid>> => {
  const surface = surfaceFor(drill, intensity);
  const g = skiGoal(drill, intensity, surface, t);
  // Rows of the slope → root rotation.
  const Rr = [...g.across, ...g.normal, ...g.forward];
  // The root rides pathAt; on moguls the skis sit off it on their line.
  const root = pathAt(surface, t);
  const at = [root.x, g.origin[1], root.z];
  const w = forward(Array.from({ length: COORDINATES.length }, (_, i) => q[i] ?? 0), g.origin, SEGMENT_NAMES, g.ref);
  return Object.fromEntries(
    Object.entries(w).map(([name, m]) => {
      const R = m.R.map(Number);
      const rows = [0, 1, 2].flatMap((r) => [0, 1, 2].map((c) => (Rr[3 * r] ?? 0) * (R[c] ?? 0) + (Rr[3 * r + 1] ?? 0) * (R[3 + c] ?? 0) + (Rr[3 * r + 2] ?? 0) * (R[6 + c] ?? 0)));
      const d = [0, 1, 2].map((k) => Number(m.p[k as 0 | 1 | 2]) - (at[k] ?? 0));
      const p = [0, 1, 2].map((r) => (Rr[3 * r] ?? 0) * (d[0] ?? 0) + (Rr[3 * r + 1] ?? 0) * (d[1] ?? 0) + (Rr[3 * r + 2] ?? 0) * (d[2] ?? 0) + (REST_SKI[r] ?? 0));
      return [name, { R: rows, p: p as unknown as V3 }];
    }),
  );
};

/** World delta rest → posed of a root frame, column-major: what the bake applies to the segment's bone. */
export const deltaOf = (posed: Rigid, rest: Rigid): ReadonlyArray<number> => {
  const P = posed.R.map(Number);
  const S = rest.R.map(Number);
  // D = P · Sᵀ; t = p − D · s.
  const D = [0, 1, 2].flatMap((r) => [0, 1, 2].map((c) => (P[3 * r] ?? 0) * (S[3 * c] ?? 0) + (P[3 * r + 1] ?? 0) * (S[3 * c + 1] ?? 0) + (P[3 * r + 2] ?? 0) * (S[3 * c + 2] ?? 0)));
  const s = rest.p.map(Number);
  const t = [0, 1, 2].map((r) => Number(posed.p[r as 0 | 1 | 2]) - ((D[3 * r] ?? 0) * (s[0] ?? 0) + (D[3 * r + 1] ?? 0) * (s[1] ?? 0) + (D[3 * r + 2] ?? 0) * (s[2] ?? 0)));
  return [D[0], D[3], D[6], 0, D[1], D[4], D[7], 0, D[2], D[5], D[8], 0, t[0], t[1], t[2], 1].map((v) => v ?? 0);
};
