import type { Intensity } from '../content/schema';

/** A round turn at constant speed: speed, radius of the centre of mass's path, slope. Content's `Scenario` fits it. */
export interface TurnScenario {
  readonly speedMps: number;
  readonly radiusM: number;
  readonly slopeDeg: number;
}

export const G = 9.81;

/** A drill's scenario per setting; the drill's content is the only source. */
export type TurnScenarios = Readonly<Record<Intensity, TurnScenario>>;

/** Any drill's scenario: no radius means it is not a round turn (steps, stops, straight runs). */
export interface DrillScenario {
  readonly speedMps: number;
  readonly slopeDeg: number;
  readonly radiusM?: number;
}

/** Structural twin of content's `isTurnScenario`, so the physics needs nothing from the content schema. */
export const isTurn = (s: DrillScenario): s is TurnScenario => typeof s.radiusM === 'number' && s.radiusM > 0;

export interface TurnForces {
  /** Snow force over body weight. */
  readonly load: number;
  /** Tilt of the resultant, and of the balanced body, from the slope normal, radians. */
  readonly tilt: number;
}

/**
 * Lind & Sanders eq 4.9 at heading `beta`, radians: 0 across the hill at the top of the
 * turn, π/2 down the fall line, π across again at the finish. Gravity opposes the turn
 * above the fall line and adds below it (lind-sanders-2004).
 */
export const forcesAt = (s: TurnScenario, beta: number): TurnForces => {
  const alpha = (s.slopeDeg * Math.PI) / 180;
  const f = s.speedMps ** 2 / (G * s.radiusM) - Math.sin(alpha) * Math.cos(beta);
  return { load: Math.hypot(f, Math.cos(alpha)), tilt: Math.atan2(f, Math.cos(alpha)) };
};

/** Turn time of each phase's key pose; the transition is at 0. */
export const PHASE_T = { transition: 0, initiation: 1 / 6, shaping: 1 / 2, finish: 5 / 6 } as const;

const wrap = (t: number): number => ((t % 1) + 1) % 1;

/**
 * Heading at the finish key, below the fall line. The radius opens through completion, so the load
 * peaks here rather than across the hill (falda-buscaiot-2017, zorko-2015, lind-sanders-2004 Table 6.1);
 * the transition covers the rest of the heading.
 */
export const FINISH_HEADING = (3 * Math.PI) / 4;

/** Heading through the arc: initiation at the top (0), shaping in the fall line, finish below it; null in the transition. */
export const headingAt = (t: number): number | null => {
  const u = wrap(t);
  // Wrapping costs an ulp, so the phase keys land a hair off.
  if (u < PHASE_T.initiation - 1e-12 || u > PHASE_T.finish + 1e-12) return null;
  const x = Math.min(1, Math.max(0, (u - PHASE_T.initiation) / (PHASE_T.finish - PHASE_T.initiation)));
  // Smooth and monotone, with the shaping key on the fall line.
  return FINISH_HEADING * (x + (2 / 3) * x * (1 - x));
};

export const phaseForces = (s: TurnScenario): { readonly initiation: TurnForces; readonly shaping: TurnForces; readonly finish: TurnForces } => ({
  initiation: forcesAt(s, 0),
  shaping: forcesAt(s, Math.PI / 2),
  finish: forcesAt(s, FINISH_HEADING),
});

const smooth = (u: number): number => u * u * (3 - 2 * u);

/**
 * Forces at turn time `t`. Through the transition the edges change: tilt eases to 0 and
 * the load to the slope's normal share of weight, so both peak at the finish key.
 */
export const turnForcesAt = (s: TurnScenario, t: number): TurnForces => {
  const beta = headingAt(t);
  if (beta !== null) return forcesAt(s, beta);
  const u = wrap(t);
  const flat: TurnForces = { load: Math.cos((s.slopeDeg * Math.PI) / 180), tilt: 0 };
  // Finish to transition, or transition to initiation.
  const [from, w] = u > PHASE_T.finish ? [forcesAt(s, FINISH_HEADING), smooth((1 - u) / (1 - PHASE_T.finish))] : [forcesAt(s, 0), smooth(u / PHASE_T.initiation)];
  return { load: flat.load + (from.load - flat.load) * w, tilt: from.tilt * w };
};

/** How a drill shares the load between the feet. */
export interface TurnDrill {
  /** Outside foot's share with both skis on the snow: 0.6–0.75 (heinrich-2022, falda-buscaiot-2017). */
  readonly outsideShare: number;
  /** The inside ski leaves the snow, as in a stork turn. */
  readonly liftsInside: boolean;
}

export const STORK_DRILL: TurnDrill = { outsideShare: 0.65, liftsInside: true };

/** Outside foot's share given how far the inside ski is lifted (0..1); all of it once lifted. */
export const outsideShare = (drill: TurnDrill, lifted: number): number =>
  drill.liftsInside ? drill.outsideShare + (1 - drill.outsideShare) * Math.min(1, Math.max(0, lifted)) : drill.outsideShare;

/** Outside-leg load over body weight at turn time `t`. */
export const outsideLoadAt = (s: TurnScenario, drill: TurnDrill, t: number, lifted: number): number => turnForcesAt(s, t).load * outsideShare(drill, lifted);
