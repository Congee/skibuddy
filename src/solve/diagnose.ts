import { Normal } from './normal';
import { BlockKind, type Block, type Problem } from './problem';
import { accumulate, Evaluation, type SolveResult } from './solve';

export interface GroupReport {
  readonly group: string;
  readonly kind: BlockKind;
  readonly blocks: number;
  readonly rows: number;
  // ½‖w·r‖² for soft groups; ½‖c‖² for constraints.
  readonly cost: number;
  readonly maxAbs: number;
  readonly maxMultiplier: number;
  readonly activeRows: number;
}

export interface Share {
  readonly source: string;
  readonly share: number;
}

// Fraction of a prior group's weighted residual explained by each mover; the rest is priors disagreeing.
export interface Attribution {
  readonly group: string;
  readonly cost: number;
  readonly shares: readonly Share[];
  readonly rest: number;
}

export interface Diagnosis {
  readonly groups: readonly GroupReport[];
  readonly attribution: readonly Attribution[];
}

export const BOUNDS = 'bounds';

// Linearised superposition at the solution x*: with H = J_Pᵀ J_P over the prior blocks, stationarity reads
// H·(x* − x_P) ≈ Σ_s f_s where the movers f_s are Jᵀλ (constraints), −Jᵀ(w·r) (goals) and the bound
// multipliers. Each mover displaces x by δx_s = H⁻¹ f_s, which changes a prior's residual by J_P·δx_s.
export const diagnose = (problem: Problem, result: SolveResult): Diagnosis => {
  const { blocks, size } = problem;
  const ev = new Evaluation(blocks);
  ev.run(result.x, true);
  const scale = new Float64Array(ev.r.length);
  blocks.forEach((b, i) => scale.fill(b.weight, ev.rOff[i] ?? 0, ev.rOff[i + 1] ?? 0));

  const byGroup = new Map<string, { kind: BlockKind; members: number[] }>();
  blocks.forEach((b, i) => {
    const entry = byGroup.get(b.group) ?? { kind: b.kind, members: [] };
    entry.members.push(i);
    byGroup.set(b.group, entry);
  });

  const groups: GroupReport[] = [...byGroup].map(([group, { kind, members }]) => {
    let rows = 0;
    let cost = 0;
    let maxAbs = 0;
    let maxMultiplier = 0;
    let activeRows = 0;
    for (const i of members) {
      const b = blocks[i] as Block;
      const lam = result.multipliers.get(b);
      for (let row = 0; row < b.size; row++) {
        const v = b.weight * (ev.r[(ev.rOff[i] ?? 0) + row] ?? 0);
        const violated = kind === BlockKind.Inequality ? Math.min(0, v) : v;
        rows++;
        cost += 0.5 * violated * violated;
        maxAbs = Math.max(maxAbs, Math.abs(violated));
        const l = lam?.[row] ?? 0;
        maxMultiplier = Math.max(maxMultiplier, Math.abs(l));
        if (kind === BlockKind.Inequality && l > 0) activeRows++;
      }
    }
    return { group, kind, blocks: members.length, rows, cost, maxAbs, maxMultiplier, activeRows };
  });

  // Gradient contribution of each group, in variable order.
  const force = (members: readonly number[], sign: number, useLambda: boolean): Float64Array => {
    const f = new Float64Array(size);
    for (const i of members) {
      const b = blocks[i] as Block;
      const lam = result.multipliers.get(b);
      const n = b.vars.length;
      for (let row = 0; row < b.size; row++) {
        const coef = useLambda ? (lam?.[row] ?? 0) * b.weight : b.weight * b.weight * (ev.r[(ev.rOff[i] ?? 0) + row] ?? 0);
        if (coef === 0) continue;
        for (let c = 0; c < n; c++) {
          const v = b.vars[c] ?? 0;
          f[v] = (f[v] ?? 0) + sign * coef * (ev.J[(ev.jOff[i] ?? 0) + row * n + c] ?? 0);
        }
      }
    }
    return f;
  };

  const movers = new Map<string, Float64Array>();
  const priorGrad = new Float64Array(size);
  for (const [group, { kind, members }] of byGroup) {
    if (kind === BlockKind.Prior) priorGrad.set(force(members, 1, false).map((v, i) => v + (priorGrad[i] ?? 0)));
    else if (kind === BlockKind.Goal) movers.set(group, force(members, -1, false));
    else movers.set(group, force(members, 1, true));
  }
  // Whatever the bounds hold: z = g_P − Σ f_s on variables at a bound.
  const z = new Float64Array(size);
  for (let v = 0; v < size; v++) {
    if (!result.atBound[v]) continue;
    let s = priorGrad[v] ?? 0;
    for (const f of movers.values()) s -= f[v] ?? 0;
    z[v] = s;
  }
  if (z.some((v) => v !== 0)) movers.set(BOUNDS, z);

  const normal = new Normal(size, blocks, problem.structure);
  accumulate(normal, ev, scale, (b) => b.kind === BlockKind.Prior, null);
  let maxDiag = 0;
  for (let p = 0; p < size; p++) maxDiag = Math.max(maxDiag, normal.diag(p));
  // Regularises variables no prior touches.
  if (!normal.factor(1e-9 * Math.max(maxDiag, 1), null)) return { groups, attribution: [] };

  const deltas = new Map<string, Float64Array>();
  const rhs = new Float64Array(size);
  for (const [source, f] of movers) {
    for (let v = 0; v < size; v++) rhs[normal.slot[v] ?? 0] = f[v] ?? 0;
    normal.solve(rhs);
    deltas.set(
      source,
      Float64Array.from({ length: size }, (_, v) => rhs[normal.slot[v] ?? 0] ?? 0),
    );
  }

  const attribution: Attribution[] = [];
  for (const [group, { kind, members }] of byGroup) {
    if (kind !== BlockKind.Prior) continue;
    let norm2 = 0;
    const dots = new Map<string, number>();
    for (const i of members) {
      const b = blocks[i] as Block;
      const n = b.vars.length;
      for (let row = 0; row < b.size; row++) {
        const e = b.weight * (ev.r[(ev.rOff[i] ?? 0) + row] ?? 0);
        norm2 += e * e;
        for (const [source, dx] of deltas) {
          let d = 0;
          for (let c = 0; c < n; c++) d += (ev.J[(ev.jOff[i] ?? 0) + row * n + c] ?? 0) * (dx[b.vars[c] ?? 0] ?? 0);
          dots.set(source, (dots.get(source) ?? 0) + b.weight * d * e);
        }
      }
    }
    if (norm2 === 0) continue;
    const shares = [...dots]
      .map(([source, d]) => ({ source, share: d / norm2 }))
      .toSorted((a, b) => Math.abs(b.share) - Math.abs(a.share));
    attribution.push({ group, cost: 0.5 * norm2, shares, rest: 1 - shares.reduce((s, a) => s + a.share, 0) });
  }
  return { groups, attribution };
};

const fmt = (v: number): string => (v === 0 ? '0' : v.toPrecision(3));
const pct = (v: number): string => `${(100 * v).toFixed(0)}%`;

export const formatDiagnosis = (d: Diagnosis, minShare = 0.05): string => {
  const lines = ['group | kind | rows | cost | max |r| | max λ | active'];
  for (const g of d.groups) {
    const active = g.kind === BlockKind.Inequality ? String(g.activeRows) : '';
    lines.push([g.group, g.kind, g.rows, fmt(g.cost), fmt(g.maxAbs), fmt(g.maxMultiplier), active].join(' | '));
  }
  for (const a of d.attribution) {
    const parts = a.shares.filter((s) => Math.abs(s.share) >= minShare).map((s) => `${pct(s.share)} ${s.source}`);
    if (Math.abs(a.rest) >= minShare) parts.push(`${pct(a.rest)} other priors`);
    lines.push(`why ${a.group} (cost ${fmt(a.cost)}): ${parts.join(', ') || 'at its mean'}`);
  }
  return lines.join('\n');
};
