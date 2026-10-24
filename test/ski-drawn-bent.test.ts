import { assert, describe, it } from '@effect/vitest';
import { BEND_RADIUS_MAX_M, BEND_REFERENCE, bendCurvatureOf } from '../src/physics/ski-bend';
import { POSE_CHANNELS, poseFromChannels, poseToChannels } from '../src/viewer/pose';
import { TABLE_SCALE, decodeTable, encodeTable } from '../src/viewer/pose-table';
import { bentAt, skiPoints } from '../src/viewer/motion/turn';
import { SKI_MOUNT, Terrain } from '../src/viewer/skier';

describe('the ski drawn bent by its load', () => {
  const ski = skiPoints(Terrain.Moguls);
  const tip = ski.points[0] ?? ski.centre;
  const R = BEND_REFERENCE.radiusM;

  it('raises the base u² / 2R along its normal: L_tip² / 2R at the tip, nothing at the boot', () => {
    const lTip = tip[2] - SKI_MOUNT;
    assert.closeTo(bentAt(ski, tip, R)[1] - tip[1], (lTip * lTip) / (2 * R), 1e-12);
    assert.strictEqual(bentAt(ski, ski.centre, R)[1], ski.centre[1]);
    // Tail and tip rise alike: the same sign either side of the mount.
    assert.isAbove(bentAt(ski, ski.points[4] ?? ski.centre, R)[1], ski.centre[1]);
  });

  it('draws straight at the bend radius cap', () => {
    const lTip = tip[2] - SKI_MOUNT;
    assert.isAtMost((bendCurvatureOf(BEND_RADIUS_MAX_M) * lTip * lTip) / 2, 1e-6);
    assert.closeTo(bendCurvatureOf(R), 1 / R, 1e-15);
  });

  it('bakes each ski bend as a channel, and reads a table baked before it as straight', () => {
    assert.includeMembers([...POSE_CHANNELS], ['outside.bend', 'inside.bend']);
    const values = POSE_CHANNELS.map((c, i) => (c.endsWith('.bend') ? 1 / R : 0.01 * (i + 1)));
    const pose = poseFromChannels(values);
    assert.closeTo(pose.outside.bend, 1 / R, 1e-15);
    assert.closeTo(decodeTable(encodeTable([pose]))[0]?.inside.bend ?? NaN, 1 / R, TABLE_SCALE);
    const before = POSE_CHANNELS.filter((c) => !c.endsWith('.bend'));
    const old = decodeTable(encodeOld(before, values), before)[0];
    assert.strictEqual(old?.outside.bend, 0);
    assert.strictEqual(old?.inside.bend, 0);
    poseToChannels(old ?? pose).forEach((v, i) => {
      if (!(POSE_CHANNELS[i] ?? '').endsWith('.bend')) assert.closeTo(v, values[i] ?? NaN, TABLE_SCALE, POSE_CHANNELS[i]);
    });
  });
});

/** A one-sample run stored under an older channel list. */
const encodeOld = (channels: ReadonlyArray<string>, values: ReadonlyArray<number>): string => {
  const run = Int16Array.from(channels, (c) => Math.round((values[POSE_CHANNELS.indexOf(c as (typeof POSE_CHANNELS)[number])] ?? 0) / TABLE_SCALE));
  let s = '';
  for (const b of new Uint8Array(run.buffer)) s += String.fromCharCode(b);
  return btoa(s);
};
