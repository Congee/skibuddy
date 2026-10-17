import type { Block, Structure } from './problem';

const bump = (a: Float64Array, i: number, v: number): void => {
  a[i] = (a[i] as number) + v;
};

// Symmetric positive-definite normal matrix [A B; Bᵀ C]: A banded (band vars), B and C dense (border vars).
// Factored as band Cholesky of A plus a dense Cholesky of the Schur complement C − BᵀA⁻¹B.
export class Normal {
  readonly slot: Int32Array;
  readonly nb: number;
  readonly m: number;
  readonly bw: number;
  private readonly a: Float64Array;
  private readonly b: Float64Array;
  private readonly c: Float64Array;
  private readonly la: Float64Array;
  private readonly w: Float64Array;
  private readonly s: Float64Array;
  private readonly first: Int32Array;
  private readonly order: Int32Array;
  private readonly wr: Float64Array;
  private readonly sp: Float64Array;
  private readonly active: Int32Array;
  private readonly zp: Float64Array;

  constructor(size: number, blocks: readonly Block[], structure?: Structure) {
    const band = structure?.band ?? Int32Array.from({ length: size }, (_, i) => i);
    const border = structure?.border ?? new Int32Array(0);
    if (band.length + border.length !== size) throw new Error('structure must list every variable once');
    this.slot = new Int32Array(size).fill(-1);
    band.forEach((v, i) => (this.slot[v] = i));
    border.forEach((v, i) => (this.slot[v] = band.length + i));
    if (this.slot.includes(-1)) throw new Error('structure must list every variable once');
    this.nb = band.length;
    this.m = border.length;
    let bw = 0;
    const span = (cols: ArrayLike<number>, vars: Int32Array): number => {
      let lo = Infinity;
      let hi = -Infinity;
      for (let c = 0; c < cols.length; c++) {
        const p = this.slot[vars[cols[c] ?? 0] ?? 0] ?? 0;
        if (p < this.nb) {
          lo = Math.min(lo, p);
          hi = Math.max(hi, p);
        }
      }
      return hi >= lo ? hi - lo : 0;
    };
    for (const block of blocks) {
      const all = Int32Array.from(block.vars, (_, c) => c);
      for (const cols of block.pattern ?? [all]) bw = Math.max(bw, span(cols, block.vars));
    }
    this.bw = bw;
    this.a = new Float64Array(this.nb * (bw + 1));
    this.b = new Float64Array(this.nb * this.m);
    this.c = new Float64Array(this.m * this.m);
    this.la = new Float64Array(this.a.length);
    this.w = new Float64Array(this.b.length);
    this.s = new Float64Array(this.c.length);
    this.first = new Int32Array(this.m);
    this.order = new Int32Array(this.m);
    this.wr = new Float64Array(this.b.length);
    this.sp = new Float64Array(this.c.length);
    this.active = new Int32Array(this.nb);
    this.zp = new Float64Array(this.m);
  }

  clear(): void {
    this.a.fill(0);
    this.b.fill(0);
    this.c.fill(0);
  }

  // Adds v at slots (p, q) and its symmetric twin.
  add(p: number, q: number, v: number): void {
    const i = p >= q ? p : q;
    const j = p >= q ? q : p;
    const nb = this.nb;
    const k = this.bw + 1;
    if (i < nb) {
      if (i - j > this.bw) throw new Error('coupling outside the band');
      bump(this.a, i * k + (i - j), v);
    } else if (j < nb) bump(this.b, (i - nb) * nb + j, v);
    else {
      bump(this.c, (i - nb) * this.m + (j - nb), v);
      if (i !== j) bump(this.c, (j - nb) * this.m + (i - nb), v);
    }
  }

  diag(p: number): number {
    return p < this.nb ? ((this.a[p * (this.bw + 1)] as number)) : ((this.c[(p - this.nb) * (this.m + 1)] as number));
  }

  // Factors A + μ·I + e_fixed·(1 − diag); false if not positive definite.
  factor(mu: number, fixed: Uint8Array | null): boolean {
    const nb = this.nb;
    const m = this.m;
    const bw = this.bw;
    const k = bw + 1;
    const L = this.la;
    L.set(this.a);
    this.w.set(this.b);
    this.s.set(this.c);
    const pinned = (p: number): boolean => fixed !== null && fixed[p] === 1;
    for (let i = 0; i < nb; i++) {
      if (pinned(i)) {
        for (let d = 1; d <= bw; d++) {
          L[i * k + d] = 0;
          if (i + d < nb) L[(i + d) * k + d] = 0;
        }
        L[i * k] = 1;
        for (let c = 0; c < m; c++) this.w[c * nb + i] = 0;
      } else L[i * k] = (L[i * k] as number) + mu;
    }
    for (let c = 0; c < m; c++) {
      if (pinned(nb + c)) {
        for (let d = 0; d < m; d++) {
          this.s[c * m + d] = 0;
          this.s[d * m + c] = 0;
        }
        for (let i = 0; i < nb; i++) this.w[c * nb + i] = 0;
        this.s[c * m + c] = 1;
      } else this.s[c * m + c] = ((this.s[c * m + c] as number)) + mu;
    }
    for (let j = 0; j < nb; j++) {
      let s = (L[j * k] as number);
      for (let t = Math.max(0, j - bw); t < j; t++) s -= (L[j * k + (j - t)] as number) ** 2;
      if (!(s > 0)) return false;
      const ljj = Math.sqrt(s);
      L[j * k] = ljj;
      for (let i = j + 1; i <= Math.min(nb - 1, j + bw); i++) {
        let v = (L[i * k + (i - j)] as number);
        for (let t = Math.max(0, i - bw); t < j; t++) v -= (L[i * k + (i - t)] as number) * (L[j * k + (j - t)] as number);
        L[i * k + (i - j)] = v / ljj;
      }
    }
    // Border columns sorted by first nonzero row, so each row of W = L⁻¹B is nonzero on a prefix only.
    const B = this.w;
    const first = this.first;
    for (let c = 0; c < m; c++) {
      let f = 0;
      while (f < nb && B[c * nb + f] === 0) f++;
      first[c] = f;
    }
    const order = this.order;
    for (let c = 0; c < m; c++) order[c] = c;
    order.sort((x, y) => (first[x] as number) - (first[y] as number));
    const W = this.wr;
    for (let p = 0; p < m; p++) {
      const c = order[p] as number;
      for (let i = 0; i < nb; i++) W[i * m + p] = B[c * nb + i] as number;
    }
    const active = this.active;
    for (let i = 0, p = 0; i < nb; i++) {
      while (p < m && (first[order[p] as number] as number) <= i) p++;
      active[i] = p;
    }
    for (let i = 0; i < nb; i++) {
      const a = active[i] as number;
      const row = i * m;
      for (let t = Math.max(0, i - bw); t < i; t++) {
        const l = L[i * k + (i - t)] as number;
        if (l === 0) continue;
        const at = active[t] as number;
        for (let c = 0; c < at; c++) W[row + c] = (W[row + c] as number) - l * (W[t * m + c] as number);
      }
      const d = L[i * k] as number;
      for (let c = 0; c < a; c++) W[row + c] = (W[row + c] as number) / d;
    }
    const S = this.sp;
    for (let p = 0; p < m; p++) {
      for (let q = 0; q < m; q++) S[p * m + q] = this.s[(order[p] as number) * m + (order[q] as number)] as number;
    }
    for (let i = 0; i < nb; i++) {
      const a = active[i] as number;
      const row = i * m;
      for (let p = 0; p < a; p++) {
        const wp = W[row + p] as number;
        if (wp === 0) continue;
        for (let q = 0; q <= p; q++) S[p * m + q] = (S[p * m + q] as number) - wp * (W[row + q] as number);
      }
    }
    for (let j = 0; j < m; j++) {
      let s = S[j * m + j] as number;
      for (let t = 0; t < j; t++) s -= (S[j * m + t] as number) ** 2;
      if (!(s > 0)) return false;
      const ljj = Math.sqrt(s);
      S[j * m + j] = ljj;
      for (let i = j + 1; i < m; i++) {
        let v = S[i * m + j] as number;
        for (let t = 0; t < j; t++) v -= (S[i * m + t] as number) * (S[j * m + t] as number);
        S[i * m + j] = v / ljj;
      }
    }
    return true;
  }

  // Solves the factored system in slot order, overwriting rhs.
  solve(rhs: Float64Array): void {
    const nb = this.nb;
    const m = this.m;
    const y = rhs.subarray(0, nb);
    const z = this.zp;
    const W = this.wr;
    const S = this.sp;
    for (let p = 0; p < m; p++) z[p] = rhs[nb + (this.order[p] as number)] as number;
    this.forward(y);
    for (let i = 0; i < nb; i++) {
      const a = this.active[i] as number;
      const yi = y[i] as number;
      for (let p = 0; p < a; p++) z[p] = (z[p] as number) - (W[i * m + p] as number) * yi;
    }
    for (let i = 0; i < m; i++) {
      let v = z[i] as number;
      for (let t = 0; t < i; t++) v -= (S[i * m + t] as number) * (z[t] as number);
      z[i] = v / (S[i * m + i] as number);
    }
    for (let i = m - 1; i >= 0; i--) {
      let v = z[i] as number;
      for (let t = i + 1; t < m; t++) v -= (S[t * m + i] as number) * (z[t] as number);
      z[i] = v / (S[i * m + i] as number);
    }
    for (let i = 0; i < nb; i++) {
      const a = this.active[i] as number;
      let v = y[i] as number;
      for (let p = 0; p < a; p++) v -= (W[i * m + p] as number) * (z[p] as number);
      y[i] = v;
    }
    this.backward(y);
    for (let p = 0; p < m; p++) rhs[nb + (this.order[p] as number)] = z[p] as number;
  }

  private forward(y: Float64Array): void {
    const L = this.la;
    const k = this.bw + 1;
    let first = 0;
    while (first < y.length && y[first] === 0) first++;
    for (let i = first; i < y.length; i++) {
      let v = (y[i] as number);
      for (let t = Math.max(first, i - this.bw); t < i; t++) v -= (L[i * k + (i - t)] as number) * (y[t] as number);
      y[i] = v / (L[i * k] as number);
    }
  }

  private backward(y: Float64Array): void {
    const L = this.la;
    const k = this.bw + 1;
    const nb = this.nb;
    for (let i = nb - 1; i >= 0; i--) {
      let v = (y[i] as number);
      for (let t = i + 1; t <= Math.min(nb - 1, i + this.bw); t++) v -= (L[t * k + (t - i)] as number) * (y[t] as number);
      y[i] = v / (L[i * k] as number);
    }
  }
}
