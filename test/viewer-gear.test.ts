import { assert, describe, it } from '@effect/vitest';
import { Vector3 } from 'three';
import type { BufferGeometry } from 'three';
import { cuffGeometry, gloveGeometry, poleGeometry, shellGeometry } from '../src/viewer/gear';
import { CAPSULE_BOOT, bootFitFrom, capsuleGlove, coveredByBoot, gloveFrom, parseGearFit } from '../src/viewer/gear-fit';
import type { RawFit } from '../src/viewer/gear-fit';
import { GearMode, isGearMode } from '../src/viewer/gear-mode';
import { POLE } from '../src/viewer/pose';

const RAW: RawFit = {
  ankle: [0.07, 0.066, -0.035],
  grip: [0.28, 0.78, 0.05],
  fistA: [0, -1, 0],
  fistN: [-1, 0, 0],
  fist: [-0.06, 0.05, -0.03, 0.05, -0.05, 0.05],
  sole: -0.021,
  toe: 0.137,
  heel: -0.092,
  footX: [0.049, 0.146],
  shinX: [0.037, 0.133],
  shinZ: [-0.102, 0.001],
};

/** Share of vertices whose normal points away from the centroid in the xz plane. */
const outward = (g: BufferGeometry): number => {
  const pos = g.getAttribute('position');
  const nor = g.getAttribute('normal');
  const c = new Vector3();
  for (let i = 0; i < pos.count; i++) c.add(new Vector3(pos.getX(i), pos.getY(i), pos.getZ(i)));
  c.divideScalar(pos.count);
  let out = 0;
  for (let i = 0; i < pos.count; i++) {
    const d = new Vector3(pos.getX(i) - c.x, pos.getY(i) - c.y, pos.getZ(i) - c.z);
    if (d.dot(new Vector3(nor.getX(i), nor.getY(i), nor.getZ(i))) > 0) out++;
  }
  return out / pos.count;
};

describe('gear fit', () => {
  it('reads the bake extra and rejects anything else', () => {
    assert.isNotNull(parseGearFit(JSON.stringify({ R: RAW, L: RAW })));
    assert.isNull(parseGearFit(JSON.stringify({ R: RAW })));
    assert.isNull(parseGearFit('{'));
    assert.isNull(parseGearFit(undefined));
  });

  it('puts the boot around the foot and leg with the sole on the ski', () => {
    const fit = bootFitFrom(RAW);
    assert.closeTo(fit.sole, RAW.sole - RAW.ankle[1], 1e-9);
    assert.isAbove(fit.toe, RAW.toe - RAW.ankle[2]);
    assert.isBelow(fit.heel, RAW.heel - RAW.ankle[2]);
    assert.isAbove(fit.halfWidth * 2, RAW.footX[1] - RAW.footX[0]);
    assert.isAbove(fit.cuffRx * 2, RAW.shinX[1] - RAW.shinX[0]);
  });

  it('marks points inside the boot so pins avoid them', () => {
    const ankle = RAW.ankle;
    const fit = bootFitFrom(RAW);
    assert.isTrue(coveredByBoot(fit, ankle, [ankle[0], ankle[1] + 0.1, ankle[2]]));
    assert.isFalse(coveredByBoot(fit, ankle, [ankle[0], ankle[1] + 0.3, ankle[2]]));
    assert.isFalse(coveredByBoot(fit, ankle, [-ankle[0], ankle[1] + 0.1, ankle[2]]));
  });
});

describe('gear geometry', () => {
  it('faces outward, so front-face-only translucency shows one layer', () => {
    assert.isAbove(outward(shellGeometry(CAPSULE_BOOT)), 0.95);
    assert.isAbove(outward(cuffGeometry(CAPSULE_BOOT)), 0.95);
    assert.isAbove(outward(gloveGeometry(capsuleGlove(1))), 0.9);
    assert.isAbove(outward(gloveGeometry(gloveFrom(RAW))), 0.9);
  });

  it('closes the glove round the grip', () => {
    const g = gloveGeometry(gloveFrom(RAW));
    g.computeBoundingBox();
    assert.isTrue(g.boundingBox?.containsPoint(new Vector3(...RAW.grip)));
  });

  it('gives every gear geometry a material group over all its triangles', () => {
    for (const g of [gloveGeometry(gloveFrom(RAW)), gloveGeometry(capsuleGlove(1)), poleGeometry()]) {
      const covered = g.groups.reduce((sum, group) => sum + group.count, 0);
      assert.strictEqual(covered, g.index?.count);
    }
  });

  it('spans the boot from heel to toe and sole to cuff top', () => {
    const g = shellGeometry(CAPSULE_BOOT);
    g.computeBoundingBox();
    const box = g.boundingBox;
    assert.isNotNull(box);
    assert.closeTo(box?.min.y ?? 0, CAPSULE_BOOT.sole, 1e-6);
    assert.closeTo(box?.min.z ?? 0, CAPSULE_BOOT.heel, 1e-6);
    assert.closeTo(box?.max.z ?? 0, CAPSULE_BOOT.toe, 1e-6);
    const cuff = cuffGeometry(CAPSULE_BOOT);
    cuff.computeBoundingBox();
    assert.isAbove(cuff.boundingBox?.max.y ?? 0, CAPSULE_BOOT.cuffTop);
  });

  it('runs the pole from the grip down to the spike', () => {
    const g = poleGeometry();
    g.computeBoundingBox();
    assert.closeTo(g.boundingBox?.min.y ?? 0, -POLE.reach, 1e-6);
    assert.isAbove(g.boundingBox?.max.y ?? 0, 0.05);
    assert.strictEqual(g.groups.length, 2);
  });
});

describe('gear mode', () => {
  it('accepts only the three modes', () => {
    assert.isTrue(isGearMode(GearMode.Off));
    assert.isFalse(isGearMode('glass'));
    assert.isFalse(isGearMode(null));
  });
});
