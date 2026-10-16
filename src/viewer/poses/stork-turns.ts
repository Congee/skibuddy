import type { PoseDefinition } from '../pose-definition';

const DEG = Math.PI / 180;

/** Shoulder blades slightly forward and level through the turn (content: shoulder-girdle.protraction). */
const PROTRACTION = 6 * DEG;

/**
 * Stork turns at moderate intensity; the physics sets the tilt and the depth of each scaled field.
 * heinrich-2022 where measured (GS, scaled down for a slow drill); lemaster-2010, biomechanics.md 2.0 and D1 elsewhere.
 * The outside leg is most flexed in the transition, extends a little through initiation, holds through
 * shaping and flexes again through the finish (lemaster-2010 pp40-42, pritchard-taylor-2023 p27, iasi-2021 pp65-66).
 */
export const STORK_TURNS: PoseDefinition = {
  keys: [
    // Transition: skis flat, square, legs at their deepest, mass a little ahead of mid-foot as the feet are drawn back, ankles closing again (lemaster-2010 p79, pp85-86).
    {
      t: 0,
      angulation: 0,
      hip: 1,
      pelvisList: 0,
      lumbarFlex: 11 * DEG,
      spineBend: 0,
      spineTwist: 0,
      counter: 0,
      dorsiflexion: 19.5 * DEG,
      insideDorsiflexion: 17.8 * DEG,
      eversion: 0,
      protraction: PROTRACTION,
      elevation: 0,
      insideTailLift: 0,
      comAhead: 0.027,
    },
    // Initiation: the leg lengthens a little, ankles flexed, mass a little ahead (lemaster-2010 pp81-85, p182); edge lowest, building (F10).
    // The outside foot begins to evert in the boot (content: ankle.inversion, cross-raschner-2023 p14).
    {
      t: 1 / 6,
      angulation: 0.45,
      hip: 0.4,
      pelvisList: 10 * DEG,
      lumbarFlex: 11 * DEG,
      spineBend: 3 * DEG,
      spineTwist: 1.8 * DEG,
      counter: 5 * DEG,
      dorsiflexion: 21.5 * DEG,
      insideDorsiflexion: 17.8 * DEG,
      eversion: 1 * DEG,
      protraction: PROTRACTION,
      elevation: 0,
      insideTailLift: 6 * DEG,
      comAhead: 0.084,
    },
    // Shaping: legs most extended and quasi-isometric; DF held to the fall line, in heinrich-2022's 18-27 deg
    // (lemaster-2010 pp79, 85); angulation mostly from the hip (lemaster-2010 p74); pelvis tipped outward of the
    // balance axis over the outside femoral head (lemaster-2010 p70); counter 5-10 deg (2.0). Pressure on the
    // tripod ahead of the arch, eversion building (lemaster-2010 pp123-124, 139).
    {
      t: 1 / 2,
      angulation: 0.85,
      hip: 0,
      pelvisList: 13 * DEG,
      lumbarFlex: 11.5 * DEG,
      spineBend: 6 * DEG,
      spineTwist: 3 * DEG,
      counter: 8 * DEG,
      dorsiflexion: 21.5 * DEG,
      insideDorsiflexion: 17.8 * DEG,
      eversion: 1.9 * DEG,
      protraction: PROTRACTION,
      elevation: 0,
      insideTailLift: 6.8 * DEG,
      comAhead: 0.086,
    },
    // Late shaping: the edge and the eversion peak (lemaster-2010 p128), then release through the finish; the ankle starts to open.
    {
      t: 0.65,
      angulation: 1,
      hip: 0.06,
      pelvisList: 14 * DEG,
      lumbarFlex: 11.5 * DEG,
      spineBend: 6 * DEG,
      spineTwist: 3 * DEG,
      counter: 7 * DEG,
      dorsiflexion: 20.8 * DEG,
      insideDorsiflexion: 18.2 * DEG,
      eversion: 2.2 * DEG,
      protraction: PROTRACTION,
      elevation: 0,
      insideTailLift: 6.2 * DEG,
      comAhead: 0.079,
    },
    // Finish: the leg flexes, absorbing the late load; ankles opening, feet slid forward, pressure toward
    // the heel (lemaster-2010 pp182-183, falda-buscaiot-2017); chest and pelvis square up to the skis as they release.
    // The eversion holds longer than the hip angulation, then lets the edge go (content: ankle.inversion finish).
    // The lifted ankle stays closed, ready to become the new outside (lemaster-2010 pp81, 86).
    {
      t: 5 / 6,
      angulation: 0.3,
      hip: 0.5,
      pelvisList: 14 * DEG,
      lumbarFlex: 11 * DEG,
      spineBend: 5 * DEG,
      spineTwist: 1.5 * DEG,
      counter: 3 * DEG,
      dorsiflexion: 18.8 * DEG,
      insideDorsiflexion: 19 * DEG,
      eversion: 1.2 * DEG,
      protraction: PROTRACTION,
      elevation: 0,
      insideTailLift: 5 * DEG,
      comAhead: 0.054,
    },
  ],
  constraints: {
    // Edge minus tilt comes to about 10 deg (lind-sanders-2004 low-speed angulation).
    hipAngulation: 4.5 * DEG,
    femurRotation: 4.5 * DEG,
    // More would evert the lifted foot.
    insideFemurShare: 0.3,
    // Its edge minus tilt is read against the unrolled body; on the balance axis it would need retuning.
    balanced: false,
    // Inference within heinrich-2022's GS 50-81 deg, deep enough to keep the chest over the knee; the knee is whatever balances the centre of mass.
    hipByLoad: [
      [1.06, 54, 68],
      [1.12, 61, 76],
      [1.21, 68, 80],
    ],
    // Stork goes past heinrich-2022's weighted 81-114 deg, but a free knee stops about here.
    insideKneeMax: 120 * DEG,
    // Up through mid-initiation, once the body has tilted in off the inside ski's lateral support (about 0.3 s,
    // lind-sanders-2004), and down through mid-finish (psia-c-stork-turns).
    tailLift: { up: 1 / 6, down: 5 / 6, ramp: 0.06 },
    // The transition, just before the tail lifts (psia-c-stork-turns, lemaster-2010 p39).
    poleTouch: { t: 1 / 24, hold: 0.02, swing: 0.11 },
    scapularRhythm: 0.3,
    // Wider than ARM_ABDUCTION: the deeper fold brings the hands in over the skis.
    armAbduction: 0.7,
    stance: 0,
    kneesIn: 0,
    poleTrim: 0,
    // Inference: deeper, more dynamic turns flex, lift and counter a little more. Near constant
    // low back: a harder turn folds more at the hips, not the low back.
    gains: {
      angulation: 0.12,
      eversion: 0.12,
      dorsiflexion: 0.06,
      insideTailLift: 0.04,
      pelvisList: 0.5,
      counter: 0.1,
      lumbarFlex: 0.1,
      spineBend: 0.1,
      spineTwist: 0.1,
    },
  },
};
