import type { TurnSide } from './slots';

/** Where a muscle's name pin points on screen, in CSS px relative to the viewer element. */
export interface MuscleAnchor {
  readonly muscle: string;
  readonly side: TurnSide;
  readonly x: number;
  readonly y: number;
  /** False when the point is behind the figure or off screen. */
  readonly visible: boolean;
}

export type AnchorsListener = (anchors: ReadonlyArray<MuscleAnchor>) => void;
