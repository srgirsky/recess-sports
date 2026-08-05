# Backyard Baseball (2026) — reference notes

Source: the six Steam store screenshots for app 3935020 (captured at 1920×1080,
2026-08-04), the Steam feature copy, the Wikipedia article, and review coverage
(IGN 5/10, Metacritic 58 PC). Video context: "The New Backyard Baseball is
Amazing!" — Not The Expert, YouTube `A3DyDMkx17c` (41:26; playback was blocked
in the capture session, so frame-level pacing numbers from it are still owed —
only its title card was captured).

Purpose: the concrete target list for the "art, graphics and gameplay on par
with the new Backyard Baseball" push. This file records what BB2026 *shows*,
screen by screen, so each gap can be closed as its own PR and checked against
something more specific than memory. It is the BB2026 counterpart to
`backyard-2001-video-notes.md`, and far shallower — store screenshots, not
frame-stepped capture. Facts here are observations of six posed marketing
frames; treat densities and layouts as representative, not measured.

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

## What this yields as a gap list (ranked, art first)

1. ~~A world behind the fence~~ — PR 28's `render/Scenery.ts`.
2. ~~Sky~~ — PR 29: `SKY_TOP`/`SKY_HORIZON` exported from `Sky.ts`, every fog
   cites the horizon.
3. ~~Ground character~~ — PR 30 took the worst offender (the ruler-straight
   far foul line, now hand-limed). Dirt tufts/wear beyond that remain open as
   polish, not a ranked gap.
4. ~~HUD sticker language, first instalment~~ — PR 31's tappable pitch cards.
   The scoreboard is still a dark slab; restyling it rides with item 6.
5. ~~Background kids~~ — PR 32: the undrafted twelve watch from the yards.
6. ~~Presentation beats~~: ~~matchup plate~~ (PR 33), ~~inning-break
   scoreboard~~ (PR 34), ~~a camera cue per screen~~ (PR 37 — draft over
   DEEP, team over PLAY, result into PITCH_HERO). Open as polish: wooden-sign
   screen headers, the draft card-pop moment.
7. ~~Day/night~~ — PR 35's `?night=1` (sky/fog/lights/lit windows), PR 36's
   sun/moon chip on the team screen with a live park flip. Open as polish:
   per-venue night looks. ~~Light towers~~ (PR 39). ~~HR fireworks~~ (PR 38).

Gameplay: their new modes (Backyard Derby, Backyard Bash, Wiggle Ball, T-Ball)
map to our roadmap's Practice/modes arc, and their 10-point skill system
matches our 1-10 stats already. Their named FAULTS — batting either trivial or
impossible per difficulty, "slower and inferior" fielding — are exactly the
two systems our sim solves from measurement (`sim.humanSwing`,
`defense.fielderSpeed`), so parity there is holding our line, not chasing
theirs.
