import { Cause } from 'effect';
import { ContentError } from '../content/validate';
import { ContentFetchError } from '../state/content';

export interface FailureCopy {
  readonly title: string;
  readonly body: string;
  /** Technical detail for a bug report. */
  readonly detail: string;
}

/** Turns a content-load failure into words a skier can act on. */
export const describeFailure = (cause: Cause.Cause<unknown>): FailureCopy => {
  const error = Cause.squash(cause);
  if (error instanceof ContentFetchError) {
    return {
      title: 'The drills could not be downloaded',
      body: 'Check your connection, then reload the page.',
      detail: error.message,
    };
  }
  if (error instanceof ContentError) {
    return {
      title: 'The drill content has a problem',
      body: 'This is a bug in skibuddy, not something you did. Reloading will not fix it; please report it with the detail below.',
      detail: error.problems.join('\n'),
    };
  }
  return {
    title: 'The drills could not be loaded',
    body: 'Reload the page. If it keeps happening, please report it with the detail below.',
    detail: error instanceof Error ? error.message : Cause.pretty(cause),
  };
};
