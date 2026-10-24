import { TurnKind } from '../../physics/task';
import LIT from '../../../scripts/prior/lit-curves.json';
import { DATA } from '../capture/data';

/** Literature keys whose curves stand as evidence for a kind (motion-model §8). */
export const LIT_KEYS: Readonly<Record<TurnKind, ReadonlyArray<string>>> = {
  [TurnKind.GS]: ['gs_carving'],
  [TurnKind.SL]: ['slalom'],
  [TurnKind.Steered]: ['recreational_parallel_short'],
  [TurnKind.Moguls]: ['moguls_zipper'],
};

/** Physics strip channels a literature channel overlays: lean and edge, degrees. */
export const Channel = { Lean: 'lean', Edge: 'edge' } as const;
export type Channel = (typeof Channel)[keyof typeof Channel];
const LIT_CHANNEL: Readonly<Record<string, Channel>> = { inclination: Channel.Lean, edge_angle: Channel.Edge };

export interface LitSeries {
  readonly key: string;
  readonly channel: Channel;
  readonly label: string;
  readonly t: ReadonlyArray<number>;
  readonly y: ReadonlyArray<number>;
  readonly band: readonly [ReadonlyArray<number>, ReadonlyArray<number>] | null;
  readonly status: string;
  readonly source: string;
}

/** A channel the literature has no curve for: its status and what it does say. */
export interface LitNote {
  readonly key: string;
  readonly channel: Channel;
  readonly status: string;
  readonly text: string;
}

type Json = Readonly<Record<string, unknown>>;
const isObj = (v: unknown): v is Json => typeof v === 'object' && v !== null && !Array.isArray(v);
const nums = (v: unknown): ReadonlyArray<number> | null => (Array.isArray(v) && v.every((x) => typeof x === 'number') ? (v as ReadonlyArray<number>) : null);
const str = (v: unknown): string => (typeof v === 'string' ? v : '');

const seriesOf = (key: string, channel: Channel, label: string, o: Json, parent: Json): LitSeries | null => {
  const t = nums(o['t']);
  const y = nums(o['mean']) ?? nums(o['v']);
  if (t === null || y === null || t.length !== y.length) return null;
  const r = o['range'];
  const lo = Array.isArray(r) ? nums(r[0]) : null;
  const hi = Array.isArray(r) ? nums(r[1]) : null;
  return {
    key,
    channel,
    label,
    t,
    y,
    band: lo !== null && hi !== null && lo.length === t.length && hi.length === t.length ? [lo, hi] : null,
    status: str(o['status']) || str(parent['status']),
    source: str(o['source']) || str(parent['source']),
  };
};

export interface KindEvidence {
  readonly series: ReadonlyArray<LitSeries>;
  readonly notes: ReadonlyArray<LitNote>;
}

export const litEvidence = (kind: TurnKind): KindEvidence => {
  const lit: unknown = LIT;
  const series: LitSeries[] = [];
  const notes: LitNote[] = [];
  if (!isObj(lit)) return { series, notes };
  for (const key of LIT_KEYS[kind]) {
    const entry = lit[key];
    if (!isObj(entry)) continue;
    for (const [name, channel] of Object.entries(LIT_CHANNEL)) {
      const c = entry[name];
      if (!isObj(c)) {
        notes.push({ key, channel, status: 'missing', text: '' });
        continue;
      }
      const whole = seriesOf(key, channel, key.replaceAll('_', ' '), c, c);
      const parts = Object.entries(c).flatMap(([sub, v]) => (isObj(v) ? [seriesOf(key, channel, `${key.replaceAll('_', ' ')} ${sub}`, v, c)] : []));
      const found = [whole, ...parts].filter((s): s is LitSeries => s !== null);
      if (found.length > 0) series.push(...found);
      else notes.push({ key, channel, status: str(c['status']) || 'missing', text: str(c['values']) || str(c['note']) });
    }
  }
  return { series, notes };
};

export interface Clip {
  readonly name: string;
  readonly source: string;
  readonly start: number;
  readonly end: number;
  readonly view: string;
  readonly kind: string;
  readonly verdict: string;
  readonly poses: ReadonlyArray<string>;
}

export const loadClips = async (): Promise<ReadonlyArray<Clip>> => {
  const r = await fetch(`${DATA}clips.json`);
  if (!r.ok) throw new Error(`clips: ${r.status}`);
  return (await r.json()) as ReadonlyArray<Clip>;
};
