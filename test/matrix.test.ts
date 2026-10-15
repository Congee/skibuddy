import { assert, describe, it } from '@effect/vitest';
import { matrixProblems, rowsFor, shows } from '../src/content/matrix';
import { DOFS } from '../src/content/schema';
import type { Movement, Primitive } from '../src/content/schema';
import { contentWith, dofMatrix } from './fixtures';

const content = contentWith({});
const movement = content.movements[0] as Movement;
const primitive = (rows: ReadonlyArray<{ readonly dof: string; readonly side: string }>): Primitive =>
  ({ id: 'p', code: 'P9', name: 'P', summary: 'S', rows }) as unknown as Primitive;

describe('rowsFor', () => {
  it('resolves one-sided, both and trunk references', () => {
    const m = movement.dofMatrix;
    assert.deepStrictEqual(rowsFor(m, 'knee.flexion', 'outside').map((r) => r.side), ['outside']);
    assert.deepStrictEqual(rowsFor(m, 'knee.flexion', 'both').map((r) => r.side), ['outside', 'inside']);
    assert.deepStrictEqual(rowsFor(m, 'pelvis.tilt', 'outside').map((r) => r.side), ['trunk']);
    assert.deepStrictEqual(rowsFor(m, 'knee.flexion', 'trunk'), []);
  });
});

describe('shows', () => {
  it('needs every referenced row to work in some phase', () => {
    assert.isTrue(shows(movement, primitive([{ dof: 'knee.flexion', side: 'both' }])));
    assert.isFalse(shows(movement, primitive([{ dof: 'knee.flexion', side: 'outside' }, { dof: 'ankle.flexion', side: 'outside' }])));
  });
});

describe('matrixProblems', () => {
  it('passes the full fixture matrix', () => {
    assert.deepStrictEqual(matrixProblems(movement.dofMatrix, DOFS), []);
    assert.strictEqual(dofMatrix.length, 40);
  });

  it('rejects a both row beside a one-sided row', () => {
    const extra = { ...movement.dofMatrix[0], side: 'both' } as (typeof movement.dofMatrix)[number];
    assert.deepStrictEqual(matrixProblems([...movement.dofMatrix, extra], DOFS), [
      'row ankle.flexion has both a both row and a one-sided row',
    ]);
  });
});
