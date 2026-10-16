import { useAtomValue } from '@effect/atom-solid';
import { Show, createEffect, createMemo, createSignal, onCleanup, onMount } from 'solid-js';
import type { JSX } from 'solid-js';
import type { MuscleLevel } from '../content/activation';
import { MAX_EFFORT, effortAt } from '../content/effort';
import { Intensity } from '../content/schema';
import type { Movement } from '../content/schema';
import { playingAtom, turnTimeAtom } from '../state/playback';
import type { AnchorsListener } from './anchors';
import { GearMode } from './gear-mode';
import type { FigureHighlight } from './highlight';
import type { ViewLock } from './hip-lock';
import type { MusclePick } from './pick';
import { hasPose } from './poses';
import type { FigureKind, Viewer as SceneViewer } from './scene';

const params = new URLSearchParams(window.location.search);
// The capsule is the fallback when the anatomy model fails to load; ?figure=capsule forces it.
const FIGURE: FigureKind = params.get('figure') === 'capsule' ? 'capsule' : 'anatomy';
const FORCE_WEBGL = params.get('renderer') === 'webgl';

export type { MusclePick } from './pick';

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
  /** Pins show, so anchors are worth projecting. */
  readonly pins?: boolean;
  /** Fades the muscles to show the skeleton (anatomy figure only). */
  readonly skeleton?: boolean;
  /** Boots and poles; translucent by default. */
  readonly gear?: GearMode;
  /** How hard the turn is skied; moderate by default. */
  readonly intensity?: Intensity;
  /** The motion shown: a drill or a kind's regular turn, by pose id; one without a pose stands in a neutral stance. */
  readonly drill: string;
  /** CSS colour of the ground under the figure. */
  readonly ground?: string;
  /** The muscle the board singles out, if any. */
  readonly highlight?: FigureHighlight | null;
  /** Caption under the figure; the default names the outside ski. */
  readonly caption?: JSX.Element;
  /** A tap on the figure: the content muscle and side under it, or null off any muscle. */
  readonly onPick?: (pick: MusclePick | null) => void;
  /** Pinch, wheel and two-finger pan zoom; on by default. */
  readonly zoom?: boolean;
  /** Skis, hips or slope held still on screen; skis by default. */
  readonly viewLock?: ViewLock;
  /** CSS px of the figure's bottom covered by a panel; the figure is framed in the rest. */
  readonly inset?: { readonly bottom: number };
  /** Each change eases the camera back to the whole figure. */
  readonly resetView?: number;
  readonly onReady?: () => void;
  readonly onError?: (message: string) => void;
  /** Replaces the built-in error state when the 3D view cannot start. */
  readonly fallback?: (message: string) => JSX.Element;
}): JSX.Element => {
  const t = useAtomValue(() => turnTimeAtom);
  const playing = useAtomValue(() => playingAtom);
  const [error, setError] = createSignal<string | null>(null);
  const [shown, setShown] = createSignal<FigureKind | null>(null);
  let root: HTMLElement | undefined;
  let canvas: HTMLCanvasElement | undefined;
  let viewer: SceneViewer | undefined;
  let disposed = false;

  // Pins are relative to the viewer element, so add the canvas's offset in it, measured on resize, not per frame.
  let dx = 0;
  let dy = 0;
  const offset = new ResizeObserver(() => {
    const c = canvas?.getBoundingClientRect();
    const r = root?.getBoundingClientRect();
    dx = c === undefined || r === undefined ? 0 : c.left - r.left;
    dy = c === undefined || r === undefined ? 0 : c.top - r.top;
  });
  const onAnchors: AnchorsListener | undefined =
    props.onAnchors === undefined
      ? undefined
      : (anchors) => props.onAnchors?.(dx === 0 && dy === 0 ? anchors : anchors.map((a) => ({ ...a, x: a.x + dx, y: a.y + dy })));

  // The figure's glow follows the board's continuous effort scale.
  const levels = createMemo(() => {
    const { activations } = props.movement;
    const setting = props.intensity ?? Intensity.Moderate;
    return (at: number): ReadonlyArray<MuscleLevel> =>
      activations.map((a) => ({ muscle: a.muscle, side: a.side, level: effortAt(a.intensity, at, setting) / MAX_EFFORT }));
  });

  onMount(() => {
    if (canvas === undefined) return;
    const target = canvas;
    offset.observe(target);
    if (root !== undefined) offset.observe(root);
    // Three.js loads lazily so the panels render first.
    import('./scene')
      .then(({ createViewer }) =>
        createViewer(target, props.muscles, {
          figure: FIGURE,
          forceWebGL: FORCE_WEBGL,
          levels: levels(),
          drill: props.drill,
          zoom: props.zoom ?? true,
          ...(props.viewLock === undefined ? {} : { viewLock: props.viewLock }),
          onPick: (pick) => props.onPick?.(pick),
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
          // The effects below hand the viewer its inputs once it shows.
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
    offset.disconnect();
    viewer?.dispose();
  });

  // Each change asks the viewer for one frame; nothing draws otherwise.
  // Another drill keeps the canvas and swaps only the levels.
  createEffect(() => {
    const next = levels();
    if (shown() !== null) viewer?.setLevels(next);
  });

  createEffect(() => {
    const at = t();
    if (shown() !== null) viewer?.setTime(at);
  });

  createEffect(() => {
    const on = playing();
    if (shown() !== null) viewer?.setPlaying(on);
  });

  createEffect(() => {
    const on = props.pins ?? true;
    if (shown() !== null) viewer?.setPins(on);
  });

  createEffect(() => {
    const on = props.skeleton ?? false;
    if (shown() !== null) viewer?.setSkeleton(on);
  });

  createEffect(() => {
    const mode = props.gear ?? GearMode.Translucent;
    if (shown() !== null) viewer?.setGear(mode);
  });

  createEffect(() => {
    const i = props.intensity ?? Intensity.Moderate;
    const drill = props.drill;
    if (shown() !== null) viewer?.setMotion(drill, i);
  });

  createEffect(() => {
    const h = props.highlight ?? null;
    if (shown() !== null) viewer?.setHighlight(h);
  });

  createEffect(() => {
    const on = props.zoom ?? true;
    if (shown() !== null) viewer?.setZoom(on);
  });

  createEffect(() => {
    const lock = props.viewLock;
    if (shown() !== null && lock !== undefined) viewer?.setViewLock(lock);
  });

  createEffect(() => {
    const bottom = props.inset?.bottom ?? 0;
    if (shown() !== null) viewer?.setInset(bottom);
  });

  let resetAt = props.resetView;
  createEffect(() => {
    const next = props.resetView;
    if (next === resetAt || shown() === null) return;
    resetAt = next;
    viewer?.resetView();
  });

  createEffect(() => {
    const colour = props.ground;
    if (shown() !== null && colour !== undefined) viewer?.setGround(colour);
  });

  return (
    <figure class="viewer" ref={(el) => (root = el)} style={{ position: 'relative' }}>
      <canvas
        ref={(el) => (canvas = el)}
        style={{ 'touch-action': 'none' }}
        aria-label={`Skier figure with working muscles highlighted; drag to rotate, tap a muscle to select it${(props.zoom ?? true) ? ', pinch or scroll to zoom, double-tap away from the muscles to reset' : ''}`}
      />
      <Show when={error()}>{(message) => props.fallback?.(message()) ?? <ViewerError message={message()} />}</Show>
      <figcaption class="muted">
        {shown() === 'capsule' ? 'Placeholder figure. ' : ''}
        {props.caption ?? "Outside ski = skier's right."}
        <Show when={!hasPose(props.drill)}>
          <span class="viewer-note"> This drill's motion isn't modelled yet; the figure holds a neutral stance.</span>
        </Show>
      </figcaption>
    </figure>
  );
};
