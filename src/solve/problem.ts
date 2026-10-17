import { Dual, seed } from './dual';

// Prior and Goal are soft (cost ½‖w·r‖²); Goal blocks count as movers in the attribution.
export const BlockKind = {
  Prior: 'prior',
  Goal: 'goal',
  Equality: 'equality',
  Inequality: 'inequality',
} as const;
export type BlockKind = (typeof BlockKind)[keyof typeof BlockKind];

export interface Block {
  readonly name: string;
  readonly group: string;
  readonly kind: BlockKind;
  readonly vars: Int32Array;
  readonly size: number;
  readonly weight: number;
  // Optional per-row local columns that may be nonzero; tightens the band. Absent means dense rows.
  readonly pattern?: readonly Int32Array[];
  // r has `size` rows; J is row-major size × vars.length, unweighted.
  evaluate(x: Float64Array, r: Float64Array, J: Float64Array | null): void;
}

// Variables in `band` order give a banded normal matrix; `border` couples arbitrarily (Schur).
export interface Structure {
  readonly band: Int32Array;
  readonly border: Int32Array;
}

export interface Problem {
  readonly size: number;
  readonly blocks: readonly Block[];
  readonly lower?: Float64Array;
  readonly upper?: Float64Array;
  readonly structure?: Structure;
}

export interface BlockSpec {
  readonly name: string;
  readonly kind: BlockKind;
  readonly size: number;
  readonly group?: string;
  readonly weight?: number;
}

export interface SignedRef {
  readonly index: number;
  readonly sign: number;
}

const unique = (refs: readonly SignedRef[]): { vars: Int32Array; col: Int32Array } => {
  const order = new Map<number, number>();
  const col = new Int32Array(refs.length);
  refs.forEach((ref, i) => {
    let c = order.get(ref.index);
    if (c === undefined) {
      c = order.size;
      order.set(ref.index, c);
    }
    col[i] = c;
  });
  return { vars: Int32Array.from(order.keys()), col };
};

// Residual from a dual-number function of signed variable references (duplicates allowed).
export const autodiff = (spec: BlockSpec, refs: readonly SignedRef[], f: (v: Dual[]) => readonly Dual[]): Block => {
  const { vars, col } = unique(refs);
  const n = vars.length;
  return {
    name: spec.name,
    group: spec.group ?? spec.name,
    kind: spec.kind,
    vars,
    size: spec.size,
    weight: spec.weight ?? 1,
    evaluate(x, r, J) {
      const base = seed(x);
      const v = refs.map((ref, i) => {
        const d = base[col[i] ?? 0] ?? new Dual(0, new Float64Array(n));
        return ref.sign === 1 ? d : d.mul(ref.sign);
      });
      const out = f(v);
      if (out.length !== spec.size) throw new Error(`${spec.name}: ${out.length} residuals, expected ${spec.size}`);
      out.forEach((o, row) => {
        r[row] = o.v;
        if (J) J.set(o.d, row * n);
      });
    },
  };
};

export const plain = (index: number): SignedRef => ({ index, sign: 1 });

export interface LinearRow {
  readonly terms: readonly (readonly [ref: SignedRef, coeff: number])[];
  readonly offset: number;
}

// r_row = Σ coeff·sign·x[index] + offset, with an exact constant Jacobian.
export const linear = (spec: Omit<BlockSpec, 'size'>, rows: readonly LinearRow[]): Block => {
  const refs = rows.flatMap((row) => row.terms.map(([ref]) => ref));
  const { vars, col } = unique(refs);
  const n = vars.length;
  const jac = new Float64Array(rows.length * n);
  const offset = Float64Array.from(rows, (row) => row.offset);
  let t = 0;
  rows.forEach((row, i) => {
    for (const [ref, coeff] of row.terms) {
      const at = i * n + (col[t++] ?? 0);
      jac[at] = (jac[at] ?? 0) + coeff * ref.sign;
    }
  });
  const pattern = rows.map((_row, i) => Int32Array.from({ length: n }, (_, c) => c).filter((c) => jac[i * n + c] !== 0));
  return {
    name: spec.name,
    group: spec.group ?? spec.name,
    kind: spec.kind,
    vars,
    size: rows.length,
    weight: spec.weight ?? 1,
    pattern,
    evaluate(x, r, J) {
      for (let i = 0; i < rows.length; i++) {
        let s = offset[i] ?? 0;
        for (let c = 0; c < n; c++) s += (jac[i * n + c] ?? 0) * (x[c] ?? 0);
        r[i] = s;
      }
      if (J) J.set(jac);
    },
  };
};

// Gaussian prior (x − μ)/σ on single variables.
export const prior = (
  name: string,
  refs: readonly SignedRef[],
  mean: readonly number[],
  sigma: readonly number[],
  group?: string,
): Block =>
  linear(
    { name, kind: BlockKind.Prior, group: group ?? name },
    refs.map((ref, i) => ({
      terms: [[ref, 1 / (sigma[i] ?? 1)]],
      offset: -(mean[i] ?? 0) / (sigma[i] ?? 1),
    })),
  );

// Max |analytic − central difference| over the block's Jacobian, relative to max(1, |J|).
export const checkJacobian = (block: Block, x: Float64Array, h = 1e-6): number => {
  const n = block.vars.length;
  const J = new Float64Array(block.size * n);
  const r = new Float64Array(block.size);
  block.evaluate(x, r, J);
  const rp = new Float64Array(block.size);
  const rm = new Float64Array(block.size);
  let worst = 0;
  for (let c = 0; c < n; c++) {
    const xp = Float64Array.from(x);
    const xm = Float64Array.from(x);
    xp[c] = (xp[c] ?? 0) + h;
    xm[c] = (xm[c] ?? 0) - h;
    block.evaluate(xp, rp, null);
    block.evaluate(xm, rm, null);
    for (let i = 0; i < block.size; i++) {
      const fd = ((rp[i] ?? 0) - (rm[i] ?? 0)) / (2 * h);
      const an = J[i * n + c] ?? 0;
      worst = Math.max(worst, Math.abs(an - fd) / Math.max(1, Math.abs(an)));
    }
  }
  return worst;
};
