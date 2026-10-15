import { BoxGeometry, BufferAttribute, BufferGeometry, Color, CylinderGeometry, FrontSide, Mesh, MeshStandardNodeMaterial, Vector3 } from 'three/webgpu';
import { color, dot, float, mix, normalView, positionViewDirection, pow, saturate, uniform } from 'three/tsl';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { BodySide } from './figure';
import type { BootFit } from './gear-fit';
import { GearMode } from './gear-mode';
import type { Vec3 } from './mat4';
import { POLE } from './pose';

export type LegSide = typeof BodySide.Left | typeof BodySide.Right;

const SHELL = 0x2f4d7a;
const TRIM = 0x17212b;
/** Fresnel edge on the snow, and brighter on the dark field. */
const EDGE = { light: 0x9dbde6, dark: 0xe8f2ff } as const;
/** Above the ground (0) and contact shadow (1), in a fixed order so the sort never flips. */
const ORDER = { pole: 2, cuff: 4, shell: 5 } as const;

type Ring = ReadonlyArray<Vec3>;

/** Joins rings of equal length into a tube whose faces point outward when rings run along the axis and turn counter-clockwise. */
const loft = (rings: ReadonlyArray<Ring>): BufferGeometry => {
  const n = rings[0]?.length ?? 0;
  const position = new Float32Array(rings.length * n * 3);
  rings.forEach((ring, i) => ring.forEach((p, k) => position.set(p, (i * n + k) * 3)));
  const index: Array<number> = [];
  for (let i = 0; i + 1 < rings.length; i++) {
    for (let k = 0; k < n; k++) {
      const a = i * n + k;
      const b = i * n + ((k + 1) % n);
      const c = b + n;
      const d = a + n;
      index.push(a, b, d, b, c, d);
    }
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(position, 3));
  g.setIndex(index);
  g.computeVertexNormals();
  return g;
};

const superCos = (a: number, e: number): number => Math.sign(Math.cos(a)) * Math.abs(Math.cos(a)) ** e;
const superSin = (a: number, e: number): number => Math.sign(Math.sin(a)) * Math.abs(Math.sin(a)) ** e;
const smooth = (a: number, b: number, x: number): number => {
  const u = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return u * u * (3 - 2 * u);
};

const AROUND = 28;

/** Lower shell: boxy sections from heel to toe, rounded shut at both ends, flat on the sole. */
export const shellGeometry = (fit: BootFit): BufferGeometry => {
  const steps = 22;
  const toeTop = fit.sole + 0.085;
  const rings = Array.from({ length: steps + 1 }, (_, i): Ring => {
    const s = i / steps;
    const z = fit.heel + s * (fit.toe - fit.heel);
    const end = (1 - Math.abs(2 * s - 1) ** 6) ** (1 / 3);
    const top = 0.055 + (toeTop - 0.055) * smooth(0.3, 0.88, s);
    const half = ((top - fit.sole) / 2) * end;
    const width = fit.halfWidth * (0.84 + 0.16 * Math.exp(-(((s - 0.68) / 0.3) ** 2))) * Math.sqrt(end);
    return Array.from({ length: AROUND }, (__, k): Vec3 => {
      const a = (2 * Math.PI * k) / AROUND;
      return [fit.centreX + width * superCos(a, 0.6), fit.sole + half + half * superSin(a, 0.6), z];
    });
  });
  return loft(rings);
};

/** The cuff's outline at angle `a` (0 = front, toward +x) and height `y`, flaring slightly upward. */
const cuffPoint = (fit: BootFit, a: number, y: number, grow: number): Vec3 => {
  const flare = 1 + 0.05 * Math.max(0, y / fit.cuffTop) + grow;
  return [fit.cuffX + fit.cuffRx * flare * superSin(a, 0.8), y, fit.cuffZ + fit.cuffRz * flare * superCos(a, 0.8)];
};

/** Cuff top, higher at the back like a spoiler. */
const cuffTopAt = (fit: BootFit, a: number): number => fit.cuffTop + 0.015 * -Math.cos(a);

const band = (fit: BootFit, from: (a: number) => number, to: (a: number) => number, grow: number, steps: number): BufferGeometry =>
  loft(
    Array.from({ length: steps + 1 }, (_, j) =>
      Array.from({ length: AROUND }, (__, k) => {
        const a = (2 * Math.PI * k) / AROUND;
        return cuffPoint(fit, a, from(a) + ((to(a) - from(a)) * j) / steps, grow);
      }),
    ),
  );

/** Upper cuff from just below the ankle to the top, overlapping the shell. */
export const cuffGeometry = (fit: BootFit): BufferGeometry => band(fit, () => -0.035, (a) => cuffTopAt(fit, a), 0, 10);

const plain = (g: BufferGeometry): BufferGeometry => {
  g.deleteAttribute('uv');
  return g;
};

/** A small buckle box on the outline at angle `a`, turned to lie flat on it. */
const buckle = (at: Vec3, a: number, size: Vec3): BufferGeometry => {
  const g = plain(new BoxGeometry(size[0], size[1], size[2]));
  g.rotateY(a - Math.PI / 2);
  g.translate(at[0], at[1], at[2]);
  return g;
};

/** The boot's flat sole; it stays when the gear is off, so the foot still meets the ski. */
export const soleGeometry = (fit: BootFit): BufferGeometry => {
  const sole = plain(new BoxGeometry(fit.halfWidth * 1.5, 0.014, fit.toe - fit.heel + 0.01));
  sole.translate(fit.centreX, fit.sole + 0.007, (fit.heel + fit.toe) / 2);
  return sole;
};

/** Power strap round the cuff top and buckles on the outer side. */
const trimGeometry = (fit: BootFit, side: LegSide): { readonly shell: BufferGeometry; readonly cuff: BufferGeometry } => {
  const lateral = side === BodySide.Left ? 1 : -1;
  const a = lateral * 1.15;
  const strap = band(fit, (x) => cuffTopAt(fit, x) - 0.045, (x) => cuffTopAt(fit, x) - 0.008, 0.06, 1);
  const cuffBuckles = [0.05, 0.11].map((y) => buckle(cuffPoint(fit, a, y, 0.08), a, [0.012, 0.014, 0.045]));
  const instep = [0.45, 0.62].map((s) => {
    const z = fit.heel + s * (fit.toe - fit.heel);
    const top = 0.055 + (fit.sole + 0.085 - 0.055) * smooth(0.3, 0.88, s);
    return buckle([fit.centreX + lateral * fit.halfWidth * 0.75, top - 0.012, z], lateral * 1.2, [0.01, 0.014, 0.04]);
  });
  return { shell: mergeOrThrow(instep), cuff: mergeOrThrow([strap, ...cuffBuckles]) };
};

const mergeOrThrow = (parts: ReadonlyArray<BufferGeometry>, groups = false): BufferGeometry => {
  const merged = mergeGeometries([...parts], groups);
  if (merged === null) throw new Error('gear parts do not merge');
  for (const p of parts) p.dispose();
  return merged;
};

/** One pole in its own frame: fist at the origin, shaft down -y to the spike. */
export const poleGeometry = (): BufferGeometry => {
  const shaftEnd = POLE.reach - 0.03;
  const shaft = plain(new CylinderGeometry(0.009, 0.0065, shaftEnd - 0.08, 8, 1, true));
  shaft.translate(0, -(0.08 + shaftEnd) / 2, 0);
  // Reaches above the fist, where the thumb wraps it.
  const grip = plain(new CylinderGeometry(0.019, 0.016, 0.16, 12));
  grip.translate(0, 0.025, 0);
  const basket = plain(new CylinderGeometry(0.045, 0.04, 0.008, 18));
  basket.translate(0, -POLE.basket, 0);
  const spike = plain(new CylinderGeometry(0.0065, 0.002, 0.03, 8));
  spike.translate(0, -POLE.reach + 0.015, 0);
  return mergeOrThrow([shaft, mergeOrThrow([grip, basket, spike])], true);
};

interface Backdrop {
  readonly edge: ReturnType<typeof uniform<'color'>>;
  readonly gain: ReturnType<typeof uniform<'float'>>;
}

/** Translucent plastic: nearly clear face-on, edged where the surface turns away. */
const translucent = (hex: number, face: number, backdrop: Backdrop): MeshStandardNodeMaterial => {
  const m = new MeshStandardNodeMaterial({ transparent: true, depthWrite: false, side: FrontSide, roughness: 0.35 });
  const edge = pow(float(1).sub(saturate(dot(normalView, positionViewDirection))), 2.2);
  m.colorNode = mix(color(hex), backdrop.edge, edge.mul(backdrop.gain));
  m.opacityNode = edge.mul(backdrop.gain.add(0.1)).add(face);
  return m;
};

const solid = (hex: number): MeshStandardNodeMaterial => new MeshStandardNodeMaterial({ color: hex, roughness: 0.4, side: FrontSide });

export interface GearPart {
  readonly mesh: Mesh;
  readonly side: LegSide;
}

export interface Gear {
  readonly shells: ReadonlyArray<GearPart>;
  readonly soles: ReadonlyArray<GearPart>;
  readonly cuffs: ReadonlyArray<GearPart>;
  readonly poles: ReadonlyArray<GearPart>;
  readonly setMode: (mode: GearMode) => void;
  /** Brightens the translucent edges over a dark field. */
  readonly setDark: (dark: boolean) => void;
  readonly dispose: () => void;
}

const SIDES: ReadonlyArray<LegSide> = [BodySide.Right, BodySide.Left];

/** Boots and poles, unparented; each figure places them. */
export const createGear = (boots: Readonly<Record<LegSide, BootFit>>): Gear => {
  const backdrop: Backdrop = { edge: uniform(new Color(EDGE.light)), gain: uniform(0.65) };
  const glass = [translucent(SHELL, 0.16, backdrop), translucent(TRIM, 0.45, backdrop)] as const;
  const opaque = [solid(SHELL), solid(TRIM)] as const;
  const make = (geometry: BufferGeometry, side: LegSide, order: number): GearPart => {
    const mesh = new Mesh(geometry, [...glass]);
    mesh.renderOrder = order;
    return { mesh, side };
  };
  const trims = SIDES.map((side) => ({ side, trim: trimGeometry(boots[side], side) }));
  // mergeOrThrow frees each trim half once it is merged.
  const shells = trims.map(({ side, trim }) => make(mergeOrThrow([shellGeometry(boots[side]), trim.shell], true), side, ORDER.shell));
  const cuffs = trims.map(({ side, trim }) => make(mergeOrThrow([cuffGeometry(boots[side]), trim.cuff], true), side, ORDER.cuff));
  // Trim colour only: the second material slot.
  const soles = SIDES.map((side) => {
    const g = soleGeometry(boots[side]);
    g.addGroup(0, g.index?.count ?? 0, 1);
    return make(g, side, ORDER.shell);
  });
  const pole = poleGeometry();
  const poles = SIDES.map((side) => make(pole, side, ORDER.pole));
  const all = [...shells, ...soles, ...cuffs, ...poles];
  return {
    shells,
    soles,
    cuffs,
    poles,
    setMode: (mode) => {
      for (const { mesh } of all) {
        mesh.visible = mode !== GearMode.Off;
        mesh.material = mode === GearMode.Solid ? [...opaque] : [...glass];
      }
      // With the gear off the sole stays, so the foot still stands on the ski.
      for (const { mesh } of soles) {
        mesh.visible = true;
        if (mode === GearMode.Off) mesh.material = [...opaque];
      }
    },
    setDark: (dark) => {
      backdrop.edge.value.set(dark ? EDGE.dark : EDGE.light);
      backdrop.gain.value = dark ? 0.85 : 0.65;
    },
    dispose: () => {
      for (const { mesh } of all) {
        mesh.removeFromParent();
        mesh.geometry.dispose();
      }
      for (const m of [...glass, ...opaque]) m.dispose();
    },
  };
};

const DOWN = new Vector3(0, -1, 0);
const along = new Vector3();

/** Puts a pole's fist at `grip` with its shaft along the unit `direction`. */
export const placePole = (mesh: Mesh, grip: Vec3, direction: Vec3): void => {
  mesh.position.set(grip[0], grip[1], grip[2]);
  mesh.quaternion.setFromUnitVectors(DOWN, along.set(direction[0], direction[1], direction[2]));
};
