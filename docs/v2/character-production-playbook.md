# Character production playbook

This is the repeatable path from a roster entry to a signed-off Recess Sports
character. It defines review gates and evidence; it does not restate the asset
or animation contracts.

## Sources of truth

| Question | Owner |
|---|---|
| Who is the character? | `src/data/characters.ts` |
| What should their sculpt, motion and voice communicate? | `docs/v2/character-performance-brief.md` |
| What may a model or animation file contain? | `docs/v2/asset-contract.md` and `docs/v2/animation-brief.md` |
| How does personality select body and face acting at runtime? | `src/v2/render/performance.ts` |
| How are assets generated, checked and reviewed? | `README.md` |

If two of these disagree, fix the owning source rather than copying the fact
into another file.

## A-to-Z operator checklist

This is the literal desk checklist. The gates below define what approval means;
this list defines the order in which a producer moves one character through
them.

| Step | Action |
|---|---|
| A | Audit the roster entry and character id. |
| B | Brief sculpt, motion, voice, read and “avoid” direction. |
| C | Create the front/side/back concept target. |
| D | Direction-lock the concept and any roster-copy change. |
| E | Establish the editable Blender source. |
| F | Form the large silhouette before small detail. |
| G | Groom hair and accessories against the field-scale read. |
| H | Hold a face/expression review at hero scale. |
| I | Integrate the canonical rig without changing its contract. |
| J | Joint-test shoulders, elbows, wrists, hips, knees and ankles. |
| K | Keep useful LODs and the four material slots. |
| L | Look-review the delivered model and proxy A/B. |
| M | Manifest the validated runtime model. |
| N | Nail rest, run, stance, contact and follow-through language. |
| O | Override only the approved character-specific clips. |
| P | Performance-review transitions, markers, feet and 40 px read. |
| Q | Quality-gate models, motion and ground contact. |
| R | Rights-check the voice tool, model, stock voice and disclosure. |
| S | Shortlist at least two non-cloned stock AI voices. |
| T | Test local auditions against the exact roster-authored line. |
| U | Update the selected voice and speed in the AI cast source. |
| V | Validate the promoted lossless voice master. |
| W | Write the runtime MP3 and player-facing AI disclosure. |
| X | Experience the complete character in draft and gameplay. |
| Y | Yield screenshots, audio evidence and gate results in the pull request. |
| Z | Zero open production follow-ups, then merge to ship. |

## Production rule

Finish one character through every gate before starting the next. Junebug,
Theo and Zoom are completed gold-standard signature passes; Big Lou and Tank
have completed Batch 1 passes. Their shared quality and movement language is
the approval baseline for the remaining roster; Batch 1 finishes with Mimi
Mash.

Use one pull request per signature character. Later production batches may
share a pull request when every character has separate review evidence.

## Gate 1 — direction lock

Start from the character's section in the performance brief. Create or approve
a front, side and back visual target showing the intended silhouette, face,
hair, clothing construction and footwear. The image is art direction, not a
replacement for the editable source scene.

Approval means:

- the character is recognisable without their name or team colour;
- the silhouette has one memorable large read and no competing small gimmicks;
- the sculpt, motion, casting and “avoid” notes tell the same story;
- any deliberate change from the roster description is written into the owning
  character source before modelling begins.

Save approved targets under `docs/v2/concepts/` and link them from the pull
request.

## Gate 2 — sculpt review

Build the character on the canonical skeleton and keep an editable Blender
source under `assets/v2/source/`. Review the bind pose from the front, side,
three-quarter and back before spending time on animation polish.

Approval means:

- the large silhouette matches the approved target;
- shoulders, elbows, wrists, hips, knees and ankles read as connected forms;
- face, hair and accessories remain clear at both hero scale and field scale;
- clothing reads as constructed clothing after team recolouring;
- hands, shoes and props support the character rather than becoming the focal
  point;
- the model deforms cleanly through stance, contact, run and a deep crouch.

Reject a technically valid model that only works in the bind pose. Technical
validation is the next gate, not a substitute for this one.

## Gate 3 — asset acceptance

Export through the repository's canonical delivery path, regenerate the model
manifest and run the model validator. Review the delivered file in the single-
character look page, not only inside Blender.

Approval means the asset contract passes unchanged, every LOD remains useful,
the face atlas maps correctly, team variants remain readable and the delivered
model still resembles the approved sculpt. Record the review URL and a current
screenshot in the pull request.

## Gate 4 — motion language

For a pilot, author the high-frequency movement language first: rest, run,
batting stance, contact and follow-through. Once that language is approved,
author the character's priority takes from the performance brief in their
partial animation delivery.

Review each character take on the animation page at all supported review rates
and at 40 px. Watch transitions into the clip and into its declared settle clip;
the pose at one attractive frame is not enough.

Approval means:

- feet plant and weight transfers feel intentional;
- the character's tempo and emotional size match their written direction;
- physics markers still land on the visible event;
- props remain convincingly held throughout the action;
- loops do not pop and one-shots settle without a second performance;
- the motion is recognisable as this character with the face hidden.

## Gate 5 — face and voice

Review the expressions selected for the character's hero, focus, win and loss
beats. Then review the authored draft line inside the draft flow with the model,
motion and face together.

The default production voice path is the free, local Kokoro model pinned by the
repository. It uses named stock voices only—no voice cloning, no imitation of a
named real person and no recording of a minor as model input. Run the complete
voice pass as:

```bash
npm run generate:ai-voice -- --audition <id>
# listen in assets/v2/voice-auditions/local/<id>/ and record the selection
# in scripts/v2/ai-voice-cast.mjs
npm run generate:ai-voice -- --ship <id>
npm run validate:voice-delivery -- <id>
```

The first run downloads the pinned q8 model into the ignored `.cache/`
directory. Later generation is local and needs no API key or per-line payment.
`--ship` promotes the selected take to the clean 48 kHz/24-bit mono master and
encodes the 24 kHz mono runtime MP3 from that master. Keep auditions outside
`public/`; never rename an audition into a master. Record the model, generator,
stock voice, speed, license check and review result in the pull request. Keep
the player-facing AI-voice disclosure visible before merging.

Approval means the face remains legible in motion, the line follows the
performance brief, and none of the character's listed caricatures or stereotypes
has entered through acting or casting. Listen both in isolation and in the
actual draft flow; technically valid audio is not approved acting.

## Gate 6 — game integration

Play the character through the places where players actually meet them:

- draft inspection, selection and team walk-on;
- batting stance, contact, miss and reaction;
- running and sliding;
- field-ready, catch and throw;
- win and loss presentation;
- at least two team palettes and the proxy A/B view.

Test a phone-sized viewport as well as desktop. A hero close-up cannot approve a
fielder who disappears against the grass, and a 40 px thumbnail cannot approve
a face that fails in the draft card.

## Gate 7 — ship

The character is done when the model, partial performance, manifest and owning
documentation land in the same pull request; the full automated gates pass; and
the pull request contains visual evidence for direction, sculpt, motion and
integration approval. Merging deploys the character—an open pull request does
not.

Use this review block in each character pull request:

```text
Character: <name> (<id>)
Direction: approved — <concept link>
Sculpt: approved — <look-review screenshot>
Motion: approved — <animation-review screenshot or recording>
Face/voice: approved AI master | fallback retained — <draft-flow + audio evidence>
AI voice: <model · generator · stock voice · speed · license/disclosure check>
Integration: approved — <gameplay evidence>
Automated gates: <commands and results>
Known follow-up: none | <explicitly scoped item>
```

An unchecked gate is a visible production status, not an invitation to call the
character finished.
