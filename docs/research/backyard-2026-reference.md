# Backyard Baseball (2026) — reference notes

Source: the six Steam store screenshots for app 3935020 (captured at 1920×1080,
2026-08-04), the Steam feature copy, the Wikipedia article, and review coverage
(IGN 5/10, Metacritic 58 PC). The full 41:26 Not The Expert video "The New
Backyard Baseball is Amazing!" (`A3DyDMkx17c`) was audited 2026-08-06 through
its 249 high-resolution storyboard frames at a 10-second cadence: team creation
0:35–2:39, draft 2:39–11:19, and gameplay 11:19–41:26. The cadence is enough to
establish screen structure, camera vocabulary and repeated feedback, but not to
measure sub-second animation timing. `bb2026-storyboard-index.md` maps the
corpus frame by frame — which frame to pull to check any claim made here.

Purpose: the concrete target list for the "art, graphics and gameplay on par
with the new Backyard Baseball" push. This file records what BB2026 *shows*,
screen by screen, so each gap can be closed as its own PR and checked against
something more specific than memory. It is the BB2026 counterpart to
`backyard-2001-video-notes.md`, and far shallower — store screenshots, not
frame-stepped capture. Facts here are observations of marketing frames plus the
10-second video storyboard; treat densities and layouts as representative, not
pixel measurements.

The game: Playground Productions + Mega Cat Studios, released 2026-07-09, PC/Mac,
$39.99. 30 classic kids + ~10 more (MLB-players-as-kids, unlockables), 24 team
logos, 11 fields, 6 modes, day/night per field, collectible trading cards, local
co-op at launch, online delayed. Reception is MIXED (58 Metacritic) — batting
balance and slow fielding are the named faults, presentation is broadly praised.
"On par" therefore means their presentation bar, not their fielding.

## The pitching view (screenshot 2 — the frame our game shares)

Same behind-plate rig as BB2001 and as ours: batter LARGE in rear 3/4 view
(~40% of frame height), pitcher small on the mound, full diamond visible.

- **Scenery**: the load-bearing difference from our frame. Behind the outfield
  fence: two full houses (blue, cream w/ blue roof), a shed, a junk truck
  ("SCRAP IRON & METAL"), wooden privacy fencing with bunting garlands,
  telephone poles WITH sagging wires crossing the whole upper frame, mature
  trees, and ~6 background kids standing in the yards watching. Nothing beyond
  the fence is empty.
- **Ground**: saturated spring green, soft mow bands, wobbly hand-drawn chalk
  diamond (lines visibly waver), grass tufts and worn patches inside the lines.
- **HUD, clockwise**: top-left mini-diamond (mitt icon per fielding spot +
  arrow chevrons = defensive shift control); top-right matchup plate (two
  name/stat chips + "VS" wedge); right edge the pitch card stack — HEAT (flame
  bat art), RIGHT HOOK / LEFT HOOK (curved ball path art), SLOW BALL, SPECIAL
  (?? mystery crate) — each a chunky rounded card with illustration;
  "CHANGE PITCH" key-hint chip below; bottom-right the JUICE box (juice-carton
  art, "110%"); bottom-left scoreboard: settings/quit chips, team logo + score
  00-00, "TOP OF INNING 1", B/S/O pip rows.
- Every HUD element: cream field, thick colored border, drop shadow, slight
  rotation jitter — sticker language, zero flat rectangles.

## Menus are diegetic 3D scenes

- **Main menu (screenshot 1)**: a treehouse interior. "Pick-Up Window" is a
  literal window with the field visible through it; League Play is a corkboard
  with bracket + clipboard; Records a wall plaque; Cards a crate of card packs;
  Exit a pennant. The camera presumably dollies between stations.
- **Field select (screenshot 3)**: binocular-vignette framing over a live 3D
  pan of the venue ("Tin Can Alley" — a city alley field), A/D arrow chips,
  sun/moon toggle top-right (day/night), dot carousel, red BACK / blue NEXT.
- **Draft (screenshot 4)**: kids sit on a real bench in a 3D schoolyard; the
  current candidate's TRADING CARD floats beside them (2D illustrated art, BYB
  crest, name ribbon) with "PICK?" and baseball-styled YES/NO buttons. The
  cursor is a giant white foam glove.
- **Inning break (screenshot 6)**: a full green scoreboard fills the frame —
  BYB diamond crest, per-inning line score (unplayed innings slashed), R/H/E,
  BALL/STRIKE/OUT as lamp pips, AT BAT / ON DECK / IN THE HOLE panels with 2D
  portraits, all standing on a real street scene behind.

## Venues (screenshots 3, 5)

Eleven fields, reimagined from the 1997 originals. Seen: "Tin Can Alley"
(asphalt between brick walls, recycling dumpsters, graffiti, fire escapes) and
"Cement Gardens" (parking-lot diamond: painted circle mound, yellow kerb
markings, espresso kiosk, comic shop, brownstones, window flower boxes). Both
are DENSE with props to their edges, and both read instantly as a specific
place kids commandeered — bases are improvised (a plank, a chalk X).

## What the video adds

- **The title sells a place and a cast before it sells a mode.** The logo sits
  over the treehouse, the camera travels through physical menu stations, and
  team creation gives a coach icon, logo, colours and a constructed name before
  the draft. Recess had only two floating words and a PLAY button over its park.
- **The draft is one child at a time, never an inventory grid.** A candidate
  fills roughly half the frame, talks and reacts; a large trading card carries
  nickname, birthday, personality copy and five dot ratings; PICK? receives an
  explicit yes/no. The bench remains visible behind the card, so the cast feels
  like a group of children waiting to be chosen.
- **Gameplay cuts between two cameras on nearly every ball:** a close plate view
  for pitch choice and swing, then a high oblique diamond view for the live
  race. Close character inserts punctuate pitching, batting and celebrations.
  The high view is a gameplay tool: it keeps ball, chaser, runners and target
  bags readable at the same time.
- **Every resolution is written over the field.** STRIKE carries EARLY/LATE,
  SAFE and OUT fill the centre of the frame, fly distance floats in the sky,
  and the line score takes over between innings. Audio and animation reinforce
  the same verdict; the player never has to infer an outcome from a small pip.
- **Animation is constant rather than occasional.** Batters waggle and load,
  pitchers perform a complete delivery, fielders crouch, run, throw and catch,
  runners slide, and principals react after the play. Camera changes are timed
  to those motions. A moving character is the normal state.
- **Venue identity survives every camera.** The suburban yard and school field
  use different ground, fence, skyline and prop languages; neither is a palette
  swap. The video shows two of the eleven fields and day/night presentation.
- **The product shell is much wider:** custom player, team strategy/positions,
  season schedule, records, collectible cards, multiple modes and game summary.
  These are retention and expression systems, not prerequisites for one good
  two-inning pickup game, but they are real parity gaps.

## What this yields as a gap list (ranked, art first)

1. ~~A world behind the fence~~ — PR 28's `render/Scenery.ts`.
2. ~~Sky~~ — PR 29: `SKY_TOP`/`SKY_HORIZON` exported from `Sky.ts`, every fog
   cites the horizon.
3. ~~Ground character~~ — PR 30 took the worst offender (the ruler-straight
   far foul line, now hand-limed). Dirt tufts/wear beyond that remain open as
   polish, not a ranked gap.
4. ~~HUD sticker language~~ — PR 31's tappable pitch cards, followed by the
   cream outlined scoreboard treatment in the 2026-08-08 readability pass.
5. ~~Background kids~~ — PR 32: the undrafted twelve watch from the yards.
6. ~~Presentation beats, first pass~~: ~~matchup plate~~ (PR 33), ~~inning-break
   scoreboard~~ (PR 34), ~~a camera cue per screen~~ (PR 37 — draft over
   DEEP, team over PLAY, result into PITCH_HERO). ~~Wooden-sign
   headers~~ and ~~the draft's card-pop beat~~ landed as PR 42.
7. ~~Day/night~~ — PR 35's `?night=1` (sky/fog/lights/lit windows), PR 36's
   sun/moon chip on the team screen with a live park flip. All named polish shipped:
   ~~per-venue night looks~~ (PR 41), ~~light towers~~ (PR 39),
   ~~HR fireworks~~ (PR 38).
8. ~~Readable play verdicts~~ — the 2026-08-06 parity pass adds broadcast-sized
   BALL / STRIKE / FOUL / SAFE / OUT / HOME RUN overlays, count-ending WALK and
   STRIKEOUT calls, and EARLY/LATE feedback from the swing's real signed timing
   error. The outcome comes from `SimEvent`; the view never re-judges it.
9. ~~A character-first draft~~ — the same pass replaces the immediate-vote card
   wall with a large candidate spotlight: live 3D candidate and waiting group,
   tagline, five 1–10 dot ratings and an explicit PICK ME confirmation. Each new
   candidate walks on and holds `pose_card`; a confirmed kid reacts and speaks
   their authored `draftLine`. The CPU pick gets the same reveal rather than
   vanishing. Compact board and team-slot portraits stay illustrated for fast
   comparison.
10. ~~Characters on the front door and after the play~~ — the title lockup now
    frames the wordmark with signature kids, and batter/pitcher play opposing
    cheer/upset reactions after every plate appearance.
11. ~~Live-play depth and control cues~~ — the 2026-08-08 readability pass adds
    a height-responsive ground shadow under the ball and a gold ring under
    exactly the fielder receiving human steering. Both read the render membrane
    after the sim has stepped; neither changes reach, routes or outcomes.

## Remaining parity backlog, in dependency order

1. ~~**Roster-quality 3D character delivery, production pipeline pass.**~~ All
   thirty roster ids now have validated, size-bounded GLBs with three LODs and
   enhanced face, ear, clothing-seam and footwear construction. The runtime
   manifest is complete and geometric proxies are failure-only. These remain
   generated art rather than externally sculpted hero models, so the validator,
   A/B page and roster-fidelity factory are the replacement path when a character
   art team is commissioned.
2. ~~**Marker-synchronised action animation in the game.**~~ The follow-up
   parity pass wires the existing contract into live play: pitchers complete
   windup/stride/release before the ball leaves; deterministic CPU swing reads
   provide pre-roll; human swings, catches and throws seek their marker on the
   event tick; dives preserve their own catch marker; and slides fit their end
   to the sim-owned basepath leg. A single validated static GLB now delivers all
   forty-three canonical clips to gameplay and the review page, including four
   directed win and loss takes, with procedural motion retained only as a
   per-clip failure fallback. Optional partial `anims_<id>_v1.glb` deliveries
   now override named clips for one kid only; the 30-character performance
   packet supplies the sculpt, acting and casting direction for that pass.
3. ~~**A full draft environment.**~~ The full-width schoolyard bench now leads
   the screen: the selected already-loaded kid walks into `pose_card`, six
   remaining kids wait behind them, and the last four picks on each side stay
   physically staged under YOUR BENCH / THEIR BENCH in their personal colours,
   rather than two premature team uniforms. Confirmation plays the
   reaction and a real `walk_on` trip to the correct side before the CPU picks.
   The horizontal search bench sits below the environment. It remains the one
   renderer, one scene and one instance per kid, and vote semantics are
   unchanged.
4. ~~**Venue breadth.**~~ Recess now exposes eleven mechanically distinct parks
   with day and night. The first pass added the two places shown in the video:
   **Tin Can Alley** is a short, high-walled brick canyon with rough asphalt,
   fire escapes and recycling dumpsters; **Cement Gardens** is a broader
   concrete parking court with low kerbs, brownstone shopfronts, window boxes
   and an espresso kiosk. The breadth pass maps the original park and sandlot to
   **Parks Dept #2** and **Sandy Flats**, then adds **Steele Stadium** (backyard
   pool), **Playground Commons** (school playset and a 64ft left/right split),
   **Eckman Acres** (deep soft grass and barn), **Dirt Yards** (short left line,
   bare earth and tire stacks), **Big City Stadium** (maintained lawn, skyline
   and bleachers), and **Super Colossal Dome** (quick turf, high padded wall and
   an indoor neon roof). Recess's original **Blacktop** supplies the eleventh.
   Every park changes geometry and surface play as well as palette and skyline;
   `sim.venueRollFeel` records the derived 60-contact profile for all eleven.
5. ~~**Diegetic front-end and retention shell.**~~ The title now opens a real
   Clubhouse backed by the shared stores: games played, collection progress,
   foil wins, trophies, favorite picks and all thirty stickers; completed v2
   games advance the same album as `/classic/`, and unlocked kids speak when
   tapped. A real pre-game strategy screen now lets the player order all nine
   hitters and hands that exact order to the sim; defence still uses its
   measured planner. Recess Week now resumes the shared five-day schedule,
   rotates its saved rivals, records each v2 result and stat line, awards a
   three-win pennant, and puts week trophies into the shared album. The
   Clubhouse now makes and edits a persistent custom captain through icon,
   swatch and nickname choices. That captain begins on the pickup bench, plays
   through the ordinary character/sim/render paths, and never becomes a 31st
   vote or sticker. MORE GAMES adds one-inning batting practice, one-inning
   pitching practice and a hands-free watch game through the live sim's control
   policy; CPU-only halves expose no hidden input or false YOU PITCH label.
   Some mature versions still live in `/classic/`; port shared rules rather than
   cloning them, and keep pickup play as the one-tap front door for ages four to
   eight.
6. ~~**Production environment kit.**~~ Benches, bicycles, flowerbeds,
   mailboxes, chalkboards, crates and pennants form one deterministic modular
   kit. Parks Dept #2 proves five distinct modules and every other venue uses at
   least three, while enriched house construction and weathering stay inside
   the single scenery draw and its triangle budget.
7. ~~**Static audio identity.**~~ Six bespoke impact/crowd masters, seven
   commentator calls and thirty kid draft lines ship as local assets through
   the established cue and mute contracts. Synthesized Web Audio and browser
   speech remain failure fallbacks; locally generated, disclosed stock AI
   voices now provide the default production path, while a rights-cleared human
   take can still replace one through the same contract.
8. ~~**Diegetic shell art.**~~ The treehouse and trading-card art now carry the
   title, Clubhouse, modes, draft and album surfaces, while field selection reads
   as a wooden viewing station. Existing navigation, stores and tap semantics
   did not move.
9. ~~**Contact spectacle before optional systems.**~~ Contact now drives a
   render-only 3D burst and strength-scaled lens punch before the existing
   home-run camera and fireworks. Shifts, stamina and power-ups were reviewed and
   deliberately left out until playtesting establishes a product need.

## 2026-08-15 full-playthrough re-audit (what the screen actually shows)

Method: a complete player-chair pass through the shipped v2 front door on the
dev server — first-run title, Clubhouse, custom captain, a full 9-pick draft,
strategy, team screen with live venue/night flips, a pickup game batting and
pitching through real input, a night watch game to completion, batting
practice, the Recess Week entry route, all eleven venues via `?play=1&venue=`,
the 30-kid roster grid (`?spike=1&roster=1`) and the clip review page
(`?anims=1`). Every claim below was observed on screen this session (seeds
`audit-2026-08-15`, `audit-night`, `v1`); nothing is carried over from the
struck backlog above. The struck backlog is accurate about *existence* —
every listed surface is present and wired — but several items do not yet
survive being looked at. The spike-bb26 exit scorecard (silhouette 7 vs 2,
HUD 9 vs 1, etc. — see `spike-harvest.md`) is directionally confirmed for
motion, venue and contact spectacle; the character-silhouette gap has since
closed substantially (all 30 kids load as delivered models, zero proxies).

### Broken on screen (bugs, ranked by how hard they undercut parity)

1. **No bat exists anywhere in v2.** Batters at the plate, mid-swing, and in
   the *authored* `bat_stance` clip (`?anims=1`, ★ clip) hold nothing — the
   stance clip is an upright stand facing the pitcher. Every plate camera
   frame reads "kid standing around" where BB2026 shows waggle-and-load.
2. **Contact spectacle renders as artifact confetti.** On every hit, the
   render-only burst (backlog §9) draws dozens of untextured white/yellow
   squares across the sky and field, and nearby characters flash glowing
   yellow. The marquee moment of the game looks broken, not juicy.
3. **T-poses during play.** At contact and during live balls, the batter,
   catcher and infielders snap to T-pose between clips. The `?anims=1` list
   shows why: `pitch_windup/stride/release`, `bat_load`, `swing_whiff`,
   `bunt`, `run_fast`, `trot`, `jog_back` and both shuffles are still
   placeholder (■) — the whole action vocabulary between authored keyframes
   falls back to nothing.
4. **A passive defender means the half never ends.** In `both` mode the
   pitch clock auto-throws grooved fastballs, the CPU hits nearly all of
   them, and un-steered fielders record no outs: observed 11 batters, 9
   runs, 0 outs in bottom 1. No mercy rule, no fielding assist, and **no
   pause/quit/home control exists in-game** — a 5-year-old who doesn't
   master drag-steering is trapped in a blowout with no exit. (CPU-vs-CPU
   halves field fine — watch mode ended itself in a walk-off — so this is
   the human-defence policy, not the sim.)
5. **Verdict callouts render in-world and get occluded.** BALL/WALK/FOUL +
   EARLY/LATE exist (good), but they draw at plate depth behind the batter
   and catcher heads — the one thing BB2026 never lets happen to a verdict.
6. **The inning-break line score was never seen.** Across three
   between-half beats (including `?break=1`), the board's state said open
   (`body.inning-break`, display grid, opacity 1, centered rect) while the
   pixels showed the field. Either it flashes sub-second or a stacking bug
   hides it; either way the player never reads a line score.
7. **Polish debris:** a stray red ▶ glyph floats on every DOM screen; a
   giant unlit black triangle dominates the sky behind CF in the live
   camera at Parks #2; the strike-zone box + aim bar sit visibly left of
   the plate from the batting camera; Tank's face ships with closed eyes
   and no mouth; the title/custom portraits default to a frown; the
   matchup plate has a washed-out ghost state.

### Parity gaps that are design-level, not bugs

8. **Venue identity does not survive the play camera.** All eleven venues
   share one stage; from the plate the only changes are fence material,
   skyline strip and ground tint. None of the signature props (pool,
   playset, barn, espresso kiosk, dumpsters, fire escapes, tire stacks)
   are visible from gameplay cameras; Tin Can and Blacktop floors read as
   flat black voids; the Dome is a purple sky, not an interior. BB2026's
   bar is venue identity in *every* camera.
9. **The draft has ceremony but no star moment.** One-kid-at-a-time with a
   CPU reveal works, but the candidate stays crowd-sized inside a dimmed,
   desaturated spotlight scene (a scrim mutes exactly the pixels being
   sold), and there is no trading card — no portrait, birthday or
   personality copy. The bench strip also clips below the fold at a
   1300×860 window.
10. **The title hides its own world.** The treehouse is a static
    illustration that fully covers the live park, so the attract game runs
    invisibly behind it; the hero portraits are flat 2D and frowning.
11. **Night is a blue filter.** Light towers exist but pool no light; the
    live camera brightens back toward day; lit windows are the only warm
    accent. (HR fireworks at night not observed this session.)
12. **Live-play readability:** the camera follows chaser+ball only —
    runners and target bags are off-frame (the scoreboard diamond is the
    only runner telemetry), and the wide bottom-center scoreboard bar
    occludes play near home.
13. **The result screen is a plain dark card** — functional verdict, stars
    and buttons, but nothing like the diegetic green line-score board with
    portraits that BB2026 ends every game on.

### Confirmed working at or near the bar

All 30 roster kids load as delivered GLBs (0 proxies, LOD0) with strong,
varied silhouettes and faces in direct light; the HUD sticker kit
(scoreboard, pitch cards, matchup plate, plank headers) holds; one-tap
pickup flow, live venue/night flips on the team screen, Clubhouse + sticker
book + custom captain, More Games' three card-fronted modes with honest
labels, watch-mode walk-off ending, wheelchair inclusion end to end, the
AI-voice disclosure line, and a clean console.

Not yet verified this session: the Recess Week board and pennant loop past
its draft gate, HR fireworks, the audio mix, and the break-board paint bug's
root cause.

Gameplay: their new modes (Backyard Derby, Backyard Bash, Wiggle Ball, T-Ball)
map to the focused practice/watch arc Recess now ships, and their 10-point skill system
matches our 1-10 stats already. Their named FAULTS — batting either trivial or
impossible per difficulty, "slower and inferior" fielding — are exactly the
two systems our sim solves from measurement (`sim.humanSwing`,
`defense.fielderSpeed`), so parity there is holding our line, not chasing
theirs.

### 2026-08-15 fix pass (PRs #142–#151): what a fresh playthrough now shows

Same method as the audit above — dev server + Chrome, fresh seeds
(`final-verify`, `night1/2`, `v1`), the clock hand-pumped where the tab was
throttled — after ten PRs worked the list top-down. Each item below was
re-observed on screen against `main`; where the fix taught us the audit's
diagnosis was wrong, the correction is recorded with it.

1. **Bat: fixed** (#142). `props.attachBatProp` hangs one shared bat on the
   rig's `Prop_BatGrip`; `clips.holdsBat` derives visibility from the clip
   table. The deeper half was the stance itself — authored before any bat
   existed, it held the hands 1.8ft apart at hip height, and the swing's
   mimed arm deltas kept the barrel vertical through the contact frame. The
   arms are now a solved two-hand grip constant through every batting clip;
   torso yaw is the power and solved `SWING_WRIST` keys lay the barrel level
   (3°) through the zone at the derived marker. Verified at the plate camera
   and on `?anims=1` for the shared library and all six character takes.
2. **Contact burst: fixed** (#143). The cause was an untextured
   `PointsMaterial` (a hard square per ember) borrowed from the 2.6ft sky
   shells at 18ft. Every ember now carries a soft radial sprite and the
   plate burst has its own 0.5ft pool. A real foul at `final-verify` drew
   small glowing embers; no squares, no additively-washed kids.
3. **T-poses: fixed** (#144), and the ■ diagnosis was wrong — all 43 clips
   resolved then and now (▪ is *shared*, ▫ procedural; both animate). The
   real author of the T-pose was keys AT the bind pose: `build()` fills an
   unkeyed alias with the identity rotation, and the mixer blends untracked
   bones toward rest during fades — `idle_fidget`, the cheers and all nine
   directed reactions started and ended exactly there. A geometric detector
   (both arms horizontal and opposed, per rendered tick) counted 6,356
   incidents over five simulated minutes before, and 0 after, with a new
   gate in `AnimationDirector.test.ts` holding the line.
4. **Passive defence: fixed** (#145), and it was a stale pointer, not the
   sim: `inputs.pointer` survived across plays forever, so one early tap
   pinned every later chaser to a dead spot. Steering now ends when the
   frame leaves `live`; re-run with a pointer deliberately planted on all
   nine live plays of an inning, both halves ended (0-2 after 1). And the
   exit exists: a ⏸ HUD button freezes the game under a two-card
   KEEP PLAYING / GO HOME screen, audited at all six viewports.
5. **Verdicts and plate cues: fixed** (#146). The callouts were already
   screen-space DOM — "occluded" was composition: (50%, 45%) is the batter's
   head. They pop at (40%, 30%), the clear sky band. The zone box and aim
   bar were depth-tested scenery the catcher ate half of (hence "left of the
   plate"); they draw through the scene now, translucent, complete, centred.
6. **Inning board: hardened** (#147); the invisibility itself no longer
   reproduces — the natural three-out `between` beat paints the green board
   on screen. Two real fragilities closed: the 140ms fade-IN (a throttled
   tab can present zero frames of it — the likely audit-era culprit) is now
   instant-on, and the half-end beat holds 4.5s instead of a between-pitch
   2.55s blink.
7. **Debris: swept** (#148). The stray red ▶ was the scoreboard's batting
   mark escaping `visibility: hidden` via an explicit `visible` on a
   descendant (now `inherit`); the ghost matchup was a fade-in stalling on
   throttled tabs (instant-on now, picker too); the black triangle behind CF
   was a gable roof's flat ridge-end cap reading as a floating diamond
   (`paintGable` bakes two-tone slopes and wall-coloured caps); the frowning
   portraits were the `'determined'` mouth arc bowing UP — Junebug's resting
   face and the custom captain's default. Tank's "closed eyes / no mouth"
   did not reproduce: his sleepy-lidded eyes and frown mouth are present and
   read at `?anims=1&facecam=1` (the #140 mouth-cell pass predates this
   audit's claim; no change to approved art).

Design gaps closed this pass:

8. **Venue identity** (#149): Tin Can and Blacktop floors re-authored bright
   enough to survive the toon ramp (they were flat black voids); the Dome
   gets a real interior sized for the pitch camera's 0–12° sky band (rim
   truss, twelve columns, ribs to a glowing hub); Steele's pool grew a 17ft
   umbrella and slide tower, Dirt Yards a tire-swing tree, Playground a 14ft
   playset in the visible band — each verified from the plate camera. The
   general lesson is recorded in `Scenery.ts`: a signature prop that does
   not clear the privacy ring does not exist to the cameras that play the
   game.
9. **Draft star moment** (#150): the `.screen` scrim no longer washes the
   spotlight (the stage shows at full brightness), the candidate is framed
   hero-size (~12ft camera), and the identity plate wears the album's
   trading-card frame with the kid's own `draftLine`.
10. *(unchanged — title treehouse still covers the attract game; recorded
    below as an open gap.)*
11. **Night** (#151): the towers pool light — dimmer key/hemisphere plus two
    warm point lights over the infield — and the pool is baked into the turf
    shader and the dirt tint as well, so the overhead live camera (the
    audit's exact failing frame) reads dusk with no sky in frame. The trap
    recorded: all three passes are linear-space multipliers and sRGB halves
    their apparent strength.

Still open from the audit's list: #10 (the title art covers the attract
game), #12 (live-camera runner/bag framing and the bottom-centre scoreboard
near home), #13 (the plain result card), and this pass's own deferral —
Tank's face at gameplay distance is faithful to his approved sleepy-eyed
sculpt, and any change there is a character-art decision, not a bug fix.

## 2026-08-15 round-2 review (after PRs #142–#151)

Method: the same player-chair pass on the dev server — front-door title, a
full 9-pick draft, strategy, team screen, a pickup game batting and pitching
through real input (seed `fw1`, venues `park`/`dome`/`tin_can`, day and
night), the result screen, and the Recess Week board and pennant view via a
seeded `recess_season`. The tab was throttled, so the clock was hand-driven;
two artifacts of that driving were chased and ruled NOT product bugs (the
"stuck" draft was Chrome's 1/minute hidden-tab timer clamp on the CPU-pick
beat, and a frame of park-wide ember debris was particles spawned during
skipped time and painted once mid-life — both vanish at a real clock).

### Bugs found this round (ranked)

1. **The whole park renders mirror-imaged.** From every behind-home camera,
   first base is up the SCREEN-LEFT line: the sim puts FIRST at +x
   (`src/v2/sim/field.ts`), and a three.js camera on −z looking at +z maps
   world +x to screen-left, so a batter runs out a grounder toward the left
   edge. v1 draws FIRST at x=618 of 960 — screen-right — and BB2001, BB2026
   and every broadcast agree. The sim is internally consistent and every
   venue is near-symmetric, so no gate and no test can see it; verified by
   projecting `FIRST`/`THIRD` through the live camera matrices (NDC x −2.64
   vs +0.57) and by watching the runner. Asymmetric venue copy ("short left
   line") describes the wrong side of the screen.
2. **Hero buttons fall below the fold.** At a 1300×739 CSS viewport: the
   draft-complete PLAY BALL paints at y=962, strategy's LOOKS GOOD at
   y=1082 — both on scrollable screens with no scroll affordance, so a
   five-year-old who finishes the draft sees no way forward. The team
   screen's PLAY BALL top edge lands at y=727 — a 12px sliver. Same class
   as the audited bench-strip clip.
3. **The draft candidate does not reliably face the draft camera.** Junebug
   (as candidate) and Ace (at his CPU reveal) settle fully back-to-camera
   with PICK? floating over a ponytail; Big Lou settles head thrown back,
   tongue out, face cropped by the frame top. The waiting group and Chip
   face the lens correctly — same `setFacing(Math.PI)`, different outcome
   per kid, which points at per-kid authored performance takes baking a
   root orientation that fights the presentation's facing.
4. **The pause button overlaps the matchup plate.** In App-hosted games the
   ⏸ sits on the plate's left name chip and hides the batter's name, both
   halves, at 1300×739. `audit:v2-layout` cannot see it: the in-game states
   audit under `/v2/?play=1`, which never mounts the app shell's pause
   button — a real gate hole, recorded in the audit's own header comments.
5. **Draft flow nits:** after a CPU reveal the status stays "they took X"
   with no invitation to tap the next kid; long `draftLine`s overflow the
   card plate ("…coming through!" clips at the frame).

### Design gaps confirmed still open

6. **#10 stands** — the treehouse webp is an opaque full-bleed cover over
   `.screen--title/--clubhouse/--modes` while the attract game runs unseen
   behind it (confirmed live: the canvas keeps simulating under the DOM).
7. **#12 stands, with pixels** — on a live ball the ball is a near-invisible
   dot, the chaser is cropped at the frame edge, and a play near home
   happens visibly BEHIND the bottom-centre scoreboard bar. Runners and
   target bags are out of frame; only the scoreboard diamond tells you.
8. **#13 stands** — the result is the plain dark card. The Recess Week
   pennant view (verified this round) already renders portrait award cards;
   it is the in-house donor idiom for the result board.
9. **The catcher owns the plate camera.** In both halves the catcher is the
   largest thing on screen and fully occludes the batter — BB2026's frame
   gives the batter ~40% of frame height, readable. Ours reads "back of a
   catcher's head" at the most-seen camera in the game.
10. **Polish:** the strategy screen is flat dark rows (off the sticker
    language); Tin Can's mid-outfield still reads near-black from the plate
    camera; outfield grass shows no mow bands from gameplay cameras.

### Round-2 fixes

1. **Mirrored park: fixed.** `scene.scale.x = -1` at the root — the one flip,
   reasoned in `GameView.ts`'s scene field header. Venue geometry and
   gameplay objects mirror together so an asymmetric fence can never disagree
   with the runner on it; three.js flips its cull face on a negative world
   determinant, so winding, normals and outline hulls survive. Three seams
   negate x where world meets sim outside the graph: the pointer raycasts,
   the camera focus, and the draft stage (authored in visual coordinates,
   rendered with the mirror suspended). Re-verified on screen: the batter now
   stands LARGE and unoccluded screen-left with first base up the right line
   — the mirror had also been the author of the "catcher owns the plate
   camera" gap, since the PITCH rig's +7.5ft offset was peeking over the
   wrong shoulder. Runner, live tracking and mound aim all re-checked.

### Verified working this round

Recess Week board, pennant awards and FINISH WEEK → album loop (seeded
past its draft gate); night light pooling at the plate camera; HR fireworks
in-frame at fence-top height at night; the Dome interior; the bat prop and
solved grip at every venue; the ember burst (small soft embers, no
squares); verdict callouts at the (40%, 30%) sky band; the steering ring
and ball shadow; pitch cards; the CPU-pick reveal ceremony; result-screen
data (verdict, note, awards); a clean console.
