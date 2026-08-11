# BB2026 storyboard corpus — index

Source: the local BB2026 reference corpus at
`../recess-spike-bb26/spike-bb26/reference/` — 249 storyboard frames
(`frames/frame-001.jpg` … `frame-249.jpg`) extracted at a 10-second cadence
from the 41:26 Not The Expert video `A3DyDMkx17c`, plus 13 clean 1920×1080
captures (`steam/steam-01.jpg` … `steam-13.jpg`). The directory is ~690MB and
**gitignored on the spike branch** — it exists only in a local checkout of
`spike/bb26-one-shot`. The versioned map of anchor frames is
`spike-bb26/reference-manifest.json` beside it, which is what
`npm run capture:parity-stills` reads to composite reference|v2|spike sheets.

Purpose: make the corpus *navigable*. `backyard-2026-reference.md` says what
BB2026 shows; this file says **which frame to pull** to check any given claim,
so a parity judgement can cite a frame number instead of a memory. It is the
BB2026 counterpart to `bb2001-local-capture-index.md`, and shallower in the
same way that corpus is shallower: a 10-second storyboard locates screens and
poses, not sub-second timing.

Method: every frame and steam capture was classified by eye from labeled
contact sheets of the full corpus (2026-08-10); segment boundaries below are
those observations. Timestamps derive from the cadence — **frame N ≈
t=(N−1)×10s** — and were not re-measured per frame, so quote them as ±10s.

Two reading rules, both worth repeating from the manifest:

- ⚠️ **Every `frames/*.jpg` carries a reactor facecam overlay in the top-right
  corner.** It is not part of the game. Judges and croppers must ignore that
  region; the `steam/` captures are the only overlay-free frames.
- **14 frames are facecam-only** (the reactor talking, no game content):
  013, 071, 073, 081, 124, 158, 166, 184, 186, 233, 242, 245, 247, 249.
  Frame 003 is a mid-transition blur. Don't pull these expecting evidence.

## Segment map

| Frames | ≈ t | Segment |
|---|---|---|
| 001–005 | 0:00–0:40 | Title lockup over the treehouse (001–002), coach-card transition (003), treehouse menu interior (004–005) |
| 006–016 | 0:50–2:30 | Team creation + game setup (see below) |
| 017–020 | 2:40–3:10 | Draft bench wide (017–018) and the custom kid creator (019–020) |
| 021–063 | 3:20–10:20 | The draft — one candidate at a time, card beside live 3D kid |
| 064–067 | 10:30–11:00 | Team strategy clipboard (064–066) + season calendar (067) |
| 068–070 | 11:10–11:30 | Commentator desk — Sunny Day and Vinnie the Gooch |
| 072–137 | 11:50–22:40 | **Game 1 — Steele Stadium** (suburban backyard: pool, shed; home field named on 010's setup card) |
| 138–191 | 22:50–31:40 | **Game 2 — Playground Commons** (school yard, chain-link, dirt infield); 138 is the TODAY'S GAME card, 191 the summary with the night unlock |
| 192–241 | 31:50–40:00 | **Game 3 — Playground Commons** again; 192 is its matchup card |
| 242–249 | 40:10–41:20 | Wrap-up: standings (243), season calendar (244), last plays (246, 248), reactor outro |

Team creation and setup, frame by frame: logo grid (006), logo-on-cap closeup
(007), team-name adjective list BLUE/RED/CRAZY/…/HUMONGOUS/JUNIOR building
"Humongous Melonheads" (008), team colors with live mascot kid (009), then the
GAME SETUP clipboard — home field / difficulty / PITCH vs TEE-BALL / swing
spot assist / innings 1-3-6-9 / errors, with TOGGLE DAY/NIGHT on the chrome
(010, Steele Stadium), the same card for Playground Commons with BIRTHDAY
BOOST and HOT/COLD PLAYERS rows scrolled into view (011, 014–015), the
BACKYARD LEGEND difficulty blurb (012), and the READY TO PLAY? note that setup
cannot change after starting (016).

## Finding aid, by parity dimension

Ordered to match `reference-manifest.json`'s `dimensions` keys; the manifest's
own anchors are the starred defaults the contact sheets composite.

**Character (silhouette, face, cards).** Draft cards with skill-dot rows and
personality copy: nearly every frame in 021–063 — named ones include Pablo
Sanchez (022–023), Pete Wheeler (024/026), Ricky (029), Marky Dubois (031),
Amir Khan (034★ manifest anchor), Ernie Steele (035), Sidney Webber (036),
Tony Delvecchio (037), Reese Worthington (038), Annie Frazier (039), Jocinda
Smith (040), Jorge Garcia (041), Achmed Khan (042/055), Kenny Kawaguchi in
his wheelchair (043–044, 056), Stephanie Morgan (046/059), Dmitri Petrovich
(047), Angela Delvecchio (048/057), Kiesha Phillips (049/061/063), Dante
Robinson (050/060), Maria Luna (052), Ronny Dobbs (053). Clean face/hero
closeups: 025, 028, 032–033, 045, 051 ("HE'S MY AGENT" teddy-bear beat), 058,
077 (catcher gear), 181, 217 (headphones batter), 222 (umpire group), 231;
steam-04★ (draft bench + card, no facecam) and steam-08 (backyard hero) are
the clean anchors. Custom-kid hair/creator UI: 019–020★.

**Motion (pose extremes in stills).** Batting coil/load: 079–080★, 085, 104,
116, 127, 146, 173, 205, 235; contact and follow-through: 075, 120, 178, 193,
234; pitcher release: 190; wheelchair batter at the plate: 212, 226; live
base-running and tag plays in the high view: 110, 129, 133–134, 148, 153,
177, 215. Manifest motion anchors: 080★, 117★, 150★.

**Venue.** Steele Stadium ground level: 072, 074, steam-02★, steam-07;
its high oblique diamond: 078, 083–084, 090, 092, 097, 103, 106, 109, 111–112,
121, 123, 129★ (manifest uses 070★/130★ for the same yard-vs-commons pair).
Playground Commons ground level: 139–140, 157, 162–163, 209 (street beyond
the chain-link, matchup plate overhead), 230; its dirt-infield high view:
144–145, 147, 151–152, 213, 218, 227–228. Cement Gardens appears only as
steam-05★ (venue wide) and steam-06 (scoreboard street scene); Tin Can Alley
only inside steam-03★'s binocular field-select vignette.

**HUD.** The canonical everything-on-screen pitching frame is steam-02★.
Pitch card stack (HEAT / RIGHT HOOK / LEFT HOOK / SLOW BALL + SPECIAL): 089,
140, 237; SPECIAL variants — RAIN BERRY BALL / BIG FREEZE / CORKSCREW (119),
ORANGE BOLT (171). Swing cards (POWER / LINE DRIVE / GROUNDER / BUNT): 107,
169, 220, 224. Inning-break scoreboard: 087, 102, 114, 135, 161, 197, 210,
steam-06★. Batter-vs-pitcher matchup plates with running lines ("0 For 0
Today" / "19 P 5 K 0 BB"): 209, 237; TODAY'S GAME pregame card: 138, 192.
Team statistics table: 136; standings: 243; season calendar: 067, 244; juice
box closeup (110%): 238. Verdict overlays: STRIKE EARLY 115/196/212, STRIKE
LATE 128/241, Ball 093, SAFE 086/091/148/153/159/215, OUT 189/214, fly
distance 095 (171 FT) and 221 (304 FT).

**Shell (menus, front door, retention).** Title and treehouse: 001–005,
steam-01★; mode select through the Pick-Up Window (GAME / ONLINE "coming
soon" / TUTORIAL): steam-09; field select binoculars: steam-03★; setup
clipboard: 010–016; team strategy: 064–066, 126, 188; commentators: 068–070,
137, 182–183, steam-11; night unlock reward: 191; MVP award card with
confetti: steam-12. Manifest shell anchors: 005★, 025★.

## What the corpus cannot answer

The 10-second cadence means no swing timing, no pitch flight, no camera-cut
rhythm — those need frame-stepped capture like the BB2001 sessions
(`bb2001-capture-setup.md`). And the storyboard covers one playthrough: three
games across two of the eleven venues, day only. Cement Gardens, Tin Can
Alley and the night looks exist here only as single steam captures, so venue
parity for those is argued from one frame each.
