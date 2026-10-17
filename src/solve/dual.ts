// Forward-mode dual numbers: a value plus its gradient over a block's local variables.

export class Dual {
  constructor(
    readonly v: number,
    readonly d: Float64Array,
  ) {}

  add(b: Dual | number): Dual {
    if (typeof b === 'number') return new Dual(this.v + b, this.d);
    const d = new Float64Array(this.d.length);
    for (let i = 0; i < d.length; i++) d[i] = (this.d[i] ?? 0) + (b.d[i] ?? 0);
    return new Dual(this.v + b.v, d);
  }

  sub(b: Dual | number): Dual {
    if (typeof b === 'number') return new Dual(this.v - b, this.d);
    const d = new Float64Array(this.d.length);
    for (let i = 0; i < d.length; i++) d[i] = (this.d[i] ?? 0) - (b.d[i] ?? 0);
    return new Dual(this.v - b.v, d);
  }

  mul(b: Dual | number): Dual {
    if (typeof b === 'number') return this.chain(this.v * b, b);
    const d = new Float64Array(this.d.length);
    for (let i = 0; i < d.length; i++) d[i] = (this.d[i] ?? 0) * b.v + this.v * (b.d[i] ?? 0);
    return new Dual(this.v * b.v, d);
  }

  div(b: Dual | number): Dual {
    if (typeof b === 'number') return this.chain(this.v / b, 1 / b);
    const q = this.v / b.v;
    const d = new Float64Array(this.d.length);
    for (let i = 0; i < d.length; i++) d[i] = ((this.d[i] ?? 0) - q * (b.d[i] ?? 0)) / b.v;
    return new Dual(q, d);
  }

  neg(): Dual {
    return this.chain(-this.v, -1);
  }

  square(): Dual {
    return this.chain(this.v * this.v, 2 * this.v);
  }

  sqrt(): Dual {
    const s = Math.sqrt(this.v);
    return this.chain(s, 0.5 / s);
  }

  sin(): Dual {
    return this.chain(Math.sin(this.v), Math.cos(this.v));
  }

  cos(): Dual {
    return this.chain(Math.cos(this.v), -Math.sin(this.v));
  }

  exp(): Dual {
    const e = Math.exp(this.v);
    return this.chain(e, e);
  }

  // Applies f with f(this) = v and f'(this) = slope.
  chain(v: number, slope: number): Dual {
    const d = new Float64Array(this.d.length);
    for (let i = 0; i < d.length; i++) d[i] = (this.d[i] ?? 0) * slope;
    return new Dual(v, d);
  }
}

export const constant = (v: number, n: number): Dual => new Dual(v, new Float64Array(n));

// Seeds one dual per variable with a unit tangent.
export const seed = (x: ArrayLike<number>): Dual[] => {
  const n = x.length;
  return Array.from({ length: n }, (_, i) => {
    const d = new Float64Array(n);
    d[i] = 1;
    return new Dual(x[i] ?? 0, d);
  });
};

export const sum = (xs: readonly Dual[], n: number): Dual => xs.reduce((a, b) => a.add(b), constant(0, n));
