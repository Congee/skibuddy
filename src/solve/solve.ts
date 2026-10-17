import { Normal } from './normal';
import { BlockKind, type Block, type Problem } from './problem';

// Bounded Levenberg–Marquardt (Madsen, Nielsen & Tingleff 2004, Algorithm 3.16) with an active set and
// projection for the bounds, inside an augmented-Lagrangian loop for equality and inequality (≥ 0) blocks.

export interface SolveOptions {
  readonly maxIterations?: number;
  readonly maxOuter?: number;
  readonly tolGradient?: number;
  readonly tolStep?: number;
  // Stop once an accepted step lowers the objective by less than this fraction.
  readonly tolCost?: number;
  readonly tolConstraint?: number;
  readonly tau?: number;
  readonly penalty?: number;
  readonly penaltyGrowth?: number;
  readonly penaltyMax?: number;
  // Warm-start multipliers per constraint block, e.g. from a previous solve of the same problem.
  readonly multipliers?: ReadonlyMap<Block, ArrayLike<number>>;
}

export interface SolveResult {
  readonly x: Float64Array;
  // ½‖w·r‖² over soft blocks only.
  readonly cost: number;
  readonly iterations: number;
  readonly outer: number;
  readonly converged: boolean;
  readonly violation: number;
  readonly feasible: boolean;
  readonly penalty: number;
  // Lagrange multipliers per constraint block (Equality, Inequality), in the block's rows.
  readonly multipliers: ReadonlyMap<Block, Float64Array>;
  readonly atBound: Uint8Array;
}

const isConstraint = (b: Block): boolean => b.kind === BlockKind.Equality || b.kind === BlockKind.Inequality;

// Raw residuals and Jacobians for every block, in flat buffers.
export class Evaluation {
  readonly rOff: Int32Array;
  readonly jOff: Int32Array;
  readonly r: Float64Array;
  readonly J: Float64Array;
  private readonly local: Float64Array[];

  constructor(readonly blocks: readonly Block[]) {
    this.rOff = new Int32Array(blocks.length + 1);
    this.jOff = new Int32Array(blocks.length + 1);
    blocks.forEach((b, i) => {
      this.rOff[i + 1] = (this.rOff[i] ?? 0) + b.size;
      this.jOff[i + 1] = (this.jOff[i] ?? 0) + b.size * b.vars.length;
    });
    this.r = new Float64Array(this.rOff[blocks.length] ?? 0);
    this.J = new Float64Array(this.jOff[blocks.length] ?? 0);
    this.local = blocks.map((b) => new Float64Array(b.vars.length));
  }

  run(x: Float64Array, withJ: boolean): void {
    this.blocks.forEach((b, i) => {
      const xl = this.local[i] ?? new Float64Array(0);
      b.vars.forEach((v, c) => (xl[c] = x[v] ?? 0));
      const r0 = this.rOff[i] ?? 0;
      const j0 = this.jOff[i] ?? 0;
      b.evaluate(xl, this.r.subarray(r0, r0 + b.size), withJ ? this.J.subarray(j0, j0 + b.size * b.vars.length) : null);
    });
  }
}

// Effective least-squares rows: e = scale·(r − shift) for active rows, 0 otherwise.
interface Rows {
  readonly e: Float64Array;
  readonly scale: Float64Array;
}

const effective = (ev: Evaluation, lambda: ReadonlyMap<Block, Float64Array>, penalty: number, out: Rows): number => {
  const sp = Math.sqrt(penalty);
  let cost = 0;
  ev.blocks.forEach((b, i) => {
    const r0 = ev.rOff[i] ?? 0;
    const lam = lambda.get(b);
    for (let row = 0; row < b.size; row++) {
      const c = b.weight * (ev.r[r0 + row] ?? 0);
      let e = c;
      let s = b.weight;
      if (lam) {
        const t = c - (lam[row] ?? 0) / penalty;
        const active = b.kind === BlockKind.Equality || t < 0;
        e = active ? sp * t : 0;
        s = active ? sp * b.weight : 0;
      }
      out.e[r0 + row] = e;
      out.scale[r0 + row] = s;
      cost += 0.5 * e * e;
    }
  });
  return cost;
};

const gradient = (ev: Evaluation, rows: Rows, g: Float64Array): void => {
  g.fill(0);
  ev.blocks.forEach((b, i) => {
    const r0 = ev.rOff[i] ?? 0;
    const j0 = ev.jOff[i] ?? 0;
    const n = b.vars.length;
    for (let row = 0; row < b.size; row++) {
      const f = (rows.e[r0 + row] ?? 0) * (rows.scale[r0 + row] ?? 0);
      if (f === 0) continue;
      for (let c = 0; c < n; c++) g[b.vars[c] ?? 0] = (g[b.vars[c] ?? 0] ?? 0) + f * (ev.J[j0 + row * n + c] ?? 0);
    }
  });
};

// Accumulates Σ (s·J)ᵀ(s·J) over the chosen blocks into the normal matrix.
export const accumulate = (
  normal: Normal,
  ev: Evaluation,
  scale: Float64Array,
  include: (b: Block) => boolean,
  fixed: Uint8Array | null,
): void => {
  normal.clear();
  const cols = new Int32Array(ev.J.length);
  const vals = new Float64Array(ev.J.length);
  ev.blocks.forEach((b, i) => {
    if (!include(b)) return;
    const r0 = ev.rOff[i] ?? 0;
    const j0 = ev.jOff[i] ?? 0;
    const n = b.vars.length;
    // Row by row over the nonzeros, so sparse rows (priors, smoothness) cost nnz², not n².
    for (let row = 0; row < b.size; row++) {
      const s = scale[r0 + row] ?? 0;
      if (s === 0) continue;
      let nnz = 0;
      for (let c = 0; c < n; c++) {
        const v = ev.J[j0 + row * n + c] ?? 0;
        const slot = normal.slot[b.vars[c] ?? 0] ?? 0;
        if (v === 0 || fixed?.[slot]) continue;
        cols[nnz] = slot;
        vals[nnz++] = s * v;
      }
      for (let p = 0; p < nnz; p++) {
        const vp = vals[p] ?? 0;
        const sp = cols[p] ?? 0;
        for (let q = 0; q <= p; q++) normal.add(sp, cols[q] ?? 0, vp * (vals[q] ?? 0));
      }
    }
  });
};

// ‖(s·J) h‖² for the step h in variable order.
const curvature = (ev: Evaluation, scale: Float64Array, h: Float64Array): number => {
  let sum = 0;
  ev.blocks.forEach((b, i) => {
    const r0 = ev.rOff[i] ?? 0;
    const j0 = ev.jOff[i] ?? 0;
    const n = b.vars.length;
    for (let row = 0; row < b.size; row++) {
      let d = 0;
      for (let c = 0; c < n; c++) d += (ev.J[j0 + row * n + c] ?? 0) * (h[b.vars[c] ?? 0] ?? 0);
      sum += (d * (scale[r0 + row] ?? 0)) ** 2;
    }
  });
  return sum;
};

const project = (x: Float64Array, lo: Float64Array | undefined, hi: Float64Array | undefined): void => {
  for (let i = 0; i < x.length; i++) x[i] = Math.min(hi?.[i] ?? Infinity, Math.max(lo?.[i] ?? -Infinity, x[i] ?? 0));
};

const norm = (v: Float64Array): number => Math.sqrt(v.reduce((s, a) => s + a * a, 0));

export const solve = (problem: Problem, x0: ArrayLike<number>, options: SolveOptions = {}): SolveResult => {
  const kmax = options.maxIterations ?? 200;
  const maxOuter = options.maxOuter ?? 30;
  const eps1 = options.tolGradient ?? 1e-10;
  const eps2 = options.tolStep ?? 1e-12;
  const tolCost = options.tolCost ?? 1e-10;
  const tolC = options.tolConstraint ?? 1e-8;
  const tau = options.tau ?? 1e-3;
  const growth = options.penaltyGrowth ?? 10;
  const penaltyMax = options.penaltyMax ?? 1e12;
  const { size, blocks, lower, upper } = problem;
  const normal = new Normal(size, blocks, problem.structure);
  const slot = normal.slot;

  const x = Float64Array.from(x0);
  if (x.length !== size) throw new Error(`x0 has ${x.length} entries, expected ${size}`);
  project(x, lower, upper);
  let ev = new Evaluation(blocks);
  let trial = new Evaluation(blocks);
  const nRows = ev.r.length;
  let rows: Rows = { e: new Float64Array(nRows), scale: new Float64Array(nRows) };
  let trialRows: Rows = { e: new Float64Array(nRows), scale: new Float64Array(nRows) };
  const lambda = new Map<Block, Float64Array>();
  for (const b of blocks) if (isConstraint(b)) lambda.set(b, Float64Array.from(options.multipliers?.get(b) ?? new Float64Array(b.size)));
  let penalty = options.penalty ?? 1e2;

  const g = new Float64Array(size);
  const fixedSlots = new Uint8Array(size);
  const rhs = new Float64Array(size);
  const h = new Float64Array(size);
  const xNew = new Float64Array(size);
  let iterations = 0;

  const projectedGradient = (): number => {
    let worst = 0;
    for (let i = 0; i < size; i++) {
      const step = Math.min(upper?.[i] ?? Infinity, Math.max(lower?.[i] ?? -Infinity, (x[i] ?? 0) - (g[i] ?? 0)));
      worst = Math.max(worst, Math.abs(step - (x[i] ?? 0)));
    }
    return worst;
  };

  const markFixed = (): void => {
    for (let i = 0; i < size; i++) {
      const xi = x[i] ?? 0;
      const gi = g[i] ?? 0;
      const pinned = (xi <= (lower?.[i] ?? -Infinity) && gi > 0) || (xi >= (upper?.[i] ?? Infinity) && gi < 0);
      fixedSlots[slot[i] ?? 0] = pinned ? 1 : 0;
    }
  };

  // MNT Algorithm 3.16 on the current augmented objective; true when a stopping test (3.15a/b) fired.
  const inner = (): boolean => {
    ev.run(x, true);
    let F = effective(ev, lambda, penalty, rows);
    gradient(ev, rows, g);
    markFixed();
    accumulate(normal, ev, rows.scale, () => true, fixedSlots);
    let maxDiag = 0;
    for (let p = 0; p < size; p++) maxDiag = Math.max(maxDiag, normal.diag(p));
    let mu = tau * Math.max(maxDiag, 1e-12);
    let nu = 2;
    let found = projectedGradient() <= eps1;
    for (let k = 0; !found && k < kmax; k++) {
      iterations++;
      if (!normal.factor(mu, fixedSlots)) {
        mu *= nu;
        nu *= 2;
        continue;
      }
      for (let i = 0; i < size; i++) {
        const s = slot[i] ?? 0;
        rhs[s] = fixedSlots[s] ? 0 : -(g[i] ?? 0);
      }
      normal.solve(rhs);
      for (let i = 0; i < size; i++) h[i] = rhs[slot[i] ?? 0] ?? 0;
      if (norm(h) <= eps2 * (norm(x) + eps2)) {
        found = true;
        break;
      }
      for (let i = 0; i < size; i++) xNew[i] = (x[i] ?? 0) + (h[i] ?? 0);
      project(xNew, lower, upper);
      for (let i = 0; i < size; i++) h[i] = (xNew[i] ?? 0) - (x[i] ?? 0);
      let gh = 0;
      for (let i = 0; i < size; i++) gh += (g[i] ?? 0) * (h[i] ?? 0);
      const predicted = -(gh + 0.5 * curvature(ev, rows.scale, h));
      trial.run(xNew, true);
      const Fnew = effective(trial, lambda, penalty, trialRows);
      const rho = predicted > 0 ? (F - Fnew) / predicted : -1;
      if (rho > 0) {
        x.set(xNew);
        [ev, trial] = [trial, ev];
        [rows, trialRows] = [trialRows, rows];
        const stalled = F - Fnew <= tolCost * F;
        F = Fnew;
        gradient(ev, rows, g);
        markFixed();
        accumulate(normal, ev, rows.scale, () => true, fixedSlots);
        mu *= Math.max(1 / 3, 1 - (2 * rho - 1) ** 3);
        nu = 2;
        found = stalled || projectedGradient() <= eps1;
      } else {
        mu *= nu;
        nu *= 2;
        if (!Number.isFinite(mu)) break;
      }
    }
    return found;
  };

  const violation = (): number => {
    let worst = 0;
    ev.blocks.forEach((b, i) => {
      if (!isConstraint(b)) return;
      const r0 = ev.rOff[i] ?? 0;
      for (let row = 0; row < b.size; row++) {
        const c = b.weight * (ev.r[r0 + row] ?? 0);
        worst = Math.max(worst, b.kind === BlockKind.Equality ? Math.abs(c) : Math.max(0, -c));
      }
    });
    return worst;
  };

  let converged = false;
  let viol = 0;
  let outer = 0;
  let previous = Infinity;
  for (; outer < maxOuter; outer++) {
    converged = inner();
    ev.run(x, false);
    viol = violation();
    if (lambda.size === 0) break;
    // λ ← λ − ρc for equalities, max(0, λ − ρc) for inequalities (Toussaint, Optimization lecture §2.3).
    ev.blocks.forEach((b, i) => {
      const lam = lambda.get(b);
      if (!lam) return;
      const r0 = ev.rOff[i] ?? 0;
      for (let row = 0; row < b.size; row++) {
        const next = (lam[row] ?? 0) - penalty * b.weight * (ev.r[r0 + row] ?? 0);
        lam[row] = b.kind === BlockKind.Equality ? next : Math.max(0, next);
      }
    });
    if (viol <= tolC && converged) break;
    if (viol > 0.25 * previous) {
      if (penalty >= penaltyMax) break;
      penalty = Math.min(penaltyMax, penalty * growth);
    }
    previous = viol;
  }

  ev.run(x, false);
  let cost = 0;
  ev.blocks.forEach((b, i) => {
    if (isConstraint(b)) return;
    const r0 = ev.rOff[i] ?? 0;
    for (let row = 0; row < b.size; row++) cost += 0.5 * (b.weight * (ev.r[r0 + row] ?? 0)) ** 2;
  });
  const atBound = Uint8Array.from(x, (xi, i) => (xi <= (lower?.[i] ?? -Infinity) || xi >= (upper?.[i] ?? Infinity) ? 1 : 0));
  return {
    x,
    cost,
    iterations,
    outer: outer + 1,
    converged,
    violation: viol,
    feasible: viol <= tolC,
    penalty,
    multipliers: lambda,
    atBound,
  };
};
