# Backyard Baseball (2026) — reference notes

Source: the six Steam store screenshots for app 3935020 (captured at 1920×1080,
2026-08-04), the Steam feature copy, the Wikipedia article, and review coverage
(IGN 5/10, Metacritic 58 PC). The full 41:26 Not The Expert video "The New
Backyard Baseball is Amazing!" (`A3DyDMkx17c`) was audited 2026-08-06 through
its 249 high-resolution storyboard frames at a 10-second cadence: team creation
0:35–2:39, draft 2:39–11:19, and gameplay 11:19–41:26. The cadence is enough to
establish screen structure, camera vocabulary and repeated feedback, but not to
measure sub-second animation timing.

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

Gameplay: their new modes (Backyard Derby, Backyard Bash, Wiggle Ball, T-Ball)
map to the focused practice/watch arc Recess now ships, and their 10-point skill system
matches our 1-10 stats already. Their named FAULTS — batting either trivial or
impossible per difficulty, "slower and inferior" fielding — are exactly the
two systems our sim solves from measurement (`sim.humanSwing`,
`defense.fielderSpeed`), so parity there is holding our line, not chasing
theirs.
