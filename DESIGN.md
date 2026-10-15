---
name: skibuddy
description: A drill read like the base-lodge morning board; muscles as slats, turn phases as enamel flip-tags, evidence stamped on every claim.
colors:
  frame: "#1E3A32"
  plate: "#1E3A32"
  plate-ink: "#F3F5F1"
  plate-ink-2: "#CFDCD5"
  slat: "#FFFFFF"
  slat-open: "#FFFFFF"
  well: "#EEF2EF"
  ground: "#F3F5F1"
  ink: "#12231E"
  ink-2: "#33493F"
  ink-3: "#4A5C54"
  rule: "#C2CDC7"
  field: "#1E3A32"
  snow: "#E4EBE7"
  snow-line: "#C3CFC9"
  tag-rim: "#12231E"
  focus: "#9E1F63"
  selection: "#F2B33D"
  pin-bg: "#FFFFFF"
  pin-ink: "#12231E"
  leader: "#F3F5F1"
  l1: "#F2B33D"
  l1-ink: "#1B140A"
  l2: "#E0602A"
  l2-ink: "#1A0C05"
  l3: "#9E1F63"
  l3-ink: "#FFFFFF"
  frame-dark: "#07110E"
  plate-dark: "#12241F"
  plate-ink-dark: "#F3F5F1"
  plate-ink-2-dark: "#C6D4CD"
  slat-dark: "#1E3A32"
  slat-open-dark: "#234339"
  well-dark: "#12241F"
  ground-dark: "#0D1915"
  ink-dark: "#F3F5F1"
  ink-2-dark: "#C6D4CD"
  ink-3-dark: "#A9BBB3"
  rule-dark: "#3D5F53"
  field-dark: "#142A23"
  snow-dark: "#1B352D"
  snow-line-dark: "#21403A"
  tag-rim-dark: "rgba(243, 245, 241, 0.7)"
  focus-dark: "#F2B33D"
  selection-dark: "#9E1F63"
  pin-bg-dark: "#E4EBE7"
  pin-ink-dark: "#12231E"
  leader-dark: "#F3F5F1"
  figure-muscle: "#B4483E"
  figure-bone: "#E8DCC2"
  figure-tendon: "#E6DCCB"
  figure-ski: "#2F4D7A"
typography:
  mark:
    fontFamily: "Archivo Variable, Archivo, system-ui, sans-serif"
    fontSize: "22px"
    fontWeight: 800
    letterSpacing: "-0.01em"
    fontVariation: "'wdth' 112"
  display:
    fontFamily: "Archivo Variable, Archivo, system-ui, sans-serif"
    fontSize: "clamp(28px, 2.6vw, 38px)"
    fontWeight: 900
    lineHeight: 1.02
    letterSpacing: "0.01em"
    fontVariation: "'wdth' 78"
  title:
    fontFamily: "Archivo Variable, Archivo, system-ui, sans-serif"
    fontSize: "26px"
    fontWeight: 900
    lineHeight: 1.02
    letterSpacing: "0.01em"
    fontVariation: "'wdth' 78"
  row:
    fontFamily: "Archivo Variable, Archivo, system-ui, sans-serif"
    fontSize: "16px"
    fontWeight: 800
    lineHeight: 1.2
    letterSpacing: "0.03em"
    fontVariation: "'wdth' 82"
  body:
    fontFamily: "Archivo Variable, Archivo, system-ui, sans-serif"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: 1.4
    fontFeature: "'tnum'"
  label:
    fontFamily: "Archivo Variable, Archivo, system-ui, sans-serif"
    fontSize: "13px"
    fontWeight: 700
    letterSpacing: "0.08em"
    fontVariation: "'wdth' 85"
  stamp:
    fontFamily: "Archivo Variable, Archivo, system-ui, sans-serif"
    fontSize: "16px"
    fontWeight: 800
    lineHeight: 1.1
    letterSpacing: "0.06em"
    fontVariation: "'wdth' 80"
  tag-numeral:
    fontFamily: "Archivo Variable, Archivo, system-ui, sans-serif"
    fontSize: "22px"
    fontWeight: 800
    lineHeight: 1
    fontVariation: "'wdth' 75"
  pin-name:
    fontFamily: "Archivo Variable, Archivo, system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 800
    lineHeight: 1.15
    letterSpacing: "0.04em"
    fontVariation: "'wdth' 80"
  note:
    fontFamily: "Archivo Variable, Archivo, system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 400
rounded:
  slat: "2px"
  control: "3px"
  frame: "4px"
  round: "50%"
spacing:
  slat-gap: "4px"
  xs: "6px"
  frame: "8px"
  sm: "10px"
  md: "12px"
  plate: "16px"
  lg: "20px"
  xl: "24px"
  section: "48px"
components:
  frame:
    backgroundColor: "{colors.frame}"
    rounded: "{rounded.frame}"
    padding: "8px"
  plate:
    backgroundColor: "{colors.plate}"
    textColor: "{colors.plate-ink}"
    rounded: "{rounded.slat}"
    padding: "14px 16px 16px"
  slat:
    backgroundColor: "{colors.slat}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.slat}"
    padding: "6px 10px"
    height: "58px"
  slat-open:
    backgroundColor: "{colors.slat-open}"
  tag-l0:
    textColor: "{colors.ink-3}"
    typography: "{typography.tag-numeral}"
    rounded: "{rounded.control}"
    width: "30px"
    height: "40px"
  tag-l1:
    backgroundColor: "{colors.l1}"
    textColor: "{colors.l1-ink}"
    rounded: "{rounded.control}"
    width: "30px"
    height: "40px"
  tag-l2:
    backgroundColor: "{colors.l2}"
    textColor: "{colors.l2-ink}"
    rounded: "{rounded.control}"
    width: "30px"
    height: "40px"
  tag-l3:
    backgroundColor: "{colors.l3}"
    textColor: "{colors.l3-ink}"
    rounded: "{rounded.control}"
    width: "30px"
    height: "40px"
  tag-now:
    width: "44px"
    height: "50px"
  tag-mini:
    width: "22px"
    height: "26px"
  stamp-measured:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.slat}"
    typography: "{typography.stamp}"
    rounded: "{rounded.slat}"
    padding: "3px 7px"
  stamp-inferred:
    textColor: "{colors.ink}"
    typography: "{typography.stamp}"
    rounded: "{rounded.slat}"
    padding: "3px 7px"
  stamp-opinion:
    textColor: "{colors.ink-2}"
    typography: "{typography.stamp}"
    rounded: "{rounded.slat}"
    padding: "3px 7px"
  source-key:
    textColor: "{colors.ink}"
    rounded: "{rounded.slat}"
    size: "28px"
  source-key-open:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.slat}"
  select-trigger:
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: "0 12px 0 14px"
    height: "44px"
  select-trigger-hover:
    backgroundColor: "{colors.well}"
  select-content:
    backgroundColor: "{colors.slat}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: "4px"
  select-item-highlighted:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.slat}"
    rounded: "{rounded.slat}"
    padding: "6px 10px"
    height: "44px"
  phase-stop:
    textColor: "{colors.ink-3}"
    height: "48px"
  phase-stop-checked:
    textColor: "{colors.ink}"
  phase-tab:
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    height: "52px"
  phase-tab-checked:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.ground}"
  switch-control:
    rounded: "{rounded.control}"
    width: "44px"
    height: "26px"
  switch-control-checked:
    backgroundColor: "{colors.ink}"
  play-button:
    textColor: "{colors.ink}"
    rounded: "{rounded.round}"
    size: "52px"
  play-button-hover:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.ground}"
  figure-pin:
    backgroundColor: "{colors.pin-bg}"
    textColor: "{colors.pin-ink}"
    typography: "{typography.pin-name}"
    rounded: "{rounded.control}"
    padding: "7px 9px 7px 7px"
  tooltip:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.ground}"
    rounded: "{rounded.control}"
    padding: "6px 10px"
  citation:
    backgroundColor: "{colors.well}"
    rounded: "{rounded.slat}"
    padding: "10px 12px"
---

# Design System: skibuddy

## Overview

**Creative North Star: "The Base-Lodge Board"**

A drill reads like the morning board at the base lodge: a spruce frame holding sign-white slats, one per muscle, each slat carrying three hanging enamel flip-tags for initiation, shaping and finish. Scrubbing the turn flips the current tag and re-ranks the slats in place, while the 3D figure beside the board glows where the work is and carries the muscle names pinned to it. The board is the instrument; the figure is the picture of it.

The world is crisp, enamelled and signwritten, not glossy, academic or gamified. Surfaces are flat colour with hard edges; there is no wood grain, no texture and no gradient chrome. Density is high but legible at arm's length on a phone in glare: one row size, big tags, glove-sized controls. Every activation shows its evidence level as a stamp, and uncertainty is shown at the same visual weight as certainty.

Light and dark are equal citizens and follow the system setting. In light, sign-white slats hang in a spruce frame on a pale snow ground; in dark, the frame goes near-black and the slats themselves turn spruce. The level colours and their hatches are identical in both.

**Key Characteristics:**
- Spruce frame, sign-white (or spruce) slats separated by the frame itself, not by lines.
- Enamel flip-tags: numeral, fill and hatch density all carry the level.
- Confidence stamps on every claim: solid, outlined, dashed.
- Archivo only; board rows at one size, ranked by weight, case and reversal.
- A 3D anatomical figure in a spruce field, with level glow and muscle-name pins on leader lines.

## Colors

A spruce-and-snow neutral world with one warm three-step level scale (amber, orange, magenta) that is the only saturated colour in the interface.

### Primary
- **Spruce** (#1E3A32 light frame, plate and figure field; #07110E dark frame; #1E3A32 dark slat): the board's frame, its header plates and the field behind the figure. Spruce is the room the whole product hangs in.
- **Sign Ink** (#12231E light / #F3F5F1 dark): text on slats, stamp borders, tag rims, the lift-line cable and towers, checked control fills.

### Level Scale
- **Amber, level 1** (#F2B33D, with ink #1B140A): light work.
- **Orange, level 2** (#E0602A, with ink #1A0C05): working. Also the lift-line's travelled range, the chair seat and the selected phase-stop underline, so the scrubber shares the board's palette.
- **Magenta, level 3** (#9E1F63, with white ink): hard work.
- **Level 0** has no fill: an outlined tag in Sign Ink 3 with a dashed foot.

The scale is the same in both themes and is shared, value for value, with the 3D figure's glow.

### Neutral
- **Snow Ground** (#F3F5F1 light / #0D1915 dark): page background, sticky phone tabs.
- **Sign White** (#FFFFFF light slat; #1E3A32 / #234339 dark slat and open slat): slat faces, select menus.
- **Well** (#EEF2EF light / #12241F dark): citation cards, failure detail, select hover.
- **Plate Ink 2** (#CFDCD5 light / #C6D4CD dark): secondary text on spruce plates: meta line, legend, column heads, association list.
- **Ink 2 / Ink 3** (#33493F, #4A5C54 light; #C6D4CD, #A9BBB3 dark): secondary text, control borders, the side word, notes and captions.
- **Rule** (#C2CDC7 light / #3D5F53 dark): the few 1px dividers (header bar, footer, opened slat detail).
- **Snow** (#E4EBE7 light / #1B352D dark): the figure's ground disc, read from the theme at runtime.
- **Focus** (magenta #9E1F63 in light, amber #F2B33D in dark) and **Selection** (amber in light, magenta in dark): the two swap so each stays visible against its theme.

### Named Rules
**The Three-Channel Level Rule.** A level is never carried by hue alone. Every tag prints its numeral, takes its fill, and carries a hatched foot band whose density rises with level: 1.5px diagonal strokes (135deg) at a 9px pitch for level 1, 5px for level 2, 3px for level 3, and a dashed empty foot for level 0. The band is 9px tall on a row tag, 11px on the current-phase tag and 6px on a mini tag.

**The One Warm Scale Rule.** Amber, orange and magenta mean load and nothing else. The only reuse is orange on the lift line, which shows where the turn has been. Focus and selection borrow them as rings and highlights, never as fills on content.

## Typography

**Display Font:** Archivo Variable (with Archivo, then system-ui as a load fallback only)
**Body Font:** Archivo Variable
**Label/Mono Font:** none; tabular figures come from Archivo's `tnum`, set on the body.

**Character:** One grotesque used across its width and weight axes (width 75 to 112, weight 400 to 900), condensed and heavy for signwriting, normal width for reading.

### Hierarchy
- **Mark** (800, 22px, width 112): the "skibuddy" wordmark in the bar; the only extended setting.
- **Display** (900, clamp(28px, 2.6vw, 38px), 1.02, uppercase, width 78): the drill name on the board's plate.
- **Title** (900, 26px, uppercase, width 78): the gym board's plate title and the failure title.
- **Row** (800, 16px, 1.2, uppercase, 0.03em, width 82): the muscle name on a slat and the exercise name on a gym slat.
- **Body** (400, 16px, 1.4, tabular figures): summaries, slat detail lines (max 62 to 66ch), the side word under a muscle name.
- **Label** (700, 13px, uppercase, 0.06 to 0.08em, width 85 to 88): the plate meta line, board column heads, the association list title. Switch labels use the same treatment at 14px.
- **Stamp** (800, 16px, uppercase, 0.06em, width 80; 14px on phone; 13px on a plate legend; 12px on a pin).
- **Tag numeral** (800, 22px row / 30px current phase / 15px mini, width 75).
- **Note** (400, 14px): captions, footer, citation notes, legend words.

### Named Rules
**The One-Row-Size Rule.** Everything on a board row is set at 16px. Rank comes from weight (400 side word against 800 muscle name), case (uppercase names, sentence-case detail) and reversal (the current phase head, a measured stamp and an opened slat's source keys print light on ink). Never rank a row by making text bigger or smaller.

**The One Family Rule.** Archivo is the only typeface. Hierarchy above the rows comes from its width axis (78 for display) and weight (900), never from a second family.

## Layout

**Desktop lodge.** A two-column grid at 54fr / 46fr with a 24px gap and 20px page padding (48px at the foot). The left column (the stage) is sticky at 20px from the top and holds the figure field, its caption, and the lift line. The figure field fills `max(420px, viewport height minus the bar, caption and lift line)`. The right column holds the drill board, then the gym board 24px below it. The header bar is at least 56px tall with 24px side padding.

**Single column at 960px and below.** The stage stops being sticky and the board follows the figure.

**Phone at 600px and below.** Page padding goes to zero, the figure field runs full-bleed at 45vh (minimum 300px) with square corners, and the order is: bar (wordmark and drill picker; the disclaimer moves to the footer only), figure with pins, caption, play button and lift line, the two switches spread full width, sticky phase tabs (Initiation, Shaping, Finish) pinned to the top on the snow ground, then the board. On the board the drill plate shows only the name and terrain; the slats come next so a slat reaches the first screen, and the summary plate with association names follows the slats. Then the legend, the review note, the gym board and the footer. The boards sit 8px in from the screen edge.

**The board grid.** The column heads and every slat share one grid: change mark (16px), name (min 15ch), three tag columns (46px each), evidence (92px), sources (96px), caret (14px), with a 6px column gap. Slats are at least 58px tall with 6px by 10px padding.

**Container-query stacking.** The frame is an inline-size container. Below 580px of board width (a container query, not a viewport query, so a narrow desktop column stacks too) the column heads are hidden and each slat becomes two rows: change mark and name on top, evidence stamp and source keys below, with the three tags spanning both rows on the right; the caret disappears. Stacked slats are at least 68px tall with 8px padding.

**Rhythm.** Slats sit 4px apart on the frame; the frame pads 8px (6px on phone); plates pad 14px by 16px (12px on phone). Most internal gaps fall on 6, 8, 10, 12 and 20px.

### Named Rules
**The Frame-Is-the-Divider Rule.** Slats are separated by 4px of spruce frame showing between them, never by rules or borders. 1px rules appear only at the edges of chrome (header bar, footer) and inside an opened slat or the association list.

## Elevation & Depth

The interface is flat enamel. Depth comes from the frame-and-slat layering (spruce behind white) and from reversal, not from shadows. Two shadows exist, and both are small and soft.

### Shadow Vocabulary
- **Tag hang** (`0 1px 2px rgba(10, 25, 20, 0.28)` light; `0 1px 2px rgba(0, 0, 0, 0.5)` dark): under every row and current-phase flip-tag, with a 1.5px inset rim, so the tag reads as a hanging enamel plate. Mini tags have none.
- **Pop** (`0 12px 32px -8px rgba(10, 25, 20, 0.35), 0 2px 6px rgba(10, 25, 20, 0.18)` light; same geometry at 0.7 and 0.5 black in dark): only for floating layers, the select menu and tooltips.

### Named Rules
**The Flat Enamel Rule.** Content surfaces (frame, plates, slats, pins, gym slats) carry no drop shadow. Hover on a slat is a 2px inset ring in Ink 3, not a lift.

## Shapes

Small, near-square corners throughout: 2px on slats, plates, stamps, source keys and citation cards; 3px on tags, controls, pins and tabs; 4px on the frame and the figure canvas (square on phone). The only round shape is the 52px play button (48px on phone); the switch thumb is a 2px-cornered square, not a pill.

Flip-tags have their own silhouette: a 30 by 40px enamel plate with a 4px hanging hole near the top, the numeral beneath it and the hatched foot band at the bottom. Borders are 1.5 to 2px solid ink, never hairline greys, except the dashed opinion stamp and the dashed foot of a level-0 tag.

## Components

### Flip-Tag (signature)
- **Shape:** 30 by 40px, 3px corners, hanging hole, 1.5px inset rim in tag rim colour plus the tag-hang shadow.
- **Levels:** 0 outlined with a dashed foot; 1 amber, 2 orange, 3 magenta, each with the hatch density in the Three-Channel Level Rule.
- **Sizes:** row (30 by 40), current phase (44 by 50, 30px numeral), mini (22 by 26, no hole, no shadow) for pins and the legend.
- **Behaviour:** the current phase's tag is the large one; when the phase changes it flips down from the top edge (see Motion). A visually hidden phase name precedes the numeral.

### Confidence Stamp (signature)
- **Measured:** solid ink fill, light text.
- **Inferred:** 2px ink outline, no fill.
- **Opinion:** 2px dashed outline in Ink 2, Ink 2 text.
- **Tones:** slat (default), plate (13px, Plate Ink 2 border; measured fills with Plate Ink 2), pin (12px, 1.5px Pin Ink border).
- The word (Measured, Inferred, Opinion) is always printed; the border style is a second channel, never the only one.

### Slat
- **Default:** Sign White face, 2px corners, row grid as in Layout. Leading change mark: filled up triangle (load rose since the previous phase), outlined down triangle (fell), short dash in Ink 3 (same). The change is also spoken in visually hidden text.
- **Hover:** 2px inset Ink 3 ring.
- **Open:** an Ark UI collapsible. The caret rotates 180deg, the source keys reverse to ink, and the detail opens below a 1px rule: uppercase 800 labels (Muscle, Role, Basis) with body text at 66ch, then citation cards on the Well colour with a reversed numbered key.
- **Source keys:** 28px squares, 1.5px Ink 2 border, numbered by first citation in the movement. "no source" in Ink 3 when empty.

### Plate and Column Heads
- **Plate:** spruce with plate ink. Holds the drill name, the terrain meta line, the summary and the association names list. The gym board uses the same plate with a Title.
- **Association names:** a list under a 1px Plate Ink 2 rule, each row a collapsible trigger (association abbreviation, task name, level, category) with a "Task page" external link; every association uses the identical row, in content order.
- **Column heads:** a second spruce strip; the current phase is reversed (plate ink fill, spruce text, 900 at width 75) inside its own column.
- **Legend:** under the slats, mini tags with rest / light / working / hard, then the three stamps with their meanings.

### Lift Line (scrubber)
- A 2px ink cable with four ink towers at the phase bounds (0, 1/3, 2/3, 1). The travelled range is a 4px orange line. The playhead is a chairlift chair (32 by 48px) with an orange seat; it shows a 3px focus ring when focused by keyboard. The cable is 52px tall to touch.
- **Play button:** 52px circle, 2px ink border, transparent; hover fills ink with ground-coloured icon. Named by a tooltip.

### Phase Stops and Phase Tabs (segmented, Ark UI radio group)
- **Stops** (desktop, under the lift line): uppercase label text in Ink 3; hover and checked go to ink, checked at 900 with a 3px orange underline.
- **Tabs** (phone, sticky): three equal 52px cells with 4px gaps, 1.5px Ink 2 border, 3px corners; checked fills ink with ground text at 900.

### Switch
- 44 by 26px control (52 by 32 on phone), 2px ink border, 3px corners, square ink thumb. Checked fills the control ink and turns the thumb ground-coloured, sliding right. Row is 44px tall (52px on phone), label in the uppercase label style. Used for "Names on figure" and "Skeleton".

### Select (drill picker)
- **Trigger:** 44px tall, 1.5px Ink 2 border, 3px corners, 700 weight, chevron that rotates when open. Hover and open: ink border on Well.
- **Menu:** Sign White, 1.5px Ink 2 border, pop shadow, 4px padding, min 240px. Items are 44px; the highlighted item reverses to ink.

### Tooltip
- Ink background with ground text, 14px at 600, 3px corners, pop shadow; opens after 400ms.

### Gym Board
- Same frame and plate. Each exercise is a slat-coloured card with 2px corners and 12 by 14px padding, split 1.15fr / 1fr (one column on phone): the name in the Row style with a bordered "One leg" mark, an on-snow line, Easier and Harder versions, then the muscles it trains with contraction type, a fit line and cautions with a triangle icon.

### Figure and Pins
- **Field:** the canvas sits on the spruce field colour with 4px corners. The scene draws a snow ground disc (solid to 1.6m, fading out by 6.5m) and a soft contact shadow, lit by a hemisphere light, a sun and a cool back rim light.
- **Figure:** the Z-Anatomy model. Bone is ivory (figure-bone), cartilage pale blue-grey, muscle a natural fibred red (figure-muscle) with fine fibre striping that fades before it aliases, tendons pale (figure-tendon), skis navy (figure-ski).
- **Level on the figure:** working muscles mix toward the board's level colour, and both an emissive glow and a fresnel rim grow with level (the rim widens and brightens as the level rises), so the figure reads load by brightness and halo width as well as hue. Only emissive light blooms. "Skeleton" fades resting muscles to a dark translucent ghost while working muscles stay partly visible.
- **Pins:** muscle-name labels in two columns either side of the figure, stacked without overlap and kept near their anchors; the highest-load muscles win when space runs out (up to 7 on desktop, 4 on phone). Each pin is a sign-white slat with a white margin inside a 1.5px ink rule (no soft shadow): a mini tag, the muscle name (2 lines max, uppercase 800), a pin-tone stamp and "inside" when it is the inside leg. A leader line (1.5px light stroke over a 3.5px field-coloured underlay) runs to a 4px dot on the muscle. Pins are a visual copy of the board and are hidden from assistive tech; they move by translate, never by remounting.

### Named Rules
**The Same Board Everywhere Rule.** A pin, a slat and the legend use the same tag, the same stamp and the same words. Never invent a separate level or confidence notation for the figure.

**The Neutral Mapping Rule.** Associations appear only as mapping rows in the plate, all styled the same. No association's name, colour or vocabulary is used as the default label for a drill, a phase or a level.

### Motion
One easing for everything: `cubic-bezier(0.16, 1, 0.3, 1)`, an assertive ease-out.
- Current-phase tag flip: 420ms, from `perspective(240px) rotateX(-80deg)` with brightness 0.7, pivoting at its top edge.
- Slat re-rank: rows slide from their old position to the new one (FLIP) over 480ms.
- Slat and association detail: open 260ms, close 200ms, height only.
- Caret and select chevron rotation: 200ms. Colour changes on controls: 160ms. Switch thumb: 200ms. Pin repositioning: 320ms translate.
- Skeleton fade on the figure: 350ms.
- The turn autoplays on load.

**The Still Board Rule.** Under `prefers-reduced-motion: reduce` the turn starts paused and stops if the setting turns on, the slat re-rank jumps instead of sliding, the tag flip, detail height, rotations and transitions are dropped, and the skeleton fade is instant. All CSS motion is written inside a no-preference query, so new motion must be too.

### Asset Provenance
The anatomy model is Z-Anatomy (CC BY-SA 4.0), derived from BodyParts3D (© The Database Center for Life Science, CC BY-SA 2.1 JP). It is built locally by `scripts/anatomy/build.sh` (Blender and meshoptimizer via nix) into `public/models/anatomy.glb`, which is gitignored and never committed. The attribution with links to both sources and both licences sits in the footer (`#credits`), and the figure caption links to it. Any new 3D or raster asset must carry an open licence and a footer credit the same way.

## Do's and Don'ts

### Do:
- **Do** carry every level by numeral, fill and hatch density together, on the board, in pins and in the legend.
- **Do** print a confidence stamp beside every activation, using solid for measured, outlined for inferred and dashed for opinion.
- **Do** set every board row at 16px and rank it by weight, case and reversal.
- **Do** separate slats with 4px of spruce frame and keep content surfaces flat.
- **Do** keep touch targets at least 44px, and 48 to 52px for the phone's primary controls.
- **Do** design every new surface in both themes; light must hold up in sun on snow.
- **Do** put any new motion behind the reduced-motion query, with the shared ease-out.
- **Do** credit every 3D or raster asset in the footer with its licence.

### Don't:
- **Don't** use amber, orange or magenta for anything except load (the lift line's travelled range aside).
- **Don't** introduce a second typeface or rank board rows by size.
- **Don't** put drop shadows on slats, plates, pins or cards; only tags and floating layers get shadows.
- **Don't** add wood grain, texture, gloss or gradients to the board.
- **Don't** treat one association as the default, or style its mapping differently from the others.
- **Don't** show an activation without its stamp, or present an inferred or opinion claim in the solid measured stamp.
- **Don't** commit the anatomy glb; it is built locally by the anatomy script.
