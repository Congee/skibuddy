import { Contraction } from '../../content/schema';
import type { MuscleId } from '../../content/schema';
import { bvls, matrix } from '../../solve/bvls';
import type { Capacity } from './capacities';
import { TRUNK_COORDINATES } from './capacities-trunk';

/**
 * Static optimisation (motion-model.md §6.2–6.6): a frame of net joint moments shared among the muscles by least
 * squared activation, a co-contraction floor on the antagonists, the contraction mode and the 0–3 effort scale.
 */

/** Net moments, N·m along each coordinate's positive sense (`skeleton.ts`), keyed `hip_flexion.R`, `lumbar_bending`... */
export type MomentFrame = { readonly t: number; readonly nm: Readonly<Record<string, number>> };

export interface MuscleActivation {
  readonly muscle: MuscleId;
  readonly side: 'R' | 'L';
  readonly a: number;
  readonly mode: Contraction | null;
}

export interface DistributedFrame {
  readonly t: number;
  readonly muscles: ReadonlyArray<MuscleActivation>;
  /** Cᵀa on each carried coordinate, N·m. */
  readonly nm: Readonly<Record<string, number>>;
  /** ‖Cᵀa − M‖ / ‖M‖ over the carried coordinates. */
  readonly residual: number;
}

/** Below this joint speed the loaded group is isometric, inferred. */
export const ISOMETRIC_DEG_S = 10;
/** A coordinate under this moment has no loaded group. */
export const LOADED_NM = 1;
/** Eccentric force over the isometric maximum, inferred. */
export const MAX_ACTIVATION = 1.5;
/** hermann-2023: quadriceps-to-hamstrings 4.5 in recreational turns. */
export const RHO_KNEE = 0.22;
/** Other joints' antagonist floor, inferred from the knee. */
export const RHO_OTHER = 0.22;
// Moment residual in N·m against Σ a²: 1 N·m costs as much as a million unit activations, so the balance holds.
const MOMENT_WEIGHT = 1e3;

const at = (a: ArrayLike<number>, i: number): number => a[i] as number;

/** q̇ at frame `i` of a cycle of `q.length` frames over `periodS`, cyclic central difference, rad/s. */
export const velocityAt = (q: ReadonlyArray<number>, i: number, periodS: number): number => {
  const n = q.length;
  return (at(q, (i + 1) % n) - at(q, (i - 1 + n) % n)) / ((2 * periodS) / n);
};

/** The loaded group's mode at frame `i`: shortening when the moment and the motion agree. */
export const modeOf = (q: ReadonlyArray<number>, i: number, nm: number, periodS: number): Contraction | null => {
  if (Math.abs(nm) < LOADED_NM) return null;
  const qd = velocityAt(q, i, periodS);
  if (Math.abs(qd) < (ISOMETRIC_DEG_S * Math.PI) / 180) return Contraction.Isometric;
  return nm * qd > 0 ? Contraction.Concentric : Contraction.Eccentric;
};

const EFFORT: ReadonlyArray<readonly [number, number]> = [
  [0, 0],
  [0.05, 0.5],
  [0.2, 1.5],
  [0.5, 2.5],
  [1, 3],
];

/** biomechanics.md 0.3's bands: effort 0.5 / 1.5 / 2.5 at 5 / 20 / 50 % MVC, 3 from 100 %. */
export const effortOfActivation = (a: number): number => {
  if (a <= 0) return 0;
  for (let k = 1; k < EFFORT.length; k++) {
    const [a1, e1] = EFFORT[k] ?? [1, 3];
    if (a <= a1) {
      const [a0, e0] = EFFORT[k - 1] ?? [0, 0];
      return e0 + ((a - a0) / (a1 - a0)) * (e1 - e0);
    }
  }
  return 3;
};

/** Capacity-weighted mean activation of a group's parts (quadriceps, hamstrings, calf, obliques). */
export const groupActivation = (parts: ReadonlyArray<MuscleActivation>, caps: ReadonlyArray<Capacity>): number => {
  let num = 0;
  let den = 0;
  for (const p of parts) {
    const w = caps.reduce((s, c) => (c.muscle === p.muscle ? s + Math.abs(c.nm) : s), 0);
    num += w * p.a;
    den += w;
  }
  return den > 0 ? num / den : 0;
};

interface Unknown {
  readonly muscle: MuscleId;
  readonly side: 'R' | 'L';
  /** Full coordinate name → summed capacity, N·m. */
  readonly c: Map<string, number>;
}
interface Block {
  readonly unknowns: ReadonlyArray<number>;
  readonly coordinates: ReadonlyArray<string>;
}
interface Layout {
  readonly unknowns: ReadonlyArray<Unknown>;
  readonly byKey: ReadonlyMap<string, Unknown>;
  readonly blocks: ReadonlyArray<Block>;
}

const TRUNK = new Set(TRUNK_COORDINATES);
// The left copy of a bilateral trunk muscle bends and rotates the other way (capacities-trunk.ts).
const FLIPPED = /_(bending|rotation)$/;
const SIDED = /\.[RL]$/;
const SIDES = ['R', 'L'] as const;

/** Right-copy capacities → per-side unknowns, split into blocks that share no coordinate. */
const layoutOf = (caps: ReadonlyArray<Capacity>): Layout => {
  const byKey = new Map<string, Unknown>();
  const add = (muscle: MuscleId, side: 'R' | 'L', coordinate: string, nm: number): void => {
    const key = `${muscle}.${side}`;
    let u = byKey.get(key);
    if (u === undefined) byKey.set(key, (u = { muscle, side, c: new Map() }));
    // A merged muscle's parts on one coordinate sum: one activation drives them all.
    u.c.set(coordinate, (u.c.get(coordinate) ?? 0) + nm);
  };
  for (const cap of caps) {
    for (const side of SIDES) {
      if (TRUNK.has(cap.coordinate)) add(cap.muscle, side, cap.coordinate, side === 'L' && FLIPPED.test(cap.coordinate) ? -cap.nm : cap.nm);
      else if (!SIDED.test(cap.coordinate)) add(cap.muscle, side, `${cap.coordinate}.${side}`, cap.nm);
      else if (cap.coordinate.endsWith(`.${side}`)) add(cap.muscle, side, cap.coordinate, cap.nm);
    }
  }
  const unknowns = [...byKey.values()];
  const parent = unknowns.map((_, i) => i);
  const root = (i: number): number => (parent[i] === i ? i : (parent[i] = root(at(parent, i))));
  const owner = new Map<string, number>();
  unknowns.forEach((u, i) => {
    for (const j of u.c.keys()) {
      const o = owner.get(j);
      if (o === undefined) owner.set(j, i);
      else parent[root(i)] = root(o);
    }
  });
  const groups = new Map<number, { unknowns: number[]; coordinates: string[] }>();
  unknowns.forEach((_, i) => {
    const r = root(i);
    if (!groups.has(r)) groups.set(r, { unknowns: [], coordinates: [] });
    groups.get(r)?.unknowns.push(i);
  });
  for (const [j, i] of owner) groups.get(root(i))?.coordinates.push(j);
  return { unknowns, byKey, blocks: [...groups.values()] };
};

const layouts = new WeakMap<ReadonlyArray<Capacity>, Layout>();
const layoutFor = (caps: ReadonlyArray<Capacity>): Layout => {
  let layout = layouts.get(caps);
  if (layout === undefined) layouts.set(caps, (layout = layoutOf(caps)));
  return layout;
};

/** min W²‖Cᵀa − M‖² + Σ a² over one block, lo ≤ a ≤ MAX_ACTIVATION. */
const solveBlock = (layout: Layout, block: Block, m: Float64Array, lo: Float64Array): Float64Array => {
  const nc = block.coordinates.length;
  const nu = block.unknowns.length;
  const A = matrix(nc + nu, nu);
  const b = new Float64Array(nc + nu);
  block.coordinates.forEach((j, r) => {
    b[r] = MOMENT_WEIGHT * at(m, r);
    block.unknowns.forEach((u, c) => (A.data[r * nu + c] = MOMENT_WEIGHT * (layout.unknowns[u]?.c.get(j) ?? 0)));
  });
  for (let c = 0; c < nu; c++) A.data[(nc + c) * nu + c] = 1;
  return bvls(A, b, lo, new Float64Array(nu).fill(MAX_ACTIVATION));
};

const flip = (mode: Contraction | null): Contraction | null =>
  mode === Contraction.Concentric ? Contraction.Eccentric : mode === Contraction.Eccentric ? Contraction.Concentric : mode;

/**
 * Activations for one frame. `caps` are right-copy capacities (`capacities.ts`, `capacities-trunk.ts`): each leg
 * and arm row applies to both sides' suffixed coordinates (a row already suffixed `.R` or `.L` to that side only),
 * each trunk row to an R and a mirrored L copy. A coordinate `moments` omits is free: no equality row, never a zero.
 */
export const distributeFrame = (moments: MomentFrame, modes: Readonly<Record<string, Contraction | null>>, caps: ReadonlyArray<Capacity>): DistributedFrame => {
  const layout = layoutFor(caps);
  const a = new Float64Array(layout.unknowns.length);
  const got: Record<string, number> = {};
  let err = 0;
  let norm = 0;
  for (const whole of layout.blocks) {
    const block: Block = { unknowns: whole.unknowns, coordinates: whole.coordinates.filter((j) => moments.nm[j] !== undefined) };
    if (block.coordinates.length === 0) continue;
    const m = Float64Array.from(block.coordinates, (j) => moments.nm[j] ?? 0);
    m.forEach((v, r) => {
      if (!Number.isFinite(v)) throw new Error(`distributeFrame: ${block.coordinates[r]} = ${v}`);
    });
    const cOf = (u: number, j: string): number => layout.unknowns[u]?.c.get(j) ?? 0;
    const lo = new Float64Array(block.unknowns.length);
    const first = solveBlock(layout, block, m, lo);
    // 6.5: antagonists of each loaded coordinate get a floor at ρ × the largest agonist activation.
    block.coordinates.forEach((j, r) => {
      const mj = at(m, r);
      if (Math.abs(mj) < LOADED_NM) return;
      const rho = j.startsWith('knee_flexion') ? RHO_KNEE : RHO_OTHER;
      let agonist = 0;
      block.unknowns.forEach((u, c) => {
        if (cOf(u, j) * mj > 0) agonist = Math.max(agonist, at(first, c));
      });
      block.unknowns.forEach((u, c) => {
        if (cOf(u, j) * mj < 0) lo[c] = Math.min(MAX_ACTIVATION, Math.max(at(lo, c), rho * agonist));
      });
    });
    const final = solveBlock(layout, block, m, lo);
    block.unknowns.forEach((u, c) => (a[u] = at(final, c)));
    block.coordinates.forEach((j, r) => {
      const v = block.unknowns.reduce((s, u, c) => s + cOf(u, j) * at(final, c), 0);
      got[j] = v;
      err += (v - at(m, r)) ** 2;
      norm += at(m, r) ** 2;
    });
  }
  const muscles = layout.unknowns.map((u, i): MuscleActivation => {
    const ai = at(a, i);
    let mode: Contraction | null = null;
    let largest = 0;
    for (const [j, c] of u.c) {
      if (moments.nm[j] === undefined) continue;
      const share = Math.abs(ai * c);
      if (share <= largest) continue;
      largest = share;
      const own = modes[j] ?? null;
      // A coordinate's mode is its loaded group's; an antagonist moves the other way.
      mode = c * (moments.nm[j] ?? 0) < 0 ? flip(own) : own;
    }
    return { muscle: u.muscle, side: u.side, a: ai, mode };
  });
  return { t: moments.t, muscles, nm: got, residual: norm > 0 ? Math.sqrt(err / norm) : 0 };
};

/** Share of a coordinate's demand (at least `LOADED_NM`) its residual may keep while an agonist has room. */
export const RESIDUAL_SHARE = 0.02;

export interface Imbalance {
  readonly coordinate: string;
  /** Demanded and produced moment, N·m. */
  readonly demand: number;
  readonly got: number;
  /** Agonists (capacity in the demand's sense) below `MAX_ACTIVATION`. */
  readonly room: ReadonlyArray<MuscleActivation>;
}

/** Carried coordinates keeping a residual over `RESIDUAL_SHARE` that is not every agonist at the bound, short in the demand's sense. */
export const imbalancesOf = (moments: MomentFrame, f: DistributedFrame, caps: ReadonlyArray<Capacity>): Imbalance[] => {
  const layout = layoutFor(caps);
  return Object.entries(f.nm).flatMap(([j, got]) => {
    const demand = moments.nm[j] ?? 0;
    const r = demand - got;
    if (Math.abs(r) <= RESIDUAL_SHARE * Math.max(Math.abs(demand), LOADED_NM)) return [];
    const room = f.muscles.filter((m) => (layout.byKey.get(`${m.muscle}.${m.side}`)?.c.get(j) ?? 0) * demand > 0 && m.a < MAX_ACTIVATION - 1e-9);
    return room.length === 0 && r * demand > 0 ? [] : [{ coordinate: j, demand, got, room }];
  });
};
