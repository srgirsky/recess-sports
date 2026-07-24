# Backyard Baseball 2001 — video reference notes

Source: "Backyard Baseball 2001 Gameplay" — YouTube `YMmqNpmA60U` (Humongous Fan Soundtracks, 47:56 long, 640×480 game capture). Measured by frame-stepping the video with exact `video.currentTime` timestamps, July 2026. Timestamps below are video times in seconds.

Purpose: ground-truth tuning reference for Recess Sports (pitch speed, pacing, HUD layout, presentation beats). Our behind-plate rig + bottom strip are modeled on this game, so this file records what BB2001 *actually* does, measured, not remembered.

## Segment measured so far: ~t=378–393 (top 1st, Cubs batting, Curt Schilling pitching, Vicki Kawaguchi at bat, 2 strikes)

### Batting view (t=378, the video's linked timestamp)
- Behind-plate camera. Batter drawn LARGE in rear view (roughly 40% of screen height), pitcher small on distant mound, front-facing.
- Right-edge swing cards, top to bottom: POWER, LINE DRIVE, GROUNDER, CRAZY BUNT, BUNT. Icon-forward cards with a bat/ball illustration each; cursor hovers to pick. (Our EdgeCards mirror this.)
- Yellow bracketed strike-zone box floats over the plate area; a "SQUEEZED?"-style chip sits under home plate.
- Bottom scoreboard strip: inning block far left ("BOTTOM OF" + number), two team rows (logo + name + score; CUBS 0 / other team 3), AT BAT block with portrait + name + position ("TONY DELVECCHIO · 1B") + today-line ("1 FOR 1 TODAY, 1 1B"), then labeled pips BALLS ○○○ / STRIKES ○○ / OUTS ○○, TIME OUT button far right.
- NOTE: BB2001 shows only TWO strike pips and TWO out pips (3rd = the event). Balls get three.

### Pitching view (t≈381–390, same camera)
- Same behind-plate camera when the HUMAN pitches (we differ: our human pitching also uses the rig — confirmed BB2001 does too).
- Right-edge pitch cards, top to bottom: HEAT, SLOWBALL, LEFT HOOK, RIGHT HOOK, INTENTIONAL WALK. Selecting flips the card to a highlighted blue state with a bat graphic across it.
- JUICE box (juice-carton art, "110%" flavor text) sits bottom-right BELOW the cards — the power-up currency lives on the pitching screen edge column, like our juice meter.
- Top-left: mini-diamond with mitt icons at each fielding spot + arrow chevrons (defensive positioning indicator).
- Top-right: "ON THE MOUND" plate — pitcher portrait + name + line ("CURT SCHILLING — 2 PT, 0 K, 0 BB").

### Pacing observations (measured)
- Pitch selection is PLAYER-PACED and slow-friendly: the human hovered cards from ~t=380 to ~t=389 (9+ seconds) with zero game pressure. No pitch clock. The game idles happily in the card-select state — and the PREVIOUS pitch's ball keeps resting at its crossing spot in the zone the whole time (it only vanishes ~1s before the next pitch, when the pitcher gets it back, t≈388.1 here).
- STRIKE! call: big red starburst banner with yellow outlined text, centered low over the plate, batter does an upset/arms-up reaction pose, pitcher reacts too. Banner persists 1–2s+.

### One full pitch cycle, measured frame-by-frame (HEAT, Curt Schilling = max-arm pitcher)
- t=389.066: no ball visible (last clean pre-flight frame).
- t=389.10: ball first visible, ALREADY well past the mound (mid-screen height, drawn with a smear/ghost trail).
- t=389.10 → 389.30: ball descends toward the camera growing rapidly; crosses into the zone marker at t≈389.30 with a dark grey impact aura.
- **Plate flight ≈ 250ms (release ~389.03–389.05 → arrival 389.30) for the fast pitch from a max-stat arm.** It reads as nearly instant on purpose — HEAT from Schilling is meant to be almost unhittable.
- Notably: no visible pitcher wind-up animation was caught even at 33–50ms sampling — the throw anim is extremely short (a frame or two) or nearly absent. The ball itself IS the pitch presentation.
- After the catch, the ball RESTS at its crossing spot in the zone (with grey aura) for ~1.0–1.3s: resting at 389.4–390.0, gone by 390.6 — at which point the pitcher already has the ball again and the next selection can start. **Catch → ready-for-next-pitch turnaround ≈ 1.3s.**
- The count pips did NOT visibly change for this pitch and the batter never reacted; the STRIKE! banner seen at t=393.2 belongs to the NEXT pitch (arriving ≈393.0). So a full pitch→pitch cycle here was ~4s, most of it player deliberation.
- The "ball rests where it crossed" display doubles as pitch-location feedback and is probably the single best steal for our game (we currently clear pitch visuals immediately).

## Second segment: Mikey Thomas at-bat → fly ball to RF → live play (t≈445–460)

### Pitcher idle (t≈445–446.5)
- While the human deliberates on the pitch cards, the pitcher TOSSES THE BALL UP and catches it on a loop (ball bobs ~a head-height above his glove). Charming, zero-cost idle — a strong candidate for our `pitcherSprite` idle instead of a plain bob.
- Selecting a card ANIMATES the card art (LEFT HOOK pops a boxing glove out of the card). Selection is a state flip + flourish, not just a highlight.

### The live play (contact ≈ t=453.2, all measured)
- t=452.5: still behind-plate view, batter in stance (pre-pitch). t=453.5: ALREADY in the wide 3/4 field view with the ball in the air and the batter leaving home. **Pitch → swing → contact → hard cut to wide view all fit inside 1 second. The cut is instant — no transition effect.**
- Wide view = the classic Backyard angled full-diamond iso view (fence, playground scenery, parked van visible — scenery matches venue). HUD collapses to a MINI scoreboard bottom-left: bat-icon + 2 team score rows + OUTS pips only. No count, no at-bat block during live plays.
- **Active-fielder read: the chaser (Kiesha, RF) stands on a GREEN GLOW disc and gets a floating NAME BUBBLE** (semi-transparent blue oval with her name). The name bubble visibly lags behind her when she sprints — it's a follower, not glued.
- **Landing preview: a colored disc drawn on the grass at the landing spot, reading orange-red as the ball descends** (big and saturated right before impact). Same job as our `FX.LIVE_MARKER` landing ring.
- **"OUT" is rendered as small yellow text on the field at the base where the out happened** (seen near the 2B path at t=460 as out #2 registered — batter apparently thrown out stretching). The play keeps rolling after the catch/landing; outs pop where they occur.
- A purple/blue puddle-like decal appeared near 2B during the play (special-ability or marker effect — unidentified; BB2001 has kid abilities that leave field decals).

### Measured speeds
- **Home → 1B ≈ 3.0s** (runner leaves home ~453.6, reaches the bag ~456.5–457.0).
- **Deep-fly hang time ≈ 2.0s** (contact ~453.3 → arrives at the RF fence area ~455.0–455.5).
- Fast pitch (HEAT, max-arm): **~250ms** mound → plate (measured in segment 1).
- After the play resolves, the wide view HOLDS for a beat (t=430 shows a quiet post-play wide frame with everyone reset), then cuts back to the plate view for the next batter.

## Third segment: bottom 1st — human bats vs a WEAK arm (t≈529–531, Annie Frazier vs Luanne Lui pitching)

### The slow end of the pitch range (measured frame-by-frame)
- Luanne Lui is a bottom-tier pitching stat (0 PT, teddy bear on the mound). Her pitch: released ≈ t=529.55 (ball already airborne just past her hand at 529.6), a HIGH LOB ARC that stays visible the whole way, arriving low-inside ≈ t=530.28.
- **Slow-arm pitch flight ≈ 700ms.** Combined with segment 1: BB2001's pitch corridor spans ~250ms (Schilling HEAT) → ~700ms (weakest arm). Even their SLOWEST pitch is ~1.8× faster than our 1250ms base travel.
- Slow pitches read differently, not just slower: the lob is a rainbow (visible from release, drops steeply into the zone) while HEAT is a laser (invisible until the last third). Speed range doubles as a readability range.
- **The batter DODGES inside pitches**: Annie leans back with hair flying while the ball is inbound low-inside — a reaction anim during flight, before any call. Great character beat (our `nervous`/`reactPose` machinery could host a `dodge`).
- Call presentation: ball arrives ~530.28 → BALL! red starburst visible by 530.5 (~200ms), holds ≥1.5s (still up at 530.8+, batter already back in stance under it). The BALLS pip fills BLUE (strikes fill YELLOW) ~0.5s after arrival. Pitcher's PT stat ticked 0→1 even on a ball (PT accrues per pitch thrown, apparently).

### Other finds in the bottom-half segment
- **Swing card stacks vary per batter**: Tony Delvecchio showed 5 cards (incl. CRAZY BUNT); Pete Wheeler shows only 4 (POWER, LINE DRIVE, GROUNDER, BUNT). Signature kids get signature cards — exactly our `ability` hook shape.
- When batting, the top-left mini-diamond becomes a **"Steal!" pad** (script lettering over a diamond); the batting card stack HIDES while the pitch is in flight and returns after.
- An **OPEN / SQUEEZED toggle button sits under home plate** (red arrow + oval button, label flips) — batting-stance/zone toggle, present the whole at-bat.
- The defending neighborhood team wears STREET CLOTHES (pink dress at SS, personal outfits everywhere — only pro guests wear uniforms). Same instinct as our draft-era street-clothes variant, but they keep it in-game for whole teams.

## Fourth segment: a steal race, caught stealing (t≈605–635, Pete Wheeler on 1B)

- With a runner aboard, the top-left mini-diamond "Steal!" pad gains a RUNNER CHIP + yellow arrow showing the available steal (1B→2B). Tap = send. Zero reading, state-driven affordance — very close to our STEAL! chips, but theirs lives on the mini-diamond itself.
- t=620 (mid-race, wide view): the catcher's throw is airborne toward 2B while Pete sprints — and **the running kid draws a YELLOW MOTION TRAIL along his whole path from 1B**, plus a white arrow marker + name label overhead. The race is extremely readable: trail = runner progress, flying ball = the throw.
- Outs went 1→2 across the race (t=635): caught stealing, straight back to the plate view with the next pitch ready. No lengthy ceremony for the CS — the count and outs pips just advance (compare: strikeouts DO get the banner + reaction).
- Confirmed across this segment: BALLS pips fill blue, STRIKES fill yellow, OUTS fill red; a small dropped-bat sprite lingers by the plate after a swing.

## How BB2001 measures against our config (July 2026 values)

> ⚠️ **The pace rows in this table were wrong, and two of them are still open.**
> They rest on n=1 readings from a stream whose timestamps no longer locate the
> plays they came from (see the section below), and the home→1B row compounded
> that with a basepath number nobody checked: it is `hypot(138,115) = 179.6px`,
> not 234px, so our real home→1B is **2.11s**, not 2.75s. The corrected status of
> every pace metric now lives in `scripts/measures.json` under `pace`, where each
> one carries its own `n`, `confidence` and `status`. Presentation rows in this
> table are unaffected — those were observed, not timed.

| Thing | BB2001 measured | Recess Sports today | Verdict |
|---|---|---|---|
| Home→1B time | ~3.0s (n=1, **superseded**) | 179.6px at 85 px/s = **2.11s** | ⏳ `awaiting-measurement` — the anchor, and the number every other ratio depends on |
| Deep fly hang | ~2.0s (n=1, **superseded**) | `LIVE.FLY_HANG_MS` 2000–2900 | ⏳ `awaiting-measurement` — against the old reading our flies hang **42–106% long relative to the run**; our worst suspected defect |
| Pitch flight range | ~250ms (pro arm, HEAT) → ~700ms (weakest kid arm, lob) | `PITCH_SPEED`: CLASSIC base 800ms ÷ per-kind speedMult × per-arm `armTravelMult` (stat 10 → 0.75, stat 1 → 1.20) — fastball ≈ 545–875ms; fatigue's sagged stat slows tired arms. Kid mode keeps 1250. | ✅ SHIPPED (arm-scaled corridor + `lobHeightPx` rainbow arcs on slow pitches; swing windows widened ~35% to compensate) |
| Catch → next pitch ready | ~1.3s (n=1, **superseded**) | `FLOW.BETWEEN_PITCH_MS` 1250 | ⏳ `awaiting-measurement` — but the easiest of the three to measure to high n from the local capture |
| Pitch selection pressure | None — fully player-paced (9s+ observed) | Ours: also untimed | ✅ Match |
| Contact → field view | Instant hard cut, <1 frame of ceremony | 90ms `HIT_PAUSE_MS` flash then cut | ✅ Ours adds a deliberate contact beat — keep |
| Live-play HUD | Collapses to mini score+outs only | We keep the full bottom strip | 🤔 Consider dimming/collapsing the strip during live plays |
| Pitch-location feedback | Caught ball RESTS at its crossing spot ~1s+ (through the whole next deliberation if idle) | Taken pitches rest at the crossing spot (grey aura) until the next windup (`PLATE_VIEW.REST_BALL`) | ✅ SHIPPED |
| Pitcher idle | Tosses ball up and catches it, loops | Rig pitcher toss idle between pitches (`PLATE_VIEW.TOSS`, restarts when each pitch settles) | ✅ SHIPPED |
| Card selection | Card art plays a flourish animation | Tap flourish: card pop + icon wiggle in EdgeCards | ✅ SHIPPED (+ blue/yellow/red pip colors and the ~200ms ump-call beat, `FLOW.UMP_CALL_DELAY_MS`) |
| Out presentation | Yellow "OUT" text at the base, in-world | Floating text/banner | 🤔 In-world at-the-base text is very readable |
| Per-batter signature swing cards | Card stacks vary per kid (Tony's CRAZY BUNT) | Signature 🤪 CRAZY BUNT card gated on ability `'crazy_bunt'` (Sprout) — capped grounder snapped down a line (`SWING_TYPES.CRAZY_BUNT`) | ✅ SHIPPED (plumbing supports more signature cards) |
| Batter dodges inside pitches | Lean-back reaction mid-flight, before the call | `dodge` reaction pose, fired at 55% of flight on pitches crossing well inside (`PLATE_VIEW.DODGE`, all three renderers) | ✅ SHIPPED |
| Fielder identity | Name bubble follows the active fielder (lags behind on sprints) | Lagging name bubble under the chaser (`FX.LIVE_MARKER.NAME`, lerp follower — replays get it free) + spotlight + chevron | ✅ SHIPPED |
| Steal race readability | Yellow motion trail along the runner's whole dash | Fading gold dot streak behind the steal dash (`FX.STEAL_TRAIL`) | ✅ SHIPPED (in-world OUT!-at-the-base already existed) |

## Measurement technique (for repeating this)
- Drive the YouTube player via `document.querySelector('video.video-stream')`: pause, set `currentTime`, read exact times back. Screenshot/zoom the player region per step.
- GOTCHA: after a BACKWARD seek the old frame can stay on screen even AFTER the `seeked` event fires (compositor lag / buffer refetch) — a "new" screenshot can silently show the old frame. Only trust frames reached by FORWARD seeks; after any backward jump, discard the first frame and step forward once before capturing. `requestVideoFrameCallback` does NOT fire on a paused video — don't await it (it hangs the eval).
- The video is a 640×480 capture; the YouTube player region on screen was (173,70)–(906,616) during this session (window-size dependent — recheck).

## Geometry: BB2001's field is TRUE PERSPECTIVE, not affine (measured 2026-07-23)

The single most structurally-important measurement in the project, and it came back the "hard" way. Method and numbers are in `scripts/measures.json`; this is the narrative.

**The question.** Our renderer (`src/art/projection.ts`) maps `y: p.y` — a pure horizontal pinch with **no vertical foreshortening**. If BB2001 draws its field in true perspective, that identity is structurally wrong, and matching BB's look would ripple into the sim's coordinate assumptions. The affinity test decides it: a diamond is a square, so its four bases are a square's corners; **affine** maps preserve diagonal bisection (the two diagonal midpoints coincide), **perspective** maps do not (the far half compresses).

**The measurement** (frame t=430, the quiet post-play wide reset). Canvas pixel access was **untainted**, so this was done objectively, not by eye:
- **Foul lines** fit by RANSAC on the white chalk (occlusion-robust — players stand inside the lines): left slope **1.239**, right **1.238** — symmetric, and they intersect exactly on the home-plate pentagon at **(319, 444)**, which validates the fit.
- **Bases** from the dirt/grass boundary (players stand *on* the dirt, so the diamond's outer corners read through them): 2B apex down the symmetry axis at **(319, 198)**; 1B/3B as the outer infield-dirt corners on each foul line at **(514, 286)** and **(126, 287)** — symmetric about x=319.9, the internal consistency check.

**The verdict.** Diagonal midpoints: M1 (home–2B) at (319, **321**), M2 (1B–3B) at (320, **287**). Gap = **34.8px** against a 3px affine threshold — **11× over. BB2001 is perspective.** The near half of the infield is drawn **158px** tall vs the far half's **88px** — a **1.79 ratio** where affine demands 1.0. Perspective strength (gap ÷ home→2B height) = **0.14**.

Robust to camera pan/zoom: those are affine transforms and cannot convert perspective↔affine. And robust to apex uncertainty — even a 30px error in 2B keeps the gap far above threshold.

**The one reassuring part:** BB's foul slope (**1.24**) is within ~3% of our `FOUL_SLOPE` (1.2). Our *near-field lateral* squash already matches BB. What we lack is the *depth* compression.

**Implication (for the graphics phase, which is sequenced last and gated on a legit game copy):** matching BB's field means adding a render-only `y' = f(y)` to `projection.ts` with a matching inverse in `unproject`, keeping the sim flat so `geometry.ts`, `clampToField`'s convexity argument, and the goldlog stay untouched. Fix the two coordinate-hygiene bugs first (the raw-`MOUND` draw in `drawField`, and `depthScale()` called on an already-projected point in `LivePlayView`). **This does not touch the pace work.** It is also a genuine product question, not a mandate — our flatter view is a deliberate style, and adding perspective is a large visual change worth deciding on its own merits.

### Confirmed independently off the local capture (2026-07-23)

The perspective finding no longer rests on one frame of one venue. Repeated on
the **backyard-grass venue** from the local ScummVM capture — a different venue,
a different source, a different technique, and this time at **pixel-exact native
640×480** rather than through YouTube's 4:2:0 chroma:

| | YouTube (stadium-ish) | Local (backyard-grass) |
|---|---|---|
| Foul slope L / R | 1.239 / 1.238 | **1.2402 / 1.2426** |
| Diagonal-midpoint gap | 34.8px | **17.6px** (threshold 3px) |
| Near/far ratio | 1.79 | **1.393** |
| Perspective strength | 0.141 | **0.0823** |
| Basepath | 251px | **198.6px** |

**The foul slope reproduces to 0.24%.** Two sources, two venues, two techniques
landing on **1.240** is what turns our own `FOUL_SLOPE` 1.2 from "close enough"
into a real 3.2% difference — it's 14× the spread between the measurements.

**Perspective is confirmed, but its STRENGTH is per-venue** (0.141 vs 0.082).
Anyone modelling this with a single global constant would be wrong; it's a
property of each venue's camera.

Bases were found by compact white-blob detection at native resolution, then
cross-validated across three frames of the same venue — a base can't move
between frames, a fielder can. Two symmetric candidates at y≈283 appeared in only
one frame and were correctly rejected as fielders. Internal checks that weren't
constrained by the fit: 1B and 3B land on the *same* y (310.9), and home's x
(320.3), 2B's x (318.0) and the 1B/3B midpoint x (320.45) all agree within 2.5px.

A third, independent perspective signature falls out without using the diagonal
test at all: under an affine map a diamond's opposite legs are equal, and
home→1B is 198.58 while 2B→3B is 176.43 — an **11.75% leg spread**.

No fifth-point validation for this venue: it's a *backyard*, with no pitching
rubber drawn to predict against.

### Method upgrade over the technique section above
This session drove the video the same way (pause / set `currentTime` / forward-seeks-only) but added: (1) a **canvas taint probe** (primed magenta so a no-op draw is distinguishable from a black frame) which came back **untainted**, unlocking direct pixel reads at exact 640×480 game coordinates — no screen-pixel/DPR conversion; (2) **RANSAC** line fitting so occluding uniforms/bags don't poison the foul-line fit; (3) **dirt/grass boundary scans** to locate bases through standing fielders. When pixel access is available, prefer all three over eyeballing a scaled screenshot.

## ⚠️ The timestamps in the segments above do NOT map to the live YouTube stream (found 2026-07-23)

Re-opening `YMmqNpmA60U` to measure pace, the frame at each cited timestamp does not match what the notes recorded. Spot checks: t=389 does show a pitch in flight (matches), but **t≈445–460, recorded as a live play (fly to RF, runner home→1B), is a static defensive set** — no runner on the basepaths, no ball aloft, score 0-0 — as is t=456 (a full reset). So `video.currentTime` in this session is offset from the prior session's (an ad shifting the timeline, or a re-upload). **Consequence: the numbered timestamps cannot be used to jump to plays.** Pace measurement off this stream requires blind-scrubbing 47 minutes to relocate suitable plays and then nailing events — the expensive path the plan set out to avoid.

The frame rate WAS re-confirmed this session (frame-change deltas cluster at ~33ms → ~30fps, likely 29.97), so the ±1-frame precision floor is ~33ms. And the geometry/perspective result above stands independently: it came from t=430, whose content (a clean wide reset) is stable and self-consistent regardless of absolute-time drift.

**Recommendation recorded for whoever picks up pace:** prefer repeatable local capture (produce 6 flies on demand) over scrubbing this video. `docs/research/bb2001-capture-setup.md` has the rig. If staying on video, budget a coarse play-index pass first (one thumbnail every ~10–15s) before measuring anything.
