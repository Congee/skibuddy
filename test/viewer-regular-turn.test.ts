import { assert, describe, it } from '@effect/vitest';
import { drillScenarios } from '../scripts/anatomy/drill-scenarios';
import { INTENSITIES, Intensity } from '../src/content/schema';
import { PHASE_T, turnForcesAt } from '../src/physics/turn';
import { gazeHeading } from '../src/viewer/gaze';
import { EQUIPMENT } from '../src/viewer/equipment';
import { segmentIndex } from '../src/viewer/figure';
import { identity, inverseRotation, transformPoint } from '../src/viewer/mat4';
import type { Vec3 } from '../src/viewer/mat4';
import { CAPSULE_ARM, CAPSULE_GRIP, MID_FOOT, aheadOnSki, SKI_TAIL, SKI_TIP, centreOfMass, mirrorPose, poleSize, poseToChannels, regularPoleReach, segmentMatrices } from '../src/viewer/pose';
import { forceTiltAt, solvePose } from '../src/viewer/pose-solver';
import { poseTable, samplePose } from '../src/viewer/pose-table';
import { POSE_DEFINITIONS, motionFor, poleTrimOf } from '../src/viewer/poses';
import { SurfaceKind, surfaceFor } from '../src/viewer/surface';
import { CORRIDOR_SHARE, TOPS_POSE, headingAt, turnPath } from '../src/viewer/turn-heading';
import { CLOSED_STANCE, OUTSIDE_KNEE_MAX, REGULAR_TURNS, RegularTurn, TURN_STYLES, weightSplit } from '../src/viewer/poses/regular-turn';
import fixture from './anatomy-probe.json';
import { poseAngles } from './pose-angles';
import { SIDES, clearance, ridden } from './ride-probes';

const KINDS = Object.values(RegularTurn);
const surfaces = new Map<string, ReturnType<typeof surfaceFor>>();
const surfaceOf = (drill: string, i: Intensity): ReturnType<typeof surfaceFor> => {
  const key = `${drill} ${i}`;
  const s = surfaces.get(key) ?? surfaceFor(drill, i);
  surfaces.set(key, s);
  return s;
};
// Braking drills balance on the snow's force line, tilted uphill of the slope normal.
const brakeOf = (drill: string, i: Intensity, t: number): number => forceTiltAt(drillScenarios(drill)[i], surfaceOf(drill, i), t);
const anglesOf = (drill: string, i: Intensity, t: number): ReturnType<typeof poseAngles> => poseAngles(samplePose(poseTable(drill, i), t), brakeOf(drill, i, t));
const angles: (kind: RegularTurn, i: Intensity, t: number) => ReturnType<typeof poseAngles> = anglesOf;
const DEG = 180 / Math.PI;
const DEG_RAD = Math.PI / 180;
const FALL_LINE_KINDS = [RegularTurn.Moguls, 'closed-stance-short-turns'] as const;
// The bumps pitch the skis, so mogul turns balance along the snow, not along the ski.
const balanceOf = (kind: string, a: ReturnType<typeof poseAngles>): number => (kind === RegularTurn.Moguls ? a.comOnSnow : a.comAhead);
// Head turned toward the outside of the turn beyond the skis.
const headOnSkis = (kind: RegularTurn, i: Intensity, t: number): number => {
  const p = samplePose(poseTable(kind, i), t);
  return p.counter + p.spineTwist + p.headYaw;
};
const LOOKING_KINDS = KINDS.filter((k) => k !== RegularTurn.Moguls);
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
          // Mogul knees extend near straight into the troughs (arndt-1992 pp79, 87).
          assert.isTrue(knee >= (kind === RegularTurn.Moguls ? 10 : 25) && knee <= OUTSIDE_KNEE_MAX[kind][i], `${kind} ${i} ${k}/24: ${knee.toFixed(1)}`);
        }
  });

  it('reaches a measured GS ankle only when carving dynamically', () => {
    // A GS instructor's outside ankle 18-27 deg (heinrich-2022).
    const peak = (i: Intensity): number => Math.max(...Array.from({ length: 24 }, (_, k) => ankle(RegularTurn.Carving, i, k / 24)));
    assert.isAtLeast(peak(Intensity.Dynamic), 22);
    assert.isAtMost(peak(Intensity.Dynamic), 27);
    // Through the control phase; the feet then slide ahead to the finish (lemaster-2010 p81).
    assert.isAtLeast(ankle(RegularTurn.Carving, Intensity.Dynamic, 1 / 3), 18);
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
    // The zipper's trunk follows its shin instead, below.
    for (const kind of KINDS.filter((k) => k !== RegularTurn.Moguls))
      for (const i of INTENSITIES) {
        const trunk = angles(kind, i, 1 / 2).trunkForward;
        assert.isTrue(trunk >= 15 && trunk <= 40, `${kind} ${i}: ${trunk.toFixed(1)}`);
      }
  });

  it('presses the shin forward at a carve initiation and opens it by the finish', () => {
    const margin = { gentle: 1.5, moderate: 2.5, dynamic: 4 } as const;
    for (const i of INTENSITIES) assert.isAbove(ankle(RegularTurn.Carving, i, 1 / 6), ankle(RegularTurn.Carving, i, 5 / 6) + margin[i], i);
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

  it('extends the mogul legs into the trough and folds them over the crest', () => {
    // Extension right after the top of the bump (fis-freestyle-judging-2025 p28), knees near straight (arndt-1992 p79).
    // In the zipper's ruts the knees stay flexed between the moguls (fis p28, arndt-1992 p93).
    for (const drill of [RegularTurn.Moguls, TOPS_POSE])
      for (const i of INTENSITIES) {
        const knees = Array.from({ length: 24 }, (_, k) => anglesOf(drill, i, k / 24).knee);
        const v = knees.map((k) => k.right);
        assert.isAtMost(Math.min(...v), drill === TOPS_POSE ? 28 : 40, `${drill} ${i} trough`);
        assert.isAtLeast(Math.max(...v), Math.min(...v) + 35, `${drill} ${i} crest`);
        if (drill === RegularTurn.Moguls) assert.isAtLeast(Math.min(...knees.map((k) => Math.min(k.left, k.right))), 15, `${i} never straight`);
      }
  });

  it('keeps the zipper upper body upright through the absorption', () => {
    // Upright through the whole absorption, not hinging forward (fis-freestyle-judging-2025 p28); bound as the trunk test's.
    for (const i of INTENSITIES)
      for (let k = 0; k < 24; k++) assert.isAtMost(angles(RegularTurn.Moguls, i, k / 24).trunkForward, 40, `${i} ${k}/24`);
  });

  it('lines the zipper trunk up with the shin at the crest and stands it up behind the shin down the backside', () => {
    // Fully flexed the trunk is about parallel to the shin; extending, the shins drive forward under a much more upright upper body (gellie-2019-moguls-forward 06:00-06:20, 10:13).
    const behind = (i: Intensity, t: number): number => {
      const a = angles(RegularTurn.Moguls, i, t);
      return a.shinForward.right - a.trunkForward;
    };
    for (const i of INTENSITIES) {
      const { crest } = surfaceFor(RegularTurn.Moguls, i);
      for (const t of [0, crest]) assert.isAtMost(Math.abs(behind(i, t)), 10, `${i} crest t=${t}`);
      const backside = Array.from({ length: 13 }, (_, k) => behind(i, 0.05 + (k * 0.3) / 12));
      assert.isAtLeast(Math.max(...backside), 10, `${i} backside`);
      for (let k = 0; k < 48; k++) assert.isAtLeast(behind(i, k / 48), -5, `${i} ${k}/48`);
    }
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
    // Over the crest: ankles closed, feet pulled back; in the trough: legs long, tips down.
    for (const drill of [RegularTurn.Moguls, TOPS_POSE]) {
      const { crest, trough } = surfaceFor(drill, Intensity.Moderate);
      const mogul = (t: number): ReturnType<typeof poseAngles> => anglesOf(drill, Intensity.Moderate, t);
      assert.isAbove(mogul(crest).dorsiflexion.right, mogul(trough).dorsiflexion.right + 12, drill);
      // Near the transition the balance is over both feet, the countered outside one trailing.
      assert.isAbove(mogul(crest).comOnSnow - mogul(crest).lead / 2, mogul(trough).comOnSnow + 0.05, drill);
      assert.isAbove(mogul(crest).knee.right, mogul(trough).knee.right + 25, drill);
    }
    assert.isAbove(range(RegularTurn.Moguls, (a) => a.dorsiflexion.right), 2 * range(RegularTurn.Carving, (a) => a.dorsiflexion.right));
  });

  it('keeps the mass over the feet: never behind the heels nor past the ball', () => {
    // About ball to back of arch over one foot or the other (lemaster-2010 p85); the heel is 0.095 behind the mid-foot.
    for (const kind of [...KINDS, 'closed-stance-short-turns'])
      for (const i of INTENSITIES)
        for (let k = 0; k < 24; k++) {
          const a = anglesOf(kind, i, k / 24);
          const com = balanceOf(kind, a);
          assert.isAbove(Math.max(com, com - a.lead), -0.04, `${kind} ${i} ${k}/24`);
          assert.isBelow(Math.min(com, com - a.lead), 0.095, `${kind} ${i} ${k}/24`);
        }
  });

  it('keeps the chest over the outside knee through the turn, the trunk within 40 deg', () => {
    // Chest over the knees (lemaster-2010 pp57, 182-183); behind the knee is the slip-and-catch fault
    // (jordan-sporri-taylor-2023 pp120-121). 2 cm slack and the 40 deg cap inferred.
    const drills = Object.keys(POSE_DEFINITIONS).filter((d) => d !== RegularTurn.Moguls && d !== TOPS_POSE);
    // The dolphin sits back over the tails from the pole touch to the landing, the tips off the snow.
    const airborne = (drill: string, t: number): boolean => drill === DOLPHIN && (t >= 5 / 6 || t <= 1 / 12);
    for (const drill of drills)
      for (const i of INTENSITIES)
        for (let k = 0; k < SAMPLES; k++) {
          const t = k / SAMPLES;
          if (airborne(drill, t)) continue;
          const w = segmentMatrices(samplePose(poseTable(drill, i), t));
          const at = (segment: string, point: Vec3): Vec3 => transformPoint(w[segmentIndex(segment)] ?? identity(), point);
          const foot = at('right-boot', MID_FOOT);
          const gap = aheadOnSki(w, at('trunk', [0, 0.45, 0]), foot) - aheadOnSki(w, at('right-shin', [0, 0, 0]), foot);
          assert.isAtLeast(gap, -0.02, `${drill} ${i} ${k}/${SAMPLES} chest`);
          assert.isAtMost(anglesOf(drill, i, t).trunkForward, 40, `${drill} ${i} ${k}/${SAMPLES} trunk`);
        }
  });

  it('balances further forward at initiation than at the finish in every kind', () => {
    // Shorter path at the transition, tips into the control phase, feet ahead by the finish (lemaster-2010 pp81, 85-86).
    for (const kind of KINDS)
      for (const i of INTENSITIES) {
        // Ahead of the feet's midpoint: counter staggers them, the outside foot leading after the switch.
        const ahead = (t: number): number => balanceOf(kind, angles(kind, i, t)) - angles(kind, i, t).lead / 2;
        assert.isAbove(ahead(1 / 12), ahead(5 / 6) + 0.01, `${kind} ${i}`);
      }
  });

  it('moves the feet under the hips with the ankle, not by pitching the trunk', () => {
    // Fore-aft from the ankles, the upper body still (lemaster-2010 p81).
    const range = (kind: RegularTurn, i: Intensity, f: (a: ReturnType<typeof poseAngles>) => number): number => {
      const v = Array.from({ length: 24 }, (_, k) => f(angles(kind, i, k / 24)));
      return Math.max(...v) - Math.min(...v);
    };
    for (const kind of KINDS) {
      for (const i of INTENSITIES) assert.isAtLeast(range(kind, i, (a) => a.dorsiflexion.right), 2, `${kind} ${i}`);
      assert.isAbove(range(kind, Intensity.Dynamic, (a) => a.dorsiflexion.right), range(kind, Intensity.Gentle, (a) => a.dorsiflexion.right), kind);
      assert.isAtLeast(range(kind, Intensity.Moderate, (a) => a.hipsAhead), 0.04, kind);
    }
    // Cruising and carving: the shin carries the fore-aft, the trunk about as still.
    for (const kind of [RegularTurn.Cruising, RegularTurn.Carving])
      for (const i of INTENSITIES) assert.isBelow(range(kind, i, (a) => a.trunkForward), 2 * range(kind, i, (a) => a.dorsiflexion.right), `${kind} ${i}`);
  });

  it('carries the fore-aft smoothly through the switch into the mirrored turn', () => {
    const fore = (kind: string, i: Intensity, p: ReturnType<typeof samplePose>, t: number): readonly number[] => {
      const a = poseAngles(p, brakeOf(kind, i, t));
      return [balanceOf(kind, a) - a.lead / 2, a.hipsAhead - a.lead / 2, a.trunkForward / 100];
    };
    for (const kind of [...KINDS, 'closed-stance-short-turns'])
      for (const i of INTENSITIES) {
        const table = poseTable(kind, i);
        const seq = [...table, mirrorPose(table[0] ?? samplePose(table, 0))].map((p, j) => fore(kind, i, p, j / table.length));
        const steps = seq.slice(1).map((v, j) => Math.max(...v.map((x, n) => Math.abs(x - (seq[j]?.[n] ?? x)))));
        const wrap = steps.at(-1) ?? 0;
        assert.isAtMost(wrap, 1.25 * Math.max(...steps.slice(0, -1)), `${kind} ${i}`);
        // A trunk folded toward the fall line tips fast as the lean builds after an anticipated switch.
        assert.isBelow(Math.max(...steps), 0.03, `${kind} ${i}`);
      }
  });

  it('stands over the mid-foot at every transition: the mogul crest folds the legs, not the trunk', () => {
    // Feet under the hips and shoulders, head up (fis-freestyle-judging-2025 pp26, 29); bounds inferred.
    for (const kind of [...KINDS, 'closed-stance-short-turns'])
      for (const i of INTENSITIES) {
        const p = samplePose(poseTable(kind, i), 0);
        const w = segmentMatrices(p);
        const at = (segment: string, point: Vec3 = [0, 0, 0]): Vec3 => transformPoint(w[segmentIndex(segment)] ?? identity(), point);
        const half = (a: Vec3, b: Vec3): Vec3 => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
        const mid = half(at('right-boot', MID_FOOT), at('left-boot', MID_FOOT));
        // Ahead of the snow's force line through the mid-foot.
        const ahead = (q: Vec3): number => q[2] - mid[2] + Math.tan(brakeOf(kind, i, 0)) * Math.hypot(q[0] - mid[0], q[1] - mid[1]);
        assert.isAbove(ahead(half(at('right-thigh'), at('left-thigh'))), -0.2, `${kind} ${i} hips`);
        assert.isBelow(ahead(at('head')), 0.3, `${kind} ${i} head`);
        assert.isAtMost(poseAngles(p).trunkForward, 50, `${kind} ${i} trunk`);
      }
    const crest = angles(RegularTurn.Moguls, Intensity.Moderate, 0);
    assert.isAbove(crest.hip.right, crest.trunkForward + 25);
  });

  it('keeps the closed-stance hips over the heels', () => {
    for (const i of INTENSITIES)
      for (let k = 0; k < 24; k++) {
        const a = poseAngles(samplePose(poseTable('closed-stance-short-turns', i), k / 24));
        // Near the outside boot, or at the transition, where the countered outside foot trails, between both.
        // Heel about 0.095 behind the mid-foot; the balanced mass keeps the flexed hips near it, the deeper dynamic knees a little behind.
        assert.isAbove(Math.max(a.hipsAhead, a.hipsAhead - a.lead / 2), i === Intensity.Dynamic ? -0.16 : -0.15, `${i} ${k}/24`);
      }
  });

  it('skis the closed stance flat on groomed snow, the knees together and flexed alike', () => {
    for (const i of INTENSITIES)
      for (let k = 0; k < 24; k++) {
        const p = samplePose(poseTable('closed-stance-short-turns', i), k / 24);
        const a = poseAngles(p);
        const w = segmentMatrices(p);
        for (const side of ['right', 'left'])
          for (const z of [-0.7, 0, 0.8]) {
            const ski = w[segmentIndex(`${side}-ski`)] ?? identity();
            assert.closeTo(transformPoint(ski, [0, -0.01, z])[1], 0, 0.02, `${i} ${k}/24 ${side} at z=${z}`);
          }
        assert.closeTo(a.knee.left, a.knee.right, 6, `${i} ${k}/24`);
      }
  });

  it('keeps both skis on the snow, the inside leg more flexed mid-turn but in moguls', () => {
    for (const kind of KINDS) {
      const a = angles(kind, Intensity.Moderate, 1 / 2);
      if (kind === RegularTurn.Moguls) {
        // On the bumps each rigid ski rests on the snow under it, not on the root's plane.
        const r = ridden(surfaceFor(kind, Intensity.Moderate), 1 / 2, samplePose(poseTable(kind, Intensity.Moderate), 1 / 2));
        for (const side of SIDES) assert.closeTo(clearance(r, side), 0, 0.01, `${kind} ${side}`);
      } else {
        assert.closeTo(a.insideTip, 0, 0.01, kind);
        assert.closeTo(a.insideTail, 0, 0.02, kind);
      }
      // Moguls: legs together over a near-upright mass, flexed alike.
      if (kind === RegularTurn.Moguls) assert.closeTo(a.knee.left, a.knee.right, 6, kind);
      else assert.isAbove(a.knee.left, a.knee.right, kind);
    }
  });

  it('changes edges at the transition and tips the new edges early', () => {
    for (const kind of KINDS)
      for (const i of INTENSITIES) {
        const edge = (t: number): number => angles(kind, i, t).edge.right;
        const peak = Math.max(...Array.from({ length: 24 }, (_, k) => edge(k / 24)));
        assert.isBelow(Math.abs(edge(0)), 5, `${kind} ${i} flat at the transition`);
        // End of initiation, before the fall line; powder's strong counter adds its edge late in the turn.
        assert.isAtLeast(edge(1 / 3), (kind === RegularTurn.Powder ? 0.38 : 0.4) * peak, `${kind} ${i}`);
        // In moguls the legs extend into the trough, so the knees edge a little less there.
        if (kind !== RegularTurn.Moguls) assert.isAbove(edge(1 / 2), edge(1 / 3), `${kind} ${i} still growing`);
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
    for (const drill of [RegularTurn.Moguls, TOPS_POSE, 'closed-stance-short-turns']) {
      assert.isBelow(Math.abs(at(drill, 1 / 2)), 1, drill);
      if (drill !== RegularTurn.Moguls) {
        assert.isBelow(at(drill, 0), -30, drill);
        assert.isAbove(at(drill, 5 / 6), 25, drill);
        assert.isAbove(at(drill, 0.999), 30, drill);
      }
      for (let k = 1; k < 24; k++) assert.isAbove(at(drill, k / 24), at(drill, (k - 1) / 24), `${drill} ${k}/24`);
    }
    // In moguls the chest and hips face the fall line (user's rule): the counter tracks the skis' heading; bound inferred.
    for (const i of INTENSITIES) {
      const path = turnPath(RegularTurn.Moguls, i);
      for (let k = 0; k < 24; k++) {
        const p = samplePose(poseTable(RegularTurn.Moguls, i), k / 24);
        const chest = poseAngles(p).counter + p.spineTwist / DEG_RAD - headingAt(k / 24, path) / DEG_RAD;
        assert.isBelow(Math.abs(chest), 7, `${i} ${k}/24`);
      }
    }
  });

  it('anticipates short turns and steeps: the chest near the fall line at the switch, the head inside its cap', () => {
    const chestOffFallLine = (kind: RegularTurn, i: Intensity, t: number): number => {
      const p = samplePose(poseTable(kind, i), t);
      return (p.counter + p.spineTwist - headingAt(t, turnPath(kind, i))) * DEG;
    };
    for (const kind of [RegularTurn.ShortTurns, RegularTurn.Steeps])
      for (const i of INTENSITIES) {
        assert.isAtMost(Math.abs(chestOffFallLine(kind, i, 0)), i === Intensity.Gentle ? 25 : 20, `${kind} ${i}`);
        assert.isBelow(Math.abs(samplePose(poseTable(kind, i), 0).headYaw) * DEG, 25, `${kind} ${i}`);
        // Signed through the switch into the mirrored turn, square to the skis on the fall line.
        const at = (t: number): number => angles(kind, i, t).counter;
        assert.isBelow(at(0), -25, `${kind} ${i}`);
        assert.closeTo(at(0.999), -at(0), 1, `${kind} ${i}`);
        assert.isBelow(Math.abs(at(1 / 2)), 1, `${kind} ${i}`);
        for (let k = 1; k < 24; k++) assert.isAbove(at(k / 24), at((k - 1) / 24), `${kind} ${i} ${k}/24`);
      }
    const peak = (kind: RegularTurn): number => Math.abs(angles(kind, Intensity.Moderate, 0).counter);
    assert.isAbove(peak(RegularTurn.Steeps), peak(RegularTurn.ShortTurns));
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
    const counter = (k: RegularTurn): number => Math.max(...Array.from({ length: 24 }, (_, j) => Math.abs(angles(k, Intensity.Moderate, j / 24).counter)));
    assert.isAbove(counter(RegularTurn.Steeps), counter(RegularTurn.Carving));
    assert.isAbove(counter(RegularTurn.ShortTurns), counter(RegularTurn.Cruising));
    assert.isAbove(poseTable(RegularTurn.Steeps, Intensity.Moderate).reduce((m, p) => Math.max(m, p.poleTouch), 0), 0.99);
    assert.strictEqual(poseTable(RegularTurn.Carving, Intensity.Moderate).reduce((m, p) => Math.max(m, p.poleTouch), 0), 0);
    assert.strictEqual(Object.keys(REGULAR_TURNS).length, KINDS.length);
  });

  it('stands in for a turning drill without its own pose', () => {
    assert.strictEqual(motionFor('stork-turns', true), 'stork-turns');
    assert.strictEqual(motionFor(RegularTurn.Moguls, true), RegularTurn.Moguls);
    assert.strictEqual(motionFor('moguls', true), RegularTurn.Moguls);
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

  it('leads with the inside tip from the fall-line chest drills, level at the switch', () => {
    // Observed side-on in Olivia Giaccio's closed-stance short turns: about level at the edge change, then 3-13 cm ahead.
    const tipLead = (drill: string, i: Intensity, t: number): number => {
      const w = segmentMatrices(samplePose(poseTable(drill, i), t));
      const [outside, inside] = [w[segmentIndex('right-ski')], w[segmentIndex('left-ski')]];
      if (!outside || !inside) throw new Error(drill);
      const [o, a, b] = [transformPoint(outside, [0, 0, 0]), transformPoint(outside, [0, 0, 1]), transformPoint(outside, SKI_TIP)];
      const c = transformPoint(inside, SKI_TIP);
      return (c[0] - b[0]) * (a[0] - o[0]) + (c[1] - b[1]) * (a[1] - o[1]) + (c[2] - b[2]) * (a[2] - o[2]);
    };
    for (const drill of [RegularTurn.ShortTurns, RegularTurn.Moguls, RegularTurn.Steeps, RegularTurn.Powder, TOPS_POSE, 'closed-stance-short-turns'])
      for (const i of INTENSITIES)
        for (let k = 0; k < 96; k++) {
          const lead = tipLead(drill, i, k / 96);
          assert.isAtLeast(lead, -0.03, `${drill} ${i} ${k}/96`);
          assert.isAtMost(lead, EQUIPMENT.soleLength / 2, `${drill} ${i} ${k}/96`);
          // Square to the fall line the countered hips set no lead; a millimetre of solver slack.
          if (k / 96 >= 0.3) assert.isAtLeast(lead, -0.001, `${drill} ${i} ${k}/96`);
        }
  });

  it('keeps the mogul mass near upright: the lean bounded, the edge from the legs', () => {
    const peakTilt = (style: (typeof TURN_STYLES)[RegularTurn], i: Intensity): number =>
      Math.max(...Array.from({ length: 96 }, (_, k) => Math.abs(turnForcesAt(style.scenarios[i], k / 96).tilt))) * DEG;
    for (const i of INTENSITIES) {
      const closed = peakTilt(CLOSED_STANCE, i);
      assert.isAtMost(closed, 20, i);
      assert.isAtLeast(closed, 8, i);
      // The zipper's mass line leans with the turn: atan(v^2 / (r g)) on the mass's path, more as it tightens at the apex.
      const s = TURN_STYLES[RegularTurn.Moguls].scenarios[i];
      const tilt = peakTilt(TURN_STYLES[RegularTurn.Moguls], i);
      assert.isAtMost(tilt, Math.atan(s.speedMps ** 2 / ((s.comRadiusM ?? s.radiusM) * 9.81)) * DEG + 8, i);
      assert.isAtLeast(tilt, 8, i);
      // The legs make the angulation, so the shoulders tip well short of the mass line.
      const shoulders = Array.from({ length: 24 }, (_, k) => Math.abs(angles(RegularTurn.Moguls, i, k / 24).shoulderList));
      assert.isAtMost(Math.max(...shoulders), 0.65 * tilt, `${i} shoulders`);
    }
    const mogul = angles(RegularTurn.Moguls, Intensity.Moderate, 1 / 2);
    // The mass rides the force line, so the legs make the whole margin.
    assert.isAbove(mogul.edge.right, turnForcesAt(TURN_STYLES[RegularTurn.Moguls].scenarios.moderate, 1 / 2).tilt * DEG + 5);
  });

  it('plants the mogul pole lightly, both hands in front of the chest', () => {
    for (const drill of FALL_LINE_KINDS)
      for (const side of ['left', 'right']) {
        const [x, , z] = local(drill, 1 / 24, `${side}-forearm`, CAPSULE_GRIP, 'trunk');
        assert.isAbove(z, 0.3, `${drill} ${side}`);
        assert.isBelow(Math.abs(x), 0.23, `${drill} ${side}`);
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
  });

  it('keeps the head within 30 deg of the chest', () => {
    for (const drill of [...KINDS, 'closed-stance-short-turns'])
      for (const i of INTENSITIES)
        for (let k = 0; k < 96; k++) assert.isAtMost(Math.abs(samplePose(poseTable(drill, i), k / 96).headYaw) * DEG, 30.01, `${drill} ${i} ${k}/96`);
  });

  it('keeps the powder head near the chest, well inside its cap', () => {
    const rule = TURN_STYLES[RegularTurn.Powder].head;
    if (rule === undefined) throw new Error(RegularTurn.Powder);
    for (const i of INTENSITIES) {
      const s = TURN_STYLES[RegularTurn.Powder].scenarios[i];
      const path = { radius: s.radiusM, corridor: CORRIDOR_SHARE * s.radiusM };
      for (let k = 0; k < 96; k++) {
        const t = k / 96;
        const p = samplePose(poseTable(RegularTurn.Powder, i), t);
        // Unclamped: the gaze's heading on the chest.
        const ask = headingAt(t, path) - gazeHeading(rule, path, s.speedMps, t) - p.counter - p.spineTwist;
        assert.isAtMost(Math.abs(ask) * DEG, 20, `${i} ${k}/96`);
      }
    }
  });

  it('looks inside the carving arc at shaping, not at the turn centre', () => {
    for (const i of INTENSITIES) {
      const inside = -headOnSkis(RegularTurn.Carving, i, PHASE_T.shaping) * DEG;
      assert.isAtLeast(inside, 10, i);
      assert.isAtMost(inside, 30, i);
    }
  });

  it('turns the head toward the next turn before the transition', () => {
    for (const kind of LOOKING_KINDS)
      for (const i of INTENSITIES) assert.isAbove(headOnSkis(kind, i, 11 / 12) * DEG, 10, `${kind} ${i}`);
  });

  it('mirrors the head into the next turn', () => {
    for (const kind of LOOKING_KINDS)
      for (const i of INTENSITIES) {
        const rule = TURN_STYLES[kind].head;
        if (rule === undefined) throw new Error(kind);
        const s = TURN_STYLES[kind].scenarios[i];
        const path = { radius: s.radiusM, corridor: CORRIDOR_SHARE * s.radiusM };
        for (let k = 0; k < 12; k++) assert.closeTo(gazeHeading(rule, path, s.speedMps, k / 12 + 1), -gazeHeading(rule, path, s.speedMps, k / 12), 1e-9, `${kind} ${i} ${k}/12`);
        const def = POSE_DEFINITIONS[kind];
        if (def === undefined) throw new Error(kind);
        const head = (t: number): number => {
          const p = solvePose(def, t, s);
          return p.counter + p.spineTwist + p.headYaw;
        };
        assert.closeTo(head(1 - 1e-9) * DEG, -head(0) * DEG, 0.5, `${kind} ${i}`);
      }
  });
});

const POWDER = RegularTurn.Powder;
const SAMPLES = 24;
// Seen along the skis, degrees and metres toward the inside of the turn from the slope's normal and the snow's force line.
interface Frontal {
  readonly lean: number;
  readonly trunk: number;
  readonly legs: number;
  readonly pitch: number;
  readonly com: number;
  readonly insideFoot: number;
}
const frontal = (p: ReturnType<typeof samplePose>): Frontal => {
  const w = segmentMatrices(p);
  const at = (segment: string, point: Vec3): Vec3 => transformPoint(w[segmentIndex(segment)] ?? identity(), point);
  const tilt = (from: Vec3, to: Vec3): number => Math.atan2(to[0] - from[0], to[1] - from[1]) * DEG;
  const foot = at('right-ski', [0, SKI_TIP[1], 0]);
  const inward = (q: Vec3): number => (q[0] - foot[0]) * Math.cos(p.lean) - (q[1] - foot[1]) * Math.sin(p.lean);
  const trunk = [at('trunk', [0, 0, 0]), at('trunk', [0, 1, 0])] as const;
  return {
    lean: p.lean * DEG,
    trunk: tilt(...trunk),
    legs: tilt(at('right-shin', [0, -0.43, 0]), at('right-thigh', [0, 0, 0])),
    pitch: Math.atan2(trunk[1][2] - trunk[0][2], trunk[1][1] - trunk[0][1]) * DEG,
    com: inward(centreOfMass(w)),
    insideFoot: inward(at('left-ski', [0, SKI_TIP[1], 0])),
  };
};
const FRONTAL_KINDS = [...KINDS, 'closed-stance-short-turns'] as const;
// Lean past which the trunk is balanced over the outside ski, as in the solver.
const SETTLED = 20;
// Metres the mass may sit past the inside ski; steeps reaches 5 cm early in the fold.
const COM_SLACK = 0.055;
// Metres the mass may sit off the force line once settled.
const COM_LINE = 0.02;

describe('angulation', () => {
  it('angulates rather than banks: the trunk tilts in no further than the legs once the turn is edged', () => {
    for (const kind of FRONTAL_KINDS)
      for (const i of INTENSITIES)
        for (const p of poseTable(kind, i)) {
          const f = frontal(p);
          if (Math.abs(f.lean) >= SETTLED) assert.isAtMost(f.trunk, f.legs + 2, `${kind} ${i} lean ${f.lean.toFixed(1)}`);
        }
  });

  it('keeps the trunk pitched no more than 50 deg forward of the slope normal', () => {
    for (const kind of FRONTAL_KINDS)
      for (const i of INTENSITIES) for (const p of poseTable(kind, i)) assert.isAtMost(frontal(p).pitch, 50, `${kind} ${i}`);
  });

  it('keeps the mass on the force line through the outside ski, inside the stance once edged', () => {
    for (const kind of FRONTAL_KINDS)
      for (const i of INTENSITIES)
        for (const p of poseTable(kind, i)) {
          const f = frontal(p);
          if (Math.abs(f.lean) < SETTLED) continue;
          assert.isAtMost(Math.abs(f.com), COM_LINE, `${kind} ${i} lean ${f.lean.toFixed(1)}`);
          assert.isAtMost(f.com, f.insideFoot + COM_SLACK, `${kind} ${i} lean ${f.lean.toFixed(1)}`);
        }
  });

  it('tips the trunk smoothly through the switch into the mirrored turn', () => {
    for (const kind of FRONTAL_KINDS)
      for (const i of INTENSITIES) {
        const table = poseTable(kind, i);
        const seq = [...table, mirrorPose(table[0] ?? samplePose(table, 0))].map((p) => frontal(p).trunk);
        const steps = seq.slice(1).map((v, j) => Math.abs(v - (seq[j] ?? v)));
        assert.isAtMost(Math.max(...steps), 6, `${kind} ${i}`);
      }
  });
});

// Centre of mass from between the mid-feet: the legs' extension, whatever the lean.
const extension = (p: ReturnType<typeof samplePose>): number => {
  const w = segmentMatrices(p);
  const at = (segment: string): Vec3 => transformPoint(w[segmentIndex(segment)] ?? identity(), MID_FOOT);
  const [r, l, c] = [at('right-boot'), at('left-boot'), centreOfMass(w)];
  return Math.hypot(c[0] - (r[0] + l[0]) / 2, c[1] - (r[1] + l[1]) / 2, c[2] - (r[2] + l[2]) / 2);
};
// Degrees tip-up of each ski.
const pitch = (p: ReturnType<typeof samplePose>): readonly [number, number] => [-p.outside.tailLift * DEG, -p.inside.tailLift * DEG];
const cycle = (i: Intensity): ReadonlyArray<number> => Array.from({ length: SAMPLES }, (_, k) => extension(samplePose(poseTable(POWDER, i), k / SAMPLES)));
const popRange = (i: Intensity): number => Math.max(...cycle(i)) - Math.min(...cycle(i));
const peakPitch = (i: Intensity): number => Math.max(...poseTable(POWDER, i).map((p) => pitch(p)[0]));

describe('powder pop', () => {

  it('extends highest near the switch and sinks lower by shaping', () => {
    const margin = { gentle: 0.025, moderate: 0.04, dynamic: 0.06 } as const;
    for (const i of INTENSITIES) {
      const v = cycle(i);
      const top = v.indexOf(Math.max(...v));
      assert.isAtMost(Math.min(top, SAMPLES - top), 1, `${i} top at ${top}/${SAMPLES}`);
      assert.isAbove(v[0] ?? 0, (v[SAMPLES / 2] ?? 0) + margin[i], i);
      // Deepest through the finish, loading the skis.
      const low = v.indexOf(Math.min(...v));
      assert.isAtLeast(low, (3 * SAMPLES) / 4, `${i} low at ${low}/${SAMPLES}`);
    }
  });

  it('pitches the tips up before the switch and down after it, both skis alike', () => {
    for (const i of INTENSITIES) {
      const before = pitch(samplePose(poseTable(POWDER, i), 11 / 12));
      const after = pitch(samplePose(poseTable(POWDER, i), 1 / 12));
      assert.isAbove(before[0], 1.5, `${i} tips up`);
      assert.isBelow(after[0], -0.5, `${i} tips down`);
      // The dive smaller than the rise, so the front never digs in (iasi-2021 p87).
      assert.isBelow(-after[0], before[0], i);
      assert.closeTo(before[1], before[0], 1e-3, i);
      assert.closeTo(after[1], after[0], 1e-3, i);
      assert.closeTo(pitch(samplePose(poseTable(POWDER, i), 1 / 2))[0], 0, 0.05, `${i} flat at shaping`);
    }
  });

  it('carries the pop smoothly through the switch into the mirrored turn', () => {
    for (const i of INTENSITIES) {
      const table = poseTable(POWDER, i);
      const seq = [...table, mirrorPose(table[0] ?? samplePose(table, 0))].map((p) => [extension(p), pitch(p)[0] / 100, pitch(p)[1] / 100]);
      const steps = seq.slice(1).map((v, j) => Math.max(...v.map((x, n) => Math.abs(x - (seq[j]?.[n] ?? x)))));
      assert.isAtMost(steps.at(-1) ?? 0, Math.max(...steps.slice(0, -1)), i);
      assert.isBelow(Math.max(...steps), 0.02, i);
    }
  });

  it('keeps both ends of both skis on or over the packed base', () => {
    for (const i of INTENSITIES)
      for (let k = 0; k < 96; k++) {
        const w = segmentMatrices(samplePose(poseTable(POWDER, i), k / 96));
        for (const ski of ['right-ski', 'left-ski'])
          for (const end of [SKI_TIP, SKI_TAIL]) assert.isAtLeast(transformPoint(w[segmentIndex(ski)] ?? identity(), end)[1], -0.01, `${i} ${ski} ${k}/96`);
      }
  });

  it('pops harder at dynamic than at gentle', () => {
    assert.isAbove(popRange(Intensity.Dynamic), popRange(Intensity.Gentle) + 0.05);
    assert.isAbove(peakPitch(Intensity.Dynamic), peakPitch(Intensity.Gentle) + 2);
  });

  it('keeps every other kind and drill flat off the bumps, only the stork tail lifting', () => {
    for (const drill of Object.keys(POSE_DEFINITIONS).filter((d) => d !== POWDER && d !== DOLPHIN))
      for (const i of INTENSITIES.filter((n) => surfaceFor(drill, n).kind !== SurfaceKind.Moguls))
        for (const p of poseTable(drill, i)) {
          assert.strictEqual(p.outside.tailLift, 0, `${drill} ${i}`);
          assert.isAtLeast(p.inside.tailLift, 0, `${drill} ${i}`);
        }
  });
});

const DOLPHIN = 'dolphin-turns';
const dolphin = (i: Intensity, t: number): ReturnType<typeof samplePose> => samplePose(poseTable(DOLPHIN, i), t);
// Centre of mass ahead of the outside mid-foot along the snow, metres.
const aheadOnSnow = (p: ReturnType<typeof samplePose>): number => {
  const w = segmentMatrices(p);
  return centreOfMass(w)[2] - transformPoint(w[segmentIndex('right-boot')] ?? identity(), MID_FOOT)[2];
};
// The lower ski tip's height over the snow.
const tipHeight = (p: ReturnType<typeof samplePose>): number => {
  const w = segmentMatrices(p);
  return Math.min(...['right-ski', 'left-ski'].map((s) => transformPoint(w[segmentIndex(s)] ?? identity(), SKI_TIP)[1]));
};
const FINISH = Array.from({ length: SAMPLES / 6 }, (_, k) => 5 / 6 + k / SAMPLES);

describe('dolphin turn', () => {
  it('has its own pose', () => {
    assert.strictEqual(motionFor(DOLPHIN, true), DOLPHIN);
  });

  it('lifts both tips clearly through the finish, more at dynamic', () => {
    const least = { gentle: 7, moderate: 10, dynamic: 14 } as const;
    const peak = (i: Intensity): number => Math.max(...FINISH.map((t) => pitch(dolphin(i, t))[0]));
    for (const i of INTENSITIES) {
      assert.isAtLeast(peak(i), least[i], i);
      const p = pitch(dolphin(i, 11 / 12));
      assert.closeTo(p[1], p[0], 1e-3, i);
    }
    assert.isAbove(peak(Intensity.Dynamic), peak(Intensity.Gentle) + 4);
  });

  it('points the tips down off the snow in the transition and lands them first', () => {
    for (const i of INTENSITIES) {
      assert.isBelow(pitch(dolphin(i, 0))[0], -3, i);
      assert.isAbove(tipHeight(dolphin(i, 0)), 0.015, `${i} skis off the snow`);
      // Tips down at the landing, the tails still up.
      assert.isBelow(pitch(dolphin(i, 1 / 12))[0], -1, i);
      for (let k = 0; k < SAMPLES; k++) assert.isAtLeast(tipHeight(dolphin(i, k / SAMPLES)), -1e-3, `${i} tip in the snow at ${k}`);
      assert.closeTo(dolphin(i, 1 / 2).rise, 0, 1e-3, `${i} on the snow at shaping`);
    }
    assert.isAbove(tipHeight(dolphin(Intensity.Dynamic, 0)), tipHeight(dolphin(Intensity.Gentle, 0)) + 0.02);
  });

  it('plants the pole as the tips leave the snow', () => {
    const touch = POSE_DEFINITIONS[DOLPHIN]?.constraints.poleTouch;
    if (touch == null) throw new Error(DOLPHIN);
    for (const i of INTENSITIES) {
      const peak = Math.max(...FINISH.map((t) => tipHeight(dolphin(i, t))));
      const share = tipHeight(dolphin(i, touch.t)) / peak;
      assert.isAtLeast(share, 0.35, i);
      assert.isAtMost(share, 0.65, i);
      // Before the skis leave the snow, the tips still on it at shaping.
      assert.closeTo(dolphin(i, touch.t).rise, 0, 1e-3, i);
      assert.isBelow(tipHeight(dolphin(i, 1 / 2)), 0.005, i);
      assert.isAbove(Math.abs(dolphin(i, touch.t).poleTouch), 0.99, i);
    }
  });

  it('sits back over the tails at the finish and ahead at initiation', () => {
    for (const i of INTENSITIES) {
      assert.isBelow(aheadOnSnow(dolphin(i, 11 / 12)), -0.05, `${i} finish`);
      assert.isBelow(aheadOnSnow(dolphin(i, 5 / 6)), -0.03, `${i} finish`);
      assert.isAbove(aheadOnSnow(dolphin(i, 1 / 6)), 0.03, `${i} initiation`);
    }
    assert.isBelow(aheadOnSnow(dolphin(Intensity.Dynamic, 11 / 12)), aheadOnSnow(dolphin(Intensity.Gentle, 11 / 12)) - 0.04);
  });

  it('carries through the switch into the mirrored turn', () => {
    for (const i of INTENSITIES) {
      const table = poseTable(DOLPHIN, i);
      const seq = [...table, mirrorPose(table[0] ?? dolphin(i, 0))].map((p) => [aheadOnSnow(p), pitch(p)[0] / 100, pitch(p)[1] / 100, p.rise, extension(p)]);
      const steps = seq.slice(1).map((v, j) => Math.max(...v.map((x, n) => Math.abs(x - (seq[j]?.[n] ?? x)))));
      assert.isAtMost(steps.at(-1) ?? 0, Math.max(...steps.slice(0, -1)), i);
      assert.isBelow(Math.max(...steps), 0.05, i);
    }
  });

  it('keeps every other drill on the snow', () => {
    for (const drill of Object.keys(POSE_DEFINITIONS).filter((d) => d !== DOLPHIN && d !== POWDER))
      for (const i of INTENSITIES) for (const p of poseTable(drill, i)) assert.strictEqual(p.rise, 0, `${drill} ${i}`);
  });
});
