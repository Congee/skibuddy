import { assert, describe } from '@effect/vitest';
import { drillScenarios } from '../scripts/anatomy/drill-scenarios';
import { INTENSITIES } from '../src/content/schema';
import type { Intensity } from '../src/content/schema';
import { isTurn, turnForcesAt, type TurnScenario } from '../src/physics/turn';
import { CAPSULE_BOOT } from '../src/viewer/gear-fit';
import { EQUIPMENT, minShinAngle } from '../src/viewer/equipment';
import { BodySide, segmentIndex } from '../src/viewer/figure';
import { HEAD_LIMIT } from '../src/viewer/gaze';
import { identity, transformPoint } from '../src/viewer/mat4';
import type { Mat4, Vec3 } from '../src/viewer/mat4';
import { POSE_CHANNELS, kneeFlex, mirrorPose, outsideWeight, poseToChannels, segmentMatrices, skiIndex } from '../src/viewer/pose';
import type { Pose } from '../src/viewer/pose';
import { TABLE_SCALE, hasTable, poseTable } from '../src/viewer/pose-table';
import { solvePose } from '../src/viewer/pose-solver';
import { POSE_DEFINITIONS } from '../src/viewer/poses';
import { RegularTurn } from '../src/viewer/poses/regular-turn';
import { surfaceFor } from '../src/viewer/surface';
import { failsUntil } from './legacy';
import { ALONG, SIDES, ridden } from './ride-probes';
import type { Ridden } from './ride-probes';

const DEG = 180 / Math.PI;
const DRILLS = Object.keys(POSE_DEFINITIONS).filter((d) => hasTable(d));
const CASES = DRILLS.flatMap((drill) => INTENSITIES.map((i) => [drill, i] as const));

/** Metres a ski edge may sit below the snow: rigid skis on a curved field, and the table's 1e-4 precision; inferred. */
const PENETRATION = 0.002;
/** Metres the outside ski's lowest edge may float off the snow while it carries the load; inferred. */
const CONTACT = 0.005;
/** Snow-ski lateral friction angle atan(0.1), the top of the kinetic range: below it the carved edge cannot hold; inferred. */
const FRICTION = Math.atan(0.1) * DEG;
/** Degrees the mass-to-pressure-centre line may sit off the resultant: quasi-static, angular momentum ignored; inferred. */
const FORCE_LINE = 3;
/** Resultant tilt, degrees, below which the force-line direction is too short to read; inferred. */
const SETTLED = 5;
/** Metres the whole figure stands off its ski in an airborne phase (dolphin): contact and balance drop there. */
const AIRBORNE = 0.005;
const CARVED = new Set<string>([RegularTurn.Carving, RegularTurn.Cruising]);

interface Sample {
  readonly pose: Pose;
  readonly t: number;
  readonly world: ReadonlyArray<Mat4>;
  readonly ride: Ridden;
}

const cache = new Map<string, ReadonlyArray<Sample>>();
const samples = (drill: string, i: Intensity): ReadonlyArray<Sample> => {
  const key = `${drill} ${i}`;
  const hit = cache.get(key);
  if (hit !== undefined) return hit;
  const s = surfaceFor(drill, i);
  const table = poseTable(drill, i);
  const out = table.map((pose, k) => {
    const t = k / table.length;
    return { pose, t, world: segmentMatrices({ ...pose, rise: 0 }), ride: ridden(s, t, pose) };
  });
  cache.set(key, out);
  return out;
};

const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const axis = (m: Mat4, v: Vec3): Vec3 => sub(transformPoint(m, v), transformPoint(m, [0, 0, 0]));
const at = (world: ReadonlyArray<Mat4>, segment: string, p: Vec3 = [0, 0, 0]): Vec3 => transformPoint(world[segmentIndex(segment)] ?? identity(), p);
/** Lowest edge point of a ski over the snow right under it, metres, the figure's rise included. */
const lowest = (s: Sample, side: (typeof SIDES)[number]): number => Math.min(...s.ride.edges[side].flat().map((p) => p[1] - s.ride.ground(p))) + s.pose.rise;
/** Mid-ski point of the lower edge: where an edged ski bears on the snow. */
const contact = (s: Sample, side: (typeof SIDES)[number]): Vec3 => {
  const mids = s.ride.edges[side].map((e): Vec3 => e[ALONG / 2] ?? [0, 0, 0]);
  const [a, b] = mids.map((p) => p[1] - s.ride.ground(p));
  return (a ?? 0) <= (b ?? 0) ? (mids[0] ?? [0, 0, 0]) : (mids[1] ?? [0, 0, 0]);
};
const airborne = (s: Sample): boolean => s.pose.rise > AIRBORNE;
const scenarioOf = (drill: string, i: Intensity): TurnScenario | null => {
  const s = drillScenarios(drill)[i];
  return isTurn(s) ? s : null;
};
/** Outside ski edged toward the inside of the turn, degrees, relative to the snow's bank under it. */
const outsideEdge = (s: Sample): number => {
  const ski = s.world[skiIndex(BodySide.Right)] ?? identity();
  return -(Math.asin(axis(ski, [1, 0, 0])[1]) - s.ride.ride.outsideBank) * DEG;
};

/** Worst case over a table: the sample and its value. */
const worst = (list: ReadonlyArray<Sample>, f: (s: Sample) => number | null): { readonly value: number; readonly t: number } => {
  let value = -Infinity;
  let t = NaN;
  for (const s of list) {
    const v = f(s);
    if (v !== null && v > value) [value, t] = [v, s.t];
  }
  return { value, t };
};

const fmt = (x: number, digits = 3): string => x.toFixed(digits);

// Cases the current sub-solves fail, keyed by invariant, each with the pipeline step expected to fix it.
const all = (drill: string): ReadonlyArray<string> => INTENSITIES.map((i) => `${drill} ${i}`);
const KNOWN: Readonly<Record<string, { readonly step: string; readonly cases: ReadonlyArray<string> }>> = {
  'joints stay within the boot and the head within its cap': { step: 'step 2: bounded solve with barriers; cruising: step 6, invariants on q', cases: ['regular-powder gentle', ...all('turns-on-the-tops'), ...all('regular-cruising')] },
  'no ski edge sinks into the snow': { step: 'step 3: contact inequalities', cases: CASES.map(([d, i]) => `${d} ${i}`) },
  'the boots never intersect': { step: 'step 3: boot capsules', cases: ['regular-carving moderate', 'regular-carving dynamic', ...all('regular-moguls'), 'regular-steeps moderate', 'regular-steeps dynamic', ...all('regular-powder'), ...all('turns-on-the-tops'), ...all('round-line'), ...all('closed-stance-short-turns'), 'dolphin-turns dynamic'] },
  'the mass sits on the resultant through the pressure centre': { step: 'step 3: force-line balance; cruising: step 6, invariants on q', cases: [...all('stork-turns'), ...all('regular-cruising'), 'regular-carving dynamic', 'regular-steeps moderate', 'regular-steeps dynamic'] },
  'the outside ski touches the snow': { step: 'step 3: contact inequalities', cases: [...all('regular-moguls')] },
  'the seam is no rougher than the interior': { step: 'step 2: cycle solve with mirror boundary', cases: [...all('stork-turns'), ...all('regular-cruising'), ...all('regular-carving'), ...all('regular-short-turns'), ...all('regular-steeps'), ...all('regular-powder'), ...all('turns-on-the-tops'), ...all('round-line'), ...all('closed-stance-short-turns'), ...all('dolphin-turns')] },
  'the turn ends on the mirror of its start': { step: 'step 2: mirror boundary', cases: [...all('regular-powder')] },
};
const check = (invariant: string, body: (drill: string, i: Intensity) => void): void => {
  describe(invariant, () => {
    for (const [drill, i] of CASES) {
      const known = KNOWN[invariant];
      const step = known?.cases.includes(`${drill} ${i}`) ? known.step : undefined;
      failsUntil(step ?? '', step !== undefined)(`${drill} ${i}`, () => body(drill, i));
    }
  });
};

describe('invariants', () => {
  check('no ski edge sinks into the snow', (drill, i) => {
    const w = worst(samples(drill, i), (s) => -Math.min(...SIDES.map((side) => lowest(s, side))));
    assert.isAtMost(w.value, PENETRATION, `sinks ${fmt(w.value)} m at t=${fmt(w.t)}`);
  });

  check('the outside ski touches the snow', (drill, i) => {
    const w = worst(samples(drill, i), (s) => (airborne(s) ? null : lowest(s, BodySide.Right)));
    assert.isAtMost(w.value, CONTACT, `floats ${fmt(w.value)} m at t=${fmt(w.t)}`);
  });

  check('a carved outside edge holds the resultant', (drill, i) => {
    // Edge at least the resultant's tilt less the friction angle, or the carve slides out; skidded drills are exempt.
    const s = scenarioOf(drill, i);
    if (!CARVED.has(drill) || s === null) return;
    const w = worst(samples(drill, i), (x) => Math.abs(turnForcesAt(s, x.t).tilt) * DEG - FRICTION - outsideEdge(x));
    assert.isAtMost(w.value, 0, `edge short of tilt - ${fmt(FRICTION, 1)} by ${fmt(w.value, 1)} deg at t=${fmt(w.t)}`);
  });

  check('joints stay within the boot and the head within its cap', (drill, i) => {
    // TODO(step 1): anatomical hip, knee, spine and shoulder ranges from the skeleton's sourced limit table.
    for (const s of samples(drill, i)) {
      for (const side of SIDES) {
        const name = side === BodySide.Right ? 'right' : 'left';
        const ski = s.world[skiIndex(side)] ?? identity();
        // Ankle to knee: the boot hangs at the ankle, the shin from the knee.
        const d = sub(at(s.world, `${name}-shin`), at(s.world, `${name}-boot`));
        const pitch = Math.atan2(dot(d, axis(ski, [0, 0, 1])), dot(d, axis(ski, [0, 1, 0])));
        assert.isAtLeast(pitch, minShinAngle(EQUIPMENT) - 1e-3, `${name} shin stands up past the cuff at t=${fmt(s.t)}`);
        assert.isAtLeast(kneeFlex(side === BodySide.Right ? s.pose.outside : s.pose.inside), -1e-3, `${name} knee hyperextends at t=${fmt(s.t)}`);
      }
      assert.isAtMost(Math.abs(s.pose.headYaw), HEAD_LIMIT + 1e-3, `head yaw ${fmt(s.pose.headYaw * DEG, 1)} deg at t=${fmt(s.t)}`);
    }
  });

  check('the mass sits on the resultant through the pressure centre', (drill, i) => {
    // Pressure centre between the skis' bearing edges by the solver's outside share; the lateral plane is across the outside ski.
    const sc = scenarioOf(drill, i);
    if (sc === null) return;
    const w = worst(samples(drill, i), (s) => {
      const tilt = turnForcesAt(sc, s.t).tilt * DEG;
      if (airborne(s) || Math.abs(tilt) < SETTLED) return null;
      const share = outsideWeight(s.pose.lean);
      const [r, l] = [contact(s, BodySide.Right), contact(s, BodySide.Left)];
      const mix = (k: 0 | 1 | 2): number => share * r[k] + (1 - share) * l[k];
      const pc: Vec3 = [mix(0), mix(1), mix(2)];
      const v = sub(s.ride.com, pc);
      const along = axis(s.world[skiIndex(BodySide.Right)] ?? identity(), [0, 0, 1]);
      const across: Vec3 = [along[2], 0, -along[0]];
      const n = Math.hypot(across[0], across[2]);
      return Math.abs(Math.atan2(dot(v, across) / n, v[1]) * DEG - tilt);
    });
    if (w.value === -Infinity) return;
    assert.isAtMost(w.value, FORCE_LINE, `off the resultant by ${fmt(w.value, 1)} deg at t=${fmt(w.t)}`);
  });

  check('the boots never intersect', (drill, i) => {
    // Gear-fit boot as a sole capsule heel to toe and a cuff capsule ankle to cuff top, lateral radii; inferred shapes.
    const fit = CAPSULE_BOOT;
    const solePath = (m: Mat4): readonly [Vec3, Vec3] => [
      transformPoint(m, [fit.centreX, fit.sole + fit.halfWidth, fit.heel + fit.halfWidth]),
      transformPoint(m, [fit.centreX, fit.sole + fit.halfWidth, fit.toe - fit.halfWidth]),
    ];
    const cuffPath = (m: Mat4): readonly [Vec3, Vec3] => [transformPoint(m, [fit.cuffX, 0, fit.cuffZ]), transformPoint(m, [fit.cuffX, fit.cuffTop, fit.cuffZ])];
    const w = worst(samples(drill, i), (s) => {
      const [r, l] = [s.world[segmentIndex('right-boot')] ?? identity(), s.world[segmentIndex('left-boot')] ?? identity()];
      const parts = [
        [solePath, fit.halfWidth],
        [cuffPath, fit.cuffRx],
      ] as const;
      let overlap = -Infinity;
      for (const [pa, ra] of parts)
        for (const [pb, rb] of parts) overlap = Math.max(overlap, ra + rb - segmentDistance(...pa(r), ...pb(l)));
      return overlap;
    });
    assert.isAtMost(w.value, 0, `boots overlap ${fmt(w.value)} m at t=${fmt(w.t)}`);
  });

  check('the turn ends on the mirror of its start', (drill, i) => {
    const def = POSE_DEFINITIONS[drill];
    if (def === undefined) throw new Error(drill);
    const sc = drillScenarios(drill)[i];
    const s = surfaceFor(drill, i);
    const end = poseToChannels(solvePose(def, 1 - 1e-6, sc, s));
    const start = poseToChannels(mirrorPose(solvePose(def, 0, sc, s)));
    const w = Math.max(...end.map((v, k) => Math.abs(v - (start[k] ?? NaN))));
    assert.isAtMost(w, 1e-3, `jumps ${fmt(w, 4)} at the seam`);
  });

  check('the seam is no rougher than the interior', (drill, i) => {
    // Across the mirrored seam: no step (first differences within the interior's largest, plus 10% for a fastest
    // crossing sampled at 1/n; inferred) and no kink (second differences within the interior's largest).
    const list = samples(drill, i);
    const ch = list.map((s) => poseToChannels(s.pose));
    const n = ch.length;
    const ext = [...ch, ...list.slice(0, 2).map((s) => poseToChannels(mirrorPose(s.pose)))];
    const d1 = (k: number, j: number): number => Math.abs((ext[k + 1]?.[j] ?? 0) - (ext[k]?.[j] ?? 0));
    const d2 = (k: number, j: number): number => Math.abs((ext[k + 1]?.[j] ?? 0) - 2 * (ext[k]?.[j] ?? 0) + (ext[k - 1]?.[j] ?? 0));
    const eps = 4 * TABLE_SCALE;
    const bad: string[] = [];
    for (let j = 0; j < (ch[0]?.length ?? 0); j++) {
      const in1 = Math.max(...Array.from({ length: n - 2 }, (_, k) => d1(k, j)));
      const in2 = Math.max(...Array.from({ length: n - 3 }, (_, k) => d2(k + 1, j)));
      const s1 = d1(n - 1, j);
      const s2 = Math.max(d2(n - 1, j), d2(n, j));
      if (s1 > 1.1 * in1 + eps) bad.push(`${POSE_CHANNELS[j]} d1 ${fmt(s1, 4)} > ${fmt(in1, 4)}`);
      if (s2 > in2 + eps) bad.push(`${POSE_CHANNELS[j]} d2 ${fmt(s2, 4)} > ${fmt(in2, 4)}`);
    }
    assert.isEmpty(bad, bad.join('; '));
  });
});

const clamp = (x: number): number => Math.min(1, Math.max(0, x));
/** Shortest distance between segments ab and cd. */
const segmentDistance = (a: Vec3, b: Vec3, c: Vec3, d: Vec3): number => {
  const [u, v, w] = [sub(b, a), sub(d, c), sub(a, c)];
  const [uu, uv, vv, uw, vw] = [dot(u, u), dot(u, v), dot(v, v), dot(u, w), dot(v, w)];
  const den = uu * vv - uv * uv;
  let s = den < 1e-12 ? 0 : clamp((uv * vw - vv * uw) / den);
  const t = clamp((uv * s + vw) / vv);
  s = clamp((uv * t - uw) / uu);
  const p = sub([a[0] + u[0] * s, a[1] + u[1] * s, a[2] + u[2] * s], [c[0] + v[0] * t, c[1] + v[1] * t, c[2] + v[2] * t]);
  return Math.hypot(...p);
};
