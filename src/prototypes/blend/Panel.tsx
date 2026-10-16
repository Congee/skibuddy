import { For, Show, createEffect, createMemo } from 'solid-js';
import type { JSX } from 'solid-js';
import { effortWord, effortsFor, contractionsFor } from '../../content/effort';
import type { EffortRamp } from '../../content/effort';
import { DOF_LABELS, PHASES, STRUCTURE_NAMES, shortNameOf } from '../../content/schema';
import type { Activation, Citation, Intensity, Movement } from '../../content/schema';
import { DRILL_GROUPS } from './data';
import type { BlendData, BlendDrill } from './data';
import {
  CONFIDENCE_LABEL,
  CONTRACTION_LABEL,
  PHASE_LABEL,
  SIDE_LABEL,
  cite,
  drillsFor,
  exercisesFor,
  keyOf,
  muscleOf,
  sentence,
  structuresFor,
} from './detail';
import type { TrainTag } from './detail';
import { EffortStrip } from './EffortStrip';
import { Glyph } from './glyphs';
import { Icon } from './icons';

export const shortName = (data: BlendData, a: Activation): string => {
  const m = muscleOf(data, a.muscle);
  return m === undefined ? a.muscle : shortNameOf(m);
};

const PhaseScale = (): JSX.Element => (
  <div class="phase-scale" aria-hidden="true">
    <span>Initiation</span>
    <span>Shaping</span>
    <span>Finish</span>
  </div>
);

/** First look: name, effort through the turn, one exercise. */
export const Glance = (props: {
  readonly data: BlendData;
  readonly activation: Activation;
  readonly intensity: Intensity;
  readonly ramp: EffortRamp;
}): JSX.Element => {
  const best = createMemo(() => exercisesFor(props.data, props.activation, props.intensity)[0]);
  return (
    <div class="glance">
      <h2 class="glance-name">
        {shortName(props.data, props.activation)}
        <span class="glance-side">{SIDE_LABEL[props.activation.side]}</span>
      </h2>
      <EffortStrip
        intensity={props.activation.intensity}
        setting={props.intensity}
        ramp={props.ramp}
        height={34}
        scrub
        label="Effort through the turn"
      />
      <PhaseScale />
      <Show when={best()} fallback={<p class="glance-train muted">No gym exercise matched yet.</p>}>
        {(fit) => (
          <p class="glance-train">
            <Glyph exercise={fit().exercise.id} class="glance-glyph" />
            {fit().exercise.name}
          </p>
        )}
      </Show>
    </div>
  );
};

const Sources = (props: { readonly data: BlendData; readonly sources: ReadonlyArray<Citation> }): JSX.Element => (
  <Show when={props.sources.length > 0} fallback={<p class="muted">No source; this rests on body mechanics alone.</p>}>
    <ol class="sources">
      <For each={props.sources.map((c) => cite(props.data, c))}>
        {(c) => (
          <li>
            <Show when={c.source} fallback={c.id}>
              {(s) => (
                <>
                  <a href={s().url} target="_blank" rel="noreferrer">
                    {s().citation}
                  </a>
                  {c.pages === undefined ? '' : ` ${c.pages}.`}
                  <span class="muted">{s().read === 'full' ? '' : ` Read: ${s().read}.`}</span>
                </>
              )}
            </Show>
          </li>
        )}
      </For>
    </ol>
  </Show>
);

/** Everything known about this muscle in this turn, complete and plainly worded. */
export const Detail = (props: {
  readonly data: BlendData;
  readonly movement: Movement | undefined;
  readonly activation: Activation;
  readonly intensity: Intensity;
  readonly ramp: EffortRamp;
  readonly placeholder: string | null;
  readonly drillId: string | null;
  readonly onDrill: (id: string) => void;
}): JSX.Element => {
  const a = (): Activation => props.activation;
  const full = createMemo(() => muscleOf(props.data, a().muscle)?.name ?? a().muscle);
  const efforts = createMemo(() => effortsFor(a(), props.intensity));
  const contractions = createMemo(() => contractionsFor(a(), props.intensity));
  const fits = createMemo(() => exercisesFor(props.data, a(), props.intensity));
  const structures = createMemo(() => (props.movement === undefined ? [] : structuresFor(props.data, props.movement, a())));
  const drills = createMemo(() => drillsFor(props.data, a(), props.intensity, props.drillId));
  return (
    <div class="detail">
      <p class="detail-full">
        {full()} · {SIDE_LABEL[a().side].toLowerCase()}
      </p>
      <p class="detail-role">{sentence(a().role)}</p>

      <section>
        <h3>Through the turn, {props.intensity}</h3>
        <table class="phases">
          <tbody>
            <For each={PHASES}>
              {(p) => (
                <tr>
                  <th scope="row">{PHASE_LABEL[p]}</th>
                  <td>{effortWord(efforts()[p])}</td>
                  <td>{contractions()[p] === null ? 'Not working' : CONTRACTION_LABEL[contractions()[p] ?? 'isometric']}</td>
                </tr>
              )}
            </For>
          </tbody>
        </table>
      </section>

      <section>
        <h3>Joints it serves</h3>
        <ul class="plain">
          <For each={a().serves}>{(d) => <li>{DOF_LABELS[d]}</li>}</For>
        </ul>
      </section>

      <section>
        <h3>How sure</h3>
        <p class="confidence" data-confidence={a().confidence}>
          <span class="stamp" aria-hidden="true" />
          {CONFIDENCE_LABEL[a().confidence]}
        </p>
        <Show when={props.placeholder}>
          {(base) => <p class="note">Placeholder: these levels are our estimate, shifted from the {base()} draft. The basis below is the draft's.</p>}
        </Show>
        <p>{sentence(a().basis)}</p>
        <Sources data={props.data} sources={a().sources} />
        <p class="muted">Not yet reviewed by an instructor, examiner or physio.</p>
      </section>

      <section>
        <h3>Train it in the gym</h3>
        <Show when={fits().length > 0} fallback={<p class="muted">No gym exercise in our list trains this muscle yet.</p>}>
          <ul class="exercises">
            <For each={fits()}>
              {(f) => (
                <li>
                  <p class="ex-name">
                    {f.exercise.name}
                    <span class="tag">{f.mobilisation ? 'Mobility' : f.sameContraction ? 'Same contraction as on snow' : 'Strength'}</span>
                  </p>
                  <p>{sentence(f.exercise.matchesOnSnow)}</p>
                  <p class="muted">
                    Easier: {sentence(f.exercise.easier)} Harder: {sentence(f.exercise.harder)}
                  </p>
                  <Show when={f.exercise.cautions.length > 0}>
                    <p class="muted">Caution: {f.exercise.cautions.join('; ')}.</p>
                  </Show>
                </li>
              )}
            </For>
          </ul>
        </Show>
      </section>

      <Show when={structures().length > 0}>
        <section>
          <h3>What it protects</h3>
          <ul class="structures">
            <For each={structures()}>
              {(s) => (
                <li>
                  <p class="ex-name">
                    {STRUCTURE_NAMES[s.structure]}
                    <span class="tag">
                      {SIDE_LABEL[s.side]}, {s.phases.map((p) => PHASE_LABEL[p].toLowerCase()).join(' and ')}
                    </span>
                  </p>
                  <p>{sentence(s.mechanism)}</p>
                  <p class="muted">{CONFIDENCE_LABEL[s.confidence]}.</p>
                  <Sources data={props.data} sources={s.sources} />
                </li>
              )}
            </For>
          </ul>
        </section>
      </Show>

      <Show when={drills().length > 0}>
        <section>
          <h3>Drills that work it hard</h3>
          <div class="chips">
            <For each={drills()}>
              {(d) => (
                <button type="button" class="chip" onClick={() => props.onDrill(d.id)}>
                  {d.name}
                </button>
              )}
            </For>
          </div>
        </section>
      </Show>
    </div>
  );
};

/** The steady-order muscle list; rows and pins select each other. */
export const MuscleList = (props: {
  readonly data: BlendData;
  readonly order: ReadonlyArray<Activation>;
  readonly intensity: Intensity;
  readonly ramp: EffortRamp;
  readonly selected: string | null;
  readonly onPick: (key: string) => void;
  readonly onOpen: (key: string) => void;
}): JSX.Element => {
  let list: HTMLUListElement | undefined;
  createEffect(() => {
    const key = props.selected;
    if (key === null || list === undefined) return;
    list.querySelector(`[data-key="${CSS.escape(key)}"]`)?.scrollIntoView({ block: 'nearest' });
  });
  return (
    <ul class="muscles" ref={(el) => (list = el)}>
      <For each={props.order}>
        {(a) => {
          const key = keyOf(a);
          return (
            <li data-key={key} aria-current={props.selected === key ? 'true' : undefined}>
              <button type="button" class="row" aria-pressed={props.selected === key} onClick={() => props.onPick(key)}>
                <span class="row-name">
                  {shortName(props.data, a)}
                  <span class="row-side">{a.side === 'both' ? '' : a.side}</span>
                </span>
                <EffortStrip intensity={a.intensity} setting={props.intensity} ramp={props.ramp} height={16} label={shortName(props.data, a)} />
              </button>
              <Show when={props.selected === key}>
                <button type="button" class="row-open" aria-label={`Details for ${shortName(props.data, a)}`} onClick={() => props.onOpen(key)}>
                  <Icon name="up" />
                </button>
              </Show>
            </li>
          );
        }}
      </For>
    </ul>
  );
};

/** The drill library: our groups, with the closest matches to the current kind first. */
export const DrillPicker = (props: {
  readonly data: BlendData;
  readonly like: ReadonlyArray<string>;
  readonly likeName: string | null;
  readonly current: string | null;
  readonly onPick: (id: string) => void;
}): JSX.Element => {
  const name = (id: string): BlendDrill | undefined => props.data.drills.find((d) => d.id === id);
  const Group = (g: { readonly title: string; readonly ids: ReadonlyArray<string> }): JSX.Element => (
    <section>
      <h3>{g.title}</h3>
      <div class="chips">
        <For each={g.ids}>
          {(id) => (
            <Show when={name(id)}>
              {(d) => (
                <button type="button" class="chip" aria-pressed={props.current === id} onClick={() => props.onPick(id)}>
                  {d().name}
                  <Show when={d().draft}>
                    <span class="chip-tag">draft</span>
                  </Show>
                </button>
              )}
            </Show>
          )}
        </For>
      </div>
    </section>
  );
  return (
    <div class="drills">
      <Show when={props.likeName}>{(n) => <Group title={`Closest to ${n()}`} ids={props.like} />}</Show>
      <For each={DRILL_GROUPS}>{(g) => <Group title={g.name} ids={g.ids} />}</For>
      <p class="muted">Groups are ours. Drafts are unreviewed content in progress.</p>
    </div>
  );
};

/** One level down from the figure: what to train in the gym, and drills that build this kind on snow. */
export const TrainPanel = (props: {
  readonly data: BlendData;
  readonly tags: ReadonlyArray<TrainTag>;
  readonly kindName: string;
  readonly drills: ReadonlyArray<string>;
  readonly current: string | null;
  readonly onPick: (key: string) => void;
  readonly onDrill: (id: string) => void;
}): JSX.Element => {
  const drill = (id: string): BlendDrill | undefined => props.data.drills.find((d) => d.id === id);
  return (
    <div class="train">
      <section>
        <h3>Train these</h3>
        <Show when={props.tags.length > 0} fallback={<p class="muted">No muscle works hard enough here to need training.</p>}>
          <ul class="train-list">
            <For each={props.tags}>
              {(t) => (
                <li>
                  <button type="button" onClick={() => props.onPick(keyOf(t.activation))}>
                    <Glyph exercise={t.exercise.id} class="train-glyph" />
                    <span>
                      {shortName(props.data, t.activation)}
                      <span class="muted"> · {SIDE_LABEL[t.activation.side].toLowerCase()}</span>
                      <span class="train-ex">{t.exercise.name}</span>
                    </span>
                  </button>
                </li>
              )}
            </For>
          </ul>
        </Show>
        <p class="muted small">The same pictograms sit on the figure. Tap one for the muscle's detail.</p>
      </section>
      <section>
        <h3>On snow, drills that build {props.kindName.toLowerCase()}</h3>
        <div class="chips">
          <For each={props.drills}>
            {(id) => (
              <Show when={drill(id)}>
                {(d) => (
                  <button type="button" class="chip" aria-pressed={props.current === id} onClick={() => props.onDrill(id)}>
                    {d().name}
                    <Show when={d().draft}>
                      <span class="chip-tag">draft</span>
                    </Show>
                  </button>
                )}
              </Show>
            )}
          </For>
        </div>
        <p class="muted small">
          <span class="tag" data-tone="placeholder">
            placeholder
          </span>{' '}
          Picks chosen by hand, not yet researched.
        </p>
      </section>
    </div>
  );
};
