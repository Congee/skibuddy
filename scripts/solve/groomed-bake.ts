// Usage: bun scripts/solve/groomed-bake.ts [--check]
// Solves the steered presets' groomed cycles into src/physics/groomed-cycles.json, so the browser does not spend seconds
// per intensity solving them. --check exits non-zero when the file's hash no longer matches the solve's sources.
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { INTENSITIES } from '../../src/content/schema';
import type { Intensity } from '../../src/content/schema';
import { Snow } from '../../src/physics/edge';
import { decodeProfile, encodeProfile, GROOMED_CYCLES, groomedKeyOf } from '../../src/physics/groomed-bake';
import type { GroomedCycles } from '../../src/physics/groomed-bake';
import { TurnKind, taskFor } from '../../src/physics/task';
import type { TurnTask } from '../../src/physics/task';
import { solveProfile } from '../../src/physics/turn';

const FILE = new URL('../../src/physics/groomed-cycles.json', import.meta.url);
const ROOT = new URL('../../src/physics/turn.ts', import.meta.url).pathname;
/** Turn times the baked `at` must match the solve's at, bit for bit. */
const PROBES = Array.from({ length: 1001 }, (_, i) => i / 1000);

/** Hash of turn.ts and every local file it imports, transitively, less the bake itself. */
const sourceHash = (): string => {
  const seen = new Set<string>();
  const visit = (file: string): void => {
    if (seen.has(file) || file.endsWith('groomed-cycles.json')) return;
    seen.add(file);
    if (!file.endsWith('.ts')) return;
    for (const [, spec] of readFileSync(file, 'utf8').matchAll(/from '(\.[^']+)'/g)) {
      const base = resolve(dirname(file), spec ?? '');
      const hit = [base, `${base}.ts`, `${base}/index.ts`].find((f) => existsSync(f) && !f.endsWith('/'));
      if (hit !== undefined) visit(hit);
    }
  };
  visit(ROOT);
  const h = createHash('sha256');
  for (const f of [...seen].toSorted()) h.update(relative(resolve(ROOT, '../../..'), f)).update(readFileSync(f));
  return h.digest('hex').slice(0, 16);
};

const cellOf = (intensity: Intensity): { readonly task: TurnTask; readonly snow: Snow; readonly key: string } => {
  const task = taskFor(TurnKind.Steered, intensity);
  const snow = task.snow ?? Snow.HardGroomed;
  return { task, snow, key: groomedKeyOf(task, snow) };
};

const cellArg = process.argv.indexOf('--cell');
if (cellArg >= 0) {
  // Child: one cell's solve and its `at` at the probes, to stdout.
  const intensity = INTENSITIES.find((i) => i === process.argv[cellArg + 1]);
  if (intensity === undefined) throw new Error('--cell <intensity>');
  const { task, snow, key } = cellOf(intensity);
  const p = solveProfile(task, snow);
  process.stdout.write(JSON.stringify({ key, profile: encodeProfile(p), probes: JSON.stringify(PROBES.map((t) => p.at(t))) }));
} else {
  const hash = sourceHash();
  const fresh = GROOMED_CYCLES.hash === hash && INTENSITIES.every((i) => GROOMED_CYCLES.cells.some((c) => c.key === cellOf(i).key));
  if (process.argv.includes('--check')) {
    if (!fresh) console.error('src/physics/groomed-cycles.json is stale (its solve inputs changed); run `bun run bake:groomed`');
    process.exit(fresh ? 0 : 1);
  }
  const started = performance.now();
  const solved = await Promise.all(
    INTENSITIES.map(async (i) => {
      const child = Bun.spawn(['bun', import.meta.path, '--cell', i], { stdout: 'pipe', stderr: 'inherit' });
      const text = await new Response(child.stdout).text();
      if ((await child.exited) !== 0) throw new Error(`steered ${i} failed`);
      return JSON.parse(text) as { key: string; profile: unknown; probes: string };
    }),
  );
  const cycles: GroomedCycles = { hash, cells: solved.map(({ key, profile }) => ({ key, profile })) };
  for (const { profile, probes } of solved) {
    const p = decodeProfile(profile);
    if (JSON.stringify(encodeProfile(p)) !== JSON.stringify(profile) || JSON.stringify(PROBES.map((t) => p.at(t))) !== probes) throw new Error('baked cycle differs from its solve');
  }
  writeFileSync(FILE, `${JSON.stringify(cycles)}\n`);
  console.log(`groomed-cycles.json: ${solved.length} steered cycles, hash ${hash}, exact at ${PROBES.length} times each, ${((performance.now() - started) / 1000).toFixed(0)} s`);
}
