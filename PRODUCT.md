# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

- **Primary:** ski instructors studying for certification with any professional association (PSIA, CSIA, BASI, NZSIA and others), all on equal footing; none is the default. They need to know which muscles and joints a drill works, in which phase of the turn, and how sure the evidence is.
- **Also served:** trainers and clinic leaders who show a drill to a group; coaches who assign off-snow work to athletes; recreational skiers preparing for a season; physios and S&C coaches who review or extend the exercise content.
- **Scene:** used equally at a desk while studying (laptop or tablet) and on the hill between runs (a phone, often with gloves, in glare and cold).

## Product Purpose

skibuddy shows a drill on a 3D figure, highlights the muscles at work through initiation, shaping and finish, and recommends gym exercises that train the same muscles in the same way (side, contraction type). It succeeds when a candidate can explain a drill's demands in exam terms, and when an exercise recommendation can be traced back to the muscle and the evidence behind it.

## Positioning

- Every activation carries a confidence (measured, inferred or expert opinion), a plain-words basis and its sources. The product never presents inference as measurement.
- The core is association-neutral: biomechanics are the same for everyone, and efficient skiing converges across associations. Drills have generic names; each association's task name, level and fundamentals are a mapping onto a drill. It is not one association's manual.
- Open: MIT code and CC BY-SA 4.0 content, built for outside review and contribution.

## Operating Context

- Drills are described in our own words; association task pages (e.g. PSIA-C alpine tasks) are linked as mappings, never the source of the drill's identity.
- The turn phases are initiation, shaping and finish. Sides are outside and inside ski.
- Content lives as YAML in `content/` and is validated at build time.

## Capabilities and Constraints

- Installable browser app (PWA) on Three.js WebGPU (with a WebGL2 fallback), Solid, Effect and strict TypeScript.
- Association text is linked or paraphrased in our own words, never copied (© PSIA-AASI Central and others).
- No video capture; the maintainer has limited disk. Large 3D assets stay out of the repo.
- Asset licences must allow open redistribution. Non-commercial or research-only datasets (AMASS, SMPL, EPFL Ski-Pose) are excluded.
- Open: whether exercises show sets and reps or general ranges for a coach to set; which association mappings to add next; anatomical mesh source (Z-Anatomy per-mesh licence audit pending).

## Brand Commitments

- Name: skibuddy.
- Not medical advice, and not affiliated with or endorsed by any association; the UI says so.
- Themes follow the system setting. Light and dark are equally polished, and light must stay readable in direct sunlight on snow.

## Evidence on Hand

- `content/sources.yaml`: 10 peer-reviewed sources verified on PubMed, most read as abstract only (marked `read: abstract`).
- No EMG study of stork or one-legged drills exists; those activations are inferred and must stay marked so.
- `reviewedBy` is empty on all content: no instructor, examiner or physio has reviewed it yet. Never imply review or endorsement.
- No testimonials, users or partner associations exist.

## Product Principles

1. Show the evidence level with every claim; uncertainty is content, not noise.
2. Stay association-neutral at the core; use each association's own vocabulary only in its mapping.
3. Every gym exercise traces back to a muscle and a drill.
4. Work at a desk and in the cold: the essentials must be readable at a glance on a phone.
5. Open by default: content a reviewer can check, correct and extend.

## Accessibility & Inclusion

- Muscle activation must not rely on hue alone; the scale must be colour-blind safe and also encoded in non-colour form (bars, labels).
- Phone use on the hill: large touch targets for gloves, high contrast in glare.
- Autoplay and motion respect reduced-motion settings.
