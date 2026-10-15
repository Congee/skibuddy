import { Collapsible } from '@ark-ui/solid/collapsible';
import { For, Show, createEffect, createMemo, createSignal, on } from 'solid-js';
import type { Accessor, JSX } from 'solid-js';
import { Confidence, PHASES, Phase } from '../../content/schema';
import type { AssociationTask, Content, Drill, Movement, Source, SourceId } from '../../content/schema';
import { slotClasses } from '../components/slot-recipe';
import { ArrowOut, ChevronDown } from '../icons';
import { PHONE, createMedia } from '../media';
import { easeOut, visuallyHidden } from '../theme/global.css';
import * as s from './board.css';
import { LEVEL_WORDS, Stamp, Tag } from './marks';
import { previousPhase, sourceKeys } from './rank';
import type { RankedSlat } from './rank';
import { Slat } from './Slat';

const SHORT: Record<Phase, string> = { [Phase.Initiation]: 'Init', [Phase.Shaping]: 'Shape', [Phase.Finish]: 'Fin' };

const assocName = (task: AssociationTask): string => task.association.toUpperCase();

const taskLine = (task: AssociationTask): string =>
  [assocName(task), task.task, task.level === undefined ? undefined : `Level ${task.level}`, task.category]
    .filter((x) => x !== undefined)
    .join(' · ');

const AssociationNames = (props: { readonly tasks: ReadonlyArray<AssociationTask> }): JSX.Element => {
  const c = slotClasses(s.assoc);
  return (
    <section class={c.root} aria-labelledby="assoc-heading">
      <h2 id="assoc-heading" class={c.title}>
        Association names
      </h2>
      <ul class={c.list}>
        <For each={props.tasks}>
          {(task) => (
            <li>
              <Collapsible.Root class={c.row}>
                <Collapsible.Trigger class={c.trigger}>
                  <ChevronDown />
                  {taskLine(task)}
                </Collapsible.Trigger>
                <a class={c.link} href={task.url} target="_blank" rel="noopener noreferrer">
                  Task page
                  <ArrowOut />
                  <span class={visuallyHidden}> for {assocName(task)} (opens in a new tab)</span>
                </a>
                <Collapsible.Content class={`${c.fundamentals} ${s.detail}`}>
                  <Show when={task.fundamentals.length > 0} fallback={<p>No fundamentals listed.</p>}>
                    <p>{assocName(task)} fundamentals, in the association's own words:</p>
                    <ul>
                      <For each={task.fundamentals}>{(f) => <li>{f}</li>}</For>
                    </ul>
                  </Show>
                </Collapsible.Content>
              </Collapsible.Root>
            </li>
          )}
        </For>
      </ul>
    </section>
  );
};

/** Moves rows from their old spot to their new one; skipped under reduced motion. */
const flipRows = (rows: ReadonlyMap<number, HTMLElement>, before: ReadonlyMap<number, number>): void => {
  for (const [index, el] of rows) {
    const top = before.get(index);
    if (top === undefined) continue;
    const dy = top - el.getBoundingClientRect().top;
    if (Math.abs(dy) < 1) continue;
    el.animate([{ transform: `translateY(${dy}px)` }, { transform: 'none' }], { duration: 480, easing: easeOut });
  }
};

export const Board = (props: {
  readonly drill: Drill;
  readonly movement: Movement;
  readonly tasks: ReadonlyArray<AssociationTask>;
  readonly content: Content;
  readonly phase: Phase;
  readonly ranked: ReadonlyArray<RankedSlat>;
  readonly reducedMotion: Accessor<boolean>;
}): JSX.Element => {
  const keys = createMemo(() => sourceKeys(props.movement));
  const muscleName = (id: string): string => props.content.muscles.find((m) => m.id === id)?.name ?? id;
  const source = (id: SourceId): Source | undefined => props.content.sources.find((x) => x.id === id);
  const bySlat = createMemo(() => new Map(props.ranked.map((r) => [r.index, r])));
  const rows = new Map<number, HTMLElement>();
  const [order, setOrder] = createSignal<ReadonlyArray<number>>(props.ranked.map((r) => r.index));

  let before: ReadonlyMap<number, number> | undefined;
  createEffect(
    on(
      () => props.ranked,
      (ranked) => {
        before = new Map([...rows].map(([i, el]) => [i, el.getBoundingClientRect().top]));
        setOrder(ranked.map((r) => r.index));
      },
      { defer: true },
    ),
  );
  // Runs after the list has moved its rows.
  createEffect(
    on(
      order,
      () => {
        if (before !== undefined && !props.reducedMotion()) flipRows(rows, before);
        before = undefined;
      },
      { defer: true },
    ),
  );

  const unreviewed = (): boolean => props.drill.reviewedBy.length === 0 && props.movement.reviewedBy.length === 0;
  // On a phone the summary follows the slats, so a slat reaches the first screen.
  const compact = createMedia(PHONE);
  const about = (): JSX.Element => (
    <>
      <p class={s.summary}>{props.drill.summary}</p>
      <Show when={props.tasks.length > 0}>
        <AssociationNames tasks={props.tasks} />
      </Show>
    </>
  );

  return (
    <section class={s.frame} aria-labelledby="drill-heading">
      <div class={s.plate}>
        <h1 id="drill-heading" class={s.drillTitle}>
          {props.drill.name}
        </h1>
        <p class={s.meta}>
          <span>Terrain: {props.drill.terrain}</span>
        </p>
        <Show when={!compact()}>{about()}</Show>
      </div>

      <div class={s.heads}>
        <h2 id="board-heading" class={s.headTitle}>
          Muscles · now {props.phase}
        </h2>
        <For each={PHASES}>
          {(p) => (
            <span class={s.headPhase({ now: p === props.phase })} aria-hidden="true">
              {SHORT[p]}
            </span>
          )}
        </For>
        <span aria-hidden="true">Evidence</span>
        <span aria-hidden="true">Sources</span>
      </div>

      <ol class={s.slats} aria-label={`Muscles at work, ordered by load at ${props.phase}`}>
        <For each={order()}>
          {(index) => (
            <Show when={bySlat().get(index)}>
              {(slat) => (
                <Slat
                  slat={slat()}
                  phase={props.phase}
                  before={previousPhase(props.phase)}
                  muscleName={muscleName(slat().activation.muscle)}
                  keys={keys()}
                  source={source}
                  ref={(el) => rows.set(index, el)}
                />
              )}
            </Show>
          )}
        </For>
      </ol>

      <Show when={compact()}>
        <div class={`${s.plate} ${s.plateAfter}`}>{about()}</div>
      </Show>

      <div class={s.legend}>
        <For each={LEVEL_WORDS}>
          {(word, i) => (
            <span class={s.swatch}>
              <Tag level={i()} size="mini" />
              {word}
            </span>
          )}
        </For>
        <span class={s.swatch}>
          <Stamp confidence={Confidence.High} tone="plate" />
          measured in this movement
        </span>
        <span class={s.swatch}>
          <Stamp confidence={Confidence.Medium} tone="plate" />
          inferred from related studies
        </span>
        <span class={s.swatch}>
          <Stamp confidence={Confidence.Low} tone="plate" />
          expert opinion
        </span>
      </div>
      <Show when={unreviewed()}>
        <p class={s.unreviewed}>
          No instructor, examiner or physio has reviewed this drill yet. Tap a muscle for its basis and sources.
        </p>
      </Show>
    </section>
  );
};
