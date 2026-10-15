import { assert, describe, it } from '@effect/vitest';
import { SkinnedMesh, Vector3, Vector4 } from 'three';
import { BodySide } from '../src/viewer/figure';
import { parseGearFit } from '../src/viewer/gear-fit';
import type { Vec3 } from '../src/viewer/mat4';
import { POLE, POLE_TOUCH_T, poleDirection, poleTouchAt } from '../src/viewer/pose';
import { loadAnatomy } from './anatomy-model';
import { anatomyProbe, capsuleProbe } from './figure-probes';
import type { FigureProbe, LegSide } from './figure-probes';

const TIMES = Array.from({ length: 96 }, (_, i) => i / 96);
const DEG = Math.PI / 180;

const heading = (ski: { readonly tip: Vec3; readonly tail: Vec3 }): number => Math.atan2(ski.tip[0] - ski.tail[0], ski.tip[2] - ski.tail[2]);

/** The basket at turn time `t`; only the inside (left) pole touches. */
const basket = (probe: FigureProbe, t: number, side: LegSide): { readonly grip: Vec3; readonly basket: Vec3 } => {
  const at = probe.at(t);
  const grip = at.grip(side);
  const d = poleDirection(grip, side, side === BodySide.Left ? poleTouchAt(t) : 0, at.ankle(side));
  return { grip, basket: [grip[0] + d[0] * POLE.basket, grip[1] + d[1] * POLE.basket, grip[2] + d[2] * POLE.basket] };
};

const invariants = (load: () => Promise<FigureProbe>): void => {
  it('keeps the skis parallel all through the turn', async () => {
    const probe = await load();
    for (const t of TIMES) {
      const at = probe.at(t);
      const diff = Math.abs(heading(at.ski(BodySide.Left)) - heading(at.ski(BodySide.Right)));
      assert.isBelow(diff, 2 * DEG, `t=${t}`);
    }
  });

  it('touches the inside basket to the snow beside the inside ski, from binding toe to mid-forebody', async () => {
    const probe = await load();
    const at = probe.at(POLE_TOUCH_T);
    const { basket: b } = basket(probe, POLE_TOUCH_T, BodySide.Left);
    const ankle = at.ankle(BodySide.Left);
    const { tip } = at.ski(BodySide.Left);
    assert.closeTo(b[1], 0, 0.01);
    assert.isAbove(b[2], ankle[2] + 0.12, 'behind the binding toe');
    assert.isBelow(b[2], ankle[2] + 0.5, 'past mid-forebody');
    assert.isBelow(b[2], tip[2], 'ahead of the tip');
    assert.isAbove(b[0] - ankle[0], 0.1, 'on the ski');
    assert.isBelow(b[0] - ankle[0], 0.4, 'far from the ski');
  });

  it('keeps the inside basket off the snow outside the touch, close to the hand', async () => {
    const probe = await load();
    for (const t of TIMES) {
      const { grip, basket: b } = basket(probe, t, BodySide.Left);
      if (poleTouchAt(t) < 0.9) assert.isAbove(b[1], 0.002, `t=${t}`);
      if (poleTouchAt(t) === 0) assert.isAbove(b[1], 0.25, `t=${t}`);
      assert.isBelow(Math.abs(b[0] - grip[0]), 0.35, `lateral at t=${t}`);
    }
  });

  it('never plants the outside pole and carries both back and down', async () => {
    const probe = await load();
    for (const t of TIMES) {
      const { grip, basket: b } = basket(probe, t, BodySide.Right);
      assert.isAbove(b[1], 0.25, `t=${t}`);
      assert.isBelow(b[2], grip[2] - 0.3, `t=${t}`);
    }
  });
};

describe('capsule skis and poles', () => invariants(async () => capsuleProbe));

describe('anatomy skis and poles', () => {
  let probe: Promise<FigureProbe> | undefined;
  invariants(() => (probe ??= anatomyProbe()));
});

describe('anatomy hands on the grips', () => {
  it('closes the bare fingers round each grip and lays the thumb on it', async () => {
    const model = await loadAnatomy();
    let bones: SkinnedMesh | undefined;
    model.root.traverse((o) => {
      if (bones === undefined && o instanceof SkinnedMesh && !Array.isArray(o.material) && o.material.name === 'bone') bones = o;
    });
    const raw = parseGearFit(model.root.getObjectByName('bones')?.userData['gear_fit']);
    if (bones === undefined || raw === null) throw new Error('no bones or gear fit');
    const mesh = bones;
    const index = mesh.geometry.getAttribute('skinIndex');
    const weight = mesh.geometry.getAttribute('skinWeight');
    const names = mesh.skeleton.bones.map((b) => b.name);
    const owner = (i: number): string | undefined => {
      const k = [0, 1, 2, 3].reduce((a, b) => (weight.getComponent(i, b) > weight.getComponent(i, a) ? b : a));
      return names[index.getComponent(i, k)];
    };
    const count = mesh.geometry.getAttribute('position').count;
    const on = (parts: ReadonlyArray<string>): ReadonlyArray<number> => Array.from({ length: count }, (_, i) => i).filter((i) => parts.includes(owner(i) ?? ''));
    const sides = [
      { side: BodySide.Right, letter: 'R', grip: raw.right.grip },
      { side: BodySide.Left, letter: 'L', grip: raw.left.grip },
    ] as const;
    const hands = sides.map(({ side, letter, grip }) => ({
      side,
      letter,
      grip: model.carried(`hand.${letter}`, new Vector3(...grip)),
      fingers: on([`fingers${letter}`, `fingertips${letter}`]),
      palm: on([`hand${letter}`]),
      thumb: on([`thumbtip${letter}`]),
    }));
    const v = new Vector4();
    const p = new Vector3();
    for (const t of [0, POLE_TOUCH_T, 0.5, 5 / 6]) {
      model.pose(t);
      for (const { side, letter, grip, fingers, palm, thumb } of hands) {
        const g = grip();
        const ankle = model.bone(`foot.${letter}`).getWorldPosition(new Vector3());
        const d = new Vector3(...poleDirection([g.x, g.y, g.z], side, side === BodySide.Left ? poleTouchAt(t) : 0, [ankle.x, ankle.y, ankle.z]));
        const e1 = new Vector3(0, 1, 0).cross(d).normalize();
        const e2 = d.clone().cross(e1);
        // Radius and angle about the pole's axis.
        const around = (i: number): { readonly r: number; readonly angle: number } => {
          const pos = mesh.geometry.getAttribute('position');
          mesh.applyBoneTransform(i, v.set(pos.getX(i), pos.getY(i), pos.getZ(i), 1));
          const q = mesh.localToWorld(p.set(v.x, v.y, v.z)).sub(g);
          q.addScaledVector(d, -q.dot(d));
          return { r: q.length(), angle: Math.atan2(q.dot(e2), q.dot(e1)) };
        };
        const at = `${letter} at t=${t}`;
        const wrap = fingers.map(around);
        assert.isAbove(Math.min(...wrap.map((w) => w.r)), 0.015, `fingers clear of the grip, ${at}`);
        assert.isBelow(wrap.reduce((sum, w) => sum + w.r, 0) / wrap.length, 0.035, `fingers closed on the grip, ${at}`);
        // With the palm, the curled fingers enclose the grip.
        const angles = [...wrap, ...palm.map(around).filter((w) => w.r < 0.035)].map((w) => w.angle).toSorted((a, b) => a - b);
        const gaps = angles.map((a, i) => (angles[i + 1] ?? (angles[0] ?? 0) + 2 * Math.PI) - a);
        assert.isBelow(Math.max(...gaps), Math.PI / 2, `fist closed round the grip, ${at}`);
        const lay = thumb.map(around);
        assert.isAbove(Math.min(...lay.map((w) => w.r)), 0.015, `thumb clear of the grip, ${at}`);
        assert.isBelow(lay.reduce((sum, w) => sum + w.r, 0) / lay.length, 0.04, `thumb on the grip, ${at}`);
      }
    }
  });
});

describe('pole touch timing', () => {
  it('touches only around initiation', () => {
    assert.strictEqual(poleTouchAt(POLE_TOUCH_T), 1);
    for (const t of [0.4, 0.5, 0.75, 0.95]) assert.strictEqual(poleTouchAt(t), 0, `t=${t}`);
  });
});
