import { assert, describe, it } from '@effect/vitest';
import { Intensity } from '../src/content/schema';
import { BOOT_LATERAL_PLAY } from '../src/viewer/joint-limits';
import { axisOf, forward, skiFrame, value } from '../src/viewer/motion/fk';
import type { Rigid } from '../src/viewer/motion/fk';
import { buildTurnProblem, NAMES } from '../src/viewer/motion/turn';
import { COORDINATES, REST_POSE, Side } from '../src/viewer/skeleton';

const DEG = Math.PI / 180;
const N = NAMES.length;
const rest = COORDINATES.map((c) => REST_POSE[c.name] ?? 0);
const w0 = forward(rest);
const dot = (a: ReadonlyArray<unknown>, b: ReadonlyArray<number>): number => a.reduce<number>((s, x, i) => s + value(x as number) * (b[i] ?? 0), 0);

/** Roll about the long axis against the rest ski's base normal: + puts the frame's +x side up. */
const rollOf = (m: Rigid, normal: ReadonlyArray<number>): number => Math.asin(dot(axisOf(m, 0), normal));
/** `v` turned by `a` about the unit axis `k` (Rodrigues). */
const rotated = (v: ReadonlyArray<unknown>, k: ReadonlyArray<unknown>, a: number): number[] => {
  const [x = 0, y = 0, z = 0] = v.map((t) => value(t as number));
  const [u = 0, w = 0, n = 0] = k.map((t) => value(t as number));
  const [c, s, kv] = [Math.cos(a), Math.sin(a), u * x + w * y + n * z];
  return [x * c + (w * z - n * y) * s + u * kv * (1 - c), y * c + (n * x - u * z) * s + w * kv * (1 - c), z * c + (u * y - w * x) * s + n * kv * (1 - c)];
};
const tibia = (w: Readonly<Record<string, Rigid>>, s: Side): Rigid => {
  const t = w[`tibia.${s}`];
  if (t === undefined) throw new Error(`no tibia.${s}`);
  return t;
};

describe('boot lateral play', () => {
  it('bounds both subtalar slots at ±BOOT_LATERAL_PLAY in every frame', () => {
    const tp = buildTurnProblem('regular-gs', Intensity.Dynamic, { frames: 4 });
    for (const s of [Side.Right, Side.Left]) {
      const i = NAMES.indexOf(`subtalar_inversion.${s}`);
      for (let k = 0; k < tp.cycle.solved; k++) {
        assert.approximately(tp.lower[k * N + i] ?? NaN, -BOOT_LATERAL_PLAY * DEG, 1e-12, `${s} ${k} lower`);
        assert.approximately(tp.upper[k * N + i] ?? NaN, BOOT_LATERAL_PLAY * DEG, 1e-12, `${s} ${k} upper`);
      }
    }
  });

  // The subtalar axis is the tibia's x, 15° off the ski's long axis: 6° of play rolls the ski 5.8° and pitches it 1.4°.
  for (const [s, sign] of [
    [Side.Right, 1],
    [Side.Left, -1],
  ] as const) {
    it(`inverts the ${s} ski onto its little-toe edge, +x side ${sign > 0 ? 'up' : 'down'}, about the tibia's x, the tibia held`, () => {
      const normal = axisOf(skiFrame(w0, s), 1).map((x) => value(x));
      const q = [...rest];
      q[COORDINATES.findIndex((c) => c.name === `subtalar_inversion.${s}`)] = BOOT_LATERAL_PLAY * DEG;
      const w = forward(q);
      const d = rollOf(skiFrame(w, s), normal) - rollOf(skiFrame(w0, s), normal);
      const a = BOOT_LATERAL_PLAY * DEG * (s === Side.Right ? 1 : -1);
      const expected = Math.asin(dot(rotated(axisOf(skiFrame(w0, s), 0), axisOf(tibia(w0, s), 0), a), normal)) - rollOf(skiFrame(w0, s), normal);
      assert.approximately(d, expected, 1e-6);
      assert.strictEqual(Math.sign(d), sign);
      assert.isAbove(Math.abs(d), 0.95 * BOOT_LATERAL_PLAY * DEG);
      assert.approximately(rollOf(tibia(w, s), normal), rollOf(tibia(w0, s), normal), 1e-12);
    });
  }
});
