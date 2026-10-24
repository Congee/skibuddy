# Motion model

Spec of how skibuddy derives the figure's motion and effort from the skiing parameters (§3).
Source of truth for the pipeline; the research base is `docs/research/biomechanics.md` (foundations F1–F12, pose
guide 2.0, drills D1–D19). Written 2026-10-21 on the `pipeline` branch.

Every number carries a status: **measured** (source and where), **range-only** (the source gives a range, we pick
inside it), **inferred** (ours, to be replaced when measured). A number without a status is a bug.

Order of derivation (biomechanics.md 0.3): task → forces → kinematics → kinetics → muscles → effort. Video supplies
amounts and timing for kinematic quantities the physics leaves free; it never sets the physics. A pose the model
cannot make is a capture error, not a model input.

## 1. Product need

For a point of the parameters (§3) the figure shows one turn cycle (left turn then right turn, mirrored):

- joint coordinates `q` on the ISB skeleton per frame (48 baked, 96 solved) → the pose;
- joint moments (quasi-static) → per-muscle effort 0–3 per phase, continuous encoding on the figure, steady order
  in the list;
- physics numbers on request: speed, radius, lean, edge angle, load, counter, inside lead, fore-aft.

The kinds **GS**, **SL**, **Steered** and **Moguls** (user's classification, 2026-10-21), the intensities Gentle,
Moderate and Dynamic, and the styles are presets (user, 2026-10-21 and 2026-10-23): named points of the continuous
parameters of §3, for the menu and the labels. The figure is a function of the parameters only. Nothing in the
physics, the solve, the gates, the priors or the effort reads a preset's name, and between two presets every output
moves continuously. GS and SL are carved turns (skid share 0) at the long and the short end of what the ski carves,
Steered are skidded turns (skid share above 0) of any size, Moguls the same turns on bumps (bump height above 0).
Drills (D1–D19) come second: each is a preset with one job changed (`TurnDrill` in `src/physics/turn.ts`, e.g. stork
lifts the inside ski).

## 2. Inputs

| Input | Where | Status |
|---|---|---|
| Skier: 1.68 m, 66 kg, BSL 0.295 m, de Leva segment masses | `src/viewer/skier.ts` `REFERENCE_SKIER`, `src/viewer/motion/turn.ts` `MASS`/`CM_SHARE` | measured |
| Boot: forward lean 15°, board ramp 3°, binding delta, stand height; cuff flex range 15° (demsar-2015) | `src/viewer/equipment.ts` | measured |
| Ski: length, sidecut radius `R_sc` | `src/viewer/skier.ts` `CARVING_SKIS` for the carved kinds: SL Stöckli Laser SL 165 cm (R_sc 13.6 m, 120-66-98 mm), GS Völkl Racetiger GS 2026 173 cm (R_sc 16.4 m, 115-67-98 mm), maker specs; `skiFor(terrain)` for the rest: Groomed SL R 12.9 m, Moguls R 19.9 m. Any ski carves given the right combination of speed, slope, snow and edge (§4.2); the ski only shifts which combinations | measured geometry |
| Snow: compliance `c` (the edge's sink under load, `d = c F`), grip limit | `SNOW_COMPLIANCE` hard groomed 8e-7 m/N (inside federolf-2005 Table 4 and moessner-2013's race piste, 6e-7–1.0e-6) | range-only; inferred default |
| Presets: kind, intensity, style, mogul line | named points of §3: `TASKS` in `src/physics/task.ts`, `Intensity` in `src/content/schema.ts`, `MogulLine` in `src/viewer/surface.ts`; labels only | — |
| Parameters: terrain, snow, motion, style | §3 | per parameter |
| Joint limits and boot-coupled ankle range | `src/viewer/joint-limits.ts` | measured where cited |

## 3. Parameters and presets

The figure is a function of continuous parameters `p`: one physics (§4), one solve (§5), one effort (§6) and the
same gates (§8) at every point. Kinds, intensities and styles are presets, named points of `p` (§1); only they are
discrete.

| Group | Parameter | Range swept | Status |
|---|---|---|---|
| Terrain | slope pitch θ | 5–30° | inferred range |
| | bump height h; h 0 is groomed snow; the spacing follows the turns that cut the field (motion rows) | h 0–0.6 m (kurpiers-2020: about 0.5 m at 4 m spacing) | measured where cited |
| Snow | compliance c (the edge sinks `d = c F` under the outside ski's load F; d → 0 is Howe's radius), gliding friction μ, grip limit | c 6e-7–1.0e-6 m/N hard groomed, default 8e-7 (soft snow 4.4e-6); μ 0.04 gliding, 0.064 on edge | range-only; inferred |
| Skier, gear | body; ski length and sidecut radius R_sc; boot | §2 | measured |
| Motion | mean speed v | 3–15 m/s | inferred range |
| | turn size: the fall-line distance per turn L, one coordinate for every turn; the solve gives the duration, the sweep and the skis' radius (carved: `carvedRadius` of ε and d, §4.2); on bumps the field's spacing follows the line, s = L / turns per bump (one on the zipper), so h → 0 is a limit at fixed L | L 3–30 m | inferred range |
| | arc peak: where in the turn the skis' curvature peaks, a share of the turn | 0.4–0.7 | a free amount (below); sporri-2016's GS edge peaks just after the fall line; else inferred |
| | skid share σ: the part of the direction change the skis make by slipping sideways; 0 carved | 0–1 | — |
| Style | transition phase, angulation split, counter habit, stance width, movement range, arms and plant time, line on bumps | §7 | §7 |

Intensity is not a parameter of its own. How hard the physics is follows from v, L, θ, σ and h, through the lean,
load and edge they give. How much the body moves is the movement range (§7). Gentle, Moderate and Dynamic are presets
of both.

**Arc peak is a free amount.** The physics leaves open where in the turn the skier steers hardest. A preset's arc peak
may be read once from a measured force-peak time at that source's own conditions, after checking the source's turn
definition (edge change to edge change, or gate to gate). It is never bent to hit a number at another point. Gravity
puts the load peak after the fall line at every arc peak (§4.1).

**Snow depth.** Penetration depth d is a snow parameter; groomed snow is the d → 0 limit. The viewer reads it from
the task; today's powder depth, keyed by intensity, goes in the terrain lane. Its physics (drag, support) stays open
(§10).

**Amounts, not curves** (user, 2026-10-23). Every parameter is one number for the whole cycle, a slider's value.
No input is a per-frame curve: every joint's timing comes from the physics profile, the switch, the lean and load
over the turn, the events (§4.7) and the terrain under the skis. A style amount says how much or how the body does
a job; the physics says when. What the physics fixes at a point is an output, not a slider: at a given speed, turn
size, pitch and σ the lean, the edge and so the total angulation are solved (§4.1, §4.2), and a style amount only
chooses how the joints make them (§7).

**Solved, never chosen.** From `p` the physics gives the skis' path and the mass path, the lean λ and the load
(§4.1, §4.4), the speed along the cycle and the turn's sweep from the energy balance (§4.3), the edge ε = λ + m with
the margin from σ (§4.2), the skis' heading and attack, the pelvis heading and the counter (§4.5), fore-aft and the
inside leg (§4.6), the events (§4.7) and the skis' contact and bend (§4.8); then the pose (§5) and the effort (§6).
The pitch belongs to the terrain. A skier answers a steeper pitch at the same speed by finishing each turn further
across the hill or by skidding more, so the energy balance solves the sweep at the given σ (§4.3 rule 4). A point
where nothing closes is outside the skiable space, not a preset to tune.

**Presets** carry parameters only, in `TASKS` (`src/physics/task.ts`) with their status. They are picks inside these
anchors, all inferred. The turn size is quoted as the 2026-10-21 cells set it; `TASKS` stores the L each solves to:

| Preset | v m/s, gentle / moderate / dynamic | turn size | θ ° | σ | h | Anchors |
|---|---|---|---|---|---|---|
| GS | 9 / 11 / 13 (course mean) | L 25.15 m, D solved (7.47 m seed); M 5 / 10 / 15° on the Racetiger 173 | 18 | 0 | 0 | gilgien-2015 World Cup GS terrain and course medians |
| SL | 8 / 9.5 / 11 (course mean) | L 9.80 m, D solved (2 m seed); M 5 / 10 / 15° on the Laser SL 165 | 19 | 0 | 0 | FIS SL 18–24° (fis-icr-alpine-2026 §802.1.1), reid-2010 10 m × 2 m course |
| Steered | 5–7 / 6–8 / 6–8 | r 12–20 / 8–12 / 6–8 m | 10–15 / 15–20 / 22–30 | above 0 | 0 | nakazato-2011, nakazato-2016, bon-2021 (recreational, measured) |
| Moguls | 4–6 / 6–8 / 9–10 | s 3.5–4 m | 15–20 / 20–25 / 25–28 | above 0 | above 0 | FIS pace 9.0–10.3 m/s on 25–28° courses is the ceiling |

The carved rows (2026-10-24) are `task.ts`'s six race cells: slope and course from the sources named, the mean speeds
inferred. The whole-turn solve (`scripts/solve/carve_cycle.py`, baked by `bun run bake:carve`) solves D, the switch
headings and the edge; `src/physics/carve-cycles.json` holds each cell with its gate verdicts.

Measured curves and bands (sporri-2016's GS edge and fore-aft curves, reid-2020's SL edge curve,
falda-buscaiot-2017's phases, kroll-2015, reid-2010, nakazato-2011 and bon-2021 loads and force-peak times,
heinrich-2022's joint ranges and moments, D12 and D13's counter) are measurements at their own points of `p`. They
check the model there within their uncertainty (§8); none is copied to another point as an input.

**Checks at measured points.** A point whose source did not record a condition (speed, pitch, turn size) is an
existence check over that condition's plausible range, written beside the check: the model must land within the
measurement's uncertainty for some value in the range. It is never a fit. Every check runs on the source's own ski
and sidecut, not the reference skier's. The speed sweep runs 3 to 15 m/s, so heinrich-2022 (13.5–14.5 m/s) and
heinrich-2023 (about 12 m/s) are inside it.

**Tests are sweeps.** Each parameter is swept across its range with the others at a preset. The solve stays
feasible or leaves the skiable space at a boundary the test names. Outputs are continuous: no jump between
neighbouring points, and σ → 0 and h → 0 are limits, not branches. The physics' signs hold: faster at the same
radius, more lean and load; steeper at the same speed, a wider sweep or more skid; more skid, less margin and more
counter; quicker turns, a straighter mass path; higher bumps, a wider flexion range. The measured points pass within
their uncertainty. No test asserts a preset's value.

Worked points (§4.1 with the mass on the skis' arc; λ / load in BW at the top, the fall line and the finish):

- v 9, r 13, θ 17°: 19.7°/1.02, 33.6°/1.15, 41.4°/1.27;
- v 7, r 6.5, θ 17°: 26.5°/1.07, 38.8°/1.23, 45.6°/1.37;
- carved, v 8, r 7.8 m, θ 17°: 29.9°/1.10, 41.3°/1.27, 47.6°/1.42; carved, v 6, r 9.5 m, θ 12°: 10.3°, 21.6°, 28.6°
  (what edge a given ski needs for r is §4.2's radius, not this block's; these two were computed before the
  penetration radius and their margins are dropped);
- v 7 on bumps, mass radius 20 m, θ 23°: −8.7°/0.93, 15.2°/0.95, 29.7°/1.06. The skis' own 5 m arc would need 47.3°
  at the fall line; the mass runs straighter than the skis and the legs make the difference as edge (§4.4).

## 4. Physics per phase

Frames: slope frame `x` across the hill toward the turn's inside, `y` up the slope normal, `z` down the fall line
(`src/viewer/motion/turn.ts`). Heading β: 0 across the hill at the top of the turn, π/2 at the fall line, π at the
end; the cycle ends at `FINISH_HEADING` 3π/4 and switches.

### 4.1 Balance-axis lean and load (F1, lind-sanders-2004 eq 4.9)

In the skier's frame the snow force lies along the balance axis from the pressure centre through the mass:

```
f(t)   = v² / (g r_mass(t)) − sin θ · cos β(t)        lateral demand, BW
tan λ  = f / cos θ                                      balance-axis lean from the slope normal
load   = hypot(f, cos θ)                                total snow force, BW
```

Gravity helps above the fall line and loads below it, so the peak sits after the fall line (falda-buscaiot-2017:
outside-foot force 218 % / 279 % / 187 % of initiation through the four phases taking 21 / 33 / 32 / 14 % of the
turn). `src/physics/turn.ts` `forcesAt` implements this line for line. Status: the equation is measured physics; the
phase shares are measured for GS and inferred for the other kinds until their force curves are read.

### 4.2 Edge angle: the ski holds only above the lean

The edge angle ε is what the ski's base makes with the snow. The ski holds its arc only when the snow force can be
carried normal to the base, i.e. `ε ≥ λ` (the mass sits inside the edge, F2.7, F10.2). The excess `ε − λ` is the
**edge margin**, which the legs make by angulation while the trunk stays nearer the slope normal:

```
ε(t) = λ(t) + m(t),   0 ≤ m(t) ≤ A_max(style)
A_max = hip abduction 3–27° (outside, heinrich-2022 Table 1) + lumbar lateral 0–5° (heinrich-2022) or trunk
        lateral 11–15° (sporri-2015/2016) + knee frontal "small" (F2.3)   → about 20–35°, range-only
```

**One rule for the margin.** The skid share decides whether the ski holds or slips. At σ 0 the ski carves: it does
not slip sideways, m ≥ 0, and the sidecut and the edge's sink set its radius (Howe with penetration,
federolf-2005 eq 91, kaps-2001 eq 4; `carvedRadius`, `src/physics/edge.ts`):

```
r_ski = L² / (8 (D / cos ε + d sin ε))     L² = 8 D R_sc,  D = (W_tip + W_tail − 2 W_waist) / 4
d     = c · F                              F = outside ski's load, N: load · 66 kg · g · outside share
```

`d` 0 is Howe's `R_sc cos ε`. c is `SNOW_COMPLIANCE` (hard groomed 8e-7 m/N: inside federolf-2005 Table 4's hard snow
and moessner-2013's race piste at 6e-7–1.0e-6, inferred; soft snow 4.4e-6 fitted to federolf-2005 Table 7). So the
radius shrinks with the load, which the old constant k could not: a 40° edge on the Laser SL with F 900 N sinks 0.7 mm
and gives 10.2 m against Howe's 10.4 m. reid-2020 measures a hard-snow path radius that Howe's `R_sc cos ε` matches
within 2.5 to 6.4 m RMSE above 45° of edge (path, partly skidding: 42–72 m RMSE below); thorwartl-2023 measures the
ski's local bend, not the path. Above `SOFT_LEVEL_EDGE_DEG` 55° federolf-2005's soft-snow radius levels near 0.5 R_sc
and `carvedRadius` does not (flagged). The model draws the bent edge's radius; a carving path is somewhat wider
(inferred, research notes).

The outside ski's share of F is `CARVE_OUTSIDE_SHARE` 0.68, measured band 0.62–0.72 with no intensity trend
(nakazato-2011 Table 1 0.65–0.70, falda-buscaiot-2017 0.63, kroll-2015 SL 0.56 and GS 0.66, ogrin-2021 0.60–0.65,
lamontagne-2001 about 0.62, thorwartl-2023 0.68; insole bias is about equal on both feet). The weight split in the
solve follows the physics lean through `carveOutsideShare`; carved presets have no skid (`skidShare` 0). A slipping ski
moves at an attack γ between its axis and its travel and sits at the slip threshold, m ≈ 0, which the grip limit
sets; its direction comes from γ and the legs' rotation, not the sidecut. Between, m falls continuously from the
carved floor toward the threshold as σ rises (the form is inferred until measured). σ has a floor from the physics:
where the sidecut cannot make the turn's radius at an edge the lean allows (§4.3 rule 1), the skis must slip.

Any ski carves given the right speed, slope, snow and edge; `R_sc` and c only shift which points carve (a
longer-radius ski carves the same edge at a higher speed on a wider arc). Softer snow raises c and so shrinks the
radius at a load; ice lowers the grip limit. The edge's time course is the lean's plus the margin's: it builds from the switch, peaks after the
fall line and releases at the finish because λ does. sporri-2016's GS curve (digitised in
`scripts/prior/lit-curves.json`) and reid-2020's SL curve check it at their points. Bumps add the normal term
`a_n ≈ v² κ_bump` to the load (§4.1), and the legs make the difference between the skis' arc and the mass path as
edge (F1.5, lind-sanders-2004 pp114-115).

### 4.3 The skiable space

A point is skiable when these hold. Outside them it has no figure and the sweeps stop at the boundary. A preset that
fails is a wrong pick, not a reason to bend the physics.

1. Carving needs the edge the turn's radius asks of the ski (§4.2's `carvedRadius` solved for ε), at or above the lean over the
   whole loaded phase, its minimum reported with its time; where it is lower, σ rises above 0 (§4.2).
2. `ε ≤ λ + A_max`: the legs cannot make more margin than the angulation range.
3. The snow carries the lateral force at the edge: the grip limit (range-only; hard groomed default, ice lower).
4. The speed is steady over the cycle: gravity's work along the mass path equals gliding friction (μ per snow), the
   skid's dissipation `f · v · tan γ`, air drag (carved: `solveCarved` uses the edge friction 0.064, kaps-1996, and
   CdA 0.529 m², wolfsperger-2021, over the reference skier's 66 kg; steered and bumps keep the snow's gliding
   constant and `DRAG_PER_V2`), and the legs' negative work absorbing the terrain (craenen-2022:
   mogul skiing as negative leg work; 0 on even snow, rising with h). The balance solves the mass heading's half
   sweep at the given σ, up to straight across the hill, or the line's corridor on bumps; where the sweep is at that
   bound, the skid rises above σ. A point that closes with neither is too fast for its pitch and snow.
5. The legs reach: the absorption over the terrain fits the skeleton's reach with both skis on the snow (P3).
6. The pose stays inside the joint limits and the effort inside the capacities (§6).

Carved boundary (hard groomed, full semicircle, pure carve): the speed holds only on slopes of about 7–10°, which is
where the carved presets sit. Below it the speed runs out before the switch (the `Stall` boundary: `v` under 0.05 m/s
or 60 s without reaching the switch, i.e. the turn cannot finish straight across); above it no balance root exists
at the speed it gains (`TooFastToCarve`: too fast for this ski at this angulation). Both are reported, not tuned away.

The load is no rule. It is what the physics gives at the point, checked against the measured loads at theirs (§8).
The old per-kind caps (steered λ ≤ 40° at the fall line, a load band per kind, the racing ceilings) were checks
dressed as rules; the grip limit, the capacities and the measured points replace them.

### 4.4 The mass path (the loop in the chain)

One relation at every point: the balance. The snow pushes on the skis' pressure centre along the balance axis
through the mass, so square to the travel the skis run outside the mass by `h_m sin λ`, with h_m the mass's height
over the pressure centre along that axis. In periodic small-angle form, `x_ski = x_mass − h_m ẍ_mass / (g cos θ +
z̈_mass)` (the linear inverted pendulum): at the cycle's rate ω = π / T the mass swings the skis' amount divided by
`1 + h_m ω² / g` (F1.5, lind-sanders-2004). In slow, long turns the two paths nearly coincide; in quick turns the mass
runs much straighter than the skis (short swings, moguls). One relation, continuous in T.

The skis' path comes from the inputs: the sidecut at the edge when carved, the turn size and arc peak when skidded,
the line on bumps. The mass path, λ, the load and the edge follow at the loop's fixed point. At the switch the skis
are flat and hold nothing across, f(0) = 0, so the mass path already bends toward the fall line at the gravity radius
`v² / (g sin θ cos β)` (V). The transition phase (§7) changes h_m(t) and so the relation, not the path's shape.

The arc share `w(t)` on groomed snow (`ARC_SHARE`, `ARC_PEAK_T`, inferred) and the pendulum on bumps (P2, which
replaced `MOGUL_COM` 4) were two models of this one relation; R2 replaces both with it.

### 4.5 Steering (F4)

- Carving: the ski's geometry yaws the ski; the outside hip's rotators brake the pelvis against the ski's yaw
  (eccentric/isometric, F4.4). Hip rotation stays inside heinrich-2022's 5–28° IR outside / 10–26° ER inside.
- Skidded: the hip rotators turn the femur, the ski follows against the snow; the reaction turns the pelvis unless
  the obliques (and the pole plant in short turns) hold it. That is why counter and the plant exist.
- Counter is an output, `pelvis yaw − outside ski yaw`, from one mechanism at every point. The pelvis and trunk
  carry the body's angular momentum and face the mass heading, offset by the style's counter habit (§7); the legs
  turn the skis under them, and the skis head along their own path plus the attack γ. So the counter's centre, in
  §4.1's heading β, is the skis' heading minus the mass heading plus the counter habit. Positive is the pelvis facing
  the turn's outside more than the skis, the same meaning as `pelvis yaw − outside ski yaw`. It grows by itself where
  the mass runs straighter than the skis (quick turns, §4.4) and where the skis slip (γ), and stays small in slow
  carved turns; no pelvis share per kind (K1c's per-cell share in §10 is legacy). That the pelvis faces the mass
  heading is the inferred part (the trunk's inertia over the turn).
  D12's 25–40° in short swings and D13's 5–10° in GS check it at their points. Bounds: the outside hip's rotation
  (heinrich-2022's 5–28° IR outside and 10–26° ER inside at its GS points; the flexed hip's ER at 45°, inferred).
- The skis' heading is one series at every point, the travel of the skis' path plus γ (`skiHeadingAt`); `pathAt` in
  `src/viewer/surface.ts`, the counter and the gate read it.
- The solver holds a band about this prediction as a hard inequality while loaded (like the edge band), not as a weak goal; one function
  (`counterOf` / `pelvisToFallOf` in `src/viewer/motion/turn.ts`) defines the counter for the solver, the report and
  the gate: the pelvis's axial rotation in a Grood–Suntay joint coordinate system (`axialRotationOf`), e1 the
  reference's lateral axis, e3 the pelvis's long axis, e2 = e1 × e3 floating, the angle about e3 from e2 to the
  pelvis's anterior axis. The reference is the outside ski's frame with the snow normal as its long axis (its lateral
  axis normal × ski heading), or for `pelvisToFallOf` the fall-line frame. Pitch and roll read 0; the old yaw of the
  projected anterior axis read ~12° with none (pitch 30°, roll 22°). sporri-2016 measures trunk torsion the same way
  (sacrum vs sternum). B's solve with a soft counter (σ 10°) left every steered cell outside the band by 3–10°.

### 4.6 Fore-aft (F3) and the inside leg (F6)

- Fore-aft is the mass's position along the ski, from the balance: the mass sits over the pressure centre on the
  resultant (§4.1), moved by the along-track acceleration of the speed cycle and the terrain (a bump face slows the
  feet, so the mass moves forward to stay over them). Ankle dorsiflexion leads it, knee and hip flexion follow; the
  cuff bounds the shin (`CUFF_FLEX_RANGE`). sporri-2016's GS dFore/Aft curve (digitised) checks it at its point.
- The inside leg folds by the inside foot's rise, `hip width · sin λ / cos ε` from the point's own lean and edge (L).
  heinrich-2022's inside knee 81–114° against the outside's 56–80° checks it at its GS points; heinrich-2023's inside
  curve, measured near a 54° lean, is a ceiling, not a target.
- Inside-ski lead is a forward-kinematics output of the whole chain (pelvis list and yaw, stance width, inside ankle
  share), never a target or a prior.
- Stance width is a style value (§7).

### 4.7 Phase events

Phases are events read off the physics profile, one definition at every point. The solver samples the cycle
uniformly; events mark where effort is reported and where priors register (`phaseAt`, a monotone map from a point's
events onto the canonical anchors).

| Event | Definition |
|---|---|
| Switch | t 0, the mirror: the lateral demand and the edge pass through 0 (f(0) = 0) |
| Engagement | the lateral demand f first reaches half its cycle peak (threshold inferred) |
| Fall line | the mass heading β = π/2 |
| Force peak | the load's maximum |
| Release | f falls back below half its peak after the force peak (threshold inferred) |

The force-peak time is an output. Its measurements check it at their own points: GS 0.68 of the turn (kroll-2015)
and falda-buscaiot-2017's 21 / 33 / 32 / 14 % phases, SL 0.51 (reid-2010), recreational medium turns 0.4–0.6
(nakazato-2011 Fig 6), short swings 0.63–0.75 (bon-2021, unverified). The per-kind `FORCE_PEAK` windows,
`ARC_PEAK_T` and `PHASE_T` go (R1, R2); the legacy adapter still maps the events to the four phase names for the
content layer. At the switch the edge and the lean pass 0 at slightly different times (the edge leads into a turn
and releases before the mass crosses), so the solver holds the margin band only while loaded.

### 4.8 Ski contact and bend (module M)

The ski is pressed onto the snow at one point and bends under the load; it is not a plank tangent at its centre.
Today the solver holds the stance centre (the midpoint of the two ski centres, B3) on the path point, the outside
ski's long axis tangent to the snow, a tip or tail edge point on the snow and every base point at or above the
surface: exact on flat snow (the sidecut lifts the waist, tip and
tail carry the edge, the pressure centre `along` the ski sits up to 20 mm in the air at 45° of edge), impossible on
a bump (B: along the zipper's rut the profile's radius is ~4 m, so a 1.7 m ski's end sits 85–93 mm off the surface,
the solve infeasible at 0.11–0.12 with the pelvis listing to 34°). The model:

- Pressure point `P`: each ski's lower edge at `along` from the mount, the `ALONG` coordinate the balance block
  uses as the pressure centre, across the ski by `acrossShare(edge)` (the centre line when flat).
- Pressed or bridged (M4): a ski is a beam loaded at the boot resting on snow. Per frame and ski, from the goal,
  the lower edge's height along the snow normal is `z(u) = z_w + p u + c u² / 2` with `c = cos ε / R_bend − sin|ε| /
  R_sidecut` (`edgeCurvatureOf`): the bend lies in the base-normal plane, ε off the snow normal, so it lifts the ends
  by `cos ε` of its sagitta, and the edged sidecut drops them by `sin ε` of the sidecut depth. The snow enters by
  subtraction, its chord curvature `κ_snow` along the ski's heading over the running edge (concave positive): pressed
  when `c ≥ κ_snow`, i.e. `κ_bend = 1 / R_bend ≥ κ_req = (sin|ε| / R_sidecut + κ_snow) / cos ε`
  (`requiredCurvature`); on a plane `tan|ε| / R_sidecut`, where the edge's curvature in the snow is
  `cos ε / R_sidecut + sin ε / R_bend = 1 / (R_sidecut cos ε)` (Howe). At ε 30°, R_sidecut 16.4 m: R_bend ≤ 28.4 m,
  F ≥ 151 N. The figure samples the sidecut at the running edge's ends, `±L_c / 2` from the waist with
  `L_c² = 8 D R_sidecut`, `D = (W_tip + W_tail − 2 W_waist) / 4` (`runningLength`), so its sampled radius is
  R_sidecut; clearance and the drawn ski keep the full length (`SkiPoints.ends`). Pressed when `κ_bend ≥ κ_req`: `P` on the snow and the long axis tangent there. Bridged
  otherwise: tip and tail lower edges on the snow, the waist free above it, `P` the force point on the base between
  them. At equality both hold (the whole edge on the snow), so the switch is continuous. Groomed: the outside ski
  pressed throughout; the light edged inside ski bridged through most of the arc in GS dynamic, SL and steered,
  pressed in GS gentle. Moguls: pressed over a crest (the ends lift), bridged across a trough (the ends touch),
  as biomechanics.md's "Riding the bumps" says. Each ski's lower edge is picked from the sign of its goal edge,
  not the solver's seed.
- Bend: on a pressed ski a rigid base point `d` metres along the ski from the mount may sit below the snow by the
  bend sagitta `d² / (2 R_bend)`, the real base bending up to the snow there, so its no-penetration rows become
  `gap_j + d_j² / (2 R_bend) ≥ 0`; a bridged ski's rows stay `gap_j ≥ 0`. Points an equality holds idle. `d` is
  measured from the mount, not from `P`: measured from `P`, the allowance let the solver buy contact slack by
  sliding the pressure centre to the boot sole's end, and the balance dragged the CoM 12 cm behind the feet (M3). `R_bend = 3.85 m · 1111 N / F` from thorwartl-2023's measured bend (the one measured ski bend read; a
  linear beam's curvature grows with the load, inferred), `F` the frame's load of §4.1 with the bump's normal term,
  clamped to 1.5–1000 m (inferred): nearly straight at the crest (load ≈ 0.3), ~2 m at the hit (≈ 2 BW), ~4 m at a
  carved apex. That radius is the allowance, not the drawn shape: on a 45° carved edge the rigid ends sit 12–19 mm
  below the snow (the sidecut's lift reversed, an effective bend of ~18 m), well inside the allowance; the
  allowance bounds, the equalities at `P` fix the pose. The inside ski takes the same `along`, its own `R_bend`
  from the inside share. Nothing new goes into the tables: the viewer computes `R_bend` from the goal at `t` (as
  `rootWorlds` already rebuilds the frames) and module S draws the rigid base lifted by `clamp(−gap, 0, sagitta)`
  per point, conforming to the snow on groomed snow and bumps alike.
- Surface from the task: the moguls cell's field is the zipper geometry (raised-cosine crests, the skied-in rut)
  sized by `task.bumpSpacingM` and `task.bumpHeightM` (3.5–3.6 m, 0.6 / 0.8 / 1.0 m) at `task.speedMps`, so
  `periodS = spacing / v` and Gate.Period's surface spacing is the task's; the legacy drills keep their constants.
  `Surface.task` stays null on moguls, so the skis' heading keeps the path's own swing until modules P and V.
  The snow is the one moguls timing (P1): the zipper tops each mogul at the switch and the tips meet the next face
  mid-turn (fis-freestyle-judging-2025 pp26, 28), so the physics samples the track for the crest and the hit, in
  place of the inferred `MOGUL_HIT_T` 0.75, which sat ~0.2 of a turn off the drawn snow. The hit is where the tips
  meet the next face: the tip, half a ski ahead of the boot along the track, passes the trough's bottom (P2).
- Absorption (P2): the legs keep the pressure on the snow even (fis-freestyle-judging-2025 p28), so the mass height
  over the mean slope is the periodic path with the least normal acceleration that stays within the legs' reach
  above the snow under the boots, from the deepest mogul fold (the knee at 105°, inferred: arndt-1992 p78 has past 90° in one trial) to the
  open knee (inferred), and never asks the snow to pull: `z̈_mass ≥ −g cos θ`. The normal load is
  `cos θ + z̈_mass / g`: even where the reach suffices, rising only where the legs run out, and the mass rises and
  falls by the part of the bump the legs cannot take. P1's `v² κ_snow / g` had the mass ride the snow: 69–78 % of
  the snow's range, the outside knee within 2° from crest to trough.
- The bumps' relief (P3): skiers cut the line they ride, so the track's crest-to-trough relief is the largest the
  dynamic cell rides in contact within the reach, at the FIS pace (measured) and spacing; gentle and moderate ride
  the same field slower and fold less. It replaces the inferred 0.6 / 0.8 / 1.0 m, which no reach could ride: P2's
  absorption on them needs the snow to pull the mass down over 22–46 % of every turn (least support −0.77 / −4.5 /
  −11.6 g), a reach of 0.42 / 0.72 / 0.94 m against the skeleton's 0.27 m (knee 35° to 105°).
- The ski bridges the trough (P3b): contact caps the mass's own rise and fall near `g cos θ T² / 8` (0.12 m at the
  FIS pace), so with the boot on the snow the legs take the rest and the ridable relief is 0.35 m (P3). The boot does not follow the snow: a 1.7 m ski on a 3.5 m spacing rides a crest
  under the boot and spans a trough on its tip and tail (M4's regimes, docs/research/biomechanics.md), bent by its
  load (`ski-bend.ts`). The boot's track is the snow's upper envelope under the bent ski,
  `z_boot(s) = max_u (z_snow(s + u) − u² / 2R(load))` over the ski's length about the mount, and the absorption runs
  on it, the load and the bend solved together. The 0.35 m above and P3b's 0.38 m (§10) were the reach limit of the old fast cell:
  points past the legs' reach are outside the skiable space (§4.3 rule 5), and §3's h sweep to 0.6 m shows where.
- Stance: `MOGUL_STANCE_BOOTS` 1.1 stays the goal and the boot clearance inequality rules; M reports the clearances
  at the crest and the hit once the contact is feasible, before anything moves.
- Gates: `P` on the snow and no base point below the bent base (the contact gate), Gate.Period on the task's spacing,
  the counter band (§4.5), hips level (§8 rule 6).

Groomed solves move by the waist's lift (≤ 20 mm lower CoM at 45° of edge) and nothing else, so M is the one module
after E3 that rebakes every cell.

## 5. What the solver holds and what video fills

| Quantity | Solver constraint (physics) | Video / literature supplies |
|---|---|---|
| Skis' path, heading, edge contact, clearance | equality: outside ski on the path, its pressure point on the snow and the ski tangent there, inside ski parallel; inequality: no base point below the bent base (§4.8), boots and skis apart | — |
| Balance: mass on the balance axis | equality: `CoM − pressure centre` square to the resultant of §4.1 (`'balance'` block) | — |
| Edge angle | `ε = λ + m`, `m` from σ (§4.2); carved `r_ski` from the sidecut and the edge's sink (§4.2) | edge curves (sporri-2016 GS, reid-2020 SL) as checks at their points |
| Angulation split hip / spine / knee | style defaults (§7) inside heinrich-2022 ranges | measured ranges; captured split per style from clips |
| Counter | inequality while loaded: `pelvis yaw − ski yaw` about §4.5's prediction (the pelvis on the mass heading plus the habit), skis' heading from `skiHeadingAt` | D12, D13 at their points, footage |
| Fore-aft | ankle-led, cuff-bounded; goal from the balance (§4.6) | GS curve (sporri-2016) at its point; captured ankle/knee/hip at events |
| Flexion depth (mass height) | from load, the stance depth, the movement range and the transition style; limits and effort floor | reid-2010 CoM height (SL, eye-read); kroll-2011 knee angles |
| Timing of events | period from the task; events from §4.7 | measured phase shares (GS) and periods |
| Inside lead, inside gap | FK outputs, reported and gated | heinrich-2022 inside/outside knee ranges |
| Arm carriage, pole plant | style values (§7), the plant timed by the events | footage timing |

Captured poses (GVHMR/SAM3D joint angles; world paths unusable) enter only as priors on free coordinates with
sigmas from the measured noise floor, read near the point's transition phase (§7), never pooled across distant phases and never keyed by a preset's name.

A measured prior reaches a point through the physics state: its timing through the events (§4.7), its amounts
through the lean. Its odd harmonics, the part that flips with the turn (one side against the other, and the odd
coordinates outright), are odd in the lean λ and vanish in straight running, so below the lightest example they
scale by `λ_cell / λ_example`, both at the fall line from §4.1. Even harmonics and σ keep the example's values;
nothing extrapolates past the heaviest example (module Q). A derived quantity signed toward the turn's inside
(trunk_across) is side-against-side as a whole, so it scales whole; trunk_pitch and trunk_gravity keep theirs. Before Q the nearest example held: GS gentle and
dynamic (λ 19° and 33° at the force peak) took heinrich-2023's hip rotations from a lean near 54°. With the hips
flexed ~70°, the hip rotation sets the pelvis list against the legs, so the pelvis sat near `λ − 30°`, tilted out,
and the balance bent the trunk 18° into the turn (Z).

## 6. Kinetics → muscles → effort

Static optimisation, the way OpenSim's tool settles what the moments leave open: per solved frame (the bake's 48 per
turn) and per side, the net joint moments are shared among the muscles that can produce them, least squared
activation first, and the activation is the effort. No dynamic inverse dynamics on video paths. Everything below is
at every point of §3 (every baked preset) from the solved `q` and the task's load; video never enters.

**6.1 Joint moments.** `M_j`, N·m, about coordinate `j`: `jointMoment` with the distal segments' weights in the
effective field `−g·load·resultant` and the ski's share of the snow force at its pressure centre, projected on the
coordinate's axis (`src/viewer/motion/turn.ts` `effortOf` before its normalisation). Coordinates carried: hip
flexion, adduction, rotation; knee flexion; ankle dorsiflexion, per leg; lumbar, thoracic and neck flexion, bending,
rotation; shoulder flexion, abduction, rotation; elbow flexion. Signs follow `skeleton.ts` (+ flexion, adduction,
internal rotation, dorsiflexion; spine + flexion, right bending, left rotation). The check is heinrich-2022's carved
turn (biomechanics.md 2.2; R2 re-read the outside leg, Table 2's LEFT): at the force peak of GS dynamic, hip
extension ≤ 1.27, knee extension ≤ 1.02, hip adduction ≤ 0.52 (abduction ≤ 0.39), ankle plantarflexion ≤ 0.85,
hip external rotation ≈ 0.17 at ~79° of hip flexion, lumbar extension 1.88 (the net demand about heinrich's single
lumbar joint: our lowest spine joint, the thoracic free) and lateral 0.75 Nm/kg, each inside 0.5–1.5 × (inferred
tolerance: another skier and turn), and lumbar extension > bending > rotation. heinrich's + lumbar is extension,
ours flexion: the sign flips.

**6.2 Mode.** `q̇_j` by central difference over the cycle, `Δt = T / 48`. The loaded group is isometric when
`|q̇| < 10°/s` (inferred), concentric when `M·q̇ > 0` (the muscles producing the moment shorten), eccentric when
`M·q̇ < 0`. berg-1995: the outside knee extensors of GS are eccentric about twice as long as concentric; the test
holds eccentric ≥ concentric time for GS dynamic.

**6.3 Capacities.** `C[i][j]`, N·m: muscle `i`'s largest moment about coordinate `j` in its positive sense; negative
when it pulls the other way, 0 when it does not cross. `C = F_max,i · r_ij` at the skiing posture (hip 40–80° and
knee 50–90° flexed, ankle 10–20° dorsiflexed): `F_max` from one musculoskeletal model per region (rajagopal-2016 legs,
christophy-2012 lumbar, vasavada-1998 neck, holzbaur-2005 arm), `r` from a tabulated moment-arm source at that angle,
else the direction's shared value marked `inferred` (then `F_max` ratios set the shares, which is what the display
needs). Content names the parts (vasti, rectus femoris, biceps femoris, medial hamstrings, soleus, gastrocnemius,
the two obliques); groups are not solved. Scale: the model sets the split, the measurement the sum. rajagopal-2016's
60 N/cm² forces give direction sums 1.9–5.6 × anderson-2007's measured maximum voluntary moments (E2a, 2026-10-21:
knee extension 2.7 ×, plantarflexion 5.6 × with the soleus at 6.2 kN and a 5 cm Achilles arm), and EMG %MVC is
normalised to that measured maximum, so each direction's capacities are scaled by one factor that makes Σ agonist
capacities equal the measured MVC: anderson-2007 for the lower-limb sagittal senses, the joint's mean sagittal
factor for hip abduction, adduction and rotation (inferred), measured MVC sources for the trunk, neck and arms
(E2b). A biarticular muscle therefore carries a different implied force per coordinate (gastrocnemius 1/2.7 at the
knee, 1/5.6 at the ankle), an open item that a force–length model or per-muscle factors would close. `MAX_TORQUE`'s
inferred rows become those sums.

**6.4 Distribution.** Per side and frame, `a = argmin Σ aᵢ²` subject to `Cᵀa = M` over the side's coordinates (the
trunk and neck solved once with left and right copies of each bilateral muscle, capacities mirrored), bounds
`0 ≤ aᵢ ≤ 1.5` (eccentric force over the isometric maximum, inferred), by non-negative least squares (Lawson–Hanson,
~45 unknowns × ~20 equations). Residual `‖Cᵀa − M‖ ≤ 2 % ‖M‖` (inferred) is the gate `momentBalance`. Capacities
are posture-constant except the hip rotation arms, which follow hip flexion (delp-1999's 0 / 60 / 90° columns, linear
between, E2c): at the outside hip's ~79° the gluteus medius, minimus and the upper gluteus maximus rotate internally,
only the lower gluteus maximus and the deep rotators externally. The residual gate applies where no agonist saturates;
where one does, the residual must have the demand's sense (E1a).

**6.5 Co-contraction.** Statics gives antagonists zero; EMG does not. The antagonists of a loaded coordinate get a
floor `aᵢ ≥ ρ_j · max agonist a` with `ρ_knee = 0.22` (hermann-2023: quadriceps-to-hamstrings 4.5 in recreational
turns, highest in the plough, lowest in short turns), other joints 0.22 inferred; the floor's moment is added to `M`
and 6.4 runs once more so the balance holds. Not a stiffness model; one measured ratio per joint.

**6.6 Effort scale.** `%MVC = 100·a`. Effort `e(a)` is piecewise linear through (0, 0), (0.05, 0.5), (0.20, 1.5),
(0.50, 2.5), (1.0, 3), 3 beyond: biomechanics.md 0.3's bands, so `effortWord`'s boundaries at 0.5 / 1.5 / 2.5 are
5 / 20 / 50 % MVC. Continuous per frame for the strip and the glow; the content tables and the tests take the mean
over each phase window (initiation [0, ⅓), shaping [⅓, ⅔), finish [⅔, 1) from the switch). The outside leg is the
solve's right leg (`Side.Right`), the inside its left; bilateral trunk and neck muscles report the larger side
(asymmetry an open item). The 0–3 scale is an output and has no cap; the effort gate is demand over capacity (§8).

**6.7 Not carried by the solve.** The subtalar coordinate is the shin's roll off the ski inside the boot (cuff, liner,
foot; ±6°, `BOOT_LATERAL_PLAY`, inferred, G1b), carried by the shell: no effort row, no prior. Foot arch, knee
rotation and valgus, scapula, wrist and the pole-plant impulse: those muscles keep the base content's levels and
modes, `basis: content`. Knee rotation (the ISB third knee rotation, passive 11° internal at deep flexion in vitro) is
the next sourced module if the figure still lacks knee angulation after the boot's play (sources collected in
`$S/knee-rot/findings.md`: zorko-2015's outside-knee internal rotation 3° → 12–14° through GS steering at 45–52°
flexion, heinrich-2022's knee rotation moment band, PMC4965218's passive range at 30/90°, hrycyna-2011's torque).

**6.8 Output and tests.** `src/viewer/motion/effort-tables.json`, baked by `bun run poses` under the q-tables' hash:
per baked preset (a point of §3, drills included), per muscle and side (R, L), 48 activations (int16, 1e-3) and modes (c / e / i / -).
`derivedActivations(drill, intensity)` builds `Activation`-shaped records (phase means per setting, the phase's
dominant mode, text from the base movement's matching activation, `basis` naming §6) and `effortAt` reads the frames
for migrated drills; `steadyOrder` ranks derived peaks. Tests are sources and relations, never our numbers; each is a check at its
source's own point of §3 (§8), and the preset named is only that point's label:

- hintermeister-1997 (parallel and GS turns): outside vasti, gluteus maximus and adductors mean ≥ 50 % MVC over the
  loaded frames of GS dynamic; biceps femoris ≥ 20 % (the hip-extension share plus 6.5).
- panizzolo-2013 (instructors' slalom): SL dynamic outside vasti cycle mean ≥ 50 %, rectus femoris 20–50 %; rectus
  femoris peaks on the inside leg in the first half of the cycle, vastus medialis on the outside leg between
  engagement and release.
- kroll-2010 (recreational): inside vasti 0.3–0.7 × the outside's, Steered moderate (band inferred around 0.46).
- hermann-2023: quadriceps-to-hamstrings ratio falls from Steered gentle to SL and GS dynamic; 1 ≤ ratio ≤ 6 at every
  baked preset.
- berg-1995: eccentric ≥ concentric time, outside knee extension, GS dynamic.
- heinrich-2022 moment bands and ordering (6.1); anderson-2007 capacity sums (6.3).
- Invariants: finite, 0 ≤ e ≤ 3; along the speed sweep (turn size, pitch and σ fixed) the outside vasti shaping mean never falls; the
  content's `orderProblem` per muscle and phase, violations reported with the frame, never silenced.

The effort scale reads the skis' arc load even when the mass runs straighter (moguls), so a straighter mass never
looks easier (F1.5).

## 7. Style dimensions

Each style dimension is one continuous value for the whole cycle; the physics times it (§3). A named style (cross-over, countered, a wide stance) is a preset value of
one dimension, and a preset's style values are parameters like its speed.

| Dimension | Value | Effect in the model | Preset values |
|---|---|---|---|
| Transition phase | where the mass is lowest relative to the switch: extended at the switch (cross-over) to flexed at it (cross-under, retraction) | the mass height h_m(t) about the switch (opposite knee phase, D17) | cross-over or cross-under, chosen per turn: any turn kind and intensity can use either |
| Angulation split | shares of hip abduction, lumbar lateral bend and knee frontal in m(t) | how the margin is made | hip-led (heinrich-2022 outside hip abduction 3–27°) |
| Counter habit | degrees the pelvis faces off the mass heading | adds to §4.5's counter | 0 (inferred) |
| Stance width | boot gap, m | the gap goal | hip width on groomed snow, boots together on bumps |
| Weight split | the outside ski's share of the load at the force peak; both carry half at the switch and between the share follows the lateral demand f | the legs' loads | 0.6–0.75 (inferred); carved 0.68, band 0.62–0.72 (measured, §4.2) |
| Stance depth | the mean flexion of ankle, knee and hip that the cycle moves about | h_m and the ankle's dorsiflexion inside the cuff; the flexion's time course comes from the load and the terrain | inferred |
| Movement range | the amplitude of the flexion-extension over the cycle about the stance depth, one number | the swing of h_m and the joints about the stance depth; on bumps it has a floor from h (the legs absorb the terrain), zero at h → 0, where the amount is free; its timing comes from the transition phase and the load | inferred; Gentle, Moderate and Dynamic differ |
| Arms and poles | arm carriage; plant time in the cycle, or none | upper-limb coordinates | forward; a plant just before the switch in SL, short swings and moguls |
| Line on bumps | the skis' path offset from the trough | the skis' path (§4.4) | the zipper |

Captured priors carry the transition phase they were measured at; a point reads priors near its own phase and never
pools across distant phases.

## 8. Gates (automatic, every bake, every point)

Beyond the capture gates in `scripts/capture/gates.ts`, the same gates at every point:

1. `ε − λ` inside the margin band of the point's σ while loaded: [0, A_max] carved, narrowing continuously to the
   slip threshold ±5° (inferred) as σ → 1.
2. Counter within its tolerance of §4.5's prediction; hip rotation inside the joint's range at its flexion
   (heinrich-2022's ranges at its points). Carved (σ 0): chest twist, the thorax's axial rotation against the pelvis
   by the same joint coordinates, worst over the loaded frames ≤ 15.3° (sporri-2016 Table 1 GS 7.7 ± 3.1 and
   8.9 ± 3.2, Table 3 SL 6.6 ± 2.7: the larger mean + 2 SD; racers at higher load, an upper bound for slower carving).
3. The inside knee folded by the geometry's rise (§4.6) within its tolerance.
4. Shins at or above the cuff's forward lean; ankle dorsiflexion inside the knee-flexed range.
5. Both skis on the snow, boots and skis clear, on the fitted boot (`bootFitFrom`) the solver and the figure wear.
6. The mass path against the skis' path by §4.4's relation, within its tolerance.
7. At measured points only: the load peak and its time, the edge and fore-aft curves, joint ranges and moments, the
   counter, each within its measurement's uncertainty (§3); a condition the source did not record is an existence check
   over its plausible range, on the source's own ski.
8. Effort worst ≤ 1: demand over capacity, no joint moment above its measured maximum, as `Gate.Effort` in
   `src/viewer/motion/gates.ts` computes it; the 0–3 effort scale (§6.6) is an output and has no cap. Every prior
   within 2σ; `momentBalance`, the capacity sums, the EMG anchors and
   §6.8's mode relation.
9. §3's sweeps: the feasibility boundary, continuity, the physics' signs.

A measured error nothing fails on is a bug in the gates. A gate that names a kind is a bug too.

## 9. Order (2026-10-23)

Until this date the work ran kind by kind and cell by cell: each module fixed one cell's symptom and checked that cell
(Appendix A). What it built stays where it is physics or biomechanics at every point: the effort chain (E1–E5, R2),
the stance centre on the path (B3), the boot's lateral play with parallel shins (G1, G1b), the knee's axial rotation
(T), the ski's contact and bend (M), the switch state and the periodic speed (V), the inside fold (L), priors read
through the lean (Q), phase registration by events (F) and the multi-start solve (B2). What was keyed by a kind or
fitted to one cell goes.

| Step | Does | Agent |
|---|---|---|
| R1 parameters | `TurnTask` holds §3's parameters and nothing else; presets in `TASKS` are points with labels; no function below the preset table takes a kind, intensity, drill id, mogul line or style name; every per-kind band, window, share, shape and constant stops being an input and becomes a physics output (§4) or a check at its measured point (§8); tests that assert a preset's value give way to relations and sweeps | sonnet, done 2026-10-23 |
| R2 one physics | §4.4's balance relation at every point in place of `ARC_SHARE` and the moguls branch; the skis' heading as travel plus γ; the counter from the mass heading and the habit (§4.5); the margin from σ (§4.2); events from the profile (§4.7); §4.3 rule 4 with the legs' absorption work, solving the sweep at σ | opus, after R1 |
| Bumps | h above 0 on the one physics: P4 (moguls absorption wiring, §4.8: the turn's load, lean, mass path, bump term and hit from the absorption and the pendulum) | opus, after R2 |
| R3 sweeps and gates | §3's sweeps over every parameter and §8's gates, none naming a kind | sonnet, after R2 |
| R4 bake and look | every preset baked once, with S (the ski drawn bent) inside that bake, which replaces the nine-cell rebake; one sheet of all presets beside footage at matched phases; nothing changed per preset; a fault goes back to the physics only where it is wrong at every point | opus, after R3 |

Then the model page, the recap, the commit, the PWA check and the push, asked first. The energy question in §10
follows from §3: the pitch stays the terrain's, and the sweep closes the balance.

## 10. Open items

- Carved rebuild (2026-10-24): the carved radius is Howe with the edge's sink (§4.2) in place of `k R_sc cos ε`, the
  skis are the Laser SL 165 and Racetiger GS 173 (§2), the outside share 0.68, `solveCarved` on edge friction and
  CdA (§4.3 rule 4), the six carved presets on their steady speeds (§3). Open: c is inferred (nothing measures it on
  a named piste snow; the strip-to-effective ratio is unreconciled, 0.43–0.73 between federolf-2005 and kaps-2001);
  soft snow past 55° of edge; the inside ski's share away from the mid-turn peak (0.5 at the switch, about 0.65 in
  completion, inferred from falda-buscaiot-2017).

- R1 read thorwartl-2023, nakazato-2011 and reid-2020 in full (all open on PMC; notes in `content/sources.yaml`).
  k: thorwartl measures the ski's bend, not the path, so no k; reid gives 0.69–1.04 at ε ≥ 65° on a 14 m ski and
  the sidecut relation fails below 45°; nothing measures k at the GS cells' 20–35°, so 0.85 stays inferred
  (open follow-ups: Adelsberger 2014's effective radius, Reid's 2010 thesis for SL forces and speed). nakazato:
  outside-ski force peak at 0.4–0.6 of medium carved and steered turns, 1.35–1.7 BW on the mean curve, minimum
  0.09–0.37 BW at the switch, inside hump at 0.6–0.7, inside share 27–35 %; the steered kind's peak timing is therefore
  open: with a constant cell speed the mass-path load peaks past the fall line in every cell (0.63–0.70: the gravity
  term `−sin θ cos β` grows there); a medium steered turn scrubs speed below the fall line while gravity restores it
  above: module V, a periodic v(t) from the energy balance (gravity along the path, gliding friction, the early
  skid's plough, air drag; `speedMps` the cycle's mean), gated on nakazato's and bon-2021's peak timing. The
  finish's skid tilts nothing fore-aft: the snow's plough force is square to the ski, so the migrated cells'
  `braking` is the gliding term atan(μ_k cos γ), not a share of the along-slope pull (legacy `brakingShare` stays
  on the legacy branch). Energy booked at constant speed while designing V: GS dynamic (15°, 7.3 m/s, 45° half
  sweep) gains about 0.16 g net per cycle (gravity 0.23 g against friction 0.05 g and drag 0.015 g), 4.5 m/s a
  turn, so closing it needs an early-skid attack angle near 50° or a half sweep near 143°; the carved cells cannot
  hold their table speeds on their pitches at a 45° half sweep. Rule 7 therefore reports, per cell, the closing γ_e
  and the half sweep that closes at γ_e 15°; moving the cells (pitches near 8°, or turns completed across the hill
  with the sweep as a task number) is the user's call, not V's. V's result (2026-10-22): the switch state and the periodic goals hold (seam value mismatch ≤ 0.027°, λ's seam
  slope mismatch a third of before); the cold GS dynamic table converges at 24 and 48 frames (cost 563 / 2318, CoM
  0.81, knee 98°, every cell feasible) where G1b's 48 did not. A speed root exists only for GS and SL moderate and
  dynamic; the closing attack angle needs 45–60° and the half sweep that closes at γ_e 15° is 97–108° for GS and SL,
  79–97° steered, so rule 7 fails in all nine groomed cells (the decision above). The force peak sits at 0.66–0.75
  in every groomed cell: v peaks at τ 0.13–0.15 and bottoms at the fall line, so the peak moves later, not earlier;
  that matches kroll-2015's GS 0.68 and misses reid-2010's SL 0.51 and nakazato's 0.4–0.6 medium turns, so rule 8's
  one window is wrong by kind: F derives `ARC_PEAK_T` per kind from the measured peak time (the video supplies the
  timing) and gates per kind. What still jumps at the seam (`$S/c/zz.ts`): the lateral trunk and pelvis rows (lumbar
  bending 11°, pelvis list 6°, thoracic bending 6° in one frame at 48, their curvature growing ∝ S² with resolution)
  because `pressuresOf` puts each ski's pressure centre on its lower edge at every edge angle, so at the switch, share
  0.5, the balance target sits 3.4 cm (half the 68 mm waist) toward the old turn's inside and flips at the mirror: a
  6.8 cm lateral step the trunk must follow. M moves the pressure centre across the ski with the edge angle (the
  centre line at ε 0, the lower edge once edged; the transition width inferred). V also found w(0) 0.19–0.39 groomed
  and 0.06–0.11 moguls with lean(0) = 0, the plough's extra lean up to 21° on steered dynamic, and bon-2021 gives
  forces only (short turns outside 1.37–1.45 BW, inside 0.92–0.99; parallel 1.06–1.10 / 0.28–0.33), no timing, so
  §4.7's 0.63–0.75 short-swing window stays unverified. Tests: rule 7 red on gs gentle (the decision); the steered
  dynamic pelvis share and the path's x(0) = 0 convention were fitted to the old profile (V2, sonnet, re-derives
  the share from the 35° release centre and asserts the mirror invariant x(0) = −x(1); done: share 0.7046, the
  release heading 21.3° past the fall line, the hip band back inside 45°). The measured outside peaks (1.8–2.05 BW) exceed every mass-path
  load in §3 because the mass-path load is the quasi-static part: the CoM's acceleration along the snow normal
  from the flexion cycle adds `z̈ / g`, computable from the solved motion; the gate against nakazato's peaks is open
  (module P, after E3). reid-2020 is kinematics only: the 13 m course builds its edge early (45° at t 0.1), the 10 m
  course used for the SL shape does not (36°); figure values are by eye.
- K1b's consumer wiring (done): one kind map, the skis' heading from `skiHeadingAt` in `pathAt`, the counter as a
  size-2 inequality while loaded with one definition (`counterOf`), `counterExcess` in the report, one boot
  geometry (`bootSegmentsOf`) for solver and tests. Findings: the bounded steered gentle solve sat pinned on the
  band's −5° edge (fixed in §4.5 by the pelvis share, K1c); the fitted boot clears by 24 mm in steered and 40–48 mm
  in GS cells but overlaps 31–53 mm in the mogul cells (the mogul stance 1.1 boots against a 0.20 m capsule hip
  width vs the skeleton's 0.157 m: module M), and in the legacy drills turns-on-the-tops, round-line and
  closed-stance; mogul relief and spacing are still the zipper constants and `overField`, not `task.bumpSpacingM`
  / `bumpHeightM` (module M); the gate checks the mogul counter on loaded frames only; SL evidence is 'slalom'
  only.
- Mogul load spike: `MOGUL_NORMAL_SWING` 0.3 is a constant; it should scale with speed and bump height once a
  source is read. The 40° steered fall-line cap, the mogul 25° set margin and the mogul A_max are inferred.
- GS on the SL ski takes the long end of the ski's carving range (r ≤ 10.3 m, ε_max ≤ 35°); a GS-radius ski for the
  GS kind is the user's call (`skiForKind`), and would re-derive the GS cells only.
- Side-view clips for regular and short turns (only front views exist, `$S/capture/index.md`).
- Snow condition (grip limit, drag and support at depth d) as a first-class input once a source is read; d is a
  parameter (§3), its physics stays open.
- K2 (done): drill ids renamed in 16 TS files and 4 JSON tables with no rebake, so the stored hash stays stale
  until E3; the glb clips keep the old names until then. `regular-sl` carries steered footage priors
  (short-reilly-sam3d) until an SL prior exists; only cross-under (kroll-2015) is a real SL study. `--check`'s
  in-memory re-solve of steered dynamic was infeasible under the pre-K1c band (B2 and E3 settle it). Text still
  naming the old kinds: PRODUCT.md:17, §3 here ("the cruising ones", "Carving / Short / Moguls"),
  docs/research/biomechanics.md:519,527,691, comments in `poses/regular-turn.ts` and `scripts/prior/build.ts:234`
  (also in priors.json provenance notes); the URL ids cruising / carving / short-turns stay. The `capture-ik`
  femur-twist test passes since K2's Step 0 (the tibia line's axis).
- K1c (legacy, done; §4.5's mechanism replaces its pelvis share): the band's centre is `pivot + s (h − π/2)` with per-cell shares (§4.5). The bounded steered gentle
  solve (24 frames, 81 s, feasible, prior 98.8 %) ran its loaded counter −17.9..19.1° along the band's inner edges
  at both ends (one steered share of 0.736 made the gentle cell the quietest groomed one; it is 0.2 now). The hip
  rotation coordinates run against the counter's sign late in the turn (outside IR −7.4..3.2°, inside ER
  −14.3..−2.1°; at k21 counter +19°, outside 2° ER, inside 12° IR) and the pelvis yaw seems carried by flexed-hip
  adduction (`hip_adduction.R` 3.2σ, the worst prior term): check the hip Euler decomposition on the rebaked figure
  before trusting the hip gates (E3's inspection). D13 gives 5° at initiation, 5–10° in shaping and ~3° at the
  finish (the tests use 3–10° at the GS release; its initiation sign against the model's −8° anticipation is
  unchecked); D12's 25° shaping counter sits inside the steered dynamic force-peak band (10–30°) but not its
  fall-line band (0–20°); the steered dynamic band touches the inferred 45° ceiling at the release (35 + 10).
  The follow-up set the steered shares per cell from the skis' yaw rate (swing / T: steered 17 / 33 / 54 °/s → 0.2 /
  0.45 / 0.736; GS 21–32 °/s at 0.2, SL 30–52 at 0.4, moguls 44–82 at 1) with a relation test (non-decreasing in the
  rate within a kind; the slower kind of a family never above the faster one's lowest share). Steered gentle's
  release band [−1.6, 18.4] dips below zero, so the test holds the centre's sign (+8.4°), not the band's edge.
- Moguls stay on the legacy path: a rigid ski on the 1.0 m relief at 3.54 m spacing cannot hold the base (B: solver
  violation 0.11–0.12, contact gaps 85–93 mm, pelvis list to 34°, the same on the legacy path). Migration needs a
  contact model (a pressure point on the surface, no penetration elsewhere, the ski bending under load) and the
  surface reading the task's `bumpSpacingM`/`bumpHeightM`: §4.8, module M after E3.
- Priors: 1.3–5.2 % of prior terms sit outside 2σ in B's steered cells (`knee_flexion.R` −2.5σ late in the cycle,
  `hip_adduction.R` +2.4σ at 0.83–0.92); re-evaluate after the hard counter band and the rebake. Priors and the
  fore-aft goal are keyed by `t`, not by events; per-kind priors (SL from the slalom curves) are still to come.
  `foreAftAt` reads the task's fore-aft preset (F): GS sporri-2016's curve, SL reid-2010's three anchors, steered
  and moguls mid-foot as a number; no kind selects by name.
- F (2026-10-23): heinrich-2022's Table 2 moments ride the outside leg and lumbar joint as inequality bands over the
  loaded frames, plus point priors (σ 0.25 N·m/kg, inferred) at the force-peak frame, both scaled per BW of
  outside-ski force (his peak is 1.00 BW; the linear scaling is inferred); the Moments gate (force-peak rows beyond
  2σ, inside hip rotation internal and ≤ 2 × 0.23, outside hip rotation in its band) is report-only until the rebake.
  `arcPeakTOf` derives the arc-share peak that lands each cell's force peak mid-window, but applying it breaks rule 7
  in every cell (v(1) − v(0) 0.8–2.3 m/s, the seam lean and three V tests), so `ARC_PEAK_T` stays 0.61 and rule 8
  reports the asked peak: SL and steered force peaks stay late (0.66–0.73) against their windows, contradicting the
  V bullet's plan above. E4's A-frame sign is a pure test (`test/moments.test.ts`): parallel shins under R with the
  inside femur 15° external demand internal inside hip rotation, the A-frame external. Migrated SL periods follow
  the profile (slower than race, a ceiling), so the legacy 0.50–0.83 s window is tested on legacy drills only.
- Open after F: at GS dynamic's force peak the pelvis list (+13.3°) and lumbar+thoracic bending (−6.7°) carried the
  opposite sign to the stored heinrich-2022 Table 1 split. L's forward kinematics show `pelvis_list` > 0 tilts the
  pelvis toward the turn centre, heinrich's sense, so the stored mirror was wrong; T restored his raw list. Our
  bending > 0 bends the trunk outward, opposite to list (FK), so the bending row keeps its flipped −0.4..4.6. §4.1's GS force-peak phase from
  falda-buscaiot-2017 (≈ 0.54) disagrees with kroll-2015's 0.68, which F's registration uses. No athlete trunk
  lateral-flexion MVC was found, so pan-2025's 61.4 N·m stays against the 52.9 N·m demand (G4).
- F2 (2026-10-23, ablation at 24 frames): heinrich-2022's outside moment band alone stands the cold GS dynamic cell up
  (band off: cost 644, CoM 0.80, knee 101°; with it 1319, 0.98, 72°, 4× the iterations); F's code is correct. The
  band caps the outside knee's distance from the force line at 10.4 cm (1.02 N·m/kg per BW / g); V's crouch held it
  at 19.7 cm (outside knee ~97°, beyond heinrich's measured 56–80°), the wrong split between the legs. The inside
  knee prior (heinrich-2023, 111° against 71.5° outside) needs the inside leg 19 cm shorter along the lean axis; the
  inside foot rises only gap · sin λ, and at this cell's fall line λ is 22°, so it would need ~51 cm of ski gap
  against the 11–16 cm the stance goal and the inside-edge row hold. Boot and edge play (±12°, 10°) leave the knees
  within 4°. The source skier leans ≈ 54°; in that source the inside hip and knee each fold ~30° more than the
  outside with the ankles within 3°: a leg shortened by the lean. Module L derives that fold from each cell's lean.
- L (2026-10-23, 24 frames, cold): every groomed cell is feasible. Steered dynamic reaches its derived inside fold in
  292 iterations; SL dynamic, GS dynamic and GS gentle fall short (inside knee z −3.4, −4.7, −2.2) and fight (755–1805
  iterations against V's ~270). In every cell the inside ski sits the full 5° play flatter than the outside, the
  inside subtalar on its boot wall (+6°) and the inside hip adducted (+10.7° GS dynamic, +16.2° SL dynamic). The
  inside hip rises 1.8–3.2 cm along the lean axis (hip angulation) and cancels the ankle's rise in GS gentle. The boot
  locks the foot to the ski, so the ski's yaw and roll both come from the hip through a hinge knee; T adds the tibia's
  axial rotation (zorko-2015) to decouple them.
- T (2026-10-23, 24 frames, cold): `knee_rotation` with limits from puah-2018 (0–60°) and mossberg-1983 (70–110°,
  abstract only), split one third internal (inferred), and zorko-2015's outside-knee prior (σ its 3° between-skier
  SD). Costs fell to 151–421 and iterations to 273–395; the inside knee sits at z −2.1 (SL dynamic) and −2.6 (GS
  dynamic) and the inside ski still rests the full play flatter. The trunk zigzags in GS gentle: legs leaning 19°,
  pelvis 5° outward, trunk bent 18° inward against heinrich-2023's ~15° outward prior, led by the outside ski rows;
  an outward pelvis also lifts the inside hip, which L's level-hip rise does not count. M's contact rows come next.
  No muscle carries the knee-rotation torque yet (hamstrings, popliteus, sartorius, gracilis need moment arms).
- M, M2–M4 (2026-10-23, 24 frames, cold): pressing both skis at `P` made every cell infeasible: the light edged
  inside ski (R_bend 17–48 m) cannot bend to its sidecut. Restoring its tip and tail still failed at engagement:
  the allowance, measured from `P`, hid a wrong-edge pick 17 mm under the snow and let the solver slide `P` to the
  boot sole's end (CoM 11.7 cm behind the foot, z −4.8). M4's regimes fixed both: groomed costs 298 / 375 / 354 /
  126 (GS gentle, GS dynamic, SL dynamic, steered dynamic; baseline 348 / 421 / 394 / 151), contact gaps 0, the CoM
  5.8 cm ahead at GS dynamic's engagement. Open: GS and SL dynamic take 828 / 953 iterations (baseline ~390); the
  48-frame seam step 1.74 cm against an interior max of 1.09; moguls moderate infeasible (7.6e-2) with the snow and
  the physics ~0.2 of a turn apart (P1). The GS trunk zigzag (gentle list −5°, bending −18°) is neither the
  contact rows nor the moment band (dropped: the split moves < 0.4°); diagnostic Z runs.
- E5 (2026-10-23): the knee-rotation torque on its muscles, arms scaled so the sums meet hrycyna-2011's maximal
  external 55.2 and internal 42.6 N·m (popliteus borrows the gracilis force; cleather-2018 for the muscle set). The
  GS dynamic solve barely moves (cost 374.8, iterations 828 → 924); `DOF_OF` in `src/content/derived.ts` does not
  map `knee_rotation` yet, so the drill pages do not list knee rotation among these muscles' jobs.
- Z (2026-10-23): the GS trunk zigzag is the hip-rotation prior, not the contact or the margin (GS dynamic has
  m 1.8° and zigzags the same way). Pinning the pelvis list to λ at the force peak costs +132 (gentle) and +309
  (dynamic), almost all hip rotation: each degree of list into the turn turns the outside femur one degree
  external and the inside one internal, against heinrich-2023's +33° / −31° (σ 8.6) measured at a lean near 54°.
  The pelvis_list has no prior of its own, so nothing asked for the source's list. Fix: Q (§5).
- Q (2026-10-23): example leans at the fall line GS 54.5°, SL 51.5°, steered 38.2°, moguls 66.6°. GS gentle,
  moderate and dynamic now list the pelvis into the turn (11.9 / 12.8 / 13.9°) and bend the trunk out (2.5 / 3.1 /
  3.1°), heinrich-2022's signs; the same process without the rule fails. Steered gentle bends 2.2° in (−2.7 without
  Q); SL gentle is infeasible (1.4e-3 both sides, with or without Q). SL dynamic's iterations rose 953 → 1197 since
  M4, not from Q. trunk_across did not scale (Even parity): Q2 scales it whole (`WHOLE_SCALED_DERIVED`); its z at the force peak
  falls from −0.9 to −0.1 / −0.5 (GS gentle / dynamic), cost falls, the gates hold.
- D (2026-10-23, `$S/d/`): the slow gentle cells share one cause, the open energy (rule 7) and the late force peak
  (rule 8). Steered gentle gains 2.7 m/s a turn (v 5.14 → 7.05), so λ steps 12° at the seam; the balance equality
  turns that into a whole-body tilt step the smoothness spreads as a 2.2° inward trunk bend (smoothness off: +0.9
  outward), and fighting it costs 2265 iterations (48 frames: cost ×12). SL gentle is infeasible at the fall line
  (k11–12), not at the peak: v bottoms there (5.57 m/s), λ is 22° and peaks late (0.68) while reid-2020's edge shape
  × ε_max holds 44–45°, so the cell asks 21.6° of angulation (moderate 14.7°, dynamic 0.5°) against the inside-edge
  play, ski clearance and the moment band. SL and steered moderate are feasible (290 / 1393, 78 / 282).
- P1 (2026-10-23): the zipper's math moved to `src/physics/zipper.ts`; the physics samples the drawn track (crest
  t 0.02, trough 0.55) and `MOGUL_HIT_T` is gone. Moguls stay infeasible (2.0e-2 / 8.7e-2 / 1.2e-1) at the inside
  contact k8, where the regime turns from pressed to bridged; the mass rides the snow (above) and runs 9× straighter
  than the skis, which the balance cannot hold. Still red: "a mogul every 3.5 m" (dynamic spacing 3.6 m) and
  "joins the mirrored next turn" (the path reaches 0.5445, not the corridor's half). P2 next.
- P2 (2026-10-23): `src/physics/moguls.ts` holds the absorption (a periodic banded QP, interior point, 12–28 ms
  on 720 samples) and the across-slope pendulum, tested, not wired. On P1's snow the absorption needs the snow to
  pull (above), and the mass still rises and falls 56–73 % of the snow's range; the pendulum, divided by a negative
  support, blows up at dynamic. P3 next, then the wiring.
- P3 (2026-10-23): contact hard in the absorption, the pendulum multiplied, rule 9, `ridableReliefOf`. The reach
  from FK at the moguls prior's trunk pitch 25.5° with the mass over the mount: 0.701 m (knee 105°, ankle 47°, hip
  73°) to 0.937 m (knee 35°), 0.235 m; the fold's ankle passes soucie-2011's barefoot 12.7°, inside arndt-1992's
  10–45° measured in moguls. With the boot on the snow the dynamic cell rides 0.35 m at 3.5 m (peak load 6.4 BW,
  mass/ski lateral 0.40 / 0.29 / 0.22), far under kurpiers-2010's crests: P3b, the ski bridging the trough.
- P3b (2026-10-23): the boot rides the upper concave hull of the snow under the bent ski (ID one MR-D 1.66 m,
  tail −0.78 / tip +0.88 m about the boot, each ski half the load: inferred), the ski free to pitch; load → R → boot
  settles in 8 / 15 / 26 passes. The relief rises only to 0.38 m (boot relief 0.26–0.28 m, bridged 56–57 % of the
  turn, mass range 0.03–0.04 m, load 0.82–1.09 / 0.63–1.22 / 0.17–1.63 BW, mass/ski lateral 0.35 / 0.22 / 0.15):
  the bigger hit bends the ski into the trough, so bridging fills 29 % of the relief at 0.38 m and 12 % at 0.8 m.
  Above 0.39 m the load and the bend run away together (×2.4 a pass) and the ski snaps through to R 1.5 m. At
  0.8–1.2 m the legs would need 0.58–0.85 m of reach against 0.235 m. The 0.8–1.2 m ("kurpiers-2010 p10") was
  never read and no source states it; the one read course, kurpiers-2020 p338, a wave slope with no turns, has bumps
  of about 0.5 m 4 m apart on 19° (the height's datum unstated), the same order as 0.38 m. The 3.5 m spacing is
  inferred (the FIS pace times its time per bump). The derived field stands; no reach or airtime
  mechanism is added.
- P4 (2026-10-23): the moguls turn rides the absorption and the pendulum: load from the support, tan λ =
  (x_mass − x_ski) / h, the mass path from the pendulum's x_mass, the bump term `load · sin φ_boot`, the hit where the
  tip (+0.88 m) passes the trough's bottom (0.315 of the turn, was 0.543), a `mass height` goal (σ 0.05 m, the fore-aft
  σ, inferred); `massRadiusM` optional and gone from moguls; groomed profiles unchanged bit for bit. Rules 1–9 pass;
  no cell solves (5.2e-3 / 2.5e-3 / 2.1e-2): the outside ski's contact row at k18, the first pressed frame after the
  bridge, fights in all three, and the hit in dynamic. Three measures disagree: the reach bounds h square to the
  slope while the legs lean 28–35°; the load is the part square to the slope where groomed snow takes the resultant;
  the goal measures along the edged ski's normal, and the viewer's M4 regime test differs from P3b's hull. The outside
  knee folds over the crest and opens in the trough, deeper with intensity, ~20° short of the 105° fold; pelvis
  list reaches 20–24° (MogulHips 10°, inferred). P5 makes the three one geometry.
- P5 (2026-10-23): one edge-curve contact (`edgeContactOf`, curvature 1/R − sin|ε|/R_sc: M4 on a plane, P3b's hull
  at ε 0) for the boot's track and the contact rows; the reach along the leg, `REACH · cos λ`, solved with the
  pendulum by a fixed point; the load the resultant `s / (g cos λ)`; the height goal square to the slope. The derived
  relief fell to 0.16 m (from 0.38) and no cell solves (3.1e-2 / 4.7e-3 / 2.1e-2; moderate and dynamic stop
  unconverged at cost 5165 / 50843); dynamic peaks at 6.13 BW and fails rules 4 and 6; the list reaches 44°. The lean
  swings 0 to 37° each turn and peaks in the trough, where the legs must be longest, so it takes about
  L(1 − cos λ) ≈ 0.19 m off the reach there. Its lever is the skis' swing across, `ZIPPER.trackShare` 1.4, fitted with
  no source. The rigid viewer ski cannot follow the solved bend (R 2.3 m sags 0.14 m at 0.8 m). Next: measure the lean
  and the feet's swing under the pelvis on the head-on moguls clips (bumpA, bumpB, jdsA, jdsB), let S's bent ski carry
  the contact rows, then derive the relief again. arndt-1992 p1's 1 to 1.5 m is "only an indication" with no
  method or datum, so it bounds nothing; the fold's 105° is inferred (arndt-1992 p78: past 90° in one trial).
- M (2026-10-23, measured on four mogul clips, front and rear, reprojection gate passed): the feet swing across under
  the pelvis 0.42–0.48 m peak to peak (0.56–0.67 L, camera-free), turns 0.80–0.96 s, the legs (pelvis to ankles) lean
  22–33° at their peak (the three methods spread 5–10°), the pelvis lists 6–12° into the turn in the front views, and
  the camera-near-static clips swing the pelvis about a third as far as the feet. Through the pendulum the course's
  swing is about half the fitted 0.77 m. The lean peaks 0–0.18 of a turn before the most knee flexion (weak lock, half
  the FIS pace), against FIS p26–27's absorption from the face to the top; the standard stands, the timing is
  reported. P6 takes the swing from these clips and derives the relief again.
- S (2026-10-23): each ski bends as an arc of the solved R about the mount (`bendCurvatureOf`, channels
  `outside.bend` / `inside.bend`, decoded by name so stored tables read 0), drawn on the GPU in the capsule figure
  (56 segments, one uniform per ski); `skiRest` rests the bent ski by `edgeContactOf`, equal to `bootTrackOf`; the
  solve's touch, contact and tangent rows hold bent points. Moguls gentle and dynamic now solve (93.5 / 164.4, contact
  0.0 mm), moderate stops at 2.8e-7 unconverged; groomed costs move by under 3 % (steered dynamic 125 → 133).
  MogulHips still fails, 22.6° / 25.0° / 26.3° against 10°. The anatomy figure's skis are baked into its model and do
  not bend yet. `ride.ts`'s roll (the snow's bank) should check `edgeOf`, not replace it.
- S2 (2026-10-23): the anatomy figure's skis draw bent too: the baked box is rebuilt at load into 56 rows (same
  corners and skin), one `BentSkiMaterial` per ski bends it before skinning, shared with the capsule
  (`ski-bend-draw.ts`, `ski-geometry.ts`). The bend point is 7 mm ahead of the baked box's centre; on groomed the rest
  agrees with the capsule's to 0.3 mm, 14 mm apart fore-aft. Moguls rest is checked after the rebake.
- C2 (2026-10-23): every arndt-1992 citation in code checked against the thesis; riku-2007 and ando-2024 entered as
  read from their abstracts, neither paper located again.
- P6 (2026-10-23): the skis' swing from the clips by the pendulum transfer, `a_s = D(s + hω²)/(hω²)`, D the pelvis
  over the ankles: 0.62 / 0.62 / 0.84 L (bumpA, bumpB, jdsB), `MOGUL_SWING_M` 0.54 m for 0.77; the relief by rule 9
  0.28 m. Gentle solves (MogulHips 16.7°, MogulLegLean 16.9° against [17°, 38°]); moderate and dynamic do not (balance
  rows 2.7e-2 / 7.9e-2, contact 11.5 / 44.6 mm). Two faults in the measure: the pelvis is not the mass (h too low, D
  too high where the trunk stays up), and the harmonic transfer at the clips' pace (T 0.8–0.96 s) applied unchanged to
  cells turning twice as fast gives the physics' D 0.53 L where the clips show 0.28–0.33 L. `ZIPPER_CORRIDOR` still
  lays the root path and the heading, so the mass is laid on the old swing: two numbers for one path. The pelvis
  lists 17–24° where the clips show 6–12°.
- M2 (2026-10-23): the clips' whole-body mass (de Leva 1996's male table as typed by the agent, not checked against
  the paper) sits a few cm above and ahead of the pelvis: the mass line leans 20–22° (per-turn peaks 21.5–23.6°), the
  legs 22–25°, the trunk tilts 10–18° toward the lean; the mass lowers a_s by 3–11 %. The hip line's elevation out of
  the slope plane (yaw-free, unlike lean.py's 6–12°) peaks 12.5° / 10.0° / 21.6° (bumpA, bumpB, jdsB). The mass and
  the leg lean peak together mid-turn, 0.44–0.58 turn after the switch. The clips' world-frame across motion is not
  used: a 21° lean needs the mass to accelerate across at g tan λ ≈ 3.6 m/s², and GVHMR's root path gives 0.5–1.2 m/s²
  rms, uncorrelated or against the lean; the lean and the turn time are pose amounts, the path is the model's guess.
  So the measured amount is the lean, and the swing follows by the pendulum at each cell's own pace: the clips turn
  in 0.8–0.96 s, slower than every cell (0.70 / 0.50 / 0.38 s), so carrying their swing unchanged leaned the fast
  cells past what the legs reach (P6).
- T7 (2026-10-23): nothing in the moguls solve asks for the pelvis list (no prior, bound or band); the hips stay
  square to the legs, so the list follows the leg lean, and levelling it to 9° costs about 10 units of priors (hip
  rotation coupled to adduction at 50–70° flexion, adduction, spine bend) and leaves the infeasible rows as they were.
  The solve's 17–24° lies inside the clips' 10–22° (M2); the 10° cap was inferred and goes. MogulHips measures what M2
  measures and takes the clips' band, [9.8°, 23.5°] with their spreads.
- P7a (2026-10-23): every moguls cell rides the clips' mass lean, r = 0.381 (20.9°; bumpA, bumpB, jdsB), its skis'
  swing fitted by the pendulum at its own pace: 0.49 / 0.41 / 0.37 m (0.63 / 0.52 / 0.48 L), the mass following 37 /
  24 / 17 % of it, the line 23.8 / 20.1 / 18.4° off the fall line at the switch. Every line crosses x 0 at its switch,
  so one field tops them all with its moguls on that line (stagger 0, crestAt 0: derived). Rule 9 gives 0.34 m
  (dynamic: least support 0.01 g, peak load 1.79 BW). The bumps are one field and each cell cuts its rut along its own
  line, so a track's crest-to-trough follows from its line (gentle 0.385 m) rather than equalling the relief; P7b
  restates the viewer tests that pinned one corridor's track to it. The dynamic ride has more than one fixed point,
  so each fit starts cold.
- P7b (2026-10-23): one moguls path. The skis ride the cell's line, the root the physics' mass path, the head and the
  counter the mass's heading; `ZIPPER_CORRIDOR` is gone, the tracks are sampled along the line. MogulHips takes the
  clips' measure and band and passes (16–17°), with MogulLegLean (20–22°). No moguls cell closes: a 3e-5 contact
  residual, unconverged. Two faults remain. The solve's whole-body mass swings 0.35–0.48 of the skis' sweep where the
  physics swings 0.17–0.37: the pendulum pivots on the skis' line, the balance row on the pressure centre, mostly under
  the outside ski. And the skis were made to point along the line, dropping the pivot the moguls style holds (flat in
  the fall line at the switch, K1b), so the counter reads 15.5° at the switch; the line is the skis' path, their yaw is
  the path plus the skid. The moguls pose tests solve afresh until the rebake (a 120 s warm-up hook).
- P7c (2026-10-23): the pendulum pivots on the pressure centre, the ankle mid less δ = (½ − s_in) · stance, and fits r
  over the ankle mid; a_s 0.497 / 0.413 / 0.377 m, the mass following 38 / 25 / 19 %. The dynamic fit sits on the
  bend's snap-through edge, so rule 9 gives 0.32 m. The skis pivot again, flat at the switch and 27.1° across at the set
  (`MOGUL_PIVOT_MOST_DEG`, inferred from the old 1.1 m corridor until the moguls energy balance derives the skid). Gate
  MogulMassPath (measured: r's band [0.357, 0.417] from bumpA, bumpB, jdsB at slope ±5°, per frame within half of it)
  fails in every cell: the solved mass leans 16–18° over the ankle mid where the physics leans 20.8°. Three causes, one
  per definition: the solved ankle mid runs 3–8.5 cm inside the physics' line early in the turn; the solved pressure
  centre sits 6.4 cm outside the ankle mid where the physics puts 3.4 cm (its edged contacts 16.8 cm apart against the
  13.6 cm stance); and the counter band still reads the line's heading, so the pelvis yaws with the pivoted skis
  (counter 0.5–6.3°, pelvis 20° off the fall line) where the FIS standard faces it down the fall line. The physics
  samples the snow along the line, not the ski's yaw.
- P7e (2026-10-23): the path point is the ankle mid for every kind (GS and steered dynamic cost −0.9 % and −1.6 %, no
  term up). The solve's edge picks were right; one contact function serves the solve and the physics,
  c(ε) = ½ w · share(ε) · cos ε − H sin ε across from each ankle, H 0.139 m (binding and ski). P7c's goal had yawed
  the skis on the line, not the pivot; now the skis pivot in the solve too. The solved mass's peak lean over the ankle
  mid came inside the clips' band (0.388–0.392), its worst frame did not (0.13–0.18), and every moguls cell got worse
  (cost ×4–15, hip rotation, effort and prior fails, the pelvis 6–20° off the fall line to one side, counter 7–12°
  peaking at t 0.3). The physics' snow pulls at the switch (−1.37 BW) and the ridable relief falls to 0.26 m. The
  common cause is the planned edge, the lean plus `MOGUL_MARGIN_DEG` 25° (inferred), 40°+ where the solve holds ~24°:
  it sets the physics' contacts, the stance row's gap (stance / cos ε) and the band. A 25° margin is a gripping
  edge, not a pivoting one. So the pivot, the margin and the counter go to the clips (P7f) before the model changes.
- P7f (2026-10-23): on bumpA, bumpB and jdsB (13 turns, outside positive) the mass lean peaks 19.6° at turn time
  0.5; the shin roll less that lean, a margin proxy without boot cant or play, is 0–11° outside and 11–14° inside,
  well under the inferred 25°. The pelvis swings +11° to −24° off the fall line, most across at 0.92; the chest
  most across at 0.58 (−21°); chest − pelvis −12° to +7°. The skis' yaw is not measurable: GVHMR's feet miss the
  visible skis by 15–60° (`$S/p7f/*_yaw.png`), so the pivot and the counter stay unmeasured. The model reads one
  number, `MOGUL_MARGIN_DEG`, as the skid's attack, the edge margin and the skid share, and draws a second pivot
  (`MOGUL_PIVOT_MOST_DEG`) and omits the closure's γ_e. A skidding ski sits at the slip threshold, margin about 0.
  So P7g takes one attack from the energy balance and plans the edge at the lean.
- P7g (2026-10-23): one attack γ from the closure, edge at the lean on bumps; `MOGUL_MARGIN_DEG` and
  `MOGUL_PIVOT_MOST_DEG` gone. The snow no longer pulls (relief 0.30 m), but the closure needs the skis 57–60°
  across mid-turn and finds no root at moderate and dynamic (capped at 60°, +0.24 m/s a turn). No zipper skier
  brakes that way: the energy balance misses how mogul skiers control speed. Every moguls solve got worse (cost ×1.2–2.6,
  counter 39°, MogulMassPath peak 0.26–0.28, legs spread mid-turn). Drawing γ on groomed skis broke GS and
  steered (+122 %, +252 %), so groomed skis stay travel + set. P7f pooled a junior competition line with an
  instructor's rounder turns: different styles. Moguls work stops until the footage is tagged by line and
  technique (M3) and the speed control is read from it and the literature. Stopped the same day: P7a–P7g and
  per-line footage were moguls-only patches off this document's one model; work returns to §9's order.
- Three seeds on a 12-frame steered solve spread by 2.9e-3 (test floor 1e-4): a flat valley from the inequality
  bands and the soft counter; re-test with the hard band. The stored dynamic bake reports a CoM height of 0.573
  leg lengths while a 24-frame solve of the same cell gives 1.04–1.08: definition or solve, to be settled.
- Trunk, neck and arm capacities (E2b): the direction totals are measured (pan-2025 trunk, mortensen-2018 neck,
  holzbaur-2007 / kritzer-2024 / simpson-2019 / dourado-2025 arm) but every row's split is `inferred`: no
  moment-arm table was read, the shares are even or stated round arms, and a sense without a measurement
  (shoulder flexion, adduction, external rotation) takes the measured sense's total. `MAX_TORQUE` is built in code
  from `capacitySums`; `capacities.ts` reads anderson-2007 from `anderson.ts` to avoid an import cycle.
- K1a's picks sit at the rule-1 corner: ε − λ at the force peak is 0.3–0.7° in every GS cell and 4.6° / 0.5° in SL
  moderate / dynamic, so the figure has no hip angulation at the apex there. On the SL ski a long-radius carve at
  speed leaves none by construction (λ follows v²/(g r) with r = k R cos ε, and at fixed v the margin grows only
  ~0.7° per degree of ε_max), and GS dynamic cannot reach the carved peak band (1 / cos 35° caps the load at 1.22
  BW, so it uses the 1.0–1.3 mean band). To decide: a GS ski for the GS kind (`skiForKind`), lower GS speeds (loads
  then ~1.05 BW), a per-kind k from thorwartl-2023's bending data, or an SL skid share from a read source; the pick
  rule could target a typical angulation (10–15°, heinrich-2022) instead of the bound.
- The stored dynamic bake's CoM height (T2): a real solve difference, not a definition or frame one. Test and
  solver print the same `reportOf().comHeight` (CoM minus the pressure centre along the resultant, over the
  0.864 m leg length; standing 1.119). The stored 48-frame bake sits in a deep-crouch optimum around the switch
  (knees 100–113°, hip flexion 125–129°, 0.571 leg lengths at t 0.98) while a fresh 24-frame solve of the same cell
  stands at 1.04–1.07 at every event (knees 46° / 37° at the switch); the gentle and moderate bakes are fine
  (0.90–1.08). Two local optima; their costs were not compared. The fix is in the bake, not the test or the 0.6
  floor: coarse-to-fine (48 frames warm-started from the converged 24-frame solve) or multi-start keeping the
  lowest cost, with the crouch floor as a bake gate (module B2). The stored bake also predates the current sources
  (balance 12° off under today's tree), so stored-bake tests mean nothing until the rebake.
  B2's result (2026-10-21, three seeds per dynamic cell): the coarse 24-frame solves agree and stand tall (GS cost
  1228.5 from all three seeds, CoM 0.824, knee 94°; SL 1164–1167, 0.767; steered 301, 1.05), while every 48-frame
  solve, warm or cold, crouches for GS and SL (CoM 0.487 / 0.473, knee 137.7° at the switch, 10σ off the knee prior
  there; costs 5873 / 6459, five times the coarse, the smoothness block holding 3320 of GS's 5873 at max |r| 28.9σ,
  attributed 236 % to the outside-ski rows) and steered stays tall (1.014; the stored 0.571 crouch was a seed
  artefact). So the GS/SL crouch is a resolution effect, not a seed one: some term grows with the frame count.
  Suspects: a kink or seam jump in the profile that the contact rows make the skeleton follow (a kink's second
  difference costs ∝ S², a smooth curve's ∝ S, so `cycle.smoothness(1/(SMOOTH_SIGMA·(96/S)²))` is right only for
  smooth paths), or the switch margin (lean −10.7° with flat skis, m = 10.7°, 15° at engagement) that only a
  Z-leg crouch produces. A's diagnostic (2026-10-21, GS dynamic cold from the prior seed at 24/48/96 frames, `$S/a/`):
  neither. The profiles have no jump (seam mismatch ≤ 0.05°; ε's slope 43.9 → 9.1 °/turn into the switch, w's V at
  frame 0 and steered's `FINISH_HEADING` end are kinks, cost ∝ S², too small). The jump is structural: the
  `outside ski k` rows `dot3(rel(c), f)`, `dot3(rel(c), a)` pin the outside (Right) ski's centre to the path point,
  and the mirror makes the Left ski the outside one on the same path, so across the seam the body must move by the
  stance gap (across) and the inside lead (along) in one frame. The seam rows hold 59–77 % of the smoothness Σz²
  (top rows lumbar_bending, hip_rotation.R, inside_lead, pelvis_tz; lumbar bending jumps 13.3° across the seam
  against a 0.75° interior step); costs 1228.5 / 5873 / 68145 at S 24 / 48 / 96 (≈ S⁴ once settled, priors ≈ S);
  S 96 escapes the crouch with a pelvis spin instead (counter −126..164°). The tall 24-frame optimum meets the same
  switch margin (edge 0, lean −10.7°) at knee 79°, so the margin does not need the crouch; the seam does. Fix
  (module B3): the path point is the stance centre, the midpoint of the two ski centres in the snow plane; the
  outside ski sits gap/2 outside and lead/2 behind it (its track's radius differs from `r_ski` by ≤ 2 %, ignored).
  Mirror-symmetric by construction; no weight, σ or gate moves. Check: the cold sweep's cost doubles from 24 to 48
  frames and the CoM stays ≈ 0.8. The switch state itself (lean −10.7° on flat skis: a flat ski pushes only along
  the snow normal, so λ(0) ≈ 0 and the mass path should already bend toward the fall line at the gravity radius
  `v²/(g sin θ cos β)`, i.e. w(switch) > 0) is still wrong and goes to V with the kinks above. Decided 2026-10-22
  for V: the switch state is f(0) = 0 exactly, λ(0) = m(0) = 0, κ_mass(0) = g sin θ cos β(0) / v(0)², so
  w(0) = r_ski(0)·κ_mass(0) > 0 with zero slope at the mirror (`arcShareAt`'s "0 at the switch" and §4.4's "rising
  from 0" change with it); κ_mass is then continuous through the switch (cos β(1) = −cos β(0)), the old turn's mass
  path inflects inside the release with λ still into the old turn, and λ reaches 0 with ε at the switch.
  B3's result (2026-10-22): the stance-centre rows are mirror-correct and the skis' and CoM's world paths are
  continuous across the seam, but the crouch stays (GS 48 cost 5790, CoM 0.49, seam share 75 %; the seam steps
  of lumbar bending, hip rotation and pelvis rotation unchanged). The jump is in the configuration, not the path:
  the outside ski is pinned (heading, edge) while the inside ski's roll has no row, so the solve A-frames it onto
  the big-toe edge by 8–22° around the switch and rolls it into the turn only by frame 12; at the mirror the two
  skis swap roles, each physical ski jumps 7.5° in roll, ~5° in yaw and 2.8 cm in lead, the legs and pelvis
  (6.8 cm) absorb it and the trunk compensates 23° under the balance equality (`$S/c/findings.md`). Fix G1: the
  inside edge band |ε_in − ε_out| ≤ 5°, the contact-edge pick checked at the seam, the seed's stance centre on
  the path. Continuity in the rolls needs the band to exceed the profile's last-frame edge (4.1° at S 48, 12.4°
  at S 24), and the edge goal's slope differs across the seam (4.1°/frame before, 2.3° after at S 48): V's
  periodic switch state. E4 found the same A-frame on the stored steered table (inside femur 39° internal).
  G1's result (2026-10-22, `$S/g1/findings.md`): the band holds and steered converges, but GS dynamic cold goes
  infeasible at engagement and stands tall at both resolutions (CoM 1.05, knees 15°/45°, gap at the ski-clearance
  floor, inside lead ±26 cm). The leg probe explains it: the knee is a pure hinge whose flexion plane is yawed 7.6°
  from the ski (the template's foot progression), so in the frontal projection along the ski each hip joint sits
  thigh·sin(knee)·sin 7.6° outside its shin line (1.4 cm at 15°, 5.5 cm at 80°); the hips are 15.45 cm apart and
  the stance goal asks gap·cos ε = hip width, so parallel shins and 80° knees would need the shin lines 4.5 cm
  apart. B3 bought the crouch with an A-frame; G1 forbids it, so the legs straightened. Skiers close it with the
  shin's lateral play in the boot and with tibial rotation at the flexed knee; the model carried neither. G1b
  unlocks the subtalar coordinate as the boot's lateral play (±6°, inferred); knee rotation stays a sourced item.
  G1b's result (2026-10-22): every cold cell feasible, GS crouching as the prior asks (CoM 0.84, knee 95° at 24 and
  48 frames, cost 643 / 3943 against G1's 6304 / 137461), the gap off the clearance floor, the inside lead within
  0.3 BSL, the inversion +1..+6° on both sides with the +6° wall binding on half the GS frames (the figure's knees
  in). The 48-frame GS solve stops unconverged with 82 % of the smoothness at the seam, now in the hip rotations
  (0 → ∓17 → ∓12° over k 44–47–0) and the pelvis list (16 → 21.5 → 13.3°): the profile's switch takes ε from 24°
  to 0 over the last four frames while λ falls only to −10.7° (the switch state on flat skis), a 10.7° angulation
  reversal the 24-frame solve spreads and the 48-frame solve cusps. That is V's switch state and C¹ edge slope.
- Muscle distribution (E1a): BVLS static optimisation over blocks of connected muscles and coordinates, the
  co-contraction floor, modes and the 0–3 scale pass their toy and KKT tests. On heinrich-2022's force-peak frame
  two briefed relations fail, both on the capacity side. (a) The outside leg's largest activation is the medial
  hamstrings (0.84) above gluteus medius, vasti and gluteus maximus (0.70, 0.69, 0.69): gluteus maximus's
  external-rotation capacity must be cancelled by internal rotators under the probe's zero hip-rotation moment;
  the delp-1999 posture dependence (at 60–90° of hip flexion the gluteals and piriformis lose or reverse their
  rotation arms) is not modelled, and the probe carries no measured rotation moment. (b) The whole-frame residual
  is 0.50 against the 2 % gate because capacities-trunk gives every lumbar-and-thoracic muscle identical rows at
  both joints while the probe set the thoracic moment to 0 (heinrich reports one lumbar joint); with the thoracic
  moment equal to the lumbar one the residual is 0.17, the real conflict: heinrich's 1.88 N·m/kg lumbar extension
  exceeds pan-2025's 1.74 N·m/kg maximum before the 0.75 N·m/kg bending and the flexor floor. Decisions: an
  omitted coordinate in a moment frame is free (no equality row), never zero; the residual test becomes a relation
  (agonists at the bound wherever a residual remains, residual in the demand's sense); the trunk extension maximum
  needs an athlete source (R2) and hip rotation a posture-dependent arm (E2c); ρ 0.22 at the trunk is the knee's
  value by assumption. R2 (done, `$S/r2/findings.md`) settled both: heinrich's outside hip carries an
  external-rotation moment of 0.17 N·m/kg at ~79° of flexion (not 0), where delp-1999 makes the gluteals internal
  rotators (E2c); heinrich's 1.88 is the net demand about its single lumbar joint, so it sits on our lowest spine
  joint with the thoracic free; the athlete maximum is hildebrandt-2017's 4.53 N·m/kg extension and 2.44 flexion
  (109 FIS skiers, 53 men at 83.8 kg; standing, hips fixed, concentric 150°/s), 2.6 × pan-2025's seated isometric
  1.74, so pan stays the bending and rotation source only (E2c). §6.1's probe bands were the inside leg's; corrected.
  E2c's probe at 79° with the measured −0.17 N·m/kg: the leg-only residual is 0.32 (0.21 at 60°, 0.02 without the
  rotation row), sartorius, biceps femoris and the deep rotators at the 1.5 cap and the leg turning 22.9 N·m
  internal against 11.9 external demanded: the external-rotation capacity at a flexed hip is the binding limit,
  and the deep rotators carry piriformis's F_max only (rajagopal has no obturators or quadratus femoris), so it is
  underestimated; the whole frame 0.46, 0.22 with the thoracic free. E1b takes `legCapacitiesAt(79)` through its
  `capsAt` parameter, the thoracic-free rule and the outside leg's adduction (+0.1, not the probe's −0.45).
- E1b (done): the solver's raw moments feed the distribution (`moments.ts`: `momentsOf` is `effortOf`'s body
  until turn.ts is free, `momentsAt`, `modesAt`, `distributeTurn(motion, capsAt)`; an omitted coordinate is free;
  `.R`/`.L` rows act on one side). On a fresh 24-frame GS dynamic solve at its force peak (t 0.667, 1.17 BW)
  against heinrich-2022, N·m/kg model / measured: hip extension 1.50 / 1.27 and lumbar extension 1.21 / 1.88
  pass; knee extension 1.85 / 0.65, ankle 0.89 dorsiflexion / 0.50 plantarflexion, hip 0.86 abduction / 0.10
  adduction, hip rotation 0.73 internal / 0.17 external and lumbar bending 0.06 / 0.35 fail. Two causes, neither
  in the distribution. (1) The pressure centre sits at its tail bound (−13.95 cm along the ski, 8.5 cm behind the
  ankle) on frames 15, 16 and 23 while the fore-aft goal (sporri-2016 Fig 4: +3 to +6 cm at t 0.65–0.7) asks for
  the CoM ahead of the ankle; with no sagittal braking the CoM stands over the pressure centre, so the knee and
  ankle carry a tail-loaded stance (+5 cm along would put the ankle at 0.42). Which term beats a 2.5 σ fore-aft
  residual is read off B2's 48-frame rows (`reportOf` prints fore-aft and pressure-along) and settled in module F.
  (2) The angulation at the peak sits in the hip (the resultant passes 7.5 cm medial to the outside hip) with the
  trunk on the force line, where heinrich's skier keeps the hip on the line and bends the trunk (0.35 N·m/kg): the
  hip–trunk split of the margin m is unsourced (lateral bend is unobserved by the side-view priors); module F
  keys it on heinrich-2022 Table 1. Every frame has a muscle at 1.5 (tibialis anterior and the toe extensors on
  the tail-loaded ankle; sartorius, biceps femoris and the deep rotators on the inside leg late; transversus
  abdominis and quadratus lumborum), so the 2 % residual gate never applies; the per-coordinate relation fails
  on 22 of 24 frames wherever no bounded activation balances the frame (least-squares optimality spreads the
  residual: a muscle on several coordinates holds back where raising it worsens another); the lumbar and
  thoracic rows are identical, so distinct moments on the two joints (20.5 vs −2.9 N·m at frame 23) cannot be
  resolved. Gates unchanged; the live check is `test/solve/distribute-turn.solve.ts` under `test:solve` (60 s).

## Appendix A. Modules built before 2026-10-23

| Module | Files | Does | Agent |
|---|---|---|---|
| A physics core | `src/physics/turn.ts` (extend), new `src/physics/task.ts`, `src/physics/edge.ts`, tests in `test/physics-*.test.ts` | task table (§3) as data with status; `leanLoadAt` on the mass path (§4.1, §4.4); `edgeGoal(kind, t)` with margins and the sidecut relation (§4.2); feasibility checks (§4.3) as pure functions and tests; phase events (§4.7) | opus |
| B solver | `src/viewer/motion/turn.ts` | replace `physicsEdge = tilt` with A's edge goal; counter as a report quantity; events replace `PHASE_T`; carving radius from the sidecut; ski per kind from `skier.ts` | opus, after A's interface |
| C gates | `scripts/anatomy/pose-tables.ts` `--check`, new `src/viewer/motion/gates.ts`, tests | §8 as automatic gates over every solved kind × intensity, run in the bake and `bun run check` | sonnet |
| D visual WIP | `src/prototypes/` (new `model` page) | figure per kind × intensity × event with the physics numbers and gate flags beside the footage overlay; hidden agent-browser screenshots | opus |
| K1a reclassify, physics | `src/physics/task.ts`, `edge.ts`, `turn.ts`, `test/physics-*.test.ts` | kinds GS / SL / Steered / Moguls as presets (§1), ski per kind, cells re-derived under §4.3, `skiHeadingAt` and the counter band from the two paths (§4.5), events (§4.7) | opus, done |
| K1b reclassify, consumers | `src/viewer/motion/turn.ts`, `gates.ts`, `surface.ts`, `poses/regular-turn.ts`, `src/prototypes/model`, `test/invariants.test.ts` | one kind map, the skis' heading from `skiHeadingAt`, the counter as a hard band with one shared definition, invariants re-keyed to λ and the fitted boot | opus, done (§10) |
| K2 rename | pose ids, priors, probe keys, stored table keys | drill ids `regular-gs`, `regular-sl`, `regular-steered` (cruising renamed to steered, carving to gs, short turns to sl; steeps kept); stored tables re-keyed, no rebake (E3 owns it) | sonnet, done (§10) |
| K1c counter share | `src/physics/task.ts` `pelvisShare`, `src/physics/turn.ts` `counterBandAt`, `test/physics-turn.test.ts`, `test/physics-task.test.ts` | legacy, §4.5 now has no pelvis share: the pelvis share replaced the two-path pivot as the band's centre, τ ±10° (moguls ±20°); solver, report and gate keep their one definition; one bounded steered solve shows the trend | opus, done (§10) |
| V speed along the cycle | `src/physics/turn.ts` profile, `gates.ts`, `skiGoal.braking`, `turn-time.ts`, `surface.ts` | a periodic v(t) on the mass path from the energy balance (gravity along the path, gliding friction μ_k L per snow, the early skid's plough f tan γ with one closing attack angle γ_e per cell, the bump face on moguls, air drag), `speedMps` becoming the cycle's mean; the finish's skid tilts nothing fore-aft (the plough is square to the ski, so migrated cells' `braking` = atan(μ_k cos γ)); rule 7 (energy closes: γ_e ≤ 20° carved, 35° steered, inferred; moguls report only) and rule 8 (force peak at 0.4–0.6 per nakazato-2011; the short swing from a bounded bon-2021 re-read, the §4.7 "0.63–0.75" being unverified); playback period and path from the profile | opus, done 2026-10-22 (brief `$S/briefs/V-speed-cycle.md`): profile, switch state and periodic goals in; the cold GS table converges at 24 and 48 (§10); rules 7 and 8 fail in every groomed cell (energy: the user's call; the force peak: per-kind windows and `ARC_PEAK_T` from the measured peak time move to F); the pressure centre's 6.8 cm flip at the mirror moves to M; V2 (sonnet, done 2026-10-22): the steered dynamic share is derived from the 35° release centre at build time (0.7046, the mass heading 21.3° past the fall line at the release, hard groomed); the path test asserts the mirror invariant x(0) = −x(1) and z(1) = spacing; the groomed path now reaches x −5.16 m at mid-turn against the 7 m corridor edge and track 0.064 (the corridor width is not derived from the profile; an S item) |
| M ski contact and bend | `src/viewer/motion/turn.ts` contact, tangent and no-penetration rows, `src/viewer/surface.ts` field from the task, `gates.ts`, new `src/physics/ski-bend.ts`, `test/motion-turn.test.ts` (no table change: the viewer computes the bend from the goal) | §4.8: the pressure point on the snow and the ski tangent there, the bend allowance from the load (thorwartl-2023), the moguls field sized by the task; makes the moguls cells solvable; the one rebake of every cell after E3 | opus, after V (brief `$S/briefs/M-ski-contact.md`); its rebake covers V; amended after V (2026-10-22): the pressure centre across the ski moves with the edge angle (the centre line at ε 0, the lower edge once edged, transition width inferred) to remove the 6.8 cm balance-target flip at the mirror (§10, V's result); done 2026-10-23 through M2–M4 (pressed or bridged per ski and frame, allowance from the mount, edge picks from the goal): groomed cells feasible below the baseline cost; moguls wait on P1; rebake after E5 and P1 (§10) |
| P load dynamics | `src/physics/turn.ts` or new `src/physics/load.ts`, `gates.ts` | the outside-ski load = mass-path load + the CoM's normal acceleration from the solved flexion cycle; gated on nakazato-2011's 1.76–2.05 BW peaks; places the mogul hit; refines M's `R_bend` | opus, after M |
| S ski drawn bent | `capsule.ts`, `figure.ts`, `skier.ts`, `ride.ts`, `surface.ts` rest, `pose-table.ts`, `scripts/anatomy/pose-tables.ts`, `motion/turn.ts` bake | each ski an arc of the solved `R` per frame and side in its base-normal plane (`u² / 2R` about the mount), baked as curvature, drawn by a TSL position node; the boot rests on the same upper hull as P3b's track, one function for both | opus, after P4 |
| E2a capacities, legs | `src/viewer/motion/capacities.ts`, `content/sources.yaml`, `test/capacities.test.ts` | §6.3 `F_max × r` per leaf muscle and hip/knee/ankle coordinate, anderson-2007 sum check | opus, done |
| E2b capacities, trunk and arms | `src/viewer/motion/capacities-trunk.ts`, `effort.ts` `MAX_TORQUE` from the sums | §6.3 for the spine, neck, shoulder and elbow | sonnet, done |
| B2 multi-start solve | new `src/viewer/motion/solve-strategy.ts`, `scripts/anatomy/pose-tables.ts` `--cell`, `--compare` | coarse (S/2, three seeds) → lowest-cost feasible upsampled → warm fine solve; candidates table per cell in the bake log; fixes the deep-crouch optimum (§10) without touching a weight | opus, done 2026-10-21: all three dynamic cells solved; the coarse seeds agree and stand tall, the 48-frame solves crouch for GS and SL (§10) |
| E1a distribution, pure | `src/viewer/motion/distribute.ts`, `src/solve/bvls.ts`, `test/bvls.test.ts`, `test/distribute.test.ts` | §6.1–6.6 BVLS, modes, co-contraction floor, 0–3 scale, blocks of connected muscles; toy, KKT and heinrich-2022 probe tests | opus, done (two probe findings in §10) |
| E1b moments | `moments.ts` `momentsOf` / `momentsAt` / `distributeTurn`, `test/moments.test.ts`, `test/solve/distribute-turn.solve.ts` | the solve's raw moments into `distributeFrame`; an omitted coordinate is free; a pure refactor of `effortOf` so the bake stays valid | opus, done (§10) |
| F goals by events | `turn.ts` `foreAftAt` and the priors' keying, the angulation split | the fore-aft goal (sporri-2016 Fig 4) and the priors keyed by the cell's events instead of t; the hip–trunk split of the margin m from heinrich-2022 Table 1 (hip adduction and trunk lateral bend at the force peak); the `foreAftAt` drill-name branch goes (mid-foot for the other kinds becomes a kind number) | opus, after V (brief `$S/briefs/F-goals-by-events.md`: `phaseAt` registration by the cell's events, fore-aft as a kind preset, heinrich-2022 moment bands and force-peak point priors on the outside leg in place of pulling every moment to zero; after E4 also the inside edge band and the inside-hip rotation check); amended after V (2026-10-22): rule 8's window per kind (GS 0.68 kroll-2015, SL 0.51 reid-2010, steered 0.4–0.6 nakazato-2011, moguls at the hit) and `ARC_PEAK_T` per kind derived from that measured peak time instead of the inferred 0.61; done 2026-10-23 except the applied arc peak, which opens rule 7 and stays reported (§10) |
| L inside fold from geometry | `src/viewer/motion/turn.ts` prior build, tests | the inside leg's hip and knee targets = the outside prior + Δκ, the fold that shortens the inside leg by the rise HIP_WIDTH · sin λ / cos ε of the cell's own lean and edge; the source's raw inside curve (heinrich-2023, lean ≈ 54°) is a ceiling, not a target; groomed kinds, moguls after P | opus, done 2026-10-23: every groomed cell feasible, steered dynamic reaches its fold; SL dynamic, GS dynamic and GS gentle fall short (§10) |
| T tibial rotation | skeleton, `src/viewer/joint-limits.ts`, `src/viewer/motion/turn.ts`, tests | ISB knee axial rotation `knee_rotation.R/L` after the hinge, limits growing with flexion, zorko-2015's outside-knee prior; heinrich-2022's split signs | opus, done 2026-10-23: every cell calmer (273–395 iterations, from 750–1805), inside knee z −2.1 SL / −2.6 GS dynamic, just past 2σ; its torque reaches the muscles through E5 |
| P2 moguls body from the snow | `src/physics/turn.ts` moguls branch, `src/physics/zipper.ts`, the moguls goal in `src/viewer/motion/turn.ts`, tests | §4.4 mass path from the track by the balance; §4.8 absorption and the hit | opus |
| P3 ridable moguls | `src/physics/moguls.ts`, `task.ts` rule 9 and the moguls presets, `zipper.ts`, `test/physics-moguls.test.ts` | §4.8 contact in the absorption, the reach from the skeleton, the field's relief from the dynamic ceiling, the pendulum without the division | opus |
| P3b ski over the bumps | `src/physics/moguls.ts`, `zipper.ts`, `task.ts` moguls relief, physics tests | §4.8 the boot's track under the bent ski, load and bend together; the relief re-derived | opus |
| P4 moguls wiring | `src/physics/turn.ts`, `task.ts`, `src/viewer/motion/turn.ts`, `regular-turn.ts` moguls rows, `Model.tsx`, tests | §4.8 the turn's load, lean, mass path, bump term and hit from the absorption and the pendulum; the CoM height block | opus |
| P5 moguls one geometry | `src/physics/moguls.ts`, `turn.ts`, `task.ts`, `src/viewer/motion/turn.ts` contact and mass height, tests | §4.8 reach along the leg (h / cos λ) by a fixed point with the pendulum, load the resultant, one edge-curve contact for the boot's track and the contact rows (M4 on a plane, P3b's hull at ε 0), the height goal square to the slope | opus |
| P6 moguls measured swing | `src/physics/zipper.ts`, `task.ts`, `gates.ts`, tests | the skis' swing from the clips' feet offset through the pendulum, one course; gate `MogulLegLean` [17°, 38°] from the measured leg lean; the relief by rule 9 again | opus, after S |
| C2 arndt citations | comments, `content/sources.yaml` | every arndt-1992 page and claim against the thesis text; riku-2007 and ando-2024 entries | sonnet, after S |
| P7a moguls line from the lean | zipper.ts, task.ts, moguls.ts, tests | the mass line's measured lean ratio r for every cell; each cell's swing by the physics' pendulum at its pace; the crest at each switch; the relief by rule 9 | opus, after M2 |
| P7b one moguls path in the viewer | surface.ts, turn-heading.ts, regular-turn.ts, pose-solver.ts, gates.ts | `ZIPPER_CORRIDOR` retired: heading from the cell's line, root on the physics' mass path; MogulHips measured as M2 measures it, band from the clips; T7's cause | opus, after P7a and T7 |
| P7c moguls pivot and mass | moguls.ts, physics/turn.ts, turn-heading.ts, gates.ts, tests | the pendulum pivots on the solve's pressure centre and fits the measured lean over the ankle mid; the skis pivot again (yaw = line + skid, the pre-P7b amplitude kept as inferred until the moguls energy closes); gate MogulMassPath | opus, after P7b |
| P7e moguls one geometry with the solve | physics/turn.ts, moguls.ts, motion/turn.ts, pose-solver.ts, turn-heading.ts, tests | the line is the ankle mid's in physics and solve; the physics' pressure centre from the solve's own contacts; the counter band from the pivoted skis' yaw less the mass heading | opus, after P7c |
| P7f moguls yaw, counter, edge measured | read-only, `$S/p7f/` | skis' yaw, pelvis, chest, shin roll and λ per turn time on bumpA, bumpB, jdsB (jdsA beside), with spreads and the noise floor | opus, after P7e |
| P7g moguls one attack, edge at slip | physics/turn.ts, task.ts, turn-heading.ts, motion/turn.ts, pose-solver.ts, tests | one attack γ(t) from the energy closure drawn on the skis for every kind; moguls planned edge = lean; `MOGUL_MARGIN_DEG`, `MOGUL_PIVOT_MOST_DEG` gone | opus, after P7f |
| P7d moguls fit speed | moguls.ts | the two rule-9 tests back inside their 5 s, values bit-identical; the time is in `mogulMassOf` under `swingForLean` (moguls.ts ~386, ~434-441), not zipper.ts (~0.2 %) | sonnet, after the moguls edge settles |
| C moguls citations | `content/sources.yaml`, `zipper.ts`, `task.ts`, viewer-surface test comments | every course and pace number to a read source or inferred | sonnet |
| Q priors by lean | `src/viewer/prior/prior.ts` `interpolate`, `scripts/prior/build.ts` (each example's lean), its call in `turn.ts`, prior tests | §5: odd harmonics scale by the lean below the lightest example | opus |
| Q2 trunk_across by lean | `src/viewer/prior/prior.ts`, prior tests | §5: a derived quantity signed toward the inside scales whole | sonnet |
| E5 knee-rotation effort | `capacities.ts` `knee_rotation` rows, `effort.ts` `sumsOf`, `content/sources.yaml`, `test/capacities.test.ts` | §6.3 for the tibia's axial rotation: the medial hamstrings, gracilis, sartorius and popliteus internal, biceps femoris and TFL external, arms scaled to hrycyna-2011's maxima | opus, done 2026-10-23: external 55.2 N·m (ΣF 2282 N, arm 24.2 mm), internal 42.6 N·m (ΣF 3604 N, arm 11.8 mm), all inferred; `MAX_TORQUE` 27 → 29 rows; GS dynamic cost 374.7 → 374.8 |
| E4 steered inside-hip moments | read-only diagnostic on the stored steered table (`$S/e4/findings.md`, scripts beside it) | why the inside hip rotation demands −44.8 N·m (−0.68 N·m/kg, external) where heinrich-2022's inside hip carries ≤ 0.23 internal: the stored steered solve A-frames (inside ski 0–4° off the slope normal under a 40–44° outside edge, inside femur +26..+40° internal, 23–26° adducted); at hip 90° and knee 93° the femur axis is near horizontal, so hip "rotation" is the shank's frontal swing and R's 112 N lateral component acts on a foot 0.44 m off that axis; an FK override to heinrich's external rotation flips the sign at the same force line. A per-ski force closure does not fix it (the lateral remainder lands on the outside hip, +0.85 N·m/kg). Cause in the solver: `edge band k` holds the outside ski only; the inside ski's roll has no row. Also: inside/outside knee extension 0.51–0.80 inside kroll-2010's band (the 0.978 vasti ratio is the saturated inside biceps femoris); lumbar bending demand 0.80 N·m/kg on target against pan-2025's 0.93 seated maximum (capacity row too low); the stored counter sits below the K1c band (table predates K1c). Fix in F: inside edge band \|ε_in − ε_out\| ≤ 5° (parallel shins, inferred cuff play), hip-rotation rows in `Gate.Moments`, pan-2025 rows as a sourced item | opus, done 2026-10-22 |
| R2 capacity sources | `$S/r2/findings.md`, then `content/sources.yaml` | heinrich-2022's hip rotation moment and lumbar joint, delp-1999's rotation arms by hip flexion, an athlete trunk-extension maximum | sonnet, done (§10, `$S/r2/findings.md`) |
| E2c capacities by posture, athlete trunk | `capacities.ts` `legCapacitiesAt(hipFlexionDeg)`, `capacities-trunk.ts` lumbar flexion-extension, `content/sources.yaml`, `test/capacities.test.ts` | delp-1999's rotation arms by hip flexion (0 / 60 / 90°, linear between; gluteals, deep rotators, iliopsoas); the whole-spine maximum from hildebrandt-2017 (4.53 / 2.44 N·m/kg, 109 FIS skiers); source entries for heinrich's re-read, delp and hildebrandt | sonnet, done (§10) |
| E3 bake and display | `effort-table.ts`, `effort-tables.json`, `pose-tables.ts --check` rows, `src/content/effort.ts` adapter, model page strip and lit figure, `test/effort-derived.test.ts` | §6.6–6.8: baked per migrated drill × intensity, served through the legacy adapter, EMG source tests | opus; code, adapter, model-page strips and lit figure, tests done 2026-10-21 on the steered-only table (E3b, `$S/e3b/shots/`): momentBalance fails in all three steered cells (0.29–0.43 vs 0.02; inside hip rotation −44.8 N·m demanded, +20.8 delivered → F), six EMG source findings (kroll-2010 inside/outside vasti 0.98 vs 0.3–0.7, hermann-2023 quad/ham < 1, 31 derived levels fall with intensity); the nine-cell rebake waits for B3; meanwhile 39 stored-bake tests fail with "no q-table" because `MIGRATED` lists gs/sl; lint: effort-bake.ts:65, pose-tables.ts:114 return types |
| B3 stance-centre path | `src/viewer/motion/turn.ts` `outside ski k` position rows, `test/motion-turn.test.ts` | the path point is the stance centre (midpoint of the ski centres), not the outside ski's centre: removes the mirror-seam jump behind the 48-frame crouch (§10 T2); verified by the cold sweep at 24/48 frames (cost ×2, not ×5) | opus, done 2026-10-22: rows mirror-correct (`test/motion-seam.test.ts`), world paths continuous, crouch not removed (GS 48 cost 5790, CoM 0.49, seam share 75 %): the seam jump is the role swap of the pinned outside ski and the free-rolling inside ski (`$S/c/findings.md`, G1); steered 24 regressed only because `placePelvis` still seeds the outside ski on the path (unconverged) |
| G1 inside edge band | `src/viewer/motion/turn.ts` new `inside edge k` inequality, `placePelvis`, report line; `test/motion-seam.test.ts` | \|ε_in − ε_out\| ≤ 5° (parallel shins, the boot locks inversion; inferred), the inside contact-edge pick checked at the seam, the seed's stance centre on the path; gate: GS dynamic cold at 24/48 frames against `$S/b3/sweep-*.log` (CoM ≈ 0.8, knee < 100°, seam share ≪ 75 %) | opus, done 2026-10-22 (`test/motion-inside-edge.test.ts`, `$S/g1/findings.md`): the band holds at 5.0° in every frame and steered converges feasible at 24/48, but GS dynamic cold ends infeasible at engagement and tall (CoM 1.05, knees 15°/45°, gap at the 12.2 cm ski-clearance floor, inside lead −26..+27 cm, trunk 118° at the seam); cause: the hinge knee's flexion plane is yawed 7.6° from the ski, so flexion pushes the hip joints off the shin lines by thigh·sin(knee)·sin 7.6° (5.5 cm at 80°) while the hips are 15.45 cm apart and the band holds the shins parallel: the crouch needs an A-frame (B3's 11–27°) or lateral play of the shin in the boot → G1b |
| G1b boot lateral play | `src/viewer/skeleton.ts` (subtalar `dof` unlocked), `src/viewer/joint-limits.ts` `BOOT_LATERAL_PLAY`, `turn.ts` report line; `test/motion-boot-play.test.ts` | the existing `subtalar_inversion` as the shin's roll off the ski inside the boot (cuff, liner, foot; ±6°, inferred; carried by the shell: no effort row, no prior); the ±5° ski band stays; gate: GS dynamic cold at 24/48 converged and feasible, CoM ≈ 0.8, knee max 70–100°, gap ≈ 15.5 cm, lead within ±10 cm | opus, done 2026-10-22 (`test/motion-boot-play.test.ts`; the subtalar axis is the tibia's x, 15° off the ski's long axis, so 6° of inversion rolls the ski 5.8° and pitches it 1.45°: the test checks a Rodrigues rotation about that axis). Cold GS 24: cost 643, converged, feasible, CoM 0.842, knee 94.5°, seam share 31 %; GS 48: 3943, feasible but not converged (37 outer), CoM 0.840, knee 94.8°, seam share 82.5 %; steered 24/48: 140 / 382, converged, CoM 1.06, knee 65°. Gap 12.2–17.9 cm, inside lead ≤ 0.29 BSL at GS, inversion +1..+6° on both sides (knees in, the +6° wall binding on half the GS frames). The GS 48 remainder is at the switch: ε drops 23.9 → 4.1° over k 44–47 while λ drops 24 → 10.7°, so the hip rotations swing 0 → ∓17 → ∓12° and the pelvis list 16 → 21.5 → 13.3° across the seam (hip_rotation z ±30, pelvis_list −30 at k 47): V's switch state (λ(0) = 0) and C¹ edge slope |

Interface A → B: `taskFor(kind, intensity): TurnTask`, `massPathForcesAt(task, t): {lean, load, heading}`,
`edgeGoalAt(kind, task, t): {edge, marginMin, marginMax}`, `eventsOf(kind, task): TurnEvents`, `skiForKind(kind)`.
