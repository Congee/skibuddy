import { Show, createSignal, onCleanup, onMount } from 'solid-js';
import type { JSX } from 'solid-js';
import type { Movement } from '../../content/schema';
import type { MuscleAnchor } from '../../viewer/anchors';
import { Viewer } from '../../viewer/Viewer';
import type { RankedSlat } from '../board/rank';
import { PHONE, createMedia } from '../media';
import * as s from './figure.css';
import { Pins } from './Pins';

export const FigureField = (props: {
  readonly movement: Movement;
  readonly muscles: ReadonlyArray<string>;
  readonly ranked: ReadonlyArray<RankedSlat>;
  readonly pins: boolean;
  readonly muscleName: (id: string) => string;
}): JSX.Element => {
  let host: HTMLDivElement | undefined;
  const compact = createMedia(PHONE);
  const [size, setSize] = createSignal({ width: 0, height: 0 });
  // Stays empty if the 3D view fails, so no pins show.
  const [anchors, setAnchors] = createSignal<ReadonlyArray<MuscleAnchor>>([]);

  onMount(() => {
    if (host === undefined) return;
    const root = host;
    const measure = (): void => {
      const canvas = root.querySelector('canvas');
      if (canvas !== null) setSize({ width: canvas.clientWidth, height: canvas.clientHeight });
    };
    const resize = new ResizeObserver(measure);
    resize.observe(root);
    measure();
    onCleanup(() => resize.disconnect());
  });

  return (
    <div class={s.field} ref={(el) => (host = el)}>
      <Viewer movement={props.movement} muscles={props.muscles} onAnchors={setAnchors} />
      <Show when={props.pins && size().width > 0}>
        <Pins
          ranked={props.ranked}
          anchors={anchors()}
          size={{ ...size(), compact: compact() }}
          muscleName={props.muscleName}
        />
      </Show>
    </div>
  );
};
