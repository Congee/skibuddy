import { assert, describe, it } from '@effect/vitest';
import { Intensity } from '../src/content/schema';
import { Snow } from '../src/physics/edge';
import { bakedGroomed, decodeProfile, encodeProfile } from '../src/physics/groomed-bake';
import { TurnKind, taskFor } from '../src/physics/task';
import { groomedPointAt } from '../src/physics/turn';
import type { TurnProfile } from '../src/physics/turn';

const N = 8;
const series = (f: (i: number) => number): number[] => Array.from({ length: N }, (_, i) => f(i));
const speed = Float64Array.from(series((i) => 12 + Math.sin(i)));
const s = {
  arcShare: series((i) => i / N),
  massShare: series((i) => Math.cos(i) / 3),
  heading: series((i) => (Math.PI * i) / N),
  lean: series((i) => Math.sin(i) / 2),
  load: series((i) => 1 + i / 10),
  edge: series((i) => (i === 0 ? -0 : Math.sin(i) / 1.7)),
  skiRadius: series((i) => 10 + i),
  attack: series((i) => i / 7),
};
// A groomed-shaped profile with the values JSON alone loses: NaN, Infinity and −0.
const profile = {
  t: series((i) => i / N),
  ...s,
  periodS: 2.855,
  halfSweep: 1.1,
  skisHalfSweep: 1.2,
  mogul: null,
  events: { switch: 0, engagement: 0.3, fallLine: Number.NaN, forcePeak: 0.5, release: 0.8 },
  speed,
  gammaE: -0,
  energy: { gain: 1, friction: 0.1, skid: 0.2, bump: 0, drag: 0.05 },
  pathM: [0, ...series((i) => i + 1)],
  closure: { root: true, converged: true, passes: 3, residual: Number.POSITIVE_INFINITY },
  at: groomedPointAt({ ...s, speed: Array.from(speed) }),
  skiHeading: series((i) => i / 3),
  carveMargin: [],
  topHalfSweep: Math.PI / 2,
} as unknown as TurnProfile;

describe('groomed bake', () => {
  it('decodes an encoded profile bit for bit, NaN, Infinity and -0 included', () => {
    const back = decodeProfile(JSON.parse(JSON.stringify(encodeProfile(profile))));
    assert.isTrue(Object.is(back.events.fallLine, Number.NaN));
    assert.isTrue(Object.is(back.gammaE, -0));
    assert.isTrue(Object.is(back.edge[0], -0));
    assert.strictEqual(back.closure.residual, Number.POSITIVE_INFINITY);
    assert.instanceOf(back.speed, Float64Array);
    assert.deepStrictEqual(Array.from(back.speed), Array.from(speed));
    assert.deepStrictEqual(back.pathM, profile.pathM);
    assert.deepStrictEqual(back.carveMargin, []);
  });

  it('rebuilds at() to match the solve-built one, past the mirrored cycle end too', () => {
    const back = decodeProfile(encodeProfile(profile));
    for (const t of [0, 0.01, 0.37, 0.5, 0.874, 0.93, 0.999, 1, 1.25]) assert.deepStrictEqual(back.at(t), profile.at(t));
  });

  it('holds no bake for a task it was not baked for', () => {
    assert.isNull(bakedGroomed(taskFor(TurnKind.GS, Intensity.Moderate), Snow.HardGroomed));
  });
});
