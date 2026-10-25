import CYCLES from './groomed-cycles.json';
import type { Snow } from './edge';
import type { TurnTask } from './task';
import { groomedPointAt } from './turn';
import type { TurnProfile } from './turn';

/** Solved groomed cycles (scripts/solve/groomed-bake.ts), each keyed by its task and snow; hash covers the solve's sources. */
export interface GroomedCycles {
  readonly hash: string;
  readonly cells: ReadonlyArray<{ readonly key: string; readonly profile: unknown }>;
}

export const GROOMED_CYCLES: GroomedCycles = CYCLES;

export const groomedKeyOf = (task: TurnTask, snow: Snow): string => JSON.stringify([task, snow]);

const toBase64 = (a: ArrayLike<number>): string => {
  let s = '';
  for (const b of new Uint8Array(Float64Array.from(a).buffer)) s += String.fromCharCode(b);
  return btoa(s);
};
const fromBase64 = (text: string): Float64Array => new Float64Array(Uint8Array.from(atob(text), (c) => c.charCodeAt(0)).buffer);

/** The profile without `at`, bit-exact: number series as base64 doubles, and NaN, ±Infinity and −0, which JSON loses, by name. */
export const encodeProfile = (p: TurnProfile): unknown =>
  JSON.parse(
    JSON.stringify(p, (_, v: unknown) => {
      if (v instanceof Float64Array) return { f64: toBase64(v), typed: true };
      if (Array.isArray(v) && v.length > 0 && v.every((x) => typeof x === 'number')) return { f64: toBase64(v) };
      if (typeof v === 'number' && (!Number.isFinite(v) || Object.is(v, -0))) return { num: Object.is(v, -0) ? '-0' : String(v) };
      return v;
    }),
  );

const decode = (v: unknown): unknown => {
  if (Array.isArray(v)) return v.map(decode);
  if (typeof v !== 'object' || v === null) return v;
  if ('f64' in v && typeof v.f64 === 'string') return 'typed' in v ? fromBase64(v.f64) : Array.from(fromBase64(v.f64));
  if ('num' in v && typeof v.num === 'string') return Number(v.num);
  return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, decode(x)]));
};

/** An encoded profile with its `at` rebuilt as the solve builds it. */
export const decodeProfile = (encoded: unknown): TurnProfile => {
  const p = decode(encoded) as Omit<TurnProfile, 'at'>;
  return { ...p, at: groomedPointAt({ ...p, speed: Array.from(p.speed) }) };
};

const byKey = new Map(GROOMED_CYCLES.cells.map((c) => [c.key, c.profile]));

/** The baked cycle for this task and snow, or null when none was baked for them. */
export const bakedGroomed = (task: TurnTask, snow: Snow): TurnProfile | null => {
  const hit = byKey.get(groomedKeyOf(task, snow));
  return hit === undefined ? null : decodeProfile(hit);
};
