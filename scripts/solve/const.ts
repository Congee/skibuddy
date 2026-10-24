// Writes the const JSON carve_cycle.py's cycle reads for a carved preset, from the app's own inputs.
// usage: bun scripts/solve/const.ts <gs|sl> <gentle|moderate|dynamic> <out.json>
import type { Intensity } from '../../src/content/schema';
import { carveSolverConstOf } from '../../src/physics/carve-bake';
import { Snow } from '../../src/physics/edge';
import { taskFor } from '../../src/physics/task';
import type { TurnKind } from '../../src/physics/task';

const [kind, intensity, out] = process.argv.slice(2) as [TurnKind, Intensity, string | undefined];
if (out === undefined) throw new Error('usage: const.ts <kind> <intensity> <out.json>');
const task = taskFor(kind, intensity);
const c = carveSolverConstOf(task, Snow.HardGroomed, {}, { kind, intensity });
if (c === null || task.gateOffsetM === undefined) throw new Error(`${kind}-${intensity}: not a carved preset with a course`);
await Bun.write(out, `${JSON.stringify(c, null, 1)}\n`);
// The course the cycle takes as flags.
console.log(`--speed ${task.speedMps} --turn-l ${task.turnSizeM} --offset ${task.gateOffsetM}${task.gateOffsetSolved === true ? ' --free-d' : ''}`);
