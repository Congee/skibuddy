import { assert, describe, it } from '@effect/vitest';
import { contentScenarios, drillScenarios } from '../scripts/anatomy/drill-scenarios';
import { POSE_DEFINITIONS } from '../src/viewer/poses';
import { RegularTurn, TOPS, TURN_STYLES } from '../src/viewer/poses/regular-turn';
import fixture from './anatomy-probe.json';

describe('baked model and content', () => {
  it('solved the model clips for every posed drill and its content scenarios', () => {
    // Re-bake (scripts/anatomy/build.sh) after changing a posed drill's scenarios or adding a pose.
    assert.deepStrictEqual<unknown>(fixture.scenarios, Object.fromEntries(Object.keys(POSE_DEFINITIONS).map((d) => [d, drillScenarios(d)])));
  });

  it('keeps the mogul styles on the scenarios of their drills', () => {
    // The viewer reads the styles' scenarios; the content pages show the drills'.
    assert.deepStrictEqual<unknown>(contentScenarios('moguls'), TURN_STYLES[RegularTurn.Moguls].scenarios);
    assert.deepStrictEqual<unknown>(contentScenarios('turns-on-the-tops'), TOPS.scenarios);
  });
});
