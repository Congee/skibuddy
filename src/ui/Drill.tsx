import { useAtom, useAtomValue } from '@effect/atom-solid';
import { For, Show, createMemo } from 'solid-js';
import type { JSX } from 'solid-js';
import { levelsAt } from '../content/activation';
import { matchExercises } from '../content/match';
import type { Content } from '../content/schema';
import { taskIndexAtom, turnTimeAtom } from '../state/playback';
import { Viewer } from '../viewer/Viewer';
import { ExerciseList } from './ExerciseList';
import { MusclePanel } from './MusclePanel';
import { Scrubber } from './Scrubber';

export const Drill = (props: { readonly content: Content }): JSX.Element => {
  const [taskIndex, setTaskIndex] = useAtom(() => taskIndexAtom);
  const t = useAtomValue(() => turnTimeAtom);
  const task = createMemo(() => props.content.tasks[taskIndex()] ?? props.content.tasks[0]);
  const movement = createMemo(() => {
    const id = task()?.movement;
    return props.content.movements.find((m) => m.id === id);
  });

  return (
    <Show when={task()} fallback={<p>No drills yet.</p>}>
      {(current) => (
        <div class="drill">
          <section class="drill-picker" aria-label="Drill">
            <label>
              Drill{' '}
              <select value={taskIndex()} onChange={(e) => setTaskIndex(Number(e.currentTarget.value))}>
                <For each={props.content.tasks}>
                  {(item, i) => (
                    <option value={i()}>
                      {item.task} ({item.association.toUpperCase()} level {item.level})
                    </option>
                  )}
                </For>
              </select>
            </label>
            <p>{current().summary}</p>
            <p class="muted">
              Terrain: {current().terrain}.{' '}
              <a href={current().url} target="_blank" rel="noopener noreferrer">
                {current().association.toUpperCase()} task page
              </a>
            </p>
          </section>
          <Show when={movement()} fallback={<p role="alert">This drill has no movement data.</p>}>
            {(m) => (
              <>
                <div class="stage">
                  <Viewer movement={m()} muscles={props.content.muscles.map((x) => x.id)} />
                  <Scrubber />
                </div>
                <MusclePanel levels={levelsAt(m(), t())} movement={m()} content={props.content} />
                <ExerciseList matches={matchExercises(m(), props.content.exercises)} content={props.content} />
              </>
            )}
          </Show>
        </div>
      )}
    </Show>
  );
};
