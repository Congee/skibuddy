import type { Intensity } from '../content/schema';

/** A round turn at constant speed: speed, radius of the skis' arc, slope. Content's `Scenario` fits it. */
export interface TurnScenario {
  readonly speedMps: number;
  /** The skis' arc, and the centre of mass's path unless `comRadiusM` is set. */
  readonly radiusM: number;
  readonly slopeDeg: number;
  /** The centre of mass's path when the legs swing the skis under a straighter mass, as in moguls. */
  readonly comRadiusM?: number;
  /** Share of gravity's pull along the path the snow takes to hold the speed: 1 steady, 0 none; absent, 0. */
  readonly brakingShare?: number;
}

export const G = 9.81;

/** A drill's scenario per setting; the drill's content is the only source. */
export type TurnScenarios = Readonly<Record<Intensity, TurnScenario>>;

/** Any drill's scenario: no radius means it is not a round turn (steps, stops, straight runs). */
export interface DrillScenario {
  readonly speedMps: number;
  readonly slopeDeg: number;
  readonly radiusM?: number;
  readonly comRadiusM?: number;
  readonly brakingShare?: number;
}

/** Structural twin of content's `isTurnScenario`, so the physics needs nothing from the content schema. */
export const isTurn = (s: DrillScenario): s is TurnScenario => typeof s.radiusM === 'number' && s.radiusM > 0;

export interface TurnForces {
  /** Snow force over body weight. */
  readonly load: number;
  /** Tilt of the resultant, and of the balanced body, from the slope normal, radians. */
  readonly tilt: number;
}

/** Radius of the centre of mass's path. */
export const comRadius = (s: TurnScenario): number => s.comRadiusM ?? s.radiusM;

/**
 * Lind & Sanders eq 4.9 at the skis' heading `beta`, radians: 0 across the hill at the top of the
 * turn, π/2 down the fall line, π across again at the finish. Gravity opposes the turn
 * above the fall line and adds below it (lind-sanders-2004). A wider mass path keeps the skis'
 * rhythm, so it heads off the fall line by the share radiusM / comRadiusM of the skis' heading.
 */
export const forcesAt = (s: TurnScenario, beta: number): TurnForces => {
  const alpha = (s.slopeDeg * Math.PI) / 180;
  const r = comRadius(s);
  const off = (Math.PI / 2 - beta) * (s.radiusM / r);
  const f = s.speedMps ** 2 / (G * r) - Math.sin(alpha) * Math.sin(off);
  return { load: Math.hypot(f, Math.cos(alpha)), tilt: Math.atan2(f, Math.cos(alpha)) };
};

/** Air drag over weight per (m/s)²: ½ ρ CdA / mg at 1 kg/m³, 0.4 m², 75 kg; inferred. */
export const DRAG_PER_V2 = (0.5 * 1 * 0.4) / (75 * G);

/**
 * Tilt of the snow's force uphill from the slope normal in the skis' pitch plane, radians. Holding the speed, the
 * snow takes gravity's pull along the mass's path, sinθ cosψ less air drag, in the share `brakingShare`; projected
 * on skis heading `ski` off the fall line, against the snow's normal load. `mass` is the mass path's heading.
 */
export const brakingTilt = (s: DrillScenario, ski: number, mass: number, load: number): number => {
  const share = s.brakingShare ?? 0;
  if (share === 0) return 0;
  const slope = (s.slopeDeg * Math.PI) / 180;
  const along = Math.max(0, Math.sin(slope) * Math.cos(mass) - DRAG_PER_V2 * s.speedMps ** 2);
  return Math.atan2(share * along * Math.cos(ski - mass), load);
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
  // Smooth and monotone, with the shaping key on the fall line; still at the finish, so the forces ease into the transition.
  return FINISH_HEADING * x * (4 + x - 2 * x * x) / 3;
};

export const phaseForces = (s: TurnScenario): { readonly initiation: TurnForces; readonly shaping: TurnForces; readonly finish: TurnForces } => ({
  initiation: forcesAt(s, 0),
  shaping: forcesAt(s, Math.PI / 2),
  finish: forcesAt(s, FINISH_HEADING),
});

/** Fall-line load were the mass on the skis' arc: the effort key, which a straighter mass path must not soften. */
export const arcLoad = (s: TurnScenario): number => phaseForces({ speedMps: s.speedMps, radiusM: s.radiusM, slopeDeg: s.slopeDeg }).shaping.load;

const smooth = (u: number): number => u * u * (3 - 2 * u);

/** Cubic Hermite on 0..1 from `a`, still, to `b` at slope `m` (per unit of u). */
const easeTo = (a: number, b: number, m: number, u: number): number => a + (b - a) * smooth(u) + m * u * u * (u - 1);

/**
 * Rate the tilt passes through 0 at the switch, per unit of turn time: monotone (Fritsch-Carlson) through
 * the finish tilt, 0, and the next turn's initiation tilt with its sign flipped.
 */
const switchRate = (s: TurnScenario): number => {
  const finish = forcesAt(s, FINISH_HEADING).tilt;
  const initiation = forcesAt(s, 0).tilt;
  const d0 = -finish / (1 - PHASE_T.finish);
  const d1 = -initiation / PHASE_T.initiation;
  if (d0 * d1 <= 0) return 0;
  const secant = -(finish + initiation) / (1 - PHASE_T.finish + PHASE_T.initiation);
  return Math.sign(d0) * Math.min(Math.abs(secant), 3 * Math.abs(d0), 3 * Math.abs(d1));
};

/**
 * Through a turn whose mass rides the skis' arc, a share of the peak: the path's curvature into the turn, the lean as
 * the edges release. Gravity's pull across the path curves it on flat skis, so the share is nil at the switch. The
 * radius tightens progressively and is least at about two thirds of the turn (sporri-2016-sidecut Fig 4), where the pressure
 * peaks (carv-ligety-2024); the edge builds ahead of it (carv-ligety-2024, reid-2020 Fig 4).
 */
/** Turn time of the least radius and the peak load. */
const ARC_PEAK_T = 0.61;
const ARC_SHARE: ReadonlyArray<readonly [number, number]> = [
  [0, 0],
  [1 / 12, 0.36],
  [1 / 6, 0.59],
  [1 / 4, 0.76],
  [1 / 3, 0.86],
  [5 / 12, 0.93],
  [1 / 2, 0.97],
  [ARC_PEAK_T, 1],
  [3 / 4, 0.86],
  [5 / 6, 0.68],
  [11 / 12, 0.47],
  [1, 0],
];
/** Rate the curvature share leaves nil at the switch, per unit of turn time. */
const SWITCH_RATE = 5;

/** Monotone cubic Hermite (Fritsch-Carlson) through `knots`, with the end slopes given. */
const monotone = (knots: ReadonlyArray<readonly [number, number]>, d0: number, d1: number, x: number): number => {
  const n = knots.length;
  const at = (i: number): readonly [number, number] => knots[Math.min(n - 1, Math.max(0, i))] ?? [0, 0];
  const secant = (i: number): number => (at(i + 1)[1] - at(i)[1]) / (at(i + 1)[0] - at(i)[0]);
  const tangent = (i: number): number => {
    if (i === 0) return d0;
    if (i === n - 1) return d1;
    const a = secant(i - 1);
    const b = secant(i);
    if (a * b <= 0) return 0;
    const m = (at(i + 1)[1] - at(i - 1)[1]) / (at(i + 1)[0] - at(i - 1)[0]);
    return Math.sign(m) * Math.min(Math.abs(m), 3 * Math.abs(a), 3 * Math.abs(b));
  };
  let i = 0;
  while (i < n - 2 && at(i + 1)[0] <= x) i++;
  const [x0, y0] = at(i);
  const [x1, y1] = at(i + 1);
  const h = x1 - x0;
  const s = (x - x0) / h;
  return (2 * s ** 3 - 3 * s ** 2 + 1) * y0 + (s ** 3 - 2 * s ** 2 + s) * h * tangent(i) + (-2 * s ** 3 + 3 * s ** 2) * y1 + (s ** 3 - s ** 2) * h * tangent(i + 1);
};

/**
 * Forces on a turn whose mass rides the skis' arc. The lean peaks as at the finish key, the radius held to 45° below
 * the fall line, so the peak lean and load stay. Into the turn its tangent follows the curvature, so a faster turn
 * tips sooner (carv-ligety-2024); past the peak it eases off by ARC_SHARE, at the rate it left the switch.
 */
const arcForcesAt = (s: TurnScenario, t: number): TurnForces => {
  const cos = Math.cos((s.slopeDeg * Math.PI) / 180);
  const peak = forcesAt(s, FINISH_HEADING).tilt;
  const u = wrap(t);
  // The lean's rate through the switch, matched by the release so the mirrored turn joins without a kink.
  const rate = (SWITCH_RATE * Math.tan(peak)) / Math.max(1e-9, peak);
  const share = monotone(ARC_SHARE, SWITCH_RATE, -rate, u);
  const tilt = u <= ARC_PEAK_T ? Math.atan(Math.tan(peak) * share) : peak * share;
  return { load: cos / Math.cos(tilt), tilt };
};

/**
 * Forces at turn time `t`. Where the mass rides the skis' arc, as ARC_SHARE says; on a straighter mass path, as in
 * moguls, through the phase keys' headings. Through the transition the edges change: the load eases to the slope's
 * normal share of weight, and the tilt passes through 0 at the switch without stopping there, into the mirrored next turn.
 */
export const turnForcesAt = (s: TurnScenario, t: number): TurnForces => {
  if (s.comRadiusM === undefined) return arcForcesAt(s, t);
  const beta = headingAt(t);
  if (beta !== null) return forcesAt(s, beta);
  const u = wrap(t);
  const flat = Math.cos((s.slopeDeg * Math.PI) / 180);
  const rate = switchRate(s);
  if (u > PHASE_T.finish) {
    const from = forcesAt(s, FINISH_HEADING);
    const x = (u - PHASE_T.finish) / (1 - PHASE_T.finish);
    return { load: flat + (from.load - flat) * smooth(1 - x), tilt: easeTo(from.tilt, 0, rate * (1 - PHASE_T.finish), x) };
  }
  const to = forcesAt(s, 0);
  const x = 1 - u / PHASE_T.initiation;
  return { load: flat + (to.load - flat) * smooth(1 - x), tilt: easeTo(to.tilt, 0, rate * PHASE_T.initiation, x) };
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
