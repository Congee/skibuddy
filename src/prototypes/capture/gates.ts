import { DATA } from './data';

export interface GateSummary {
  readonly evaluated: number;
  readonly failed: number;
  readonly median: number;
  readonly value: number;
  readonly unit: string;
  readonly reason: string;
}

export interface GateResult {
  readonly value: number;
  readonly threshold: number;
  readonly pass: boolean;
  // Shape varies per gate.
  readonly detail?: Readonly<Record<string, unknown>> | ReadonlyArray<unknown>;
}

export interface GateFrame {
  readonly i: number;
  readonly pass: boolean;
  readonly failed: ReadonlyArray<string>;
  readonly gates: Readonly<Record<string, GateResult | undefined>>;
}

export interface GateFile {
  readonly pass: boolean;
  readonly failedFrames: ReadonlyArray<number>;
  readonly summary: Readonly<Record<string, GateSummary>>;
  readonly frames: ReadonlyArray<GateFrame>;
}

export type P2 = readonly [number, number];
export interface Line2 {
  readonly tip: P2;
  readonly tail: P2;
}
export interface SkiFrame {
  readonly skis: Readonly<Record<'L' | 'R', (Line2 & { readonly conf?: number }) | null>>;
}

export const loadGates = async (file: string): Promise<GateFile> => {
  const r = await fetch(`${DATA}${encodeURIComponent(file)}`);
  if (!r.ok) throw new Error(`${file}: ${r.status}`);
  return (await r.json()) as GateFile;
};

export const loadSkis2d = async (clip: string): Promise<ReadonlyArray<SkiFrame> | null> => {
  const r = await fetch(`${DATA}${encodeURIComponent(`${clip}_skis2d.json`)}`);
  if (!r.ok) return null;
  return ((await r.json()) as { frames: ReadonlyArray<SkiFrame> }).frames;
};

/** `<clip>_<stage>_gates.json` -> its clip and stage. */
export const gateParts = (file: string): { readonly clip: string; readonly stage: string } => {
  const m = /^(.+)_([a-z0-9-]+)_gates\.json$/.exec(file);
  return { clip: m?.[1] ?? file, stage: m?.[2] ?? file };
};

/** Figure skis in image pixels, from the skiHeading gate. */
export const figureSkis = (g: GateFrame | undefined): Partial<Record<'L' | 'R', Line2>> => {
  const d = g?.gates['skiHeading']?.detail as { figure?: Partial<Record<'L' | 'R', Line2>> } | undefined;
  return d?.figure ?? {};
};

export const jointErrors = (g: GateFrame | undefined): { readonly torsoPx: number; readonly perJoint: Readonly<Record<string, number>> } | null => {
  const d = g?.gates['joints2d']?.detail as { torsoPx?: number; perJoint?: Record<string, number> } | undefined;
  return d?.perJoint === undefined ? null : { torsoPx: d.torsoPx ?? 0, perJoint: d.perJoint };
};
