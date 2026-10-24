# /// script
# requires-python = ">=3.11,<3.13"
# dependencies = ["numpy==2.1.3", "matplotlib==3.9.2"]
# ///
"""Curves of the R1 carve-cycle solves over t/T, one line per intensity, with the measured curves in grey.
  carve_plot.py KIND DIR OUT.png     reads DIR/sol-KIND-<intensity>-n80.json
"""
import json
import math
import os
import sys

import matplotlib

matplotlib.use('Agg')
import matplotlib.pyplot as plt
import numpy as np

LIT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'prior', 'lit-curves.json')
DEG = 180 / math.pi
ROWS = [('eps', 'ε edge, deg', DEG), ('lam', 'λ lean, deg', DEG), ('load', 'load, g', 1), ('gam', 'γ attack, deg', DEG), ('om', 'ω yaw off the carve, rad/s', 1),
        ('m', 'm = ε − λ, deg', DEG), ('psi', 'ψ heading, deg', DEG), ('v', 'v, m/s', 1), ('h', 'h, m', 1)]
COLORS = {'gentle': '#2a7fd4', 'moderate': '#d4312a', 'dynamic': '#1f9e54'}


def measured(kind, lit):
  """{row: [(label, plot kwargs, x, y, yerr|None)]}, each at its own conditions."""
  g = 'grey'
  out = {}
  if kind == 'sl':
    s = lit['slalom']
    for course, ls in (('10m', '-'), ('13m', '--')):
      e = s['edge_angle'][course]
      out.setdefault('eps', []).append((f"reid-2010 SL {course} course ({e['source']})", ls, e['t'], e['v'], None))
    out['lam'] = [('reid-2010 SL 10 m: peak 49.9 ± 1.0 just before the gate (t 0.54)', 'o', [0.54], [49.9], [1.0])]
    out['load'] = [('reid-2010 SL GRF max 3.35 (10 m) / 3.53 (13 m) BW', 'o', [0.51, 0.67], [3.35, 3.53], None)]
    out['gam'] = [('reid-2010 SL 10 m skid: 3.1 ± 2.4 at switch, 15.1 ± 5.3 at t 0.2-0.3', 'o', [0.0, 0.25], [3.1, 15.1], [2.4, 5.3])]
  else:
    s = lit['gs_carving']
    for key, row in (('edge_angle', 'eps'), ('skid_angle', 'gam')):
      e = s[key]
      out[row] = [(f"sporri-2016 GS 26°, FIS skis ({e['source']})", '-', e['t'], e['mean'], np.array(e['range']))]
  return out


def main():
  kind, d, png = sys.argv[1:4]
  lit = json.load(open(LIT))
  fig, axs = plt.subplots(len(ROWS), 1, figsize=(8, 19), sharex=True)
  meas = measured(kind, lit)
  for inten, col in COLORS.items():
    # Solid: R1 warm start; dotted: carve start.
    for tag, ls, lw in (('', '-', 1.6), ('-carve', ':', 1.2)):
      f = os.path.join(d, f'sol-{kind}-{inten}{tag}-n80.json')
      if not os.path.exists(f):
        continue
      sol = json.load(open(f))
      ns = [sol['nodes'][0]] + [n for n in sol['nodes'] if 'hddd' in n]
      t = np.array([n['t'] for n in ns]) / sol['T']
      lab_ = f"{inten}{' carve start' if tag else ''} ({sol['status']}, τ {sol.get('tauReached')}, T {sol['T']:.2f} s)"
      for ax, (k, lab, sc) in zip(axs, ROWS):
        ax.plot(t, np.array([n.get(k, np.nan) for n in ns]) * sc, color=col, ls=ls, lw=lw, label=lab_)
  for ax, (k, lab, _) in zip(axs, ROWS):
    for label, ls, x, y, err in meas.get(k, []):
      if ls in ('-', '--'):
        ax.plot(x, y, color='grey', ls=ls, lw=1.2, label=label)
        if err is not None:
          ax.fill_between(x, err[0], err[1], color='grey', alpha=0.2, lw=0)
      else:
        ax.errorbar(x, y, yerr=err, fmt='o', color='grey', ms=4, capsize=3, label=label)
    ax.set_ylabel(lab)
    ax.grid(alpha=0.3)
    ax.legend(fontsize=6, loc='best')
  axs[-1].set_xlabel('t / T (switch to switch)')
  name = {'sl': 'SL, Laser SL 165 on 19°, course 10 m × 2 m', 'gs': 'GS, Racetiger 173 on 18°, course 26.24 m × 7.47 m'}[kind]
  fig.suptitle(f'{name}\ngrey: measured at its own conditions, not a target', fontsize=10)
  fig.tight_layout()
  fig.savefig(png, dpi=110)


if __name__ == '__main__':
  sys.exit(main())
