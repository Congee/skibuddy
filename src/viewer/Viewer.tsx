import { useAtomValue } from '@effect/atom-solid';
import { Show, createEffect, createSignal, onCleanup, onMount } from 'solid-js';
import type { JSX } from 'solid-js';
import { levelsAt } from '../content/activation';
import type { Movement } from '../content/schema';
import { turnTimeAtom } from '../state/playback';
import type { AnchorsListener } from './anchors';
import type { FigureKind, Viewer as SceneViewer } from './scene';

const params = new URLSearchParams(window.location.search);
// The capsule is the fallback when the anatomy model fails to load; ?figure=capsule forces it.
const FIGURE: FigureKind = params.get('figure') === 'capsule' ? 'capsule' : 'anatomy';
const FORCE_WEBGL = params.get('renderer') === 'webgl';
const SKELETON = params.get('skeleton') === '1';

/** Default error state: fills the figure area so the layout does not jump. */
export const ViewerError = (props: { readonly message: string }): JSX.Element => (
  <div
    role="alert"
    style={{
      position: 'absolute',
      inset: '0',
      display: 'grid',
      'place-content': 'center',
      gap: '8px',
      padding: '24px',
      'text-align': 'center',
      background: 'color-mix(in srgb, currentColor 6%, transparent)',
      'border-radius': 'inherit',
    }}
  >
    <strong>3D view unavailable</strong>
    <span style={{ opacity: '0.75' }}>{props.message}</span>
    <span style={{ opacity: '0.75' }}>The muscle list still shows every phase.</span>
  </div>
);

export const Viewer = (props: {
  readonly movement: Movement;
  readonly muscles: ReadonlyArray<string>;
  readonly onAnchors?: AnchorsListener;
  /** Fades the muscles to show the skeleton (anatomy figure only). */
  readonly skeleton?: boolean;
  /** CSS colour of the ground under the figure. */
  readonly ground?: string;
  /** Caption under the figure; the default names the outside ski. */
  readonly caption?: JSX.Element;
  readonly onReady?: () => void;
  readonly onError?: (message: string) => void;
  /** Replaces the built-in error state when the 3D view cannot start. */
  readonly fallback?: (message: string) => JSX.Element;
}): JSX.Element => {
  const t = useAtomValue(() => turnTimeAtom);
  const [error, setError] = createSignal<string | null>(null);
  const [shown, setShown] = createSignal<FigureKind | null>(null);
  let root: HTMLElement | undefined;
  let canvas: HTMLCanvasElement | undefined;
  let viewer: SceneViewer | undefined;
  let disposed = false;

  // Pins are relative to the viewer element, so add the canvas's offset in it.
  const onAnchors: AnchorsListener | undefined =
    props.onAnchors === undefined
      ? undefined
      : (anchors) => {
          const c = canvas?.getBoundingClientRect();
          const r = root?.getBoundingClientRect();
          const dx = c === undefined || r === undefined ? 0 : c.left - r.left;
          const dy = c === undefined || r === undefined ? 0 : c.top - r.top;
          props.onAnchors?.(anchors.map((a) => ({ ...a, x: a.x + dx, y: a.y + dy })));
        };

  onMount(() => {
    if (canvas === undefined) return;
    const target = canvas;
    // Three.js loads lazily so the panels render first.
    import('./scene')
      .then(({ createViewer }) =>
        createViewer(target, props.muscles, () => ({ t: t(), levels: levelsAt(props.movement, t()) }), {
          figure: FIGURE,
          forceWebGL: FORCE_WEBGL,
          ...(onAnchors === undefined ? {} : { onAnchors }),
        }),
      )
      .then(
        (v) => {
          if (disposed) {
            v.dispose();
            return;
          }
          viewer = v;
          v.setSkeleton(props.skeleton ?? SKELETON);
          if (props.ground !== undefined) v.setGround(props.ground);
          setShown(v.figure);
          props.onReady?.();
        },
        (e: unknown) => {
          const message = e instanceof Error ? e.message : String(e);
          setError(message);
          props.onError?.(message);
        },
      );
  });

  onCleanup(() => {
    disposed = true;
    viewer?.dispose();
  });

  createEffect(() => {
    const on = props.skeleton ?? SKELETON;
    if (shown() !== null) viewer?.setSkeleton(on);
  });

  createEffect(() => {
    const colour = props.ground;
    if (shown() !== null && colour !== undefined) viewer?.setGround(colour);
  });

  return (
    <figure class="viewer" ref={(el) => (root = el)} style={{ position: 'relative' }}>
      <canvas ref={(el) => (canvas = el)} aria-label="Skier figure with working muscles highlighted; drag to rotate" />
      <Show when={error()}>{(message) => props.fallback?.(message()) ?? <ViewerError message={message()} />}</Show>
      <figcaption class="muted">
        {shown() === 'capsule' ? 'Placeholder figure. ' : ''}
        {props.caption ?? "Outside ski = skier's right."}
      </figcaption>
    </figure>
  );
};
