import { assert, describe, it } from '@effect/vitest';
import { JOINT_LIMITS, Provenance } from '../src/viewer/joint-limits';
import { transformPoint } from '../src/viewer/mat4';
import type { Mat4, Vec3 } from '../src/viewer/mat4';
import { bindingInSegment, COORDINATES, forwardKinematics, REST_POSE, restWorld, rigidInverse, SEGMENT_NAMES, segmentLengths, Side, SKELETON_DATA } from '../src/viewer/skeleton';
import { anatomyBody, REFERENCE_SKIER } from '../src/viewer/skier';

const col = (m: Mat4, c: number): Vec3 => [m[c * 4] ?? 0, m[c * 4 + 1] ?? 0, m[c * 4 + 2] ?? 0];
const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dist = (a: Vec3, b: Vec3): number => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const mirror = (v: Vec3): Vec3 => [-v[0], v[1], v[2]];
const MM = 1e-3;
const DEG = Math.PI / 180;

describe('ISB skeleton', () => {
  const rest = forwardKinematics();

  it('puts every segment at its joint centre at rest, within a millimetre', () => {
    for (const name of SEGMENT_NAMES) {
      const seg = SKELETON_DATA.segments[name];
      const m = rest[name];
      assert.isDefined(seg);
      assert.isDefined(m);
      if (seg === undefined || m === undefined) continue;
      assert.isBelow(dist(col(m, 3), seg.origin), MM, name);
      for (const [i, axis] of [seg.x, seg.y, seg.z].entries()) assert.isBelow(dist(col(m, i), axis), 1e-5, `${name} axis ${i}`);
    }
  });

  it('carries the landmarks rigidly: each lands back on itself at rest', () => {
    const owner: Readonly<Record<string, string>> = {
      femoral_head: 'femur', ASIS: 'pelvis', PSIS: 'pelvis', ME: 'femur', LE: 'femur', MC: 'tibia', LC: 'tibia', MM: 'tibia', LM: 'tibia',
      GH: 'humerus', EL: 'humerus', EM: 'humerus', US: 'forearm', RS: 'forearm', AA: 'scapula', TS: 'scapula', AI: 'scapula',
    };
    let checked = 0;
    for (const [key, p] of Object.entries(SKELETON_DATA.landmarks)) {
      const [base, side] = key.split('.');
      const seg = base === undefined ? undefined : owner[base];
      const name = seg === undefined ? 'thorax' : seg === 'pelvis' ? seg : `${seg}.${side}`;
      const m = rest[name];
      if (m === undefined || (seg === undefined && side !== undefined)) continue;
      const local = transformPoint(rigidInverse(restWorld(name)), p);
      assert.isBelow(dist(transformPoint(m, local), p), MM, key);
      checked++;
    }
    assert.strictEqual(checked, Object.keys(SKELETON_DATA.landmarks).length);
  });

  it('has orthonormal, right-handed ISB frames', () => {
    for (const name of SEGMENT_NAMES) {
      const s = SKELETON_DATA.segments[name];
      if (s === undefined) continue;
      for (const a of [s.x, s.y, s.z]) assert.closeTo(Math.hypot(...a), 1, 1e-5, name);
      assert.closeTo(dot(s.x, s.y), 0, 1e-5, name);
      assert.closeTo(dot(s.y, s.z), 0, 1e-5, name);
      assert.closeTo(dot(s.z, s.x), 0, 1e-5, name);
      assert.isBelow(dist(cross(s.x, s.y), s.z), 1e-5, name);
    }
  });

  it('points x anterior (+z in glTF), y up and z to the body right (-x) on both sides', () => {
    for (const name of SEGMENT_NAMES) {
      const s = SKELETON_DATA.segments[name];
      if (s === undefined) continue;
      assert.isAbove(s.x[2], 0.5, name);
      assert.isAbove(s.y[1], 0.5, name);
      assert.isBelow(s.z[0], -0.5, name);
    }
  });

  it('mirrors left onto right: origins and x, y reflect, z (always to the right) reflects and flips', () => {
    for (const name of SEGMENT_NAMES.filter((n) => n.endsWith('.R'))) {
      const r = SKELETON_DATA.segments[name];
      const l = SKELETON_DATA.segments[name.replace(/\.R$/, '.L')];
      assert.isDefined(l, name);
      if (r === undefined || l === undefined) continue;
      assert.isBelow(dist(mirror(r.origin), l.origin), MM, name);
      assert.isBelow(dist(mirror(r.x), l.x), 1e-3, name);
      assert.isBelow(dist(mirror(r.y), l.y), 1e-3, name);
      assert.isBelow(dist(mirror(r.z), [-l.z[0], -l.z[1], -l.z[2]]), 1e-3, name);
    }
  });

  it('moves mirrored coordinates mirror-wise: hip flexion and adduction on either side', () => {
    const q = { ...REST_POSE, 'hip_flexion.R': 0.6, 'hip_flexion.L': 0.6, 'hip_adduction.R': 0.2, 'hip_adduction.L': 0.2, 'hip_rotation.R': 0.3, 'hip_rotation.L': 0.3 };
    const fk = forwardKinematics(q);
    const [r, l] = [fk['tibia.R'], fk['tibia.L']];
    assert.isDefined(r);
    assert.isDefined(l);
    if (r === undefined || l === undefined) return;
    assert.isBelow(dist(mirror(col(r, 3)), col(l, 3)), MM);
    // Flexion swings the knee forward, adduction toward the midline.
    const knee = col(r, 3);
    const hip = SKELETON_DATA.joints['hip.R'] ?? [0, 0, 0];
    assert.isAbove(knee[2] - hip[2], 0.2);
    assert.isAbove(knee[0], hip[0]);
  });

  it('has the segment lengths skier.ts gives the record skier, within a millimetre', () => {
    const want = anatomyBody(REFERENCE_SKIER.height);
    assert.closeTo(SKELETON_DATA.height, REFERENCE_SKIER.height, 1e-9);
    for (const [k, v] of Object.entries(segmentLengths())) assert.closeTo(v, want[k as keyof typeof want], MM, k);
  });

  it('records the femoral and humeral head sphere fits with sub-1.5 mm residuals', () => {
    for (const [k, f] of Object.entries(SKELETON_DATA.fits)) {
      assert.isBelow(f.rms, 1.5e-3, k);
      assert.isAbove(f.points, 100, k);
    }
  });

  it('hangs the binding under the foot, below the ankle, and carries it with the foot', () => {
    for (const s of [Side.Right, Side.Left]) {
      const foot = rest[`foot.${s}`];
      assert.isDefined(foot);
      if (foot === undefined) continue;
      const binding = transformPoint(foot, transformPoint(bindingInSegment(s), [0, 0, 0]));
      const ankle = SKELETON_DATA.gear_fit[s].ankle;
      assert.isBelow(binding[1], ankle[1] - 0.05, s);
      assert.isBelow(Math.abs(binding[0] - ankle[0]), 0.03, s);
    }
  });
});

describe('joint limits', () => {
  it('bounds every coordinate, lower below upper, each bound with a provenance and source', () => {
    for (const c of COORDINATES) {
      const lim = JOINT_LIMITS[c.name];
      assert.isDefined(lim, c.name);
      if (lim === undefined) continue;
      assert.isAtMost(lim.lower.value, lim.upper.value, c.name);
      for (const b of [lim.lower, lim.upper]) {
        assert.include(Object.values(Provenance), b.provenance, c.name);
        assert.isAbove(b.source.length, 0, c.name);
      }
      if (c.locked === true) assert.strictEqual(lim.lower.provenance, Provenance.Locked, c.name);
    }
  });

  it('holds the rest pose inside every limit but the knee, whose template rests past the mean extension', () => {
    for (const c of COORDINATES.filter((k) => !k.name.startsWith('knee_flexion'))) {
      const lim = JOINT_LIMITS[c.name];
      const q = REST_POSE[c.name] ?? 0;
      if (lim === undefined) continue;
      assert.isAtLeast(q, lim.lower.value, c.name);
      assert.isAtMost(q, lim.upper.value, c.name);
    }
  });

  it('measures the template knee 3.7 degrees hyperextended along its joint-centre lines', () => {
    for (const s of [Side.Right, Side.Left]) assert.closeTo((REST_POSE[`knee_flexion.${s}`] ?? 0) / DEG, -3.7, 0.1, s);
  });
});
