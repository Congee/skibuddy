import { assert, describe, it } from '@effect/vitest';
import { BodySide } from '../src/viewer/figure';
import type { Vec3 } from '../src/viewer/mat4';
import { POLE, POLE_TOUCH_T, poleDirection, poleTouchAt } from '../src/viewer/pose';
import { anatomyProbe, capsuleProbe } from './figure-probes';
import type { FigureProbe, LegSide } from './figure-probes';

const TIMES = Array.from({ length: 96 }, (_, i) => i / 96);
const DEG = Math.PI / 180;

const heading = (ski: { readonly tip: Vec3; readonly tail: Vec3 }): number => Math.atan2(ski.tip[0] - ski.tail[0], ski.tip[2] - ski.tail[2]);

/** The basket at turn time `t`; only the inside (left) pole touches. */
const basket = (probe: FigureProbe, t: number, side: LegSide): { readonly grip: Vec3; readonly basket: Vec3 } => {
  const at = probe.at(t);
  const grip = at.grip(side);
  const d = poleDirection(grip, side, side === BodySide.Left ? poleTouchAt(t) : 0, at.ankle(side));
  return { grip, basket: [grip[0] + d[0] * POLE.basket, grip[1] + d[1] * POLE.basket, grip[2] + d[2] * POLE.basket] };
};

const invariants = (load: () => Promise<FigureProbe>): void => {
  it('keeps the skis parallel all through the turn', async () => {
    const probe = await load();
    for (const t of TIMES) {
      const at = probe.at(t);
      const diff = Math.abs(heading(at.ski(BodySide.Left)) - heading(at.ski(BodySide.Right)));
      assert.isBelow(diff, 2 * DEG, `t=${t}`);
    }
  });

  it('touches the inside basket to the snow beside the inside ski, from binding toe to mid-forebody', async () => {
    const probe = await load();
    const at = probe.at(POLE_TOUCH_T);
    const { basket: b } = basket(probe, POLE_TOUCH_T, BodySide.Left);
    const ankle = at.ankle(BodySide.Left);
    const { tip } = at.ski(BodySide.Left);
    assert.closeTo(b[1], 0, 0.01);
    assert.isAbove(b[2], ankle[2] + 0.12, 'behind the binding toe');
    assert.isBelow(b[2], ankle[2] + 0.5, 'past mid-forebody');
    assert.isBelow(b[2], tip[2], 'ahead of the tip');
    assert.isAbove(b[0] - ankle[0], 0.1, 'on the ski');
    assert.isBelow(b[0] - ankle[0], 0.4, 'far from the ski');
  });

  it('keeps the inside basket off the snow outside the touch, close to the hand', async () => {
    const probe = await load();
    for (const t of TIMES) {
      const { grip, basket: b } = basket(probe, t, BodySide.Left);
      if (poleTouchAt(t) < 0.9) assert.isAbove(b[1], 0.002, `t=${t}`);
      if (poleTouchAt(t) === 0) assert.isAbove(b[1], 0.25, `t=${t}`);
      assert.isBelow(Math.abs(b[0] - grip[0]), 0.35, `lateral at t=${t}`);
    }
  });

  it('never plants the outside pole and carries both back and down', async () => {
    const probe = await load();
    for (const t of TIMES) {
      const { grip, basket: b } = basket(probe, t, BodySide.Right);
      assert.isAbove(b[1], 0.25, `t=${t}`);
      assert.isBelow(b[2], grip[2] - 0.3, `t=${t}`);
    }
  });
};

describe('capsule skis and poles', () => invariants(async () => capsuleProbe));

describe('anatomy skis and poles', () => {
  const probe = anatomyProbe();
  invariants(async () => probe);
});

describe('pole touch timing', () => {
  it('touches only around the transition', () => {
    assert.strictEqual(poleTouchAt(POLE_TOUCH_T), 1);
    for (const t of [0.25, 0.4, 0.5, 0.75]) assert.strictEqual(poleTouchAt(t), 0, `t=${t}`);
  });
});
