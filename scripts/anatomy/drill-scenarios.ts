// A drill's scenarios, read from its content: the only source for the pose tables, the bake and the tests.
import { readFileSync } from 'node:fs';
import { parse } from 'yaml';
import { INTENSITIES } from '../../src/content/schema';
import type { Intensity } from '../../src/content/schema';
import { isTurn } from '../../src/physics/turn';
import type { DrillScenario, TurnScenario, TurnScenarios } from '../../src/physics/turn';

export const drillFile = (drill: string): URL => new URL(`../../content/drills/${drill}.yaml`, import.meta.url);

const KEYS = { speed_mps: 'speedMps', slope_deg: 'slopeDeg', radius_m: 'radiusM' } as const;

/** Read loosely: `bun run content` validates the drill; here only the numbers the physics uses matter. */
const scenarioOf = (raw: unknown, where: string): DrillScenario => {
  if (typeof raw !== 'object' || raw === null) throw new Error(`${where}: no scenario`);
  const r = raw as Record<string, unknown>;
  const out: Record<string, number> = {};
  for (const [yaml, key] of Object.entries(KEYS)) {
    const v = r[yaml];
    if (typeof v === 'number') out[key] = v;
    else if (v !== undefined || key !== 'radiusM') throw new Error(`${where}: ${yaml} is not a number`);
  }
  return out as unknown as DrillScenario;
};

export const drillScenarios = (drill = 'stork-turns'): Readonly<Record<Intensity, DrillScenario>> => {
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
