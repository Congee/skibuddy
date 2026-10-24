// Usage: bun scripts/prior/build.ts [--check]
// Registers the literature and footage curves onto the phase events, maps them onto the ISB
// coordinates and fits src/viewer/prior/priors.json. --check exits non-zero when it is stale.
import { readFileSync, writeFileSync } from 'node:fs';
import { PHASE_T, arcLoad } from '../../src/physics/turn';
import type { TurnScenario } from '../../src/physics/turn';
import { JOINT_LIMITS } from '../../src/viewer/joint-limits';
import { CUFF } from '../../src/viewer/motion/cuff';
import { fitSeries, peakPhase, register, sample } from '../../src/viewer/prior/fit';
import type { Curve } from '../../src/viewer/prior/fit';
import { BASE_NAMES, EdgeChange, Evidence, Parity, Role, SigmaFrom, evalDeg, fallLineLean, parityOf } from '../../src/viewer/prior/prior';
import type { CoordinatePrior, Example, LimitFlag, PhaseAnchors, PriorFile, RoleProvenance, SourceUse } from '../../src/viewer/prior/prior';
import { RegularTurn, TURN_STYLES } from '../../src/viewer/poses/regular-turn';
import LIT from './lit-curves.json';
import REILLY from './reilly-curves.json';
import SAM3D from './sam3d-curves.json';

export const PRIORS_FILE = new URL('../../src/viewer/prior/priors.json', import.meta.url);

const DEG = Math.PI / 180;
/** Phase samples per turn. */
export const GRID = 48;
const MU_ORDER = 12;
const SIGMA_ORDER = 6;
/** σ of a single source, degrees; inferred. */
export const SINGLE_WIDE = 10;
/** Least σ from a between-source spread, degrees; inferred, so two agreeing sources don't pin a coordinate. */
export const SIGMA_FLOOR = 3;

type Anchors = ReadonlyArray<readonly [number, number]>;
const IDENTITY: Anchors = [[0, 0], [1, 1]];

interface Base {
  readonly id: string;
  readonly what: string;
  readonly status: string;
  readonly evidence: Evidence;
  readonly n: number;
  readonly errorDeg: number;
  /** The source's own between-subject SD; a single source's σ then, in place of SINGLE_WIDE. */
  readonly sdDeg?: number;
  readonly mapping: string;
  readonly method?: string;
  /** The transition style the source shows; absent = unstated. combine() never pools two styles. */
  readonly style?: EdgeChange;
}
interface CurveSource extends Base {
  readonly curve: Curve;
  readonly anchors: Anchors;
  readonly warp: string;
  /** Phases the curve covers; the source reads nothing outside it. */
  readonly span?: readonly [number, number];
}
interface RangeSource extends Base {
  readonly range: readonly [number, number];
}
export type Source = CurveSource | RangeSource;
const isCurve = (s: Source): s is CurveSource => 'curve' in s;

interface CoordinateDef {
  readonly roles: Readonly<Partial<Record<Role, ReadonlyArray<Source>>>>;
  readonly notes?: ReadonlyArray<string>;
}
export interface ExampleDef {
  readonly id: string;
  readonly arcLoad: number;
  /** Fall-line lean, degrees, from the same scenario as `arcLoad`. */
  readonly lean: number;
  readonly indexProvenance: string;
  readonly coordinates: Readonly<Record<string, CoordinateDef>>;
  /** Derived quantities a solver block targets (prior.ts DERIVED); unsided, keyed by name. */
  readonly derived?: Readonly<Record<string, CoordinateDef>>;
  /** The prior file's style key; absent = unstated, the drill's default. */
  readonly style?: EdgeChange;
}

// --- Sources -------------------------------------------------------------------------------------

const lit = LIT as unknown as Record<string, Record<string, unknown>>;
const at = (path: string): Record<string, unknown> => {
  const v = path.split('.').reduce<unknown>((o, k) => (o as Record<string, unknown> | undefined)?.[k], lit);
  if (v === undefined) throw new Error(`no ${path} in lit-curves.json`);
  return v as Record<string, unknown>;
};
const curveAt = (path: string, scale = 1): Curve => {
  const e = at(path);
  return { t: e['t'] as number[], v: (e['mean'] as number[]).map((x) => x * scale) };
};

// Heinrich 2023's window is the captured turn, not switch to switch: put the inside knee's peak on the fall line (kroll-2015 t ≈0.5).
const H23_INSIDE_KNEE = peakPhase(curveAt('gs_carving.inside.knee_flexion'));
const H23_ANCHORS: Anchors = [[0, 0], [H23_INSIDE_KNEE, 0.5], [1, 1]];
const H23_WARP = `window start = edge change (pelvis list ≈0 there), inside knee max t ${H23_INSIDE_KNEE.toFixed(3)} → ½, window end → 1; piecewise linear`;
const H23 = { id: 'heinrich-2023', status: 'digitised (Fig 2, grey = measured)', evidence: Evidence.Digitised, n: 1, errorDeg: 1, anchors: H23_ANCHORS, warp: H23_WARP } as const;
// The turn's global pelvis yaw rises (−34 → +53, OpenSim, + to the left), so it is read as a left turn, right leg outside; inferred.
const H23_TURN = 'turn read as a left turn from the rising global pelvis yaw (OpenSim + = left; inferred); a right turn would flip this sign';

// OpenSim's single lumbar joint is the whole trunk on the pelvis; shared out by the limit spans (inferred).
const spineShare = (region: 'lumbar' | 'thoracic', axis: 'flexion' | 'bending' | 'rotation'): number => {
  const span = (r: string): number => {
    const l = JOINT_LIMITS[`${r}_${axis}`];
    return l === undefined ? 0 : l.upper.value - l.lower.value;
  };
  return span(region) / (span('lumbar') + span('thoracic'));
};

const h23Spine = (region: 'lumbar' | 'thoracic', axis: 'flexion' | 'bending' | 'rotation'): CurveSource => {
  const share = spineShare(region, axis);
  const key = { flexion: 'trunk_pitch.lumbar_flexion_vs_pelvis', bending: 'trunk_lateral_tilt.lumbar_bend_vs_pelvis', rotation: 'trunk_lateral_tilt.lumbar_rotation_vs_pelvis' }[axis];
  const sign = axis === 'flexion' ? -1 : 1;
  const mapping =
    axis === 'flexion'
      ? `OpenSim lumbar_extension (− = flexed) negated; × ${share.toFixed(3)}, this region's share of the lumbar + thoracic flexion span (inferred)`
      : `OpenSim lumbar_${axis} as ISB ${axis} (${axis === 'bending' ? 'right' : 'left'} +; sign convention not stated in the paper, uncertain); × ${share.toFixed(3)} span share (inferred); ${H23_TURN}`;
  return { ...H23, what: `${key} (whole trunk vs pelvis)`, curve: curveAt(`gs_carving.${key}`, sign * share), mapping };
};

// sporri-2016: sacrum-to-sternum frontal bending after the gate, IMU; the whole spine, shared out by the limit spans (inferred).
const sporriSpine = (region: 'lumbar' | 'thoracic', what: string, deg: number): RangeSource => {
  const share = spineShare(region, 'flexion');
  return range('sporri-2016', `trunk frontal bending ${what}, sacrum to sternum, mean after the gate`, [deg * share, deg * share], 'range-only measured (text)', 5, `forward bending as flexion; × ${share.toFixed(3)} span share (inferred)`, 6);
};

// OpenSim pelvis_tilt is + posterior about the lab's lateral axis; the lab is level, the slope frame 12.3° off it (uncertain).
const H23_PELVIS_TILT: CurveSource = {
  ...H23,
  what: 'global pelvis tilt',
  errorDeg: 12,
  curve: curveAt('gs_carving.pelvis_tilt', -1),
  mapping: 'OpenSim pelvis_tilt (+ posterior) negated to anterior +; lab-level vs slope-frame tilt differs by up to the 12.3° slope, so ±12° (inferred); the root turns relative to the outside ski’s heading frame in ISB order (tilt, list, rotation), so tilt is pitch about the track’s across axis, while H23’s is about the lab’s lateral axis (inferred equivalent)',
};

const h23Leg = (role: 'outside' | 'inside', channel: string, mapping: string, scale = 1): CurveSource => ({
  ...H23,
  what: `${role} ${channel}`,
  curve: curveAt(`gs_carving.${role}.${channel}`, scale),
  mapping,
});
const H22 = { id: 'heinrich-2022', status: 'range-only measured (Table 1)', evidence: Evidence.RangeOnly, n: 1, errorDeg: 1 } as const;
const h22 = (role: 'outside' | 'inside', channel: string, mapping: string, scale = 1): RangeSource => {
  const [a, b] = at(`gs_carving.${role}.${channel}_heinrich2022`)['range'] as [number, number];
  const r = [a * scale, b * scale].toSorted((x, y) => x - y) as [number, number];
  return { ...H22, what: `${role} ${channel} min–max, one instructor, GS ≈14 m/s`, range: r, mapping };
};
const KROLL = { id: 'kroll-2015', status: 'eye-read (Fig 1A); its Table 1 extrema measured', evidence: Evidence.EyeRead, n: 1, errorDeg: 5, anchors: IDENTITY } as const;
const kroll = (path: string, role: string, span?: readonly [number, number]): CurveSource => ({
  ...KROLL,
  what: `${role} knee flexion, ${path.startsWith('slalom') ? 'SL' : 'GS'}, one FIS racer`,
  curve: curveAt(path),
  warp: 'none: plotted switch to switch, inside knee max ≈ ½ already',
  mapping: 'flexion = 180 − knee angle, as ISB knee_flexion',
  ...(path.startsWith('slalom') ? { style: EdgeChange.CrossUnder } : {}),
  ...(span === undefined ? {} : { span }),
});

const FLEX = 'flexion +, as ISB';
const ABD = 'abduction + negated to ISB adduction';
const ROT = 'internal rotation +, as ISB';

// Reilly: the three turns' mean; the near ski is outside in turn 2 (lead-footage/notes.md), alternating.
const reillyMean = (key: 'knee_outside' | 'knee_inside' | 'trunk_thigh_outside' | 'trunk_thigh_inside'): Curve => {
  const turns = REILLY.turns as unknown as ReadonlyArray<Record<string, number[]>>;
  return { t: REILLY.phi, v: REILLY.phi.map((_, i) => turns.reduce((s, tr) => s + (tr[key]?.[i] ?? 0), 0) / turns.length) };
};
const REILLY_SRC = {
  id: 'footage vXcjdfBXTiI (Reilly McGlashan)',
  status: 'footage: rtmlib RTMPose-x 2D, side-on, 3 turns (scripts/prior/reilly-curves.json)',
  evidence: Evidence.Footage,
  n: 1,
  anchors: IDENTITY,
  warp: 'phase = time between hand-read switches 4.86 and 5.59 s (lead-footage/notes.md); 4.13 and 6.32 s at the 0.73 s period, inferred',
  style: EdgeChange.CrossOver,
} as const;
const reilly = (key: 'knee_outside' | 'knee_inside' | 'trunk_thigh_outside' | 'trunk_thigh_inside'): CurveSource =>
  key.startsWith('knee')
    ? { ...REILLY_SRC, what: key.replace('_', ' '), curve: reillyMean(key), errorDeg: 10, mapping: 'image-plane thigh–shank angle as knee_flexion (side view, ±5–10°, spike/video/notes.md)' }
    : {
        ...REILLY_SRC,
        what: key.replace('_', ' ').replace('_', '–'),
        curve: reillyMean(key),
        errorDeg: 15,
        mapping: 'image-plane trunk–thigh angle as hip_flexion; it includes the spine flexion, so it overstates the hip (uncertain)',
      };

// SAM 3D Body: one clip a drill, its full turns' mean; outside leg from the inclination sign (scripts/prior/sam3d-curves.ts).
type Sam3dKey = 'knee_outside' | 'knee_inside' | 'trunk_pitch' | 'trunk_gravity' | 'trunk_across';
type Sam3dClip = 'reilly' | 'sce' | 'lig';
const SAM3D_METHOD = 'video-3d (SAM 3D Body)';
const SAM3D_ID: Readonly<Record<Sam3dClip, string>> = { reilly: 'footage-mcglashan-short-turns', sce: 'footage-sce-instructor', lig: 'footage ligety GS slow-mo (YouTube id not recorded; no candidate matches its 142 s)' };
const SAM3D_MAP: Readonly<Record<Sam3dKey, { readonly errorDeg: number; readonly mapping: string }>> = {
  // hypot(MAD vs RTMPose 2D side-on up to 5.3°, jitter ≈3°/frame) (sam3d/notes.md).
  knee_outside: { errorDeg: 6, mapping: 'MHR 3D thigh–shank angle as knee_flexion' },
  knee_inside: { errorDeg: 6, mapping: 'MHR 3D thigh–shank angle as knee_flexion' },
  // Within 0.6° of the 2D trunk side-on; the sole normal stands in for the snow (inferred error).
  trunk_pitch: { errorDeg: 5, mapping: 'pelvis root → neck vs the mean boot-sole normal, in the plane of the mean foot axis, + forward; turn.ts trunkPitchOf' },
  // Camera up as gravity, checked against tree trunks; roll within ±3° (inferred error).
  trunk_gravity: { errorDeg: 5, mapping: 'pelvis root → neck off camera up, taken as gravity up; turn.ts trunkGravityOf' },
  // Side-on, the across axis is depth: the same clip's CoM inclination reads a median 9.7°, too little for short turns.
  trunk_across: { errorDeg: 12, mapping: 'pelvis root → neck in the plane of camera up and the across-heading axis, + toward the CoM’s side; turn.ts trunkAcrossOf' },
};
interface Sam3dTurn {
  readonly start_s: number;
  readonly end_s: number;
  readonly outside_label: string;
  readonly p5_p95: Readonly<Record<Sam3dKey, readonly [number, number]>>;
  readonly knee_outside?: ReadonlyArray<number>;
}
const sam3dTurns = (clip: Sam3dClip): ReadonlyArray<Sam3dTurn & Partial<Record<Sam3dKey, ReadonlyArray<number>>>> =>
  (SAM3D.clips as unknown as Record<Sam3dClip, { turns: ReadonlyArray<Sam3dTurn & Partial<Record<Sam3dKey, ReadonlyArray<number>>>> }>)[clip].turns;
const sam3dBase = (clip: Sam3dClip, key: Sam3dKey): Base => {
  const turns = sam3dTurns(clip);
  return {
    id: SAM3D_ID[clip],
    what: `${key.replace('_', ' ')}, ${turns.length} turn${turns.length === 1 ? '' : 's'} (${turns.map((t) => `${t.start_s}–${t.end_s} s, ${t.outside_label} outside`).join('; ')})`,
    status: `measured: ${SAM3D_METHOD}, ${(SAM3D.clips as Record<string, { view: string }>)[clip]?.view ?? ''}`,
    evidence: Evidence.Measured,
    n: 1,
    method: SAM3D_METHOD,
    ...(clip === 'reilly' ? { style: EdgeChange.CrossOver } : {}),
    ...SAM3D_MAP[key],
  };
};
const sam3d = (clip: Sam3dClip, key: Sam3dKey): CurveSource => {
  const turns = sam3dTurns(clip);
  return {
    ...sam3dBase(clip, key),
    curve: { t: SAM3D.phi, v: SAM3D.phi.map((_, i) => turns.reduce((s, t) => s + (t[key]?.[i] ?? 0), 0) / turns.length) },
    anchors: IDENTITY,
    warp: 'phase = (t − edge change) / (next − edge change); edge change = SAM3D inclination zero crossing (3-frame mean)',
  };
};
// Sparse samples (every 10th slow-mo frame): the union of the part turns' p5–p95 only.
const sam3dRange = (clip: Sam3dClip, key: Sam3dKey): RangeSource => {
  const rs = sam3dTurns(clip).map((t) => t.p5_p95[key]);
  return { ...sam3dBase(clip, key), status: `range-only measured: ${SAM3D_METHOD}, every 10th slow-mo frame, p5–p95`, evidence: Evidence.RangeOnly, range: [Math.min(...rs.map((r) => r[0])), Math.max(...rs.map((r) => r[1]))] };
};
const GRAVITY_TRANSFER = 'footage slope unknown; evidence is gravity-referenced: the head and trunk orient to gravity (a choice), not converted to the snow normal';
const SCE_TRANSFER = 'sce (jBsWS4hpivY) skis short/medium turns, period ≈0.66 s (lead-footage/notes.md); used for cruising, an inferred transfer';
const SAM3D_PELVIS = 'sam3d (SAM 3D Body) pelvis tilt and the pelvis/spine split not used: posterior pelvis against the literature’s anterior in every clip, a model bias (sam3d/notes.md)';

const range = (id: string, what: string, r: readonly [number, number], status: string, errorDeg: number, mapping: string, n = 1): RangeSource => ({
  id,
  what,
  status,
  evidence: Evidence.RangeOnly,
  n,
  errorDeg,
  range: r,
  mapping,
});

const scenario = (kind: RegularTurn, key: 'gentle' | 'moderate' | 'dynamic'): TurnScenario => TURN_STYLES[kind].scenarios[key];

/** The interpolation key and the fall-line lean of an example's skiing (§4.1). */
const keyOf = (s: TurnScenario): { readonly arcLoad: number; readonly lean: number } => ({ arcLoad: arcLoad(s), lean: fallLineLean(arcLoad(s), s.slopeDeg) });

const both = (sources: ReadonlyArray<Source>): Partial<Record<Role, ReadonlyArray<Source>>> => ({ [Role.Outside]: sources, [Role.Inside]: sources });

// No study measures arm carriage in turns; lemaster-2010 only says forward, in view, hands wide. Ranges inferred, so σ wide.
const carried = (what: string, r: readonly [number, number]): RangeSource =>
  range('lemaster-2010', what, r, 'range-only qualitative (text): arms forward, hands wide and in view', SINGLE_WIDE, 'humerus on the thorax, ISB; range inferred from the text');
const ARMS: Readonly<Record<string, CoordinateDef>> = {
  shoulder_flexion: { roles: both([carried('arm carried forward, hands in view', [10, 60])]) },
  shoulder_abduction: { roles: both([carried('hands wide so the poles clear the body', [10, 40])]) },
};

/** The turn times a lit-curves.json event string names ("t ≈0.68", "t 0.25-0.75"): first, or the range's middle. */
const litT = (path: string, middle = false): number => {
  const text = path.split('.').reduce<unknown>((o, k) => (o as Record<string, unknown> | undefined)?.[k], lit);
  const m = typeof text === 'string' ? /t\s*≈?\s*(\d*\.\d+)(?:\s*-\s*(\d*\.\d+))?/.exec(text) : null;
  if (m === null) throw new Error(`no event time in lit-curves.json ${path}`);
  const a = Number(m[1]);
  return middle && m[2] !== undefined ? (a + Number(m[2])) / 2 : a;
};

/** Canonical event phases of each drill's prior axis (motion-model §9 F); drills absent here register by the fall line alone. */
export const EVENTS: Readonly<Record<string, PhaseAnchors>> = {
  [RegularTurn.GS]: {
    engagement: litT('gs_carving.events.edge_angle_max'),
    fallLine: 0.5,
    forcePeak: litT('gs_carving.events.grf_peak'),
    release: litT('gs_carving.events.release'),
    sources: [
      'engagement: sporri-2016 Fig 4 edge plateau start',
      'forcePeak: kroll-2015 Fig 1B, eye-read; another skier than sporri-2016, so the cross-source pairing is inferred',
      'release: sporri-2016 Fig 4 edge falls from t 0.8',
    ],
  },
  [RegularTurn.SL]: {
    engagement: litT('slalom.events.skid_peak', true),
    fallLine: 0.5,
    forcePeak: litT('slalom.events.grf_max'),
    sources: ['engagement: reid-2010 skid peak t 0.2–0.3, its middle taken as the edge set (inferred)', 'forcePeak: reid-2010 grf_max, 10 m course (our SL cells run the short end)'],
  },
};

// zorko-2015 Table 1, 65 mm skis (ours 68 mm): its phases I, S1, S2, C as quarters, each mean at the quarter's middle.
const ZORKO_KNEE: Curve = { t: [0.125, 0.375, 0.625, 0.875], v: [3.9, 8.1, 10.4, 13.3] };
const kneeRotation = (kind: RegularTurn): CoordinateDef => {
  const e = EVENTS[kind];
  return {
    roles: {
      outside: [
        {
          id: 'zorko-2015',
          what: 'outside knee internal rotation per phase, 6 skilled skiers, carved turns on 65 mm skis (Table 1)',
          status: 'measured (Table 1 phase means)',
          evidence: Evidence.Measured,
          n: 6,
          errorDeg: 1,
          sdDeg: 3,
          curve: ZORKO_KNEE,
          anchors: [[0, 0], [0.25, e?.engagement ?? 0.25], [0.5, 0.5], [0.75, e?.release ?? 0.75], [1, 1]],
          warp: 'weight transition → switch; I ends at engagement, S1 at the gate ≈ fall line, S2 at release (quarters where the drill has no event, inferred)',
          mapping: ROT,
        },
      ],
    },
    notes: ['zorko-2015 SD 2–4° in steering: σ 3°', ...(kind === RegularTurn.GS ? [] : [`zorko-2015 carved on a GS-like slope; ${kind} an inferred transfer`])],
  };
};

export const EXAMPLES: Readonly<Record<string, ReadonlyArray<ExampleDef>>> = {
  [RegularTurn.GS]: [
    {
      id: 'gs-fis-heinrich-2023',
      ...keyOf({ speedMps: 12, radiusM: 10.7, slopeDeg: 12.3 }),
      indexProvenance: 'measured: heinrich-2023 ≈12 m/s, min radius ≈10.7 m, 12.3° slope (the min radius, so the turn’s peak load)',
      coordinates: {
        ...ARMS,
        knee_rotation: kneeRotation(RegularTurn.GS),
        hip_flexion: { roles: { outside: [h23Leg('outside', 'hip_flexion', FLEX)], inside: [h23Leg('inside', 'hip_flexion', FLEX)] } },
        hip_adduction: {
          roles: { outside: [h23Leg('outside', 'hip_abduction', ABD, -1), h22('outside', 'hip_abduction', ABD, -1)], inside: [h23Leg('inside', 'hip_abduction', ABD, -1)] },
        },
        hip_rotation: {
          roles: { outside: [h23Leg('outside', 'hip_rotation', ROT), h22('outside', 'hip_rotation', ROT)], inside: [h23Leg('inside', 'hip_rotation', ROT), h22('inside', 'hip_rotation', ROT)] },
          notes: ['fasel-2017 carpet hip rotation not used: sign not stated, short skis'],
        },
        knee_flexion: {
          roles: {
            outside: [h23Leg('outside', 'knee_flexion', FLEX), h22('outside', 'knee_flexion', FLEX), kroll('gs_carving.outside.knee_flexion_kroll', 'outside'), sam3dRange('lig', 'knee_outside')],
            inside: [h23Leg('inside', 'knee_flexion', FLEX), h22('inside', 'knee_flexion', FLEX), kroll('gs_carving.inside.knee_flexion_kroll', 'inside'), sam3dRange('lig', 'knee_inside')],
          },
        },
        ankle_dorsiflexion: {
          roles: {
            outside: [h23Leg('outside', 'ankle_dorsiflexion', 'dorsiflexion +, as ISB'), h22('outside', 'ankle_dorsiflexion', 'dorsiflexion +, as ISB')],
            inside: [h23Leg('inside', 'ankle_dorsiflexion', 'dorsiflexion +, as ISB'), h22('inside', 'ankle_dorsiflexion', 'dorsiflexion +, as ISB')],
          },
        },
        lumbar_flexion: { roles: { turn: [h23Spine('lumbar', 'flexion'), sporriSpine('lumbar', 'GS', 27)] }, notes: ['fasel-2017 carpet trunk vs pelvis not used: carpet, short skis'] },
        thoracic_flexion: { roles: { turn: [h23Spine('thoracic', 'flexion'), sporriSpine('thoracic', 'GS', 27)] } },
        pelvis_tilt: { roles: { turn: [H23_PELVIS_TILT] }, notes: ['sporri-2015: trunk bending ≈39° at peak force in GS; a peak only, not fitted', SAM3D_PELVIS] },
        lumbar_bending: { roles: { turn: [h23Spine('lumbar', 'bending')] } },
        thoracic_bending: { roles: { turn: [h23Spine('thoracic', 'bending')] } },
        lumbar_rotation: { roles: { turn: [h23Spine('lumbar', 'rotation')] } },
        thoracic_rotation: { roles: { turn: [h23Spine('thoracic', 'rotation')] } },
      },
      derived: {
        trunk_pitch: { roles: { turn: [sam3dRange('lig', 'trunk_pitch')] }, notes: ['the sole normal is unreliable at high edge angles (sam3d/notes.md): wide'] },
        trunk_across: {
          roles: { turn: [sam3dRange('lig', 'trunk_across')] },
          notes: [GRAVITY_TRANSFER, 'lig front-oblique: the across axis lies near the image plane; gate poles keep camera roll within ±3°', 'lig total off gravity not used: its forward part is depth'],
        },
      },
    },
  ],
  [RegularTurn.SL]: [
    {
      id: 'short-reilly-sam3d',
      ...keyOf(scenario(RegularTurn.SL, 'dynamic')),
      indexProvenance: 'inferred: the drill’s dynamic scenario (an SL racer and an instructor’s dynamic demo; neither source gives speed and radius)',
      coordinates: {
        ...ARMS,
        knee_rotation: kneeRotation(RegularTurn.SL),
        knee_flexion: {
          roles: {
            outside: [sam3d('reilly', 'knee_outside')],
            inside: [sam3d('reilly', 'knee_inside')],
          },
          notes: [
            'cross-over (Reilly, tall at the switch); kroll-2015 SL is cross-under, in the cross-under example: the styles are never pooled',
            'footage vXcjdfBXTiI: SAM 3D Body replaces the RTMPose 2D knee from the same clip; its outside leg comes from the 3D inclination, not the hand-read near ski (which the knees contradicted in 2 of 3 turns)',
          ],
        },
        hip_flexion: { roles: { outside: [reilly('trunk_thigh_outside')], inside: [reilly('trunk_thigh_inside')] } },
        lumbar_flexion: { roles: { turn: [sporriSpine('lumbar', 'SL', 11)] } },
        thoracic_flexion: { roles: { turn: [sporriSpine('thoracic', 'SL', 11)] } },
        pelvis_tilt: { roles: {}, notes: [SAM3D_PELVIS] },
      },
      // The ski-frame trunk pitch ignores the across lean: replaced by the trunk against gravity.
      derived: {
        trunk_gravity: { roles: { turn: [sam3d('reilly', 'trunk_gravity')] }, notes: [GRAVITY_TRANSFER, 'camera up checked against tree trunks'] },
        trunk_across: { roles: { turn: [sam3d('reilly', 'trunk_across')] }, notes: [GRAVITY_TRANSFER, 'side-on: depth-based, σ 12° (errorDeg)'] },
      },
    },
    {
      id: 'short-cross-under-kroll-2015',
      style: EdgeChange.CrossUnder,
      ...keyOf(scenario(RegularTurn.SL, 'dynamic')),
      indexProvenance: 'inferred: the drill’s dynamic scenario (an SL racer; the source gives no speed or radius)',
      coordinates: {
        ...ARMS,
        knee_rotation: kneeRotation(RegularTurn.SL),
        knee_flexion: {
          roles: {
            outside: [kroll('slalom.outside.knee_flexion', 'outside')],
            inside: [{ ...range('kroll-2015', 'inside knee flexion 62–100, SL, one FIS racer (Table 1)', [62, 100], 'range-only measured (Table 1)', 5, 'flexion = 180 − knee angle, as ISB knee_flexion'), style: EdgeChange.CrossUnder }],
          },
          notes: ['kroll-2015 Fig 1A inside knee is read only to t 0.55 ("flexes" after), so the inside takes its Table 1 range', 'cross-under: legs fold through the edge change (flexion transition); a cross-under SAM 3D clip is still to come'],
        },
        lumbar_flexion: { roles: { turn: [sporriSpine('lumbar', 'SL', 11)] } },
        thoracic_flexion: { roles: { turn: [sporriSpine('thoracic', 'SL', 11)] } },
      },
    },
  ],
  [RegularTurn.Steered]: [
    {
      id: 'medium-intermediate-gao-2025',
      ...keyOf({ ...scenario(RegularTurn.Steered, 'moderate'), speedMps: 11.5, radiusM: 17.6 }),
      indexProvenance: 'gao-2025 11.5 m/s and r 17.6 m measured; slope the drill’s moderate one (inferred)',
      coordinates: {
        ...ARMS,
        knee_rotation: kneeRotation(RegularTurn.Steered),
        hip_rotation: { roles: { outside: [range('gao-2025', 'outside hip rotation, one intermediate', [-4, 10], 'range-only (eye, Fig 5)', 3, ROT)] } },
        hip_adduction: { roles: { outside: [range('gao-2025', 'outside hip abduction ≈20', [-20, -20], 'range-only (eye, Fig 5)', 5, ABD)] } },
        knee_flexion: {
          roles: {
            outside: [range('gao-2025', 'knee flexion 40–67 right / 40–80 left; which leg is outside is not read', [40, 80], 'range-only (eye, Fig 5)', 5, FLEX), sam3d('sce', 'knee_outside')],
            inside: [sam3d('sce', 'knee_inside')],
          },
          notes: [SCE_TRANSFER, 'sce figure ≈300 px, under the 400 px the side-on check covers: σ stays single-source wide'],
        },
        pelvis_tilt: { roles: {}, notes: [SAM3D_PELVIS] },
      },
      derived: { trunk_pitch: { roles: { turn: [sam3d('sce', 'trunk_pitch')] }, notes: [SCE_TRANSFER, 'sce trunk vs gravity not used: a follow-cam that rolls with its own skier’s turns, no vertical reference'] } },
    },
  ],
  [RegularTurn.Moguls]: [
    {
      id: 'moguls-elite-ranges',
      ...keyOf(scenario(RegularTurn.Moguls, 'dynamic')),
      indexProvenance: 'inferred: the drill’s dynamic scenario (elite and WC skiers)',
      coordinates: {
        knee_flexion: {
          roles: {},
          notes: ['ando-2024 dropped: no record of the study found', 'no outside/inside split', 'riku-2007: 50–60° change per turn (both knees, 6 WC/EC); an amplitude check, not fitted'],
        },
        ankle_dorsiflexion: {
          roles: both([range('arndt-1992', 'ankle ≈10 → 45, left leg, 3 elite', [10, 45], 'range-only measured (pp67-68)', 5, 'dorsiflexion +, as ISB', 3)]),
          notes: ['impact-referenced, left leg only: no outside/inside split'],
        },
        hip_flexion: { roles: {}, notes: ['arndt-1992 p78: to ≈130 at peak absorption (a peak only, not fitted)'] },
      },
    },
  ],
};

/** Drills that ski another's turn closely enough to borrow its sources. */
export const ALIASES: Readonly<Record<string, { readonly from: string; readonly why: string }>> = {
  'turns-on-the-tops': { from: RegularTurn.Moguls, why: 'inferred: a mogul line; no source measures it alone' },
  'round-line': { from: RegularTurn.Moguls, why: 'inferred: a mogul line; no source measures it alone' },
  'closed-stance-short-turns': { from: RegularTurn.SL, why: 'inferred: short turns with the feet closer; no source measures it alone' },
};

/** Turning drills with no source: every coordinate neutral. */
export const NEUTRAL_DRILLS: ReadonlyArray<string> = [RegularTurn.Steeps, RegularTurn.Powder, 'stork-turns', 'dolphin-turns'];

// --- Combination and fitting ---------------------------------------------------------------------

export const limitDeg = (base: string): readonly [number, number] => {
  const l = JOINT_LIMITS[parityOf(`${base}.R`) === Parity.Sided && JOINT_LIMITS[`${base}.R`] !== undefined ? `${base}.R` : base];
  if (l === undefined) throw new Error(`no limit for ${base}`);
  return [l.lower.value / DEG, l.upper.value / DEG];
};

export const isSided = (base: string): boolean => JOINT_LIMITS[`${base}.R`] !== undefined;

/** Where the gear holds a coordinate tighter than the joint, or its neutral is not mid-limit: the neutral prior's range. */
const GEAR_RANGE: Readonly<Record<string, { readonly range: readonly [number, number]; readonly note: string }>> = {
  ankle_dorsiflexion: {
    range: [(CUFF['ankle_dorsiflexion.R']?.[0] ?? 0) / DEG, (CUFF['ankle_dorsiflexion.R']?.[1] ?? 0) / DEG],
    note: 'in a ski boot: neutral μ mid the cuff’s range, ±2σ that range (equipment.ts forward lean, typical, inferred, + CUFF_FLEX_RANGE, demsar-2015, inferred)',
  },
  knee_rotation: {
    range: [-2 * SINGLE_WIDE, 2 * SINGLE_WIDE],
    note: 'no source for this role: neutral μ 0 at the standing pose, σ SINGLE_WIDE (inferred)',
  },
};
/** The range a sourceless role's neutral prior spans: the gear's where it binds, else the joint's. */
export const neutralRange = (base: string): readonly [number, number] => GEAR_RANGE[base]?.range ?? limitDeg(base);
const isRoot = (base: string): boolean => base.startsWith('pelvis_');
const isLocked = (base: string): boolean => base === 'subtalar_inversion';

export const PHI: ReadonlyArray<number> = Array.from({ length: GRID }, (_, j) => j / GRID);
/** The grid with φ = 1 as well: the seam blend needs each turn's end. */
export const CLOSED: ReadonlyArray<number> = [...PHI, 1];

const sourceValues = (s: CurveSource): ReadonlyArray<number> => {
  const c = register(s.curve, s.anchors);
  return CLOSED.map((p) => (s.span === undefined || (p >= s.span[0] - 1e-9 && p <= s.span[1] + 1e-9) ? sample(c, p) : Number.NaN));
};

const mean = (xs: ReadonlyArray<number>): number => xs.reduce((a, b) => a + b, 0) / xs.length;
const sd = (xs: ReadonlyArray<number>): number => Math.sqrt(xs.reduce((a, x) => a + (x - mean(xs)) ** 2, 0) / (xs.length - 1));

export interface RoleTarget {
  readonly mu: ReadonlyArray<number>;
  readonly sigma: ReadonlyArray<number>;
  readonly provenance: RoleProvenance;
}

const use = (s: Source): SourceUse => ({
  id: s.id,
  what: s.what,
  status: s.status,
  n: s.n,
  errorDeg: s.errorDeg,
  mapping: s.mapping,
  ...(s.method === undefined ? {} : { method: s.method }),
  ...(s.style === undefined ? {} : { style: s.style }),
  warp: isCurve(s) ? s.warp : 'none: a range has no timing',
});

const STRENGTH: ReadonlyArray<Evidence> = [Evidence.Measured, Evidence.Digitised, Evidence.EyeRead, Evidence.Footage, Evidence.RangeOnly];

/** μ and σ on the phase grid from one role's sources; ranges take the curves' shape, rescaled to the range. */
export const combine = (sources: ReadonlyArray<Source>, limits: readonly [number, number]): RoleTarget => {
  if (sources.length === 0) {
    const [lo, hi] = limits;
    return { mu: CLOSED.map(() => (lo + hi) / 2), sigma: CLOSED.map(() => (hi - lo) / 4), provenance: { evidence: Evidence.Neutral, sigma: SigmaFrom.Neutral, sources: [] } };
  }
  const styles = new Set(sources.flatMap((s) => (s.style === undefined ? [] : [s.style])));
  if (styles.size > 1) throw new Error(`combine: ${sources.map((s) => s.id).join(', ')} mix transition styles ${[...styles].join(', ')}`);
  const curves = sources.filter(isCurve).map(sourceValues);
  const shape = CLOSED.map((_, j) => {
    const xs = curves.map((c) => c[j] ?? Number.NaN).filter(Number.isFinite);
    return xs.length === 0 ? 0 : mean(xs);
  });
  const [smin, smax] = [Math.min(...shape), Math.max(...shape)];
  const rows = sources.map((s, i) => {
    if (isCurve(s)) return curves[sources.slice(0, i).filter(isCurve).length] ?? [];
    const [lo, hi] = s.range;
    return shape.map((v) => (smax > smin ? lo + ((v - smin) * (hi - lo)) / (smax - smin) : (lo + hi) / 2));
  });
  const err = Math.max(...sources.map((s) => s.errorDeg));
  const single = sources.length === 1;
  const only = sources[0];
  const rangeSigma = only !== undefined && !isCurve(only) ? (only.range[1] - only.range[0]) / 4 : 0;
  const mu: number[] = [];
  const sigma: number[] = [];
  let between = 0;
  CLOSED.forEach((_, j) => {
    const xs = rows.map((r) => r[j] ?? Number.NaN).filter(Number.isFinite);
    mu.push(mean(xs));
    if (xs.length >= 2) {
      between++;
      sigma.push(Math.max(sd(xs), err, SIGMA_FLOOR));
    } else sigma.push(Math.max(only?.sdDeg ?? SINGLE_WIDE, err, rangeSigma));
  });
  const evidence = STRENGTH.find((e) => sources.some((s) => s.evidence === e)) ?? Evidence.Inferred;
  const sigmaFrom = single ? (only?.sdDeg !== undefined ? SigmaFrom.SourceSd : rangeSigma >= SINGLE_WIDE ? SigmaFrom.Range : SigmaFrom.SingleSourceWide) : between === CLOSED.length ? SigmaFrom.BetweenSources : SigmaFrom.SingleSourceWide;
  return { mu, sigma, provenance: { evidence, sigma: sigmaFrom, sources: sources.map(use) } };
};

/** Half-width of the seam blend: the transition phase, edge change to initiation. */
export const SEAM = PHASE_T.initiation;
const smooth = (x: number): number => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));

export interface CycleSamples {
  readonly omega: number[];
  readonly mu: number[];
  readonly sigma: number[];
  /** μ before the seam blend. */
  readonly raw: number[];
  /** How far the seam blend moved μ: half the sources' own mismatch across the edge change. */
  readonly blend: number[];
}

/**
 * The coordinate's cycle samples: a sided one's right leg is outside in turn 0 and inside in turn 1.
 * Where one turn's end doesn't meet the next turn's start (windows not switch to switch, roles from
 * different sources), both sides of the edge change are blended to the midpoint and σ widened by it.
 */
export const cycleSamples = (base: string, targets: Readonly<Partial<Record<Role, RoleTarget>>>): CycleSamples => {
  const out: CycleSamples = { omega: [], mu: [], sigma: [], raw: [], blend: [] };
  const sided = isSided(base);
  const segs = (sided ? [targets[Role.Outside], targets[Role.Inside]] : [targets[Role.Turn]]).filter((t): t is RoleTarget => t !== undefined);
  const sign = !sided && parityOf(base) === Parity.Odd ? -1 : 1;
  segs.forEach((t, i) => {
    const other = segs[(i + 1) % segs.length] ?? t;
    const s = sided ? 1 : sign;
    const dEnd = s * (other.mu[0] ?? 0) - (t.mu[GRID] ?? 0);
    const dStart = (t.mu[0] ?? 0) - s * (other.mu[GRID] ?? 0);
    PHI.forEach((p, j) => {
      const b = (dEnd / 2) * smooth((p - (1 - SEAM)) / SEAM) - (dStart / 2) * smooth((SEAM - p) / SEAM);
      const raw = t.mu[j] ?? 0;
      out.omega.push(Math.PI * (p + i));
      out.raw.push(raw);
      out.mu.push(raw + b);
      out.blend.push(Math.abs(b));
      out.sigma.push(Math.hypot(t.sigma[j] ?? 0, b));
    });
  });
  return out;
};

export const NEUTRAL_NOTE = 'no source: weak neutral prior (μ mid-range, ±2σ the joint limits)';
export const ROOT_NOTE =
  'root pose: placed by the ski and balance constraints; a prior here would target derived outputs (list, lead, comAhead); pelvis_tilt alone may carry one, the measured pelvis pitch on the heading-relative root';

export const buildCoordinate = (base: string, def: CoordinateDef | undefined): CoordinatePrior => {
  const parity = isSided(base) ? Parity.Sided : parityOf(base);
  const sourced = Object.values(def?.roles ?? {}).some((r) => r.length > 0);
  // Pelvis tilt is an orientation a source can measure; the root's other coordinates are derived outputs.
  if (isRoot(base) && !(base === 'pelvis_tilt' && sourced))
    return { parity, mu: null, logSigma: null, provenance: { roles: { turn: { evidence: Evidence.None, sigma: null, sources: [] } }, notes: [ROOT_NOTE, ...(def?.notes ?? [])] } };
  if (isLocked(base)) {
    return { parity, mu: null, logSigma: null, provenance: { roles: { outside: { evidence: Evidence.Locked, sigma: null, sources: [] }, inside: { evidence: Evidence.Locked, sigma: null, sources: [] } }, notes: ['held by the boot'] } };
  }
  const roles: ReadonlyArray<Role> = isSided(base) ? [Role.Outside, Role.Inside] : [Role.Turn];
  const targets = Object.fromEntries(roles.map((r) => [r, combine(def?.roles[r] ?? [], neutralRange(base))])) as Partial<Record<Role, RoleTarget>>;
  const gear = roles.some((r) => (def?.roles[r] ?? []).length === 0) ? GEAR_RANGE[base]?.note : undefined;
  const c = cycleSamples(base, targets);
  const sigmaParity = parity === Parity.Sided ? Parity.Sided : Parity.Even;
  return {
    parity,
    mu: fitSeries(c.omega, c.mu, parity, MU_ORDER),
    logSigma: fitSeries(c.omega, c.sigma.map(Math.log), sigmaParity, SIGMA_ORDER),
    provenance: { roles: Object.fromEntries(roles.map((r) => [r, targets[r]?.provenance])), notes: def === undefined ? [gear ?? NEUTRAL_NOTE] : [...(def.notes ?? []), ...(gear === undefined ? [] : [gear])] },
  };
};

const names = (base: string): ReadonlyArray<string> => (isSided(base) ? [`${base}.R`, `${base}.L`] : [base]);

const r = (x: number, d = 10): number => Math.round(x * d) / d;

/** Runs of grid phases where μ ± σ passes a joint limit, with the worst value; reported, never clipped. Turn 1 mirrors turn 0. */
export const limitFlags = (coordinates: Readonly<Record<string, CoordinatePrior>>): LimitFlag[] => {
  const out: LimitFlag[] = [];
  for (const [base, c] of Object.entries(coordinates)) {
    if (c.mu === null) continue;
    const [lo, hi] = limitDeg(base);
    for (const name of names(base))
      for (const [side, bound] of [[-1, lo], [1, hi]] as const) {
        let run: { from: number; to: number; worst: number } | null = null;
        const close = (): void => {
          if (run !== null) out.push({ coordinate: name, phi: [r(run.from, 1000), r(run.to, 1000)], value: r(run.worst), bound: r(bound) });
          run = null;
        };
        for (const p of PHI) {
          const v = evalDeg(c, name, p);
          const x = v === null ? Number.NaN : v.mu + side * v.sigma;
          if (!(side * (x - bound) > 0)) {
            close();
            continue;
          }
          run = run === null ? { from: p, to: p, worst: x } : { from: run.from, to: p, worst: side * x > side * run.worst ? x : run.worst };
        }
        close();
      }
  }
  return out;
};

/** A derived quantity's prior: unsided and even, so turn 1 repeats turn 0. */
export const buildDerived = (name: string, def: CoordinateDef): CoordinatePrior => {
  const t = combine(def.roles[Role.Turn] ?? [], [-90, 90]);
  const c = cycleSamples(name, { [Role.Turn]: t });
  return {
    parity: Parity.Even,
    mu: fitSeries(c.omega, c.mu, Parity.Even, MU_ORDER),
    logSigma: fitSeries(c.omega, c.sigma.map(Math.log), Parity.Even, SIGMA_ORDER),
    provenance: { roles: { turn: t.provenance }, notes: def.notes ?? [] },
  };
};

export const buildExample = (def: ExampleDef): Example => {
  const coordinates = Object.fromEntries(BASE_NAMES.map((b) => [b, buildCoordinate(b, def.coordinates[b])]));
  const derived = Object.fromEntries(Object.entries(def.derived ?? {}).map(([k, d]) => [k, buildDerived(k, d)]));
  return { id: def.id, arcLoad: Math.round(def.arcLoad * 1e4) / 1e4, lean: Math.round(def.lean * 1e4) / 1e4, indexProvenance: def.indexProvenance, coordinates, derived, limitFlags: limitFlags(coordinates) };
};

const NEUTRAL_EXAMPLE: ExampleDef = { id: 'neutral', arcLoad: 1, lean: 0, indexProvenance: 'one neutral example: the index is unused', coordinates: {} };

export const buildPriors = (): PriorFile => {
  const drills: Record<string, Partial<Record<EdgeChange, ReadonlyArray<Example>>>> = {};
  for (const [drill, defs] of Object.entries(EXAMPLES)) {
    const sets: Partial<Record<EdgeChange, Example[]>> = {};
    for (const d of defs) (sets[d.style ?? EdgeChange.Unstated] ??= []).push(buildExample(d));
    drills[drill] = sets;
  }
  for (const drill of NEUTRAL_DRILLS) drills[drill] = { [EdgeChange.Unstated]: [buildExample(NEUTRAL_EXAMPLE)] };
  const turns = REILLY.turns;
  return {
    unit: 'deg',
    turn0: 'a left turn, the right leg outside; ω = π(φ + turn), the left side half a cycle later',
    drills,
    aliases: ALIASES,
    events: EVENTS,
    evidence: {
      note: 'Range and timing evidence for derived outputs: never prior terms.',
      'regular-sl.trunk_pitch_vs_image_vertical': {
        source: REILLY.clip,
        status: 'footage, image-plane; the camera is not level with the snow, so only the range and timing hold',
        phi: REILLY.phi,
        turns: turns.map((t) => t.trunk_pitch),
      },
      edge_change_style: 'unstated holds a drill’s default examples; a cross-over or cross-under key holds examples whose sources show that style, never pooled across styles. regular-sl: the default is cross-over (Reilly), cross-under from kroll-2015 SL. The drills’ crossUnder-by-intensity is not read here.',
    },
  };
};

// Number arrays on one line; the rest indented.
export const format = (x: unknown): string => `${JSON.stringify(x, null, 1).replace(/\[\n\s*(-?[\d.e+-]+(?:,\n\s*-?[\d.e+-]+)*)\n\s*\]/g, (_, body: string) => `[${body.replace(/,\n\s*/g, ', ')}]`)}\n`;

if (import.meta.main) {
  const text = format(buildPriors());
  if (process.argv.includes('--check')) {
    if (readFileSync(PRIORS_FILE, 'utf8') !== text) {
      console.error('priors.json is stale: run bun run priors');
      process.exit(1);
    }
  } else writeFileSync(PRIORS_FILE, text);
}
