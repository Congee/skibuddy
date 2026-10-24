import { assert, describe, it } from '@effect/vitest';
import { BufferAttribute, BufferGeometry } from 'three/webgpu';
import { skiBendOffset } from '../src/viewer/ski-bend-draw';
import { SKI_ROWS, skiGeometryOf } from '../src/viewer/ski-geometry';
import type { Vec3 } from '../src/viewer/mat4';

// A 1.65 x 0.02 x 0.068 box, corners shuffled and tipped about x, skinned to bone 7.
const LENGTH = 1.65;
const THICK = 0.02;
const WIDE = 0.068;
const TILT = 0.3;
const rotate = ([x, y, z]: Vec3): Vec3 => [x, y * Math.cos(TILT) - z * Math.sin(TILT), y * Math.sin(TILT) + z * Math.cos(TILT)];
const ORDER = [5, 2, 7, 0, 3, 6, 1, 4];
const corners = ORDER.map((n): Vec3 => rotate([(n & 1 ? 1 : -1) * WIDE / 2, (n & 2 ? 1 : -1) * THICK / 2, (n & 4 ? 1 : -1) * LENGTH / 2 + 0.3]));
const source = new BufferGeometry();
source.setAttribute('position', new BufferAttribute(new Float32Array(corners.flat()), 3));
source.setAttribute('skinIndex', new BufferAttribute(new Uint16Array(ORDER.flatMap(() => [7, 0, 0, 0])), 4));
source.setAttribute('skinWeight', new BufferAttribute(new Float32Array(ORDER.flatMap(() => [1, 0, 0, 0])), 4));
const upHint = rotate([0, 1, 0]);
const forwardHint = rotate([0, 0, 1]);

describe('the anatomy ski cut into rows for its bend', () => {
  const built = skiGeometryOf(source, SKI_ROWS, upHint, forwardHint);
  const position = built?.geometry.getAttribute('position');

  it('keeps the box: its eight corners and its extent', () => {
    assert.isNotNull(built);
    if (built === null || position === undefined) return;
    assert.closeTo(built.box.length, LENGTH, 1e-5);
    assert.closeTo(built.box.thickness, THICK, 1e-5);
    assert.closeTo(built.box.width, WIDE, 1e-5);
    for (const c of corners) {
      const found = Array.from({ length: position.count }, (_, i) => Math.hypot(position.getX(i) - c[0], position.getY(i) - c[1], position.getZ(i) - c[2]));
      assert.isBelow(Math.min(...found), 1e-5);
    }
  });

  it('gives every vertex the source skin index and weight', () => {
    if (built === null) return;
    const index = built.geometry.getAttribute('skinIndex');
    const weight = built.geometry.getAttribute('skinWeight');
    for (let i = 0; i < index.count; i++) {
      assert.deepStrictEqual([index.getX(i), index.getY(i), index.getZ(i), index.getW(i)], [7, 0, 0, 0]);
      assert.deepStrictEqual([weight.getX(i), weight.getY(i), weight.getZ(i), weight.getW(i)], [1, 0, 0, 0]);
    }
  });

  it('spans tail to tip in SKI_ROWS + 1 rows, base to top above', () => {
    if (built === null || position === undefined) return;
    const along = Array.from({ length: position.count }, (_, i) => position.getY(i) * built.box.along[1] + position.getZ(i) * built.box.along[2] + position.getX(i) * built.box.along[0]);
    const rows = new Set(along.map((a) => a.toFixed(5)));
    assert.strictEqual(rows.size, SKI_ROWS + 1);
    assert.closeTo(Math.max(...along) - Math.min(...along), LENGTH, 1e-5);
    assert.isAbove(built.box.along[2], 0);
    assert.isAbove(built.box.up[1], 0);
  });

  it('is null unless the source is an eight-corner box', () => {
    const four = new BufferGeometry();
    four.setAttribute('position', new BufferAttribute(new Float32Array(12), 3));
    assert.isNull(skiGeometryOf(four, SKI_ROWS, upHint, forwardHint));
  });
});

describe('the shared bend offset', () => {
  it('is 0 at the mount and u²k/2 at the tip', () => {
    const k = 1 / 3.85;
    const tip = LENGTH / 2 - 0.007;
    assert.strictEqual(skiBendOffset(0, k), 0);
    assert.closeTo(skiBendOffset(tip, k), (tip * tip * k) / 2, 1e-12);
    assert.strictEqual(skiBendOffset(tip, 0), 0);
  });
});
