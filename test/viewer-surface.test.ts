import { assert, describe, it } from '@effect/vitest';
import { Intensity } from '../src/content/schema';
import { RegularTurn } from '../src/viewer/poses/regular-turn';
import {
  BOOT_HALF_GAP,
  fieldMesh,
  heightAt,
  liftAt,
  normalAt,
  pathAt,
  supportAt,
  surfaceFor,
  SurfaceKind,
  underFoot,
} from '../src/viewer/surface';
import { CLOSED_STANCE_POSE } from '../src/viewer/turn-heading';

const close = (a: number, b: number, eps = 1e-9): void => assert.isBelow(Math.abs(a - b), eps, `${a} vs ${b}`);
const INTENSITIES = [Intensity.Gentle, Intensity.Moderate, Intensity.Dynamic] as const;
const moguls = surfaceFor(RegularTurn.Moguls, Intensity.Moderate);
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
  it('puts mogul and closed-stance turns on moguls, powder on powder, the rest on groomed snow', () => {
    assert.strictEqual(moguls.kind, SurfaceKind.Moguls);
    assert.strictEqual(surfaceFor(CLOSED_STANCE_POSE, Intensity.Gentle).kind, SurfaceKind.Moguls);
    assert.strictEqual(powder.kind, SurfaceKind.Powder);
    assert.strictEqual(groomed.kind, SurfaceKind.Groomed);
  });

  it('grows mogul relief and powder depth with intensity', () => {
    const relief = INTENSITIES.map((i) => surfaceFor(RegularTurn.Moguls, i).relief);
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

  it('crests on the line at each switch and sits a quarter relief down mid-turn', () => {
    close(heightAt(moguls, 0, 0), moguls.relief / 2);
    close(heightAt(moguls, 0, moguls.spacing), moguls.relief / 2);
    const mid = pathAt(moguls, 0.5);
    close(heightAt(moguls, mid.x, mid.z), -moguls.relief / 4, 1e-3);
    // The columns either side crest between the line's crests.
    close(heightAt(moguls, moguls.columns, moguls.spacing / 2), moguls.relief / 2);
  });

  it('repeats every turn down the fall line and is even across it, so the mirrored turn sees the same snow', () => {
    for (const s of [moguls, powder])
      for (const [x, z] of POINTS) {
        close(heightAt(s, x, z + s.spacing), heightAt(s, x, z), 1e-9);
        close(heightAt(s, -x, z), heightAt(s, x, z), 1e-12);
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
    for (const s of [moguls, powder])
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
      close(pathAt(s, 0.5).x, -s.path.corridor / 2, 1e-9);
      const end = pathAt(s, 1);
      close(end.x, 0, 1e-9);
      close(end.z, s.spacing, 1e-9);
      close(pathAt(s, 0.5).heading, 0, 1e-12);
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
        [BOOT_HALF_GAP, 0.3],
        [-BOOT_HALF_GAP, -0.8],
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

describe('liftAt', () => {
  it('is zero off moguls and follows the bumps under the boots on them', () => {
    close(liftAt(groomed, 0.3), 0);
    close(liftAt(powder, 0.3), 0);
    assert.isAbove(liftAt(moguls, 0), liftAt(moguls, 0.25));
    assert.isAbove(liftAt(moguls, 0.25), liftAt(moguls, 0.5));
    close(liftAt(moguls, 0), liftAt(moguls, 1), 1e-9);
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
