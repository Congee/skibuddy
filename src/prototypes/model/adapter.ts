import type { Intensity } from '../../content/schema';
import { TURN_KINDS } from '../../physics/task';
import type { TurnKind } from '../../physics/task';
import { RegularTurn, kindOfDrill } from '../../viewer/poses/regular-turn';
import { COORDINATES, Side } from '../../viewer/skeleton';
import { axisOf, skiFrame } from '../../viewer/motion/fk';
import type { Rigid } from '../../viewer/motion/fk';
import { Q_FRAMES, rootWorlds } from '../../viewer/motion/q-table';
import { NAMES, edgeOf } from '../../viewer/motion/turn';
import { PELVIS_DOFS } from '../../../scripts/capture/gate-body';
import type { CaptureFrame, Quat, V3 } from '../capture/data';

const DEG = Math.PI / 180;

/** The pose id each kind's turn is solved and baked under. */
export const KIND_DRILL: Readonly<Record<TurnKind, string>> = Object.fromEntries(
  TURN_KINDS.map((k) => {
    const drill = Object.values(RegularTurn).find((d) => kindOfDrill(d) === k);
    if (drill === undefined) throw new Error(`no drill for ${k}`);
    return [k, drill];
  }),
) as Record<TurnKind, string>;

/** Unit quaternion [x, y, z, w] of a row-major rotation. */
export const quatOfRows = (R: ReadonlyArray<number>): Quat => {
  const [a = 1, b = 0, c = 0, d = 0, e = 1, f = 0, g = 0, h = 0, i = 1] = R;
  const tr = a + e + i;
  if (tr > 0) {
    const s = 2 * Math.sqrt(tr + 1);
    return [(h - f) / s, (c - g) / s, (d - b) / s, s / 4];
  }
  if (a > e && a > i) {
    const s = 2 * Math.sqrt(1 + a - e - i);
    return [s / 4, (b + d) / s, (c + g) / s, (h - f) / s];
  }
  if (e > i) {
    const s = 2 * Math.sqrt(1 + e - a - i);
    return [(b + d) / s, s / 4, (f + h) / s, (c - g) / s];
  }
  const s = 2 * Math.sqrt(1 + i - a - e);
  return [(c + g) / s, (f + h) / s, s / 4, (d - b) / s];
};

/** A solved q and its root frames as the capture stage's frame: q in degrees, the pelvis world frame carried whole. */
export const frameOfWorlds = (worlds: Readonly<Record<string, Rigid>>, q: ArrayLike<number>): CaptureFrame => {
  const pelvis = worlds['pelvis'];
  if (pelvis === undefined) throw new Error('no pelvis frame');
  const degrees: Record<string, number> = {};
  COORDINATES.forEach((c, k) => {
    if (!PELVIS_DOFS.has(c.name)) degrees[c.name] = (q[k] ?? 0) / DEG;
  });
  return { t: 0, q: degrees, pelvis: { pos: pelvis.p.map(Number) as unknown as V3, quat: quatOfRows(pelvis.R.map(Number)) } };
};

/** The stored frame nearest turn time `t`, and that frame's own time. */
export const frameIndex = (t: number): { readonly k: number; readonly t: number } => {
  const k = ((Math.round(t * Q_FRAMES) % Q_FRAMES) + Q_FRAMES) % Q_FRAMES;
  return { k, t: k / Q_FRAMES };
};

export interface Solved {
  readonly worlds: Readonly<Record<string, Rigid>>;
  readonly frame: CaptureFrame;
}

export const solvedAt = (drill: string, intensity: Intensity, q: ArrayLike<number>, t: number): Solved => {
  const worlds = rootWorlds(drill, intensity, q, t);
  return { worlds, frame: frameOfWorlds(worlds, q) };
};

/** Figure readout at one solved frame, degrees unless named; outside is the right side in the root. */
export interface SolvedReadout {
  readonly edge: number;
  /** Pelvis yaw less the outside ski's, + toward the outside. */
  readonly counter: number;
  /** Inside ski ahead along the outside's track, m. */
  readonly lead: number;
  readonly kneeOutside: number;
  readonly kneeInside: number;
  readonly ankleOutside: number;
  readonly ankleInside: number;
  readonly pelvisList: number;
}

const OUT = Side.Right;
const IN = Side.Left;
const at = (q: ArrayLike<number>, name: string): number => q[NAMES.indexOf(name)] ?? Number.NaN;
// Root x runs across toward the inside, z along the outside ski's track.
const yawOutward = (v: readonly [number, number, number]): number => Math.atan2(-v[0], v[2]);

/** Heading of the outside ski about the snow normal, radians: atan2(x, z) of its long axis. */
export const skiYaw = (worlds: Readonly<Record<string, Rigid>>): number => {
  const f = axisOf(skiFrame(worlds, OUT), 2);
  return Math.atan2(Number(f[0]), Number(f[2]));
};

export const readoutOf = (worlds: Readonly<Record<string, Rigid>>, q: ArrayLike<number>): SolvedReadout => {
  const ski = skiFrame(worlds, OUT);
  const pelvis = worlds['pelvis'];
  const skiFwd = axisOf(ski, 2).map(Number) as unknown as readonly [number, number, number];
  const pelvisFwd = pelvis === undefined ? skiFwd : (axisOf(pelvis, 0).map(Number) as unknown as readonly [number, number, number]);
  const d = (yawOutward(pelvisFwd) - yawOutward(skiFwd)) / DEG;
  return {
    edge: Number(edgeOf(ski, [0, 1, 0])) / DEG,
    counter: ((d + 540) % 360) - 180,
    lead: at(q, 'inside_lead'),
    kneeOutside: at(q, `knee_flexion.${OUT}`) / DEG,
    kneeInside: at(q, `knee_flexion.${IN}`) / DEG,
    ankleOutside: at(q, `ankle_dorsiflexion.${OUT}`) / DEG,
    ankleInside: at(q, `ankle_dorsiflexion.${IN}`) / DEG,
    pelvisList: at(q, 'pelvis_list') / DEG,
  };
};
