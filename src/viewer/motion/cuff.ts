import { EQUIPMENT, maxShinAngle, minShinAngle } from '../equipment';
import { COORDINATES, REST_POSE, Side } from '../skeleton';
import { add, axisOf, dot3, forward, mul, skiFrame, sub, sub3, value } from './fk';
import type { Rigid, Scalar } from './fk';

const DEG = Math.PI / 180;

/** Shin (ankle to knee) pitch off the ski base's normal toward its tip, as the boot invariant measures it. */
export const shinPitch = (world: Readonly<Record<string, Rigid>>, s: Side): Scalar => {
  const tibia = world[`tibia.${s}`];
  const foot = world[`foot.${s}`];
  if (tibia === undefined || foot === undefined) throw new Error(`leg ${s} not solved`);
  const ski = skiFrame(world, s);
  const d = sub3(tibia.p, foot.p);
  return atan2(dot3(d, axisOf(ski, 2)), dot3(d, axisOf(ski, 1)));
};
const atan2 = (y: Scalar, x: Scalar): Scalar => {
  const [yv, xv] = [value(y), value(x)];
  const a = Math.atan2(yv, xv);
  if (typeof y === 'number' && typeof x === 'number') return a;
  const r2 = xv * xv + yv * yv;
  return add(a, add(mul(xv / r2, sub(y, yv)), mul(-yv / r2, sub(x, xv))));
};
/** The cuff's range on the shin: its forward lean on the delta up to its flex. */
const SHIN_RANGE = [minShinAngle(EQUIPMENT), maxShinAngle(EQUIPMENT)] as const;

/** Ankle dorsiflexion that puts the shin at `pitch`: the ankle is the shin's only hinge on the ski, so the cuff is a bound on it. */
const dorsiflexionFor = (s: Side, pitch: number): number => {
  const name = `ankle_dorsiflexion.${s}`;
  const i = COORDINATES.findIndex((c) => c.name === name);
  const f = (df: number): number => value(shinPitch(forward(COORDINATES.map((c, j) => (j === i ? df : (REST_POSE[c.name] ?? 0)))), s)) - pitch;
  let [a, b] = [-90 * DEG, 90 * DEG];
  for (let n = 0; n < 60; n++) {
    const m = (a + b) / 2;
    if (Math.sign(f(m)) === Math.sign(f(a))) a = m;
    else b = m;
  }
  return (a + b) / 2;
};
/** Per ankle coordinate, the dorsiflexion range the cuff allows. */
export const CUFF: Readonly<Record<string, readonly [number, number]>> = Object.fromEntries(
  [Side.Right, Side.Left].map((s) => [`ankle_dorsiflexion.${s}`, [dorsiflexionFor(s, SHIN_RANGE[0]), dorsiflexionFor(s, SHIN_RANGE[1])] as const]),
);
