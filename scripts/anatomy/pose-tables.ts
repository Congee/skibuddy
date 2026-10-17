// Usage: bun scripts/anatomy/pose-tables.ts [--check] [--force]
// Solves every drill's pose definition, per intensity, into src/viewer/poses/tables.json, so the browser only looks
// poses up. Migrated drills solve the whole-turn motion into src/viewer/motion/q-tables.json (reused while its inputs'
// hash holds; --force re-solves) and their legacy channels come from the adapter. --check exits non-zero when stale.
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { INTENSITIES } from '../../src/content/schema';
import { adaptTable } from '../../src/viewer/motion/adapter';
import { decodeQ, encodeQ, MIGRATED, Q_FRAMES, STORED_Q } from '../../src/viewer/motion/q-table';
import type { QTables } from '../../src/viewer/motion/q-table';
import { buildTurnProblem, NAMES, solveTurn } from '../../src/viewer/motion/turn';
import { POSE_CHANNELS } from '../../src/viewer/pose';
import { POSE_SAMPLES, solveTable } from '../../src/viewer/pose-solver';
import { encodeTable } from '../../src/viewer/pose-table';
import type { PoseTables } from '../../src/viewer/pose-table';
import { POSE_DEFINITIONS } from '../../src/viewer/poses';
import { surfaceFor } from '../../src/viewer/surface';
import { NEUTRAL } from '../../src/viewer/poses/neutral';
import { drillScenarios } from './drill-scenarios';

export const TABLES_FILE = new URL('../../src/viewer/poses/tables.json', import.meta.url);
export const Q_FILE = new URL('../../src/viewer/motion/q-tables.json', import.meta.url);
const SOLVER = new URL('../../src/viewer/motion/turn.ts', import.meta.url).pathname;

/** Hash of the whole-turn solve's sources: turn.ts and every local file it imports, transitively. */
export const inputHash = (): string => {
  const seen = new Set<string>();
  const visit = (file: string): void => {
    if (seen.has(file)) return;
    seen.add(file);
    if (!file.endsWith('.ts')) return;
    for (const [, spec] of readFileSync(file, 'utf8').matchAll(/from '(\.[^']+)'/g)) {
      const base = resolve(dirname(file), spec ?? '');
      const hit = [base, `${base}.ts`, `${base}/index.ts`].find((f) => existsSync(f) && !f.endsWith('/'));
      if (hit !== undefined && !hit.endsWith('q-tables.json')) visit(hit);
    }
  };
  visit(SOLVER);
  const h = createHash('sha256');
  for (const f of [...seen].toSorted()) h.update(relative(resolve(SOLVER, '../../../..'), f)).update(readFileSync(f));
  return h.digest('hex').slice(0, 16);
};

const fresh = (q: QTables, hash: string): boolean =>
  q.hash === hash && q.frames === Q_FRAMES && [...MIGRATED].every((d) => INTENSITIES.every((i) => q.drills[d]?.[i] !== undefined)) && Object.keys(q.drills).every((d) => MIGRATED.has(d));

export const solveQ = (log = false): QTables => ({
  names: [...NAMES],
  frames: Q_FRAMES,
  hash: inputHash(),
  drills: Object.fromEntries(
    [...MIGRATED].map((drill) => [
      drill,
      Object.fromEntries(
        INTENSITIES.map((i) => {
          const m = solveTurn(buildTurnProblem(drill, i, { frames: Q_FRAMES }));
          if (!m.result.converged || !m.result.feasible) throw new Error(`${drill} ${i}: solve converged ${m.result.converged}, feasible ${m.result.feasible}`);
          if (log) console.log(`${drill} ${i}: ${m.result.iterations} iterations, ${(m.milliseconds / 1000).toFixed(1)} s`);
          return [i, encodeQ(m.q.slice(0, Q_FRAMES))];
        }),
      ),
    ]),
  ),
});

export const solveTables = (q: QTables): PoseTables => ({
  channels: [...POSE_CHANNELS],
  samples: POSE_SAMPLES,
  neutral: encodeTable(solveTable(NEUTRAL, null, null, 1)),
  drills: Object.fromEntries(
    Object.entries(POSE_DEFINITIONS).map(([drill, def]) => {
      const scenarios = drillScenarios(drill);
      return [
        drill,
        Object.fromEntries(
          INTENSITIES.map((i) => {
            const old = solveTable(def, scenarios[i], surfaceFor(drill, i));
            const text = q.drills[drill]?.[i];
            if (!MIGRATED.has(drill) || text === undefined) return [i, encodeTable(old)];
            return [i, encodeTable(adaptTable(drill, i, decodeQ(text), old).table)];
          }),
        ),
      ];
    }),
  ),
});

if (import.meta.main) {
  const started = performance.now();
  const check = process.argv.includes('--check');
  const hash = inputHash();
  const reuse = fresh(STORED_Q, hash) && !process.argv.includes('--force');
  if (check && !reuse) {
    console.error('src/viewer/motion/q-tables.json is stale (its solve inputs changed); run `bun run poses`');
    process.exitCode = 1;
  }
  const q = reuse ? STORED_Q : solveQ(true);
  const qText = `${JSON.stringify(q)}\n`;
  const text = `${JSON.stringify(solveTables(q), null, 1)}\n`;
  const seconds = ((performance.now() - started) / 1000).toFixed(2);
  if (check) {
    if (readFileSync(TABLES_FILE, 'utf8') !== text) {
      console.error('src/viewer/poses/tables.json is stale; run `bun run poses`');
      process.exitCode = 1;
    } else if (process.exitCode !== 1) console.log(`pose and q tables up to date (${seconds} s)`);
  } else {
    if (!reuse) writeFileSync(Q_FILE, qText);
    writeFileSync(TABLES_FILE, text);
    console.log(`src/viewer/poses/tables.json: ${Object.keys(POSE_DEFINITIONS).length} drills, ${MIGRATED.size} migrated (${reuse ? 'q reused' : 'q solved'}) in ${seconds} s`);
  }
}
