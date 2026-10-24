// One effort-bake cell or one pose-table cell per message, for pose-tables' worker pool.
import type { Intensity } from '../../src/content/schema';
import { adaptTable } from '../../src/viewer/motion/adapter';
import { bakeCell, effortRows, reportLines } from '../../src/viewer/motion/effort-bake';
import { decodeQ, MIGRATED } from '../../src/viewer/motion/q-table';
import type { QTables } from '../../src/viewer/motion/q-table';
import { solveTable } from '../../src/viewer/pose-solver';
import { encodeTable } from '../../src/viewer/pose-table';
import { POSE_DEFINITIONS } from '../../src/viewer/poses';
import { surfaceFor } from '../../src/viewer/surface';
import { drillScenarios } from './drill-scenarios';

declare const self: Worker;

export type StageTask = { kind: 'effort' | 'table'; q: QTables; drill: string; intensity: Intensity };

self.onmessage = (e: MessageEvent<StageTask>) => {
  const { kind, q, drill, intensity } = e.data;
  if (kind === 'effort') {
    const bake = bakeCell(q, drill, intensity);
    self.postMessage({ cell: bake.cell, report: reportLines(drill, intensity, bake), rows: effortRows(drill, intensity, bake) });
    return;
  }
  const def = POSE_DEFINITIONS[drill];
  if (def === undefined) throw new Error(`unknown drill ${drill}`);
  const old = solveTable(def, drillScenarios(drill)[intensity], surfaceFor(drill, intensity));
  const text = q.drills[drill]?.[intensity];
  self.postMessage(encodeTable(!MIGRATED.has(drill) || text === undefined ? old : adaptTable(drill, intensity, decodeQ(text, q.names), old).table));
};
