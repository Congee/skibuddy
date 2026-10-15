# skibuddy

A browser app that animates a skier through ski-instructor drills, lights up the muscles each phase of the turn works, and suggests gym exercises that train the same muscles the same way.

**Status:** milestone 0. One drill (stork turns, mapped to PSIA's Stork Turns task), one movement model, a starter exercise library.

## Quick start

```sh
bun install
bun run dev     # builds content/ into public/content.json, then starts Vite
bun run check   # typecheck, lint, test
```

`bun run content` rebuilds and validates the content on its own; it prints every problem with its file and exits non-zero.

`bun run test:model` checks the built anatomy model (`public/models/anatomy.glb`) against what the unit tests read; run it after `scripts/anatomy/build.sh`.

## Content

All content is YAML under `content/`:

| Path | Holds |
| --- | --- |
| `anatomy/muscles.yaml` | Muscle ids and names; `part_of` marks the parts of a group such as `quadriceps` |
| `sources.yaml` | Studies, books and web pages cited, with `type` (`article`, `book`, `web`) and how far we read them |
| `primitives.yaml` | Movement patterns (P1-P12) and the matrix rows each one works |
| `movements/<id>.yaml` | A joint-by-joint matrix per turn phase, the muscles that drive it, and optional structures under load |
| `drills/<id>.yaml` | A drill under a generic name, in our words, pointing at a movement and listing its primitives |
| `fundamentals/<association>.yaml` | An association's fundamentals, verbatim, and the primitives each requires (our reading) |
| `associations/<association>/<task>.yaml` | One association's name, level and fundamentals for a drill |
| `exercises/<id>.yaml` | Gym exercises and the muscles they train |

Keys are snake_case (`reviewed_by`, `dof_matrix`); enum values are lowercase. `bun run content` checks every file and writes `public/content.json` in the same snake_case form, which the app decodes into camelCase types.

Intensities are 0 (idle) to 3 (high) for the `initiation`, `shaping` and `finish` phases. Any confidence above `low` needs at least one source.

### Movements

- `dof_matrix` has one row per degree of freedom in `DOFS` (ankle up to neck): limb joints take an `outside` and an `inside` row, or one `both` row; midline joints (pelvis, lumbar, thoracic, neck) take one `trunk` row.
- Each row has a cell for every phase with exactly one of `action` (plain words) or `neutral: true`, plus `contraction`, `cue`, `confidence`, `sources` and an optional `moment`.
- Each activation lists the rows it `serves` (resolved on its side), and a `contraction` per phase that is `null` exactly when the intensity is 0.
- Activations name parts, never a group: `vasti` and `rectus-femoris`, not `quadriceps`. Groups stay for exercise targets, which match their parts.
- A citation is a source id, or `{ source, pages }` for a book: `pages: 14` or `pages: "79-81, 86"`.

A drill's `primitives` must each be shown by its movement: every row the primitive owns works (is not neutral) in some phase. A task's `fundamentals: { relation, ids }` must follow from the drill's primitives: all of them for `and`, at least one for `or` and `and/or`.

### Adding a drill

Drills are association-neutral. Add `content/drills/<id>.yaml` under a generic name, and a movement if no existing one fits:

```yaml
id: stork-turns
name: Stork turns
movement: stork-turn
summary: In your own words; never copied from an association.
terrain: Easy, groomed slopes
primitives:
  - { primitive: inside-leg-lift, modifier: tail only }
reviewed_by: []
```

Then map each association's task onto it with `content/associations/<association>/<task>.yaml` (`association` must match the folder):

```yaml
association: psia
drill: stork-turns
task: Stork Turns
level: { label: Level 2, ordinal: 2 }
category: Individual
fundamentals: { relation: and/or, ids: [edge-angles, fore-aft] }
url: https://psia-c.org/education/alpine/alpine-resources/stork-turns/
reviewed_by: []
```

### Adding an exercise

```yaml
id: split-squat-hold
name: Split squat hold
targets:
  - { muscle: quadriceps, contraction: isometric }
single_leg: true
matches_on_snow: Holding a flexed outside leg against turn forces
easier: Shallower depth
harder: Add load
cautions: [Knee pain]
dosing:
  per_side: true
  ranges:
    - goal: strength
      sets: { min: 3, max: 4 }
      hold_seconds: { min: 15, max: 30 }
      rest_seconds: { min: 60, max: 120 }
      note: Held with load; hard by the end of the hold.
    - goal: endurance
      sets: { min: 2, max: 3 }
      hold_seconds: { min: 30, max: 60 }
      rest_seconds: { min: 60, max: 90 }
      note: Body weight; a steady burn, not a shake.
  suggested: { goal: endurance, sets: 3, hold_seconds: 30 }
  basis: Plain words on where the numbers come from.
  sources: [lum-2019]
reviewed_by: []
```

`dosing` is optional general guidance, never a prescription; the app shows it only when the viewer turns it on, beside "General guidance, not a prescription; adjust with a coach or physio."

- Goals are `strength`, `endurance`, `power` and `control`, each at most once.
- Each range has `sets`, `rest_seconds` and exactly one of `reps` or `hold_seconds` (body-weight holds use seconds), all as `{ min, max }` with min ≤ max.
- `suggested` is one sets × reps (or hold) that must sit inside the range for its goal.
- `per_side: true` means the counts are for each leg or side.
- `sources` must cite ids in `sources.yaml`; keep ranges conservative and say in `basis` which parts are our own reading.

Run `bun run content` before opening a pull request.

## Licensing

- Code: [MIT](LICENSE).
- Content under `content/`: [CC BY-SA 4.0](content/LICENSE.md).
- Association material is linked, not copied; drill summaries are our own words. skibuddy is not affiliated with or endorsed by PSIA, CSIA, BASI, NZSIA or any other association.
- Not medical or training advice. Check with a qualified professional before starting an exercise programme.
