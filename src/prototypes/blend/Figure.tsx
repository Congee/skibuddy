import { useAtomValue } from '@effect/atom-solid';
import { For, Show, Suspense, createMemo, createSignal, lazy, onCleanup } from 'solid-js';
import type { JSX } from 'solid-js';
import { MAX_EFFORT, effortColour, effortsFor } from '../../content/effort';
import type { EffortRamp } from '../../content/effort';
import type { Activation, Intensity, Movement } from '../../content/schema';
import { phaseAt, turnTimeAtom } from '../../state/playback';
import type { MuscleAnchor } from '../../viewer/anchors';
import type { FigureHighlight } from '../../viewer/highlight';
import { keyOf } from './detail';
import type { TrainTag } from './detail';
import { Glyph } from './glyphs';
import { GROUND } from './theme';
import type { Theme } from './theme';

import type { MusclePick as ViewerPick } from '../../viewer/Viewer';

export type MusclePick = ViewerPick | null;

const Viewer = lazy(() => import('../../viewer/Viewer').then((m) => ({ default: m.Viewer })));

export const Cover = { Glance: 'glance', Half: 'half' } as const;
export type Cover = (typeof Cover)[keyof typeof Cover];
/** The half sheet's top as a share of the space below the header, as in blend.css. */
const HALF_TOP = 0.42;

const HALF = 22;
const GAP = 46;
const LEADER_MIN = 10;
// Tags start this far out from their muscle, toward the near edge.
const REACH = 56;

type Point = { x: number; y: number };
type Placed = { readonly x: number; readonly y: number; readonly ax: number; readonly ay: number; readonly behind: boolean };

/** Pushes overlapping tags apart until each is a free 44 px target, kept inside the field. */
export const spread = (anchors: ReadonlyArray<Readonly<Point>>, w: number, h: number): ReadonlyArray<Point> => {
  const p = anchors.map((a) => ({ x: a.x, y: a.y }));
  const clamp = (q: Point): void => {
    q.x = Math.min(Math.max(q.x, HALF), Math.max(HALF, w - HALF));
    q.y = Math.min(Math.max(q.y, HALF), Math.max(HALF, h - HALF));
  };
  for (let pass = 0; pass < 40; pass++) {
    let moved = false;
    for (let i = 0; i < p.length; i++) {
      for (let j = i + 1; j < p.length; j++) {
        const a = p[i];
        const b = p[j];
        if (a === undefined || b === undefined) continue;
        let dx = b.x - a.x;
        let dy = b.y - a.y;
        let d = Math.hypot(dx, dy);
        if (d >= GAP) continue;
        // Coincident pins split along a fixed angle per pair, so the layout is stable.
        if (d < 0.01) {
          const angle = (i * 7 + j * 3) * 0.9;
          dx = Math.cos(angle);
          dy = Math.sin(angle);
          d = 1;
        }
        const push = (GAP - d) / 2 + 0.5;
        a.x -= (dx / d) * push;
        a.y -= (dy / d) * push;
        b.x += (dx / d) * push;
        b.y += (dy / d) * push;
        moved = true;
      }
    }
    p.forEach(clamp);
    if (!moved) break;
  }
  return p;
};

/** The real figure filling its box: tap a muscle itself, or one of the exercise tags on the muscles to train. */
export const Figure = (props: {
  readonly theme: Theme;
  readonly movement: Movement;
  readonly muscles: ReadonlyArray<string>;
  readonly order: ReadonlyArray<Activation>;
  readonly intensity: Intensity;
  /** The figure's motion: a kind's regular turn, or a drill's id. */
  readonly pose: string;
  readonly selected: string | null;
  readonly ramp: EffortRamp;
  /** The muscles to train, drawn as exercise tags; fixed for a kind and setting. */
  readonly tags: ReadonlyArray<TrainTag>;
  readonly name: (a: Activation) => string;
  readonly onPick: (key: string) => void;
  /** A tap on the body itself; null for anything else. */
  readonly onMuscle: (pick: MusclePick) => void;
  /** The phone sheet over the figure's bottom, if any. */
  readonly cover: Cover | null;
}): JSX.Element => {
  const [anchors, setAnchors] = createSignal<ReadonlyArray<MuscleAnchor>>([]);
  const [ready, setReady] = createSignal(false);
  const [failed, setFailed] = createSignal(false);
  const [size, setSize] = createSignal({ w: 0, h: 0 });
  const t = useAtomValue(() => turnTimeAtom);
  const phase = createMemo(() => phaseAt(t()));
  const highlight = createMemo((): FigureHighlight | null => {
    const a = props.order.find((x) => keyOf(x) === props.selected);
    return a === undefined ? null : { muscle: a.muscle, side: a.side, focus: true };
  });
  const level = (a: Activation): number => effortsFor(a, props.intensity)[phase()];
  const anchorOf = (a: Activation): MuscleAnchor | undefined =>
    anchors().find((m) => m.muscle === a.muscle && m.side === (a.side === 'both' ? 'outside' : a.side));
  const onField = (m: MuscleAnchor): boolean => m.x >= 0 && m.y >= 0 && m.x <= size().w && m.y <= size().h;
  // Fixed order and the same Activation objects, so <For> keeps each tag's element.
  const tagged = createMemo(() => new Map(props.tags.map((g) => [g.activation, g.exercise])));
  const shown = createMemo(() =>
    props.order.filter((a) => {
      const m = anchorOf(a);
      return tagged().has(a) && m !== undefined && onField(m);
    }),
  );
  const layout = createMemo(() => {
    const list = shown();
    const at = list.map((a) => anchorOf(a) ?? { x: 0, y: 0, visible: false });
    const w = size().w;
    const start = at.map((m) => ({ x: m.x + (m.x < w / 2 ? -REACH : REACH), y: m.y }));
    const spot = spread(start, w, size().h);
    const out = new Map<Activation, Placed>();
    list.forEach((a, i) => {
      const m = at[i];
      const s = spot[i];
      if (m !== undefined && s !== undefined) out.set(a, { x: s.x, y: s.y, ax: m.x, ay: m.y, behind: !m.visible });
    });
    return out;
  });
  const placed = (a: Activation): Placed => layout().get(a) ?? { x: 0, y: 0, ax: 0, ay: 0, behind: true };
  const led = (a: Activation): boolean => {
    const p = placed(a);
    return Math.hypot(p.x - p.ax, p.y - p.ay) > LEADER_MIN;
  };

  let box: HTMLDivElement | undefined;
  // How much of the figure's bottom the sheet hides, from the sheet's CSS (glance peeks; half sits at 42%).
  const inset = createMemo((): number => {
    const { h } = size();
    if (props.cover === null || box === undefined || h === 0) return 0;
    const css = getComputedStyle(box);
    const px = (name: string): number => Number.parseFloat(css.getPropertyValue(name)) || 0;
    return props.cover === Cover.Glance ? px('--peek') : Math.max(0, h - HALF_TOP * (h + px('--dock-h')));
  });
  const observer = new ResizeObserver(() => {
    if (box !== undefined) setSize({ w: box.clientWidth, h: box.clientHeight });
  });
  onCleanup(() => observer.disconnect());

  return (
    <div
      class="figure"
      data-ready={ready() ? '' : undefined}
      ref={(el) => {
        box = el;
        observer.observe(el);
      }}
    >
      <Suspense fallback={<div class="figure-wait" />}>
        <Viewer
          movement={props.movement}
          muscles={props.muscles}
          intensity={props.intensity}
          drill={props.pose}
          ground={GROUND[props.theme]}
          highlight={highlight()}
          skeleton={highlight() !== null}
          onPick={props.onMuscle}
          inset={{ bottom: inset() }}
          zoom
          pins
          onAnchors={setAnchors}
          onReady={() => setReady(true)}
          onError={() => setFailed(true)}
          caption={<>Outside ski is the skier's right.</>}
        />
      </Suspense>
      <Show when={!ready() && !failed()}>
        <p class="figure-status" role="status">
          Loading the figure…
        </p>
      </Show>
      <svg class="leaders" aria-hidden="true">
        <For each={shown()}>
          {(a) => (
            <Show when={led(a)}>
              <line x1={placed(a).ax} y1={placed(a).ay} x2={placed(a).x} y2={placed(a).y} />
            </Show>
          )}
        </For>
      </svg>
      <div class="pins">
        <For each={shown()}>
          {(a) => (
            <button
              type="button"
              class="pin pin-tag"
              aria-pressed={keyOf(a) === props.selected}
              aria-label={`${props.name(a)}: train with ${tagged().get(a)?.name ?? ''}`}
              data-behind={placed(a).behind ? '' : undefined}
              style={{ transform: `translate(${placed(a).x - HALF}px, ${placed(a).y - HALF}px)` }}
              onClick={() => props.onPick(keyOf(a))}
            >
              <Show when={tagged().get(a)}>
                {(ex) => (
                  <span class="tag-face">
                    <Glyph exercise={ex().id} class="tag-glyph" />
                    <span class="tag-level" style={{ width: `${Math.max(12, (level(a) / MAX_EFFORT) * 100)}%`, background: effortColour(level(a), props.ramp) }} />
                  </span>
                )}
              </Show>
              <Show when={keyOf(a) === props.selected}>
                <span class="pin-name">{props.name(a)}</span>
              </Show>
            </button>
          )}
        </For>
      </div>
    </div>
  );
};
