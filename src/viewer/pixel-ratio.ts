export interface Display {
  readonly devicePixelRatio: number;
  /** A touch screen or a phone-sized viewport. */
  readonly handheld: boolean;
  readonly playing: boolean;
}

const DESKTOP_CAP = 2;
const HANDHELD_CAP = 1.5;
/** Motion hides softness, so playback draws fewer pixels. */
const PLAYING_SCALE = 0.75;

/** Full resolution for the still frame, less while playing; never below 1 unless the screen is. */
export const pixelRatio = (d: Display): number => {
  const still = Math.min(d.devicePixelRatio, d.handheld ? HANDHELD_CAP : DESKTOP_CAP);
  return d.playing ? Math.min(still, Math.max(1, still * PLAYING_SCALE)) : still;
};
