import { useAtomValue } from '@effect/atom-solid';
import { Cause } from 'effect';
import * as AsyncResult from 'effect/reactivity/AsyncResult';
import type { JSX } from 'solid-js';
import { contentAtom } from '../state/content';
import { Drill } from './Drill';

export const App = (): JSX.Element => {
  const result = useAtomValue(() => contentAtom);
  return (
    <main class="app">
      <header class="app-header">
        <h1>SkiBuddy</h1>
        <p class="note">Not medical advice. Not affiliated with PSIA or any association.</p>
      </header>
      {AsyncResult.match(result(), {
        onInitial: () => <p role="status">Loading drills…</p>,
        onFailure: (failure) => (
          <div role="alert" class="error">
            <p>Could not load drill content.</p>
            <pre>{Cause.pretty(failure.cause)}</pre>
          </div>
        ),
        onSuccess: (success) => <Drill content={success.value} />,
      })}
    </main>
  );
};
