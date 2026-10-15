import { For, Show } from 'solid-js';
import type { JSX } from 'solid-js';
import type { ExerciseMatch } from '../content/match';
import type { Content } from '../content/schema';

export const ExerciseList = (props: { readonly matches: ReadonlyArray<ExerciseMatch>; readonly content: Content }): JSX.Element => {
  const muscleName = (id: string): string => props.content.muscles.find((m) => m.id === id)?.name ?? id;
  return (
    <section class="panel" aria-labelledby="exercises-heading">
      <h2 id="exercises-heading">Gym exercises</h2>
      <ol class="exercises">
        <For each={props.matches}>
          {({ exercise }) => (
            <li class="exercise">
              <h3>{exercise.name}</h3>
              <p>{exercise.matchesOnSnow}</p>
              <p class="muted">Targets: {exercise.targets.map((x) => `${muscleName(x.muscle)} (${x.contraction})`).join(', ')}</p>
              <dl>
                <dt>Easier</dt>
                <dd>{exercise.easier}</dd>
                <dt>Harder</dt>
                <dd>{exercise.harder}</dd>
              </dl>
              <Show when={exercise.cautions.length > 0}>
                <ul class="cautions">
                  <For each={exercise.cautions}>{(c) => <li>{c}</li>}</For>
                </ul>
              </Show>
            </li>
          )}
        </For>
      </ol>
    </section>
  );
};
