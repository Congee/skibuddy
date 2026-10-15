import { assert, describe, it } from '@effect/vitest';
import { Cause, Effect, Exit } from 'effect';
import { ContentError, validateContent } from '../src/content/validate';
import { ContentFetchError } from '../src/state/content';
import { describeFailure } from '../src/ui/failure';

describe('describeFailure', () => {
  it('says a content problem will not go away on reload, and lists the problems', () => {
    const copy = describeFailure(Cause.fail(new ContentError({ problems: ['drill a: unknown movement b', 'duplicate muscle id: calf'] })));
    assert.include(copy.title, 'drill content');
    assert.include(copy.body, 'will not fix');
    assert.notInclude(copy.body, 'Reload the page');
    assert.strictEqual(copy.detail, 'drill a: unknown movement b\nduplicate muscle id: calf');
  });

  it('shows a decode failure as a content problem with its detail', () => {
    const exit = Effect.runSyncExit(validateContent({ drills: 'none' }));
    assert.isTrue(Exit.isFailure(exit));
    if (!Exit.isFailure(exit)) return;
    const copy = describeFailure(exit.cause);
    assert.include(copy.title, 'drill content');
    assert.isAbove(copy.detail.length, 0);
  });

  it('asks for a reload after a failed download', () => {
    const copy = describeFailure(Cause.fail(new ContentFetchError({ message: 'HTTP 503' })));
    assert.include(copy.body, 'reload');
    assert.strictEqual(copy.detail, 'HTTP 503');
  });
});
