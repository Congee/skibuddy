# /// script
# requires-python = ">=3.11,<3.13"
# dependencies = ["casadi==3.7.2", "numpy==2.1.3"]
# ///
"""The carved turn from switch to switch as one periodic direct-collocation solve (CasADi + IPOPT), offline.

Ports src/physics/turn.ts's carve: the pendulum on the pressure centre, skiCurvatureOf, the speed law. Constants come
from a JSON the lane's bun dump writes; nothing here is retyped from TS.
  port CONST TSVALS OUT        the port table against TS values
  gates_r1 OUT --cell NAME SOL SOL_HALF ...   R1 gates and summary
  cycle CONST OUT --speed --turn-l --offset [options]   the share-law solve with the λ_peak fixed point
  link A A_HALF B B_HALF       both starts linked and agreeing
  bake OUT --cell NAME SOL SOL_HALF REPLAY [--other NAME SOL SOL_HALF] ...   carve-cycles.json, gated
"""
import argparse
import json
import math
import os
import re
import sys
import time

import casadi as ca
import numpy as np



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
    lam, lamDot, h, hd, hdd, eps, epsDot, gam, psi, v = [x[i] for i in range(10)]
    G = self.G
    p, pd, A, B = self.law_s(lam, lamDot, lam_peak)
    share = self.c['SWITCH_SHARE'] - p / self.c['stance']
    force = load * share * self.c['mass'] * G
    kap = self.ski_curvature_s(eps, force, delta)
    # Steady sideslip on the bent edge: the support path bends by κ cos γ (inferred).
    kS = kap * ca.cos(gam)
    pull = G * self.sin * ca.cos(psi)
    inertia = h + A * ca.cos(lam)
    lamAcc = (G * self.cos * ca.sin(lam) - (v * v * kS + B - pull) * ca.cos(lam) - 2 * hd * lamDot) / inertia
    pdd = A * lamAcc + B
    fm = hdd - h * lamDot ** 2 + G * self.cos * ca.cos(lam) + (v * v * kS + pdd - pull) * ca.sin(lam)
    psiDot = (load * G * ca.sin(lam) + G * self.sin * ca.cos(psi)) / v
    # Snow's lateral force in g, ≥ 0 by the bounds λ ≥ 0, load ≥ 0; skid dissipation as solveGroomed's max(0, f) tan(set).
    f = load * ca.sin(lam)
    vDot = G * (self.sin * ca.sin(psi) - self.c['mu'] * load - self.c['dragPerV2'] * v * v - f * ca.tan(gam))
    xd = ca.vertcat(lamDot, lamAcc, hd, hdd, u[0], epsDot, u[1], u[2], psiDot, vDot)
    return xd, fm - load * G, kap, share, force, {'p': p, 'pd': pd, 'pdd': pdd, 'inertia': inertia, 'kS': kS, 'f': f}

  # §4.2 margin band: q = smooth min(1, γ/γ_ref), softplus width Q_WIDTH, shifted so q(0) is exactly 0.
  def band_s(self, gam):
    amax = self.c['ANGULATION_MAX_DEG'] * math.pi / 180
    sm = lambda g: GAM_REF - Q_WIDTH * softplus((GAM_REF - g) / Q_WIDTH)
    q = (sm(gam) - sm(0.0)) / GAM_REF
    return -SLIP * q, amax - (amax - SLIP) * q, q


def softplus(x):
  return ca.fmax(x, 0) + ca.log1p(ca.exp(-ca.fabs(x)))


LIT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'prior', 'lit-curves.json')
_sl = json.load(open(LIT))['slalom']
_num = lambda s: float(s.split()[0])
# reid-2010 SL skid peak mean, inferred as the full-slip attack.
GAM_REF = float(re.match(r't [^,]*, ([\d.]+) ±', _sl['events']['skid_peak']).group(1)) * math.pi / 180
Q_WIDTH = 1.0 * math.pi / 180
# §4.2's slip allowance: the edge may lead or trail the lean by this much at full slip.
SLIP = 5.0 * math.pi / 180
GAM_MAX = 60.0 * math.pi / 180
# Lateral |cos ψ| as √(cos² + δ²), numerical.
ABS_DELTA = 1e-3


def scales():
  """Fixed objective scales from reid-2010's 13 m slalom course (inferred as scales)."""
  T_turn = _num(_sl['period_s']['values']['reid-2010 13 m'])
  e_max = float(_sl['edge_angle']['13m']['max'])
  rom = _num(_sl['leg_length_cm']['13m']['rom']) / 100
  return {'s_eps': e_max * math.pi / 180 * (math.pi / T_turn) ** 2, 's_h': rom / 2 * (2 * math.pi / T_turn) ** 3, 's_gam': GAM_REF,
          'inputs': {'T_turn_s': T_turn, 'T_turn_src': 'slalom.period_s reid-2010 13 m', 'eps_max_deg': e_max, 'eps_max_src': 'slalom.edge_angle.13m.max',
                     'rom_m': rom, 'rom_src': 'slalom.leg_length_cm.13m.rom', 'gam_ref_deg': GAM_REF * 180 / math.pi, 'gam_ref_src': 'slalom.events.skid_peak'}}


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


NXL = ['lam', 'lamDot', 'h', 'hd', 'hdd', 'eps', 'epsDot', 'gam', 'psi', 'v']
NUL = ['hddd', 'epsDdot', 'gamDot']
I = {k: i for i, k in enumerate(NXL)}
# Mirror about the fall line, turn sense s → −s: λ' = −λ so d/dt keeps the sign (λ̇, ε, ε̇ odd); h, its rates, γ, v even; ψ' = π − ψ.
ODD = ('lamDot', 'eps', 'epsDot')
EVEN = ('h', 'hd', 'hdd', 'gam', 'v')


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
  # Radau IIA weights on the collocation points (the algebraic load lives only there).
  Bq = np.zeros(d + 1)
  for j in range(1, d + 1):
    p = np.poly1d([1])
    for r in range(1, d + 1):
      if r != j:
        p *= np.poly1d([1, -tau[r]]) / (tau[j] - tau[r])
    Bq[j] = np.polyint(p)(1.0)
  return tau, C, Dend, Bq


def solve_law(args, c, m, g, lam_peak, sc, wall):
  """One solve with p on §7's share law at λ_peak: smooth controls, skid as the brake, free switch, course and speed hard."""
  d, N = 3, args.N
  delta = args.delta_deg * math.pi / 180
  tau, C, Dend, Bq = radau(d)
  Tg = float(g['t'][-1])
  gi = lambda k, tt: float(np.interp(tt, g['tl'] if k == 'load' else g['t'], g[k]))
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
  rate = c['EDGE_RATE_DEG_S'] * math.pi / 180
  lo = {'lam': 0.0, 'h': c['REACH'][0], 'hd': -c['HD_MAX'], 'eps': -c['ROOT_TOP'], 'epsDot': -rate, 'gam': 0.0, 'psi': 0.0, 'v': c['V_FLOOR']}
  hi = {'lam': math.pi / 2, 'h': c['REACH'][1], 'hd': c['HD_MAX'], 'eps': c['ROOT_TOP'], 'epsDot': rate, 'gam': GAM_MAX, 'psi': math.pi}
  clip = lambda k, v: min(hi.get(k, inf), max(lo.get(k, -inf), v))
  first = []

  def new_x(tt):
    lb, ub = [lo.get(k, -inf) for k in NXL], [hi.get(k, inf) for k in NXL]
    if not first:
      # Free switch: between straight across (0) and the fall line (π/2).
      ub[I['psi']] = math.pi / 2
    x = var(10, lb, ub, [min(ub[i], max(lb[i], clip(k, gi(k, tt)))) for i, k in enumerate(NXL)])
    blo, bhi, _ = m.band_s(x[I['gam']])
    ang = x[I['eps']] - x[I['lam']]
    con(ang - blo, 0, inf)
    con(bhi - ang, 0, inf)
    if first:
      # Cross-over: the mass is highest at the switch.
      con(x[I['h']] - first[0][I['h']], -inf, 0)
    else:
      first.append(x)
    return x

  X0 = new_x(0.0)
  Xk = X0
  nodes = [(0, 0.0, X0, None, None)]
  Iv = IL = ID = Jg = Ju = 0
  for j in range(N):
    tj, dt = (j + 0.5) * Tg / N, Tg / N
    U = var(3, [-inf] * 3, [inf] * 3, [(gi(k, tj + dt / 2) - gi(k, tj - dt / 2)) / dt for k in ('hdd', 'epsDot', 'gam')])
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
      con(m.pressed_margin_s(x[I['eps']], force, delta), 0, inf)
      v, psi = x[I['v']], x[I['psi']]
      Iv += hstep * Bq[r] * v
      IL += hstep * Bq[r] * v * ca.sin(psi)
      ID += hstep * Bq[r] * v * ca.sqrt(ca.cos(psi) ** 2 + ABS_DELTA ** 2)
      Jg += Bq[r] * (x[I['gam']] / sc['s_gam']) ** 2
    Ju += (U[0] / sc['s_h']) ** 2 + (U[1] / sc['s_eps']) ** 2
    Xk = Dend[0] * Xk + sum(Dend[q] * Xc[q - 1] for q in range(1, d + 1))
    if j < N - 1:
      Xn = new_x((j + 1) * Tg / N)
      con(Xn - Xk, 0, 0)
      Xk = Xn
      nodes.append((j + 1, 0.0, Xn, None, None))
  XN = Xk
  con(ca.vertcat(X0[I['lam']], XN[I['lam']]), 0, 0)
  mirror = ca.vertcat(*[XN[I[k]] + X0[I[k]] for k in ODD], *[XN[I[k]] - X0[I[k]] for k in EVEN], XN[I['psi']] + X0[I['psi']] - math.pi)
  con(mirror, 0, 0)
  course = ca.vertcat(Iv - args.speed * T, IL - args.turn_l, ID - args.offset)
  con(course, 0, 0)
  # Time-mean J: (1/T)∫u² dt over piecewise-constant u is (1/N)Σu².
  J = (Ju + Jg) / N
  W = ca.vertcat(*w)
  ip = {'max_iter': args.max_iter, 'tol': args.tol, 'constr_viol_tol': 1e-10, 'print_level': 0, 'sb': 'yes', 'mumps_pivot_order': 6, 'max_wall_time': max(1.0, wall)}
  solver = ca.nlpsol('s', 'ipopt', {'x': W, 'f': J, 'g': ca.vertcat(*g_)}, {'print_time': False, 'ipopt': ip})
  r_ = solver(x0=w0, lbx=lbw, ubx=ubw, lbg=lbg, ubg=ubg)
  st = solver.stats()
  wv = r_['x']
  outs = ca.Function('fv', [W], [J, X0, XN, T, mirror, course, Iv, IL, ID, Ju / N, Jg / N])(wv)
  Jv, x0v, xNv, Tv, mv, cv, Ivv, ILv, IDv, Juv, Jgv = [np.array(z).ravel() for z in outs]
  flat = np.array(ca.Function('ev', [W], [ca.vertcat(*[ca.vertcat(*[q for q in nd[2:] if q is not None]) for nd in nodes])])(wv)).ravel()
  Tv = float(Tv[0])
  rows, k = [], 0
  for (j, tr, x, U, Z) in nodes:
    n = 10 + (4 if U is not None else 0)
    vv = flat[k:k + n]
    k += n
    xv = [float(q) for q in vv[:10]]
    row = {'t': (j + tr) * Tv / N, **dict(zip(NXL, xv))}
    p, pd, A, B = m.law(xv[0], xv[1], lam_peak)
    row.update({'p': p, 'pd': pd, 'share': c['SWITCH_SHARE'] - p / c['stance']})
    if U is not None:
      uv = [float(q) for q in vv[10:13]]
      load = float(vv[13])
      xd, alg, kap, share, force, ex = m.rhs_law(ca.DM(xv), ca.DM(uv), load, delta, lam_peak)
      row.update(dict(zip(NUL, uv)))
      row.update({'load': load, 'lamAcc': float(xd[1]), 'pdd': float(ex['pdd']), 'kappa': float(kap), 'kS': float(ex['kS']), 'f': float(ex['f']),
                  'force': float(force), 'pressedMargin': float(m.pressed_margin_s(xv[I['eps']], float(force), delta)), 'algRes': float(alg)})
    else:
      # At λ 0 the force balance is explicit: F/m = ḧ − h λ̇² + g cos θ.
      row['load'] = (xv[I['hdd']] - xv[I['h']] * xv[I['lamDot']] ** 2 + m.G * m.cos) / m.G
    blo, bhi, q = (float(z) for z in m.band_s(xv[I['gam']]))
    row.update({'angulation': xv[I['eps']] - xv[I['lam']], 'bandLo': blo, 'bandHi': bhi, 'q': q})
    rows.append(row)
  names = [*ODD, *EVEN, 'psi']
  return {'status': st['return_status'], 'success': st['success'], 'iters': st['iter_count'], 'lamPeak': lam_peak, 'J': float(Jv[0]), 'Ju': float(Juv[0]), 'Jgam': float(Jgv[0]),
          'defectDegS': float(xNv[1] + x0v[1]) * 180 / math.pi, 'mirrorRes': dict(zip(names, (float(z) for z in mv))),
          'courseRes': dict(zip(('meanSpeed', 'L', 'D'), (float(cv[0]) / Tv, float(cv[1]), float(cv[2])))),
          'meanSpeed': float(Ivv[0]) / Tv, 'L': float(ILv[0]), 'D': float(IDv[0]),
          'T': Tv, 'v0': float(x0v[I['v']]), 'psi0': float(x0v[I['psi']]), 'psiN': float(xNv[I['psi']]), 'h0': float(x0v[I['h']]),
          'ceil': {'F_CEIL_G': c['F_CEIL_G'], 'HD_MAX': c['HD_MAX']}, 'scales': sc, 'tau': list(tau), 'Bq': list(Bq), 'nodes': rows}


def course_guess(c, m, v, L, D):
  """Mass on x(y) = (D/2) sin(πy/L) at speed v: ψ from the slope, λ from the path's curvature."""
  y = np.linspace(0, L, 401)
  a, k = D / 2, math.pi / L
  xp, xpp = a * k * np.cos(k * y), -a * k * k * np.sin(k * y)
  ds = np.sqrt(1 + xp ** 2)
  t = np.concatenate([[0], np.cumsum((ds[1:] + ds[:-1]) / 2 * np.diff(y))]) / v
  lam = np.arctan(v * v * np.abs(xpp) / ds ** 3 / m.G)
  eps = lam + 3 * math.pi / 180 * np.sin(math.pi * t / t[-1])
  gam = 5 * math.pi / 180 + 0 * t
  h = c['REACH'][0] + 0.75 * (c['REACH'][1] - c['REACH'][0]) + 0 * t
  return {'t': t, 'lam': lam, 'lamDot': np.gradient(lam, t), 'h': h, 'hd': 0 * t, 'hdd': 0 * t, 'eps': eps, 'epsDot': np.gradient(eps, t),
          'gam': gam, 'psi': math.pi / 2 - np.arctan(xp), 'v': v + 0 * t, 'tl': t, 'load': m.cos / np.cos(lam)}


def guess_from(sol):
  ns = sol['nodes']
  g = {k: np.array([n.get(k, 0.0) for n in ns]) for k in ['t', *NXL]}
  wl = [n for n in ns if 'load' in n]
  g['tl'], g['load'] = np.array([n['t'] for n in wl]), np.array([n['load'] for n in wl])
  return g


def cycle(args):
  """λ_peak by fixed point as carveCycle carries it: solve at λ_peak, set it to the solved turn's largest λ, repeat."""
  c = json.load(open(args.const))
  m = Model(c)
  sc = scales()
  print(json.dumps({'scales': sc}), flush=True)
  warm = json.load(open(args.warm)) if args.warm else None
  g = guess_from(warm) if warm else course_guess(c, m, args.speed, args.turn_l, args.offset)
  lam_peak = warm['lamPeak'] if warm else c['lamPeak0']
  coarse = json.load(open(args.coarse)) if args.coarse else None
  deadline = time.time() + args.wall
  hist, sol, converged, extra = [], None, False, {}
  for it in range(args.peak_iters):
    left = deadline - time.time()
    if left <= 0:
      break
    sol = solve_law(args, c, m, g, lam_peak, sc, left)
    nxt = max(n['lam'] for n in sol['nodes'])
    hist.append({'lamPeakDeg': lam_peak * 180 / math.pi, 'maxLamDeg': nxt * 180 / math.pi, 'status': sol['status'], 'iters': sol['iters'], 'J': sol['J'], 'T': sol['T'],
                 'psi0Deg': sol['psi0'] * 180 / math.pi})
    print(json.dumps(hist[-1]), flush=True)
    if sol['status'] not in ('Solve_Succeeded', 'Solved_To_Acceptable_Level', 'Maximum_Iterations_Exceeded'):
      json.dump({'args': vars(args), **sol, 'peakConverged': False, 'peakHistory': hist}, open(args.out, 'w'))
      break
    if coarse:
      mesh = float(mesh_change_lam({**sol, 'args': vars(args)}, coarse))
      spread = peak_spread_deg(hist)
      extra = {'meshChangeLamDeg': mesh, 'peakSpreadDeg': spread}
      converged = bool(spread is not None and spread <= mesh)
    else:
      converged = abs(nxt - lam_peak) <= args.peak_tol
    json.dump({'args': vars(args), **sol, **extra, 'peakConverged': converged, 'peakHistory': hist}, open(args.out + '.tmp', 'w'))
    os.replace(args.out + '.tmp', args.out)
    g = guess_from(sol)
    lam_peak = nxt
    if converged:
      break
  if sol is not None:
    print(json.dumps({'status': sol['status'], 'T': sol['T'], 'psi0Deg': sol['psi0'] * 180 / math.pi, 'lamPeak': sol['lamPeak'], 'peakConverged': converged, **extra}))


def samples_r1(sol):
  """t 0 (the switch, load explicit) then every collocation point."""
  ns = sol['nodes']
  return [ns[0]] + [n for n in ns if 'hddd' in n]


def poly_at(tau, vals, x):
  return lagrange(list(tau), vals, x)


def mesh_change(fine, coarse, key):
  """max |fine − coarse| at the fine samples on t/T; states by the coarse interval polynomial, load by the quadratic on its collocation points."""
  N, T, tau, ns = coarse['args']['N'], coarse['T'], coarse['tau'], coarse['nodes']
  worst = 0.0
  for n in samples_r1(fine):
    s = n['t'] / fine['T'] * N
    j = min(N - 1, int(s))
    x = s - j
    if key == 'load':
      cv = poly_at(tau[1:], [ns[4 * j + r]['load'] for r in range(1, 4)], x)
    else:
      cv = poly_at(tau, [ns[4 * j + r][key] for r in range(4)], x)
    worst = max(worst, abs(n[key] - cv))
  return worst


def interior_maxima(y, tol):
  """Maxima with a rise > tol before and a fall > tol after; a plateau or a dip ≤ tol counts once; endpoints are not interior."""
  peaks, lo, hi, hi_i, rising = [], y[0], y[0], 0, False
  for i, v in enumerate(y):
    if not rising:
      lo = min(lo, v)
      if v - lo > tol:
        rising, hi, hi_i = True, v, i
    else:
      if v >= hi:
        hi, hi_i = v, i
      elif hi - v > tol:
        peaks.append(hi_i)
        rising, lo = False, v
  return peaks


def r1_cell(fine, coarse):
  c = json.load(open(fine['args']['const']))
  m = Model(c)
  s = samples_r1(fine)
  T, N = fine['T'], fine['args']['N']
  col = lambda k: np.array([n[k] for n in s])
  t = col('t') / T
  deg = 180 / math.pi
  lam, eps, gam, psi, v, h, load, lamDot = (col(k) for k in ('lam', 'eps', 'gam', 'psi', 'v', 'h', 'load', 'lamDot'))
  mesh = {k: mesh_change(fine, coarse, k) for k in ('lam', 'eps', 'load', 'gam')}
  # Quadrature over collocation samples (Radau IIA weights).
  Bq = np.tile(fine['Bq'][1:], N) * T / N
  cs = s[1:]
  qd = lambda f: float(sum(b * f(n) for b, n in zip(Bq, cs)))
  mu, dr = c['mu'], c['dragPerV2']
  skid = qd(lambda n: n['f'] * n['v'] * math.tan(n['gam']))
  diss = qd(lambda n: mu * n['load'] * n['v'] + dr * n['v'] ** 3 + n['f'] * n['v'] * math.tan(n['gam']))
  rate = c['EDGE_RATE_DEG_S'] * math.pi / 180
  tb = 1e-6
  bounds = {
    'lam>=0 (interior)': [n['t'] / T for n in s[1:-1] if n['lam'] <= tb],
    'REACH lo': [n['t'] / T for n in s if n['h'] - c['REACH'][0] <= tb], 'REACH hi': [n['t'] / T for n in s if c['REACH'][1] - n['h'] <= tb],
    '|hd|<=HD_MAX': [n['t'] / T for n in s if c['HD_MAX'] - abs(n['hd']) <= tb],
    'load<=F_CEIL_G': [n['t'] / T for n in s if c['F_CEIL_G'] - n['load'] <= tb], 'load>=0': [n['t'] / T for n in s if n['load'] <= tb],
    '|epsDot|<=EDGE_RATE': [n['t'] / T for n in s if rate - abs(n['epsDot']) <= tb],
    'pressed margin>=0': [n['t'] / T for n in cs if n['pressedMargin'] <= tb],
    'band lo': [n['t'] / T for n in s if n['angulation'] - n['bandLo'] <= tb], 'band hi': [n['t'] / T for n in s if n['bandHi'] - n['angulation'] <= tb],
    'gam>=0': [n['t'] / T for n in s if n['gam'] <= tb], 'gam<=60deg': [n['t'] / T for n in s if GAM_MAX - n['gam'] <= tb],
    'h<=h(0) cross-over': [n['t'] / T for n in s[1:] if s[0]['h'] - n['h'] <= tb],
    'psi0 in [0, pi/2]': [0.0] if fine['psi0'] <= tb or math.pi / 2 - fine['psi0'] <= tb else [],
    'v>=V_FLOOR': [n['t'] / T for n in s if n['v'] - c['V_FLOOR'] <= tb],
  }
  active = {k: [round(x, 4) for x in v_] for k, v_ in bounds.items() if v_}
  band_ok = all(n['bandLo'] - 1e-9 <= n['angulation'] <= n['bandHi'] + 1e-9 for n in s)
  pe, pl = interior_maxima(eps, mesh['eps']), interior_maxima(load, mesh['load'])
  res_ok = all(abs(x) <= 1e-6 for x in fine['mirrorRes'].values()) and all(abs(x) <= 1e-6 for x in fine['courseRes'].values())
  ie, il, ig = int(np.argmax(eps)), int(np.argmax(load)), int(np.argmax(gam))
  return {
    'status': fine['status'], 'T': T, 'L': fine['L'], 'D': fine['D'], 'meanSpeed': fine['meanSpeed'], 'lamPeakDeg': fine['lamPeak'] * deg, 'peakConverged': fine.get('peakConverged'),
    'J': fine['J'], 'Ju': fine['Ju'], 'Jgam': fine['Jgam'],
    'switchMassDeg': fine['psi0'] * deg, 'switchSkisDeg': (fine['psi0'] - math.atan(h[0] * lamDot[0] / v[0])) * deg,
    'vMin': float(v.min()), 'vMax': float(v.max()), 'eps0Deg': float(eps[0]) * deg,
    'epsPeakDeg': float(eps[ie]) * deg, 'epsPeakT': float(t[ie]), 'lamPeakSolvedDeg': float(lam.max()) * deg, 'loadPeak': float(load[il]), 'loadPeakT': float(t[il]),
    'gamPeakDeg': float(gam[ig]) * deg, 'gamPeakT': float(t[ig]), 'gamMeanDeg': qd(lambda n: n['gam']) / T * deg,
    'hMin': float(h.min()), 'hMax': float(h.max()), 'reachBinds': bool(active.get('REACH lo') or active.get('REACH hi')),
    'pressedBinds': bool(active.get('pressed margin>=0')), 'pressedMarginMin': min(n['pressedMargin'] for n in cs),
    'loadVsInvCosLam': float(np.max(np.abs(load - 1 / np.cos(lam)))),
    'bandNearSwitch': {k: [x for x in active.get(k, []) if x <= 0.15 or x >= 0.85] for k in ('band lo', 'band hi')},
    'skidShare': skid / diss, 'activeBounds': active,
    'meshChange': {'lamDeg': mesh['lam'] * deg, 'epsDeg': mesh['eps'] * deg, 'loadG': mesh['load'], 'gamDeg': mesh['gam'] * deg},
    'gates': {
      '1_solved_residuals': fine['status'] == 'Solve_Succeeded' and res_ok, 'mirrorRes': fine['mirrorRes'], 'courseRes': fine['courseRes'],
      '2_one_max': len(pe) == 1 and len(pl) == 1, 'epsMaxima': [round(float(t[i]), 4) for i in pe], 'loadMaxima': [round(float(t[i]), 4) for i in pl],
      '3_band': band_ok,
      '4_mesh': {'lamDeg': mesh['lam'] * deg, 'epsDeg': mesh['eps'] * deg, 'loadG': mesh['load'], 'gamDeg': mesh['gam'] * deg},
    },
  }


def gates_r1(args):
  out = json.load(open(args.out)) if os.path.exists(args.out) else {}
  for name, fine_f, coarse_f in args.cell:
    out[name] = r1_cell(json.load(open(fine_f)), json.load(open(coarse_f)))
    print(json.dumps({name: out[name]['gates']}))
  json.dump(out, open(args.out, 'w'), indent=1)


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
  cy = sp.add_parser('cycle', help='share-law p, smooth controls, skid, free switch, course and mean speed hard; λ_peak fixed point')
  cy.add_argument('const')
  cy.add_argument('out')
  cy.add_argument('--speed', type=float, required=True, help='mean speed over the turn, m/s')
  cy.add_argument('--turn-l', type=float, required=True, help='fall-line distance per turn, m')
  cy.add_argument('--offset', type=float, required=True, help="the mass's lateral travel per turn (gate offset D), m")
  cy.add_argument('--N', type=int, default=80)
  cy.add_argument('--delta-deg', type=float, default=1.0)
  cy.add_argument('--max-iter', type=int, default=3000)
  cy.add_argument('--tol', type=float, default=1e-9, help='IPOPT tol')
  cy.add_argument('--wall', type=float, default=1800, help='wall-clock cap for the whole fixed point, s')
  cy.add_argument('--peak-iters', type=int, default=25)
  cy.add_argument('--warm', help='start from a cycle solution JSON and its λ_peak')
  cy.add_argument('--peak-tol', type=float, default=1e-6, help='λ_peak fixed-point step, rad, when no --coarse is given')
  cy.add_argument('--coarse', help='the N/2 solve: λ_peak converged once its last-3-pass range is within the mesh change')
  gr = sp.add_parser('gates_r1', help='R1 gates and summary from N and N/2 solves; merges into OUT')
  gr.add_argument('out')
  gr.add_argument('--cell', nargs=3, action='append', required=True, metavar=('NAME', 'SOL_N', 'SOL_HALF_N'))
  lp = sp.add_parser('link', help='both starts linked and agreeing, each against its N/2 solve')
  for k in ('a', 'a_half', 'b', 'b_half'):
    lp.add_argument(k)
  bk = sp.add_parser('bake', help='src/physics/carve-cycles.json from the gated solves')
  bk.add_argument('out')
  bk.add_argument('--cell', nargs=4, action='append', required=True, metavar=('NAME', 'SOL_N', 'SOL_HALF_N', 'REPLAY'))
  bk.add_argument('--other', nargs=3, action='append', metavar=('NAME', 'SOL_N', 'SOL_HALF_N'), help='the second start at the same heading')
  args = ap.parse_args()
  {'port': port, 'cycle': cycle, 'gates_r1': gates_r1, 'link': link, 'bake': bake}[args.cmd](args)


if __name__ == '__main__':
  sys.exit(main())
