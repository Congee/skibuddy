// The bake's replay record: replayLamDeg's restart march on a solve's baked samples (carve_cycle.py samples).
// usage: bun scripts/solve/replay.ts <samples.json> <out.json>
import type { Intensity } from '../../src/content/schema';
import type { CarveCell } from '../../src/physics/carve-bake';
import { replayLamDeg } from '../../src/physics/carve-replay';
import { taskFor } from '../../src/physics/task';
import type { TurnKind } from '../../src/physics/task';

interface Samples {
  readonly file: string;
  readonly cell: { readonly kind: TurnKind; readonly intensity: Intensity };
  readonly T: number;
  readonly lamPeak: number;
  readonly samples: CarveCell['samples'];
}

const [inp, out] = process.argv.slice(2);
if (inp === undefined || out === undefined) throw new Error('usage: replay.ts <samples.json> <out.json>');
const s = (await Bun.file(inp).json()) as Samples;
const d = replayLamDeg(taskFor(s.cell.kind, s.cell.intensity), s.lamPeak, s.samples);
// JSON has no NaN: a diverged march is null.
await Bun.write(out, `${JSON.stringify({ file: s.file, T: s.T, maxDLamDeg: Number.isFinite(d) ? d : null })}\n`);
console.log(`${s.file}: replay max |Δλ| ${d}°`);
