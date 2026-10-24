import { assert, describe, it } from '@effect/vitest';
import { derivedActivations, derivedProblems, derivedRows } from '../src/content/derived';
import { effortAt } from '../src/content/effort';
import { Confidence, Contraction, INTENSITIES, Intensity, Side } from '../src/content/schema';
import type { Activation, ActivationIntensity } from '../src/content/schema';
import { Snow } from '../src/physics/edge';
import { taskFor } from '../src/physics/task';
import { turnProfile } from '../src/physics/turn';
import { effortOfActivation } from '../src/viewer/motion/distribute';
import { decodeEffort, decodeModes, effortTable, encodeEffort, encodeModes, STORED_EFFORT } from '../src/viewer/motion/effort-table';
import type { EffortRow, EffortTables } from '../src/viewer/motion/effort-table';
import { MIGRATED } from '../src/viewer/motion/q-table';
import { kindOfDrill } from '../src/viewer/poses/regular-turn';

const N = 48;
const f3 = (x: number): string => x.toFixed(3);

// Activations whose efforts are exactly 1, 2 and 3 on the §6 scale.
const E1 = 0.125;
const E2 = 0.35;
const E3 = 1;

/** One activation per third of the turn from the switch. */
const thirds = (a: number, b: number, c: number): number[] => Array.from({ length: N }, (_, k) => (k < 16 ? a : k < 32 ? b : c));

interface FakeRow {
  readonly a: ReadonlyArray<number>;
  readonly modes?: ReadonlyArray<Contraction | null>;
}
type FakeCell = Readonly<Record<string, FakeRow>>;

const tableOf = (drill: string, cells: Partial<Record<Intensity, FakeCell>>): EffortTables => ({
  hash: 'test',
  drills: {
    [drill]: Object.fromEntries(
      Object.entries(cells).map(([i, cell]) => [
        i,
        {
          residualMax: 0,
          muscles: Object.entries(cell).map(([key, r]) => {
            const [muscle = '', side = ''] = key.split('.');
            return { muscle, side, a: encodeEffort(r.a), modes: encodeModes(r.modes ?? r.a.map((v) => (v > 0 ? Contraction.Isometric : null))) };
          }),
        },
      ]),
    ),
  },
});

const every = (cell: FakeCell): Partial<Record<Intensity, FakeCell>> => Object.fromEntries(INTENSITIES.map((i) => [i, cell]));

const SIDES: FakeCell = {
  'vasti.R': { a: thirds(E1, E3, E2) },
  'vasti.L': { a: thirds(0, E1, E2) },
  'rectus-abdominis.R': { a: thirds(0.01, 0.01, 0.01) },
  'rectus-abdominis.L': { a: thirds(E2, E2, E2) },
};

describe('effort table storage', () => {
  it('round-trips activations through int16 × 1e-3 to within half a unit', () => {
    const a = [0, 0.001, 0.0004, 0.0126, E1, E2, E3, 1.5];
    const back = decodeEffort(encodeEffort(a));
    assert.strictEqual(back.length, a.length);
    a.forEach((v, k) => assert.isAtMost(Math.abs((back[k] ?? Number.NaN) - v), 5e-4 + 1e-12, `${v} → ${back[k]}`));
  });

  it('rejects an activation the int16 cannot hold', () => {
    assert.throws(() => encodeEffort([33]), /out of range/);
    assert.throws(() => encodeEffort([Number.NaN]), /out of range/);
  });

  it('round-trips the modes, rest as null', () => {
    const modes = [Contraction.Concentric, Contraction.Eccentric, Contraction.Isometric, null];
    assert.strictEqual(encodeModes(modes), 'cei-');
    assert.deepStrictEqual(decodeModes(encodeModes(modes)), modes);
  });
});

describe('derivedRows', () => {
  const tables = tableOf('fake', every(SIDES));

  it("maps the solve's R to the outside leg and L to the inside", () => {
    const vasti = (derivedRows('fake', tables) ?? []).filter((r) => r.muscle === 'vasti');
    assert.deepStrictEqual(
      vasti.map((r) => [r.side, r.rows.moderate.side]),
      [
        [Side.Outside, 'R'],
        [Side.Inside, 'L'],
      ],
    );
  });

  it('reports a trunk muscle once, as both, from its larger side', () => {
    const trunk = (derivedRows('fake', tables) ?? []).filter((r) => r.muscle === 'rectus-abdominis');
    assert.deepStrictEqual(
      trunk.map((r) => [r.side, INTENSITIES.map((i) => r.rows[i].side)]),
      [[Side.Both, ['L', 'L', 'L']]],
    );
  });

  it('reports a group of trunk leaves once, as both', () => {
    const rows = derivedRows('fake', tableOf('fake', every({ 'obliques.R': { a: thirds(E1, E1, E1) }, 'obliques.L': { a: thirds(E2, E2, E2) } }))) ?? [];
    assert.deepStrictEqual(rows.map((r) => [r.muscle, r.side, r.rows.gentle.side]), [['obliques', Side.Both, 'L']]);
  });

  it('is null unless all three settings are baked', () => {
    const partial = tableOf('fake', { gentle: SIDES, moderate: SIDES });
    assert.isNull(derivedRows('fake', partial));
    assert.isNull(derivedActivations('fake', [], partial));
    assert.deepStrictEqual(derivedProblems('fake', partial), []);
  });
});

const level = (all: ReadonlyArray<Activation>, side: Side): unknown => {
  const a = all.find((x) => x.muscle === 'vasti' && x.side === side);
  return a === undefined ? undefined : [a.intensity.initiation, a.intensity.shaping, a.intensity.finish];
};
const flat = (v: number): Record<Intensity, number> => ({ gentle: v, moderate: v, dynamic: v });

describe('derivedActivations', () => {
  it('levels each phase by the rounded mean effort over its third from the switch', () => {
    const all = derivedActivations('fake', [], tableOf('fake', every(SIDES))) ?? [];
    assert.deepStrictEqual(level(all, Side.Outside), [flat(1), flat(3), flat(2)]);
    assert.deepStrictEqual(level(all, Side.Inside), [flat(0), flat(1), flat(2)]);
  });

  it('clamps a saturated muscle to level 3', () => {
    const all = derivedActivations('fake', [], tableOf('fake', every({ 'vasti.R': { a: thirds(1.5, 1.5, 1.5) } }))) ?? [];
    assert.deepStrictEqual(level(all, Side.Outside), [flat(3), flat(3), flat(3)]);
  });

  it('takes the mode carrying the most activation in the phase, not the most frames, and none at rest', () => {
    const a = Array.from({ length: N }, (_, k) => (k < 16 ? E2 : k < 20 ? 0.9 : k < 32 ? 0.2 : 0));
    const modes = a.map((v, k) => (v === 0 ? null : k >= 16 && k < 20 ? Contraction.Eccentric : Contraction.Concentric));
    const all = derivedActivations('fake', [], tableOf('fake', every({ 'vasti.R': { a, modes } }))) ?? [];
    const c = all.find((x) => x.muscle === 'vasti' && x.side === Side.Outside)?.contraction;
    assert.deepStrictEqual([c?.initiation, c?.shaping, c?.finish], [
      { gentle: Contraction.Concentric, moderate: Contraction.Concentric, dynamic: Contraction.Concentric },
      { gentle: Contraction.Eccentric, moderate: Contraction.Eccentric, dynamic: Contraction.Eccentric },
      { gentle: null, moderate: null, dynamic: null },
    ]);
  });

  it("copies the text of the base's same muscle and side, else derives it", () => {
    const base = {
      muscle: 'vasti',
      side: Side.Outside,
      serves: ['knee.flexion'],
      intensity: { initiation: 1, shaping: 1, finish: 1 },
      contraction: { initiation: null, shaping: null, finish: null },
      role: 'base role',
      confidence: Confidence.High,
      basis: 'base basis',
      sources: ['kroll-2010'],
    } as unknown as Activation;
    const all = derivedActivations('fake', [base], tableOf('fake', every(SIDES))) ?? [];
    const outside = all.find((x) => x.muscle === 'vasti' && x.side === Side.Outside);
    const inside = all.find((x) => x.muscle === 'vasti' && x.side === Side.Inside);
    assert.deepStrictEqual([outside?.role, outside?.basis, outside?.confidence, outside?.sources], ['base role', 'base basis', Confidence.High, ['kroll-2010']]);
    assert.deepStrictEqual([inside?.basis, inside?.confidence, inside?.sources], ['derived (motion-model §6)', Confidence.Low, ['heinrich-2022', 'hermann-2023']]);
    assert.include(inside?.serves ?? [], 'knee.flexion');
  });

  it('carries the 48 frame efforts of every setting', () => {
    const all = derivedActivations('fake', [], tableOf('fake', every(SIDES))) ?? [];
    const frames = all.find((x) => x.muscle === 'vasti' && x.side === Side.Outside)?.intensity.frames;
    const want = thirds(E1, E3, E2).map(effortOfActivation);
    for (const i of INTENSITIES) {
      const got = frames?.[i] ?? [];
      assert.strictEqual(got.length, N);
      got.forEach((v, k) => assert.closeTo(v, want[k] ?? Number.NaN, 0.01));
    }
  });
});

describe('derivedProblems', () => {
  it('names a phase level that falls as intensity rises', () => {
    const tables = tableOf('fake', {
      gentle: { 'vasti.R': { a: thirds(0, E3, 0) } },
      moderate: { 'vasti.R': { a: thirds(0, E2, 0) } },
      dynamic: { 'vasti.R': { a: thirds(0, E1, 0) } },
    });
    const problems = derivedProblems('fake', tables);
    assert.strictEqual(problems.length, 1, problems.join('; '));
    assert.match(problems[0] ?? '', /^vasti outside shaping: /);
  });

  it('is empty when every level holds or rises', () => {
    const tables = tableOf('fake', {
      gentle: { 'vasti.R': { a: thirds(0, E1, 0) } },
      moderate: { 'vasti.R': { a: thirds(E1, E2, 0) } },
      dynamic: { 'vasti.R': { a: thirds(E1, E3, E1) } },
    });
    assert.deepStrictEqual(derivedProblems('fake', tables), []);
  });
});

describe('effortAt on derived frames', () => {
  const ramp = Array.from({ length: N }, (_, k) => (3 * k) / (N - 1));
  const own: ActivationIntensity = { initiation: 0, shaping: 0, finish: 0, frames: { gentle: ramp, moderate: ramp, dynamic: ramp } } as unknown as ActivationIntensity;
  const twin: ActivationIntensity = { initiation: 0, shaping: 0, finish: 0, frames: { gentle: ramp.map(() => 1), moderate: ramp.map(() => 1), dynamic: ramp.map(() => 1) } } as unknown as ActivationIntensity;

  it('reads the frames, not the phase levels', () => {
    assert.closeTo(effortAt(own, 24 / N, Intensity.Moderate), ramp[24] ?? Number.NaN, 1e-9);
    assert.closeTo(effortAt(own, 24.5 / N, Intensity.Moderate), ((ramp[24] ?? 0) + (ramp[25] ?? 0)) / 2, 1e-9);
  });

  it("wraps from the last frame to the twin's first at the switch", () => {
    assert.closeTo(effortAt(own, 47.5 / N, Intensity.Moderate, twin), (3 + 1) / 2, 1e-9);
    assert.closeTo(effortAt(own, 47.5 / N, Intensity.Moderate), (3 + 0) / 2, 1e-9);
    assert.closeTo(effortAt(own, 1, Intensity.Moderate, twin), 0, 1e-9);
  });
});

// Sources (motion-model §6.8) on the stored bake: only cells that are migrated and baked run.
const TABLES = STORED_EFFORT;
const whyNot = (drill: string): string | null => (!MIGRATED.has(drill) ? `${drill} is not migrated` : effortTable(drill, TABLES) === null ? `${drill} has no baked effort` : null);
const onBaked = (drills: ReadonlyArray<string>, name: string, body: () => void): void => {
  const missing = drills.flatMap((d) => whyNot(d) ?? []);
  if (missing.length === 0) it(name, body);
  else it.skip(`${name} (skipped: ${missing.join(', ')})`, body);
};

const rowOf = (drill: string, i: Intensity, muscle: string, side: 'R' | 'L'): EffortRow => {
  const r = effortTable(drill, TABLES)?.[i].find((x) => x.muscle === muscle && x.side === side);
  if (r === undefined) throw new Error(`${drill} ${i}: no ${muscle}.${side} row`);
  return r;
};
const mean = (v: ArrayLike<number>, keep: (k: number) => boolean = () => true): number => {
  let sum = 0;
  let n = 0;
  for (let k = 0; k < v.length; k++) {
    if (!keep(k)) continue;
    sum += v[k] ?? 0;
    n++;
  }
  return n === 0 ? Number.NaN : sum / n;
};
const peakOf = (v: ArrayLike<number>): number => Array.from(v).reduce((best, x, k, all) => (x > (all[best] ?? -1) ? k : best), 0);
/** Which leg's row (outside R, inside L) holds the higher peak, and when. */
const top = (rows: ReadonlyArray<Float64Array>): { side: string; t: number } => {
  const k = rows.map(peakOf);
  const r = (rows[0]?.[k[0] ?? 0] ?? 0) >= (rows[1]?.[k[1] ?? 0] ?? 0) ? 0 : 1;
  return { side: r === 0 ? 'outside' : 'inside', t: (k[r] ?? 0) / N };
};
const profileOf = (drill: string, i: Intensity): ReturnType<typeof turnProfile> => {
  const kind = kindOfDrill(drill);
  if (kind === null) throw new Error(`${drill}: no turn kind`);
  const task = taskFor(kind, i);
  return turnProfile(task, task.snow ?? Snow.HardGroomed);
};
const shaping = (k: number): boolean => k >= Math.round(N / 3) && k < Math.round((2 * N) / 3);
/** A leg is outside one turn and inside the next, so its cycle mean pools both rows (inferred). */
const legMean = (drill: string, i: Intensity, muscle: string): number => (mean(rowOf(drill, i, muscle, 'R').a) + mean(rowOf(drill, i, muscle, 'L').a)) / 2;
const qhRatio = (drill: string, i: Intensity): number => legMean(drill, i, 'quadriceps') / legMean(drill, i, 'hamstrings');

describe('hintermeister-1997', () => {
  onBaked(['regular-gs'], 'GS dynamic: outside vasti, gluteus maximus and adductors average ≥ 50 % MVC over the loaded frames, biceps femoris ≥ 20 %', () => {
    const profile = profileOf('regular-gs', Intensity.Dynamic);
    const loaded = (k: number): boolean => profile.at(k / N).load >= 1;
    const floors = [['vasti', 0.5], ['gluteus-maximus', 0.5], ['adductors', 0.5], ['biceps-femoris', 0.2]] as const;
    for (const [muscle, floor] of floors) {
      const m = mean(rowOf('regular-gs', Intensity.Dynamic, muscle, 'R').a, loaded);
      assert.isAtLeast(m, floor, `outside ${muscle} ${f3(m)} over the frames at ≥ 1 BW`);
    }
  });
});

describe('panizzolo-2013', () => {
  const D = Intensity.Dynamic;
  onBaked(['regular-sl'], 'SL dynamic: outside vasti average ≥ 50 % MVC over the turn, rectus femoris 20-50 % over the cycle', () => {
    const vasti = mean(rowOf('regular-sl', D, 'vasti', 'R').a);
    const rf = legMean('regular-sl', D, 'rectus-femoris');
    assert.isAtLeast(vasti, 0.5, `outside vasti ${f3(vasti)}`);
    assert.isAtLeast(rf, 0.2, `rectus femoris ${f3(rf)}`);
    assert.isAtMost(rf, 0.5, `rectus femoris ${f3(rf)}`);
  });
  onBaked(['regular-sl'], 'SL dynamic: rectus femoris peaks on the inside leg early, vasti on the outside leg between engagement and release', () => {
    const rf = [rowOf('regular-sl', D, 'rectus-femoris', 'R').a, rowOf('regular-sl', D, 'rectus-femoris', 'L').a];
    const vasti = [rowOf('regular-sl', D, 'vasti', 'R').a, rowOf('regular-sl', D, 'vasti', 'L').a];
    const { events } = profileOf('regular-sl', D);
    const r = top(rf);
    const v = top(vasti);
    // "First half of the cycle" read as the first half of the inside turn (inferred).
    assert.isTrue(r.side === 'inside' && r.t < 0.5, `rectus femoris peaks ${r.side} at t ${f3(r.t)}`);
    assert.isTrue(v.side === 'outside' && v.t >= events.engagement && v.t <= events.release, `vasti peak ${v.side} at t ${f3(v.t)}, engagement ${f3(events.engagement)}, release ${f3(events.release)}`);
  });
});

describe('kroll-2010', () => {
  onBaked(['regular-steered'], "Steered moderate: inside vasti average 0.3-0.7 × the outside's", () => {
    const outside = mean(rowOf('regular-steered', Intensity.Moderate, 'vasti', 'R').a);
    const inside = mean(rowOf('regular-steered', Intensity.Moderate, 'vasti', 'L').a);
    // Band inferred around the measured 0.46 (inside vastus lateralis 54 % lower).
    const ratio = inside / outside;
    assert.isTrue(ratio >= 0.3 && ratio <= 0.7, `inside ${f3(inside)} / outside ${f3(outside)} = ${f3(ratio)}`);
  });
});

describe('hermann-2023', () => {
  for (const drill of ['regular-steered', 'regular-sl', 'regular-gs'])
    for (const i of INTENSITIES)
      onBaked([drill], `${drill} ${i}: the quadriceps-to-hamstrings ratio lies in 1..6`, () => {
        // Bounds inferred around the measured mean of about 4.5.
        const ratio = qhRatio(drill, i);
        assert.isTrue(ratio >= 1 && ratio <= 6, `quadriceps / hamstrings ${f3(ratio)}`);
      });
  onBaked(['regular-steered', 'regular-sl', 'regular-gs'], 'the quadriceps-to-hamstrings ratio falls from Steered gentle to SL dynamic and to GS dynamic', () => {
    const steered = qhRatio('regular-steered', Intensity.Gentle);
    const sl = qhRatio('regular-sl', Intensity.Dynamic);
    const gs = qhRatio('regular-gs', Intensity.Dynamic);
    assert.isTrue(sl < steered && gs < steered, `Steered gentle ${f3(steered)}, SL dynamic ${f3(sl)}, GS dynamic ${f3(gs)}`);
  });
});

describe('berg-1995', () => {
  onBaked(['regular-gs'], 'GS dynamic: the outside knee extensors work eccentric on at least as many frames as concentric', () => {
    // The vasti stand for the knee extensors (inferred: rectus femoris also flexes the hip).
    const modes = rowOf('regular-gs', Intensity.Dynamic, 'vasti', 'R').modes;
    const eccentric = modes.filter((m) => m === Contraction.Eccentric).length;
    const concentric = modes.filter((m) => m === Contraction.Concentric).length;
    assert.isAtLeast(eccentric, concentric, `eccentric ${eccentric}, concentric ${concentric} frames`);
  });
});

describe('derived effort invariants', () => {
  for (const drill of [...MIGRATED].toSorted()) {
    onBaked([drill], `${drill}: every stored effort is finite in [0, 3]`, () => {
      for (const i of INTENSITIES)
        for (const r of effortTable(drill, TABLES)?.[i] ?? [])
          r.effort.forEach((e, k) => assert.isTrue(Number.isFinite(e) && e >= 0 && e <= 3, `${i} ${r.muscle}.${r.side} frame ${k}: ${e}`));
    });
    onBaked([drill], `${drill}: the outside vasti shaping mean never falls from gentle to dynamic`, () => {
      const s = INTENSITIES.map((i) => mean(rowOf(drill, i, 'vasti', 'R').effort, shaping));
      assert.isTrue((s[0] ?? 0) <= (s[1] ?? 0) && (s[1] ?? 0) <= (s[2] ?? 0), `gentle ${f3(s[0] ?? 0)}, moderate ${f3(s[1] ?? 0)}, dynamic ${f3(s[2] ?? 0)}`);
    });
    onBaked([drill], `${drill}: no derived phase level falls as intensity rises`, () => {
      const problems = derivedProblems(drill, TABLES);
      assert.deepStrictEqual(problems, [], problems.join('; '));
    });
  }
});
