import { Side } from '../content/schema';
import { BodySide, SegmentKind } from './figure';
import type { Segment } from './figure';
import type { Vec3 } from './mat4';

export type TurnSide = typeof Side.Outside | typeof Side.Inside;

/** Outside = the figure's right side until turns alternate. */
export const turnSideOf = (side: typeof BodySide.Right | typeof BodySide.Left): TurnSide =>
  side === BodySide.Right ? Side.Outside : Side.Inside;

export interface MusclePart {
  readonly muscle: string;
  readonly side: TurnSide;
}

/**
 * Coarse placeholder map from a point on a segment (in the segment's frame) to
 * the muscle under it. Directions are taken from the shape's long axis.
 */
export const musclePartAt = (segment: Segment, point: Vec3): MusclePart | null => {
  const [cx, , cz] = segment.shape.center;
  const dx = point[0] - cx;
  const dz = point[2] - cz;
  const radial = Math.hypot(dx, dz) || 1;
  const nx = dx / radial;
  const nz = dz / radial;
  const bodySide = segment.side === BodySide.Center ? (point[0] < 0 ? BodySide.Right : BodySide.Left) : segment.side;
  const side = turnSideOf(bodySide);
  // Positive toward the body's midline.
  const medial = bodySide === BodySide.Right ? nx : -nx;
  const part = (muscle: string): MusclePart => ({ muscle, side });

  switch (segment.kind) {
    case SegmentKind.Pelvis: {
      const lateral = Math.abs(point[0]) / (segment.shape.type === 'box' ? segment.shape.size[0] / 2 : 1);
      if (lateral > 0.8 && point[1] > -0.04) return part('gluteus-medius');
      if (dz < -0.02) return part('gluteus-maximus');
      if (dz > 0.02 && lateral > 0.25) return part('hip-flexors');
      return null;
    }
    case SegmentKind.Trunk: {
      if (point[1] > 0.45) return null;
      if (nz < -0.5) return part('erector-spinae');
      if (Math.abs(nx) > 0.55) return part('obliques');
      return null;
    }
    case SegmentKind.Thigh: {
      // Proximal posterior thigh stands in for the rotators under the glutes.
      if (point[1] > -0.12 && nz < -0.3) return part('deep-hip-rotators');
      if (medial > 0.6) return part('adductors');
      return part(nz >= 0 ? 'quadriceps' : 'hamstrings');
    }
    case SegmentKind.Shin: {
      if (nz < -0.35) return part('calf');
      if (medial < -0.6) return part('peroneals');
      if (nz > 0.2) return part('tibialis-anterior');
      return null;
    }
    default:
      return null;
  }
};

export interface SlotTable {
  /** Number of slots including slot 0, which means "no muscle". */
  readonly size: number;
  readonly slotOf: (muscle: string, side: TurnSide) => number;
}

export const makeSlotTable = (muscles: ReadonlyArray<string>): SlotTable => {
  const slots = new Map<string, number>();
  for (const muscle of muscles) {
    for (const side of [Side.Outside, Side.Inside]) slots.set(`${side}:${muscle}`, slots.size + 1);
  }
  return {
    size: slots.size + 1,
    slotOf: (muscle, side) => slots.get(`${side}:${muscle}`) ?? 0,
  };
};

/** Writes each slot's 0..1 level into `out`; a "both" activation lights both sides. */
export const fillSlotLevels = (table: SlotTable, levels: ReadonlyArray<{ readonly muscle: string; readonly side: Side; readonly level: number }>, out: Array<number>): void => {
  out.fill(0);
  for (const { muscle, side, level } of levels) {
    const sides: ReadonlyArray<TurnSide> = side === Side.Both ? [Side.Outside, Side.Inside] : [side];
    for (const s of sides) {
      const slot = table.slotOf(muscle, s);
      if (slot > 0) out[slot] = Math.max(out[slot] ?? 0, level);
    }
  }
};
