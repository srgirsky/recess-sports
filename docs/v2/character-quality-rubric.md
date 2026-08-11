# Character quality rubric — the full checklist

One page that defines what "this character is done" means. The
[production playbook](character-production-playbook.md) owns the *process*
(gate order, who approves, what evidence is filed where); this rubric owns the
*checklist* — every item that must hold, how each is checked, and what passing
means. A character that cannot tick every box is not done, whatever it looks
like in one flattering screenshot.

Three kinds of item, marked in the **Check** column:

- **AUTO** — a command or test goes red on violation. Run it; do not eyeball it.
- **BOARD** — read it off the regenerated fidelity board
  (`npm run review:character-fidelity -- <id>`), which renders the *shipped*
  GLB, never the Blender viewport.
- **EYES** — a human judgement made against named evidence. The agent that
  built the asset may score it `candidate`; only a human art director's
  recorded approval makes it `approved` (`authored-character.test.js`).

## 1 · Technical contract — all AUTO

| # | Item | Check |
|---|---|---|
| 1.1 | GLB passes the asset contract (bones, slots, LODs, budgets) | `npm run validate:models` |
| 1.2 | Provenance: `.blend` source, concept and runtime hashes match the receipt | `npm test` → `authored-character.test.js` |
| 1.3 | Model is manifested (no silent proxy fallback) | `npm run manifest:models` + `manifest.test.js` |
| 1.4 | Rig sums to its height; no bobblehead; body vertically continuous | `skeleton.test.ts` |
| 1.5 | Clips match the contract table and both mirror docs | `clips.test.ts` |
| 1.6 | Every clip stands on the ground (no hover, no sink) | `groundContact.test.ts` |
| 1.7 | Draco/KTX2 decoders in sync | `sync:decoders --check` |

## 2 · Palette fidelity — AUTO + BOARD

The authored hex swatches in the sculpt script are the palette of record.

| # | Item | Check |
|---|---|---|
| 2.1 | Shipped COLOR_0, decoded linear→sRGB, matches the authored swatches both ways: every vertex colour is a declared swatch, every declared swatch survives | AUTO — `palette.lint.test.js` |
| 2.2 | Skin, uniform, hair read as the concept's colours on the board (board renders the shipped GLB, so a colour-space slip shows here) | BOARD |
| 2.3 | Signature palette declared (`recessIdentityPalette`); team colour confined to the declared accent surface (`recessTeamAccent`) | AUTO — `authored-character.test.js` |
| 2.4 | Both team palettes readable in game (accent tints, identity does not) | EYES — Gate 6 evidence |

## 3 · Sculpt and silhouette — BOARD + EYES

The six scored categories (each 1–5; **approval requires every one ≥ 4**):

| # | Category | What 4/5 means — and what 5/5 adds |
|---|---|---|
| 3.1 | Front/profile silhouette | Matches the locked turnaround's large read; recognisable with no colour. **5**: transitions between forms are organic, not butt-joined primitives |
| 3.2 | Head/body proportions | Child proportion per the turnaround, not the proxy; joints read as connected forms |
| 3.3 | Hair mass | One designed mass; hairline reads from the front as well as the side; no bare-skull read from any gameplay angle. **5**: sculpted strand grouping — a smooth featureless blob caps at 4 however correct its silhouette |
| 3.4 | Clothing construction | Garments read as constructed (cuffs, hems, soles, laces), not primitive volumes |
| 3.5 | Face/expression read | Features legible at hero scale; expression survives motion; face visible in the front board view. **5**: the face is a form, not a sticker — a real nose breaks the profile, no visible decal-island seam, features integrated with the skull's planes |
| 3.6 | Hero + 40 px read | Identity survives both the hero close-up and the 40 px field sprite |

Plus five binary board checks:

| # | Item | Check |
|---|---|---|
| 3.7 | No holes, gaps or open interiors visible in front or profile silhouette | BOARD |
| 3.8 | Accessories (headband, cap, chair…) sit on the body — no floating, no interpenetration that reads at hero scale | BOARD |
| 3.9 | The 40 px zoom strip still shows the character's one memorable read | BOARD |
| 3.10 | Ears are constructed — an outer rim, an inner shadow and a lobe against the skull, never a bare ellipsoid bump | BOARD |
| 3.11 | Arms read naturally at every clip angle — the shoulder stays a round deltoid form when the arm drops from bind pose, the elbow line stays continuous, and no pose reads as a stiff hinged cylinder | EYES — run + idle on the review page |
| 3.12 | Legs are two legs — daylight visible between the thighs and between the calves in bind pose, idle and run; overlapping leg volumes read as one mass | BOARD + EYES |
| 3.13 | The face's aspect ratio matches the turnaround's (measure both, don't eyeball) — a head sculpted narrower than its concept never reads as the same kid | BOARD vs turnaround |
| 3.14 | The mouth's emotion is readable at draft-card distance, not only in close-up — lips, teeth and tongue where a cell opens the mouth, never a stroke that collapses to a line | EYES — expression cells in gameplay lighting |

## 4 · Deformation and motion — AUTO + EYES

| # | Item | Check |
|---|---|---|
| 4.1 | Review page reports `model model` — proxy evidence is never fidelity evidence | EYES — `/v2/?anims=1&kid=<id>` |
| 4.2 | Run and contact stills saved as board deformation evidence | AUTO — `authored-character.test.js` requires them |
| 4.3 | Elbows/shoulders/knees stay continuous mid-clip (no tearing, no popped seams) | EYES — same page, run + swing at 1.0x and slow |
| 4.4 | Feet plant; loops don't pop; one-shots settle into `returnsTo` | EYES + `clips.test.ts` |
| 4.5 | Markers land on the visible event (bat meets ball) | AUTO — `validate:models` derivation + EYES |

## 5 · Face and voice — AUTO + EYES

| # | Item | Check |
|---|---|---|
| 5.1 | Face atlas maps correctly (cell 0 top-left; no mirrored/rotated face) | EYES — expression cycle on the review page |
| 5.2 | Expressions for hero, focus, win, loss beats legible in motion | EYES |
| 5.3 | Voice: pinned local model, stock voice, no cloning, disclosure visible | AUTO — `validate:voice-delivery` + Gate 5 |

## 6 · In-game integration — EYES

Meet the character everywhere a player does, desktop and phone viewport:

| # | Item |
|---|---|
| 6.1 | Draft card: portrait, name, voice line — face reads at card size |
| 6.2 | Batting: stance, contact, miss, reaction |
| 6.3 | Running and sliding |
| 6.4 | Fielding: ready, catch, throw |
| 6.5 | Win and loss presentation |
| 6.6 | Fielder does not vanish against grass/dirt at gameplay camera |

## 7 · Evidence and sign-off — AUTO + EYES

| # | Item | Check |
|---|---|---|
| 7.1 | Fidelity board regenerated at the current runtime hash | AUTO — receipt hashes |
| 7.2 | All six category scores + notes current in `character-fidelity.json` | AUTO — schema gate |
| 7.3 | Status honest: agent-scored = `candidate`; `approved` needs a human approver, timestamp, and board hash binding | AUTO — `authored-character.test.js` |
| 7.4 | PR carries the playbook's review block with links to all evidence | EYES — review |

## Definition of done

**Candidate-complete** (what an agent can deliver alone): every AUTO item
green, every BOARD item true on the current board, all six categories
honestly ≥ 4 with fresh evidence, integration walked and screenshotted.

**Done**: candidate-complete **and** a human art director has approved the
current board (7.3). Nothing an agent writes can substitute for that line.
