import { assert, describe, it } from '@effect/vitest';
import { Effect, Exit, Schema } from 'effect';
import {
  Activation,
  Citation,
  Content,
  Drill,
  ExerciseTarget,
  formatPages,
  Intensity,
  LevelBySetting,
  MatrixCell,
  MatrixRow,
  Muscle,
  orderProblem,
  phaseContraction,
  phaseIntensity,
  Requirement,
  shortNameOf,
} from '../src/content/schema';
import { activation, dofMatrix, rawContent, scenarios } from './fixtures';

const decodeContent = Schema.decodeUnknownEffect(Content);
const decodeActivation = Schema.decodeUnknownExit(Activation);

describe('schema', () => {
  it.effect('decodes valid content', () =>
    Effect.gen(function* () {
      const content = yield* decodeContent(rawContent);
      assert.strictEqual(content.movements[0]?.activations[0]?.muscle, 'quadriceps');
    }),
  );

  it('rejects an intensity above 3', () => {
    assert.isTrue(Exit.isFailure(decodeActivation({ ...activation, intensity: { initiation: 4, shaping: 0, finish: 0 } })));
  });

  it('rejects a fractional intensity', () => {
    assert.isTrue(Exit.isFailure(decodeActivation({ ...activation, intensity: { initiation: 1.5, shaping: 0, finish: 0 } })));
  });

  it('takes one contraction per phase, not a list', () => {
    assert.isTrue(Exit.isFailure(decodeActivation({ ...activation, contraction: ['eccentric'] })));
    assert.isTrue(Exit.isSuccess(decodeActivation({ ...activation, contraction: { ...activation.contraction, shaping: null } })));
  });

  it('needs at least one served joint action', () => {
    assert.isTrue(Exit.isFailure(decodeActivation({ ...activation, serves: [] })));
    assert.isTrue(Exit.isFailure(decodeActivation({ ...activation, serves: ['knee.wobble'] })));
  });

  it('takes exactly one of action or neutral in a matrix cell', () => {
    const decode = Schema.decodeUnknownExit(MatrixCell);
    const cell = { contraction: 'isometric', cue: 'Hold', confidence: 'low', sources: [] };
    assert.isTrue(Exit.isSuccess(decode({ ...cell, action: 'Holds' })));
    assert.isTrue(Exit.isSuccess(decode({ ...cell, neutral: true })));
    assert.isTrue(Exit.isFailure(decode(cell)));
    assert.isTrue(Exit.isFailure(decode({ ...cell, action: 'Holds', neutral: true })));
  });

  it('needs a cell for every phase', () => {
    const row = dofMatrix[0];
    const { finish: _, ...cells } = row?.cells ?? {};
    assert.isTrue(Exit.isFailure(Schema.decodeUnknownExit(MatrixRow)({ ...row, cells })));
  });

  it('accepts ascending page ranges and rejects the rest', () => {
    const decode = Schema.decodeUnknownExit(Citation);
    assert.isTrue(Exit.isSuccess(decode({ source: 'book-1', pages: '61-62, 71' })));
    assert.isTrue(Exit.isSuccess(decode({ source: 'book-1', pages: 14 })));
    for (const pages of ['81-79', '86, 79', 'p 3', '3,4', 0]) {
      assert.isTrue(Exit.isFailure(decode({ source: 'book-1', pages })), String(pages));
    }
  });

  it('formats pages with p or pp and an en dash', () => {
    assert.strictEqual(formatPages(14), 'p 14');
    assert.strictEqual(formatPages('79-81, 86'), 'pp 79–81, 86');
  });

  it('needs at least two choices in any_of', () => {
    assert.isTrue(Exit.isFailure(Schema.decodeUnknownExit(Requirement)({ any_of: ['tip'] })));
    assert.isTrue(Exit.isSuccess(Schema.decodeUnknownExit(Requirement)({ any_of: ['tip', 'knee-bend'] })));
  });

  it('rejects an unknown side', () => {
    assert.isTrue(Exit.isFailure(decodeActivation({ ...activation, side: 'left' })));
  });

  it('rejects ids that are not slugs', () => {
    assert.isTrue(Exit.isFailure(Schema.decodeUnknownExit(Muscle)({ id: 'Quad Muscle', name: 'Quad', region: 'leg' })));
  });

  it('accepts an optional FMA id and rejects a malformed one', () => {
    const decode = Schema.decodeUnknownExit(Muscle);
    assert.isTrue(Exit.isSuccess(decode({ id: 'quadriceps', name: 'Quadriceps', region: 'leg', fma: 'FMA:22428' })));
    assert.isTrue(Exit.isFailure(decode({ id: 'quadriceps', name: 'Quadriceps', region: 'leg', fma: '22428' })));
  });

  it('takes a contraction or a mobilisation on an exercise target, not both or neither', () => {
    const decode = Schema.decodeUnknownExit(ExerciseTarget);
    assert.isTrue(Exit.isSuccess(decode({ muscle: 'soleus', mobilisation: true })));
    assert.isTrue(Exit.isSuccess(decode({ muscle: 'soleus', contraction: 'eccentric' })));
    assert.isTrue(Exit.isFailure(decode({ muscle: 'soleus' })));
    assert.isTrue(Exit.isFailure(decode({ muscle: 'soleus', contraction: 'eccentric', mobilisation: true })));
  });

  it('decodes short_name for pins and slat titles', () => {
    const m = Schema.decodeUnknownSync(Muscle)({ id: 'vasti', name: 'Vasti (vastus lateralis, medialis and intermedius)', short_name: 'Vasti', region: 'leg' });
    assert.strictEqual(shortNameOf(m), 'Vasti');
    assert.strictEqual(shortNameOf(Schema.decodeUnknownSync(Muscle)({ id: 'soleus', name: 'Soleus', region: 'leg' })), 'Soleus');
  });

  it.effect('fails on missing fields', () =>
    Effect.gen(function* () {
      const result = yield* Effect.exit(decodeContent({ ...rawContent, exercises: undefined }));
      assert.isTrue(Exit.isFailure(result));
    }),
  );
});

describe('intensity settings', () => {
  const decodeLevel = Schema.decodeUnknownExit(LevelBySetting);
  const decodeDrill = Schema.decodeUnknownSync(Drill);
  const drill = rawContent.drills[0];

  it('decodes scenarios to camelCase', () => {
    const d = decodeDrill(drill);
    assert.deepStrictEqual(d.scenarios.moderate, { speedMps: 8, radiusM: 12, slopeDeg: 12 });
  });

  it('needs every setting in scenarios, with positive speed and radius', () => {
    const { dynamic: _, ...two } = scenarios;
    assert.isTrue(Exit.isFailure(Schema.decodeUnknownExit(Drill)({ ...drill, scenarios: two })));
    const still = { ...scenarios, gentle: { ...scenarios.gentle, speed_mps: 0 } };
    assert.isTrue(Exit.isFailure(Schema.decodeUnknownExit(Drill)({ ...drill, scenarios: still })));
    assert.isTrue(Exit.isFailure(Schema.decodeUnknownExit(Drill)({ ...drill, scenarios: undefined })));
  });

  it('takes a single number or one value per setting for each phase', () => {
    const perSetting = { ...activation, intensity: { initiation: 1, shaping: { gentle: 1, moderate: 2, dynamic: 3 }, finish: 2 } };
    const exit = decodeActivation(perSetting);
    assert.isTrue(Exit.isSuccess(exit));
    if (Exit.isSuccess(exit)) {
      assert.deepStrictEqual(phaseIntensity(exit.value.intensity, Intensity.Gentle), { initiation: 1, shaping: 1, finish: 2 });
      assert.deepStrictEqual(phaseIntensity(exit.value.intensity, Intensity.Dynamic), { initiation: 1, shaping: 3, finish: 2 });
    }
  });

  it('keeps per-setting values within 0 to 3 and needs all three', () => {
    assert.isTrue(Exit.isFailure(decodeLevel({ gentle: 1, moderate: 2, dynamic: 4 })));
    assert.isTrue(Exit.isFailure(decodeLevel({ gentle: -1, moderate: 2, dynamic: 3 })));
    assert.isTrue(Exit.isFailure(decodeLevel({ gentle: 1, moderate: 2 })));
  });

  it('needs gentle <= moderate <= dynamic unless a note explains it', () => {
    assert.isTrue(Exit.isSuccess(decodeLevel({ gentle: 1, moderate: 1, dynamic: 2 })));
    assert.isTrue(Exit.isFailure(decodeLevel({ gentle: 2, moderate: 1, dynamic: 2 })));
    assert.isTrue(Exit.isFailure(decodeLevel({ gentle: 1, moderate: 3, dynamic: 2 })));
    assert.isTrue(Exit.isSuccess(decodeLevel({ gentle: 2, moderate: 1, dynamic: 2, note: 'Skidding helps at low speed' })));
    assert.isTrue(Exit.isFailure(decodeLevel({ gentle: 2, moderate: 1, dynamic: 2, note: '' })));
  });

  it('says why an order fails', () => {
    assert.strictEqual(
      orderProblem({ gentle: 2, moderate: 1, dynamic: 2 }),
      'gentle 2, moderate 1, dynamic 2 should not fall as intensity rises; add a note to explain',
    );
    assert.isUndefined(orderProblem({ gentle: 0, moderate: 0, dynamic: 0 }));
  });

  it('takes a contraction per setting', () => {
    const c = { initiation: { gentle: null, moderate: 'isometric', dynamic: 'eccentric' }, shaping: 'isometric', finish: null };
    const exit = decodeActivation({ ...activation, contraction: c });
    assert.isTrue(Exit.isSuccess(exit));
    if (Exit.isSuccess(exit)) {
      assert.deepStrictEqual(phaseContraction(exit.value.contraction, Intensity.Gentle), { initiation: null, shaping: 'isometric', finish: null });
      assert.strictEqual(phaseContraction(exit.value.contraction, Intensity.Dynamic).initiation, 'eccentric');
    }
    assert.isTrue(Exit.isFailure(decodeActivation({ ...activation, contraction: { ...c, shaping: { gentle: 'isometric' } } })));
  });
});
