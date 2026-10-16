import { assert, describe, it } from '@effect/vitest';
import { BodySide } from '../src/viewer/figure';
import type { Vec3 } from '../src/viewer/mat4';
import { anatomyProbe, capsuleProbe } from './figure-probes';
import type { FigureProbe } from './figure-probes';

const TIMES = Array.from({ length: 96 }, (_, i) => i / 96);
/** The baked fist may sit this far from the solver's, relative to the shoulder; the bodies' arm lengths differ by about 1 cm. */
const VERTICAL = 0.03;
const ANY = 0.05;

const fromShoulder = (probe: FigureProbe, t: number, side: typeof BodySide.Left | typeof BodySide.Right): Vec3 => {
  const at = probe.at(t);
  const [g, s] = [at.grip(side), at.shoulder(side)];
  return [g[0] - s[0], g[1] - s[1], g[2] - s[2]];
};

describe('baked grips', () => {
  it('hold the fists where the solver puts them, relative to the shoulder', () => {
    const anatomy = anatomyProbe();
    for (const t of TIMES) {
      for (const side of [BodySide.Left, BodySide.Right] as const) {
        const [a, c] = [fromShoulder(anatomy, t, side), fromShoulder(capsuleProbe, t, side)];
        assert.closeTo(a[1], c[1], VERTICAL, `height, ${side} at t=${t}`);
        assert.isBelow(Math.hypot(a[0] - c[0], a[1] - c[1], a[2] - c[2]), ANY, `${side} at t=${t}`);
      }
    }
  });
});
