import { useAtomValue } from '@effect/atom-solid';
import { Show, createSignal, onCleanup, onMount } from 'solid-js';
import type { JSX } from 'solid-js';
import { levelsAt } from '../content/activation';
import type { Movement } from '../content/schema';
import { turnTimeAtom } from '../state/playback';
import type { Viewer as SceneViewer } from './scene';

export const Viewer = (props: { readonly movement: Movement; readonly muscles: ReadonlyArray<string> }): JSX.Element => {
  const t = useAtomValue(() => turnTimeAtom);
  const [error, setError] = createSignal<string | null>(null);
  let canvas: HTMLCanvasElement | undefined;
  let viewer: SceneViewer | undefined;
  let disposed = false;

  onMount(() => {
    if (canvas === undefined) return;
    const target = canvas;
    // Three.js loads lazily so the panels render first.
    import('./scene')
      .then(({ createViewer }) => createViewer(target, props.muscles, () => ({ t: t(), levels: levelsAt(props.movement, t()) })))
      .then(
        (v) => {
          if (disposed) v.dispose();
          else viewer = v;
        },
        (e: unknown) => setError(e instanceof Error ? e.message : String(e)),
      );
  });

  onCleanup(() => {
    disposed = true;
    viewer?.dispose();
  });

  return (
    <figure class="viewer">
      <canvas ref={(el) => (canvas = el)} aria-label="Skier figure with working muscles highlighted; drag to rotate" />
      <Show when={error()}>{(message) => <figcaption role="alert">3D view unavailable: {message()}</figcaption>}</Show>
      <figcaption class="muted">Placeholder figure. Outside ski = skier's right.</figcaption>
    </figure>
  );
};
