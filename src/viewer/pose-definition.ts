/**
 * A drill's motion as data: joint keys through the turn plus the constraints the solver
 * balances them under. scripts/anatomy/pose-tables.ts solves every definition into the
 * tables the figures read; nothing here runs in the browser.
 */

/** Joint targets at one turn time; angles in radians. The keys interpolate without overshoot. */
export interface PoseKey {
  /** Turn time: 0 transition, 1/6 initiation, 1/2 shaping, 5/6 finish (PHASE_T). */
  readonly t: number;
  /** Share of the peak angulation: hip angulation and femur rotation. */
  readonly angulation: number;
  /** Outside hip flexion between its most open (0) and its deepest (1); the knee follows from balance. */
  readonly hip: number;
  /** Pelvis tipped up on the inside against the balance axis. */
  readonly pelvisList: number;
  /** Low back flexed on the pelvis. */
  readonly lumbarFlex: number;
  /** Trunk bent toward the outside ski. */
  readonly spineBend: number;
  /** Trunk turned toward the outside of the turn beyond the pelvis. */
  readonly spineTwist: number;
  /** Pelvis facing toward the outside of the turn. */
  readonly counter: number;
  /** Outside ankle dorsiflexion: shin forward of the foot's normal. */
  readonly dorsiflexion: number;
  /** Lifted inside ankle dorsiflexion; used only while the tail is up. */
  readonly insideDorsiflexion: number;
  /** Outside foot everted at the subtalar joint, under the talus. */
  readonly eversion: number;
  /** Shoulder blades drawn forward round the chest. */
  readonly protraction: number;
  /** Shoulder blades raised. */
  readonly elevation: number;
  /** Inside ski pitched tail-up at a full lift. */
  readonly insideTailLift: number;
  /** Centre of mass ahead of the outside mid-foot, metres: where the tripod takes the pressure. */
  readonly comAhead: number;
}

/** A smooth 0..1..0 window through the turn: up around `up`, down around `down`, each over `ramp` either side. */
export interface Window {
  readonly up: number;
  readonly down: number;
  readonly ramp: number;
}

/** A pole touch: full at `t`, held `hold` either side, swung over `swing`. */
export interface PoleTouch {
  readonly t: number;
  readonly hold: number;
  readonly swing: number;
}

export interface PoseConstraints {
  /** Peak hip angulation and outside femur rotation at moderate intensity. */
  readonly hipAngulation: number;
  readonly femurRotation: number;
  /** Share of the outside femur's rotation the inside one takes. */
  readonly insideFemurShare: number;
  /** Outside hip flexion by fall-line load: [load, most open, deepest], degrees; the middle row is moderate. */
  readonly hipByLoad: ReadonlyArray<readonly [number, number, number]>;
  /** The lifted inside knee stops here; past it the tail lifts less instead. */
  readonly insideKneeMax: number;
  /** When the inside tail is up; null keeps both skis on the snow. */
  readonly tailLift: Window | null;
  /** The inside pole touch; null carries both poles. */
  readonly poleTouch: PoleTouch | null;
  /** Share of the inside arm's reach the shoulder blade takes (scapulohumeral rhythm). */
  readonly scapularRhythm: number;
  /** Per key field, how much more a dynamic turn takes (and a gentle one less), as a share per step of effort. */
  readonly gains: Readonly<Partial<Record<Exclude<keyof PoseKey, 't'>, number>>>;
}

export interface PoseDefinition {
  readonly keys: ReadonlyArray<PoseKey>;
  readonly constraints: PoseConstraints;
}

const smoothstep = (a: number, b: number, x: number): number => {
  const u = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return u * u * (3 - 2 * u);
};

const wrap = (t: number): number => ((t % 1) + 1) % 1;

/** Share of the window at turn time `t`. */
export const windowShare = (w: Window | null, t: number): number => {
  if (w === null) return 0;
  const u = wrap(t);
  return smoothstep(w.up - w.ramp, w.up + w.ramp, u) * (1 - smoothstep(w.down - w.ramp, w.down + w.ramp, u));
};

/** 1 while the basket is planted, easing to 0 over the swing either side. */
export const touchShare = (touch: PoleTouch | null, t: number): number => {
  if (touch === null) return 0;
  const u = wrap(t - touch.t);
  const d = Math.min(u, 1 - u) - touch.hold;
  if (d <= 0) return 1;
  if (d >= touch.swing) return 0;
  return 0.5 + 0.5 * Math.cos((Math.PI * d) / touch.swing);
};
