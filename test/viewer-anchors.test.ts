import { assert, describe, it } from '@effect/vitest';
import { Side } from '../src/content/schema';
import { bestAnchors, projectAnchor, sameAnchors, spreadCandidates } from '../src/viewer/anchor-projection';
import type { AnchorPoint } from '../src/viewer/anchor-projection';
import { NodeKind, parseAnatomyNode } from '../src/viewer/anatomy-names';
import { identity } from '../src/viewer/mat4';
import type { Vec3 } from '../src/viewer/mat4';

// Identity view-projection: NDC = world x, y; the eye looks down -z from +z.
const EYE: Vec3 = [0, 0, 5];
const point = (position: Vec3, normal: Vec3, muscle = 'quadriceps'): AnchorPoint => ({ muscle, side: Side.Outside, position, normal });

describe('projectAnchor', () => {
  it('maps NDC to CSS px from the top-left', () => {
    const a = projectAnchor(identity(), EYE, point([0.5, 0.5, 0], [0, 0, 1]), 200, 100);
    assert.closeTo(a.x, 150, 1e-6);
    assert.closeTo(a.y, 25, 1e-6);
    assert.isTrue(a.visible);
  });

  it('hides points facing away or off screen', () => {
    assert.isFalse(projectAnchor(identity(), EYE, point([0, 0, 0], [0, 0, -1]), 100, 100).visible);
    assert.isFalse(projectAnchor(identity(), EYE, point([1.5, 0, 0], [0, 0, 1]), 100, 100).visible);
  });

  it('still pins a surface seen almost edge-on', () => {
    assert.isTrue(projectAnchor(identity(), EYE, point([0, 0, 0], [1, 0, -0.05]), 100, 100).visible);
  });
});

describe('bestAnchors', () => {
  it('keeps one pin per muscle and side, the candidate facing the camera most', () => {
    const anchors = bestAnchors(
      identity(),
      EYE,
      [point([0.1, 0, 0], [0, 0, -1]), point([0.2, 0, 0], [0, 0, 1]), point([0.3, 0, 0], [1, 0, 0]), point([0, 0, 0], [0, 0, 1], 'calf')],
      100,
      100,
    );
    assert.strictEqual(anchors.length, 2);
    const quads = anchors.find((a) => a.muscle === 'quadriceps');
    assert.closeTo(quads?.x ?? 0, 60, 1e-6);
    assert.isTrue(quads?.visible);
  });

  it('prefers an on-screen candidate over a better-facing one off screen', () => {
    const [a] = bestAnchors(identity(), EYE, [point([2, 0, 0], [0, 0, 1]), point([0, 0, 0], [0.9, 0, 0.1])], 100, 100);
    assert.isTrue(a?.visible);
    assert.closeTo(a?.x ?? 0, 50, 1e-6);
  });
});

describe('sameAnchors', () => {
  const a = { muscle: 'calf', side: Side.Inside, x: 10, y: 10, visible: true };
  it('ignores sub-pixel motion but not visibility changes', () => {
    assert.isTrue(sameAnchors([a], [{ ...a, x: 10.4 }]));
    assert.isFalse(sameAnchors([a], [{ ...a, x: 10.6 }]));
    assert.isFalse(sameAnchors([a], [{ ...a, visible: false }]));
  });
});

describe('spreadCandidates', () => {
  const ring = Array.from({ length: 16 }, (_, i): Vec3 => [Math.cos((i * Math.PI) / 8), Math.sin((i * Math.PI) / 8), 0]);
  const far: ReadonlyArray<Vec3> = [...ring, [10, 0, 0], [0, 10, 0]];

  it('starts at the point nearest the centre and skips the far half', () => {
    const picked = spreadCandidates(far, [1, 0, 0], 4);
    assert.strictEqual(picked[0], 0);
    assert.isTrue(picked.every((i) => i < 16));
  });

  it('spreads picks apart and returns no duplicates', () => {
    const picked = spreadCandidates(ring, [0, 0, 0], 4);
    assert.strictEqual(new Set(picked).size, 4);
  });

  it('handles empty input', () => {
    assert.deepStrictEqual(spreadCandidates([], [0, 0, 0], 3), []);
  });
});

describe('parseAnatomyNode', () => {
  it('reads muscle groups, rest, bones and gear', () => {
    assert.deepStrictEqual(parseAnatomyNode('muscle_hip-flexors_inside'), { kind: NodeKind.Muscle, muscle: 'hip-flexors', side: Side.Inside });
    assert.deepStrictEqual(parseAnatomyNode('muscle_calf_outside'), { kind: NodeKind.Muscle, muscle: 'calf', side: Side.Outside });
    assert.deepStrictEqual(parseAnatomyNode('muscle_rest'), { kind: NodeKind.RestingMuscle });
    assert.deepStrictEqual(parseAnatomyNode('bones'), { kind: NodeKind.Bones });
    assert.deepStrictEqual(parseAnatomyNode('gear_ski_R'), { kind: NodeKind.Gear });
  });

  it('rejects other names', () => {
    assert.isNull(parseAnatomyNode('rig'));
    assert.isNull(parseAnatomyNode('muscle_calf_left'));
  });
});
