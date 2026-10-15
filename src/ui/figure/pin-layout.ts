export const Column = { Left: 'left', Right: 'right' } as const;
export type Column = (typeof Column)[keyof typeof Column];

export interface PinInput {
  readonly key: string;
  /** Anchor point in px within the field. */
  readonly x: number;
  readonly y: number;
  /** Higher keeps its pin when space runs out. */
  readonly priority: number;
}

export interface PinBox {
  readonly width: number;
  readonly height: number;
  readonly labelWidth: number;
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
  readonly anchorX: number;
  readonly anchorY: number;
}

const stack = (pins: ReadonlyArray<PinInput>, column: Column, box: PinBox): ReadonlyArray<PlacedPin> => {
  const h = box.labelHeight;
  const sorted = pins.toSorted((a, b) => a.y - b.y);
  const tops = sorted.map((p) => p.y - h / 2);
  for (let i = 0; i < tops.length; i++) {
    const floor = i === 0 ? box.pad : (tops[i - 1] ?? 0) + h + box.gap;
    tops[i] = Math.max(tops[i] ?? 0, floor);
  }
  for (let i = tops.length - 1; i >= 0; i--) {
    const ceiling = i === tops.length - 1 ? box.height - box.pad - h : (tops[i + 1] ?? 0) - box.gap - h;
    tops[i] = Math.max(box.pad, Math.min(tops[i] ?? 0, ceiling));
  }
  const x = column === Column.Left ? box.pad : box.width - box.pad - box.labelWidth;
  return sorted.map((p, i) => ({ key: p.key, column, x, y: tops[i] ?? box.pad, anchorX: p.x, anchorY: p.y }));
};

/** Two label columns either side of the figure, stacked without overlap and kept near their anchors. */
export const layoutPins = (inputs: ReadonlyArray<PinInput>, box: PinBox): ReadonlyArray<PlacedPin> => {
  const capacity = Math.max(0, Math.floor((box.height - 2 * box.pad + box.gap) / (box.labelHeight + box.gap)));
  const kept = inputs.toSorted((a, b) => b.priority - a.priority).slice(0, Math.max(0, box.maxPins));
  const mid = box.width / 2;
  const left: Array<PinInput> = [];
  const right: Array<PinInput> = [];
  for (const pin of kept) {
    const preferred = pin.x < mid ? left : right;
    const other = preferred === left ? right : left;
    if (preferred.length < capacity) preferred.push(pin);
    else if (other.length < capacity) other.push(pin);
  }
  // Balance the columns, moving the pins nearest the middle first.
  const balance = (from: Array<PinInput>, to: Array<PinInput>): void => {
    while (from.length - to.length > 1 && to.length < capacity) {
      const nearest = from.reduce((best, p) => (Math.abs(p.x - mid) < Math.abs(best.x - mid) ? p : best));
      from.splice(from.indexOf(nearest), 1);
      to.push(nearest);
    }
  };
  balance(left, right);
  balance(right, left);
  return [...stack(left, Column.Left, box), ...stack(right, Column.Right, box)];
};
