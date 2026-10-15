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
| `anatomy/muscles.yaml` | Muscle ids and names |
| `sources.yaml` | Studies cited by activations |
| `movements/<id>.yaml` | How a movement loads each muscle per turn phase |
| `drills/<id>.yaml` | A drill under a generic name, in our words, pointing at a movement |
| `associations/<association>/<task>.yaml` | One association's name, level and fundamentals for a drill |
| `exercises/<id>.yaml` | Gym exercises and the muscles they train |

Intensities are 0 (idle) to 3 (high) for the `initiation`, `shaping` and `finish` phases. Any confidence above `low` needs at least one source.

### Adding a drill

Drills are association-neutral. Add `content/drills/<id>.yaml` under a generic name, and a movement if no existing one fits:

```yaml
id: stork-turns
name: Stork turns
movement: outside-ski-turn
summary: In your own words; never copied from an association.
terrain: Easy, groomed slopes
reviewedBy: []
```

Then map each association's task onto it with `content/associations/<association>/<task>.yaml` (`association` must match the folder):

```yaml
association: psia
drill: stork-turns
task: Stork Turns
level: 2
category: Individual
fundamentals: [Control edge angles through a combination of inclination and angulation]
url: https://psia-c.org/education/alpine/alpine-resources/stork-turns/
reviewedBy: []
```

### Adding an exercise

```yaml
id: split-squat-hold
name: Split squat hold
targets:
  - { muscle: quadriceps, contraction: isometric }
singleLeg: true
matchesOnSnow: Holding a flexed outside leg against turn forces
easier: Shallower depth
harder: Add load
cautions: [Knee pain]
dosing:
  perSide: true
  ranges:
    - goal: strength
      sets: { min: 3, max: 4 }
      holdSeconds: { min: 15, max: 30 }
      restSeconds: { min: 60, max: 120 }
      note: Held with load; hard by the end of the hold.
    - goal: endurance
      sets: { min: 2, max: 3 }
      holdSeconds: { min: 30, max: 60 }
      restSeconds: { min: 60, max: 90 }
      note: Body weight; a steady burn, not a shake.
  suggested: { goal: endurance, sets: 3, holdSeconds: 30 }
  basis: Plain words on where the numbers come from.
  sources: [lum-2019]
reviewedBy: []
```

`dosing` is optional general guidance, never a prescription; the app shows it only when the viewer turns it on, beside "General guidance, not a prescription; adjust with a coach or physio."

- Goals are `strength`, `endurance`, `power` and `control`, each at most once.
- Each range has `sets`, `restSeconds` and exactly one of `reps` or `holdSeconds` (body-weight holds use seconds), all as `{ min, max }` with min ≤ max.
- `suggested` is one sets × reps (or hold) that must sit inside the range for its goal.
- `perSide: true` means the counts are for each leg or side.
- `sources` must cite ids in `sources.yaml`; keep ranges conservative and say in `basis` which parts are our own reading.

Run `bun run content` before opening a pull request.

## Licensing

- Code: [MIT](LICENSE).
- Content under `content/`: [CC BY-SA 4.0](content/LICENSE.md).
- Association material is linked, not copied; drill summaries are our own words. skibuddy is not affiliated with or endorsed by PSIA, CSIA, BASI, NZSIA or any other association.
- Not medical or training advice. Check with a qualified professional before starting an exercise programme.
