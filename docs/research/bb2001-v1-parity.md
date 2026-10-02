# v1 (`/classic/`) against Backyard Baseball 2001 — the gap list

Started 2026-10-01. v1 is kept (it still holds Recess Week, the album,
pass-and-play and online play), and the maintainer likes it alongside v2, so
this list brings **v1's game features** up to BB2001's. v2's parity work is
tracked separately in `backyard-2026-reference.md`.

What BB2001 does is taken from `backyard-2001-video-notes.md` and
`bb2001-local-capture-index.md` where it was observed there. Other entries are
marked *(recalled)*: BB2001 features no capture has recorded yet. Measure them
before tuning anything to them.

## What v1 already matches

Draft from a shared pool with a greedy CPU captain · per-kid stats and signature
abilities (Junebug, Theo, Zoom, Sprout's CRAZY BUNT card) · pitch cards
(fastball, changeup, curve, screwball) aimed into the zone · juice earned in play
and spent on power swings and special pitches, with the CPU spending too ·
fatigue and relief from a bullpen · steals with a race · send and hold per
runner, tag-ups and rundowns · throws to a chosen base with a power charge ·
dives · stat-driven errors · three venues with different fences and ground ·
two announcers plus kid chatter · instant replay · innings and difficulty
settings · a season with a saved schedule (Recess Week) · pass-and-play and
online play · BB-style count pips, a pitched ball that stays where it crossed,
the pitcher's toss idle, the batter dodging, and the chaser's name bubble.

## Gaps, ranked by what a kid notices first

| # | BB2001 | v1 before | Status |
|---|---|---|---|
| 1 | Running "TODAY" line per batter, a Player of the Game earned in play, an end-of-game box | Batting line was hits and at-bats only; "TEAM MVP" was the highest-*rated* kid, whatever happened | ✅ `feat/v1-box-score`: `systems/boxscore.ts`, Result card + box |
| 2 | INTENTIONAL WALK pitch card; "ON THE MOUND" pitch count | No intentional walk; no pitch count shown | ✅ `feat/v1-intentional-walk`: 🚶 WALK on the pitch menu. Pitch counts are in the box (#1); no on-screen mound plate yet |
| 3 | Swing stack POWER / LINE DRIVE / GROUNDER / BUNT | SAFE / BIG / BUNT (no grounder to move runners) | ✅ `feat/v1-grounder-swing`: ⬇️ GROUNDER forces a ground ball at full power. SAFE plays BB's LINE DRIVE role |
| 4 | Defensive positioning from the top-left mini-diamond (infield in, outfield deep) | Fixed positions | ✅ `feat/v1-defense-alignment`: a 🧤 pad on the pitch menu cycles NORMAL / INFIELD IN / PLAY DEEP (`systems/alignment.ts`). Solo only; the CPU defence stays NORMAL |
| 5 | A season ending in playoffs and a championship game; standings among all teams *(recalled)* | A 5-game Recess Week with your W/L only | ✅ `feat/v1-championship`: a six-team round-robin league table (`systems/league.ts`) and a Saturday final for the top two |
| 6 | League leaders across the season *(recalled)* | Three end-of-week awards | ✅ `feat/v1-season-leaders`: 📊 STATS on the hub opens the week's board (AB, H, AVG, HR, R, K), each column's leader lit gold |
| 7 | Pickoff throws to a base with a runner leading off *(recalled)* | Lead-off is cosmetic | ✅ `feat/v1-pickoff`: 👀 PICK OFF throws to the lead runner. The CPU decides to steal when the menu opens, a leaning runner pulses the pill red, and the cap is 2 throws per batter |
| 8 | A coin toss for first pick *(recalled)* | The player always picks first | ⛔ declined on purpose: the greedy CPU captain takes the most valuable kid first, so losing the toss half the time would keep the top kid out of reach and lower their pick rate for reasons that have nothing to do with popularity. Picks are the product's vote (root brief). |
| 9 | The live-play HUD shrinks to a mini score and outs | The full strip stays up | ✅ `feat/v1-live-hud`: the wide view drops the count, AT BAT line and mini-diamond (`Scoreboard.setCompact`). The swing cards, which used to stay on screen through a live play, now hide in flight as BB2001's do |
| 10 | Pinch hitters and bench moves mid-game *(recalled)* | Pitchers only | ⛔ not applicable: a drafted team is exactly nine kids, so there is no bench to bring in. Relief already swaps positions within the nine |

Not on the list on purpose: licensed pro players, and BB2001's flat
three-quarter field perspective (`geometry.projectionType`, a separate
product decision).

## Where this leaves v1

Every gap above is closed, or declined with a stated reason. What remains open
against BB2001 is presentation rather than game features:

- **Perspective**: the field projection is still flat, which is a product decision (`geometry.projectionType`).
- **Voice**: production voice acting, which v2 owns.
- **Measured pace**: the records still marked `awaiting-measurement` in `scripts/measures.json`.

None of these is a missing feature a player would look for.
