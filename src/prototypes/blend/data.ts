import { Schema } from 'effect';
import { Drill, Exercise, INTENSITIES, Movement, MovementId, Muscle, PHASES, Phase, Source, levelAt } from '../../content/schema';
import type { Activation, EffortLevel, Intensity, LevelBySetting } from '../../content/schema';
import { RegularTurn } from '../../viewer/poses/regular-turn';
import { MogulLine } from '../../viewer/surface';

export interface BlendDrill extends Drill {
  readonly draft: boolean;
}

export interface BlendData {
  readonly muscles: ReadonlyArray<Muscle>;
  readonly sources: ReadonlyArray<Source>;
  readonly exercises: ReadonlyArray<Exercise>;
  readonly movements: ReadonlyMap<string, Movement>;
  readonly drills: ReadonlyArray<BlendDrill>;
}

const decode = <A>(schema: Schema.Decoder<A>): ((u: unknown) => A) => Schema.decodeUnknownSync(schema);

export const loadData = async (url: string): Promise<BlendData> => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Could not load content (${res.status})`);
  const raw = (await res.json()) as {
    muscles: unknown;
    sources: unknown;
    exercises: unknown;
    movements: Record<string, unknown>;
    drills: ReadonlyArray<{ reviewed_by?: ReadonlyArray<unknown> }>;
  };
  return {
    muscles: decode(Schema.Array(Muscle))(raw.muscles),
    sources: decode(Schema.Array(Source))(raw.sources),
    exercises: decode(Schema.Array(Exercise))(raw.exercises),
    movements: new Map(Object.values(raw.movements).map((m) => decode(Movement)(m)).map((m) => [m.id as string, m])),
    // Draft until an instructor or physio has reviewed it.
    drills: raw.drills.map((d) => Object.assign(decode(Drill)(d), { draft: (d.reviewed_by ?? []).length === 0 })),
  };
};

export const KindId = {
  Cruising: 'cruising',
  Carving: 'carving',
  ShortTurns: 'short-turns',
  Moguls: 'moguls',
  Steeps: 'steeps',
  Powder: 'powder',
} as const;
export type KindId = (typeof KindId)[keyof typeof KindId];

/** Per activation and phase, how many levels a placeholder adds to its base. */
type Shift = (a: Activation, phase: Phase) => number;

export interface Kind {
  readonly id: KindId;
  readonly name: string;
  readonly base: string;
  /** Present on placeholders authored here; absent on kinds with real (draft) content. */
  readonly shift?: Shift;
  readonly drill: string;
  /** The figure's turn for this kind. */
  readonly pose: RegularTurn;
}

const LEGS = new Set(['vasti', 'rectus-femoris', 'gluteus-maximus', 'biceps-femoris', 'medial-hamstrings', 'soleus', 'gastrocnemius']);
const TRUNK = new Set(['rectus-abdominis', 'transversus-abdominis', 'external-oblique', 'internal-oblique', 'erector-spinae', 'multifidus']);
const FOOT = new Set(['tibialis-anterior', 'toe-extensors', 'peroneals', 'tibialis-posterior', 'foot-intrinsics']);

export const KINDS: ReadonlyArray<Kind> = [
  { id: KindId.Cruising, name: 'Cruising', base: 'long-radius-carved-turn', drill: 'long-radius-carved-turns', pose: RegularTurn.Cruising, shift: () => -1 },
  { id: KindId.Carving, name: 'Carving', base: 'long-radius-carved-turn', drill: 'long-radius-carved-turns', pose: RegularTurn.Carving },
  { id: KindId.ShortTurns, name: 'Short turns', base: 'short-radius-turn', drill: 'short-radius-turns', pose: RegularTurn.ShortTurns },
  {
    id: KindId.Moguls,
    name: 'Moguls',
    base: 'short-radius-turn',
    drill: 'moguls',
    pose: RegularTurn.Moguls,
    // Absorbing each bump: legs work harder through finish into initiation; the trunk steadies the absorption.
    shift: (a, p) => ((LEGS.has(a.muscle) && p !== Phase.Shaping) || (TRUNK.has(a.muscle) && p === Phase.Finish) ? 1 : 0),
  },
  {
    id: KindId.Steeps,
    name: 'Steeps',
    base: 'short-radius-turn',
    drill: 'short-radius-turns',
    pose: RegularTurn.Steeps,
    // Edge set at the finish loads the outside leg; the trunk holds square to the fall line.
    shift: (a, p) => ((a.side === 'outside' && LEGS.has(a.muscle) && p === Phase.Finish) || (TRUNK.has(a.muscle) && p === Phase.Initiation) ? 1 : 0),
  },
  {
    id: KindId.Powder,
    name: 'Powder',
    base: 'long-radius-carved-turn',
    drill: 'long-radius-carved-turns',
    pose: RegularTurn.Powder,
    // Two-footed platform: the inside leg shares the load, edging muscles ease.
    shift: (a) => (a.side === 'inside' && LEGS.has(a.muscle) ? 1 : FOOT.has(a.muscle) ? -1 : 0),
  },
];

export { MogulLine };
/** Moguls is skied down the zipper line (the kind's own turn) or over the tops (that drill's). */
export const MOGUL_LINES: ReadonlyArray<MogulLine> = [MogulLine.Zipper, MogulLine.Tops];
export const MOGUL_LINE_NAMES: Readonly<Record<MogulLine, string>> = { [MogulLine.Zipper]: 'Zipper line', [MogulLine.Tops]: 'On the tops' };
export const TOPS_DRILL = 'turns-on-the-tops';

const clamp = (v: number): EffortLevel => Math.min(3, Math.max(0, Math.round(v)));

const shifted = (a: Activation, shift: Shift): Activation => {
  const at = (phase: Phase): LevelBySetting => {
    const level = (i: Intensity): EffortLevel => clamp(levelAt(a.intensity[phase], i) + shift(a, phase));
    const [gentle, moderate, dynamic] = INTENSITIES.map(level) as [EffortLevel, EffortLevel, EffortLevel];
    return { gentle, moderate, dynamic };
  };
  const [initiation, shaping, finish] = PHASES.map(at) as [LevelBySetting, LevelBySetting, LevelBySetting];
  return { ...a, intensity: { initiation, shaping, finish }, confidence: 'low' };
};

/** A kind's movement: its draft, or a placeholder derived from one. */
export const kindMovement = (kind: Kind, data: BlendData): Movement | undefined => {
  const base = data.movements.get(kind.base);
  if (base === undefined || kind.shift === undefined) return base;
  const shift = kind.shift;
  return {
    ...base,
    id: decode(MovementId)(`${kind.id}-placeholder`),
    name: `${kind.name} (placeholder)`,
    activations: base.activations.map((a) => shifted(a, shift)),
  };
};

/** Our own grouping of the drill library; drafts carry no group yet. */
export const DRILL_GROUPS: ReadonlyArray<{ readonly name: string; readonly ids: ReadonlyArray<string> }> = [
  {
    name: 'Balance on one ski',
    ids: ['stork-turns', 'javelin-turns', 'outside-ski-turns', 'one-ski-straight-run', 'one-footed-railroad-track-turns', 'thousand-steps'],
  },
  { name: 'Edging and carving', ids: ['railroad-track-turns', 'carved-j-turns', 'long-radius-carved-turns', 'whitepass-turns'] },
  { name: 'Steering and pivoting', ids: ['pivot-slips', 'sideslips', 'falling-leaf', 'hockey-stops', 'wedge-turns', 'crab-wedge-turns', 'turns-on-the-tops'] },
  { name: 'Timing and pressure', ids: ['extension-transitions', 'flexion-transitions', 'dolphin-turns', 'short-radius-turns', 'tic-tac-turns', 'closed-stance-short-turns'] },
];

// Placeholder picks by hand, not researched: drills that practise what each kind of skiing asks most.
export const KIND_DRILLS: Readonly<Record<KindId, ReadonlyArray<string>>> = {
  [KindId.Cruising]: ['outside-ski-turns', 'thousand-steps', 'stork-turns'],
  [KindId.Carving]: ['carved-j-turns', 'railroad-track-turns', 'one-footed-railroad-track-turns'],
  [KindId.ShortTurns]: ['tic-tac-turns', 'javelin-turns', 'whitepass-turns', 'closed-stance-short-turns'],
  [KindId.Moguls]: ['turns-on-the-tops', 'closed-stance-short-turns', 'flexion-transitions', 'pivot-slips', 'hockey-stops'],
  [KindId.Steeps]: ['sideslips', 'falling-leaf', 'hockey-stops'],
  [KindId.Powder]: ['extension-transitions', 'dolphin-turns', 'thousand-steps'],
};
