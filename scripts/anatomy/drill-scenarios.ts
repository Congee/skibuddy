// The stork-turns drill's scenarios, read from its content: the only source for the bake and the tests.
import { readFileSync } from 'node:fs';
import { Schema } from 'effect';
import { parse } from 'yaml';
import { Scenarios } from '../../src/content/schema';
import type { TurnScenarios } from '../../src/physics/turn';

export const STORK_DRILL_FILE = new URL('../../content/drills/stork-turns.yaml', import.meta.url);

export const drillScenarios = (file: URL = STORK_DRILL_FILE): TurnScenarios => {
  const raw: unknown = parse(readFileSync(file, 'utf8'));
  const scenarios = typeof raw === 'object' && raw !== null && 'scenarios' in raw ? raw.scenarios : undefined;
  return Schema.decodeUnknownSync(Scenarios)(scenarios);
};
