import { assert, describe, it } from '@effect/vitest';
import { Intensity } from '../src/content/schema';
import { RegularTurn } from '../src/viewer/poses/regular-turn';
import { TOPS_POSE, headingAt, transitionHeading, turnPath } from '../src/viewer/turn-heading';

const DEG = Math.PI / 180;
const close = (a: number, b: number, eps = 1e-9): void => assert.isBelow(Math.abs(a - b), eps, `${a} vs ${b}`);
const path = { radius: 5, corridor: 2 };

describe('headingAt', () => {
  it('is widest at the transitions and on the fall line mid-turn', () => {
    const most = transitionHeading(path);
    close(most, Math.acos(0.8));
    close(headingAt(0, path), -most);
    close(headingAt(0.5, path), 0);
    close(headingAt(0.999999, path), most, 1e-5);
  });

  it('turns toward the inside, fastest at the fall line', () => {
    const step = (t: number): number => headingAt(t + 0.01, path) - headingAt(t, path);
    for (let k = 0; k < 99; k++) assert.isAbove(step(k / 100), 0, `${k}/100`);
    assert.isAbove(step(0.495), step(0.2));
    assert.isAbove(step(0.2), step(0));
  });

  it('runs on into the mirrored next turn with no jump or kink', () => {
    // The next turn is drawn mirrored, so its heading on the slope is the negative of its own.
    const world = (t: number): number => (t < 1 ? headingAt(t, path) : -headingAt(t - 1, path));
    const e = 1e-4;
    close(world(1 - e), world(1 + e), 1e-6);
    close(world(1 - e) - world(1 - 2 * e), world(1 + 2 * e) - world(1 + e), 1e-6);
  });

  it('wraps turn time', () => {
    close(headingAt(1.25, path), headingAt(0.25, path));
    close(headingAt(-0.75, path), headingAt(0.25, path));
  });

  it('crosses at most square to the fall line', () => {
    close(transitionHeading({ radius: 1, corridor: 2 }), 90 * DEG);
    close(transitionHeading({ radius: 1, corridor: 9 }), 180 * DEG);
  });
});

describe('turnPath', () => {
  it('runs the zipper in a rut-wide corridor, the tops line 50° off the fall line and closed stance in 2 m', () => {
    assert.deepStrictEqual(turnPath(RegularTurn.Moguls, Intensity.Moderate), { radius: 5, corridor: 1.1, set: 0.5 });
    // Finishing across the hill (duncan-smith-2021 1:28-1:32); 50° inferred.
    for (const i of [Intensity.Gentle, Intensity.Moderate, Intensity.Dynamic]) close(transitionHeading(turnPath(TOPS_POSE, i)), 50 * DEG);
    assert.deepStrictEqual(turnPath('closed-stance-short-turns', Intensity.Moderate), { radius: 4.5, corridor: 2, set: 0.5 });
  });

  it('keeps the zipper skis within 30° of the fall line (fis-freestyle-judging-2025 p28)', () => {
    for (const i of [Intensity.Gentle, Intensity.Moderate, Intensity.Dynamic])
      assert.isAtMost(transitionHeading(turnPath(RegularTurn.Moguls, i)), 30 * DEG, i);
  });

  it('gives other turns a round shape, 60° off the fall line', () => {
    close(transitionHeading(turnPath(RegularTurn.Carving, Intensity.Dynamic)), 60 * DEG);
    close(transitionHeading(turnPath('no-such-pose', Intensity.Gentle)), 60 * DEG);
  });
});
