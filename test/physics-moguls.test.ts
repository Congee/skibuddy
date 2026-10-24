import { assert, describe, it } from 'vitest';
import { failsUntil } from './legacy';
import { INTENSITIES, Intensity } from '../src/content/schema';
import { MOGUL_KNEE_FOLD_DEG, MOGUL_KNEE_OPEN_DEG, MOGUL_LEAN_RATIO, MOGUL_SKI_SHARE, MOGUL_TRUNK_PITCH_DEG, REACH, alongOf, balanceAcross, bootTrackOf, edgeContactOf, edgeCurvatureOf, anklesOf, edgedContacts, harmonicSwing, leanRatioOf, leastBend, mogulMassOf, pivotOf, pressureOffsetOf, secondDiff } from '../src/physics/moguls';
import type { Bridge } from '../src/physics/moguls';
import { bendRadiusOf } from '../src/physics/ski-bend';
import { TurnKind, bridgeOf, mogulRideOf, taskFor } from '../src/physics/task';
import { contactGeometryOf, MOGUL_STANCE_M, mogulInsideShare, mogulLineFor, mogulTrackOf } from '../src/physics/turn';
import { EQUIPMENT } from '../src/viewer/equipment';
import { JOINT_LIMITS } from '../src/viewer/joint-limits';
import { forward, skiFrame, value } from '../src/viewer/motion/fk';
import { centreOfMassOf, trunkPitchOf } from '../src/viewer/motion/turn';
import { COORDINATES, Side } from '../src/viewer/skeleton';
import { trackX, zipperField } from '../src/physics/zipper';
import { REFERENCE_SKIER, skiEnds } from '../src/viewer/skier';

const N = 720;
const G = 9.81;
const DEG = Math.PI / 180;
const GEOMETRY = contactGeometryOf(taskFor(TurnKind.Moguls, Intensity.Dynamic));
const wave = (amp: number, cycles: number): Float64Array => Float64Array.from({ length: N }, (_, i) => amp * Math.cos((2 * Math.PI * cycles * i) / N));

describe('mogul absorption (motion-model §4.8)', () => {
  it('keeps the mass inside the reach band', () => {
    const snow = wave(0.4, 1);
    const { height } = leastBend(Float64Array.from(snow, (s) => s + 0.67), Float64Array.from(snow, (s) => s + 0.94));
    height.forEach((z, i) => {
      assert.isAtLeast(z - (snow[i] ?? 0), 0.67 - 1e-9, `${i}`);
      assert.isAtMost(z - (snow[i] ?? 0), 0.94 + 1e-9, `${i}`);
    });
  });
  it('rides level, the load cos θ, where the reach takes the whole bump', () => {
    const m = mogulMassOf(wave(0.1, 1), new Float64Array(N), 0.5, 0.4);
    secondDiff(m.height, 0.5 / N, 1).forEach((a) => assert.approximately(Math.cos(0.4) + a / G, Math.cos(0.4), 1e-6));
  });
  it('rises and falls by less than the snow', () => {
    const snow = wave(0.4, 1);
    const { height } = leastBend(Float64Array.from(snow, (s) => s + 0.67), Float64Array.from(snow, (s) => s + 0.94));
    assert.isBelow(Math.max(...height) - Math.min(...height), Math.max(...snow) - Math.min(...snow));
  });
  failsUntil('step: moguls rebuild')("never asks the snow to pull, and keeps the leg h / cos λ in reach over the boot's track, on every cell of the field", () => {
    for (const i of INTENSITIES) {
      const m = mogulRideOf(taskFor(TurnKind.Moguls, i));
      assert.isTrue(m.absorption.ridable, i);
      m.support.forEach((s, k) => assert.isAtLeast(s, -1e-6, `${i} ${k}`));
      m.clearance.forEach((h, k) => {
        const leg = h / Math.cos(m.lean[k] ?? 0);
        assert.isAtLeast(leg, REACH[0] - 1e-9, `${i} ${k}`);
        assert.isAtMost(leg, REACH[1] + 1e-9, `${i} ${k}`);
      });
    }
  });
  failsUntil('step: moguls rebuild')('settles the lean with the reach and the bend on every cell of the field', () => {
    for (const i of INTENSITIES) {
      const m = mogulRideOf(taskFor(TurnKind.Moguls, i));
      assert.isTrue(m.leanSettled, i);
      assert.isBelow(m.leanChange, 1e-8, i);
    }
  });
  it('is infeasible, not softened, where the fall is too slow for the bump', () => {
    const snow = wave(0.4, 1);
    const fast = leastBend(Float64Array.from(snow, (s) => s + 0.7), Float64Array.from(snow, (s) => s + 0.94), G * (0.3 / N) ** 2);
    assert.isFalse(fast.ridable);
    assert.isAbove(fast.short, 0);
  });
});

describe('mogul balance across (linear inverted pendulum)', () => {
  const T = 0.5;
  const h = 0.8;
  const support = G * Math.cos(0.4);
  const ski = Float64Array.from({ length: N }, (_, i) => -0.77 * Math.sin((Math.PI * i) / N));
  const x = balanceAcross(ski, new Float64Array(N).fill(h), new Float64Array(N).fill(support), T / N);
  const a = h / support;
  it('solves x_ski = x − h ẍ / (g cos θ + z̈) to 1e-9', () => {
    const acc = secondDiff(x, T / N, -1);
    x.forEach((v, i) => assert.approximately(v - a * (acc[i] ?? 0), ski[i] ?? 0, 1e-9));
  });
  it('runs straighter than the skis by 1 + h ω² / g on a sinusoidal track', () => {
    const w = Math.PI / T;
    assert.approximately(Math.max(...x.map(Math.abs)) / 0.77, 1 / (1 + (h * w * w) / support), 1e-4);
  });
  it('holds h ẍ = s (x − x_ski) to 1e-9 on the dynamic cell, the mass flying straight where the snow holds nil', () => {
    const task = taskFor(TurnKind.Moguls, Intensity.Dynamic);
    const track = mogulTrackOf(task);
    const period = task.bumpSpacingM / task.speedMps;
    const m = mogulMassOf(track.height, track.across, period, task.slopeDeg * DEG, REACH, bridgeOf(task));
    assert.isAbove(m.bridged, 0);
    m.across.forEach((v, i) => {
      const s = Math.max(0, m.support[i] ?? 0);
      assert.isAtMost(Math.abs((m.clearance[i] ?? 0) * (m.acrossAccel[i] ?? 0) - s * (v - (track.across[i] ?? 0))), 1e-9, `${i}`);
    });
  });
  it('has ẍ = 0 where the support is nil', () => {
    const s = Float64Array.from({ length: N }, (_, i) => (i % 90 < 30 ? 0 : support));
    const y = balanceAcross(ski, new Float64Array(N).fill(h), s, T / N);
    const acc = secondDiff(y, T / N, -1);
    s.forEach((si, i) => {
      if (si === 0) assert.approximately(acc[i] ?? 0, 0, 1e-6, `${i}`);
    });
  });
});

const index = (name: string): number => COORDINATES.findIndex((c) => c.name === name);
// The moguls prior's means (scripts/prior/build.ts 'moguls-elite-ranges' and its neutral spine), constant over the turn.
const SPINE = { lumbar_flexion: 15, thoracic_flexion: 5 };
const pose = (ankle: number, knee: number, hip: number): number[] => {
  const q = Array.from({ length: COORDINATES.length }, () => 0);
  for (const [k, v] of Object.entries(SPINE)) q[index(k)] = v * DEG;
  for (const s of [Side.Right, Side.Left]) {
    q[index(`ankle_dorsiflexion.${s}`)] = ankle * DEG;
    q[index(`knee_flexion.${s}`)] = knee * DEG;
    q[index(`hip_flexion.${s}`)] = hip * DEG;
  }
  return q;
};
// Mass over the ski base along its normal and along the ski from the mount, metres; trunk pitch, degrees.
const measure = (q: number[]): readonly [number, number, number] => {
  const w = forward(q);
  const c = centreOfMassOf(w).map(value);
  const f = skiFrame(w, Side.Right);
  const [R, p] = [f.R.map(value), f.p.map(value)];
  const d = [0, 1, 2].map((k) => (c[k] ?? 0) - (p[k] ?? 0));
  const along = (j: number): number => (R[j] ?? 0) * (d[0] ?? 0) + (R[3 + j] ?? 0) * (d[1] ?? 0) + (R[6 + j] ?? 0) * (d[2] ?? 0);
  return [along(1) + EQUIPMENT.skiThickness, along(2), value(trunkPitchOf(w)) / DEG];
};

// Ankle and hip that hold the trunk pitch and the mass over the mount at a knee; Newton on finite differences.
const posture = (knee: number): readonly [number, number, number] => {
  let [a, h] = [10, 60];
  const r = (ankle: number, hip: number): readonly [number, number] => {
    const [, along, pitch] = measure(pose(ankle, knee, hip));
    return [pitch - MOGUL_TRUNK_PITCH_DEG, along];
  };
  for (let k = 0; k < 20; k++) {
    const [r1, r2] = r(a, h);
    const [a1, a2] = r(a + 1e-4, h);
    const [b1, b2] = r(a, h + 1e-4);
    const [j11, j12, j21, j22] = [(a1 - r1) / 1e-4, (b1 - r1) / 1e-4, (a2 - r2) / 1e-4, (b2 - r2) / 1e-4];
    const det = j11 * j22 - j12 * j21;
    [a, h] = [a - (j22 * r1 - j12 * r2) / det, h - (j11 * r2 - j21 * r1) / det];
  }
  return [a, h, measure(pose(a, knee, h))[0]];
};
describe("the legs' reach from the skeleton", () => {
  it("pitches the trunk as the moguls prior's means do", () => {
    assert.approximately(measure(pose(27.5, 70, 56.5))[2], MOGUL_TRUNK_PITCH_DEG, 0.05);
  });
  it('folds and opens to REACH with the mass over the mount, the hip inside its limits', () => {
    const hip = JOINT_LIMITS['hip_flexion.R'];
    for (const [knee, height] of [
      [MOGUL_KNEE_FOLD_DEG, REACH[0]],
      [MOGUL_KNEE_OPEN_DEG, REACH[1]],
    ] as const) {
      const [, h, z] = posture(knee);
      assert.approximately(z, height, 1e-3, `knee ${knee}`);
      assert.isAtLeast(h * DEG, hip?.lower.value ?? 0, `knee ${knee}`);
      assert.isAtMost(h * DEG, hip?.upper.value ?? 0, `knee ${knee}`);
    }
  });
});

// A cosine of one spacing along the track, crest at 0 and trough mid-way, sampled evenly.
const SPACING = 3.5;
const cosine = (amp: number): { readonly snow: Float64Array; readonly along: Float64Array } => ({
  snow: Float64Array.from({ length: N }, (_, i) => amp * Math.cos((2 * Math.PI * i) / N)),
  along: Float64Array.from({ length: N }, (_, i) => (SPACING * i) / N),
});
const ENDS = skiEnds(taskFor(TurnKind.Moguls, Intensity.Dynamic).ski);
const bridge = (along: Float64Array, length: number): Bridge => ({ along, length, ...ENDS, massKg: REFERENCE_SKIER.mass });
// The snow `s` metres along a track repeating every `length`, linear between samples.
const snowAt = (snow: Float64Array, along: Float64Array, length: number, s: number): number => {
  const x = ((s % length) + length) % length;
  let i = 0;
  while (i + 1 < N && (along[i + 1] ?? 0) <= x) i++;
  const [a, b] = [along[i] ?? 0, i + 1 < N ? (along[i + 1] ?? 0) : length];
  return (snow[i] ?? 0) + (((snow[(i + 1) % N] ?? 0) - (snow[i] ?? 0)) * (x - a)) / (b - a);
};
const uniform = (r: number): Float64Array => new Float64Array(N).fill(r);

describe("the boot's track under the bent ski (motion-model §4.8, P3b)", () => {
  it('rides the snow on a flat track', () => {
    const { along } = cosine(0);
    const flat = new Float64Array(N).fill(0.3);
    bootTrackOf(flat, bridge(along, SPACING), uniform(8)).forEach((z, i) => assert.approximately(z, 0.3, 1e-12, `${i}`));
  });
  it('sits on a convex crest, and spans the trough above its bottom and at or below the snow at the ends', () => {
    const { snow, along } = cosine(0.2);
    const boot = bootTrackOf(snow, bridge(along, SPACING), uniform(8));
    assert.approximately(boot[0] ?? 0, snow[0] ?? 0, 1e-12);
    const mid = N / 2;
    assert.isAbove((boot[mid] ?? 0) - (snow[mid] ?? 0), 0.05);
    const s = along[mid] ?? 0;
    assert.isAtMost(boot[mid] ?? 0, Math.max(snowAt(snow, along, SPACING, s + ENDS.tail), snowAt(snow, along, SPACING, s + ENDS.tip)) + 1e-12);
  });
  it('never sinks under the snow under the boot, and a stiffer ski never lowers it, on the dynamic track', () => {
    const task = taskFor(TurnKind.Moguls, Intensity.Dynamic);
    const track = mogulTrackOf(task);
    const b = bridgeOf(task);
    for (const r of [1.5, 4, 8, 30, 1000]) {
      const soft = bootTrackOf(track.height, b, uniform(r));
      const stiff = bootTrackOf(track.height, b, uniform(2 * r));
      soft.forEach((z, i) => {
        assert.isAtLeast(z, (track.height[i] ?? 0) - 1e-12, `R ${r} ${i}`);
        assert.isAtLeast(stiff[i] ?? 0, z - 1e-12, `R ${r} ${i}`);
      });
    }
  });
  failsUntil('step: moguls rebuild')('spans the dynamic trough on the ends of the ski', () => {
    const task = taskFor(TurnKind.Moguls, Intensity.Dynamic);
    const track = mogulTrackOf(task);
    const { along, length } = alongOf(track.pace);
    const m = mogulRideOf(task);
    const k = Math.round(track.trough * N) % N;
    const s = along[k] ?? 0;
    assert.isAbove((m.boot[k] ?? 0) - (track.height[k] ?? 0), 0.05);
    assert.isAtMost(m.boot[k] ?? 0, Math.max(snowAt(track.height, along, length, s + ENDS.tail), snowAt(track.height, along, length, s + ENDS.tip)) + 1e-12);
    assert.approximately(length, (track.pace.reduce((a, p) => a + p, 0)) / N, 1e-9);
  });
  failsUntil('step: moguls rebuild')('settles the load and the bend together on every cell: the boot under the bend its own load sets', () => {
    for (const i of INTENSITIES) {
      const task = taskFor(TurnKind.Moguls, i);
      const m = mogulRideOf(task);
      assert.isTrue(m.settled, i);
      assert.isBelow(m.change, 1e-9, i);
      const track = mogulTrackOf(task);
      // The planned edge is the lean: a skidding ski sits at the slip threshold.
      const margin = new Float64Array(m.support.length);
      // Its share of the resultant square to the base, s cos(ε − λ) / cos λ, on the edge ε = λ + margin.
      const own = Float64Array.from(m.support, (f, k) => bendRadiusOf(((Math.max(0, f) * Math.cos(margin[k] ?? 0)) / Math.cos(m.lean[k] ?? 0)) * MOGUL_SKI_SHARE * REFERENCE_SKIER.mass));
      const edge = Float64Array.from(m.lean, (l, k) => l + (margin[k] ?? 0));
      bootTrackOf(track.height, bridgeOf(task), own, { edge, sidecutM: task.ski.sidecutRadius }).forEach((z, k) => assert.approximately(z, m.boot[k] ?? 0, 1e-8, `${i} ${k}`));
    }
  });
});

const sweep = (f: (edge: number, radius: number) => void): void => {
  for (const deg of [0, 5, 15, 30, 45, 60, 70]) for (const radius of [3, 6, 12, 25, 50, 100, 400]) f(deg * DEG, radius);
};

describe("the edge's contact with the snow under it (edgeContactOf)", () => {
  const SIDECUT = taskFor(TurnKind.Moguls, Intensity.Dynamic).ski.sidecutRadius;
  const U = Array.from({ length: 65 }, (_, j) => ENDS.tail + ((ENDS.tip - ENDS.tail) * j) / 64);
  U.splice(U.findIndex((u) => u > 0), 0, 0);
  it('rests the waist at the least concave hull of z − c u² / 2 over every chord, the edge on or above the snow', () => {
    sweep((edge, radius) => {
      const c = edgeCurvatureOf(radius, edge, SIDECUT);
      for (let shift = 0; shift < SPACING; shift += SPACING / 16) {
        const z = U.map((u) => 0.08 * Math.cos((2 * Math.PI * (u + shift)) / SPACING) + 0.2 * u);
        const f = U.map((u, j) => (z[j] ?? 0) - (c * u * u) / 2);
        let hull = -Infinity;
        U.forEach((a, i) => U.forEach((b, j) => (a <= 0 && b >= 0 ? (hull = Math.max(hull, a === b ? (f[i] ?? 0) : (f[i] ?? 0) + (((f[j] ?? 0) - (f[i] ?? 0)) * -a) / (b - a))) : 0)));
        const at = `${edge} ${radius} ${shift}`;
        const k = edgeContactOf(U, z, c);
        assert.closeTo(k.rest, hull, 1e-12, at);
        const [a, b] = k.touch;
        const pitch = k.pressed ? 0 : (k.rest - (f[U.indexOf(a)] ?? 0)) / -a;
        if (k.pressed) assert.closeTo(k.rest, z[U.indexOf(0)] ?? 0, 1e-12, at);
        else U.forEach((u, j) => assert.isAtLeast(k.rest + pitch * u + (c * u * u) / 2 - (z[j] ?? 0), -1e-12, `${at} ${u}`));
        assert.isAtMost(a, 0, at);
        assert.isAtLeast(b, 0, at);
      }
    });
  });
  it("on a plane presses the waist where the bend's lift along the snow normal reaches the sidecut's, 1/R ≥ tan ε / R_sc, else bridges tip and tail (M4)", () => {
    sweep((edge, radius) => {
      const k = edgeContactOf(
        U,
        U.map((u) => 0.3 * u),
        edgeCurvatureOf(radius, edge, SIDECUT),
      );
      assert.strictEqual(k.pressed, 1 / radius >= Math.tan(edge) / SIDECUT, `${edge} ${radius}`);
      if (!k.pressed) assert.deepStrictEqual(k.touch, [U[0] ?? 0, U.at(-1) ?? 0]);
    });
  });
  it("flat, is P3b's hull: the boot's track unchanged by a zero lift", () => {
    const { snow, along } = cosine(0.2);
    assert.deepStrictEqual(bootTrackOf(snow, bridge(along, SPACING), uniform(8), { edge: new Float64Array(N), sidecutM: SIDECUT }), bootTrackOf(snow, bridge(along, SPACING), uniform(8)));
  });
});

describe("each cell's line from the clips' mass lean (P7a)", () => {
  const cells = INTENSITIES.map((i) => {
    const task = taskFor(TurnKind.Moguls, i);
    const line = mogulLineFor(task);
    return { i, task, line, course: { spacing: task.bumpSpacingM, relief: task.bumpHeightM, swing: line.swing } };
  });
  it("takes the clips' mean mass lean ratio, the same for every cell (M2: bumpA, bumpB, jdsB)", () => {
    assert.approximately(MOGUL_LEAN_RATIO, (0.3724 + 0.3648 + 0.4053) / 3, 1e-12);
  });
  failsUntil('step: moguls rebuild')("leans each cell's mass line by r to 1e-3, the swing settled", () => {
    for (const { i, line } of cells) {
      assert.isTrue(line.settled, i);
      assert.approximately(leanRatioOf(line.ride.mass, line.ride.track.across), MOGUL_LEAN_RATIO, 1e-3, i);
    }
  });
  it("swings the track the cell's own amplitude, slower cells wider", () => {
    for (const { i, course, line } of cells) {
      const most = Math.max(...Array.from({ length: 1001 }, (_, k) => Math.abs(trackX(course, (k / 1000) * course.spacing))));
      assert.approximately(most, line.swing, 1e-9, i);
      assert.isAtMost(Math.max(...line.ride.track.across.map(Math.abs)), line.swing + 1e-12, i);
    }
    const [g, m, d] = cells.map((c) => c.line.swing);
    assert.isAbove(g ?? 0, m ?? 0);
    assert.isAbove(m ?? 0, d ?? 0);
  });
  failsUntil('step: moguls rebuild')('holds the pendulum h ẍ = s (x − x_P) about the pressure centre on every sample to 1e-9', () => {
    for (const { i, task, line } of cells) {
      const { mass, track } = line.ride;
      const n = mass.across.length;
      const dt = task.bumpSpacingM / task.speedMps / n;
      const margin = new Float64Array(n);
      const pivot = pivotOf(track.across, mass.lean, margin, { insideShare: mogulInsideShare(task, n), stanceM: MOGUL_STANCE_M, geometry: contactGeometryOf(task) });
      mass.pivot.forEach((p, k) => assert.approximately(p, pivot[k] ?? 0, 1e-9, `${i} ${k}`));
      secondDiff(mass.across, dt, -1).forEach((a, k) => {
        const residual = (mass.clearance[k] ?? 0) * a - Math.max(0, mass.support[k] ?? 0) * ((mass.across[k] ?? 0) - (mass.pivot[k] ?? 0));
        assert.isAtMost(Math.abs(residual), 1e-9, `${i} ${k}`);
      });
    }
  });
  it('puts the pressure centre on the contacts\' mid where the inside share is ½, toward the outside ski as it falls', () => {
    const c = [-0.07, 0.06] as const;
    const d = [0.5, 0.25, 0.4, 0.75].map((s) => pressureOffsetOf(c, s));
    assert.strictEqual(d[0], 0);
    assert.approximately(d[1] ?? 0, 0.13 / 4, 1e-15);
    assert.isAbove(d[2] ?? 0, 0);
    assert.isBelow(d[3] ?? 0, 0);
    for (const e of [0, 0.1, 0.7]) assert.strictEqual(pressureOffsetOf(edgedContacts([-0.07, 0.07], [e, e], GEOMETRY), 0.5), 0, `${e}`);
  });
  it('rolls each contact about its ankle: mirror-symmetric, flat on the ankle, at equal edges both by one offset', () => {
    assert.deepEqual(edgedContacts([-0.08, 0.07], [0, 0], GEOMETRY), [-0.08, 0.07]);
    for (const [eo, ei] of [[0.4, 0.3], [0.03, -0.02], [-0.6, 0.1], [0.7, 0.7]] as const) {
      const [co, ci] = edgedContacts([-0.08, 0.07], [eo, ei], GEOMETRY);
      const [mo, mi] = edgedContacts([0.08, -0.07], [-eo, -ei], GEOMETRY);
      assert.approximately(mo, -co, 1e-15);
      assert.approximately(mi, -ci, 1e-15);
    }
    for (const e of [0.2, 0.7]) {
      const [co, ci] = edgedContacts([-0.08, 0.07], [e, e], GEOMETRY);
      const common = GEOMETRY.half * Math.cos(e) - GEOMETRY.stand * Math.sin(e);
      assert.approximately(co + 0.08, common, 1e-15);
      assert.approximately(ci - 0.07, common, 1e-15);
    }
  });
  it('stands the ankles so their bases sit the stance goal apart along the outside ski\'s base', () => {
    for (const [eo, ei] of [[0, 0], [0.7, 0.6], [0.4, 0.45]] as const) {
      const [yo, yi] = anklesOf(0.02, [eo, ei], MOGUL_STANCE_M, GEOMETRY);
      assert.approximately((yo + yi) / 2, 0.02, 1e-15);
      const gap = yi - GEOMETRY.stand * Math.sin(ei) - (yo - GEOMETRY.stand * Math.sin(eo));
      assert.approximately(Math.cos(eo) * gap, MOGUL_STANCE_M, 1e-15);
    }
  });
  it('mirrors the field onto the next turn a spacing down', () => {
    for (const { course } of cells)
      for (const x of [-1.3, -0.4, 0, 0.25, 0.9])
        for (const z of [0, 0.3, 1.1, 1.75, 2.9]) {
          const [p, q] = [zipperField(course, x, z), zipperField(course, -x, z + course.spacing)];
          assert.approximately(q[0], p[0], 1e-9);
          assert.approximately(q[1], -p[1], 1e-9);
          assert.approximately(q[2], p[2], 1e-9);
        }
  });
  it("tops a mogul at each cell's switch and drops to the trough mid-turn (fis-freestyle-judging-2025 p26–28)", () => {
    for (const { i, line } of cells) {
      const { crest, trough } = line.ride.track;
      // Within a 48th of the turn, as the viewer's switch test.
      assert.isAtMost(Math.min(crest, 1 - crest), 1 / 48, i);
      assert.approximately(trough, 0.5, 1 / 48, i);
    }
  });
  it('keeps D = a_s h ω² / (s + h ω²) under the pendulum on a sinusoid with constant s, to 1e-6, so harmonicSwing inverts it', () => {
    const [n, T, h, s] = [8192, 0.37, 0.55, G * Math.cos(26 * DEG)];
    const swing = harmonicSwing(MOGUL_LEAN_RATIO, h, s, T);
    const ski = Float64Array.from({ length: n }, (_, i) => -swing * Math.sin((Math.PI * i) / n));
    const x = balanceAcross(ski, new Float64Array(n).fill(h), new Float64Array(n).fill(s), T / n);
    const w2 = (Math.PI / T) ** 2;
    const d = Math.max(...Array.from(x, (v, i) => Math.abs((ski[i] ?? 0) - v)));
    assert.approximately(d, (swing * h * w2) / (s + h * w2), 1e-6);
    assert.approximately(d / h, MOGUL_LEAN_RATIO, 1e-6);
  });
});
