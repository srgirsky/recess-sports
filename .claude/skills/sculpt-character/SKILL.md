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

## Lessons batch 5 paid for (Smokey, Sniffles, Cricket, Peaches, Lefty)

- **Every arm station inboard of the deltoid needs a SHOULDER_BLEND entry**
  (blend value = the Spine2 share). A station with no entry weights 100% to
  the arm bone, and when the arm drops, that fully-rotating ring next to an
  88%-pinned one shears the skin web into a triangular shoulder fin.
  Peaches burned three critic rounds on geometry fixes (smaller rings,
  buried caps) that could not work because the fin was SKINNING, not mesh.
  On a sleeveless kid the fin is naked; on sleeved kids it hides as fabric.
- **Limb stations cannot take torso bone names** — the builder prefixes
  Left/Right, so `(x, r, SKIN, "Spine2")` in ARM_STATIONS raises
  KeyError 'RightSpine2'. Root-ring pinning goes through SHOULDER_BLEND,
  never through the station's bone field.
- **An enclosed silhouette pocket is closed by hugging, not shrinking.**
  Lefty's 1080px rear-window came from a tail arcing away from the skull
  plus an over-long backwards brim. Fix serially, re-measuring each: tail
  hugs the jaw–neck line laterally AND the nape in depth, wisps ride the
  face surface, the brim ends before it bridges. If the pocket count does
  not move after an edit, the edit did not touch the pocket — crop and LOOK.
- **A bald-under-cap read needs a nape SHELL, not a bigger tail.** The
  toon terminator darkens the skull's lower rear to skin-shadow tones; a
  blonde shell of hair levels under the cap rim (NAPE_LEVELS) is what makes
  the rear gameplay angle read "hair", and the hair tone must stay blonde
  under that terminator (author bright, e.g. #DC9840).
- **Swept asymmetric fringes: keep the sweep ABOVE the faceSkin sample row**
  (head.top + 0.62·height). Sniffles' signed-x curl sweep uses a z floor
  `max(3.205, base+sweep)` so the asymmetry lives in the silhouette, not in
  the per-side skin counts.
- **Shoe band boundaries snap non-monotonically across SHOE_SECTION v-rows**
  (0.13/0.30): a small bandSplit change can move a boundary the OTHER way,
  and a polarity misread ("dominant" tone that is actually the dark one)
  survives arithmetic. Settle every band question by viewing the rendered
  feet.
- **The team accent must OWN FACES, not just a declaration.** The finished-work
  gate wants `M_Accessory` with `recessTeamAccent` in the GLB, but Blender's
  exporter drops a material no polygon uses — so the accent surface (cuff roll,
  sock top) must be coloured with the `TEAM_MASK` object the leg builder maps
  to slot 3, not with a lookalike local colour. Sniffles declared the accent
  and shipped three materials.
- **Bootstrapped `# measured:` citations are the template kid's, not yours.**
  build-signature-source.py copies LEG/TORSO provenance comments; the lint
  re-measures them against YOUR sheet and nine stale citations surfaced only
  at the batch-end full run. Re-cite every copied table from the kid's own
  sheet before first build (a wrong-value probe citation makes the lint print
  the sheet's actual).

## Lessons batch 6 paid for (Mimi, Theo, Zoom, Big Lou, Tank round 31)

- **The runtime TEAM-TINTS everything on M_Accessory — author the accent as
  the smallest surface that should change colour.** A full two-row denim
  cuff on slot 3 rendered as an olive band and blocked a round; the
  convention is ONE thin ring (Grizz's sock roll, Sprout's stripe, Chip's
  panel). When a critic reports a colour that "no lighting could produce",
  check the slot before the palette.
- **Crisp-stripe inserts within ~0.008 of an existing loft row make
  degenerate sliver bands** whose unstable normals render as hard-edged
  backface slits at runtime (Lou's "navy crescents" — insert 2.419 beside
  row 2.420). Dedupe inserts against the base table. Chromatically-BLUE
  dark pixels on warm cloth = backface void, never shading.
- **A failed export leaves the OLD GLB for every downstream step.** The
  size/LOD budget refusal does not stop `review:character-fidelity` from
  re-rendering the stale model — check the export's ✓ line before
  believing any board or measure that follows (the pipes-swallow lesson,
  now with budgets).
- **Pre-convention blends carry stray meshes** (proxy shells, an
  Icosphere) that export beside the LODs and eat the 400KB budget
  invisibly — purge EVERY mesh object in main(), not just the LOD roots.
- **A seated kid breaks the instrument's standing assumptions in one
  family**: the bottom-9% "shoe band" lands on the wheels, the concept's
  dominant tone is its own backdrop through the drawn spokes (the
  flood-fill pocket class), and 4ft-scaling makes the sheet's z frame
  chair-relative. Record the family OFF-with-measured-cause; only
  percent-of-head landmarks carry. Chair + tucked legs ride Root (the
  proxy's proven approach) so the shared skeleton fits without a second
  rig; a no-earLine entry follows Zippy's precedent when a crown owns the
  widest rows.
- **The bill/brim reach is the TIP's absolute forward y** — a reach less
  than the dome's own front projects NO bill (Theo's "batting helmet").
  And an open jacket's defect can be the opening's WIDTH, not its side:
  probe by rotating start ONLY after re-deriving which arc the gap spans,
  and remember the sheet wants the tee readable at the centre.
- **A chunky kid amplifies every shear**: bigger arm radii turn the
  shoulder-blend steps into visible tears (add stations, smaller deltas),
  the sock's own table must taper monotonically inside the shoe zone or
  it pierces the upper (Tank's 30-round drip was a 0.100→0.138 bulge),
  and the analyser refuses the chin-merges-into-neck pinch — hand-set the
  neck row and say so in the featurelatitude entry.

## Lessons batch 7 paid for (the polish pass: Chip, Lefty, Bubbles, Peaches)

- **"Wrong colour at runtime, right on the board" stayed the roster's most
  expensive class to the very end.** Bubbles' bun shipped as a dark
  backface void for EIGHT rounds because its level table was ascending
  (Bendy's exact lesson, unlearned locally) — every ring-loft helper must
  carry the descending assert, not just remember it. And Lefty's blonde
  was cured by HUE, not brightness: author yellow as r≈g (his #D8B440,
  r−g 36) so the toon ramp cannot fold it into the skin family; pixel-
  sample the RUNTIME stills to prove separation (his tail #907909 vs ear
  #8f601e — g−b carries the yellow).
- **A butt-joined sleeveless shoulder needs a faired DELTOID DOME, not a
  better blend alone**: a skin ellipsoid over the arm root, blend-weighted
  (~0.55 Spine2 / 0.45 Arm) so it follows the drop without shearing —
  Peaches' round-5 pass after four rounds of ring/cap/blend attempts.
- **A segment trim can flip a fringe column onto the face** — Chip's
  hair 20→18 cost the right side 4.7 points while the budget saved 1KB.
  Trim shells the face never touches; re-measure after every ring-count
  change (the column-quantization class works in both directions).
- **Bevelled rim rows turn a decal into a sewn pouch**: rim vertices at
  ~30% of the panel's proud height read as stitching; the same trick
  covers pocket flaps, patches and buttons.
- **Occluders move; landmarks don't.** Peaches' "no ear / mesh tear" was
  the temple wisps parked OVER the ears — moving the wisps forward fixed
  the ear AND brought faceSkin-left into tolerance in the same build.

## Lessons the stance-and-mouth pass paid for (post-campaign)

- **The ankle-daylight tolerance is unreachable by construction, and now the
  record says so.** The concept side reads 0.00 through flood CONTAINMENT of
  a drawn-closed outline; the moment a render closes the same outline, the
  enclosed between-legs window trips the silhouette gate's binary puncture
  rule. The render stance now adducts each kid to a calibrated ceiling
  (LEGS_IN_BY_ID in render-fidelity-views.py, flat feet via foot
  counter-rotation so the shoe-band read survives) — but a residual OFF is
  the recorded instrument conflict, not a stance regression. The real
  closure is the rig-and-sculpt leg pass the metric's own header names.
- **Enclosure vs adduction is NON-MONOTONIC** (Tank 10°→23px, 7°→227,
  4°→4; Sprout 10°→4-10 jittering the budget, 8.5°→74, 4°→0): the contact
  point walks down the shin as the angle shrinks. Calibrate with a ladder
  and re-verify at the chosen angle — a single probe lies, and renders
  jitter ±6px at grazing contact.
- **Stances are per-character where the sheet says so** (the A_POSE_BY_ID
  rule again): Junebug and Theo are DRAWN open-stanced and keep 0°.
- **measure:fidelity exits nonzero when metrics sit outside tolerance** —
  a report, not a crash. A sweep script must capture stdout from the
  "failure" or die on its first honest kid.
- **The mouth-cell knobs are now roster-wide** (every kid except frozen
  Junebug): the 14 pre-batch-4 kids gained alignOpenMouth/tongueOut/
  tongueReach 1.3 in one sweep — grin/cheer/tongue verified distinct on
  the recaptured stills. When a knob becomes universal, sweep it; two
  critics had flagged the same defect on two kids scored months apart.

## Lessons the hair-mass pass paid for (rubric 3.3, the 4->5 sweep)

- **Rubric 3.3 now has a ruler: `npm run measure:strands -- <id>`.** It counts
  the creases between strand groups per row on the concept and on the board with
  one detector. Run it before arguing about hair, the same way
  `measure:fidelity` settles the other categories.
- **Every hair kid under-carries strand COUNT, not depth** (first sweep: penny
  2%, mimi 3%, lefty 8%, grizz 10% ... smokey 57% of the concept's count, at
  70-318% of its prominence). Junebug's round-7 note guessed this from one bun;
  it is now measured across all fourteen. **Do not deepen a groove to fix hair.**
- **★ A RING CANNOT EXPRESS A CREASE IT HAS NO COLUMNS FOR, and every hair
  builder on the roster is authored past that limit.** Grizz asks for six lobes
  across twenty-four columns — four samples per lobe — and delivers 1.56 minima
  per row. Adding lobes into the same ring buys nothing: measured, 12 lobes at 24
  columns moved him 10% -> 12%, and a sharpened crease profile at 8 lobes
  10% -> 14%. Author **at least four columns per lobe**, and if you cannot afford
  them, do not add the lobes.
- **Strands are VERTICAL grooves, so trade rows for columns — it is usually
  free.** Grizz ships at 6800/7000 LOD0 triangles and 391/400KB, and 24 -> 32
  columns refuses the export on both limits at once. But 14 rows x 32 columns is
  896 triangles against 19 x 24's 912: measured, that trade exported 6KB
  SMALLER, moved no `measure:fidelity` metric, and took him 10% -> 15%. Keep the
  crown rounding rows and the widest row; thin the smooth barrel between them.
- **⚠️ AND THEN STOP LOOKING AT THE NUMBER.** Crop the concept afro and the
  delivered one side by side before optimising further. Grizz's sheet is
  PHOTOGRAPHIC curl texture and its 15.9 minima per row are not something a toon
  mesh should carry or a player would want. What the drawing reads as at game
  scale is a **scalloped silhouette edge over a near-hemisphere crown**; what
  ships is a smooth dome with a **pointed, faceted apex** — the cap vertex sits
  0.03 above a 0.06-radius top ring, which is a cone point, and that is the
  "crown runs flatter than the turnaround's" polish finding seen from the other
  side. Fix the silhouette and the crown; the relief is the smaller half.

## Lessons the hem pass paid for (rubric 3.4, the 4->5 sweep)

- **★ A GARMENT EDGE THAT IS ONLY A COLOUR CHANGE READS AS PAINT, and thirteen
  kids were scored 4 for it.** A `color_fn` switching at some z, with no loft
  rings around that z, makes the loft interpolate the switch across the WHOLE
  gap between its nearest rings. Penny's waist switched denim to pink at z 1.999
  with rings at 1.950 and 2.150 — a fifth of a foot of gradient standing in for a
  sewn hem, and the critic read it exactly as built: "the soft vertex gradient
  reads PAINTED from side angles". Flash's stripes paid for the same lesson
  (crisp edges need rings AT the boundary); it is a garment rule, not a stripe
  rule.
- **The fix is a ring PAIR plus a PROUD LIP, and the second half is what earns
  the 5.** A pair straddling the boundary (Penny: 1.987/1.999) makes the edge
  crisp; standing the lower ring ~0.010ft proud makes the waistband OVERHANG the
  tee tucked under it, which is batch 7's "a rim row proud of its panel reads as
  stitching" applied to a waistband instead of a pocket. Crisp alone is a clean
  colour edge; crisp + proud is a constructed garment. Cost on Penny: 2 rings x
  24 segments = 96 triangles, and the export got SMALLER.
- **Find candidates by arithmetic, then confirm every one by eye.** For each
  `if z < N` in a colour function, ask whether the level table has a ring on both
  sides within ~0.02ft. A regex sweep of that shape reports twenty boundaries on
  twelve kids smearing 0.055-0.180ft — ace, big-lou, clover, cricket, dex, gizmo,
  lefty, moose, penny, the-professor, theo, zoom — and it is a CANDIDATE LIST,
  not a defect list. It over-reports two ways, both found immediately: Dex's
  3.67/3.77 are width selections inside an explicit ring loop whose rings sit at
  exactly those z (not a colour edge at all), and Penny's 2.2/2.35 are her bib,
  which is proud geometry rather than a painted boundary. Crop the profile board
  at the z in question before authoring a single ring.
- **Check the kid's headroom BEFORE designing the fix.** The roster sits hard
  against both asset budgets and adding rings is not free; see the hair-mass
  lesson for the rows-for-columns trade when it is.
## The lesson three kids' ears paid for (and it is a REASONING failure)

- **★ NEVER INFER "THE DRAWING HAS NO X" FROM "THE SCULPT BUILDS NO X."** Three
  characters build no ears — Grizz, Penny, Bubbles — and each carried a written
  reason: "the afro covers them completely in all five views", "ears never show
  under the bob; none are built (Grizz's precedent)", "never drawn (the curl
  curtains cover them in all five views): no EarSpec, like Grizz". Crop the
  three profile views and all three are false. Every one draws a large, fully
  constructed ear — outer helix rim, deep concha shadow, lobe — sitting entirely
  clear of the hair, with Bubbles' curls deliberately tucked BEHIND hers.
  Rubric 3.10 is failing outright on all three.
- **The claim propagated because it was written as a fact and cited as a
  precedent.** Grizz's was first and unmeasured; Penny's names it ("Grizz's
  precedent"); Bubbles' inherits it ("like Grizz"); and
  `featurelatitude.lint.test.js` repeated it in the comment that makes an entry
  without `earLine` *permit a sculpt with no EarSpec*. One unmeasured sentence
  about a drawing became the thing that legalises three missing features, in a
  GATE. Check what a claim is load-bearing for before you copy it.
- **A missing gate target means "not gateable", never "not in the art."** The
  reason Grizz has no `earLine` is real and still stands — his head's widest row
  is the afro's equator, so the widest-row detector cannot find an ear line for
  him. That is a statement about the DETECTOR. It says nothing about whether the
  ear exists, and the two got conflated.
- **The same hair hid two defects at once.** The mass that "covers the ears" is
  also swallowing the face: on Penny's profile board the hair takes brow, cheek,
  mouth and jaw where her sheet keeps all of them clear behind a temple
  hairline. If a kid's ears went missing under hair, check the face in the same
  crop — it is one fix, not two.

## The bill lesson, paid TWICE (Theo then Chip) — now with an assert

- **Batch 6 already recorded it:** "the bill/brim reach is the TIP's absolute
  forward y — a reach less than the dome's own front projects NO bill (Theo's
  'batting helmet')." Chip shipped the identical defect anyway, and an
  independent critic read his cap as "a bike helmet" without knowing Theo's
  had been read as a batting helmet. **A lesson in prose did not survive one
  character.**
- **It is arithmetic, so it belongs in an assert.** Chip's `BRIM_REACH` was
  0.600 while his plate's root — the dome's own front ring, `CAP_LEVELS[-2]` —
  sits at -0.605. The tip was 0.005ft LESS far forward than its own root: the
  brim sloped backwards into the dome. His script now refuses to build it:
  `assert -BRIM_REACH < dome_front - 0.05`. Copy that assert into any cap.
- **★ NO GATE COULD HAVE SEEN IT, AND THAT IS THE POINT.** A bill buried inside
  the dome changes no SILHOUETTE, so `silhouette.lint`, the head-box metrics and
  `measure:fidelity` are all blind to it by construction. The whole cap read
  wrong and every automated check stayed green. When a feature lives INSIDE
  another form's envelope, the only instruments are an assert and an eye.
- **Watch for a regression disguised as a decision.** The comment beside the
  wrong number read "round 6 raised and flattened the plate so the key light
  reaches the forehead the drawing lights" — a lighting *intent*, which reads
  like a considered choice rather than a bill shortened past its own root.
  Chasing the forehead's key light is what broke it. And the correct value was
  in the same file the whole time: the section header cites "the brim reaches
  ~0.68ft forward of the axis". **Check a constant against its own header's
  citation before believing the note next to it.**

## How to read a team-accent surface on the board (a critic trap)

- **★ THE FIDELITY BOARD RENDERS `TEAM_MASK` RAW, SO EVERY TEAM-ACCENT SURFACE
  LOOKS LIKE A GREY DEFECT.** The runtime tints that slot with the drafting
  team's colour; the board does not tint anything. Chip's cap panel is
  `TEAM_MASK` (#D8D2C6) and reads as a dead pale grey on the board — a critic
  scored it as "the cream panel is delivered neutral grey ... reads as a bike
  helmet". At runtime the same panel renders GOLD, which is correct.
- **The right question is EXTENT, not colour.** Whether the accent surface is
  the right SIZE and in the right PLACE against the drawing is a real board
  judgement; whether it is the concept's own colour is not, because it is never
  meant to be. Chip's panel is still wrong on extent — it covers most of the
  crown where the concept has a narrow cream centre panel flanked by navy.
- **Tell every critic which surface is the accent**, or the finding comes back
  as a palette defect and someone "fixes" it by painting over the team's colour.
  Penny's critic got this right unprompted ("the yellow cuff in
  penny-runtime-hero.png is intended tinting, not a defect"); Chip's did not.
  Check `TEAM_MASK` in the sculpt script and name the surface in the brief.

## Writing the critic's brief (the sculptor's one real job in scoring)

The critic loop works — a fresh critic re-scored four kids from a recorded
4,4,4,4,4,4 down to 2s and 3s, and the demotions were right. But **critics
overstate, and they overstate in three specific ways.** Of five headline claims
checked against the artefact, three did not survive:

| the claim | what was actually there |
|---|---|
| "EARS ARE DRAWN AND ARE NOT BUILT" (Chip) | an `EarSpec`, a `build_ear` call, and a visible ear |
| "the cap has no bill" (Chip) | a bill, authored shorter than its own dome front |
| "a rectangular gouge ... an open black hole at gameplay camera" (Bubbles) | her EYE and brow, seen from a rear three-quarter angle |

All three read as damning, none was true as written, and any of them applied
unverified would have sent a round chasing a defect that was not there — the
mirror image of the inflation the loop exists to catch. Put these three lines in
every brief:

- **"Before claiming a feature is ABSENT, grep the sculpt script for its builder
  and report what you found."** `EarSpec`, `build_ear`, `BRIM_REACH` — a missing
  feature and a misbuilt one need opposite fixes, and only the source separates
  them.
- **"Before calling anything a hole, gouge or artifact, crop it at 4x and
  describe what you see."** A face-atlas mark at a grazing angle, a team-tinted
  surface and a shading terminator all read as damage in a full-body still.
- **"`TEAM_MASK` renders RAW on the board and tinted at runtime — judge its
  EXTENT, never its colour."** See the team-accent section above.

And the reusable half: **feed the correction back and re-run.** Chip scored
2,3,2,2,3,2 from a critic working blind, and 2,4,3,3,4,3 from one told which two
claims had been wrong — on a build that had barely changed. A brief that names
the known traps buys more accuracy than a harsher instruction to be harsh.

⚠️ **And the sculptor still may not score.** Correcting a critic's factual error
is not scoring; substituting your own number for its judgement is. Fix the
brief, re-run the critic, take what it says.
## ★ The curl fix, proved on Mimi: COUNT THE COLUMNS AGAINST THE LOBES

`hairMass` scored **2** on almost every hair kid the re-audit touched, always
for the same measured reason — 3-5% of the concept's strand count. It is one
bug, written the same way in every hair builder, and it is arithmetic.

**Mimi's halo asked for twelve lobes on a sixteen-column ring.** Her `clump` is
`1 + 0.095·cos(6θ) + 0.055·cos(12θ)`. Twelve lobes across sixteen columns is
**1.33 samples per lobe** — below Nyquist, so the fine term was not faint, it was
UNREPRESENTABLE. The coarse term at 2.67 samples was barely above it. The ring
could not carry the curls its own table described.

Measured with `npm run measure:strands`, changing NOTHING but the column count:

| columns | strand count vs concept | LOD0 tris | size |
|---|---|---|---|
| 16 (shipped) | **3%** | 6186 | 326KB |
| 32 | 13% | 6506 | 334KB |
| 48 | **24%** | 6826 | 343KB |

An eightfold gain, and every one of her `measure:fidelity` metrics came INTO
tolerance in the same build. On screen the halo went from a smooth dome to
grouped clumps with a scalloped silhouette edge.

**The rule: author at least four columns per lobe, and if you cannot afford
them, do not author the lobes.** Two samples per lobe is the theoretical floor
and renders as a soft ripple; four is where a crease reads.

**Check depth LAST, not first.** Her prominence was already **214%** of the
concept's — the creases were more than deep enough. There were too few of them
because the ring had nowhere to put them. Every hair kid measured so far shows
the same signature: strand count far under, prominence at or over 100%. If you
see that pair, the answer is columns, never a deeper groove.

**Budget it before you author it.** 48 was Mimi's ceiling (64 would need 7146
triangles against the 7000 cap). Where the columns will not fit, trade rows for
them — strands are VERTICAL grooves, so a hair mass can swap silhouette rows for
angular resolution at constant or lower cost (Grizz: 19x24 = 912 tris against
14x32 = 896, and the export got SMALLER).

### ★ And the two clump frequencies must not be HARMONICS

This is the half that is not obvious, and it cost two extra rounds on Mimi.

Columns buy strand COUNT; they do not stop the creases running as vertical
FLUTES down the whole mass — a critic measured 80.6% column-concentrated against
the concept's 37.2% AFTER the column fix. The instinct is to vary the clump per
row; the instinct after that is to vary its AMPLITUDE rather than its phase
(Penny's mirror lesson — a phase offset destroys the evenness of `cos(kθ)` and
blew her faceAsymmetry to 7.14 against a tolerance of 4). Both instincts are
right, and together they still did nothing, because her two terms were
`cos(6θ)` and `cos(12θ)`:

**12 is 2x6, so the two share every minimum and the sum's grooves sit at the
same theta whatever the amplitudes do.** Deeper and shallower flutes, still
flutes.

`cos(6θ) + cos(10θ)` are non-harmonic, so the sum's minima WANDER in theta as
the amplitudes trade — and both are still even in θ, so the mirror is untouched.
**Frequency choice is what moves a crease between columns; amplitude only
changes how deep it is.**

⚠️ **And the two available measures of "does it read as curls" DISAGREE**, so
treat neither as settled. Counting crease RUNS (a minimum persisting within
±2px on the next row) makes the delivery look fine — mean run 2.30 rows against
the concept's 3.22, i.e. shorter, not fluted — and says the real gap is sheer
quantity, 340 runs against 2437. A column-concentration measure says the
opposite. Until one is written down as a script with its definition in its
header, use `measure:strands` for DIRECTION and score the hair on the eye.

### ★★ Theta-modulation cannot scallop a silhouette — and paint did not save it

Four rounds on Mimi raised her measured strand count 3% -> 27% and moved her
`hairMass` score from 2 to 2. The rounds are worth the space because each failed
for a different, findable reason, and the last one failed AFTER the geometry was
ruled out.

**Why geometry cannot do it.** Three measurements, none of them arguable:

1. **The CONCEPT's own hair outline is nearly smooth.** Local roughness against
   a 9-row moving average: mimi 2.33% mean / 3.59% p90, grizz 1.59 / 1.63,
   bubbles 1.04 / 2.32. The curls were never read from the silhouette, so
   scalloping the level table would make the outline JAGGIER than the drawing.
2. **A ring's outline is a MAX over its columns**, so `clump(theta)` can only
   push it OUT, never cut a notch. Measured on 48 columns at 9.5% amplitude the
   outline swings 0.9999-1.0950 — one-sided — against 0.9050-1.0950 for the same
   amplitude applied to the ROW's half-width. And only 6 of 48 columns sit within
   15 degrees of the outline tangents, so most of the resolution a higher column
   count buys lands where the silhouette cannot see it.
3. **The toon ramp quantises lighting**, flattening whatever interior relief the
   clump does buy.

**★ AND THEN ALBEDO WAS TRIED, AND IT READ AS STRIPES.** If the ramp eats
lighting, paint the crease instead: band trough vertices to a second declared
hair swatch (`HAIR_DARK`, already declared and unused on the mesh, so zero
triangles and no palette change). Prominence went 154% -> 326% and it looked,
to me, like a clear improvement.

The critic — asked point blank whether it read as curls or as stripes — said
**stripes**, and measured it: 80.2% column-concentrated against the concept's
34.6%, *unchanged from the 78.6% before painting*. The score went DOWN.

The reason is the same one that defeated rounds two and three: the trough test
is `a6*cos(6θ) + a10*cos(10θ) < k*(a6+a10)`, and with `a6` (0.095) dominating
`a10` (0.062) the minima barely move with row. Painting a fixed-theta trough
does not make a clump — **it draws a full-height stripe and makes the flute
MORE visible.**

⚠️ **So the open problem is genuinely 2D, and nothing tried so far is.** A curl
clump is localised in theta AND z; every attempt here has been a theta pattern
with a row-varying knob, which is not the same thing. The next attempt needs a
trough test that is a function of both — and it should be judged by
column-concentration, not by strand count or prominence, both of which improved
while the read did not.

## ★ A CHARACTER SHIPPED CUT IN HALF (and what that says about enclosure tests)

Zippy's delivered board carried a 21-pixel band — 0.150ft, at 56% of her figure
height — with NO figure pixels in it. Background, straight through her body,
front and profile both. Her tee's hem ring sat at z 1.755 and `LEG_STATIONS`
began at 1.560, so 0.195ft of her had no geometry: **she had no pelvis.** She had
been reviewed, scored 4/4/4/4/4/4, and recorded as a finished candidate.

- **★ AN ENCLOSURE TEST CANNOT SEE A SEVERANCE, AND THAT IS STRUCTURAL.**
  `silhouette.lint` floods the backdrop in from the frame edge and measures the
  largest pocket left over. A gap that runs clean through the figure is OPEN AT
  BOTH SIDES, so the flood reaches it from outside and it is never a pocket.
  Rubric 3.7's "no holes, gaps or open interiors" was being enforced only for
  holes the backdrop cannot walk INTO — and a body in two pieces is the one
  shape that escapes that test while being the worst thing on the list.
  `continuity.lint.test.js` now asks the complementary question: is there a row
  inside the figure with nothing in it?
- **Scan the whole roster the moment you find one.** Three kids were severed:
  zippy 0.150ft, cricket 0.035ft at the neck/shoulder in ALL FOUR views, rocket
  0.014ft. Two are still shipping, in that gate's debt list.
- **The cause is always two forms that do not meet**, and usually a GARMENT ring
  authored as if it were the body: a hem is where cloth ends, not where the kid
  ends. Check every level table's bottom row against the limb stations below it.
- **Fixing it can cost nothing.** Zippy is the roster's tightest kid — 6984 of
  7000 LOD0 triangles, 16 spare — and three pelvis rows measured 7086 and refused
  the export. MOVING the existing bottom ring down instead of adding rings closed
  the gap for zero triangles. Prefer a moved ring to a new one whenever the
  budget is tight.
- **⚠️ But moving a ring stretches the band it belongs to, and vertex colours
  interpolate across a band.** The hem's colour switch then fell INSIDE the tall
  new band and ramped navy to pink across 32px — a critic called it "hiding half
  her shorts", and it cost more in `clothingConstruction` than the severance had.
  Put the threshold ABOVE the stretched band so the whole band is one colour and
  the ramp lands in a short one (32px -> 11px here). A colour switch belongs on a
  ring, never between two distant ones.

## The Nyquist scan (the curl fix's per-kid backlog), and who is still failing it

Run this over the roster before planning any hair work. Every `cos(kθ)` in a
clump is a lobe count; the `segments = N if detail >= 2` beside it is the column
count. A ring can only EXPRESS lobes up to S/2, and a crease only READS at about
S/4:

```bash
grep -n "segments = \|cos(.*theta" scripts/v2/blender/sculpt-<slug>-source.py
```

Scanned 2026-08-16, worst first (Mimi already fixed at 48/12 = 4.00):

| kid | builder | cols | lobes | col/lobe | |
|---|---|---|---|---|---|
| calls_shot | build_hair | 10 | 6 | **1.67** | ★ UNREPRESENTABLE |
| wheelchair_ace | build_hair | 12 | 6 | 2.00 | at the floor |
| diva | ring_loft_mane | 18 | 8 | 2.25 | soft |
| sprout | build_hair | 24 | 5, 9 | 2.67 | soft |
| gizmo | ring_loft_cap | 17 | 6 | 2.83 | soft |
| dex | build_curls | 18 | 6 | 3.00 | soft |
| sniffles | build_curls | 18 | 6 | 3.00 | soft |
| cricket | ring_loft_cap | 18 | 6 | 3.00 | soft |
| chip | build_hair | 20 | 6 | 3.33 | soft |
| grizz | build_afro | 24 | 6 | 4.00 | ok |

⚠️ **This is a grep over builder NAMES, so treat it as a candidate list, not a
census** — a hair builder called something else is invisible to it, and that is
exactly the silent-gap failure this file keeps recording. Check the kid you are
about to work on by hand.

**And a lint was considered and deliberately not written.** The rule is
mechanical and would have prevented all of this, but every expression of it
depends on matching builder names by regex — so the gate would go quiet the
first time someone names a builder `build_locks`, and a gate that fails silently
is worse than a table you have to read. If it becomes a lint, it must enumerate
from the ROSTER and refuse a kid it cannot find a clump for, never skip them.

## Two open questions, recorded so nobody re-derives them from scratch

- **"A full frontal eye renders on the SIDE plane in profile"** — reported
  independently by critics on Sprout, Bubbles and Mimi, and the eye IS clearly
  readable in Sprout's profile board. But the diagnosis is NOT established.
  The profile camera is a true 90-degree ORTHOGRAPHIC side view (camera at
  (12, 0, 2.2) in `render-fidelity-views.py`), and the arithmetic does not
  obviously support a wrap: `face_island_uv` maps `uf = 0.5 + 0.5·bearing/
  face_bearing`, so an eye whose outer edge sits at cell x ~89 of 128 is only
  ~20 degrees off the nose, where a mark compresses to about sin(20) = 34% of
  its width rather than disappearing. A large eye foreshortened to a third of
  its width can still read as "a full eye", which is the innocent explanation.
  ⚠️ Settle this by measuring the eye's WIDTH in the profile board against its
  width in the front board and comparing the ratio to sin(bearing) — do not
  sculpt against it until that number exists. ⚠️ And BOUND that probe to dark
  runs flanked by SKIN on both sides: a plain widest-dark-run scan over the head
  measures the HAIR. Tried naively on Sprout it returned 216px front against
  179px profile, a ratio of 0.83 that looks like damning evidence and is
  entirely his mop. The failure class this file already names — a quantity read
  down a line that passes through more than one object — applies to the eye as
  readily as to the shoe. Three critics agreeing is not a
  measurement; it is three people looking at the same ambiguous picture.
- **Bubbles has a rectangular slot cut into her hair shell** at ear height
  (`bubbles-profile-review.png` x 280-297, y 220-268) — hard corners, both
  sides, clearly artificial. She builds no ear and cuts no slot deliberately,
  so it is a geometry artifact, most likely the hair's tuck clamp folding
  against the skull (`skull_front_y`'s sentinel is the usual suspect — see
  Bubbles' own no-skull lesson). Her next round owns it.

★ AND ONE PROCESS NOTE FROM GETTING THIS WRONG. The slot above was dismissed
once as "just her eye seen at a grazing angle", because the check was run on her
runtime HERO instead of the profile board the critic actually cited. **Crop the
region the finding names, not a picture of the same character.** That is the
same rule this file gives critics, and it applies to whoever is reading them.

## ★★ THE LESSONS IN THIS FILE WERE NEVER SWEPT ACROSS THE ROSTER

The single biggest finding of the 2026-08-16 audit is not any one defect. It is
that **almost every defect found was a lesson already written down here, fixed on
the character that discovered it, and left broken on everyone else.**

| the lesson | who paid for it | who still had it |
|---|---|---|
| a bill shorter than its dome projects nothing | Theo (batch 6) | Chip (backwards), Ace (2.4 deg) |
| an inboard arm station with no `SHOULDER_BLEND` shears a fin | Peaches (batch 5) | smokey, boomer, clover, cricket, gizmo, rocket |
| an ascending ring-loft table renders a backface void | Bendy (batch 2) | Bubbles (eight rounds later) |
| the analyser's "mouth" lands on the NOSTRILS | Sprout, Flash | noodle — and it reached his gate TARGET |
| a lobe count above columns/4 is unrepresentable | (found this round) | 10 kids |

Writing the lesson down stopped the SAME character regressing and did nothing
for the other twenty-nine. So when a round produces a lesson, the round is not
finished:

1. **Express it as a scan** over all thirty sculpt scripts, not as prose. Every
   one of the rows above is a grep or a few lines of Python — inboard stations
   without a blend entry, `BRIM_REACH` against its dome front, lobe count
   against column count, level tables that ascend.
2. **Run the scan and put its OUTPUT in the lesson**, named kid by kid, so the
   next person inherits a work list instead of a warning.
3. **Prefer a lint where the property is mechanical.** A scan run once decays;
   `continuity.lint.test.js` exists because "is the figure severed" is checkable
   forever. Where a lint would be brittle (matching builder names by regex), say
   so in the lesson and keep the scan — but never leave it implicit.

⚠️ And check the scan against a kid nobody has reviewed before trusting it. The
shoulder scan above predicted six kids; Smokey's critic had independently found
the fin on him, and cropping Gizmo's A-pose — unaudited at the time — showed the
same dark angular wedge at the sleeve/torso junction. A scan that agrees with a
critic on one kid and with the art on a second is worth acting on.

## ★ A gate that only runs at `candidate` switches off when you need it most

`authored-character.test.js` binds a character's six scores to the sha256 of the
board they were read off — the Mimi failure made mechanical, so a score cannot
outlive the mesh it describes. That check lived inside `if (claimsFinished)`,
i.e. it ran only at status `candidate` or `approved`.

**So demoting a character to `needs-polish` un-gated it.** And `needs-polish` is
precisely where the iterating happens, which is where a score most easily
outlives its board. The 2026-08-16 audit demoted twenty characters and silently
switched the check off for every one of them; ace_kid's bill was then
re-sculpted, his board re-rendered, his scores left bound to the previous board
— and the whole suite stayed green.

Proven rather than argued: with the old gate, corrupting `scoredBoardSha256` on
a `needs-polish` kid passes all 15 tests. With the check moved out of
`claimsFinished`, it fails.

**The general rule: ask what a status guard TURNS OFF, not just what it lets
through.** The other checks in that block belong there — it is reasonable not to
demand hero and run evidence from a kid still being built. It is never
reasonable to let a SCORE float free of the board it was read from, and the two
kinds of check had been bundled under one condition because both happened to be
about "finished" characters.

⚠️ And note what hid it: `npm run apply:critique` re-binds the hash on every
write, so the invariant held in practice while the gate that enforces it was
dead. **A tool that keeps an invariant by construction will mask a gate that has
stopped checking it** — which is an argument for the break-test, not against the
tool.

## A critic may argue against a decision; that is not a defect report

Grizz's re-audit filed "SPLIT THE LEGS. Undo the 10deg hip adduction from the
2026-08-15 stance pass and restore daylight between thighs, calves". That
adduction is a DELIBERATE, per-character, calibrated decision — `LEGS_IN_BY_ID`
in `render-fidelity-views.py`, with the residual ankle-daylight OFF recorded as
an instrument conflict (the concept side reads 0.00 through flood CONTAINMENT of
a drawn-closed outline) rather than as a stance regression. The critic could not
know that; it sees a board and a drawing.

**So separate the two kinds of finding before acting on any of them:**

- **"This does not match the drawing"** — a defect report. Act on it.
- **"This decision was wrong"** — an argument, and it is arguing with a record
  it has not read. Put it in `polishFindings` marked as CONTESTED, with the
  record's own reasoning beside it, and let the maintainer settle it.

Undoing a calibrated decision because a fresh reviewer disliked it is how a
project loops: the stance pass exists precisely because an earlier round chased
ankle daylight by moving a mesh off its bones. **A critic's job is the board;
the record's job is remembering why.**
