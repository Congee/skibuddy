import { Collapsible } from '@ark-ui/solid/collapsible';
import { useAtom, useAtomValue } from '@effect/atom-solid';
import * as AsyncResult from 'effect/reactivity/AsyncResult';
import { Show, createMemo } from 'solid-js';
import type { JSX } from 'solid-js';
import type { Content } from '../content/schema';
import { contentAtom } from '../state/content';
import { drillIdAtom } from '../state/playback';
import * as s from './app.css';
import { Select } from './components/Select';
import { DrillView } from './Drill';
import { describeFailure } from './failure';
import { visuallyHidden } from './theme/global.css';

const DrillPicker = (props: { readonly content: Content }): JSX.Element => {
  const [drillId, setDrillId] = useAtom(() => drillIdAtom);
  const options = createMemo(() => props.content.drills.map((d) => ({ value: d.id, label: d.name })));
  return (
    <Show when={props.content.drills.length > 0}>
      <div class={s.picker}>
        <Select
          label="Drill"
          options={options()}
          value={drillId() ?? props.content.drills[0]?.id ?? ''}
          onChange={(v) => setDrillId(props.content.drills.find((d) => d.id === v)?.id ?? null)}
        />
      </div>
    </Show>
  );
};

const Failure = (props: { readonly title: string; readonly body: string; readonly detail: string }): JSX.Element => (
  <div class={s.failure} role="alert">
    <h1 class={s.failureTitle}>{props.title}</h1>
    <p>{props.body}</p>
    <Collapsible.Root>
      <Collapsible.Trigger class={s.detailToggle}>Show the detail</Collapsible.Trigger>
      <Collapsible.Content>
        <pre class={s.failureDetail}>{props.detail}</pre>
      </Collapsible.Content>
    </Collapsible.Root>
  </div>
);

const Ext = (props: { readonly href: string; readonly children: JSX.Element }): JSX.Element => (
  <a href={props.href} target="_blank" rel="noopener noreferrer">
    {props.children}
    <span class={visuallyHidden}> (opens in a new tab)</span>
  </a>
);

export const App = (): JSX.Element => {
  const result = useAtomValue(() => contentAtom);
  const content = (): Content | undefined => {
    const r = result();
    return AsyncResult.isSuccess(r) ? r.value : undefined;
  };
  return (
    <>
      <header class={s.bar}>
        <span class={s.mark}>skibuddy</span>
        <Show when={content()}>{(c) => <DrillPicker content={c()} />}</Show>
        <p class={s.note}>Not medical advice. Not affiliated with any instructor association.</p>
      </header>
      {AsyncResult.match(result(), {
        onInitial: () => (
          <p class={s.status} role="status">
            Loading drills…
          </p>
        ),
        onFailure: (failure) => <Failure {...describeFailure(failure.cause)} />,
        onSuccess: (success) => <DrillView content={success.value} />,
      })}
      <footer class={s.foot}>
        <p>Not medical advice. Not affiliated with or endorsed by any instructor association. Code MIT, content CC BY-SA 4.0.</p>
        <p id="credits">
          Anatomy: <Ext href="https://www.z-anatomy.com/">Z-Anatomy</Ext> (
          <Ext href="https://creativecommons.org/licenses/by-sa/4.0/">CC BY-SA 4.0</Ext>), from{' '}
          <Ext href="https://lifesciencedb.jp/bp3d/">BodyParts3D</Ext>, © The Database Center for Life Science (
          <Ext href="https://creativecommons.org/licenses/by-sa/2.1/jp/deed.en">CC BY-SA 2.1 JP</Ext>)
        </p>
      </footer>
    </>
  );
};

