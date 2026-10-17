import { it } from '@effect/vitest';

// Class (iv) point bands and targets on derived outputs: `bun run test:legacy` runs them, `bun run test` leaves them out.
export const LEGACY = 'legacy: ';

export const legacyIt = (name: string, fn: () => void): void => {
  it(`${LEGACY}${name}`, fn);
};

// A known defect of the current solver, failing until the named pipeline step lands; a fix flips it.
export const failsUntil =
  (step: string, failing = true) =>
  (name: string, fn: () => void): void => {
    if (failing) it.fails(`${name} [fails until ${step}]`, fn);
    else it(name, fn);
  };
