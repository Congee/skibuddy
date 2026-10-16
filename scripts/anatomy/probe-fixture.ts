// Usage: bun scripts/anatomy/probe-fixture.ts <anatomy.glb> > test/anatomy-probe.json
// Samples the baked figure's fists, ankles and ski ends through the turn, so unit tests never read the model.
import { Vector3 } from 'three';
import type { Mesh, Object3D } from 'three';
import { BodySide } from '../../src/viewer/figure';
import type { LegSide } from '../../src/viewer/gear';
import { parseGearFit, standingArm } from '../../src/viewer/gear-fit';
import type { Vec3 } from '../../src/viewer/mat4';
import type { StandingArm } from '../../src/viewer/pose';
import { loadAnatomy } from './model';
import type { AnatomyModel } from './model';

/** Samples per turn; covers the bake's 24 frames and the pole touch at 1/6. */
export const PROBE_SAMPLES = 96;

export interface ProbeFrame {
  readonly grip: Readonly<Record<LegSide, Vec3>>;
  readonly ankle: Readonly<Record<LegSide, Vec3>>;
  /** Elbow to wrist. */
  readonly forearm: Readonly<Record<LegSide, Vec3>>;
  /** Base of the ski's tip and tail. */
  readonly tip: Readonly<Record<LegSide, Vec3>>;
  readonly tail: Readonly<Record<LegSide, Vec3>>;
}

export interface ProbeFixture {
  /** The drill scenarios the model's clips were solved for, as the bake stored them. */
  readonly scenarios: unknown;
  /** The arm the poles are sized from. */
  readonly arm: StandingArm;
  readonly samples: number;
  readonly frames: ReadonlyArray<ProbeFrame>;
}

const letter = (side: LegSide): string => (side === BodySide.Right ? 'R' : 'L');
// Micrometres are plenty and keep the fixture small.
const round = (x: number): number => Math.round(x * 1e6) / 1e6;
const vec = (v: Vector3): Vec3 => [round(v.x), round(v.y), round(v.z)];
const perSide = (f: (side: LegSide) => Vec3): Record<LegSide, Vec3> => ({ [BodySide.Right]: f(BodySide.Right), [BodySide.Left]: f(BodySide.Left) });

/** Midpoint of the two lower corners of one end of the ski box. */
const baseOf = (end: ReadonlyArray<Vector3>): Vector3 => {
  const [a, b] = end.toSorted((p, q) => p.y - q.y);
  if (a === undefined || b === undefined) throw new Error('ski mesh is not a box');
  return a.clone().add(b).multiplyScalar(0.5);
};

export const probeFixture = (model: AnatomyModel): ProbeFixture => {
  const raw = parseGearFit(model.root.getObjectByName('bones')?.userData['gear_fit']);
  if (raw === null) throw new Error('anatomy model has no gear fit');
  const arm = standingArm(raw.left);
  if (arm === null) throw new Error('anatomy model has no arm joints');
  // Ski ends at the rest pose, from the ski mesh itself.
  const skiEnds = (side: LegSide): { readonly tip: () => Vector3; readonly tail: () => Vector3 } => {
    let mesh: Mesh | undefined;
    model.root.getObjectByName(`gear_ski_${letter(side)}`)?.traverse((o: Object3D) => {
      if ((o as Mesh).isMesh) mesh = o as Mesh;
    });
    const ski = mesh;
    if (ski === undefined) throw new Error('no ski mesh');
    const pos = ski.geometry.getAttribute('position');
    const all = Array.from({ length: pos.count }, (_, i) => new Vector3(pos.getX(i), pos.getY(i), pos.getZ(i)).applyMatrix4(ski.matrixWorld));
    const pts = [...new Map(all.map((p) => [p.toArray().map((x) => x.toFixed(5)).join(), p])).values()];
    // The rest-pose ski is pitched against the ramp, so take each end's lower corners.
    const byZ = pts.toSorted((a, b) => a.z - b.z);
    const foot = `foot.${letter(side)}`;
    return { tip: model.carried(foot, baseOf(byZ.slice(-4))), tail: model.carried(foot, baseOf(byZ.slice(0, 4))) };
  };
  const ends = { [BodySide.Right]: skiEnds(BodySide.Right), [BodySide.Left]: skiEnds(BodySide.Left) };
  const grips = {
    [BodySide.Right]: model.carried('hand.R', new Vector3(...raw.right.grip)),
    [BodySide.Left]: model.carried('hand.L', new Vector3(...raw.left.grip)),
  };
  const frames = Array.from({ length: PROBE_SAMPLES }, (_, i): ProbeFrame => {
    model.pose(i / PROBE_SAMPLES);
    return {
      grip: perSide((side) => vec(grips[side]())),
      ankle: perSide((side) => vec(model.bone(`foot.${letter(side)}`).getWorldPosition(new Vector3()))),
      forearm: perSide((side) => {
        const elbow = model.bone(`forearm.${letter(side)}`).getWorldPosition(new Vector3());
        return vec(model.bone(`hand.${letter(side)}`).getWorldPosition(new Vector3()).sub(elbow));
      }),
      tip: perSide((side) => vec(ends[side].tip())),
      tail: perSide((side) => vec(ends[side].tail())),
    };
  });
  const stored = model.root.getObjectByName('bones')?.userData['scenarios'];
  if (typeof stored !== 'string') throw new Error('anatomy model has no scenarios');
  return { scenarios: JSON.parse(stored), arm, samples: PROBE_SAMPLES, frames };
};

if (import.meta.main) {
  const path = process.argv[2];
  if (path === undefined) throw new Error('usage: probe-fixture.ts <anatomy.glb>');
  process.stdout.write(`${JSON.stringify(probeFixture(await loadAnatomy(path)))}\n`);
}
