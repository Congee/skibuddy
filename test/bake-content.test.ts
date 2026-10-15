import { assert, describe, it } from '@effect/vitest';
import { drillScenarios } from '../scripts/anatomy/drill-scenarios';
import fixture from './anatomy-probe.json';

describe('baked model and content', () => {
  it('solved the model clips for the drill content scenarios', () => {
    // Re-bake (scripts/anatomy/build.sh) after changing the drill's scenarios.
    assert.deepStrictEqual(fixture.scenarios, drillScenarios());
  });
});
