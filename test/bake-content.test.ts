import { assert, describe, it } from '@effect/vitest';
import { drillScenarios } from '../scripts/anatomy/drill-scenarios';
import { POSE_DEFINITIONS } from '../src/viewer/poses';
import fixture from './anatomy-probe.json';

describe('baked model and content', () => {
  it('solved the model clips for every posed drill and its content scenarios', () => {
    // Re-bake (scripts/anatomy/build.sh) after changing a posed drill's scenarios or adding a pose.
    assert.deepStrictEqual(fixture.scenarios, Object.fromEntries(Object.keys(POSE_DEFINITIONS).map((d) => [d, drillScenarios(d)])));
  });
});
