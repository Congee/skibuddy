import { Effect, Schema } from 'effect';
import * as Atom from 'effect/reactivity/Atom';
import { validateContent } from '../content/validate';

export class ContentFetchError extends Schema.TaggedError<ContentFetchError>()('ContentFetchError', {
  message: Schema.String,
}) {}

const fetchJson = (url: string): Effect.Effect<unknown, ContentFetchError> =>
  Effect.tryPromise({
    try: async (signal) => {
      const response = await fetch(url, { signal });
      if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
      return (await response.json()) as unknown;
    },
    catch: (error) => new ContentFetchError({ message: error instanceof Error ? error.message : String(error) }),
  });

const loadContent = Effect.gen(function* () {
  const json = yield* fetchJson(`${import.meta.env.BASE_URL}content.json`);
  return yield* validateContent(json);
});

export const contentAtom = Atom.keepAlive(Atom.make(loadContent));
