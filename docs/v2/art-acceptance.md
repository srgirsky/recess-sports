# Whole-game art acceptance

The target is a believable cartoon neighborhood at Backyard Baseball 2026's
presentation standard. Weight, construction, materials, expressions, readable
action and a consistent visual language matter more than photorealism.

## First approve a complete scene

The benchmark is **Parks Dept #2**, seed `art-benchmark`, on the actual game
surface. Capture a full at-bat and its outcome at the review instrument's desktop
and landscape-phone sizes, in daylight and at night. The receipt records the
actual batter and pitcher; do not replace them with a hero render. A fresh
browser uses the delivered assets and watch controls, with no player save data.

Compare with the reference corpus mapped by
[the existing reference notes](../research/backyard-2026-reference.md) and
[storyboard index](../research/bb2026-storyboard-index.md). Pin the specific
source and frames/time range in each review. Storyboard frames are useful for
composition; they are not continuous-motion evidence. Watch the reference
footage for timing and weight. Judge the presentation, not its baseball balance.

Fix the benchmark's observed problems before rolling the same construction or
lighting treatment across the roster and parks. A benchmark can fail. Do not
lower the rubric, relabel it approved, or manufacture a human verdict to continue.
Independent work on existing defects can continue while approval is pending.

## One inventory, existing sources of truth

`review:art` derives targets from `ROSTER`, v2's `VENUE_GEOMETRY`, and every
production `*Screen.ts`, then adds the benchmark and action/effect targets.
Its rubric and required capture slots live in `scripts/v2/art-review.mjs`.
The report displays exactly which views are absent. Its phone profile is
landscape; portrait, tablet and real-device checks remain part of layout/device
validation and must accompany release review when those surfaces are supported.

- **Characters:** draft and field views; in-game batting ready, load, contact
  and follow-through stills; continuous run, swing, catch, celebration, pitch,
  throw, pickup, dive and slide at both sizes. Preserve their silhouettes and
  personalities. A clip-preview rotation cannot establish in-game facing.
- **Parks and lighting:** plate, field and deep cameras, day/night, at both sizes.
  Inspect foreground, middle distance and skyline, including contact shadows,
  materials, repeated props and transitions into the sky.
- **Screens:** every screen at both sizes, including draft, team/venue choice,
  strategy, collection, season, pause and results. Inspect the rendered screen,
  with fonts and backgrounds loaded, not only its DOM boxes.
- **Actions:** contact, catches, throws, slides, home runs, replays and inning
  changes. Watch weight, intersections, camera cuts, the ball and the HUD together.

`character-fidelity.json` owns sculpt scores and findings;
`character-fidelity-triage.json` owns their sweep classification. This process
reads them and excludes `no-defect-note` from open-work counts. Do not copy or
rewrite those critiques into the whole-game ledger. A character cannot satisfy
the final parity gate while its existing sculpt status is unapproved.

`docs/v2/art/reviews.json` owns whole-scene reviews and non-sculpt findings.
Every finding needs an ID, owner, target IDs, observed problem, evidence and
acceptance condition. A `review-task` names missing coverage; a `defect` names
something actually observed. Never invent a defect from a missing screenshot.
Resolve findings with a note and the new receipt hash. Fixes still require a
new visual review before approval.

## Capture → critique → correction → approval

1. Run the appropriate technical checks for the change. Existing asset,
   animation, performance, layout and presentation gates remain binding.
2. Capture the **current source**. The benchmark command captures automatically;
   other targets use the existing game, animation, character and layout review
   surfaces. Match the generated slot IDs and viewports. A receipt has `target`,
   `sourceHash`, `capturedAt` and `evidence`; each item records its slot `id`,
   `kind`, URL, viewport, probe, `surface: "full-page"` and media files with their
   relative paths and SHA-256 digests. Motion uses ordered frames, `fps: 30` and
   `clock: "devPaint"`. The benchmark additionally proves `atBatCompleted`.
   A canvas-only capture cannot establish HUD or screen quality. Missing views,
   missing media, wrong sizes and short motion sequences remain incomplete.
3. Have a reviewer other than the asset author inspect full-size images and
   continuous motion. Give every assigned rubric criterion a `pass` or `fail`
   plus concrete observations. Reference frame/time comparisons are mandatory.
   A score average cannot conceal an unreadable face or broken contact.
4. Turn failures into owned findings. Correct the asset or presentation, run its
   gates, recapture and re-review. Do not reuse old pixels after changing a light,
   material, camera, model, animation or effect.
5. Present the concrete evidence and critique to the maintainer. Only record
   approval after an explicit verdict. The agent may prepare evidence and record
   its own observations; it may not invent an independent reviewer or human
   approval. Retain prior reviews and approvals verbatim in `history` when
   superseded. This process is not permission to replace existing human verdicts.

## Action review procedure

The generated matrix is the coverage checklist. An image or movie existing is
only **captured**, not **reviewed**. Missing coverage stays incomplete, and
unwatched media stay awaiting review. Never infer a pass from another kid,
another phase, a successful capture command, or a technical test.

For each character/action packet, watch the entire motion at normal speed,
then scrub its anticipation, event, follow-through, recovery and transitions.
Inspect the production camera with the HUD first; side/front diagnostic views
may explain an issue but cannot replace that view. Repeat at both review sizes.
Check these relationships explicitly in the rubric notes, citing frame/time:

- **Direction:** eyes/head track the intended ball or target, shoulders and feet
  make sense for the role, and travel agrees with the pose. Check both teams
  after a half-inning switch and any supported handedness variants.
- **Hands and props:** palms/fingers enclose the intended handle or pocket;
  hands stay attached when required; wrists/elbows bend plausibly; bat, glove
  and ball appear/disappear at the right beat without penetrating the body.
- **Event contact:** the bat meets the incoming ball, the ball reaches the
  glove before a catch, and a throw leaves the throwing hand. A named marker
  and peak hand speed do not establish spatial contact.
- **Ground and motion:** feet support the pose, running does not skate,
  jumps/dives/slides have weight, and blend/recovery poses do not snap, hover,
  fuse limbs or fall back to a bind pose.
- **Readability:** the ball, controlled kid and next action remain readable
  through camera cuts, replay, inning changes, day/night and occlusion.

Log each observed failure immediately in `docs/v2/art/reviews.json`: existing
ID or a new ID, owner, affected character/action targets, exact phase/time and
evidence, observable acceptance conditions. Record suspected shared causes as
hypotheses until swept; do not mark every uninspected character defective.
Use `review-task` for missing coverage and `defect` for observed failures.
Keep sculpt findings in their existing fidelity ledger and link them here.

Fix one cause per iteration: reproduce → add a measurable regression where
possible → correct the shared code or affected assets → recapture → review the
affected roster and adjacent transitions. Resolve only with fresh evidence and
the existing independent-review/maintainer process. An automated geometry
check reduces recurrence; it never certifies acting quality or every possible
game state. The batting diagnostic is a first narrow sweep, not that promise.

A review record is keyed by generated target ID:

```json
{
  "receipt": "docs/v2/art/evidence/benchmark-park/receipt.json",
  "review": {
    "author": "actual asset author",
    "reviewer": "actual independent reviewer",
    "at": "ISO timestamp of the review",
    "evidenceHash": "SHA-256 of JSON.stringify(receipt)",
    "reference": {
      "source": "source URL or named reference corpus",
      "framesOrTime": "specific frames or video time range",
      "comparison": "what the reviewer observed in both"
    },
    "criteria": {
      "identity": { "verdict": "pass or fail", "notes": "observations" }
    }
  }
}
```

Supply **all** criteria listed for the target, not just the example's identity.
After explicit approval, add `approval` with `by`, `role: "maintainer"`, `at`,
`note` (the actual decision) and `reviewHash` (SHA-256 of
`JSON.stringify(review)`). These hashes establish freshness, not the truth of
an aesthetic judgment or a person's identity; review remains a human process.

Capture output lives in ignored `.art-review/`. For a durable review, copy its
receipt and media into a committed evidence directory under `docs/v2/art/`,
update the relative media paths, and compute the evidence hash **after** that
move. Keep unreviewed bulk capture output out of git. Do not add a review record
pointing to files that only exist on one machine. The report itself is generated.

## What is enforced

CI checks the inventory/ledger contract and any recorded approval's evidence.
Mutation tests demonstrate that source changes, edited media, missing views,
self-review and changed verdicts cannot preserve acceptance. Source hashing is
conservative: runtime source, shipped assets (including shared fonts), build inputs and review
instruments invalidate captures; documentation edits alone do not. This can
require recapturing an unchanged-looking scene after a shared code change.

Ordinary CI permits unfinished art and reports it honestly. The explicit
`check:art-parity` command succeeds only when the benchmark, every generated
target and every sculpt in the existing ledger are approved. It is not a test
that should be weakened to merge incremental work. Passing it supports the
recorded presentation claim; child playtesting and real-device performance
remain separate acceptance work.

Commands and output paths are in [README](../../README.md#whole-game-art-review).
