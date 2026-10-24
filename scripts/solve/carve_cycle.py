# /// script
# requires-python = ">=3.11,<3.13"
# dependencies = ["casadi==3.7.2", "numpy==2.1.3"]
# ///
"""The carved turn from switch to switch as one periodic direct-collocation solve (CasADi + IPOPT), offline.

Ports src/physics/turn.ts's carve: the pendulum on the pressure centre, skiCurvatureOf, the speed law. Constants come
from a JSON the lane's bun dump writes; nothing here is retyped from TS.
  port CONST TSVALS OUT        the port table against TS values
  solve CONST OUT [options]    one solve; writes the trajectory JSON
  cycle CONST OUT [options]    the share-law solve with the λ_peak fixed point
  link A A_HALF B B_HALF       both starts linked and agreeing
  bake OUT --cell NAME SOL SOL_HALF REPLAY [--other NAME SOL SOL_HALF] ...   carve-cycles.json, gated
"""
import argparse
import json
import math
import os
import sys

import casadi as ca
import numpy as np

NX = ['lam', 'lamDot', 'h', 'hd', 'eps', 'p', 'pd', 'psi', 'v']
NU = ['hdd', 'epsDot', 'pdd']


class Model:
  def __init__(self, c: dict):
    self.c = c
    self.G = c['G']
    th = c['slopeDeg'] * math.pi / 180
    self.cos, self.sin = math.cos(th), math.sin(th)
    sk = c['ski']
    self.Rsc = sk['sidecutRadius']
    self.depth = (sk['tip'] + sk['tail'] - 2 * sk['waist']) / 4
    b = c['bend']
    self.bendK = b['radiusM'] * b['forceN']

  # Exact port, floats only.
  def bend_radius(self, force: float) -> float:
    b = self.c['bend']
    r = self.bendK / force if force > 0 else b['max']
    return min(b['max'], max(b['min'], r))

  def carved_radius(self, e: float, sink: float) -> float:
    return (8 * self.depth * self.Rsc) / (8 * (self.depth / math.cos(e) + sink * math.sin(e)))

  def ski_curvature(self, eps: float, load: float, share: float):
    force = max(0.0, load) * share * self.c['mass'] * self.G
    bend = self.bend_radius(force)
    e = abs(eps)
    pressed = math.cos(e) / bend - math.sin(e) / self.Rsc >= 0
    k = 1 / self.carved_radius(e, self.c['compliance'] * force) if pressed else math.cos(e) / self.Rsc + math.sin(e) / bend
    return (-k if eps < 0 else k), pressed

  def lam_acc(self, h, hd, lam, lamDot, psi, a):
    return (self.G * self.cos * math.sin(lam) - (a - self.G * self.sin * math.cos(psi)) * math.cos(lam) - 2 * hd * lamDot) / h

  def force(self, h, hdd, lam, lamDot, psi, a):
    return hdd - h * lamDot ** 2 + self.G * self.cos * math.cos(lam) + (a - self.G * self.sin * math.cos(psi)) * math.sin(lam)

  def accel(self, psi, v, load):
    return self.G * (self.sin * math.sin(psi) - self.c['mu'] * load - self.c['dragPerV2'] * v * v)

  def k_mass(self, lam, psi, v, load):
    return (load * self.G * math.sin(lam) + self.G * self.sin * math.cos(psi)) / (v * v)

  # Solve form: pressed branch only (the grip constraint holds it), sign(ε) as tanh(ε/δ); casadi or float.
  def inv_bend_s(self, force):
    b = self.c['bend']
    return ca.fmin(1 / b['min'], ca.fmax(1 / b['max'], force / self.bendK))

  def ski_curvature_s(self, eps, force, delta):
    sink = self.c['compliance'] * force
    return (ca.tanh(eps / delta) * self.depth / ca.cos(eps) + sink * ca.sin(eps)) / (self.depth * self.Rsc)

  def pressed_margin_s(self, eps, force, delta):
    return ca.cos(eps) * self.inv_bend_s(force) - ca.tanh(eps / delta) * ca.sin(eps) / self.Rsc

  # §7's share law as carveTurn's lawOf: p = amp σ(|λ|/λ_peak), p̈ = A λ̈ + B; past λ_peak p holds at amp.
  def law(self, lam, w, lam_peak):
    amp = -(self.c['S'] - self.c['SWITCH_SHARE']) * self.c['stance']
    u = 0.0 if lam == 0 else abs(lam) / lam_peak
    if not u < 1:
      return amp, 0.0, 0.0, 0.0
    A = amp * 6 * u * (1 - u) * math.copysign(1, lam) / lam_peak
    return amp * u * u * (3 - 2 * u), A * w, A, amp * (6 - 12 * u) * w * w / lam_peak ** 2

  def law_lam_acc(self, h, hd, lam, lamDot, psi, vk, A, B):
    return (self.G * self.cos * math.sin(lam) - (vk + B - self.G * self.sin * math.cos(psi)) * math.cos(lam) - 2 * hd * lamDot) / (h + A * math.cos(lam))

  # λ ≥ 0 is a bound in the solve, so |λ| = λ and sign(λ) is 1 wherever A ≠ 0.
  def law_s(self, lam, w, lam_peak):
    amp = -(self.c['S'] - self.c['SWITCH_SHARE']) * self.c['stance']
    u = lam / lam_peak
    inside = u < 1
    p = ca.if_else(inside, amp * u * u * (3 - 2 * u), amp)
    A = ca.if_else(inside, amp * 6 * u * (1 - u) / lam_peak, 0)
    B = ca.if_else(inside, amp * (6 - 12 * u) * w * w / lam_peak ** 2, 0)
    return p, A * w, A, B

  def rhs_law(self, x, u, load, delta, lam_peak):
    lam, lamDot, h, hd, eps, psi, v = [x[i] for i in range(7)]
    hdd, epsDot = u[0], u[1]
    G = self.G
    p, pd, A, B = self.law_s(lam, lamDot, lam_peak)
    share = self.c['SWITCH_SHARE'] - p / self.c['stance']
    force = load * share * self.c['mass'] * G
    kap = self.ski_curvature_s(eps, force, delta)
    pull = G * self.sin * ca.cos(psi)
    inertia = h + A * ca.cos(lam)
    lamAcc = (G * self.cos * ca.sin(lam) - (v * v * kap + B - pull) * ca.cos(lam) - 2 * hd * lamDot) / inertia
    pdd = A * lamAcc + B
    fm = hdd - h * lamDot ** 2 + G * self.cos * ca.cos(lam) + (v * v * kap + pdd - pull) * ca.sin(lam)
    psiDot = (load * G * ca.sin(lam) + G * self.sin * ca.cos(psi)) / v
    vDot = G * (self.sin * ca.sin(psi) - self.c['mu'] * load - self.c['dragPerV2'] * v * v)
    xd = ca.vertcat(lamDot, lamAcc, hd, hdd, epsDot, psiDot, vDot)
    return xd, fm - load * G, kap, share, force, {'p': p, 'pd': pd, 'pdd': pdd, 'inertia': inertia}

  def rhs(self, x, u, load, delta):
    lam, lamDot, h, hd, eps, p, pd, psi, v = [x[i] for i in range(9)]
    hdd, epsDot, pdd = [u[i] for i in range(3)]
    G = self.G
    share = self.c['SWITCH_SHARE'] - p / self.c['stance']
    force = load * share * self.c['mass'] * G
    kap = self.ski_curvature_s(eps, force, delta)
    a = v * v * kap + pdd
    lamAcc = (G * self.cos * ca.sin(lam) - (a - G * self.sin * ca.cos(psi)) * ca.cos(lam) - 2 * hd * lamDot) / h
    fm = hdd - h * lamDot ** 2 + G * self.cos * ca.cos(lam) + (a - G * self.sin * ca.cos(psi)) * ca.sin(lam)
    psiDot = (load * G * ca.sin(lam) + G * self.sin * ca.cos(psi)) / v
    vDot = G * (self.sin * ca.sin(psi) - self.c['mu'] * load - self.c['dragPerV2'] * v * v)
    xd = ca.vertcat(lamDot, lamAcc, hd, hdd, epsDot, pd, pdd, psiDot, vDot)
    return xd, fm - load * G, kap, share, force


def port(args):
  c = json.load(open(args.const))
  ts = json.load(open(args.tsvals))
  m = Model(c)
  rel = lambda py, t: abs(py - t) / max(abs(t), 1e-300)
  rows, flips = {'kappa_pressed': 0.0, 'kappa_bridged': 0.0}, 0
  worst = {}
  for r in ts['kappa']:
    k, pr = m.ski_curvature(r['eps'], r['load'], r['share'])
    flips += pr != r['pressed']
    key = 'kappa_pressed' if r['pressed'] else 'kappa_bridged'
    e = rel(k, r['k'])
    if e >= rows[key]:
      rows[key], worst[key] = e, r
  # The solve's form against TS where the grip constraint puts it: pressed, ε ≥ 5δ, load ≥ 0.
  sm = {}
  for d in (1.0, 0.5):
    delta = d * math.pi / 180
    e_max = 0.0
    for r in ts['kappa']:
      if r['pressed'] and r['eps'] >= 5 * delta and r['load'] >= 0:
        f = r['load'] * r['share'] * c['mass'] * c['G']
        e_max = max(e_max, rel(float(m.ski_curvature_s(r['eps'], f, delta)), r['k']))
    sm[f'kappa_solve_form_delta{d}deg_eps_ge_5delta'] = e_max
  pe = {'lamAcc': 0.0, 'force': 0.0, 'accel': 0.0, 'kMass': 0.0}
  for r in ts['pend']:
    q = r['q']
    pe['lamAcc'] = max(pe['lamAcc'], rel(m.lam_acc(q['h'], q['hd'], q['lam'], q['lamDot'], r['psi'], r['a']), r['lamAcc']))
    pe['force'] = max(pe['force'], rel(m.force(q['h'], q['hdd'], q['lam'], q['lamDot'], r['psi'], r['a']), r['force']))
    pe['accel'] = max(pe['accel'], rel(m.accel(r['psi'], r['v'], r['load']), r['accel']))
    pe['kMass'] = max(pe['kMass'], rel(m.k_mass(q['lam'], r['psi'], r['v'], r['load']), r['kMass']))
  lw = {'p': 0.0, 'pd': 0.0, 'A': 0.0, 'B': 0.0, 'lamAcc': 0.0, 'pAcc': 0.0, 'force': 0.0}
  absd = lambda py, t: abs(py - t) / max(abs(t), 1e-12)
  for r in ts.get('law', []):
    q = r['q']
    p_, pd_, A_, B_ = m.law(q['lam'], q['lamDot'], r['lamPeak'])
    la = m.law_lam_acc(q['h'], q['hd'], q['lam'], q['lamDot'], r['psi'], r['vk'], A_, B_)
    pa = A_ * la + B_
    for k, py in (('p', p_), ('pd', pd_), ('A', A_), ('B', B_), ('lamAcc', la), ('pAcc', pa), ('force', m.force(q['h'], q['hdd'], q['lam'], q['lamDot'], r['psi'], r['vk'] + pa))):
      lw[k] = max(lw[k], absd(py, r[k]))
    sl = [float(z) for z in m.law_s(q['lam'], q['lamDot'], r['lamPeak'])]
    lw['solveForm'] = max(lw.get('solveForm', 0.0), *(absd(a, b) for a, b in zip(sl, (p_, pd_, A_, B_))))
  pe = {**pe, **{f'law_{k}': v for k, v in lw.items()}}
  out = {'worstRel': {**rows, **pe}, 'branchFlips': flips, 'n': {'kappa': len(ts['kappa']), 'pend': len(ts['pend'])}, 'solveForm': sm,
         'worstAt': worst}
  json.dump(out, open(args.out, 'w'), indent=1)
  print(json.dumps({k: out[k] for k in ('worstRel', 'branchFlips', 'n', 'solveForm')}))


def guess_of(args, c, m):
  """Start trajectory as {t: [...], name: [...]} on its own times."""
  head = args.head * math.pi / 180
  v0 = c['speedMps']
  h0 = sum(c['REACH']) / 2
  if args.start == 'r2a23':
    g = json.load(open(args.start_file))
    return {k: np.array(v) for k, v in g.items()}
  # Conservative swing: R2a23's old balance lean and energy-formula λ̇ at λ 0; flat: λ, ε, p 0.
  lam_pk = args.swing_lean * math.pi / 180 if args.start == 'swing' else 0.0
  w0 = args.swing_rate * math.pi / 180
  t_r = (math.pi / 2) * lam_pk / w0 if lam_pk > 0 else 0.0
  # T from the steady turn rate g tan λ / v (flat: gravity's pull alone, so take the swing's T).
  lp = args.swing_lean * math.pi / 180
  T = (math.pi - 2 * math.atan(h0 * w0 / v0) + math.pi / 2 - head) / (c['G'] * math.tan(lp) / v0) + t_r
  t = np.linspace(0, T, 400)
  if lam_pk > 0:
    u = np.minimum(1, np.minimum(t / t_r, (T - t) / t_r))
    lam = lam_pk * np.sin(u * math.pi / 2)
  else:
    lam = 0 * t
  lamDot = np.gradient(lam, t)
  mfrac = lam / lam_pk if lam_pk > 0 else 0 * t
  eps = lam + c['mMax'] * mfrac
  amp = -(c['S'] - c['SWITCH_SHARE']) * c['stance']
  p = amp * mfrac ** 2 * (3 - 2 * mfrac)
  psi0 = math.pi / 2 - head + math.atan(h0 * lamDot[0] / v0)
  psi = psi0 + (math.pi - 2 * psi0) * t / T
  return {'t': t, 'lam': lam, 'lamDot': lamDot, 'h': h0 + 0 * t, 'hd': 0 * t, 'eps': eps, 'p': p, 'pd': np.gradient(p, t),
          'psi': psi, 'v': v0 + 0 * t, 'load': m.cos / np.cos(lam)}


def solve(args):
  c = json.load(open(args.const))
  m = Model(c)
  d, N = 3, args.N
  delta = args.delta_deg * math.pi / 180
  head = args.head * math.pi / 180
  tau = np.append(0, ca.collocation_points(d, 'radau'))
  C, Dend = np.zeros((d + 1, d + 1)), np.zeros(d + 1)
  for j in range(d + 1):
    p = np.poly1d([1])
    for r in range(d + 1):
      if r != j:
        p *= np.poly1d([1, -tau[r]]) / (tau[j] - tau[r])
    Dend[j] = p(1.0)
    dp = np.polyder(p)
    for r in range(d + 1):
      C[j, r] = dp(tau[r])

  g = guess_of(args, c, m)
  Tg = float(g['t'][-1])
  gi = lambda k, tt: float(np.interp(tt, g['t'], g[k]))

  w, lbw, ubw, w0, g_, lbg, ubg = [], [], [], [], [], [], []
  inf = math.inf

  def var(n, lb, ub, init):
    x = ca.SX.sym('w', n)
    w.append(x)
    lbw.extend(lb)
    ubw.extend(ub)
    w0.extend(init)
    return x

  def con(e, lb, ub):
    g_.append(e)
    lbg.extend([lb] * e.numel())
    ubg.extend([ub] * e.numel())

  T = var(1, [0.05], [60], [Tg])
  hstep = T / N
  lo = {'lam': 0.0 if args.lam_nonneg else -math.pi / 2, 'h': c['REACH'][0], 'eps': -c['ROOT_TOP'], 'p': -c['stance'] / 2, 'psi': 0.0, 'v': c['V_FLOOR']}
  hi = {'lam': math.pi / 2, 'h': c['REACH'][1], 'eps': c['ROOT_TOP'], 'p': 0.0, 'psi': math.pi}
  rate = c['EDGE_RATE_DEG_S'] * math.pi / 180

  def new_x(tt):
    x = var(9, [lo.get(k, -inf) for k in NX], [hi.get(k, inf) for k in NX], [gi(k, tt) for k in NX])
    # Angulation 0 ≤ ε − λ ≤ mMax at every node.
    con(x[4] - x[0], 0, c['mMax'])
    return x

  X0 = new_x(0.0)
  Xk = X0
  nodes = [(0, 0.0, X0, None, None)]
  for j in range(N):
    tj = (j + 0.5) * Tg / N
    dt = Tg / N
    U = var(3, [-inf, -rate, -inf], [inf, rate, inf], [(gi('hd', tj + dt / 2) - gi('hd', tj - dt / 2)) / dt,
            min(rate, max(-rate, (gi('eps', tj + dt / 2) - gi('eps', tj - dt / 2)) / dt)), (gi('pd', tj + dt / 2) - gi('pd', tj - dt / 2)) / dt])
    Xc = []
    for r in range(1, d + 1):
      tt = (j + tau[r]) * Tg / N
      x = new_x(tt)
      Z = var(1, [0], [inf], [gi('load', tt)])
      Xc.append(x)
      nodes.append((j, tau[r], x, U, Z))
    for r in range(1, d + 1):
      xp = C[0, r] * Xk + sum(C[q, r] * Xc[q - 1] for q in range(1, d + 1))
      x, Z = nodes[-d + r - 1][2], nodes[-d + r - 1][4]
      xd, alg, kap, share, force = m.rhs(x, U, Z, delta)
      con(hstep * xd - xp, 0, 0)
      con(alg, 0, 0)
      con(m.pressed_margin_s(x[4], force, delta), 0, inf)
    Xk = Dend[0] * Xk + sum(Dend[q] * Xc[q - 1] for q in range(1, d + 1))
    if j < N - 1:
      Xn = new_x((j + 1) * Tg / N)
      con(Xn - Xk, 0, 0)
      Xk = Xn
      nodes.append((j + 1, 0.0, Xn, None, None))
  XN = Xk
  # Switches: λ 0, share ½ (p, ṗ 0), ski heading ψ − atan((h λ̇ + ṗ)/v) at π/2 ∓ head.
  con(ca.vertcat(X0[0], XN[0], X0[5], X0[6]), 0, 0)
  con(X0[7] - ca.atan((X0[2] * X0[1] + X0[6]) / X0[8]) - (math.pi / 2 - head), 0, 0)
  # Mirror, hard except λ̇.
  con(ca.vertcat(XN[2] - X0[2], XN[3] - X0[3], XN[4] + X0[4], XN[5] + X0[5], XN[6] + X0[6], XN[7] - (math.pi - X0[7]), XN[8] - X0[8]), 0, 0)
  defect = XN[1] + X0[1]
  W = ca.vertcat(*w)
  # QAMD ordering: METIS segfaults in this IPOPT build above N 80 (libcoinmetis __GKfree).
  solver = ca.nlpsol('s', 'ipopt', {'x': W, 'f': defect ** 2, 'g': ca.vertcat(*g_)},
                     {'print_time': False, 'ipopt': {'max_iter': args.max_iter, 'tol': 1e-12, 'constr_viol_tol': 1e-10, 'print_level': 0, 'sb': 'yes', 'mumps_pivot_order': 6}})
  r_ = solver(x0=w0, lbx=lbw, ubx=ubw, lbg=lbg, ubg=ubg)
  st = solver.stats()
  ok = st['success']
  wv = r_['x']
  fv = ca.Function('fv', [W], [defect, X0, XN, T])
  dv, x0v, xNv, Tv = fv(wv)
  ev = ca.Function('ev', [W], [ca.vertcat(*[ca.vertcat(*[q for q in nd[2:] if q is not None]) for nd in nodes])])
  flat = np.array(ev(wv)).ravel()
  val_of, k = [], 0
  for nd in nodes:
    n = 9 + (4 if nd[3] is not None else 0)
    val_of.append(flat[k:k + n])
    k += n
  val = lambda e: float(e)
  Tv = float(Tv)
  rows = []
  for (j, tr, x, U, Z), vv in zip(nodes, val_of):
    xv = [float(q) for q in vv[:9]]
    row = {'t': (j + tr) * Tv / N, **dict(zip(NX, xv))}
    if U is not None:
      uv = [float(q) for q in vv[9:12]]
      row.update(dict(zip(NU, uv)))
      load = float(vv[12])
      xd, alg, kap, share, force = m.rhs(ca.DM(xv), ca.DM(uv), load, delta)
      row.update({'load': load, 'kappa': float(kap), 'kR': float(kap) * m.Rsc, 'share': float(share), 'force': float(force),
                  'pressedMargin': float(m.pressed_margin_s(xv[4], float(force), delta)), 'angulation': xv[4] - xv[0],
                  'grip_kRcos': float(kap) * m.Rsc * math.cos(xv[4])})
    rows.append(row)
  out = {'args': vars(args), 'status': st['return_status'], 'success': ok, 'iters': st['iter_count'],
         'defectDegS': float(dv) * 180 / math.pi, 'lamDot0DegS': float(x0v[1]) * 180 / math.pi, 'lamDotNDegS': float(xNv[1]) * 180 / math.pi,
         'T': Tv, 'v0': float(x0v[8]), 'vN': float(xNv[8]), 'psi0': float(x0v[7]), 'psiN': float(xNv[7]), 'h0': float(x0v[2]),
         'tau': list(tau), 'C': C.tolist(), 'Dend': Dend.tolist(), 'nodes': rows}
  json.dump(out, open(args.out, 'w'))
  print(json.dumps({k: out[k] for k in ('status', 'iters', 'defectDegS', 'lamDot0DegS', 'lamDotNDegS', 'T', 'v0', 'psi0', 'h0')}))


NXL = ['lam', 'lamDot', 'h', 'hd', 'eps', 'psi', 'v']
NUL = ['hdd', 'epsDot']


def radau(d):
  tau = np.append(0, ca.collocation_points(d, 'radau'))
  C, Dend = np.zeros((d + 1, d + 1)), np.zeros(d + 1)
  for j in range(d + 1):
    p = np.poly1d([1])
    for r in range(d + 1):
      if r != j:
        p *= np.poly1d([1, -tau[r]]) / (tau[j] - tau[r])
    Dend[j] = p(1.0)
    dp = np.polyder(p)
    for r in range(d + 1):
      C[j, r] = dp(tau[r])
  return tau, C, Dend


def solve_law(args, c, m, g, lam_peak):
  """One solve with p on §7's share law at λ_peak and the measured ceilings: F/mg ≤ F_CEIL_G, |ḣ| ≤ HD_MAX, λ ≥ 0."""
  d, N = 3, args.N
  delta = args.delta_deg * math.pi / 180
  head = args.head * math.pi / 180
  tau, C, Dend = radau(d)
  Tg = float(g['t'][-1])
  gi = lambda k, tt: float(np.interp(tt, g['t' if k != 'load' else 'tl'] if 'tl' in g else g['t'], g[k]))
  w, lbw, ubw, w0, g_, lbg, ubg = [], [], [], [], [], [], []
  inf = math.inf

  def var(n, lb, ub, init):
    x = ca.SX.sym('w', n)
    w.append(x)
    lbw.extend(lb)
    ubw.extend(ub)
    w0.extend(init)
    return x

  def con(e, lb, ub):
    g_.append(e)
    lbg.extend([lb] * e.numel())
    ubg.extend([ub] * e.numel())

  T = var(1, [0.05], [60], [Tg])
  hstep = T / N
  lo = {'lam': 0.0, 'h': c['REACH'][0], 'hd': -c['HD_MAX'], 'eps': -c['ROOT_TOP'], 'psi': 0.0, 'v': c['V_FLOOR']}
  hi = {'lam': math.pi / 2, 'h': c['REACH'][1], 'hd': c['HD_MAX'], 'eps': c['ROOT_TOP'], 'psi': math.pi}
  rate = c['EDGE_RATE_DEG_S'] * math.pi / 180
  clip = lambda k, v: min(hi.get(k, inf), max(lo.get(k, -inf), v))

  def new_x(tt):
    x = var(7, [lo.get(k, -inf) for k in NXL], [hi.get(k, inf) for k in NXL], [clip(k, gi(k, tt)) for k in NXL])
    con(x[4] - x[0], 0, c['mMax'])
    return x

  X0 = new_x(0.0)
  Xk = X0
  nodes = [(0, 0.0, X0, None, None)]
  for j in range(N):
    tj, dt = (j + 0.5) * Tg / N, Tg / N
    U = var(2, [-inf, -rate], [inf, rate], [(gi('hd', tj + dt / 2) - gi('hd', tj - dt / 2)) / dt,
            min(rate, max(-rate, (gi('eps', tj + dt / 2) - gi('eps', tj - dt / 2)) / dt))])
    Xc = []
    for r in range(1, d + 1):
      tt = (j + tau[r]) * Tg / N
      x = new_x(tt)
      Z = var(1, [0], [c['F_CEIL_G']], [min(c['F_CEIL_G'], max(0.0, gi('load', tt)))])
      Xc.append(x)
      nodes.append((j, tau[r], x, U, Z))
    for r in range(1, d + 1):
      xp = C[0, r] * Xk + sum(C[q, r] * Xc[q - 1] for q in range(1, d + 1))
      x, Z = nodes[-d + r - 1][2], nodes[-d + r - 1][4]
      xd, alg, kap, share, force, _ = m.rhs_law(x, U, Z, delta, lam_peak)
      con(hstep * xd - xp, 0, 0)
      con(alg, 0, 0)
      con(m.pressed_margin_s(x[4], force, delta), 0, inf)
    Xk = Dend[0] * Xk + sum(Dend[q] * Xc[q - 1] for q in range(1, d + 1))
    if j < N - 1:
      Xn = new_x((j + 1) * Tg / N)
      con(Xn - Xk, 0, 0)
      Xk = Xn
      nodes.append((j + 1, 0.0, Xn, None, None))
  XN = Xk
  # Switches at λ 0, where the law's p and ṗ are 0: ski heading ψ − atan(h λ̇ / v) at π/2 − head.
  con(ca.vertcat(X0[0], XN[0]), 0, 0)
  con(X0[5] - ca.atan(X0[2] * X0[1] / X0[6]) - (math.pi / 2 - head), 0, 0)
  con(ca.vertcat(XN[2] - X0[2], XN[3] - X0[3], XN[4] + X0[4], XN[5] - (math.pi - X0[5]), XN[6] - X0[6]), 0, 0)
  defect = XN[1] + X0[1]
  W = ca.vertcat(*w)
  solver = ca.nlpsol('s', 'ipopt', {'x': W, 'f': defect ** 2, 'g': ca.vertcat(*g_)},
                     {'print_time': False, 'ipopt': {'max_iter': args.max_iter, 'tol': 1e-12, 'constr_viol_tol': 1e-10, 'print_level': 0, 'sb': 'yes', 'mumps_pivot_order': 6}})
  r_ = solver(x0=w0, lbx=lbw, ubx=ubw, lbg=lbg, ubg=ubg)
  st = solver.stats()
  wv = r_['x']
  dv, x0v, xNv, Tv = [np.array(z).ravel() for z in ca.Function('fv', [W], [defect, X0, XN, T])(wv)]
  flat = np.array(ca.Function('ev', [W], [ca.vertcat(*[ca.vertcat(*[q for q in nd[2:] if q is not None]) for nd in nodes])])(wv)).ravel()
  Tv = float(Tv[0])
  rows, k = [], 0
  for (j, tr, x, U, Z) in nodes:
    n = 7 + (3 if U is not None else 0)
    vv = flat[k:k + n]
    k += n
    xv = [float(q) for q in vv[:7]]
    row = {'t': (j + tr) * Tv / N, **dict(zip(NXL, xv))}
    p, pd, A, B = m.law(xv[0], xv[1], lam_peak)
    row.update({'p': p, 'pd': pd, 'share': c['SWITCH_SHARE'] - p / c['stance']})
    if U is not None:
      uv = [float(q) for q in vv[7:9]]
      load = float(vv[9])
      xd, alg, kap, share, force, ex = m.rhs_law(ca.DM(xv), ca.DM(uv), load, delta, lam_peak)
      row.update(dict(zip(NUL, uv)))
      row.update({'load': load, 'lamAcc': float(xd[1]), 'pdd': float(ex['pdd']), 'inertia': float(ex['inertia']), 'kappa': float(kap), 'kR': float(kap) * m.Rsc,
                  'force': float(force), 'pressedMargin': float(m.pressed_margin_s(xv[4], float(force), delta)), 'angulation': xv[4] - xv[0],
                  'grip_kRcos': float(kap) * m.Rsc * math.cos(xv[4]), 'algRes': float(alg)})
    rows.append(row)
  return {'status': st['return_status'], 'success': st['success'], 'iters': st['iter_count'], 'lamPeak': lam_peak,
          'defectDegS': float(dv[0]) * 180 / math.pi, 'lamDot0DegS': float(x0v[1]) * 180 / math.pi, 'lamDotNDegS': float(xNv[1]) * 180 / math.pi,
          'T': Tv, 'v0': float(x0v[6]), 'vN': float(xNv[6]), 'psi0': float(x0v[5]), 'psiN': float(xNv[5]), 'h0': float(x0v[2]),
          'ceil': {'F_CEIL_G': c['F_CEIL_G'], 'HD_MAX': c['HD_MAX']}, 'tau': list(tau), 'nodes': rows}


def guess_from(sol):
  ns = sol['nodes']
  g = {k: np.array([n[k] for n in ns]) for k in ['t', 'lam', 'lamDot', 'h', 'hd', 'eps', 'psi', 'v']}
  wl = [n for n in ns if 'load' in n]
  g['tl'], g['load'] = np.array([n['t'] for n in wl]), np.array([n['load'] for n in wl])
  return g


def cycle(args):
  """λ_peak by fixed point as carveCycle carries it: solve at λ_peak, set it to the solved turn's largest λ, repeat."""
  c = json.load(open(args.const))
  m = Model(c)
  g = guess_from(json.load(open(args.warm))) if args.warm else guess_of(args, c, m)
  if 'p' in g:
    g = {k: v for k, v in g.items() if k not in ('p', 'pd')}
  lam_peak = json.load(open(args.warm))['lamPeak'] if args.warm else c['lamPeak0']
  coarse = json.load(open(args.coarse)) if args.coarse else None
  hist = []
  sol = None
  converged = False
  extra = {}
  for it in range(args.peak_iters):
    sol = solve_law(args, c, m, g, lam_peak)
    nxt = max(n['lam'] for n in sol['nodes'])
    hist.append({'lamPeakDeg': lam_peak * 180 / math.pi, 'maxLamDeg': nxt * 180 / math.pi, 'status': sol['status'], 'defectDegS': sol['defectDegS'], 'T': sol['T'], 'v': sol['v0']})
    print(json.dumps(hist[-1]), flush=True)
    # A pass IPOPT ends without an iterate it stands by gives no λ_peak to carry: stop, flagged.
    if sol['status'] not in ('Solve_Succeeded', 'Solved_To_Acceptable_Level', 'Maximum_Iterations_Exceeded'):
      converged = False
      json.dump({'args': vars(args), **sol, 'peakConverged': False, 'peakHistory': hist}, open(args.out, 'w'))
      break
    if coarse:
      # λ_peak converged once it moves no more than the mesh resolves.
      mesh = float(mesh_change_lam({**sol, 'args': vars(args)}, coarse))
      spread = peak_spread_deg(hist)
      extra = {'meshChangeLamDeg': mesh, 'peakSpreadDeg': spread}
      converged = bool(spread is not None and spread <= mesh)
    else:
      converged = abs(nxt - lam_peak) <= args.peak_tol
    # Every pass on disk, so a timeout keeps the latest trajectory.
    json.dump({'args': vars(args), **sol, **extra, 'peakConverged': converged, 'peakHistory': hist}, open(args.out + '.tmp', 'w'))
    os.replace(args.out + '.tmp', args.out)
    g = guess_from(sol)
    lam_peak = nxt
    if converged:
      break
  out = {'args': vars(args), **sol, **extra, 'peakConverged': converged, 'peakHistory': hist}
  print(json.dumps({k: out[k] for k in ('status', 'iters', 'defectDegS', 'lamDot0DegS', 'lamDotNDegS', 'T', 'v0', 'psi0', 'h0', 'lamPeak', 'peakConverged', *extra)}))


OK = ('Solve_Succeeded', 'Solved_To_Acceptable_Level')
# Linked: the defect's square under IPOPT's tol 1e-12, |d| ≤ 1e-6 rad/s.
LINK_RAD_S = 1e-6


def lagrange(tau, vals, x):
  return sum(v * math.prod((x - tr) / (tau[j] - tr) for r, tr in enumerate(tau) if r != j) for j, v in enumerate(vals))


def mesh_change_lam(fine, coarse):
  """max |λ_fine − λ_coarse| at the fine solve's nodes, the coarse one's collocation polynomial, absolute t ≤ both periods."""
  N, T, tau, ns = coarse['args']['N'], coarse['T'], coarse['tau'], coarse['nodes']
  worst = 0.0
  for n in fine['nodes']:
    if n['t'] > T:
      continue
    j = min(N - 1, int(n['t'] / (T / N)))
    worst = max(worst, abs(n['lam'] - lagrange(tau, [ns[4 * j + r]['lam'] for r in range(4)], n['t'] / (T / N) - j)))
  return float(worst) * 180 / math.pi


def peak_spread_deg(hist):
  """λ_peak's range over the last 3 passes, each pass's input and the last one's output; None before 3 passes."""
  if len(hist) < 3:
    return None
  vals = [h['lamPeakDeg'] for h in hist[-3:]] + [hist[-1]['maxLamDeg']]
  return max(vals) - min(vals)


def linked_of(sol, coarse):
  """Linked: a solve IPOPT stands by, defect ≤ LINK_RAD_S, λ_peak's last-3-pass range ≤ the N vs N/2 mesh change."""
  mesh = mesh_change_lam(sol, coarse)
  spread = peak_spread_deg(sol['peakHistory'])
  r = {'status': sol['status'] in OK, 'defect': abs(sol['defectDegS']) <= LINK_RAD_S * 180 / math.pi,
       'peak': spread is not None and spread <= mesh}
  return {'linked': all(r.values()), **r, 'meshChangeLamDeg': mesh, 'peakSpreadDeg': spread, 'defectDegS': sol['defectDegS'], 'T': sol['T'], 'v': sol['v0']}


def link_pair(a, ca_, b, cb):
  """Both starts linked and their λ within the cell's (start a's) mesh change of each other."""
  la, lb = linked_of(a, ca_), linked_of(b, cb)
  d = max(mesh_change_lam(a, b), mesh_change_lam(b, a))
  return {'linked': la['linked'] and lb['linked'] and d <= la['meshChangeLamDeg'], 'startsDLamDeg': d, 'a': la, 'b': lb}


def link(args):
  print(json.dumps(link_pair(*(json.load(open(f)) for f in (args.a, args.a_half, args.b, args.b_half)))))


def samples_of(sol, c, m):
  """t 0 (the switch) then every collocation point. At λ 0 the force balance is explicit: F/m = ḧ − h λ̇² + g cos θ."""
  ns = sol['nodes']
  n0, u0 = ns[0], ns[1]
  load0 = (u0['hdd'] - n0['h'] * n0['lamDot'] ** 2 + m.G * m.cos) / m.G
  force0 = load0 * n0['share'] * c['mass'] * m.G
  first = {**n0, 'hdd': u0['hdd'], 'epsDot': u0['epsDot'], 'load': load0, 'kappa': float(m.ski_curvature_s(n0['eps'], force0, sol['args']['delta_deg'] * math.pi / 180))}
  rows = [first] + [n for n in ns if 'load' in n]
  keys = {'t': 't', 'lam': 'lam', 'lamDot': 'lamDot', 'h': 'h', 'hDot': 'hd', 'hDdot': 'hdd', 'eps': 'eps', 'epsDot': 'epsDot', 'p': 'p', 'pDot': 'pd',
          'psi': 'psi', 'v': 'v', 'kSki': 'kappa', 'load': 'load', 'share': 'share'}
  out = {k: [float(r[s]) for r in rows] for k, s in keys.items()}
  out['pressed'] = [int(m.ski_curvature(r['eps'], r['load'], r['share'])[1]) for r in rows]
  # Pinned switch nodes: λ 0, and 0 ≤ ε − λ with the mirror ε_T = −ε_0 force ε 0.
  for k in ('lam', 'eps'):
    out[k][0] = out[k][-1] = 0.0
  return out


def gates_of(sol, s, c, m, rep, mesh, lk):
  """Every gate R2a26 names, from the samples; the grip port is test/physics-edge.test.ts:51-70 with its own 1e-9 slacks."""
  n = len(s['t'])
  amax = c['ANGULATION_MAX_DEG'] * math.pi / 180
  grip = True
  for i in range(n):
    if s['share'][i] <= 0.5:
      continue
    k = m.ski_curvature(s['eps'][i], s['load'][i], s['share'][i])[0]
    dd = (s['eps'][i] - s['lam'][i]) * 180 / math.pi
    grip &= dd > -1e-9 and dd <= amax * 180 / math.pi + 1e-9 and 1 / k <= m.Rsc * math.cos(s['eps'][i]) + 1e-9
  return {
    'linked': lk['linked'],
    'F': max(s['load']) <= c['F_CEIL_G'], 'hDot': max(abs(x) for x in s['hDot']) <= c['HD_MAX'],
    'reach': all(c['REACH'][0] <= x <= c['REACH'][1] for x in s['h']), 'grip': grip, 'pressed': all(s['pressed']),
    'lamNonNeg': min(s['lam']) >= 0, 'psi': all(0 <= x <= math.pi for x in s['psi']),
    'replay': rep['restart'] and rep['reachedT'] >= sol['T'] - 1e-12 and rep['fixedPointStuck'] == 0 and rep['bridgedSamples'] == 0 and rep['maxDLamDeg'] <= mesh,
  }


def bake(args):
  """Writes the whole carve-cycles file from N and N/2 solves, the other start's pair and the TS restart replays; a cell failing any gate is left out."""
  cells, failed = {}, []
  others = {o[0]: o[1:] for o in args.other or []}
  for name, fine_f, coarse_f, rep_f in args.cell:
    fine, coarse, rep = json.load(open(fine_f)), json.load(open(coarse_f)), json.load(open(rep_f))
    c = json.load(open(fine['args']['const']))
    if fine['args']['const'] != coarse['args']['const'] or fine['args']['head'] != coarse['args']['head'] or rep['file'] != os.path.basename(fine_f):
      sys.exit(f'{name}: solves or replay do not match')
    m = Model(c)
    s = samples_of(fine, c, m)
    mesh = mesh_change_lam(fine, coarse)
    if name in others:
      ob, obc = (json.load(open(f)) for f in others[name])
      if ob['args']['const'] != fine['args']['const'] or ob['args']['head'] != fine['args']['head']:
        sys.exit(f'{name}: the other start does not match')
      lk = link_pair(fine, coarse, ob, obc)
    else:
      lk = {'linked': linked_of(fine, coarse)['linked'], 'startsDLamDeg': None}
    gates = gates_of(fine, s, c, m, rep, mesh, lk)
    print(json.dumps({'cell': name, 'meshChangeLamDeg': mesh, 'replayLamDeg': rep['maxDLamDeg'], 'replayLoadG': rep['maxDLoadG'], 'Fmax': max(s['load']),
                      'hDotMax': max(abs(x) for x in s['hDot']), 'starts': 2 if name in others else 1, 'startsDLamDeg': lk['startsDLamDeg'], 'gates': gates}))
    if not all(gates.values()):
      failed.append(name)
      continue
    cells[name] = {'inputs': c, 'switchHeadingDeg': fine['args']['head'], 'periodS': fine['T'], 'speedMps': fine['v0'], 'lamPeak': fine['lamPeak'],
                   'defectDegS': fine['defectDegS'], 'nodes': fine['args']['N'], 'meshChangeLamDeg': mesh, 'replayLamDeg': rep['maxDLamDeg'],
                   'replayLoadG': rep['maxDLoadG'], 'samples': s}
  if failed:
    print(json.dumps({'leftOut': failed}))
  with open(args.out, 'w') as f:
    json.dump({'version': 1, 'cells': cells}, f, separators=(',', ':'), ensure_ascii=False)


def main():
  ap = argparse.ArgumentParser()
  sp = ap.add_subparsers(dest='cmd', required=True)
  a = sp.add_parser('port')
  a.add_argument('const')
  a.add_argument('tsvals')
  a.add_argument('out')
  b = sp.add_parser('solve')
  b.add_argument('const')
  b.add_argument('out')
  b.add_argument('--head', type=float, default=90.0)
  b.add_argument('--N', type=int, default=40)
  b.add_argument('--delta-deg', type=float, default=1.0)
  b.add_argument('--start', choices=['swing', 'r2a23', 'flat'], default='swing')
  b.add_argument('--start-file')
  b.add_argument('--swing-lean', type=float, help='old balance lean, deg (R2a23 energy.lamB1)')
  b.add_argument('--swing-rate', type=float, help='energy-formula λ̇ at λ 0, deg/s (R2a23 energy.consPred)')
  b.add_argument('--lam-nonneg', action='store_true', help='λ ≥ 0: one turn, no interior switch (not in the brief)')
  b.add_argument('--max-iter', type=int, default=3000)
  cy = sp.add_parser('cycle', help='share-law p, measured ceilings, λ_peak fixed point')
  cy.add_argument('const')
  cy.add_argument('out')
  for k, v in b._option_string_actions.items():
    if k.startswith('--') and k not in ('--help', '--lam-nonneg'):
      cy._add_action(v)
  cy.add_argument('--peak-iters', type=int, default=25)
  cy.add_argument('--warm', help='start from a cycle solution JSON and its λ_peak')
  cy.add_argument('--peak-tol', type=float, default=1e-6, help='λ_peak fixed-point step, rad, when no --coarse is given')
  cy.add_argument('--coarse', help='the N/2 solve: λ_peak converged once its last-3-pass range is within the mesh change')
  lp = sp.add_parser('link', help='both starts linked and agreeing, each against its N/2 solve')
  for k in ('a', 'a_half', 'b', 'b_half'):
    lp.add_argument(k)
  bk = sp.add_parser('bake', help='src/physics/carve-cycles.json from the gated solves')
  bk.add_argument('out')
  bk.add_argument('--cell', nargs=4, action='append', required=True, metavar=('NAME', 'SOL_N', 'SOL_HALF_N', 'REPLAY'))
  bk.add_argument('--other', nargs=3, action='append', metavar=('NAME', 'SOL_N', 'SOL_HALF_N'), help='the second start at the same heading')
  args = ap.parse_args()
  {'port': port, 'solve': solve, 'cycle': cycle, 'link': link, 'bake': bake}[args.cmd](args)


if __name__ == '__main__':
  sys.exit(main())
