import { Schema } from 'effect';
import { Content, DOFS, isAxial } from '../src/content/schema';

const held = { neutral: true, contraction: 'isometric', cue: 'Hold', confidence: 'low', sources: [] };
const bend = { action: 'Bends', contraction: 'eccentric', cue: 'Bend', confidence: 'low', sources: [] };

/** One row per DOF and side, all held neutral except the knee and hip flexion rows. */
export const dofMatrix = DOFS.flatMap((dof) =>
  (isAxial(dof) ? ['trunk'] : ['outside', 'inside']).map((side) => {
    const cell = dof === 'knee.flexion' || dof === 'hip.flexion' ? bend : held;
    return { dof, side, cells: { initiation: cell, shaping: cell, finish: cell } };
  }),
);

export const activation = {
  muscle: 'quadriceps',
  side: 'outside',
  serves: ['knee.flexion'],
  intensity: { initiation: 1, shaping: 2, finish: 3 },
  contraction: { initiation: 'eccentric', shaping: 'eccentric', finish: 'eccentric' },
  role: 'Holds the knee',
  confidence: 'medium',
  basis: 'Measured',
  sources: ['study-1'],
};

export const scenarios = {
  gentle: { speed_mps: 6, radius_m: 10, slope_deg: 8 },
  moderate: { speed_mps: 8, radius_m: 12, slope_deg: 12 },
  dynamic: { speed_mps: 11, radius_m: 14, slope_deg: 18 },
};

export const exercise = {
  id: 'split-squat',
  name: 'Split squat',
  targets: [{ muscle: 'quadriceps', contraction: 'eccentric' }],
  single_leg: false,
  matches_on_snow: 'Knee flexion',
  easier: 'Shallower',
  harder: 'Deeper',
  cautions: [],
  reviewed_by: [],
};

export const rawContent = {
  muscles: [
    { id: 'quadriceps', name: 'Quadriceps', region: 'leg' },
    { id: 'obliques', name: 'Obliques', region: 'trunk' },
    { id: 'gluteus-medius', name: 'Gluteus medius', region: 'hip' },
  ],
  sources: [
    { id: 'study-1', type: 'article', citation: 'A study', url: 'https://example.org/1', read: 'abstract' },
    { id: 'book-1', type: 'book', citation: 'A book', url: 'https://example.org/b', read: 'partial' },
  ],
  movements: [{ id: 'turn', name: 'Turn', dof_matrix: dofMatrix, activations: [activation], reviewed_by: [] }],
  primitives: [
    { id: 'knee-bend', code: 'P1', name: 'Knee bend', summary: 'Bends the knee', rows: [{ dof: 'knee.flexion', side: 'outside' }] },
    { id: 'tip', code: 'P2', name: 'Tip', summary: 'Tips the ski', rows: [{ dof: 'ankle.inversion', side: 'both' }] },
  ],
  drills: [
    {
      id: 'stork-turns',
      name: 'Stork turns',
      movement: 'turn',
      summary: 'Our words',
      terrain: 'Easy',
      scenarios,
      primitives: [{ primitive: 'knee-bend', modifier: 'a little' }],
      reviewed_by: [],
    },
  ],
  fundamentals: [
    {
      association: 'psia',
      url: 'https://example.org/fundamentals',
      fundamentals: [
        { id: 'bend', name: 'Bend the knees', requires: ['knee-bend'], basis: 'Ours' },
        { id: 'edge', name: 'Tip the skis', requires: [{ any_of: ['tip', 'knee-bend'] }, 'tip'], basis: 'Ours' },
      ],
    },
  ],
  tasks: [
    {
      association: 'psia',
      drill: 'stork-turns',
      task: 'Stork Turns',
      level: { label: 'Level 2', ordinal: 2 },
      category: 'Individual',
      fundamentals: { relation: 'and/or', ids: ['bend', 'edge'] },
      url: 'https://example.org/task',
      reviewed_by: [],
    },
  ],
  exercises: [exercise],
};


export const decode: (u: unknown) => Content = Schema.decodeUnknownSync(Content);

/** Valid fixture content with `patch` applied on top. */
export const contentWith = (patch: Partial<Record<keyof typeof rawContent, unknown>>): Content => decode({ ...rawContent, ...patch });
