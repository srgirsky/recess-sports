# Critic brief — how an independent critic scores a character

The [quality rubric](character-quality-rubric.md) says WHAT each of the six
categories means. This brief says HOW a critic applies it, so two critics on the
same build give the same scores and a build that meets the rubric gets the score
the rubric promises. Hand a critic this file, the rubric, the character's id and
slug, and what changed. Nothing else is needed.

## Why this exists

Until 2026-11-16 each critic was briefed ad hoc: zoom to 4x and beyond, compare
against the painted turnaround, "be strict", and treat 4 as "shippable with
minor notes". Under that brief about twenty hair rebuilds across four kids
cleared every finding they targeted and moved no score, because at 4x against a
painting a critic can always name one more difference, and any named difference
was held to cap the category at 3. Two facts showed the bar had drifted above
the rubric and above the maintainer's own:

- The rubric's 4 for hair is "one designed mass; hairline reads from the front
  as well as the side; no bare-skull read from any gameplay angle". Builds that
  met those words were scored 3.
- Junebug was approved by the maintainer on 2026-08-12 at 4 in every category.
  Later critics marked her hair to 3.

The maintainer's instruction (2026-11-16): the criteria must not be so harsh
that the goal cannot be met. This brief does not lower the rubric. It makes
critics score against it.

## Who scores

Unchanged, and not negotiable: **whoever built or changed the model never scores
it.** A critic is a fresh agent that has seen neither the sculpt script nor the
builder's opinion of the result. Agents can produce `candidate` at most;
`approved` is the maintainer's.

## What to look at, and at what size

Score from the in-game captures first (`docs/v2/concepts/<slug>-runtime-*.png`);
the offline boards settle shape questions only.

| View | Size | What it decides |
|---|---|---|
| Hero, run, swing, the four faces | the capture as saved, no magnification | the score for every category |
| The figure reduced to 40px tall | downsample the hero | 3.6, and the "one memorable read" |
| 2x on one region | only to confirm something already visible at native size | whether a visible thing is a defect |
| 4x and beyond | never for scoring | polish findings only |

A player sees a kid at the hero capture's size on the draft card and far smaller
in the field. A difference that needs more than 2x to see is not something a
player sees, so it cannot lower a score. Write it down as a polish finding.

## The target is the kid, not the painting

The turnaround is a painted illustration; the game is a low-polygon toy-like
model. The question for each category is **"is this recognisably and
appealingly that kid, built with care?"**, not "how does this differ from the
painting?". Painted qualities a game model is not expected to carry (individual
strands, soft cloth folds, sub-surface skin) are not defects. Their absence is
the medium.

## The scale

Use the rubric's own category rows. In short:

- **5** — the rubric's 4, plus the **5** clause in that category's row. Where the
  row has no 5 clause: nothing at native size or 40px that a player would call
  wrong.
- **4** — meets the rubric row as written, at native size and at 40px. Polish
  findings may exist. A 4 is not "no findings"; it is "the rubric row is true".
- **3** — the rubric row is mostly true, but one of its clauses fails in a way a
  player would notice at native size.
- **2** — the category reads as the wrong thing at native size (hair that reads
  as a hat; a garment a limb passes through in a standard capture).
- **1** — broken: a hole, a missing part, an inside-out surface.

Calibration anchors, so the scale cannot slide up either:

- A hair mass that is a smooth featureless blob caps at **4** (rubric 3.3).
- Separate primitives a player would count (balls, plates, cones on a cap) at
  native size are a **3** on hair.
- A limb through a garment in the hero, run or swing capture is at most a **2**
  on clothing; a fleck of a few pixels is a finding.
- A category the change did not touch keeps its recorded score unless the
  current captures contradict it. Say which.

## Renderer facts that are not defects

- Every separate surface gets a thin contour in `#26333f`. A thin line of that
  colour where two parts overlap is the outline.
- Downward-facing surfaces take a blue fill light.
- Same-colour sleeves carry a deliberate darker underarm shade.
- The swing capture shows an effort face by design.
- One small accent per kid is tinted with the team colour.
- `measure:fidelity`'s visible-face split is taken at the centre of the head's
  bounding box; hair that leans to one side makes it read lopsided when the face
  is not. Its head metrics abstain or misread on kids with no visible neck.

## What to write

One JSON file, exactly this shape and no other keys:

```json
{
  "id": "<id>",
  "scores": { "frontProfileSilhouette": 0, "headBodyProportions": 0, "hairMass": 0,
              "clothingConstruction": 0, "faceExpressionRead": 0, "heroAndFieldScale": 0 },
  "notes": { "<the same six keys>": "which rubric clauses hold and which fail, at native size, naming the capture" },
  "measured": "the measure:fidelity output with its numbers",
  "polishFindings": [ "concrete, fixable; most visible first; say the size it was seen at" ]
}
```

Each note says which clause of the rubric row decided the score. "Stays 3
because a new defect replaced the old one" is not a reason; "3.3's 'hairline
reads from the front' fails in face-grin at native size" is.

Do not edit, rebuild or re-render anything. `npm run measure:fidelity -- <id>`
is read-only and may be run; a non-zero exit is normal.
