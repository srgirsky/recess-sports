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
| 2 | INTENTIONAL WALK pitch card; "ON THE MOUND" pitch count | No intentional walk; no pitch count shown | open |
| 3 | Swing stack POWER / LINE DRIVE / GROUNDER / BUNT | SAFE / BIG / BUNT (no grounder to move runners) | open |
| 4 | Defensive positioning from the top-left mini-diamond (infield in, outfield deep) | Fixed positions | open |
| 5 | A season ending in playoffs and a championship game; standings among all teams *(recalled)* | A 5-game Recess Week with your W/L only | open |
| 6 | League leaders across the season *(recalled)* | Three end-of-week awards | open |
| 7 | Pickoff throws to a base with a runner leading off *(recalled)* | Lead-off is cosmetic | open |
| 8 | A coin toss for first pick *(recalled)* | The player always picks first | open |
| 9 | The live-play HUD shrinks to a mini score and outs | The full strip stays up | open |
| 10 | Pinch hitters and bench moves mid-game *(recalled)* | Pitchers only | open (low: 4–8-year-olds rarely use it) |

Not on the list on purpose: licensed pro players, and BB2001's flat
three-quarter field perspective (`geometry.projectionType`, a separate
product decision).
