/** Below this share of the figure on screen, playback pauses. */
export const MIN_VISIBLE_FRACTION = 0.1;

export interface Exposure {
  /** `document.hidden`. */
  readonly hidden: boolean;
  /** Share of the figure inside the viewport, 0..1. */
  readonly visibleFraction: number;
}

const scrolledAway = (e: Exposure): boolean => e.visibleFraction < MIN_VISIBLE_FRACTION;

export const outOfSight = (e: Exposure): boolean => e.hidden || scrolledAway(e);

export interface AutoPause {
  /** Feeds a visibility or intersection change. */
  readonly update: (next: Partial<Exposure>) => void;
  readonly exposure: () => Exposure;
}

/**
 * Pauses playback as the page hides or the figure scrolls away. It never
 * resumes, and play pressed while out of sight is left alone: play stays a user action.
 */
export const createAutoPause = (playing: () => boolean, pause: () => void, start: Exposure = { hidden: false, visibleFraction: 1 }): AutoPause => {
  let exposure = start;
  return {
    update: (next) => {
      const before = exposure;
      exposure = { ...exposure, ...next };
      const hid = exposure.hidden && !before.hidden;
      const left = scrolledAway(exposure) && !scrolledAway(before);
      if ((hid || left) && playing()) pause();
    },
    exposure: () => exposure,
  };
};
