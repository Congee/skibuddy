import { For, Show, createEffect, createMemo, createResource, createSignal, on, onCleanup, onMount, untrack } from 'solid-js';
import type { JSX } from 'solid-js';
import { DATA, listPoses, loadClip, loadObs, loadRtmw, readout, videoTime } from './data';
import type { CaptureClip, CaptureFrame, PoseFile, Readout } from './data';
import { ViewMode, createStage } from './stage';
import type { Stage } from './stage';
import { figureSkis, gateParts, jointErrors, loadGates, loadSkis2d } from './gates';
import type { GateFile, GateFrame, GateResult, Line2 } from './gates';
import { BONES, OVERLAY_JOINTS, overlayFrame, rtmwName, threeView } from './overlay';
import type { JointError, ObsCamera, OverlayFrame, ThreeView } from './overlay';

const SIDE = { L: '#0072b2', R: '#d55e00' } as const;
const SIDES = ['L', 'R'] as const;
const VIDEO_W = 1920;
const VIDEO_H = 1080;
const num = (v: number): string => (Math.abs(v) >= 100 ? v.toFixed(0) : Math.abs(v) >= 1 ? v.toFixed(1) : v.toFixed(3));

const Compare = { Ghost: 'ghost', Beside: 'beside' } as const;
type Compare = (typeof Compare)[keyof typeof Compare];
const BESIDE = 0.9;

const params = new URLSearchParams(location.search);
const setParam = (key: string, value: string | null): void => {
  const u = new URL(location.href);
  if (value === null) u.searchParams.delete(key);
  else u.searchParams.set(key, value);
  history.replaceState(null, '', u);
};

const at = (c: CaptureClip | null | undefined, i: number): CaptureFrame | null =>
  c === null || c === undefined ? null : (c.frames[Math.min(i, c.frames.length - 1)] ?? null);

const fmt = (v: number): string => (Number.isFinite(v) ? v.toFixed(1) : '–');
/** joints2d gate threshold, torso lengths. */
const JOINT_LIMIT = 0.3;
const ERR = '#e0218a';
const BONE = '#00a896';
const viewParam = (v: string | null): ViewMode => (Object.values(ViewMode).find((m) => m === v) ?? ViewMode.Footage);
const find = (list: ReadonlyArray<JointError>, n: string): JointError | undefined => list.find((e) => e.joint === n);
const ErrCell = (props: { readonly e: JointError | undefined }): JSX.Element => (
  <>
    <td class={props.e === undefined ? 'soft' : props.e.torso > JOINT_LIMIT ? 'bad' : ''}>{props.e === undefined ? '–' : props.e.px.toFixed(0)}</td>
    <td class={props.e === undefined ? 'soft' : props.e.torso > JOINT_LIMIT ? 'bad' : ''}>{props.e === undefined ? '–' : props.e.torso.toFixed(2)}</td>
  </>
);

const ReadoutRow = (props: { readonly label: string; readonly r: Readout; readonly tone: string }): JSX.Element => (
  <tr>
    <th scope="row">
      <span class="swatch" style={{ background: props.tone }} />
      {props.label}
    </th>
    <td>{fmt(props.r.knee[0])}</td>
    <td>{fmt(props.r.knee[1])}</td>
    <td>{fmt(props.r.hip[0])}</td>
    <td>{fmt(props.r.hip[1])}</td>
    <td>{fmt(props.r.trunk)}</td>
    <td class="clamped">
      <Show when={props.r.clamped.length > 0} fallback="none">
        <For each={props.r.clamped}>{(c) => <span>{`${c.name} ${fmt(c.value)} (limit ${fmt(c.bound)})`}</span>}</For>
      </Show>
    </td>
  </tr>
);

export const Capture = (): JSX.Element => {
  const [index, { refetch }] = createResource(listPoses);
  const files = (): ReadonlyArray<PoseFile> | undefined => index()?.filter((f) => f.stage !== 'gates');
  const [mainFile, setMainFile] = createSignal<string | null>(params.get('pose'));
  const [otherFile, setOtherFile] = createSignal<string | null>(params.get('compare'));
  const [compare, setCompare] = createSignal<Compare>(params.get('mode') === Compare.Beside ? Compare.Beside : Compare.Ghost);
  const [view, setView] = createSignal<ViewMode>(viewParam(params.get('view')));
  const [showKp, setShowKp] = createSignal(params.get('kp') !== '0');
  const [showSkis, setShowSkis] = createSignal(params.get('skis') !== '0');
  const [showBones, setShowBones] = createSignal(params.get('bones') !== '0');
  const [frame, setFrame] = createSignal(Number(params.get('frame') ?? 0) || 0);
  const [playing, setPlaying] = createSignal(false);
  const [stage, setStage] = createSignal<Stage | null>(null);
  const [stageError, setStageError] = createSignal<string | null>(null);

  const [gateFile, setGateFile] = createSignal<string | null>(params.get('gates'));
  const [overlay, setOverlay] = createSignal(params.get('overlay') !== '0');
  const [videoSize, setVideoSize] = createSignal<readonly [number, number]>([VIDEO_W, VIDEO_H]);
  const [videoDuration, setVideoDuration] = createSignal(Number.NaN);

  // Default to the first file once the list arrives.
  createEffect(() => {
    const list = files();
    if (list === undefined || list.length === 0) return;
    if (mainFile() === null || !list.some((f) => f.file === mainFile())) setMainFile(list[0]?.file ?? null);
  });
  const mainInfo = createMemo(() => files()?.find((f) => f.file === mainFile()));
  const siblings = createMemo((): ReadonlyArray<PoseFile> => (files() ?? []).filter((f) => f.clip === mainInfo()?.clip && f.file !== mainFile()));
  const [main] = createResource(mainFile, loadClip);
  const [other] = createResource(() => (siblings().some((f) => f.file === otherFile()) ? otherFile() : null), loadClip);
  const shownOther = (): CaptureClip | null => (siblings().some((f) => f.file === otherFile()) ? (other() ?? null) : null);

  // Gate files by stage; stage names show pass/fail counts.
  const gateFiles = createMemo(() => (index() ?? []).filter((f) => f.stage === 'gates').map((f) => ({ file: f.file, ...gateParts(f.file) })));
  const stageGates = createMemo(() => gateFiles().filter((g) => g.clip === mainInfo()?.clip));
  const [allGates] = createResource(gateFiles, async (list) => {
    const out: Record<string, GateFile> = {};
    await Promise.all(list.map(async (g) => void (out[g.file] = await loadGates(g.file).catch(() => ({ pass: false, failedFrames: [], summary: {}, frames: [] })))));
    return out;
  });
  // Follow the pose file's stage when it has gates.
  createEffect(() => {
    const list = stageGates();
    const want = list.find((g) => g.stage === mainInfo()?.stage) ?? list.find((g) => g.file === gateFile()) ?? list[0];
    if (want !== undefined && want.file !== gateFile()) setGateFile(want.file);
  });
  const gates = (): GateFile | null => allGates()?.[gateFile() ?? ''] ?? null;
  const gateFrame = (): GateFrame | undefined => gates()?.frames.find((g) => g.i === clampFrame(frame()));
  const [skis2d] = createResource(() => (gateFile() === null ? null : gateParts(gateFile() ?? '').clip.replace(/_retarget$/, '')), (c) => loadSkis2d(c));
  const failSet = createMemo(() => new Set(gates()?.failedFrames ?? []));

  const count = (): number => main()?.frames.length ?? 0;
  const clampFrame = (i: number): number => Math.max(0, Math.min(count() - 1, Math.round(i)));
  const [obs] = createResource(() => main()?.clip, loadObs);
  const [rtmw] = createResource(() => main()?.clip, loadRtmw);
  const obsFrame = (): ObsCamera | null => {
    const o = obs();
    const n = count();
    return o === null || o === undefined || o.length !== n ? null : (o[clampFrame(frame())] ?? null);
  };
  const pinhole = createMemo((): ThreeView | null => {
    const o = obsFrame();
    return o === null ? null : threeView(o, videoSize());
  });
  const over = createMemo((): OverlayFrame | null => {
    const o = obsFrame();
    const f = at(main(), clampFrame(frame()));
    return o === null || f === null ? null : overlayFrame(f, main()?.limbs, o, rtmw()?.[clampFrame(frame())] ?? null);
  });
  const kpOf = (n: string): readonly [number, number, number] | undefined => rtmw()?.[clampFrame(frame())]?.[rtmwName(n)];
  const overlayMissing = (): string | null =>
    obs.loading || main() === undefined ? null : obs() === null ? `no ${main()?.clip ?? ''}_obs.json: drawn through the pose file's own camera, which the gates do not use; no joint errors` : obsFrame() === null ? `${main()?.clip ?? ''}_obs.json has ${obs()?.length ?? 0} frames, the pose file ${count()}: no gate camera` : null;

  let video: HTMLVideoElement | undefined = undefined;
  let canvas: HTMLCanvasElement | undefined = undefined;
  onMount(() => {
    const el = canvas;
    if (el === undefined) return;
    const dark = matchMedia('(prefers-color-scheme: dark)').matches;
    createStage(el, dark).then(setStage, (e: unknown) => setStageError(String(e)));
    el.addEventListener('viewmode', (e) => setView((e as CustomEvent<ViewMode>).detail));
    // A new stage file (e.g. the IK pass) shows up when the tab regains focus.
    const onFocus = (): void => void refetch();
    window.addEventListener('focus', onFocus);
    onCleanup(() => window.removeEventListener('focus', onFocus));
  });
  onCleanup(() => stage()?.dispose());

  createEffect(() => {
    const s = stage();
    const c = main();
    if (s === null || c === undefined) return;
    const i = clampFrame(frame());
    const m = at(c, i);
    const o = at(shownOther(), i);
    if (m === null) return;
    s.show({ frame: m, limbs: c.limbs }, o === null ? null : { frame: o, limbs: shownOther()?.limbs }, m.camera ?? o?.camera ?? null, pinhole());
  });
  createEffect(() => stage()?.setView(view()));
  createEffect(() => stage()?.setBeside(compare() === Compare.Beside ? BESIDE : 0));
  createEffect(() => {
    const c = main();
    if (c === undefined || video === undefined) return;
    const t = videoTime(c, clampFrame(frame()), videoDuration());
    if (Math.abs(video.currentTime - t) > 1e-3) video.currentTime = t;
  });
  createEffect(on(frame, (i) => setParam('frame', String(i)), { defer: true }));
  createEffect(on(mainFile, (f) => setParam('pose', f), { defer: true }));
  createEffect(on(otherFile, (f) => setParam('compare', f), { defer: true }));
  createEffect(on(gateFile, (f) => setParam('gates', f), { defer: true }));
  createEffect(on(overlay, (o) => setParam('overlay', o ? null : '0'), { defer: true }));
  createEffect(on(compare, (m) => setParam('mode', m), { defer: true }));
  createEffect(on(view, (v) => setParam('view', v === ViewMode.Footage ? null : v), { defer: true }));
  createEffect(on([showKp, showSkis, showBones], ([k, s, b]) => {
    setParam('kp', k ? null : '0');
    setParam('skis', s ? null : '0');
    setParam('bones', b ? null : '0');
  }, { defer: true }));

  // Play steps frames at the capture's rate and stops at the end; off by default.
  createEffect(() => {
    const c = main();
    if (!playing() || c === undefined) return;
    const start = performance.now();
    const from = untrack(() => (frame() >= count() - 1 ? 0 : clampFrame(frame())));
    let raf = 0;
    const tick = (now: number): void => {
      const i = from + Math.floor(((now - start) / 1000) * c.fps);
      if (i >= count() - 1) {
        setFrame(count() - 1);
        setPlaying(false);
        return;
      }
      if (i !== untrack(frame)) setFrame(i);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    onCleanup(() => cancelAnimationFrame(raf));
  });

  const step = (d: number): void => {
    setPlaying(false);
    setFrame(clampFrame(frame() + d));
  };
  const onKey = (e: KeyboardEvent): void => {
    if (e.target instanceof HTMLSelectElement || e.target instanceof HTMLInputElement) return;
    if (e.key === 'ArrowRight') step(e.shiftKey ? 10 : 1);
    else if (e.key === 'ArrowLeft') step(e.shiftKey ? -10 : -1);
    else return;
    e.preventDefault();
  };
  window.addEventListener('keydown', onKey);
  onCleanup(() => window.removeEventListener('keydown', onKey));

  const mainReadout = createMemo(() => {
    const f = at(main(), clampFrame(frame()));
    return f === null ? null : readout(f, main()?.limbs);
  });
  const otherReadout = createMemo(() => {
    const f = at(shownOther(), clampFrame(frame()));
    return f === null ? null : readout(f, shownOther()?.limbs);
  });
  const stageName = (file: string | null): string => files()?.find((f) => f.file === file)?.stage ?? file ?? '';

  return (
    <main class="capture">
      <header class="bar">
        <h1>Capture</h1>
        <label>
          Pose
          <select value={mainFile() ?? ''} onChange={(e) => setMainFile(e.currentTarget.value)}>
            <For each={files() ?? []}>{(f) => <option value={f.file}>{`${f.clip} · ${f.stage}`}</option>}</For>
          </select>
        </label>
        <label>
          Compare
          <select value={shownOther() === null ? '' : (otherFile() ?? '')} onChange={(e) => setOtherFile(e.currentTarget.value === '' ? null : e.currentTarget.value)}>
            <option value="">none</option>
            <For each={siblings()}>{(f) => <option value={f.file}>{f.stage}</option>}</For>
          </select>
        </label>
        <Show when={shownOther() !== null}>
          <div class="seg" role="group" aria-label="Compare as">
            <button type="button" aria-pressed={compare() === Compare.Ghost} onClick={() => setCompare(Compare.Ghost)}>
              Ghost
            </button>
            <button type="button" aria-pressed={compare() === Compare.Beside} onClick={() => setCompare(Compare.Beside)}>
              Beside
            </button>
          </div>
        </Show>
        <div class="seg" role="group" aria-label="View">
          <button type="button" aria-pressed={view() === ViewMode.Footage} onClick={() => setView(ViewMode.Footage)}>
            Footage camera
          </button>
          <button type="button" aria-pressed={view() === ViewMode.Orbit} onClick={() => setView(ViewMode.Orbit)}>
            Orbit
          </button>
          <button type="button" aria-pressed={view() === ViewMode.Overlay} onClick={() => setView(ViewMode.Overlay)}>
            Overlay
          </button>
        </div>
        <Show when={view() === ViewMode.Overlay}>
          <div class="seg" role="group" aria-label="Overlay layers">
            <button type="button" aria-pressed={showKp()} onClick={() => setShowKp(!showKp())}>
              Joints
            </button>
            <button type="button" aria-pressed={showSkis()} onClick={() => setShowSkis(!showSkis())}>
              Skis
            </button>
            <button type="button" aria-pressed={showBones()} onClick={() => setShowBones(!showBones())}>
              Bones
            </button>
          </div>
        </Show>
        <button type="button" class="quiet" onClick={() => void refetch()}>
          Reload list
        </button>
      </header>

      <Show when={index.error !== undefined || main.error !== undefined}>
        <p class="error" role="alert">
          {String(index.error ?? main.error)}
        </p>
      </Show>
      <Show when={files()?.length === 0}>
        <p class="error">No pose files in the capture directory.</p>
      </Show>

      <section class="panes" classList={{ overlaid: view() === ViewMode.Overlay }} style={{ '--video-aspect': `${videoSize()[0]} / ${videoSize()[1]}` }}>
        <figure class="pane">
          <div class="stack">
            <video
              ref={(el) => {
                video = el;
              }}
              src={main() === undefined ? undefined : `${DATA}${main()?.video ?? ''}`}
              muted
              playsinline
              preload="auto"
              onLoadedMetadata={(e) => {
                setVideoSize([e.currentTarget.videoWidth || VIDEO_W, e.currentTarget.videoHeight || VIDEO_H]);
                setVideoDuration(e.currentTarget.duration);
              }}
            />
            <Show when={view() === ViewMode.Overlay && over()}>
              {(ov) => {
                const P = (n: string): readonly [number, number] | undefined => ov().projected.joints[n];
                const names = OVERLAY_JOINTS.flatMap((j) => SIDES.map((s) => ({ n: `${j}.${s}`, side: s })));
                return (
                  <svg class="overlay top" viewBox={`0 0 ${videoSize()[0]} ${videoSize()[1]}`} preserveAspectRatio="xMidYMid meet" aria-hidden="true">
                    <Show when={showBones()}>
                      <For each={BONES}>
                        {([a, b]) => (
                          <Show when={P(a) !== undefined && P(b) !== undefined}>
                            <line x1={P(a)?.[0]} y1={P(a)?.[1]} x2={P(b)?.[0]} y2={P(b)?.[1]} stroke={BONE} stroke-width="4" stroke-linecap="round" opacity="0.9" />
                          </Show>
                        )}
                      </For>
                    </Show>
                    <Show when={showSkis()}>
                      <For each={SIDES}>
                        {(side) => {
                          const seg = (): Line2 | null => skis2d()?.[clampFrame(frame())]?.skis[side] ?? null;
                          const fig = (): Line2 => ov().projected.skis[side];
                          return (
                            <>
                              <Show when={seg()}>{(l) => <line x1={l().tip[0]} y1={l().tip[1]} x2={l().tail[0]} y2={l().tail[1]} stroke={SIDE[side]} stroke-width="5" stroke-linecap="round" />}</Show>
                              <line x1={fig().tip[0]} y1={fig().tip[1]} x2={fig().tail[0]} y2={fig().tail[1]} stroke={SIDE[side]} stroke-width="5" stroke-dasharray="18 12" opacity="0.9" />
                              <circle cx={fig().tip[0]} cy={fig().tip[1]} r="7" fill={SIDE[side]} />
                            </>
                          );
                        }}
                      </For>
                    </Show>
                    <Show when={showKp()}>
                      <For each={names}>
                        {({ n, side }) => {
                          const k = (): readonly [number, number, number] | undefined => kpOf(n);
                          return (
                            <>
                              <Show when={k() !== undefined && P(n) !== undefined}>
                                <line x1={k()?.[0]} y1={k()?.[1]} x2={P(n)?.[0]} y2={P(n)?.[1]} stroke={ERR} stroke-width="3" />
                              </Show>
                              <Show when={k()}>{(kk) => <circle cx={kk()[0]} cy={kk()[1]} r={3 + 2 * Math.max(0, Math.min(5, kk()[2]))} fill={SIDE[side]} opacity="0.85" />}</Show>
                              <Show when={P(n)}>{(p) => <circle cx={p()[0]} cy={p()[1]} r="13" fill="none" stroke={SIDE[side]} stroke-width="4" />}</Show>
                            </>
                          );
                        }}
                      </For>
                    </Show>
                  </svg>
                );
              }}
            </Show>
            <Show when={view() !== ViewMode.Overlay && overlay() && gates() !== null}>
              <svg class="overlay" viewBox={`0 0 ${videoSize()[0]} ${videoSize()[1]}`} preserveAspectRatio="xMidYMid meet" aria-hidden="true">
                <For each={SIDES}>
                  {(side) => {
                    const seg = (): Line2 | null => skis2d()?.[clampFrame(frame())]?.skis[side] ?? null;
                    const fig = (): Line2 | undefined => figureSkis(gateFrame())[side];
                    return (
                      <>
                        <Show when={seg()}>{(l) => <line x1={l().tip[0]} y1={l().tip[1]} x2={l().tail[0]} y2={l().tail[1]} stroke={SIDE[side]} stroke-width="5" stroke-linecap="round" />}</Show>
                        <Show when={fig()}>{(l) => <line x1={l().tip[0]} y1={l().tip[1]} x2={l().tail[0]} y2={l().tail[1]} stroke={SIDE[side]} stroke-width="5" stroke-dasharray="18 12" stroke-linecap="butt" opacity="0.9" />}</Show>
                      </>
                    );
                  }}
                </For>
              </svg>
            </Show>
          </div>
          <figcaption>
            Footage
            <Show when={view() === ViewMode.Overlay}>
              <span class="key">
                <span class="swatch" style={{ background: SIDE.L }} />L
                <span class="swatch" style={{ background: SIDE.R }} />R · dots RTMW (size by confidence), rings model joints, <span style={{ color: ERR }}>miss</span>, <span style={{ color: BONE }}>bones</span>; skis solid segmented, dashed figure (dot at tip)
              </span>
              <Show when={overlayMissing()}>{(m) => <span class="error"> · {m()}</span>}</Show>
            </Show>
            <Show when={view() !== ViewMode.Overlay && gates() !== null}>
              <label class="inline">
                <input type="checkbox" checked={overlay()} onChange={(e) => setOverlay(e.currentTarget.checked)} /> ski overlay
              </label>
              <span class="key">
                <span class="swatch" style={{ background: SIDE.L }} />L
                <span class="swatch" style={{ background: SIDE.R }} />R · solid segmented, dashed figure
              </span>
            </Show>
          </figcaption>
        </figure>
        <figure class="pane">
          <canvas
            ref={(el) => {
              canvas = el;
            }} data-ready={stage() === null ? undefined : ''} />
          <figcaption>
            {stageName(mainFile())}
            <Show when={shownOther() !== null}>
              {` · ${stageName(otherFile())} in blue`}
            </Show>
            <Show when={stage() === null && stageError() === null}> · loading the figure…</Show>
            <Show when={stageError()}>{(e) => <span class="error"> · {e()}</span>}</Show>
          </figcaption>
        </figure>
      </section>

      <section class="scrub">
        <button type="button" onClick={() => step(-10)} aria-label="Back 10 frames">
          −10
        </button>
        <button type="button" onClick={() => step(-1)} aria-label="Previous frame">
          −1
        </button>
        <button type="button" onClick={() => setPlaying(!playing())} aria-pressed={playing()}>
          {playing() ? 'Pause' : 'Play'}
        </button>
        <button type="button" onClick={() => step(1)} aria-label="Next frame">
          +1
        </button>
        <button type="button" onClick={() => step(10)} aria-label="Forward 10 frames">
          +10
        </button>
        <input
          type="range"
          min="0"
          max={Math.max(0, count() - 1)}
          value={clampFrame(frame())}
          aria-label="Frame"
          onInput={(e) => {
            setPlaying(false);
            setFrame(clampFrame(Number(e.currentTarget.value)));
          }}
        />
        <span class="pos">
          {`frame ${clampFrame(frame())} / ${Math.max(0, count() - 1)} · ${(at(main(), clampFrame(frame()))?.t ?? 0).toFixed(2)} s`}
        </span>
      </section>

      <Show when={gates()}>
        {(g) => (
          <section class="gates">
            <div class="stages" role="group" aria-label="Gate stage">
              <For each={stageGates()}>
                {(sg) => {
                  const gf = (): GateFile | undefined => allGates()?.[sg.file];
                  return (
                    <button type="button" aria-pressed={sg.file === gateFile()} onClick={() => setGateFile(sg.file)}>
                      {sg.stage}
                      <span class={gf()?.pass ? 'ok' : 'bad'}>{` ${(gf()?.frames.length ?? 0) - (gf()?.failedFrames.length ?? 0)}/${gf()?.frames.length ?? 0} pass`}</span>
                    </button>
                  );
                }}
              </For>
            </div>
            <div class="track" role="group" aria-label="Frames failing a gate">
              <For each={Array.from({ length: count() }, (_, i) => i)}>
                {(i) => <button type="button" class="tick" classList={{ fail: failSet().has(i), now: i === clampFrame(frame()) }} aria-label={`frame ${i}${failSet().has(i) ? ' fails' : ' passes'}`} onClick={() => step(i - frame())} />}
              </For>
            </div>
            <table class="readout gate-sum">
              <thead>
                <tr>
                  <th scope="col">Gate (whole clip)</th>
                  <th scope="col">Failed</th>
                  <th scope="col">Median</th>
                  <th scope="col">Limit</th>
                  <th scope="col">This frame</th>
                </tr>
              </thead>
              <tbody>
                <For each={Object.entries(g().summary)}>
                  {([name, sm]) => {
                    const r = (): GateResult | undefined => gateFrame()?.gates[name];
                    return (
                      <tr title={sm.reason}>
                        <th scope="row">{name}</th>
                        <td class={sm.failed > 0 ? 'bad' : 'ok'}>{`${sm.failed}/${sm.evaluated}`}</td>
                        <td>{`${num(sm.median)} ${sm.unit}`}</td>
                        <td>{`${num(sm.value)} ${sm.unit}`}</td>
                        <td class={r() === undefined ? 'soft' : r()?.pass ? 'ok' : 'bad'} title={sm.reason}>
                          <Show when={r()} fallback="no observation">
                            {(x) => `${x().pass ? 'pass' : 'fail'} · ${num(x().value)} vs ${num(x().threshold)} ${sm.unit}`}
                          </Show>
                        </td>
                      </tr>
                    );
                  }}
                </For>
              </tbody>
            </table>
            <Show when={gateFrame()}>
              {(f) => (
                <p class="note">
                  {`Frame ${f().i}: `}
                  <Show when={f().failed.length > 0} fallback="all gates pass">
                    failing{' '}
                    <For each={f().failed}>
                      {(name) => (
                        <span class="bad" title={g().summary[name]?.reason}>
                          {`${name} ${num(f().gates[name]?.value ?? Number.NaN)} vs ${num(f().gates[name]?.threshold ?? Number.NaN)} ${g().summary[name]?.unit ?? ''}; `}
                        </span>
                      )}
                    </For>
                  </Show>
                  <Show when={jointErrors(f())}>{(j) => <span>{` Worst 2D joint: ${Object.entries(j().perJoint).toSorted((a, b) => b[1] - a[1]).slice(0, 3).map(([k, v]) => `${k} ${num(v)}`).join(', ')} torso.`}</span>}</Show>
                </p>
              )}
            </Show>
          </section>
        )}
      </Show>

      <Show when={over()}>
        {(ov) => {
          return (
            <table class="readout joints">
              <caption>{`Frame ${clampFrame(frame())}: projected model joint to keypoint, through the gates' camera. Torso ${fmt(ov().torso.rtmw)} px RTMW, ${fmt(ov().torso.vitpose)} px ViTPose; the joints2d gate scores ViTPose and fails past ${JOINT_LIMIT} torso.`}</caption>
              <thead>
                <tr>
                  <th scope="col">Joint</th>
                  <th scope="col">RTMW px</th>
                  <th scope="col">RTMW torso</th>
                  <th scope="col">ViTPose px</th>
                  <th scope="col">ViTPose torso</th>
                </tr>
              </thead>
              <tbody>
                <For each={OVERLAY_JOINTS.flatMap((j) => SIDES.map((sd) => `${j}.${sd}`))}>
                  {(n) => (
                    <tr>
                      <th scope="row">{n}</th>
                      <ErrCell e={find(ov().rtmw, n)} />
                      <ErrCell e={find(ov().vitpose, n)} />
                    </tr>
                  )}
                </For>
              </tbody>
            </table>
          );
        }}
      </Show>

      <table class="readout">
        <thead>
          <tr>
            <th scope="col">Stage</th>
            <th scope="col">Knee L</th>
            <th scope="col">Knee R</th>
            <th scope="col">Hip L</th>
            <th scope="col">Hip R</th>
            <th scope="col">Trunk off gravity</th>
            <th scope="col">At or past a joint limit</th>
          </tr>
        </thead>
        <tbody>
          <Show when={mainReadout()}>{(r) => <ReadoutRow label={stageName(mainFile())} r={r()} tone="var(--main)" />}</Show>
          <Show when={otherReadout()}>{(r) => <ReadoutRow label={stageName(otherFile())} r={r()} tone="var(--ghost)" />}</Show>
        </tbody>
      </table>
      <p class="note">Degrees. Trunk: pelvis origin to C7/T1 against vertical. Arrow keys step frames, shift for 10. Drag the figure to orbit, wheel to zoom.</p>
    </main>
  );
};
