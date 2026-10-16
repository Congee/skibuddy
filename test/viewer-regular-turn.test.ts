import { assert, describe, it } from '@effect/vitest';
import { INTENSITIES, Intensity } from '../src/content/schema';
import { turnForcesAt } from '../src/physics/turn';
import { segmentIndex } from '../src/viewer/figure';
import { inverseRotation, transformPoint } from '../src/viewer/mat4';
import type { Vec3 } from '../src/viewer/mat4';
import { CAPSULE_ARM, CAPSULE_GRIP, poleSize, poseToChannels, regularPoleReach, segmentMatrices } from '../src/viewer/pose';
import { poseTable, samplePose } from '../src/viewer/pose-table';
import { POSE_DEFINITIONS, motionFor, poleTrimOf } from '../src/viewer/poses';
import { headingAt, turnPath } from '../src/viewer/turn-heading';
import { CLOSED_STANCE, OUTSIDE_KNEE_MAX, REGULAR_TURNS, RegularTurn, TURN_STYLES, weightSplit } from '../src/viewer/poses/regular-turn';
import fixture from './anatomy-probe.json';
import { poseAngles } from './pose-angles';

const KINDS = Object.values(RegularTurn);
const angles = (kind: RegularTurn, i: Intensity, t: number): ReturnType<typeof poseAngles> => poseAngles(samplePose(poseTable(kind, i), t));
const DEG = 180 / Math.PI;
const FALL_LINE_KINDS = [RegularTurn.Moguls, 'closed-stance-short-turns'] as const;
const local = (drill: string, t: number, segment: string, point: Vec3, frame: string): Vec3 => {
  const w = segmentMatrices(samplePose(poseTable(drill, Intensity.Moderate), t));
  const m = w[segmentIndex(frame)];
  const p = w[segmentIndex(segment)];
  if (!m || !p) throw new Error(`${segment} in ${frame}`);
  const o = transformPoint(m, [0, 0, 0]);
  const q = transformPoint(p, point);
  return transformPoint(inverseRotation(m), [q[0] - o[0], q[1] - o[1], q[2] - o[2]]);
};
// Left boot from the right one, across the right ski.
const bootGap = (drill: string, t: number): number => {
  const [x, y] = local(drill, t, 'left-boot', [0, 0, 0], 'right-ski');
  const [bx, by] = local(drill, t, 'right-boot', [0, 0, 0], 'right-ski');
  return Math.hypot(x - bx, y - by);
};
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

  it('keeps the outside knee flexed, within its kind and intensity ceiling', () => {
    for (const kind of KINDS)
      for (const i of INTENSITIES)
        for (let k = 0; k < 24; k++) {
          const knee = angles(kind, i, k / 24).knee.right;
          assert.isTrue(knee >= 25 && knee <= OUTSIDE_KNEE_MAX[kind][i], `${kind} ${i} ${k}/24: ${knee.toFixed(1)}`);
        }
  });

  it('reaches a measured GS ankle only when carving dynamically', () => {
    // A GS instructor's outside ankle 18-27 deg (heinrich-2022).
    const peak = (i: Intensity): number => Math.max(...Array.from({ length: 24 }, (_, k) => ankle(RegularTurn.Carving, i, k / 24)));
    assert.isAtLeast(peak(Intensity.Dynamic), 22);
    assert.isAtMost(peak(Intensity.Dynamic), 27);
    assert.isAtLeast(ankle(RegularTurn.Carving, Intensity.Dynamic, 1 / 2), 18);
    assert.isBelow(peak(Intensity.Moderate), peak(Intensity.Dynamic) - 2);
  });

  it('folds deep through the dynamic carving cross-under, toward a measured flexion transition', () => {
    // seifert-2023 near 90 deg; heinrich-2022 GS 56-80 deg; the cross-overs stay tall at the switch.
    const knee = (i: Intensity, t: number): number => angles(RegularTurn.Carving, i, t).knee.right;
    assert.isAtLeast(knee(Intensity.Dynamic, 0), 65);
    assert.isAbove(knee(Intensity.Dynamic, 0), knee(Intensity.Dynamic, 1 / 2) + 12);
    assert.isBelow(knee(Intensity.Moderate, 0), knee(Intensity.Dynamic, 0) - 20);
    assert.isAtLeast(angles(RegularTurn.Carving, Intensity.Dynamic, 0).trunkForward, angles(RegularTurn.Carving, Intensity.Dynamic, 1 / 2).trunkForward);
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

  it('absorbs deeper in moguls at the transition, over a wider range as the intensity grows', () => {
    assert.isAbove(angles(RegularTurn.Moguls, Intensity.Moderate, 0).knee.right, angles(RegularTurn.Carving, Intensity.Moderate, 0).knee.right + 15);
    const span = (i: Intensity): number => {
      const v = Array.from({ length: 24 }, (_, k) => angles(RegularTurn.Moguls, i, k / 24).knee.right);
      return Math.max(...v) - Math.min(...v);
    };
    assert.isAbove(span(Intensity.Moderate), span(Intensity.Gentle) + 4);
    assert.isAbove(span(Intensity.Dynamic), span(Intensity.Moderate) + 4);
    // Elite: near straight to about 100 deg (arndt-1992 pp85, 87).
    assert.isAbove(angles(RegularTurn.Moguls, Intensity.Dynamic, 0).knee.right, 85);
  });

  it('moves forward at initiation and back through the finish, most in moguls', () => {
    const range = (kind: RegularTurn, f: (a: ReturnType<typeof poseAngles>) => number): number => {
      const v = Array.from({ length: 24 }, (_, k) => f(angles(kind, Intensity.Moderate, k / 24)));
      return Math.max(...v) - Math.min(...v);
    };
    for (const kind of [RegularTurn.Cruising, RegularTurn.Carving]) {
      const com = (t: number): number => angles(kind, Intensity.Moderate, t).comAhead;
      assert.isAbove(com(1 / 6), com(1 / 2) + 0.02, kind);
      assert.isAbove(com(1 / 2), com(5 / 6), kind);
    }
    // Crest at the transition: ankles closed, feet pulled back; trough at the fall line: legs long, tips down.
    const mogul = (t: number): ReturnType<typeof poseAngles> => angles(RegularTurn.Moguls, Intensity.Moderate, t);
    assert.isAbove(mogul(0).dorsiflexion.right, mogul(1 / 2).dorsiflexion.right + 12);
    // At the transition the balance is over both feet, the countered outside one trailing.
    assert.isAbove(mogul(0).comAhead - mogul(0).lead / 2, mogul(1 / 2).comAhead + 0.05);
    assert.isAbove(mogul(0).knee.right, mogul(1 / 2).knee.right + 25);
    assert.isAbove(range(RegularTurn.Moguls, (a) => a.dorsiflexion.right), 2 * range(RegularTurn.Carving, (a) => a.dorsiflexion.right));
  });

  it('keeps the closed-stance hips near the boots in the deep stance', () => {
    for (let k = 0; k < 24; k++) {
      const a = poseAngles(samplePose(poseTable('closed-stance-short-turns', Intensity.Moderate), k / 24));
      // Near the outside boot, or at the transition, where the countered outside foot trails, between both.
      assert.isAbove(Math.max(a.hipsAhead, a.hipsAhead - a.lead / 2), -0.1, `${k}/24`);
    }
  });

  it('keeps both skis on the snow, the inside leg more flexed mid-turn but in moguls', () => {
    for (const kind of KINDS) {
      const a = angles(kind, Intensity.Moderate, 1 / 2);
      assert.closeTo(a.insideTip, 0, 0.01, kind);
      assert.closeTo(a.insideTail, 0, 0.02, kind);
      // Moguls: legs together over a near-upright mass, flexed alike.
      if (kind === RegularTurn.Moguls) assert.closeTo(a.knee.left, a.knee.right, 5, kind);
      else assert.isAbove(a.knee.left, a.knee.right, kind);
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
    // Signed: facing the last turn's outside at the transition, square on the fall line, the most into the next.
    for (const drill of [RegularTurn.Moguls, 'closed-stance-short-turns']) {
      assert.isBelow(at(drill, 0), -30, drill);
      assert.isBelow(Math.abs(at(drill, 1 / 2)), 1, drill);
      assert.isAbove(at(drill, 5 / 6), 25, drill);
      assert.isAbove(at(drill, 0.999), 30, drill);
      for (let k = 1; k < 24; k++) assert.isAbove(at(drill, k / 24), at(drill, (k - 1) / 24), `${drill} ${k}/24`);
    }
  });

  it('never lets the spine twist lead the pelvis: the hips drive the shoulders', () => {
    for (const [drill, def] of Object.entries(POSE_DEFINITIONS)) {
      const peak = (f: (k: (typeof def.keys)[number]) => number): number => Math.max(...def.keys.map(f));
      const twist = peak((k) => k.spineTwist);
      const counter = peak((k) => k.counter);
      // While counter builds, twist builds no sooner; as it unwinds the chest may hold.
      const top = def.keys.findIndex((k) => k.counter === counter);
      for (const [i, k] of def.keys.entries()) {
        assert.isAtMost(Math.abs(k.spineTwist), Math.abs(k.counter) + 1e-9, `${drill} ${k.t}`);
        if (twist > 0 && i <= top) assert.isAtMost(k.spineTwist / twist, k.counter / counter + 1e-9, `${drill} ${k.t}`);
      }
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

  it('skis moguls and closed stance with the legs together', () => {
    for (const drill of FALL_LINE_KINDS)
      for (let k = 0; k < 24; k++) {
        const gap = bootGap(drill, k / 24);
        assert.isBelow(gap, 0.17, `${drill} ${k}/24`);
        assert.isBelow(gap, 0.8 * bootGap(RegularTurn.Cruising, k / 24), `${drill} ${k}/24`);
      }
  });

  it('keeps the mogul mass near upright: the lean bounded, the edge from the legs', () => {
    for (const style of [TURN_STYLES[RegularTurn.Moguls], CLOSED_STANCE])
      for (const i of INTENSITIES) {
        const tilt = Math.max(...Array.from({ length: 96 }, (_, k) => Math.abs(turnForcesAt(style.scenarios[i], k / 96).tilt)));
        assert.isAtMost(tilt * DEG, 20, i);
        assert.isAtLeast(tilt * DEG, 8, i);
      }
    const mogul = angles(RegularTurn.Moguls, Intensity.Moderate, 1 / 2);
    assert.isAbove(mogul.edge.right, turnForcesAt(TURN_STYLES[RegularTurn.Moguls].scenarios.moderate, 1 / 2).tilt * DEG + 10);
  });

  it('plants the mogul pole lightly, both hands in front of the chest', () => {
    for (const drill of FALL_LINE_KINDS)
      for (const side of ['left', 'right']) {
        const [x, , z] = local(drill, 1 / 24, `${side}-forearm`, CAPSULE_GRIP, 'trunk');
        assert.isAbove(z, 0.3, `${drill} ${side}`);
        assert.isBelow(Math.abs(x), 0.22, `${drill} ${side}`);
      }
    const wide = Math.abs(local(RegularTurn.Cruising, 1 / 2, 'right-forearm', CAPSULE_GRIP, 'trunk')[0]);
    assert.isBelow(Math.abs(local(RegularTurn.Moguls, 1 / 2, 'right-forearm', CAPSULE_GRIP, 'trunk')[0]), wide - 0.03);
  });

  it('faces the head down the fall line in moguls, with the chest elsewhere', () => {
    for (const drill of FALL_LINE_KINDS)
      for (const i of INTENSITIES)
        for (let k = 0; k < 24; k++) {
          const p = samplePose(poseTable(drill, i), k / 24);
          const head = p.counter + p.spineTwist + p.headYaw;
          assert.closeTo(head * DEG, headingAt(k / 24, turnPath(drill, i)) * DEG, 1.5, `${drill} ${i} ${k}/24`);
        }
    for (const kind of KINDS.filter((k) => k !== RegularTurn.Moguls))
      for (let k = 0; k < 24; k++) assert.strictEqual(samplePose(poseTable(kind, Intensity.Moderate), k / 24).headYaw, 0, kind);
  });
});
