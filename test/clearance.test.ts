import { assert, describe, vi } from '@effect/vitest';
import { INTENSITIES } from '../src/content/schema';
import type { Intensity } from '../src/content/schema';
import { REFERENCE_SKIER, SKI_MOUNT } from '../src/viewer/skier';
import { NAMES } from '../src/viewer/motion/turn';
import { MIGRATED, Q_SCALE } from '../src/viewer/motion/q-table';
import { POSE_CHANNELS } from '../src/viewer/pose';
import { TABLE_SCALE, hasTable } from '../src/viewer/pose-table';
import { POSE_DEFINITIONS } from '../src/viewer/poses';
import { Source, bootGap, framesOf, lead, legGap, skiGap, skiOfDrill } from './clearance-rig';
import type { Frame } from './clearance-rig';
import { failsUntil } from './legacy';

vi.setConfig({ testTimeout: 120_000 });

const DRILLS = Object.keys(POSE_DEFINITIONS).filter((d) => hasTable(d));
// The drawn pose table for every drill, and the solve's q-table by forward kinematics for the migrated ones.
const CASES = DRILLS.flatMap((drill) =>
  INTENSITIES.flatMap((i) => [[drill, i, Source.Drawn] as const, ...(MIGRATED.has(drill) ? [[drill, i, Source.Q] as const] : [])]),
);
const name = (drill: string, i: Intensity, source: Source): string => (source === Source.Drawn ? `${drill} ${i}` : `${drill} ${i} (q)`);

// Channels that move a leg's boot, ski or capsule: the pelvis and leg chain, not arms, trunk, head or poles.
const DRAWN_CHAIN = POSE_CHANNELS.filter((c) => !/^(spine|head|arm|pole|reach)|Girdle/.test(c)).length;
const Q_CHAIN = NAMES.filter((n) => /^(pelvis|hip|knee|ankle|subtalar)/.test(n)).length;
/**
 * Metres a stored table can move a clearance: each leg-chain channel rounds by at most half a step (scale / 2) and
 * swings a point at most the pelvis-to-ski-tip reach R about its joint; a gap or a lead differences two such points.
 */
const floorOf = (drill: string, i: Intensity, source: Source): number => {
  const [chain, scale] = source === Source.Drawn ? [DRAWN_CHAIN, TABLE_SCALE] : [Q_CHAIN, Q_SCALE];
  const { body } = REFERENCE_SKIER;
  const reach = body.thigh + body.shin + skiOfDrill(drill, i).length / 2 + SKI_MOUNT;
  return 2 * chain * (scale / 2) * reach;
};

const frames = new Map<string, ReadonlyArray<Frame>>();
const framesFor = (drill: string, i: Intensity, source: Source): ReadonlyArray<Frame> => {
  const key = name(drill, i, source);
  const hit = frames.get(key);
  if (hit !== undefined) return hit;
  const out = framesOf(drill, i, source);
  if (out === null) throw new Error(`${key}: no table`);
  frames.set(key, out);
  return out;
};

/** Smallest value over the table with the sample time it falls at. */
const least = (list: ReadonlyArray<Frame>, f: (x: Frame) => number): { readonly value: number; readonly t: number } => {
  let value = Infinity;
  let t = Number.NaN;
  for (const x of list) {
    const v = f(x);
    if (v < value) [value, t] = [v, x.t];
  }
  return { value, t };
};
const mm = (x: number): string => `${(x * 1000).toFixed(1)} mm`;

const MOGULS = 'moguls migration onto the whole-turn solve';
const R1 = 'R1 smooth skid solve and rebake';
const LEGACY = 'powder and steeps migration onto the whole-turn solve';
type Known = ReadonlyArray<{ readonly step: string; readonly cases: ReadonlyArray<string> }>;
const all = (...drills: ReadonlyArray<string>): ReadonlyArray<string> => drills.flatMap((d) => INTENSITIES.map((i) => `${d} ${i}`));
const MOGUL_DRILLS = all('regular-moguls', 'turns-on-the-tops', 'round-line', 'closed-stance-short-turns');
// Cases that fail on the current tables, keyed by invariant, each with the pipeline step expected to fix it.
const KNOWN: Readonly<Record<string, Known>> = {
  'the skis never intersect': [
    { step: MOGULS, cases: MOGUL_DRILLS },
    { step: LEGACY, cases: all('regular-powder') },
    { step: R1, cases: ['regular-steered gentle', 'regular-steered gentle (q)'] },
  ],
  'the boots never intersect': [{ step: MOGULS, cases: MOGUL_DRILLS }],
  'the legs never intersect': [
    { step: MOGULS, cases: MOGUL_DRILLS },
    { step: LEGACY, cases: all('regular-powder') },
    { step: R1, cases: ['regular-gs gentle', 'regular-gs gentle (q)'] },
  ],
  'the inside ski is never behind the outside': [
    { step: MOGULS, cases: all('regular-moguls', 'turns-on-the-tops', 'round-line') },
    { step: LEGACY, cases: all('regular-powder', 'regular-steeps') },
    { step: R1, cases: ['regular-gs moderate', 'regular-sl moderate', 'regular-steered dynamic'].flatMap((c) => [c, `${c} (q)`]) },
  ],
};
const check = (invariant: string, body: (drill: string, i: Intensity, source: Source) => void): void => {
  describe(invariant, () => {
    for (const [drill, i, source] of CASES) {
      const step = KNOWN[invariant]?.find((k) => k.cases.includes(name(drill, i, source)))?.step;
      failsUntil(step ?? '', step !== undefined)(name(drill, i, source), () => body(drill, i, source));
    }
  });
};

describe('clearance', () => {
  check('the skis never intersect', (drill, i, source) => {
    const w = least(framesFor(drill, i, source), (x) => skiGap(x.rig));
    assert.isAtLeast(w.value, -floorOf(drill, i, source), `skis overlap ${mm(-w.value)} at t=${w.t.toFixed(3)}`);
  });

  check('the boots never intersect', (drill, i, source) => {
    const w = least(framesFor(drill, i, source), (x) => bootGap(x.rig));
    assert.isAtLeast(w.value, -floorOf(drill, i, source), `boots overlap ${mm(-w.value)} at t=${w.t.toFixed(3)}`);
  });

  check('the legs never intersect', (drill, i, source) => {
    const w = least(framesFor(drill, i, source), (x) => legGap(x.rig));
    assert.isAtLeast(w.value, -floorOf(drill, i, source), `legs overlap ${mm(-w.value)} at t=${w.t.toFixed(3)}`);
  });

  check('the inside ski is never behind the outside', (drill, i, source) => {
    const list = framesFor(drill, i, source);
    const floor = floorOf(drill, i, source);
    const w = least(list, (x) => lead(x.rig));
    const first = list.find((x) => lead(x.rig) < -floor);
    // The mirror makes lead(T) = -lead(0), so lead >= 0 all through leaves the switch level.
    const [head] = list;
    const start = head === undefined ? 0 : lead(head.rig);
    assert.isAtMost(Math.abs(start), floor, `feet not level at the switch: lead ${mm(start)}`);
    assert.isUndefined(first, `inside ski ${mm(-w.value)} behind from t=${first?.t.toFixed(3)} (worst at t=${w.t.toFixed(3)})`);
  });
});
