import { useAtom } from '@effect/atom-solid';
import { For, Match, Show, Switch, batch, createEffect, createMemo, createSignal, on, onCleanup, onMount } from 'solid-js';
import type { JSX } from 'solid-js';
import { steadyOrder } from '../../content/effort';
import { INTENSITIES, Intensity, PHASES, isTurnScenarios } from '../../content/schema';
import { PLAYBACK_RATES, RATE_NAMES, TurnDirection, cycleOf, phaseAt, playingAtom, turnAt, turnDirectionAtom, turnTimeAtom } from '../../state/playback';
import type { PlaybackRate } from '../../state/playback';
import { usePlayback, usePlaybackRate } from './playback';
import { REDUCED_MOTION, createMedia } from './media';
import { ViewLock } from '../../viewer/hip-lock';
import { motionFor } from '../../viewer/poses';
import { RegularTurn } from '../../viewer/poses/regular-turn';
import { realTurnSeconds } from '../../viewer/turn-time';
import { KINDS, KIND_DRILLS, KindId, MOGUL_LINES, MOGUL_LINE_NAMES, MogulLine, TOPS_DRILL, kindMovement } from './data';
import type { BlendData } from './data';
import { drillsLike, keyOf, trainThese } from './detail';
import { Cover, Figure } from './Figure';
import type { MusclePick } from './Figure';
import { Icon } from './icons';
import { Detail, DrillPicker, Glance, MuscleList, TrainPanel, shortName } from './Panel';
import { RAMPS, ThemeChoice, createTheme } from './theme';
import { readUrlState, writeUrlState } from './url-state';

type Source = { readonly kind: KindId } | { readonly drill: string };
const Sheet = { Closed: 'closed', Glance: 'glance', Half: 'half', Full: 'full' } as const;
type Sheet = (typeof Sheet)[keyof typeof Sheet];
const Mode = { Muscle: 'muscle', List: 'list', Drills: 'drills', Plan: 'plan' } as const;
type Mode = (typeof Mode)[keyof typeof Mode];

const DESKTOP = '(min-width: 900px)';
const PHASE_NAMES = { initiation: 'Initiation', shaping: 'Shaping', finish: 'Finish' } as const;
const cap = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);
const VIEW_LOCKS = [ViewLock.SkisFixed, ViewLock.HipsFixed, ViewLock.SlopeFixed] as const;
const VIEW_LOCK_NAMES: Readonly<Record<ViewLock, string>> = { [ViewLock.SkisFixed]: 'Skis fixed', [ViewLock.HipsFixed]: 'Hips fixed', [ViewLock.SlopeFixed]: 'Slope fixed' };
/** Mogul motions, seen as their hips hold the fall line. */
const HIPS_FIXED_POSES: ReadonlySet<string> = new Set([RegularTurn.Moguls, 'turns-on-the-tops', 'round-line', 'closed-stance-short-turns']);

const TURN_NAMES = { [TurnDirection.Left]: 'Left turn', [TurnDirection.Right]: 'Right turn' } as const;
const HALVES = [TurnDirection.Left, TurnDirection.Right] as const;

/** Rail under the figure: play a left then a right turn on a loop, or drag through them. */
const Rail = (props: { readonly reducedMotion: boolean; readonly rate: PlaybackRate; readonly onRate: (r: PlaybackRate) => void }): JSX.Element => {
  const [t, setT] = useAtom(() => turnTimeAtom);
  const [direction, setDirection] = useAtom(() => turnDirectionAtom);
  const [playing, setPlaying] = useAtom(() => playingAtom);
  const seek = (d: TurnDirection, at: number): void => {
    setPlaying(false);
    batch(() => {
      setDirection(d);
      setT(at);
    });
  };
  return (
    <div class="rail">
      <button
        type="button"
        class="icon-button play"
        onClick={() => setPlaying(!playing())}
        disabled={props.reducedMotion}
        aria-label={playing() ? 'Pause' : 'Play'}
        title={props.reducedMotion ? 'Playback is off while reduced motion is on; drag the rail instead' : undefined}
      >
        <Icon name={playing() ? 'pause' : 'play'} />
      </button>
      <select
        class="speed"
        value={props.rate}
        disabled={props.reducedMotion}
        aria-label="Playback speed, as a share of real time"
        onChange={(e) => props.onRate(PLAYBACK_RATES.find((r) => String(r) === e.currentTarget.value) ?? props.rate)}
      >
        <For each={PLAYBACK_RATES}>{(r) => <option value={r}>{RATE_NAMES[r]}</option>}</For>
      </select>
      <div class="rail-track">
        <input
          type="range"
          min="0"
          max="0.999"
          step="0.001"
          value={cycleOf(direction(), t())}
          aria-label="Position in a left turn then a right turn"
          aria-valuetext={`${TURN_NAMES[direction()]}, ${PHASE_NAMES[phaseAt(t())]}, ${Math.round(t() * 100)}% through the turn`}
          onInput={(e) => {
            const at = turnAt(Number(e.currentTarget.value));
            seek(at.direction, at.t);
          }}
        />
        <div class="rail-halves">
          <For each={HALVES}>
            {(half) => (
              <div class="rail-half" data-on={direction() === half ? '' : undefined}>
                <div class="rail-phases">
                  <For each={PHASES}>
                    {(p, i) => (
                      <button
                        type="button"
                        aria-pressed={direction() === half && phaseAt(t()) === p}
                        aria-label={`${PHASE_NAMES[p]}, ${TURN_NAMES[half].toLowerCase()}`}
                        onClick={() => seek(half, (i() + 0.5) / PHASES.length)}
                      >
                        {PHASE_NAMES[p]}
                      </button>
                    )}
                  </For>
                </div>
                <span class="rail-turn">{TURN_NAMES[half]}</span>
              </div>
            )}
          </For>
        </div>
      </div>
    </div>
  );
};

const Segmented = <T extends string>(props: {
  readonly label: string;
  readonly options: ReadonlyArray<T>;
  readonly value: T;
  readonly onChange: (v: T) => void;
  readonly names?: Readonly<Record<T, string>>;
}): JSX.Element => (
  <fieldset class="segmented">
    <legend>{props.label}</legend>
    <div>
      <For each={props.options}>
        {(o) => (
          <button type="button" aria-pressed={props.value === o} onClick={() => props.onChange(o)}>
            {props.names?.[o] ?? cap(o)}
          </button>
        )}
      </For>
    </div>
  </fieldset>
);

export const Blend = (props: { readonly data: BlendData }): JSX.Element => {
  const data = props.data;
  const { choice, theme, setChoice } = createTheme();
  createEffect(() => {
    document.documentElement.dataset['theme'] = theme();
  });
  const ramp = createMemo(() => RAMPS[theme()]);
  const desktop = createMedia(DESKTOP);
  const reducedMotion = createMedia(REDUCED_MOTION);
  const [stage, setStage] = createSignal<HTMLElement>();
  const [rate, setRate] = usePlaybackRate();

  const linked = readUrlState(window.location.search);
  const [source, setSource] = createSignal<Source>({ kind: linked.kind });
  // The kind of skiing to return to from a drill.
  const [home, setHome] = createSignal<KindId>(linked.kind);
  const [line, setLine] = createSignal<MogulLine>(linked.line);
  createEffect(() => {
    const search = writeUrlState({ kind: home(), line: line() }, window.location.search);
    if (search !== window.location.search) history.replaceState(history.state, '', `${window.location.pathname}${search}${window.location.hash}`);
  });
  const homeName = (): string => KINDS.find((k) => k.id === home())?.name ?? '';
  const homePose = (): string => (home() === KindId.Moguls && line() === MogulLine.Tops ? TOPS_DRILL : (KINDS.find((k) => k.id === home())?.pose ?? ''));
  const chooseKind = (id: KindId): void => {
    setHome(id);
    setSource({ kind: id });
  };
  const [intensity, setIntensity] = createSignal<Intensity>(Intensity.Moderate);
  const [selected, setSelected] = createSignal<string | null>(null);
  const [sheet, setSheet] = createSignal<Sheet>(Sheet.Closed);
  const [mode, setMode] = createSignal<Mode>(Mode.Muscle);
  const [settings, setSettings] = createSignal(false);

  const kind = createMemo(() => {
    const s = source();
    return 'kind' in s ? KINDS.find((k) => k.id === s.kind) : undefined;
  });
  // Moguls over the tops shows that drill's turn, field and muscles under the Moguls kind.
  const lineDrill = (): string | null => (kind()?.id === KindId.Moguls && line() === MogulLine.Tops ? TOPS_DRILL : null);
  const drill = createMemo(() => {
    const s = source();
    const id = 'drill' in s ? s.drill : (lineDrill() ?? kind()?.drill);
    return data.drills.find((d) => d.id === id) ?? data.drills[0];
  });
  const pose = createMemo((): string => {
    const k = kind();
    const d = drill();
    if (k !== undefined && lineDrill() === null) return k.pose;
    return d === undefined ? '' : (motionFor(d.id, isTurnScenarios(d.scenarios)) ?? d.id);
  });
  // The pose's own view until one is chosen.
  const [viewChoice, setViewChoice] = createSignal<ViewLock | null>(null);
  const viewLock = (): ViewLock => viewChoice() ?? (HIPS_FIXED_POSES.has(pose()) ? ViewLock.HipsFixed : ViewLock.SkisFixed);
  const movement = createMemo(() => {
    const k = kind();
    const d = drill();
    return k === undefined || lineDrill() !== null ? (d === undefined ? undefined : data.movements.get(d.movement)) : kindMovement(k, data);
  });
  usePlayback(reducedMotion, stage, createMemo(() => realTurnSeconds(pose(), intensity())));
  const placeholder = createMemo(() => {
    const k = kind();
    return k?.shift === undefined || lineDrill() !== null ? null : (KINDS.find((x) => x.base === k.base && x.shift === undefined)?.name.toLowerCase() ?? null);
  });
  const order = createMemo(() => steadyOrder(movement()?.activations ?? []));
  const activation = createMemo(() => order().find((a) => keyOf(a) === selected()));
  const like = createMemo(() => {
    const m = movement();
    return m === undefined || kind() === undefined ? [] : drillsLike(data, m, intensity());
  });
  const tags = createMemo(() => trainThese(data, order(), intensity()));
  const muscleIds = data.muscles.map((m) => m.id as string);

  // A muscle the new kind does not use closes its card.
  createEffect(
    on(order, () => {
      if (selected() !== null && activation() === undefined) {
        setSelected(null);
        if (mode() === Mode.Muscle) setSheet(Sheet.Closed);
      }
    }),
  );

  // First-run hint, until the first tap on the body or a tag.
  const HINTED = 'skibuddy.blend.hinted';
  const [hint, setHint] = createSignal(((): boolean => {
    try {
      return localStorage.getItem(HINTED) === null;
    } catch {
      return true;
    }
  })());
  const hinted = (): void => {
    if (!hint()) return;
    setHint(false);
    try {
      localStorage.setItem(HINTED, '1');
    } catch {
      // Private mode: the hint returns next visit.
    }
  };
  const pick = (key: string): void => {
    hinted();
    if (selected() === key && mode() === Mode.Muscle) {
      setSheet(Sheet.Full);
      return;
    }
    setSelected(key);
    if (mode() === Mode.Drills || mode() === Mode.Plan) setMode(Mode.Muscle);
    if (mode() === Mode.Muscle) setSheet(Sheet.Glance);
  };
  // A tap on the body: the activation on that side, else the muscle's only one; a resting muscle or empty space closes the card.
  const onMuscle = (p: MusclePick): void => {
    const hits = p === null ? [] : order().filter((a) => a.muscle === p.muscle);
    const a = hits.find((x) => x.side === p?.side) ?? hits.find((x) => x.side === 'both') ?? hits[0];
    if (a !== undefined) {
      pick(keyOf(a));
      return;
    }
    if (mode() === Mode.Muscle && selected() !== null && (sheet() === Sheet.Glance || desktop())) close();
  };
  const openDetail = (key: string): void => {
    setSelected(key);
    setMode(Mode.Muscle);
    setSheet(Sheet.Full);
  };
  const close = (): void => {
    setSheet(Sheet.Closed);
    if (mode() === Mode.Muscle) setSelected(null);
    else setMode(Mode.Muscle);
  };
  const toggleList = (): void => {
    if (mode() === Mode.List) {
      setMode(Mode.Muscle);
      setSheet(selected() === null ? Sheet.Closed : Sheet.Glance);
    } else {
      setMode(Mode.List);
      setSheet(Sheet.Half);
    }
  };
  const openDrills = (): void => {
    if (mode() === Mode.Drills) {
      close();
      return;
    }
    setMode(Mode.Drills);
    setSheet(Sheet.Full);
  };
  const openPlan = (): void => {
    setSelected(null);
    setMode(Mode.Plan);
    setSheet(Sheet.Half);
  };
  const chooseDrill = (id: string): void => {
    setSource({ drill: id });
    setMode(Mode.Muscle);
    setSheet(selected() === null ? Sheet.Closed : Sheet.Glance);
  };
  const back = (): void => {
    if (sheet() === Sheet.Full && mode() === Mode.Muscle) setSheet(Sheet.Glance);
    else close();
  };

  onMount(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape') return;
      if (settings()) setSettings(false);
      else if (sheet() !== Sheet.Closed) back();
    };
    document.addEventListener('keydown', onKey);
    onCleanup(() => document.removeEventListener('keydown', onKey));
  });

  // Sheet drag on phones: up opens deeper, down steps back.
  const [drag, setDrag] = createSignal(0);
  let dragFrom: number | null = null;
  const onHandleDown = (e: PointerEvent): void => {
    if (desktop() || (e.target as Element).closest('button') !== null) return;
    dragFrom = e.clientY;
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
  };
  const onHandleMove = (e: PointerEvent): void => {
    if (dragFrom !== null) setDrag(e.clientY - dragFrom);
  };
  const onHandleUp = (): void => {
    if (dragFrom === null) return;
    const dy = drag();
    dragFrom = null;
    setDrag(0);
    if (Math.abs(dy) < 8) {
      // A tap on the handle steps between glance and full.
      if (mode() === Mode.Muscle) setSheet(sheet() === Sheet.Full ? Sheet.Glance : Sheet.Full);
      return;
    }
    if (dy < -40) setSheet(Sheet.Full);
    else if (dy > 40) {
      if (sheet() === Sheet.Full && mode() === Mode.Muscle) setSheet(Sheet.Glance);
      else if (sheet() === Sheet.Full && (mode() === Mode.List || mode() === Mode.Plan)) setSheet(Sheet.Half);
      else close();
    }
  };

  const title = createMemo(() => {
    const m = mode();
    if (m === Mode.Drills) return 'Drills';
    if (m === Mode.List) return 'Muscles, hardest first';
    if (m === Mode.Plan) return `Train for ${sourceName()}`;
    const a = activation();
    return a === undefined ? '' : shortName(data, a);
  });
  const sourceName = (): string => {
    const k = kind();
    if (k === undefined) return `Drill: ${drill()?.name ?? ''}`;
    return k.id === KindId.Moguls ? `${k.name} · ${MOGUL_LINE_NAMES[line()]}` : k.name;
  };
  const status = (): string | null => (placeholder() !== null ? 'placeholder data' : kind() === undefined && drill()?.draft !== true ? null : 'draft');

  return (
    <div class="app" data-sheet={sheet()} data-mode={mode()} data-dragging={drag() === 0 ? undefined : ''}>
      <header class="top">
        <div class="top-id">
          <h1 class="wordmark">skibuddy</h1>
          <p class="top-meta">
            <span class="top-source">
              {sourceName()} · {cap(intensity())}
            </span>
            <Show when={status()}>{(tag) => <span class="tag" data-tone={placeholder() !== null ? 'placeholder' : undefined}>{tag()}</span>}</Show>
          </p>
        </div>
        <div class="top-actions">
          <button type="button" class="icon-button" aria-pressed={mode() === Mode.Drills} onClick={openDrills}>
            <Icon name="gate" />
            <span class="label">Drills</span>
          </button>
          <button type="button" class="icon-button" aria-pressed={mode() === Mode.List} onClick={toggleList}>
            <Icon name="list" />
            <span class="label">List</span>
          </button>
          <button type="button" class="icon-button" aria-expanded={settings()} aria-controls="settings" onClick={() => setSettings(!settings())}>
            <Icon name="sliders" />
            <span class="sr">Settings</span>
          </button>
        </div>
        <Show when={settings()}>
          <div id="settings" class="settings" role="group" aria-label="Settings">
            <Segmented label="How hard it is skied" options={INTENSITIES} value={intensity()} onChange={setIntensity} />
            <Show when={kind()?.id === KindId.Moguls}>
              <Segmented label="Line through the moguls" options={MOGUL_LINES} names={MOGUL_LINE_NAMES} value={line()} onChange={setLine} />
            </Show>
            <Segmented label="View" options={VIEW_LOCKS} names={VIEW_LOCK_NAMES} value={viewLock()} onChange={setViewChoice} />
            <Segmented label="Theme" options={[ThemeChoice.System, ThemeChoice.Light, ThemeChoice.Dark]} value={choice()} onChange={setChoice} />
            <p class="muted small">
              Not medical advice. Not affiliated with any instructor association. Anatomy:{' '}
              <a href="https://www.z-anatomy.com/" target="_blank" rel="noreferrer">
                Z-Anatomy
              </a>
              , CC BY-SA 4.0.
            </p>
          </div>
        </Show>
      </header>

      <main class="stage" ref={setStage} aria-label="Figure">
        <Show when={movement()} fallback={<p class="figure-status">This kind has no movement data yet.</p>}>
          {(m) => (
            <Figure
              theme={theme()}
              movement={m()}
              muscles={muscleIds}
              order={order()}
              intensity={intensity()}
              pose={pose()}
              viewLock={viewLock()}
              selected={selected()}
              ramp={ramp()}
              tags={tags()}
              name={(a) => shortName(data, a)}
              onPick={pick}
              onMuscle={onMuscle}
              cover={desktop() ? null : sheet() === Sheet.Glance ? Cover.Glance : sheet() === Sheet.Half ? Cover.Half : null}
            />
          )}
        </Show>
        <Show when={hint()}>
          <p class="hint" role="note">
            Tap a muscle to see it work. Pinch to zoom.
          </p>
        </Show>
        <Show when={!desktop()}>
          <button type="button" class="icon-button train-open" aria-pressed={mode() === Mode.Plan} onClick={openPlan}>
            <Icon name="dumbbell" />
            <span class="label">Train for this</span>
          </button>
        </Show>
        <div class="dock">
          <Rail reducedMotion={reducedMotion()} rate={rate()} onRate={setRate} />
          <Show
            when={kind()}
            fallback={
              <nav class="kinds" aria-label="Drill">
                <button type="button" class="kind kind-back" onClick={() => chooseKind(home())}>
                  <Icon name="back" />
                  Back to {homeName()}
                </button>
                <button type="button" class="kind" aria-pressed="true" onClick={openDrills}>
                  {drill()?.name ?? ''}
                  <Show when={drill()?.draft}>
                    <span class="chip-tag">draft</span>
                  </Show>
                </button>
              </nav>
            }
          >
            <nav class="kinds" aria-label="Kinds of skiing">
              <For each={KINDS}>
                {(k) => (
                  <button type="button" class="kind" aria-pressed={kind()?.id === k.id} onClick={() => chooseKind(k.id)}>
                    {k.name}
                  </button>
                )}
              </For>
            </nav>
          </Show>
        </div>
      </main>

      <aside
        class="sheet"
        aria-label={title() === '' ? 'Details' : title()}
        style={{ '--drag': `${drag()}px` }}
      >
        <div
          class="sheet-handle"
          onPointerDown={onHandleDown}
          onPointerMove={onHandleMove}
          onPointerUp={onHandleUp}
          onPointerCancel={onHandleUp}
        >
          <span class="grip" aria-hidden="true" />
          <div class="sheet-bar">
            <Show when={mode() === Mode.Muscle && sheet() === Sheet.Full && !desktop()}>
              <button type="button" class="icon-button" aria-label="Back to the card" onClick={back}>
                <Icon name="back" />
              </button>
            </Show>
            <Show when={mode() !== Mode.Muscle}>
              <h2 class="sheet-title">{title()}</h2>
            </Show>
            <Show when={sheet() !== Sheet.Closed}>
              <button type="button" class="icon-button close" aria-label="Close" onClick={close}>
                <Icon name="close" />
              </button>
            </Show>
          </div>
        </div>
        <div class="sheet-body">
          <Switch>
            <Match when={mode() === Mode.Drills}>
              <DrillPicker
                data={data}
                like={like()}
                likeName={kind()?.name ?? null}
                current={kind() === undefined ? (drill()?.id ?? null) : null}
                onPick={chooseDrill}
              />
            </Match>
            <Match when={mode() === Mode.Plan}>
              <TrainPanel
                  data={data}
                  tags={tags()}
                  order={order()}
                  intensity={intensity()}
                  ramp={ramp()}
                  pose={homePose()}
                  kindName={homeName()}
                  drills={KIND_DRILLS[home()]}
                  current={kind() === undefined ? (drill()?.id ?? null) : null}
                  onPick={pick}
                  onDrill={chooseDrill}
                />
            </Match>
            <Match when={mode() === Mode.List}>
              <MuscleList
                data={data}
                order={order()}
                intensity={intensity()}
                ramp={ramp()}
                selected={selected()}
                onPick={pick}
                onOpen={openDetail}
              />
            </Match>
            <Match when={activation()}>
              {(a) => (
                <>
                  <Glance data={data} activation={a()} order={order()} intensity={intensity()} ramp={ramp()} />
                  <Show when={sheet() !== Sheet.Full && !desktop()}>
                    <button type="button" class="more" onClick={() => setSheet(Sheet.Full)}>
                      <Icon name="up" />
                      Everything about this muscle
                    </button>
                  </Show>
                  <Show when={sheet() === Sheet.Full || desktop()}>
                    <Detail
                      data={data}
                      movement={movement()}
                      activation={a()}
                      intensity={intensity()}
                      ramp={ramp()}
                      placeholder={placeholder()}
                      drillId={kind() === undefined ? (drill()?.id ?? null) : null}
                      onDrill={chooseDrill}
                    />
                  </Show>
                </>
              )}
            </Match>
            <Match when={desktop()}>
              <div class="empty">
                <p>Tap a muscle on the body, or a tag, to see how hard it works through the turn.</p>
                <p class="muted">Drag the figure to turn it; pinch or scroll to zoom. The list shows every muscle in a fixed order.</p>
              </div>
              <TrainPanel
                  data={data}
                  tags={tags()}
                  order={order()}
                  intensity={intensity()}
                  ramp={ramp()}
                  pose={homePose()}
                  kindName={homeName()}
                  drills={KIND_DRILLS[home()]}
                  current={kind() === undefined ? (drill()?.id ?? null) : null}
                  onPick={pick}
                  onDrill={chooseDrill}
                />
            </Match>
          </Switch>
          <p class="legal muted small">
            Not medical advice. Not affiliated with any instructor association. Anatomy:{' '}
            <a href="https://www.z-anatomy.com/" target="_blank" rel="noreferrer">
              Z-Anatomy
            </a>
            , CC BY-SA 4.0.
          </p>
        </div>
      </aside>
    </div>
  );
};
