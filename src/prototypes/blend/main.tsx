// oxlint-disable-next-line import/no-unassigned-import -- page styles
import './blend.css';
import { RegistryProvider } from '@effect/atom-solid';
import { Show, createResource } from 'solid-js';
import type { JSX } from 'solid-js';
import { render } from 'solid-js/web';
import { loadData } from './data';
import { Blend } from './Blend';

const root = document.getElementById('root');
if (root === null) throw new Error('missing #root');

const Page = (): JSX.Element => {
  const [data, { refetch }] = createResource(() => loadData('/prototype-data.json'));
  return (
    <Show
      when={data()}
      fallback={
        <Show when={data.error !== undefined} fallback={<p class="boot">Loading skibuddy…</p>}>
          <div class="boot" role="alert">
            <p>The content did not load. Check the connection and try again.</p>
            <button type="button" class="chip" onClick={() => void refetch()}>
              Try again
            </button>
          </div>
        </Show>
      }
    >
      {(d) => <Blend data={d()} />}
    </Show>
  );
};

render(
  () => (
    <RegistryProvider>
      <Page />
    </RegistryProvider>
  ),
  root,
);
