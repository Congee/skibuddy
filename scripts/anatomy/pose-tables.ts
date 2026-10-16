// Usage: bun scripts/anatomy/pose-tables.ts [--check]
// Solves every drill's pose definition, per intensity, into src/viewer/poses/tables.json, so the
// browser only looks poses up. --check exits non-zero when the stored tables are stale.
import { readFileSync, writeFileSync } from 'node:fs';
import { INTENSITIES } from '../../src/content/schema';
import { POSE_CHANNELS } from '../../src/viewer/pose';
import { POSE_SAMPLES, solveTable } from '../../src/viewer/pose-solver';
import { encodeTable } from '../../src/viewer/pose-table';
import type { PoseTables } from '../../src/viewer/pose-table';
import { POSE_DEFINITIONS } from '../../src/viewer/poses';
import { NEUTRAL } from '../../src/viewer/poses/neutral';
import { drillScenarios } from './drill-scenarios';

export const TABLES_FILE = new URL('../../src/viewer/poses/tables.json', import.meta.url);

export const solveTables = (): PoseTables => ({
  channels: [...POSE_CHANNELS],
  samples: POSE_SAMPLES,
  neutral: encodeTable(solveTable(NEUTRAL, null, 1)),
  drills: Object.fromEntries(
    Object.entries(POSE_DEFINITIONS).map(([drill, def]) => {
      const scenarios = drillScenarios(drill);
      return [drill, Object.fromEntries(INTENSITIES.map((i) => [i, encodeTable(solveTable(def, scenarios[i]))]))];
    }),
  ),
});

if (import.meta.main) {
  const started = performance.now();
  const text = `${JSON.stringify(solveTables(), null, 1)}\n`;
  const seconds = ((performance.now() - started) / 1000).toFixed(2);
  if (process.argv.includes('--check')) {
    if (readFileSync(TABLES_FILE, 'utf8') !== text) {
      console.error('src/viewer/poses/tables.json is stale; run `bun run poses`');
      process.exitCode = 1;
    } else console.log(`pose tables up to date (${seconds} s)`);
  } else {
    writeFileSync(TABLES_FILE, text);
    console.log(`src/viewer/poses/tables.json: ${Object.keys(POSE_DEFINITIONS).length} drills solved in ${seconds} s`);
  }
}
