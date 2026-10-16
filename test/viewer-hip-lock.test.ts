import { assert, describe, it } from '@effect/vitest';
import { BodySide, SEGMENTS, SegmentKind } from '../src/viewer/figure';
import { hipLock, pelvisOnSnow, slopeLock } from '../src/viewer/hip-lock';
import { compose, identity, rotationX, rotationY, rotationZ, transformPoint, translation } from '../src/viewer/mat4';
import type { Mat4 } from '../src/viewer/mat4';
import { POSE_CHANNELS, poseFromChannels, poseToChannels, segmentMatrices, skiIndex } from '../src/viewer/pose';
import type { Pose } from '../src/viewer/pose';

const PELVIS = SEGMENTS.findIndex((s) => s.kind === SegmentKind.Pelvis);
const NEUTRAL = poseFromChannels(POSE_CHANNELS.map(() => 0));
const posed = (changes: Partial<Record<(typeof POSE_CHANNELS)[number], number>>): Pose =>
  poseFromChannels(poseToChannels(NEUTRAL).map((v, i) => changes[POSE_CHANNELS[i] ?? 'lean'] ?? v));
const locked = (pose: Pose, k: number): Mat4 => compose(hipLock(pose), segmentMatrices(pose)[k] ?? identity());
const skiHeading = (m: Mat4): number => {
  const [x0, , z0] = transformPoint(m, [0, 0, 0]);
  const [x1, , z1] = transformPoint(m, [0, 0, 1]);
  return Math.atan2(x1 - x0, z1 - z0);
};
const close = (a: number, b: number, eps = 1e-5): void => assert.isBelow(Math.abs(a - b), eps, `${a} vs ${b}`);

describe('pelvisOnSnow', () => {
  it('reads the heading through a forward fold and a tip', () => {
    const m = compose(translation([0.2, 1, -0.3]), rotationY(0.4), rotationZ(0.2), rotationX(0.9));
    const p = pelvisOnSnow(m);
    close(p.heading, 0.4);
    close(p.x, 0.2);
    close(p.z, -0.3);
  });
});

describe('hipLock', () => {
  const home = pelvisOnSnow(locked(NEUTRAL, PELVIS));
  const turns = [posed({ counter: 0.5 }), posed({ counter: -0.3, lean: 0.6, hipAngulation: 0.2, pelvisPitch: 0.4, pelvisList: 0.1, spineTwist: 0.2 })];

  it('leaves the neutral stance where it stands', () => {
    const m = hipLock(NEUTRAL);
    identity().forEach((v, i) => close(m[i] ?? Number.NaN, v));
  });

  it('holds the pelvis heading and place on the snow through counter and lean', () => {
    for (const pose of turns) {
      const p = pelvisOnSnow(locked(pose, PELVIS));
      close(p.heading, home.heading);
      close(p.x, home.x);
      close(p.z, home.z);
    }
  });

  it('swivels the skis under the hips by the counter', () => {
    const pose = posed({ counter: 0.5 });
    for (const side of [BodySide.Right, BodySide.Left]) close(skiHeading(locked(pose, skiIndex(side))), skiHeading(segmentMatrices(pose)[skiIndex(side)] ?? identity()) + 0.5);
  });

  it('keeps the snow at y = 0', () => {
    for (const pose of turns) close(transformPoint(hipLock(pose), [0.4, 0, -0.7])[1], 0);
  });
});

describe('slopeLock', () => {
  it('turns both skis to the heading and holds the pelvis in place', () => {
    const pose = posed({ counter: 0.4, pelvisPitch: 0.5 });
    const home = pelvisOnSnow(locked(NEUTRAL, PELVIS));
    const m = slopeLock(pose, -0.7);
    for (const side of [BodySide.Right, BodySide.Left]) close(skiHeading(compose(m, segmentMatrices(pose)[skiIndex(side)] ?? identity())), -0.7);
    const p = pelvisOnSnow(compose(m, segmentMatrices(pose)[PELVIS] ?? identity()));
    close(p.heading, -0.7 - 0.4);
    close(p.x, home.x);
    close(p.z, home.z);
  });
});
