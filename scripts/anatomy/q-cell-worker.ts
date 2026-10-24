// One whole-turn solve per message, for pose-tables' worker pool.
import type { Intensity } from '../../src/content/schema';
import { encodeEdges, encodeQ, Q_FRAMES } from '../../src/viewer/motion/q-table';
import { formatCandidates, solveTurnStrategy } from '../../src/viewer/motion/solve-strategy';

declare const self: Worker;

self.onmessage = (e: MessageEvent<{ drill: string; intensity: Intensity }>) => {
  const { drill, intensity } = e.data;
  const started = performance.now();
  const { motion: m, candidates } = solveTurnStrategy(drill, intensity, { frames: Q_FRAMES });
  self.postMessage({
    drill,
    intensity,
    lines: [...formatCandidates(candidates), `wall: ${((performance.now() - started) / 1000).toFixed(1)} s`],
    converged: m.result.converged,
    feasible: m.result.feasible,
    violation: m.result.violation,
    q: encodeQ(m.q.slice(0, Q_FRAMES)),
    edges: encodeEdges(m.problem.insideEdges),
  });
};
