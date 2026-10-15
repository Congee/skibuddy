# skibuddy

A browser app that animates a skier through ski-instructor drills, lights up the muscles each phase of the turn works, and suggests gym exercises that train the same muscles the same way.

**Status:** milestone 0. One drill (PSIA Stork Turns), one movement model, a starter exercise library.

## Quick start

```sh
bun install
bun run dev     # builds content/ into public/content.json, then starts Vite
bun run check   # typecheck, lint, test
```

`bun run content` rebuilds and validates the content on its own; it prints every problem with its file and exits non-zero.

## Content

All content is YAML under `content/`:

| Path | Holds |
| --- | --- |
| `anatomy/muscles.yaml` | Muscle ids and names |
| `sources.yaml` | Studies cited by activations |
| `movements/<id>.yaml` | How a movement loads each muscle per turn phase |
| `associations/<association>/<task>.yaml` | An association's drill, pointing at a movement |
| `exercises/<id>.yaml` | Gym exercises and the muscles they train |

Intensities are 0 (idle) to 3 (high) for the `initiation`, `shaping` and `finish` phases. Any confidence above `low` needs at least one source.

### Adding a drill

Add `content/associations/psia/<task>.yaml` (`association` must match the folder), and a movement if no existing one fits:

```yaml
association: psia
task: Stork Turns
level: 2
category: Individual
fundamentals: [Control edge angles through a combination of inclination and angulation]
movement: outside-ski-turn
summary: In your own words; never copied from the association.
terrain: Green or easy blue, groomed
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
cautions: []
reviewedBy: []
```

Run `bun run content` before opening a pull request.

## Licensing

- Code: [MIT](LICENSE).
- Content under `content/`: [CC BY-SA 4.0](content/LICENSE.md).
- Association material is linked, not copied; drill summaries are our own words. skibuddy is not affiliated with or endorsed by PSIA, CSIA, BASI, NZSIA or any other association.
- Not medical or training advice. Check with a qualified professional before starting an exercise programme.
