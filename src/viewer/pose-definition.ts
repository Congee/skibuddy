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
  /** `hip` in a cross-under transition, where the constraints call for one; else `hip`. */
  readonly hipUnder?: number;
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
  /** Centre of mass ahead of the outside mid-foot along the ski, metres: where the tripod takes the pressure. */
  readonly comAhead: number;
  /** Both skis pitched tip-up about the boots; negative, tip-down. Absent, flat. */
  readonly skiPitch?: number;
  /** Metres the boots clear the snow, legs retracted; absent, on it. Only with `firmSnow`. */
  readonly skiClearance?: number;
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

/** Where the head looks through the turn, beyond the chest's own heading. */
export const HeadAim = { Chest: 'chest', FallLine: 'fall-line', Arc: 'arc', Line: 'line' } as const;
export type HeadAim = (typeof HeadAim)[keyof typeof HeadAim];

/**
 * The head's rule: with the chest; down the fall line of a turn swinging across a `corridor` metres wide; along the
 * arc `lead` seconds ahead, or at the next apex while it is farther, moving on `early` seconds before passing it; or
 * at the corridor's centre line `turns` turns downhill.
 */
export type HeadRule =
  | { readonly aim: typeof HeadAim.Chest }
  | { readonly aim: typeof HeadAim.FallLine; readonly corridor: number }
  | { readonly aim: typeof HeadAim.Arc; readonly lead: number; readonly early: number }
  | { readonly aim: typeof HeadAim.Line; readonly turns: number };

export interface PoseConstraints {
  /** Peak hip angulation and outside femur rotation at moderate intensity. */
  readonly hipAngulation: number;
  readonly femurRotation: number;
  /** Share of the outside femur's rotation the inside one takes. */
  readonly insideFemurShare: number;
  /** False keeps the mass off the balance axis, the body unrolled; the stork's angulation is keyed so. */
  readonly balanced?: boolean;
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
  /** Both thighs drawn toward each other: a stance narrower than hip width. */
  readonly stance: number;
  /** Both femurs turned inward, radians: with the thighs drawn in, knees together and the boots still apart. */
  readonly kneesIn: number;
  /** Poles this many metres shorter than the figure's regular length. */
  readonly poleTrim: number;
  /** Share of a cross-under transition (`hipUnder`) at gentle, moderate and dynamic; absent, none. */
  readonly crossUnder?: readonly [number, number, number];
  /** Radians both ankles close further in a full cross-under, timed by `hipUnder`. */
  readonly underAnkle?: number;
  /**
   * Radians the trunk leans further forward than the outside shin. Present, the knee follows the hip's depth and the
   * ankle alone moves the mass fore and aft (lemaster-2010 p81); absent, the knee does.
   */
  readonly trunkOverShin?: number;
  /** Fraction `trunkOverShin` grows per unit of effort scale, so a harder turn leans the trunk more. */
  readonly trunkOverShinGain?: number;
  /** Share of the inside leg's extra flexion its ankle takes, so its foot leads less. */
  readonly insideAnkleShare?: number;
  /** The legs scissor so the inside tip leads as the stance and the countered hips set it, nil at the switch; absent, as the legs fall. */
  readonly scissor?: boolean;
  /** Where the head looks; absent, with the chest. */
  readonly head?: HeadRule;
  /** Radians both arms are abducted; absent, ARM_ABDUCTION. */
  readonly armAbduction?: number;
  /** The skis stay on top of firm snow: a tip-down tip lifts the boots onto it; absent, they pivot at the boots, as in powder. */
  readonly firmSnow?: boolean;
  /**
   * On moguls the outside knee, radians, opens to `open` and folds to `deep` at gentle, moderate and dynamic, as the
   * snow under the skis falls and rises, keeping the mass level; the hip folds with it, so the trunk keeps its lean on the shin.
   */
  readonly absorb?: { readonly open: number; readonly deep: readonly [number, number, number] };
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

export const wrapTime = (t: number): number => ((t % 1) + 1) % 1;

/** Share of the window at turn time `t`. */
export const windowShare = (w: Window | null, t: number): number => {
  if (w === null) return 0;
  const u = wrapTime(t);
  return smoothstep(w.up - w.ramp, w.up + w.ramp, u) * (1 - smoothstep(w.down - w.ramp, w.down + w.ramp, u));
};

/** 1 while the basket is planted, easing to 0 over the swing either side. */
export const touchShare = (touch: PoleTouch | null, t: number): number => {
  if (touch === null) return 0;
  const u = wrapTime(t - touch.t);
  const d = Math.min(u, 1 - u) - touch.hold;
  if (d <= 0) return 1;
  if (d >= touch.swing) return 0;
  return 0.5 + 0.5 * Math.cos((Math.PI * d) / touch.swing);
};

export type KeyField = Exclude<keyof PoseKey, 't'>;
export type KeyValues = Readonly<Record<KeyField, number>>;
type Knot = Required<PoseKey> & { readonly time: number };

const FIELDS: ReadonlyArray<KeyField> = [
  'angulation',
  'hip',
  'hipUnder',
  'pelvisList',
  'lumbarFlex',
  'spineBend',
  'spineTwist',
  'counter',
  'dorsiflexion',
  'insideDorsiflexion',
  'eversion',
  'protraction',
  'elevation',
  'insideTailLift',
  'comAhead',
  'skiPitch',
  'skiClearance',
];

/** Fields that lean or turn toward the inside: the next turn, mirrored, takes them with the other sign. */
const ODD: ReadonlySet<KeyField> = new Set(['angulation', 'pelvisList', 'spineBend', 'spineTwist', 'counter', 'eversion']);

/**
 * Monotone cubic Hermite through the keys, so nothing overshoots a key: no counter into the new turn. Turns
 * alternate, so the keys before and after this turn's are its own with the odd fields' signs flipped.
 */
export const keyValuesAt = (keys: ReadonlyArray<PoseKey>, t: number): KeyValues => {
  const u = ((t % 1) + 1) % 1;
  const sorted = keys.toSorted((a, b) => a.t - b.t);
  const n = sorted.length;
  const at = (i: number): Knot => {
    const key = sorted[((i % n) + n) % n];
    if (key === undefined) throw new Error('no key poses');
    const k: Required<PoseKey> = { ...key, hipUnder: key.hipUnder ?? key.hip, skiPitch: key.skiPitch ?? 0, skiClearance: key.skiClearance ?? 0 };
    const turn = Math.floor(i / n);
    const flipped = turn % 2 === 0 ? k : { ...k, ...Object.fromEntries([...ODD].map((f) => [f, -k[f]])) };
    return { ...flipped, time: k.t + turn };
  };
  let i = n - 1;
  while (i > 0 && at(i).time > u) i--;
  // Before the first key, interpolate from the last one of the previous turn.
  if (at(i).time > u) i = -1;
  const p0 = at(i - 1);
  const p1 = at(i);
  const p2 = at(i + 1);
  const p3 = at(i + 2);
  const h = p2.time - p1.time;
  const s = (u - p1.time) / h;
  const h00 = 2 * s ** 3 - 3 * s ** 2 + 1;
  const h10 = s ** 3 - 2 * s ** 2 + s;
  const h01 = -2 * s ** 3 + 3 * s ** 2;
  const h11 = s ** 3 - s ** 2;
  // Zero at a turning key, and limited to three times the smaller secant (Fritsch-Carlson).
  const tangent = (a: Knot, b: Knot, c: Knot, f: KeyField): number => {
    const d0 = (b[f] - a[f]) / (b.time - a.time);
    const d1 = (c[f] - b[f]) / (c.time - b.time);
    if (d0 * d1 <= 0) return 0;
    const m = (c[f] - a[f]) / (c.time - a.time);
    return Math.sign(m) * Math.min(Math.abs(m), 3 * Math.abs(d0), 3 * Math.abs(d1));
  };
  const out = Object.fromEntries(FIELDS.map((f) => [f, 0])) as Record<KeyField, number>;
  if (n === 1) return { ...out, ...Object.fromEntries(FIELDS.map((f) => [f, p1[f]])) };
  for (const f of FIELDS) out[f] = h00 * p1[f] + h10 * h * tangent(p0, p1, p2, f) + h01 * p2[f] + h11 * h * tangent(p1, p2, p3, f);
  return out;
};
