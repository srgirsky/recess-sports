---
name: sculpt-character
description: Take one roster character from concept turnaround to a delivered, measured kid_<id>.glb — the full authored-character pipeline, its gates, and the two verification instruments that lie.
---

# Sculpting one character

The 30 characters ARE the product. This is the whole pipeline for taking one
from a concept sheet to a delivered model, in the order it must happen.

**Do one character at a time, all the way to the end.** Four half-sculpted kids
are worth less than one finished one, because the thing being proved by
character N is that the shared library generalises — and a half-sculpt proves
nothing.

## Before you touch anything

Read, in this order — they carry rules this file deliberately does not repeat:

1. `AGENTS.md` (root) — loads automatically. The gates table and § Only one place.
2. `scripts/v2/blender/sculptlib/__init__.py` — the package doc. **The three rig
   conventions and the safety procedure are here.**
3. `scripts/AGENTS.md` — the lint conventions and `measures.json`'s role.
4. `scripts/v2/blender/sculpt-tank-source.py` — the worked exemplar. Tank is the
   most recent and most complete; Junebug is older and hand-written.

Then check the state of play, because it moves:

```bash
node -e "const j=require('./assets/v2/source/character-fidelity.json');
  const c=j.characters??j; for(const[k,v]of Object.entries(c)) if(v?.status) console.log(k, v.status)"
```

## The sequence

### 1. Read the sheet with the tool, not with your eyes

```bash
npm run analyse:turnaround -- <id> --write     # -> scripts/v2/turnaround-specs/<slug>.spec.json
```

If `<id>` has no recipe, add one to `scripts/v2/turnaround-recipes.mjs` first —
that file's header explains the four things a turnaround cannot tell you about
itself. **A recipe is a reviewable act**; every declaration in it is checked
against the sheet and a mismatch is an error, never a silent override.

The spec says what the sheet supports **and what it refuses**. A refusal is an
answer. Do not go around it by eyeballing the number.

### 2. Register the character

Add a `source` to `scripts/v2/character-registry.json`. Membership in the
authored set is **earned by declaring a source** — a kid with concept art and no
`.blend` is a kid nobody has sculpted, and the gates must not ask them for
evidence that cannot exist.

### 3. Bootstrap the `.blend` (new characters only)

```bash
blender --background --factory-startup \
  --python scripts/v2/blender/build-signature-source.py -- <id>
```

It refuses to replace an existing source, by design.

### 4. Write `scripts/v2/blender/sculpt-<slug>-source.py`

Copy Tank's structure. What goes where is not a style question:

| In the sculpt script | In `sculptlib/` |
|---|---|
| every number traced off **that kid's** sheet | construction that reads no character's table |
| the station tables, the section profiles, the bands | the builders that consume them |
| curves that are one kid's shape (`inseam_half`, `sole_profile`) | curves that are the rig (`leg_x`) |

Call the shared builders with a spec: `build_arm`, `build_leg`, `build_shoe`,
`build_ear`, `head_surface`. Each spec's fields are **all required** —
`sculptspec.lint.test.js` enforces it from both sides, and the reason is in its
header: a default is one kid's measurement living in the shared library, which
has already shipped twice.

**Every authored table needs provenance** — `# measured: <view> z=<ft>
halfWidth=<ft>` or `# not-traceable: <why>` — and the gate re-measures the
citations. Two rules about this:

- **Module-level tables are governed; locals are not.** A table declared inside
  its own builder escapes the gate entirely. That is how the arm's and the leg's
  went uncited for twenty rounds. Author them at module level.
- **Never write `not-traceable` on a table the sheet can give.** That is
  weakening a gate to pass. Check with `regionRunsAt` / `namedRunAt` first and
  put the measurement in the reason.

### 5. Build, deliver, verify

```bash
cp public/v2/models/kid_<id>.glb /tmp/baseline.glb          # if one exists
blender --background assets/v2/source/<slug>-pilot.blend \
  --python scripts/v2/blender/sculpt-<slug>-source.py       # rebuilds the .blend
npm run export:authored-character -- <id>                   # .blend -> .glb
npm run validate:models
npm test
```

### 6. Measure before you form an opinion

```bash
npm run review:character-fidelity -- <id>    # renders the boards
npm run measure:fidelity -- <id>             # grades them
```

`measure:fidelity` **settles anything it covers before any 1-5 eye score is
discussed.** Six rounds were once spent arguing a shoe's colour split with the
metric sitting right there.

### 7. Score it — but not yourself

**The sculptor never scores its own work.** An independent critic scores from
freshly rendered boards. If you sculpted it, you may report the measured
numbers; you may not assign the rubric scores.

### 8. Status

Agents cap at `candidate`. `approved` requires a human `approvedBy`,
`approvedAt` and `approvedEvidenceSha256` in
`assets/v2/source/character-fidelity.json`. Say plainly that approval is the
maintainer's and hand them the board path.

## ★ The two instruments that lie

**Both look exactly like verification. Both have certified a completely broken
sculpt.**

1. **`export:authored-character` does not run the sculpt script.** It reads the
   `.blend`. Edit the `.py`, skip the Blender line, and every downstream check
   re-certifies the build you already had.
2. **The delivered GLB's sha256 is not a geometry check.** The exporter stamps
   the `.blend`'s hash into the GLB and Blender's save is not byte-reproducible,
   so it changes when the source *is* rebuilt and holds when it is not — exactly
   backwards.

Under both, a source file with a `NameError` in it passed as "geometry is
identical" and took a 1,587-test suite green with it, **because no test opens
Blender.** Use `npm run compare:glb-geometry -- <baseline> <candidate>`, which
ignores the bookkeeping fields by name.

There is a third: **`measure:fidelity` reads a checked-in PNG.** Re-render with
`review:character-fidelity` before you believe its numbers, or you are grading
the previous sculpt.

## The failure class this project keeps hitting

**A quantity read down a line that passes through more than one object.** It has
cost this project at least five expensive rounds:

- the torso read across `sleeve | torso | sleeve` — 0.910 authored where the
  torso alone is 0.532
- the shoe read across two overlapping feet — 1.211ft for a 0.86ft foot
- the mouth read on the chin shadow — the atlas mouth at 97.3% of head height
- the legs read across a 2px seam — silhouette 0.6589 where one leg is 0.3178
- white × skin vertex colour = skin, exactly — which deleted every sclera

Before trusting any width: ask `regionRunsAt` which object each run is, and
declare paired parts in the recipe. `runidentity.lint.test.js` is the gate.

## Definition of done

- [ ] `npm test` and `npm run validate:models` green
- [ ] geometry verified with `compare:glb-geometry` (not a hash, not a re-export)
- [ ] `measure:fidelity` run on **freshly rendered** boards, every metric
      reported — including the ones still out of tolerance
- [ ] every authored table carries a citation or a measured refusal
- [ ] scored by an independent critic, not by whoever sculpted it
- [ ] status `candidate`; approval named as the maintainer's
- [ ] docs updated in the same branch (root `AGENTS.md` § The gates for a new
      gate; `README.md` for a new command)
- [ ] shipped as a **PR against `main`** — never a direct push

## Do not

- **Do not touch Junebug** (`nostrike`) while her board is awaiting re-approval.
  Her builders are the pre-review versions and adopting the newer construction
  would change her mesh mid-review.
- **Do not weaken a gate to make a sculpt pass.** If a gate is wrong, say so and
  show the measurement.
- **Do not claim a fix you have not measured from the artefact.** A full-page
  screenshot compared against a tight crop is not evidence; that mistake shipped
  an elbow that was never baked.

## Lessons the first five sculpts paid for

Each of these cost at least one blind round. They are constraints, not history.

- **Probe which way the profile view faces before tracing it.** Grizz's first
  face trace ran down the BACK of his afro because the sheet's profile faces
  +x; three sheets since have faced the same way, none is guaranteed to.
- **A "touching" read can be a flood-fill artifact.** Enclosed backdrop
  pockets (between legs, between shoes) count as figure, so `ankleDaylight`'s
  concept-side 0.00 usually means CONTAINMENT, not contact. Measure the true
  gap and record it; never fatten the mesh past the drawing to chase the
  number (the funnel-sock mistake).
- **`skull_front_y` must model the face flattening.** `head_surface` scales
  the front depth by 0.88 − 0.11·frontness², so a hair tuck clamped to the
  raw ellipsoid floats IN FRONT of the rendered face and paints it
  hair-colour. Chip's script carries the correct clamp (plus the no-skull
  sentinel from Bubbles); copy it, and port it when polishing the earlier
  hair characters.
- **Copy `loft`'s exact winding for custom ring surfaces** (ascending rows,
  its quad order, its cap fans). Grizz's afro shipped inside-out from a
  by-eye copy.
- **Only team-tintable geometry may live on M_Accessory.** The runtime tints
  the whole slot: Chip's navy cap crown rendered olive until only the front
  panel stayed on slot 3. Accents so far: Tank shoe collar, Grizz sock roll,
  Sprout cuff stripe, Bubbles scrunchie, Chip cap panel.
- **The board ramp delivers ≈ authored/1.2 with chroma compressed.** Deep
  skin authored at the sheet's own value falls below `isSkin`'s floor
  (Grizz); a panel that must classify as its concept tone needs the
  concept's CHROMATICITY at ~1.3× spread, not 1.2× brightness (Sprout's
  canvas, twice).
- **Read the classifier's own tone pair before authoring shoe colours** —
  `measure:fidelity` prints them. Two kids' "second tone" turned out to be
  warm shading (a tan), not the panel colour anyone assumed, and Bubbles'
  "pink" cost two wrong rounds.
- **The critic loop:** measure → fresh independent critic (a new agent per
  round, scores verbatim into the record) → fix the named findings → repeat.
  Promote at all-4s; when a blocker oscillates across two critics without net
  movement, record `needs-polish` with `polishFindings` and move to the next
  kid — Tank's thirty rounds are the cautionary tale.

## Lessons Bendy Bao paid for (glasses, stripes, and two silent inversions)

- **`MeshBuilder.tube`'s third positional arg is the MATERIAL index.** Bendy's
  glasses passed `3` there thinking it was sides — slot 3 is M_Accessory, so
  the runtime team-tinted the frames navy and the temple arms read as backpack
  straps in every capture, while the board looked fine. Name the argument or
  count the positions; anything on slot 3 WILL be tinted.
- **Ring-loft level tables must be strictly DESCENDING in z, and the loft
  should assert it.** An ascending table survives `reversed()` upside-down:
  every quad's winding inverts, the offline board (double-sided) hides it, and
  the runtime lights the mass as a slate-grey void — Bendy's bun, one full
  critic round to find. The assert in `sculpt-bendy-bao-source.py`'s
  `ring_loft_hair` is the pattern; carry it into any lifted hair builder.
- **The board renders double-sided; the runtime does not.** Any "wrong colour
  at runtime, right on the board" split is a normals/winding suspect first
  and a palette suspect second. Check the RUNTIME captures for colour-split
  masses before shipping — the critic sampling pixels off
  `*-runtime-hero.png` is what caught both of Bendy's.
- **`npm run <x> 2>&1 | tail` swallows the exit code** — the `&&` chain sees
  `tail`'s success, so an export refusal (LOD budget, GLB size) lets every
  downstream step run against the STALE GLB and the round measures nothing.
  Check for the export's own ✓ line before trusting anything after it.
- **Glasses construction (first done here, for Noodle/The Prof/Gizmo):** two
  cyclic wire tubes on the hair slot, lens centres at the sheet's eye line,
  0.030 proud of the cheek — at 0.050 the profile encloses a see-through
  pocket between rim, cheek and temple arm, and the silhouette gate counts
  it. Bow the temple arms OUTBOARD along the skull to the ear root; run
  straight back at the lens's own x they are buried and invisible. Atlas eyes
  stay moderate so they sit inside the rings.
- **A striped garment is the loft's own `color_fn`** — trace the band chart
  off the sheet's cluster rows and paint by z; no second surface, no slot
  games. If the sheet runs the lowest stripe to the hem, the hem band is
  stripe-coloured too.
- **An eye landmark refusal is normal for glasses kids.** The frames merge
  with the sideburns into one region and the analyser refuses; the lens-ring
  CENTRES are the eye line. Trace them by hand, record the bounded probes in
  the featurelatitude entry, and expect the analyser's own brow/mouth picks
  to be frame artifacts.

## Lessons Flash paid for (the mohawk, and stripes done right)

- **Stripe band tuples are `(lo, hi)` ASCENDING** — the membership test is
  `lo <= z <= hi`, and a top-down tuple silently paints NO stripe at all: the
  tee rendered plain cream and only the board caught it. Assert or eyeball the
  first build's torso before measuring anything.
- **Crisp stripe edges need loft rings AT the band boundaries.** The loft
  paints per-vertex and interpolates across each quad row, so a colour edge
  between two distant rings smears across the whole gap — this was the real
  cause of both striped kids' "washed stripes" critic notes, not chroma.
  Pattern: a `TORSO_LEVELS_CRISP` used only at LOD0 (a ring ~0.006ft inside
  each edge, both sides), while LOD1/2 keep the sparse table so LOD2 stays at
  its exact budget.
- **A spike/lean table's x offsets must SUM TO ZERO.** Alternating leans gave
  the crest front width for free (flanking spike rows would blow the LOD0
  budget), but the first table's net −0.047 lean shifted shading enough to
  blow faceAsymmetry at 10.7 against 4.0.
- **Mohawk construction (for future faded/shaved kids):** a tight stubble
  shell over the skull (ring loft, +0.02, fronts buried below the fringe
  line), a midline ridge tube, and 2-point spike tubes with fat bases so the
  pickets group. The fade's fringe table is the tuning knob for the
  `faceSkin` metric — coverage down the temples trades directly against it.
- **When the LOD0 budget refuses, trim tessellation before geometry:** torso
  24→19-20 segments, scalp 20→16, spike sides 5→4, one interpolable shape row
  — each is invisible at game scale; a lost spike or stripe is not.

## Lessons Zippy paid for (pigtails, and the runtime is the evidence)

- **`tube`'s `groove` subtracts ABSOLUTELY from each ring radius.** A groove
  larger than the smallest radius drives rings negative and turns the tube
  inside-out — Zippy's pigtails rendered as slate backface blades at runtime
  while the double-sided board showed rounded brown masses. Keep groove well
  under `min(radii)` (hers: 0.020 against a 0.025 tip). The broken geometry
  had also been accidentally WIDENING her measured head silhouette — fixing
  it un-merged the pigtails from the crown and the aspect metric caught it.
- **Score the RUNTIME captures, not the board.** Three of Zippy's four
  first-round defects (slate pigtails, invisible headband, crotch gap) were
  invisible or flattering on the board. The critic prompt now says runtime
  first; the board settles measured numbers only.
- **A proud accessory must ride the HOST SURFACE, not the skull.** The
  headband's arc was authored at skull-ish y and sat INSIDE the hair cap —
  invisible everywhere. Compute each arc point as (cap surface + 0.02).
- **Paired hair masses must MERGE with the crown if the sheet's silhouette
  merges** — the head-box width metric reads the central run, and floating
  pigtails 0.1ft off the head read aspect 1.18 against the sheet's 1.53.
- **`mouthScale` exists now** (generate-face-atlas): scales the whole mouth
  mark about its centre, default 1 keeps every existing atlas byte-identical.
  Zippy's "huge happy grin" ships at 1.3; use it when a kid's identity IS the
  mouth.
- **Wrap-around trim (dolphin piping) is two consecutive SOLE-coloured
  stations**, same pattern as every proud band; and an inseam carve deeper
  than ~0.03 splits short-shorts into two boxes at runtime.

## Lessons Noodle paid for (the bald head is a colour instrument)

- **Skin is chroma-authored like any classified panel.** A bald head makes
  `visible face` nearly all skin, and the ramp's chroma compression can pull
  the whole dome out of `isSkin`'s warmth band — Noodle's first build
  delivered warmth 37 against the concept's 112 and read HALF its target.
  Author skin at ~1.3× the sheet's chromatic spread, but know the ceiling:
  once the r channel clips at FF, lifting VALUE only raises g and b and
  CRUSHES the `r > g+12` test (one lift too many dropped the metric from 35
  to 23). The window between the shadow-step lum floor and the clipping
  ceiling is narrow; measure each step.
- **`faceSkin` samples ONE row at 62% of head height** — know what crosses
  it. On a glasses kid that row cuts four wire crossings; authoring the wire
  at the DRAWN weight (radius ≈ drawn-diameter/2, Noodle 0.013) is worth
  points. The residual shadow-step failure (warm skin at lum 74-76 against
  the 80 floor) is the renderer story recorded on Tank — record it as
  OFF-with-measured-cause, don't chase it past the palette's physics.
- **Replicate the instrument when it disagrees with your eye.** The
  delivered view is alpha-masked (`loadFigure`), not backdrop-modelled — a
  probe using `figure()` on the review PNG reads DIFFERENT numbers. The
  exact-replica probe (alpha > 128, headBox arm-clip, one sample row) is what
  found the failing pixels and their cause in minutes; guessing at palette
  fixes without it wasted two build rounds.
- **A mid-course skull change re-solves the island.** Moving HEAD_CENTER or
  rz after the FaceSpec anchors are set silently shifts every feature —
  featurelatitude caught the mouth drifting 2.6 points. Re-derive the anchors
  whenever the skull numbers move.

## Lesson Turbo paid for (the shoulder wedge has a mechanism)

- **The recurring shoulder-wedge defect is an A-POSE COVERAGE GAP.** Critics
  flagged dark wedges at the sleeve/torso junction on Bendy, Flash and
  Noodle; Turbo's A-pose review view finally tripped the silhouette gate with
  an enclosed backdrop pocket there. Mechanism: when the arm rotates down,
  the arm cap (at `cap_x`) pulls away from the torso's sloped shoulder rows.
  Fix that worked: bury the cap deeper (`cap_x` 0.100 → 0.060) AND widen the
  torso's shoulder rows so the slope reaches past the arm root. Apply to new
  kids up front; the polish round should port it to the batch-1/2 kids.
- **Verify feature traces against a zoomed CROP, not the dark-run scan
  alone.** Turbo's fringe shadow read as "brows" in the row scan; the crop
  showed the true brows a full 8% of head lower. A one-minute sips crop
  beats three wrong island solves.

## Lessons Penny paid for (overalls, and two ways a mirror lies)

- **A garment panel worn OVER another garment is GEOMETRY, not a colour
  wedge.** The bib as a torso-loft theta wedge smeared across segments on
  the board and tore into a hard pink block under the swing's deformation;
  rebuilt as proud front/back panels the mechanism is gone and the bib
  gains the constructed depth critics ask for. Same pattern for any apron,
  vest or jacket front.
- **Clump textures must be mirror-symmetric: row variation goes in the
  AMPLITUDE, never the phase.** `sin(k·θ + c·row)` rotates the ringlet lobes
  per row and blew faceAsymmetry at 7.14; `cos(k·(θ−π/2)) · (a+b·cos(c·row))`
  keeps the mirror and the organic variation.
- **A translated copy is not a mirror.** Flip the winding only for geometry
  whose VERTEX ORDER mirrors (side·x in the ring formula); Penny's gold
  buttons were translated rings sharing one vertex order, and flipping one
  side's winding made 13 inverted mirror pairs. For per-side `grid()`s use
  the `flip=` parameter, never reversed row lists.
- **`npm test | grep` swallows the failure exit** — same trap as `| tail` on
  exports; a commit slipped through on a red suite and needed amending. Read
  the `Test Files` line, then run the FAILING file bare before shipping.
- **Concept sheets light asymmetrically; expect one-sided faceSkin OFFs.**
  Penny's sheet holds a 6.5-point left/right split in its own shading (Moose's
  brim was the same class) — the evenly-lit delivered board cannot match the
  shadow side. Record OFF-with-measured-cause; don't chase it with geometry.

## Lessons the batch-3 open-jacket kids paid for

- **An open jacket is a partial ring shell** — swept front-edge to front-edge
  around the back, fold-back inner vertices at both front edges so the rim
  reads as cloth, small collar-flap grids at the top corners. Proven on The
  Professor and reused verbatim on Ace; the tee underneath is the plain
  torso loft.
- **The `bandSplit` shoe window is the BOTTOM 9% of the figure** — sole and
  vamp only. A drawn quarter-panel colour above z ≈ 0.36 never reaches the
  pair: The Professor's "grey" and Ace's "blue" uppers both read as
  cream + warm tan there, and the fix is a two-tone sole (Dazzle's split),
  not repainting the upper.
- **The fringe window is COLUMN-QUANTIZED.** The visible curtain edge is the
  quad wall from the ring ABOVE the sample row, so a fringe nudge that flips
  no ring column moves the faceSkin metric by exactly nothing — Ace measured
  three identical 15.6 readings across three nudges. Compute which column
  (|x| = half·cos(kθ)) must bury and raise the window past ITS ring's z.
- **Author silhouette tables to their own citations.** The Professor's sweep
  cited halfWidth 0.6498 and was authored at 0.495; the aspect metric caught
  it. If the number is in the header, the table must say it.

## Lessons Rocket Rosa and Gizmo paid for (batch 4)

- **Set `tongueOut: true` in every NEW kid's FaceSpec.** Without it the atlas
  generator emits a byte-identical lip path for `grin` and `cheer` and a
  tongue that never breaks the lip line — rubric 3.14 fails on sight, and a
  critic round was spent proving the runtime innocent. The flag is off by
  default only so frozen kids' atlas bytes stay put. Pair it with
  `mouthScale` when the concept's mouth is small: silhouettes need pixels.
- **The review surface now holds a chosen expression sticky** (AnimSpike
  reapplies the face-button cell after the director's update). Before that,
  the idle blink cycle restored the resting face seconds after the capture
  script cycled the button, and every cheer/tongue still across the roster
  silently photographed the RESTING cell. If expression stills ever read
  identical again, pixel-diff them BEFORE touching the atlas: identical
  stills mean instrument, similar stills mean cells.
- **The review render auto-frames the model's bounding box.** Deep geometry
  behind the figure (a ponytail fan's y-reach) backs the camera up and
  rescales every measured ratio — two rounds chased "faceSkin regressions"
  that were the camera. Keep hanging-hair depth reach ≈ ≤ 0.55 and carry
  the bounce in z, not depth.
- **The headBox pinch keeps the TOPMOST of equal-width rows.** A neck whose
  rings quantize to one pixel width drifts the pinch up to the chin and
  slides the 62% faceSkin row onto the drawn eyes. Author the neck's bottom
  ring a genuine 2px narrower than the ring above. Related: the T-pose arm
  band clips the pinch window — the collar's widening rows must sit ABOVE
  the arm tubes' top edge or the detector refuses with "no pinch".
- **The render camera's high vantage shifts the drawn face ~0.13ft down the
  figure.** A drawn eye bottom that clears the sample row in z-arithmetic
  still lands on it in pixels. Author the eye to the concept's own measured
  half-height, put eyeY at the featurelatitude tolerance edge if needed, and
  verify on the render, not the math.
- **An accent must ride OUTSIDE every surface that renders over it** — the
  Zippy headband lesson generalizes radially. Rocket's scrunchie died twice
  inside the cap dome (the deep cap occludes everything above z ≈ 3.1 from
  the profile ray); the fix was squeezing a real gather WAIST into the tail
  ribbon and wrapping the band around the waist, fatter than the waist in
  every axis but inside the tail's own bbox.
- **Glass lenses are DISCS, not open rings.** The sheets fill spectacle
  rings with paper-cream shine; an open wire ring measures ~20 points more
  visible face than the drawing (The Professor's tinted-lens class). A pale
  disc 0.012 behind the wire is both the measured answer and what the
  drawing shows. And lens discs are TRANSLATED copies, not mirrors — one
  winding for both sides (Penny's button lesson; settled by reading triangle
  normals out of the exported GLB, which beats three build-cycles of
  guessing).

## Lessons Dex, Clover and Boomer paid for (batch 4, second wave)

- **Even segment counts on any ring the faceSkin row can touch.** An odd
  ring (17) has no mirror-symmetric columns, so the two curtain edges
  quantize to different |x| and the metric's sides move independently —
  Dex's left sat pinned through two fringe nudges that moved his right by
  4.5. The same parity rule picks petal counts: cos(5θ) flips under
  θ→π−θ, cos(6θ) doesn't — 6 petals mirror, 5 cannot.
- **The isSkin saturation floor is 0.22 and the toon highlight walks kids
  into it.** Clover's delivered skin compressed to sat 0.218 — two
  thousandths under — and the highlight lands asymmetrically with the key
  light, so the failure showed up as face ASYMMETRY before it showed up as
  a level. Chroma-author skin so the HIGHLIGHT band clears 0.24.
- **Blonde hair legally passes isSkin** (r>g+12 holds for warm golds), on
  the concept AND the delivered render — so a blonde kid's faceSkin metric
  counts her hair on both sides of the comparison. Author blonde deep
  enough to contrast skin at hero scale (Clover's crown read near-bare)
  while keeping it warm enough to keep passing.
- **A drooped tongue must fit the kid's island.** tongueReach 1.5 overran
  Clover's short chin onto under-chin latitudes and vanished — the
  short-chin corollary of Gizmo's alignOpenMouth lesson. Check where cell
  ~112+ lands on the head before choosing reach.
- **Chunky T-pose arms put a ceiling on the measurable head box.** Boomer's
  concept pinch (2.51) sits below the z where his bind-pose arm band
  explodes the centre run (2.56) — no sculpt change can reach it, and the
  head-height/aspect pair goes OFF together with the same cause. Probe the
  rows, record OFF-with-measured-cause, move on.
- **A neck ring narrower than every chin row, placed at the concept's own
  pinch z, steers the headBox exactly** — Clover needed a deliberate 0.008
  notch at z 2.78 because her chin cap tapered to 0.122 and stole the
  pinch. Corollary of the topmost-of-equals rule.
- **The two-tone shoe split needs the concept's third tone.** Clover's
  cream+green summed to 100 where the concept keeps 16% in ink, making the
  joint tolerance window 0.3pt wide — warm the midsole to a third
  chromaticity (Dazzle's two-tone sole, generalized) and the window opens.
  And the toe-cap/heel edges cut the OPPOSITE way from intuition — measure
  after every band change, never chain two band edits on a prediction.
- **Face-cycle clicks in the capture script are PACED (80ms)** — unpaced
  cycling shipped a wrong cell under a right label across the whole roster.
  If expression stills read identical, crop THE MOUTH REGION before
  diagnosing: a diff crop that misses the mouth measures the glasses.
