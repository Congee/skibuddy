import { INTENSITIES } from '../../content/schema';
import type { Intensity } from '../../content/schema';
import { edgeGoalAt, Snow } from '../../physics/edge';
import { feasibilityOf, eventsOf, taskFor } from '../../physics/task';
import { MOGUL_LEAN_RATIO_BAND } from '../../physics/moguls';
import { counterBandAt, mogulLineFor, turnProfile } from '../../physics/turn';
import { kindOfDrill } from '../poses/regular-turn';
import { EQUIPMENT, minShinAngle } from '../equipment';
import { ANKLE_DORSIFLEXION_KNEE_FLEXED, JOINT_LIMITS } from '../joint-limits';
import { COORDINATES, SEGMENT_NAMES, Side } from '../skeleton';
import { surfaceFor } from '../surface';
import { shinPitch } from './cuff';
import { forward, skiFrame, value } from './fk';
import { MIGRATED, Q_FRAMES, qTable, STORED_Q } from './q-table';
import type { QTables } from './q-table';
import { buildTurnProblem, centreOfMassOf, chestTwistDeg, counterDeg, edgeOf, massHeightOf, NAMES, pelvisToFallDeg, reportOf } from './turn';
import type { PeakValues } from './turn';

const DEG = Math.PI / 180;
/** Crouch floor, leg lengths (motion-model §10, T2). */
const COM_FLOOR = 0.6;

/** sporri-2016 Table 1, GS 25/10-m loaded-phase torsion maximum 8.9 + 2 × 3.2 deg: the larger of its groups' mean + 2 SD. */
const CHEST_TWIST_MAX_DEG = 15.3;

/** Model-level gates over a solved turn (docs/motion-model.md §8). */
export const Gate = {
  EdgeBand: 'edgeBand',
  Counter: 'counter',
  ChestTwist: 'chestTwist',
  HipRotation: 'hipRotation',
  InsideKnee: 'insideKnee',
  InsideLead: 'insideLead',
  ShinCuff: 'shinCuff',
  Dorsiflexion: 'dorsiflexion',
  Contact: 'contact',
  MogulHips: 'mogulHips',
  MogulLegLean: 'mogulLegLean',
  MogulMassPath: 'mogulMassPath',
  LoadPeak: 'loadPeak',
  Effort: 'effort',
  Prior: 'prior',
  Period: 'period',
  Energy: 'energy',
  ComHeight: 'comHeight',
  Moments: 'moments',
} as const;
export type Gate = (typeof Gate)[keyof typeof Gate];

/** Tolerances: a gate fails when its value exceeds the threshold; q is stored to 1e-4 rad, so FK values carry about 0.01 deg of rounding. */
export const THRESHOLD: Readonly<Record<Gate, { readonly value: number; readonly unit: string; readonly reason: string }>> = {
  [Gate.EdgeBand]: { value: 1, unit: 'deg', reason: 'worst loaded excess of (outside edge - lean) over the kind band (edge.ts marginBandDeg, inferred); 1 deg is the solver edge tolerance' },
  [Gate.Counter]: { value: 0.05, unit: 'deg', reason: 'worst loaded excess of counterOf (pelvis axial rotation in a Grood-Suntay frame against the outside ski levelled onto the snow) over the pelvis-share band: skis\' pivot + share (mass heading - fall line) ± the task tolerance, inferred (motion-model §4.5, counterBandAt); share 1 (moguls) pelvisToFallOf (the same against the fall line) within the tolerance about the fall line' },
  [Gate.ChestTwist]: {
    value: 0.05,
    unit: 'deg',
    reason: `carved: worst loaded |thorax axial rotation vs the pelvis| (Grood-Suntay, chestTwistOf) within ${CHEST_TWIST_MAX_DEG} deg, sporri-2016 Tables 1 and 3 loaded-phase maxima (GS 7.7 ± 3.1, 8.9 ± 3.2; SL 6.6 ± 2.7), the larger mean + 2 SD; racers at higher load, an upper bound for slower carving (inferred); motion-model §8 rule 2`,
  },
  [Gate.HipRotation]: { value: 0.01, unit: 'deg', reason: 'heinrich-2022 Table 1: outside hip internal rotation 5..28, inside external 10..26; carving both ends, other kinds the upper ends (the ranges are one GS instructor, scaled down for slower drills)' },
  [Gate.InsideKnee]: { value: 0.01, unit: 'deg', reason: 'carving: inside knee flexion - outside 10..40 deg while loaded (heinrich-2022: knees 81..114 vs 56..80)' },
  [Gate.InsideLead]: { value: 0.01, unit: 'm', reason: 'FK inside lead against a captured band; none digitised in lit-curves.json or the capture clips' },
  [Gate.ShinCuff]: { value: 0.05, unit: 'deg', reason: 'each shin pitch off the ski base normal at or above the cuff forward lean (equipment.ts minShinAngle)' },
  [Gate.Dorsiflexion]: { value: 0.01, unit: 'deg', reason: 'ankle dorsiflexion between its joint limit and the knee-flexed range (konor-2012, joint-limits.ts)' },
  [Gate.Contact]: { value: 5, unit: 'mm', reason: 'worst of outside and inside lower-edge gaps; boot and ski clearance shortfalls count (TurnReport)' },
  [Gate.MogulHips]: { value: 0.01, unit: 'deg', reason: 'moguls: peak hip-line elevation out of the slope plane toward the lean side, its cycle mean removed, as M2 measures the clips, within their 9.8..23.5 deg; and the mass sweeps less than the skis (motion-model §8.6, §10 T7)' },
  [Gate.MogulLegLean]: { value: 0.01, unit: 'deg', reason: 'moguls: peak |pelvis to ankle midpoint lean| in the (across, slope normal) plane within the clips\' 22..33 deg widened by the methods\' 5 deg spread (motion-model §10, P6)' },
  [Gate.MogulMassPath]: { value: 0.001, unit: 'lean ratio', reason: 'moguls: per frame |solved - physics (mass - ankle mid across) / mass height| within the clips\' spread of r, and the solved peak inside their band (motion-model §10, M2 res.json; measured)' },
  [Gate.LoadPeak]: { value: 0, unit: 'failed checks', reason: 'force peak after the fall line and the load inside the kind band (feasibility rule 4; nakazato-2011, bon-2021)' },
  [Gate.Effort]: { value: 1, unit: 'normalised', reason: 'worst joint effort over its maximum torque (motion-model §6)' },
  [Gate.Prior]: { value: 0, unit: 'share outside 2 sigma', reason: 'every prior term within 2 sigma (TurnReport.priorWithin2Sigma)' },
  [Gate.Period]: { value: 0, unit: 'failed checks', reason: 'motion-model §4.3 rule 5; moguls: surface spacing within 10 % of the task bump spacing' },
  [Gate.Energy]: { value: 0, unit: 'failed checks', reason: 'feasibility rules 7 (the cycle holds its mean speed, γ_e ≤ 20° carved, 35° steered) and 8 (force peak τ 0.4..0.6, nakazato-2011)' },
  [Gate.ComHeight]: { value: 0, unit: 'leg lengths below 0.6', reason: 'crouch floor (motion-model §10, T2): the cycle\'s least CoM height, TurnReport reportOf().comHeight, at or above 0.6 leg lengths on every frame' },
  [Gate.Moments]: { value: 0, unit: 'rows beyond 2σ', reason: 'heinrich-2022 Table 2 and Fig 5: outside-leg and lumbar moments at the force peak per BW of outside force (σ MOMENT_SIGMA); inside hip rotation internal and ≤ 2 × his 0.23 N·m/kg (inferred); outside hip rotation in its band' },
};
/** Gates printed but never refusing the bake. */
export const REPORT_ONLY: ReadonlySet<Gate> = new Set([Gate.Moments]);
/** Inside hip rotation moment cap, N·m/kg: 2 × heinrich-2022's 0.23; inferred. */
const INSIDE_HIP_ROTATION_MAX = 0.46;

export interface GateResult {
  readonly value: number;
  readonly threshold: number;
  readonly pass: boolean;
  readonly detail: string;
}

export type GateRecord = Readonly<Partial<Record<Gate, GateResult>>>;

const r4 = (v: number): number => Math.round(v * 1e4) / 1e4;
const f1 = (v: number): string => v.toFixed(1);

/** A result: passes when `value` is within the threshold unless `ok` says otherwise. */
export const resultOf = (g: Gate, v: number, detail: string, ok: boolean = v <= THRESHOLD[g].value + 1e-9): GateResult => ({ value: r4(v), threshold: THRESHOLD[g].value, pass: ok, detail });

/** Not applicable: a pass that says why, never a silent one. */
export const notApplicable = (g: Gate, why: string): GateResult => ({ value: 0, threshold: THRESHOLD[g].value, pass: true, detail: `n/a: ${why}` });

/** Distance outside [lo, hi], 0 inside. */
export const excessOf = (v: number, lo: number, hi: number): number => Math.max(0, lo - v, v - hi);

/** Edge gate over loaded frames: worst excess of the outside edge less the lean outside the margin band, degrees. */
export const edgeBandGate = (frames: ReadonlyArray<{ readonly edgeDeg: number; readonly leanDeg: number }>, minDeg: number, maxDeg: number): GateResult => {
  const worst = Math.max(0, ...frames.map((f) => excessOf(f.edgeDeg - f.leanDeg, minDeg, maxDeg)));
  return resultOf(Gate.EdgeBand, worst, `margin band ${minDeg}..${maxDeg} deg over ${frames.length} loaded frames`);
};

/** The clips' hip-line elevation peaks, 12.5 / 10.0 / 21.6 deg (bumpA, bumpB, jdsB), lowest and highest with their spreads; measured (M2). */
export const MOGUL_HIPS_DEG = [9.8, 23.5] as const;

/**
 * Mogul hips as M2 measures the clips: the hip line's elevation out of the slope plane over one turn, + with the
 * inside hip lower, its peak toward the lean side against MOGUL_HIPS_DEG. The mirrored next turn is its negative, so
 * the cycle's mean, which M2 removes, is nil. And the mass sweeps less than the skis.
 */
export const mogulHipsGate = (elevationDeg: ReadonlyArray<number>, halfSweep: number, skisHalfSweep: number): GateResult => {
  const peak = Math.max(...elevationDeg);
  const straighter = halfSweep < skisHalfSweep;
  const excess = excessOf(peak, ...MOGUL_HIPS_DEG);
  return resultOf(
    Gate.MogulHips,
    excess,
    `hip line peak ${f1(peak)} deg in ${MOGUL_HIPS_DEG[0]}..${MOGUL_HIPS_DEG[1]} deg; mass half sweep ${f1(halfSweep / DEG)} deg vs skis ${f1(skisHalfSweep / DEG)} deg`,
    excess <= THRESHOLD[Gate.MogulHips].value + 1e-9 && straighter,
  );
};

/** The clips' leg lean peaks, 22..33 deg, widened by the methods' spread; measured. */
export const MOGUL_LEG_LEAN_DEG = [17, 38] as const;

/** Mogul leg lean: the peak |pelvis to ankle midpoint lean| across the slope, degrees, against MOGUL_LEG_LEAN_DEG. */
export const mogulLegLeanGate = (leanDeg: ReadonlyArray<number>): GateResult => {
  const peak = Math.max(0, ...leanDeg.map(Math.abs));
  return resultOf(Gate.MogulLegLean, excessOf(peak, ...MOGUL_LEG_LEAN_DEG), `peak leg lean ${f1(peak)} deg in ${MOGUL_LEG_LEAN_DEG[0]}..${MOGUL_LEG_LEAN_DEG[1]} deg`);
};

/** Half the clips' band of r, the spread a frame's lean ratio may stray from the physics'; measured (M2). */
export const MOGUL_LEAN_RATIO_SPREAD = (MOGUL_LEAN_RATIO_BAND[1] - MOGUL_LEAN_RATIO_BAND[0]) / 2;

/**
 * Mogul mass path: the solved mass over the ankle mid leans as the physics' does, (mass - ankle mid across) / mass
 * height per frame, signed alike, within MOGUL_LEAN_RATIO_SPREAD; its peak |ratio| inside MOGUL_LEAN_RATIO_BAND.
 */
export const mogulMassPathGate = (solved: ReadonlyArray<number>, physics: ReadonlyArray<number>): GateResult => {
  const off = Math.max(0, ...solved.map((r, k) => Math.abs(r - (physics[k] ?? 0))));
  const peak = Math.max(0, ...solved.map(Math.abs));
  const excess = Math.max(excessOf(off, 0, MOGUL_LEAN_RATIO_SPREAD), excessOf(peak, ...MOGUL_LEAN_RATIO_BAND));
  return resultOf(
    Gate.MogulMassPath,
    excess,
    `worst |solved - physics| lean ratio ${off.toFixed(3)} <= ${MOGUL_LEAN_RATIO_SPREAD.toFixed(4)}; peak ${peak.toFixed(3)} in ${MOGUL_LEAN_RATIO_BAND[0]}..${MOGUL_LEAN_RATIO_BAND[1]}`,
  );
};

/** Solved and physics lean ratios per frame, the solve's world x signed as the physics' across (toward the inside) by the skis' line. */
const mogulRatiosOf = (task: ReturnType<typeof taskFor>, ts: ReadonlyArray<number>, ankleMids: ReadonlyArray<number>, solved: ReadonlyArray<number>): [number[], number[]] => {
  const { track, mass } = mogulLineFor(task).ride;
  const n = track.across.length;
  const at = (t: number): number => Math.round(t * n) % n;
  const sign = Math.sign(ts.reduce((a, t, k) => a + (track.across[at(t)] ?? 0) * (ankleMids[k] ?? 0), 0)) || 1;
  const physics = ts.map((t) => ((mass.across[at(t)] ?? 0) - (track.across[at(t)] ?? 0)) / (mass.clearance[at(t)] ?? 1));
  return [solved.map((r) => sign * r), physics];
};

/** heinrich-2022 Table 1, degrees. */
const HIP_OUT_INTERNAL = [5, 28] as const;
const HIP_IN_EXTERNAL = [10, 26] as const;
const KNEE_DIFF = [10, 40] as const;

const worst = (xs: ReadonlyArray<number>): number => Math.max(0, ...xs);

const at = (name: string): number => {
  const i = COORDINATES.findIndex((c) => c.name === name);
  if (i < 0) throw new Error(`no coordinate ${name}`);
  return i;
};
const I = {
  hipOutRot: at('hip_rotation.R'),
  hipInRot: at('hip_rotation.L'),
  kneeOut: at('knee_flexion.R'),
  kneeIn: at('knee_flexion.L'),
  ankleOut: at('ankle_dorsiflexion.R'),
  ankleIn: at('ankle_dorsiflexion.L'),
  list: at('pelvis_list'),
};
const LEAD = COORDINATES.length;

/** The stored inside edges, or null for a bake that predates them (the goal's own sign then stands). */
const edgesOf = (drill: string, intensity: Intensity, tables: QTables): Uint8Array | null => {
  const text = (tables as Partial<QTables>).edges?.[drill]?.[intensity];
  return text === undefined ? null : Uint8Array.from(text, Number);
};

/** Gates over one baked cycle of `drill` × `intensity`; {} for a drill with no model kind. `edges` default to the stored solve's. */
export const gateTurn = (
  drill: string,
  intensity: Intensity,
  q: ReadonlyArray<ArrayLike<number>>,
  edges: Uint8Array | null = edgesOf(drill, intensity, STORED_Q),
  frames: number = Q_FRAMES,
): GateRecord => {
  const kind = kindOfDrill(drill);
  if (kind === null) return {};
  const tp = buildTurnProblem(drill, intensity, { frames });
  if (q.length !== tp.goals.length) throw new Error(`${drill} ${intensity}: ${q.length} frames, expected ${tp.goals.length}`);
  if (edges !== null) tp.insideEdges.set(edges);
  const task = taskFor(kind, intensity);
  const snow = task.snow ?? Snow.HardGroomed;
  const profile = turnProfile(task, snow);
  const events = eventsOf(task, snow);
  const x = new Float64Array(tp.cycle.size);
  q.forEach((f, k) => x.set(Array.from({ length: NAMES.length }, (_, i) => f[i] ?? 0), k * NAMES.length));
  const report = reportOf(tp, x);

  const loadedEdge: Array<{ edgeDeg: number; leanDeg: number }> = [];
  const counterOver: number[] = [];
  const counterVals: number[] = [];
  const twists: number[] = [];
  const hipOver: number[] = [];
  const kneeOver: number[] = [];
  const shinOver: number[] = [];
  const dorsiOver: number[] = [];
  const lists: number[] = [];
  const legLeans: number[] = [];
  const bandLo: number[] = [];
  const bandHi: number[] = [];
  const massRatios: number[] = [];
  const ankleMids: number[] = [];
  const aboutFall = counterBandAt(task, 0, snow).aboutFallLine;
  const carved = task.skidShare === 0;
  const bumps = task.bumpHeightM > 0;
  const minShin = minShinAngle(EQUIPMENT) / DEG;
  const ankleLo = JOINT_LIMITS['ankle_dorsiflexion.R']?.lower.value ?? -Infinity;
  const ankleHi = ANKLE_DORSIFLEXION_KNEE_FLEXED.value;

  tp.goals.forEach((g, k) => {
    const f = Array.from(q[k] ?? []);
    const w = forward(f.slice(0, LEAD), g.origin, SEGMENT_NAMES, g.ref);
    const out = skiFrame(w, Side.Right);
    const loaded = profile.at(g.t).arcShare > 0.5;
    if (loaded) {
      const band = counterBandAt(task, g.t, snow);
      const yaw = band.aboutFallLine ? pelvisToFallDeg(w, g.normal) : counterDeg(w, g.normal);
      counterVals.push(yaw);
      counterOver.push(excessOf(yaw, band.minDeg, band.maxDeg));
      bandLo.push(band.minDeg);
      bandHi.push(band.maxDeg);
    }
    for (const side of [Side.Right, Side.Left]) {
      const df = (f[side === Side.Right ? I.ankleOut : I.ankleIn] ?? 0);
      dorsiOver.push(excessOf(df, ankleLo, ankleHi) / DEG);
      shinOver.push(Math.max(0, minShin - value(shinPitch(w, side)) / DEG));
    }
    const [pelvis, fr, fl, hr, hl] = [w['pelvis'], w['foot.R'], w['foot.L'], w['femur.R'], w['femur.L']];
    if (hr !== undefined && hl !== undefined) {
      // The hip line, outside (R) to inside (L) hip; the inside hip lower is +.
      const h = [0, 1, 2].map((j) => value(hl.p[j as 0 | 1 | 2]) - value(hr.p[j as 0 | 1 | 2]));
      const along = (h[0] ?? 0) * g.normal[0] + (h[1] ?? 0) * g.normal[1] + (h[2] ?? 0) * g.normal[2];
      lists.push(-Math.asin(along / Math.hypot(...h)) / DEG);
    }
    if (pelvis !== undefined && fr !== undefined && fl !== undefined) {
      // The slope frame: x across, y the mean slope's normal.
      const d = [0, 1].map((j) => value(pelvis.p[j as 0 | 1]) - (value(fr.p[j as 0 | 1]) + value(fl.p[j as 0 | 1])) / 2);
      legLeans.push(Math.atan2(d[0] ?? 0, d[1] ?? 1) / DEG);
    }
    if (bumps && fr !== undefined && fl !== undefined) {
      const mid = (value(fr.p[0]) + value(fl.p[0])) / 2;
      ankleMids.push(mid);
      massRatios.push((value(centreOfMassOf(w)[0]) - mid) / value(massHeightOf(w, tp.ski, g, tp.insideEdges[2 * k] ?? 0)));
    }
    if (!loaded) return;
    loadedEdge.push({ edgeDeg: value(edgeOf(out, g.normal)) / DEG, leanDeg: edgeGoalAt(task, g.t).leanDeg });
    twists.push(Math.abs(chestTwistDeg(w)));
    const outRot = (f[I.hipOutRot] ?? 0) / DEG;
    const inExt = -(f[I.hipInRot] ?? 0) / DEG;
    hipOver.push(
      carved
        ? Math.max(excessOf(outRot, ...HIP_OUT_INTERNAL), excessOf(inExt, ...HIP_IN_EXTERNAL))
        : Math.max(excessOf(outRot, -Infinity, HIP_OUT_INTERNAL[1]), excessOf(inExt, -Infinity, HIP_IN_EXTERNAL[1])),
    );
    kneeOver.push(excessOf(((f[I.kneeIn] ?? 0) - (f[I.kneeOut] ?? 0)) / DEG, ...KNEE_DIFF));
  });

  const feas = feasibilityOf(task, snow);
  // A rule the check omits is n/a on groomed snow (5 and 7 are bump rules), a fail on bumps.
  const rule = (n: number): { ok: boolean; detail: string; na: boolean } => {
    const r = feas.find((c) => c.rule === n);
    const na = r === undefined && task.bumpHeightM <= 0;
    return { ok: r?.ok ?? na, detail: r?.detail ?? (na ? 'n/a on groomed snow' : `rule ${n} missing`), na };
  };
  const range = (xs: ReadonlyArray<number>): string => (xs.length === 0 ? 'no frames' : `${f1(Math.min(...xs))}..${f1(Math.max(...xs))}`);
  const edgeBand = edgeBandGate(loadedEdge, edgeGoalAt(task, 0).marginMinDeg, edgeGoalAt(task, 0).marginMaxDeg);

  // Equal by construction since surfaceFor sizes the zipper from the task; kept as a guard.
  const surfaceSpacing = surfaceFor(drill, intensity).spacing;
  const spacingErr = task.bumpSpacingM === undefined ? 0 : Math.abs(surfaceSpacing / task.bumpSpacingM - 1);
  const loadRule = rule(4);
  const periodRule = rule(5);
  const [energyRule, peakRule] = [rule(7), rule(8)];
  const energyFails = Number(!energyRule.ok) + Number(!peakRule.ok);
  const energyNa = energyRule.na && peakRule.na;
  const speedNote = `; mean v ${task.speedMps.toFixed(2)} m/s, v ${Math.min(...profile.speed).toFixed(2)}..${Math.max(...profile.speed).toFixed(2)} m/s, γ_e ${f1(profile.gammaE)} deg`;
  const loadFails = Number(!(events.forcePeak > events.fallLine)) + Number(!loadRule.ok);
  const periodFails = Number(!periodRule.ok) + Number(bumps && spacingErr > 0.1);
  const mean = (xs: ReadonlyArray<number>): string => (xs.length === 0 ? '' : f1(xs.reduce((a, b) => a + b, 0) / xs.length));

  const moments = momentsGate(report.peak);
  const contactMm = Math.max(report.outsideContact, report.insideContact, -report.bootClearance, -report.skiClearance, 0) * 1000;
  const effort = Math.max(0, ...report.effortWorst.map((e) => Math.abs(e.z)));

  return {
    [Gate.EdgeBand]: edgeBand,
    [Gate.Counter]: resultOf(Gate.Counter, worst(counterOver), `${aboutFall ? 'pelvis vs fall line' : 'pelvis - outside ski'} loaded yaw ${range(counterVals)} deg (mean ${mean(counterVals)}) in the per-frame band (${range(bandLo)})..(${range(bandHi)})`),
    [Gate.ChestTwist]: carved
      ? resultOf(Gate.ChestTwist, excessOf(worst(twists), 0, CHEST_TWIST_MAX_DEG), `loaded |chest twist| peak ${f1(worst(twists))} deg <= ${CHEST_TWIST_MAX_DEG} (sporri-2016 racers)`)
      : notApplicable(Gate.ChestTwist, 'carving only (sporri-2016 measured carved race turns)'),
    [Gate.HipRotation]: resultOf(Gate.HipRotation, worst(hipOver), `loaded excess over heinrich-2022 (${carved ? 'both ends' : 'upper ends'})`),
    [Gate.InsideKnee]:
      carved ? resultOf(Gate.InsideKnee, worst(kneeOver), `inside - outside knee flexion in ${KNEE_DIFF[0]}..${KNEE_DIFF[1]} deg while loaded`) : notApplicable(Gate.InsideKnee, 'carving only'),
    [Gate.InsideLead]: notApplicable(Gate.InsideLead, 'no captured inside-lead band in lit-curves.json or the capture clips'),
    [Gate.ShinCuff]: resultOf(Gate.ShinCuff, worst(shinOver), `shin pitch at or above ${f1(minShin)} deg`),
    [Gate.Dorsiflexion]: resultOf(Gate.Dorsiflexion, worst(dorsiOver), `ankle dorsiflexion in ${f1(ankleLo / DEG)}..${f1(ankleHi / DEG)} deg`),
    [Gate.Contact]: resultOf(Gate.Contact, contactMm, `outside ${f1(report.outsideContact * 1000)} mm, inside ${f1(report.insideContact * 1000)} mm, boot clearance ${f1(report.bootClearance * 1000)} mm, ski clearance ${f1(report.skiClearance * 1000)} mm, bend lift ${f1(report.bendLift * 1000)} mm`),
    [Gate.MogulHips]:
      bumps
        ? mogulHipsGate(lists, profile.halfSweep, profile.skisHalfSweep)
        : notApplicable(Gate.MogulHips, `moguls only (hip line ${MOGUL_HIPS_DEG[0]}..${MOGUL_HIPS_DEG[1]} deg)`),
    [Gate.MogulLegLean]: bumps ? mogulLegLeanGate(legLeans) : notApplicable(Gate.MogulLegLean, 'moguls only'),
    [Gate.MogulMassPath]: bumps ? mogulMassPathGate(...mogulRatiosOf(task, tp.goals.map((g) => g.t), ankleMids, massRatios)) : notApplicable(Gate.MogulMassPath, 'moguls only'),
    [Gate.LoadPeak]: resultOf(Gate.LoadPeak, loadFails, `force peak ${events.forcePeak.toFixed(2)} vs fall line ${events.fallLine.toFixed(2)}; ${loadRule.detail}`),
    [Gate.Effort]: resultOf(Gate.Effort, effort, `worst joint effort ${effort.toFixed(2)}`),
    [Gate.Prior]: resultOf(Gate.Prior, 1 - report.priorWithin2Sigma, `${(report.priorWithin2Sigma * 100).toFixed(1)} % of prior terms within 2 sigma`, report.priorWithin2Sigma === 1),
    [Gate.Period]: periodRule.na
      ? notApplicable(Gate.Period, 'bump period only (rule 5)')
      : resultOf(Gate.Period, periodFails, `${periodRule.detail}${bumps ? `; surface spacing ${surfaceSpacing.toFixed(2)} vs task ${task.bumpSpacingM} m` : ''}${speedNote}`),
    [Gate.Energy]: energyNa ? notApplicable(Gate.Energy, 'no energy rule on this task') : resultOf(Gate.Energy, energyFails, `rule 7: ${energyRule.detail}; rule 8: ${peakRule.detail}`),
    [Gate.ComHeight]: resultOf(Gate.ComHeight, Math.max(0, COM_FLOOR - report.comHeight[0]), `least CoM height ${report.comHeight[0].toFixed(3)} leg lengths (floor ${COM_FLOOR})`),
    [Gate.Moments]: moments,
  };
};

/** Force-peak moments: point rows beyond 2σ, the inside hip's rotation sign and size, the outside hip rotation band. */
export const momentsGate = (peak: PeakValues | null): GateResult => {
  if (peak === null) return notApplicable(Gate.Moments, 'no kind events');
  const beyond = peak.banded ? peak.moments.filter((m) => Math.abs(m.z) > 2).length : 0;
  const ins = peak.insideHipRotation;
  const insideOk = ins >= 0 && ins <= INSIDE_HIP_ROTATION_MAX;
  const outRot = peak.moments.find((m) => m.target.name === 'hip_rotation.R');
  const outsideOk = outRot === undefined || (outRot.perBW >= outRot.target.lo && outRot.perBW <= outRot.target.hi);
  const outText = outRot === undefined ? '' : `; outside hip rotation ${outRot.perBW.toFixed(2)} per BW in ${outRot.target.lo}..${outRot.target.hi}: ${outsideOk ? 'yes' : 'no'}`;
  return resultOf(
    Gate.Moments,
    beyond,
    `${peak.banded ? `${beyond} of ${peak.moments.length} point rows beyond 2σ` : 'no moment rows for this kind'}; inside hip rotation ${ins.toFixed(2)} N·m/kg in 0..${INSIDE_HIP_ROTATION_MAX}: ${insideOk ? 'yes' : 'no'}${outText}`,
    beyond === 0 && insideOk && outsideOk,
  );
};

export interface GateRow {
  readonly drill: string;
  readonly intensity: Intensity;
  readonly gates: GateRecord;
}

/** Gates over every migrated drill × intensity of `tables`. */
export const gateAll = (tables: QTables = STORED_Q): ReadonlyArray<GateRow> =>
  [...MIGRATED].flatMap((drill) =>
    INTENSITIES.flatMap((intensity) => {
      const q = qTable(drill, intensity, tables);
      return q === null ? [] : [{ drill, intensity, gates: gateTurn(drill, intensity, q, edgesOf(drill, intensity, tables)) }];
    }),
  );

/** One line per gate × drill × intensity: value, threshold, pass. */
export const formatGates = (rows: ReadonlyArray<GateRow>): ReadonlyArray<string> =>
  rows.flatMap(({ drill, intensity, gates }) =>
    (Object.entries(gates) as Array<[Gate, GateResult]>).map(
      ([g, r]) => `${r.pass ? 'pass' : REPORT_ONLY.has(g) ? 'note' : 'FAIL'} ${drill} ${intensity} ${g}: ${r.value} ${r.detail.startsWith('n/a') ? '' : `(<= ${r.threshold} ${THRESHOLD[g].unit}) `}${r.detail}`,
    ),
  );
