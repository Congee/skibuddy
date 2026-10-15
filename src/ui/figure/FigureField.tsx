import { Show, Suspense, createMemo, createSignal, lazy, onCleanup, onMount } from 'solid-js';
import type { JSX } from 'solid-js';
import type { Activation, Movement } from '../../content/schema';
import type { MuscleAnchor } from '../../viewer/anchors';
import type { GearMode } from '../../viewer/gear-mode';
import { PHONE, createMedia } from '../media';
import { vars } from '../theme/theme.css';
import { readEffortRamp } from '../effort-ramp';
import * as s from './figure.css';
import { Pins } from './Pins';

// The board paints before the 3D code arrives.
const Viewer = lazy(() => import('../../viewer/Viewer').then((m) => ({ default: m.Viewer })));

/** Resolves a theme colour such as `var(--snow__x)` to its current value. */
const themeColour = (token: string): string => {
  const name = /var\((--[^),\s]+)/.exec(token)?.[1];
  return name === undefined ? '' : getComputedStyle(document.documentElement).getPropertyValue(name).trim();
};

export const Caption = (): JSX.Element => (
  <>
    Outside ski = skier's right. <a href="#credits">Credits</a>
  </>
);

export const FigureField = (props: {
  readonly movement: Movement;
  readonly muscles: ReadonlyArray<string>;
  /** The board's steady order. */
  readonly order: ReadonlyArray<Activation>;
  readonly pins: boolean;
  readonly skeleton: boolean;
  readonly gear: GearMode;
  readonly muscleName: (id: string) => string;
  /** The field's element, for watching whether it is on screen. */
  readonly ref?: (el: HTMLDivElement) => void;
}): JSX.Element => {
  let host: HTMLDivElement | undefined;
  const compact = createMedia(PHONE);
  const dark = createMedia('(prefers-color-scheme: dark)');
  const ground = createMemo(() => {
    dark();
    return themeColour(vars.color.snow);
  });
  const ramp = createMemo(() => {
    dark();
    return readEffortRamp();
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
          ground={ground()}
          caption={<Caption />}
          onAnchors={setAnchors}
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
          muscleName={props.muscleName}
        />
      </Show>
    </div>
  );
};
