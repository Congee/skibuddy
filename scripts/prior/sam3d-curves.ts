// Usage: bun scripts/prior/sam3d-curves.ts <dir with {reilly,sce,lig}_angles.csv>
// Per-turn knee and total trunk pitch from SAM 3D Body angle CSVs, registered to the edge changes
// (inclination zero crossings, 3-frame mean). Writes scripts/prior/sam3d-curves.json. The CSVs carry
// trunk_gravity and trunk_across_in from the trunk-vs-camera-up pass (sam3d trunkg.py).
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const OUT = new URL('./sam3d-curves.json', import.meta.url);
const PHI = Array.from({ length: 13 }, (_, i) => i / 12);

interface Clip {
  readonly key: string;
  readonly clip: string;
  readonly view: string;
  /** Range-only: samples too sparse for a curve. */
  readonly rangeOnly: boolean;
  /** Leading rows from other shots. */
  readonly skip: number;
}
const CLIPS: ReadonlyArray<Clip> = [
  { key: 'reilly', clip: 'vXcjdfBXTiI (Reilly McGlashan), spike clip = source 3.92–5.76 s', view: 'side-on, 1080p24, figure 420–800 px', rangeOnly: false, skip: 0 },
  { key: 'sce', clip: 'jBsWS4hpivY (Snow Camps Europe instructor), source 32.20–33.23 s', view: 'rear-oblique follow-cam, 720p30, figure 280–310 px', rangeOnly: false, skip: 0 },
  { key: 'lig', clip: 'Ted Ligety GS slow-mo (spike ligA.mp4, 0–20 s of a 142 s download; YouTube id not recorded)', view: 'GS, varied angles, every 10th slow-mo frame', rangeOnly: true, skip: 2 },
];

const parse = (path: string): Record<string, number[]> => {
  const [head = '', ...rows] = readFileSync(path, 'utf8').trim().split('\n');
  const cols = head.split(',');
  const out: Record<string, number[]> = Object.fromEntries(cols.map((c) => [c, []]));
  for (const row of rows) row.split(',').forEach((v, i) => out[cols[i] ?? '']?.push(Number(v)));
  return out;
};

const r1 = (x: number): number => Math.round(x * 10) / 10;
const lerpAt = (t: ReadonlyArray<number>, v: ReadonlyArray<number>, x: number): number => {
  let i = 0;
  while (i < t.length - 2 && (t[i + 1] ?? 0) < x) i++;
  const [t0 = 0, t1 = 0, v0 = 0, v1 = 0] = [t[i], t[i + 1], v[i], v[i + 1]];
  return t1 === t0 ? v0 : v0 + ((v1 - v0) * (x - t0)) / (t1 - t0);
};

const turnsOf = (c: Clip, a: Record<string, number[]>): unknown => {
  const t = (a['t'] ?? []).slice(c.skip);
  const col = (k: string): number[] => (a[k] ?? []).slice(c.skip);
  const inc = col('inclination_cam');
  const sm = inc.map((_, i) => ((inc[Math.max(0, i - 1)] ?? 0) + (inc[i] ?? 0) + (inc[Math.min(inc.length - 1, i + 1)] ?? 0)) / 3);
  const cross: number[] = [];
  for (let i = 0; i + 1 < sm.length; i++) {
    const [s0 = 0, s1 = 0] = [sm[i], sm[i + 1]];
    if (Math.sign(s0) !== Math.sign(s1) && s0 !== 0) cross.push((t[i] ?? 0) + ((t[i + 1] ?? 0) - (t[i] ?? 0)) * (s0 / (s0 - s1)));
  }
  // A range needs no whole turn: the clip's ends bound its part turns.
  const bounds = c.rangeOnly ? [t[0] ?? 0, ...cross, t[t.length - 1] ?? 0] : cross;
  const turns = bounds.slice(0, -1).map((t0, j) => {
    const t1 = bounds[j + 1] ?? t0;
    const mid = (t0 + t1) / 2;
    // Inclination + is the CoM to the skier's left: a left turn, the right leg outside.
    const outside = lerpAt(t, sm, mid) > 0 ? 'R' : 'L';
    const inside = outside === 'R' ? 'L' : 'R';
    const keys = { knee_outside: `knee_flex_${outside}`, knee_inside: `knee_flex_${inside}`, trunk_pitch: 'trunk_pitch_ski', trunk_gravity: 'trunk_gravity', trunk_across: 'trunk_across_in' } as const;
    const within = t.flatMap((x, i) => (x >= t0 && x <= t1 ? [i] : []));
    const range = (k: string): [number, number] => {
      const xs = within.map((i) => col(k)[i] ?? 0);
      return [r1(Math.min(...xs)), r1(Math.max(...xs))];
    };
    const p5p95 = (k: string): [number, number] => {
      const xs = within.map((i) => col(k)[i] ?? 0).toSorted((x, y) => x - y);
      const q = (f: number): number => r1(lerpAt(xs.map((_, i) => i / (xs.length - 1)), xs, f));
      return [q(0.05), q(0.95)];
    };
    return {
      start_s: Math.round(t0 * 100) / 100,
      end_s: Math.round(t1 * 100) / 100,
      outside_label: outside,
      samples: within.length,
      range: Object.fromEntries(Object.entries(keys).map(([k, v]) => [k, range(v)])),
      p5_p95: Object.fromEntries(Object.entries(keys).map(([k, v]) => [k, p5p95(v)])),
      ...(c.rangeOnly ? {} : Object.fromEntries(Object.entries(keys).map(([k, v]) => [k, PHI.map((p) => r1(lerpAt(t, col(v), t0 + p * (t1 - t0))))]))),
    };
  });
  return { clip: c.clip, view: c.view, range_only: c.rangeOnly, crossings_s: cross.map((x) => Math.round(x * 100) / 100), turns: turns.filter((x) => x.samples >= 3) };
};

if (import.meta.main) {
  const dir = process.argv[2];
  if (dir === undefined) throw new Error('usage: sam3d-curves.ts <dir>');
  const clips = Object.fromEntries(CLIPS.map((c) => [c.key, turnsOf(c, parse(join(dir, `${c.key}_angles.csv`)))]));
  const out = {
    method: 'SAM 3D Body (dinov3), per frame; knee_flex 3D thigh–shank; trunk_pitch_ski = pelvis root → neck keypoint against the mean sole normal, in the plane of the mean foot axis (+ forward); trunk_gravity = pelvis root → neck off camera up; trunk_across = its angle in the plane of camera up and the across-heading axis, + toward the CoM’s side (the turn’s inside); phase = (t − edge change) / (next − edge change), edge change = inclination zero crossing (3-frame mean), resampled linearly',
    phi: PHI.map((p) => Math.round(p * 1e4) / 1e4),
    clips,
  };
  writeFileSync(OUT, `${JSON.stringify(out, null, 1)}\n`);
}
