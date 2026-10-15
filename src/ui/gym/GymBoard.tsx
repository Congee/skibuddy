import { For, Match, Show, Switch } from 'solid-js';
import type { JSX } from 'solid-js';
import type { ExerciseMatch } from '../../content/match';
import type { Content, Movement } from '../../content/schema';
import * as b from '../board/board.css';
import { Caution } from '../icons';
import { visuallyHidden } from '../theme/global.css';
import { TargetFit, targetMatch } from './fit';
import * as s from './gym.css';

export const GymBoard = (props: {
  readonly matches: ReadonlyArray<ExerciseMatch>;
  readonly movement: Movement;
  readonly content: Content;
}): JSX.Element => {
  const muscleName = (id: string): string => props.content.muscles.find((m) => m.id === id)?.name ?? id;
  return (
    <section class={`${b.frame} ${s.gym}`} aria-labelledby="gym-heading">
      <div class={b.plate}>
        <h2 id="gym-heading" class={b.plateTitle}>
          Gym board
        </h2>
        <p class={s.intro}>
          Exercises for the muscles on the board, best match first. A match is the same muscle worked the same way.
        </p>
      </div>
      <Show when={props.matches.length > 0} fallback={<p class={s.empty}>No exercises match this drill yet.</p>}>
        <ol class={s.list}>
          <For each={props.matches}>
            {({ exercise }) => (
              <li class={s.exercise}>
                <div class={s.main}>
                  <h3 class={s.title}>
                    {exercise.name}
                    <Show when={exercise.singleLeg}>
                      <span class={s.oneLeg}>One leg</span>
                    </Show>
                  </h3>
                  <p class={s.onSnow}>
                    <span class={visuallyHidden}>On snow: </span>
                    {exercise.matchesOnSnow}
                  </p>
                  <dl class={s.versions}>
                    <dt class={s.term}>Easier</dt>
                    <dd>{exercise.easier}</dd>
                    <dt class={s.term}>Harder</dt>
                    <dd>{exercise.harder}</dd>
                  </dl>
                </div>
                <div class={s.side}>
                  <ul class={s.trains} aria-label="Trains">
                    <For each={exercise.targets}>
                      {(t) => {
                        const m = targetMatch(props.movement, t);
                        return (
                          <li class={s.target}>
                            <span class={s.targetMuscle}>{muscleName(t.muscle)}</span>
                            <span class={s.contraction}>{t.contraction}</span>
                            <Switch>
                              <Match when={m.fit === TargetFit.OtherContraction}>
                                <span class={s.fit}>drill works it {m.drillContractions.join(' or ')}</span>
                              </Match>
                              <Match when={m.fit === TargetFit.NotInDrill}>
                                <span class={s.fit}>not in this drill</span>
                              </Match>
                            </Switch>
                          </li>
                        );
                      }}
                    </For>
                  </ul>
                  <Show when={exercise.cautions.length > 0}>
                    <ul class={s.cautions} aria-label="Cautions">
                      <For each={exercise.cautions}>
                        {(c) => (
                          <li class={s.caution}>
                            <Caution />
                            {c}
                          </li>
                        )}
                      </For>
                    </ul>
                  </Show>
                </div>
              </li>
            )}
          </For>
        </ol>
      </Show>
    </section>
  );
};
