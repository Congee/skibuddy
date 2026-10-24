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
        ('m', 'm = ε − λ, deg', DEG), ('MoutR', 'M_out / 0.17 Nm/kg (solid), M_in / 0.23 (dash-dot)', 1), ('psi', 'ψ heading, deg', DEG), ('v', 'v, m/s', 1),
        ('h', 'h, m', 1)]
COLORS = {'gentle': '#2a7fd4', 'moderate': '#d4312a', 'dynamic': '#1f9e54'}


def measured(kind, lit):
  """{row: [(label, plot kwargs, x, y, yerr|None)]}, each at its own conditions."""
  g = 'grey'
  out = {}
  if kind == 'reid':
    e = lit['slalom']['edge_angle']['10m']
    # reid-2010 10 m course, mean ± SD (n 6): GRF p245, CoM speed Table G.1, attack reid-2020; a 6th item is the x SD.
    return {'eps': [(f"reid-2010 SL 10 m ({e['source']}); peak 65.7 ± 1.7", '-', e['t'], e['v'], None)],
            'lam': [('reid-2010 10 m: peak 49.9 ± 1.0 just before the gate', 'o', [0.54], [49.9], [1.0])],
            'gam': [('reid-2020 10 m attack: 3.1 ± 2.4 switch, peak 15.1 ± 5.3 at t 0.2-0.3', 'o', [0.0, 0.25], [3.1, 15.1], [2.4, 5.3], [0, 0.05]),
                    ('< 4 after the gate', 'cap', [0.54, 1.0], [4, 4], None)],
            'load': [('reid-2010 GRF max 3.35 ± 0.20 at 50.9 ± 5.9 %, min 0.17 ± 0.06 at 0.8 ± 6.3 %', 'o', [0.509, 0.008], [3.35, 0.17], [0.20, 0.06], [0.059, 0.063])],
            'v': [('reid-2010 Table G.1: max 12.62 ± 0.24 at 32.9 ± 3.5 %, min 11.74 ± 0.36 at 73.3 ± 3.7 %', 'o', [0.329, 0.733], [12.62, 11.74], [0.24, 0.36], [0.035, 0.037]),
                  ('Table G.1: turn start, gate passage, turn end', 's', [0.0, 0.54, 1.0], [11.91, 12.06, 12.13], [0.27, 0.34, 0.36]),
                  ('mean 12.12 ± 0.29 (held)', 'cap', [0, 1], [12.12, 12.12], None)]}
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
  fig, axs = plt.subplots(len(ROWS), 1, figsize=(8, 21), sharex=True)
  meas = measured(kind, lit)
  pre, cols = ('sl', {'reid': '#7b3fc4'}) if kind == 'reid' else (kind, COLORS)
  for inten, col in cols.items():
    # Solid: R2 warm start; dotted: carve start.
    for tag, ls, lw in (('', '-', 1.6), ('-carve', ':', 1.2)):
      f = os.path.join(d, f'sol-{pre}-{inten}{tag}-n80.json')
      if not os.path.exists(f):
        continue
      sol = json.load(open(f))
      ns = [sol['nodes'][0]] + [n for n in sol['nodes'] if 'hddd' in n]
      t = np.array([n['t'] for n in ns]) / sol['T']
      lab_ = f"{inten}{' carve start' if tag else ''} ({sol['status']}, τ {sol.get('tauReached')}, T {sol['T']:.2f} s, D {sol['D']:.2f} m)"
      for ax, (k, lab, sc) in zip(axs, ROWS):
        ax.plot(t, np.array([n.get(k, np.nan) for n in ns]) * sc, color=col, ls=ls, lw=lw, label=lab_)
        if k == 'MoutR':
          ax.plot(t, np.array([n.get('MinR', np.nan) for n in ns]), color=col, ls='-.', lw=lw * 0.8)
  for ax, (k, lab, _) in zip(axs, ROWS):
    for label, ls, x, y, err, *xerr in meas.get(k, []):
      if ls in ('-', '--'):
        ax.plot(x, y, color='grey', ls=ls, lw=1.2, label=label)
        if err is not None:
          ax.fill_between(x, err[0], err[1], color='grey', alpha=0.2, lw=0)
      elif ls == 'cap':
        ax.plot(x, y, color='grey', ls=(0, (2, 2)), lw=1, label=label)
      else:
        ax.errorbar(x, y, yerr=err, xerr=xerr[0] if xerr else None, fmt=ls, color='grey', ms=4, capsize=3, label=label)
    ax.set_ylabel(lab)
    ax.grid(alpha=0.3)
    ax.legend(fontsize=6, loc='best')
  axs[-1].set_xlabel('t / T (switch to switch)')
  name = {'sl': 'SL, Laser SL 165 on 19°, L 9.80 m, D solved', 'gs': 'GS, Racetiger 173 on 18°, L 25.15 m, D solved',
          'reid': "Reid's point: SL, Laser SL 165 on 19°, his 10 m course 9.89 × 2.06 m (L 9.673, D 2.06 held), 12.12 m/s"}[kind]
  fig.suptitle(f'{name}\ngrey: measured at its own conditions, not a target', fontsize=10)
  fig.tight_layout()
  fig.savefig(png, dpi=110)


if __name__ == '__main__':
  sys.exit(main())
