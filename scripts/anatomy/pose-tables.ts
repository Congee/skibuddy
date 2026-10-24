// Usage: bun scripts/anatomy/pose-tables.ts [--check] [--force] | --cell <drill>/<intensity> [--compare]
// Solves every drill's pose definition, per intensity, into src/viewer/poses/tables.json, so the browser only looks
// poses up. Migrated drills solve the whole-turn motion into src/viewer/motion/q-tables.json (reused while its inputs'
// hash holds; --force re-solves) and their legacy channels come from the adapter. --check exits non-zero when stale
// or when a model gate (src/viewer/motion/gates.ts) fails. --cell solves one cell the bake's way (with --compare also
// one cold fine solve), prints its candidates and report, and writes nothing.
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { availableParallelism } from 'node:os';
import { dirname, relative, resolve } from 'node:path';
import { INTENSITIES } from '../../src/content/schema';
import type { Intensity } from '../../src/content/schema';
import type { EffortCell, EffortTables } from '../../src/viewer/motion/effort-table';
import { formatGates, gateAll, REPORT_ONLY } from '../../src/viewer/motion/gates';
import type { Gate } from '../../src/viewer/motion/gates';
import { encodeEdges, encodeQ, MIGRATED, Q_FRAMES, qEdges, qTable, STORED_Q } from '../../src/viewer/motion/q-table';
import type { QTables } from '../../src/viewer/motion/q-table';
import { formatCandidates, formatSummary, pack, solveTurnStrategy, summaryOf } from '../../src/viewer/motion/solve-strategy';
import { buildTurnProblem, formatTurn, NAMES, reportOf } from '../../src/viewer/motion/turn';
import { POSE_CHANNELS } from '../../src/viewer/pose';
import { POSE_SAMPLES, solveTable } from '../../src/viewer/pose-solver';
import { encodeTable } from '../../src/viewer/pose-table';
import type { PoseTables } from '../../src/viewer/pose-table';
import { POSE_DEFINITIONS } from '../../src/viewer/poses';
import { NEUTRAL } from '../../src/viewer/poses/neutral';
import type { StageTask } from './stage-worker';

export const TABLES_FILE = new URL('../../src/viewer/poses/tables.json', import.meta.url);
export const Q_FILE = new URL('../../src/viewer/motion/q-tables.json', import.meta.url);
export const EFFORT_FILE = new URL('../../src/viewer/motion/effort-tables.json', import.meta.url);
const SOLVER = new URL('../../src/viewer/motion/solve-strategy.ts', import.meta.url).pathname;

/** Hash of the whole-turn solve's sources: the bake's strategy and every local file it imports, transitively. */
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
  q.hash === hash && q.frames === Q_FRAMES && [...MIGRATED].every((d) => INTENSITIES.every((i) => q.drills[d]?.[i] !== undefined && q.edges?.[d]?.[i] !== undefined)) && Object.keys(q.drills).every((d) => MIGRATED.has(d));

export const solveQ = (log = false): QTables => {
  const failed: string[] = [];
  const solved = [...MIGRATED].map((drill) => [
    drill,
    INTENSITIES.map((i) => {
      const { motion: m, candidates } = solveTurnStrategy(drill, i, { frames: Q_FRAMES });
      if (log) for (const line of [`${drill} ${i}:`, ...formatCandidates(candidates)]) console.log(line);
      if (!m.result.converged || !m.result.feasible) failed.push(`${drill} ${i}: solve converged ${m.result.converged}, feasible ${m.result.feasible}, violation ${m.result.violation.toExponential(1)}`);
      return [i, encodeQ(m.q.slice(0, Q_FRAMES)), encodeEdges(m.problem.insideEdges)] as const;
    }),
  ] as const);
  // After every cell, so one bake log holds all their tables.
  if (failed.length > 0) throw new Error(failed.join('\n'));
  return {
    names: [...NAMES],
    frames: Q_FRAMES,
    hash: inputHash(),
    drills: Object.fromEntries(solved.map(([d, runs]) => [d, Object.fromEntries(runs.map(([i, q]) => [i, q]))])),
    edges: Object.fromEntries(solved.map(([d, runs]) => [d, Object.fromEntries(runs.map(([i, , e]) => [i, e]))])),
  };
};

interface CellSolve {
  readonly drill: string;
  readonly intensity: Intensity;
  readonly lines: ReadonlyArray<string>;
  readonly converged: boolean;
  readonly feasible: boolean;
  readonly violation: number;
  readonly q: string;
  readonly edges: string;
}

/** solveQ's cells over a worker pool; a drill with any unsolved cell is left out whole and named in `failed`. */
export const solveQPool = async (): Promise<{ q: QTables; failed: ReadonlyArray<string> }> => {
  const cells = [...MIGRATED].flatMap((drill) => INTENSITIES.map((intensity) => ({ drill, intensity })));
  const results: CellSolve[] = [];
  let next = 0;
  const run = async (): Promise<void> => {
    const worker = new Worker(new URL('./q-cell-worker.ts', import.meta.url));
    try {
      for (let c = cells[next++]; c !== undefined; c = cells[next++]) {
        const cell = c;
        const r = await new Promise<CellSolve>((done, fail) => {
          worker.onmessage = (e: MessageEvent<CellSolve>) => done(e.data);
          worker.onerror = (e) => fail(new Error(`${cell.drill} ${cell.intensity}: ${e.message}`));
          worker.postMessage(cell);
        });
        for (const line of [`${r.drill} ${r.intensity}:`, ...r.lines]) console.log(line);
        results.push(r);
      }
    } finally {
      worker.terminate();
    }
  };
  await Promise.all(Array.from({ length: Math.min(cells.length, Math.max(1, availableParallelism() - 1)) }, run));
  const failed = results.filter((r) => !r.converged || !r.feasible).map((r) => `${r.drill} ${r.intensity}: solve converged ${r.converged}, feasible ${r.feasible}, violation ${r.violation.toExponential(1)}`);
  const good = [...MIGRATED].filter((d) => results.every((r) => r.drill !== d || (r.converged && r.feasible)));
  const of = (d: string, pick: (r: CellSolve) => string): Record<string, string> => Object.fromEntries(INTENSITIES.map((i) => [i, pick(results.find((r) => r.drill === d && r.intensity === i) as CellSolve)]));
  return {
    q: { names: [...NAMES], frames: Q_FRAMES, hash: inputHash(), drills: Object.fromEntries(good.map((d) => [d, of(d, (r) => r.q)])), edges: Object.fromEntries(good.map((d) => [d, of(d, (r) => r.edges)])) },
    failed,
  };
};

/** Every task on a worker pool; results come back in task order. */
const pooled = async <R>(tasks: ReadonlyArray<StageTask>): Promise<R[]> => {
  const results: R[] = [];
  let next = 0;
  const run = async (): Promise<void> => {
    const worker = new Worker(new URL('./stage-worker.ts', import.meta.url));
    try {
      for (let i = next++; i < tasks.length; i = next++) {
        const task = tasks[i] as StageTask;
        results[i] = await new Promise<R>((done, fail) => {
          worker.onmessage = (e: MessageEvent<R>) => done(e.data);
          worker.onerror = (e) => fail(new Error(`${task.kind} ${task.drill} ${task.intensity}: ${e.message}`));
          worker.postMessage(task);
        });
      }
    } finally {
      worker.terminate();
    }
  };
  await Promise.all(Array.from({ length: Math.min(tasks.length, Math.max(1, availableParallelism() - 1)) }, run));
  return results;
};

interface EffortCellOut {
  readonly cell: EffortCell;
  readonly report: string[];
  readonly rows: { lines: string[]; failed: boolean };
}

/** bakeEffort's cells over the worker pool. */
const bakeEffortPool = async (q: QTables): Promise<{ tables: EffortTables; cells: ReadonlyArray<{ drill: string; intensity: Intensity } & EffortCellOut> }> => {
  const keys = [...MIGRATED].flatMap((drill) => INTENSITIES.map((intensity) => ({ drill, intensity })));
  const out = await pooled<EffortCellOut>(keys.map((k) => ({ kind: 'effort', q, ...k })));
  const cells = keys.map((k, i) => ({ ...k, ...(out[i] as EffortCellOut) }));
  const tables: EffortTables = {
    hash: q.hash,
    drills: Object.fromEntries([...MIGRATED].map((d) => [d, Object.fromEntries(cells.filter((c) => c.drill === d).map((c) => [c.intensity, c.cell]))])),
  };
  return { tables, cells };
};

/** solveTables with one pose-table cell per pool task. */
export const solveTables = async (q: QTables): Promise<PoseTables> => {
  const keys = Object.keys(POSE_DEFINITIONS).flatMap((drill) => INTENSITIES.map((intensity) => ({ drill, intensity })));
  const tables = await pooled<string>(keys.map((k) => ({ kind: 'table', q, ...k })));
  return {
    channels: [...POSE_CHANNELS],
    samples: POSE_SAMPLES,
    neutral: encodeTable(solveTable(NEUTRAL, null, null, 1)),
    drills: Object.fromEntries(Object.keys(POSE_DEFINITIONS).map((drill) => [drill, Object.fromEntries(INTENSITIES.map((i) => [i, tables[keys.findIndex((k) => k.drill === drill && k.intensity === i)] as string]))])),
  };
};

const storedSummary = (drill: string, intensity: Intensity): string => {
  const q = qTable(drill, intensity);
  const edges = qEdges(drill, intensity);
  if (q === null || edges === null) return 'none';
  const tp = buildTurnProblem(drill, intensity, { frames: q.length });
  tp.insideEdges.set(edges);
  const x = pack(tp, q);
  return `(${q.length} frames, hash ${STORED_Q.hash}) under today's sources: CoM min / knee max / counter ° ${formatSummary(summaryOf(reportOf(tp, x), tp.cycle.unpack(x)))}`;
};

/** One cell the bake's way, printed beside the stored bake's numbers under today's sources; writes nothing. */
const solveCell = (cell: string, compare: boolean): void => {
  const [drill = '', name = ''] = cell.split('/');
  const intensity = INTENSITIES.find((i) => i === name);
  if (intensity === undefined) throw new Error(`--cell ${cell}: want <drill>/<${INTENSITIES.join('|')}>`);
  console.log(`stored bake ${storedSummary(drill, intensity)}`);
  const { motion, candidates } = solveTurnStrategy(drill, intensity, { frames: Q_FRAMES, compare, progress: (line) => console.log(line) });
  for (const line of [`${drill} ${intensity}:`, ...formatCandidates(candidates), formatTurn(motion)]) console.log(line);
};

const cellArg = process.argv.indexOf('--cell');
if (import.meta.main && cellArg >= 0) solveCell(process.argv[cellArg + 1] ?? '', process.argv.includes('--compare'));
else if (import.meta.main) {
  const started = performance.now();
  const check = process.argv.includes('--check');
  const hash = inputHash();
  const reuse = fresh(STORED_Q, hash) && !process.argv.includes('--force');
  if (check && !reuse) {
    console.error('src/viewer/motion/q-tables.json is stale (its solve inputs changed); run `bun run poses`');
    process.exitCode = 1;
  }
  const pooled = reuse || check ? null : await solveQPool();
  if (pooled !== null && pooled.failed.length > 0) {
    // Never a partial drill: the solved drills are kept so a rerun without the failed ones reuses them.
    writeFileSync(Q_FILE, `${JSON.stringify(pooled.q)}\n`);
    console.error([...pooled.failed, `q-tables.json holds ${Object.keys(pooled.q.drills).join(', ') || 'no drill'}; take the failed drills out of MIGRATED and rerun`].join('\n'));
    process.exit(1);
  }
  const q = pooled?.q ?? (reuse ? STORED_Q : solveQ(true));
  const qText = `${JSON.stringify(q)}\n`;
  if (pooled !== null) writeFileSync(Q_FILE, qText);
  const effort = await bakeEffortPool(q);
  const effortText = `${JSON.stringify(effort.tables)}\n`;
  for (const c of effort.cells) for (const line of c.report) console.log(line);
  const text = `${JSON.stringify(await solveTables(q), null, 1)}\n`;
  const seconds = ((performance.now() - started) / 1000).toFixed(2);
  if (check) {
    if (readFileSync(TABLES_FILE, 'utf8') !== text) {
      console.error('src/viewer/poses/tables.json is stale; run `bun run poses`');
      process.exitCode = 1;
    } else if (process.exitCode !== 1) console.log(`pose and q tables up to date (${seconds} s)`);
    const gates = gateAll(q);
    for (const line of formatGates(gates)) console.log(line);
    if (gates.some((r) => Object.entries(r.gates).some(([g, v]) => !v.pass && !REPORT_ONLY.has(g as Gate)))) {
      console.error('model gates failed (docs/motion-model.md §8)');
      process.exitCode = 1;
    }
    if (!existsSync(EFFORT_FILE) || readFileSync(EFFORT_FILE, 'utf8') !== effortText) {
      console.error('src/viewer/motion/effort-tables.json is stale; run `bun run poses`');
      process.exitCode = 1;
    }
    let effortFailed = false;
    for (const c of effort.cells) {
      const rows = c.rows;
      for (const line of rows.lines) console.log(line);
      effortFailed ||= rows.failed;
    }
    const { derivedProblems } = await import('../../src/content/derived');
    for (const drill of MIGRATED) {
      const p = derivedProblems(drill, effort.tables);
      console.log(`${p.length === 0 ? 'pass' : 'FAIL'} ${drill} effortOrder: ${p.length} (<= 0 order violations)${p.length === 0 ? '' : `: ${p.slice(0, 8).join('; ')}${p.length > 8 ? '; …' : ''}`}`);
      effortFailed ||= p.length > 0;
    }
    if (effortFailed) {
      console.error('effort gates failed (docs/motion-model.md §6.8)');
      process.exitCode = 1;
    }
  } else {
    if (!reuse && pooled === null) writeFileSync(Q_FILE, qText);
    writeFileSync(EFFORT_FILE, effortText);
    writeFileSync(TABLES_FILE, text);
    console.log(`src/viewer/poses/tables.json: ${Object.keys(POSE_DEFINITIONS).length} drills, ${MIGRATED.size} migrated (${reuse ? 'q reused' : 'q solved'}) in ${seconds} s`);
  }
}
