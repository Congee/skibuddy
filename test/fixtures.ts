import { Schema } from 'effect';
import { Content } from '../src/content/schema';

export const activation = {
  muscle: 'quadriceps',
  side: 'outside',
  intensity: { initiation: 1, shaping: 2, finish: 3 },
  contraction: ['eccentric'],
  role: 'Holds the knee',
  confidence: 'medium',
  basis: 'Measured',
  sources: ['study-1'],
};

export const exercise = {
  id: 'split-squat',
  name: 'Split squat',
  targets: [{ muscle: 'quadriceps', contraction: 'eccentric' }],
  singleLeg: false,
  matchesOnSnow: 'Knee flexion',
  easier: 'Shallower',
  harder: 'Deeper',
  cautions: [],
  reviewedBy: [],
};

export const rawContent = {
  muscles: [
    { id: 'quadriceps', name: 'Quadriceps', region: 'leg' },
    { id: 'obliques', name: 'Obliques', region: 'trunk' },
    { id: 'gluteus-medius', name: 'Gluteus medius', region: 'hip' },
  ],
  sources: [{ id: 'study-1', citation: 'A study', url: 'https://example.org/1', read: 'abstract' }],
  movements: [{ id: 'turn', name: 'Turn', activations: [activation], jointActions: [], reviewedBy: [] }],
  tasks: [
    {
      association: 'psia',
      task: 'Stork Turns',
      level: 2,
      category: 'Individual',
      fundamentals: [],
      movement: 'turn',
      summary: 'Our words',
      terrain: 'Green',
      url: 'https://example.org/task',
      reviewedBy: [],
    },
  ],
  exercises: [exercise],
};


export const decode: (u: unknown) => Content = Schema.decodeUnknownSync(Content);

/** Valid fixture content with `patch` applied on top. */
export const contentWith = (patch: Partial<typeof rawContent>): Content => decode({ ...rawContent, ...patch });
