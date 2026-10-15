import { assert, describe, it } from '@effect/vitest';
import { Exit, Schema } from 'effect';
import { Dosing, Exercise } from '../src/content/schema';
import { findProblems } from '../src/content/validate';
import { formatRange, formatRest, formatSuggestion, shortCitation } from '../src/ui/gym/dosing';
import { decode as decodeContent, exercise, rawContent } from './fixtures';

const dosing = {
  perSide: true,
  ranges: [
    {
      goal: 'strength',
      sets: { min: 2, max: 3 },
      reps: { min: 8, max: 12 },
      restSeconds: { min: 60, max: 120 },
      note: 'Hard by the last rep',
      basis: 'General loading zones',
      sources: ['study-1'],
    },
    {
      goal: 'endurance',
      sets: { min: 2, max: 3 },
      holdSeconds: { min: 20, max: 40 },
      restSeconds: { min: 30, max: 60 },
      note: 'Steady',
      basis: 'Holds below a maximal effort',
      sources: ['study-1'],
    },
  ],
  suggested: { goal: 'strength', sets: 3, reps: 8 },
};

const decode = Schema.decodeUnknownExit(Dosing);
const fails = (u: unknown): boolean => Exit.isFailure(decode(u));
const withRange = (patch: Record<string, unknown>): unknown => ({
  ...dosing,
  ranges: [{ ...dosing.ranges[0], ...patch }, dosing.ranges[1]],
});

describe('dosing schema', () => {
  it('decodes valid dosing', () => {
    assert.isTrue(Exit.isSuccess(decode(dosing)));
  });

  it('keeps dosing optional on an exercise', () => {
    assert.isTrue(Exit.isSuccess(Schema.decodeUnknownExit(Exercise)(exercise)));
    assert.isTrue(Exit.isSuccess(Schema.decodeUnknownExit(Exercise)({ ...exercise, dosing })));
  });

  it('rejects a range with min above max', () => {
    assert.isTrue(fails(withRange({ sets: { min: 4, max: 2 } })));
    assert.isTrue(fails(withRange({ reps: { min: 12, max: 8 } })));
    assert.isTrue(fails(withRange({ restSeconds: { min: 120, max: 60 } })));
  });

  it('rejects zero or fractional counts', () => {
    assert.isTrue(fails(withRange({ sets: { min: 0, max: 2 } })));
    assert.isTrue(fails(withRange({ reps: { min: 8.5, max: 12 } })));
  });

  it('needs exactly one of reps or holdSeconds', () => {
    assert.isTrue(fails(withRange({ holdSeconds: { min: 10, max: 20 } })));
    assert.isTrue(fails({ ...dosing, ranges: [{ ...dosing.ranges[1], holdSeconds: undefined }] }));
  });

  it('rejects a suggestion outside its range', () => {
    assert.isTrue(fails({ ...dosing, suggested: { goal: 'strength', sets: 5, reps: 8 } }));
    assert.isTrue(fails({ ...dosing, suggested: { goal: 'strength', sets: 3, reps: 15 } }));
    assert.isTrue(fails({ ...dosing, suggested: { goal: 'endurance', sets: 2, holdSeconds: 60 } }));
  });

  it('rejects a suggestion whose unit or goal does not match a range', () => {
    assert.isTrue(fails({ ...dosing, suggested: { goal: 'strength', sets: 3, holdSeconds: 30 } }));
    assert.isTrue(fails({ ...dosing, suggested: { goal: 'power', sets: 3, reps: 5 } }));
  });

  it('rejects a goal listed twice', () => {
    assert.isTrue(fails({ ...dosing, ranges: [dosing.ranges[0], dosing.ranges[0]] }));
  });

  it('needs a basis and at least one source per goal', () => {
    assert.isTrue(fails(withRange({ sources: [] })));
    assert.isTrue(fails(withRange({ basis: undefined })));
  });

  it('flags an unknown dosing source', () => {
    const exercises = [{ ...exercise, dosing: withRange({ sources: ['nope'] }) }];
    assert.deepStrictEqual(findProblems(decodeContent({ ...rawContent, exercises })), ['exercise split-squat, dosing strength: unknown source nope']);
  });

  it('accepts a known dosing source', () => {
    assert.deepStrictEqual(findProblems(decodeContent({ ...rawContent, exercises: [{ ...exercise, dosing }] })), []);
  });
});

describe('dosing text', () => {
  const decoded = Schema.decodeUnknownSync(Dosing)(dosing);
  const [strength, endurance] = decoded.ranges;

  it('formats ranges, holds and the suggestion', () => {
    assert.strictEqual(strength && formatRange(strength, true), '2–3 sets × 8–12 reps each side');
    assert.strictEqual(endurance && formatRange(endurance, false), '2–3 sets × 20–40 s hold');
    assert.strictEqual(formatSuggestion(decoded.suggested, true), '3 × 8 reps each side');
  });

  it('formats rest in minutes only when both ends are whole minutes', () => {
    assert.strictEqual(formatRest({ min: 60, max: 120 }), '1–2 min');
    assert.strictEqual(formatRest({ min: 45, max: 90 }), '45–90 s');
  });

  it('shortens a citation to authors and year', () => {
    assert.strictEqual(shortCitation('Petersen J et al. A trial. Am J Sports Med. 2011;39:2296-303.'), 'Petersen J et al 2011');
  });
});
