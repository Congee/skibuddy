import { Collapsible } from '@ark-ui/solid/collapsible';
import { useAtom, useAtomValue } from '@effect/atom-solid';
import { For, Show, createEffect, createMemo, createSignal, on, onCleanup, untrack } from 'solid-js';
import type { Accessor, JSX } from 'solid-js';
import { EFFORTS, effortAt, effortColour, effortWord, steadyOrder } from '../../content/effort';
import type { Effort } from '../../content/effort';
import { Confidence, PHASES } from '../../content/schema';
import type { Activation, AssociationTask, Content, Drill, Movement, Phase, Source, SourceId } from '../../content/schema';
import { closeSlat, focusAtom, focusedKey, hoverSlat, isOpen, leaveSlat, openSlat } from '../../state/focus';
import { phaseCentre, playingAtom, turnTimeAtom } from '../../state/playback';
import { pinKey } from '../figure/pin-inputs';
import { slotClasses } from '../components/slot-recipe';
import { readEffortRamp } from '../effort-ramp';
import { ArrowOut, ChevronDown } from '../icons';
import { PHONE, createMedia } from '../media';
import { useActiveTheme } from '../theme/active-theme';
import { visuallyHidden } from '../theme/global.css';
import * as s from './board.css';
import { Stamp, phaseLabel, shortName } from './marks';
import { Slat } from './Slat';
import { sourceKeys } from './source-keys';
import { stripY } from './Strip';

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

/** "Shaping. Hard: quadriceps outside. Working: ..." */
const announce = (phase: Phase, rows: ReadonlyArray<{ readonly word: Effort; readonly name: string }>): string =>
  [
    `${phaseLabel(phase)}.`,
    ...EFFORTS.toReversed().flatMap((word) => {
      const names = rows.filter((r) => r.word === word).map((r) => r.name);
      return names.length === 0 ? [] : [`${word}: ${names.join(', ')}.`];
    }),
  ].join(' ');

export const Board = (props: {
  readonly drill: Drill;
  readonly movement: Movement;
  readonly tasks: ReadonlyArray<AssociationTask>;
  readonly content: Content;
  readonly phase: Phase;
}): JSX.Element => {
  const t = useAtomValue(() => turnTimeAtom);
  const playing = useAtomValue(() => playingAtom);
  const keys = createMemo(() => sourceKeys(props.movement));
  const muscleName = (id: string): string => props.content.muscles.find((m) => m.id === id)?.name ?? id;
  const source = (id: SourceId): Source | undefined => props.content.sources.find((x) => x.id === id);
  const order = createMemo(() => steadyOrder(props.movement.activations));
  const [focus, setFocus] = useAtom(() => focusAtom);
  const focused = createMemo(() => focusedKey(focus()));

  const theme = useActiveTheme();
  const ramp = createMemo(() => {
    theme();
    return readEffortRamp();
  });

  // Spoken effort follows the phase while playing and the playhead while paused, never every frame.
  const spokenT = (): number => (playing() ? phaseCentre(props.phase) : t());
  const nowWord = (a: Activation): Accessor<Effort> => createMemo(() => effortWord(effortAt(a.intensity, spokenT())));
  const [announcement, setAnnouncement] = createSignal('');
  createEffect(
    on([() => props.phase, playing], ([phase, isPlaying], prev) => {
      if (prev === undefined || isPlaying) return;
      const [prevPhase, wasPlaying] = prev;
      if (!wasPlaying && phase === prevPhase) return;
      const at = untrack(t);
      setAnnouncement(
        announce(
          phase,
          order().map((a) => ({
            word: effortWord(effortAt(a.intensity, at)),
            name: `${shortName(muscleName(a.muscle))} ${a.side}`,
          })),
        ),
      );
    }),
  );

  // Per frame: transforms only, so a step neither invalidates inherited styles nor lays out.
  const playheads = new Set<HTMLSpanElement>();
  const dots = new Map<Activation, HTMLSpanElement>();
  createEffect(() => {
    const now = t();
    const colours = ramp();
    const x = `calc(${now} * 100cqw)`;
    for (const playhead of playheads) playhead.style.transform = `translateX(${x})`;
    for (const [a, dot] of dots) {
      const v = effortAt(a.intensity, now);
      dot.style.transform = `translate(${x}, ${stripY(v)}px)`;
      dot.style.background = effortColour(v, colours);
    }
  });
  onCleanup(() => {
    playheads.clear();
    dots.clear();
  });

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
          Effort through the turn
        </h2>
        <div class={s.headPhases} aria-hidden="true">
          <For each={PHASES}>{(p) => <span class={s.headPhase({ now: p === props.phase })}>{phaseLabel(p)}</span>}</For>
        </div>
      </div>

      <ol class={s.slats} aria-labelledby="board-heading" aria-describedby="board-order">
        <For each={order()}>
          {(a) => (
            <Slat
              activation={a}
              muscleName={muscleName(a.muscle)}
              now={nowWord(a)}
              keys={keys()}
              source={source}
              ramp={ramp}
              playhead={(el) => playheads.add(el)}
              dot={(el) => dots.set(a, el)}
              slatKey={pinKey(a)}
              open={isOpen(focus(), pinKey(a))}
              focused={focused() === pinKey(a)}
              onOpenChange={(open) => setFocus((open ? openSlat : closeSlat)(focus(), pinKey(a)))}
              onPreview={(shown) => setFocus((shown ? hoverSlat : leaveSlat)(focus(), pinKey(a)))}
            />
          )}
        </For>
      </ol>
      <p id="board-order" class={visuallyHidden}>
        Ordered by peak effort across the turn; the order does not change as the turn plays.
      </p>
      <p class={visuallyHidden} aria-live="polite">
        {announcement()}
      </p>

      <Show when={compact()}>
        <div class={`${s.plate} ${s.plateAfter}`}>{about()}</div>
      </Show>

      <div class={s.legend}>
        <For each={EFFORTS}>
          {(word, i) => (
            <span class={s.swatch}>
              <span class={s.scaleBars[i()]} aria-hidden="true" />
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
        <p class={s.legendNote}>
          The content has one effort value per phase; the strips blend between phases for display only.
        </p>
      </div>
      <Show when={unreviewed()}>
        <p class={s.unreviewed}>
          No instructor, examiner or physio has reviewed this drill yet. Tap a muscle for its basis and sources.
        </p>
      </Show>
    </section>
  );
};
