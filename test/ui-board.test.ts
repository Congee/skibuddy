import { assert, describe, it } from '@effect/vitest';
import type { Activation, ExerciseTarget, Movement, Muscle } from '../src/content/schema';
import { steadyOrder } from '../src/content/effort';
import { Intensity } from '../src/content/schema';
import type { TurnScenario } from '../src/content/schema';
import { pinInputs } from '../src/ui/figure/pin-inputs';
import { BoardGroup, groupActivations } from '../src/ui/board/groups';
import { peakLoad, phaseWords, scenarioLine, settingNotes, stopLoad, stripSamples, variesBySetting } from '../src/ui/board/intensity';
import { sourceKeys } from '../src/ui/board/source-keys';
import { TargetFit, targetMatch } from '../src/ui/gym/fit';

const act = (muscle: string, i: number, s: number, f: number, extra: Partial<Record<string, unknown>> = {}): Activation =>
  ({
    muscle,
    side: 'outside',
    intensity: { initiation: i, shaping: s, finish: f },
    contraction: { initiation: 'isometric', shaping: 'isometric', finish: 'isometric' },
    role: 'r',
    confidence: 'medium',
    basis: 'b',
    sources: [],
    ...extra,
  }) as unknown as Activation;

const movement = (activations: ReadonlyArray<Activation>): Movement =>
  ({ id: 'm', name: 'M', dofMatrix: [], activations, reviewedBy: [] }) as unknown as Movement;

const target = (muscle: string, contraction: string): ExerciseTarget => ({ muscle, contraction }) as unknown as ExerciseTarget;

describe('sourceKeys', () => {
  it('numbers a book once however many page citations it has', () => {
    const keys = sourceKeys(
      movement([act('a', 1, 1, 1, { sources: [{ source: 'b', pages: 3 }, 'x'] }), act('c', 1, 1, 1, { sources: [{ source: 'b', pages: '5-6' }] })]),
    );
    assert.deepStrictEqual([...keys], [
      ['b', 1],
      ['x', 2],
    ]);
  });

  it('numbers sources by first citation', () => {
    const keys = sourceKeys(
      movement([act('a', 1, 1, 1, { sources: ['x', 'y'] }), act('b', 1, 1, 1, { sources: ['z', 'x'] })]),
    );
    assert.deepStrictEqual([...keys], [
      ['x', 1],
      ['y', 2],
      ['z', 3],
    ]);
  });
});

describe('targetMatch', () => {
  const m = movement([
    act('quadriceps', 1, 1, 1, { contraction: { initiation: 'eccentric', shaping: 'isometric', finish: 'isometric' } }),
    act('quadriceps', 1, 1, 1, { side: 'inside', contraction: { initiation: 'concentric', shaping: 'concentric', finish: 'concentric' } }),
  ]);

  it('matches the same muscle and contraction on any side', () => {
    assert.strictEqual(targetMatch(m, target('quadriceps', 'concentric')).fit, TargetFit.Same);
  });

  it('flags a different contraction with what the drill does', () => {
    const r = targetMatch(movement([act('hamstrings', 1, 1, 1)]), target('hamstrings', 'eccentric'));
    assert.strictEqual(r.fit, TargetFit.OtherContraction);
    assert.deepStrictEqual(r.drillContractions, ['isometric']);
  });

  it('flags muscles the drill does not use', () => {
    assert.strictEqual(targetMatch(m, target('obliques', 'isometric')).fit, TargetFit.NotInDrill);
  });

  it('marks a mobilisation of a muscle the drill uses', () => {
    assert.strictEqual(targetMatch(m, { muscle: 'quadriceps', mobilisation: true } as ExerciseTarget).fit, TargetFit.Mobilises);
  });

  it('matches a group target through its parts', () => {
    const muscles = [{ id: 'external-oblique', name: 'E', region: 'trunk', partOf: 'obliques' }] as unknown as ReadonlyArray<Muscle>;
    const r = targetMatch(movement([act('external-oblique', 1, 1, 1)]), target('obliques', 'isometric'), muscles);
    assert.strictEqual(r.fit, TargetFit.Same);
  });
});

describe('groupActivations', () => {
  const muscles = [
    { id: 'vasti', name: 'V', region: 'leg' },
    { id: 'iliopsoas', name: 'I', region: 'hip' },
    { id: 'erector-spinae', name: 'E', region: 'trunk' },
    { id: 'anterior-deltoid', name: 'D', region: 'arm' },
  ] as unknown as ReadonlyArray<Muscle>;

  it('groups by body part in body order, each in steady order', () => {
    const groups = groupActivations(
      [
        act('anterior-deltoid', 1, 1, 1, { side: 'inside' }),
        act('iliopsoas', 1, 2, 1, { side: 'inside' }),
        act('vasti', 1, 1, 1),
        act('vasti', 1, 3, 1, { side: 'both' }),
        act('erector-spinae', 2, 2, 2, { side: 'both' }),
      ],
      muscles,
    );
    assert.deepStrictEqual(
      groups.map((g) => [g.group, g.activations.map((a) => `${a.muscle}:${a.side}`)]),
      [
        [BoardGroup.OutsideLeg, ['vasti:both', 'vasti:outside']],
        [BoardGroup.InsideLeg, ['iliopsoas:inside']],
        [BoardGroup.Trunk, ['erector-spinae:both']],
        [BoardGroup.Upper, ['anterior-deltoid:inside']],
      ],
    );
  });
});

describe('effort per intensity setting', () => {
  const scaled = act('vasti', 1, 2, 2, {
    intensity: { initiation: { gentle: 1, moderate: 2, dynamic: 2 }, shaping: { gentle: 2, moderate: 2, dynamic: 3 }, finish: 0 },
    contraction: { initiation: 'concentric', shaping: 'isometric', finish: null },
  });

  it('names the effort at the chosen setting', () => {
    assert.strictEqual(phaseWords(scaled, Intensity.Gentle), 'initiation Light, shaping Working, finish Resting');
    assert.strictEqual(phaseWords(scaled, Intensity.Moderate), 'initiation Working, shaping Working, finish Resting');
    assert.strictEqual(phaseWords(scaled, Intensity.Dynamic), 'initiation Working, shaping Hard, finish Resting');
  });

  it('draws the strip from the chosen setting', () => {
    assert.strictEqual(stripSamples(scaled.intensity, Intensity.Gentle, 6)[3]?.v, 2);
    assert.strictEqual(stripSamples(scaled.intensity, Intensity.Dynamic, 6)[3]?.v, 3);
  });

  it('tells fixed values from scaled ones and gathers notes', () => {
    assert.isTrue(variesBySetting(scaled));
    assert.isFalse(variesBySetting(act('peroneals', 2, 2, 2)));
    const noted = act('x', 1, 1, 1, { intensity: { initiation: 1, shaping: { gentle: 2, moderate: 1, dynamic: 1, note: 'Why' }, finish: 1 } });
    assert.deepStrictEqual(settingNotes(noted), ['Why']);
  });

  it('keeps one board order at every setting', () => {
    const steady = act('peroneals', 2, 2, 2);
    const order = steadyOrder([steady, scaled]).map((a) => a.muscle);
    assert.deepStrictEqual(order, ['vasti', 'peroneals']);
  });

  it('pins only muscles that work at the chosen setting', () => {
    const idleWhenGentle = act('lats', 1, 0, 0, {
      intensity: { initiation: { gentle: 0, moderate: 1, dynamic: 1 }, shaping: 0, finish: 0 },
    });
    const anchors = [{ muscle: 'lats', side: 'outside', x: 1, y: 1, visible: true }] as never;
    assert.lengthOf(pinInputs([idleWhenGentle], anchors, new Map(), null, Intensity.Gentle), 0);
    assert.lengthOf(pinInputs([idleWhenGentle], anchors, new Map(), null, Intensity.Moderate), 1);
  });
});

describe('scenarioLine', () => {
  const moderate: TurnScenario = { speedMps: 8, radiusM: 12, slopeDeg: 12 };

  it('takes the peak load below the fall line: about 1.2 at moderate', () => {
    assert.closeTo(peakLoad(moderate), 1.2, 0.01);
  });

  it('reads the scenario in plain words with the peak load', () => {
    assert.strictEqual(
      scenarioLine(Intensity.Moderate, moderate),
      'Moderate: about 30 km/h, 12 m turns on a 12° slope. Load on the outside leg peaks below the fall line, about 1.2 × body weight.',
    );
    assert.include(scenarioLine(Intensity.Dynamic, { speedMps: 10, radiusM: 14, slopeDeg: 15 }), 'about 35 km/h');
    assert.include(scenarioLine(Intensity.Dynamic, { speedMps: 10, radiusM: 14, slopeDeg: 15 }), '1.3 × body weight');
  });

  it('reads a run with no radius as no round turns, at about body weight', () => {
    assert.strictEqual(
      scenarioLine(Intensity.Gentle, { speedMps: 1.5, slopeDeg: 15 }),
      'Gentle: about 5 km/h on a 15° slope, no round turns; the legs carry about body weight at a steady speed.',
    );
  });

  it('reads a stepping run with its cadence, at about body weight on average', () => {
    assert.strictEqual(
      scenarioLine(Intensity.Moderate, { speedMps: 3, slopeDeg: 5, stepRateHz: 1.5 }),
      'Moderate: about 10 km/h on a 5° slope, no round turns, stepping about 1.5 times a second; the legs carry about body weight on average, each push briefly more.',
    );
  });

  it('reads a stop with its braking load from Lind & Sanders eq 4.7', () => {
    assert.strictEqual(
      scenarioLine(Intensity.Moderate, { speedMps: 7, slopeDeg: 12, stopDistanceM: 4 }),
      'Moderate: about 25 km/h on a 12° slope, braking to a stop within about 4 m. The load on the legs rises to about 1.3 × body weight while braking.',
    );
  });
});

describe('stopLoad', () => {
  // The book's worked example: 160 lb from 30 mph in 15 ft on 15° is about 2.3 W in the slope plane, 2.5 W in all.
  it('matches the book example', () => {
    assert.closeTo(stopLoad(13.41, 15, 4.572), 2.5, 0.05);
  });

  it('is body weight on the flat with no speed to lose', () => {
    assert.closeTo(stopLoad(1e-9, 0, 1), 1, 1e-9);
  });
});
