import { assert, describe, it } from '@effect/vitest';
import { Effect, Exit, Schema } from 'effect';
import { Activation, Content, Muscle } from '../src/content/schema';
import { activation, rawContent } from './fixtures';

const decodeContent = Schema.decodeUnknownEffect(Content);
const decodeActivation = Schema.decodeUnknownExit(Activation);

describe('schema', () => {
  it.effect('decodes valid content', () =>
    Effect.gen(function* () {
      const content = yield* decodeContent(rawContent);
      assert.strictEqual(content.movements[0]?.activations[0]?.muscle, 'quadriceps');
    }),
  );

  it('rejects an intensity above 3', () => {
    assert.isTrue(Exit.isFailure(decodeActivation({ ...activation, intensity: { initiation: 4, shaping: 0, finish: 0 } })));
  });

  it('rejects a fractional intensity', () => {
    assert.isTrue(Exit.isFailure(decodeActivation({ ...activation, intensity: { initiation: 1.5, shaping: 0, finish: 0 } })));
  });

  it('rejects an empty contraction list', () => {
    assert.isTrue(Exit.isFailure(decodeActivation({ ...activation, contraction: [] })));
  });

  it('rejects an unknown side', () => {
    assert.isTrue(Exit.isFailure(decodeActivation({ ...activation, side: 'left' })));
  });

  it('rejects ids that are not slugs', () => {
    assert.isTrue(Exit.isFailure(Schema.decodeUnknownExit(Muscle)({ id: 'Quad Muscle', name: 'Quad', region: 'leg' })));
  });

  it('accepts an optional FMA id and rejects a malformed one', () => {
    const decode = Schema.decodeUnknownExit(Muscle);
    assert.isTrue(Exit.isSuccess(decode({ id: 'quadriceps', name: 'Quadriceps', region: 'leg', fma: 'FMA:22428' })));
    assert.isTrue(Exit.isFailure(decode({ id: 'quadriceps', name: 'Quadriceps', region: 'leg', fma: '22428' })));
  });

  it.effect('fails on missing fields', () =>
    Effect.gen(function* () {
      const result = yield* Effect.exit(decodeContent({ ...rawContent, exercises: undefined }));
      assert.isTrue(Exit.isFailure(result));
    }),
  );
});
