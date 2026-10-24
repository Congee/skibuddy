import { For, Show, createEffect, createMemo, createResource, createSignal, onCleanup, onMount } from 'solid-js';
import type { JSX } from 'solid-js';
import { INTENSITIES, Intensity } from '../../content/schema';
import type { MuscleId } from '../../content/schema';
import { KINDS, loadData } from '../blend/data';
import { RAMPS, Theme as RampTheme } from '../blend/theme';
import { BEND_FACTOR, SNOW_COMPLIANCE, Snow, marginBandDeg } from '../../physics/edge';
import { KIND_LABEL, TURN_KINDS, TurnKind, feasibilityOf, presetOf } from '../../physics/task';
import type { FeasibilityCheck, TurnEvents, TurnTask } from '../../physics/task';
import { turnProfile } from '../../physics/turn';
import type { TurnProfile } from '../../physics/turn';
import { Q_FRAMES, qTable } from '../../viewer/motion/q-table';
import { KIND_DRILL, frameIndex, readoutOf, skiYaw, solvedAt } from './adapter';
import type { SolvedReadout } from './adapter';
import { litEvidence, loadClips } from './evidence';
import type { Clip, LitNote } from './evidence';
import { View, cameraFor, snapshot } from './render';
import { EVENT_LABEL, EVENT_ORDER, Strip } from './Strip';
import { EffortStrips } from './EffortStrips';
import { effortLevelsAt, effortNote, effortStrips } from './effort-strips';

const DEG = Math.PI / 180;
const INTENSITY_LABEL: Readonly<Record<Intensity, string>> = { [Intensity.Gentle]: 'Gentle', [Intensity.Moderate]: 'Moderate', [Intensity.Dynamic]: 'Dynamic' };
const VIEW_LABEL: Readonly<Record<View, string>> = { [View.Behind]: 'Behind', [View.Front]: 'Front', [View.Side]: 'Side' };

const Theme = { System: 'system', Light: 'light', Dark: 'dark' } as const;
type Theme = (typeof Theme)[keyof typeof Theme];

const pick = <T extends string>(value: string | null, options: ReadonlyArray<T>, fallback: T): T => options.find((o) => o === value) ?? fallback;
const f = (v: number, d = 1): string => (Number.isFinite(v) ? v.toFixed(d) : '–');

interface Cell {
  readonly task: TurnTask;
  readonly why: string;
  readonly profile: TurnProfile;
  readonly checks: ReadonlyArray<FeasibilityCheck>;
  readonly solved: ReadonlyArray<Float64Array> | null;
}

const cellOf = (kind: TurnKind, intensity: Intensity): Cell => {
  const { task, why } = presetOf(kind, intensity);
  const snow = task.snow ?? Snow.HardGroomed;
  return { task, why, profile: turnProfile(task, snow), checks: feasibilityOf(task, snow), solved: qTable(KIND_DRILL[kind], intensity) };
};
const CELLS: Readonly<Record<TurnKind, Readonly<Record<Intensity, Cell>>>> = Object.fromEntries(
  TURN_KINDS.map((k) => [k, Object.fromEntries(INTENSITIES.map((i) => [i, cellOf(k, i)]))]),
) as Record<TurnKind, Record<Intensity, Cell>>;

// Agent C's gates; the page builds and runs without them.
const GATES = import.meta.glob('../../viewer/motion/gates.ts');
type GateTurn = (drill: string, intensity: Intensity, q: ReadonlyArray<Float64Array>) => unknown;

const prefersDark = (): boolean => matchMedia('(prefers-color-scheme: dark)').matches;

export const Model = (): JSX.Element => {
  const params = new URLSearchParams(location.search);
  const [kind, setKind] = createSignal<TurnKind>(pick(params.get('kind'), TURN_KINDS, TurnKind.Steered));
  const [intensity, setIntensity] = createSignal<Intensity>(pick(params.get('intensity'), INTENSITIES, Intensity.Moderate));
  const [view, setView] = createSignal<View>(pick(params.get('view'), Object.values(View), View.Behind));
  const [theme, setTheme] = createSignal<Theme>(pick(params.get('theme'), Object.values(Theme), Theme.System));
  const [systemDark, setSystemDark] = createSignal(prefersDark());
  const [rule, setRule] = createSignal<number | null>(null);

  onMount(() => {
    const mq = matchMedia('(prefers-color-scheme: dark)');
    const on = (): void => {
      setSystemDark(mq.matches);
    };
    mq.addEventListener('change', on);
    onCleanup(() => mq.removeEventListener('change', on));
  });
  const dark = (): boolean => (theme() === Theme.System ? systemDark() : theme() === Theme.Dark);
  createEffect(() => {
    document.documentElement.style.colorScheme = theme() === Theme.System ? 'light dark' : theme();
  });
  createEffect(() => {
    const p = new URLSearchParams({ kind: kind(), intensity: intensity(), view: view() });
    if (theme() !== Theme.System) p.set('theme', theme());
    history.replaceState(null, '', `?${p.toString()}`);
  });

  const cell = createMemo(() => CELLS[kind()][intensity()]);
  const band = createMemo(() => marginBandDeg(cell().task));
  const evidence = createMemo(() => litEvidence(kind()));
  const [content] = createResource(() => loadData(`${import.meta.env.BASE_URL}content.json`));
  const ready = (): Awaited<ReturnType<typeof loadData>> | undefined => (content.state === 'ready' ? content() : undefined);
  // The hand-authored movement the blend page stands in for this kind.
  const authoredFrom = createMemo(() => KINDS.find((k) => k.pose === KIND_DRILL[kind()])?.base ?? null);
  const strips = createMemo(() => {
    const base = authoredFrom();
    return effortStrips(KIND_DRILL[kind()], intensity(), base === null ? [] : (ready()?.movements.get(base)?.activations ?? []));
  });
  const note = createMemo(() => effortNote(KIND_DRILL[kind()], intensity()));
  const muscleName = (m: MuscleId): string => {
    const found = ready()?.muscles.find((x) => x.id === m);
    return found?.shortName ?? found?.name ?? m.replaceAll('-', ' ');
  };
  const [clips] = createResource(loadClips);
  const [gates] = createResource(
    () => ({ k: kind(), i: intensity() }),
    async ({ k, i }): Promise<{ readonly present: boolean; readonly result: unknown }> => {
      const load = Object.values(GATES)[0];
      if (load === undefined) return { present: false, result: null };
      const m = (await load()) as { readonly gateTurn?: GateTurn };
      const qs = CELLS[k][i].solved;
      if (typeof m.gateTurn !== 'function') return { present: true, result: 'module has no gateTurn' };
      return { present: true, result: qs === null ? null : m.gateTurn(KIND_DRILL[k], i, qs) };
    },
  );

  const task = (): TurnTask => cell().task;
  const snow = (): Snow => task().snow ?? Snow.HardGroomed;
  const carved = (): boolean => kind() === TurnKind.GS || kind() === TurnKind.SL;
  // Carved: the profile's radius at the force peak; else the task's.
  const skiR = (): number => (carved() ? cell().profile.at(cell().profile.events.forcePeak).skiRadius : task().radiusM);

  return (
    <main class="model">
      <header class="bar">
        <h1>Motion model</h1>
        <span class="soft">physics, figure and evidence per kind × intensity</span>
        <span class="spacer" />
        <div class="seg" role="group" aria-label="Theme">
          <For each={Object.values(Theme)}>
            {(t) => (
              <button type="button" aria-pressed={theme() === t} onClick={() => setTheme(t)}>
                {t === Theme.System ? 'System' : t === Theme.Light ? 'Light' : 'Dark'}
              </button>
            )}
          </For>
        </div>
      </header>

      <section class="pickers">
        <div class="chips" role="group" aria-label="Kind">
          <For each={TURN_KINDS}>
            {(k) => (
              <button type="button" class="chip" aria-pressed={kind() === k} onClick={() => setKind(k)}>
                {KIND_LABEL[k]}
              </button>
            )}
          </For>
        </div>
        <div class="chips" role="group" aria-label="Intensity">
          <For each={INTENSITIES}>
            {(i) => (
              <button type="button" class="chip" aria-pressed={intensity() === i} onClick={() => setIntensity(i)}>
                {INTENSITY_LABEL[i]}
              </button>
            )}
          </For>
        </div>
        <dl class="task">
          <div><dt>v</dt><dd>{f(task().speedMps)} m/s</dd></div>
          <div><dt>r ski</dt><dd>{f(skiR())} m</dd></div>
          <Show when={task().massRadiusM}>{(r) => <div><dt>r mass</dt><dd>{f(r())} m</dd></div>}</Show>
          <div><dt>θ slope</dt><dd>{f(task().slopeDeg, 0)}°</dd></div>
          <div><dt>T</dt><dd>{f(task().periodS ?? cell().profile.periodS, 2)} s{task().periodS === undefined ? ' (derived)' : ''}</dd></div>
          <Show when={task().edgeMaxDeg !== undefined}><div><dt>ε max</dt><dd>{f(task().edgeMaxDeg ?? 0, 0)}°</dd></div></Show>
          <Show when={task().bumpSpacingM !== undefined}><div><dt>bumps</dt><dd>{f(task().bumpSpacingM ?? 0)} m apart, {f(task().bumpHeightM ?? 0)} m high</dd></div></Show>
          <Show when={carved()} fallback={<div><dt>snow k</dt><dd>{f(BEND_FACTOR[snow()], 2)}</dd></div>}>
            <div><dt>snow c</dt><dd>{(SNOW_COMPLIANCE[snow()] * 1e6).toFixed(1)} µm/N</dd></div>
          </Show>
          <div class="why"><dt>why</dt><dd>{cell().why}</dd></div>
        </dl>
      </section>

      <Overview kind={kind()} intensity={intensity()} onPick={(k, i) => { setKind(k); setIntensity(i); }} />

      <section class="panel">
        <div class="panel-head">
          <h2>Physics</h2>
          <span class="soft">margin band {band().min}…{band().max}° over λ shaded</span>
        </div>
        <div class="physics">
          <div class="curves">
            <Strip profile={cell().profile} band={band()} evidence={evidence().series} />
            <Show when={strips()}>
              {(s) => (
                <EffortStrips
                  strips={s()}
                  events={cell().profile.events}
                  ramp={RAMPS[dark() ? RampTheme.Dark : RampTheme.Light]}
                  name={muscleName}
                  authoredFrom={authoredFrom()}
                  note={note()}
                />
              )}
            </Show>
          </div>
          <aside class="evidence-col">
            <h3>Evidence</h3>
            <Show when={evidence().series.length > 0} fallback={<p class="soft">No digitised literature curve for this kind.</p>}>
              <ul class="lit">
                <For each={evidence().series}>
                  {(s) => (
                    <li>
                      <span class="swatch video" />
                      {s.label} ({s.channel === 'edge' ? 'ε' : 'λ'}): {s.status}
                      <span class="soft"> · {s.source}</span>
                    </li>
                  )}
                </For>
              </ul>
            </Show>
            <Show when={evidence().notes.length > 0}>
              <ul class="lit notes">
                <For each={evidence().notes}>{(n: LitNote) => <li class="soft">{n.key.replaceAll('_', ' ')} {n.channel === 'edge' ? 'ε' : 'λ'}: {n.status}{n.text === '' ? '' : ` (${n.text})`}</li>}</For>
              </ul>
            </Show>
            <Footage kind={kind()} clips={clips()} error={clips.error !== undefined} />
          </aside>
        </div>
        <div class="rules">
          <For each={cell().checks}>
            {(c) => (
              <button type="button" class={`rule ${c.ok ? 'ok' : 'fail'}`} title={c.detail} aria-pressed={rule() === c.rule} onClick={() => setRule(rule() === c.rule ? null : c.rule)}>
                Rule {c.rule} {c.ok ? 'pass' : 'fail'}
              </button>
            )}
          </For>
        </div>
        <Show when={cell().checks.find((c) => c.rule === rule())}>{(c) => <p class="rule-detail">{c().detail}</p>}</Show>
      </section>

      <section class="panel">
        <div class="panel-head">
          <h2>Figure at each event</h2>
          <div class="seg" role="group" aria-label="Camera">
            <For each={Object.values(View)}>
              {(v) => (
                <button type="button" aria-pressed={view() === v} onClick={() => setView(v)}>
                  {VIEW_LABEL[v]}
                </button>
              )}
            </For>
          </div>
        </div>
        <div class="frames">
          <For each={EVENT_ORDER}>
            {(e) => <FrameCard event={e} kind={kind()} intensity={intensity()} cell={cell()} view={view()} dark={dark()} />}
          </For>
        </div>
        <div class="gates">
          <Show when={!gates.loading} fallback={<span class="soft">gates: loading</span>}>
            <GateFlags value={gates()} solved={cell().solved !== null} />
          </Show>
        </div>
      </section>
    </main>
  );
};

const Overview = (props: { readonly kind: TurnKind; readonly intensity: Intensity; readonly onPick: (k: TurnKind, i: Intensity) => void }): JSX.Element => (
  <table class="overview">
    <thead>
      <tr>
        <th scope="col" />
        <For each={INTENSITIES}>{(i) => <th scope="col">{INTENSITY_LABEL[i]}</th>}</For>
      </tr>
    </thead>
    <tbody>
      <For each={TURN_KINDS}>
        {(k) => (
          <tr>
            <th scope="row">{KIND_LABEL[k]}</th>
            <For each={INTENSITIES}>
              {(i) => {
                const c = CELLS[k][i];
                const failed = c.checks.filter((x) => !x.ok).map((x) => x.rule);
                return (
                  <td>
                    <button type="button" class="cell" aria-pressed={props.kind === k && props.intensity === i} onClick={() => props.onPick(k, i)}>
                      <span class={failed.length === 0 ? 'ok-text' : 'flag-text'}>{failed.length === 0 ? `${c.checks.length} rules pass` : `fails rule ${failed.join(', ')}`}</span>
                      <span class={c.solved === null ? 'soft' : 'bio-text'}>{c.solved === null ? 'not solved' : 'solved'}</span>
                    </button>
                  </td>
                );
              }}
            </For>
          </tr>
        )}
      </For>
    </tbody>
  </table>
);

const Footage = (props: { readonly kind: TurnKind; readonly clips: ReadonlyArray<Clip> | undefined; readonly error: boolean }): JSX.Element => {
  const mine = (): ReadonlyArray<Clip> => (props.clips ?? []).filter((c) => c.kind === props.kind);
  return (
    <div class="footage">
      <h3>Footage</h3>
      <Show when={!props.error} fallback={<p class="soft">Clip list not served (CAPTURE_DIR).</p>}>
        <Show when={mine().length > 0} fallback={<p class="soft">No clip of this kind in clips.tsv.</p>}>
          <p class="soft">No clip carries event timing yet, so no frame is matched to an event.</p>
          <ul class="clips">
            <For each={mine()}>
              {(c) => (
                <li>
                  {c.name} <span class="soft">· {c.view} · {c.start}–{c.end} s · {c.poses.length === 0 ? 'no pose file' : c.poses.join(', ')}</span>
                </li>
              )}
            </For>
          </ul>
        </Show>
      </Show>
    </div>
  );
};

const GateFlags = (props: { readonly value: { readonly present: boolean; readonly result: unknown } | undefined; readonly solved: boolean }): JSX.Element => {
  const rows = (): ReadonlyArray<{ readonly name: string; readonly ok: boolean; readonly detail: string }> | null => {
    const r = props.value?.result;
    if (typeof r !== 'object' || r === null) return null;
    // Either a list of gates or a map of gate name to result.
    const entries: ReadonlyArray<readonly [string, unknown]> = Array.isArray(r) ? r.map((g: unknown, k) => [`gate ${k + 1}`, g] as const) : Object.entries(r);
    const list = entries.flatMap(([key, g]) => {
      if (typeof g !== 'object' || g === null) return [];
      const o = g as Record<string, unknown>;
      const ok = o['ok'] ?? o['pass'];
      if (typeof ok !== 'boolean') return [];
      const v = typeof o['value'] === 'number' && typeof o['threshold'] === 'number' ? ` (value ${f(o['value'], 3)}, threshold ${f(o['threshold'], 3)})` : '';
      return [{ name: String(o['name'] ?? o['gate'] ?? key), ok, detail: `${String(o['detail'] ?? o['reason'] ?? '')}${v}` }];
    });
    return list.length > 0 ? list : null;
  };
  return (
    <Show when={props.value?.present === true} fallback={<span class="soft">gates: module not present</span>}>
      <Show when={props.solved} fallback={<span class="soft">gates: nothing solved to gate</span>}>
        <Show when={rows()} fallback={<span class="soft">gates: {JSON.stringify(props.value?.result)?.slice(0, 200)}</span>}>
          {(list) => (
            <div class="rules">
              <For each={list()}>{(g) => <span class={`rule ${g.ok ? 'ok' : 'fail'}`} title={g.detail}>{g.name} {g.ok ? 'pass' : 'fail'}</span>}</For>
            </div>
          )}
        </Show>
      </Show>
    </Show>
  );
};

const FrameCard = (props: { readonly event: keyof TurnEvents; readonly kind: TurnKind; readonly intensity: Intensity; readonly cell: Cell; readonly view: View; readonly dark: boolean }): JSX.Element => {
  const [canvas, setCanvas] = createSignal<HTMLCanvasElement>();
  const [error, setError] = createSignal<string | null>(null);
  const t = (): number => props.cell.profile.events[props.event];
  const p = (): ReturnType<TurnProfile['at']> => props.cell.profile.at(t());
  const solved = createMemo(() => {
    const qs = props.cell.solved;
    if (qs === null) return null;
    const fi = frameIndex(t());
    const q = qs[fi.k];
    if (q === undefined) return null;
    const s = solvedAt(KIND_DRILL[props.kind], props.intensity, q, fi.t);
    return { ...s, k: fi.k, readout: readoutOf(s.worlds, q) as SolvedReadout };
  });
  const levels = createMemo(() => effortLevelsAt(KIND_DRILL[props.kind], props.intensity, t()) ?? undefined);

  createEffect(() => {
    const s = solved();
    const target = canvas();
    if (s === null || target === undefined) return;
    const cam = cameraFor(s.frame.pelvis.pos, skiYaw(s.worlds), props.view);
    snapshot(target, { frame: s.frame }, cam, props.dark, levels()).then(
      () => setError(null),
      (e: unknown) => setError(String(e)),
    );
  });

  return (
    <figure class="frame">
      <figcaption>
        {EVENT_LABEL[props.event]} <span class="soft">t {f(t(), 2)}</span>
      </figcaption>
      <div class="viewport">
        <canvas ref={setCanvas} class={solved() === null ? 'hidden' : ''} />
        <Show when={solved() === null}>
          <div class="unsolved">Not solved yet</div>
        </Show>
        <Show when={error()}>{(e) => <div class="unsolved flag-text">{e()}</div>}</Show>
      </div>
      <dl class="nums">
        <div class="phys"><dt>λ</dt><dd>{f(p().lean / DEG)}°</dd></div>
        <div class="phys"><dt>ε goal</dt><dd>{f(p().edge / DEG)}°</dd></div>
        <div class="phys"><dt>load</dt><dd>{f(p().load, 2)} BW</dd></div>
        <Show when={solved()}>
          {(s) => (
            <>
              <div class="bio"><dt>edge</dt><dd>{f(s().readout.edge)}°</dd></div>
              <div class="bio"><dt>counter</dt><dd>{f(s().readout.counter)}°</dd></div>
              <div class="bio"><dt>inside lead</dt><dd>{f(s().readout.lead * 100, 0)} cm</dd></div>
              <div class="bio"><dt>knee out / in</dt><dd>{f(s().readout.kneeOutside, 0)} / {f(s().readout.kneeInside, 0)}°</dd></div>
              <div class="bio"><dt>ankle out / in</dt><dd>{f(s().readout.ankleOutside, 0)} / {f(s().readout.ankleInside, 0)}°</dd></div>
              <div class="bio"><dt>pelvis list</dt><dd>{f(s().readout.pelvisList)}°</dd></div>
              <div class="soft-row"><dt>frame</dt><dd>{s().k} / {Q_FRAMES}</dd></div>
            </>
          )}
        </Show>
      </dl>
    </figure>
  );
};
