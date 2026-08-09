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

## Production rule

Finish one character through every gate before starting a batch. Junebug is the
gold-standard pilot; Theo and Zoom are the next two signature-character proofs.
After those three agree in quality and movement language, produce the rest of
the roster in the batches defined by the performance brief.

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
motion and face together. Voice delivery may remain on the stable system-voice
fallback until an approved master exists; never ship an audition as a master.

Approval means the face remains legible in motion, the line follows the
performance brief, and none of the character's listed caricatures or stereotypes
has entered through acting or casting.

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
Face/voice: approved | fallback retained — <draft-flow evidence>
Integration: approved — <gameplay evidence>
Automated gates: <commands and results>
Known follow-up: none | <explicitly scoped item>
```

An unchecked gate is a visible production status, not an invitation to call the
character finished.
