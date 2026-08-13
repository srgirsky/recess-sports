# Character production playbook

This is the repeatable path from a roster entry to a signed-off Recess Sports
character. It defines review gates and evidence; it does not restate the asset
or animation contracts.

## Sources of truth

| Question | Owner |
|---|---|
| What must all hold for a character to be done? | `docs/v2/character-quality-rubric.md` |
| Who is the character? | `src/data/characters.ts` |
| What should their sculpt, motion and voice communicate? | `docs/v2/character-performance-brief.md` |
| What may a model or animation file contain? | `docs/v2/asset-contract.md` and `docs/v2/animation-brief.md` |
| How does personality select body and face acting at runtime? | `src/v2/render/performance.ts` |
| How are assets generated, checked and reviewed? | `README.md` |
| Which source/runtime hashes and visual scores were approved? | `assets/v2/source/character-production.json` and `character-fidelity.json` |
| Which concept file, `.blend` and traits belong to an id? | `scripts/v2/character-registry.json` |

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
| E | Establish Blender as the upstream editable mesh source. |
| F | Form the large silhouette before small detail. |
| G | Groom hair and accessories against the field-scale read. |
| H | Hold a face/expression review at hero scale. |
| I | Integrate the canonical rig without changing its contract. |
| J | Joint-test shoulders, elbows, wrists, hips, knees and ankles. |
| K | Keep useful LODs and the four material slots. |
| L | Generate the concept/runtime front, profile, hero and 40 px fidelity board. |
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

Produce characters in batches of at most five, chosen so no two sculpts in a
batch touch the same file. Mimi's earlier approval was revoked because Blender
provenance and manually entered scores did not prove visual fidelity. Junebug is
the reference sculpt and the only approved character; procedural validity is not
sculpt completion, so a generated GLB is a placeholder however cleanly it
validates.

One pull request per batch, carrying a separate review block per character. Two
rules make a batch as safe as the single-character pass it replaces:

- **The sculptor never scores its own work.** An independent critic scores §3
  from freshly rendered boards, and every score cites the evidence file it was
  read off.
- **`npm run measure:fidelity -- <id>` runs first** and settles anything it
  covers before a 1–5 score is discussed. `authored-character.test.js` requires
  the run to be recorded against the same board the scores are bound to.

Batches are chosen to retire the roster's shared vocabulary — eleven hair
styles, five accessories, six garment kinds across thirty kids — rather than by
roster order, so each batch teaches the shared sculpt library something the next
one reuses.

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
request. The thirty roster turnarounds merged in PR #119 are direction-locked as
a set; a change to one of them re-opens this gate for that character only.

The id a character is registered under and the slug its art was drawn under
differ for eleven of the thirty (`ace_kid` is drawn as `ace`). That mapping has
exactly one home, `scripts/v2/character-registry.json`; add a character there
before expecting any tool to find their board.

## Gate 2 — sculpt review

Build the character on the canonical skeleton and keep an editable Blender
source under `assets/v2/source/`. Review the bind pose from the front, side,
three-quarter and back before spending time on animation polish.

Run `npm run measure:fidelity -- <id>` before scoring anything. It reads the
delivered front render and the approved turnaround with one detector and settles
head proportion, garment colour split, visible face and ankle daylight; where it
reports a number, the number wins over an eye score. A metric it reports as
`NOT MEASURED` is not a pass, and it is not a finding about the character
either — it means the detector failed, and the detector is the first thing to
check. Do not write it up as "this kid is drawn without much neck" until the
mask has been looked at.

Then generate the side-by-side board and score all six mandatory categories:
front/profile silhouette, head/body proportions, hair mass, clothing
construction, face/expression read, and hero plus 40-pixel gameplay read. Name
exactly five defining traits in the production receipt; approval requires every
trait to survive the delivered model, every category to score at least 4/5, and
an explicit human approver/timestamp bound to the current board hash. A score
entered by the agent that built the asset can only produce `candidate`.

Record the board's hash beside the scores as `scoredBoardSha256`. The board
prints the scores and the status, so take that hash from a board rendered
**after** the scores are written — the same ordering trap the approval hash has.
A score that is not bound to the current board is the Mimi failure, and it is now
an automated one.

Approval means:

- the large silhouette matches the approved target;
- shoulders, elbows, wrists, hips, knees and ankles read as connected forms;
- face, hair and accessories remain clear at both hero scale and field scale;
- signature clothing keeps its authored palette, with team colour confined to
  a deliberate accent surface;
- hands, shoes and props support the character rather than becoming the focal
  point;
- the model deforms cleanly through stance, contact, run and a deep crouch.

Reject a technically valid model that only works in the bind pose. Technical
validation is the next gate, not a substitute for this one.

## Gate 3 — asset acceptance

Export through `npm run export:authored-character -- <id>`, regenerate the model
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
and at 40 px. The page must report `model model`; `?proxy=1` is the deliberate
A/B fallback and is never fidelity evidence. Refresh the hero, run and contact
stills with `npm run capture:character-evidence -- <id>` — it drives the same
review page headless, refuses a proxy fallback, and catches the contact marker
flash, so the board never composites stale hand-shot captures. Watch
transitions into the clip and into its declared settle clip; the pose at one
attractive frame is not enough.

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

Use this review block **once per character** in a batch pull request:

```text
Character: <name> (<id>)
Direction: approved — <concept link>
Sculpt: approved — <look-review screenshot>
Measured fidelity: <n>/<n> metrics inside tolerance — <measure:fidelity output>
Fidelity: approved — <side-by-side board and six scores, critic ≠ sculptor>
Motion: approved — <animation-review screenshot or recording>
Face/voice: approved AI master | fallback retained — <draft-flow + audio evidence>
AI voice: <model · generator · stock voice · speed · license/disclosure check>
Integration: approved — <gameplay evidence>
Automated gates: <commands and results>
Known follow-up: none | <explicitly scoped item>
```

An unchecked gate is a visible production status, not an invitation to call the
character finished.
