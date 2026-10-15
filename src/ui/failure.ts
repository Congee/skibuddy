import { Cause, Schema } from 'effect';
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
  if (Schema.isSchemaError(error)) {
    return {
      title: 'The drill content is in the wrong shape',
      body: 'This is a bug in skibuddy, not something you did. Reloading will not fix it; please report it with the detail below.',
      detail: error.message,
    };
  }
  return {
    title: 'The drills could not be loaded',
    body: 'Reload the page. If it keeps happening, please report it with the detail below.',
    detail: error instanceof Error ? error.message : Cause.pretty(cause),
  };
};
