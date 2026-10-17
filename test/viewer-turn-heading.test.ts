import { assert, describe, it } from '@effect/vitest';
import { Intensity } from '../src/content/schema';
import { RegularTurn } from '../src/viewer/poses/regular-turn';
import { LEG_LENGTH, ROUND_POSE, TOPS_POSE, feetCorridor, headingAt, pivotAt, sinusoidHeading, trackHeadingAt, transitionHeading, turnPath, turnStyle } from '../src/viewer/turn-heading';

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

describe('pivotAt', () => {
  const PIVOTED = [RegularTurn.ShortTurns, RegularTurn.Moguls, RegularTurn.Steeps, RegularTurn.Powder, TOPS_POSE, ROUND_POSE, 'closed-stance-short-turns'];

  it('carves without skidding: the skis along the track', () => {
    for (const drill of [RegularTurn.Carving, RegularTurn.Cruising])
      for (const i of [Intensity.Gentle, Intensity.Moderate, Intensity.Dynamic])
        for (let k = 0; k < 48; k++) close(pivotAt(k / 48, turnPath(drill, i)), 0, 1e-12);
  });

  it('skids pivoted skis off the track, continuous and mirrored through the switch', () => {
    // The next turn is drawn mirrored, so its skid on the slope is the negative of its own.
    const e = 1e-6;
    for (const drill of PIVOTED)
      for (const i of [Intensity.Gentle, Intensity.Moderate, Intensity.Dynamic]) {
        const path = turnPath(drill, i);
        assert.isDefined(path.set, drill);
        const most = Math.max(...Array.from({ length: 48 }, (_, k) => Math.abs(pivotAt(k / 48, path))));
        assert.isAbove(most, 5 * DEG, `${drill} ${i}`);
        const world = (t: number): number => (t < 1 ? pivotAt(t, path) : -pivotAt(t - 1, path));
        const slope = (t: number): number => (world(t + e) - world(t)) / e;
        close(world(1 - e), world(1 + e), 1e-5);
        close(slope(1 - 2 * e), slope(1 + e), 1e-2);
        for (let k = 1; k < 48; k++) assert.isBelow(Math.abs(world(k / 48 + e) - world(k / 48 - e)), 1e-2, `${drill} ${i} ${k}/48`);
      }
  });
});

describe('turnPath', () => {
  it('runs the zipper in a rut-wide corridor, the tops line 50° off the fall line and closed stance in 2 m', () => {
    assert.deepStrictEqual(turnPath(RegularTurn.Moguls, Intensity.Moderate), { radius: 5, corridor: 1.1, set: 0.5 });
    // Finishing across the hill (duncan-smith-2021 1:28-1:32); 50° inferred.
    for (const i of [Intensity.Gentle, Intensity.Moderate, Intensity.Dynamic]) close(transitionHeading(turnPath(TOPS_POSE, i)), 50 * DEG);
    const { radius, corridor, set } = turnPath('closed-stance-short-turns', Intensity.Moderate);
    assert.deepStrictEqual({ radius, corridor, set }, { radius: 4.5, corridor: 2, set: 0.5 });
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

describe('feet track', () => {
  const INTENSITIES = [Intensity.Gentle, Intensity.Moderate, Intensity.Dynamic];
  const GROOMED_PIVOTED = [RegularTurn.ShortTurns, RegularTurn.Steeps, RegularTurn.Powder, 'closed-stance-short-turns'];
  const skids = (path: ReturnType<typeof turnPath>): ReadonlyArray<number> => Array.from({ length: 96 }, (_, k) => Math.abs(pivotAt(k / 96, path)));

  it('skids carved and cruising skis within the measured spread: peak 15°, 4° after the fall line (reid-2010, nakazato-2016, klous-2014)', () => {
    for (const drill of [RegularTurn.Carving, RegularTurn.Cruising])
      for (const i of INTENSITIES) {
        const all = skids(turnPath(drill, i));
        assert.isAtMost(Math.max(...all) / DEG, 15, `${drill} ${i}`);
        assert.isAtMost(Math.max(...all.slice(48)) / DEG, 4, `${drill} ${i}`);
      }
  });

  it('skids pivoted groomed skis well short of a pivot slip, 30-45° ±15 at the set (SIA drone footage, measured)', () => {
    for (const drill of GROOMED_PIVOTED)
      for (const i of INTENSITIES) {
        const path = turnPath(drill, i);
        assert.isBelow(Math.max(...skids(path)) / DEG, 90 - 15, `${drill} ${i}`);
        const atSet = Math.abs(pivotAt(path.set ?? 0, path)) / DEG;
        assert.isAtLeast(atSet, 30 - 15, `${drill} ${i}`);
        assert.isAtMost(atSet, 45 + 15 + 1e-9, `${drill} ${i}`);
      }
  });

  it('swings the feet about a mass on the fall line: under it at the switch, farthest out at the apex (arndt-1992, gellie)', () => {
    for (const drill of GROOMED_PIVOTED)
      for (const i of INTENSITIES) {
        const path = turnPath(drill, i);
        const scenario = turnStyle(drill)?.scenarios[i];
        if (scenario === undefined) throw new Error(drill);
        assert.strictEqual(path.feet, feetCorridor(scenario), `${drill} ${i}`);
        assert.isBelow(path.feet ?? Infinity, 2 * LEG_LENGTH, `${drill} ${i}`);
        // Heading most at the switch, where the feet cross under the mass; nil at the apex, where they are farthest out.
        close(Math.abs(trackHeadingAt(0, path)), sinusoidHeading(path.feet ?? 0, path.length ?? 1));
        close(trackHeadingAt(0.5, path), 0, 1e-12);
      }
  });

  it('heads the track further off the fall line in a wider corridor and less at speed', () => {
    const seconds = 1;
    for (const w of [0.5, 1, 1.5])
      for (const v of [5, 8, 11]) {
        assert.isAbove(sinusoidHeading(w + 0.1, v * seconds), sinusoidHeading(w, v * seconds), `${w} ${v}`);
        assert.isBelow(sinusoidHeading(w, (v + 1) * seconds), sinusoidHeading(w, v * seconds), `${w} ${v}`);
      }
  });

  it('keeps the mogul lines on their own corridors', () => {
    for (const drill of [RegularTurn.Moguls, TOPS_POSE, ROUND_POSE]) for (const i of INTENSITIES) assert.isUndefined(turnPath(drill, i).feet, `${drill} ${i}`);
  });
});
