import { FundamentalsRelation, isAxial, MatrixSide, PHASES, Side } from './schema';
import type {
  Activation,
  AssociationFundamentals,
  AssociationTask,
  Dof,
  Drill,
  Fundamental,
  MatrixRow,
  Movement,
  Primitive,
  PrimitiveId,
  Requirement,
} from './schema';

/**
 * The matrix rows a (dof, side) reference resolves to: one-sided limb refs take their own row or a shared
 * `both` row; `both` takes the shared row or both one-sided rows; axial refs take the trunk row.
 * Empty when the matrix cannot answer the reference.
 */
export const rowsFor = (matrix: ReadonlyArray<MatrixRow>, dof: Dof, side: MatrixSide): ReadonlyArray<MatrixRow> => {
  const find = (s: MatrixSide): MatrixRow | undefined => matrix.find((r) => r.dof === dof && r.side === s);
  if (isAxial(dof)) {
    const trunk = find(MatrixSide.Trunk);
    return trunk === undefined ? [] : [trunk];
  }
  if (side === MatrixSide.Trunk) return [];
  const both = find(MatrixSide.Both);
  if (both !== undefined) return [both];
  if (side === MatrixSide.Both) {
    const outside = find(MatrixSide.Outside);
    const inside = find(MatrixSide.Inside);
    return outside === undefined || inside === undefined ? [] : [outside, inside];
  }
  const own = find(side);
  return own === undefined ? [] : [own];
};

/** The rows an activation's `serves` entry resolves to on the activation's side. */
export const servedRows = (movement: Movement, a: Activation, dof: Dof): ReadonlyArray<MatrixRow> =>
  rowsFor(movement.dofMatrix, dof, a.side === Side.Both ? MatrixSide.Both : a.side);

/** A row moves (rather than holds neutral) in at least one phase. */
export const isWorking = (row: MatrixRow): boolean => PHASES.some((p) => row.cells[p].neutral !== true);

const MIRROR: Readonly<Record<MatrixSide, MatrixSide>> = {
  [MatrixSide.Outside]: MatrixSide.Inside,
  [MatrixSide.Inside]: MatrixSide.Outside,
  [MatrixSide.Both]: MatrixSide.Both,
  [MatrixSide.Trunk]: MatrixSide.Trunk,
};

/** The movement works every row the primitive owns, on the other leg when `mirrored`. */
export const shows = (movement: Movement, primitive: Primitive, mirrored = false): boolean =>
  primitive.rows.every((ref) => {
    const rows = rowsFor(movement.dofMatrix, ref.dof, mirrored ? MIRROR[ref.side] : ref.side);
    return rows.length > 0 && rows.every(isWorking);
  });

/** Why the matrix fails the shape rules (one trunk row per axial DOF, two sides or one `both` per limb DOF). */
export const matrixProblems = (matrix: ReadonlyArray<MatrixRow>, dofs: ReadonlyArray<Dof>): ReadonlyArray<string> => {
  const problems: Array<string> = [];
  const keys = matrix.map((r) => `${r.dof} ${r.side}`);
  for (const [i, key] of keys.entries()) if (keys.indexOf(key) !== i) problems.push(`row ${key} appears twice`);
  for (const row of matrix) {
    if (isAxial(row.dof) !== (row.side === MatrixSide.Trunk)) {
      problems.push(`row ${row.dof} ${row.side}: ${isAxial(row.dof) ? 'a midline joint takes side trunk' : 'a limb joint cannot take side trunk'}`);
    }
  }
  for (const dof of dofs) {
    const sides = new Set(matrix.filter((r) => r.dof === dof).map((r) => r.side));
    if (isAxial(dof)) {
      if (!sides.has(MatrixSide.Trunk)) problems.push(`missing row ${dof} trunk`);
    } else if (sides.has(MatrixSide.Both)) {
      if (sides.has(MatrixSide.Outside) || sides.has(MatrixSide.Inside)) problems.push(`row ${dof} has both a both row and a one-sided row`);
    } else {
      for (const s of [MatrixSide.Outside, MatrixSide.Inside]) if (!sides.has(s)) problems.push(`missing row ${dof} ${s}`);
    }
  }
  return problems;
};

const requirementMet = (have: ReadonlySet<PrimitiveId>, r: Requirement): boolean =>
  typeof r === 'string' ? have.has(r) : r.anyOf.some((id) => have.has(id));

/** The drill's plain primitives, or its mirrored ones, meet every requirement of the fundamental; the two never mix. */
export const drillMeets = (drill: Drill, fundamental: Fundamental): boolean =>
  [false, true].some((mirrored) => {
    const have = new Set(drill.primitives.flatMap((p) => ((p.mirrored === true) === mirrored ? [p.primitive] : [])));
    return fundamental.requires.every((r) => requirementMet(have, r));
  });

/** Why a task's fundamentals do not follow from its drill's primitives, or undefined. */
export const taskFundamentalsProblem = (
  task: AssociationTask,
  drill: Drill,
  fundamentals: AssociationFundamentals | undefined,
): string | undefined => {
  if (task.fundamentals === undefined) return undefined;
  if (fundamentals === undefined) return `no fundamentals file for ${task.association}`;
  const found = task.fundamentals.ids.map((id) => fundamentals.fundamentals.find((f) => f.id === id));
  const unknown = task.fundamentals.ids.filter((_, i) => found[i] === undefined);
  if (unknown.length > 0) return `unknown fundamental ${unknown.join(', ')}`;
  const missed = task.fundamentals.ids.filter((_, i) => {
    const f = found[i];
    return f !== undefined && !drillMeets(drill, f);
  });
  if (task.fundamentals.relation === FundamentalsRelation.And) {
    return missed.length === 0 ? undefined : `drill ${drill.id} does not show fundamental ${missed.join(', ')}`;
  }
  return missed.length < found.length ? undefined : `drill ${drill.id} shows none of ${missed.join(', ')}`;
};
