import { dot, smallestEigenvector, unit } from './geometry';
import type { V3n } from './geometry';

/** The snow under the skis as a plane n · p = d, n unit and up. */
export interface Plane {
  readonly n: V3n;
  readonly d: number;
}

/** Weighted total-least-squares plane through points, its normal turned up (+y). */
export const fitPlane = (points: ReadonlyArray<ReadonlyArray<number>>, weights: ReadonlyArray<number>): Plane => {
  const W = weights.reduce((s, w) => s + w, 0) || 1;
  const c = [0, 1, 2].map((j) => points.reduce((s, p, i) => s + (weights[i] ?? 0) * (p[j] ?? 0), 0) / W);
  const C = Array.from({ length: 9 }, (_, e) =>
    points.reduce((s, p, i) => s + (weights[i] ?? 0) * ((p[Math.floor(e / 3)] ?? 0) - (c[Math.floor(e / 3)] ?? 0)) * ((p[e % 3] ?? 0) - (c[e % 3] ?? 0)), 0),
  );
  const e = unit(smallestEigenvector(C));
  const n: V3n = e[1] < 0 ? [-e[0], -e[1], -e[2]] : e;
  return { n, d: dot(n, c) };
};

export const heightOver = (plane: Plane, p: ReadonlyArray<number>): number => dot(plane.n, p) - plane.d;

export interface SnowFit {
  /** Per frame, the sole plane (before the ski stack is subtracted). */
  readonly planes: ReadonlyArray<Plane>;
  /** Per frame and side (R, L): the foot is on the snow. */
  readonly stance: ReadonlyArray<readonly [boolean, boolean]>;
}

/**
 * Per frame, a plane through both feet's sole points over a Hann-weighted stance window of ±`half` frames; a foot
 * whose lowest sole point stands more than `lift` above its frame's plane is airborne there and the fit is redone
 * without it. `soles[k][side]` are that frame's sole points (heel, toes) of the right then left foot.
 */
export const fitSnow = (soles: ReadonlyArray<readonly [ReadonlyArray<V3n>, ReadonlyArray<V3n>]>, half: number, lift: number): SnowFit => {
  const K = soles.length;
  let stance: Array<[boolean, boolean]> = soles.map(() => [true, true]);
  let planes: Plane[] = [];
  for (let pass = 0; pass < 3; pass++) {
    planes = soles.map((_, k) => {
      const pts: V3n[] = [];
      const ws: number[] = [];
      for (let j = Math.max(0, k - half); j <= Math.min(K - 1, k + half); j++) {
        const w = 0.5 + 0.5 * Math.cos((Math.PI * (j - k)) / (half + 1));
        ([0, 1] as const).forEach((s) => {
          if (!stance[j]?.[s]) return;
          for (const p of soles[j]?.[s] ?? []) {
            pts.push(p);
            ws.push(w);
          }
        });
      }
      return fitPlane(pts, ws);
    });
    const next = soles.map((sk, k): [boolean, boolean] => {
      const pl = planes[k] ?? { n: [0, 1, 0] as V3n, d: 0 };
      const low = ([0, 1] as const).map((s) => Math.min(...(sk[s] ?? []).map((p) => heightOver(pl, p))));
      // Never drop both: the lower foot carries the skier.
      const lower = (low[0] ?? 0) <= (low[1] ?? 0) ? 0 : 1;
      return [lower === 0 || (low[0] ?? 0) - (low[1] ?? 0) <= lift, lower === 1 || (low[1] ?? 0) - (low[0] ?? 0) <= lift];
    });
    const same = next.every((v, k) => v[0] === stance[k]?.[0] && v[1] === stance[k]?.[1]);
    stance = next;
    if (same) break;
  }
  return { planes, stance };
};

/** The plane moved down along its normal by `drop`. */
export const lowered = (p: Plane, drop: number): Plane => ({ n: p.n, d: p.d - drop });

