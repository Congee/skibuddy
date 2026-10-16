import { assert, describe, it } from '@effect/vitest';
import { INTENSITIES, Intensity } from '../src/content/schema';
import { CAPSULE_ARM, poleSize, poseToChannels, regularPoleReach } from '../src/viewer/pose';
import { poseTable, samplePose } from '../src/viewer/pose-table';
import { motionFor, poleTrimOf } from '../src/viewer/poses';
import { REGULAR_TURNS, RegularTurn, TURN_STYLES, weightSplit } from '../src/viewer/poses/regular-turn';
import fixture from './anatomy-probe.json';
import { poseAngles } from './pose-angles';

const KINDS = Object.values(RegularTurn);
const angles = (kind: RegularTurn, i: Intensity, t: number): ReturnType<typeof poseAngles> => poseAngles(samplePose(poseTable(kind, i), t));
const ankle = (kind: RegularTurn, i: Intensity, t: number): number => angles(kind, i, t).dorsiflexion.right;

describe('regular turn', () => {
  it('splits the load between the feet, the outside share rising with intensity', () => {
    for (const kind of KINDS) {
      const style = TURN_STYLES[kind];
      const peak = INTENSITIES.map((i) => weightSplit(style, i, 1 / 2).outside);
      for (const i of INTENSITIES)
        for (const t of [0, 1 / 6, 1 / 2, 5 / 6]) {
          const { outside, inside } = weightSplit(style, i, t);
          assert.closeTo(outside + inside, 1, 1e-12, `${kind} ${i} ${t}`);
          assert.isAtLeast(outside, 0.5, `${kind} ${i} ${t}`);
        }
      assert.isAbove(peak[1] ?? 0, peak[0] ?? 1, kind);
      assert.isAbove(peak[2] ?? 0, peak[1] ?? 1, kind);
      assert.closeTo(weightSplit(style, Intensity.Moderate, 0).outside, 0.5, 1e-9, `${kind} even at the edge change`);
    }
    assert.isBelow(weightSplit(TURN_STYLES[RegularTurn.Powder], Intensity.Moderate, 1 / 2).outside, 0.6);
    assert.isAtLeast(weightSplit(TURN_STYLES[RegularTurn.Carving], Intensity.Dynamic, 1 / 2).outside, 0.8);
  });

  it('keeps the outside knee at 25-50 deg flexion when cruising and carving', () => {
    for (const kind of [RegularTurn.Cruising, RegularTurn.Carving])
      for (const i of INTENSITIES)
        for (let k = 0; k < 24; k++) {
          const knee = angles(kind, i, k / 24).knee.right;
          assert.isTrue(knee >= 25 && knee <= 50, `${kind} ${i} ${k}/24: ${knee.toFixed(1)}`);
        }
  });

  it('leans the trunk forward within the measured range', () => {
    // Spine flexion 11-27 deg in racers (sporri-2016) on a pelvis pitched forward; outside hip up to 55-65 deg (gao-2024).
    for (const kind of KINDS)
      for (const i of INTENSITIES) {
        const trunk = angles(kind, i, 1 / 2).trunkForward;
        assert.isTrue(trunk >= 15 && trunk <= 40, `${kind} ${i}: ${trunk.toFixed(1)}`);
      }
  });

  it('presses the shin forward at a carve initiation and opens it by the finish', () => {
    for (const i of INTENSITIES) assert.isAbove(ankle(RegularTurn.Carving, i, 1 / 6), ankle(RegularTurn.Carving, i, 5 / 6) + 4, i);
    const gentle = Array.from({ length: 24 }, (_, k) => ankle(RegularTurn.Cruising, Intensity.Gentle, k / 24));
    assert.isBelow(Math.max(...gentle) - Math.min(...gentle), 3);
  });

  it('absorbs deeper in moguls at the transition', () => {
    assert.isAbove(angles(RegularTurn.Moguls, Intensity.Moderate, 0).knee.right, angles(RegularTurn.Carving, Intensity.Moderate, 0).knee.right + 15);
  });

  it('keeps both skis on the snow, the inside leg more flexed mid-turn', () => {
    for (const kind of KINDS) {
      const a = angles(kind, Intensity.Moderate, 1 / 2);
      assert.closeTo(a.insideTip, 0, 0.01, kind);
      assert.closeTo(a.insideTail, 0, 0.02, kind);
      assert.isAbove(a.knee.left, a.knee.right, kind);
    }
  });

  it('changes edges at the transition and tips the new edges early', () => {
    for (const kind of KINDS)
      for (const i of INTENSITIES) {
        const edge = (t: number): number => angles(kind, i, t).edge.right;
        const peak = Math.max(...Array.from({ length: 24 }, (_, k) => edge(k / 24)));
        assert.isBelow(Math.abs(edge(0)), 5, `${kind} ${i} flat at the transition`);
        // End of initiation, before the fall line.
        assert.isAtLeast(edge(1 / 3), 0.4 * peak, `${kind} ${i}`);
        assert.isAbove(edge(1 / 2), edge(1 / 3), `${kind} ${i} still growing`);
      }
    assert.isAtLeast(angles(RegularTurn.Carving, Intensity.Moderate, 1 / 3).edge.right, 15);
  });

  it('edges harder as the intensity grows', () => {
    for (const kind of KINDS) {
      const edge = INTENSITIES.map((i) => angles(kind, i, 1 / 2).edge.right);
      assert.isAbove(edge[2] ?? 0, edge[0] ?? 0, kind);
    }
  });

  it('counters little when carving and tracks the skis off the fall line in moguls', () => {
    const at = (drill: string, t: number): number => poseAngles(samplePose(poseTable(drill, Intensity.Moderate), t)).counter;
    for (let k = 0; k < 24; k++) assert.isBelow(Math.abs(at(RegularTurn.Carving, k / 24)), 8, `${k}/24`);
    for (const drill of [RegularTurn.Moguls, 'closed-stance-short-turns']) {
      assert.isBelow(Math.abs(at(drill, 0)), 5, drill);
      assert.isAbove(at(drill, 5 / 6), 25, drill);
      assert.isAbove(at(drill, 5 / 6), at(drill, 1 / 2), drill);
    }
  });

  it('differs between kinds', () => {
    const shaping = KINDS.map((k) => poseToChannels(samplePose(poseTable(k, Intensity.Moderate), 1 / 2)).join());
    assert.strictEqual(new Set(shaping).size, KINDS.length);
    const counter = (k: RegularTurn): number => angles(k, Intensity.Moderate, 1 / 2).counter;
    assert.isAbove(counter(RegularTurn.Steeps), counter(RegularTurn.Carving));
    assert.isAbove(counter(RegularTurn.ShortTurns), counter(RegularTurn.Cruising));
    assert.isAbove(poseTable(RegularTurn.Steeps, Intensity.Moderate).reduce((m, p) => Math.max(m, p.poleTouch), 0), 0.99);
    assert.strictEqual(poseTable(RegularTurn.Carving, Intensity.Moderate).reduce((m, p) => Math.max(m, p.poleTouch), 0), 0);
    assert.strictEqual(Object.keys(REGULAR_TURNS).length, KINDS.length);
  });

  it('stands in for a turning drill without its own pose', () => {
    assert.strictEqual(motionFor('stork-turns', true), 'stork-turns');
    assert.strictEqual(motionFor(RegularTurn.Moguls, true), RegularTurn.Moguls);
    assert.strictEqual(motionFor('javelin-turns', true), RegularTurn.Cruising);
    assert.isNull(motionFor('hockey-stops', false));
  });

  it('sizes a regular pole to the grip standing, upper arm hanging and forearm level', () => {
    // Shoulder 1.45 m up, a 0.3 m upper arm: the elbow, and the fist on the forearm's line, at 1.15 m.
    assert.closeTo(regularPoleReach({ shoulder: 1.45, upperArm: 0.3, fist: 0 }), 1.15, 1e-12);
    assert.closeTo(regularPoleReach({ shoulder: 1.45, upperArm: 0.3, fist: 0.01 }), 1.16, 1e-12);
    assert.closeTo(CAPSULE_ARM.upperArm, 0.3, 1e-12);
    assert.closeTo(poleSize(CAPSULE_ARM).reach, CAPSULE_ARM.shoulder - 0.3 + 0.01, 1e-12);
    // About two thirds of the figure's height, as poles are sized.
    const anatomy = regularPoleReach(fixture.arm);
    assert.isAbove(anatomy, 1.0);
    assert.isBelow(anatomy, 1.2);
  });

  it('shortens only the mogul poles, by about 4-5%', () => {
    const reach = regularPoleReach(fixture.arm);
    for (const kind of KINDS) {
      const share = poleTrimOf(kind) / reach;
      if (kind === RegularTurn.Moguls) {
        assert.isAbove(share, 0.035);
        assert.isBelow(share, 0.05);
      } else assert.strictEqual(share, 0, kind);
    }
    assert.strictEqual(poleTrimOf(null), 0);
    assert.strictEqual(poleTrimOf('stork-turns'), 0);
  });
});
