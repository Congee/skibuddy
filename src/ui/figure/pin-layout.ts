export const Column = { Left: 'left', Right: 'right' } as const;
export type Column = (typeof Column)[keyof typeof Column];

export interface PinInput {
  readonly key: string;
  /** Anchor point in px within the field. */
  readonly x: number;
  readonly y: number;
  /** Higher keeps its pin when space runs out. */
  readonly priority: number;
  /** Measured label height in px; the box's estimate until it renders. */
  readonly height?: number;
}

export interface PinBox {
  readonly width: number;
  readonly height: number;
  readonly labelWidth: number;
  /** Estimated label height for labels not yet measured. */
  readonly labelHeight: number;
  readonly gap: number;
  readonly pad: number;
  readonly maxPins: number;
}

export interface PlacedPin {
  readonly key: string;
  readonly column: Column;
  /** Label top-left in px. */
  readonly x: number;
  readonly y: number;
  readonly height: number;
  readonly anchorX: number;
  readonly anchorY: number;
}

const heightOf = (pin: PinInput, box: PinBox): number => pin.height ?? box.labelHeight;

/** Whether one more label fits in a column of the box. */
const fits = (column: ReadonlyArray<PinInput>, pin: PinInput, box: PinBox): boolean => {
  const used = column.reduce((sum, p) => sum + heightOf(p, box) + box.gap, 0);
  return used + heightOf(pin, box) <= box.height - 2 * box.pad;
};

const stack = (pins: ReadonlyArray<PinInput>, column: Column, box: PinBox): ReadonlyArray<PlacedPin> => {
  const sorted = pins.toSorted((a, b) => a.y - b.y);
  const hs = sorted.map((p) => heightOf(p, box));
  const h = (i: number): number => hs[i] ?? box.labelHeight;
  const tops = sorted.map((p, i) => p.y - h(i) / 2);
  for (let i = 0; i < tops.length; i++) {
    const floor = i === 0 ? box.pad : (tops[i - 1] ?? 0) + h(i - 1) + box.gap;
    tops[i] = Math.max(tops[i] ?? 0, floor);
  }
  for (let i = tops.length - 1; i >= 0; i--) {
    const ceiling = i === tops.length - 1 ? box.height - box.pad - h(i) : (tops[i + 1] ?? 0) - box.gap - h(i);
    tops[i] = Math.max(box.pad, Math.min(tops[i] ?? 0, ceiling));
  }
  const x = column === Column.Left ? box.pad : box.width - box.pad - box.labelWidth;
  return sorted.map((p, i) => ({ key: p.key, column, x, y: tops[i] ?? box.pad, height: h(i), anchorX: p.x, anchorY: p.y }));
};

/** Two label columns either side of the figure, stacked without overlap and kept near their anchors. */
export const layoutPins = (inputs: ReadonlyArray<PinInput>, box: PinBox): ReadonlyArray<PlacedPin> => {
  const kept = inputs.toSorted((a, b) => b.priority - a.priority).slice(0, Math.max(0, box.maxPins));
  const mid = box.width / 2;
  const left: Array<PinInput> = [];
  const right: Array<PinInput> = [];
  for (const pin of kept) {
    const preferred = pin.x < mid ? left : right;
    const other = preferred === left ? right : left;
    if (fits(preferred, pin, box)) preferred.push(pin);
    else if (fits(other, pin, box)) other.push(pin);
  }
  // Balance the columns, moving the pins nearest the middle first.
  const balance = (from: Array<PinInput>, to: Array<PinInput>): void => {
    while (from.length - to.length > 1) {
      const nearest = from.reduce((best, p) => (Math.abs(p.x - mid) < Math.abs(best.x - mid) ? p : best));
      if (!fits(to, nearest, box)) return;
      from.splice(from.indexOf(nearest), 1);
      to.push(nearest);
    }
  };
  balance(left, right);
  balance(right, left);
  return [...stack(left, Column.Left, box), ...stack(right, Column.Right, box)];
};
