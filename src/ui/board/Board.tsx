import { Collapsible } from '@ark-ui/solid/collapsible';
import { useAtom, useAtomValue } from '@effect/atom-solid';
import { For, Show, createEffect, createMemo, createSignal, on, onCleanup, untrack } from 'solid-js';
import type { Accessor, JSX } from 'solid-js';
import { EFFORTS, effortAt, effortColour, effortWord, steadyOrder } from '../../content/effort';
import type { Effort } from '../../content/effort';
import { Confidence, FundamentalsRelation, PHASES, STRUCTURE_NAMES, shortNameOf } from '../../content/schema';
import type {
  Activation,
  AssociationFundamentals,
  AssociationTask,
  Content,
  Drill,
  Intensity,
  Movement,
  Phase,
  Source,
  SourceId,
  StructureLoad,
} from '../../content/schema';
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
import { Stamp, phaseLabel } from './marks';
import { GROUP_TITLES, groupActivations } from './groups';
import { scenarioLine } from './intensity';
import { Slat } from './Slat';
import { SourceLine } from './SourceLine';
import { sourceKeys } from './source-keys';
import { stripY } from './Strip';

const assocName = (task: AssociationTask): string => task.association.toUpperCase();

const taskLine = (task: AssociationTask): string =>
  [assocName(task), task.task, task.level?.label, task.category]
    .filter((x) => x !== undefined)
    .join(' · ');

const RELATION_WORDS: Readonly<Record<FundamentalsRelation, string>> = {
  [FundamentalsRelation.And]: 'all of',
  [FundamentalsRelation.Or]: 'one of',
  [FundamentalsRelation.AndOr]: 'one or more of',
};

/** The task's fundamentals by their verbatim names. */
const fundamentalNames = (task: AssociationTask, files: ReadonlyArray<AssociationFundamentals>): ReadonlyArray<string> => {
  const file = files.find((f) => f.association === task.association);
  return (task.fundamentals?.ids ?? []).map((id) => file?.fundamentals.find((f) => f.id === id)?.name ?? id);
};

const AssociationNames = (props: {
  readonly tasks: ReadonlyArray<AssociationTask>;
  readonly fundamentals: ReadonlyArray<AssociationFundamentals>;
}): JSX.Element => {
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
                  <Show when={task.fundamentals} fallback={<p>No fundamentals listed.</p>}>
                    {(f) => (
                      <>
                        <p>
                          Works {RELATION_WORDS[f().relation]} these {assocName(task)} fundamentals, in our words; the
                          association's own are on its site:
                        </p>
                        <ul>
                          <For each={fundamentalNames(task, props.fundamentals)}>{(name) => <li>{name}</li>}</For>
                        </ul>
                      </>
                    )}
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

const Structures = (props: {
  readonly loads: ReadonlyArray<StructureLoad>;
  readonly muscleName: (id: string) => string;
}): JSX.Element => (
  <section class={`${s.plate} ${s.plateAfter}`} aria-labelledby="structures-heading">
    <h2 id="structures-heading" class={s.structuresTitle}>
      Structures under load
    </h2>
    <ul class={s.structures}>
      <For each={props.loads}>
        {(load) => (
          <li class={s.structure}>
            <p>
              <strong>
                {STRUCTURE_NAMES[load.structure]}, {load.side}
              </strong>{' '}
              <span class={s.structurePhases}>({load.phases.map(phaseLabel).join(', ')})</span>{' '}
              <Stamp confidence={load.confidence} tone="plate" />
            </p>
            <p>{load.mechanism}.</p>
            <Show when={load.protectedBy.length > 0}>
              <p>Protected by: {load.protectedBy.map(props.muscleName).join(', ')}.</p>
            </Show>
          </li>
        )}
      </For>
    </ul>
  </section>
);

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
  /** Efforts, strips and the scenario line show this setting. */
  readonly intensity: Intensity;
}): JSX.Element => {
  const t = useAtomValue(() => turnTimeAtom);
  const playing = useAtomValue(() => playingAtom);
  const keys = createMemo(() => sourceKeys(props.movement));
  const muscleName = (id: string): string => props.content.muscles.find((m) => m.id === id)?.name ?? id;
  const muscleShort = (id: string): string => {
    const m = props.content.muscles.find((x) => x.id === id);
    return m === undefined ? id : shortNameOf(m);
  };
  const source = (id: SourceId): Source | undefined => props.content.sources.find((x) => x.id === id);
  const order = createMemo(() => steadyOrder(props.movement.activations));
  const groups = createMemo(() => groupActivations(props.movement.activations, props.content.muscles));
  const [focus, setFocus] = useAtom(() => focusAtom);
  const focused = createMemo(() => focusedKey(focus()));

  const theme = useActiveTheme();
  const ramp = createMemo(() => {
    theme();
    return readEffortRamp();
  });

  // Spoken effort follows the phase while playing and the playhead while paused, never every frame.
  const spokenT = (): number => (playing() ? phaseCentre(props.phase) : t());
  const nowWord = (a: Activation): Accessor<Effort> => createMemo(() => effortWord(effortAt(a.intensity, spokenT(), props.intensity)));
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
            word: effortWord(effortAt(a.intensity, at, untrack(() => props.intensity))),
            name: `${muscleShort(a.muscle)} ${a.side}`,
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
    const setting = props.intensity;
    const x = `calc(${now} * 100cqw)`;
    for (const playhead of playheads) playhead.style.transform = `translateX(${x})`;
    for (const [a, dot] of dots) {
      const v = effortAt(a.intensity, now, setting);
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
      <Show when={props.drill.equipment}>{(e) => <p class={s.summary}>{e()}</p>}</Show>
      <Show when={(props.drill.cautions ?? []).length > 0}>
        <ul class={s.cautions} aria-label="Cautions">
          <For each={props.drill.cautions ?? []}>{(c) => <li>{c}</li>}</For>
        </ul>
      </Show>
      <SourceLine citations={props.drill.sources ?? []} sources={props.content.sources} class={s.drillSources} />
      <Show when={props.tasks.length > 0}>
        <AssociationNames tasks={props.tasks} fundamentals={props.content.fundamentals} />
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
        <p class={s.scenario} aria-live="polite">{scenarioLine(props.intensity, props.drill.scenarios[props.intensity])}</p>
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

      <For each={groups()}>
        {(g) => (
          <section class={s.group} aria-labelledby={`group-${g.group}`}>
            <h3 id={`group-${g.group}`} class={s.groupTitle}>
              {GROUP_TITLES[g.group]}
            </h3>
            <ol class={s.slats} aria-labelledby={`group-${g.group}`} aria-describedby="board-order">
              <For each={g.activations}>
                {(a) => (
                  <Slat
                    activation={a}
                    intensity={props.intensity}
                    muscleName={muscleName(a.muscle)}
                    muscleShort={muscleShort(a.muscle)}
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
          </section>
        )}
      </For>
      <p id="board-order" class={visuallyHidden}>
        Grouped by body part, then ordered by peak effort across the turn; the order does not change as the turn plays.
      </p>
      <p class={visuallyHidden} aria-live="polite">
        {announcement()}
      </p>

      <Show when={(props.movement.structures ?? []).length > 0}>
        <Structures loads={props.movement.structures ?? []} muscleName={muscleName} />
      </Show>

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
          The content has one effort value per phase at each intensity; the strips blend between phases for display only.
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
