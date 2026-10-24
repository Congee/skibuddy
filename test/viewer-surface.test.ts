import { assert, describe, it } from '@effect/vitest';
import { Intensity } from '../src/content/schema';
import { RegularTurn } from '../src/viewer/poses/regular-turn';
import type { Surface } from '../src/viewer/surface';
import {
  fieldMesh,
  MogulLine,
  heightAt,
  normalAt,
  skiRest,
  pathAt,
  skisAt,
  supportAt,
  surfaceFor,
  SurfaceKind,
  trackRest,
  underFoot,
} from '../src/viewer/surface';
import { CLOSED_STANCE_POSE, TOPS_POSE, headingAt } from '../src/viewer/turn-heading';
import { mogulHeadingsAt } from '../src/viewer/pose-solver';
import { GLIDING_FRICTION, Snow } from '../src/physics/edge';
import { TurnKind, taskFor } from '../src/physics/task';
import { mogulLineFor, mogulTrackOf, turnProfile } from '../src/physics/turn';
import { bootTrackOf } from '../src/physics/moguls';
import { ZIPPER, bumpsField, lineHeading, scaleOf, trackX, zipperField } from '../src/physics/zipper';
import { skiGoal } from '../src/viewer/motion/turn';
import { realTurnSeconds } from '../src/viewer/turn-time';
import { failsUntil } from './legacy';

const close = (a: number, b: number, eps = 1e-9): void => assert.isBelow(Math.abs(a - b), eps, `${a} vs ${b}`);
const INTENSITIES = [Intensity.Gentle, Intensity.Moderate, Intensity.Dynamic] as const;
const moguls = surfaceFor(RegularTurn.Moguls, Intensity.Moderate);
const tops = surfaceFor(TOPS_POSE, Intensity.Moderate);
const powder = surfaceFor(RegularTurn.Powder, Intensity.Moderate);
const groomed = surfaceFor(RegularTurn.GS, Intensity.Moderate);
// The course's bumps without the rut, metres.
const bumps = (s: Surface, x: number, z: number): number => {
  const c = { spacing: s.spacing, relief: s.relief, swing: s.swing ?? 0 };
  return bumpsField(c, x, z)[0] * scaleOf(c);
};
const POINTS: ReadonlyArray<readonly [number, number]> = [
  [0, 0],
  [0.7, 1.3],
  [-1.9, 2.2],
  [3.1, -4.4],
  [-0.4, 7.8],
];

describe('surfaceFor', () => {
  it('puts mogul turns on moguls, powder on powder, the rest, closed stance too, on groomed snow', () => {
    assert.strictEqual(moguls.kind, SurfaceKind.Moguls);
    assert.strictEqual(moguls.line, MogulLine.Zipper);
    assert.strictEqual(tops.kind, SurfaceKind.Moguls);
    assert.strictEqual(tops.line, MogulLine.Tops);
    for (const i of INTENSITIES) assert.strictEqual(surfaceFor(CLOSED_STANCE_POSE, i).kind, SurfaceKind.Groomed, i);
    assert.strictEqual(powder.kind, SurfaceKind.Powder);
    assert.strictEqual(groomed.kind, SurfaceKind.Groomed);
  });

  it('grows the tops field and powder depth with intensity', () => {
    const relief = INTENSITIES.map((i) => surfaceFor(TOPS_POSE, i).relief);
    const depth = INTENSITIES.map((i) => surfaceFor(RegularTurn.Powder, i).depth);
    for (const xs of [relief, depth]) {
      assert.isAbove(xs[1] ?? 0, xs[0] ?? 0);
      assert.isAbove(xs[2] ?? 0, xs[1] ?? 0);
    }
    assert.strictEqual(moguls.depth, 0);
    assert.strictEqual(powder.relief, 0);
  });

  it('sizes the moguls cell\'s zipper by its task: the bumps\' relief down the line, the track cresting at the switch', () => {
    for (const i of INTENSITIES) {
      const task = taskFor(TurnKind.Moguls, i);
      const s = surfaceFor(RegularTurn.Moguls, i);
      assert.strictEqual(s.spacing, task.bumpSpacingM, i);
      assert.strictEqual(s.relief, task.bumpHeightM, i);
      close(bumps(s, 0, ZIPPER.crestAt * s.spacing) - bumps(s, 0, (0.5 + ZIPPER.crestAt) * s.spacing), task.bumpHeightM, 1e-12);
      // The rut follows each cell's own line, so the track's crest to trough is the cell's, not pinned to the relief.
      const h = Array.from({ length: 96 }, (_, k) => {
        const p = skisAt(s, k / 96);
        return heightAt(s, p.x, p.z);
      });
      assert.strictEqual(h.indexOf(Math.max(...h)), 0, `${i} crest at the switch`);
      assert.closeTo(h.indexOf(Math.min(...h)) / 96, 0.5, 2 / 96, `${i} trough mid-turn`);
    }
  });

  it('draws a groomed task\'s corridor as wide as its mass path swings', () => {
    for (const i of INTENSITIES) {
      const s = surfaceFor('regular-gs', i);
      const most = Math.max(...Array.from({ length: 257 }, (_, k) => Math.abs(pathAt(s, k / 256).x)));
      assert.closeTo(s.path.corridor / 2, most, 1e-2 * most, i);
    }
  });
});

describe('heightAt', () => {
  it('is flat on groomed snow', () => {
    for (const [x, z] of POINTS) {
      assert.strictEqual(heightAt(groomed, x, z), 0);
      assert.deepStrictEqual(normalAt(groomed, x, z), [0, 1, 0]);
    }
  });

  it('crests on the tops line at each switch and rides the saddle shoulder mid-turn', () => {
    close(heightAt(tops, 0, 0), tops.relief / 2);
    close(heightAt(tops, 0, tops.spacing), tops.relief / 2);
    // The field stays spaced for a 2 m corridor while the line swings wider over it.
    close(tops.spacing, 4.6, 0.01);
    const mid = pathAt(tops, 0.5);
    // Inferred: at least 0.4 of the relief up (campbell-rogan-2001).
    assert.isAtLeast(heightAt(tops, mid.x, mid.z), -0.1 * tops.relief);
    // The columns either side crest between the line's crests.
    close(heightAt(tops, tops.columns, tops.spacing / 2), tops.relief / 2);
    assert.strictEqual(tops.crest, 0);
    assert.strictEqual(tops.trough, 0.5);
  });

  it('repeats every turn down the fall line and is even across it, so the mirrored turn sees the same snow', () => {
    for (const s of [tops, powder])
      for (const [x, z] of POINTS) {
        close(heightAt(s, x, z + s.spacing), heightAt(s, x, z), 1e-9);
        close(heightAt(s, -x, z), heightAt(s, x, z), 1e-12);
      }
  });

  it('mirrors the zipper field a spacing down, so the next turn rides the same snow', () => {
    for (const i of INTENSITIES) {
      const s = surfaceFor(RegularTurn.Moguls, i);
      for (const [x, z] of POINTS) close(heightAt(s, -x, z + s.spacing), heightAt(s, x, z), 1e-9);
    }
  });

  failsUntil('step 6: moguls on a C1 surface', false)('tops a mogul at each switch and drops into the rut mid-turn (fis-freestyle-judging-2025 p26, p28)', () => {
    // p28: absorb up to the top, extend right after it, into the rut (p26) mid-turn.
    for (const i of INTENSITIES) {
      const s = surfaceFor(RegularTurn.Moguls, i);
      const base = Array.from({ length: 48 }, (_, k) => trackRest(s, k / 48, 1, 0.7).base);
      const [lo, hi] = [Math.min(...base), Math.max(...base)];
      const top = base.indexOf(hi);
      const floor = base.indexOf(lo);
      assert.isTrue(top <= 1 || top >= 47, `${i} top at ${top}/48`);
      assert.isTrue(floor >= 12 && floor <= 36, `${i} floor at ${floor}/48`);
      // Monotonic from the top down to the floor and up to the next top.
      const at = (k: number): number => base[(k + 48) % 48] ?? 0;
      const end = top > 1 ? top : top + 48;
      for (let k = (top > 1 ? top - 48 : top) + 1; k <= floor; k++) assert.isAtMost(at(k), at(k - 1), `${i} down the backside ${k}/48`);
      for (let k = floor + 1; k <= end; k++) assert.isAtLeast(at(k), at(k - 1), `${i} up the face ${k}/48`);
    }
  });

  it('lays one competition course at every intensity, a mogul every 3.5 m along the line', () => {
    for (const i of INTENSITIES) {
      const s = surfaceFor(RegularTurn.Moguls, i);
      close(s.spacing, moguls.spacing, 1e-9);
      assert.isAbove(s.spacing, 3.4, i);
      assert.isBelow(s.spacing, 3.6, i);
      assert.strictEqual(s.relief, taskFor(TurnKind.Moguls, i).bumpHeightM);
      assert.strictEqual(s.relief, moguls.relief, i);
      for (const [x, z] of POINTS) close(bumps(s, x, z), bumps(moguls, x, z), 1e-12);
    }
  });

  it('lines the zipper moguls a spacing apart, alternating a stagger either side, a relief over the trough between', () => {
    const s = moguls;
    // The highest snow near a point, by a coarse then fine grid search.
    const top = (x0: number, z0: number): readonly [number, number, number] => {
      let best: [number, number, number] = [x0, z0, -Infinity];
      for (const step of [0.02, 0.002]) {
        const [cx, cz] = best;
        for (let i = -20; i <= 20; i++)
          for (let j = -20; j <= 20; j++) {
            const x = (step === 0.02 ? x0 : cx) + i * step;
            const z = (step === 0.02 ? z0 : cz) + j * step;
            const h = heightAt(s, x, z);
            if (h > best[2]) best = [x, z, h];
          }
      }
      return best;
    };
    const here = top(0, 0.3);
    const next = top(0, s.spacing + 0.3);
    close(next[1] - here[1], s.spacing, 0.05);
    // Either side of the line, a few decimetres; inferred.
    assert.isAbove(here[0] * next[0], -0.25);
    assert.isBelow(here[0] * next[0], 0);
    close(heightAt(s, here[0], here[1] + 2 * s.spacing), here[2], 1e-9);
    // Crest over the trough: the derived relief (MOGUL_RELIEF_M, ridableReliefOf), not a measured height.
    close(here[2] - heightAt(s, 0, here[1] + s.spacing / 2), s.relief, 0.2);
  });

  it('lowers the zipper snow toward mid-turn and raises it again toward the switch', () => {
    // The highest snow at the switch, over the inner shoulder, the lowest in the bowl mid-turn (fis-freestyle-judging-2025 pp25-28).
    for (const i of INTENSITIES) {
      const s = surfaceFor(RegularTurn.Moguls, i);
      assert.isBelow(Math.min(s.crest, 1 - s.crest), 0.1, i);
      assert.isAbove(s.trough, 0.4, i);
      assert.isBelow(s.trough, 0.6, i);
    }
  });

  it('puts the powder top a depth over a flat packed base', () => {
    for (const i of INTENSITIES) {
      const s = surfaceFor(RegularTurn.Powder, i);
      for (const [x, z] of POINTS) {
        close(heightAt(s, x, z), s.depth, 0.031);
        assert.strictEqual(supportAt(s, x, z), 0);
      }
    }
  });

  it('draws the zipper physics/zipper.ts lays, and the physics times the moguls on the snow the skis ride', () => {
    const n = 720;
    for (const i of INTENSITIES) {
      const s = surfaceFor(RegularTurn.Moguls, i);
      const course = { spacing: s.spacing, relief: s.relief, swing: s.swing ?? 0 };
      for (const [x, z] of POINTS) assert.strictEqual(heightAt(s, x, z), zipperField(course, x, z)[0], i);
      const along = Array.from({ length: n }, (_, k) => {
        const { z } = pathAt(s, k / n);
        return heightAt(s, trackX(course, z), z);
      });
      const track = mogulTrackOf(taskFor(TurnKind.Moguls, i));
      along.forEach((h, k) => close(track.height[k] ?? NaN, h, 1e-5));
      // Within one sample of the height maximum along the skis' track.
      const top = along.indexOf(Math.max(...along)) / n;
      assert.isAtMost(Math.abs(track.crest - top), 1 / n, i);
    }
  });

  it('lets the skis ride the mogul top itself', () => {
    for (const [x, z] of POINTS) assert.strictEqual(supportAt(moguls, x, z), heightAt(moguls, x, z));
  });
});

describe('normalAt', () => {
  it('is a unit vector along the finite-difference gradient', () => {
    const h = 1e-5;
    for (const s of [moguls, tops, powder])
      for (const [x, z] of POINTS) {
        const n = normalAt(s, x, z);
        close(Math.hypot(...n), 1, 1e-12);
        const dx = (heightAt(s, x + h, z) - heightAt(s, x - h, z)) / (2 * h);
        const dz = (heightAt(s, x, z + h) - heightAt(s, x, z - h)) / (2 * h);
        close(n[0] / n[1], -dx, 1e-6);
        close(n[2] / n[1], -dz, 1e-6);
      }
  });
});

describe('pathAt', () => {
  it('joins the mirrored next turn without a lateral step, reaches the corridor edge mid-turn and ends a spacing down', () => {
    for (const s of [moguls, powder, groomed]) {
      const start = pathAt(s, 0);
      const end = pathAt(s, 1);
      close(start.z, 0);
      close(end.z, s.spacing, 1e-9);
      if (s.task !== null || s.mogul !== undefined) {
        close(start.x + end.x, 0, 1e-9);
        continue;
      }
      close(start.x, 0);
      const reach = Math.max(...Array.from({ length: 2001 }, (_, i) => Math.abs(pathAt(s, i / 2000).x)));
      close(reach, (s.path.feet ?? s.path.corridor) / 2, 1e-9);
      close(end.x, 0, 1e-9);
      close(pathAt(s, 0.5).track, 0, 1e-12);
    }
  });

  it('moves the moguls skis along their line at a steady speed', () => {
    const n = 200;
    for (let k = 0; k < n; k++) {
      const a = skisAt(moguls, k / n);
      const b = skisAt(moguls, (k + 1) / n);
      close(Math.hypot(b.x - a.x, b.z - a.z) * n, moguls.speed, 1e-3);
    }
  });
});

describe('moguls one path', () => {
  it("rides the root on the physics' mass path, the skis' track along the cell's line and their yaw the pivot's", () => {
    for (const i of INTENSITIES) {
      const s = surfaceFor(RegularTurn.Moguls, i);
      const task = taskFor(TurnKind.Moguls, i);
      const { swing, ride } = mogulLineFor(task);
      const n = ride.mass.across.length;
      assert.strictEqual(s.swing, swing, i);
      const course = { spacing: s.spacing, relief: s.relief, swing };
      for (let k = 0; k < n; k += 7) {
        const p = pathAt(s, k / n);
        close(p.x, ride.mass.across[k] ?? Number.NaN, 1e-9);
        close(p.z, ride.track.down[k] ?? Number.NaN, 1e-9);
        close(p.track, lineHeading(course, p.z), 1e-12);
        close(p.heading, headingAt(k / n, s.path), 1e-12);
        close(skisAt(s, k / n).x, trackX(course, p.z), 1e-12);
      }
    }
  });
  it('keys the moguls skis on the one attack: their yaw less the line is γ, along the line at the switch', () => {
    for (const i of INTENSITIES) {
      const s = surfaceFor(RegularTurn.Moguls, i);
      const p = turnProfile(taskFor(TurnKind.Moguls, i), Snow.HardGroomed);
      const n = p.attack.length;
      for (let k = 0; k < n; k += 5) {
        const at = pathAt(s, k / n);
        close(mogulHeadingsAt(s, k / n)?.skis ?? Number.NaN, headingAt(k / n, s.path), 1e-12);
        close(at.heading - at.track, (p.attack[k] ?? Number.NaN) * (Math.PI / 180), 1e-9);
      }
      // γ is near off at the switch, so the skis cross the fall line along the line, not flat in it.
      for (const t of [0, 1 - 1e-9]) assert.isBelow(Math.abs(headingAt(t, s.path) - pathAt(s, t).track), 0.5 * (Math.PI / 180), `${i} ${t}`);
    }
  });
});

describe('underFoot', () => {
  it('runs on into the mirrored next turn with no jump in place or height', () => {
    const e = 1e-6;
    for (const s of [moguls, powder])
      for (const local of [
        [0.1, 0.3],
        [-0.1, -0.8],
      ] as const) {
        const before = underFoot(s, 1 - e, local);
        // The same point on the skis in the next turn, a spacing down and drawn mirrored in x.
        const after = underFoot(s, e, local, true);
        close(-after.x, before.x, 1e-4);
        close(after.z + s.spacing, before.z, 1e-4);
        close(after.height, before.height, 1e-4);
        close(after.support, before.support, 1e-4);
      }
  });

  it('places a point along the skis ahead in their heading', () => {
    const t = 0.2;
    const p = pathAt(moguls, t);
    const tip = underFoot(moguls, t, [0, 1]);
    close(tip.x - p.x, Math.sin(p.heading));
    close(tip.z - p.z, Math.cos(p.heading));
    close(tip.height, heightAt(moguls, tip.x, tip.z));
  });
});

const along = (s: Surface, t: number, at: number): number => underFoot(s, t, [0.1, at]).support;

describe('skiRest', () => {

  it('lies flat on groomed snow and on the base under powder', () => {
    for (const s of [groomed, powder]) {
      const r = skiRest(s, 0.3, [0.1, 0], 0.85, 0.75);
      close(r.pitch, 0);
      close(r.base, 0);
    }
  });

  // thorwartl-2023's reference bend and the physics' moguls bend (P5); 0 straight.
  const CURVATURES = [0, 1 / 3.85, 1 / 2.3];
  const U = Array.from({ length: 33 }, (_, i) => -0.75 + (1.6 * i) / 32);

  it('keeps the bent base on or above the support at every sample, touching at the boot or at a point either side', () => {
    for (const c of CURVATURES)
      for (let k = 0; k < 24; k++) {
        const t = k / 24;
        const r = skiRest(moguls, t, [0.1, 0], 0.85, 0.75, c);
        const p = Math.tan(r.pitch);
        const gaps = U.map((u) => r.base + p * u + (c * u * u) / 2 - along(moguls, t, u));
        close(Math.min(...gaps), 0, 1e-9);
        const touching = U.filter((_, i) => (gaps[i] ?? 1) < 1e-9);
        // Bridged: one touch at or behind the boot, one at or ahead of it.
        if (!touching.includes(0)) assert.isTrue(touching.some((u) => u < 0) && touching.some((u) => u > 0), `t ${t} c ${c}`);
      }
  });

  it("rests the ski where the physics' boot track has it, on the same snow and bend", () => {
    const h = 1.6 / 32;
    // A window 3 m long round the boot, one turn of bootTrackOf's repeat.
    const n = Math.round(3 / h);
    const s0 = Math.floor(n / 2) * h - 1.5;
    for (const c of CURVATURES)
      for (const t of [0, 0.2, 0.45, 0.7]) {
        const snow = Float64Array.from({ length: n }, (_, j) => along(moguls, t, j * h - 1.5 - s0));
        const bridge = { along: Float64Array.from({ length: n }, (_, j) => j * h), length: n * h, tail: -0.75, tip: 0.85, massKg: 66 };
        const radius = new Float64Array(n).fill(c === 0 ? Infinity : 1 / c);
        const track = bootTrackOf(snow, bridge, radius);
        close(skiRest(moguls, t, [0.1, 0], 0.85, 0.75, c).base, track[Math.floor(n / 2)] ?? NaN, 1e-9);
      }
  });

  it('reduces to the base on the snow at the boot on groomed snow, bent or not', () => {
    for (const c of CURVATURES) {
      const r = skiRest(groomed, 0.3, [0.1, 0], 0.85, 0.75, c);
      close(r.base, 0);
      close(r.pitch, 0);
      close(r.tip, (c * 0.85 * 0.85) / 2);
    }
  });

  it('rests on the boot over the crest at the switch on the tops line, the ends floating', () => {
    const r = skiRest(tops, 0, [0, 0], 0.85, 0.75);
    close(r.base, along(tops, 0, 0), 5e-3);
    assert.isAbove(r.tip, along(tops, 0, 0.85 * Math.cos(r.pitch)));
  });
});

describe('fieldMesh', () => {
  it('lays a grid on the top, wound counter-clockwise seen from above', () => {
    const { positions, normals, indices } = fieldMesh(moguls, 2, 0.5);
    assert.strictEqual(positions.length, 9 * 9 * 3);
    assert.strictEqual(normals.length, positions.length);
    assert.strictEqual(indices.length, 8 * 8 * 6);
    for (let k = 0; k < positions.length; k += 3)
      close(positions[k + 1] ?? 0, heightAt(moguls, positions[k] ?? 0, positions[k + 2] ?? 0), 1e-6);
    const at = (i: number): readonly [number, number, number] => [positions[3 * i] ?? 0, positions[3 * i + 1] ?? 0, positions[3 * i + 2] ?? 0];
    for (let k = 0; k < indices.length; k += 3) {
      const [a, b, c] = [at(indices[k] ?? 0), at(indices[k + 1] ?? 0), at(indices[k + 2] ?? 0)];
      // Upward face normal: y of (b - a) x (c - a) is positive.
      const y = (b[2] - a[2]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[2] - a[2]);
      assert.isAbove(y, 0);
    }
  });
});

const dot = (a: ReadonlyArray<number>, b: ReadonlyArray<number>): number => (a[0] ?? 0) * (b[0] ?? 0) + (a[1] ?? 0) * (b[1] ?? 0) + (a[2] ?? 0) * (b[2] ?? 0);

describe('the profile path (motion-model §9 V)', () => {
  it("times a migrated turn by its profile's period", () => {
    for (const i of INTENSITIES) {
      const task = taskFor(TurnKind.GS, i);
      assert.strictEqual(realTurnSeconds(RegularTurn.GS, i), turnProfile(task, Snow.HardGroomed).periodS, i);
    }
  });

  it("runs a groomed task cell's path one profile path length per cycle, its ends mirrored", () => {
    for (const i of INTENSITIES) {
      const s = surfaceFor(RegularTurn.GS, i);
      const total = turnProfile(taskFor(TurnKind.GS, i), Snow.HardGroomed).pathM.at(-1) ?? 0;
      const n = 720;
      let length = 0;
      for (let k = 0; k < n; k++) {
        const a = pathAt(s, k / n);
        const b = pathAt(s, (k + 1) / n);
        length += Math.hypot(b.x - a.x, b.z - a.z);
      }
      assert.isBelow(Math.abs(length / total - 1), 0.01, i);
      close(pathAt(s, 0).x, -pathAt(s, 1).x, 1e-9);
      close(pathAt(s, 1).z, s.spacing, 1e-9);
    }
  });

  it('brakes along the skis by gliding friction: down the fall line the resultant leans μ_k cos γ to the tail', () => {
    const task = taskFor(TurnKind.GS, Intensity.Moderate);
    const p = turnProfile(task, Snow.HardGroomed);
    const t = p.events.fallLine;
    const g = skiGoal(RegularTurn.GS, Intensity.Moderate, surfaceFor(RegularTurn.GS, Intensity.Moderate), t);
    const tail = dot(g.resultant, g.forward) / dot(g.resultant, g.normal);
    close(tail, -GLIDING_FRICTION[Snow.HardGroomed] * Math.cos((p.at(t).attack * Math.PI) / 180), 1e-6);
  });
});
