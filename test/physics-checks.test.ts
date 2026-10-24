import { assert, describe, it } from '@effect/vitest';
import { parse } from 'yaml';
import litCurves from '../scripts/prior/lit-curves.json';
import sourcesRaw from '../content/sources.yaml?raw';
import { CHECKS, CheckStatus, DataKind } from '../src/physics/checks';
import type { Condition, Conditions, PointData } from '../src/physics/checks';

const sourceIds = new Set((parse(sourcesRaw) as ReadonlyArray<{ id: string }>).map((s) => s.id));

const lit = litCurves as unknown as Record<string, Record<string, unknown> | undefined>;

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

const resolves = (data: PointData): boolean => {
  if (data.kind !== DataKind.Curve) return true;
  const channel = lit[data.curve]?.[data.channel];
  if (channel === undefined) return false;
  if (data.key === undefined) return true;
  if (!isRecord(channel)) return false;
  const leaf = channel[data.key];
  if (leaf === undefined) return false;
  return !(isRecord(leaf) && leaf['status'] === 'missing');
};

const flat = (c: Condition): ReadonlyArray<number> => (typeof c === 'number' ? [c] : c);

const numericConditions = (c: Conditions): ReadonlyArray<readonly [string, ReadonlyArray<number>]> =>
  Object.entries(c)
    .filter(([k, v]) => k !== 'n' && k !== 'about' && (typeof v === 'number' || Array.isArray(v)))
    .map(([k, v]) => [k, flat(v as Condition)] as const);

const dataNumbers = (d: PointData): ReadonlyArray<number> => {
  if (d.kind !== DataKind.Value) return [];
  const out: number[] = [];
  for (const x of [d.value, d.peak, d.tS]) if (x !== undefined) out.push(x);
  for (const x of [d.range, d.t]) if (x !== undefined) out.push(...flat(x));
  if (d.values !== undefined) out.push(...Object.values(d.values));
  return out;
};

describe('checks table', () => {
  it('is not empty', () => {
    assert.isAbove(CHECKS.length, 0);
  });

  it('has unique ids', () => {
    const ids = CHECKS.map((p) => p.id);
    assert.deepStrictEqual(ids.filter((id, i) => ids.indexOf(id) !== i), []);
  });

  it('cites only sources.yaml ids', () => {
    assert.isAbove(sourceIds.size, 0);
    assert.deepStrictEqual(CHECKS.filter((p) => !sourceIds.has(p.source)).map((p) => p.id), []);
  });

  it('resolves every lit-curves reference', () => {
    assert.deepStrictEqual(CHECKS.filter((p) => !resolves(p.data)).map((p) => p.id), []);
  });

  it('keeps conditions finite and positive', () => {
    const bad = CHECKS.filter((p) =>
      numericConditions(p.conditions).some(([, xs]) => xs.some((x) => !Number.isFinite(x) || x <= 0)),
    );
    assert.deepStrictEqual(bad.map((p) => p.id), []);
  });

  it('keeps condition ranges ordered, shares within 0-1, n a positive integer', () => {
    const bad = CHECKS.filter((p) => {
      const c = p.conditions;
      const ranged = numericConditions(c).some(([, xs]) => xs.length === 2 && (xs[0] ?? 0) > (xs[1] ?? 0));
      const share = c.skidShare !== undefined && flat(c.skidShare).some((x) => x > 1);
      const n = c.n !== undefined && !(Number.isInteger(c.n) && c.n > 0);
      return ranged || share || n;
    });
    assert.deepStrictEqual(bad.map((p) => p.id), []);
  });

  it('keeps data numbers finite', () => {
    assert.deepStrictEqual(CHECKS.filter((p) => dataNumbers(p.data).some((x) => !Number.isFinite(x))).map((p) => p.id), []);
  });

  it('gives every point a status and a where', () => {
    const statuses = new Set<string>(Object.values(CheckStatus));
    const bad = CHECKS.filter((p) => !statuses.has(p.status) || p.where.trim() === '');
    assert.deepStrictEqual(bad.map((p) => p.id), []);
  });
});
