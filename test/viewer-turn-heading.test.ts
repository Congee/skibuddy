import { assert, describe, it } from '@effect/vitest';
import { Intensity } from '../src/content/schema';
import { RegularTurn } from '../src/viewer/poses/regular-turn';
import { headingAt, transitionHeading, turnPath } from '../src/viewer/turn-heading';

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

  it('turns steadily toward the inside', () => {
    const ts = Array.from({ length: 21 }, (_, i) => i / 20);
    for (let i = 1; i < ts.length - 1; i++) close(headingAt(ts[i] ?? 0, path) - headingAt(ts[i - 1] ?? 0, path), transitionHeading(path) / 10, 1e-9);
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
  it('runs mogul turns in a 2 m corridor', () => {
    assert.deepStrictEqual(turnPath(RegularTurn.Moguls, Intensity.Moderate), { radius: 5, corridor: 2 });
    assert.deepStrictEqual(turnPath('closed-stance-short-turns', Intensity.Moderate), { radius: 4.5, corridor: 2 });
  });

  it('gives other turns a round shape, 60° off the fall line', () => {
    close(transitionHeading(turnPath(RegularTurn.Carving, Intensity.Dynamic)), 60 * DEG);
    close(transitionHeading(turnPath('no-such-pose', Intensity.Gentle)), 60 * DEG);
  });
});
