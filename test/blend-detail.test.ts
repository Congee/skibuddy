import { assert, describe, it } from '@effect/vitest';
import type { Activation } from '../src/content/schema';
import { earlyEdgers, gearFor } from '../src/prototypes/blend/detail';
import { GearMode } from '../src/viewer/gear-mode';

const act = (muscle: string, side: string, i: number, s: number, f: number, serves: ReadonlyArray<string> = ['ankle.inversion']): Activation =>
  ({ muscle, side, serves, intensity: { initiation: i, shaping: s, finish: f } }) as unknown as Activation;

describe('earlyEdgers', () => {
  it('picks one early edger per leg, outside first', () => {
    const order = [
      act('vasti', 'outside', 2, 3, 3, ['knee.flexion']),
      act('peroneals', 'outside', 2, 2, 1),
      act('tibialis-anterior', 'inside', 1, 2, 2),
      act('tibialis-posterior', 'inside', 1, 1, 1),
    ];
    assert.deepStrictEqual(
      earlyEdgers(order, 'moderate').map((a) => `${a.muscle}:${a.side}`),
      ['peroneals:outside', 'tibialis-posterior:inside'],
    );
  });

  it('skips a leg whose foot works harder later or not at all', () => {
    const order = [act('peroneals', 'outside', 1, 2, 2), act('tibialis-posterior', 'inside', 0, 0, 0)];
    assert.deepStrictEqual(earlyEdgers(order, 'moderate'), []);
  });

  it('ignores muscles that do not roll the foot that way', () => {
    assert.deepStrictEqual(earlyEdgers([act('peroneals', 'inside', 3, 2, 1)], 'moderate'), []);
  });
});

describe('gearFor', () => {
  it('takes the boots off for ankle and foot muscles only', () => {
    assert.strictEqual(gearFor(act('peroneals', 'outside', 1, 1, 1)), GearMode.Off);
    assert.strictEqual(gearFor(act('gastrocnemius', 'outside', 1, 1, 1, ['ankle.flexion', 'knee.flexion'])), GearMode.Translucent);
    assert.strictEqual(gearFor(undefined), GearMode.Translucent);
  });
});
