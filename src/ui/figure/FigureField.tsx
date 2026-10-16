import { useAtomValue } from '@effect/atom-solid';
import { Show, Suspense, createMemo, createSignal, lazy, onCleanup, onMount } from 'solid-js';
import type { JSX } from 'solid-js';
import type { Activation, Intensity, Movement } from '../../content/schema';
import { Emphasis, focusAtom, highlight, sameHighlight } from '../../state/focus';
import { turnDirectionAtom, turnNote } from '../../state/playback';
import type { MuscleAnchor } from '../../viewer/anchors';
import type { FigureHighlight } from '../../viewer/highlight';
import type { GearMode } from '../../viewer/gear-mode';
import { PHONE, createMedia } from '../media';
import { useActiveTheme } from '../theme/active-theme';
import { vars } from '../theme/theme.css';
import { readEffortRamp } from '../effort-ramp';
import * as s from './figure.css';
import { pickedKey, pinKey } from './pin-inputs';
import { Pins } from './Pins';

// The board paints before the 3D code arrives.
const Viewer = lazy(() => import('../../viewer/Viewer').then((m) => ({ default: m.Viewer })));

/** Resolves a theme colour such as `var(--snow__x)` to its current value. */
const themeColour = (token: string): string => {
  const name = /var\((--[^),\s]+)/.exec(token)?.[1];
  return name === undefined ? '' : getComputedStyle(document.documentElement).getPropertyValue(name).trim();
};

export const Caption = (): JSX.Element => {
  const direction = useAtomValue(() => turnDirectionAtom);
  return (
    <>
      {turnNote(direction())} <a href="#credits">Credits</a>
    </>
  );
};

export const FigureField = (props: {
  readonly movement: Movement;
  readonly muscles: ReadonlyArray<string>;
  /** The board's steady order. */
  readonly order: ReadonlyArray<Activation>;
  readonly pins: boolean;
  readonly skeleton: boolean;
  readonly gear: GearMode;
  /** How hard the drill is skied: the figure's pose and glow, and the pins. */
  readonly intensity: Intensity;
  /** The drill shown, whose poses the figure plays. */
  readonly drill: string;
  readonly muscleName: (id: string) => string;
  /** A pin was clicked or tapped. */
  readonly onPick: (key: string) => void;
  /** The field's element, for watching whether it is on screen. */
  readonly ref?: (el: HTMLDivElement) => void;
}): JSX.Element => {
  let host: HTMLDivElement | undefined;
  const compact = createMedia(PHONE);
  const theme = useActiveTheme();
  const ground = createMemo(() => {
    theme();
    return themeColour(vars.color.snow);
  });
  const ramp = createMemo(() => {
    theme();
    return readEffortRamp();
  });
  const focus = useAtomValue(() => focusAtom);
  const lit = createMemo(() => highlight(focus()), null, { equals: sameHighlight });
  const figureHighlight = createMemo((): FigureHighlight | null => {
    const h = lit();
    const a = h === null ? undefined : props.order.find((x) => pinKey(x) === h.key);
    return h === null || a === undefined ? null : { muscle: a.muscle, side: a.side, focus: h.emphasis === Emphasis.Focus };
  });
  const [size, setSize] = createSignal({ width: 0, height: 0 });
  const [ready, setReady] = createSignal(false);
  const [failed, setFailed] = createSignal(false);
  // Stays empty if the 3D view fails, so no pins show.
  const [anchors, setAnchors] = createSignal<ReadonlyArray<MuscleAnchor>>([]);

  const measure = (): void => {
    const canvas = host?.querySelector('canvas');
    if (canvas !== null && canvas !== undefined) setSize({ width: canvas.clientWidth, height: canvas.clientHeight });
  };
  const resize = new ResizeObserver(measure);
  onMount(() => {
    if (host !== undefined) resize.observe(host);
  });
  onCleanup(() => resize.disconnect());

  const onReady = (): void => {
    const canvas = host?.querySelector('canvas');
    if (canvas !== null && canvas !== undefined) resize.observe(canvas);
    measure();
    setReady(true);
  };

  return (
    <div
      class={s.field}
      ref={(el) => {
        host = el;
        props.ref?.(el);
      }}
    >
      <Suspense
        fallback={
          <figure>
            <div class={s.pending} />
            <figcaption>
              <Caption />
            </figcaption>
          </figure>
        }
      >
        <Viewer
          movement={props.movement}
          muscles={props.muscles}
          skeleton={props.skeleton}
          gear={props.gear}
          intensity={props.intensity}
          drill={props.drill}
          ground={ground()}
          highlight={figureHighlight()}
          caption={<Caption />}
          onAnchors={setAnchors}
          onPick={(pick) => {
            const key = pick === null ? null : pickedKey(props.order, pick);
            if (key !== null) props.onPick(key);
          }}
          pins={props.pins}
          onReady={onReady}
          onError={() => setFailed(true)}
        />
      </Suspense>
      <Show when={!ready() && !failed()}>
        <p class={s.loading} role="status">
          Loading the 3D figure…
        </p>
      </Show>
      <Show when={props.pins && size().width > 0}>
        <Pins
          order={props.order}
          anchors={anchors()}
          size={{ ...size(), compact: compact() }}
          ramp={ramp()}
          intensity={props.intensity}
          muscleName={props.muscleName}
          highlight={lit()}
          onPick={props.onPick}
        />
      </Show>
    </div>
  );
};
