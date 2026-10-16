import type { Intensity } from '../content/schema';
import { POSE_CHANNELS, poseFromChannels, poseToChannels } from './pose';
import type { Pose } from './pose';
import TABLES from './poses/tables.json';

/** Radians (and the touch's 0..1) per stored unit: a tenth of a milliradian, so int16 covers ±3.27. */
export const TABLE_SCALE = 1e-4;

/** The solved tables as stored: per drill and intensity, one base64 int16 run of samples × channels. */
export interface PoseTables {
  readonly channels: ReadonlyArray<string>;
  readonly samples: number;
  /** A still stance: one sample. */
  readonly neutral: string;
  readonly drills: Readonly<Record<string, Readonly<Record<string, string>>>>;
}

/** Poses evenly spaced through one turn from t = 0; one pose stands still. */
export type PoseTable = ReadonlyArray<Pose>;

const toBase64 = (bytes: Uint8Array): string => {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
};

const fromBase64 = (text: string): Uint8Array => Uint8Array.from(atob(text), (ch) => ch.charCodeAt(0));

export const encodeTable = (poses: PoseTable): string => {
  const values = new Int16Array(poses.length * POSE_CHANNELS.length);
  poses.forEach((p, i) =>
    poseToChannels(p).forEach((v, c) => {
      const q = Math.round(v / TABLE_SCALE);
      if (Math.abs(q) > 0x7fff) throw new Error(`pose channel ${POSE_CHANNELS[c]} out of range: ${v}`);
      values[i * POSE_CHANNELS.length + c] = q;
    }),
  );
  // Little-endian on every platform the app runs on; the decoder reads the same way.
  return toBase64(new Uint8Array(values.buffer));
};

export const decodeTable = (text: string): PoseTable => {
  const bytes = fromBase64(text);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const n = POSE_CHANNELS.length;
  const count = bytes.byteLength / 2 / n;
  const values = Array.from({ length: count * n }, (_, i) => view.getInt16(i * 2, true) * TABLE_SCALE);
  return Array.from({ length: count }, (_, i) => poseFromChannels(values, i * n));
};

const stored: PoseTables = TABLES;
const decoded = new Map<string, PoseTable>();

const cached = (key: string, text: string): PoseTable => {
  let table = decoded.get(key);
  if (table === undefined) {
    table = decodeTable(text);
    decoded.set(key, table);
  }
  return table;
};

/** The drill's solved turn at this intensity, or the neutral stance when the drill has no pose. */
export const poseTable = (drill: string | null, intensity: Intensity, tables: PoseTables = stored): PoseTable => {
  const text = drill === null ? undefined : tables.drills[drill]?.[intensity];
  if (text === undefined || drill === null) return cached('neutral', tables.neutral);
  return tables === stored ? cached(`${drill}/${intensity}`, text) : decodeTable(text);
};

/** The table has the drill's own motion. */
export const hasTable = (drill: string, tables: PoseTables = stored): boolean => tables.drills[drill] !== undefined;

const mix = (a: number, b: number, f: number): number => a + (b - a) * f;

/** The pose at turn time `t`, interpolated between the table's samples. */
export const samplePose = (table: PoseTable, t: number): Pose => {
  const first = table[0];
  if (first === undefined) throw new Error('empty pose table');
  if (table.length === 1) return first;
  const u = (((t % 1) + 1) % 1) * table.length;
  // Sample times such as 1/24 land a rounding error off their sample.
  const near = Math.round(u);
  const i = Math.abs(u - near) < 1e-9 ? near : Math.floor(u);
  const f = Math.max(0, u - i);
  const a = table[i % table.length];
  const b = table[(i + 1) % table.length];
  if (a === undefined || b === undefined) throw new Error('empty pose table');
  if (f < 1e-9) return a;
  const ca = poseToChannels(a);
  const cb = poseToChannels(b);
  return poseFromChannels(ca.map((x, k) => mix(x, cb[k] ?? x, f)));
};
