# /// script
# requires-python = ">=3.11,<3.13"
# dependencies = ["casadi==3.7.2", "numpy==2.1.3"]
# ///
"""The carved turn from switch to switch as one periodic direct-collocation solve (CasADi + IPOPT), offline.

Ports src/physics/turn.ts's carve: the pendulum on the pressure centre, skiCurvatureOf, the speed law. Constants come
from a JSON the lane's bun dump writes; nothing here is retyped from TS.
  port CONST TSVALS OUT        the port table against TS values
  gates_r2 OUT --cell NAME SOL SOL_HALF ...   R2 gates and summary
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

  # Solve form, each branch on its own, sign(ε) as tanh(ε/δ); casadi or float. The margin picks the branch by complementarity.
  def inv_bend_s(self, force):
    b = self.c['bend']
    return ca.fmin(1 / b['min'], ca.fmax(1 / b['max'], force / self.bendK))

  def ski_curvature_s(self, eps, force, delta):
    sink = self.c['compliance'] * force
    return (ca.tanh(eps / delta) * self.depth / ca.cos(eps) + sink * ca.sin(eps)) / (self.depth * self.Rsc)

  def bridged_curvature_s(self, eps, force, delta):
    return ca.tanh(eps / delta) * ca.cos(eps) / self.Rsc + ca.sin(eps) * self.inv_bend_s(force)

  def pressed_margin_s(self, eps, force, delta):
    return ca.cos(eps) * self.inv_bend_s(force) - ca.tanh(eps / delta) * ca.sin(eps) / self.Rsc

  # Per ski about the snow normal through the ski centre, kg m².
  def yaw_inertia(self):
    return yaw_inertia(self.c)['I']

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


  def rhs_law(self, x, u, z, delta, lam_peak):
    lam, lamDot, h, hd, hdd, eps, epsDot, gam, gamDot, psi, v, psiS, r = [x[i] for i in range(13)]
    load, s = z[0], z[3]
    G = self.G
    p, pd, A, B = self.law_s(lam, lamDot, lam_peak)
    share = self.c['SWITCH_SHARE'] - p / self.c['stance']
    force = load * share * self.c['mass'] * G
    kP, kB = self.ski_curvature_s(eps, force, delta), self.bridged_curvature_s(eps, force, delta)
    kap = s * kP + (1 - s) * kB
    # Ski heading = travel + γ, yawing at r; the edge carries v cos γ κ of it, ω is the rest; the travel turns at r − γ̇.
    om = r - v * kap * ca.cos(gam)
    kS = (r - gamDot) / v
    pull = G * self.sin * ca.cos(psi)
    inertia = h + A * ca.cos(lam)
    lamAcc = (G * self.cos * ca.sin(lam) - (v * v * kS + B - pull) * ca.cos(lam) - 2 * hd * lamDot) / inertia
    pdd = A * lamAcc + B
    fm = hdd - h * lamDot ** 2 + G * self.cos * ca.cos(lam) + (v * v * kS + pdd - pull) * ca.sin(lam)
    psiDot = (load * G * ca.sin(lam) + G * self.sin * ca.cos(psi)) / v
    # Snow's lateral force in g, ≥ 0 by the bounds λ ≥ 0, load ≥ 0; normal to the ski it is f / cos γ.
    f = load * ca.sin(lam)
    Pi = self.slip_speed(v * ca.sin(gam), om)
    vDot = G * (self.sin * ca.sin(psi) - self.c['mu'] * load - self.c['dragPerV2'] * v * v - f / ca.cos(gam) * Pi / v)
    xd = ca.vertcat(lamDot, lamAcc, hd, hdd, u[0], epsDot, u[1], gamDot, u[2], psiDot, vDot, r, u[3])
    M = self.pivot_moment(f / ca.cos(gam) * self.c['mass'] * G, v * ca.sin(gam), om)
    # The snow's moment opposes ω; at γ 0 it is Coulomb's set ±Fℓ/4 (the groove), smoothed by OM_DELTA.
    Ms = -M * om / ca.sqrt(om * om + OM_DELTA ** 2)
    mass, Iy = self.c['mass'], self.yaw_inertia()
    # Each ski: I ψ̈_ski = M_hip + its share of M_snow.
    Mho, Mhi = Iy * u[3] - share * Ms, Iy * u[3] - (1 - share) * Ms
    mo, mi = share * ca.fabs(Ms) / (M_REF_OUT * mass), (1 - share) * ca.fabs(Ms) / (M_REF_IN * mass)
    mu = self.Rsc * self.pressed_margin_s(eps, force, delta)
    return xd, fm - load * G, kap, share, force, {'p': p, 'pd': pd, 'pdd': pdd, 'inertia': inertia, 'kS': kS, 'f': f, 'Pi': Pi, 'M': ca.fabs(Ms), 'Ms': Ms,
                                                  'MoutR': mo, 'MinR': mi, 'MhoR': Mho / (M_REF_OUT * mass), 'MhiR': Mhi / (M_REF_IN * mass), 'om': om, 'mu': mu,
                                                  'kP': kP, 'kB': kB}

  # Mean |a + ω s| over the running edge, uniform load (inferred): b ≤ a gives a; else (1/ℓ)∫|u|du/|ω| = (a² + b²)/(2b),
  # = a + (b − a)²/(2b): equal and C¹ at b = a. With p = max(0, b − a), max(a, b) = a + p, so the denominator never hits 0.
  def edge_slip(self, a, om):
    ell = math.sqrt(8 * self.depth * self.Rsc)
    b = ca.sqrt(om * om + OM_DELTA ** 2) * ell / 2
    return ell, (b - a + ca.sqrt((b - a) ** 2 + P_DELTA ** 2)) / 2

  def slip_speed(self, a, om):
    _, p = self.edge_slip(a, om)
    return a + p * p / (2 * (a + p))

  # Snow's yaw moment about the ski centre, M = q∫ s·sign(a + ωs) ds over ±ℓ/2, q = F/ℓ: 0 with no sign change (b ≤ a), else
  # q(ℓ²/4 − s0²), s0 = −a/ω, = (Fℓ/4)(1 − a²/b²) = (Fℓ/4)·p(2a + p)/(a + p)²: 0 at b = a (continuous), Fℓ/4 at a = 0.
  def pivot_moment(self, F, a, om):
    ell, p = self.edge_slip(a, om)
    return F * ell / 4 * p * (2 * a + p) / (a + p) ** 2


LIT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'prior', 'lit-curves.json')
_sl = json.load(open(LIT))['slalom']
_num = lambda s: float(s.split()[0])
# reid-2010 SL skid peak mean, inferred as the full-slip attack.
GAM_REF = float(re.match(r't [^,]*, ([\d.]+) ±', _sl['events']['skid_peak']).group(1)) * math.pi / 180
# |ω| as √(ω² + δ²), rad/s, and max(0, b − a) as (x + √(x² + δ²))/2, m/s: numerical.
OM_DELTA = 1e-3
P_DELTA = 1e-3
# Scholtes homotopy on the bend branch's complementarity, each step warm started from the last.
TAUS = (1e-2, 1e-3, 1e-4, 1e-5, 1e-6)
# Hip rotation moment maxima, Nm/kg: outside ER 0.17, inside IR 0.23 (heinrich-2022, docs/research/biomechanics.md:1005).
M_REF_OUT, M_REF_IN = 0.17, 0.23
# Per ski without binding, kg, by length; both pair weights halved (per pair inferred).
SKI_MASS = {
  # stoeckli.ch/inten/ski/ski/fis-racing/laser-sl-fis: 165 cm 3.59 kg.
  1.65: 3.59 / 2,
  # sportgardena.com Völkl Racetiger GS: 3020–3200 g without binding by size, the mid; skipass.com gives 2285 g with binding: conflict.
  1.73: 3.11 / 2,
}
# Marker Race XCell 16 5.19 lb a pair (skiessentials.com) plus a WC Piston 14 mm plate 709 g a half pair (utahskigear.com).
BINDING_MASS = 5.19 * 0.45359 / 2 + 0.709
# Atomic Redster Club Sport 130 at 26.5, 2357 g (skiessentials.com), per boot inferred.
BOOT_MASS = 2.357
# de-leva-1996 Table 4 male (BMC notebook, demotu): mass share, radius of gyration, length m; the foot's transverse r about the normal is inferred.
FOOT = (0.0137, 0.245, 0.2581)
SHANK = (0.0433, 0.102, 0.4403)
# The boot's sole length (src/viewer/skier.ts HORISHIMA bsl), the shank (anatomyBody(1.68).shin), stature for the foot's scale.
BSL, SHIN, STATURE, LEVA_STATURE = 0.295, 0.367634 * 1.68 / 1.716251, 1.68, 1.741
# The boot over the ski centre: skier.ts SKI_MOUNT, inferred there.
MOUNT = 0.05


def yaw_inertia(c):
  """One ski, binding, boot, foot and shank about the snow normal through the ski centre, kg m², by part."""
  L = c['ski']['length']
  if L not in SKI_MASS:
    sys.exit(f'no sourced mass for a {L} m ski')
  mf, ms = FOOT[0] * c['mass'], SHANK[0] * c['mass']
  # Uniform bars (inferred): the ski over its length, binding and boot over the sole; foot and shank by their radii, the shank's axis on the normal.
  parts = {'ski': SKI_MASS[L] * L ** 2 / 12, 'binding': BINDING_MASS * (BSL ** 2 / 12 + MOUNT ** 2), 'boot': BOOT_MASS * (BSL ** 2 / 12 + MOUNT ** 2),
           'foot': mf * ((FOOT[1] * FOOT[2] * STATURE / LEVA_STATURE) ** 2 + MOUNT ** 2), 'shank': ms * ((SHANK[1] * SHIN) ** 2 + MOUNT ** 2)}
  return {'I': sum(parts.values()), 'parts': parts, 'masses': {'ski': SKI_MASS[L], 'binding': BINDING_MASS, 'boot': BOOT_MASS, 'foot': mf, 'shank': ms}}
GAM_MAX = 60.0 * math.pi / 180
# Lateral |cos ψ| as √(cos² + δ²), numerical.
ABS_DELTA = 1e-3


def scales():
  """Fixed objective scales from reid-2010's 13 m slalom course (inferred as scales)."""
  T_turn = _num(_sl['period_s']['values']['reid-2010 13 m'])
  e_max = float(_sl['edge_angle']['13m']['max'])
  rom = _num(_sl['leg_length_cm']['13m']['rom']) / 100
  return {'s_eps': e_max * math.pi / 180 * (math.pi / T_turn) ** 2, 's_h': rom / 2 * (2 * math.pi / T_turn) ** 3, 's_gdd': GAM_REF * (math.pi / T_turn) ** 2,
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


NXL = ['lam', 'lamDot', 'h', 'hd', 'hdd', 'eps', 'epsDot', 'gam', 'gamDot', 'psi', 'v', 'psiS', 'r']
NX = len(NXL)
NUL = ['hddd', 'epsDdot', 'gamDdot', 'rDot']
NZL = ['load', 'bp', 'bm', 's']
I = {k: i for i, k in enumerate(NXL)}
# Mirror about the fall line, turn sense s → −s: λ' = −λ so d/dt keeps the sign (λ̇, ε, ε̇ odd); γ is into the turn, so it flips with s
# like ε (γ, γ̇ odd; with γ ≥ 0 that pins γ 0 at the switch); h, its rates, v even; ψ' = π − ψ, ψ_ski' = π − ψ_ski, so r is odd.
ODD = ('lamDot', 'eps', 'epsDot', 'gam', 'gamDot', 'r')
EVEN = ('h', 'hd', 'hdd', 'v')


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


def solve_law(args, c, m, g, lam_peak, sc, wall, tau_c, duals=None):
  """One solve with p on §7's share law at λ_peak: the skis' yaw inertial, the bend pressed or bridged (Scholtes τ_c), free switch, course and speed hard."""
  d, N = 3, args.N
  delta = args.delta_deg * math.pi / 180
  tau, C, Dend, Bq = radau(d)
  Tg = float(g['t'][-1])
  gi = lambda k, tt: float(np.interp(tt, g['tl'] if k in NZL else g['t'], g[k]))
  amax = c['ANGULATION_MAX_DEG'] * math.pi / 180
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
    x = var(NX, lb, ub, [min(ub[i], max(lb[i], clip(k, gi(k, tt)))) for i, k in enumerate(NXL)])
    # Platform hold 0 ≤ m ≤ A_max; slip at any margin. The snow's lateral capacity: tan λ ≤ GRIP_RATIO (task.ts rule 3).
    con(x[I['eps']] - x[I['lam']], 0, amax)
    con(ca.sin(x[I['lam']]) - c['GRIP_RATIO'] * ca.cos(x[I['lam']]), -inf, 0)
    if first:
      # Cross-over: the mass is highest at the switch.
      con(x[I['h']] - first[0][I['h']], -inf, 0)
    else:
      first.append(x)
    return x

  X0 = new_x(0.0)
  Xk = X0
  nodes = [(0, 0.0, X0, None, None)]
  Iv = IL = ID = Ju = JM = 0
  for j in range(N):
    tj, dt = (j + 0.5) * Tg / N, Tg / N
    U = var(4, [-inf] * 4, [inf] * 4, [(gi(k, tj + dt / 2) - gi(k, tj - dt / 2)) / dt for k in ('hdd', 'epsDot', 'gamDot', 'r')])
    Xc = []
    for r in range(1, d + 1):
      tt = (j + tau[r]) * Tg / N
      x = new_x(tt)
      Z = var(4, [0, 0, 0, 0], [c['F_CEIL_G'], inf, inf, 1], [min(c['F_CEIL_G'], max(0.0, gi('load', tt))), max(0.0, gi('bp', tt)), max(0.0, gi('bm', tt)),
                                                             min(1.0, max(0.0, gi('s', tt)))])
      # Margin μ = bp − bm: pressed (s 1) where μ > 0, bridged (s 0) where μ < 0, any s on μ = 0 (the jump filled in).
      con(ca.vertcat(Z[1] * Z[2], (1 - Z[3]) * Z[1], Z[3] * Z[2]), -inf, tau_c)
      Xc.append(x)
      nodes.append((j, tau[r], x, U, Z))
    for r in range(1, d + 1):
      xp = C[0, r] * Xk + sum(C[q, r] * Xc[q - 1] for q in range(1, d + 1))
      x, Z = nodes[-d + r - 1][2], nodes[-d + r - 1][4]
      xd, alg, kap, share, force, ex = m.rhs_law(x, U, Z, delta, lam_peak)
      # (1/T)∫ over Radau: hstep·Bq/T = Bq/N.
      JM += Bq[r] * (ex['MhoR'] ** 2 + ex['MhiR'] ** 2)
      con(hstep * xd - xp, 0, 0)
      con(alg, 0, 0)
      con(Z[1] - Z[2] - ex['mu'], 0, 0)
      v, psi = x[I['v']], x[I['psi']]
      Iv += hstep * Bq[r] * v
      IL += hstep * Bq[r] * v * ca.sin(psi)
      ID += hstep * Bq[r] * v * ca.sqrt(ca.cos(psi) ** 2 + ABS_DELTA ** 2)
    Ju += (U[0] / sc['s_h']) ** 2 + (U[1] / sc['s_eps']) ** 2 + (U[2] / sc['s_gdd']) ** 2
    Xk = Dend[0] * Xk + sum(Dend[q] * Xc[q - 1] for q in range(1, d + 1))
    if j < N - 1:
      Xn = new_x((j + 1) * Tg / N)
      con(Xn - Xk, 0, 0)
      Xk = Xn
      nodes.append((j + 1, 0.0, Xn, None, None))
  XN = Xk
  con(ca.vertcat(X0[I['lam']], XN[I['lam']]), 0, 0)
  mirror = ca.vertcat(*[XN[I[k]] + X0[I[k]] for k in ODD], *[XN[I[k]] - X0[I[k]] for k in EVEN], *[XN[I[k]] + X0[I[k]] - math.pi for k in ('psi', 'psiS')])
  con(mirror, 0, 0)
  cnames = ('meanSpeed', 'L') if args.free_d else ('meanSpeed', 'L', 'D')
  course = ca.vertcat(Iv - args.speed * T, IL - args.turn_l, *([] if args.free_d else [ID - args.offset]))
  con(course, 0, 0)
  # Time-mean J: (1/T)∫u² dt over piecewise-constant u is (1/N)Σu².
  J = (Ju + JM) / N
  W = ca.vertcat(*w)
  ip = {'max_iter': args.max_iter, 'tol': args.tol, 'constr_viol_tol': 1e-10, 'print_level': 0, 'sb': 'yes', 'mumps_pivot_order': 6, 'max_wall_time': max(1.0, wall)}
  kw = {}
  if duals is not None and len(duals['x']) == len(w0) and len(duals['lam_g']) == len(lbg):
    # Homotopy step: primal and duals from the last τ.
    ip.update({'warm_start_init_point': 'yes', 'mu_init': 1e-4, 'warm_start_bound_push': 1e-6, 'warm_start_mult_bound_push': 1e-6})
    w0, kw = duals['x'], {'lam_x0': duals['lam_x'], 'lam_g0': duals['lam_g']}
  solver = ca.nlpsol('s', 'ipopt', {'x': W, 'f': J, 'g': ca.vertcat(*g_)}, {'print_time': False, 'ipopt': ip})
  r_ = solver(x0=w0, lbx=lbw, ubx=ubw, lbg=lbg, ubg=ubg, **kw)
  st = solver.stats()
  wv = r_['x']
  outs = ca.Function('fv', [W], [J, X0, XN, T, mirror, course, Iv, IL, ID, JM / N])(wv)
  Jv, x0v, xNv, Tv, mv, cv, Ivv, ILv, IDv, JMv = [np.array(z).ravel() for z in outs]
  flat = np.array(ca.Function('ev', [W], [ca.vertcat(*[ca.vertcat(*[q for q in nd[2:] if q is not None]) for nd in nodes])])(wv)).ravel()
  Tv = float(Tv[0])
  rows, k = [], 0
  for (j, tr, x, U, Z) in nodes:
    n = NX + (len(NUL) + len(NZL) if U is not None else 0)
    vv = flat[k:k + n]
    k += n
    xv = [float(q) for q in vv[:NX]]
    row = {'t': (j + tr) * Tv / N, **dict(zip(NXL, xv))}
    p, pd, A, B = m.law(xv[0], xv[1], lam_peak)
    row.update({'p': p, 'pd': pd, 'share': c['SWITCH_SHARE'] - p / c['stance']})
    if U is not None:
      uv = [float(q) for q in vv[NX:NX + len(NUL)]]
      zv = [float(q) for q in vv[NX + len(NUL):n]]
      xd, alg, kap, share, force, ex = m.rhs_law(ca.DM(xv), ca.DM(uv), ca.DM(zv), delta, lam_peak)
      row.update(dict(zip(NUL, uv)))
      row.update(dict(zip(NZL, zv)))
      om = float(ex['om'])
      row.update({'lamAcc': float(xd[1]), 'pdd': float(ex['pdd']), 'kappa': float(kap), 'kS': float(ex['kS']), 'f': float(ex['f']),
                  'force': float(force), 'pressedMargin': float(m.pressed_margin_s(xv[I['eps']], float(force), delta)), 'algRes': float(alg),
                  'om': om, 'Pi': float(ex['Pi']), 'kSoff': float(ex['kS']) - float(kap) * math.cos(xv[I['gam']]),
                  **{q: float(ex[q]) for q in ('M', 'Ms', 'MoutR', 'MinR', 'MhoR', 'MhiR', 'mu', 'kP', 'kB')}})
    else:
      # At λ 0 the force balance is explicit: F/m = ḧ − h λ̇² + g cos θ.
      row['load'] = (xv[I['hdd']] - xv[I['h']] * xv[I['lamDot']] ** 2 + m.G * m.cos) / m.G
    row['m'] = xv[I['eps']] - xv[I['lam']]
    rows.append(row)
  names = [*ODD, *EVEN, 'psi', 'psiS']
  duals_out = {'x': np.array(wv).ravel().tolist(), 'lam_x': np.array(r_['lam_x']).ravel().tolist(), 'lam_g': np.array(r_['lam_g']).ravel().tolist()}
  return {'status': st['return_status'], 'success': st['success'], 'iters': st['iter_count'], 'lamPeak': lam_peak, 'tau': tau_c, 'J': float(Jv[0]), 'JM': float(JMv[0]),
          '_duals': duals_out, 'defectDegS': float(xNv[1] + x0v[1]) * 180 / math.pi, 'mirrorRes': dict(zip(names, (float(z) for z in mv))),
          'courseRes': dict(zip(cnames, (float(cv[0]) / Tv, *(float(z) for z in cv[1:])))),
          'meanSpeed': float(Ivv[0]) / Tv, 'L': float(ILv[0]), 'D': float(IDv[0]),
          'T': Tv, 'v0': float(x0v[I['v']]), 'psi0': float(x0v[I['psi']]), 'psiN': float(xNv[I['psi']]), 'h0': float(x0v[I['h']]),
          'psiS0': float(x0v[I['psiS']]), 'yaw': yaw_inertia(c),
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
  h = c['REACH'][0] + 0.75 * (c['REACH'][1] - c['REACH'][0]) + 0 * t
  # Carve start: γ = ω = 0, the skis yaw with the mass.
  psi = math.pi / 2 - np.arctan(xp)
  g = {'t': t, 'lam': lam, 'lamDot': np.gradient(lam, t), 'h': h, 'hd': 0 * t, 'hdd': 0 * t, 'eps': eps, 'epsDot': np.gradient(eps, t),
       'gam': 0 * t, 'gamDot': 0 * t, 'psi': psi, 'v': v + 0 * t, 'psiS': psi, 'r': np.gradient(psi, t), 'tl': t, 'load': m.cos / np.cos(lam)}
  return branch_guess(m, g)


def branch_guess(m, g):
  """bp, bm, s from the guess's edge, lean and load at λ_peak0 (a guess only)."""
  eps, lam = np.interp(g['tl'], g['t'], g['eps']), np.interp(g['tl'], g['t'], g['lam'])
  share = np.array([m.c['SWITCH_SHARE'] - m.law(l, 0.0, m.c['lamPeak0'])[0] / m.c['stance'] for l in lam])
  F = np.maximum(g['load'], 0) * share * m.c['mass'] * m.G
  mu = np.array([m.Rsc * float(m.pressed_margin_s(e, f, math.pi / 180)) for e, f in zip(eps, F)])
  g['bp'], g['bm'], g['s'] = np.maximum(mu, 0), np.maximum(-mu, 0), (mu >= 0).astype(float)
  return g


def guess_from(sol, m):
  ns = sol['nodes']
  g = {k: np.array([n.get(k, 0.0) for n in ns]) for k in ['t', *NXL]}
  wl = [n for n in ns if 'hddd' in n]
  g['tl'], g['load'] = np.array([n['t'] for n in wl]), np.array([n['load'] for n in wl])
  if 'r' not in ns[0]:
    # An R3 solve: r = v κ cos γ + ω at its collocation points, ψ_ski from its switch relation.
    tu, iu = np.unique(g['t'], return_index=True)
    r = np.interp(tu, g['tl'], [n['v'] * n['kappa'] * math.cos(n['gam']) + n['om'] for n in wl])
    n0 = ns[0]
    ps = n0['psi'] - math.atan(n0['h'] * n0['lamDot'] / n0['v']) + n0['gam'] + np.concatenate([[0], np.cumsum((r[1:] + r[:-1]) / 2 * np.diff(tu))])
    g['r'], g['psiS'] = np.interp(g['t'], tu, r), np.interp(g['t'], tu, ps)
  if 'bp' in wl[0]:
    for k in NZL[1:]:
      g[k] = np.array([n[k] for n in wl])
    return g
  return branch_guess(m, g)


def cycle(args):
  """λ_peak by fixed point as carveCycle carries it: solve at λ_peak, set it to the solved turn's largest λ, repeat."""
  c = json.load(open(args.const))
  m = Model(c)
  sc = scales()
  print(json.dumps({'scales': sc}), flush=True)
  warm = json.load(open(args.warm)) if args.warm else None
  g = guess_from(warm, m) if warm else course_guess(c, m, args.speed, args.turn_l, args.offset)
  lam_peak = warm['lamPeak'] if warm else c['lamPeak0']
  coarse = json.load(open(args.coarse)) if args.coarse else None
  deadline = time.time() + args.wall
  hist, sol, converged, extra, duals, reached, last_ok = [], None, False, {}, None, None, None
  # τ ladder first, λ_peak updated after every pass; the fixed point is tested at the last τ only.
  for it in range(args.peak_iters):
    left = deadline - time.time()
    if left <= 0:
      break
    tau_c = TAUS[min(it, len(TAUS) - 1)]
    sol = solve_law(args, c, m, g, lam_peak, sc, left, tau_c, duals)
    duals = sol.pop('_duals')
    nxt = max(n['lam'] for n in sol['nodes'])
    hist.append({'tau': tau_c, 'lamPeakDeg': lam_peak * 180 / math.pi, 'maxLamDeg': nxt * 180 / math.pi, 'status': sol['status'], 'iters': sol['iters'], 'J': sol['J'], 'JM': sol['JM'],
                 'T': sol['T'], 'psi0Deg': sol['psi0'] * 180 / math.pi})
    print(json.dumps(hist[-1]), flush=True)
    if sol['status'] not in ('Solve_Succeeded', 'Solved_To_Acceptable_Level', 'Maximum_Iterations_Exceeded'):
      # Keep the last good pass on disk; the failure is in its history.
      if last_ok is not None:
        last_ok['peakHistory'] = hist
      json.dump(last_ok or {'args': vars(args), **sol, 'tauReached': reached, 'peakConverged': False, 'peakHistory': hist}, open(args.out, 'w'))
      break
    if sol['status'] == 'Solve_Succeeded':
      reached = tau_c
    if tau_c != TAUS[-1]:
      g, lam_peak = guess_from(sol, m), nxt
      last_ok = {'args': vars(args), **sol, 'tauReached': reached, 'peakConverged': False, 'peakHistory': hist}
      json.dump(last_ok, open(args.out + '.tmp', 'w'))
      os.replace(args.out + '.tmp', args.out)
      continue
    if coarse:
      mesh = float(mesh_change_lam({**sol, 'args': vars(args)}, coarse))
      spread = peak_spread_deg([q for q in hist if q['tau'] == TAUS[-1]])
      extra = {'meshChangeLamDeg': mesh, 'peakSpreadDeg': spread}
      converged = bool(spread is not None and spread <= mesh)
    else:
      converged = abs(nxt - lam_peak) <= args.peak_tol
    last_ok = {'args': vars(args), **sol, **extra, 'tauReached': reached, 'peakConverged': converged, 'peakHistory': hist}
    json.dump(last_ok, open(args.out + '.tmp', 'w'))
    os.replace(args.out + '.tmp', args.out)
    g = guess_from(sol, m)
    lam_peak = nxt
    if converged:
      break
  if sol is not None:
    print(json.dumps({'status': sol['status'], 'tauReached': reached, 'T': sol['T'], 'psi0Deg': sol['psi0'] * 180 / math.pi, 'lamPeak': sol['lamPeak'], 'peakConverged': converged, **extra}))


def samples_r1(sol):
  """t 0 (the switch, load explicit) then every collocation point; ω is sense-relative, so ω(0) = −ω(T)."""
  ns = sol['nodes']
  cs = [n for n in ns if 'hddd' in n]
  n0 = dict(ns[0])
  if 'om' in cs[-1] and 'om' not in n0:
    n0['om'] = -cs[-1]['om']
    if 'omP' in cs[-1]:
      n0['omP'], n0['omM'] = cs[-1]['omM'], cs[-1]['omP']
    n0['f'] = n0['load'] * math.sin(n0['lam'])
    n0['kSoff'] = (n0['om'] - n0['gamDot']) / n0['v']
    c = json.load(open(sol['args']['const']))
    md = Model(c)
    a0 = n0['v'] * math.sin(n0['gam'])
    n0['Pi'] = float(md.slip_speed(a0, n0['om']))
    if 'Ms' in cs[-1]:
      # The mirror: ω, M_snow, ψ̈_ski odd; the branch even; share 1/2 at λ 0, so both hips carry the same.
      n0['Ms'], n0['rDot'], n0['M'] = -cs[-1]['Ms'], -cs[-1]['rDot'], cs[-1]['M']
      n0['kS'] = (n0['r'] - n0['gamDot']) / n0['v']
      for k in ('s', 'bp', 'bm', 'mu', 'kappa'):
        n0[k] = cs[-1][k]
      mass, Iy = c['mass'], md.yaw_inertia()
      n0['MoutR'], n0['MinR'] = n0['share'] * n0['M'] / (M_REF_OUT * mass), (1 - n0['share']) * n0['M'] / (M_REF_IN * mass)
      n0['MhoR'] = (Iy * n0['rDot'] - n0['share'] * n0['Ms']) / (M_REF_OUT * mass)
      n0['MhiR'] = (Iy * n0['rDot'] - (1 - n0['share']) * n0['Ms']) / (M_REF_IN * mass)
    elif 'M' in cs[-1]:
      n0['M'] = float(md.pivot_moment(n0['f'] / math.cos(n0['gam']) * c['mass'] * c['G'], a0, n0['om']))
      n0['MoutR'] = n0['share'] * n0['M'] / (M_REF_OUT * c['mass'])
      n0['MinR'] = (1 - n0['share']) * n0['M'] / (M_REF_IN * c['mass'])
  return [n0] + cs


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


def r2_cell(fine, coarse):
  c = json.load(open(fine['args']['const']))
  s = samples_r1(fine)
  T, N = fine['T'], fine['args']['N']
  col = lambda k: np.array([n[k] for n in s])
  t = col('t') / T
  deg = 180 / math.pi
  lam, eps, gam, psi, v, h, load, lamDot, om, mg = (col(k) for k in ('lam', 'eps', 'gam', 'psi', 'v', 'h', 'load', 'lamDot', 'om', 'm'))
  mesh = {k: mesh_change(fine, coarse, k) for k in ('lam', 'eps', 'load', 'gam')}
  # Quadrature over collocation samples (Radau IIA weights).
  Bq = np.tile(fine['Bq'][1:], N) * T / N
  cs = s[1:]
  qd = lambda f: float(sum(b * f(n) for b, n in zip(Bq, cs)))
  mu, dr = c['mu'], c['dragPerV2']
  amax = c['ANGULATION_MAX_DEG'] * math.pi / 180
  sn = lambda n: n['f'] / math.cos(n['gam'])
  parts = {'gliding': qd(lambda n: mu * n['load'] * n['v']), 'drag': qd(lambda n: dr * n['v'] ** 3),
           'attack': qd(lambda n: sn(n) * n['v'] * math.sin(n['gam'])), 'pivot': qd(lambda n: sn(n) * (n['Pi'] - n['v'] * math.sin(n['gam'])))}
  tot = sum(parts.values())
  slipping = lambda n: n['gam'] > 0.5 / deg or abs(n['om']) > 0.05
  sl_t = [n['t'] / T for n in s if slipping(n)]
  rate = c['EDGE_RATE_DEG_S'] * math.pi / 180
  tb = 1e-6
  bounds = {
    'lam>=0 (interior)': [n['t'] / T for n in s[1:-1] if n['lam'] <= tb],
    'REACH lo': [n['t'] / T for n in s if n['h'] - c['REACH'][0] <= tb], 'REACH hi': [n['t'] / T for n in s if c['REACH'][1] - n['h'] <= tb],
    '|hd|<=HD_MAX': [n['t'] / T for n in s if c['HD_MAX'] - abs(n['hd']) <= tb],
    'load<=F_CEIL_G': [n['t'] / T for n in s if c['F_CEIL_G'] - n['load'] <= tb], 'load>=0': [n['t'] / T for n in s if n['load'] <= tb],
    '|epsDot|<=EDGE_RATE': [n['t'] / T for n in s if rate - abs(n['epsDot']) <= tb],
    'pressed margin>=0': [n['t'] / T for n in cs if n['pressedMargin'] <= tb],
    'm>=0': [n['t'] / T for n in s if n['m'] <= tb], 'm<=A_max': [n['t'] / T for n in s if amax - n['m'] <= tb],
    'gam>=0': [n['t'] / T for n in s if n['gam'] <= tb], 'gam<=60deg': [n['t'] / T for n in s if GAM_MAX - n['gam'] <= tb],
    'h<=h(0) cross-over': [n['t'] / T for n in s[1:] if s[0]['h'] - n['h'] <= tb],
    'psi0 in [0, pi/2]': [0.0] if fine['psi0'] <= tb or math.pi / 2 - fine['psi0'] <= tb else [],
    'v>=V_FLOOR': [n['t'] / T for n in s if n['v'] - c['V_FLOOR'] <= tb],
  }
  active = {k: [round(x, 4) for x in v_] for k, v_ in bounds.items() if v_}
  # Complementarity at every node the solve holds it on, the mesh nodes included.
  allx = fine['nodes']
  comp_g = max(n['m'] * n['gam'] for n in allx)
  comp_w = max((n['m'] * max(n['omP'], n['omM']) for n in allx if 'omP' in n), default=None)
  comp_s = max((n['omP'] * n['omM'] for n in allx if 'omP' in n), default=None)
  m_ok = all(-1e-9 <= n['m'] <= amax + 1e-9 for n in allx)
  pe, pl = interior_maxima(eps, mesh['eps']), interior_maxima(load, mesh['load'])
  res_ok = all(abs(x) <= 1e-6 for x in fine['mirrorRes'].values()) and all(abs(x) <= 1e-6 for x in fine['courseRes'].values())
  ie, il, ig, iw = int(np.argmax(eps)), int(np.argmax(load)), int(np.argmax(gam)), int(np.argmax(np.abs(om)))
  return {
    'status': fine['status'], 'tauReached': fine.get('tauReached'), 'T': T, 'L': fine['L'], 'D': fine['D'], 'meanSpeed': fine['meanSpeed'], 'lamPeakDeg': fine['lamPeak'] * deg,
    'peakConverged': fine.get('peakConverged'), 'J': fine['J'],
    'switchMassDeg': fine['psi0'] * deg, 'switchSkisDeg': (fine['psi0'] - math.atan(h[0] * lamDot[0] / v[0]) + gam[0]) * deg,
    'vMin': float(v.min()), 'vMax': float(v.max()), 'eps0Deg': float(eps[0]) * deg,
    'epsPeakDeg': float(eps[ie]) * deg, 'epsPeakT': float(t[ie]), 'lamPeakSolvedDeg': float(lam.max()) * deg, 'loadPeak': float(load[il]), 'loadPeakT': float(t[il]),
    'gamPeakDeg': float(gam[ig]) * deg, 'gamPeakT': float(t[ig]), 'gamMeanDeg': qd(lambda n: n['gam']) / T * deg,
    'omPeak': float(abs(om[iw])), 'omPeakT': float(t[iw]),
    'slipShare': qd(lambda n: 1.0 if slipping(n) else 0.0) / T, 'slipStartT': min(sl_t) if sl_t else None, 'slipEndT': max(sl_t) if sl_t else None,
    'hMin': float(h.min()), 'hMax': float(h.max()), 'reachBinds': bool(active.get('REACH lo') or active.get('REACH hi')),
    'pressedBinds': bool(active.get('pressed margin>=0')), 'pressedMarginMin': min(n['pressedMargin'] for n in cs),
    'loadVsInvCosLam': float(np.max(np.abs(load - 1 / np.cos(lam)))),
    'dissipation': {k: v_ / tot for k, v_ in parts.items()}, 'skidShare': (parts['attack'] + parts['pivot']) / tot, 'activeBounds': active,
    'meshChange': {'lamDeg': mesh['lam'] * deg, 'epsDeg': mesh['eps'] * deg, 'loadG': mesh['load'], 'gamDeg': mesh['gam'] * deg},
    'gates': {
      '1_solved_residuals': fine['status'] == 'Solve_Succeeded' and res_ok, 'mirrorRes': fine['mirrorRes'], 'courseRes': fine['courseRes'],
      '2_one_max': len(pe) == 1 and len(pl) == 1, 'epsMaxima': [round(float(t[i]), 4) for i in pe], 'loadMaxima': [round(float(t[i]), 4) for i in pl],
      '3_grip': m_ok and fine.get('tauReached') == TAUS[-1] and max(comp_g, comp_w or 0, comp_s or 0) <= 1e-6 and not active.get('gam<=60deg'),
      'mRange': m_ok, 'maxMGam': comp_g, 'maxMOm': comp_w, 'maxOmPOmM': comp_s, 'gam60Active': bool(active.get('gam<=60deg')),
      '4_mesh': {'lamDeg': mesh['lam'] * deg, 'epsDeg': mesh['eps'] * deg, 'loadG': mesh['load'], 'gamDeg': mesh['gam'] * deg},
    },
  }


def gates_r2(args):
  out = json.load(open(args.out)) if os.path.exists(args.out) else {}
  for name, fine_f, coarse_f in args.cell:
    out[name] = r2_cell(json.load(open(fine_f)), json.load(open(coarse_f)))
    print(json.dumps({name: out[name]['gates']}))
  json.dump(out, open(args.out, 'w'), indent=1)


DEG = 180 / math.pi
# reid-2010 10 m course, mean ± SD (n 6): GRF pp 245 text, CoM speed Table G.1; reid-2020 edge and attack.
REID = {'epsPeakDeg': (65.7, 1.7), 'gamPeakDeg': (15.1, 5.3), 'gamPeakT': (0.1, 0.4), 'loadMax': (3.35, 0.20), 'loadMaxT': (0.509, 0.059),
        'loadMin': (0.17, 0.06), 'loadMinT': (0.008, 0.063), 'vMax': (12.62, 0.24), 'vMaxT': (0.329, 0.035), 'vMin': (11.74, 0.36), 'vMinT': (0.7333, 0.0374)}


def within(x, ms, k=2):
  return abs(x - ms[0]) <= k * ms[1]


def phase_d(t, t0):
  """Signed phase distance on the switch-to-switch cycle (t 1 is the next t 0)."""
  return (t - t0 + 0.5) % 1 - 0.5


def r3_cell(fine, coarse, reid):
  r = r2_cell(fine, coarse)
  c = json.load(open(fine['args']['const']))
  s = samples_r1(fine)
  T = fine['T']
  col = lambda k: np.array([n[k] for n in s])
  t, gam, load, mg, lam, v = col('t') / T, col('gam'), col('load'), col('m'), col('lam'), col('v')
  N = fine['args']['N']
  Bq = np.tile(fine['Bq'][1:], N) * T / N
  cs = s[1:]
  qd = lambda f: float(sum(b * f(n) for b, n in zip(Bq, cs)))
  tb = 1e-6
  amax = c['ANGULATION_MAX_DEG'] * math.pi / 180
  grip = [round(float(x), 4) for x, l in zip(t, lam) if math.sin(l) - c['GRIP_RATIO'] * math.cos(l) >= -tb]
  if grip:
    r['activeBounds']['tan lam<=GRIP_RATIO'] = grip
  ig, il = int(np.argmax(gam)), int(np.argmax(load))
  rising = ig < il and ig + 1 < len(load) and load[ig + 1] > load[ig]
  slip = [x for x, g in zip(mg, gam) if g > 0.5 / DEG]
  io, ii = int(np.argmax(col('MoutR'))), int(np.argmax(col('MinR')))
  sweep = qd(lambda n: n['v'] * n['kS'])
  r.update({
    'D': fine['D'], 'freeD': bool(fine['args'].get('free_d')), 'sigmaOut': qd(lambda n: n['om']) / sweep, 'skisSweepDeg': sweep * DEG,
    'JM': fine.get('JM'), 'MoutPeakR': float(col('MoutR')[io]), 'MoutPeakT': float(t[io]), 'MinPeakR': float(col('MinR')[ii]), 'MinPeakT': float(t[ii]),
    'MpeakNm': float(col('M').max()), 'gripBinds': grip, 'tanLamMax': float(np.tan(lam.max())),
    'switchMassOffFallDeg': 90 - r['switchMassDeg'], 'switchSkisOffFallDeg': 90 - r['switchSkisDeg'], 'gamAtLoadPeakDeg': float(gam[il]) * DEG,
    'minMWhereSlipDeg': float(min(slip)) * DEG if slip else None,
  })
  g2 = r['gates']
  m_ok = all(-1e-9 <= n['m'] <= amax + 1e-9 for n in fine['nodes'])
  gates = {
    '1_solved_residuals': g2['1_solved_residuals'], 'mirrorRes': g2['mirrorRes'], 'courseRes': g2['courseRes'],
    '2_one_max': g2['2_one_max'], 'epsMaxima': g2['epsMaxima'], 'loadMaxima': g2['loadMaxima'], '4_mesh': g2['4_mesh'],
    'm_range': m_ok, 'tauReached': fine.get('tauReached'), 'maxOmPOmM': g2['maxOmPOmM'],
    'gam_peak_on_rising_load': rising, 'gam_lt_4_at_load_peak': r['gamAtLoadPeakDeg'] < 4,
    'slip_above_lean': all(x > tb for x in slip),
    'switch_off_fall_line': {'massDeg': r['switchMassOffFallDeg'], 'skisDeg': r['switchSkisOffFallDeg']},
  }
  if reid:
    gates['reid'] = {
      'epsPeak': within(r['epsPeakDeg'], REID['epsPeakDeg']), 'gamPeak': within(r['gamPeakDeg'], REID['gamPeakDeg']),
      'gamPeakT': REID['gamPeakT'][0] <= r['gamPeakT'] <= REID['gamPeakT'][1],
      'loadMax': within(float(load.max()), REID['loadMax']), 'loadMaxT': abs(phase_d(r['loadPeakT'], REID['loadMaxT'][0])) <= 2 * REID['loadMaxT'][1],
      'loadMin': within(float(load.min()), REID['loadMin']), 'loadMinT': abs(phase_d(float(t[int(np.argmin(load))]), REID['loadMinT'][0])) <= 2 * REID['loadMinT'][1],
      'vMax': within(float(v.max()), REID['vMax']), 'vMaxT': abs(phase_d(float(t[int(np.argmax(v))]), REID['vMaxT'][0])) <= 2 * REID['vMaxT'][1],
      'vMin': within(float(v.min()), REID['vMin']), 'vMinT': abs(phase_d(float(t[int(np.argmin(v))]), REID['vMinT'][0])) <= 2 * REID['vMinT'][1],
      'values': {'loadMin': float(load.min()), 'loadMinT': float(t[int(np.argmin(load))]), 'vMaxT': float(t[int(np.argmax(v))]), 'vMinT': float(t[int(np.argmin(v))])},
    }
  r['gates'] = gates
  return r


def gates_r3(args):
  out = json.load(open(args.out)) if os.path.exists(args.out) else {}
  for name, fine_f, coarse_f in args.cell:
    out[name] = r3_cell(json.load(open(fine_f)), json.load(open(coarse_f)), 'reid' in name)
    print(json.dumps({name: out[name]['gates']}, default=np_item))
  json.dump(out, open(args.out, 'w'), indent=1, default=np_item)


def load_step(sol):
  """Largest |Δload| between neighbouring samples (the switch, then every collocation point) and its t/T."""
  s = samples_r1(sol)
  d = np.abs(np.diff([n['load'] for n in s]))
  i = int(np.argmax(d))
  return float(d[i]), float(s[i + 1]['t'] / sol['T'])


def r4_cell(fine, coarse, reid):
  r = r3_cell(fine, coarse, reid)
  s = samples_r1(fine)
  T = fine['T']
  col = lambda k: np.array([n[k] for n in s])
  t, om, ho, hi, br, mu = col('t') / T, col('om'), col('MhoR'), col('MhiR'), col('s'), col('mu')
  iw, io, ii = (int(np.argmax(np.abs(x))) for x in (om, ho, hi))
  sf, sft = load_step(fine)
  sc_, sct = load_step(coarse)
  # Branch per sample: P pressed, B bridged, else s on the boundary μ = 0.
  branch = ''.join('P' if b > 0.99 else 'B' if b < 0.01 else '|' for b in br)
  comp = max(max(n['bp'] * n['bm'], (1 - n['s']) * n['bp'], n['s'] * n['bm']) for n in s[1:])
  mesh_ps = mesh_change(fine, coarse, 'psiS') * DEG
  r.update({
    'yaw': fine['yaw'], 'switchSkisStateOffFallDeg': 90 - fine['psiS0'] * DEG, 'skisYawSweepDeg': (math.pi - 2 * fine['psiS0']) * DEG,
    'omMax': float(abs(om[iw])), 'omMaxT': float(t[iw]), 'MhoPeakR': float(abs(ho[io])), 'MhoPeakT': float(t[io]), 'MhiPeakR': float(abs(hi[ii])), 'MhiPeakT': float(t[ii]),
    'branch': branch, 'bridgedT': [round(float(x), 4) for x, b in zip(t, br) if b < 0.01], 'boundaryT': [round(float(x), 4) for x, b in zip(t, br) if 0.01 <= b <= 0.99],
    'muMin': float(mu.min()), 'muMax': float(mu.max()), 'branchComp': comp,
    'fCeilBinds': r['activeBounds'].get('load<=F_CEIL_G', []), 'loadStepN80': sf, 'loadStepN80T': sft, 'loadStepN40': sc_, 'loadStepN40T': sct,
  })
  g = r['gates']
  g['4_mesh']['psiSDeg'] = mesh_ps
  g.pop('maxOmPOmM', None)
  g['branch_comp_le_tau'] = comp <= TAUS[-1] * (1 + 1e-6)
  g['no_spikes'] = {'omMax': r['omMax'], 'omMaxT': r['omMaxT'], 'MhoPeakR': r['MhoPeakR'], 'MhoPeakT': r['MhoPeakT'], 'MhiPeakR': r['MhiPeakR'], 'MhiPeakT': r['MhiPeakT']}
  g['no_load_step'] = {'shrinks': sf < sc_, 'ratio': sf / sc_, 'n80': sf, 'n80T': sft, 'n40': sc_, 'n40T': sct}
  return r


def identified_of(a, b):
  """Both starts (r4_cell results) agree on the switch headings within 2° and σ_out within 0.05 rad."""
  d = {'skisDeg': abs(a['switchSkisOffFallDeg'] - b['switchSkisOffFallDeg']), 'skisStateDeg': abs(a['switchSkisStateOffFallDeg'] - b['switchSkisStateOffFallDeg']),
       'massDeg': abs(a['switchMassOffFallDeg'] - b['switchMassOffFallDeg']), 'sigmaOut': abs(a['sigmaOut'] - b['sigmaOut'])}
  return {'ok': d['skisDeg'] <= 2 and d['skisStateDeg'] <= 2 and d['massDeg'] <= 2 and d['sigmaOut'] <= 0.05, **d}


def gates_r4(args):
  out = json.load(open(args.out)) if os.path.exists(args.out) else {}
  for name, fine_f, coarse_f in args.cell:
    out[name] = r4_cell(json.load(open(fine_f)), json.load(open(coarse_f)), 'reid' in name)
  for name in [k for k in out if not k.endswith('-carve') and k + '-carve' in out]:
    a, b = out[name], out[name + '-carve']
    for x in (a, b):
      x['gates']['identified'] = identified_of(a, b)
  for name in out:
    print(json.dumps({name: out[name]['gates']}, default=np_item))
  json.dump(out, open(args.out, 'w'), indent=1, default=np_item)


def np_item(o):
  return o.item()


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


# The baked sample keys and their node fields; psiS the skis' heading, gam the slip angle, om the skis' yaw rate off the carve, slip Π.
BAKE_KEYS = {'t': 't', 'lam': 'lam', 'lamDot': 'lamDot', 'h': 'h', 'hDot': 'hd', 'hDdot': 'hdd', 'eps': 'eps', 'epsDot': 'epsDot', 'p': 'p', 'pDot': 'pd',
             'psi': 'psi', 'v': 'v', 'kSki': 'kappa', 'load': 'load', 'share': 'share', 'psiS': 'psiS', 'gam': 'gam', 'om': 'om', 'slip': 'Pi'}
# Module constants the cycle reads besides the const file; the bake records their live values (src/physics/carve-bake.ts SOLVER_CONSTANTS mirrors them).
PY_CONSTS = ('GAM_REF', 'OM_DELTA', 'P_DELTA', 'TAUS', 'M_REF_OUT', 'M_REF_IN', 'SKI_MASS', 'BINDING_MASS', 'BOOT_MASS', 'FOOT', 'SHANK', 'BSL', 'SHIN',
             'STATURE', 'LEVA_STATURE', 'MOUNT', 'GAM_MAX', 'ABS_DELTA')
# The solve's start, recorded apart and never compared.
SEED_KEYS = ('lamPeak0', 'speedMps')


def bake_samples(sol):
  """samples_r1 as baked series: share the outside ski's; branch 1 pressed, 0 bridged, 0.5 on the boundary; pressed 1 unless bridged."""
  rows = samples_r1(sol)
  out = {k: [float(r[f]) for r in rows] for k, f in BAKE_KEYS.items()}
  out['branch'] = [1.0 if r['s'] > 0.99 else 0.0 if r['s'] < 0.01 else 0.5 for r in rows]
  out['pressed'] = [0 if b == 0 else 1 for b in out['branch']]
  # Pinned switch samples: λ 0, and 0 ≤ ε − λ with the mirror ε_T = −ε_0 force ε 0.
  for k in ('lam', 'eps'):
    out[k][0] = out[k][-1] = 0.0
  return out


def samples(args):
  sol = json.load(open(args.sol))
  cst = json.load(open(sol['args']['const']))
  json.dump({'file': os.path.basename(args.sol), 'cell': cst['cell'], 'T': sol['T'], 'lamPeak': sol['lamPeak'], 'samples': bake_samples(sol)}, open(args.out, 'w'))


def solver_read_keys(cst):
  """The const keys this file reads as c['…'], the seed apart."""
  read = set(re.findall(r"c\['(\w+)'\]", open(os.path.abspath(__file__)).read()))
  return sorted(k for k in cst if k in read and k not in SEED_KEYS)


def verdict(name, v):
  """A gates_r4 entry as {value, ok}; ok None where R4 set no threshold."""
  if isinstance(v, (bool, np.bool_)):
    ok = bool(v)
  elif name in ('mirrorRes', 'courseRes'):
    ok = all(abs(x) <= 1e-6 for x in v.values())
  elif name in ('epsMaxima', 'loadMaxima'):
    ok = len(v) == 1
  elif name == 'tauReached':
    ok = v == TAUS[-1]
  elif name == 'no_load_step':
    ok = bool(v['shrinks'])
  elif name == 'identified':
    ok = bool(v['ok'])
  else:
    ok = None
  return {'value': v, 'ok': ok}


def course_args(sol):
  a = sol['args']
  return a['const'], a['speed'], a['turn_l'], a['offset'], bool(a.get('free_d'))


def bake(args):
  """Writes the whole carve-cycles file from each cell's N and N/2 solves, the other start's pair and the TS restart replay; every cell baked with its verdicts."""
  cells = {}
  others = {o[0]: o[1:] for o in args.other or []}
  for name, fine_f, coarse_f, rep_f in args.cell:
    fine, coarse, rep = json.load(open(fine_f)), json.load(open(coarse_f)), json.load(open(rep_f))
    if course_args(fine) != course_args(coarse) or rep['file'] != os.path.basename(fine_f):
      sys.exit(f'{name}: solves or replay do not match')
    cst = json.load(open(fine['args']['const']))
    r = r4_cell(fine, coarse, False)
    gates = dict(r['gates'])
    if name in others:
      ob, obc = (json.load(open(f)) for f in others[name])
      if course_args(ob) != course_args(fine) or course_args(obc) != course_args(fine):
        sys.exit(f'{name}: the other start does not match')
      gates['identified'] = identified_of(r, r4_cell(ob, obc, False))
    mesh = mesh_change_lam(fine, coarse)
    rv = rep['maxDLamDeg']
    replay = {'value': rv, 'ok': rv is not None and math.isfinite(rv) and rv <= mesh}
    _, speed, turn_l, offset, free_d = course_args(fine)
    s = bake_samples(fine)
    cell = {
      'inputs': {'cell': cst['cell'], 'solver': {k: cst[k] for k in solver_read_keys(cst)},
                 'course': {'meanSpeedMps': speed, 'turnLM': turn_l, 'offsetM': offset, 'dSolved': free_d}, 'python': {k: globals()[k] for k in PY_CONSTS}},
      'seed': {k: cst[k] for k in SEED_KEYS},
      'switchSkisOffFallDeg': 90 - fine['psiS0'] * DEG, 'switchMassOffFallDeg': 90 - fine['psi0'] * DEG,
      'course': {'meanSpeedMps': fine['meanSpeed'], 'turnLM': fine['L'], 'dM': fine['D']},
      'periodS': fine['T'], 'speedMps': fine['v0'], 'lamPeak': fine['lamPeak'], 'defectDegS': fine['defectDegS'], 'nodes': fine['args']['N'],
      'meshChangeLamDeg': mesh,
      'startsAgreement': verdict('identified', gates['identified']) if 'identified' in gates else {'value': None, 'ok': None},
      'gates': {k: verdict(k, v) for k, v in gates.items()}, 'replay': replay, 'samples': s,
    }
    cells[name] = cell
    print(json.dumps({'cell': name, 'skisDeg': cell['switchSkisOffFallDeg'], 'massDeg': cell['switchMassOffFallDeg'], 'epsPeakDeg': r['epsPeakDeg'],
                      'loadPeak': max(s['load']), 'D': fine['D'], 'replay': replay, 'meshChangeLamDeg': mesh,
                      'failing': [k for k, g in cell['gates'].items() if g['ok'] is False]}, default=np_item))
  with open(args.out, 'w') as f:
    json.dump({'version': 2, 'cells': cells}, f, separators=(',', ':'), ensure_ascii=False, allow_nan=False, default=np_item)


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
  cy.add_argument('--free-d', action='store_true', help='D solved by the energy balance; --offset shapes the carve start only')
  cy.add_argument('--N', type=int, default=80)
  cy.add_argument('--delta-deg', type=float, default=1.0)
  cy.add_argument('--max-iter', type=int, default=3000)
  cy.add_argument('--tol', type=float, default=1e-9, help='IPOPT tol')
  cy.add_argument('--wall', type=float, default=1800, help='wall-clock cap for the whole fixed point, s')
  cy.add_argument('--peak-iters', type=int, default=25)
  cy.add_argument('--warm', help='start from a cycle solution JSON and its λ_peak')
  cy.add_argument('--peak-tol', type=float, default=1e-6, help='λ_peak fixed-point step, rad, when no --coarse is given')
  cy.add_argument('--coarse', help='the N/2 solve: λ_peak converged once its last-3-pass range is within the mesh change')
  gr = sp.add_parser('gates_r2', help='R2 gates and summary from N and N/2 solves; merges into OUT')
  gr.add_argument('out')
  gr.add_argument('--cell', nargs=3, action='append', required=True, metavar=('NAME', 'SOL_N', 'SOL_HALF_N'))
  g3 = sp.add_parser('gates_r3', help='R3 gates and summary from N and N/2 solves; a NAME with "reid" adds the measured gates')
  g3.add_argument('out')
  g3.add_argument('--cell', nargs=3, action='append', required=True, metavar=('NAME', 'SOL_N', 'SOL_HALF_N'))
  g4 = sp.add_parser('gates_r4', help='R4 gates: R3 gates plus identified starts, spikes, load steps, branches')
  g4.add_argument('out')
  g4.add_argument('--cell', nargs=3, action='append', required=True, metavar=('NAME', 'SOL_N', 'SOL_HALF_N'))
  lp = sp.add_parser('link', help='both starts linked and agreeing, each against its N/2 solve')
  for k in ('a', 'a_half', 'b', 'b_half'):
    lp.add_argument(k)
  sa = sp.add_parser('samples', help="a solve's baked samples, for scripts/solve/replay.ts")
  sa.add_argument('sol')
  sa.add_argument('out')
  bk = sp.add_parser('bake', help='src/physics/carve-cycles.json from the solves, each cell with its R4 gates and replay verdicts')
  bk.add_argument('out')
  bk.add_argument('--cell', nargs=4, action='append', required=True, metavar=('NAME', 'SOL_N', 'SOL_HALF_N', 'REPLAY'))
  bk.add_argument('--other', nargs=3, action='append', metavar=('NAME', 'SOL_N', 'SOL_HALF_N'), help="the other start's solves, for identified")
  args = ap.parse_args()
  {'port': port, 'cycle': cycle, 'gates_r2': gates_r2, 'gates_r3': gates_r3, 'gates_r4': gates_r4, 'link': link, 'samples': samples, 'bake': bake}[args.cmd](args)


if __name__ == '__main__':
  sys.exit(main())
