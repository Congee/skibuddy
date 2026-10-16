import type { PoseDefinition } from '../pose-definition';

const DEG = Math.PI / 180;

/**
 * A still, square athletic stance on two flat skis: what a drill without its own pose shows.
 * Ankles, knees and hips flexed as in the stork transition, mass over mid-foot; no turn, no lift, no touch.
 */
export const NEUTRAL: PoseDefinition = {
  keys: [
    {
      t: 0,
      angulation: 0,
      hip: 0.5,
      pelvisList: 0,
      lumbarFlex: 11 * DEG,
      spineBend: 0,
      spineTwist: 0,
      counter: 0,
      dorsiflexion: 20 * DEG,
      insideDorsiflexion: 20 * DEG,
      eversion: 0,
      protraction: 6 * DEG,
      elevation: 0,
      insideTailLift: 0,
      comAhead: 0.02,
    },
  ],
  constraints: {
    hipAngulation: 0,
    femurRotation: 0,
    insideFemurShare: 0,
    hipByLoad: [[1, 55, 70]],
    insideKneeMax: 120 * DEG,
    tailLift: null,
    poleTouch: null,
    scapularRhythm: 0,
    stance: 0,
    poleTrim: 0,
    gains: {},
  },
};
