# Scope: the World 1 cast, and the photo captain

*Scoping note, 2026-11-03. Against `kids-roster-v0.7.md` beside this file and
the tree as of `origin/main` 2f7c8109. Status: **cast-1 shipped in the same PR
as this note** (the thirty records re-cast under the old ids, the tally and
album scoped to the cast, the voice lines re-rendered, four flipped slots drawn
as proxies in v2). cast-2 onward, and the photo captain, are still the plan and
the decisions below.*

## 0. The finding that reframes both

v0.7 is not thirty new characters beside the thirty we have. It is **the same
product re-cast**: the three signature kids are already in it (June Halloran is
`nostrike`, Mars's called shot is `calls_shot`, Dev's chair and unhittable pitch
are `wheelchair_ace`), it is thirty kids like ours, and the game's whole data
model (`Character`, the pick tally, the sticker album, the model registry,
the sculpt campaign) is sized for exactly thirty. So the job is **re-casting
thirty slots**, not adding to them. That is much cheaper than it sounds in one
place and much more expensive in another:

- **Cheap:** a kid is a data record in `src/data/characters.ts`. Both renderers
  draw from the same visual knobs with no image files (v1 SVG strings, v2 the
  proxy on the canonical skeleton). Re-cast a record and both games show the new
  kid the same day, named, voiced, draftable.
- **Expensive:** the v2 sculpt campaign is sheet-first. Every delivered
  `kid_<id>.glb` is measured against a concept turnaround for the kid it depicts.
  A re-cast kid needs a new sheet before any sculpt can be judged, and 29 of 30
  sculpts are mid-polish against the OLD sheets. **The cast decision should land
  before more sculpt hours are spent.**

The vote itself is not at risk: all tallies live in individual browsers today
(no backend), so there is no aggregate dataset to protect. What matters is that
the keys stay stable going forward.

## 1. The cast: slot mapping

### Principle

Keep the thirty **ids**. Forty-six files, the registry, the manifest, the blend
sources, the album and the pick tally all key on them. The id is invisible to
players; the name, look, stats, voice and lines all change. The registry
already maps id → slug → source blend, so a re-cast kid gets a new slug and a
new sheet under the old id (`calls_shot` → slug `mars`).

Bump the tally storage version once (`recess_pickcounts` → a `_v2` key) so a
browser that voted for Big Lou is not counted as a vote for Guri. Same for the
album.

### What carries from an existing sculpt

Three things decide whether a kid's body carries to the new cast: **sex, build,
hair**. Stats, name, voice and lines are free. Hair is a part swap in the
sculpt library. A build change (slim → wide, short → tallest) is a rebuild.

| New kid | Slot | Carries | Changes | Carry |
|---|---|---|---|---|
| June Halloran (T1) | `nostrike` | everything | freckles, sliding helmet, choked-up bat; age 6 | strong |
| Mars Delacruz (T1) | `calls_shot` | the ability; re-sculpted against her own sheet (slug `mars`), November 2026 | oversized bat still to build | sculpted |
| Jay Park (T1) | `smokey` | boy, pitching 9, wiry | add glasses, leg-kick windup clip | partial |
| Sonny Fifita (T1) | `tank` | the big body (the exemplar sculpt) | catcher's gear, soft voice | partial |
| Dev Raghunathan (T1) | `wheelchair_ace` | chair, pitching 10 | racing chair, Wobble replaces unhittable | strong |
| Zaya Fontaine (T1) | `rocket` | girl, ponytail, speed 9 | shrink to small and coiled | partial |
| Ezra Bloom (T1) | `bend_it` | boy, the curve | tall and slouchy, bun → short, drop glasses, tzitzit | partial |
| Ollie Nowak | `turbo` | small boy, speed 10 | name and lines | strong |
| Fatou Diallo | `zippy` | girl, speed 9, the one candidate body | pigtails → sport hijab | partial |
| Guri Sandhu | `big_lou` | boy, power 10 | tallest (height up), patka under helmet | partial |
| Yaz Rahman | `mimi_mash` | girl, power 9 | eyes-closed swing face | strong |
| Toby Okonkwo ★ | `chip` | small boy | power way up (the joke is the stat line) | strong |
| Roz Achterberg | `diva` | girl, long hair | pitching up to 9+, age 10 | partial |
| Kwame Boateng | `boomer` | boy | pitching up, wild | partial |
| Greta Lindqvist | `grizz` | nothing: re-sculpted against her own sheet (slug `greta`), November 2026 | — | sculpted |
| Musa Farah | `gizmo` | boy, glasses, small | pitch becomes a wobbler | strong |
| Hattie Bloom | `peaches` | girl, contact 8, bun | lines | strong |
| Anton Reyes | `sniffles` | small boy | contact 10, age 6 | strong |
| Winnie Okafor ★ | `cricket` | smallest girl | never swings (CPU policy) | strong |
| Rafi Costa | `sprout` | small boy, `crazy_bunt` | bunts every pitch | strong |
| Josie Kingbird | `clover` | girl, pigtails | fouls back | strong |
| Sam Whitehorse | `noodle` | small boy, glasses | hit by pitch | strong |
| Nora Begović | `penny` | girl, balanced line | clutch modifier | strong |
| Marcus Webb ★ | `dex` | boy, balanced line | clutch modifier | strong |
| Yui Tanaka | `bubbles` | girl | clutch modifier | strong |
| Lucia Fernández ★ | `lefty` | girl, pitching 9, cap | one curve only | strong |
| Bao Nguyen | `the_prof` | boy, glasses, pitching 7 | the Rainbow (lob) | strong |
| Rudy Achterberg | `flash` | slim body | boy → girl, mohawk → other | partial |
| Amir Haddad | `ace_kid` | boy, fielding 8 | arm up, centre field | strong |
| Roya Nazarian | `moose` | — | boy → girl, chunky → normal | rebuild |

Totals: 17 strong, 11 partial, 2 rebuilds. Four slots flip boy → girl
(`calls_shot`, `grizz`, `flash`, `moose`) because the cast goes 15/15 from
today's 11/19. The two rebuilds are the two bodies the current roster never had:
**a tall broad girl (Mars) and a slim girl in a chunky slot (Roya)**. Swap
Roya and Greta's slots if a chunky girl reads better as Greta than Grizz does.

### New parts the cast needs (both renderers)

These do not exist in v1's SVG kit (11 hair styles, 5 accessories) or the v2
proxy and sculpt library, and each is a part in three places (v1 art, v2 proxy,
sculptlib) plus a measured sheet:

| Part | Who | Cost |
|---|---|---|
| sport hijab (hair slot) | Fatou | medium |
| patka under helmet (hair slot) | Guri | medium |
| tzitzit below hem | Ezra | small |
| catcher's gear | Sonny | large, and triangle-heavy |
| racing chair | Dev | medium (Zoom's chair exists; the only kid with budget headroom) |
| sliding helmet, choked-up bat | June | small |
| oversized bat | Mars | small |

**v1 has all seven as of November 2026** (`VisualParams.signature`, drawn in
`src/art/CharacterArt.ts` in street clothes and team jerseys; Dev's chair is
restyled as a cambered racing chair). The v2 proxy and the sculpts do not read
the field yet, so in v2 these kids still appear without them.

The triangle and byte budgets are full roster-wide (see the asset-budget
memory and `validate-models`), so catcher's gear and the hijab have to be paid
for by removing geometry elsewhere on that kid.

### Mechanics the archetypes need

What exists: `never_strikes_out` (June), `calls_shot` (Mars; tweak so she is
right about once a game), `crazy_bunt` (Rafi), stealing in v2 (Zaya's Green
Light is "steal freely" on top), pitcher stamina in both sims (held off in v2
behind a child-playtest hold), the strike zone already scales with the batter's
height (Winnie's small zone is free), Recess Week already has Monday to Friday
with Friday awards (Ezra's Shabbat constraint has a place to live), the
throwing arm already rides the pitching stat (the Cannons).

**Built in v1 as of November 2026** (`Character.quirk`, rules in
`src/systems/quirks.ts`, numbers in `config.QUIRKS`): the Clutch layer (Nora
when behind, Marcus with a runner in scoring position while tied or behind, Yui
with anyone on), Moonshot (Mars), Winnie never swinging behind a 60% zone,
Zaya's Green Light and her silence, Kwame's and Dev's scatter, Roya's wrong
base, Josie's foul-backs and Hattie's one spot; then, in a second batch, Sam
getting hit by a ball he takes (a free base by the walk's forced-runner rule),
Rafi bunting every pitch, Lu's one-pitch menu, Ezra's no-fastball menu and a
curve CPU batters always swing at, and Bao's pitches arriving half again as
late on the slow-pitch arc. Two departures from this page,
both deliberate: the Clutch kids keep their roster power when NOT firing (the
sheet's 0.30 baseline would rewrite three stat cards), and v1's zone did not
scale with height after all, so Winnie's is a per-kid scale.

**None of the numbers is measured or sourced.** The sheet gives one (the
Clutch's 0.95); the Archetypes document it cites for the rest has never been in
this repo. They are first guesses, all in `config.QUIRKS`, for the maintainer
to correct. (v2's first twelve are below.)

A third batch closed the list of kids: Jay's Heater (his first fastball of
each half inning, or his first pitch in kid mode, arriving in 72% of the time
at double the stamina, a CPU batter always a band late on it) and nobody
relieving him, CPU or human; Roz's every pitch arriving in 86% of the time
with a CPU batter late on three in ten; Musa's one-card menu, where each pitch
works 40% of the time (the sheet's number: it flies as the CRAZY pitch, free)
and otherwise floats in a quarter slower; Sonny and Greta skipping the drop
and bobble roll outright, Sonny with 1.6 times the reach; Ollie immune to the
rundown tag, to being caught stealing (he is back on his bag) and to the
pickoff; Rudy's and Amir's throws at 1.5 times the speed, never wild, and
straight to a bag from beyond relay depth, Amir also chasing with a speed of
10; and Yaz's ball disappearing halfway in with her contact up one band, the
CPU playing her as a lottery instead.

Known thin spots in that batch, none of them hidden by a test: Greta's sure
hands and Sonny's are invisible in kid mode, where nobody drops anything;
Yaz's blindfold
and band bump are not applied to a net guest's swing; and a single Cannon in
centre moved outs per play from 1.247 to 1.269 over 1,444 seeded plays, which
is a small edge for a kid whose tagline is about it.

Then the two rules that are about a team rather than a kid. **Siblings**
(Roz and Rudy, Hattie and Ezra) drafted onto the same nine are each one better
at every stat, capped at ten, wherever a stat is read at the plate, on the
mound or in the field (`quirks.withFamily`); a runner's legs are not covered.
The sheet says only "a bonus"; the size is a guess. **Ezra's Friday**: in
Recess Week's fifth game he is not there, on either side, and the weakest arm
on neither team fills his slot for the day
(`season.teamForDay`); the week's own nine, its stats and the Saturday final
are untouched, and the Friday slot on the week board carries a candle and his
name. The draft card now names each kid's behaviour on the chip abilities
already used, and Musa's one pitch card reads WOBBLER.

Still open in v1: Ezra's Loop is a menu and a chase rule, not yet a pitch
with its own flight; Bao's Rainbow has its arc only in classic (kid mode's
pitch is drawn straight, just slower); Brick House is reach and sure hands on
a fielder, not the catcher blocking model item 7 below asks for. The
classic lineup screen's AUTO now stands Sonny at catcher, Amir in centre and
Rudy on the outfield grass (`quirks.storyLineup`, a pass over `autoAssign`'s
plan that leaves `lineup.ts` and so v2 alone); kid mode, which has no lineup
screen, still fields by draft order.

**v2, begun November 2026, behind a flag.** `src/v2/sim/quirks.ts` reads the
same `Character.quirk` and expresses it as inputs to the physical plate model
rather than as v1's outcome tweaks; the numbers are `params.STORY`. It is off
by default (`features.storyKids`, recorded `never-held` in
`docs/playtests/holds.json`) and reachable at `/?features=storyKids`, so the
pinned games and every measured plate record are untouched until the
maintainer turns it on. The first twelve kids, the mound and the plate:

| Kid | In v2 |
|---|---|
| Lu | the curve is her whole menu, whoever asks for what |
| Ezra | no fastball; a CPU batter always offers at his curve |
| Musa | one pitch; 40% of the time it flies as the crazy ball, with his own aim rather than the crazy ball's doubled scatter |
| Kwame, Dev | the release misses by 2.0 and 1.5 times the arm's own error |
| Bao | every pitch is the floater's flight: as slow as the release solve can throw, heavy backspin |
| Roz | her FASTBALL leaves the hand 12% faster; the other three are untouched, because the release solve already saturates on them |
| Winnie | never offers, CPU or person, behind a zone 60% the size each way |
| Rafi | every swing is a bunt, CPU or person |
| Nora, Marcus, Yui | power 9.5 in their moment, through the bat-speed model |

Not in v2 yet: Mars, Sam, Josie, Hattie, Yaz, Jay (whose Heater needs stamina,
itself held), the runners (Zaya, Ollie), the fielders (Sonny, Greta, Rudy,
Amir, Roya), the sibling bonus and the story positions. Nor does the view know
any of it: the pitch picker still shows four cards for Lu, the drawn zone is
the full one for Winnie, and nothing is called out. And none of the seven
signature looks is on the v2 proxy or the sculpts.

One thing the work turned up that is not about the cast: the release solve
does not hit its flight-time target for the base fastball below pitching 6
(asked for 1.28 to 1.45 s, it throws 1.01 to 1.14 s), so in the shipped game a
pitching-5 arm's fastball arrives sooner than a pitching-7 arm's. It is the
same saturation `sim.throwSpeed.comparedWithThePitch` records for the changeup.

What did not exist in either sim when this page was written, in rough order of
size (kept as the scoping record; see above for what v1 has since built):

1. **A situational modifier layer** (Clutch: runners in scoring position while
   losing or tied swaps power 0.30 → 0.95; the sibling bonus). New, but
   data-driven once built.
2. **Hit by pitch** (Sam). Neither sim has it. Touches the plate model and the
   runner advance rules in both.
3. **The Wobble** (Dev, Musa): a pitch whose location is random with walk risk.
   v2's plate model makes this a pitch kind with a wide scatter; v1 is a
   corridor tweak.
4. **The Loop and the Rainbow** (Ezra, Bao): v2 has real Magnus and gravity, so
   these are pitch kinds with authored break. v1 fakes break; a corridor tweak.
5. **Heater** (Jay): one max pitch per inning at double stamina. Needs stamina
   ON in v2, which is held pending the child playtest.
6. **Moonshot** (Mars): perfect timing is gone regardless. A contact-model clause.
7. **Brick House** (Sonny): a catcher who smothers anything within reach. Needs
   a catcher blocking model; today the catcher is a pose, not a fielder.
8. **CPU policies** (Winnie never swings, Rafi always bunts, Roya throws to the
   wrong base, Jay refuses relief). Per-kid flags on the existing CPU policy.
9. **Tiering** (Tier 1 / Tier 2 and promotion by pick rate). A `tier` field and
   a read-out. No backend means no aggregate yet; that is Phase 2 on the roadmap.

**The Archetypes doc and the Project Overview that v0.7 cites are not
attached.** The numbers above (0.30 / 0.95, "double the stamina cost") come
from the roster file; the rest of the mechanics need their sheet before they can
be built honestly, since the sim records every tunable in `params.ts` and
`config.ts` with provenance.

### Content that must be rewritten per kid

Name, tagline, draft shout, chatter lines (the roster gives one hook each; the
game wants a shout and two or three chatter lines in the kid's own voice), the
`voiceGender` band, the street outfit, and the face and body knobs. Thirty
records. This is the part that lands in both games the same day.

Also one audit the roster asks for: the team-logo set in v2's team screen
(`TEAM_LOGOS`) has to be checked against "no Native iconography, ever".

### Delivery shape

| PR | What | Size |
|---|---|---|
| cast-1 | Thirty records re-cast under the old ids; tally and album key bump; registry slugs; both games show the new cast on proxies / SVG | M, one PR, both games |
| cast-2 | New parts in v1 art and the v2 proxy (hijab, patka, tzitzit, helmet, bats, chair, gear) | M to L, 2–3 PRs |
| cast-3 | Mechanics, one PR per archetype group, each behind a feature flag with a hold record | L, 6–8 PRs |
| cast-4 | Thirty new concept sheets, then the sculpt campaign resumes against them, strongest carries first | the long tail, weeks |

Order matters: **cast-1 before cast-4**, and PR 294 (batch 5 polish of Tank,
Grizz, Moose, Smokey) should merge first because three of those four bodies
carry (Sonny, Greta, Jay).

## 2. The photo captain, friends, and the backyard

v2 already has a non-voting custom captain: a persisted profile of nickname,
play style, skin, hair, hair colour, accessory and voice that materializes as an
ordinary `Character` through the proxy path and sits on the player's bench.
The photo feature is "fill that profile from a photo", not a new system.

### Phase A: a bench of friends (no photo yet)

- Profile becomes a list; ids `custom_player_1..n`; the registry test learns the
  prefix. Still outside `ROSTER`, the tally and the album.
- Profile schema grows the body and face knobs (height, shoulders, eye gap and
  size, nose, mouth width, freckles) so a photo has somewhere to land.
- Draft seats up to N customs on the player's bench, with authored kids filling
  the rest; the player still casts the remaining votes.
- Size: one PR, v2 only.

### Phase B: photo to profile

Two extraction paths; ship the first, add the second if hair style turns out to
matter as much as expected.

1. **On-device, no server.** File input → canvas → face landmarks (a lazily
   loaded landmark model from a CDN, outside the pinned bundle) → skin tone
   sampled from the cheeks and snapped to the palette index, hair colour from
   above the forehead, face proportions to eye gap and size, glasses by a
   simple edge check. Hair style is the weak spot; pre-seed the picker and let
   the kid confirm. The photo never leaves the browser and is never stored; only
   the knobs persist.
2. **Server-assisted.** A free-tier serverless function holds a vision-model key
   and returns the visual knobs as structured output: hair style out of the
   eleven, glasses, freckles, expression, build. Parent gate before the upload,
   no retention, rate limited. Better likeness-as-caricature, real privacy and
   legal weight because the players are four to eight.

Size: path 1 is one to two PRs; path 2 adds a small worker repo and the gate UI.

### Phase C: backyard to venue

A venue is also data: fence line each side, bulge, roll and bounce, obstacles
with position and radius, and a look palette (grass and dirt colours, fence
style of planks, chainlink or wall, skyline, treeline, mow pattern). v2's
scenery is generated from the venue record. So a yard photo becomes: grass and
fence colour, fence type, tree count and side, a short porch on the house side.
The same extraction shape as the face, and the fair-cone and convex-fence gates
keep whatever comes back valid.

The lift is bigger than the captain because the venue id is a closed union in
both trees (`VenueId` in `src/data/venues.ts` and `src/v2/sim/field.ts`) and
`recess_venue` stores an id. A runtime venue means a `custom` id with a stored
profile, both renderers accepting it, and a validator run on the stored
obstacles at load. Size: two PRs for v2, one more for v1.

### Phase D: v1 parity (optional)

v1 has no custom captain at all. Adding one touches the Phaser draft scene and
the texture factory, which key by id, and sits on the goldlog path. One to two
PRs, after the cast work, if wanted.

### The two constraints that shape the design

- **No backend, static, free.** An AI call cannot ship its key in the bundle.
  Either on-device only, or a tiny serverless proxy.
- **Children's photos.** On-device is the default; nothing leaves the browser.
  If a server is used: a parent gate, no retention, delete after inference.

## 3. Decisions needed

1. Re-cast in place, keeping ids, with a one-time tally key bump. (Recommended.)
2. Approve or adjust the slot mapping, especially the four boy → girl flips and
   the two rebuilds.
3. Pause new sculpt work after PR 294 until sheets exist for the new cast.
4. Attach the Archetypes doc and the Project Overview so the mechanics can be
   built from their sheet.
5. Photo path: on-device only, or on-device plus the parent-gated server step.
6. Order: cast-1 first (cheap, lands in both games) or Phase A of the captain.
