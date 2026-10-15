import { useAtom } from '@effect/atom-solid';
import { For, Match, Show, Switch } from 'solid-js';
import type { JSX } from 'solid-js';
import type { ExerciseMatch } from '../../content/match';
import type { Content, Dosing, DosingRange, Movement, Source } from '../../content/schema';
import { DosingView, dosingViewAtom, parseDosingView } from '../../state/preferences';
import * as b from '../board/board.css';
import { Segmented } from '../components/Segmented';
import { Caution } from '../icons';
import { visuallyHidden } from '../theme/global.css';
import { DOSING_DISCLAIMER, formatRange, formatRest, formatSuggestion, goalName, shortCitation } from './dosing';
import { TargetFit, targetMatch } from './fit';
import * as s from './gym.css';

const VIEW_OPTIONS: ReadonlyArray<{ readonly value: DosingView; readonly label: string }> = [
  { value: DosingView.Off, label: 'Off' },
  { value: DosingView.Ranges, label: 'Ranges' },
  { value: DosingView.SetsReps, label: 'Sets & reps' },
];

const DosingPicker = (props: { readonly value: DosingView; readonly onChange: (v: DosingView) => void }): JSX.Element => (
  <Segmented label="Dosing" showLabel look="plate" options={VIEW_OPTIONS} value={props.value} onChange={(v) => props.onChange(parseDosingView(v))} />
);

const DosingBlock = (props: {
  readonly dosing: Dosing;
  readonly view: DosingView;
  readonly sources: ReadonlyArray<Source>;
}): JSX.Element => {
  const cited = (r: DosingRange): ReadonlyArray<Source> => props.sources.filter((x) => r.sources.includes(x.id));
  const suggestedRange = (): DosingRange | undefined => props.dosing.ranges.find((r) => r.goal === props.dosing.suggested.goal);
  // Sets & reps explains only the suggested goal's numbers.
  const explained = (): ReadonlyArray<DosingRange> => {
    const r = suggestedRange();
    return props.view === DosingView.SetsReps && r !== undefined ? [r] : props.dosing.ranges;
  };
  return (
    <section class={s.dosing} aria-label="Dosing">
      <Switch>
        <Match when={props.view === DosingView.Ranges}>
          <dl class={s.doses}>
            <For each={props.dosing.ranges}>
              {(r) => (
                <>
                  <dt class={s.doseGoal}>{goalName(r.goal)}</dt>
                  <dd class={s.dose}>
                    <span class={s.doseLine}>
                      {formatRange(r, props.dosing.perSide)}
                      <span class={s.doseRest}><span class={visuallyHidden}>, </span>Rest {formatRest(r.restSeconds)}</span>
                    </span>
                    <span class={s.doseNote}>{r.note}</span>
                  </dd>
                </>
              )}
            </For>
          </dl>
        </Match>
        <Match when={props.view === DosingView.SetsReps}>
          <dl class={s.doses}>
            <dt class={s.doseGoal}>{goalName(props.dosing.suggested.goal)}</dt>
            <dd class={s.dose}>
              <span class={s.doseLine}>
                {formatSuggestion(props.dosing.suggested, props.dosing.perSide)}
                <Show when={suggestedRange()}>
                  {(r) => <span class={s.doseRest}><span class={visuallyHidden}>, </span>Rest {formatRest(r().restSeconds)}</span>}
                </Show>
              </span>
              <Show when={suggestedRange()}>{(r) => <span class={s.doseNote}>{r().note}</span>}</Show>
            </dd>
          </dl>
        </Match>
      </Switch>
      <div class={s.doseFoot}>
        <p class={s.disclaimer}>{DOSING_DISCLAIMER}</p>
        <For each={explained()}>
          {(r) => (
            <p>
              {explained().length > 1 ? `${goalName(r.goal)}: ` : ''}
              {r.basis}{' '}
              <For each={cited(r)}>
                {(src, i) => (
                  <>
                    {i() > 0 ? ', ' : ''}
                    <a href={src.url} title={src.citation} target="_blank" rel="noreferrer">
                      {shortCitation(src.citation)}
                    </a>
                  </>
                )}
              </For>
            </p>
          )}
        </For>
      </div>
    </section>
  );
};

export const GymBoard = (props: {
  readonly matches: ReadonlyArray<ExerciseMatch>;
  readonly movement: Movement;
  readonly content: Content;
}): JSX.Element => {
  const muscleName = (id: string): string => props.content.muscles.find((m) => m.id === id)?.name ?? id;
  const [view, setView] = useAtom(() => dosingViewAtom);
  return (
    <section class={`${b.frame} ${s.gym}`} aria-labelledby="gym-heading">
      <div class={`${b.plate} ${s.plateHead}`}>
        <div class={s.plateText}>
          <h2 id="gym-heading" class={b.plateTitle}>
            Gym board
          </h2>
          <p class={s.intro}>
            Exercises for the muscles on the board, best match first. A match is the same muscle worked the same way.
          </p>
        </div>
        <DosingPicker value={view()} onChange={setView} />
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
                <Show when={view() !== DosingView.Off ? exercise.dosing : undefined}>
                  {(d) => <DosingBlock dosing={d()} view={view()} sources={props.content.sources} />}
                </Show>
              </li>
            )}
          </For>
        </ol>
      </Show>
    </section>
  );
};
