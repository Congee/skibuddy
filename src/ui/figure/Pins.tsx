import { useAtomValue } from '@effect/atom-solid';
import { For, Show, createEffect, createMemo, createSignal, onCleanup, onMount, untrack } from 'solid-js';
import type { JSX } from 'solid-js';
import { effortAt, effortColour, effortWord } from '../../content/effort';
import type { EffortRamp } from '../../content/effort';
import { Side } from '../../content/schema';
import type { Activation } from '../../content/schema';
import { playingAtom, turnTimeAtom } from '../../state/playback';
import type { MuscleAnchor } from '../../viewer/anchors';
import { Stamp } from '../board/marks';
import * as s from './figure.css';
import { Column, layoutPins } from './pin-layout';
import type { PinBox, PlacedPin } from './pin-layout';
import { pinInputs, pinKey } from './pin-inputs';

interface PinSize {
  readonly width: number;
  readonly height: number;
  readonly compact: boolean;
}

// Label heights are estimates until each pin is measured.
const boxFor = (size: PinSize): PinBox =>
  size.compact
    ? { width: size.width, height: size.height, labelWidth: Math.round(Math.min(size.width * 0.36, 150)), labelHeight: 58, gap: 6, pad: 6, maxPins: 4 }
    : { width: size.width, height: size.height, labelWidth: Math.round(Math.min(216, Math.max(150, size.width * 0.3))), labelHeight: 50, gap: 10, pad: 16, maxPins: 7 };

interface LivePin {
  readonly activation: Activation;
  readonly swatch: HTMLElement;
  readonly word: HTMLElement;
}

const EMPTY: PlacedPin = { key: '', column: Column.Left, x: 0, y: 0, height: 0, anchorX: 0, anchorY: 0 };

/** Muscle-name pins over the figure; a visual copy of the board, hidden from assistive tech. */
export const Pins = (props: {
  /** The board's steady order. */
  readonly order: ReadonlyArray<Activation>;
  readonly anchors: ReadonlyArray<MuscleAnchor>;
  readonly size: PinSize;
  readonly ramp: EffortRamp;
  readonly muscleName: (id: string) => string;
}): JSX.Element => {
  const t = useAtomValue(() => turnTimeAtom);
  const playing = useAtomValue(() => playingAtom);
  const box = createMemo(() => boxFor(props.size));
  const byKey = createMemo(() => new Map(props.order.map((a) => [pinKey(a), a])));
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
    () => new Map(layoutPins(pinInputs(props.order, props.anchors, heights()), box()).map((p) => [p.key, p])),
  );

  // Effort swatches and words follow the playhead by direct writes, so a frame of play re-renders nothing.
  const live = new Set<LivePin>();
  const paint = (now: number, ramp: EffortRamp, pin: LivePin): void => {
    const v = effortAt(pin.activation.intensity, now);
    pin.swatch.style.background = effortColour(v, ramp);
    const word = effortWord(v);
    if (pin.word.textContent !== word) pin.word.textContent = word;
  };
  createEffect(() => {
    const now = t();
    const ramp = props.ramp;
    for (const pin of live) paint(now, ramp, pin);
  });
  // Iterate stable keys so pins move instead of remounting.
  const keys = createMemo(() => [...placed().keys()]);
  return (
    <div class={s.overlay} data-playing={playing() ? '' : undefined} style={{ width: `${props.size.width}px`, height: `${props.size.height}px` }} aria-hidden="true">
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
          <Show when={byKey().get(key)}>
            {(activation) => {
              let swatch: HTMLElement | undefined;
              let word: HTMLElement | undefined;
              onMount(() => {
                if (swatch === undefined || word === undefined) return;
                const pin: LivePin = { activation: activation(), swatch, word };
                live.add(pin);
                paint(untrack(t), untrack(() => props.ramp), pin);
                onCleanup(() => live.delete(pin));
              });
              return (
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
                  <span class={s.pinSwatch} ref={(el) => (swatch = el)} />
                  <span class={s.pinBody}>
                    <span class={s.pinName}>{props.muscleName(activation().muscle)}</span>
                    <span class={s.pinWord} ref={(el) => (word = el)} />
                    <span class={s.pinMeta}>
                      <Stamp confidence={activation().confidence} tone="pin" />
                      <Show when={activation().side === Side.Inside}>
                        <span class={s.pinSide}>inside</span>
                      </Show>
                    </span>
                  </span>
                </div>
              );
            }}
          </Show>
        )}
      </For>
    </div>
  );
};
