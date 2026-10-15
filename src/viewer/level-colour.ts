import { color, mix, smoothstep } from 'three/tsl';

/** The board's level colours: l1, l2, l3. */
export const LEVEL_COLOURS = [0xf2b33d, 0xe0602a, 0x9e1f63] as const;

type Level = Parameters<typeof smoothstep>[2];

/** Blends through the level colours as a 0..1 level (level / 3) rises. */
export const levelColour = (level: Level): ReturnType<typeof mix> =>
  mix(
    mix(color(LEVEL_COLOURS[0]), color(LEVEL_COLOURS[1]), smoothstep(1 / 3, 2 / 3, level)),
    color(LEVEL_COLOURS[2]),
    smoothstep(2 / 3, 1, level),
  );
