import { clamp, float, mix, sRGBTransferEOTF, vec3 } from 'three/tsl';
import type { Node } from 'three/webgpu';

/** The board's level colours: l1, l2, l3. */
export const LEVEL_COLOURS = [0xf2b33d, 0xe0602a, 0x9e1f63] as const;

type Level = Node<'float'>;

const srgb = (hex: number): Node<'vec3'> => vec3(((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255);

/** How far a 0..1 level (effort / 3) is from rest toward l1; the board's rest-to-l1 blend. */
export const levelOn = (level: Level): Node<'float'> => clamp(level.mul(3), 0, 1);

/**
 * The board's effortColour above l1, for a 0..1 level: l1 to l2 to l3, mixed
 * linearly in sRGB like the board's ramp. Rest is the caller's own colour, blended by `levelOn`.
 */
export const levelColour = (level: Level): Node<'vec3'> => {
  const x = float(level).mul(3);
  const c = mix(mix(srgb(LEVEL_COLOURS[0]), srgb(LEVEL_COLOURS[1]), clamp(x.sub(1), 0, 1)), srgb(LEVEL_COLOURS[2]), clamp(x.sub(2), 0, 1));
  // The TSL typings leave this Fn's result untyped.
  return sRGBTransferEOTF(c) as Node<'vec3'>;
};
