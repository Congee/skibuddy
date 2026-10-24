import { describe, expect, it } from 'vitest';
import type { Frame3, V3 } from '../scripts/capture/gate-math';
import { addV, cross, dot, norm, scale, sub, unit } from '../scripts/capture/gate-math';
import { physicsGate, Z95 } from '../scripts/capture/physics-gate';
import type { PhysicsClip, PhysicsInput } from '../scripts/capture/physics-gate';
import { forcesAt, G } from '../src/physics/turn';
import type { TurnScenario } from '../src/physics/turn';

const DEG = 180 / Math.PI;
const SHAPE = { tip: 0.8, tail: -0.8, base: -0.02, halfWidth: 0.035 };
const FPS = 30;
const TURN: TurnScenario = { speedMps: 12, radiusM: 20, slopeDeg: 15 };
const ALPHA = (TURN.slopeDeg * Math.PI) / 180;
// World y up; the slope falls along `down`, `across` is level.
const N: V3 = [0, Math.cos(ALPHA), Math.sin(ALPHA)];
const DOWN: V3 = [0, -Math.sin(ALPHA), Math.cos(ALPHA)];
const ACROSS: V3 = [1, 0, 0];
const HEIGHT = 0.9;

const seeded = (seed: number): (() => number) => {
  let s = seed >>> 0;
  const u = (): number => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return () => Math.sqrt(-2 * Math.log(1 - u())) * Math.cos(2 * Math.PI * u());
};

const fromCols = (x: V3, y: V3, z: V3): number[] => [x[0], y[0], z[0], x[1], y[1], z[1], x[2], y[2], z[2]];

interface Variant {
  /** COM noise, m. */
  readonly noise?: number;
  /** Skis moved across the heading, m: the body leans off its force line. */
  readonly shift?: number;
  /** Extra downward acceleration along the snow normal, in g. */
  readonly sink?: number;
  /** Skis flat on the snow whatever the force. */
  readonly flat?: boolean;
}

/** Turn angle from the across-slope heading at each frame. */
const betas = Array.from({ length: 120 }, (_, k) => 0.3 + ((TURN.speedMps / TURN.radiusM) * k) / FPS);

/** A constant-speed round turn on the slope: COM on a circle HEIGHT above it, skis under the snow force's line. */
const roundTurn = (v: Variant = {}): PhysicsInput[] => {
  const gauss = seeded(7);
  return betas.map((b, k) => {
    const t = k / FPS;
    const H = addV(scale(ACROSS, Math.cos(b)), scale(DOWN, Math.sin(b)));
    const out = addV(scale(ACROSS, Math.sin(b)), scale(DOWN, -Math.cos(b)));
    const sink = scale(N, -0.5 * (v.sink ?? 0) * G * t * t);
    const c = addV(addV(addV(scale(out, TURN.radiusM), scale(N, HEIGHT)), sink), [0, 0, 0].map(() => (v.noise ?? 0) * gauss()));
    const f = sub(scale(out, -(TURN.speedMps ** 2) / TURN.radiusM), [0, -G, 0]);
    const q = sub(c, scale(f, dot(N, c) / dot(N, f)));
    const e = unit(cross(H, N));
    const lean = Math.atan2(dot(f, e), dot(f, N));
    // More edge than the force needs: the platform holds.
    const tilt = v.flat === true ? 0 : lean + Math.sign(lean) * (5 / DEG);
    const y = addV(scale(N, Math.cos(tilt)), scale(e, Math.sin(tilt)));
    const x = cross(y, H);
    const R = fromCols(x, y, H);
    const ski = (side: number): Frame3 => {
      const at = addV(q, scale(e, side * 0.1 + (v.shift ?? 0)));
      const edge = -SHAPE.halfWidth * Math.sign(dot(N, x) || 1);
      return { R, p: sub(at, addV(scale(x, edge), scale(y, SHAPE.base))) };
    };
    return { mass: { com: c, segments: [{ mass: 1, centre: c, axis: y, length: 0 }] }, skis: { L: ski(-1), R: ski(1) } };
  });
};

const run = (v: Variant = {}): PhysicsClip => physicsGate(roundTurn({ noise: 0.002, ...v }), { dt: 1 / FPS, ski: SHAPE, scaleSigma: 0.01, snowHalf: 12 });
const failed = (p: PhysicsClip, check: 'balance' | 'foreAft' | 'contact' | 'edge'): number => p.frames.filter((f) => f.checks[check]?.pass === false).length;
const median = (xs: ReadonlyArray<number>): number => xs.toSorted((a, b) => a - b)[Math.floor(xs.length / 2)] ?? Number.NaN;

describe('physics gate on a synthetic round turn', () => {
  const clean = run();

  it('finds the snow plane and loads every frame', () => {
    expect(clean.frames.every((f) => Math.abs(f.slope - TURN.slopeDeg) < 0.1)).toBe(true);
    expect(clean.frames.every((f) => f.loaded)).toBe(true);
  });

  it("requires forcesAt's tilt within its own uncertainty", () => {
    const within = clean.frames.filter((f, k) => Math.abs(Math.abs(f.tilt.required) - Math.abs(forcesAt(TURN, betas[k] ?? 0).tilt * DEG)) <= Z95 * f.edge.sigma);
    expect(within.length / clean.frames.length).toBeGreaterThanOrEqual(0.9);
  });

  it('passes a balanced body with its edges holding', () => {
    for (const check of ['balance', 'foreAft', 'contact', 'edge'] as const) expect(failed(clean, check)).toBe(0);
    expect(clean.frames.filter((f) => f.skid.evident).length).toBeLessThanOrEqual(0.1 * clean.frames.length);
  });

  it('fails a body leaning off its force line, more so the further it leans', () => {
    const counts = [0.2, 0.4, 0.8].map((shift) => failed(run({ shift }), 'balance'));
    expect(counts[2]).toBe(clean.frames.length);
    expect(counts).toEqual(counts.toSorted((a, b) => a - b));
  });

  it('fails snow that would have to pull the skier down', () => {
    const sunk = run({ sink: 2 });
    expect(failed(sunk, 'contact')).toBe(sunk.frames.length);
    expect(sunk.frames.every((f) => f.normal.value < 0)).toBe(true);
  });

  it('fails flat skis under a tilted force when nothing skids', () => {
    const flat = run({ flat: true });
    expect(failed(flat, 'edge')).toBeGreaterThanOrEqual(0.9 * flat.frames.length);
    expect(failed(flat, 'balance')).toBe(0);
  });

  it('widens every interval on a noisier capture', () => {
    const noisy = run({ noise: 0.01 });
    expect(median(noisy.frames.map((f) => f.tilt.sigma))).toBeGreaterThan(median(clean.frames.map((f) => f.tilt.sigma)));
    expect(median(noisy.frames.map((f) => f.forceSigma))).toBeGreaterThan(median(clean.frames.map((f) => f.forceSigma)));
    expect(norm(noisy.comNoise)).toBeGreaterThan(norm(clean.comNoise));
  });
});
