import type { Dual } from './dual';
import { autodiff, BlockKind, linear, type Block, type BlockSpec, type SignedRef, type Structure } from './problem';

// (M·q)_i = sign_i · q_{perm_i}; must be an involution so M·M = I.
export interface Mirror {
  readonly perm: readonly number[];
  readonly sign: readonly number[];
}

export const Boundary = {
  Open: 'open',
  Periodic: 'periodic',
  // q(φ + ½) = M·q(φ): only the first half of the frames carries variables.
  Mirror: 'mirror',
} as const;
export type Boundary = (typeof Boundary)[keyof typeof Boundary];

export interface CycleSpec {
  readonly frames: number;
  readonly coords: number;
  readonly extras?: number;
  readonly boundary: Boundary;
  readonly mirror?: Mirror;
}

export const checkMirror = (m: Mirror, coords: number): void => {
  if (m.perm.length !== coords || m.sign.length !== coords) throw new Error('mirror must map every coordinate');
  m.perm.forEach((p, i) => {
    if (m.perm[p] !== i) throw new Error(`mirror perm is not an involution at ${i}`);
    if (Math.abs(m.sign[i] ?? 0) !== 1 || (m.sign[i] ?? 0) * (m.sign[p] ?? 0) !== 1) {
      throw new Error(`mirror sign breaks M·M = I at ${i}`);
    }
  });
};

// Variable layout and references for K frames of `coords` coordinates over one cycle, plus extra scalars.
export class Cycle {
  readonly frames: number;
  readonly coords: number;
  readonly extras: number;
  readonly boundary: Boundary;
  // Frames that carry variables (K/2 under the mirror boundary).
  readonly solved: number;
  readonly size: number;
  readonly structure: Structure;
  private readonly mirror: Mirror | undefined;

  constructor(spec: CycleSpec) {
    this.frames = spec.frames;
    this.coords = spec.coords;
    this.extras = spec.extras ?? 0;
    this.boundary = spec.boundary;
    this.mirror = spec.mirror;
    if (spec.boundary === Boundary.Mirror) {
      if (!spec.mirror) throw new Error('mirror boundary needs a mirror map');
      if (spec.frames % 2 !== 0) throw new Error('mirror boundary needs an even frame count');
      checkMirror(spec.mirror, spec.coords);
    }
    this.solved = spec.boundary === Boundary.Mirror ? spec.frames / 2 : spec.frames;
    this.size = this.solved * this.coords + this.extras;
    const n = this.coords;
    const S = this.solved;
    const frameVars = (k: number): number[] => Array.from({ length: n }, (_, i) => k * n + i);
    const extraVars = Array.from({ length: this.extras }, (_, j) => S * n + j);
    // The seam couples the first and last solved frames, so both go to the border.
    const wraps = spec.boundary !== Boundary.Open && S >= 4;
    const bandFrames = wraps ? Array.from({ length: S - 2 }, (_, k) => k + 1) : Array.from({ length: S }, (_, k) => k);
    this.structure = {
      band: Int32Array.from(bandFrames.flatMap(frameVars)),
      border: Int32Array.from([...(wraps ? [...frameVars(0), ...frameVars(S - 1)] : []), ...extraVars]),
    };
  }

  // Coordinate i at frame k (any integer; wraps by the boundary).
  ref(k: number, i: number): SignedRef {
    const K = this.frames;
    if (this.boundary === Boundary.Open) {
      if (k < 0 || k >= K) throw new Error(`frame ${k} outside an open cycle`);
      return { index: k * this.coords + i, sign: 1 };
    }
    const kk = ((k % K) + K) % K;
    if (this.boundary === Boundary.Periodic || kk < this.solved) return { index: kk * this.coords + i, sign: 1 };
    const m = this.mirror;
    return { index: (kk - this.solved) * this.coords + (m?.perm[i] ?? i), sign: m?.sign[i] ?? 1 };
  }

  frameRefs(k: number): SignedRef[] {
    return Array.from({ length: this.coords }, (_, i) => this.ref(k, i));
  }

  extra(j: number): SignedRef {
    return { index: this.solved * this.coords + j, sign: 1 };
  }

  // Residual over the full coordinate vectors of the listed frames, then the extras.
  frameBlock(spec: BlockSpec, frames: readonly number[], f: (q: Dual[][], extras: Dual[]) => readonly Dual[]): Block {
    const refs = [...frames.flatMap((k) => this.frameRefs(k)), ...Array.from({ length: this.extras }, (_, j) => this.extra(j))];
    const n = this.coords;
    return autodiff(spec, refs, (v) =>
      f(
        frames.map((_, a) => v.slice(a * n, (a + 1) * n)),
        v.slice(frames.length * n),
      ),
    );
  }

  // w·(q_{k+1} − 2q_k + q_{k−1}) for every frame with both neighbours; across the seam via M.
  smoothness(weight: number, group = 'smoothness'): Block[] {
    const first = this.boundary === Boundary.Open ? 1 : 0;
    const last = this.boundary === Boundary.Open ? this.frames - 2 : this.solved - 1;
    const blocks: Block[] = [];
    for (let k = first; k <= last; k++) {
      blocks.push(
        linear(
          { name: `${group} ${k}`, group, kind: BlockKind.Prior, weight },
          Array.from({ length: this.coords }, (_, i) => ({
            terms: [
              [this.ref(k - 1, i), 1],
              [this.ref(k, i), -2],
              [this.ref(k + 1, i), 1],
            ] as const,
            offset: 0,
          })),
        ),
      );
    }
    return blocks;
  }

  // All K frames' coordinates from the solution vector.
  unpack(x: ArrayLike<number>): Float64Array[] {
    return Array.from({ length: this.frames }, (_frame, k) =>
      Float64Array.from({ length: this.coords }, (_, i) => {
        const r = this.ref(k, i);
        return r.sign * (x[r.index] ?? 0);
      }),
    );
  }

  // Per-variable bounds from per-coordinate limits, intersected with the limits mirrored frames need.
  bounds(lo: readonly number[], hi: readonly number[], extraLo?: readonly number[], extraHi?: readonly number[]): {
    lower: Float64Array;
    upper: Float64Array;
  } {
    const lower = new Float64Array(this.size).fill(-Infinity);
    const upper = new Float64Array(this.size).fill(Infinity);
    const m = this.boundary === Boundary.Mirror ? this.mirror : undefined;
    const coordLo = Array.from({ length: this.coords }, (_, i) => lo[i] ?? -Infinity);
    const coordHi = Array.from({ length: this.coords }, (_, i) => hi[i] ?? Infinity);
    if (m) {
      // Frame k + K/2 has coordinate j = s_j·q_{p_j}, so q_{p_j} ∈ s_j·[lo_j, hi_j].
      m.perm.forEach((p, j) => {
        const s = m.sign[j] ?? 1;
        const a = s * (lo[j] ?? -Infinity);
        const b = s * (hi[j] ?? Infinity);
        coordLo[p] = Math.max(coordLo[p] ?? -Infinity, Math.min(a, b));
        coordHi[p] = Math.min(coordHi[p] ?? Infinity, Math.max(a, b));
      });
    }
    for (let k = 0; k < this.solved; k++) {
      for (let i = 0; i < this.coords; i++) {
        lower[k * this.coords + i] = coordLo[i] ?? -Infinity;
        upper[k * this.coords + i] = coordHi[i] ?? Infinity;
      }
    }
    for (let j = 0; j < this.extras; j++) {
      lower[this.solved * this.coords + j] = extraLo?.[j] ?? -Infinity;
      upper[this.solved * this.coords + j] = extraHi?.[j] ?? Infinity;
    }
    return { lower, upper };
  }
}
