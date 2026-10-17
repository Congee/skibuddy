import { assert, describe, it } from '@effect/vitest';
import { ANATOMY_MESH, REFERENCE_SKIER } from '../src/viewer/skier';
import fixture from './anatomy-probe.json';

/** de-leva-1996 Table 4, males: stature and joint-centre lengths, mm. */
const DE_LEVA_STATURE = 1741;
// Same landmarks as Body: hip to knee joint centre, mid-hip to cervicale, shoulder to elbow joint centre.
// Not checked: his shank ends at the lateral malleolus, the mesh's shin at the talus centre, and he gives no hip width or grip.
const DE_LEVA = { thigh: 422.2, trunk: 603.3, upperArm: 281.7 } as const;

describe('reference skier', () => {
  it('keeps the anatomy mesh proportions within 10% of de-leva-1996', () => {
    for (const [key, mm] of Object.entries(DE_LEVA)) {
      const share = ANATOMY_MESH.body[key as keyof typeof DE_LEVA] / ANATOMY_MESH.stature;
      assert.closeTo(share / (mm / DE_LEVA_STATURE), 1, 0.1, key);
    }
  });

  it('is the baked body: the model upper arm is the record one', () => {
    assert.closeTo(fixture.arm.upperArm, REFERENCE_SKIER.body.upperArm, 1e-3);
  });
});
