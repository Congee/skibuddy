import { For, Show, createMemo, createSignal, onCleanup } from 'solid-js';
import type { JSX } from 'solid-js';
import { Side } from '../../content/schema';
import type { MuscleAnchor } from '../../viewer/anchors';
import { Stamp, Tag } from '../board/marks';
import type { RankedSlat } from '../board/rank';
import * as s from './figure.css';
import { Column, layoutPins } from './pin-layout';
import type { PinBox, PlacedPin } from './pin-layout';
import { pinInputs, slatKey } from './pin-inputs';

export interface PinSize {
  readonly width: number;
  readonly height: number;
  readonly compact: boolean;
}

// Label heights are estimates until each pin is measured.
export const boxFor = (size: PinSize): PinBox =>
  size.compact
    ? { width: size.width, height: size.height, labelWidth: Math.round(Math.min(size.width * 0.36, 150)), labelHeight: 58, gap: 6, pad: 6, maxPins: 4 }
    : { width: size.width, height: size.height, labelWidth: Math.round(Math.min(216, Math.max(150, size.width * 0.3))), labelHeight: 50, gap: 10, pad: 16, maxPins: 7 };

const EMPTY: PlacedPin = { key: '', column: Column.Left, x: 0, y: 0, height: 0, anchorX: 0, anchorY: 0 };

/** Muscle-name pins over the figure; a visual copy of the board, hidden from assistive tech. */
export const Pins = (props: {
  readonly ranked: ReadonlyArray<RankedSlat>;
  readonly anchors: ReadonlyArray<MuscleAnchor>;
  readonly size: PinSize;
  readonly muscleName: (id: string) => string;
}): JSX.Element => {
  const box = createMemo(() => boxFor(props.size));
  const bySlat = createMemo(() => new Map(props.ranked.map((r) => [slatKey(r), r])));
  const [heights, setHeights] = createSignal<ReadonlyMap<string, number>>(new Map());
  const measure = new ResizeObserver((entries) => {
    const next = new Map(heights());
    for (const e of entries) {
      const key = (e.target as HTMLElement).dataset['key'];
      const h = e.borderBoxSize[0]?.blockSize;
      if (key !== undefined && h !== undefined && h > 0) next.set(key, h);
    }
    setHeights(next);
  });
  onCleanup(() => measure.disconnect());
  const placed = createMemo(
    () => new Map(layoutPins(pinInputs(props.ranked, props.anchors, heights()), box()).map((p) => [p.key, p])),
  );
  // Iterate stable keys so pins move instead of remounting.
  const keys = createMemo(() => [...placed().keys()]);
  return (
    <div class={s.overlay} style={{ width: `${props.size.width}px`, height: `${props.size.height}px` }} aria-hidden="true">
      <svg class={s.leaders}>
        <For each={keys()}>
          {(key) => {
            const p = (): PlacedPin => placed().get(key) ?? EMPTY;
            const x = (): number => (p().column === Column.Left ? p().x + box().labelWidth : p().x);
            const y = (): number => p().y + p().height / 2;
            const d = (): string => `M${x()} ${y()} L${p().anchorX} ${p().anchorY}`;
            return (
              <>
                <path class={s.leaderUnder} d={d()} />
                <path class={s.leaderLine} d={d()} />
                <circle class={s.leaderDot} cx={p().anchorX} cy={p().anchorY} r="4" />
              </>
            );
          }}
        </For>
      </svg>
      <For each={keys()}>
        {(key) => (
          <Show when={bySlat().get(key)}>
            {(slat) => (
              <div
                class={s.pin}
                data-key={key}
                ref={(el) => {
                  measure.observe(el);
                  onCleanup(() => measure.unobserve(el));
                }}
                style={{
                  width: `${box().labelWidth}px`,
                  transform: `translate(${placed().get(key)?.x ?? 0}px, ${placed().get(key)?.y ?? 0}px)`,
                }}
              >
                <Tag level={slat().level} size="mini" />
                <span class={s.pinBody}>
                  <span class={s.pinName}>{props.muscleName(slat().activation.muscle)}</span>
                  <span class={s.pinMeta}>
                    <Stamp confidence={slat().activation.confidence} tone="pin" />
                    <Show when={slat().activation.side === Side.Inside}>
                      <span class={s.pinSide}>inside</span>
                    </Show>
                  </span>
                </span>
              </div>
            )}
          </Show>
        )}
      </For>
    </div>
  );
};
