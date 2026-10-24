import { For, Show } from 'solid-js';
import type { JSX } from 'solid-js';
import type { TurnEvents } from '../../physics/task';
import type { TurnProfile } from '../../physics/turn';
import type { LitSeries } from './evidence';

const DEG = Math.PI / 180;
const W = 760;
const H = 250;
const L = 44;
const R = 48;
const T = 40;
const B = 26;

export const EVENT_ORDER: ReadonlyArray<keyof TurnEvents> = ['switch', 'engagement', 'fallLine', 'forcePeak', 'release'];
export const EVENT_LABEL: Readonly<Record<keyof TurnEvents, string>> = {
  switch: 'Switch',
  engagement: 'Engagement',
  fallLine: 'Fall line',
  forcePeak: 'Force peak',
  release: 'Release',
};

const STEP = 4;
const path = (ts: ReadonlyArray<number>, ys: ReadonlyArray<number>, x: (t: number) => number, y: (v: number) => number, step = STEP): string =>
  ts
    .flatMap((t, i) => (i % step === 0 || i === ts.length - 1 ? [`${i === 0 ? 'M' : 'L'}${x(t).toFixed(1)},${y(ys[i] ?? 0).toFixed(1)}`] : []))
    .join('');

// Legend under the plot so labels never sit on the curves.
const LEGEND: ReadonlyArray<{ readonly cls: string; readonly label: string }> = [
  { cls: 'lean', label: 'λ lean' },
  { cls: 'edge', label: 'ε edge goal' },
  { cls: 'load', label: 'load, BW (right)' },
];
const nice = (v: number, step: number, up: boolean): number => (up ? Math.ceil(v / step) : Math.floor(v / step)) * step;

/** λ, ε and load over one turn, the margin band, the events and any measured curve. */
export const Strip = (props: { readonly profile: TurnProfile; readonly band: { readonly min: number; readonly max: number }; readonly evidence: ReadonlyArray<LitSeries> }): JSX.Element => {
  const lean = (): ReadonlyArray<number> => props.profile.lean.map((v) => v / DEG);
  const edge = (): ReadonlyArray<number> => props.profile.edge.map((v) => v / DEG);
  const range = (): readonly [number, number] => {
    const all = [...lean(), ...edge(), ...lean().map((v) => v + props.band.max), ...props.evidence.flatMap((s) => [...s.y, ...(s.band?.[1] ?? [])])];
    return [nice(Math.min(0, ...all), 10, false), nice(Math.max(...all), 10, true)];
  };
  const loadMax = (): number => nice(Math.max(...props.profile.load) * 1.05, 0.5, true);
  const x = (t: number): number => L + t * (W - L - R);
  const y = (deg: number): number => {
    const [lo, hi] = range();
    return T + ((hi - deg) / (hi - lo)) * (H - T - B);
  };
  const yl = (bw: number): number => T + (1 - bw / loadMax()) * (H - T - B);
  const ticks = (): ReadonlyArray<number> => {
    const [lo, hi] = range();
    const step = hi - lo > 60 ? 20 : 10;
    return Array.from({ length: Math.floor((hi - lo) / step) + 1 }, (_, i) => lo + i * step);
  };
  const loadTicks = (): ReadonlyArray<number> => Array.from({ length: Math.round(loadMax() / 0.5) + 1 }, (_, i) => i * 0.5);
  const bandPath = (): string => {
    const ts = props.profile.t;
    const top = path(ts, lean().map((v) => v + props.band.max), x, y);
    const back = ts
      .map((t, i) => ({ t, v: (lean()[i] ?? 0) + props.band.min }))
      .filter((_, i) => i % STEP === 0 || i === ts.length - 1)
      .toReversed()
      .map((p) => `L${x(p.t).toFixed(1)},${y(p.v).toFixed(1)}`)
      .join('');
    return `${top}${back}Z`;
  };
  const events = (): ReadonlyArray<{ readonly key: keyof TurnEvents; readonly t: number; readonly row: number }> => {
    const sorted = EVENT_ORDER.map((key) => ({ key, t: props.profile.events[key] })).toSorted((a, b) => a.t - b.t);
    // Labels closer than ~0.13 of the turn take the second row.
    return sorted.map((e, i) => ({ key: e.key, t: e.t, row: i > 0 && e.t - (sorted[i - 1]?.t ?? -1) < 0.13 && i % 2 === 1 ? 1 : 0 }));
  };

  return (
    <svg class="strip" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Lean, edge goal and load over one turn">
      <For each={ticks()}>
        {(v) => (
          <>
            <line class="grid" x1={L} x2={W - R} y1={y(v)} y2={y(v)} />
            <text class="axis" x={L - 6} y={y(v) + 4} text-anchor="end">
              {v}°
            </text>
          </>
        )}
      </For>
      <For each={loadTicks()}>
        {(v) => (
          <text class="axis load-axis" x={W - R + 6} y={yl(v) + 4}>
            {v.toFixed(1)}
          </text>
        )}
      </For>
      <text class="axis" x={W - R + 6} y={T - 8}>
        BW
      </text>
      <path class="band" d={bandPath()} />
      <For each={props.evidence}>
        {(s) => (
          <g class="evidence">
            <Show when={s.band}>{(b) => <path class="evidence-band" d={`${path(s.t, b()[1], x, y, 1)}${s.t.toReversed().map((t, i) => `L${x(t).toFixed(1)},${y(b()[0][s.t.length - 1 - i] ?? 0).toFixed(1)}`).join('')}Z`} />}</Show>
            <path class="evidence-line" d={path(s.t, s.y, x, y, 1)} />
            <text class="evidence-label" x={x(s.t[Math.floor(s.t.length * 0.3)] ?? 0)} y={y(s.y[Math.floor(s.t.length * 0.3)] ?? 0) - 6}>
              {s.label}
            </text>
          </g>
        )}
      </For>
      <path class="load" d={path(props.profile.t, props.profile.load, x, yl)} />
      <path class="lean" d={path(props.profile.t, lean(), x, y)} />
      <path class="edge" d={path(props.profile.t, edge(), x, y)} />
      <line class="zero" x1={L} x2={W - R} y1={y(0)} y2={y(0)} />
      <For each={events()}>
        {(e) => (
          <>
            <line class="event" x1={x(e.t)} x2={x(e.t)} y1={T - 2} y2={H - B} />
            <text class="event-label" x={x(e.t)} y={T - 22 + e.row * 12} text-anchor="middle">
              {EVENT_LABEL[e.key]}
            </text>
          </>
        )}
      </For>
      <For each={LEGEND}>
        {(g, i) => (
          <g transform={`translate(${L + 150 + i() * 120},${H - 10})`}>
            <line class={g.cls} x1={0} x2={26} y1={0} y2={0} />
            <text class="curve-label" x={32} y={4}>
              {g.label}
            </text>
          </g>
        )}
      </For>
      <text class="axis" x={L} y={H - 6}>
        switch
      </text>
      <text class="axis" x={W - R} y={H - 6} text-anchor="end">
        next switch
      </text>
    </svg>
  );
};
