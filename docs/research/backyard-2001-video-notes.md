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

| Thing | BB2001 measured | Recess Sports today | Verdict |
|---|---|---|---|
| Home→1B time | ~3.0s | `LIVE.RUNNER_SPEED` 85 px/s over ~234px basepath ≈ 2.75s | ✅ In the pocket |
| Deep fly hang | ~2.0s | `LIVE.FLY_HANG_MS` 2000–2900 | ✅ Match at the low end |
| Pitch flight range | ~250ms (pro arm, HEAT) → ~700ms (weakest kid arm, lob) | `PITCH_SPEED`: CLASSIC base 800ms ÷ per-kind speedMult × per-arm `armTravelMult` (stat 10 → 0.75, stat 1 → 1.20) — fastball ≈ 545–875ms; fatigue's sagged stat slows tired arms. Kid mode keeps 1250. | ✅ SHIPPED (arm-scaled corridor + `lobHeightPx` rainbow arcs on slow pitches; swing windows widened ~35% to compensate) |
| Catch → next pitch ready | ~1.3s | `FLOW.BETWEEN_PITCH_MS` 1250 | ✅ Match |
| Pitch selection pressure | None — fully player-paced (9s+ observed) | Ours: also untimed | ✅ Match |
| Contact → field view | Instant hard cut, <1 frame of ceremony | 90ms `HIT_PAUSE_MS` flash then cut | ✅ Ours adds a deliberate contact beat — keep |
| Live-play HUD | Collapses to mini score+outs only | We keep the full bottom strip | 🤔 Consider dimming/collapsing the strip during live plays |
| Pitch-location feedback | Caught ball RESTS at its crossing spot ~1s+ (through the whole next deliberation if idle) | We clear pitch visuals immediately | 💡 STEAL: leave the caught ball at the crossing spot until next windup |
| Pitcher idle | Tosses ball up and catches it, loops | Idle bob | 💡 STEAL candidate |
| Card selection | Card art plays a flourish animation | Gold highlight | 💡 Nice-to-have |
| Out presentation | Yellow "OUT" text at the base, in-world | Floating text/banner | 🤔 In-world at-the-base text is very readable |
| Fielder identity | Name bubble follows the active fielder (lags behind on sprints) | Chaser spotlight + gold chevron, no name | 💡 Name bubble reinforces the characters-are-the-product goal |

## Measurement technique (for repeating this)
- Drive the YouTube player via `document.querySelector('video.video-stream')`: pause, set `currentTime`, read exact times back. Screenshot/zoom the player region per step.
- GOTCHA: after a BACKWARD seek the old frame can stay on screen even AFTER the `seeked` event fires (compositor lag / buffer refetch) — a "new" screenshot can silently show the old frame. Only trust frames reached by FORWARD seeks; after any backward jump, discard the first frame and step forward once before capturing. `requestVideoFrameCallback` does NOT fire on a paused video — don't await it (it hangs the eval).
- The video is a 640×480 capture; the YouTube player region on screen was (173,70)–(906,616) during this session (window-size dependent — recheck).
