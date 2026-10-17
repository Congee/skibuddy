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
  supportAt,
  surfaceFor,
  SurfaceKind,
  trackRest,
  underFoot,
} from '../src/viewer/surface';
import { CLOSED_STANCE_POSE, TOPS_POSE } from '../src/viewer/turn-heading';

const close = (a: number, b: number, eps = 1e-9): void => assert.isBelow(Math.abs(a - b), eps, `${a} vs ${b}`);
const INTENSITIES = [Intensity.Gentle, Intensity.Moderate, Intensity.Dynamic] as const;
const moguls = surfaceFor(RegularTurn.Moguls, Intensity.Moderate);
const tops = surfaceFor(TOPS_POSE, Intensity.Moderate);
const powder = surfaceFor(RegularTurn.Powder, Intensity.Moderate);
const groomed = surfaceFor(RegularTurn.Carving, Intensity.Moderate);
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

  it('tops a mogul at each switch and drops into the rut mid-turn (fis-freestyle-judging-2025 p26, p28)', () => {
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
      assert.strictEqual(s.relief, 1);
      for (const [x, z] of POINTS) close(heightAt(s, x, z), heightAt(moguls, x, z), 1e-12);
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
    // Crests 0.8-1.2 m (kurpiers-2010 p10) over the trough on the line.
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
  it('starts on the centre line, reaches the corridor edge mid-turn and ends a spacing down', () => {
    for (const s of [moguls, powder, groomed]) {
      const start = pathAt(s, 0);
      close(start.x, 0);
      close(start.z, 0);
      close(pathAt(s, 0.5).x, -(s.path.feet ?? s.path.corridor) / 2, 1e-9);
      const end = pathAt(s, 1);
      close(end.x, 0, 1e-9);
      close(end.z, s.spacing, 1e-9);
      close(pathAt(s, 0.5).track, 0, 1e-12);
    }
  });

  it('moves at a steady speed', () => {
    const n = 200;
    for (let k = 0; k < n; k++) {
      const a = pathAt(moguls, k / n);
      const b = pathAt(moguls, (k + 1) / n);
      close(Math.hypot(b.x - a.x, b.z - a.z) * n, moguls.speed, 1e-3);
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

  it('touches the support without cutting it, pitched along the chord from tail to tip', () => {
    for (let k = 0; k < 24; k++) {
      const t = k / 24;
      const r = skiRest(moguls, t, [0.1, 0], 0.85, 0.75);
      const c = Math.cos(r.pitch);
      const gaps = Array.from({ length: 33 }, (_, i) => {
        const x = (-0.75 + (1.6 * i) / 32) * c;
        return r.base + x * Math.tan(r.pitch) - along(moguls, t, x);
      });
      close(Math.min(...gaps), 0, 1e-9);
      close(Math.tan(r.pitch), (along(moguls, t, 0.85 * c) - along(moguls, t, -0.75 * c)) / (1.6 * c), 1e-3);
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
