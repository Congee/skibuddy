// A drill's scenarios, read from its content: the only source for the pose tables, the bake and the tests.
import { readFileSync } from 'node:fs';
import { parse } from 'yaml';
import { INTENSITIES } from '../../src/content/schema';
import type { Intensity } from '../../src/content/schema';
import { isTurn } from '../../src/physics/turn';
import type { DrillScenario, TurnScenario, TurnScenarios } from '../../src/physics/turn';
import { TURN_STYLES, isRegularTurn } from '../../src/viewer/poses/regular-turn';

export const drillFile = (drill: string): URL => new URL(`../../content/drills/${drill}.yaml`, import.meta.url);

const KEYS = { speed_mps: 'speedMps', slope_deg: 'slopeDeg', radius_m: 'radiusM', com_radius_m: 'comRadiusM' } as const;
const OPTIONAL: ReadonlySet<string> = new Set(['radiusM', 'comRadiusM']);

/** Read loosely: `bun run content` validates the drill; here only the numbers the physics uses matter. */
const scenarioOf = (raw: unknown, where: string): DrillScenario => {
  if (typeof raw !== 'object' || raw === null) throw new Error(`${where}: no scenario`);
  const r = raw as Record<string, unknown>;
  const out: Record<string, number> = {};
  for (const [yaml, key] of Object.entries(KEYS)) {
    const v = r[yaml];
    if (typeof v === 'number') out[key] = v;
    else if (v !== undefined || !OPTIONAL.has(key)) throw new Error(`${where}: ${yaml} is not a number`);
  }
  return out as unknown as DrillScenario;
};

/** A kind of skiing's regular turn carries its own scenarios; a drill's come from its content. */
export const drillScenarios = (drill = 'stork-turns'): Readonly<Record<Intensity, DrillScenario>> => {
  if (isRegularTurn(drill)) return TURN_STYLES[drill].scenarios;
  const raw: unknown = parse(readFileSync(drillFile(drill), 'utf8'));
  const scenarios = typeof raw === 'object' && raw !== null && 'scenarios' in raw ? raw.scenarios : undefined;
  if (typeof scenarios !== 'object' || scenarios === null) throw new Error(`${drill}: no scenarios`);
  const s = scenarios as Record<string, unknown>;
  return Object.fromEntries(INTENSITIES.map((i) => [i, scenarioOf(s[i], `${drill} ${i}`)])) as Record<Intensity, DrillScenario>;
};

/** A turning drill's scenarios, each with its radius. */
export const turnScenarios = (drill = 'stork-turns'): TurnScenarios => {
  const all = drillScenarios(drill);
  const each = (i: Intensity): TurnScenario => {
    const s = all[i];
    if (!isTurn(s)) throw new Error(`${drill} ${i} is not a turn`);
    return s;
  };
  return { gentle: each('gentle'), moderate: each('moderate'), dynamic: each('dynamic') };
};
