import { assert, describe, it } from '@effect/vitest';
import {
  ALIASES,
  EXAMPLES,
  NEUTRAL_DRILLS,
  SIGMA_FLOOR,
  SINGLE_WIDE,
  buildPriors,
  combine,
  cycleSamples,
  isSided,
  limitDeg,
  limitFlags,
} from '../scripts/prior/build';
import type { RoleTarget } from '../scripts/prior/build';
import { BASE_NAMES, EdgeChange, Evidence, PRIOR_FILE, Parity, Role, SigmaFrom, evalDeg, evalSeries, examplesFor } from '../src/viewer/prior/prior';
import type { Example } from '../src/viewer/prior/prior';
import { RegularTurn } from '../src/viewer/poses/regular-turn';

const examples = (drill: string): ReadonlyArray<Example> => examplesFor(drill, EdgeChange.Unstated) ?? [];
const DRILLS = [...Object.keys(PRIOR_FILE.drills), ...Object.keys(PRIOR_FILE.aliases)];
const SOURCED: ReadonlyArray<Evidence> = [Evidence.Measured, Evidence.Digitised, Evidence.EyeRead, Evidence.Footage, Evidence.RangeOnly];

describe('committed priors', () => {
  it('match the build (bun run priors)', () => {
    assert.deepStrictEqual(JSON.parse(JSON.stringify(buildPriors())), PRIOR_FILE);
  });

  it('cover the sourced, aliased and neutral drills', () => {
    for (const d of [RegularTurn.Carving, RegularTurn.ShortTurns, RegularTurn.Cruising, RegularTurn.Moguls, ...NEUTRAL_DRILLS, ...Object.keys(ALIASES)]) assert.isAbove(examples(d).length, 0, d);
  });
});

describe('provenance', () => {
  it('names the evidence, σ origin and sources of every coordinate of every drill', () => {
    for (const drill of DRILLS)
      for (const ex of examples(drill))
        for (const base of BASE_NAMES) {
          const c = ex.coordinates[base];
          assert.isDefined(c, `${drill} ${base}`);
          if (c === undefined) continue;
          const roles = Object.values(c.provenance.roles);
          assert.isAbove(roles.length, 0, `${drill} ${base}`);
          assert.strictEqual(roles.length, c.mu === null || c.parity !== Parity.Sided ? roles.length : 2, `${drill} ${base} both legs`);
          for (const r of roles) {
            assert.include(Object.values(Evidence), r.evidence);
            if (c.mu === null) {
              assert.include([Evidence.None, Evidence.Locked], r.evidence, `${drill} ${base}`);
              continue;
            }
            assert.isNotNull(r.sigma, `${drill} ${base}`);
            if (r.evidence === Evidence.Neutral) assert.lengthOf(r.sources, 0);
            else {
              assert.include(SOURCED, r.evidence, `${drill} ${base}`);
              assert.isAbove(r.sources.length, 0, `${drill} ${base}`);
              for (const s of r.sources) {
                assert.isAbove(s.n, 0);
                assert.isAbove(s.errorDeg, 0);
                assert.isAbove(s.mapping.length, 0);
                assert.isAbove(s.warp.length, 0);
              }
            }
          }
        }
  });

  it('puts no prior on the root pose, which the constraints place (list, lead, comAhead)', () => {
    for (const drill of DRILLS)
      for (const ex of examples(drill))
        for (const base of BASE_NAMES.filter((b) => b.startsWith('pelvis_'))) {
          assert.isNull(ex.coordinates[base]?.mu, `${drill} ${base}`);
          assert.strictEqual(ex.coordinates[base]?.provenance.roles.turn?.evidence, Evidence.None);
        }
  });

  it('marks drills without sources neutral throughout', () => {
    for (const drill of NEUTRAL_DRILLS)
      for (const ex of examples(drill))
        for (const c of Object.values(ex.coordinates)) for (const r of Object.values(c.provenance.roles)) assert.include([Evidence.Neutral, Evidence.None, Evidence.Locked], r.evidence, drill);
  });

  it('widens σ where one source stands alone and floors the between-source spread', () => {
    for (const defs of Object.values(EXAMPLES))
      for (const def of defs)
        for (const [base, cd] of Object.entries(def.coordinates))
          for (const sources of Object.values(cd.roles)) {
            if (sources === undefined || sources.length === 0) continue;
            const t = combine(sources, limitDeg(base));
            const least = Math.min(...t.sigma);
            if (t.provenance.sigma === SigmaFrom.BetweenSources) assert.isAtLeast(least, SIGMA_FLOOR, base);
            if (sources.length === 1) assert.isAtLeast(least, SINGLE_WIDE, base);
          }
  });
});

describe('joint limits', () => {
  it('flags every μ ± σ past a limit and clips none', () => {
    for (const drill of DRILLS)
      for (const ex of examples(drill)) {
        assert.deepStrictEqual(ex.limitFlags, limitFlags(ex.coordinates), drill);
        for (const f of ex.limitFlags) {
          const [lo, hi] = limitDeg(f.coordinate.replace(/\.[RL]$/, ''));
          assert.isTrue(Math.abs(f.bound - lo) < 0.1 ? f.value < lo : f.value > hi, `${drill} ${f.coordinate}`);
        }
      }
  });

  it('keeps the measured GS ankle dorsiflexion past the model limit, flagged (heinrich-2022 17–27°, limit 12.7°)', () => {
    const [ex] = examples(RegularTurn.Carving);
    const ankle = ex?.coordinates['ankle_dorsiflexion'];
    assert.isAbove(ankle === undefined ? 0 : (evalDeg(ankle, 'ankle_dorsiflexion.R', 0.5)?.mu ?? 0), limitDeg('ankle_dorsiflexion')[1]);
    assert.isTrue(ex?.limitFlags.some((f) => f.coordinate === 'ankle_dorsiflexion.R' && f.value > f.bound));
  });
});

describe('Fourier fit', () => {
  // The fit may leave a source only where its turn's end and the next turn's start disagree: by the seam blend.
  it('reproduces the registered sources within their stated error, the seam blend aside', () => {
    for (const [drill, defs] of Object.entries(EXAMPLES))
      for (const def of defs) {
        const ex = PRIOR_FILE.drills[drill]?.[EdgeChange.Unstated]?.find((x) => x.id === def.id);
        for (const [base, cd] of Object.entries(def.coordinates)) {
          const c = ex?.coordinates[base];
          if (c?.mu == null) continue;
          const roles = isSided(base) ? [Role.Outside, Role.Inside] : [Role.Turn];
          const targets = Object.fromEntries(roles.map((r) => [r, combine(cd.roles[r] ?? [], limitDeg(base))])) as Partial<Record<Role, RoleTarget>>;
          const s = cycleSamples(base, targets);
          const roleOf = (i: number): Role => (roles[Math.floor(i / (s.omega.length / roles.length))] ?? Role.Turn);
          s.omega.forEach((w, i) => {
            const sources = cd.roles[roleOf(i)] ?? [];
            const err = sources.length === 0 ? Number.POSITIVE_INFINITY : Math.min(...sources.map((x) => x.errorDeg));
            const fit = evalSeries(c.mu ?? { a0: 0, cos: [], sin: [] }, c.parity, w);
            assert.isAtMost(Math.abs(fit - (s.raw[i] ?? 0)), err + (s.blend[i] ?? 0), `${drill} ${base} ${roleOf(i)} ω ${w.toFixed(3)}`);
          });
        }
      }
  });

  it('reads a single curve source back exactly before the fit', () => {
    const def = EXAMPLES[RegularTurn.Carving]?.[0];
    const src = def?.coordinates['hip_flexion']?.roles.outside;
    const t = src === undefined ? null : combine(src, limitDeg('hip_flexion'));
    assert.approximately(t?.mu[0] ?? Number.NaN, 57, 1.5);
    assert.strictEqual(t?.provenance.evidence, Evidence.Digitised);
  });
});
