# Ski biomechanics: movement analysis for skibuddy content

Status: research draft, 2026-10-15. Nobody has reviewed it: no instructor, examiner, physio or biomechanist.
Licence: CC BY-SA 4.0, like `content/`.

This document is the source that drill movements, activations and exercise targets are written from.
It is association-neutral. Association task pages are cited only where they describe a drill or a
movement pattern. They never define a drill.

## 0. How to read this

### 0.1 Conventions

- **Sides.** *Outside* is the leg on the outside of the turn, the one the turn is balanced on. *Inside* is the
  other leg. In traverses and slips, outside means the downhill ski and inside the uphill ski, as the
  association task pages use them.
- **Phases.** *Initiation* runs from the release of the old edges to the engagement of the new ones, up to
  about the fall line. *Shaping* runs around the fall line, while edge angle and load build. *Finish* runs
  from after the fall line to the release. Drills that are not turns (slips, stops) map their own sub-phases
  onto these three; each drill says how.
- **Effort, 0 to 3** (the schema's `intensity`): 0 idle; 1 low, postural or stabilising; 2 moderate, a clear
  working role; 3 high, prime mover against the full turn load, or measured near or above maximal
  voluntary contraction (MVC). Numbers are relative within the drill. They are never percentages unless a
  source measured one.
- **Contraction.** *Concentric* means the muscle shortens and produces the movement. *Eccentric* means it
  lengthens under load and brakes the movement. *Isometric* means it holds a position. Under ski loads,
  "the knee flexes" usually means the extensors yield eccentrically. It does not mean the flexors pull.
- **Confidence**, as the schema defines it, applied strictly:
  - **high**: this muscle was measured (EMG, or a model tracked to EMG) in this movement, or in a ski
    movement that is the same thing under another name (a GS turn for long-radius carved turns).
  - **medium**: inferred from related studies. Either (a) the muscle was measured in skiing but in a
    different movement, or (b) the joint action is mechanically certain and a non-ski EMG study measured
    this muscle in a task with the same joint action and load direction.
  - **low**: mechanics or expert reasoning only.
- **Pelvis-on-femur.** Standing on one leg, the hip abductors of the stance leg hold up the *other* half
  of the pelvis. When they work, the stance hip moves into abduction with the pelvis moving on a still
  femur (Neumann 2010). This is how "lifting the inside hip" works when the inside foot is off the snow.
- **Balance axis.** Following LeMaster, forces and "up/down" are described in the skier's frame. The
  balance axis is the line through the centre of mass along the resultant of gravity and the turn's
  centripetal requirement. In balance it coincides with the line of the snow's force
  (lemaster-2010-planes). "Load" in this document means force along that axis, which in a turn exceeds
  body weight.

### 0.2 What the evidence base actually is

- Measured on snow (EMG or EMG-tracked models): wedge, short-radius parallel and GS turns
  (hintermeister-1997); SL and GS (hintermeister-1995, zeglinski-1998, berg-1995, berg-1999); recreational
  turns, inside versus outside leg, for vastus lateralis and rectus femoris only (kroll-2010, kroll-2011);
  flexion versus extension transitions for rectus femoris, vastus lateralis and gluteus medius, both legs
  (seifert-2023); plough, V-step climbing, short and medium turns for thigh groups (hermann-2023); slalom
  on one leg by an amputee racer (ishige-2021); one GS-style carved turn with an EMG-validated
  musculoskeletal model, both legs (heinrich-2023) and its joint moments (heinrich-2022).
- Never measured: any named drill except wedge turns and the two transition styles. No EMG exists of stork,
  javelin, thousand-steps, sideslip, falling leaf, hockey stop, garland, pivot slip or hop turns.
- Never measured in skiing at all: iliopsoas, TFL, sartorius, gluteus minimus, quadratus lumborum,
  tibialis posterior, popliteus, any arm or shoulder muscle. Everything said about them on snow is
  inference.

### 0.3 Method: derived top-down, not from a muscle list

Every drill is derived in this order. Muscles come last.

1. **Task and forces per phase.** The forces are gravity, the snow's reaction (normal and friction) and
   the turn's centripetal requirement. Their resultant sets the balance axis. The key output is where the
   centre of mass sits relative to the base of support, fore-aft and laterally (F1, F3, F10).
2. **Kinematics.** A joint-by-degree-of-freedom matrix per side and phase (2.2 and the end of each
   drill), with angles where data exist (pose guide 2.0, F9, F11).
3. **Kinetics.** For each degree of freedom, the direction of the net internal joint moment, and whether
   the joint moves with it (concentric), against it (eccentric) or not at all (isometric). Measured
   moments come from the musculoskeletal model of a carved turn (heinrich-2022, heinrich-2023). Elsewhere
   the direction is reasoned from the force's line relative to the joint. The turn baseline (2.2) carries
   a moment column.
4. **Muscles.** Every muscle that can produce that moment at that joint position, including
   co-contraction pairs. Moment arms change with joint angle, notably hip rotation with hip flexion
   (delp-1999).
5. **Evidence and effort.** Effort is calibrated from EMG where it was measured (table below). Otherwise
   confidence is medium (the muscle was measured in a related ski movement, or a non-ski task with the
   same joint action) or low (moment reasoning only).

**%MVC to effort (proposed).**

| Effort | Mean EMG over the phase | Typical meaning |
|---|---|---|
| 0 | under 5 % MVC | idle |
| 1 | 5 to 20 % MVC | postural, stabilising |
| 2 | 20 to 50 % MVC | clear working role |
| 3 | over 50 % MVC, often with peaks over 100 % | prime mover against the turn force |

Calibration anchors: in parallel and GS turns, vastus medialis and lateralis, biceps femoris, gluteus
maximus and adductors averaged above 50 % MVC, with peaks above 150 % (hintermeister-1997): effort 3.
Other measured anchors:
- in instructors' slalom on snow, mean vastus medialis was 65 % MVC and rectus femoris 43 % MVC. Rectus
  femoris peaked at the start of the cycle, in the inside position, and vastus medialis mid-turn on the
  outside leg (panizzolo-2013);
- whole-quadriceps EMG of recreational women averaged about 145 % to 153 % MVC across tasks, with a
  quadriceps-to-hamstrings ratio of about 4.5, highest in the plough and lowest in short turns
  (hermann-2023);
- in a simulated edged single-leg stance, biceps femoris was 12 % to 35 % MVC and semitendinosus 6 % to
  15 % MVC, with biceps femoris rising on wider skis (zorko-2020). A
muscle whose activity the authors report as lower than another's is placed one step lower only when the
ratio is about half or less (for example inside vastus lateralis about 54 % lower than outside:
kroll-2010). EMG normalised to something other than MVC (mV in seifert-2023, model activation in
heinrich-2023) is used only to rank muscles, not to set absolute effort.

**Contraction by phase, the default rule.**
- Absorbing load through shaping (joint flexing under an extension moment): eccentric.
- Extending through the transition: concentric.
- Holding a shape: isometric.
- Hop turns and leapers add a stretch-shortening cycle for the calf, quadriceps and gluteus maximus:
  eccentric landing or loading followed at once by concentric take-off.

### 0.4 Movement primitives and fundamentals

Drills reuse a small set of movement primitives. Each primitive has its own rows in the DOF matrix (2.2),
and each drill is written as primitives plus modifiers. The association fundamentals named on the task
pages read are the checklist each drill must show:
- (a) control the centre of mass relative to the base of support to direct pressure along the skis;
- (b) control pressure from ski to ski, toward the outside ski;
- (c) control edge angles through inclination and angulation;
- (d) control ski rotation with leg rotation, separate from the upper body.

These were paraphrased from the PSIA-AASI Central task pages' "Fundamental Focus" lines (for example
psia-c-railroad-tracks, psia-c-hockey-stops).

| Primitive | Rows it owns (2.2) | Core muscles | Fundamental |
|---|---|---|---|
| P1 Stance-leg edge hold | outside ankle eversion, knee and hip flexion/extension, hip abduction | peroneals, vasti, gluteus maximus, gluteus medius and minimus, TFL, adductor magnus | b, c |
| P2 Inside-leg shortening (loaded) or retraction (unloaded) | inside knee and hip flexion | loaded: vasti and gluteus maximus eccentric. Unloaded: iliopsoas, rectus femoris, hamstrings concentric | b, c |
| P3 Ankle flexion into the tongue | ankle dorsiflexion, both legs | tibialis anterior, extensor digitorum longus, extensor hallucis longus, fibularis tertius; soleus as the eccentric counterpart | a |
| P4 Transition by extension | knee and hip extension at initiation | vasti, gluteus maximus concentric | a, b |
| P5 Transition by flexion | knee and hip flexion at initiation | hip flexors and hamstrings concentric; vasti isometric | a, b |
| P6 Tipping and edge release | ankle inversion/eversion, early | peroneals (new outside), tibialis anterior and posterior (new inside) | c |
| P7 Leg rotation (steering) | hip rotation | outside: anterior gluteus medius and minimus, TFL, adductors. Inside: deep rotators, gluteus maximus, sartorius | d |
| P8 Counter-rotation | pelvis and thoracic rotation | obliques (one side's external with the other side's internal), multifidus | d |
| P9 Hip angulation | outside hip abduction (pelvis-on-femur), pelvis hike, lumbar and thoracic lateral flexion | outside gluteus medius, minimus and TFL; inside quadratus lumborum and obliques | c |
| P10 Inside-leg lift | inside hip and knee flexion with no load | iliopsoas, rectus femoris, TFL, sartorius, hamstrings, gracilis | b |
| P11 Edge set / braking | ankle eversion, knee and hip flexion under a sudden load | peroneals, vasti and gluteus maximus eccentric, hamstrings | c |
| P12 Pole swing and touch | shoulder, elbow and wrist of the touching arm | anterior deltoid, latissimus dorsi, teres major; forearm flexors for grip | timing |

| Drill | Primitives | Modifiers | Fundamentals shown |
|---|---|---|---|
| D1 Stork | P1, P3, P6, P7 (small), P8 (slight), P9, P10 (tail only), P12 | tip stays on snow; inside half of the pelvis fully unsupported | a, b, c, d |
| D2 One-ski | P1, P3, P6 (stance foot alone), P9, P10 (whole ski) | lift before the edge change | a, b, c |
| D3 Javelin | P1, P3, P7 (large), P8 (large), P9, P10 + inside adduction | lifted ski crossed | b, c, d |
| D4 Thousand steps | P1 and P10 alternating, P3, P6 | continuous stepping | a, b, c |
| D5 Railroad tracks | P3, P6, P1 (light) | no steering; edge angle small | a, c |
| D6 Sideslip | P3, P6 (as release and set), P8, P9 | skis across the hill, flat | a, c, d |
| D7 Falling leaf | D6 + P3 fore-aft | fore-aft cycling | a, d |
| D8 Pivot slips | P6 (release), P7 (large, both legs), P8 (large) | skis flat | c, d |
| D9 Hockey stop | P7 (fast), P8, P11, P9 | pivot then edge set | c, d |
| D10 Garlands | P6, P7, P1, P8 | one side only, never past the fall line | a, c, d |
| D11 Hop turns | P4 with SSC, P5 in the air, P11 (landing), P12 (strong plant) | flight phase | a, b, c |
| D12 Short turns | P1, P2, P3, P6 (fast), P7, P8 (large), P12 | fast tempo | a, b, c, d |
| D13 Long carved | P1, P2, P3, P6, P9, P4 or P5, P12 | high edge angle, slight counter | a, b, c, d |
| D14 Wedge | P1 (on the inside edge of the wedge), P3, P9 (small) | both hips abducted and internally rotated; no edge change | a, b |
| D15 Skating | P1 (push), P10 (recover), P12 (optional) | propulsion | a, b, c |
| D16 Uphill ski | P1 on the inside ski (inversion), P10 for the outside ski, P9 mirrored | balance on the little-toe edge | a, b, c |
| D17 Transitions | P4 versus P5, then D13 | — | a, b |
| D18 Step turns | P10 alternating, P7 (inside ER), P1 | stepping into the fall line | b, d |

### 0.5 Search protocol

- **Databases.**
  - PubMed, through the NCBI E-utilities (esearch, esummary, efetch, elink), because the PubMed website
    serves a bot check to curl.
  - PMC full text through efetch (db=pmc), or the PMC article page when the XML has no body.
  - EBI OLS4 for FMA identifiers.
  - Publicly readable association and publisher pages, fetched with curl.
  - Web search only to locate URLs. Nothing was cited from a search snippet.
- **Terms**, combined as needed:
  - "alpine skiing" or "skiing" with electromyography, kinematics, "joint angle", "ground reaction
    force", "inverse dynamics", "joint moment", "edge angle", trunk, "ski boot", "forward lean", "stand
    height";
  - author searches for the Salzburg, Innsbruck, Ljubljana and Oslo groups (Spörri, Kröll, Müller,
    Heinrich, Nachbauer, Supej, Gilgien);
  - non-ski kinesiology terms for hip flexors, gluteus medius and minimus, TFL, quadratus lumborum, spine
    rotation and ankle dorsiflexion.
- **Inclusion.** Human participants; alpine skiing on snow, or a non-ski task with the same joint action
  and load direction; numeric EMG, angles, forces or moments. For instructional content, publicly
  readable pages only.
- **Exclusion.**
  - Cross-country, snowboard, sit-ski and ski jumping (except as an explicitly labelled analogy).
  - Injury epidemiology without biomechanics.
  - Pages behind logins or bot walls.
  - Books not available to read.
- **Read status.** "full" means methods, results and tables were read. Many PubMed records have no open
  full text, and those are marked "abstract". Where a claim rests on an abstract, only what the abstract
  states is used.

## 1. Foundations

Each claim lists the segments that move, which way, and the muscles that produce or brake the movement.

### F1. Forces through the turn

**Claims.**

1. In the skier's frame the snow's force acts along the balance axis. Its size rises from low at initiation
   to a peak after the fall line. In GS (11 regional-level racers, pressure insoles), the outside foot's mean
   normal force was 218 % of its initiation value in steering before the gate, 279 % in steering after
   the gate and 187 % in completion. The phases took about 21 %, 33 %, 32 % and 14 % of the turn. The
   outside-to-inside split went from about 50/50 at initiation to about 75/25 at the end of steering. The
   inside foot stayed nearly constant until it fell in completion (falda-buscaiot-2017, full text).
   Force peaked in the second half of steering (after the gate), where the skier's path turns away from the fall line and gravity no longer
   helps the turn (falda-buscaiot-2017). Hintermeister attributed peak EMG late in the turn to the same
   combination of turning and gravity forces (hintermeister-1995).
2. The outside foot carries most of the load. In GS the mean normal force was 0.68 body weight (BW) outside
   against 0.40 BW inside. The inside foot's load did not change much with turn phase or slope
   (falda-buscaiot-2017). In a modelled carved turn about 60 % of the total force acted on the outside
   ski (heinrich-2022).
   - With force plates under both skis, the outside phase averaged 1.0 to 1.3 BW (peak 1.6 to 2.1) and
     the inside phase 0.45 to 0.62 BW. Experts on steep terrain peaked highest, and intermediates peaked
     at about 1.6 to 1.7 BW (nakazato-2011).
   - In modelled outside-ski force by phase, initiation was 0.54 BW, early steering 1.48, late steering
     1.83 and completion 0.64 (zorko-2015).
   - The inside ski's share depends on turn type. At the end of the turn, instructors' inside foot
     carried about 0.3 BW in a parallel turn but about 0.9 to 1.0 BW in a short turn (bon-2021). In one
     instrumented instructor, the inner ski's radial force was 517 N carving against 56 N in skidded
     parallel turns (thorwartl-2023).
   - Asymmetries between left and right turns can be large even in elite slalom skiers: the outside
     foot carried 126 % against 114 % BW in left and right turns, and was not explained by strength
     asymmetry (ogrin-2021).
3. Faster GS skiers apply a higher normal force in the middle of the turn and less at the switch, and
   change force faster (delhaye-2025). Flexing the legs near the transition helps keep the skis on the snow,
   and reducing up-and-down motion lowers the peak force (komissarov-2022b).
4. Most of the leg work is braking. In GS the knee extensors of the outside leg spent about twice as long
   lengthening under load (about 1.0 s) as shortening (about 0.5 s), at slow speed and near-maximal EMG
   (berg-1995, berg-1999). Across elite disciplines a large share of the cycle is quasi-isometric. In GS
   that was 34 % on the outside leg against 20 % on the inside (alhammoud-2020). Over a GS run, the
   negative mechanical work done by the skier's own activity was about three times the positive
   (hladnik-2026).

**Segments, directions, muscles.**

| Phase | What happens | Producers / brakes |
|---|---|---|
| Initiation | Load low. The centre of mass crosses over the skis. Legs extend (extension transition) or stay flexed (flexion transition). | Concentric knee and hip extensors in an extension transition (quadriceps, gluteus maximus). Hip flexors and hamstrings retract the legs in a flexion transition (seifert-2023, see D17). |
| Shaping | Load rises. Edge angle rises. Ankles, knees and hips flex. | Eccentric quadriceps, gluteus maximus and calf. Isometric hamstrings and adductors co-contract (hintermeister-1997, heinrich-2023). |
| Finish | Peak load, then release. | Eccentric to isometric extensors at peak. Concentric extension, or flexion into the next transition. |

Confidence: high for the outside-leg knee and hip extensors in normal turns (measured). Medium for how
these generalise to drills.

### F2. Edging: inclination and angulation

**Claims.**

1. *Inclination* tilts the whole body, as one unit, about the ski edges toward the turn centre.
   *Angulation* makes angles at the ankle, knee, hip and spine so that the legs tilt more than the trunk.
   Most technique systems describe edge control as a blend of the two (psia-c-railroad-tracks,
   psia-c-performance-short-turns). LeMaster: you ski with your legs and balance with the upper body. The
   upper body is about 65 % of body mass, so small trunk movements shift balance a lot
   (lemaster-2010-alignment).
2. *Outside hip.* With the legs tilted into the turn and the pelvis and trunk closer to perpendicular to
   the snow, the outside hip sits in **flexion, abduction and internal rotation** relative to the pelvis.
   The inside hip sits in **more flexion, adduction and external rotation**. This follows from the segment
   geometry, and the musculoskeletal model of one instructor's GS turn tracked exactly this
   (heinrich-2022, Table 1, ranges over the analysed turn):
   - outside hip: flexion 50° to 81°, abduction 3° to 27°, internal rotation 5° to 28°;
   - inside hip: flexion 70° to 117°, from 13° abducted to 11° adducted, external rotation 10° to 26°;
   - knee flexion: outside 56° to 80°, inside 81° to 114°;
   - ankle dorsiflexion: outside 18° to 27°, inside 17° to 21°;
   - pelvis list: 15° to 33°.

   Seen from the femurs, the pelvis's inside half is *higher* than a straight-body lean
   would put it. That is the "inside half up / strong inside half" that association pages describe
   (psia-c-medium-radius-carved, psia-c-sideslip-fall-line).
3. *Outside knee.* It stays flexed beyond 60° (heinrich-2023) and sits in some abduction and internal
   rotation. Skis with wider waists reduce knee flexion, abduction and internal rotation, which the authors
   read as a change of strategy (zorko-2015). Forcing the outside knee into valgus and internal rotation is
   the slip-catch ACL mechanism (bere-2011, bere-2013). So knee angulation is small, and frontal-plane
   knee control is a stabilising job, not an edging tool.
4. *Ankle in the boot.* The foot everts on the outside ski and inverts on the inside ski to tip the skis.
   The boot limits range, so this works mostly as torque (psia-c-railroad-tracks: tipping starts in the
   feet and ankles).
5. *Spine.* At peak load in GS the trunk was flexed forward about 39°, bent sideways about 15° and twisted
   about 8° (sporri-2015). The lumbar extension moment was the largest joint moment in a modelled carved
   turn (1.88 Nm/kg). The lateral bending moment was smaller (0.75 Nm/kg) (heinrich-2022).

**Muscles.**

| Segment action | Producers (concentric) | Holders / brakes | Confidence |
|---|---|---|---|
| Outside hip abduction, pelvis-on-femur (holds the inside half of the pelvis) | gluteus medius, gluteus minimus, TFL, upper gluteus maximus | same, isometric. Eccentric when the inside half drops. In deep hip flexion the model put gluteus maximus as the main abductor (heinrich-2023). | medium (gluteus maximus model and gluteus medius EMG on snow: heinrich-2023, seifert-2023, louie-1984; gluteus minimus and TFL from non-ski EMG: ganderton-2017, selkowitz-2024) |
| Outside hip adduction co-contraction (frontal-plane stiffness of the stance leg) | adductors | isometric. Adductors averaged above 50 % MVC, with peaks above 150 %, in wedge, parallel and GS turns (hintermeister-1997). | high in normal turns |
| Inside hip adduction (inside thigh drawn toward the turn) | adductors, chiefly adductor longus (heinrich-2023) | isometric | medium |
| Outside knee frontal-plane control against an external valgus moment | — | Hamstrings co-contract. Vasti and pes anserinus (semitendinosus, gracilis, sartorius) hold isometrically. The model found the snow force passing lateral to the outside knee (heinrich-2022, heinrich-2023). | medium |
| Outside foot eversion in the boot | peroneals (fibularis longus and brevis) | isometric | low (peroneus longus was recorded on snow, but its activity tracked posture, not measured torsion: louie-1984) |
| Inside foot inversion in the boot | tibialis anterior, tibialis posterior | isometric | low |
| Trunk lateral tilt toward the outside ski | — | The inside quadratus lumborum, obliques and erector spinae stop the trunk falling further outside. The outside ones co-contract. | low (lateral trunk EMG never measured on snow. QL is most active in same-side trunk side-bending tasks off snow: andersson-1996, mcgill-1996) |

### F3. Fore-aft balance

**Claims.**

1. Fore-aft balance means keeping the balance axis through the feet. It does not mean vertical over the
   feet. On a steeper slope the body must move forward relative to the feet to stay balanced. The boot's
   fixed link to the ski extends the base of support fore and aft (lemaster-2010-balance).
2. Pressure under the outside foot moved from forefoot at initiation toward heel in the second half of
   steering in GS (falda-buscaiot-2017). Association descriptions of performance turns ask for the centre
   of mass toward the ski's forebody in the first half and toward the centre in the second
   (psia-c-performance-short-turns, psia-c-medium-radius-carved).
3. In the modelled GS turn, the outside ankle's muscles produced a plantarflexion moment of up to
   0.85 Nm/kg. The boot shaft added a passive moment of up to 1.16 Nm/kg, so the boot carried more of
   the ankle load than the muscles did. Both were lower on the inside leg: up to 0.47 and 0.46 Nm/kg,
   about 45 % and 60 % lower (heinrich-2022, Table 2). In the
   EMG-validated model the inside tibialis anterior rose after the fall line, read as pushing against the
   boot shaft (heinrich-2023).
4. Getting thrown back loads the ACL. In a backward landing on the ski tails, boot-induced anterior drawer
   and quadriceps pull add to tibiofemoral compression (bere-2011). Hamstring co-contraction and knee
   flexion beyond 60° kept sagittal ACL load low in a balanced carved turn (heinrich-2023).
5. When the trunk pitches forward, biceps femoris activity rises, controlling trunk angular momentum
   (ishige-2021, one-leg racer).

**Segments and muscles.**

| Segment action | Producers / holders | Confidence |
|---|---|---|
| Shin pressed forward into the boot tongue (ankle dorsiflexion against the boot) | tibialis anterior, isometric. Above 50 % MVC in parallel and GS turns (hintermeister-1997). | high (normal turns) |
| Ankle stiffness against boot flex | calf (gastrocnemius, soleus), isometric or eccentric. Medial gastrocnemius above 50 % MVC in GS (hintermeister-1997). | high (normal turns) |
| Hip flexion and trunk pitch controlled under load | gluteus maximus and hamstrings, eccentric or isometric. Erector spinae isometric; it hit 100 % of model activation (heinrich-2023). | high (outside leg) / medium (trunk) |
| Moving the centre of mass forward at initiation | ankle dorsiflexion into the boot (tibialis anterior). Hip and trunk move forward over the feet, with hip flexors and abdominals controlling the trunk. | medium |

### F4. Rotary control: legs turning under a stable pelvis and trunk

**Claims.**

1. Association descriptions agree across tasks that the legs turn in the hip sockets under a stable pelvis
   and upper body (psia-c-hockey-stops, psia-c-performance-short-turns, psia-c-sideslip-fall-line).
   LeMaster puts this in terms of the hips: the muscles around them work constantly to let the upper and
   lower body act independently (lemaster-2010-alignment).
2. Turning the skis toward the turn means **internal rotation of the outside femur** and **external
   rotation of the inside femur**, both relative to the pelvis.
3. Which muscles rotate the femur depends on hip flexion. As the hip flexes, internal-rotation moment arms
   grow and external-rotation moment arms shrink. Some compartments switch from external to internal
   rotators. In cadavers this held for 15 of 18 compartments (delp-1999, also dostal-1986, neumann-2010).
   Skiing is done at 40° to 90° of hip flexion, so the anterior gluteus medius and minimus, TFL and the
   adductors are the internal rotators that matter on the outside leg.
4. In the EMG-validated carved-turn model, the outside hip carried an **external** rotation moment from
   the lateral hamstrings, gluteus maximus and quadratus femoris (heinrich-2023). In a carved turn the
   outside femur's internal rotation is therefore *held and braked* by the external rotators against the
   snow and boot. It is not driven. Concentric internal rotation by the outside leg belongs to skidded
   steering: pivot slips, hockey stops, short turns.
   - In the joint-moment model, the outside hip's rotation moment was mostly external, peaking at
     0.17 Nm/kg.
   - The inside hip carried an almost purely *internal* rotation moment, up to 0.23 Nm/kg, while it sat
     in 10° to 26° of external rotation (heinrich-2022). The inside leg's internal rotators (anterior
     gluteus medius and minimus, TFL, adductors) therefore hold the femur against further external
     rotation. They do not drive it. That is a measured-moment inference, medium confidence.
   - Hip frontal-plane moments differed between the two model studies:
     - heinrich-2022: the outside hip moment was mostly adduction (up to 0.52 Nm/kg) with a brief
       abduction moment (up to 0.39), and the inside hip moment was adduction only (up to 0.45);
     - heinrich-2023: gluteus maximus was the main contributor to an abduction moment at the deeply
       flexed outside hip.

     The outside hip's frontal moment therefore changes sign within the turn and between skiers. Both
     abductors and adductors work, and co-contraction is the safe model.
5. The trunk resists the reaction torque of the turning legs. External obliques ran higher in GS than SL
   (hintermeister-1995) and higher in GS than parallel than wedge (hintermeister-1997). Internal obliques
   and erector spinae were the primary trunk muscles in the model (heinrich-2023). Upper-body rotation
   strategy differed measurably between Austrian and German instructors (debertin-2026). That suggests
   association habits, not physics, decide how much counter is taught.

**Muscles.**

| Segment action | Concentric producers | Eccentric / isometric holders | Confidence |
|---|---|---|---|
| Outside femur internal rotation (skidded steering) | anterior gluteus medius and minimus, TFL, adductors (in flexion) | — | medium (moment arms from cadavers and models: delp-1999. No ski EMG.) |
| Outside femur internal rotation held under load (carving) | — | gluteus maximus, lateral hamstrings, deep hip rotators (quadratus femoris) | medium for gluteus maximus and hamstrings (model, EMG-validated); low for the deep rotators (model only) |
| Inside femur external rotation | gluteus maximus, deep hip rotators, sartorius, posterior gluteus medius | same, isometric | low |
| Pelvis and trunk held against leg rotation (counter) | — | obliques, multifidus and erector spinae, isometric | medium (EO and ES measured on snow: hintermeister-1997, zeglinski-1998) |

### F5. Pressure management: flexion and extension

**Claims.**

1. Flexing under load is mostly eccentric work by the knee and hip extensors, and extending is concentric
   (berg-1995, alhammoud-2020). Muscle-tendon length modelling shows the two-joint muscles (rectus
   femoris, hamstrings) do not follow the knee angle. Their contraction mode cannot be read from the knee
   alone (alhammoud-2024).
2. Lower average knee angles and a larger range of knee motion make turns more strenuous (scheiber-2012).
   Holding a deeply flexed posture raised vastus lateralis and rectus femoris EMG, oxygen desaturation and
   perceived exertion compared with an extension transition (seifert-2023).
3. On snow, skidded and carved turns do not differ consistently in knee loading. The inner knee is not
   always less loaded than the outer one (klous-2012).

**Muscles**: quadriceps, gluteus maximus, hamstrings, adductors, calf. They work eccentrically in
absorption, isometrically in holds and concentrically in extension. In a flexion transition the hip
flexors and hamstrings actively pull the legs up. Confidence: high for quadriceps and gluteus maximus in
normal turns. Medium for the rest.

### F6. The inside leg's job

**Claims.**

1. **Shortening.** The inside leg is more flexed at hip and knee than the outside one (heinrich-2022).
   That makes room for the outside leg to tip and lengthen. Without it the skier banks and loads the
   inside ski. A coaching text built on LeMaster's photographs describes this as long leg / short leg and
   notes that the inside foot moves forward at high edge angles (kipp-2025).
2. **It still works in a two-footed turn.** The inside leg carried about 36 % less force but needed
   similar knee and hip extension moments, because it is more flexed (heinrich-2022). The inside vastus
   lateralis was the most active inside muscle, followed by tibialis anterior, adductor longus and vastus
   medialis (heinrich-2023). The inside gluteus medius was active through steering and transition, more so
   with an extension transition (seifert-2023).
3. **Rectus femoris acts as a hip flexor on the inside leg.** In recreational skiers inside rectus femoris
   EMG matched the outside leg, while inside vastus lateralis was 54 % lower. The authors read this as
   rectus femoris switching between knee extensor (loading) and hip flexor (unloading the inside leg)
   (kroll-2010).
   - The follow-up full text agrees: inside vastus lateralis showed no co-loading, while rectus femoris
     was active on both legs.
   - After about 24 runs, inside-leg intensity dropped and skiers shifted onto the outside leg. The
     authors suggest teaching the inside leg's load-unload rhythm on purpose.
   - Knee flexion was about 81° to 88° inside against 65° to 70° outside (kroll-2011).
   - Women showed more inside rectus femoris activation than men (cuniberti-2026).
4. **Retraction.** Pulling the inside leg up and shortening it at the transition is hip flexion plus knee
   flexion. It is concentric work by the iliopsoas, rectus femoris, TFL, sartorius, hamstrings and
   gastrocnemius (as a knee flexor), not by the extensors yielding. With the hip flexed, iliopsoas carries
   a larger share of hip-flexion torque than TFL and sartorius, whose activity fell as the hip flexed
   (jiroumaru-2014). Iliopsoas activation is highest at 30° to 60° and above of hip flexion
   (juan-2024).
5. **Tipping.** The inside foot tips toward its little-toe edge in step with the outside foot
   (psia-c-one-footed-railroad-track). This is inversion inside the boot plus external rotation and
   adduction at the hip.
6. **Hips level, inside half up.** Association descriptions ask for a "strong inside half" and for the
   inside half of the body to be slightly raised and forward (psia-c-medium-radius-carved,
   psia-c-sideslip-fall-line). Mechanically, raising or holding the inside half of the pelvis is
   pelvis-on-femur abduction at the **outside** hip (gluteus medius, gluteus minimus, TFL, upper gluteus
   maximus).
   - The spine meanwhile bends toward the outside ski (F9.2), so the **inside quadratus lumborum** and
     inside obliques lengthen. They control that outward tilt (eccentric as it develops, isometric while
     held, concentric as the trunk comes back); they do not hike the pelvis.

   In off-snow EMG, the standing "hip hitch" (lifting the opposite pelvis while standing on one leg)
   ranked highest for all gluteus medius and minimus segments (ganderton-2017, moore-2020). The hip hike
   drove TFL to about 47 % MVIC (selkowitz-2024), and QL was recorded during pelvic-drop exercises
   (monteiro-2017). Confidence: medium for the outside gluteal role (non-ski EMG of the same action),
   low for the inside QL and obliques on snow.

### F7. The outside leg as a single-leg stance

**Claims.**

1. The outside ski carries most of the load (F1), and drills that lift the inside ski make it all of it.
   The outside leg then works like single-leg stance under 1 to 2+ BW along the balance axis: knee and hip
   extensors hold the flexed leg, and hip abductors hold the pelvis over it.
2. The best measured on-snow analogue of one-leg skiing is the single-leg amputee racer. When he turned on
   the inside edge, his EMG and joint angles looked like a normal racer's outside leg. When he turned on
   the outside edge (the harder side), biceps femoris was much more active in the first half of the turn,
   and his biceps femoris and vastus lateralis were hypertrophied (ishige-2021).
3. Off snow, the exercises with the highest gluteus medius and minimus forces were the side plank and the
   loaded single-leg RDL and single-leg squat (collings-2023). The single-leg squat and single-leg
   deadlift activated gluteus medius and maximus similarly, at about 59 % to 64 % MVIC (distefano-2009).

### F8. Upper body, arms and poles

**Claims.**

1. A quiet upper body is the platform the legs work under (lemaster-2010-alignment). In short turns the
   pole swing sets timing and rhythm (psia-c-basic-short-turns). Stork turns put a pole touch just before
   the inside tail lifts (psia-c-stork-turns).
2. No study found measures arm or shoulder muscles in alpine turns. Holding the arms forward is an
   isometric job for the anterior deltoid and shoulder flexors. A pole touch is a small wrist and forearm
   movement. A forceful pole plant, as in hop turns and steep short turns, adds latissimus dorsi and
   triceps (pole push). Confidence: low throughout.

### F9. Spine and trunk: neutral, hinged, angulated, mostly not twisted

**Claims.**

1. **Posture.** The trunk is inclined forward by flexing at the hips (a hip hinge), with the lumbar and
   thoracic curves kept close to neutral. It is neither rounded nor arched. It is stable but not rigid,
   because it must absorb and steer.
   - Measured on snow: between the sacrum and the sternum, the trunk showed about 27° of frontal
     (forward) bending in GS, averaged over the phase after the gate, against about 11° in SL
     (sporri-2016). At peak force in GS it was about 39° (sporri-2015).
   - These are sacrum-to-sternum angles. They are spinal bending plus thoracic shape, not trunk
     inclination to the vertical. Most of the trunk's forward inclination comes from hip flexion, which
     adds to these figures.
   - The lumbar extension moment was the largest joint moment in a modelled carved turn
     (heinrich-2022), and erector spinae hit 100 % of model activation (heinrich-2023). So the
     extensors hold the hinged trunk against the turn force.
   - That "neutral, not rounded" is the target is expert reasoning. It rests on spine-loading
     arguments; the Spörri back-injury studies link combined bending, twisting and peak force to overuse
     injury risk (sporri-2015, sporri-2016). No study measured a ski posture against a rounded one.
2. **Lateral angulation comes mostly from the hips, with some spine.** The trunk is not kept in line with
   the legs; it tilts back toward the outside ski relative to them.
   - Lateral bending between sacrum and sternum averaged about 11° in GS (peak about 14°) and about 6° in
     SL (peak about 9°) after the gate (sporri-2016). It was about 15° at peak force in GS (sporri-2015).
   - In vivo, the lower thoracic and thoracolumbar segments (T10 to L1) contribute most of thoracic
     lateral bending. T1 relative to L1 reaches about 16° at maximum (fujimori-2014).
   - Ski lateral bending of 6° to 15° is therefore a real share of the angulation. A larger share has to
     come from the hips, where the pelvis-on-femur abduction of the outside hip is the main mechanism
     (F2, F6.6). Segment shares on snow were not measured.
3. **Counter and separation come mainly from the femurs rotating in the hip sockets, plus some thoracic
   rotation. The lumbar spine contributes little.**
   - In vivo lumbar axial rotation was only about 1.2° to 1.7° per segment during 45° of trunk rotation
     (fujii-2007). The thoracic spine rotated about 25° from T1 to L1 at maximum, mostly in the
     mid-thoracic segments (fujimori-2012).
   - On snow, sacrum-to-sternum torsion was small and did not differ between GS and SL: about 6° and 5°
     on average, peaking near 8° and 7° (sporri-2016).
   - So the large pelvis-to-ski angle visible in short turns has to be femoral rotation under the
     pelvis, plus some pelvis-to-ski rotation. It is not spinal twist. Association descriptions match
     this: the legs rotate under a stable pelvis and upper body (psia-c-performance-short-turns).
4. **Muscles holding the trunk.**

| Muscle | Contraction | Job | Confidence |
|---|---|---|---|
| Erector spinae and multifidus | isometric; eccentric as the trunk is driven into more flexion at peak force | Hold the hip hinge against the lumbar flexion moment; keep the curves neutral | high for erector spinae in turns (heinrich-2023, zeglinski-1998, hintermeister-1995); low for multifidus |
| Rectus abdominis | isometric | Brace against extension and pelvic tilt; trunk stiffness | medium (hintermeister-1997, one side) |
| External and internal obliques | isometric; eccentric against leg torque at edge set and pivot | Resist twisting from the legs' rotation; their lateral fibres also hold the side bend | high in normal turns (hintermeister-1997, heinrich-2023) |
| Quadratus lumborum, inside side | eccentric as the bend develops; isometric while held; concentric as the trunk returns | Control the lateral bend toward the outside ski from the lengthened side; the pelvic hike belongs to the outside hip abductors | low (andersson-1996, mcgill-1996) |
| Quadratus lumborum, outside side | isometric | Co-contract to stiffen the lumbopelvic junction | low |
| Transversus abdominis | isometric | Intra-abdominal pressure and trunk stiffness | low (no ski data) |

   Under turn forces the trunk is pushed into flexion and toward the inside of the turn by the force along
   the balance axis. Erector spinae work eccentrically to isometrically against flexion. The spine bends
   toward the outside ski, so the lateral muscles on the inside (the inside QL and obliques) lengthen:
   eccentric as the bend develops, isometric while held, concentric as the trunk returns at the finish.
   The inside half of the pelvis is held up by the outside hip abductors, pelvis on femur (F6.6), not by
   the inside QL. The obliques brake the torque of the legs.

5. **How it varies between drills.**
   - **Short turns, pivot slips, hockey stops, sideslips, falling leaf:** the pelvis and thorax face
     downhill while the skis turn underneath, so counter relative to the skis is large. It changes every
     turn while the spine stays nearly untwisted. Trunk forward bending is lower than in long turns
     (SL 11° against GS 27°: sporri-2016). The oblique anti-rotation work is high.
   - **Long carved turns:** the pelvis and trunk stay closer to square to the skis, with slight counter
     from the "strong inside half" (psia-c-medium-radius-carved). Forward and lateral spinal bending are
     larger and held longer under higher, longer force (sporri-2016). Erector spinae and lateral holding
     work are high.
   - **Measured contrast:** in instructors' full-body IMU data, carved turns had more backward lean,
     more crouch, and an upper body that rotated *with* the turn. Skidded parallel turns had the upper
     body rotating *against* the turn, which is counter. Lateral tilt did not differ (debertin-2022). Every
     instructed trial showed a forward movement at initiation and a slight backward shift in steering.
   - **Stork and one-ski turns:** as long carved turns, but the lateral pelvic hold is all on the outside
     hip abductors; the inside QL and obliques control the trunk's outward bend.
   - **Railroad tracks and garlands:** low lateral spinal bending; the edging comes from the feet and
     knees. A quiet trunk is the criterion (psia-c-railroad-tracks).

### F10. Early edging and progressive edge build

**Claims.**

1. **Edge engagement starts at or just after the transition.** The old edges are released, the skis pass
   through flat, and the new edges engage as the centre of mass crosses over the skis, or the skis cross
   under it. That lets the ski grip and bend above the fall line, so it is already turning as it reaches
   the fall line. Association descriptions agree:
   - In short turns, edges are progressively untipped and re-engaged through the transition; lower-body
     tipping starts the edge change and the inclination of the centre of mass
     (psia-c-performance-short-turns).
   - In medium carved turns, edges release and engage at a similar rate and time, inclination begins
     in initiation and grows in shaping, and the body moves forward at initiation to engage the
     shovels (psia-c-medium-radius-carved).
2. **Edge angle builds progressively.** It peaks in shaping and falls in the finish
   (psia-c-medium-radius-carved, psia-c-increasing-arc-railroad-tracks). It can only be as high as the
   inclination allows: in balance, the balance axis has to pass through the edge
   (lemaster-2010-planes, lemaster-2010-balance). A high edge angle set before the matching inclination
   and turn force exist leaves the centre of mass inside the edge with nothing to hold it there. The
   skier then falls inside (banking onto the inside ski) or must stand the ski back up. That is mechanical
   reasoning, not a measured result. For World Cup GS, the lean angle averaged about 43° over the turn
   and peaked near 59° (sporri-2012), so high edge angles need high speed and high turn force.
3. **Early versus late edging and the load profile.** A late edge set waits until the skis point toward
   or past the fall line, then sets the edge hard and turns sharply: the Z-shaped turn. The direction
   change, and so the force needed, is packed into the second half of the turn.
   - When gate offset forced a world-class GS racer to turn more, the turn force in the completion phase
     rose from about 0.37 to 0.64 BW. Inward lean after the gate rose, fore-aft position moved back, and
     more of the turn cycle was spent in direction change (sporri-2012). The authors flagged fatigue and
     a backward or inward loss of balance as risks.
   - The highest force and energy loss occurred in the steering phase in slalom (supej-2010). On steeper
     slopes, peak force concentrated at mid-steering, and lateral knee and hip angulation was more
     pronounced at the start of steering (supej-2015).
   - Under the outside foot in GS, force peaked in the second half of steering, after the gate
     (falda-buscaiot-2017).
   - Faster GS skiers applied more force in mid-turn and less at the switch (delhaye-2025).
   - Racing lines differ: a "Z" line (long straight, sharp turn) and an "S" line (long curved turns, short
     straight) were both used by well-performing skiers. Line length did not predict the speed lost in the
     following turn (delhaye-2020). For racers, Z is a tactic, not an error.
   - The recreational "late edge set" error is different. Its abrupt edge set below the fall line spikes
     the force under an extended, back-weighted leg, and the slip-catch knee mechanism needs a sudden
     edge catch (bere-2011, bere-2013). Linking these two is inference.
   - Conclusion for content: early, progressive edging spreads force over more of the turn and peaks it
     around and after the fall line. Late edging concentrates force in the finish. This is supported by
     racing studies; no study compares the two on recreational skiers.
   - **Measured edge-angle progression** (youth national-team slalom racers, outside ski): edge angle was
     about 5° at the start of the turn. It rose progressively to a maximum of 66° to 70° just before or
     after the gate, then fell quickly through completion. The skis skidded early (attack angle up to
     12° to 15°) and were carving by about the gate (reid-2020). In an instrumented instructor's carved
     turns, the outer ski's roll angle peaked at 57° and the inner ski's at 53°, both in the phase after
     the gate (thorwartl-2023).
4. **Tipping starts in the feet and ankles inside the boot, with the inside ski leading.**
   - Association descriptions: tipping and angulation begin in the lower body
     (psia-c-railroad-tracks), "originate in the feet, ankles, and legs" (psia-c-medium-radius-carved),
     and railroad-track turns are made "primarily from foot/ankle tipping" (paraphrased;
     psia-c-increasing-arc-railroad-tracks).
   - The railroad-track page offers a drill against the "new outside big toe down" habit: lift the new
     inside foot's big toe and roll it to its little-toe edge while the other ski stays flat. That is
     inside-ski-led tipping (psia-c-railroad-tracks).
   - LeMaster's version of this point could not be verified: the three publisher excerpts read do not
     cover tipping, so it is not attributed to him.
5. **Exceptions.**
   - Sideslips, pivot slips and the falling leaf keep the skis deliberately flat or barely edged. Edge
     angle is the speed control, so there is no progressive build (D6, D7, D8).
   - Hockey stops pivot flat, then set the edge quickly. A fast build is intended there (D9).
   - Short turns build and drop edge angle quickly (psia-c-performance-short-turns). The progression is
     compressed, not skipped (D12).
   - Hop turns change edges in the air; dynamic leapers land already on edge (D11).
   - Wedge turns hold both skis on inside edges; there is no edge change (D14).

**Initiation-phase muscles for early edging** (the new outside and new inside leg, left turn = right leg
outside). Frontal-plane hip words depend on the reference: see the note below the table.

| Segment action | New outside leg | New inside leg | Trunk |
|---|---|---|---|
| Foot in the boot | Eversion toward the big-toe edge: peroneals, concentric then isometric (low) | Inversion toward the little-toe edge, leading: tibialis anterior and posterior, concentric then isometric (low) | — |
| Ankle sagittal | Shin moves forward into the tongue: tibialis anterior, concentric then isometric (high in turns: hintermeister-1997) | Same, less loaded | — |
| Knee moved toward the new turn, with the hip flexed | Hip internal rotation and adduction of the flexed femur: anterior gluteus medius and minimus, TFL, adductors, concentric (medium: delp-1999) | Hip external rotation and abduction of the flexed femur: deep rotators, gluteus maximus, posterior gluteus medius, sartorius, concentric (low) | — |
| Inside leg shortening | — | Hip and knee flexion: iliopsoas, rectus femoris, hamstrings, concentric (medium: kroll-2010, seifert-2023) | — |
| Pelvis held as load arrives (angulation) | Pelvis-on-femur abduction: gluteus medius and minimus, TFL, upper gluteus maximus; isometric, eccentric if it yields (medium) | Hip adduction held: adductor longus (heinrich-2023) | Inside QL and obliques lengthen under control as the trunk bends toward the outside ski; obliques and multifidus hold the pelvis and thorax against the legs' rotation; erector spinae hold the hinge |

Note on hip words. Moving the knee toward the turn at a flexed hip is internal rotation plus adduction of
the outside femur (open chain, light load). Once the leg carries load and the trunk angulates, the femur is
inclined further into the turn than the pelvis, so the same outside hip is described as abducted
(pelvis-on-femur). Both happen within one initiation. The figure should compute hip angles from segment
poses, not from these words.

### F11. Equipment geometry and the stance it sets

Boots and bindings fix the ankle's sagittal angle and the foot's pitch. The knee, hip and trunk adjust to
keep the centre of mass over the middle of the foot.

**Geometry.**

1. **Boot shaft forward lean.** This is the angle of the cuff from perpendicular to the boot sole.
   - The commonly quoted range is about 12° to 17°. Race boots sit at either end depending on the
     model. No manufacturer specification page could be read with curl (they are script-rendered or
     blocked), so this range is **unverified**.
   - There is no industry standard for how forward lean is measured: front of cuff and rear spine give
     different numbers, so brand figures are not comparable. That point came from boot-fitter forum
     posts, which are not cited as evidence.
   - Boot-fitters set forward lean from the skier's ankle range of motion (skiracing-2015-flex).
   - The cuff sets the **minimum** shin angle. Under load the cuff flexes further. How far depends on
     flex stiffness, and that is not standardised:
     - nominal flex index runs from about 50 (soft) to 150 (stiff) (posch-2025, citing Immler);
     - flex indexes are brand-specific (skiracing-2015-flex);
     - measured individual flexion stiffness correlated only moderately with nominal index, and 80
       versus 90 or 100 versus 110 did not differ (immler-2019).
   - Field and laboratory boot-flexion angles were measured in slalom (petrone-2013), but the abstract
     gives no values.
2. **Ramp.** The foot's heel-up pitch relative to the ski is the boot board's own ramp (zeppa) plus the
   binding delta.
   - **Binding delta** is heel stand height minus toe stand height. In 1780 recreational skiers, mean
     stand height was 39.9 mm at the toe and 44.6 mm at the heel, so the mean delta was about 4.7 mm
     (ruedl-2022). A lower toe-to-heel ratio, meaning a more raised heel, went with fewer ACL injuries
     in the authors' earlier case-control work, as summarised in ruedl-2022 and posch-2025.
   - Over the roughly 300 mm between the toe and heel contact points (a typical boot sole length),
     the angle is atan(delta / 300 mm). A delta of 0 mm is 0°, 3 mm is 0.6°, 4.7 mm is 0.9° and 6 mm is
     1.1°.
   - **Zeppa:** no verified figure was found. A footbed ramp of a few degrees is the usual boot-fitting
     claim, but the sources found were forum posts. The default below is a modelling assumption.
   - **Total heel-up pitch of the foot** = zeppa + delta angle. **Shin angle to the ski's normal** at the
     cuff's resting position = forward lean + delta angle. Zeppa tilts the foot inside the boot, not the
     cuff, so **ankle dorsiflexion inside the boot** ≈ forward lean − zeppa. A steeper zeppa
     therefore needs less ankle range for the same shin angle. That matches posch-2025: raising the
     heel left the ankle near neutral and moved the work to the knee.
3. **Stand height and lifter plates.**
   - Recreational stand heights are about 40 to 45 mm (ruedl-2022).
   - Higher stand height lengthens the lever between the ski's edge and the boot sole. The same lateral
     knee and ankle movement then makes more edging moment, and a boot sliding out on its side
     ("boot-out") happens at a higher edge angle. It also loads the knee more under lateral forces, as
     ruedl-2022 summarises from Senner. Too low a stand height lets the boot touch the snow in carved
     turns (ruedl-2022).
   - In GS, a lower stand height reduced the total ground-reaction force in the phase of highest
     spinal loading, while trunk angles stayed the same (sporri-2018).
   - The lever argument is mechanics; the leverage was not measured.

**Consequences for joint angles.**

- With the shin held at or beyond (forward lean + delta), the centre of mass can sit over the middle of
  the foot only if the knee flexes and the hips hinge enough to bring the thigh and trunk back over the
  foot. More forward lean or more heel lift means more knee flexion.
- Measured: raising the heel 30 mm (about 5.7°) increased knee flexion by about 7° and moved the centre of
  mass about 3.7 cm forward in one-legged standing in a boot, while hip angles did not change
  (posch-2025). Roughly, each degree of heel lift is about a degree of extra knee flexion.
- Too little lean or ramp, or a boot too stiff to flex, lets the skier stand tall with the shin upright.
  The centre of mass then sits behind the middle of the foot:
  - beginners in stiff boots flexed less into the boot and adopted a backward-lean style, supported by
    the rear spoiler (schaff-1990a);
  - a rigid rear spoiler raised the peak force under backward loading (schaff-1990b);
  - in simulated back-weighted landings, a stiffer rear shaft raised ACL force through the boot's push
    on the tibia and through quadriceps force (eberle-2017).
- Standard boot settings held the knee in a valgus misalignment that canting reduced by only about 10 %
  (bohm-2008). Frontal-plane boot geometry also sets the stance.

**Muscle consequences.**

| Muscle | What the boot geometry asks of it | Contraction | Confidence |
|---|---|---|---|
| Quadriceps | More knee flexion from more lean or ramp raises the knee extension moment. Holding deep flexion costs more (seifert-2023, scheiber-2012). | isometric, eccentric | medium |
| Tibialis anterior | Pulls the shin forward into the tongue at initiation. After the boot is flexed, holds the shin there as the shell springs back (boot rebound would push the shin back). | concentric, then isometric | medium (TA above 50 % MVC in turns: hintermeister-1997; the rebound role is mechanics) |
| Soleus and gastrocnemius | As force drives the shin forward, they share the plantarflexion moment with the boot shaft. They yield eccentrically as the boot flexes and hold isometrically at peak. A stiffer boot takes a larger share: in the model the boot carried a large part of the outside ankle moment (heinrich-2022). | eccentric, isometric | medium |
| Hamstrings | Co-contract with the quadriceps in the flexed stance and resist anterior tibial shear. A raised heel is proposed to increase hamstring co-activation (posch-2025: speculation, not measured). | isometric | medium in turns (hintermeister-1997, hermann-2023); low for the geometry link |
| Postural muscles generally | Rigid boots gave a less active postural control strategy on a seesaw: the boot provided more of the stability mechanically (noe-2020). | — | medium (non-ski task, in boots) |

**Defaults for the figure.**

| Parameter | Default | Variation to show | Basis |
|---|---|---|---|
| Cuff forward lean (from sole normal) | 15° | 12° to 17° | commonly quoted, unverified (see above) |
| Binding delta | 4.7 mm → 0.9° | 0 to 6 mm → 0° to 1.1° | ruedl-2022 mean; delta/300 mm |
| Zeppa (boot-board ramp) | 3° | 1° to 5° | modelling assumption, no verified source |
| Total foot pitch (zeppa + delta) | about 4° | about 1° to 6° | sum of the above |
| Static shin angle to the ski normal (lean + delta) | about 16° | 12° to 18° | sum of the above; dynamic shin angles exceed this as the cuff flexes |
| Ankle dorsiflexion inside the boot (lean − zeppa), static | about 12° | about 7° to 16° | geometry |
| Stand height (ski base to boot sole) | 42 mm | 38 to 47 mm | ruedl-2022 |

### F12. Active ankle dorsiflexion

The boot does not flex the ankle by itself. The skier closes the ankle, and keeps it closed, so the shin
stays on the tongue and the centre of mass stays over the middle of the foot. This is a primary active
movement on both legs throughout the turn.

**Claims.**

1. **Throughout the turn.**
   - *Transition and initiation:* the ankles close (dorsiflex) and the feet are pulled back under the
     body, so the shin meets the tongue and the centre of mass moves toward the ski's forebody as the new
     turn starts. Association descriptions: the centre of mass moves toward the forebody in the first half
     of the turn and toward the centre in the second (psia-c-performance-short-turns); the body moves
     forward at initiation to engage the shovels (psia-c-medium-radius-carved).
   - *Shaping:* the shin pressure is held against the turn force and the boot's flex resistance.
   - *Finish:* pressure moves toward the heel. Under the outside foot in GS, pressure went from forefoot at
     initiation to heel in the second half of steering (falda-buscaiot-2017).
2. **Muscles.**
   - *Concentric at transition and initiation, isometric through shaping:* tibialis anterior, extensor
     digitorum longus, extensor hallucis longus and fibularis tertius.
   - *Eccentric counterpart:* soleus, plus gastrocnemius where the knee is not deeply flexed, as the
     turn force drives the shin forward against the boot.
   - Evidence:
     - tibialis anterior averaged above 50 % MVC in parallel and GS turns (hintermeister-1997);
     - inside-leg tibialis anterior was the second most active inside muscle in a carved turn, rising
       after the fall line (heinrich-2023);
     - the outside ankle's plantarflexion moment was carried jointly by muscles and boot
       (heinrich-2022).
   - The toe extensors and fibularis tertius were never measured on snow, so they are low confidence and
     inferred from their dorsiflexor moment arm.
3. **Losing it.** If the dorsiflexors let go, the ankle opens, the shin leaves the tongue and the centre
   of mass moves behind the middle of the foot: the backseat. The quadriceps then carry more of the knee
   moment, and a backward landing or recovery is the boot-induced ACL mechanism (bere-2011). Beginners
   reached about 20 % less forward flex in the same boot than experts (schaff-1990a), so active closing is
   a skill as well as a range.
   - Beginners loaded the rearfoot more than the forefoot, and with snowplow-based teaching that did
     not change over five days (kurpiers-2024).
   - Recreational skiers sat further back than FIS racers on an insole fore-aft score (kekesi-2026).
   - An expert loaded about 60 % on the heel overall, moving from toe to heel through the turn, while
     intermediates varied widely (matsumura-2021).
   - In loaded squats in ski boots, the boot shaft moved only about 6° to 7° while the ankle moved about
     15° (demsar-2015). Much of the ankle's closing is the shin moving inside the cuff and the cuff's
     padding compressing, not the shell flexing.
4. **Dorsiflexion range as a limiter.**
   - With limited ankle range, the skier cannot get the shin forward enough, and the centre of mass
     stays back unless the trunk folds forward to compensate.
   - Off snow, reduced passive dorsiflexion went with more trunk flexion in a squat in junior
     cross-country skiers (conradsson-2010).
   - Simulating restricted dorsiflexion with a heel-down wedge reduced knee flexion and increased knee
     valgus and medial knee displacement in a squat (macrum-2012). The ski analogue (shin stopped early,
     knee drifting in) is inference.
   - A heel raise reduces the ankle range needed (posch-2025; F11).
5. **Gym side.**
   - *Mobility:* weight-bearing knee-to-wall (lunge) dorsiflexion, measured with a test that has adult
     normative values (mcbride-2026); soleus mobility with the knee bent.
   - *Strength:* tibialis raises for the dorsiflexors; eccentric calf work (soleus with the knee bent)
     for the counterpart.
   - The exercise choices are expert reasoning: no ski study tested them.

| DOF | Phase | Net moment | Movement | Mode | Muscles | Confidence |
|---|---|---|---|---|---|---|
| Ankle DF, both legs | transition and initiation | dorsiflexor (low load) | ankle closes, foot pulled back | concentric | TA, EDL, EHL, FT | high for TA (hintermeister-1997); low for the others |
| Ankle DF, outside | shaping | plantarflexor, shared with the boot (heinrich-2022) | closed further by the turn force | TA isometric (co-contraction); soleus eccentric | TA, EDL, EHL; soleus | medium |
| Ankle DF, inside | shaping and finish | small; TA rises after the fall line (heinrich-2023) | held | isometric | TA, EDL, EHL | medium |
| Ankle, outside | finish | plantarflexor | opens slightly as pressure moves to the heel | soleus isometric or concentric; TA isometric | soleus, TA | medium |

## 2. Drill catalogue

### 2.0 Pose guide for the figure

Angles marked "measured" are racing data. The rest are modelling suggestions (low confidence) chosen to
match the mechanics above. "Forward" is trunk inclination from the balance axis, mostly from hip flexion.
"Spine lat." is lateral bending of the thorax on the pelvis toward the outside ski. "Counter" is how far
the pelvis faces toward the outside of the turn relative to the skis, mostly from femoral rotation. "Edge"
is the ski's edge angle.

**Measured joint-angle reference for long carved and GS-type turns.** These are ranges over the
analysed steering phase of one instructor's GS turn, from the tracked musculoskeletal model
(heinrich-2022, Table 1). Racing trunk data are from IMUs (sporri-2016). Use these as the
shaping-phase pose for D1, D2 and D13, scaled down for slower drills.

| Joint | Outside leg | Inside leg | Source |
|---|---|---|---|
| Ankle dorsiflexion | 18° to 27° | 17° to 21° | heinrich-2022 |
| Knee flexion | 56° to 80° | 81° to 114° | heinrich-2022 |
| Hip flexion | 50° to 81° | 70° to 117° | heinrich-2022 |
| Hip ab/adduction | 3° to 27° abducted | 13° abducted to 11° adducted | heinrich-2022 |
| Hip rotation | 5° to 28° internal | 10° to 26° external | heinrich-2022 |
| Pelvis | anterior tilt 28° to 39° (the hip hinge; the lumbar row below is the low back's own flexion, so the low back flattens from standing while the pelvis carries most of the fold), list 15° to 33°, rotation −18° to 30° (sign convention as printed) | | heinrich-2022 |
| Lumbar | sagittal 23° to 29°, lateral bending 0° to 5°, rotation −3° to 10° | | heinrich-2022 |
| Trunk, sacrum to sternum, GS | frontal bending 27°, peak 29°; lateral bending 11°, peak 14°; torsion 6°, peak 8° (after the gate) | | sporri-2016 |
| Trunk, SL | frontal bending 11°, peak 13°; lateral bending 6°, peak 9°; torsion 5°, peak 7° (after the gate) | | sporri-2016 |

| Drill | Initiation | Shaping | Finish |
|---|---|---|---|
| D1 Stork, D2 one-ski, D13 long carved | Legs lengthening from their deepest bend in the transition; forward falling from about 26-33° to 25-31°, spine lat. 0° → 5°, counter 5°, edge 0° → 20° progressively after the switch | Legs at their longest, quasi-isometric (stork model, inference: outside hip 48/55/63°, knee 60/65/71° gentle/moderate/dynamic; heinrich-2022 GS hip 50-81°, knee 56-80°); forward 20° to 26°, spine lat. 8° to 12° (GS measured 11°, peak about 14° to 15°: sporri-2016, sporri-2015), counter 5° to 10°, edge building to its peak in late shaping (lemaster-2010 p128; 40° to 60° racing, sporri-2012 lean; 25° to 40° recreational) | Legs flexing, absorbing the load that peaks below the fall line, into the transition's hip 62/70/78° and knee 68/74/81°; forward rising to 25° to 33°, spine lat. falling to 5°, counter falling toward square (about 3°), edge falling toward release |
| D12 Short turns | Forward 20° to 25°, spine lat. 0° to 4°, counter 20° to 30° unwinding, edge 0° → 30° fast | Forward 25°, spine lat. 6° (SL measured 6°, peak 9°: sporri-2016), counter 25°, edge max 35° to 50° | Forward 25°, spine lat. 4°, counter 30° to 40°, edge falls fast |
| D3 Javelin | Forward 30°, counter builds | Counter 40° to 60° (the drill's point), spine lat. 8° | Counter held, then unwinds |
| D4 Thousand steps | Forward 25°, small alternating lateral shifts | Spine lat. 5°, counter 10°, edge 20° to 30° | As shaping |
| D5 Railroad tracks | Forward 20°, spine lat. 0°, counter 0°, edge 0° → 10° | Edge 10° to 20°, spine lat. 0° to 3° | Edge back to 0° |
| D6 Sideslip, D7 falling leaf, D8 pivot slips | Forward 20° to 25°, counter 70° to 90° (pelvis faces downhill, skis across the hill), spine lat. 5° over the downhill ski, edge 0° to 5° | Edge 0° to 10° | Edge set 15° to 20° (sideslip finish) |
| D9 Hockey stop | Counter 0° → 80° to 90° as the skis pivot, edge 0° | Edge 20° → 40°, spine lat. 8° to 12° | Edge held, forward 30° |
| D10 Garlands | As D5 or D12, one side only | Partial shaping only | Edge back to the uphill edges |
| D11 Hop turns | Take-off: forward 25°, extended legs | Landing: forward 30° to 35°, edge already 20° to 30° | As D12 |
| D14 Wedge | Forward 20°, counter 0° to 10° | Spine lat. 5° toward the outside ski, edge 10° to 20° | Recentre |
| D15 Skating | Forward 30°, edge 10° to 20° on the gliding ski | Push edge 20° to 30° | — |
| D16 Uphill-ski | Forward 30°, spine lat. 10° over the uphill foot | Held | Held |
| D17 Flexion transition | Forward 40° to 50°, knees and hips near 90° (seifert-2023), edge through 0° low | As D13 | As D13 |
| D18 Step turns | Forward 25°, counter 0° → 10° | As D12 basic | As D12 basic |

### 2.1 Abbreviations used in the DOF matrices

Contraction: con concentric, ecc eccentric, iso isometric, co-con co-contraction, SSC stretch-shortening
cycle. Sides: O outside, I inside. DF/PF dorsiflexion/plantarflexion; IR/ER internal/external rotation.

- **Leg:** TA tibialis anterior; EDL extensor digitorum longus; EHL extensor hallucis longus;
  FT fibularis tertius; PL, PB fibularis (peroneus) longus, brevis; TP tibialis posterior; SOL soleus;
  GAS gastrocnemius; FHL flexor hallucis longus; INT intrinsic foot muscles; POP popliteus.
- **Thigh:** VAS vasti; RF rectus femoris; BF biceps femoris; MH medial hamstrings (semitendinosus,
  semimembranosus); SAR sartorius; GRA gracilis.
- **Hip:** AM adductor magnus; ADD adductor longus, brevis and pectineus; GMAX, GMED, GMIN gluteus
  maximus, medius, minimus; TFL tensor fasciae latae; DR deep hip rotators; IP iliopsoas.
- **Trunk:** RA rectus abdominis; EO, IO external, internal oblique; TrA transversus abdominis;
  QL quadratus lumborum; ES erector spinae; MF multifidus.
- **Arm, shoulder and neck:** AD anterior deltoid; LD latissimus dorsi; TMaj teres major; SA serratus
  anterior; RC rotator cuff; TRAP trapezius; BB biceps brachii; TRI triceps brachii; FF forearm (finger
  and wrist) flexors; SCM sternocleidomastoid; SPL splenius capitis.

Pairing for rotation: turning the pelvis or thorax to the right uses the right internal oblique with the
left external oblique, and the reverse for the left.

### 2.2 Baseline matrices

Each drill's matrix (end of each drill) is a baseline with drill-specific rows replaced.

**Turn baseline**, a two-footed parallel turn on edge (the D13 pattern), with the kinetics layer.
Measured moments are from heinrich-2022 and heinrich-2023. The rest are reasoned from the line of force.

| DOF | Side | Initiation | Shaping | Finish | Net moment -> mode (I / S / F) |
|---|---|---|---|---|---|
| Ankle DF/PF | outside | DF active: feet pulled back, shin to tongue; TA, EDL, EHL, FT con | DF held against turn force and boot flex; TA, EDL, EHL iso; SOL ecc then iso (GAS slack, knee bent) | DF held as pressure moves to heel; TA iso, SOL iso; if TA lets go the ankle opens (backseat) | small DF (shin pulled to tongue) -> TA con / PF: muscles up to 0.85 Nm/kg plus boot up to 1.16 while ankle closes (DF 18-27 deg) -> SOL ecc, TA co-con / PF while ankle holds or opens slightly -> SOL iso/con |
| Ankle DF/PF | inside | DF active: foot pulled back; TA, EDL, EHL, FT con | DF held, shin on tongue; TA iso (rises after fall line) | DF held; TA iso | small DF -> TA con / PF up to 0.47 Nm/kg (45 % lower); TA rises after fall line -> TA iso / same -> iso |
| Ankle inv/ev | outside | Eversion to big-toe edge; PL, PB con; TP ecc | Eversion torque held; PL, PB iso; TP iso (arch) | Back to neutral at release; PL, PB ecc | eversion (snow force on medial edge) while moving into eversion -> PL con / eversion, position held -> iso / eversion falling -> ecc |
| Ankle inv/ev | inside | Inversion to little-toe edge, leading; TA, TP con | Inversion held; TA, TP iso; PL ecc/iso | Back to neutral; TA, TP ecc | inversion (force on lateral edge) while moving into inversion -> TA, TP con / inversion held -> iso / falling -> ecc |
| Foot arch, toes | outside | Arch held under load, pressure spread; INT, TP, FHL iso | Arch held under load, pressure spread; INT, TP, FHL iso | Arch held under load, pressure spread; INT, TP, FHL iso | arch-supporting moment against load -> iso |
| Foot arch, toes | inside | Arch held, light load; INT iso | Arch held, light load; INT iso | Arch held, light load; INT iso | small -> iso |
| Knee flex/ext | outside | Extends (extension transition) or stays flexed; VAS con or iso; MH, BF co-con | Flexes under load; VAS, RF ecc; MH, BF iso | Deepest flexion, then extends; VAS ecc, iso, then con | extension, knee extending or still -> con/iso / extension (up to 1.02 Nm/kg) while flexing (56-80 deg) -> ecc / extension, flexing then extending -> ecc then con |
| Knee flex/ext | inside | Flexes (shortens) under its own load; VAS ecc (extension moment like outside); hamstrings, GAS con only when unloaded | More flexed than outside, held; VAS iso, hamstrings iso | Held, then extends as it becomes outside leg; VAS con | extension (up to 0.96 Nm/kg) while flexing -> ecc / extension, held at 81-114 deg -> iso / extension while extending -> con |
| Knee tibial rot. | outside | Held near neutral against valgus and external rotation; MH, POP, SAR, GRA iso; BF iso | Held near neutral against valgus and external rotation; MH, POP, SAR, GRA iso; BF iso | Held near neutral against valgus and external rotation; MH, POP, SAR, GRA iso; BF iso | frontal: internal adduction moment against valgus (up to 0.23 Nm/kg); rotation alternates (-0.08 to 0.22) -> iso |
| Knee tibial rot. | inside | Held neutral; POP, MH, BF iso (low) | Held neutral; POP, MH, BF iso (low) | Held neutral; POP, MH, BF iso (low) | frontal: internal abduction moment (up to 0.31 Nm/kg); rotation mostly internal (up to 0.28) -> iso |
| Hip flex/ext | outside | Extends slightly or holds; GMAX, AM con or iso | Flexes under load; GMAX, AM, MH ecc | Flexed at peak, then extends; GMAX ecc then con | extension, hip extending -> con / extension (up to 1.27 Nm/kg) while flexing (50-81 deg) -> ecc / extension, flexing then extending -> ecc then con |
| Hip flex/ext | inside | Flexes (shortens) under load; GMAX ecc; IP, RF con only when unloaded (RF hip-flexor role) | More flexed, held; IP iso; GMAX iso (extension moment like outside) | Held, then extends | extension (up to 1.05 Nm/kg) while flexing -> ecc / extension, held at 70-117 deg -> iso / extension while extending -> con |
| Hip abd/add | outside | Knee toward turn: add of flexed femur, ADD, AM con; then abd (pelvis-on-femur) as load arrives, GMED, GMIN, TFL ecc to iso | Abducted, inside half of pelvis held; GMED, GMIN, TFL, upper GMAX iso; ADD, AM co-con iso | Held, back to neutral; GMED ecc | changes sign; joint moving into abduction (3-27 deg) -> abductors con, adductors co-con / mostly adduction (up to 0.52 Nm/kg, heinrich-2022) or abduction from GMAX (heinrich-2023): sign varies -> abductors and adductors iso (co-con) / brief abduction moment (up to 0.39) as released -> ecc |
| Hip abd/add | inside | Knee toward turn: abd of flexed femur; posterior GMED, DR con | Adducted, held; ADD (adductor longus) iso | Held; ADD iso | adduction, small / adduction only (up to 0.45 Nm/kg; adductor longus main contributor), held near neutral -> iso / held -> iso |
| Hip IR/ER | outside | IR, femur turns under pelvis; anterior GMED/GMIN, TFL, ADD con | IR held and braked; GMAX, DR, BF ecc/iso | Held, then neutral; DR, GMAX iso | IR while rotating in (skidded) -> con / mostly ER moment (up to 0.17 Nm/kg; BF, GMAX, quadratus femoris) while IR 5-28 deg held -> ecc/iso / same -> iso |
| Hip IR/ER | inside | ER; DR, GMAX, SAR con | ER held (10-26 deg) against an IR moment; anterior GMED/GMIN, TFL, ADD iso | Held; same iso | ER while rotating out -> con / IR moment (up to 0.23 Nm/kg) while femur sits in 10-26 deg ER -> anterior GMED/GMIN, TFL, ADD iso / same -> iso |
| Pelvis tilt | both | Anterior tilt grows with hip hinge; IP, RF con; ES iso | Anterior tilt held, lumbar neutral; ES, MF iso; RA, TrA iso (anti-extension) | Held; ES, RA iso | set by hip and lumbar moments -> iso |
| Pelvis hike (list) | both | Inside half rises toward level as legs tip (pelvis on outside femur); O GMED, GMIN, TFL con | Inside half held up; O GMED, GMIN, TFL iso | Levels for release; O GMED ecc | outside hip abduction moment -> iso |
| Pelvis rotation | both | Slight counter forms as legs turn under it; O IO + I EO iso; hip rotators | Slight counter held; obliques iso | Held, then squares for release; obliques ecc | reaction torque of turning legs, resisted -> iso |
| Lumbar flex/ext | both | Near neutral (not rounded or arched); ES, MF iso; RA iso; ES ecc under peak flexion moment | Near neutral (not rounded or arched); ES, MF iso; RA iso; ES ecc under peak flexion moment | Near neutral (not rounded or arched); ES, MF iso; RA iso; ES ecc under peak flexion moment | extension, trunk flexing forward -> ES ecc / extension (up to 1.88 Nm/kg, largest moment) held -> iso / same -> iso |
| Lumbar lat. flex | both | Neutral to slight bend toward outside ski; I QL ecc (lengthens, controls the outward tilt) | Slight bend held; I QL, I obliques iso; O QL co-con | Returns to neutral; I QL con | lateral bending moment up to 0.75 Nm/kg, one direction throughout (side not stated) -> iso |
| Lumbar rotation | both | Held near neutral (little range); MF, obliques iso | Held near neutral (little range); MF, obliques iso | Held near neutral (little range); MF, obliques iso | rotation moment small (up to 0.16 Nm/kg, toward the turn), about 12 times smaller than extension -> iso |
| Thoracic flex/ext | both | Slight flexion held, not rounded; thoracic ES iso | Slight flexion held, not rounded; thoracic ES iso | Slight flexion held, not rounded; thoracic ES iso | extension -> iso |
| Thoracic lat. flex | both | Neutral to slight bend toward outside ski; I obliques ecc (lengthen) | Some bend held; I obliques iso, O obliques co-con | Returns; I obliques con | lateral -> iso |
| Thoracic rotation | both | Slight rotation toward outside of turn; O IO + I EO con | Held; O IO + I EO iso | Squares to the skis as they release, then the new counter forms as the legs turn under; I IO + O EO con | anti-rotation -> iso |
| Shoulder girdle | outside | Slightly protracted, level; SA, TRAP iso | Slightly protracted, level; SA, TRAP iso | Slightly protracted, level; SA, TRAP iso | small -> iso |
| Shoulder girdle | inside | Slightly protracted, level; SA, TRAP iso | Slightly protracted, level; SA, TRAP iso | Slightly protracted, level; SA, TRAP iso | small -> iso |
| Shoulder | outside | Arm forward, in view; AD, RC iso | Held forward; AD, RC iso | Swings forward to prepare next touch; AD con | flexion moment holds arm forward -> iso |
| Shoulder | inside | Pole touch: small flexion then extension; AD con, LD, TMaj con | Arm forward, leads; AD, RC iso | Held; AD iso | flexion then extension at touch -> con / flexion -> iso / flexion -> iso |
| Elbow | outside | Flexed about 90°, held; BB, brachialis iso | Flexed about 90°, held; BB, brachialis iso | Flexed about 90°, held; BB, brachialis iso | flexion -> iso |
| Elbow | inside | Flexed about 90°, held; BB iso; TRI con at touch | Flexed about 90°, held; BB iso; TRI con at touch | Flexed about 90°, held; BB iso; TRI con at touch | flexion -> iso |
| Wrist, grip | outside | Grip held; FF iso | Grip held; FF iso | Grip held; FF iso | grip -> iso |
| Wrist, grip | inside | Wrist flick for touch; FF con, wrist extensors ecc | Grip held; FF iso | Grip held; FF iso | grip -> iso |
| Neck | both | Head level, eyes ahead down the hill; SCM, SPL iso, counter-rotate against thorax | Head level, eyes ahead down the hill; SCM, SPL iso, counter-rotate against thorax | Head level, eyes ahead down the hill; SCM, SPL iso, counter-rotate against thorax | head held against turn force -> iso |

**Slip baseline**, skis across the hill and pelvis facing downhill (D6 pattern). Moments follow the turn
baseline except that the hip rotation moments hold the femurs across the hill, and the edge moments
switch with release and set.

| DOF | Side | Initiation | Shaping | Finish | Net moment -> mode (I / S / F) |
|---|---|---|---|---|---|
| Ankle DF/PF | outside | DF held, centred; TA, EDL, EHL iso; SOL iso | DF held, centred; TA, EDL, EHL iso; SOL iso | DF held, centred; TA, EDL, EHL iso; SOL iso | as turn baseline unless noted |
| Ankle DF/PF | inside | DF held, centred; TA, EDL, EHL iso; SOL iso | DF held, centred; TA, EDL, EHL iso; SOL iso | DF held, centred; TA, EDL, EHL iso; SOL iso | as turn baseline unless noted |
| Ankle inv/ev | outside | Release: inversion toward flat; TA, TP con | Fine edge control; PL, PB vs TA, TP iso | Edge set: eversion; PL, PB con | as turn baseline unless noted |
| Ankle inv/ev | inside | Release: eversion toward flat; PL, PB con | Fine edge control; TA, TP vs PL iso | Edge set: inversion; TA, TP con | as turn baseline unless noted |
| Foot arch, toes | outside | Arch held under load, pressure spread; INT, TP, FHL iso | Arch held under load, pressure spread; INT, TP, FHL iso | Arch held under load, pressure spread; INT, TP, FHL iso | as turn baseline unless noted |
| Foot arch, toes | inside | Arch held, light load; INT iso | Arch held, light load; INT iso | Arch held, light load; INT iso | as turn baseline unless noted |
| Knee flex/ext | outside | Flexed, held; VAS iso; MH, BF co-con; ecc at edge set | Flexed, held; VAS iso; MH, BF co-con; ecc at edge set | Flexed, held; VAS iso; MH, BF co-con; ecc at edge set | as turn baseline unless noted |
| Knee flex/ext | inside | Flexed, held; VAS iso; hamstrings co-con | Flexed, held; VAS iso; hamstrings co-con | Flexed, held; VAS iso; hamstrings co-con | as turn baseline unless noted |
| Knee tibial rot. | outside | Held near neutral against valgus and external rotation; MH, POP, SAR, GRA iso; BF iso | Held near neutral against valgus and external rotation; MH, POP, SAR, GRA iso; BF iso | Held near neutral against valgus and external rotation; MH, POP, SAR, GRA iso; BF iso | as turn baseline unless noted |
| Knee tibial rot. | inside | Held neutral; POP, MH, BF iso (low) | Held neutral; POP, MH, BF iso (low) | Held neutral; POP, MH, BF iso (low) | as turn baseline unless noted |
| Hip flex/ext | outside | Flexed, held; GMAX, AM iso | Flexed, held; GMAX, AM iso | Flexed, held; GMAX, AM iso | as turn baseline unless noted |
| Hip flex/ext | inside | Flexed, slightly more; GMAX iso | Flexed, slightly more; GMAX iso | Flexed, slightly more; GMAX iso | as turn baseline unless noted |
| Hip abd/add | outside | Abducted under a pelvis held over the downhill ski; GMED, GMIN, TFL iso; ADD co-con | Abducted under a pelvis held over the downhill ski; GMED, GMIN, TFL iso; ADD co-con | Abducted under a pelvis held over the downhill ski; GMED, GMIN, TFL iso; ADD co-con | as turn baseline unless noted |
| Hip abd/add | inside | Adducted, held; ADD iso | Adducted, held; ADD iso | Adducted, held; ADD iso | as turn baseline unless noted |
| Hip IR/ER | outside | Femur rotated across the hill under a downhill-facing pelvis (ER relative to pelvis); DR, GMAX iso | Femur rotated across the hill under a downhill-facing pelvis (ER relative to pelvis); DR, GMAX iso | Femur rotated across the hill under a downhill-facing pelvis (ER relative to pelvis); DR, GMAX iso | as turn baseline unless noted |
| Hip IR/ER | inside | Femur rotated across the hill (IR relative to pelvis); GMED/GMIN ant, TFL, ADD iso | Femur rotated across the hill (IR relative to pelvis); GMED/GMIN ant, TFL, ADD iso | Femur rotated across the hill (IR relative to pelvis); GMED/GMIN ant, TFL, ADD iso | as turn baseline unless noted |
| Pelvis tilt | both | Anterior tilt held; ES, MF, RA, TrA iso | Anterior tilt held; ES, MF, RA, TrA iso | Anterior tilt held; ES, MF, RA, TrA iso | as turn baseline unless noted |
| Pelvis hike (list) | both | Uphill half held slightly up; downhill GMED, GMIN iso; uphill QL iso | Uphill half held slightly up; downhill GMED, GMIN iso; uphill QL iso | Uphill half held slightly up; downhill GMED, GMIN iso; uphill QL iso | as turn baseline unless noted |
| Pelvis rotation | both | Faces downhill, about 70° to 90° to the skis; obliques iso | Faces downhill, about 70° to 90° to the skis; obliques iso | Faces downhill, about 70° to 90° to the skis; obliques iso | as turn baseline unless noted |
| Lumbar flex/ext | both | Near neutral (not rounded or arched); ES, MF iso; RA iso; ES ecc under peak flexion moment | Near neutral (not rounded or arched); ES, MF iso; RA iso; ES ecc under peak flexion moment | Near neutral (not rounded or arched); ES, MF iso; RA iso; ES ecc under peak flexion moment | as turn baseline unless noted |
| Lumbar lat. flex | both | Slight bend toward downhill ski; uphill QL iso | Slight bend toward downhill ski; uphill QL iso | Slight bend toward downhill ski; uphill QL iso | as turn baseline unless noted |
| Lumbar rotation | both | Held near neutral (little range); MF, obliques iso | Held near neutral (little range); MF, obliques iso | Held near neutral (little range); MF, obliques iso | as turn baseline unless noted |
| Thoracic flex/ext | both | Slight flexion held, not rounded; thoracic ES iso | Slight flexion held, not rounded; thoracic ES iso | Slight flexion held, not rounded; thoracic ES iso | as turn baseline unless noted |
| Thoracic lat. flex | both | Slight bend toward downhill ski; uphill obliques iso | Slight bend toward downhill ski; uphill obliques iso | Slight bend toward downhill ski; uphill obliques iso | as turn baseline unless noted |
| Thoracic rotation | both | Held facing downhill with pelvis; obliques iso | Held facing downhill with pelvis; obliques iso | Held facing downhill with pelvis; obliques iso | as turn baseline unless noted |
| Shoulder girdle | outside | Slightly protracted, level; SA, TRAP iso | Slightly protracted, level; SA, TRAP iso | Slightly protracted, level; SA, TRAP iso | as turn baseline unless noted |
| Shoulder girdle | inside | Slightly protracted, level; SA, TRAP iso | Slightly protracted, level; SA, TRAP iso | Slightly protracted, level; SA, TRAP iso | as turn baseline unless noted |
| Shoulder | outside | Arms forward; AD, RC iso | Arms forward; AD, RC iso | Arms forward; AD, RC iso | as turn baseline unless noted |
| Shoulder | inside | Arms forward; AD, RC iso | Arms forward; AD, RC iso | Arms forward; AD, RC iso | as turn baseline unless noted |
| Elbow | outside | Flexed about 90°, held; BB, brachialis iso | Flexed about 90°, held; BB, brachialis iso | Flexed about 90°, held; BB, brachialis iso | as turn baseline unless noted |
| Elbow | inside | Flexed, held; BB iso | Flexed, held; BB iso | Flexed, held; BB iso | as turn baseline unless noted |
| Wrist, grip | outside | Grip held; FF iso | Grip held; FF iso | Grip held; FF iso | as turn baseline unless noted |
| Wrist, grip | inside | Grip held; FF iso | Grip held; FF iso | Grip held; FF iso | as turn baseline unless noted |
| Neck | both | Head level, facing downhill; SCM, SPL iso | Head level, facing downhill; SCM, SPL iso | Head level, facing downhill; SCM, SPL iso | as turn baseline unless noted |

Drill names are generic. "Association pages" are paraphrased from the publicly readable PSIA-AASI Central
alpine task pages (marked `psia-c-*`). They are one mapping source, not the definition. Phase sub-mapping
for non-turn drills is given per drill.

Shared baseline: unless a drill changes it, the outside leg's quadriceps, gluteus maximus, hamstrings,
adductors, tibialis anterior and calf follow the normal-turn pattern of F1 to F3. So does the trunk's
erector spinae and obliques. Tables list only rows that differ from the baseline or that the drill
specifically trains, except for stork turns, which are written out in full.

### D1. Stork turns (inside ski tail lifted)

**Description.** Linked, large, round turns on easy groomed terrain, balanced on the outside ski. From early
in each turn to late in it, the tail of the inside ski is held off the snow while its tip stays on the
snow. The outside ski bends and leaves a brushed or carved track. On association pages the pole touch
comes just before the tail lifts. The tail is up from mid-initiation to mid-finish
(psia-c-stork-turns).

**Movement goal.** Balance on the outside ski with the edge angle from angulation (not banking), and keep
fore-aft balance along the length of that one ski. The lifted tail is a test: if balance drifts to the
inside ski or back, the tail touches down.

**Mechanics specific to this drill.**

- The inside leg is a suspended limb. The thigh, shank, boot, binding and ski hang from the hip and must
  be held against the load along the balance axis. That requires a net **hip flexion moment** (thigh up)
  and a net **knee flexion moment** (shank and tail up). This is mechanically certain. Which muscles share
  it is inference. Because the tip rests on the snow, part of the ski's weight is carried, so the knee
  flexors do less than in a fully lifted ski (D2).
- The pelvis has no support on the inside. Its inside half is held up by the **outside** hip abductors,
  pelvis-on-femur (F6.6). The spine bends toward the outside ski, so the **inside** quadratus lumborum
  and obliques lengthen and control that tilt rather than hike the pelvis. In a normal
  turn the inside foot carries about 0.4 BW (falda-buscaiot-2017). Removing it moves all that load and
  pelvic support to the outside hip, so outside abductor demand rises above a normal turn.
- The outside leg carries the whole snow force (F7). So outside extensor, abductor and ankle demands are
  higher than in the same turn on two feet.
- Tip down, tail up: the inside ski pitches tip-down while the shin stays forward in the boot. The ski's
  longer forebody tends to drop the tip by itself. Little active ankle work is needed for pitch. Ankle
  muscles mainly tip the ski onto its new edge and keep the shin against the tongue.

**Joint actions.**

| Segment | Initiation | Shaping | Finish |
|---|---|---|---|
| Outside ankle | Shin moves forward into the tongue as the centre of mass crosses. Foot begins to evert inside the boot to tip the ski. | Held flexed against the tongue and the rising load to the fall line, then begins to open (lemaster-2010 pp79, 85-86). Eversion torque holds the edge. | Opens progressively as the foot slides forward; pressure shifts toward the heel (lemaster-2010 pp182-183, falda-buscaiot-2017). Released with the edge. |
| Outside knee | Extends a little from its deepest bend in the transition. | Most extended, quasi-isometric, while the load builds (bacharach-cross-2023 p27). Stays in slight abduction and internal rotation; valgus is resisted. | Flexes (eccentric), absorbing the load that peaks below the fall line, into the transition (lemaster-2010 pp40-42, iasi-2021 pp65-66). |
| Outside hip, flexion/extension | Opens from the transition's deep fold as the leg lengthens. | Held at its most open; the fold is deeper the harder the turn. Extensors hold. | Folds again with the knee into the transition. |
| Outside hip, abduction/adduction | Moves toward abduction (pelvis-on-femur) as the legs tilt in. | Abducted relative to pelvis; inside half of pelvis held up. | Held, then returns to neutral at release. |
| Outside hip, rotation | Rotates internally (femur turns into the turn under the pelvis). | Internally rotated and held against the snow (braked). | Held, then neutral at release. |
| Inside ankle | Shin forward in the boot. Foot tips toward its little-toe edge with the outside foot. | Held. Ski tilted tip-down, tip touching the snow. | Stays closed, shin on the tongue, as the tail is set down, ready to become the new outside ankle (lemaster-2010 pp81, 86). |
| Inside knee | Flexes actively to lift the tail (after the pole touch). | Held more flexed than the outside knee. | Held, then extends to set the tail down around mid-finish. |
| Inside hip, flexion/extension | Flexes actively to raise the thigh. | Held flexed, more than the outside hip. | Held, then lowered (extends) to set the ski down. |
| Inside hip, abduction/adduction | Kept at hip width, so the boot rides beside the outside boot. | Held at hip width (no snow support to push against). | Held; the foot is set down at hip width. |
| Inside hip, rotation | Rotates externally with the turn, so the lifted ski stays parallel. | Externally rotated, held. | Held. |
| Pelvis | Rotates slightly toward the outside of the new turn (counter). Inside half lifted level or slightly up as weight leaves the inside foot. | Faces partly outside the turn. Inside half held up (stance-hip abduction, pelvis on femur). Anterior tilt with the hip hinge, least while the legs are longest. | Inside half held until the tail is set down, then levels for the edge change. |
| Trunk | Moves forward and across with the centre of mass. Stays quiet. | Flexed forward. Tilted toward the outside ski (angulation). Lateral muscles hold it. Resists the legs' rotation. | Held, then moves across into the next turn. |
| Shoulders and arms | Hands forward and in view. Inside hand leads. | Held forward and level with the slope. Outside hand ready to swing. | Outside (next inside) pole swings forward. |
| Poles | Pole touch just before the tail lifts (association task). | No pole action. | Pole swing prepares the next touch. |

**Muscles: outside side.**

| Muscle (slug) | I / S / F | Contraction | Role | Conf. | Sources |
|---|---|---|---|---|---|
| quadriceps | 2 / 3 / 3 | concentric (initiation), isometric (shaping), eccentric (finish) | Lengthens the knee into the turn, holds it against the whole turn force (no inside support), then absorbs the late load | medium | hintermeister-1997, berg-1995, kroll-2010, heinrich-2023 |
| gluteus-maximus | 2 / 3 / 3 | eccentric, isometric | Hip extension moment. Main abductor in deep hip flexion. Brakes femoral internal rotation. | medium | hintermeister-1997, heinrich-2023 |
| gluteus-medius | 2 / 3 / 3 | isometric; eccentric if the inside half of the pelvis yields | Holds the unsupported inside half of the pelvis up (pelvis-on-femur). Anterior fibres help internal rotation. | medium | seifert-2023, louie-1984, ganderton-2017, moore-2020 |
| gluteus-minimus | 2 / 3 / 3 | isometric | Same pelvic hold as gluteus medius. Anterior part internally rotates in flexion. Stabilises the femoral head. | medium | ganderton-2017, moore-2020, delp-1999 |
| tensor-fasciae-latae | 1 / 2 / 2 | isometric | Assists the pelvic hold. Hip flexion and internal rotation. | medium | selkowitz-2024, monteiro-2017 |
| adductors | 2 / 2 / 2 | isometric | Frontal-plane co-contraction with the abductors. Adductor magnus assists hip extension. | medium | hintermeister-1997 |
| hamstrings | 2 / 2 / 2 | isometric | Co-contract with the quadriceps (fore-aft, ACL shear). Lateral hamstrings brake internal rotation. | medium | hintermeister-1997, heinrich-2023 |
| deep-hip-rotators | 1 / 2 / 2 | eccentric, isometric | Brake and hold femoral internal rotation; femoral head stability | low | heinrich-2023 (model only), delp-1999 |
| tibialis-anterior | 2 / 1 / 1 | isometric | Keeps the shin forward against the tongue as the turn starts | medium | hintermeister-1997 |
| calf | 1 / 2 / 2 | isometric, eccentric | Ankle stiffness against the boot under load; fore-aft adjustment | medium | hintermeister-1997, heinrich-2022 |
| peroneals | 1 / 2 / 2 | isometric | Evert the foot in the boot to hold the edge | low | louie-1984 |
| tibialis-posterior | 1 / 1 / 1 | isometric | Arch and subtalar stability under one-foot load | low | — |
| quadratus-lumborum | 1 / 1 / 1 | isometric | Co-contracts with the inside QL to stiffen the lumbopelvic junction | low | mcgill-1996 |

**Muscles: inside side (the group the current content misses).**

| Muscle (slug) | I / S / F | Contraction | Role | Conf. | Sources |
|---|---|---|---|---|---|
| iliopsoas | 2 / 2 / 1 | concentric (lift), isometric (hold), eccentric (set down) | Main hip flexor holding the inside thigh up with the hip already flexed | low | jiroumaru-2014, juan-2024, andersson-1997 |
| quadriceps (rectus femoris role) | 2 / 2 / 1 | concentric, isometric | Rectus femoris as a hip flexor unloading the inside leg. The vasti are nearly idle because the leg carries no load. | medium | kroll-2010, cuniberti-2026 |
| tensor-fasciae-latae | 1 / 1 / 1 | isometric | Assists hip flexion; keeps the thigh from falling into external rotation | low | andersson-1997, jiroumaru-2014 |
| sartorius | 1 / 1 / 1 | isometric | Hip flexion, external rotation and knee flexion together, which is the stork posture | low | andersson-1997 |
| hamstrings | 2 / 2 / 1 | concentric (lift), isometric (hold), eccentric (lower) | Flex the knee to raise the tail. Short head of biceps femoris is a pure knee flexor. | medium | chollet-2025 (inside-leg EMG in normal turns), cuniberti-2026 |
| calf | 1 / 1 / 1 | isometric | Gastrocnemius assists knee flexion; ankle movement is blocked by the boot | low | — |
| adductors | 1 / 1 / 1 | isometric | Hold the inside thigh adducted beside the stance leg. Pectineus and adductor longus also flex the hip. | low | heinrich-2023 (inside adductor longus in a normal turn) |
| deep-hip-rotators | 1 / 1 / 1 | concentric then isometric | Externally rotate the inside femur so the lifted ski stays parallel | low | delp-1999 |
| gluteus-medius | 1 / 1 / 1 | isometric | Holds the free thigh from dropping into adduction or internal rotation | low | seifert-2023 (inside gluteus medius active in normal turns) |
| tibialis-anterior | 1 / 1 / 1 | isometric | Holds the shin forward in the boot. Inverts the foot to tip the lifted ski. | low | heinrich-2023 (inside, normal turn) |
| tibialis-posterior | 1 / 1 / 1 | isometric | Inverts the foot to tip the lifted ski to its new edge | low | — |
| quadratus-lumborum | 1 / 2 / 2 | eccentric (initiation), isometric (shaping), concentric (finish) | Lengthens as the spine bends toward the outside ski and controls that tilt; brings the trunk back at the finish. | low | andersson-1996, mcgill-1996, monteiro-2017 |
| obliques | 2 / 2 / 2 | isometric; inside lateral fibres eccentric, then concentric | Inside lateral fibres lengthen with the outward bend and control it. Both sides resist the legs' rotation torque. | medium | hintermeister-1997, heinrich-2023 |

**Muscles: both sides.**

| Muscle (slug) | I / S / F | Contraction | Role | Conf. | Sources |
|---|---|---|---|---|---|
| erector-spinae | 2 / 2 / 2, dynamic 2 / 3 / 3 | isometric | Hold the flexed trunk, low back slightly flattened from standing, never arched or slumped; largest lumbar moment | medium | hintermeister-1997, zeglinski-1998, heinrich-2022 |
| rectus-abdominis | 1 / 1 / 1 | isometric | Trunk stiffness and pelvic tilt control | medium | hintermeister-1997 |
| deltoid | 1 / 1 / 1 | isometric | Arms held forward; pole touch | low | — |

**Common errors and what they shift.**

| Error | Seen as | Muscle demand shifts |
|---|---|---|
| Banking (inclined trunk, no angulation) | Inside tail drops or the skier steps onto it | Outside hip abductors and inside QL do less. Load goes to the inside ski, so the drill fails. |
| Hip dumped inside (pelvis drops to the inside) | Inside half of the pelvis low; "sitting" into the turn | Outside gluteus medius and minimus lose the pelvic hold (Trendelenburg-like). The adductors take over. |
| Lifting with the knee only (hip stays extended) | Tail lifts but the inside knee drops back and the ski pitches tip-down into the snow | Hamstrings overloaded, iliopsoas idle. Fore-aft balance drifts back. |
| Tip lifted too (whole ski off) | Becomes D2 | Hip and knee flexor demand rises; tip support is lost. |
| Back seat | Outside tail chatters; inside tip rises | Quadriceps rise (anterior drawer risk), tibialis anterior falls, hamstrings and gluteus maximus fight the pitch |
| Upper body rotates with the legs | Shoulders turn into the turn | Obliques do less; the deep rotators no longer get a stable pelvis to turn against |

**DOF matrix (D1).**

| DOF | Side | Initiation | Shaping | Finish |
|---|---|---|---|---|
| Ankle DF/PF | outside | DF active: feet pulled back, shin to tongue; TA, EDL, EHL, FT con | DF held against the rising load to the fall line, then begins to open; SOL iso (GAS slack, knee bent); TA co-con | Opens progressively as the foot slides forward and pressure moves to the heel; SOL con, TA ecc |
| Ankle DF/PF | inside | Shin forward as tail lifts (after pole touch), ski pitched tip-down; TA, EDL, EHL iso | Held, tip resting on snow; TA, EDL, EHL iso (light) | Stays closed, shin on the tongue, as the tail sets down mid-finish; TA iso |
| Ankle inv/ev | outside | Eversion to big-toe edge; PL, PB con; TP ecc | Eversion torque held; PL, PB iso; TP iso (arch) | Back to neutral at release; PL, PB ecc |
| Ankle inv/ev | inside | Lifted ski tipped to match stance ski; TA, TP con | Tilt held; TA, TP iso | Back to neutral at set-down; TA, TP ecc |
| Foot arch, toes | outside | Arch held under load, pressure spread; INT, TP, FHL iso | Arch held under load, pressure spread; INT, TP, FHL iso | Arch held under load, pressure spread; INT, TP, FHL iso |
| Foot arch, toes | inside | Unloaded; INT low | Unloaded; INT low | Unloaded; INT low |
| Knee flex/ext | outside | Extends a little from its deepest bend in the transition; VAS con; MH, BF co-con | Most extended, quasi-isometric under the whole turn force; VAS, RF iso (higher than two-footed turn) | Flexes, absorbing the load that peaks below the fall line; VAS ecc |
| Knee flex/ext | inside | Active flexion lifts the tail; BF (incl. short head), MH, GRA, SAR, GAS con; VAS near idle | Held more flexed than outside; hamstrings, GRA, SAR iso | Extends to set tail down at mid-finish; hamstrings ecc |
| Knee tibial rot. | outside | Held near neutral against valgus and external rotation; MH, POP, SAR, GRA iso; BF iso | Held near neutral against valgus and external rotation; MH, POP, SAR, GRA iso; BF iso | Held near neutral against valgus and external rotation; MH, POP, SAR, GRA iso; BF iso |
| Knee tibial rot. | inside | Held neutral; POP, MH, BF iso (low) | Held neutral; POP, MH, BF iso (low) | Held neutral; POP, MH, BF iso (low) |
| Hip flex/ext | outside | Opens from the transition's deep fold; GMAX, AM con | Held at its most open; GMAX, AM, hamstrings iso | Folds again with the knee; GMAX, AM ecc |
| Hip flex/ext | inside | Active flexion lifts the thigh; IP, RF, TFL, SAR, ADD (pectineus, longus) con | Held flexed; IP, RF iso | Lowered; IP, RF ecc |
| Hip abd/add | outside | Knee toward turn: add of flexed femur, ADD, AM con; then abd (pelvis-on-femur) as load arrives, GMED, GMIN, TFL ecc to iso | Abducted, inside half of pelvis held; GMED, GMIN, TFL, upper GMAX iso; ADD, AM co-con iso | Held, back to neutral; GMED ecc |
| Hip abd/add | inside | Kept at hip width, boot beside stance boot; ADD, GMED co-con (light) | Held at hip width; ADD, GMED iso | Held; set down at hip width |
| Hip IR/ER | outside | IR, femur turns under pelvis; anterior GMED/GMIN, TFL, ADD con | IR held and braked; GMAX, DR, BF ecc/iso | Held, then neutral; DR, GMAX iso |
| Hip IR/ER | inside | ER keeps lifted ski parallel; DR, SAR, GMAX con | Held; DR, SAR iso | Held; DR iso |
| Pelvis tilt | both | Anterior tilt grows with hip hinge; IP, RF con; ES iso | Anterior tilt held, lumbar neutral; ES, MF iso; RA, TrA iso (anti-extension) | Held; ES, RA iso |
| Pelvis hike (list) | both | Inside half unsupported, held up (pelvis on outside femur); O GMED, GMIN, TFL, upper GMAX con/iso (high) | Held; O GMED, GMIN, TFL iso (high) | Held until set-down, then levels; O GMED ecc |
| Pelvis rotation | both | Slight counter forms as legs turn under it; O IO + I EO iso; hip rotators | Slight counter held; obliques iso | Held, then squares for release; obliques ecc |
| Lumbar flex/ext | both | Near neutral (not rounded or arched); ES, MF iso; RA iso; ES ecc under peak flexion moment | Near neutral (not rounded or arched); ES, MF iso; RA iso; ES ecc under peak flexion moment | Near neutral (not rounded or arched); ES, MF iso; RA iso; ES ecc under peak flexion moment |
| Lumbar lat. flex | both | Neutral to slight bend toward outside ski; I QL ecc (lengthens, controls the outward tilt) | Slight bend held; I QL, I obliques iso; O QL co-con | Returns to neutral; I QL con |
| Lumbar rotation | both | Held near neutral (little range); MF, obliques iso | Held near neutral (little range); MF, obliques iso | Held near neutral (little range); MF, obliques iso |
| Thoracic flex/ext | both | Slight flexion held, not rounded; thoracic ES iso | Slight flexion held, not rounded; thoracic ES iso | Slight flexion held, not rounded; thoracic ES iso |
| Thoracic lat. flex | both | Neutral to slight bend toward outside ski; I obliques ecc (lengthen) | Some bend held; I obliques iso, O obliques co-con | Returns; I obliques con |
| Thoracic rotation | both | Slight rotation toward outside of turn; O IO + I EO con | Held; O IO + I EO iso | Squares to the skis as they release, then the new counter forms as the legs turn under; I IO + O EO con |
| Shoulder girdle | outside | Slightly protracted, level; SA, TRAP iso | Slightly protracted, level; SA, TRAP iso | Slightly protracted, level; SA, TRAP iso |
| Shoulder girdle | inside | Slightly protracted, level; SA, TRAP iso | Slightly protracted, level; SA, TRAP iso | Slightly protracted, level; SA, TRAP iso |
| Shoulder | outside | Arm forward, in view; AD, RC iso | Held forward; AD, RC iso | Swings forward to prepare next touch; AD con |
| Shoulder | inside | Pole touch just before the tail lifts; AD con, LD, TMaj con | Arm forward, leads; AD, RC iso | Held; AD iso |
| Elbow | outside | Flexed about 90°, held; BB, brachialis iso | Flexed about 90°, held; BB, brachialis iso | Flexed about 90°, held; BB, brachialis iso |
| Elbow | inside | Flexed about 90°, held; BB iso; TRI con at touch | Flexed about 90°, held; BB iso; TRI con at touch | Flexed about 90°, held; BB iso; TRI con at touch |
| Wrist, grip | outside | Grip held; FF iso | Grip held; FF iso | Grip held; FF iso |
| Wrist, grip | inside | Wrist flick for touch; FF con, wrist extensors ecc | Grip held; FF iso | Grip held; FF iso |
| Neck | both | Head level, eyes ahead down the hill; SCM, SPL iso, counter-rotate against thorax | Head level, eyes ahead down the hill; SCM, SPL iso, counter-rotate against thorax | Head level, eyes ahead down the hill; SCM, SPL iso, counter-rotate against thorax |

Coverage: 34 DOF rows, 102 cells, all filled. 11 rows are specific to this drill; the other 23 follow the turn baseline (2.2).

### D2. Outside-ski-only turns (inside ski fully lifted)

**Description.** Linked turns on one ski. The new inside ski is picked up at the transition and held parallel
to the snow and to the stance ski through shaping, sometimes the whole turn. The stance ski leaves a
carved or skidded track on demand (psia-c-intermediate-one-ski). The introductory form lifts only the
tail, in a straight run, sideslip or traverse (psia-c-intro-one-ski).

**Movement goal.** Make each leg's role distinct, and build a stacked, centred stance over one ski
(psia-c-intermediate-one-ski).

**Differences from D1.**

- The whole ski is suspended, and it is lifted *before* the edge change. Edge release and engagement are
  done by the stance leg alone, so the stance leg's tipping and the trunk's lateral control work from the
  start of initiation.
- Holding the ski parallel to the snow, with no tip support, raises the hip-flexor and knee-flexor hold.
  The ski's weight acts on a long lever ahead of the foot, through the boot cuff onto the shin.
- Lateral balance of the whole body depends on one edge. Expect higher trunk and outside-hip co-contraction
  than D1.

| Segment | Initiation | Shaping | Finish |
|---|---|---|---|
| Outside (stance) ankle | Tips from little-toe edge to big-toe edge alone; eversion | Eversion and dorsiflexion held | Held, then released |
| Outside knee and hip | As D1, but the edge change starts from one leg | As D1 | As D1 |
| Inside ankle | Shin forward. Foot tips with the stance foot. | Held, ski parallel to the snow | Lowered at the next transition, or kept up |
| Inside knee and hip | Flex actively to lift the whole ski before the edge change | Held flexed; ski parallel to the snow | Held, then extended to set down |
| Pelvis | Inside half held up from the transition | As D1 | As D1 |

| Muscle (slug) | Side | I / S / F | Contraction | Role | Conf. | Sources |
|---|---|---|---|---|---|---|
| iliopsoas | inside | 2 / 2 / 2 | concentric, isometric | Lift and hold the thigh with no tip support | medium | jiroumaru-2014, juan-2024 |
| hamstrings | inside | 2 / 2 / 2 | concentric, isometric | Hold knee flexion against ski and boot weight | medium | chollet-2025 |
| tibialis-anterior | inside | 1 / 2 / 1 | isometric | Hold the ski level against the forebody dropping; tip it | low | — |
| gluteus-medius, gluteus-minimus | outside | 3 / 3 / 3 | isometric | Pelvic hold from the transition onward | medium | ganderton-2017, moore-2020 |
| quadriceps | outside | 2 / 3 / 3 | eccentric, isometric | Single-leg load throughout | medium | ishige-2021 |
| hamstrings | outside | 2 / 2 / 2 | isometric | Fore-aft and trunk-pitch control on one ski | medium | ishige-2021 |
| peroneals, tibialis-posterior | outside | 2 / 2 / 1 | isometric | Edge change by the stance foot alone | low | louie-1984 |
| quadratus-lumborum, obliques | inside | 2 / 2 / 2 | eccentric, isometric | Control the trunk's outward bend from the lengthened side | low | mcgill-1996 |

Errors: lifting late, which turns it into D1 and leaves the edge change to two feet; lifted ski crossing
or diverging (hip rotators not holding it parallel); hip dumped inside (as D1).

**DOF matrix (D2).**

| DOF | Side | Initiation | Shaping | Finish |
|---|---|---|---|---|
| Ankle DF/PF | outside | DF active: feet pulled back, shin to tongue; TA, EDL, EHL, FT con | DF held against turn force and boot flex; TA, EDL, EHL iso; SOL ecc then iso (GAS slack, knee bent) | DF held as pressure moves to heel; TA iso, SOL iso; if TA lets go the ankle opens (backseat) |
| Ankle DF/PF | inside | Lifted before edge change, ski held level; TA, EDL, EHL iso | Held level against forebody dropping; TA, EDL, EHL iso (higher than D1) | Held or set down at next switch; TA ecc |
| Ankle inv/ev | outside | Stance foot alone rolls little-toe edge to big-toe edge; PL, PB con; TP ecc | Eversion held; PL, PB iso; TP iso | Released alone; PL, PB ecc; TA, TP con |
| Ankle inv/ev | inside | Lifted ski tipped to match stance ski; TA, TP con | Tilt held; TA, TP iso | Back to neutral at set-down; TA, TP ecc |
| Foot arch, toes | outside | Arch held under load, pressure spread; INT, TP, FHL iso | Arch held under load, pressure spread; INT, TP, FHL iso | Arch held under load, pressure spread; INT, TP, FHL iso |
| Foot arch, toes | inside | Unloaded; INT low | Unloaded; INT low | Unloaded; INT low |
| Knee flex/ext | outside | Extends (extension transition) or stays flexed; VAS con or iso; MH, BF co-con | Flexes under load; VAS, RF ecc; MH, BF iso | Deepest flexion, then extends; VAS ecc, iso, then con |
| Knee flex/ext | inside | Active flexion lifts the ski; BF (incl. short head), MH, GRA, SAR, GAS con; VAS near idle | Held flexed; hamstrings, GRA, SAR iso | Extends to set down; hamstrings ecc |
| Knee tibial rot. | outside | Held near neutral against valgus and external rotation; MH, POP, SAR, GRA iso; BF iso | Held near neutral against valgus and external rotation; MH, POP, SAR, GRA iso; BF iso | Held near neutral against valgus and external rotation; MH, POP, SAR, GRA iso; BF iso |
| Knee tibial rot. | inside | Held neutral; POP, MH, BF iso (low) | Held neutral; POP, MH, BF iso (low) | Held neutral; POP, MH, BF iso (low) |
| Hip flex/ext | outside | Extends slightly or holds; GMAX, AM con or iso | Flexes under load; GMAX, AM, MH ecc | Flexed at peak, then extends; GMAX ecc then con |
| Hip flex/ext | inside | Active flexion lifts the thigh; IP, RF, TFL, SAR, ADD (pectineus, longus) con | Held flexed; IP, RF iso | Lowered; IP, RF ecc |
| Hip abd/add | outside | Knee toward turn: add of flexed femur, ADD, AM con; then abd (pelvis-on-femur) as load arrives, GMED, GMIN, TFL ecc to iso | Abducted, inside half of pelvis held; GMED, GMIN, TFL, upper GMAX iso; ADD, AM co-con iso | Held, back to neutral; GMED ecc |
| Hip abd/add | inside | Slight add, boot beside stance boot; ADD, pectineus con | Held; ADD iso; GMED iso against drifting further | Held, then neutral |
| Hip IR/ER | outside | IR, femur turns under pelvis; anterior GMED/GMIN, TFL, ADD con | IR held and braked; GMAX, DR, BF ecc/iso | Held, then neutral; DR, GMAX iso |
| Hip IR/ER | inside | ER keeps lifted ski parallel; DR, SAR, GMAX con | Held; DR, SAR iso | Held; DR iso |
| Pelvis tilt | both | Anterior tilt grows with hip hinge; IP, RF con; ES iso | Anterior tilt held, lumbar neutral; ES, MF iso; RA, TrA iso (anti-extension) | Held; ES, RA iso |
| Pelvis hike (list) | both | Inside half unsupported, held up (pelvis on outside femur); O GMED, GMIN, TFL, upper GMAX con/iso (high) | Held; O GMED, GMIN, TFL iso (high) | Held until set-down, then levels; O GMED ecc |
| Pelvis rotation | both | Slight counter forms as legs turn under it; O IO + I EO iso; hip rotators | Slight counter held; obliques iso | Held, then squares for release; obliques ecc |
| Lumbar flex/ext | both | Near neutral (not rounded or arched); ES, MF iso; RA iso; ES ecc under peak flexion moment | Near neutral (not rounded or arched); ES, MF iso; RA iso; ES ecc under peak flexion moment | Near neutral (not rounded or arched); ES, MF iso; RA iso; ES ecc under peak flexion moment |
| Lumbar lat. flex | both | Neutral to slight bend toward outside ski; I QL ecc (lengthens, controls the outward tilt) | Slight bend held; I QL, I obliques iso; O QL co-con | Returns to neutral; I QL con |
| Lumbar rotation | both | Held near neutral (little range); MF, obliques iso | Held near neutral (little range); MF, obliques iso | Held near neutral (little range); MF, obliques iso |
| Thoracic flex/ext | both | Slight flexion held, not rounded; thoracic ES iso | Slight flexion held, not rounded; thoracic ES iso | Slight flexion held, not rounded; thoracic ES iso |
| Thoracic lat. flex | both | Neutral to slight bend toward outside ski; I obliques ecc (lengthen) | Some bend held; I obliques iso, O obliques co-con | Returns; I obliques con |
| Thoracic rotation | both | Slight rotation toward outside of turn; O IO + I EO con | Held; O IO + I EO iso | Squares to the skis as they release, then the new counter forms as the legs turn under; I IO + O EO con |
| Shoulder girdle | outside | Slightly protracted, level; SA, TRAP iso | Slightly protracted, level; SA, TRAP iso | Slightly protracted, level; SA, TRAP iso |
| Shoulder girdle | inside | Slightly protracted, level; SA, TRAP iso | Slightly protracted, level; SA, TRAP iso | Slightly protracted, level; SA, TRAP iso |
| Shoulder | outside | Arm forward, in view; AD, RC iso | Held forward; AD, RC iso | Swings forward to prepare next touch; AD con |
| Shoulder | inside | Pole touch: small flexion then extension; AD con, LD, TMaj con | Arm forward, leads; AD, RC iso | Held; AD iso |
| Elbow | outside | Flexed about 90°, held; BB, brachialis iso | Flexed about 90°, held; BB, brachialis iso | Flexed about 90°, held; BB, brachialis iso |
| Elbow | inside | Flexed about 90°, held; BB iso; TRI con at touch | Flexed about 90°, held; BB iso; TRI con at touch | Flexed about 90°, held; BB iso; TRI con at touch |
| Wrist, grip | outside | Grip held; FF iso | Grip held; FF iso | Grip held; FF iso |
| Wrist, grip | inside | Wrist flick for touch; FF con, wrist extensors ecc | Grip held; FF iso | Grip held; FF iso |
| Neck | both | Head level, eyes ahead down the hill; SCM, SPL iso, counter-rotate against thorax | Head level, eyes ahead down the hill; SCM, SPL iso, counter-rotate against thorax | Head level, eyes ahead down the hill; SCM, SPL iso, counter-rotate against thorax |

Coverage: 34 DOF rows, 102 cells, all filled. 10 rows are specific to this drill; the other 24 follow the turn baseline (2.2).

### D3. Javelin turns

**Description.** Balanced on the outside ski, the inside ski is lifted and held across the front of the
stance ski. Its tip points across the outside ski's tip, roughly where the pelvis and upper body face,
while the outside leg turns underneath. Seen from above, the two skis form a javelin or an X. A coaching
article lists it among drills for long-leg/short-leg (kipp-2025). The description here is expert
reasoning; no publicly readable association page was fetched (the NZSIA manual blocked automated access).

**Movement goal.** Exaggerate rotational separation: the outside femur rotates internally under a pelvis
that stays facing downhill. Balance stays on the outside ski.

| Segment | Initiation | Shaping | Finish |
|---|---|---|---|
| Outside hip | Rotates internally under a still pelvis | Large internal rotation plus abduction, held | Held, then unwound at release |
| Inside hip | Flexes and adducts to carry the ski over the stance ski. Rotation stays close to the pelvis direction. | Held flexed and adducted (crossed) | Uncrossed, set down |
| Inside knee | Flexes to lift the ski | Held | Extends to set down |
| Pelvis and trunk | Face down the fall line | Strongly countered; held against the legs' torque | Unwind into the next turn |

| Muscle (slug) | Side | I / S / F | Contraction | Role | Conf. | Sources |
|---|---|---|---|---|---|---|
| gluteus-medius, gluteus-minimus, tensor-fasciae-latae | outside | 2 / 3 / 2 | concentric (rotate), isometric | Internal rotation of the flexed outside hip; pelvic hold | low | delp-1999 |
| adductors | outside | 2 / 2 / 2 | concentric, isometric | Internal rotation in flexion; frontal stiffness | low | delp-1999 |
| deep-hip-rotators, gluteus-maximus | outside | 1 / 2 / 2 | eccentric | Brake the outside femur's internal rotation | low | heinrich-2023 |
| adductors | inside | 2 / 2 / 1 | concentric, isometric | Carry the lifted ski across the stance ski | low | — |
| iliopsoas, quadriceps (rectus femoris), hamstrings | inside | 2 / 2 / 1 | concentric, isometric | Lift and hold, as D2 | medium | kroll-2010, jiroumaru-2014 |
| obliques | both | 2 / 3 / 2 | isometric | Hold the trunk facing downhill against the leg torque | medium | hintermeister-1997 |

Errors: shoulders follow the skis (no separation, obliques idle); the crossed ski touches down (balance
drifts inside); hip pushed back to make room (back seat).

**DOF matrix (D3).**

| DOF | Side | Initiation | Shaping | Finish |
|---|---|---|---|---|
| Ankle DF/PF | outside | DF active: feet pulled back, shin to tongue; TA, EDL, EHL, FT con | DF held against turn force and boot flex; TA, EDL, EHL iso; SOL ecc then iso (GAS slack, knee bent) | DF held as pressure moves to heel; TA iso, SOL iso; if TA lets go the ankle opens (backseat) |
| Ankle DF/PF | inside | Shin forward as the leg lifts; TA, EDL, EHL iso | Held; TA, EDL, EHL iso | Held, then flattens at set-down; TA ecc |
| Ankle inv/ev | outside | Eversion to big-toe edge; PL, PB con; TP ecc | Eversion torque held; PL, PB iso; TP iso (arch) | Back to neutral at release; PL, PB ecc |
| Ankle inv/ev | inside | Lifted ski tipped to match stance ski; TA, TP con | Tilt held; TA, TP iso | Back to neutral at set-down; TA, TP ecc |
| Foot arch, toes | outside | Arch held under load, pressure spread; INT, TP, FHL iso | Arch held under load, pressure spread; INT, TP, FHL iso | Arch held under load, pressure spread; INT, TP, FHL iso |
| Foot arch, toes | inside | Unloaded; INT low | Unloaded; INT low | Unloaded; INT low |
| Knee flex/ext | outside | Extends (extension transition) or stays flexed; VAS con or iso; MH, BF co-con | Flexes under load; VAS, RF ecc; MH, BF iso | Deepest flexion, then extends; VAS ecc, iso, then con |
| Knee flex/ext | inside | Active flexion lifts the ski; BF (incl. short head), MH, GRA, SAR, GAS con; VAS near idle | Held flexed; hamstrings, GRA, SAR iso | Extends to set down; hamstrings ecc |
| Knee tibial rot. | outside | Held near neutral against valgus and external rotation; MH, POP, SAR, GRA iso; BF iso | Held near neutral against valgus and external rotation; MH, POP, SAR, GRA iso; BF iso | Held near neutral against valgus and external rotation; MH, POP, SAR, GRA iso; BF iso |
| Knee tibial rot. | inside | Held neutral; POP, MH, BF iso (low) | Held neutral; POP, MH, BF iso (low) | Held neutral; POP, MH, BF iso (low) |
| Hip flex/ext | outside | Extends slightly or holds; GMAX, AM con or iso | Flexes under load; GMAX, AM, MH ecc | Flexed at peak, then extends; GMAX ecc then con |
| Hip flex/ext | inside | Active flexion lifts the thigh; IP, RF, TFL, SAR, ADD (pectineus, longus) con | Held flexed; IP, RF iso | Lowered; IP, RF ecc |
| Hip abd/add | outside | Knee toward turn: add of flexed femur, ADD, AM con; then abd (pelvis-on-femur) as load arrives, GMED, GMIN, TFL ecc to iso | Abducted, inside half of pelvis held; GMED, GMIN, TFL, upper GMAX iso; ADD, AM co-con iso | Held, back to neutral; GMED ecc |
| Hip abd/add | inside | Adducts to carry lifted ski across the stance ski; ADD, pectineus con | Held crossed; ADD iso | Uncrossed; ADD ecc |
| Hip IR/ER | outside | Large IR under still pelvis; anterior GMED/GMIN, TFL, ADD, AM con | Large IR held; DR, GMAX ecc/iso | Unwinds at release; DR con |
| Hip IR/ER | inside | Kept near pelvis direction (ski points where pelvis faces); DR vs GMED/TFL iso | Kept near pelvis direction (ski points where pelvis faces); DR vs GMED/TFL iso | Kept near pelvis direction (ski points where pelvis faces); DR vs GMED/TFL iso |
| Pelvis tilt | both | Anterior tilt grows with hip hinge; IP, RF con; ES iso | Anterior tilt held, lumbar neutral; ES, MF iso; RA, TrA iso (anti-extension) | Held; ES, RA iso |
| Pelvis hike (list) | both | Inside half unsupported, held up (pelvis on outside femur); O GMED, GMIN, TFL, upper GMAX con/iso (high) | Held; O GMED, GMIN, TFL iso (high) | Held until set-down, then levels; O GMED ecc |
| Pelvis rotation | both | Faces down fall line, strong counter (40° to 60°); O IO + I EO iso (high) | Faces down fall line, strong counter (40° to 60°); O IO + I EO iso (high) | Faces down fall line, strong counter (40° to 60°); O IO + I EO iso (high) |
| Lumbar flex/ext | both | Near neutral (not rounded or arched); ES, MF iso; RA iso; ES ecc under peak flexion moment | Near neutral (not rounded or arched); ES, MF iso; RA iso; ES ecc under peak flexion moment | Near neutral (not rounded or arched); ES, MF iso; RA iso; ES ecc under peak flexion moment |
| Lumbar lat. flex | both | Neutral to slight bend toward outside ski; I QL ecc (lengthens, controls the outward tilt) | Slight bend held; I QL, I obliques iso; O QL co-con | Returns to neutral; I QL con |
| Lumbar rotation | both | Held near neutral (little range); MF, obliques iso | Held near neutral (little range); MF, obliques iso | Held near neutral (little range); MF, obliques iso |
| Thoracic flex/ext | both | Slight flexion held, not rounded; thoracic ES iso | Slight flexion held, not rounded; thoracic ES iso | Slight flexion held, not rounded; thoracic ES iso |
| Thoracic lat. flex | both | Neutral to slight bend toward outside ski; I obliques ecc (lengthen) | Some bend held; I obliques iso, O obliques co-con | Returns; I obliques con |
| Thoracic rotation | both | Held with pelvis; obliques iso (high) | Held with pelvis; obliques iso (high) | Held with pelvis; obliques iso (high) |
| Shoulder girdle | outside | Slightly protracted, level; SA, TRAP iso | Slightly protracted, level; SA, TRAP iso | Slightly protracted, level; SA, TRAP iso |
| Shoulder girdle | inside | Slightly protracted, level; SA, TRAP iso | Slightly protracted, level; SA, TRAP iso | Slightly protracted, level; SA, TRAP iso |
| Shoulder | outside | Arm forward, in view; AD, RC iso | Held forward; AD, RC iso | Swings forward to prepare next touch; AD con |
| Shoulder | inside | Pole touch: small flexion then extension; AD con, LD, TMaj con | Arm forward, leads; AD, RC iso | Held; AD iso |
| Elbow | outside | Flexed about 90°, held; BB, brachialis iso | Flexed about 90°, held; BB, brachialis iso | Flexed about 90°, held; BB, brachialis iso |
| Elbow | inside | Flexed about 90°, held; BB iso; TRI con at touch | Flexed about 90°, held; BB iso; TRI con at touch | Flexed about 90°, held; BB iso; TRI con at touch |
| Wrist, grip | outside | Grip held; FF iso | Grip held; FF iso | Grip held; FF iso |
| Wrist, grip | inside | Wrist flick for touch; FF con, wrist extensors ecc | Grip held; FF iso | Grip held; FF iso |
| Neck | both | Head level, eyes ahead down the hill; SCM, SPL iso, counter-rotate against thorax | Head level, eyes ahead down the hill; SCM, SPL iso, counter-rotate against thorax | Head level, eyes ahead down the hill; SCM, SPL iso, counter-rotate against thorax |

Coverage: 34 DOF rows, 102 cells, all filled. 12 rows are specific to this drill; the other 22 follow the turn baseline (2.2).

### D4. Thousand steps

**Description.** Linked large turns with continuous small steps from ski to ski, made while both skis are
on edge. After the first diverging step into the turn, the skis stay nearly parallel. Each lifted ski
stays parallel to the snow, and stepping continues through the edge change. The legs flex and extend
independently (psia-c-1000-steps).

**Movement goal.** Independent leg action. Accurate, early weight transfer to the outside ski. A centred
stance kept through constant single-leg moments.

**Phase mapping.** The cycle repeats every step; turn phases describe where in the arc it happens.

| Segment | Initiation | Shaping | Finish |
|---|---|---|---|
| Stepping legs, alternately | Lift: hip and knee flex. Plant: extend onto the edge. | Steps continue, mostly onto the outside ski; the inside ski is placed and lifted | Same |
| Outside hip | Abducts and rotates internally each time it takes weight | Same | Same |
| Pelvis | Hikes and drops alternately, side to side, a little | Stays mostly level relative to the balance axis | Same |

| Muscle (slug) | Side | I / S / F | Contraction | Role | Conf. | Sources |
|---|---|---|---|---|---|---|
| iliopsoas, quadriceps (rectus femoris) | both, alternately | 2 / 2 / 2 | concentric (lift), eccentric (place) | Repeated leg lifts | medium | andersson-1997, kroll-2010 |
| hamstrings | both | 2 / 2 / 2 | concentric, isometric | Knee flexion to lift; co-contraction on landing | medium | hintermeister-1997 |
| gluteus-medius, gluteus-minimus | both, alternately | 2 / 2 / 2 | isometric, eccentric | Repeated single-leg pelvic holds; absorb pelvic drop at each step | medium | ganderton-2017, distefano-2009 |
| quadriceps | outside | 2 / 2 / 2 | eccentric then concentric | Absorb each step, then push off | medium | hintermeister-1997 |
| quadratus-lumborum, obliques | both | 1 / 1 / 1 | isometric | Lateral trunk control with each weight shift | low | — |

Errors: steps with diverging, rotated skis (rotary instead of edging); upper body sways side to side
(stepping with the trunk, not the legs); stepping only on the outside ski.

**DOF matrix (D4).**

| DOF | Side | Initiation | Shaping | Finish |
|---|---|---|---|---|
| Ankle DF/PF | outside | DF held through every step; TA, EDL, EHL iso, con at each re-centring | DF held through every step; TA, EDL, EHL iso, con at each re-centring | DF held through every step; TA, EDL, EHL iso, con at each re-centring |
| Ankle DF/PF | inside | DF held as foot lifts and replaces; TA, EDL, EHL iso | DF held as foot lifts and replaces; TA, EDL, EHL iso | DF held as foot lifts and replaces; TA, EDL, EHL iso |
| Ankle inv/ev | outside | Eversion to big-toe edge; PL, PB con; TP ecc | Eversion torque held; PL, PB iso; TP iso (arch) | Back to neutral at release; PL, PB ecc |
| Ankle inv/ev | inside | Inversion to little-toe edge, leading; TA, TP con | Inversion held; TA, TP iso; PL ecc/iso | Back to neutral; TA, TP ecc |
| Foot arch, toes | outside | Arch held under load, pressure spread; INT, TP, FHL iso | Arch held under load, pressure spread; INT, TP, FHL iso | Arch held under load, pressure spread; INT, TP, FHL iso |
| Foot arch, toes | inside | Arch held, light load; INT iso | Arch held, light load; INT iso | Arch held, light load; INT iso |
| Knee flex/ext | outside | Alternates: absorb each step (VAS ecc), push off (VAS con) | Alternates: absorb each step (VAS ecc), push off (VAS con) | Alternates: absorb each step (VAS ecc), push off (VAS con) |
| Knee flex/ext | inside | Alternates: lift (hamstrings, GAS con), place (VAS ecc) | Alternates: lift (hamstrings, GAS con), place (VAS ecc) | Alternates: lift (hamstrings, GAS con), place (VAS ecc) |
| Knee tibial rot. | outside | Held near neutral against valgus and external rotation; MH, POP, SAR, GRA iso; BF iso | Held near neutral against valgus and external rotation; MH, POP, SAR, GRA iso; BF iso | Held near neutral against valgus and external rotation; MH, POP, SAR, GRA iso; BF iso |
| Knee tibial rot. | inside | Held neutral; POP, MH, BF iso (low) | Held neutral; POP, MH, BF iso (low) | Held neutral; POP, MH, BF iso (low) |
| Hip flex/ext | outside | Alternates: absorb (GMAX ecc), push (GMAX con) | Alternates: absorb (GMAX ecc), push (GMAX con) | Alternates: absorb (GMAX ecc), push (GMAX con) |
| Hip flex/ext | inside | Alternates: lift (IP, RF con), place (IP ecc) | Alternates: lift (IP, RF con), place (IP ecc) | Alternates: lift (IP, RF con), place (IP ecc) |
| Hip abd/add | outside | Repeated single-leg pelvic holds; GMED, GMIN, TFL iso/ecc | Repeated single-leg pelvic holds; GMED, GMIN, TFL iso/ecc | Repeated single-leg pelvic holds; GMED, GMIN, TFL iso/ecc |
| Hip abd/add | inside | Repeated single-leg pelvic holds when stance; GMED, GMIN iso/ecc | Repeated single-leg pelvic holds when stance; GMED, GMIN iso/ecc | Repeated single-leg pelvic holds when stance; GMED, GMIN iso/ecc |
| Hip IR/ER | outside | IR, femur turns under pelvis; anterior GMED/GMIN, TFL, ADD con | IR held and braked; GMAX, DR, BF ecc/iso | Held, then neutral; DR, GMAX iso |
| Hip IR/ER | inside | ER; DR, GMAX, SAR con | ER held (10-26 deg) against an IR moment; anterior GMED/GMIN, TFL, ADD iso | Held; same iso |
| Pelvis tilt | both | Anterior tilt grows with hip hinge; IP, RF con; ES iso | Anterior tilt held, lumbar neutral; ES, MF iso; RA, TrA iso (anti-extension) | Held; ES, RA iso |
| Pelvis hike (list) | both | Small alternating hike and drop each step; stance GMED/GMIN, opposite QL iso/ecc | Small alternating hike and drop each step; stance GMED/GMIN, opposite QL iso/ecc | Small alternating hike and drop each step; stance GMED/GMIN, opposite QL iso/ecc |
| Pelvis rotation | both | Slight counter forms as legs turn under it; O IO + I EO iso; hip rotators | Slight counter held; obliques iso | Held, then squares for release; obliques ecc |
| Lumbar flex/ext | both | Near neutral (not rounded or arched); ES, MF iso; RA iso; ES ecc under peak flexion moment | Near neutral (not rounded or arched); ES, MF iso; RA iso; ES ecc under peak flexion moment | Near neutral (not rounded or arched); ES, MF iso; RA iso; ES ecc under peak flexion moment |
| Lumbar lat. flex | both | Small alternating shifts, trunk quiet; QL both sides iso | Small alternating shifts, trunk quiet; QL both sides iso | Small alternating shifts, trunk quiet; QL both sides iso |
| Lumbar rotation | both | Held near neutral (little range); MF, obliques iso | Held near neutral (little range); MF, obliques iso | Held near neutral (little range); MF, obliques iso |
| Thoracic flex/ext | both | Slight flexion held, not rounded; thoracic ES iso | Slight flexion held, not rounded; thoracic ES iso | Slight flexion held, not rounded; thoracic ES iso |
| Thoracic lat. flex | both | Neutral to slight bend toward outside ski; I obliques ecc (lengthen) | Some bend held; I obliques iso, O obliques co-con | Returns; I obliques con |
| Thoracic rotation | both | Slight rotation toward outside of turn; O IO + I EO con | Held; O IO + I EO iso | Squares to the skis as they release, then the new counter forms as the legs turn under; I IO + O EO con |
| Shoulder girdle | outside | Slightly protracted, level; SA, TRAP iso | Slightly protracted, level; SA, TRAP iso | Slightly protracted, level; SA, TRAP iso |
| Shoulder girdle | inside | Slightly protracted, level; SA, TRAP iso | Slightly protracted, level; SA, TRAP iso | Slightly protracted, level; SA, TRAP iso |
| Shoulder | outside | Arm forward, in view; AD, RC iso | Held forward; AD, RC iso | Swings forward to prepare next touch; AD con |
| Shoulder | inside | Pole touch: small flexion then extension; AD con, LD, TMaj con | Arm forward, leads; AD, RC iso | Held; AD iso |
| Elbow | outside | Flexed about 90°, held; BB, brachialis iso | Flexed about 90°, held; BB, brachialis iso | Flexed about 90°, held; BB, brachialis iso |
| Elbow | inside | Flexed about 90°, held; BB iso; TRI con at touch | Flexed about 90°, held; BB iso; TRI con at touch | Flexed about 90°, held; BB iso; TRI con at touch |
| Wrist, grip | outside | Grip held; FF iso | Grip held; FF iso | Grip held; FF iso |
| Wrist, grip | inside | Wrist flick for touch; FF con, wrist extensors ecc | Grip held; FF iso | Grip held; FF iso |
| Neck | both | Head level, eyes ahead down the hill; SCM, SPL iso, counter-rotate against thorax | Head level, eyes ahead down the hill; SCM, SPL iso, counter-rotate against thorax | Head level, eyes ahead down the hill; SCM, SPL iso, counter-rotate against thorax |

Coverage: 34 DOF rows, 102 cells, all filled. 10 rows are specific to this drill; the other 24 follow the turn baseline (2.2).

### D5. Railroad tracks (edge-roll turns), with the one-footed variant

**Description.** On gentle terrain, the skis are rolled from one set of edges, through flat, onto the other,
with no steering. The tails follow the tips and leave two thin parallel tracks. Turns fit a narrow
corridor. Both skis tip at the same time and rate, and the tipping starts in the lower body
(psia-c-railroad-tracks, psia-c-beginning-railroad-tracks). One-footed railroad tracks do the same on one
ski, with the lifted ski held quiet and tipped in step (psia-c-one-footed-railroad-track).

**Movement goal.** Edging from the feet and lower legs under a quiet upper body. Feel the ski's sidecut
make the turn.

| Segment | Initiation | Shaping | Finish |
|---|---|---|---|
| Ankles | Both roll from edge to flat to new edge: outside foot everts, inside foot inverts, inside the boots | Small edge angles held | Rolled back to flat |
| Knees | Small lateral movement accompanying the ankle roll | Slight flexion | Slight extension through flat |
| Hips | Small abduction (outside) and adduction (inside); little rotation | Held | Return |
| Pelvis and trunk | Quiet, centred over the skis | Quiet | Quiet |

| Muscle (slug) | Side | I / S / F | Contraction | Role | Conf. | Sources |
|---|---|---|---|---|---|---|
| peroneals | outside | 2 / 1 / 1 | concentric then isometric | Evert to tip onto the big-toe edge | low | louie-1984 |
| tibialis-anterior, tibialis-posterior | inside | 2 / 1 / 1 | concentric then isometric | Invert to tip onto the little-toe edge | low | — |
| gluteus-medius, adductors | both | 1 / 1 / 1 | isometric | Small frontal-plane hip control | low | — |
| quadriceps, gluteus-maximus | both | 1 / 1 / 1 | isometric | Low, steady stance load (low speed, large radius) | medium | hintermeister-1997 (lower demand in easy turns) |
| One-footed: whole D2 inside-leg set | lifted | 1 / 1 / 1 | isometric | Hold the lifted ski parallel and tip it in step | low | — |

Errors: tipping from the hips or upper body (banking, trunk sways); steering the skis (skidded tracks);
leading with one ski (ankles tip at different rates).

**DOF matrix (D5).**

| DOF | Side | Initiation | Shaping | Finish |
|---|---|---|---|---|
| Ankle DF/PF | outside | DF held, centred; TA, EDL, EHL iso (low) | DF held, centred; TA, EDL, EHL iso (low) | DF held, centred; TA, EDL, EHL iso (low) |
| Ankle DF/PF | inside | DF held, centred; TA, EDL, EHL iso (low) | DF held, centred; TA, EDL, EHL iso (low) | DF held, centred; TA, EDL, EHL iso (low) |
| Ankle inv/ev | outside | Rolls to big-toe edge together with inside foot; PL, PB con | Small edge held; PL, PB iso | Rolls to flat; PL ecc |
| Ankle inv/ev | inside | Rolls to little-toe edge first (big toe up); TA, TP con | Held; TA, TP iso | Rolls to flat; TA, TP ecc |
| Foot arch, toes | outside | Arch held under load, pressure spread; INT, TP, FHL iso | Arch held under load, pressure spread; INT, TP, FHL iso | Arch held under load, pressure spread; INT, TP, FHL iso |
| Foot arch, toes | inside | Arch held, light load; INT iso | Arch held, light load; INT iso | Arch held, light load; INT iso |
| Knee flex/ext | outside | Slight flexion, little change; VAS iso (low) | Slight flexion, little change; VAS iso (low) | Slight flexion, little change; VAS iso (low) |
| Knee flex/ext | inside | Slight flexion, little change; VAS iso (low) | Slight flexion, little change; VAS iso (low) | Slight flexion, little change; VAS iso (low) |
| Knee tibial rot. | outside | Held near neutral against valgus and external rotation; MH, POP, SAR, GRA iso; BF iso | Held near neutral against valgus and external rotation; MH, POP, SAR, GRA iso; BF iso | Held near neutral against valgus and external rotation; MH, POP, SAR, GRA iso; BF iso |
| Knee tibial rot. | inside | Held neutral; POP, MH, BF iso (low) | Held neutral; POP, MH, BF iso (low) | Held neutral; POP, MH, BF iso (low) |
| Hip flex/ext | outside | Slight flexion held; GMAX iso (low) | Slight flexion held; GMAX iso (low) | Slight flexion held; GMAX iso (low) |
| Hip flex/ext | inside | Slight flexion held; GMAX iso (low) | Slight flexion held; GMAX iso (low) | Slight flexion held; GMAX iso (low) |
| Hip abd/add | outside | Small abduction as legs tip; GMED, ADD iso (low) | Small abduction as legs tip; GMED, ADD iso (low) | Small abduction as legs tip; GMED, ADD iso (low) |
| Hip abd/add | inside | Small adduction as legs tip; ADD, GMED iso (low) | Small adduction as legs tip; ADD, GMED iso (low) | Small adduction as legs tip; ADD, GMED iso (low) |
| Hip IR/ER | outside | Held neutral, no steering; DR vs GMED/TFL iso (low) | Held neutral, no steering; DR vs GMED/TFL iso (low) | Held neutral, no steering; DR vs GMED/TFL iso (low) |
| Hip IR/ER | inside | Held neutral, no steering; DR vs GMED/TFL iso (low) | Held neutral, no steering; DR vs GMED/TFL iso (low) | Held neutral, no steering; DR vs GMED/TFL iso (low) |
| Pelvis tilt | both | Anterior tilt grows with hip hinge; IP, RF con; ES iso | Anterior tilt held, lumbar neutral; ES, MF iso; RA, TrA iso (anti-extension) | Held; ES, RA iso |
| Pelvis hike (list) | both | Level; GMED both sides iso (low) | Level; GMED both sides iso (low) | Level; GMED both sides iso (low) |
| Pelvis rotation | both | Square, no counter; obliques iso (low) | Square, no counter; obliques iso (low) | Square, no counter; obliques iso (low) |
| Lumbar flex/ext | both | Near neutral (not rounded or arched); ES, MF iso; RA iso; ES ecc under peak flexion moment | Near neutral (not rounded or arched); ES, MF iso; RA iso; ES ecc under peak flexion moment | Near neutral (not rounded or arched); ES, MF iso; RA iso; ES ecc under peak flexion moment |
| Lumbar lat. flex | both | Neutral, trunk quiet; QL iso (low) | Neutral, trunk quiet; QL iso (low) | Neutral, trunk quiet; QL iso (low) |
| Lumbar rotation | both | Held near neutral (little range); MF, obliques iso | Held near neutral (little range); MF, obliques iso | Held near neutral (little range); MF, obliques iso |
| Thoracic flex/ext | both | Slight flexion held, not rounded; thoracic ES iso | Slight flexion held, not rounded; thoracic ES iso | Slight flexion held, not rounded; thoracic ES iso |
| Thoracic lat. flex | both | Neutral; obliques iso (low) | Neutral; obliques iso (low) | Neutral; obliques iso (low) |
| Thoracic rotation | both | Neutral; obliques iso (low) | Neutral; obliques iso (low) | Neutral; obliques iso (low) |
| Shoulder girdle | outside | Slightly protracted, level; SA, TRAP iso | Slightly protracted, level; SA, TRAP iso | Slightly protracted, level; SA, TRAP iso |
| Shoulder girdle | inside | Slightly protracted, level; SA, TRAP iso | Slightly protracted, level; SA, TRAP iso | Slightly protracted, level; SA, TRAP iso |
| Shoulder | outside | Arm forward, in view; AD, RC iso | Held forward; AD, RC iso | Swings forward to prepare next touch; AD con |
| Shoulder | inside | Pole touch: small flexion then extension; AD con, LD, TMaj con | Arm forward, leads; AD, RC iso | Held; AD iso |
| Elbow | outside | Flexed about 90°, held; BB, brachialis iso | Flexed about 90°, held; BB, brachialis iso | Flexed about 90°, held; BB, brachialis iso |
| Elbow | inside | Flexed about 90°, held; BB iso; TRI con at touch | Flexed about 90°, held; BB iso; TRI con at touch | Flexed about 90°, held; BB iso; TRI con at touch |
| Wrist, grip | outside | Grip held; FF iso | Grip held; FF iso | Grip held; FF iso |
| Wrist, grip | inside | Wrist flick for touch; FF con, wrist extensors ecc | Grip held; FF iso | Grip held; FF iso |
| Neck | both | Head level, eyes ahead down the hill; SCM, SPL iso, counter-rotate against thorax | Head level, eyes ahead down the hill; SCM, SPL iso, counter-rotate against thorax | Head level, eyes ahead down the hill; SCM, SPL iso, counter-rotate against thorax |

Coverage: 34 DOF rows, 102 cells, all filled. 17 rows are specific to this drill; the other 17 follow the turn baseline (2.2).

### D6. Side slip (fall-line and diagonal)

**Description.** Skis across the fall line, parallel, slipping sideways down a corridor at a steady rate.
Tipping the feet uphill sets the edges more and slows the slip; tipping downhill releases. The pelvis and
upper body face downhill as a result of the legs turning. The uphill half of the body is slightly raised
and forward (psia-c-sideslip-fall-line). The diagonal version slips forward and down across the hill at a
steady angle (psia-c-diagonal-side-slip).

**Phase mapping.** Initiation = releasing the edges from a traverse or stop. Shaping = the steady slip.
Finish = edge set to slow and stop. Outside = downhill ski.

| Segment | Initiation | Shaping | Finish |
|---|---|---|---|
| Ankles | Tip downhill (release): downhill foot inverts, uphill foot everts less | Fine tipping adjustments hold a constant slip rate | Tip uphill (edge set) |
| Knees and hips | Flexed, roughly in proportion | Held. Downhill hip flexed and externally rotated relative to a downhill-facing pelvis. | Flex a little to absorb the edge set |
| Pelvis | Faces downhill. Uphill half slightly up and forward. | Held | Held |
| Trunk | Faces downhill, quiet | Hip angulation balances over the downhill ski | Angulation increases with the edge set |

| Muscle (slug) | Side | I / S / F | Contraction | Role | Conf. | Sources |
|---|---|---|---|---|---|---|
| gluteus-medius, gluteus-minimus | outside (downhill) | 1 / 2 / 2 | isometric | Hold the pelvis over the downhill leg; angulation | medium | ganderton-2017 |
| deep-hip-rotators, gluteus-maximus | both | 1 / 2 / 2 | isometric | Hold the femurs rotated across the hill under a downhill-facing pelvis | low | delp-1999 |
| quadriceps | both | 1 / 2 / 2 | isometric, eccentric | Hold the flexed stance; absorb the edge set | medium | hintermeister-1997 |
| peroneals, tibialis-anterior, tibialis-posterior | both | 2 / 2 / 2 | isometric | Fine edge-angle control in the boot | low | — |
| obliques, quadratus-lumborum | both | 1 / 1 / 2 | isometric | Hold the downhill-facing trunk and the uphill half up | low | — |

Errors: facing across the hill (no separation, slip turns into a traverse); leaning uphill (edges lock,
slip stops); weight on the uphill ski.

**DOF matrix (D6).**

| DOF | Side | Initiation | Shaping | Finish |
|---|---|---|---|---|
| Ankle DF/PF | outside | DF held, centred; TA, EDL, EHL iso; SOL iso | DF held, centred; TA, EDL, EHL iso; SOL iso | DF held, centred; TA, EDL, EHL iso; SOL iso |
| Ankle DF/PF | inside | DF held, centred; TA, EDL, EHL iso; SOL iso | DF held, centred; TA, EDL, EHL iso; SOL iso | DF held, centred; TA, EDL, EHL iso; SOL iso |
| Ankle inv/ev | outside | Release: inversion toward flat; TA, TP con | Fine edge control; PL, PB vs TA, TP iso | Edge set: eversion; PL, PB con |
| Ankle inv/ev | inside | Release: eversion toward flat; PL, PB con | Fine edge control; TA, TP vs PL iso | Edge set: inversion; TA, TP con |
| Foot arch, toes | outside | Arch held under load, pressure spread; INT, TP, FHL iso | Arch held under load, pressure spread; INT, TP, FHL iso | Arch held under load, pressure spread; INT, TP, FHL iso |
| Foot arch, toes | inside | Arch held, light load; INT iso | Arch held, light load; INT iso | Arch held, light load; INT iso |
| Knee flex/ext | outside | Flexed, held; VAS iso; MH, BF co-con; ecc at edge set | Flexed, held; VAS iso; MH, BF co-con; ecc at edge set | Flexed, held; VAS iso; MH, BF co-con; ecc at edge set |
| Knee flex/ext | inside | Flexed, held; VAS iso; hamstrings co-con | Flexed, held; VAS iso; hamstrings co-con | Flexed, held; VAS iso; hamstrings co-con |
| Knee tibial rot. | outside | Held near neutral against valgus and external rotation; MH, POP, SAR, GRA iso; BF iso | Held near neutral against valgus and external rotation; MH, POP, SAR, GRA iso; BF iso | Held near neutral against valgus and external rotation; MH, POP, SAR, GRA iso; BF iso |
| Knee tibial rot. | inside | Held neutral; POP, MH, BF iso (low) | Held neutral; POP, MH, BF iso (low) | Held neutral; POP, MH, BF iso (low) |
| Hip flex/ext | outside | Flexed, held; GMAX, AM iso | Flexed, held; GMAX, AM iso | Flexed, held; GMAX, AM iso |
| Hip flex/ext | inside | Flexed, slightly more; GMAX iso | Flexed, slightly more; GMAX iso | Flexed, slightly more; GMAX iso |
| Hip abd/add | outside | Abducted under a pelvis held over the downhill ski; GMED, GMIN, TFL iso; ADD co-con | Abducted under a pelvis held over the downhill ski; GMED, GMIN, TFL iso; ADD co-con | Abducted under a pelvis held over the downhill ski; GMED, GMIN, TFL iso; ADD co-con |
| Hip abd/add | inside | Adducted, held; ADD iso | Adducted, held; ADD iso | Adducted, held; ADD iso |
| Hip IR/ER | outside | Femur rotated across the hill under a downhill-facing pelvis (ER relative to pelvis); DR, GMAX iso | Femur rotated across the hill under a downhill-facing pelvis (ER relative to pelvis); DR, GMAX iso | Femur rotated across the hill under a downhill-facing pelvis (ER relative to pelvis); DR, GMAX iso |
| Hip IR/ER | inside | Femur rotated across the hill (IR relative to pelvis); GMED/GMIN ant, TFL, ADD iso | Femur rotated across the hill (IR relative to pelvis); GMED/GMIN ant, TFL, ADD iso | Femur rotated across the hill (IR relative to pelvis); GMED/GMIN ant, TFL, ADD iso |
| Pelvis tilt | both | Anterior tilt held; ES, MF, RA, TrA iso | Anterior tilt held; ES, MF, RA, TrA iso | Anterior tilt held; ES, MF, RA, TrA iso |
| Pelvis hike (list) | both | Uphill half held slightly up; downhill GMED, GMIN iso; uphill QL iso | Uphill half held slightly up; downhill GMED, GMIN iso; uphill QL iso | Uphill half held slightly up; downhill GMED, GMIN iso; uphill QL iso |
| Pelvis rotation | both | Faces downhill, about 70° to 90° to the skis; obliques iso | Faces downhill, about 70° to 90° to the skis; obliques iso | Faces downhill, about 70° to 90° to the skis; obliques iso |
| Lumbar flex/ext | both | Near neutral (not rounded or arched); ES, MF iso; RA iso; ES ecc under peak flexion moment | Near neutral (not rounded or arched); ES, MF iso; RA iso; ES ecc under peak flexion moment | Near neutral (not rounded or arched); ES, MF iso; RA iso; ES ecc under peak flexion moment |
| Lumbar lat. flex | both | Slight bend toward downhill ski; uphill QL iso | Slight bend toward downhill ski; uphill QL iso | Slight bend toward downhill ski; uphill QL iso |
| Lumbar rotation | both | Held near neutral (little range); MF, obliques iso | Held near neutral (little range); MF, obliques iso | Held near neutral (little range); MF, obliques iso |
| Thoracic flex/ext | both | Slight flexion held, not rounded; thoracic ES iso | Slight flexion held, not rounded; thoracic ES iso | Slight flexion held, not rounded; thoracic ES iso |
| Thoracic lat. flex | both | Slight bend toward downhill ski; uphill obliques iso | Slight bend toward downhill ski; uphill obliques iso | Slight bend toward downhill ski; uphill obliques iso |
| Thoracic rotation | both | Held facing downhill with pelvis; obliques iso | Held facing downhill with pelvis; obliques iso | Held facing downhill with pelvis; obliques iso |
| Shoulder girdle | outside | Slightly protracted, level; SA, TRAP iso | Slightly protracted, level; SA, TRAP iso | Slightly protracted, level; SA, TRAP iso |
| Shoulder girdle | inside | Slightly protracted, level; SA, TRAP iso | Slightly protracted, level; SA, TRAP iso | Slightly protracted, level; SA, TRAP iso |
| Shoulder | outside | Arms forward; AD, RC iso | Arms forward; AD, RC iso | Arms forward; AD, RC iso |
| Shoulder | inside | Arms forward; AD, RC iso | Arms forward; AD, RC iso | Arms forward; AD, RC iso |
| Elbow | outside | Flexed about 90°, held; BB, brachialis iso | Flexed about 90°, held; BB, brachialis iso | Flexed about 90°, held; BB, brachialis iso |
| Elbow | inside | Flexed, held; BB iso | Flexed, held; BB iso | Flexed, held; BB iso |
| Wrist, grip | outside | Grip held; FF iso | Grip held; FF iso | Grip held; FF iso |
| Wrist, grip | inside | Grip held; FF iso | Grip held; FF iso | Grip held; FF iso |
| Neck | both | Head level, facing downhill; SCM, SPL iso | Head level, facing downhill; SCM, SPL iso | Head level, facing downhill; SCM, SPL iso |

Coverage: 34 DOF rows, 102 cells, all filled. 0 rows are specific to this drill; the other 34 follow the slip baseline (2.2).

### D7. Falling leaf

**Description.** From a sideslip, small fore-aft shifts and light steering make the skis travel forward
and then backward while slipping down a corridor. The same ski stays downhill throughout. The skis bend
from the centre (psia-c-falling-leaf).

**Phase mapping.** Initiation = forward-slipping segment. Shaping = the reversal through a pure sideslip.
Finish = backward-slipping segment. Repeat.

| Segment | Initiation (forward) | Shaping (reversal) | Finish (backward) |
|---|---|---|---|
| Ankles | Dorsiflex more into the tongues; the centre of mass moves toward the tips | Centred | Ease off the tongues; pressure moves toward the heels |
| Knees and hips | Slight flexion forward | Neutral | Slight extension or hip flexion back |
| Hip rotation | Small rotation turns the tips slightly downhill | Neutral | Small rotation turns the tails slightly downhill |
| Pelvis and trunk | Face downhill, quiet; angulation over the downhill ski | Same | Same |

| Muscle (slug) | Side | I / S / F | Contraction | Role | Conf. | Sources |
|---|---|---|---|---|---|---|
| tibialis-anterior | both | 2 / 1 / 1 | isometric, concentric | Move forward against the tongue | medium | hintermeister-1997 |
| calf | both | 1 / 1 / 2 | isometric | Control the backward shift; stiffness against the boot | medium | hintermeister-1997 |
| hamstrings, gluteus-maximus | both | 1 / 1 / 2 | isometric | Hip-hinge control when moving back | low | ishige-2021 |
| deep-hip-rotators, adductors, gluteus-medius | both | 1 / 1 / 1 | concentric, isometric | Small steering under a still pelvis | low | delp-1999 |
| gluteus-medius | outside (downhill) | 1 / 1 / 1 | isometric | Angulation over the downhill ski | low | — |

Errors: steering with the upper body; moving fore-aft with the trunk instead of the ankles (big pitch
swings, hamstring and erector load rises); drifting into a traverse.

**DOF matrix (D7).**

| DOF | Side | Initiation | Shaping | Finish |
|---|---|---|---|---|
| Ankle DF/PF | outside | Forward segment: more DF into tongue; TA, EDL, EHL con | Reversal: centred; TA, SOL iso | Backward segment: ease off tongue, pressure to heel; TA ecc, SOL iso |
| Ankle DF/PF | inside | Forward: DF; TA, EDL, EHL con | Centred; TA, SOL iso | Backward: ease off; TA ecc |
| Ankle inv/ev | outside | Release: inversion toward flat; TA, TP con | Fine edge control; PL, PB vs TA, TP iso | Edge set: eversion; PL, PB con |
| Ankle inv/ev | inside | Release: eversion toward flat; PL, PB con | Fine edge control; TA, TP vs PL iso | Edge set: inversion; TA, TP con |
| Foot arch, toes | outside | Arch held under load, pressure spread; INT, TP, FHL iso | Arch held under load, pressure spread; INT, TP, FHL iso | Arch held under load, pressure spread; INT, TP, FHL iso |
| Foot arch, toes | inside | Arch held, light load; INT iso | Arch held, light load; INT iso | Arch held, light load; INT iso |
| Knee flex/ext | outside | Flexed, held; VAS iso; MH, BF co-con; ecc at edge set | Flexed, held; VAS iso; MH, BF co-con; ecc at edge set | Flexed, held; VAS iso; MH, BF co-con; ecc at edge set |
| Knee flex/ext | inside | Flexed, held; VAS iso; hamstrings co-con | Flexed, held; VAS iso; hamstrings co-con | Flexed, held; VAS iso; hamstrings co-con |
| Knee tibial rot. | outside | Held near neutral against valgus and external rotation; MH, POP, SAR, GRA iso; BF iso | Held near neutral against valgus and external rotation; MH, POP, SAR, GRA iso; BF iso | Held near neutral against valgus and external rotation; MH, POP, SAR, GRA iso; BF iso |
| Knee tibial rot. | inside | Held neutral; POP, MH, BF iso (low) | Held neutral; POP, MH, BF iso (low) | Held neutral; POP, MH, BF iso (low) |
| Hip flex/ext | outside | Flexed, held; GMAX, AM iso | Flexed, held; GMAX, AM iso | Flexed, held; GMAX, AM iso |
| Hip flex/ext | inside | Flexed, slightly more; GMAX iso | Flexed, slightly more; GMAX iso | Flexed, slightly more; GMAX iso |
| Hip abd/add | outside | Abducted under a pelvis held over the downhill ski; GMED, GMIN, TFL iso; ADD co-con | Abducted under a pelvis held over the downhill ski; GMED, GMIN, TFL iso; ADD co-con | Abducted under a pelvis held over the downhill ski; GMED, GMIN, TFL iso; ADD co-con |
| Hip abd/add | inside | Adducted, held; ADD iso | Adducted, held; ADD iso | Adducted, held; ADD iso |
| Hip IR/ER | outside | Small rotation turns tips downhill; DR con | Neutral; DR, GMED iso | Small rotation turns tails downhill; GMED/GMIN ant, TFL con |
| Hip IR/ER | inside | Small rotation turns tips downhill; GMED/GMIN ant, TFL con | Neutral; iso | Small rotation turns tails downhill; DR con |
| Pelvis tilt | both | Anterior tilt held; ES, MF, RA, TrA iso | Anterior tilt held; ES, MF, RA, TrA iso | Anterior tilt held; ES, MF, RA, TrA iso |
| Pelvis hike (list) | both | Uphill half held slightly up; downhill GMED, GMIN iso; uphill QL iso | Uphill half held slightly up; downhill GMED, GMIN iso; uphill QL iso | Uphill half held slightly up; downhill GMED, GMIN iso; uphill QL iso |
| Pelvis rotation | both | Faces downhill, about 70° to 90° to the skis; obliques iso | Faces downhill, about 70° to 90° to the skis; obliques iso | Faces downhill, about 70° to 90° to the skis; obliques iso |
| Lumbar flex/ext | both | Near neutral (not rounded or arched); ES, MF iso; RA iso; ES ecc under peak flexion moment | Near neutral (not rounded or arched); ES, MF iso; RA iso; ES ecc under peak flexion moment | Near neutral (not rounded or arched); ES, MF iso; RA iso; ES ecc under peak flexion moment |
| Lumbar lat. flex | both | Slight bend toward downhill ski; uphill QL iso | Slight bend toward downhill ski; uphill QL iso | Slight bend toward downhill ski; uphill QL iso |
| Lumbar rotation | both | Held near neutral (little range); MF, obliques iso | Held near neutral (little range); MF, obliques iso | Held near neutral (little range); MF, obliques iso |
| Thoracic flex/ext | both | Slight flexion held, not rounded; thoracic ES iso | Slight flexion held, not rounded; thoracic ES iso | Slight flexion held, not rounded; thoracic ES iso |
| Thoracic lat. flex | both | Slight bend toward downhill ski; uphill obliques iso | Slight bend toward downhill ski; uphill obliques iso | Slight bend toward downhill ski; uphill obliques iso |
| Thoracic rotation | both | Held facing downhill with pelvis; obliques iso | Held facing downhill with pelvis; obliques iso | Held facing downhill with pelvis; obliques iso |
| Shoulder girdle | outside | Slightly protracted, level; SA, TRAP iso | Slightly protracted, level; SA, TRAP iso | Slightly protracted, level; SA, TRAP iso |
| Shoulder girdle | inside | Slightly protracted, level; SA, TRAP iso | Slightly protracted, level; SA, TRAP iso | Slightly protracted, level; SA, TRAP iso |
| Shoulder | outside | Arms forward; AD, RC iso | Arms forward; AD, RC iso | Arms forward; AD, RC iso |
| Shoulder | inside | Arms forward; AD, RC iso | Arms forward; AD, RC iso | Arms forward; AD, RC iso |
| Elbow | outside | Flexed about 90°, held; BB, brachialis iso | Flexed about 90°, held; BB, brachialis iso | Flexed about 90°, held; BB, brachialis iso |
| Elbow | inside | Flexed, held; BB iso | Flexed, held; BB iso | Flexed, held; BB iso |
| Wrist, grip | outside | Grip held; FF iso | Grip held; FF iso | Grip held; FF iso |
| Wrist, grip | inside | Grip held; FF iso | Grip held; FF iso | Grip held; FF iso |
| Neck | both | Head level, facing downhill; SCM, SPL iso | Head level, facing downhill; SCM, SPL iso | Head level, facing downhill; SCM, SPL iso |

Coverage: 34 DOF rows, 102 cells, all filled. 4 rows are specific to this drill; the other 30 follow the slip baseline (2.2).

### D8. Pivot slips (linked sideslips)

**Description.** In a corridor only a little wider than the skis are long, the skier sideslips down the
fall line, pivots the skis 90° to run briefly straight, then another 90° to sideslip facing the other
way. The pivot point stays under the middle of the feet. The hips keep facing downhill. Edging comes from
tipping the feet and lower legs (psia-c-linked-sideslips).

**Movement goal.** Pure leg rotation with flat skis under a fixed pelvis; timing of edge release and
pivot.

**Phase mapping.** Initiation = edge release and the first 90°. Shaping = through the fall line. Finish =
the second 90° and the new sideslip.

| Segment | Initiation | Shaping | Finish |
|---|---|---|---|
| Ankles | Flatten (release) | Flat | Re-edge gently into the new slip |
| Hip rotation | Both femurs rotate quickly toward the new direction | Pass through neutral | Continue to about 90° of rotation relative to the pelvis |
| Knees | Flexed; slight unweighting extension at the pivot | Flexed | Flexed |
| Pelvis | Faces downhill, still | Still | Still |
| Trunk | Still; resists the leg torque | Still | Still |

| Muscle (slug) | Side | I / S / F | Contraction | Role | Conf. | Sources |
|---|---|---|---|---|---|---|
| gluteus-medius, gluteus-minimus, tensor-fasciae-latae, adductors | new outside | 2 / 2 / 2 | concentric | Internal rotation of the flexed hip drives the pivot | low | delp-1999 |
| deep-hip-rotators, gluteus-maximus, sartorius | new inside | 2 / 2 / 2 | concentric | External rotation drives the pivot | low | delp-1999 |
| obliques, multifidus | both | 2 / 3 / 2 | isometric | Hold the pelvis and trunk against the rotational torque | medium | hintermeister-1997 |
| quadriceps | both | 1 / 1 / 1 | isometric | Low load; flat skis | medium | hintermeister-1997 |

Errors: rotating the upper body to pivot (counter-rotation torque spins the shoulders, obliques
unloaded); pivoting about the tips or tails (fore-aft off); edges catch (release too late).

**DOF matrix (D8).**

| DOF | Side | Initiation | Shaping | Finish |
|---|---|---|---|---|
| Ankle DF/PF | outside | DF held, centred; TA, EDL, EHL iso; SOL iso | DF held, centred; TA, EDL, EHL iso; SOL iso | DF held, centred; TA, EDL, EHL iso; SOL iso |
| Ankle DF/PF | inside | DF held, centred; TA, EDL, EHL iso; SOL iso | DF held, centred; TA, EDL, EHL iso; SOL iso | DF held, centred; TA, EDL, EHL iso; SOL iso |
| Ankle inv/ev | outside | Flatten to release; TA, TP con | Flat; PL vs TA iso | Re-edge gently; PL, PB con |
| Ankle inv/ev | inside | Flatten to release; PL con | Flat; iso | Re-edge gently; TA, TP con |
| Foot arch, toes | outside | Arch held under load, pressure spread; INT, TP, FHL iso | Arch held under load, pressure spread; INT, TP, FHL iso | Arch held under load, pressure spread; INT, TP, FHL iso |
| Foot arch, toes | inside | Arch held, light load; INT iso | Arch held, light load; INT iso | Arch held, light load; INT iso |
| Knee flex/ext | outside | Flexed; slight unweighting extension at the pivot (VAS con), then VAS iso | Flexed; slight unweighting extension at the pivot (VAS con), then VAS iso | Flexed; slight unweighting extension at the pivot (VAS con), then VAS iso |
| Knee flex/ext | inside | Flexed; slight unweighting extension at the pivot (VAS con), then VAS iso | Flexed; slight unweighting extension at the pivot (VAS con), then VAS iso | Flexed; slight unweighting extension at the pivot (VAS con), then VAS iso |
| Knee tibial rot. | outside | Held near neutral against valgus and external rotation; MH, POP, SAR, GRA iso; BF iso | Held near neutral against valgus and external rotation; MH, POP, SAR, GRA iso; BF iso | Held near neutral against valgus and external rotation; MH, POP, SAR, GRA iso; BF iso |
| Knee tibial rot. | inside | Held neutral; POP, MH, BF iso (low) | Held neutral; POP, MH, BF iso (low) | Held neutral; POP, MH, BF iso (low) |
| Hip flex/ext | outside | Flexed, held; GMAX, AM iso | Flexed, held; GMAX, AM iso | Flexed, held; GMAX, AM iso |
| Hip flex/ext | inside | Flexed, slightly more; GMAX iso | Flexed, slightly more; GMAX iso | Flexed, slightly more; GMAX iso |
| Hip abd/add | outside | Abducted under a pelvis held over the downhill ski; GMED, GMIN, TFL iso; ADD co-con | Abducted under a pelvis held over the downhill ski; GMED, GMIN, TFL iso; ADD co-con | Abducted under a pelvis held over the downhill ski; GMED, GMIN, TFL iso; ADD co-con |
| Hip abd/add | inside | Adducted, held; ADD iso | Adducted, held; ADD iso | Adducted, held; ADD iso |
| Hip IR/ER | outside | Rapid IR toward new direction (new outside); GMED/GMIN ant, TFL, ADD con | Passes through neutral; con | Continues to about 90° relative to pelvis; con then iso |
| Hip IR/ER | inside | Rapid ER (new inside); DR, GMAX, SAR con | Passes through neutral; con | Continues; con then iso |
| Pelvis tilt | both | Anterior tilt held; ES, MF, RA, TrA iso | Anterior tilt held; ES, MF, RA, TrA iso | Anterior tilt held; ES, MF, RA, TrA iso |
| Pelvis hike (list) | both | Uphill half held slightly up; downhill GMED, GMIN iso; uphill QL iso | Uphill half held slightly up; downhill GMED, GMIN iso; uphill QL iso | Uphill half held slightly up; downhill GMED, GMIN iso; uphill QL iso |
| Pelvis rotation | both | Stays facing downhill while skis pivot; O IO + I EO and reverse, iso (high) | Stays facing downhill while skis pivot; O IO + I EO and reverse, iso (high) | Stays facing downhill while skis pivot; O IO + I EO and reverse, iso (high) |
| Lumbar flex/ext | both | Near neutral (not rounded or arched); ES, MF iso; RA iso; ES ecc under peak flexion moment | Near neutral (not rounded or arched); ES, MF iso; RA iso; ES ecc under peak flexion moment | Near neutral (not rounded or arched); ES, MF iso; RA iso; ES ecc under peak flexion moment |
| Lumbar lat. flex | both | Slight bend toward downhill ski; uphill QL iso | Slight bend toward downhill ski; uphill QL iso | Slight bend toward downhill ski; uphill QL iso |
| Lumbar rotation | both | Held near neutral (little range); MF, obliques iso | Held near neutral (little range); MF, obliques iso | Held near neutral (little range); MF, obliques iso |
| Thoracic flex/ext | both | Slight flexion held, not rounded; thoracic ES iso | Slight flexion held, not rounded; thoracic ES iso | Slight flexion held, not rounded; thoracic ES iso |
| Thoracic lat. flex | both | Slight bend toward downhill ski; uphill obliques iso | Slight bend toward downhill ski; uphill obliques iso | Slight bend toward downhill ski; uphill obliques iso |
| Thoracic rotation | both | Still; obliques, MF iso (high) | Still; obliques, MF iso (high) | Still; obliques, MF iso (high) |
| Shoulder girdle | outside | Slightly protracted, level; SA, TRAP iso | Slightly protracted, level; SA, TRAP iso | Slightly protracted, level; SA, TRAP iso |
| Shoulder girdle | inside | Slightly protracted, level; SA, TRAP iso | Slightly protracted, level; SA, TRAP iso | Slightly protracted, level; SA, TRAP iso |
| Shoulder | outside | Arms forward; AD, RC iso | Arms forward; AD, RC iso | Arms forward; AD, RC iso |
| Shoulder | inside | Arms forward; AD, RC iso | Arms forward; AD, RC iso | Arms forward; AD, RC iso |
| Elbow | outside | Flexed about 90°, held; BB, brachialis iso | Flexed about 90°, held; BB, brachialis iso | Flexed about 90°, held; BB, brachialis iso |
| Elbow | inside | Flexed, held; BB iso | Flexed, held; BB iso | Flexed, held; BB iso |
| Wrist, grip | outside | Grip held; FF iso | Grip held; FF iso | Grip held; FF iso |
| Wrist, grip | inside | Grip held; FF iso | Grip held; FF iso | Grip held; FF iso |
| Neck | both | Head level, facing downhill; SCM, SPL iso | Head level, facing downhill; SCM, SPL iso | Head level, facing downhill; SCM, SPL iso |

Coverage: 34 DOF rows, 102 cells, all filled. 8 rows are specific to this drill; the other 26 follow the slip baseline (2.2).

### D9. Hockey stops

**Description.** From a straight glide down the fall line, both skis pivot quickly across the fall line,
then hold a sideslip with growing edge to a full stop. The legs rotate at the same rate, apart from the
upper body. Angulation holds edge and lateral balance as the skis slow (psia-c-hockey-stops).

**Phase mapping.** Initiation = the pivot. Shaping = the braking slip. Finish = the stop.

| Segment | Initiation | Shaping | Finish |
|---|---|---|---|
| Hip rotation | Rapid rotation of both femurs (outside internal, inside external) under a downhill-facing pelvis | Held at about 90° | Held |
| Hip abduction | Outside hip abducts with angulation | Held | Held |
| Knees | Brief unweighting extension, then flexion | Flex under rising braking load (eccentric) | Absorb the stop |
| Ankles | Flatten to pivot | Tip uphill (edge set) | Held |
| Pelvis and trunk | Face downhill; strong counter | Angulated over the downhill ski | Held |

| Muscle (slug) | Side | I / S / F | Contraction | Role | Conf. | Sources |
|---|---|---|---|---|---|---|
| gluteus-medius, gluteus-minimus, tensor-fasciae-latae, adductors | outside | 3 / 2 / 1 | concentric then isometric | Fast internal rotation, then the pelvic hold | low | delp-1999 |
| deep-hip-rotators, gluteus-maximus | inside | 3 / 2 / 1 | concentric then isometric | Fast external rotation | low | delp-1999 |
| quadriceps | outside | 2 / 3 / 3 | eccentric | Absorb the braking load | medium | hintermeister-1997, berg-1995 |
| gluteus-maximus | outside | 2 / 3 / 3 | eccentric | Brake hip flexion under the braking load | medium | hintermeister-1997 |
| hamstrings | both | 2 / 2 / 2 | isometric | Co-contraction; protects the knee | medium | hintermeister-1997 |
| obliques | both | 3 / 2 / 1 | isometric | Hold the trunk against the pivot torque | medium | hintermeister-1997 |
| peroneals | outside | 1 / 2 / 2 | isometric | Hold the edge set | low | — |

Errors: rotating with the shoulders (whole body spins; leg rotators unloaded; ends facing across the
hill); edge set too abrupt (catch, then a slip-catch pattern on the outside knee: bere-2011); back seat
(tails wash out).

**DOF matrix (D9).**

| DOF | Side | Initiation | Shaping | Finish |
|---|---|---|---|---|
| Ankle DF/PF | outside | DF held; TA, EDL, EHL iso; SOL ecc at edge set | DF held; TA, EDL, EHL iso; SOL ecc at edge set | DF held; TA, EDL, EHL iso; SOL ecc at edge set |
| Ankle DF/PF | inside | DF held, centred; TA, EDL, EHL iso; SOL iso | DF held, centred; TA, EDL, EHL iso; SOL iso | DF held, centred; TA, EDL, EHL iso; SOL iso |
| Ankle inv/ev | outside | Flat to pivot; TA vs PL iso | Edge set: eversion; PL, PB con then iso | Held; PL, PB iso |
| Ankle inv/ev | inside | Flat to pivot; iso | Edge set: inversion; TA, TP con then iso | Held; iso |
| Foot arch, toes | outside | Arch held under load, pressure spread; INT, TP, FHL iso | Arch held under load, pressure spread; INT, TP, FHL iso | Arch held under load, pressure spread; INT, TP, FHL iso |
| Foot arch, toes | inside | Arch held, light load; INT iso | Arch held, light load; INT iso | Arch held, light load; INT iso |
| Knee flex/ext | outside | Brief unweighting extension; VAS con | Flexes under braking load; VAS ecc (high); MH, BF iso | Absorbs the stop; VAS ecc |
| Knee flex/ext | inside | Brief extension; VAS con | Flexes; VAS ecc; hamstrings iso | Absorbs; VAS ecc |
| Knee tibial rot. | outside | Held near neutral against valgus and external rotation; MH, POP, SAR, GRA iso; BF iso | Held near neutral against valgus and external rotation; MH, POP, SAR, GRA iso; BF iso | Held near neutral against valgus and external rotation; MH, POP, SAR, GRA iso; BF iso |
| Knee tibial rot. | inside | Held neutral; POP, MH, BF iso (low) | Held neutral; POP, MH, BF iso (low) | Held neutral; POP, MH, BF iso (low) |
| Hip flex/ext | outside | Brief extension; GMAX con | Flexes under braking load; GMAX ecc | Held; GMAX iso |
| Hip flex/ext | inside | Flexed, slightly more; GMAX iso | Flexed, slightly more; GMAX iso | Flexed, slightly more; GMAX iso |
| Hip abd/add | outside | Abducted under a pelvis held over the downhill ski; GMED, GMIN, TFL iso; ADD co-con | Abducted under a pelvis held over the downhill ski; GMED, GMIN, TFL iso; ADD co-con | Abducted under a pelvis held over the downhill ski; GMED, GMIN, TFL iso; ADD co-con |
| Hip abd/add | inside | Adducted, held; ADD iso | Adducted, held; ADD iso | Adducted, held; ADD iso |
| Hip IR/ER | outside | Fast IR, skis pivot across; GMED/GMIN ant, TFL, ADD con (high) | Held about 90°; DR, GMAX iso | Held; iso |
| Hip IR/ER | inside | Fast ER; DR, GMAX, SAR con (high) | Held; DR iso | Held; iso |
| Pelvis tilt | both | Anterior tilt held; ES, MF, RA, TrA iso | Anterior tilt held; ES, MF, RA, TrA iso | Anterior tilt held; ES, MF, RA, TrA iso |
| Pelvis hike (list) | both | Uphill half held slightly up; downhill GMED, GMIN iso; uphill QL iso | Uphill half held slightly up; downhill GMED, GMIN iso; uphill QL iso | Uphill half held slightly up; downhill GMED, GMIN iso; uphill QL iso |
| Pelvis rotation | both | Stays facing downhill as skis pivot; obliques iso (high) | Held; obliques iso | Held; obliques iso |
| Lumbar flex/ext | both | Near neutral (not rounded or arched); ES, MF iso; RA iso; ES ecc under peak flexion moment | Near neutral (not rounded or arched); ES, MF iso; RA iso; ES ecc under peak flexion moment | Near neutral (not rounded or arched); ES, MF iso; RA iso; ES ecc under peak flexion moment |
| Lumbar lat. flex | both | Angulation over the downhill ski grows with the edge set; uphill QL iso/ecc | Angulation over the downhill ski grows with the edge set; uphill QL iso/ecc | Angulation over the downhill ski grows with the edge set; uphill QL iso/ecc |
| Lumbar rotation | both | Held near neutral (little range); MF, obliques iso | Held near neutral (little range); MF, obliques iso | Held near neutral (little range); MF, obliques iso |
| Thoracic flex/ext | both | Slight flexion held, not rounded; thoracic ES iso | Slight flexion held, not rounded; thoracic ES iso | Slight flexion held, not rounded; thoracic ES iso |
| Thoracic lat. flex | both | Slight bend toward downhill ski; uphill obliques iso | Slight bend toward downhill ski; uphill obliques iso | Slight bend toward downhill ski; uphill obliques iso |
| Thoracic rotation | both | Held facing downhill with pelvis; obliques iso | Held facing downhill with pelvis; obliques iso | Held facing downhill with pelvis; obliques iso |
| Shoulder girdle | outside | Slightly protracted, level; SA, TRAP iso | Slightly protracted, level; SA, TRAP iso | Slightly protracted, level; SA, TRAP iso |
| Shoulder girdle | inside | Slightly protracted, level; SA, TRAP iso | Slightly protracted, level; SA, TRAP iso | Slightly protracted, level; SA, TRAP iso |
| Shoulder | outside | Arms forward; AD, RC iso | Arms forward; AD, RC iso | Arms forward; AD, RC iso |
| Shoulder | inside | Arms forward; AD, RC iso | Arms forward; AD, RC iso | Arms forward; AD, RC iso |
| Elbow | outside | Flexed about 90°, held; BB, brachialis iso | Flexed about 90°, held; BB, brachialis iso | Flexed about 90°, held; BB, brachialis iso |
| Elbow | inside | Flexed, held; BB iso | Flexed, held; BB iso | Flexed, held; BB iso |
| Wrist, grip | outside | Grip held; FF iso | Grip held; FF iso | Grip held; FF iso |
| Wrist, grip | inside | Grip held; FF iso | Grip held; FF iso | Grip held; FF iso |
| Neck | both | Head level, facing downhill; SCM, SPL iso | Head level, facing downhill; SCM, SPL iso | Head level, facing downhill; SCM, SPL iso |

Coverage: 34 DOF rows, 102 cells, all filled. 10 rows are specific to this drill; the other 24 follow the slip baseline (2.2).

### D10. Garlands (skidded and carved)

**Description.** Repeated half-turns across the hill without crossing the fall line. Skidded garlands go
from sideslip to forward sideslip and back, or turn out of a traverse toward the fall line and back,
steering the legs in the hip sockets (psia-c-basic-garlands, psia-c-basic-parallel-garlands). Carved
garlands roll from uphill to downhill edges and back with pure arcs, at roughly 45° to the fall line
(psia-c-l3-railroad-track-garlands).

**Movement goal.** Rehearse the finish, transition and initiation on one side, many times.

**Phase mapping.** Finish of one arc → release → initiation of the next, never reaching full shaping. The
same leg stays downhill (outside).

| Segment | Initiation (toward fall line) | Shaping (short) | Finish (uphill arc) |
|---|---|---|---|
| Ankles | Tip to downhill edges | Brief | Tip back to uphill edges |
| Hip rotation (skidded) | Turn the femurs toward the fall line | Brief | Turn back across the hill |
| Knees and hips | Extend slightly through release | Flex | Flex under the uphill-arc load |
| Pelvis | Faces downhill throughout | Same | Same |

| Muscle (slug) | Side | I / S / F | Contraction | Role | Conf. | Sources |
|---|---|---|---|---|---|---|
| hip rotators (as D8) | both | 2 / 1 / 2 | concentric (skidded) | Steering in and out of the fall line | low | delp-1999 |
| quadriceps, gluteus-maximus | downhill | 1 / 2 / 2 | eccentric, concentric | Absorb on the uphill arc; extend into release | medium | hintermeister-1997 |
| peroneals, tibialis-anterior, tibialis-posterior | both | 2 / 1 / 2 | concentric, isometric | Tipping (carved garlands) | low | — |
| gluteus-medius | downhill | 1 / 2 / 2 | isometric | Pelvis over the downhill leg | medium | seifert-2023 |

Errors: crossing the fall line; pivoting instead of tipping in carved garlands; upper body follows the
skis.

**DOF matrix (D10).**

| DOF | Side | Initiation | Shaping | Finish |
|---|---|---|---|---|
| Ankle DF/PF | outside | DF active: feet pulled back, shin to tongue; TA, EDL, EHL, FT con | DF held against turn force and boot flex; TA, EDL, EHL iso; SOL ecc then iso (GAS slack, knee bent) | DF held as pressure moves to heel; TA iso, SOL iso; if TA lets go the ankle opens (backseat) |
| Ankle DF/PF | inside | DF active: foot pulled back; TA, EDL, EHL, FT con | DF held, shin on tongue; TA iso (rises after fall line) | DF held; TA iso |
| Ankle inv/ev | outside | Eversion to big-toe edge; PL, PB con; TP ecc | Eversion torque held; PL, PB iso; TP iso (arch) | Back to neutral at release; PL, PB ecc |
| Ankle inv/ev | inside | Inversion to little-toe edge, leading; TA, TP con | Inversion held; TA, TP iso; PL ecc/iso | Back to neutral; TA, TP ecc |
| Foot arch, toes | outside | Arch held under load, pressure spread; INT, TP, FHL iso | Arch held under load, pressure spread; INT, TP, FHL iso | Arch held under load, pressure spread; INT, TP, FHL iso |
| Foot arch, toes | inside | Arch held, light load; INT iso | Arch held, light load; INT iso | Arch held, light load; INT iso |
| Knee flex/ext | outside | Extends (extension transition) or stays flexed; VAS con or iso; MH, BF co-con | Flexes under load; VAS, RF ecc; MH, BF iso | Deepest flexion, then extends; VAS ecc, iso, then con |
| Knee flex/ext | inside | Flexes (shortens) under its own load; VAS ecc (extension moment like outside); hamstrings, GAS con only when unloaded | More flexed than outside, held; VAS iso, hamstrings iso | Held, then extends as it becomes outside leg; VAS con |
| Knee tibial rot. | outside | Held near neutral against valgus and external rotation; MH, POP, SAR, GRA iso; BF iso | Held near neutral against valgus and external rotation; MH, POP, SAR, GRA iso; BF iso | Held near neutral against valgus and external rotation; MH, POP, SAR, GRA iso; BF iso |
| Knee tibial rot. | inside | Held neutral; POP, MH, BF iso (low) | Held neutral; POP, MH, BF iso (low) | Held neutral; POP, MH, BF iso (low) |
| Hip flex/ext | outside | Extends slightly or holds; GMAX, AM con or iso | Flexes under load; GMAX, AM, MH ecc | Flexed at peak, then extends; GMAX ecc then con |
| Hip flex/ext | inside | Flexes (shortens) under load; GMAX ecc; IP, RF con only when unloaded (RF hip-flexor role) | More flexed, held; IP iso; GMAX iso (extension moment like outside) | Held, then extends |
| Hip abd/add | outside | Knee toward turn: add of flexed femur, ADD, AM con; then abd (pelvis-on-femur) as load arrives, GMED, GMIN, TFL ecc to iso | Abducted, inside half of pelvis held; GMED, GMIN, TFL, upper GMAX iso; ADD, AM co-con iso | Held, back to neutral; GMED ecc |
| Hip abd/add | inside | Knee toward turn: abd of flexed femur; posterior GMED, DR con | Adducted, held; ADD (adductor longus) iso | Held; ADD iso |
| Hip IR/ER | outside | Toward fall line: femurs turn; con (skidded) or held (carved) | Brief | Back across the hill; con |
| Hip IR/ER | inside | Toward fall line; con (skidded) or held (carved) | Brief | Back across; con |
| Pelvis tilt | both | Anterior tilt grows with hip hinge; IP, RF con; ES iso | Anterior tilt held, lumbar neutral; ES, MF iso; RA, TrA iso (anti-extension) | Held; ES, RA iso |
| Pelvis hike (list) | both | Inside half rises toward level as legs tip (pelvis on outside femur); O GMED, GMIN, TFL con | Inside half held up; O GMED, GMIN, TFL iso | Levels for release; O GMED ecc |
| Pelvis rotation | both | Faces downhill throughout; obliques iso | Faces downhill throughout; obliques iso | Faces downhill throughout; obliques iso |
| Lumbar flex/ext | both | Near neutral (not rounded or arched); ES, MF iso; RA iso; ES ecc under peak flexion moment | Near neutral (not rounded or arched); ES, MF iso; RA iso; ES ecc under peak flexion moment | Near neutral (not rounded or arched); ES, MF iso; RA iso; ES ecc under peak flexion moment |
| Lumbar lat. flex | both | Neutral to slight bend toward outside ski; I QL ecc (lengthens, controls the outward tilt) | Slight bend held; I QL, I obliques iso; O QL co-con | Returns to neutral; I QL con |
| Lumbar rotation | both | Held near neutral (little range); MF, obliques iso | Held near neutral (little range); MF, obliques iso | Held near neutral (little range); MF, obliques iso |
| Thoracic flex/ext | both | Slight flexion held, not rounded; thoracic ES iso | Slight flexion held, not rounded; thoracic ES iso | Slight flexion held, not rounded; thoracic ES iso |
| Thoracic lat. flex | both | Neutral to slight bend toward outside ski; I obliques ecc (lengthen) | Some bend held; I obliques iso, O obliques co-con | Returns; I obliques con |
| Thoracic rotation | both | Faces downhill throughout; obliques iso | Faces downhill throughout; obliques iso | Faces downhill throughout; obliques iso |
| Shoulder girdle | outside | Slightly protracted, level; SA, TRAP iso | Slightly protracted, level; SA, TRAP iso | Slightly protracted, level; SA, TRAP iso |
| Shoulder girdle | inside | Slightly protracted, level; SA, TRAP iso | Slightly protracted, level; SA, TRAP iso | Slightly protracted, level; SA, TRAP iso |
| Shoulder | outside | Arm forward, in view; AD, RC iso | Held forward; AD, RC iso | Swings forward to prepare next touch; AD con |
| Shoulder | inside | Pole touch: small flexion then extension; AD con, LD, TMaj con | Arm forward, leads; AD, RC iso | Held; AD iso |
| Elbow | outside | Flexed about 90°, held; BB, brachialis iso | Flexed about 90°, held; BB, brachialis iso | Flexed about 90°, held; BB, brachialis iso |
| Elbow | inside | Flexed about 90°, held; BB iso; TRI con at touch | Flexed about 90°, held; BB iso; TRI con at touch | Flexed about 90°, held; BB iso; TRI con at touch |
| Wrist, grip | outside | Grip held; FF iso | Grip held; FF iso | Grip held; FF iso |
| Wrist, grip | inside | Wrist flick for touch; FF con, wrist extensors ecc | Grip held; FF iso | Grip held; FF iso |
| Neck | both | Head level, eyes ahead down the hill; SCM, SPL iso, counter-rotate against thorax | Head level, eyes ahead down the hill; SCM, SPL iso, counter-rotate against thorax | Head level, eyes ahead down the hill; SCM, SPL iso, counter-rotate against thorax |

Coverage: 34 DOF rows, 102 cells, all filled. 4 rows are specific to this drill; the other 30 follow the turn baseline (2.2).

### D11. Hop turns and leapers

**Description.** Parallel turns where both skis leave the snow at the transition. A strong extension of
knees and hips unweights the skis, edges are changed in the air with little rotation, and flexing on
landing absorbs the load (psia-c-basic-parallel-leaper). In the dynamic version the skis land already on
their new edges and carve at once (psia-c-dynamic-leapers). Classic hop turns on steep terrain add a
strong pole plant and pivot the skis in the air.

**Phase mapping.** Initiation = take-off and flight. Shaping = landing and early arc. Finish = arc and
loading for the next take-off.

| Segment | Initiation | Shaping | Finish |
|---|---|---|---|
| Ankles | Plantarflex to the limit the boot allows; dorsiflex in the air to set the landing | Dorsiflex under the landing load | Load and pre-tension |
| Knees | Rapid extension (take-off) | Rapid flexion (landing absorption) | Flex to load the next jump |
| Hips | Rapid extension | Flexion; abduction/internal rotation of the outside hip as the edge engages | Flexion |
| Pelvis and trunk | Stays quiet; the trunk does not throw the jump | Stable on landing | Stable |
| Arms and poles | Pole plant supports take-off (hop turns) | Arms forward | Next pole swing |

| Muscle (slug) | Side | I / S / F | Contraction | Role | Conf. | Sources |
|---|---|---|---|---|---|---|
| quadriceps | both | 3 / 3 / 2 | concentric (take-off), eccentric (landing) | Jump and absorb | medium | berg-1999 (moguls had faster knee action) |
| gluteus-maximus | both | 3 / 3 / 2 | concentric, eccentric | Hip extension take-off; landing absorption | medium | hintermeister-1997 |
| calf | both | 2 / 2 / 1 | concentric, eccentric | What ankle push the boot allows; landing stiffness | low | — |
| hamstrings | both | 2 / 3 / 2 | isometric | Landing co-contraction; ACL protection | medium | bere-2011, heinrich-2023 |
| iliopsoas, quadriceps (rectus femoris) | both | 2 / 1 / 1 | concentric | Tuck the legs up in the air | low | — |
| latissimus-dorsi, triceps-brachii | pole side | 2 / 0 / 1 | concentric, isometric | Pole plant supports the take-off | low | — |
| obliques, erector-spinae | both | 2 / 2 / 2 | isometric | Trunk stable through take-off and landing | medium | hintermeister-1997 |

Errors: landing back on the tails with straight knees (the back-weighted landing ACL mechanism:
bere-2011); rotating in the air with the shoulders; landing on one ski.

**DOF matrix (D11).**

| DOF | Side | Initiation | Shaping | Finish |
|---|---|---|---|---|
| Ankle DF/PF | outside | Take-off: ankle pushes toward PF as far as boot allows; SOL, GAS con (SSC); air: DF set for landing, TA con | Landing: DF under load; SOL, GAS ecc (SSC), TA iso | Loads for next take-off; SOL ecc |
| Ankle DF/PF | inside | Take-off as outside; SOL, GAS con; air: TA con | Landing; SOL ecc, TA iso | Loads; SOL ecc |
| Ankle inv/ev | outside | Eversion to big-toe edge; PL, PB con; TP ecc | Eversion torque held; PL, PB iso; TP iso (arch) | Back to neutral at release; PL, PB ecc |
| Ankle inv/ev | inside | Inversion to little-toe edge, leading; TA, TP con | Inversion held; TA, TP iso; PL ecc/iso | Back to neutral; TA, TP ecc |
| Foot arch, toes | outside | Arch held under load, pressure spread; INT, TP, FHL iso | Arch held under load, pressure spread; INT, TP, FHL iso | Arch held under load, pressure spread; INT, TP, FHL iso |
| Foot arch, toes | inside | Arch held, light load; INT iso | Arch held, light load; INT iso | Arch held, light load; INT iso |
| Knee flex/ext | outside | Rapid extension (take-off); VAS, RF con (SSC); air: tuck, hamstrings con | Landing absorption; VAS ecc (high, SSC); MH, BF iso | Flex to load the next jump; VAS ecc |
| Knee flex/ext | inside | Rapid extension; VAS con; air: tuck | Landing; VAS ecc; hamstrings iso | Flex to load; VAS ecc |
| Knee tibial rot. | outside | Held near neutral against valgus and external rotation; MH, POP, SAR, GRA iso; BF iso | Held near neutral against valgus and external rotation; MH, POP, SAR, GRA iso; BF iso | Held near neutral against valgus and external rotation; MH, POP, SAR, GRA iso; BF iso |
| Knee tibial rot. | inside | Held neutral; POP, MH, BF iso (low) | Held neutral; POP, MH, BF iso (low) | Held neutral; POP, MH, BF iso (low) |
| Hip flex/ext | outside | Rapid extension; GMAX, AM con (SSC); air: IP, RF con (tuck) | Landing flexion; GMAX ecc | Flexion; GMAX ecc |
| Hip flex/ext | inside | Rapid extension; GMAX con; air: IP, RF con | Landing; GMAX ecc | Flexion; GMAX ecc |
| Hip abd/add | outside | Knee toward turn: add of flexed femur, ADD, AM con; then abd (pelvis-on-femur) as load arrives, GMED, GMIN, TFL ecc to iso | Abducted, inside half of pelvis held; GMED, GMIN, TFL, upper GMAX iso; ADD, AM co-con iso | Held, back to neutral; GMED ecc |
| Hip abd/add | inside | Knee toward turn: abd of flexed femur; posterior GMED, DR con | Adducted, held; ADD (adductor longus) iso | Held; ADD iso |
| Hip IR/ER | outside | IR, femur turns under pelvis; anterior GMED/GMIN, TFL, ADD con | IR held and braked; GMAX, DR, BF ecc/iso | Held, then neutral; DR, GMAX iso |
| Hip IR/ER | inside | ER; DR, GMAX, SAR con | ER held (10-26 deg) against an IR moment; anterior GMED/GMIN, TFL, ADD iso | Held; same iso |
| Pelvis tilt | both | Anterior tilt grows with hip hinge; IP, RF con; ES iso | Anterior tilt held, lumbar neutral; ES, MF iso; RA, TrA iso (anti-extension) | Held; ES, RA iso |
| Pelvis hike (list) | both | Inside half rises toward level as legs tip (pelvis on outside femur); O GMED, GMIN, TFL con | Inside half held up; O GMED, GMIN, TFL iso | Levels for release; O GMED ecc |
| Pelvis rotation | both | Slight counter forms as legs turn under it; O IO + I EO iso; hip rotators | Slight counter held; obliques iso | Held, then squares for release; obliques ecc |
| Lumbar flex/ext | both | Near neutral (not rounded or arched); ES, MF iso; RA iso; ES ecc under peak flexion moment | Near neutral (not rounded or arched); ES, MF iso; RA iso; ES ecc under peak flexion moment | Near neutral (not rounded or arched); ES, MF iso; RA iso; ES ecc under peak flexion moment |
| Lumbar lat. flex | both | Neutral to slight bend toward outside ski; I QL ecc (lengthens, controls the outward tilt) | Slight bend held; I QL, I obliques iso; O QL co-con | Returns to neutral; I QL con |
| Lumbar rotation | both | Held near neutral (little range); MF, obliques iso | Held near neutral (little range); MF, obliques iso | Held near neutral (little range); MF, obliques iso |
| Thoracic flex/ext | both | Slight flexion held, not rounded; thoracic ES iso | Slight flexion held, not rounded; thoracic ES iso | Slight flexion held, not rounded; thoracic ES iso |
| Thoracic lat. flex | both | Neutral to slight bend toward outside ski; I obliques ecc (lengthen) | Some bend held; I obliques iso, O obliques co-con | Returns; I obliques con |
| Thoracic rotation | both | Slight rotation toward outside of turn; O IO + I EO con | Held; O IO + I EO iso | Squares to the skis as they release, then the new counter forms as the legs turn under; I IO + O EO con |
| Shoulder girdle | outside | Slightly protracted, level; SA, TRAP iso | Slightly protracted, level; SA, TRAP iso | Slightly protracted, level; SA, TRAP iso |
| Shoulder girdle | inside | Slightly protracted, level; SA, TRAP iso | Slightly protracted, level; SA, TRAP iso | Slightly protracted, level; SA, TRAP iso |
| Shoulder | outside | Arm forward, in view; AD, RC iso | Held forward; AD, RC iso | Swings forward to prepare next touch; AD con |
| Shoulder | inside | Strong pole plant supports take-off; LD, TMaj, AD con; TRI con | Arm forward; AD iso | Held |
| Elbow | outside | Flexed about 90°, held; BB, brachialis iso | Flexed about 90°, held; BB, brachialis iso | Flexed about 90°, held; BB, brachialis iso |
| Elbow | inside | Extends against the plant; TRI con | Flexed, held; BB iso | Held |
| Wrist, grip | outside | Grip held; FF iso | Grip held; FF iso | Grip held; FF iso |
| Wrist, grip | inside | Wrist flick for touch; FF con, wrist extensors ecc | Grip held; FF iso | Grip held; FF iso |
| Neck | both | Head level, eyes ahead down the hill; SCM, SPL iso, counter-rotate against thorax | Head level, eyes ahead down the hill; SCM, SPL iso, counter-rotate against thorax | Head level, eyes ahead down the hill; SCM, SPL iso, counter-rotate against thorax |

Coverage: 34 DOF rows, 102 cells, all filled. 8 rows are specific to this drill; the other 26 follow the turn baseline (2.2).

### D12. Short-radius turns (basic skidded to performance)

**Description.** Rhythmic linked turns in a corridor about one groomer-track wide. Basic short turns leave
skidded tracks, with both legs turning in the hip sockets and the pole swing setting rhythm
(psia-c-basic-short-turns). Performance short turns are as carved as the terrain allows. The centre of
mass travels about a metre across the hill each turn, and the legs rotate under a stable pelvis
(psia-c-performance-short-turns).

**Measured.** Short-radius parallel turns: vastus medialis, vastus lateralis, biceps femoris, gluteus
maximus and adductors averaged above 50 % MVC and peaked above 150 %. Tibialis anterior, medial hamstrings
and rectus femoris averaged above 50 % (hintermeister-1997). In female recreational skiers, thigh activity
in short turns was higher than in the plough, and the quadriceps-to-hamstrings ratio was lowest, meaning
the most hamstring co-contraction (hermann-2023). SL knee action is the most dynamic of the disciplines,
with a short quasi-isometric share on the outside leg (11 %) (alhammoud-2020).

| Segment | Initiation | Shaping | Finish |
|---|---|---|---|
| Ankles | Tip quickly to new edges | Dorsiflexed; tipped | Released early |
| Knees | Extend or retract through the quick transition | Flex rapidly under load | Flex, then extend (rebound) |
| Hips | Rotate quickly (more in skidded): outside internal, inside external | Held; abduction (outside) | Unwind to neutral |
| Pelvis | Faces down the fall line all the time | Same | Same |
| Trunk | Quiet, facing downhill; strong counter | Angulated | Same |
| Poles | Pole touch at release | Swing forward | Prepare the next touch |

| Muscle (slug) | Side | I / S / F | Contraction | Role | Conf. | Sources |
|---|---|---|---|---|---|---|
| quadriceps | outside | 2 / 3 / 3 | eccentric, concentric (fast) | Rapid absorb and rebound | high | hintermeister-1997, hermann-2023 |
| hamstrings | both | 2 / 3 / 3 | isometric | Co-contraction is highest in short turns | high | hintermeister-1997, hermann-2023 |
| gluteus-maximus | outside | 2 / 3 / 3 | eccentric | Hip extension moment | high | hintermeister-1997 |
| adductors | outside | 2 / 3 / 2 | isometric | Frontal stiffness | high | hintermeister-1997 |
| tibialis-anterior | outside | 3 / 2 / 1 | isometric | Shin forward at each initiation | high | hintermeister-1997 |
| gluteus-medius, gluteus-minimus, tensor-fasciae-latae | outside | 2 / 2 / 1 | concentric (skidded), isometric | Internal rotation steering; pelvic hold | low | delp-1999 |
| deep-hip-rotators | inside | 2 / 1 / 1 | concentric | External rotation steering | low | — |
| obliques | both | 3 / 2 / 2 | isometric | Counter: hold the pelvis and trunk downhill | high | hintermeister-1995, hintermeister-1997 |
| erector-spinae | both | 2 / 2 / 2 | isometric | Trunk hold | high | hintermeister-1995, zeglinski-1998 |
| deltoid | pole arm | 1 / 1 / 1 | concentric | Pole swing | low | — |

Errors: upper body turns with the skis (obliques drop, the shoulders rotate); skid-and-check finishes
(eccentric spikes, more quadriceps, speed lost); back seat (tibialis anterior drops, quadriceps rise).

**DOF matrix (D12).**

| DOF | Side | Initiation | Shaping | Finish |
|---|---|---|---|---|
| Ankle DF/PF | outside | DF active: feet pulled back, shin to tongue; TA, EDL, EHL, FT con | DF held against turn force and boot flex; TA, EDL, EHL iso; SOL ecc then iso (GAS slack, knee bent) | DF held as pressure moves to heel; TA iso, SOL iso; if TA lets go the ankle opens (backseat) |
| Ankle DF/PF | inside | DF active: foot pulled back; TA, EDL, EHL, FT con | DF held, shin on tongue; TA iso (rises after fall line) | DF held; TA iso |
| Ankle inv/ev | outside | Eversion to big-toe edge; PL, PB con; TP ecc | Eversion torque held; PL, PB iso; TP iso (arch) | Back to neutral at release; PL, PB ecc |
| Ankle inv/ev | inside | Inversion to little-toe edge, leading; TA, TP con | Inversion held; TA, TP iso; PL ecc/iso | Back to neutral; TA, TP ecc |
| Foot arch, toes | outside | Arch held under load, pressure spread; INT, TP, FHL iso | Arch held under load, pressure spread; INT, TP, FHL iso | Arch held under load, pressure spread; INT, TP, FHL iso |
| Foot arch, toes | inside | Arch held, light load; INT iso | Arch held, light load; INT iso | Arch held, light load; INT iso |
| Knee flex/ext | outside | Quick extension or retraction through transition; VAS con | Rapid flexion under load; VAS ecc; MH, BF iso (highest co-con) | Flex then rebound; VAS ecc then con |
| Knee flex/ext | inside | Flexes (shortens) under its own load; VAS ecc (extension moment like outside); hamstrings, GAS con only when unloaded | More flexed than outside, held; VAS iso, hamstrings iso | Held, then extends as it becomes outside leg; VAS con |
| Knee tibial rot. | outside | Held near neutral against valgus and external rotation; MH, POP, SAR, GRA iso; BF iso | Held near neutral against valgus and external rotation; MH, POP, SAR, GRA iso; BF iso | Held near neutral against valgus and external rotation; MH, POP, SAR, GRA iso; BF iso |
| Knee tibial rot. | inside | Held neutral; POP, MH, BF iso (low) | Held neutral; POP, MH, BF iso (low) | Held neutral; POP, MH, BF iso (low) |
| Hip flex/ext | outside | Extends slightly or holds; GMAX, AM con or iso | Flexes under load; GMAX, AM, MH ecc | Flexed at peak, then extends; GMAX ecc then con |
| Hip flex/ext | inside | Flexes (shortens) under load; GMAX ecc; IP, RF con only when unloaded (RF hip-flexor role) | More flexed, held; IP iso; GMAX iso (extension moment like outside) | Held, then extends |
| Hip abd/add | outside | Knee toward turn: add of flexed femur, ADD, AM con; then abd (pelvis-on-femur) as load arrives, GMED, GMIN, TFL ecc to iso | Abducted, inside half of pelvis held; GMED, GMIN, TFL, upper GMAX iso; ADD, AM co-con iso | Held, back to neutral; GMED ecc |
| Hip abd/add | inside | Knee toward turn: abd of flexed femur; posterior GMED, DR con | Adducted, held; ADD (adductor longus) iso | Held; ADD iso |
| Hip IR/ER | outside | Quick IR (more in skidded); GMED/GMIN ant, TFL, ADD con | IR held; DR, GMAX ecc/iso | Unwinds to neutral; DR con |
| Hip IR/ER | inside | ER; DR, GMAX, SAR con | ER held (10-26 deg) against an IR moment; anterior GMED/GMIN, TFL, ADD iso | Held; same iso |
| Pelvis tilt | both | Anterior tilt grows with hip hinge; IP, RF con; ES iso | Anterior tilt held, lumbar neutral; ES, MF iso; RA, TrA iso (anti-extension) | Held; ES, RA iso |
| Pelvis hike (list) | both | Inside half rises toward level as legs tip (pelvis on outside femur); O GMED, GMIN, TFL con | Inside half held up; O GMED, GMIN, TFL iso | Levels for release; O GMED ecc |
| Pelvis rotation | both | Faces down the fall line; counter about 20° to 30° unwinding; obliques iso (high) | Counter about 25°; O IO + I EO iso | Counter 30° to 40°; obliques iso |
| Lumbar flex/ext | both | Near neutral (not rounded or arched); ES, MF iso; RA iso; ES ecc under peak flexion moment | Near neutral (not rounded or arched); ES, MF iso; RA iso; ES ecc under peak flexion moment | Near neutral (not rounded or arched); ES, MF iso; RA iso; ES ecc under peak flexion moment |
| Lumbar lat. flex | both | Neutral to slight bend toward outside ski; I QL ecc (lengthens, controls the outward tilt) | Slight bend held; I QL, I obliques iso; O QL co-con | Returns to neutral; I QL con |
| Lumbar rotation | both | Held near neutral (little range); MF, obliques iso | Held near neutral (little range); MF, obliques iso | Held near neutral (little range); MF, obliques iso |
| Thoracic flex/ext | both | Slight flexion held, not rounded; thoracic ES iso | Slight flexion held, not rounded; thoracic ES iso | Slight flexion held, not rounded; thoracic ES iso |
| Thoracic lat. flex | both | Neutral to slight bend toward outside ski; I obliques ecc (lengthen) | Some bend held; I obliques iso, O obliques co-con | Returns; I obliques con |
| Thoracic rotation | both | Faces downhill with the pelvis; obliques iso (high) | Faces downhill with the pelvis; obliques iso (high) | Faces downhill with the pelvis; obliques iso (high) |
| Shoulder girdle | outside | Slightly protracted, level; SA, TRAP iso | Slightly protracted, level; SA, TRAP iso | Slightly protracted, level; SA, TRAP iso |
| Shoulder girdle | inside | Slightly protracted, level; SA, TRAP iso | Slightly protracted, level; SA, TRAP iso | Slightly protracted, level; SA, TRAP iso |
| Shoulder | outside | Held forward; AD, RC iso | Swings forward; AD con | Ready for next touch; AD iso |
| Shoulder | inside | Pole touch at release; AD con, LD, TMaj con | Arm forward; AD iso | Held; AD iso |
| Elbow | outside | Flexed about 90°, held; BB, brachialis iso | Flexed about 90°, held; BB, brachialis iso | Flexed about 90°, held; BB, brachialis iso |
| Elbow | inside | Flexed about 90°, held; BB iso; TRI con at touch | Flexed about 90°, held; BB iso; TRI con at touch | Flexed about 90°, held; BB iso; TRI con at touch |
| Wrist, grip | outside | Grip held; FF iso | Grip held; FF iso | Grip held; FF iso |
| Wrist, grip | inside | Wrist flick for touch; FF con, wrist extensors ecc | Grip held; FF iso | Grip held; FF iso |
| Neck | both | Head level, eyes ahead down the hill; SCM, SPL iso, counter-rotate against thorax | Head level, eyes ahead down the hill; SCM, SPL iso, counter-rotate against thorax | Head level, eyes ahead down the hill; SCM, SPL iso, counter-rotate against thorax |

Coverage: 34 DOF rows, 102 cells, all filled. 6 rows are specific to this drill; the other 28 follow the turn baseline (2.2).

### D13. Long-radius carved turns (medium to long, arc-to-arc)

**Description.** Linked medium or long turns that use the ski's sidecut and bend, with the tails following
the tips. Edge angle is highest in shaping. Both skis show similar high edge angles, and the inside ski
shows tip lead from a "strong inside half". Inclination starts at initiation and grows in shaping
(psia-c-medium-radius-carved).

**Measured.** This is the GS-type turn: hintermeister-1995, hintermeister-1997, berg-1995 and berg-1999
measured it. The EMG-validated model of a carved turn (radius about 10.7 m, about 12 m/s) gave, outside:
vastus lateralis, then gluteus maximus and medial and lateral hamstrings. Inside: vastus lateralis, then
tibialis anterior, adductor longus and vastus medialis. Trunk: erector spinae and internal obliques
(heinrich-2023). Joint moments come from heinrich-2022. Fatigue after 30 GS turns altered initiation-phase
EMG (chollet-2025).

| Segment | Initiation | Shaping | Finish |
|---|---|---|---|
| Outside ankle | Tips to the new edge; dorsiflexes | Eversion torque; plantarflexion moment against the boot | Pressure toward the heel |
| Outside knee | Extends or stays flexed through the switch | Flexed beyond 60°; slight abduction and internal rotation held | Deepest flexion, then release |
| Outside hip | Abducts and rotates internally as the legs tilt | Flexed, abducted, internally rotated; external-rotation moment holds it | Held, then release |
| Inside ankle | Tips to the little-toe edge | Pushes against the shaft after the fall line (heinrich-2023) | Held |
| Inside knee and hip | Flex (shorten) | More flexed than outside; hip adducted; foot leads | Held, then the leg lengthens as it becomes the outside leg |
| Pelvis | Moves forward and inside | Inside half up relative to the legs; slight counter | Returns across |
| Trunk | Moves with the centre of mass | Flexed forward (about 39° in GS), bent sideways (about 15°), slightly twisted (sporri-2015) | Same |

| Muscle (slug) | Side | I / S / F | Contraction | Role | Conf. | Sources |
|---|---|---|---|---|---|---|
| quadriceps | outside | 2 / 3 / 3 | eccentric, isometric | Knee extension moment against peak load | high | hintermeister-1997, berg-1995, heinrich-2023 |
| quadriceps | inside | 2 / 2 / 2 | isometric | Inside vastus lateralis is active because the knee is deeply flexed. Rectus femoris doubles as a hip flexor. | high | heinrich-2023, kroll-2010 |
| gluteus-maximus | outside | 2 / 3 / 3 | eccentric, isometric | Hip extension; abduction in deep flexion; brakes internal rotation | high | hintermeister-1997, heinrich-2023 |
| hamstrings | outside | 2 / 3 / 3 | isometric | Co-contraction; hip extension; brake internal rotation (lateral) | high | hintermeister-1997, heinrich-2023 |
| adductors | outside | 2 / 3 / 2 | isometric | Frontal stiffness | high | hintermeister-1997 |
| adductors | inside | 1 / 2 / 2 | isometric | Inside hip adduction moment (adductor longus) | high | heinrich-2023 |
| gluteus-medius | outside | 2 / 2 / 2 | isometric | Pelvic hold | high | seifert-2023 |
| gluteus-medius | inside | 2 / 2 / 1 | isometric | Active in the inside leg in steering and transition | high | seifert-2023 |
| gluteus-minimus, tensor-fasciae-latae | outside | 1 / 2 / 2 | isometric | Pelvic hold, assisting gluteus medius | low | ganderton-2017 |
| deep-hip-rotators | outside | 1 / 2 / 2 | eccentric, isometric | External-rotation moment (quadratus femoris) | low | heinrich-2023 (model only) |
| tibialis-anterior | outside | 2 / 1 / 1 | isometric | Shin forward | high | hintermeister-1997 |
| tibialis-anterior | inside | 1 / 2 / 2 | isometric | Pushes the shaft after the fall line | high | heinrich-2023 |
| calf | outside | 1 / 2 / 3 | isometric, eccentric | Plantarflexion moment | high | hintermeister-1997, heinrich-2022 |
| erector-spinae | both | 2 / 3 / 3 | isometric | Largest joint moment in the turn | high | heinrich-2022, heinrich-2023, zeglinski-1998 |
| obliques | both | 2 / 2 / 2 | isometric | External obliques higher in GS; internal obliques primary in the model | high | hintermeister-1995, hintermeister-1997, heinrich-2023 |

Errors: banking (inside ski loads, outside abductors and inside shortening idle); park-and-ride (no
flexion/extension, quadriceps isometric throughout, more desaturation: seifert-2023); upper-body rotation
into the turn (tails skid); losing pressure on the outside ski and catching its edge on re-extension
(slip-catch: bere-2011).

**DOF matrix (D13).**

| DOF | Side | Initiation | Shaping | Finish |
|---|---|---|---|---|
| Ankle DF/PF | outside | DF active: feet pulled back, shin to tongue; TA, EDL, EHL, FT con | DF held against turn force and boot flex; TA, EDL, EHL iso; SOL ecc then iso (GAS slack, knee bent) | DF held as pressure moves to heel; TA iso, SOL iso; if TA lets go the ankle opens (backseat) |
| Ankle DF/PF | inside | DF active: foot pulled back; TA, EDL, EHL, FT con | DF held, shin on tongue; TA iso (rises after fall line) | DF held; TA iso |
| Ankle inv/ev | outside | Eversion to big-toe edge; PL, PB con; TP ecc | Eversion torque held; PL, PB iso; TP iso (arch) | Back to neutral at release; PL, PB ecc |
| Ankle inv/ev | inside | Inversion to little-toe edge, leading; TA, TP con | Inversion held; TA, TP iso; PL ecc/iso | Back to neutral; TA, TP ecc |
| Foot arch, toes | outside | Arch held under load, pressure spread; INT, TP, FHL iso | Arch held under load, pressure spread; INT, TP, FHL iso | Arch held under load, pressure spread; INT, TP, FHL iso |
| Foot arch, toes | inside | Arch held, light load; INT iso | Arch held, light load; INT iso | Arch held, light load; INT iso |
| Knee flex/ext | outside | Extends (extension transition) or stays flexed; VAS con or iso; MH, BF co-con | Flexes under load; VAS, RF ecc; MH, BF iso | Deepest flexion, then extends; VAS ecc, iso, then con |
| Knee flex/ext | inside | Flexes (shortens) under its own load; VAS ecc (extension moment like outside); hamstrings, GAS con only when unloaded | More flexed than outside, held; VAS iso, hamstrings iso | Held, then extends as it becomes outside leg; VAS con |
| Knee tibial rot. | outside | Held near neutral against valgus and external rotation; MH, POP, SAR, GRA iso; BF iso | Held near neutral against valgus and external rotation; MH, POP, SAR, GRA iso; BF iso | Held near neutral against valgus and external rotation; MH, POP, SAR, GRA iso; BF iso |
| Knee tibial rot. | inside | Held neutral; POP, MH, BF iso (low) | Held neutral; POP, MH, BF iso (low) | Held neutral; POP, MH, BF iso (low) |
| Hip flex/ext | outside | Extends slightly or holds; GMAX, AM con or iso | Flexes under load; GMAX, AM, MH ecc | Flexed at peak, then extends; GMAX ecc then con |
| Hip flex/ext | inside | Flexes (shortens) under load; GMAX ecc; IP, RF con only when unloaded (RF hip-flexor role) | More flexed, held; IP iso; GMAX iso (extension moment like outside) | Held, then extends |
| Hip abd/add | outside | Knee toward turn: add of flexed femur, ADD, AM con; then abd (pelvis-on-femur) as load arrives, GMED, GMIN, TFL ecc to iso | Abducted, inside half of pelvis held; GMED, GMIN, TFL, upper GMAX iso; ADD, AM co-con iso | Held, back to neutral; GMED ecc |
| Hip abd/add | inside | Knee toward turn: abd of flexed femur; posterior GMED, DR con | Adducted, held; ADD (adductor longus) iso | Held; ADD iso |
| Hip IR/ER | outside | IR, femur turns under pelvis; anterior GMED/GMIN, TFL, ADD con | IR held and braked; GMAX, DR, BF ecc/iso | Held, then neutral; DR, GMAX iso |
| Hip IR/ER | inside | ER; DR, GMAX, SAR con | ER held (10-26 deg) against an IR moment; anterior GMED/GMIN, TFL, ADD iso | Held; same iso |
| Pelvis tilt | both | Anterior tilt grows with hip hinge; IP, RF con; ES iso | Anterior tilt held, lumbar neutral; ES, MF iso; RA, TrA iso (anti-extension) | Held; ES, RA iso |
| Pelvis hike (list) | both | Inside half rises toward level as legs tip (pelvis on outside femur); O GMED, GMIN, TFL con | Inside half held up; O GMED, GMIN, TFL iso | Levels for release; O GMED ecc |
| Pelvis rotation | both | Slight counter forms as legs turn under it; O IO + I EO iso; hip rotators | Slight counter held; obliques iso | Held, then squares for release; obliques ecc |
| Lumbar flex/ext | both | Near neutral (not rounded or arched); ES, MF iso; RA iso; ES ecc under peak flexion moment | Near neutral (not rounded or arched); ES, MF iso; RA iso; ES ecc under peak flexion moment | Near neutral (not rounded or arched); ES, MF iso; RA iso; ES ecc under peak flexion moment |
| Lumbar lat. flex | both | Neutral to slight bend toward outside ski; I QL ecc (lengthens, controls the outward tilt) | Slight bend held; I QL, I obliques iso; O QL co-con | Returns to neutral; I QL con |
| Lumbar rotation | both | Held near neutral (little range); MF, obliques iso | Held near neutral (little range); MF, obliques iso | Held near neutral (little range); MF, obliques iso |
| Thoracic flex/ext | both | Slight flexion held, not rounded; thoracic ES iso | Slight flexion held, not rounded; thoracic ES iso | Slight flexion held, not rounded; thoracic ES iso |
| Thoracic lat. flex | both | Neutral to slight bend toward outside ski; I obliques ecc (lengthen) | Some bend held; I obliques iso, O obliques co-con | Returns; I obliques con |
| Thoracic rotation | both | Slight rotation toward outside of turn; O IO + I EO con | Held; O IO + I EO iso | Squares to the skis as they release, then the new counter forms as the legs turn under; I IO + O EO con |
| Shoulder girdle | outside | Slightly protracted, level; SA, TRAP iso | Slightly protracted, level; SA, TRAP iso | Slightly protracted, level; SA, TRAP iso |
| Shoulder girdle | inside | Slightly protracted, level; SA, TRAP iso | Slightly protracted, level; SA, TRAP iso | Slightly protracted, level; SA, TRAP iso |
| Shoulder | outside | Arm forward, in view; AD, RC iso | Held forward; AD, RC iso | Swings forward to prepare next touch; AD con |
| Shoulder | inside | Pole touch: small flexion then extension; AD con, LD, TMaj con | Arm forward, leads; AD, RC iso | Held; AD iso |
| Elbow | outside | Flexed about 90°, held; BB, brachialis iso | Flexed about 90°, held; BB, brachialis iso | Flexed about 90°, held; BB, brachialis iso |
| Elbow | inside | Flexed about 90°, held; BB iso; TRI con at touch | Flexed about 90°, held; BB iso; TRI con at touch | Flexed about 90°, held; BB iso; TRI con at touch |
| Wrist, grip | outside | Grip held; FF iso | Grip held; FF iso | Grip held; FF iso |
| Wrist, grip | inside | Wrist flick for touch; FF con, wrist extensors ecc | Grip held; FF iso | Grip held; FF iso |
| Neck | both | Head level, eyes ahead down the hill; SCM, SPL iso, counter-rotate against thorax | Head level, eyes ahead down the hill; SCM, SPL iso, counter-rotate against thorax | Head level, eyes ahead down the hill; SCM, SPL iso, counter-rotate against thorax |

Coverage: 34 DOF rows, 102 cells, all filled. 0 rows are specific to this drill; the other 34 follow the turn baseline (2.2).

### D14. Wedge turns and crab-wedge turns

**Description.** Ski tips together, tails apart. Turns come from loading and edging the outside ski of the
wedge. In the crab-wedge variant only the outside ski's edge angle increases, so it carves while the
inside ski brushes (psia-c-crab-wedge). Upper body aligned toward the outside ski.

**Measured.** In wedge turns most thigh and trunk muscles were less active than in parallel or GS turns.
Gluteus maximus was the exception: more active in the wedge than in parallel turns. Vastus medialis and
lateralis, biceps femoris, gluteus maximus and adductors still averaged above 50 % MVC
(hintermeister-1997). In older female recreational skiers the plough had the lowest thigh activity and the
highest quadriceps-to-hamstrings ratio, meaning the least hamstring co-contraction (hermann-2023). A wide,
held wedge with both femurs internally rotated is also the dynamic-snowplow ACL pattern if one ski's edge
catches (bere-2011).

| Segment | Initiation | Shaping | Finish |
|---|---|---|---|
| Hips | Both held in abduction and internal rotation (the wedge); outside hip loads | Outside hip flexed, abducted and internally rotated under load | Held; weight returns to both skis |
| Knees | Flexed, slightly in toward each other | Outside knee loaded in slight valgus (the wedge geometry) | Held |
| Ankles | Both everted (both on inside edges) | Outside ski edged more (crab: only the outside) | Held |
| Pelvis and trunk | Stays centred; shifts toward the new outside ski | Over the outside ski | Recentres |

| Muscle (slug) | Side | I / S / F | Contraction | Role | Conf. | Sources |
|---|---|---|---|---|---|---|
| gluteus-maximus | outside | 2 / 3 / 2 | isometric, eccentric | Higher than in parallel turns; holds the abducted, rotated hip | high | hintermeister-1997 |
| quadriceps | both | 2 / 2 / 2 | isometric | Lower than parallel or GS | high | hintermeister-1997, hermann-2023 |
| hamstrings | both | 1 / 1 / 1 | isometric | Lowest co-contraction of the tasks measured | high | hermann-2023 |
| adductors | both | 2 / 2 / 2 | eccentric, isometric | Control the abducted legs; keep the wedge size | high | hintermeister-1997 |
| gluteus-medius, tensor-fasciae-latae | both | 1 / 2 / 1 | isometric | Hold the wedge (abduction and internal rotation) | low | — |
| peroneals | outside | 1 / 2 / 1 | isometric | Eversion edges the outside ski (crab) | low | — |

Errors: sitting back in a wide wedge (quadriceps and knee valgus load rise); steering with the upper body;
wedge size changing (adductors not controlling).

**DOF matrix (D14).**

| DOF | Side | Initiation | Shaping | Finish |
|---|---|---|---|---|
| Ankle DF/PF | outside | DF active: feet pulled back, shin to tongue; TA, EDL, EHL, FT con | DF held against turn force and boot flex; TA, EDL, EHL iso; SOL ecc then iso (GAS slack, knee bent) | DF held as pressure moves to heel; TA iso, SOL iso; if TA lets go the ankle opens (backseat) |
| Ankle DF/PF | inside | DF active: foot pulled back; TA, EDL, EHL, FT con | DF held, shin on tongue; TA iso (rises after fall line) | DF held; TA iso |
| Ankle inv/ev | outside | Everted (inside edge) throughout, more in shaping; PL, PB iso | Everted (inside edge) throughout, more in shaping; PL, PB iso | Everted (inside edge) throughout, more in shaping; PL, PB iso |
| Ankle inv/ev | inside | Everted (inside edge of wedge) throughout; PL, PB iso; no edge change | Everted (inside edge of wedge) throughout; PL, PB iso; no edge change | Everted (inside edge of wedge) throughout; PL, PB iso; no edge change |
| Foot arch, toes | outside | Arch held under load, pressure spread; INT, TP, FHL iso | Arch held under load, pressure spread; INT, TP, FHL iso | Arch held under load, pressure spread; INT, TP, FHL iso |
| Foot arch, toes | inside | Arch held, light load; INT iso | Arch held, light load; INT iso | Arch held, light load; INT iso |
| Knee flex/ext | outside | Extends (extension transition) or stays flexed; VAS con or iso; MH, BF co-con | Flexes under load; VAS, RF ecc; MH, BF iso | Deepest flexion, then extends; VAS ecc, iso, then con |
| Knee flex/ext | inside | Flexed, held, loaded less in shaping; VAS iso | Flexed, held, loaded less in shaping; VAS iso | Flexed, held, loaded less in shaping; VAS iso |
| Knee tibial rot. | outside | Held against valgus of wedge geometry; MH, POP, SAR, GRA iso | Held against valgus of wedge geometry; MH, POP, SAR, GRA iso | Held against valgus of wedge geometry; MH, POP, SAR, GRA iso |
| Knee tibial rot. | inside | Held against valgus; MH, POP iso | Held against valgus; MH, POP iso | Held against valgus; MH, POP iso |
| Hip flex/ext | outside | Extends slightly or holds; GMAX, AM con or iso | Flexes under load; GMAX, AM, MH ecc | Flexed at peak, then extends; GMAX ecc then con |
| Hip flex/ext | inside | Flexed, held; GMAX iso | Flexed, held; GMAX iso | Flexed, held; GMAX iso |
| Hip abd/add | outside | Abducted (wedge); ADD ecc/iso hold the wedge size; GMED iso | Abducted (wedge); ADD ecc/iso hold the wedge size; GMED iso | Abducted (wedge); ADD ecc/iso hold the wedge size; GMED iso |
| Hip abd/add | inside | Abducted (wedge); ADD ecc/iso; GMED iso | Abducted (wedge); ADD ecc/iso; GMED iso | Abducted (wedge); ADD ecc/iso; GMED iso |
| Hip IR/ER | outside | IR (tips together); GMED/GMIN ant, TFL iso; GMAX iso | IR (tips together); GMED/GMIN ant, TFL iso; GMAX iso | IR (tips together); GMED/GMIN ant, TFL iso; GMAX iso |
| Hip IR/ER | inside | IR (tips together); GMED/GMIN ant, TFL iso | IR (tips together); GMED/GMIN ant, TFL iso | IR (tips together); GMED/GMIN ant, TFL iso |
| Pelvis tilt | both | Anterior tilt grows with hip hinge; IP, RF con; ES iso | Anterior tilt held, lumbar neutral; ES, MF iso; RA, TrA iso (anti-extension) | Held; ES, RA iso |
| Pelvis hike (list) | both | Near level; shifts toward outside ski; O GMED iso | Near level; shifts toward outside ski; O GMED iso | Near level; shifts toward outside ski; O GMED iso |
| Pelvis rotation | both | Square to slightly countered; obliques iso (low) | Square to slightly countered; obliques iso (low) | Square to slightly countered; obliques iso (low) |
| Lumbar flex/ext | both | Near neutral (not rounded or arched); ES, MF iso; RA iso; ES ecc under peak flexion moment | Near neutral (not rounded or arched); ES, MF iso; RA iso; ES ecc under peak flexion moment | Near neutral (not rounded or arched); ES, MF iso; RA iso; ES ecc under peak flexion moment |
| Lumbar lat. flex | both | Neutral to slight bend toward outside ski; I QL ecc (lengthens, controls the outward tilt) | Slight bend held; I QL, I obliques iso; O QL co-con | Returns to neutral; I QL con |
| Lumbar rotation | both | Held near neutral (little range); MF, obliques iso | Held near neutral (little range); MF, obliques iso | Held near neutral (little range); MF, obliques iso |
| Thoracic flex/ext | both | Slight flexion held, not rounded; thoracic ES iso | Slight flexion held, not rounded; thoracic ES iso | Slight flexion held, not rounded; thoracic ES iso |
| Thoracic lat. flex | both | Neutral to slight bend toward outside ski; I obliques ecc (lengthen) | Some bend held; I obliques iso, O obliques co-con | Returns; I obliques con |
| Thoracic rotation | both | Square; obliques iso (low) | Square; obliques iso (low) | Square; obliques iso (low) |
| Shoulder girdle | outside | Slightly protracted, level; SA, TRAP iso | Slightly protracted, level; SA, TRAP iso | Slightly protracted, level; SA, TRAP iso |
| Shoulder girdle | inside | Slightly protracted, level; SA, TRAP iso | Slightly protracted, level; SA, TRAP iso | Slightly protracted, level; SA, TRAP iso |
| Shoulder | outside | Arm forward, in view; AD, RC iso | Held forward; AD, RC iso | Swings forward to prepare next touch; AD con |
| Shoulder | inside | Arms forward, no pole touch; AD, RC iso | Arms forward, no pole touch; AD, RC iso | Arms forward, no pole touch; AD, RC iso |
| Elbow | outside | Flexed about 90°, held; BB, brachialis iso | Flexed about 90°, held; BB, brachialis iso | Flexed about 90°, held; BB, brachialis iso |
| Elbow | inside | Flexed, held; BB iso | Flexed, held; BB iso | Flexed, held; BB iso |
| Wrist, grip | outside | Grip held; FF iso | Grip held; FF iso | Grip held; FF iso |
| Wrist, grip | inside | Grip held; FF iso | Grip held; FF iso | Grip held; FF iso |
| Neck | both | Head level, eyes ahead down the hill; SCM, SPL iso, counter-rotate against thorax | Head level, eyes ahead down the hill; SCM, SPL iso, counter-rotate against thorax | Head level, eyes ahead down the hill; SCM, SPL iso, counter-rotate against thorax |

Coverage: 34 DOF rows, 102 cells, all filled. 16 rows are specific to this drill; the other 18 follow the turn baseline (2.2).

### D15. Skating down the hill

**Description.** Forward momentum made by stepping from ski to ski. The skis diverge at the tips. Each ski
glides first on its outside edge, then tips to its inside edge as a platform to push from. The lifted
foot returns beside the stance foot, diverging (psia-c-skating-down-the-hill).

**Measured analogue.** Uphill V-steps (a different task) produced thigh activity similar to short and
medium turns and higher than the plough (hermann-2023).

**Phase mapping.** Initiation = glide on the new ski (outside edge to flat). Shaping = tip to the inside
edge and load. Finish = push-off extension.

| Segment | Initiation | Shaping | Finish |
|---|---|---|---|
| Stance hip | Abducted, externally rotated (diverging ski) | Flexes and loads | Extends and abducts (push) |
| Stance knee | Flexed | Flexes further | Extends (push) |
| Stance ankle | Little-toe edge → flat | Tip to the big-toe edge (eversion) | Held |
| Free leg | Recovers forward, hip flexion, foot alongside | Held | Placed diverging onto the new ski |
| Trunk | Moves forward over the new ski | Same | Same |
| Poles (optional) | Double or alternate push | — | — |

| Muscle (slug) | Side | I / S / F | Contraction | Role | Conf. | Sources |
|---|---|---|---|---|---|---|
| quadriceps, gluteus-maximus | stance (outside) | 2 / 2 / 3 | eccentric then concentric | Load then push | medium | hermann-2023 |
| gluteus-medius, gluteus-minimus | stance | 2 / 2 / 3 | concentric (push abduction), isometric | Lateral push; pelvic hold on one leg | medium | distefano-2009 |
| adductors | stance | 1 / 2 / 2 | eccentric | Control the lateral push | low | — |
| iliopsoas, quadriceps (rectus femoris) | free (inside) | 2 / 1 / 1 | concentric | Recover the free leg | low | andersson-1997 |
| triceps-brachii, latissimus-dorsi | both | 1 / 1 / 2 | concentric | Pole push (if used) | low | — |

Errors: pushing off the heel or flat ski (no grip, quadriceps-only push); upper body swinging side to side;
not committing to the gliding ski.

**DOF matrix (D15).**

| DOF | Side | Initiation | Shaping | Finish |
|---|---|---|---|---|
| Ankle DF/PF | outside | Stance: DF held and loaded, then push; TA iso, SOL ecc then con | Stance: DF held and loaded, then push; TA iso, SOL ecc then con | Stance: DF held and loaded, then push; TA iso, SOL ecc then con |
| Ankle DF/PF | inside | Free foot: DF as it recovers forward; TA, EDL, EHL con | Free foot: DF as it recovers forward; TA, EDL, EHL con | Free foot: DF as it recovers forward; TA, EDL, EHL con |
| Ankle inv/ev | outside | Glide: little-toe edge to flat; TA, TP ecc | Tip to big-toe edge; PL, PB con | Held for push; PL, PB iso |
| Ankle inv/ev | inside | Free foot: neutral; low | Free foot: neutral; low | Free foot: neutral; low |
| Foot arch, toes | outside | Arch held under load, pressure spread; INT, TP, FHL iso | Arch held under load, pressure spread; INT, TP, FHL iso | Arch held under load, pressure spread; INT, TP, FHL iso |
| Foot arch, toes | inside | Arch held, light load; INT iso | Arch held, light load; INT iso | Arch held, light load; INT iso |
| Knee flex/ext | outside | Flexed on new ski; VAS ecc | Flexes further, loads; VAS ecc | Push-off extension; VAS con |
| Knee flex/ext | inside | Free leg: flexes to recover; hamstrings con | Free leg: flexes to recover; hamstrings con | Free leg: flexes to recover; hamstrings con |
| Knee tibial rot. | outside | Held near neutral against valgus and external rotation; MH, POP, SAR, GRA iso; BF iso | Held near neutral against valgus and external rotation; MH, POP, SAR, GRA iso; BF iso | Held near neutral against valgus and external rotation; MH, POP, SAR, GRA iso; BF iso |
| Knee tibial rot. | inside | Held neutral; POP, MH, BF iso (low) | Held neutral; POP, MH, BF iso (low) | Held neutral; POP, MH, BF iso (low) |
| Hip flex/ext | outside | Load then push-off extension; GMAX ecc then con | Load then push-off extension; GMAX ecc then con | Load then push-off extension; GMAX ecc then con |
| Hip flex/ext | inside | Free leg recovers forward; IP, RF con | Free leg recovers forward; IP, RF con | Free leg recovers forward; IP, RF con |
| Hip abd/add | outside | Abducted (diverging ski); GMED iso | Loads; GMED, GMIN iso; ADD ecc | Push: abduction; GMED, GMIN con |
| Hip abd/add | inside | Free leg returns beside stance foot; ADD con | Free leg returns beside stance foot; ADD con | Free leg returns beside stance foot; ADD con |
| Hip IR/ER | outside | ER (diverging ski); DR iso | ER (diverging ski); DR iso | ER (diverging ski); DR iso |
| Hip IR/ER | inside | Free leg ER to diverge on landing; DR con | Free leg ER to diverge on landing; DR con | Free leg ER to diverge on landing; DR con |
| Pelvis tilt | both | Anterior tilt grows with hip hinge; IP, RF con; ES iso | Anterior tilt held, lumbar neutral; ES, MF iso; RA, TrA iso (anti-extension) | Held; ES, RA iso |
| Pelvis hike (list) | both | Inside half rises toward level as legs tip (pelvis on outside femur); O GMED, GMIN, TFL con | Inside half held up; O GMED, GMIN, TFL iso | Levels for release; O GMED ecc |
| Pelvis rotation | both | Slight counter forms as legs turn under it; O IO + I EO iso; hip rotators | Slight counter held; obliques iso | Held, then squares for release; obliques ecc |
| Lumbar flex/ext | both | Near neutral (not rounded or arched); ES, MF iso; RA iso; ES ecc under peak flexion moment | Near neutral (not rounded or arched); ES, MF iso; RA iso; ES ecc under peak flexion moment | Near neutral (not rounded or arched); ES, MF iso; RA iso; ES ecc under peak flexion moment |
| Lumbar lat. flex | both | Neutral to slight bend toward outside ski; I QL ecc (lengthens, controls the outward tilt) | Slight bend held; I QL, I obliques iso; O QL co-con | Returns to neutral; I QL con |
| Lumbar rotation | both | Held near neutral (little range); MF, obliques iso | Held near neutral (little range); MF, obliques iso | Held near neutral (little range); MF, obliques iso |
| Thoracic flex/ext | both | Slight flexion held, not rounded; thoracic ES iso | Slight flexion held, not rounded; thoracic ES iso | Slight flexion held, not rounded; thoracic ES iso |
| Thoracic lat. flex | both | Neutral to slight bend toward outside ski; I obliques ecc (lengthen) | Some bend held; I obliques iso, O obliques co-con | Returns; I obliques con |
| Thoracic rotation | both | Slight rotation toward outside of turn; O IO + I EO con | Held; O IO + I EO iso | Squares to the skis as they release, then the new counter forms as the legs turn under; I IO + O EO con |
| Shoulder girdle | outside | Slightly protracted, level; SA, TRAP iso | Slightly protracted, level; SA, TRAP iso | Slightly protracted, level; SA, TRAP iso |
| Shoulder girdle | inside | Slightly protracted, level; SA, TRAP iso | Slightly protracted, level; SA, TRAP iso | Slightly protracted, level; SA, TRAP iso |
| Shoulder | outside | Pole push (optional); LD, TMaj con; TRI con | Pole push (optional); LD, TMaj con; TRI con | Pole push (optional); LD, TMaj con; TRI con |
| Shoulder | inside | Pole push (optional); LD, TMaj con; TRI con | Pole push (optional); LD, TMaj con; TRI con | Pole push (optional); LD, TMaj con; TRI con |
| Elbow | outside | Extends in pole push; TRI con | Extends in pole push; TRI con | Extends in pole push; TRI con |
| Elbow | inside | Extends in pole push; TRI con | Extends in pole push; TRI con | Extends in pole push; TRI con |
| Wrist, grip | outside | Grip held; FF iso | Grip held; FF iso | Grip held; FF iso |
| Wrist, grip | inside | Wrist flick for touch; FF con, wrist extensors ecc | Grip held; FF iso | Grip held; FF iso |
| Neck | both | Head level, eyes ahead down the hill; SCM, SPL iso, counter-rotate against thorax | Head level, eyes ahead down the hill; SCM, SPL iso, counter-rotate against thorax | Head level, eyes ahead down the hill; SCM, SPL iso, counter-rotate against thorax |

Coverage: 34 DOF rows, 102 cells, all filled. 16 rows are specific to this drill; the other 18 follow the turn baseline (2.2).

### D16. Uphill-ski (inside-ski) activities

**Description.** Balance on the uphill ski with the downhill ski lifted by flexing that leg: a traverse on
the edged uphill ski with no skid; a forward sideslip on it; and a skidded arc on it. Upper-body
angulation shifts weight over the uphill foot. The legs turn in the hip sockets apart from the upper body
(psia-c-advanced-one-ski). In a turn, this means balancing on the inside ski on its little-toe edge.

**Measured analogue.** The single-leg racer's outside-edge turns: large biceps femoris activity in the
first half of the turn, linked to forward trunk pitch (ishige-2021).

| Segment | Initiation | Shaping | Finish |
|---|---|---|---|
| Stance (uphill/inside) ankle | Inverts to the little-toe edge | Held | Held |
| Stance hip | Flexed, adducted, externally rotated | Held under the full load | Held |
| Lifted (downhill/outside) leg | Hip and knee flex to lift | Held parallel | Set down |
| Pelvis | The downhill half is unsupported, held up by the uphill hip's abductors | Held | Held |
| Trunk | Angulates over the uphill foot | Held | Held |

| Muscle (slug) | Side | I / S / F | Contraction | Role | Conf. | Sources |
|---|---|---|---|---|---|---|
| hamstrings | stance (inside) | 3 / 3 / 2 | isometric | Fore-aft and trunk-pitch control on the harder edge | medium | ishige-2021 |
| quadriceps | stance | 2 / 3 / 2 | eccentric, isometric | Single-leg load | medium | ishige-2021 |
| gluteus-medius, gluteus-minimus | stance | 3 / 3 / 3 | isometric | Hold the unsupported downhill half of the pelvis | medium | ganderton-2017 |
| adductors | stance | 2 / 2 / 2 | isometric | The hip sits adducted under load; frontal control | low | heinrich-2023 |
| tibialis-anterior, tibialis-posterior | stance | 2 / 2 / 2 | isometric | Inversion holds the little-toe edge | low | — |
| iliopsoas, hamstrings | lifted (outside) | 2 / 2 / 1 | concentric, isometric | Hold the downhill ski up | low | — |
| quadratus-lumborum, obliques | downhill side | 2 / 2 / 2 | eccentric, isometric | Control the bend over the uphill foot from the lengthening downhill side; the downhill pelvis is held up by the stance abductors | low | — |

Errors: banking downhill (falls onto the lifted ski); hip dumped (pelvis drops on the unsupported side);
back seat.

**DOF matrix (D16).**

| DOF | Side | Initiation | Shaping | Finish |
|---|---|---|---|---|
| Ankle DF/PF | outside | Lifted (downhill/outside): shin forward; TA iso | Lifted (downhill/outside): shin forward; TA iso | Lifted (downhill/outside): shin forward; TA iso |
| Ankle DF/PF | inside | Stance: DF held, centred; TA, EDL, EHL iso; SOL iso | Stance: DF held, centred; TA, EDL, EHL iso; SOL iso | Stance: DF held, centred; TA, EDL, EHL iso; SOL iso |
| Ankle inv/ev | outside | Lifted: tilt matched; TA, TP vs PL iso (low) | Lifted: tilt matched; TA, TP vs PL iso (low) | Lifted: tilt matched; TA, TP vs PL iso (low) |
| Ankle inv/ev | inside | Stance (uphill/inside): inversion holds the little-toe edge; TA, TP iso (high) | Stance (uphill/inside): inversion holds the little-toe edge; TA, TP iso (high) | Stance (uphill/inside): inversion holds the little-toe edge; TA, TP iso (high) |
| Foot arch, toes | outside | Lifted; INT low | Lifted; INT low | Lifted; INT low |
| Foot arch, toes | inside | Stance: arch held under full load; INT, TP iso | Stance: arch held under full load; INT, TP iso | Stance: arch held under full load; INT, TP iso |
| Knee flex/ext | outside | Lifted: flexed to hold ski up; hamstrings, GAS iso | Lifted: flexed to hold ski up; hamstrings, GAS iso | Lifted: flexed to hold ski up; hamstrings, GAS iso |
| Knee flex/ext | inside | Stance: flexed under full load; VAS ecc/iso; BF iso (high) | Stance: flexed under full load; VAS ecc/iso; BF iso (high) | Stance: flexed under full load; VAS ecc/iso; BF iso (high) |
| Knee tibial rot. | outside | Lifted: neutral; POP iso (low) | Lifted: neutral; POP iso (low) | Lifted: neutral; POP iso (low) |
| Knee tibial rot. | inside | Held neutral; POP, MH, BF iso (low) | Held neutral; POP, MH, BF iso (low) | Held neutral; POP, MH, BF iso (low) |
| Hip flex/ext | outside | Lifted: flexed; IP, RF iso | Lifted: flexed; IP, RF iso | Lifted: flexed; IP, RF iso |
| Hip flex/ext | inside | Stance: flexed; GMAX, hamstrings iso | Stance: flexed; GMAX, hamstrings iso | Stance: flexed; GMAX, hamstrings iso |
| Hip abd/add | outside | Lifted: held; ADD, GMED iso (low) | Lifted: held; ADD, GMED iso (low) | Lifted: held; ADD, GMED iso (low) |
| Hip abd/add | inside | Stance: adducted under load, downhill half of pelvis held up by this hip's abductors; GMED, GMIN iso (high); ADD iso | Stance: adducted under load, downhill half of pelvis held up by this hip's abductors; GMED, GMIN iso (high); ADD iso | Stance: adducted under load, downhill half of pelvis held up by this hip's abductors; GMED, GMIN iso (high); ADD iso |
| Hip IR/ER | outside | Lifted: held parallel; DR iso (low) | Lifted: held parallel; DR iso (low) | Lifted: held parallel; DR iso (low) |
| Hip IR/ER | inside | Stance: ER held; DR iso | Stance: ER held; DR iso | Stance: ER held; DR iso |
| Pelvis tilt | both | Anterior tilt grows with hip hinge; IP, RF con; ES iso | Anterior tilt held, lumbar neutral; ES, MF iso; RA, TrA iso (anti-extension) | Held; ES, RA iso |
| Pelvis hike (list) | both | Downhill half unsupported, held up; uphill GMED, GMIN iso; downhill QL iso | Downhill half unsupported, held up; uphill GMED, GMIN iso; downhill QL iso | Downhill half unsupported, held up; uphill GMED, GMIN iso; downhill QL iso |
| Pelvis rotation | both | Slight counter forms as legs turn under it; O IO + I EO iso; hip rotators | Slight counter held; obliques iso | Held, then squares for release; obliques ecc |
| Lumbar flex/ext | both | Near neutral (not rounded or arched); ES, MF iso; RA iso; ES ecc under peak flexion moment | Near neutral (not rounded or arched); ES, MF iso; RA iso; ES ecc under peak flexion moment | Near neutral (not rounded or arched); ES, MF iso; RA iso; ES ecc under peak flexion moment |
| Lumbar lat. flex | both | Bend over the uphill foot; downhill QL ecc/iso | Bend over the uphill foot; downhill QL ecc/iso | Bend over the uphill foot; downhill QL ecc/iso |
| Lumbar rotation | both | Held near neutral (little range); MF, obliques iso | Held near neutral (little range); MF, obliques iso | Held near neutral (little range); MF, obliques iso |
| Thoracic flex/ext | both | Slight flexion held, not rounded; thoracic ES iso | Slight flexion held, not rounded; thoracic ES iso | Slight flexion held, not rounded; thoracic ES iso |
| Thoracic lat. flex | both | Bend over the uphill foot; downhill obliques iso | Bend over the uphill foot; downhill obliques iso | Bend over the uphill foot; downhill obliques iso |
| Thoracic rotation | both | Slight rotation toward outside of turn; O IO + I EO con | Held; O IO + I EO iso | Squares to the skis as they release, then the new counter forms as the legs turn under; I IO + O EO con |
| Shoulder girdle | outside | Slightly protracted, level; SA, TRAP iso | Slightly protracted, level; SA, TRAP iso | Slightly protracted, level; SA, TRAP iso |
| Shoulder girdle | inside | Slightly protracted, level; SA, TRAP iso | Slightly protracted, level; SA, TRAP iso | Slightly protracted, level; SA, TRAP iso |
| Shoulder | outside | Arm forward, in view; AD, RC iso | Held forward; AD, RC iso | Swings forward to prepare next touch; AD con |
| Shoulder | inside | Pole touch: small flexion then extension; AD con, LD, TMaj con | Arm forward, leads; AD, RC iso | Held; AD iso |
| Elbow | outside | Flexed about 90°, held; BB, brachialis iso | Flexed about 90°, held; BB, brachialis iso | Flexed about 90°, held; BB, brachialis iso |
| Elbow | inside | Flexed about 90°, held; BB iso; TRI con at touch | Flexed about 90°, held; BB iso; TRI con at touch | Flexed about 90°, held; BB iso; TRI con at touch |
| Wrist, grip | outside | Grip held; FF iso | Grip held; FF iso | Grip held; FF iso |
| Wrist, grip | inside | Wrist flick for touch; FF con, wrist extensors ecc | Grip held; FF iso | Grip held; FF iso |
| Neck | both | Head level, eyes ahead down the hill; SCM, SPL iso, counter-rotate against thorax | Head level, eyes ahead down the hill; SCM, SPL iso, counter-rotate against thorax | Head level, eyes ahead down the hill; SCM, SPL iso, counter-rotate against thorax |

Coverage: 34 DOF rows, 102 cells, all filled. 18 rows are specific to this drill; the other 16 follow the turn baseline (2.2).

### D17. Flexion (retraction) versus extension transitions

**Description.** Two ways to link carved turns. In the extension transition the new outside leg extends
through the switch and the centre of mass rises. In the flexion transition (retraction, "suck-switch")
the legs stay flexed, up to about 90° at knee, hip and trunk, and the centre of mass barely rises
(seifert-2023). Leg flexion near the switch keeps the skis on the snow and lowers the peak force
(komissarov-2022b).

**Measured** (23 PSIA Level III instructors, examiners and demo-team members; EMG of rectus femoris, vastus
lateralis and gluteus medius, both legs; seifert-2023):

- Flexion transitions caused more desaturation and higher perceived exertion.
- Outside leg in flexion transitions: higher vastus lateralis in steering and transition, and much higher
  rectus femoris in the transition.
- Inside leg in flexion transitions: higher rectus femoris in steering and transition.
- Inside leg in extension transitions: higher gluteus medius in both phases.

| Segment | Initiation (switch) | Shaping | Finish |
|---|---|---|---|
| Old outside leg (flexion transition) | Flexes actively (retracts) at hip and knee | Becomes the inside leg, held short | — |
| Old outside leg (extension transition) | Extends, then relaxes as it becomes the inside leg | — | — |
| Trunk | Flexion: low, flexed forward. Extension: rises. | As D13 | As D13 |

| Muscle (slug) | Side | I / S / F | Contraction | Role | Conf. | Sources |
|---|---|---|---|---|---|---|
| quadriceps (rectus femoris) | both, flexion transition | 3 / 2 / 2 | concentric hip flexion, isometric | Retract the legs; hold the flexed posture | high | seifert-2023 |
| quadriceps (vasti) | outside, flexion transition | 2 / 3 / 3 | isometric, eccentric | Deeper flexion raises demand | high | seifert-2023 |
| iliopsoas | both, flexion transition | 2 / 1 / 1 | concentric | Retract the legs | low | jiroumaru-2014 |
| hamstrings | both, flexion transition | 2 / 1 / 1 | concentric | Pull the feet up and back under the body | low | — |
| gluteus-medius | inside, extension transition | 2 / 2 / 1 | isometric | Higher than in flexion transitions | high | seifert-2023 |
| quadriceps, gluteus-maximus | new outside, extension transition | 3 / 2 / 2 | concentric | Extension through the switch | medium | berg-1995 |

Errors: retraction from the trunk (folding at the waist, back seat); extending up and back (late edge
change).

**DOF matrix (D17).**

| DOF | Side | Initiation | Shaping | Finish |
|---|---|---|---|---|
| Ankle DF/PF | outside | DF active: feet pulled back, shin to tongue; TA, EDL, EHL, FT con | DF held against turn force and boot flex; TA, EDL, EHL iso; SOL ecc then iso (GAS slack, knee bent) | DF held as pressure moves to heel; TA iso, SOL iso; if TA lets go the ankle opens (backseat) |
| Ankle DF/PF | inside | DF active: foot pulled back; TA, EDL, EHL, FT con | DF held, shin on tongue; TA iso (rises after fall line) | DF held; TA iso |
| Ankle inv/ev | outside | Eversion to big-toe edge; PL, PB con; TP ecc | Eversion torque held; PL, PB iso; TP iso (arch) | Back to neutral at release; PL, PB ecc |
| Ankle inv/ev | inside | Inversion to little-toe edge, leading; TA, TP con | Inversion held; TA, TP iso; PL ecc/iso | Back to neutral; TA, TP ecc |
| Foot arch, toes | outside | Arch held under load, pressure spread; INT, TP, FHL iso | Arch held under load, pressure spread; INT, TP, FHL iso | Arch held under load, pressure spread; INT, TP, FHL iso |
| Foot arch, toes | inside | Arch held, light load; INT iso | Arch held, light load; INT iso | Arch held, light load; INT iso |
| Knee flex/ext | outside | Flexion transition: stays flexed, near 90°; VAS iso (higher); RF con. Extension transition: extends; VAS con | Deeper flexion raises VAS demand; VAS ecc/iso | As D13 |
| Knee flex/ext | inside | Old outside retracts: hamstrings, GAS con | Held short; RF iso (higher in flexion transition) | As D13 |
| Knee tibial rot. | outside | Held near neutral against valgus and external rotation; MH, POP, SAR, GRA iso; BF iso | Held near neutral against valgus and external rotation; MH, POP, SAR, GRA iso; BF iso | Held near neutral against valgus and external rotation; MH, POP, SAR, GRA iso; BF iso |
| Knee tibial rot. | inside | Held neutral; POP, MH, BF iso (low) | Held neutral; POP, MH, BF iso (low) | Held neutral; POP, MH, BF iso (low) |
| Hip flex/ext | outside | Flexion transition: hip near 90°, RF, IP con; extension transition: GMAX con | As D13 | As D13 |
| Hip flex/ext | inside | Retracts; IP, RF con | Held; IP, RF iso | As D13 |
| Hip abd/add | outside | Knee toward turn: add of flexed femur, ADD, AM con; then abd (pelvis-on-femur) as load arrives, GMED, GMIN, TFL ecc to iso | Abducted, inside half of pelvis held; GMED, GMIN, TFL, upper GMAX iso; ADD, AM co-con iso | Held, back to neutral; GMED ecc |
| Hip abd/add | inside | Extension transition: inside GMED higher, iso | Inside GMED iso (higher with extension) | Held |
| Hip IR/ER | outside | IR, femur turns under pelvis; anterior GMED/GMIN, TFL, ADD con | IR held and braked; GMAX, DR, BF ecc/iso | Held, then neutral; DR, GMAX iso |
| Hip IR/ER | inside | ER; DR, GMAX, SAR con | ER held (10-26 deg) against an IR moment; anterior GMED/GMIN, TFL, ADD iso | Held; same iso |
| Pelvis tilt | both | Anterior tilt grows with hip hinge; IP, RF con; ES iso | Anterior tilt held, lumbar neutral; ES, MF iso; RA, TrA iso (anti-extension) | Held; ES, RA iso |
| Pelvis hike (list) | both | Inside half rises toward level as legs tip (pelvis on outside femur); O GMED, GMIN, TFL con | Inside half held up; O GMED, GMIN, TFL iso | Levels for release; O GMED ecc |
| Pelvis rotation | both | Slight counter forms as legs turn under it; O IO + I EO iso; hip rotators | Slight counter held; obliques iso | Held, then squares for release; obliques ecc |
| Lumbar flex/ext | both | Near neutral (not rounded or arched); ES, MF iso; RA iso; ES ecc under peak flexion moment | Near neutral (not rounded or arched); ES, MF iso; RA iso; ES ecc under peak flexion moment | Near neutral (not rounded or arched); ES, MF iso; RA iso; ES ecc under peak flexion moment |
| Lumbar lat. flex | both | Neutral to slight bend toward outside ski; I QL ecc (lengthens, controls the outward tilt) | Slight bend held; I QL, I obliques iso; O QL co-con | Returns to neutral; I QL con |
| Lumbar rotation | both | Held near neutral (little range); MF, obliques iso | Held near neutral (little range); MF, obliques iso | Held near neutral (little range); MF, obliques iso |
| Thoracic flex/ext | both | Flexion transition: trunk low and flexed forward, still not rounded; ES iso (high) | Flexion transition: trunk low and flexed forward, still not rounded; ES iso (high) | Flexion transition: trunk low and flexed forward, still not rounded; ES iso (high) |
| Thoracic lat. flex | both | Neutral to slight bend toward outside ski; I obliques ecc (lengthen) | Some bend held; I obliques iso, O obliques co-con | Returns; I obliques con |
| Thoracic rotation | both | Slight rotation toward outside of turn; O IO + I EO con | Held; O IO + I EO iso | Squares to the skis as they release, then the new counter forms as the legs turn under; I IO + O EO con |
| Shoulder girdle | outside | Slightly protracted, level; SA, TRAP iso | Slightly protracted, level; SA, TRAP iso | Slightly protracted, level; SA, TRAP iso |
| Shoulder girdle | inside | Slightly protracted, level; SA, TRAP iso | Slightly protracted, level; SA, TRAP iso | Slightly protracted, level; SA, TRAP iso |
| Shoulder | outside | Arm forward, in view; AD, RC iso | Held forward; AD, RC iso | Swings forward to prepare next touch; AD con |
| Shoulder | inside | Pole touch: small flexion then extension; AD con, LD, TMaj con | Arm forward, leads; AD, RC iso | Held; AD iso |
| Elbow | outside | Flexed about 90°, held; BB, brachialis iso | Flexed about 90°, held; BB, brachialis iso | Flexed about 90°, held; BB, brachialis iso |
| Elbow | inside | Flexed about 90°, held; BB iso; TRI con at touch | Flexed about 90°, held; BB iso; TRI con at touch | Flexed about 90°, held; BB iso; TRI con at touch |
| Wrist, grip | outside | Grip held; FF iso | Grip held; FF iso | Grip held; FF iso |
| Wrist, grip | inside | Wrist flick for touch; FF con, wrist extensors ecc | Grip held; FF iso | Grip held; FF iso |
| Neck | both | Head level, eyes ahead down the hill; SCM, SPL iso, counter-rotate against thorax | Head level, eyes ahead down the hill; SCM, SPL iso, counter-rotate against thorax | Head level, eyes ahead down the hill; SCM, SPL iso, counter-rotate against thorax |

Coverage: 34 DOF rows, 102 cells, all filled. 6 rows are specific to this drill; the other 28 follow the turn baseline (2.2).

### D18. Step turns into the fall line

**Description.** From a traverse, small steps fan the skis toward the fall line. The new inside ski is
lifted and turned slightly, then the outside ski is stepped to match. The turn then finishes as a parallel
skidded turn to a stop (psia-c-step-turn-fall-line).

**Movement goal.** Weight transfer by independent flexion and extension of the legs, and leg rotation
under a stable trunk.

| Segment | Initiation (steps) | Shaping | Finish |
|---|---|---|---|
| Inside leg | Lifted (hip and knee flexion), externally rotated, set down diverging | Matches the outside ski | Parallel |
| Outside leg | Takes weight at each step, then is stepped to parallel | Loaded | Skidded finish |
| Pelvis and trunk | Stable; weight foot to foot | Over the outside ski | Same |

| Muscle (slug) | Side | I / S / F | Contraction | Role | Conf. | Sources |
|---|---|---|---|---|---|---|
| iliopsoas, quadriceps (rectus femoris), hamstrings | stepping leg | 2 / 1 / 0 | concentric, eccentric | Lift and place | low | andersson-1997 |
| deep-hip-rotators, gluteus-maximus | inside | 2 / 1 / 0 | concentric | Turn the lifted ski out | low | — |
| gluteus-medius, gluteus-minimus | stance leg | 2 / 2 / 1 | isometric | Pelvic hold during each step | medium | ganderton-2017 |
| quadriceps | outside | 1 / 2 / 2 | eccentric | Skidded finish | medium | hintermeister-1997 |

Errors: stepping with the upper body; steps too big (balance lost); tails pushed out instead of tips
stepped in.

**DOF matrix (D18).**

| DOF | Side | Initiation | Shaping | Finish |
|---|---|---|---|---|
| Ankle DF/PF | outside | DF active: feet pulled back, shin to tongue; TA, EDL, EHL, FT con | DF held against turn force and boot flex; TA, EDL, EHL iso; SOL ecc then iso (GAS slack, knee bent) | DF held as pressure moves to heel; TA iso, SOL iso; if TA lets go the ankle opens (backseat) |
| Ankle DF/PF | inside | DF active: foot pulled back; TA, EDL, EHL, FT con | DF held, shin on tongue; TA iso (rises after fall line) | DF held; TA iso |
| Ankle inv/ev | outside | Eversion to big-toe edge; PL, PB con; TP ecc | Eversion torque held; PL, PB iso; TP iso (arch) | Back to neutral at release; PL, PB ecc |
| Ankle inv/ev | inside | Inversion to little-toe edge, leading; TA, TP con | Inversion held; TA, TP iso; PL ecc/iso | Back to neutral; TA, TP ecc |
| Foot arch, toes | outside | Arch held under load, pressure spread; INT, TP, FHL iso | Arch held under load, pressure spread; INT, TP, FHL iso | Arch held under load, pressure spread; INT, TP, FHL iso |
| Foot arch, toes | inside | Arch held, light load; INT iso | Arch held, light load; INT iso | Arch held, light load; INT iso |
| Knee flex/ext | outside | Extends (extension transition) or stays flexed; VAS con or iso; MH, BF co-con | Flexes under load; VAS, RF ecc; MH, BF iso | Deepest flexion, then extends; VAS ecc, iso, then con |
| Knee flex/ext | inside | Stepping leg lifts then places; hamstrings con, VAS ecc | Matches outside ski; VAS iso | Parallel; VAS iso |
| Knee tibial rot. | outside | Held near neutral against valgus and external rotation; MH, POP, SAR, GRA iso; BF iso | Held near neutral against valgus and external rotation; MH, POP, SAR, GRA iso; BF iso | Held near neutral against valgus and external rotation; MH, POP, SAR, GRA iso; BF iso |
| Knee tibial rot. | inside | Held neutral; POP, MH, BF iso (low) | Held neutral; POP, MH, BF iso (low) | Held neutral; POP, MH, BF iso (low) |
| Hip flex/ext | outside | Extends slightly or holds; GMAX, AM con or iso | Flexes under load; GMAX, AM, MH ecc | Flexed at peak, then extends; GMAX ecc then con |
| Hip flex/ext | inside | Lifts and places; IP, RF con, then ecc | Held | Held |
| Hip abd/add | outside | Stance hip holds pelvis during each step; GMED, GMIN iso | As D13 | As D13 |
| Hip abd/add | inside | Knee toward turn: abd of flexed femur; posterior GMED, DR con | Adducted, held; ADD (adductor longus) iso | Held; ADD iso |
| Hip IR/ER | outside | IR, femur turns under pelvis; anterior GMED/GMIN, TFL, ADD con | IR held and braked; GMAX, DR, BF ecc/iso | Held, then neutral; DR, GMAX iso |
| Hip IR/ER | inside | Lifted ski turned out (ER), set down diverging; DR, GMAX con | Matches; iso | Parallel; iso |
| Pelvis tilt | both | Anterior tilt grows with hip hinge; IP, RF con; ES iso | Anterior tilt held, lumbar neutral; ES, MF iso; RA, TrA iso (anti-extension) | Held; ES, RA iso |
| Pelvis hike (list) | both | Inside half rises toward level as legs tip (pelvis on outside femur); O GMED, GMIN, TFL con | Inside half held up; O GMED, GMIN, TFL iso | Levels for release; O GMED ecc |
| Pelvis rotation | both | Slight counter forms as legs turn under it; O IO + I EO iso; hip rotators | Slight counter held; obliques iso | Held, then squares for release; obliques ecc |
| Lumbar flex/ext | both | Near neutral (not rounded or arched); ES, MF iso; RA iso; ES ecc under peak flexion moment | Near neutral (not rounded or arched); ES, MF iso; RA iso; ES ecc under peak flexion moment | Near neutral (not rounded or arched); ES, MF iso; RA iso; ES ecc under peak flexion moment |
| Lumbar lat. flex | both | Neutral to slight bend toward outside ski; I QL ecc (lengthens, controls the outward tilt) | Slight bend held; I QL, I obliques iso; O QL co-con | Returns to neutral; I QL con |
| Lumbar rotation | both | Held near neutral (little range); MF, obliques iso | Held near neutral (little range); MF, obliques iso | Held near neutral (little range); MF, obliques iso |
| Thoracic flex/ext | both | Slight flexion held, not rounded; thoracic ES iso | Slight flexion held, not rounded; thoracic ES iso | Slight flexion held, not rounded; thoracic ES iso |
| Thoracic lat. flex | both | Neutral to slight bend toward outside ski; I obliques ecc (lengthen) | Some bend held; I obliques iso, O obliques co-con | Returns; I obliques con |
| Thoracic rotation | both | Slight rotation toward outside of turn; O IO + I EO con | Held; O IO + I EO iso | Squares to the skis as they release, then the new counter forms as the legs turn under; I IO + O EO con |
| Shoulder girdle | outside | Slightly protracted, level; SA, TRAP iso | Slightly protracted, level; SA, TRAP iso | Slightly protracted, level; SA, TRAP iso |
| Shoulder girdle | inside | Slightly protracted, level; SA, TRAP iso | Slightly protracted, level; SA, TRAP iso | Slightly protracted, level; SA, TRAP iso |
| Shoulder | outside | Arm forward, in view; AD, RC iso | Held forward; AD, RC iso | Swings forward to prepare next touch; AD con |
| Shoulder | inside | Pole touch: small flexion then extension; AD con, LD, TMaj con | Arm forward, leads; AD, RC iso | Held; AD iso |
| Elbow | outside | Flexed about 90°, held; BB, brachialis iso | Flexed about 90°, held; BB, brachialis iso | Flexed about 90°, held; BB, brachialis iso |
| Elbow | inside | Flexed about 90°, held; BB iso; TRI con at touch | Flexed about 90°, held; BB iso; TRI con at touch | Flexed about 90°, held; BB iso; TRI con at touch |
| Wrist, grip | outside | Grip held; FF iso | Grip held; FF iso | Grip held; FF iso |
| Wrist, grip | inside | Wrist flick for touch; FF con, wrist extensors ecc | Grip held; FF iso | Grip held; FF iso |
| Neck | both | Head level, eyes ahead down the hill; SCM, SPL iso, counter-rotate against thorax | Head level, eyes ahead down the hill; SCM, SPL iso, counter-rotate against thorax | Head level, eyes ahead down the hill; SCM, SPL iso, counter-rotate against thorax |

Coverage: 34 DOF rows, 102 cells, all filled. 4 rows are specific to this drill; the other 30 follow the turn baseline (2.2).

## 3. Anatomy list

### 3.1 Muscles

**Mesh check.** Names come from a read-only byte scan of
`~/dev/skibuddy-assets/z-anatomy-template-32ce380/extracted/Z-Anatomy/Startup.blend` for object names
ending in `.l`/`.r`, cross-checked with `work/report.json`, the current build report.
- "Built": the mesh is already in the build report.
- "Source": the mesh exists in Startup.blend but the build does not export it yet.

Every row below has both `.l` and `.r` meshes unless it says otherwise. The scan can miss names, so
"not found" is not proof of absence.

**FMA ids** are exact label matches in the EBI OLS4 copy of the FMA
(`https://www.ebi.ac.uk/ols4/ontologies/fma`).

**Grouping rule.** Muscles share an entry only when their job in skiing is the same in every drill here.
The coordinator's list was checked muscle by muscle; the result is below.

| Slug | Canonical name | Region | FMA | In muscles.yaml today | Z-Anatomy meshes | Why its own entry / used by |
|---|---|---|---|---|---|---|
| **vasti** | Vastus lateralis, medialis, intermedius | leg | VL FMA:22431, VM FMA:22432, VI FMA:22433 | no (inside `quadriceps`) | Vastus lateralis / medialis / intermedius muscle; built | Eccentric knee-extensor load. Inside vasti are near idle when the leg is lifted (D1, D2), while RF is not (kroll-2010). |
| **vastus-medialis** (optional split) | Vastus medialis | leg | FMA:22432 | no | Vastus medialis muscle; built | Patellar tracking under valgus. Measured on snow (hintermeister-1997, heinrich-2023 inside VM). Keep inside `vasti` unless the viewer can highlight it. |
| **rectus-femoris** | Rectus femoris | leg | FMA:22430 | no (inside `quadriceps`) | Rectus femoris muscle; built | Two-joint muscle that acts as a hip flexor on the inside leg (kroll-2010, seifert-2023, cuniberti-2026) |
| quadriceps (keep as parent) | Quadriceps femoris | leg | FMA:22428 | yes | as above | Keep for exercise targets; activations use `vasti` and `rectus-femoris` |
| **biceps-femoris** | Biceps femoris | leg | FMA:22356 (long head 45887, short head 45890) | no (inside `hamstrings`) | Long and short head of biceps femoris; built | Lateral hamstring: tibial external rotation, brakes outside hip IR (heinrich-2023); short head is a pure knee flexor (D1 lift) |
| **medial-hamstrings** | Semitendinosus and semimembranosus | leg | ST FMA:22357, SM FMA:22438 | no (inside `hamstrings`) | Semitendinosus muscle; Semimembranosus muscle; built | Tibial internal rotation, resist valgus/ER, ACL protection. Measured separately on snow (hintermeister-1997, heinrich-2023). |
| hamstrings (keep as parent) | Set of hamstring muscles | leg | FMA:81022 | yes | as above | Parent for exercise targets |
| **adductor-magnus** | Adductor magnus | hip | FMA:22443 | no (inside `adductors`) | Adductor magnus; built | Hip extensor as well as adductor, outside-leg stance (P1) |
| adductors | Adductor longus, brevis, pectineus | hip | 22441, 22442, 22440 | yes | Adductor longus / brevis, Pectineus muscle; built | Inside hip adduction (adductor longus: heinrich-2023); pectineus also flexes |
| **gracilis** | Gracilis | hip | FMA:43882 | no (inside `adductors`) | Gracilis muscle; built | Knee flexion and tibial IR with the pes anserinus; holds the tail up in D1 |
| gluteus-maximus | Gluteus maximus | hip | FMA:22314 | yes | Gluteus maximus muscle; built | — |
| gluteus-medius | Gluteus medius | hip | FMA:22315 | yes | Gluteus medius muscle; built (today's map also adds gluteus minimus: split it) | — |
| **gluteus-minimus** | Gluteus minimus | hip | FMA:22317 | no | Gluteus minimus muscle; built | Pelvic hold and IR in flexion (moore-2020, uebayashi-2026) |
| **tensor-fasciae-latae** | Tensor fasciae latae | hip | FMA:22423 | no | Tensor fasciae latae; built | Flexion, abduction, IR; diverges from the gluteals in exercise EMG (selkowitz-2024) |
| **sartorius** | Sartorius | hip | FMA:22353 | no | Sartorius muscle; built | Hip flexion + ER + knee flexion (the stork posture) |
| iliopsoas (rename `hip-flexors`) | Iliopsoas | hip | FMA:64918 (psoas major 18060, iliacus 22310) | yes, as `hip-flexors` | Psoas major; Iliacus muscle; built | — |
| deep-hip-rotators | Deep lateral rotators | hip | piriformis 19082, obturator internus 22298, externus 22299, quadratus femoris 22321, gemelli 22318, 22320 | yes | each of the six; built | One job in skiing: ER and femoral-head stability |
| tibialis-anterior | Tibialis anterior | leg | FMA:22532 | yes | built | — |
| **toe-extensors** | Extensor digitorum longus, extensor hallucis longus, fibularis tertius | leg | EDL 22534, EHL 22533, FT 22538 | no | Extensor digitorum longus; Extensor hallucis longus; Fibularis tertius muscle; built | Active dorsiflexion with TA (F12) |
| **tibialis-posterior** | Tibialis posterior | leg | FMA:51099 | no | Tibialis posterior muscle; built | Inversion (inside ski tipping), arch under the stance foot |
| **soleus** | Soleus | leg | FMA:22542 | no (inside `calf`) | Soleus muscle; built | Works with the knee bent; gastrocnemius is shortened at deep knee flexion, so soleus carries the eccentric ankle work |
| **gastrocnemius** | Gastrocnemius | leg | FMA:22541 | no (inside `calf`) | Lateral and medial head of gastrocnemius; built | Knee flexor on the lifted leg; less ankle work with the knee bent |
| calf (keep as parent) | Triceps surae | leg | FMA:51062 | yes | as above | Parent for exercise targets |
| peroneals | Fibularis longus and brevis | leg | 22539, 22540 | yes | Fibularis longus / brevis muscle; built | Eversion (outside ski edge) |
| **foot-intrinsics** | Intrinsic plantar muscles (abductor hallucis, flexor digitorum brevis, quadratus plantae, flexor hallucis brevis, interossei, lumbricals) | leg | abductor hallucis 37448, flexor digitorum brevis 37450 (others not verified) | no | all listed; built | Arch and pressure distribution under the stance foot (low) |
| **popliteus** | Popliteus | leg | FMA:22590 | no | Popliteus muscle; built | Unlocks and controls tibial rotation at the flexed knee (low) |
| **rectus-abdominis** | Rectus abdominis | trunk | FMA:9628 | no | Rectus abdominis muscle; built | Anti-extension, backseat guard; measured (hintermeister-1997) |
| **transversus-abdominis** | Transversus abdominis | trunk | FMA:15570 | no | Transversus abdominis muscle; built | Trunk stiffness (low) |
| **external-oblique** | External oblique | trunk | FMA:13335 | no (inside `obliques`) | External abdominal oblique muscle; built | Counter-rotation pairs one side's external with the other side's internal oblique, so per-side activations need them apart |
| **internal-oblique** | Internal oblique | trunk | FMA:13891 | no (inside `obliques`) | Internal abdominal oblique muscle; built | Same; internal oblique was primary in the model (heinrich-2023) |
| **quadratus-lumborum** | Quadratus lumborum | trunk | FMA:15569 | no | Quadratus lumborum muscle; built | Controls the lateral bend from the lengthened inside; both sides co-contract |
| erector-spinae | Erector spinae | trunk | right/left sets 22731/22732 | yes | iliocostalis, longissimus, spinalis parts; built | — |
| **multifidus** | Multifidus | trunk | FMA:22827 | no | Multifidus lumborum, thoracis, colli muscle; source | Segmental anti-rotation and extension (low) |
| **anterior-deltoid** | Deltoid, clavicular part | arm | deltoid FMA:32521 | no | Clavicular part of deltoid muscle (acromial and scapular spinal parts also present); built | Arms forward, pole swing |
| **latissimus-dorsi** | Latissimus dorsi | arm | FMA:13357 | no | Latissimus dorsi muscle; built | Pole touch and plant |
| **teres-major** | Teres major | arm | FMA:32549 | no | Teres major muscle; built | With latissimus in the pole touch |
| **serratus-anterior** | Serratus anterior | arm | FMA:13397 | no | Serratus anterior muscle; built | Holds the scapula protracted with hands forward |
| **rotator-cuff** | Supraspinatus, infraspinatus, teres minor, subscapularis | arm | set FMA:82650 (9629, 32546, 32550, 13413) | no | each of the four; built | Glenohumeral stability with arms held forward |
| **trapezius** | Trapezius | arm | FMA:9626 | no | Descending, transverse and ascending part of trapezius muscle; built | Shoulders level |
| **biceps-brachii** | Biceps brachii | arm | FMA:37670 | no | Long and short head of biceps brachii; built (Brachialis muscle also present) | Elbow held flexed |
| triceps-brachii | Triceps brachii | arm | FMA:37688 | no | three heads; built | Pole plant and push |
| **forearm-flexors** | Flexor digitorum superficialis and profundus, wrist flexors | arm | FDS 38469, FDP 38478 | no | Flexor digitorum superficialis / profundus; heads of flexor carpi ulnaris; Flexor carpi radialis; built | Pole grip |
| **neck-stabilisers** | Sternocleidomastoid and splenius capitis | trunk | SCM 13407, splenius capitis 22653 | no | Sternocleidomastoid muscle; Splenius capitis muscle; built | Head level, eyes steady while the thorax counters |

**Effect on the drill tables.** The effort tables in section 2 still use the old group slugs. Map them as
follows when writing YAML:
- `quadriceps` → `vasti` + `rectus-femoris`; on the inside leg of D1 and D2, `rectus-femoris` carries the
  effort and `vasti` gets 0 to 1.
- `hamstrings` → `biceps-femoris` + `medial-hamstrings`, same effort unless a row names one of them.
- `calf` → `soleus` (ankle work with the knee bent) + `gastrocnemius` (knee flexion on a lifted leg).
- `adductors` → `adductor-magnus` on the stance leg (hip extension and adduction), `adductors` (longus,
  brevis, pectineus) for inside hip adduction, `gracilis` with the knee flexors.
- `obliques` → `external-oblique` + `internal-oblique` per side, using the rotation pairing in 2.1.
- `tibialis-anterior` rows → `tibialis-anterior` + `toe-extensors`.

### 3.1a Structures under load (optional layer, kept apart from muscles)

| Structure | FMA | Loaded by | Z-Anatomy mesh |
|---|---|---|---|
| Anterior cruciate ligament | FMA:44614 | Valgus with internal tibial rotation at low knee flexion (slip-catch); backward landing with boot-induced anterior drawer and quadriceps pull (bere-2011, bere-2013); measured in vivo during a rupture (sporri-2022). Hamstring co-contraction and knee flexion over 60° keep it low in a balanced carved turn (heinrich-2023). | Anterior cruciate ligament .l/.r; source only |
| Medial (tibial) collateral ligament | FMA:44600 | Valgus on the outside knee, wedge with an edge catch | Superficial and deep part of tibial collateral ligament .l/.r; source only |
| Patellar ligament and patellofemoral joint | FMA:44581 | Quadriceps force at deep knee flexion: long eccentric holds, flexion transitions, landings | No `.l`/`.r` mesh found in the scan (only descriptive text; the scan can miss names); medial and lateral patellar retinaculum meshes exist |
| Menisci | — | Compression with rotation at the flexed knee | Medial meniscus .l/.r (lateral expected); source only |
| Lumbar discs | — | Combined frontal bending, lateral bending and torsion under peak force (sporri-2015, sporri-2016) | not checked |

**Keep as one entry.**

- `deep-hip-rotators`, `peroneals`, `erector-spinae`, `rotator-cuff`, `foot-intrinsics`,
  `neck-stabilisers`, `toe-extensors`. Within each group the members do the same job in every drill
  here.
- The parents `quadriceps`, `hamstrings` and `calf` stay for exercise targets, where an exercise works
  the whole group.

**Split.**

- `rectus-femoris` from `vasti`: their inside-leg roles diverge, and that is measured.
- `medial-hamstrings` from `biceps-femoris`: they rotate the tibia in opposite directions.
- `soleus` from `gastrocnemius`: knee-angle dependence.
- `adductor-magnus` and `gracilis` from the other adductors: magnus is a hip extensor; gracilis is a knee
  flexor.
- `gluteus-minimus` and `tensor-fasciae-latae` from `gluteus-medius`.
- `external-oblique` and `internal-oblique`: they pair across sides in rotation.

### 3.2 Bones that matter

All are in the build (the build takes the whole lower-limb, pelvic and vertebral skeleton:
`scripts/anatomy/build_anatomy.py`).

| Bone | FMA | Why it matters |
|---|---|---|
| Hip bone (pelvis) | FMA:16585 (pelvis FMA:9578) | Pelvic hike, tilt and rotation; origin of every hip muscle |
| Sacrum | FMA:16202 | Pelvic reference for trunk lateral bending and torsion (sporri-2015) |
| Lumbar vertebrae | FMA:9921 (class) | Lumbar extension moment, lateral bending (heinrich-2022) |
| Femur | FMA:9611 | Hip rotation under the pelvis |
| Patella | FMA:24485 | Quadriceps line of pull; knee flexion |
| Tibia | FMA:24476 | Shin angle against the boot; tibial rotation (slip-catch) |
| Fibula | FMA:24479 | Peroneal origin |
| Talus | FMA:9708 | Ankle dorsiflexion inside the boot |
| Calcaneus | FMA:24496 | Subtalar inversion and eversion (tipping inside the boot) |

## 4. Sources

`read: full` means the full text was read (PMC or an open web page): methods, results and tables. The
note after it says what was extracted. Some full texts were read by delegated reading agents in this
session. They extracted data to a fixed template, and their numbers were used only where they were
stated in the text, not read off figures. `read: abstract` means only the abstract, through NCBI
E-utilities, and nothing beyond the abstract is used. Every PubMed id was retrieved through E-utilities `esummary`/`efetch`
on 2026-10-15. pubmed.ncbi.nlm.nih.gov itself returns a bot check to curl. Every non-PubMed URL below
returned HTTP 200 to curl on 2026-10-15. The slugs follow `content/sources.yaml`.

### 4.1 Alpine skiing: EMG, kinetics, kinematics, injury

| id | Citation | URL | read |
|---|---|---|---|
| gao-2024 | Gao N et al. Biodynamic analysis of alpine skiing with a skier-ski-snow interaction model. arXiv 2411.08056. | https://arxiv.org/abs/2411.08056 | full: IMU-driven model, maximum outside hip flexion 55 deg (beginner) and 65 deg (intermediate); sets the regular turns' hip range and trunk lean |
| kim-2020 | Kim J. Three-dimensional kinematic differences between turning skill level and radius during alpine skiing. Korean J Sport Sci. 2020;31(2):349. | https://kjss.sports.re.kr/assets/pdf/275/journal-31-2-349.pdf | full: 14 instructors, IMU angles relative to standing; carved long turns dorsiflex about 6 deg more in early steering than at completion (Tables 1-4); sets the carving ankle table |
| hintermeister-1995 | Hintermeister RA et al. Muscle activity in slalom and giant slalom skiing. Med Sci Sports Exerc. 1995;27:315-22. | https://pubmed.ncbi.nlm.nih.gov/7752856/ | abstract |
| hintermeister-1997 | Hintermeister RA et al. Muscle activity in wedge, parallel, and giant slalom skiing. Med Sci Sports Exerc. 1997;29:548-53. | https://pubmed.ncbi.nlm.nih.gov/9107639/ | abstract |
| berg-1995 | Berg HE, Eiken O, Tesch PA. Involvement of eccentric muscle actions in giant slalom racing. Med Sci Sports Exerc. 1995;27:1666-70. | https://pubmed.ncbi.nlm.nih.gov/8614323/ | abstract |
| berg-1999 | Berg HE, Eiken O. Muscle control in elite alpine skiing. Med Sci Sports Exerc. 1999;31:1065-7. | https://pubmed.ncbi.nlm.nih.gov/10416571/ | abstract |
| zeglinski-1998 | Zeglinksi CM et al. Muscle activity in the slalom turn of alpine skiing and in-line skating. Int J Sports Med. 1998;19:447-54. (PubMed spells the author "Zeglinksi".) | https://pubmed.ncbi.nlm.nih.gov/9839840/ | abstract |
| louie-1984 | Louie JK et al. Surface EMG and torsion measurements during snow skiing: laboratory and field tests. J Biomech. 1984;17:713-24. | https://pubmed.ncbi.nlm.nih.gov/6526831/ | abstract |
| kroll-2010 | Kröll J et al. Quadriceps muscle function during recreational alpine skiing. Med Sci Sports Exerc. 2010;42:1545-56. | https://pubmed.ncbi.nlm.nih.gov/20068490/ | abstract |
| kroll-2011 | Kröll J et al. Changes in quadriceps muscle activity during sustained recreational alpine skiing. J Sports Sci Med. 2011;10:81-92. | https://pmc.ncbi.nlm.nih.gov/articles/PMC3737900/ | full: knee angles inside vs outside; fatigue shifts; no %MVC |
| chollet-2025 | Chollet M et al. Fatigue-induced changes in electromyographic activity after repeated racing turns: a pilot study. Eur J Appl Physiol. 2025;125:1423-35. | https://pubmed.ncbi.nlm.nih.gov/39707012/ | abstract |
| seifert-2023 | Seifert JG et al. The EMG, NIRS, and RPE responses to two turn transition techniques in alpine skiing. JSAMS Plus. 2023;2:100037. | https://pmc.ncbi.nlm.nih.gov/articles/PMC12980613/ | full: EMG (mV) of RF, VL, GMed both legs, steering vs transition; NIRS; RPE |
| cuniberti-2026 | Cuniberti GC et al. Sex-specific biomechanical profiles in recreational alpine skiing. J Biomech. 2026;207:113543. | https://pubmed.ncbi.nlm.nih.gov/42697010/ | abstract |
| hermann-2023 | Hermann A et al. Muscular fatigue and quadriceps-to-hamstring ratio in alpine skiing in women over 40 years. Int J Environ Res Public Health. 2023;20:5486. | https://pmc.ncbi.nlm.nih.gov/articles/PMC10138889/ | full: whole-quadriceps and hamstrings %MVC, Q:H ratio per task |
| ishige-2021 | Ishige Y et al. Muscle activity and morphology in slalom skiing by a single-leg amputee ski racer. J Sports Sci Med. 2021;20:500-7. | https://pmc.ncbi.nlm.nih.gov/articles/PMC8256526/ | full: turn durations, thigh CSA; EMG figure-only |
| heinrich-2022 | Heinrich D, van den Bogert AJ, Nachbauer W. Estimation of joint moments during turning maneuvers in alpine skiing using a three dimensional musculoskeletal skier model. Front Bioeng Biotechnol. 2022;10:894568. | https://pmc.ncbi.nlm.nih.gov/articles/PMC9269104/ | full: Table 1 joint angles, Table 2 joint moments, Table 3 knee loads per leg |
| heinrich-2023 | Heinrich D et al. Model-based estimation of muscle and ACL forces during turning maneuvers in alpine skiing. Sci Rep. 2023;13:9026. | https://pmc.ncbi.nlm.nih.gov/articles/PMC10239490/ | full: activation ranking per leg, ACL force; per-muscle values figure-only |
| vaverka-2012 | Vaverka F, Vodickova S, Elfmark M. Kinetic analysis of ski turns based on measured ground reaction forces. J Appl Biomech. 2012;28:41-7. | https://pubmed.ncbi.nlm.nih.gov/21904012/ | abstract |
| klous-2012 | Klous M, Müller E, Schwameder H. Three-dimensional knee joint loading in alpine skiing: a comparison between a carved and a skidded turn. J Appl Biomech. 2012;28:655-64. | https://pubmed.ncbi.nlm.nih.gov/22660886/ | abstract |
| komissarov-2022b | Komissarov SS. Dynamics of carving runs in alpine skiing. II. Centrifugal pendulum with a retractable leg. Sports Biomech. 2022;21:912-39. | https://pubmed.ncbi.nlm.nih.gov/32727319/ | abstract |
| alhammoud-2020 | Alhammoud M et al. On-field ski kinematic according to leg and discipline in elite alpine skiers. Front Sports Act Living. 2020;2:56. | https://pmc.ncbi.nlm.nih.gov/articles/PMC7739787/ | full |
| alhammoud-2024 | Alhammoud M et al. Muscle-tendon unit length changes in knee extensors and flexors during alpine skiing. Sports Biomech. 2024;23:335-46. | https://pubmed.ncbi.nlm.nih.gov/33612079/ | abstract |
| ogrin-2021 | Ogrin J et al. Asymmetries in ground reaction forces during turns by elite slalom alpine skiers are not related to asymmetries in muscular strength. Front Physiol. 2021;12:577698. | https://pmc.ncbi.nlm.nih.gov/articles/PMC8042208/ | full: steering-phase foot GRF per side; strength asymmetry |
| falda-buscaiot-2017 | Falda-Buscaiot T et al. Influence of slope steepness, foot position and turn phase on plantar pressure distribution during giant slalom alpine ski racing. PLoS One. 2017;12:e0176975. | https://pmc.ncbi.nlm.nih.gov/articles/PMC5417654/ | full: foot force per phase and side; pressure-time integrals by region |
| delhaye-2025 | Delhaye C et al. Kinetic keys to alpine skiing performance: a 3-D analysis of ground reaction forces and torques. J Sports Sci. 2025;43:1731-41. | https://pubmed.ncbi.nlm.nih.gov/40534126/ | abstract |
| hladnik-2026 | Hladnik J et al. Mechanical analysis of skier activity in giant slalom. PLoS One. 2026;21:e0347192. | https://pmc.ncbi.nlm.nih.gov/articles/PMC13123946/ | full: skier-activity work and power over the turn |
| scheiber-2012 | Scheiber P, Seifert J, Müller E. Relationships between biomechanics and physiology in older, recreational alpine skiers. Scand J Med Sci Sports. 2012;22:49-57. | https://pubmed.ncbi.nlm.nih.gov/20561278/ | abstract |
| sporri-2015 | Spörri J et al. Potential mechanisms leading to overuse injuries of the back in alpine ski racing. Am J Sports Med. 2015;43:2042-8. | https://pubmed.ncbi.nlm.nih.gov/26109612/ | abstract |
| sporri-2022 | Spörri J, Müller E, Kröll J. "When you're down, stay down": an ACL rupture measured in vivo. J Sport Health Sci. 2022;11:14-20. | https://pmc.ncbi.nlm.nih.gov/articles/PMC8847912/ | full: in vivo knee/hip angles, GRF, EMG during ACL rupture |
| bere-2011 | Bere T et al. Mechanisms of anterior cruciate ligament injury in World Cup alpine skiing: a systematic video analysis of 20 cases. Am J Sports Med. 2011;39:1421-9. | https://pubmed.ncbi.nlm.nih.gov/21515807/ | abstract |
| bere-2013 | Bere T et al. Kinematics of anterior cruciate ligament ruptures in World Cup alpine skiing: 2 case reports of the slip-catch mechanism. Am J Sports Med. 2013;41:1067-73. | https://pubmed.ncbi.nlm.nih.gov/23449837/ | abstract |
| zorko-2015 | Zorko M et al. The waist width of skis influences the kinematics of the knee joint in alpine skiing. J Sports Sci Med. 2015;14:606-19. | https://pmc.ncbi.nlm.nih.gov/articles/PMC4541126/ | full: outside-knee flexion, abduction, IR and modelled GRF per phase |
| debertin-2026 | Debertin D et al. A framework for measuring alpine skiing technique. J Sports Sci. 2026;44:1976-91. | https://pubmed.ncbi.nlm.nih.gov/42493866/ | abstract |
| zorko-2020 | Zorko M et al. Wide skis as a potential knee injury risk factor in alpine skiing. Front Sports Act Living. 2020;2:7. | https://pmc.ncbi.nlm.nih.gov/articles/PMC7739600/ | full: simulated edged stance, BF and ST %MVC, knee abduction |
| panizzolo-2013 | Panizzolo FA, Marcolin G, Petrone N. Comparative evaluation of two skiing simulators as functional training devices for recreational skiers. J Sports Sci Med. 2013;12:151-8. | https://pmc.ncbi.nlm.nih.gov/articles/PMC3761755/ | full: on-snow slalom VM and RF %MVC, knee ROM, GRF timing |
| debertin-2022 | Debertin D et al. Quantitative downhill skiing technique analysis according to ski instruction curricula. Front Bioeng Biotechnol. 2022;10:1003619. | https://pmc.ncbi.nlm.nih.gov/articles/PMC9552888/ | full: principal movements; carving vs parallel lean, crouch, upper-body rotation |
| thorwartl-2023 | Thorwartl C et al. Technique-dependent relationship between local ski bending curvature, roll angle and radial force in alpine skiing. Sensors. 2023;23:3997. | https://pmc.ncbi.nlm.nih.gov/articles/PMC10141132/ | full: roll angles and radial force per ski and phase (n=1) |
| klous-2014 | Klous M, Müller E, Schwameder H. Three-dimensional lower extremity joint loading in a carved ski and snowboard turn: a pilot study. Comput Math Methods Med. 2014;2014:340272. | https://pmc.ncbi.nlm.nih.gov/articles/PMC4181787/ | full: outside-leg ankle and knee forces and moments by phase (n=3, one trial reported) |
| bon-2021 | Bon I et al. What are kinematic and kinetic differences between short and parallel turn in alpine skiing? Int J Environ Res Public Health. 2021;18. | https://pmc.ncbi.nlm.nih.gov/articles/PMC8000885/ | full: inside and outside foot force and knee angle at turn end |
| nakazato-2011 | Nakazato K, Scheiber P, Müller E. A comparison of ground reaction forces determined by portable force-plate and pressure-insole systems in alpine skiing. J Sports Sci Med. 2011;10:754-62. | https://pmc.ncbi.nlm.nih.gov/articles/PMC3761512/ | full: outside, inside and edge-change GRF, experts vs intermediates |
| reid-2020 | Reid RC et al. Alpine ski motion characteristics in slalom. Front Sports Act Living. 2020;2:25. | https://pmc.ncbi.nlm.nih.gov/articles/PMC7739813/ | full: edge and attack angle progression through the turn |
| kekesi-2026 | Kékesi M et al. Physical and ski technical factors associated with ACL injury susceptibility in elite and recreational alpine skiers. J Funct Morphol Kinesiol. 2026;11. | https://pmc.ncbi.nlm.nih.gov/articles/PMC12921723/ | full: insole fore-aft, symmetry and edge-similarity scores |
| kurpiers-2024 | Kurpiers N et al. The influence of two teaching approaches on foot loading in skiing beginners. Sensors. 2024;24. | https://pmc.ncbi.nlm.nih.gov/articles/PMC11644853/ | full: rearfoot-to-forefoot load ratio over five days |
| demsar-2015 | Demšar I et al. Multi-axis prosthetic knee resembles alpine skiing movements of an intact leg. J Sports Sci Med. 2015;14:841-8. | https://pmc.ncbi.nlm.nih.gov/articles/PMC4657428/ | full: boot, ankle and knee range in loaded squats in boots |
| matsumura-2021 | Matsumura S et al. Comfortable and convenient turning skill assessment for alpine skiers using IMU and plantar pressure distribution sensors. Sensors. 2021;21. | https://pmc.ncbi.nlm.nih.gov/articles/PMC7865744/ | full: heel-load ratio, expert vs intermediates |
| sporri-2012 | Spörri J et al. Course setting and selected biomechanical variables related to injury risk in alpine ski racing: an explorative case study. Br J Sports Med. 2012;46:1072-7. | https://pmc.ncbi.nlm.nih.gov/articles/PMC3505866/ | full: lean angle, centripetal force, fore-aft by phase |
| sporri-2016 | Spörri J et al. Course setting as a prevention measure for overuse injuries of the back in alpine ski racing. Orthop J Sports Med. 2016;4:2325967116630719. | https://pmc.ncbi.nlm.nih.gov/articles/PMC4772347/ | full: trunk frontal and lateral bending and torsion, GS vs SL; frontal bending averages 27 deg (GS) and 11 deg (SL) in the peak-load phase (Table 3), which sets the regular turns' spine flexion |
| sporri-2018 | Spörri J et al. Standing height as a prevention measure for overuse injuries of the back in alpine ski racing. Orthop J Sports Med. 2018;6:2325967117747843. | https://pmc.ncbi.nlm.nih.gov/articles/PMC5761919/ | full: trunk angles and GRF, 50 vs 40 mm stand height |
| sporri-2016-sidecut | Spörri J et al. Sidecut radius and the mechanics of turning. Br J Sports Med. 2016;50:14-9. | https://pubmed.ncbi.nlm.nih.gov/26702014/ | abstract (full text searched only for phase definitions) |
| delhaye-2020 | Delhaye C et al. Influence of line strategy between two turns on performance in giant slalom. Front Sports Act Living. 2020;2:589257. | https://pmc.ncbi.nlm.nih.gov/articles/PMC7739777/ | full: Z vs S line, straight-line share, energy dissipation |
| supej-2010 | Supej M, Holmberg HC. How gate setup and turn radii influence energy dissipation in slalom ski racing. J Appl Biomech. 2010;26:454-64. | https://pubmed.ncbi.nlm.nih.gov/21245505/ | abstract |
| supej-2015 | Supej M, Hébert-Losier K, Holmberg HC. Impact of the steepness of the slope on the biomechanics of World Cup slalom skiers. Int J Sports Physiol Perform. 2015;10:361-8. | https://pubmed.ncbi.nlm.nih.gov/25229249/ | abstract |
| schaff-1990a | Schaff P, Hauser W. Ski boots versus the knee joint 2: what produces the forward leaning position of the ski boot? (German). Sportverletz Sportschaden. 1990;4:1-13. | https://pubmed.ncbi.nlm.nih.gov/2193420/ | abstract |
| schaff-1990b | Schaff P, Hauser W. Ski shoe versus knee joint 3: risk for falling backward (German). Sportverletz Sportschaden. 1990;4:151-62. | https://pubmed.ncbi.nlm.nih.gov/2087673/ | abstract |
| eberle-2017 | Eberle R et al. Effect of ski boot rear stiffness on maximal ACL force during injury prone landing movements in alpine ski racing. J Sports Sci. 2017;35:1125-33. | https://pubmed.ncbi.nlm.nih.gov/27458775/ | abstract |
| bohm-2008 | Böhm H, Senner V. Effect of ski boot settings on tibio-femoral abduction and rotation during standing and simulated skiing. J Biomech. 2008;41:498-505. | https://pubmed.ncbi.nlm.nih.gov/18061599/ | abstract |
| noe-2020 | Noé F et al. The influence of wearing ski-boots with different rigidity characteristics on postural control. Sports Biomech. 2020;19:157-67. | https://pubmed.ncbi.nlm.nih.gov/29781789/ | abstract |
| immler-2019 | Immler L et al. Individual flexion stiffness of ski boots. J Sci Med Sport. 2019;22 Suppl 1:S55-9. | https://pubmed.ncbi.nlm.nih.gov/30765315/ | abstract |
| petrone-2013 | Petrone N, Marcolin G, Panizzolo FA. The effect of boot stiffness on field and laboratory flexural behavior of alpine ski boots. Sports Engineering. 2013. | https://research.unipd.it/handle/11577/2840072 | abstract (repository page) |
| posch-2025 | Posch M et al. Impact of an elevated rear component of the ski binding on joint angles of the lower extremity and the center of mass in recreational skiers. J Hum Kinet. 2025;98:29-40. | https://pmc.ncbi.nlm.nih.gov/articles/PMC12360943/ | full: heel heights, knee and ankle angles, CoM shift (Table 1 not in the extracted text; prose values used) |
| ruedl-2022 | Ruedl G et al. A comparison of ACL injury risk, ski geometry and standing height parameters between skiers with rented and with owned skis. Int J Environ Res Public Health. 2022;19:11124. | https://pmc.ncbi.nlm.nih.gov/articles/PMC9518475/ | full: front and rear stand heights, ski geometry |

### 4.2 Hip and trunk kinesiology, exercise EMG (non-ski)

| id | Citation | URL | read |
|---|---|---|---|
| neumann-2010 | Neumann DA. Kinesiology of the hip: a focus on muscular actions. J Orthop Sports Phys Ther. 2010;40:82-94. | https://pubmed.ncbi.nlm.nih.gov/20118525/ | abstract |
| delp-1999 | Delp SL et al. Variation of rotation moment arms with hip flexion. J Biomech. 1999;32:493-501. | https://pubmed.ncbi.nlm.nih.gov/10327003/ | abstract |
| dostal-1986 | Dostal WF, Soderberg GL, Andrews JG. Actions of hip muscles. Phys Ther. 1986;66:351-61. | https://pubmed.ncbi.nlm.nih.gov/3952148/ | abstract |
| andersson-1997 | Andersson EA, Nilsson J, Thorstensson A. Intramuscular EMG from the hip flexor muscles during human locomotion. Acta Physiol Scand. 1997;161:361-70. | https://pubmed.ncbi.nlm.nih.gov/9401589/ | abstract |
| andersson-1996 | Andersson EA et al. EMG activities of the quadratus lumborum and erector spinae muscles during flexion-relaxation and other motor tasks. Clin Biomech. 1996;11:392-400. | https://pubmed.ncbi.nlm.nih.gov/11415651/ | abstract |
| mcgill-1996 | McGill S, Juker D, Kropf P. Appropriately placed surface EMG electrodes reflect deep muscle activity (psoas, quadratus lumborum, abdominal wall) in the lumbar spine. J Biomech. 1996;29:1503-7. | https://pubmed.ncbi.nlm.nih.gov/8894932/ | abstract |
| jiroumaru-2014 | Jiroumaru T, Kurihara T, Isaka T. Measurement of muscle length-related EMG activity of the hip flexor muscles. SpringerPlus. 2014;3:624. | https://pmc.ncbi.nlm.nih.gov/articles/PMC4221557/ | full: EMG RMS of iliopsoas, RF, SA, TFL vs hip angle (normalised to 0°, not %MVIC) |
| juan-2024 | Juan J et al. Hip flexor muscle activation during common rehabilitation and strength exercises. J Clin Med. 2024;13:6617. | https://pmc.ncbi.nlm.nih.gov/articles/PMC11546833/ | full: iliacus and psoas %MVIC per exercise; review conclusions |
| distefano-2009 | Distefano LJ et al. Gluteal muscle activation during common therapeutic exercises. J Orthop Sports Phys Ther. 2009;39:532-40. | https://pubmed.ncbi.nlm.nih.gov/19574661/ | abstract |
| ganderton-2017 | Ganderton C et al. Gluteus minimus and gluteus medius muscle activity during common rehabilitation exercises in healthy postmenopausal women. J Orthop Sports Phys Ther. 2017;47:914-22. | https://pubmed.ncbi.nlm.nih.gov/29034801/ | abstract |
| moore-2020 | Moore D, Semciw AI, Pizzari T. A systematic review and meta-analysis of common therapeutic exercises that generate highest muscle activity in the gluteus medius and gluteus minimus segments. Int J Sports Phys Ther. 2020;15:856-81. | https://pmc.ncbi.nlm.nih.gov/articles/PMC7727410/ | full: segmental GMed and GMin %MVIC per exercise |
| selkowitz-2024 | Selkowitz DM, Beneck GJ, Powers CM. Comparison of EMG activity of the gluteal muscles and tensor fascia lata in persons with patellofemoral pain. Physiother Theory Pract. 2024;40:1775-83. | https://pubmed.ncbi.nlm.nih.gov/37212292/ | abstract |
| collings-2023 | Collings TJ et al. Gluteal muscle forces during hip-focused injury prevention and rehabilitation exercises. Med Sci Sports Exerc. 2023;55:650-60. | https://pubmed.ncbi.nlm.nih.gov/36918403/ | abstract |
| monteiro-2017 | Monteiro RL et al. Hip rotations' influence of electromyographic activity of gluteus medius muscle during pelvic-drop exercise. J Sport Rehabil. 2017;26:65-71. | https://pubmed.ncbi.nlm.nih.gov/27632837/ | abstract |
| uebayashi-2026 | Uebayashi K et al. Muscle activity of deep hip muscles across joint positions and elevation phases during side-lying hip abduction. PeerJ. 2026;14:e21536. | https://pmc.ncbi.nlm.nih.gov/articles/PMC13353230/ | full: GMin, GMed, piriformis, TFL %MVIC by hip position |
| fujii-2007 | Fujii R et al. Kinematics of the lumbar spine in trunk rotation: in vivo 3D analysis using MRI. Eur Spine J. 2007;16:1867-74. | https://pmc.ncbi.nlm.nih.gov/articles/PMC2223353/ | full: segmental axial rotation and coupled motion |
| fujimori-2012 | Fujimori T et al. Kinematics of the thoracic spine in trunk rotation: in vivo 3-dimensional analysis. Spine. 2012;37:E1318-28. | https://pubmed.ncbi.nlm.nih.gov/22772578/ | abstract |
| fujimori-2014 | Fujimori T et al. Kinematics of the thoracic spine in trunk lateral bending: in vivo three-dimensional analysis. Spine J. 2014;14:1991-9. | https://pubmed.ncbi.nlm.nih.gov/24333460/ | abstract |
| macrum-2012 | Macrum E et al. Effect of limiting ankle-dorsiflexion range of motion on lower extremity kinematics and muscle-activation patterns during a squat. J Sport Rehabil. 2012;21:144-50. | https://pubmed.ncbi.nlm.nih.gov/22100617/ | abstract |
| conradsson-2010 | Conradsson D et al. Ankle-joint mobility and standing squat posture in elite junior cross-country skiers. J Sports Med Phys Fitness. 2010;50:132-8. | https://pubmed.ncbi.nlm.nih.gov/20585291/ | abstract |
| mcbride-2026 | McBride S et al. International normative values for the weight-bearing lunge test across age and sex in 899 healthy adults. Musculoskelet Sci Pract. 2026;82:103525. | https://pubmed.ncbi.nlm.nih.gov/41723909/ | abstract |

### 4.3 Instructional and association sources

| id | Source | URL | read |
|---|---|---|---|
| lemaster-2010-alignment | LeMaster R. *Ultimate Skiing* (Human Kinetics, 2010), publisher excerpt "Balance and alignment tips on skis". Only this excerpt was read, not the book. | https://us.humankinetics.com/blogs/excerpt/balance-and-alignment-tips-on-skis | excerpt (full excerpt page) |
| lemaster-2010-balance | Same book, publisher excerpt "Maintaining balance in skiing". | https://us.humankinetics.com/blogs/excerpt/maintaining-balance-in-skiing | excerpt |
| lemaster-2010-planes | Same book, publisher excerpt "The planes and axes in skiing". | https://us.humankinetics.com/blogs/excerpt/the-planes-and-axes-in-skiing | excerpt |
| kipp-2025 | Kipp R. "Mastering Long Leg/Short Leg Ski Technique", Ski Racing Media, from *The Young Skier's Guide* (photos by Ron LeMaster). Coaching text, not peer-reviewed; undated on the page. | https://skiracing.com/mastering-long-leg-short-leg-ski-technique/ | full |
| psia-c-stork-turns | PSIA-AASI Central, Stork Turns | https://psia-c.org/education/alpine/alpine-resources/stork-turns/ | full |
| psia-c-1000-steps | PSIA-AASI Central, 1000 Steps | https://psia-c.org/education/alpine/alpine-resources/1000-steps/ | full |
| psia-c-falling-leaf | PSIA-AASI Central, Falling Leaf | https://psia-c.org/education/alpine/alpine-resources/falling-leaf/ | full |
| psia-c-hockey-stops | PSIA-AASI Central, Hockey Stops | https://psia-c.org/education/alpine/alpine-resources/hockey-stops/ | full |
| psia-c-railroad-tracks | PSIA-AASI Central, Railroad Track Turns | https://psia-c.org/education/alpine/alpine-resources/railroad-tracks/ | full |
| psia-c-beginning-railroad-tracks | PSIA-AASI Central, Beginning Railroad Tracks | https://psia-c.org/education/alpine/alpine-resources/beginning-railroad-tracks/ | full |
| psia-c-one-footed-railroad-track | PSIA-AASI Central, One-Footed Railroad Track | https://psia-c.org/education/alpine/alpine-resources/one-footed-railroad-track/ | full |
| psia-c-crab-wedge | PSIA-AASI Central, Crab Wedge Turn | https://psia-c.org/education/alpine/alpine-resources/crab-wedge-turn/ | full |
| psia-c-diagonal-side-slip | PSIA-AASI Central, Diagonal Side Slip | https://psia-c.org/education/alpine/alpine-resources/diagonal-side-slip/ | full |
| psia-c-sideslip-fall-line | PSIA-AASI Central, Integrated Sideslip in the Fall Line | https://psia-c.org/education/alpine/alpine-resources/sideslip-fall-line/ | full |
| psia-c-linked-sideslips | PSIA-AASI Central, Linked Sideslips | https://psia-c.org/education/alpine/alpine-resources/linked-sideslips/ | full |
| psia-c-skating-down-the-hill | PSIA-AASI Central, Skating – Down the Hill | https://psia-c.org/education/alpine/alpine-resources/skating-down-the-hill/ | full |
| psia-c-basic-garlands | PSIA-AASI Central, Basic Garlands | https://psia-c.org/education/alpine/alpine-resources/basic-garlands/ | full |
| psia-c-basic-parallel-garlands | PSIA-AASI Central, Basic Parallel Garlands | https://psia-c.org/education/alpine/alpine-resources/basic-parallel-garlands/ | full |
| psia-c-l3-railroad-track-garlands | PSIA-AASI Central, L3 Railroad Track Garlands | https://psia-c.org/education/alpine/alpine-resources/l3-railroad-track-garlands/ | full |
| psia-c-basic-parallel-leaper | PSIA-AASI Central, Basic Parallel Leaper Turns | https://psia-c.org/education/alpine/alpine-resources/basic-parallel-leaper-turns/ | full |
| psia-c-dynamic-leapers | PSIA-AASI Central, Dynamic Leapers | https://psia-c.org/education/alpine/alpine-resources/dynamic-leapers/ | full |
| psia-c-basic-short-turns | PSIA-AASI Central, Basic Short Turns | https://psia-c.org/education/alpine/alpine-resources/basic-short-turns/ | full |
| psia-c-performance-short-turns | PSIA-AASI Central, Performance Short Turns | https://psia-c.org/education/alpine/alpine-resources/performance-short-turns/ | full |
| psia-c-medium-radius-carved | PSIA-AASI Central, Medium Radius Carved Turns | https://psia-c.org/education/alpine/alpine-resources/medium-radius-carved-turns/ | full |
| psia-c-intro-one-ski | PSIA-AASI Central, Introduction to One-Ski Activities | https://psia-c.org/education/alpine/alpine-resources/skill-building-tasks/intro-to-one-ski-activities/ | full |
| psia-c-intermediate-one-ski | PSIA-AASI Central, Intermediate One-Ski Activities | https://psia-c.org/education/alpine/alpine-resources/intermediate-one-ski-activities/ | full |
| psia-c-advanced-one-ski | PSIA-AASI Central, Advanced One-Ski Activities | https://psia-c.org/education/alpine/alpine-resources/advanced-one-ski-activities/ | full |
| psia-c-step-turn-fall-line | PSIA-AASI Central, Step Turn into Fall Line | https://psia-c.org/education/alpine/alpine-resources/step-turn-fall-line/ | full |
| skiracing-2015-flex | Feehan CJ. "Backshop: Flex of Gold", Ski Racing Media (boot-fitter interview; coaching media, not peer-reviewed). | https://skiracing.com/backshop-flex-of-gold/ | full (page) |
| psia-c-increasing-arc-railroad-tracks | PSIA-AASI Central, Increasing Arc Railroad Tracks, Medium Radius | https://psia-c.org/education/alpine/alpine-resources/increasing-arc-railroad-tracks-medium-radius/ | full |

### 4.4 Looked for and not used

- *The Skier's Edge* (LeMaster, 1998/99): no legitimate preview was found. Not cited.
- *Ultimate Skiing* (LeMaster, 2010): the user has since supplied the book. Another agent is writing
  page-cited notes, which were not yet available. Until then only the three publisher excerpts above are
  cited; book-level points are pending book notes.
- *The Science of Alpine Ski Racing* (Pritchard and Taylor, eds., Routledge 2023) and the IASI manual,
  chapter 3: being read by other agents into notes; pending book notes. Not cited.
- NZSIA interactive manual (learning.nzsia.org): returns HTTP 403 to non-browser clients. A search snippet
  described javelin and stork exercises, but the pages were not read, so they are not cited.
- CSIA and BASI manuals: no publicly readable copy found.
- No systematic review of EMG in alpine skiing was found. The narrative reviews located (muller-2003,
  hebert-losier-2014, turnbull-2009, ferguson-2010) were read as abstracts and add nothing
  muscle-specific beyond the primary studies, so they are not used for activations.
- chollet-2025 recorded a muscle abbreviated "GM" alongside VM, VL, RF, BF and SMST. The abstract does not
  expand it. The publisher page did not show the methods. Its position in the list suggests
  **gastrocnemius medialis**, not gluteus medius. It is used here only for hamstrings and quadriceps.

## 5. Gaps: claims to keep at low confidence

1. **Every hip-flexor activation on snow** (iliopsoas, TFL, sartorius) is inference. The only ski evidence
   is rectus femoris acting as a hip flexor on the inside leg (kroll-2010). No study has put EMG on
   iliopsoas in skiing, and surface EMG of iliopsoas is itself contested (jiroumaru-2014 had to validate a
   placement).
2. **Quadratus lumborum and lateral oblique roles** in angulation and pelvic hike are mechanics plus
   off-snow EMG. Trunk muscles measured on snow (rectus abdominis, external oblique, erector spinae) were
   recorded on one side only, without separating inside from outside (hintermeister-1997).
3. **Gluteus minimus and TFL** were never measured in skiing. The model studies lump or omit them.
4. **Outside-hip internal rotation**: whether it is driven (concentric) or held and braked (eccentric
   external rotators) depends on carved versus skidded turns. This rests on one EMG-validated single-skier
   model for carving (heinrich-2023) and on cadaver moment arms (delp-1999).
5. **Ankle muscles inside the boot** (peroneals, tibialis posterior, tipping): the boot changes what EMG
   would mean. Only peroneus longus has been recorded on snow (louie-1984), and it tracked posture rather
   than torsion.
6. **No drill-specific EMG** except wedge (hintermeister-1997, hermann-2023) and the two transition styles
   (seifert-2023). Every other drill's numbers are extrapolated from normal turns plus mechanics.
7. **Effort numbers on the inside leg of lifted-ski drills** (D1, D2, D3) are scaled by reasoning about
   suspended segment weight times the turn's load factor. No force or EMG data exist.
8. **Arms, shoulders and pole plants**: no data. All low.
9. **Sample sizes**: most on-snow EMG studies have 5 to 7 skiers. The models track one skier.
   Hintermeister used right-side electrodes only.
10. **Sex and skill differences** (cuniberti-2026, hermann-2023) are real but not modelled per drill.
11. **The 0.4 BW inside-foot load** that stork turns remove comes from GS racers (falda-buscaiot-2017).
    Recreational large turns may carry more on the inside ski, which would make the outside-leg increase
    in D1 larger.
12. **No open-access EMG by turn phase in %MVC.** The phase-resolved EMG studies with inside and
    outside legs (cuniberti-2026, chollet-2025) are abstract-only. The full-text EMG studies give mV
    (seifert-2023), whole-run %MVC (hermann-2023, panizzolo-2013) or figure-only curves (ishige-2021).
13. **Inside-leg joint angles** come from one tracked turn by one instructor (heinrich-2022). No study
    gives inside-leg angles by phase for recreational skiers.
14. **Trunk angles** come only from racers (sporri-2016, sporri-2018) and from whole-body principal
    movements without angles (debertin-2022). Recreational trunk posture is unmeasured.
15. **The hip frontal moment's direction** differs between the two model studies (F4). The outside-hip
    abductor role in a two-footed turn is therefore medium, not high. In one-ski drills it rests on
    mechanics.
16. **Books pending.** LeMaster's *Ultimate Skiing* (supplied by the user), Pritchard and Taylor's *The
    Science of Alpine Ski Racing*, and the IASI manual chapter 3 are being read by other agents into
    notes. No claim here cites those books. The LeMaster points that are cited come only from the three
    publisher excerpts in 4.3. Any LeMaster-book point, in particular his treatment of tipping (F10.4),
    is **pending book notes**.

## 6. Corrections to the current Stork Turns content

Against `content/movements/outside-ski-turn.yaml` and `content/drills/stork-turns.yaml` as of 2026-10-15:

1. **The inside hip and pelvis group is missing.**
   - Add the outside **gluteus minimus** (split from gluteus-medius) and outside **TFL**, with the role
     "hold the unsupported inside half of the pelvis up (pelvis-on-femur)".
   - Add the inside **quadratus lumborum** and the inside lateral role of the **obliques**: they lengthen and
     control the outward bend, they do not hike the pelvis (today obliques are `both` with only an
     anti-rotation role).
   - Give the outside gluteus medius the same explicit pelvis-on-femur role, with eccentric added for
     when the pelvis yields.
2. **The inside leg is under-modelled.** Today there is only `hip-flexors` (low, no sources) and inside
   `hamstrings` (low, no sources). Replace with:
   - **iliopsoas**: medium; jiroumaru-2014, juan-2024, andersson-1997.
   - **rectus femoris as a hip flexor**, written under quadriceps or a future rectus-femoris entry:
     medium; kroll-2010, cuniberti-2026.
   - **TFL** and **sartorius**: low.
   - **hamstrings**: medium, because inside-leg hamstring EMG exists in normal turns; contraction
     concentric → isometric → eccentric.
   - **adductors**, **deep hip rotators** (external rotation keeping the ski parallel), **gastrocnemius**
     as a knee flexor, and **tibialis anterior and posterior** (tipping the lifted ski): low.
   - Effort pattern: lift at mid-initiation, hold through shaping, lower at mid-finish, per the
     association task.
3. **The outside deep-hip-rotators entry has the wrong direction.** It says "turn the femur under a still
   pelvis" with a concentric contraction. The deep rotators are external rotators; at skiing hip flexion
   several shift toward internal rotation (delp-1999). The outside femur internally rotates. In carving
   the model shows external rotators *braking* that rotation (heinrich-2023). Change to eccentric and
   isometric, role "brake and hold femoral internal rotation". Credit concentric internal rotation, in
   skidded steering, to the anterior gluteus medius and minimus, TFL and adductors.
4. **The outside gluteus medius source is questionable.** chollet-2025's "GM" is most likely gastrocnemius
   medialis (see 4.4). Replace with seifert-2023 (gluteus medius measured on both legs on snow) and
   louie-1984.
5. **Outside load is understated.** With the inside ski unloaded, the outside leg takes the inside foot's
   share (about 0.4 BW in GS: falda-buscaiot-2017). Raise outside quadriceps and gluteus maximus in shaping
   from 2 to 3, and gluteus medius and minimus in shaping and finish to 3.
6. **Joint actions are too coarse.** Today they list four rows. Use the per-phase, per-side table in D1,
   especially:
   - inside hip flexion + adduction + external rotation;
   - inside knee flexion;
   - the inside ankle tipping toward the little-toe edge with the tip touching the snow;
   - outside hip flexion + abduction (pelvis-on-femur) + internal rotation;
   - pelvis inside half held up and countered;
   - trunk tilted toward the outside ski;
   - the pole touch before the lift.
7. **The confidence ceiling is right.** No activation in D1 should be `high`: no study measured this drill.
   The `basis` text should say "inferred from normal turns" or "mechanics" each time.
8. **Add rectus abdominis** (both, low effort, medium confidence: measured in normal turns,
   hintermeister-1997). Consider deltoid for the arms (low).
9. **Add active ankle dorsiflexion on both legs** (F12). Today the movement has no ankle rows.
   - Outside: tibialis anterior and the toe extensors concentric at initiation, isometric through
     shaping, with soleus eccentric.
   - Inside (lifted): tibialis anterior isometric, holding the shin forward with the tip down.
10. **Split the groups** as in 3.1:
    - inside-leg effort goes to `rectus-femoris`, not `vasti`;
    - inside knee flexion goes to `biceps-femoris` (short head), `medial-hamstrings`, `gracilis`,
      `sartorius` and `gastrocnemius`;
    - outside ankle work goes to `soleus` rather than `gastrocnemius`;
    - obliques are written per side, with the inside internal and external obliques holding the inside
      half of the pelvis.
11. **Hip frontal moment caveat.** In a normal two-footed carved turn, the outside hip's frontal moment
    changes sign (heinrich-2022 against heinrich-2023). In stork turns the unsupported inside half of
    the pelvis makes the outside abductor role a mechanical certainty. Keep confidence at medium, citing
    the off-snow single-leg evidence (moore-2020: the hip hitch ranks top for gluteus medius and
    minimus).
