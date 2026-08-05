# Recess Sports — Overview

The deep-context doc: what we're making, why, and how it's put together. For the quick AI on-ramp see `../AGENTS.md` (`CLAUDE.md` symlinks to it); for run/build/deploy see `../README.md`.

> **★ THIS FILE IS THE PAST TENSE, and that is what keeps it from duplicating the
> briefs.** It owns the STORY: what we believed, what the symptom looked like,
> which change fixed it, and what it cost. The briefs own the RULE — imperative,
> present tense, and lint-checked to contain no `PR <n>` and no "used to".
> `scripts/measures.json` owns the NUMBER with its provenance, and a brief cites
> the record id rather than the value.
>
> So a finding lands here once and is *pointed at* from the brief for the tree it
> governs. Writing the story into a brief as well is the duplication that made
> the root brief 161 kB; `../AGENTS.md` § "Keeping docs current" has the full
> routing, and `scripts/AGENTS.md` has the discipline for the records.
>
> This file is **not** auto-loaded, so length costs nothing per session. Be as
> generous here as the finding deserves.

---

## The product

**A free web baseball game for little kids** (ages 4–8, centered on 6). You draft a team of 9 from 30 neighborhood characters, then play a short pitch-and-swing game against a CPU team.

### The real thesis: the characters are the product

The game is free because **its job isn't to make money — it's to tell us which of the 30 kids people love.** Every time a player drafts a character, that pick is tallied. Pick rates are a voting machine: whoever wins gets the toy, the shorts, the show, the sequel. The classic kids' baseball games found their breakout character by accident; we're building the instrument that finds them on purpose.

Two consequences for every design decision:
1. The **draft** is the most important screen — it's where the vote happens. Characters must be distinct and lovable at a glance.
2. Pick logging is a **first-class feature**, not an analytics afterthought. (Today it's `localStorage`; a cross-player backend is the obvious next step.)

### Design pillars (ages 4–8)

- **Minimal reading.** Icons, color, and voice over text. A 6-year-old who can't read should be able to play.
- **Icon/voice-forward.** Stats shown as bars/pips; callouts spoken; feedback is visual (pops, shakes, runners).
- **Short games.** Two innings (plus at most one bonus inning on a tie). Fast to start, fast to finish, easy to replay.
- **Forgiving but skillful.** Timing is the skill (see below); stats add character flavor; the timing windows are wide enough for little kids and tunable in `config.ts`.

### Roadmap

- **Phase 1 (now):** 30 kids on a diamond. Draft → play → result. Collect pick data. *This is what exists.*
- **Phase 2:** Turn the pick-rate winners into toys/shows; a real backend to aggregate votes across all players; more characters, richer art, sound.
- **Phase 3:** The wild stuff — e.g. drafting a T-rex. Deliberately held back so Phase 1 lands as "a real baseball game," not a novelty.

---

## v2 — the 3D rebuild (in progress, at `/v2/`)

v1 ships and works, but two things were not fixable by iterating on it, and they
turned out to have the same root cause: **it was never modelled at real scale.**

**1. The art could not stop looking flat.** `art/projection.ts` is 87 lines of
affine trapezoid pinch — no z, no perspective divide, no lights, no shadows. The
measurement records had already said so out loud: `geometry.projectionType` sat
at permanent `known-drift` because *BB's field is true perspective and ours is
affine*, and `geometry.fieldScale` was stuck at 34.0% against a measured 41–42%
because four layout constraints pinned the single `ZOOM` scalar. Neither is
reachable inside an affine projection, at any amount of tuning.

**2. The balance problem was geometry, not tuning.** Convert v1's field to feet
(its 179.64px basepath read as 60ft ⇒ 2.994 px/ft) and centre field sits at
**89ft — 1.49 basepaths** where Little League is 2.5–2.9, with the fence at 1.75
against a real 3.1–3.4. The outfield was half as deep as it should be and the
outfielders stood where a deep infield belongs. That is why BABIP went 0% → ~7%
against baseball's ~30% across three rounds of speed retuning and an invented
cutoff relay: **you cannot create an outfield gap when there is no outfield.**

A happier check pointing the same way: BB2001's measured pitch corridor of
1227ms over a 46ft mound is **25.6 mph** — exactly a 7-year-old's fastball. The
instrument and the real-units decision agree independently.

So v2 rebuilds on **three.js + real feet**: 60ft basepaths, 46ft mound, ~200ft
fences, a ball with real gravity, quadratic drag and Magnus spin integrated RK4
at 240Hz, and bat-ball contact that produces exit velocity, launch angle and
spray from *where and when* you swung — replacing v1's categorical
grounder/liner/fly roll. Hit rates then **emerge** instead of being tuned.

All HUD and menus become HTML/CSS over the canvas, which deletes the entire
measure-then-place layout apparatus (CSS Grid + one `clamp()` scalar does what
`solveRow`/`solveColumn` computed by hand) and makes v1's "any tap swings the
bat" gotcha class structurally impossible.

**v1 stays live and untouched throughout.** Both games build from one Vite
config; the votes (`recess_pickcounts`) are shared so the voting machine never
loses continuity. See `AGENTS.md` § "Which tree am I in?" for the split.

### What the renderer change buys, concretely

Two of v1's permanent `known-drift` records **close**, and they close in a unit
test rather than by eye. A real `PerspectiveCamera` has independent elevation,
distance and FOV where the affine projection had one pinned scalar, so
`render/cameraCues.ts`'s `FIELD` rig is *solved* rather than chosen — 40°
elevation, 155ft, 46° FOV — and `cameraCues.test.ts` projects the four bases
through its matrix to assert the measured foul slope (1.197–1.241) and basepath
framing (41.4%) directly. No pixels, no screenshot diff.

### The finding that came out of doing it

Real units made two *previously compatible* records arithmetically
contradictory. BB2001 draws a kid at **0.205 basepaths** tall; a real 4ft child
on a real 60ft basepath is **0.052**. Matching BB's character presence at BB's
field framing needs a **fourteen-foot kid** — taller than the wall they rob home
runs at. BB could do it because its field was a painted backdrop with no physics
behind it; we cannot, because real gravity over real distances *is* the balance
fix. Recorded as `render.characterPresence` in `scripts/measures.json`, and
resolved by splitting the wide camera (a conforming `FIELD` establishing shot, a
closer `PLAY` rig the game actually lives in) plus a render-only 1.6×
exaggeration that never touches the sim. This is the measurement discipline
doing exactly what it is for.

### Status

**Stage 0 (the Look Spike) is done** — the park in 3D at kid scale, toon-shaded
with inverted-hull outlines under the brand's upper-left key light, action-fitted
shadows, 18 proxy characters, at 60fps / 52 draw calls / 98k triangles against a
budget of 90 / 180k. Proxy characters are built from primitives on the *same*
canonical skeleton the commissioned models bind to, driven by the `VisualParams`
already authored for all 30 kids — so they are simultaneously the acceptance test
for the skeleton spec and the reason no engineering work is ever blocked on art.

**The animation contract is executable** (2026-07-30). The commission brief for
the shared clip library (`docs/v2/animation-brief.md`) cited four acceptance
gates, three of which did not exist: `npm run validate:models`, the
`skeleton_recess_v1.glb` it tells you to send with it, and any way at all to
*watch* a delivered clip. All three exist now. `src/v2/render/clips.ts` is the
35-clip contract in code and the two markdown copies are parsed and checked
against it; `scripts/v2/validate-models.mjs` rejects a delivery on bone order,
bind-pose drift, height band, root motion, off-grid frame rate, unclosed loop
seams, measured body travel and derived marker frames — and every one of those
rules has a test that deliberately breaks something and demands the specific
rejection, because a rule that never fires is indistinguishable from no rule.
Crude **procedural stand-ins** cover all 35 clips, so the proxy characters move
today and a real delivery replaces them clip by clip; `/v2/?anims=1` is where
they get reviewed. The Look Spike's defence now crouches in `field_ready` and
its batter takes a stance instead of standing in bind pose, and the animation
costs essentially nothing: 18 mixers measured at **0.063 ms/frame**, 0.4% of a
16.7 ms budget, with the scene at 56 draws / 109k triangles against 90 / 180k.

Writing it surfaced the kind of error the measurement instrument exists for.
**The canonical rig was 3.400 ft while claiming 4.0** — 15% short, and below the
3.6 ft floor of the height band the same file defines for everyone else —
because nothing ever summed the bone table. The proxy was shorter still (3.105
ft drawn), which quietly made `render.characterPresence`'s "~5% of frame height"
really 3.9%. It mattered because that number was about to be printed at the top
of a commission brief, and stride length, foot plants and dive travel are all
authored in absolute feet against the rig the animator is handed: a 3.4 ft rig
buys 35 clips whose every distance is 17% wrong, discovered after the invoice.
Fixed, and now pinned by a test that asserts the sum exactly and the drawn
bounding box within 2% — see `render.rigHeight`.

**Then the same instrument, pointed one layer down at the DRAWING rather than
the bone table, found four more** (2026-07-30). The bounding-box test measures a
single point of a single bald fixture, so it stayed green over a head drawn at
37% of body height against a brief that says 32%, a torso 0.49 ft tall and 1.18
ft wide (an ellipsoid axis handed a length where the API wanted a scale factor),
0.228 ft of open air where the neck goes — nothing was bound to the `Neck` bone
at all — and 44 of 44 hair × accessory combinations measured by nothing, which
hid an afro standing 14.2% of a body above the crown and a `spiky` whose cones
sat inside the skull, collapsing one of eleven silhouettes onto another. The
proxy is not disposable: it is the acceptance test for the skeleton spec, the
permanent LOD3, the load-failure fallback, and until models land it is the only
character anyone sees — so "readable silhouette", the presence
`render.characterPresence` says must come from design rather than size, was the
one term that was measurably wrong. Fixed and pinned across every style, and the
proxy now carries a facing cue (eyes, brows and a nose, never a mouth —
expression is a texture on the delivered models) because a featureless head is
rotationally ambiguous at 40 px, which is precisely the size the review page
judges at. The neck and the face cost 512 triangles a kid (2,936 → 3,448, +17%);
the Look Spike measures 46 draws / 93.3k triangles against the 90 / 180k budget.
See `render.proxySilhouette`.

**And the face was itself half invisible** — a different error class, found by
trying to add one more feature to it. The bbox tests measure the silhouette's
outside, so a feature swallowed by what is in front of it changes nothing they
look at: the afro was a single convex ball that covered its kid's entire head
(zero pixels of skin), the glasses sat 0.37 radii above the eyes and 0.011 radii
proud, and every feature was placed at an absolute depth while the skull's own
depth scales with head width, so a brow is swallowed on the widest four kids.
Features are derived from the skull surface now, a wide hair style carries its
silhouette and its hairline as two parts rather than one, and the visibility
question is asked by casting rays along the real play camera and checking which
part owns the frontmost surface — keyed on part identity, never colour, because
the nose is skin-coloured on a skin-coloured head. The review page was also
standing the kid with its back to the camera. See `render.proxyFace`.

**The character pipeline is consumable** (2026-07-30). The asset contract's §4
described a file nobody had produced and a runtime that could not have loaded
one: nothing under `src/v2/**` imported a `GLTFLoader`, `perfTier.lodBias` was
read by nobody, and the `MaterialRegistry` written for the four material slots
had never been handed one. `checkCharacter`'s rules had only ever seen two
synthetic fixtures built to fail. All of that is now live: a delivered
`kid_<id>.glb` loads through one Draco/KTX2-configured loader, switches between
its three LOD nodes at distances DERIVED from apparent pixel size, rebinds its
material slots onto the toon shader, takes the drafting team's colour as a
multiply on `M_Uniform`, swaps expressions out of the `face_atlas`, and degrades
to its proxy — as LOD3, and as the fallback on any failure — with `?proxy=1` to
force the comparison. `npm run export:proxy-kid` writes contract-legal stand-ins
from the proxies themselves, so the gate and the engine were both exercised
against real files before any art exists; the same move `proceduralClips.ts`
makes for animation.

Two things surfaced that only a running frame could. **A `.glb`'s joints are
siblings of its meshes**, so lifting the LOD nodes into a new group orphaned the
skeleton: thirteen characters reported a mesh, a LOD level and a shadow caster
each, and drew nothing at all. The unit tests could not see it — the scene graph
was correct in every respect they knew to ask about — and the readout said
"drawn 13 model / 0 proxy" over an empty field, which is exactly the failure the
review page's model-vs-proxy census exists to make visible. And **a delivered
model costs up to 8 draw calls where a proxy costs 2**: 13 models measured 122
draws against a budget of 90, while halving triangles. Neither number was wrong;
`ProxyCharacter`'s "the 2-draw-calls-per-character the perf budget allows" was
simply a fact about proxies that read as a fact about characters, and the 90 has
never been re-derived against a scene with models in it. Recorded as
`render.characterDrawCost` with the three ways to close it, rather than shipped
quietly over budget.

**The sim core has started, and the first thing it needed was a fence** (2026-07-31).
`src/v2/sim/` was two files — unit conversion and field geometry — and 477 lines
against the render tree's 8,792. There was no ball, no integrator, no contact
model, no `Rng`; `G` was defined and used by nothing, and the four venue physics
fields (`rollFriction`, `wallRestitution`, `bounceMult`, `obstacles`) were
authored, tested, and consumed by nothing.

Step one is `sim/rng.ts`, and the interesting part is not the generator. v1's
most expensive determinism bug is that every `add.text` draws a UUID from
`Math.random`, so creating, removing or reordering **any** Text object shifted
the whole seeded stream and broke the goldlog. The lesson usually taken is "keep
cosmetics off the rng"; the deeper one is that a **single global stream makes
call order part of the contract**, so an unrelated change cascades and the
fingerprint reports a difference that means nothing. `fork(label)` derives each
substream from `(root seed, label)` and never from the parent's position, so
adding a draw to one cannot move another — the failure class is deleted rather
than avoided. `normal()` is deliberately absent: every textbook sampler needs
`Math.log`, which ECMAScript specifies as implementation-approximated, and a
fingerprint that depends on it goes red on a V8 bump and reads as somebody's bug.

The other half was the gate. `purity.lint.test.js` existed but its pure-systems
whitelist held **29 names**, among them `geometry` — v1's 960×640 screen pixels —
along with `liveplay`, `atbat`, `fielding`, `mode`, and six modules that touch
`localStorage` or Web Audio. The file's own header says its job is to stop pixels
leaking into the sim, because real feet *are* the balance fix. It was harmless
only because it was **vacuously satisfied**: nothing in the sim imported any
system at all, so the fence had never been leaned on, and a wish list would have
become a hole the moment sharing started for real. It is now five names, each
re-derived rather than asserted — a whitelisted module must itself be
browser-free, `Math.random`-free, and value-import only other pure modules,
because naming a module "pure" is a claim and nothing was checking the claim.
Type-only imports get their own wider lane (they erase, so they cannot carry a
constant), and a new one-way rule means nothing outside `src/v2/**` may import
v2 — which is what actually guarantees a v2 edit cannot reach v1's bundle, where
before there was only care. Every one of the six new rules was verified by
breaking the code it rejects and demanding the specific failure.

**The ball is real, and it answered the balance question before anything could
be tuned around it** (2026-07-31). Gravity, quadratic drag and Magnus spin,
integrated RK4, with collisions resolved by BISECTION rather than step size.
The coefficients are not invented: they are Nathan's published Trajectory
Calculator fit, read from the paper rather than recalled — `C_D = 0.297 +
0.0292·(ω/1000rpm)` and `C_L = 1.120·S/(0.583 + 2.333·S)`. Two happy
consequences fell out. Both forms are pure arithmetic, so the plan's committed
interpolation tables — there to keep the future determinism fingerprint stable
across V8 versions — turned out to be unnecessary, and a lint now keeps the
per-step path that way. And `K = ½ρA/m` folds air density, cross-section and
mass into one number that Nathan also publishes, so deriving it validates all
three at once: we get 5.4929e-3 against his 5.509e-3, and the 0.29% is *his*
rounding (his Eq. 9 normalises on 0.0767 lb/ft³; 1.225 kg/m³ is really
0.076482). Feeding his rounded density into our own formula reproduces his
constant exactly, which is what makes that a bookkeeping note rather than a
discrepancy.

Two things the measurement found that the design doc had asserted. **240 Hz is
not an accuracy choice.** RK4 here is fourth order — measured error ratios 16.20
and 16.13 per halving against a textbook 2⁴ — and accuracy *saturates at 60 Hz*,
where a flight lands within 3e-9 ft of a 15360 Hz reference. 240 earns its place
for phase (4×60 = 2×120, so the renderer's interpolation remainder is exact) and
for collision sampling, and the comment now says so. Getting there also cost a
test: the first convergence check compared 240/480/960 Hz and returned a ratio
of **zero**, which read as a broken integrator and was really a broken test —
at those rates the discretisation error is already at the double-precision
floor, so it was measuring rounding. The same class of error as
`pace.pitchCorridor`'s "the tolerance was the noise".

**And the plan's number-one risk turned out to point the other way.** It was
written as "every ball is a home run" — MLB-shaped exit velocities over a 200 ft
park. The integrator alone says the opposite: clearing the park's shortest fence
takes **57.5 mph** of exit velocity and its centre field takes 62.5, while
published youth guidance puts 8-and-under at 45–55 mph *off a tee* with game
exit velocity 5–10 mph lower. A real four-to-eight-year-old hits 35–50 mph and
clears nothing. That is v1's problem exactly inverted: v1 had no outfield so
every ball was an out; v2 has a real outfield and real kid strength, so nothing
leaves the yard. The resolution is a game-design decision and is recorded as
one — **the power stat earns it**: the fences stay, and PR 4 maps power 1→10
onto roughly 35→60 mph, so only genuine sluggers clear the short parts, the
park's 212 ft centre stays out of reach for everyone, and the sandlot's 150 ft
porch becomes the cheap-homer park its own data file already intends. Shrinking
the fences was the obvious alternative and loses more than it gains: it drags
`FIELD_POSITIONS` in with it and returns the outfield to about two basepaths,
which is the thing v2 exists to fix. See `sim.carryVsFence`.

The measurement schema grew a required field to hold all this. Every record now
declares `reference` — `bb2001 | baseball | physics | derived` — because
`conformed` had quietly begun to mean three incompatible things, and the failure
that invites is specific: somebody eventually conforms a game for four-to-eight-
year-olds to MLB's strikeout rate and every gate in the file agrees with them.

**The ball now bounces, rolls and caroms** (2026-07-31), which finally gives
`field.ts`'s venue physics fields a consumer and `fenceIsConvex` its first
actual caromed ball — the convexity had been asserted for three months on the
stated grounds that it "guarantees a caromed ball always reflects back INTO the
field", with nothing ever testing the consequent. It does now, across every
venue, every spray angle and every inbound heading.

The impact model is derived rather than looked up: solving the impulse problem
for a sphere gives the grip impulse `(2/7)m|u|` and `v' = (5v − 2ωR)/7`, and the
minus sign is the part memory gets wrong. Two results are worth stating because
both look like bugs and are not. **Topspin accelerates the ball off the bounce**
— measured 12.21 → 12.92 ft/s — because friction converts rotational energy into
translational; the first version of the test asserted that speed never increases,
failed on exactly that case, and was itself the error. The invariant is energy.
And **backspin does not bounce a baseball backward**. It does in the model, but
only above about 2900 rpm; at real batted-ball spin a chopper is slowed hard
(20 → 7.4 ft/s) and keeps going. The catchier claim was in the first draft of
the test name, and measuring it is what took it out.

**And the sim contradicted the venues.** The blacktop has by far the lowest
rolling friction and in isolation rolls a ball 3.6× as far as shaggy grass — but
end to end it comes to rest *shortest of the three*, because its restitution is
also the highest, so the ball spends its energy bouncing instead of rolling and
every landing takes forward speed out through the grip. `data/venues.ts` calls
it "hot asphalt — the ball SPRINGS" and means it as the fast park. A surface
cannot be both the springiest and the fastest; v1 only held both because its
bounce and roll multipliers were independent renderer knobs with no physics
between them. Recorded as `sim.venueRollFeel`, a `known-drift` with the ratio
pinned, rather than resolved by quietly editing a constant until the assertion
flipped — which is the failure mode this whole apparatus exists to catch.

One happier surprise: the ground restitutions were hand-authored months ago, and
a published band turned up for them. Brosnan & McNitt's Pennbounce work at Penn
State measured baseball COR on infield surfaces at **0.4–0.6**, tracking surface
hardness. The park's mown grass lands at 0.50 and the sandlot's shaggy grass at
0.40 — both inside it — while the blacktop's 0.65 falls outside, correctly,
because asphalt is not a turf surface. Somebody's guesswork, checked against real
literature after the fact, and it held.

**Contact is real, and the home run survived** (2026-07-31). A swing now produces
an exit velocity, a launch angle, a spray and a spin, and hands them to the
integrator — replacing v1's `buildLaunch`, which rolled a *category*
(grounder/liner/fly), looked the distance up in a table, and decided the home run
at the moment of contact. There, whether a ball left the yard was an input.

The physics is an identity rather than a fit. Nathan's
`v_f = e_A·v_ball + (1 + e_A)·v_bat` is exact for any ball, bat and collision
model, so it is asserted symbolically; and `e_A` is itself derived, from
`(e − r)/(1 + r)` with `r` the bat's recoil factor. That last relation is what
makes a child not a small adult: a light bat recoils more, so `e_A` falls from
about 0.20 at an adult's effective mass to 0.098 at a youth bat's. No fudge
factor appears anywhere. The check with no free parameter at all is the tee: off
a tee the pitch contributes nothing, so exit velocity is `(1 + e_A)·v_bat`, and
bat speeds of 40–50 mph give 44–55 — against a published 8-and-under tee band of
45–55. A physics identity and a coaching benchmark, agreeing.

**And `sim.carryVsFence` is closed.** The power stat maps to a bat speed (35–53
mph, which is published Little League data carried down to four-to-eight-year-
olds) and the collision turns that into carry. Measured over the real roster: 3
of 30 kids can clear the park's 185ft line, 12 of 30 can clear the sandlot's
150ft porch, and **nobody** reaches the park's 212ft centre. Exactly what the
record's resolution said it should be, with the fences untouched — which was the
point. An earlier band cleared the line by *one foot*, a number that reads as
success and behaves as failure once contact quality takes its cut; widening it
was a reviewed decision, on the record.

Three bugs shipped through the demo rather than through review, and all three
are the same shape — a solve that compensates for an error and hides it. Aiming
the pitch straight at the plate put it **26 feet underground**, because the
measured 1230ms is a flight *time*, not a release speed, and a 1.23s flight over
46ft falls 24ft on the way. Fixing that by solving for the release exposed the
next one: the crossing height is not monotone in elevation, so a plain bisection
returned a near-vertical lob that took 2.7s and crossed 170ft low. And with the
solve working, **every spin axis was inverted** — the fastball's "backspin" sank,
the curve rose while breaking toward first — and nothing caught it, because the
solve simply re-aimed and the ball still arrived exactly where it was sent. Only
the lateral break shows it, which is why a test now asserts break *direction*.

One correction to an earlier one, too. `bounce.ts` had recorded Kensrud, Nathan
& Smith's finding that a gripping ball spins "up to 40% greater than would be
obtained by rolling contact", and applying that here **double-counts**: their
measured ceiling of 3500 rpm sits at the rolling limit itself, not 40% above it,
so the 40% is normalised against something the abstract does not state.
Multiplying by 1.4 put a kid's batted ball outside the band the paper measured.
The derived rolling limit is used instead, and the enhancement is recorded as
pending rather than guessed at.

Finally, an open record got much heavier. Nathan's drag fit is verified over
60–110 mph. The roster hits 43–61, so **29 of 30 kids** put batted balls below
the floor of the band the fit was measured in: essentially every ball this game
will ever simulate is an extrapolation past the edge of the measurement, and the
statistical harness will be measuring BABIP straight through it.
`sim.aeroModelLowSpeed` has had its significance raised rather than being quietly
leaned on.

**Fielders and runners now exist, and a gap ball is finally a hit**
(2026-08-01). The headline was meant to be one speed function — `defense.fielderSpeed`
records v1's `FIELDER_SPEED` drifting to 2.48× runner speed across five retunes,
because fielders and runners each had a constant, and its conclusion was that "a
kid does not get faster by putting a glove on". Here there is no fielder speed to
drift: `athletes.ts` has one function per physical quantity and both callers call
it, with the purity lint asserting that textually *and* functionally, over all 30
kids and the whole 1–10 stat range rather than only the values the roster happens
to use.

Two larger things turned up while building it, and **neither had a measurement
record anywhere.** v1's `LIVE.CATCH_RADIUS` is 34px — **11.36 ft** at its own
scale, a four-foot child catching a ball eleven feet away, with a dive reaching
21.4. Area goes as r², so a v1 fielder covered **14.3× the ground a real kid
can**, which is a large part of why "every ball a fielder reaches is a putout"
and is nowhere in `defense.*`. And v1 CLASSIC throws at 9.65× runner speed
against a published youth band of roughly 2.9–4.1×; v1 KID, the one mode that
actually produces base hits, throws at 4.60×, which makes its playability an
explained result rather than a coincidence. Both are now records
(`sim.catchRadius`, `sim.throwSpeed`), the second anchored on published youth
throwing velocity because the BB2001 measurement is blocked on a play the capture
does not contain.

The sprint model is the nicest piece of arithmetic in the tree. `pace.homeToFirst`
measures 4200ms over 60ft, but **a leg time constrains a (top speed, acceleration)
pair, not either one** — v1 resolved that by assuming no acceleration at all and
running every kid flat at 14.29 ft/s. The second constraint comes from published
child peak velocity (~18 ft/s), and the acceleration is then *solved*:
`T = 2·(4.200 − 60/V)` = 1.736s, i.e. 10.37 ft/s². The measured leg comes back out
at 4200ms exactly, which is circular — but the *other* number the solve produces
was free to be absurd and is not, and that is what makes it conformed.

Three things went wrong in ways worth keeping. A glove modelled as a **sphere at
chest height** gives a ball lying on the ground 0.84 ft of horizontal reach, so
every routine grounder became a chase to the wall while the election insisted the
shortstop had cut it off; he had, he just could not bend over. The election
itself **left the reaction time out of the journey**, electing a kid whose 1.42s
cut-off included 0.46s of standing still — invisible in any fielder's position,
findable only by running the election against the pursuit it predicts. And the
throw's arc is closed-form through a half-angle identity so the file needs no
trig, which means an arm has a *range*: centre field to first is 129.7 ft and 27
of 30 kids cannot make it, so **the cutoff relay stops being a mechanic and
becomes what happens when nobody can reach the bag** — where v1 had to invent
`LIVE.RELAY` and gate it on a hand-picked depth, because at its geometry throw
distance could not discriminate at all.

One claim in this work was **wrong and is recorded as wrong**. v1's cut-ahead
gate is a fixed 400ms compared against ball-clock times, and
`defense.chaserElection` says it "cannot be speed-neutral by construction"; the
obvious fix is to express it as a ratio, and the first draft of this PR asserted
that doing so removed the drift. Measured on identical inputs over 215 launches
at three defence speeds: the ratio gate drifts 7.4pp and a fixed 0.40s gate
drifts 7.4pp. They are the same. What moves the override rate is which fielders
can intercept *at all*, which no gate form touches. The ratio stays for a smaller
and honest reason — it is dimensionless, so no future retune can leave a unit
stale — and `sim.chaserElectionGate` records the measurement instead of the hope.

The outcome is the thing the rewrite was for, and nothing was tuned to produce
it: at 31 mph a grounder is an out at every one of fifteen spray angles, at 42
mph it finds the holes, and at 55 mph it gets through. A ball into the true LF–CF
gap is a hit — `defense.fielderSpeed.notSufficient` measured v1's as "out by
897ms" — while a routine grounder to short is still an out by 302ms. Run
`npm run sim:trajectory` to see the table.

**The play reducer, and the answer** (2026-08-01). `src/v2/sim/play.ts` steps a
batted ball, nine kids and up to four runners to an outcome — CPU-driven on both
sides, with human steering, the dive verb, tag-ups and steals deferred to the
game loop that will actually have a player in it. It replaces a test-only
harness that stepped one chaser against one runner and declared its own bias:
*"every one of those omissions makes the DEFENCE look better than it will be, so
a hit here is a lower bound on a hit."*

**A ball into the gap is a double.** `defense.fielderSpeed.notSufficient`
measured six plays in v1 and every one was an out at first — the true LF–CF gap
by 897ms — and concluded the cause was structural. Through the real reducer:
the gap balls are doubles, the slow roller to third is still an out, and a
grounder through the 5–6 hole is a single. And the shape underneath it is the
thing the rewrite was for: a 31 mph grounder is an out at 12 of 15 spray angles,
a 42 mph one at 3, a 55 mph one at 2. **Nothing was tuned to produce that.** It
is not BABIP — grounders only, no strikeouts, uniform sprays — and
`sim.gapBallOutcome` says so at length, because the number is tempting.

The relay stopped being a mechanic. v1 had to *invent* `LIVE.RELAY`, gated on a
hand-picked 1.39 basepath legs, "because throw DISTANCE provably cannot do this
job". Here an arm has a range: centre field to first is 129.7 ft and 27 of 30
kids cannot throw it, so a cutoff man is what happens when nobody can reach the
bag — 16% of plays. v1's **look-back rule**, which concedes a base so the relay
buys anything, was deliberately *not* ported, and the outcome says it was not
needed: that rule is a statement about v1's geometry, not about relays.

Two v1 constants died rather than converting. `RUN2.TAG_RADIUS` is 26px = **8.7
ft** — a tag from nine feet — and there is no tag radius here because a tag is a
glove touching a runner, which is the same `reachFt()` the catch uses.
`RUN2.SAFE_RADIUS` is gone outright: v2's runners are leg-parameterised, so
`isSettled(r)` *is* standing on the bag. v1 needs a radius because it has to ask
geometry a question the state already answers.

**Six bugs, and the useful thing is how each was found.** A ball skipping
through the infield counted as *in the air*, so the election chased individual
hops and the pitcher fielded a grounder forty feet behind the shortstop. The
election charged every fielder a fresh standing-start ramp on each re-read,
saying a running kid was 0.87s slower than he was — so the shortstop *would not
charge*, and settled for meeting the ball fourteen feet deeper; that one was
worth seven of fifteen outs on the soft-grounder sweep by itself. `startLeg` has
no occupancy check and the reducer did not add one, so two runners stacked on
second — which does not look like a baserunning bug, it looks like a runner
**vanishing**, and only the accounting sweep could see it. And the first version
of the "one ball implementation" test compared `stepLooseBall` against
`traceLooseBall`, which is a *loop over* `stepLooseBall`: it asserted a function
equals itself and stayed green when the physics was deliberately broken.

The play clock is the one thing v1 has and v2 makes mean something. v1's
`MAX_PLAY_MS` is "NOT measured — scaled with `RUNNER_SPEED`", and nothing there
asserts a legitimate play stays under it, so the cap quietly became the way some
plays ended. Here the longest of 180 swept plays is 12.38s against a 20s cap and
**zero reach it** — `sim.playClock` exists to keep that true.

**The at-bat and the game loop** (2026-08-01). v2 plays a whole game headless —
`npm run sim:game` prints a line score, a box score and a play-by-play — and the
five shared `systems/` modules finally do the job the purity lint has been
guarding for three PRs. `inning.applyAtBat` owns the count, the walk and the rule
that a foul is a strike but never the third; `gameflow.decideAfterHalf` owns
extras; `stats.foldStats` owns what an at-bat is. None of it is restated in v2.

**The strike zone was the third v1 constant with no units, and the purest of the
three.** `LIVE.CATCH_RADIUS` was 34 pixels, which converts to a wrong number of
feet (11.36). `RUN2.TAG_RADIUS` was 26px, likewise (8.7). But `PLATE_ZONE` is
`{ W: 96, H: 100 }` in "plate coords" — a space mapped to the screen at ~1.8×
and related to the field by *nothing at all*. It is not a wrong size; it has no
size, because v1 never needed the zone to be a place. v2's is the rulebook's:
17in of plate plus a ball each side (19.9in wide), knees to the letters as
fractions of the batter's height (16.3in on a four-foot kid). And the umpire asks
the **trajectory** — a curveball that breaks out of the zone is a ball because it
broke, where v1 sets `inZone` on an aim point before the ball has gone anywhere.

**One judgement error, two behaviours.** v1 gives the CPU batter five constants
describing an outcome distribution — ball chance per band, a chase rate, a swing
band rolled off the stat. A hitter doesn't have five faculties, or two. Give him
*one* misjudgement of where and when the ball will be, sized by his `contact`
stat, and the rest falls out: he swings when he **believes** it is a strike, so
chases and takes are consequences; and the same error in time becomes the timing
error `contact.ts` already grades. A better-contact kid chases less *and* times
better, and there is no chase rate or whiff rate anywhere to tune apart.

**That noise failed silently first, which is the useful part.** `Rng` still has
no `normal()` — every sampler needs `Math.log`, which is banned — so the new
`bell()` is the Irwin–Hall sum of three uniforms: bit-stable, and **bounded at
±3σ**. Bounded support is a feature and a trap. At the first draft's sigma a
swinging strike needed 2.5σ, and the measurement over 4,000 pitches was **zero
swinging strikes at every contact stat** — not rare, none. A game where nobody
can swing through a pitch is a missing mechanic, not a bad tuning, and a bounded
noise turns "unlikely" into "impossible" without saying so. The band is now sized
against the contact window, and a test asserts the *relationship*.

**And `isFair` had no caller.** `field.ts` has exported it since it was written,
and `play.ts` stepped a ball, caromed it, relayed it and settled it without ever
asking which side of the line it came down on. Every batted ball in v2 was fair;
the foul ball — a third of the pitches in a real plate appearance — did not
exist. It does now, at first touchdown and at the fence, so a ball hooked over
the pole is a foul rather than a home run.

**Two performance findings, because PR 8 has to run 50,000 plate appearances.**
The pitch's release solve is a secant over a bisection — **13.6ms**, three
hundred and fifty times the flight it produces, or forty-nine minutes for PR 8's
200,000 pitches. The fix was not a faster solver but a better model: a pitcher
aims at a **spot**, and his execution error lands on his release rather than his
intention, so the solve is a property of (kind, arm, spot) and is memoised. And
the play reducer was **re-tracing** the ball on every re-read, when the ball
obeys the same physics from one tick to the next and the trace is identical —
what changes between reads is where the *fielders* are. Together: 1.7s per game
to 0.14s, and PR 8's 50k plate appearances from unusable to 113 seconds.

The game produces K% 25.6, BB% 10.5 and 6.8 runs a game — all plausible — and
**BABIP .624 against real baseball's ~.300**. Every second ball in play is a hit.
That is the defence, the causes are already on the record (`sim.throwSpeed` still
awaiting measurement, the 3ft reach, and the tag-ups PR 7 deferred), and
`sim.gameShape` is a `note` that reports it rather than a target that meets it.
Nothing was tuned to make the number look better; PR 8 measures it and PR 9 moves
it.

### PR 8 — the statistical conformance harness

50,045 plate appearances across 874 games, 8 seeds, 3 venues and a rotating
roster so all 30 kids bat, in **73.5 seconds**. `sim/harness.ts` is a pure
aggregator fed by an optional observer on `GameSpec`; the CI slice and
`npm run sim:harness` run through the same one, the way the layout audit and the
dev overlay share `layout.browser.js`.

**★ One correction to what this section used to promise.** It said the harness
would assert BABIP, the launch-angle split and exit-velocity shape *"against real
baseball bands"*. **For most of those quantities there is no band.** Published
youth data is thin and starts at 9U; nothing found measures four-to-eight-year-
olds, and `sim.note` says plainly that borrowing MLB's numbers is *the* failure
the `reference` field exists to prevent. So the harness does what this project's
own discipline requires: **measures, pins, and says what would close it**. What
it asserts outright is the part that needs no band — internal consistency,
ordering (a bad-contact lineup must strike out and chase more; a high-power one
must hit it harder and score more), and shape.

**★ And shape is what found the bug.** `resolveSwing` turned the undercut into a
launch angle through `asin(offset / centreSep)` and **clamped** the offset into
that separation first. The comment beside the clamp said *"beyond that separation
the bat misses the ball entirely, which is what the clamp means"* — but a clamp
means the opposite of a miss. `asin(±1)` is exactly ±90°, so every swing that had
actually gone by underneath the ball was recorded as one hit perfectly straight
up or straight down. A kid with contact 1 saturated beyond **0.74σ** of his own
vertical read: 46% of his swings.

Every *total* stayed plausible — 982 tests passed over it, `contact.test.ts`
asserts Nathan's identity symbolically (a claim about exit *speed*, silent about
where the bat was), and the old `sim.gameShape` reported an unremarkable 25.6%
strikeout rate. What it could not survive was a distribution: **22% of fair balls
in one 5° bin** at the top of the launch-angle scale, 8% more at the bottom.

The fix traded a wrong *shape* for a wrong *rate*, deliberately. Strikeouts went
20.6% → **43.0%** and BABIP .624 → **.713**, and the batted-ball split became
baseball-shaped (60/15/15/10 ground/line/fly/pop-up). The old 20.6% was never
right — it was arithmetic over a defect, since 30% of the balls it counted in
play were swings that had missed. A wrong rate is one number a retune moves; a
spike at a boundary is a discontinuity no tuning constant can reach.

**Nothing here was tuned.** The two numbers that are wrong now have names against
them: `ATBAT.UNDERCUT_FROM_JUDGE` turns a vertical *read* error into a bat
*placement* error at nearly half strength against a barrel that forgives 2.70
inches, and the foul-to-fair ratio is **3.4:1** where baseball is nearer 1:1.
Both are PR 9's.

The harness also had to be able to *fail*: a sweep breaks each new gate and
demands the specific rejection, including moving a tuning constant to prove the
pinned rates notice. It found three weaknesses in its own gates — a tautological
cut-boundary test that was true for any cut values, and two `SimEvent` fields
(the count, the hit type) that were emitted and read by nothing.

### PR 9 — the swing had no plane

The retune, and it turned into a missing mechanic. `atbat.ts` derives the
undercut as `(crossing.y − judged.y) × k` where `judged.y` is
`crossing.y + bell() × judgeFt` — so the undercut is `−bell() × judgeFt × k`,
**exactly zero-mean**. `contact.ts` takes `asin` of it, so the launch-angle
distribution was symmetric about zero **by construction**: every kid in the game
swung dead level and the average batted ball left the bat at 0°, a line drive
into the dirt.

No total could see it, and neither could the median. The `ground` class is
everything below 10°, which collects the whole negative half of a symmetric
distribution — so PR 8's 60.2% ground share was **arithmetic, not taste** — and
the launch median read 2.5°, which looks merely low. `harness.ts` now reports a
**mean**, which is the one statistic that reads 0 when there is no swing plane.

`BAT.ATTACK_ANGLE_DEG` is 8° — inside the published adult band (6–10°), at the
bottom of it because a child swinging a bat that is heavy for them holds less
plane. It is **not** the pitch's descent angle, which is the tempting
derivation: our pitches arrive descending 22–40° (mean 28.1) because a 25.6mph
lob over 46ft falls a long way, and a swing matched to that plane would put
everything in the air. Attack angle is a property of the *swing*.

| | before | after |
|---|---|---|
| ground share | 60.2% | **49.8%** |
| launch median / **mean** | 2.5° / **0.0°** | 12.5° / **8.0°** |
| BABIP | .713 | **.678** |
| runs per game | 5.34 | **4.48** |

**★ And the finding that resized the PR.** The four coupled plate constants
*were* swept as planned — 300 combinations through `npm run sim:plate-sweep`,
against targets written into `sim.retuneTargets` **before** the sweep ran. Several
combinations hit all six targets: one gives K% 15.4 and a 1.81 foul ratio. The
same combination takes **runs per game from 4.90 to 15.35**.

The strikeout rate is currently **load-bearing**: 43% strikeouts is hiding a
defence that converts under a third of balls in play, and removing it puts three
times as many balls in front of that defence. So the plate targets alone are
*under-determined* — they admit solutions that wreck the product — and the
strikeout, foul and pitches-per-PA targets moved to PR 10, where they can be
balanced against out conversion. That is the only place the balance can honestly
be struck.

So PR 9 ships the mechanism alone. Every measured axis improved except the
pop-up share (10.0% → 16.0%), which is attributed rather than mysterious:
centring a distribution whose *spread* is still too wide pushes its upper tail
past 50°, and the spread is `ATBAT.UNDERCUT_FROM_JUDGE` — measured, narrowing it
0.45 → 0.22 takes pop-ups 15.9% → 3.7%. PR 10 owns that dial.

### PR 10 — the defence, and the shortstop who watched it go by

The retune's other half, and the biggest defect in the sim so far.

**★ Every infielder was excluded from the election on any grounder headed for
the outfield.** `LEASH_FT` gated candidacy on how close a fielder's *post* is to
where the ball **comes to rest**. A grounder that eventually rolls into the
outfield settles 200ft from home — outside every infielder's leash — so the
shortstop was not in the election at all for a ball passing **9.8ft from his
post at t=1.05s**, comfortably inside his range. He stood and watched it go by;
the left fielder collected it at t=2.90s and needed a relay to reach first.

Measured: **outfielders were elected on 62.3% of all ground balls** and the
pitcher on 0%. After the fix — candidacy is earned by the settle point *or* by
an intercept near your own post, a strictly additional door — infielders take
88%, the pitcher takes 87% of balls hit up the middle (a comebacker *is* his
ball) and the corners take 82% down the lines. Ground-ball hits fell 81.4% →
69.2% and BABIP .678 → .589.

It also explains a change that looked like a failure. The **first step** —
seeding every fielder with a head start, because `sprintAccelFtS2` is derived
from a *batter's* leg out of a batting stance and was being applied to a kid in a
ready crouch — bought almost nothing on grounders on its own (81.4% → 83.5%).
A quicker fielder who is not in the election cannot help. Range and candidacy are
different questions, and only one of them was broken.

Two smaller mechanics landed with it: **`startDive` had no caller** (`isFair` in
PR 7, `BASE_COVER` in PR 6, all over again), and it needed a gate — diving as
soon as the ball entered the diving envelope meant *every routine fly ball was
caught mid-dive*. And `DROP_BASE` finally got a record, which promptly showed it
is **not a lever**: swept over a factor of seven, BABIP moves within noise.

Then the three plate rates PR 9 deferred, swept jointly with the defence:

| | before | after | target |
|---|---|---|---|
| strikeout rate | 42.4% | **17.3%** | 15–20 ✓ |
| walk rate | 11.5% | **10.4%** | 8–14 ✓ |
| foul : fair | 3.32 | **1.18** | 1–2 ✓ |
| pitches per PA | 5.08 | **3.99** | 3.6–4.6 ✓ |
| BABIP | .678 | **.660** | .40–.45 ✗ |
| runs/game | 4.48 | **5.68** | 8–12 ✗ |

**★ And the two it did not reach are reported, not papered over.** All four
approved levers were tried and three are measurably not levers: the drop rate,
positioning (the middle infield gap is 27.3° against 21.0° at the corners, and
narrowing it moves BABIP within noise) and the dive. What is left is a *time
budget* — four infielders cover 119ft of arc with roughly 20–26ft of range each
once the read and the ramp are paid, so about a fifth of the cone cannot be
covered by anybody. The two numbers that would move it, the arm and the reach,
are both `awaiting-measurement` bands this PR ruled out of scope precisely so
they could not be fitted to an outcome.

A game now reads 3–2 over six innings, against #50's 1–0 with fourteen
strikeouts.

### PR 11 — the venue record measured the wrong quantity

`sim.venueRollFeel` had been `known-drift` since PR 3: the blacktop, authored as
*"hot asphalt — the ball SPRINGS"*, comes to rest **shortest** of the three
venues, and the record blamed the bounce — *"the ball spends its energy BOUNCING
rather than rolling."*

**Resting distance is not speed.** At `rollFriction` 0.10 the blacktop's roll is
`v²/(2μg)` ≈ **411ft against its own 188ft fence**, so the ball reaches the wall,
`containRoll` caroms it back, and it stops short. The resting place is set by the
**fence**, not the surface — and `containRoll` is correct, deliberate, and was
itself a bug fix.

Measured over 60 conditions on quantities that actually mean "fast":

| | park | sandlot | **blacktop** |
|---|---|---|---|
| mean resting distance | 176ft | 171ft | **120ft** |
| time to reach 150ft | 2.75s | 2.92s | **2.70s** |
| time the ball stays live | 5.68s | 4.57s | **7.78s** |

The blacktop was already the fast park: quickest out, and the ball stays live
**37% longer than the park and 70% longer than the sandlot**. It rests short
*because* it travelled fast enough to hit the wall.

**No constant changed.** `npm run sim:harness` is byte-identical across the fix —
BABIP .660, 5.68 runs, the same singles/doubles/triples — which is how you know
the diagnosis moved and the physics did not.

Two traps are pinned in `bounce.test.ts`, including the guard that asserts the
blacktop rests **shortest** while being fastest, so anyone who tries to "fix"
that number has to delete the test and read why. The record's own proposed fix
would have made it worse (lowering `bounceMult` takes it 120ft → 76ft), and the
ordering could not have been bought at any price: the blacktop's fence is 188ft
at every angle against the park's 185–212, so it is simply a smaller park.

⚠️ The 411ft roll is now load-bearing and `sim.rollFriction` is still
`awaiting-measurement`. Measuring it would change the venue's whole character,
and the record says so.

### PR 12 — the last three deferrals

`play.ts`'s scope note had said since PR 6 that the dive verb, tag-ups, sac
flies and steals *"every one of them needs a player"*. PR 10 shipped the dive
with a CPU policy; this ships the rest. What they needed was a **decision**, and
v2 writes CPU decisions everywhere else.

**Tag-ups** are `worthTaking` asked from a standing start on a base — the same
function `maybeRoundBag` already used. A runner tags and goes when he beats the
throw, holds when he does not, and is **doubled off** if he was off the bag.

That work exposed a rules bug. `retireBatterOnCatch` identified the batter by
`from === 0`, and a batter-runner who has touched first is at `from === 1` — so
a 50° pop-up caught at t=4.17s, after he reached first at t=4.08, produced **a
caught fly and zero outs**. A caught fly retires the batter however long it hung,
and that cannot be expressed positionally.

**A sac fly is automatic**, and that is the arm band talking: **0 of 30 kids can
throw 180ft home**. Recorded rather than designed around — no mechanic was
invented to make it contested.

**A steal is a race, not a roll.** v1 rolls `p = 0.5 + (speed−5)·0.05 −
(arm−5)·0.05 + 0.12 if slow stuff`; v2 races the runner's leg against pitch
flight + catcher read + release + throw. The lead is what makes it a contest —
from a standing start on the bag it is degenerate — and **v1's +0.12 for slow
stuff falls out for free**: a changeup's 1.33s flight hands the runner exactly
0.31s over a fastball's 1.02s.

| | before | after |
|---|---|---|
| BABIP | .660 | **.624** |
| runs per game | 5.68 | **7.18** |
| extra-base share | 10.8% | 14.9% |

Runs moved toward `sim.retuneTargets`' 8–12 **without a tuning constant being
touched**, which is the only way that record accepts a target being approached.

**★ And one number is reported rather than defended.** "Go when you project to
win" produced **15.4 steal attempts a game at 94% safe**, because only **14 of
30** kids can throw the 90ft to second — against half the roster's catchers the
margin is literally infinite and no confidence threshold can decline it. A
situational decision model (second is scoring position; third adds little while
the out costs the same; two outs ends the inning) cut it to 10.29, which is
still too many. `sim.throwSpeed` is now **one unmeasured number setting four
different rates** — the relay, ground-ball BABIP, the automatic sac fly, and the
free steal. PR 10 ruled it fixed so it could not be fitted to an outcome, and
that decision gets more valuable with each consequence.

### PR 13 — the render membrane: v2 plays baseball

Twelve PRs built a complete headless sim and a render layer with a park,
characters, animation, materials and a camera policy. **They had never met.**
`/v2/?play=1` is the third page, and the first on which v2 plays a game.

Two things this document already described turned out not to be wired:
**`render/bridge.ts` did not exist** — it is called *"the single named coupling
point"* — and **`cameraCues.chooseCamera` was called by nothing**, a complete,
tested two-view policy with a hard cut that no code path reached. Both now
exist and are gated, in the shape `isFair` and `startDive` established.

**One architectural change.** `simulateGame` is four nested synchronous loops,
and rendering means the innermost is driven by the frame loop. Rather than write
a second live driver — which would drift from the 50,000-plate-appearance
harness silently — the flow became a **generator**: `simulateGameLive` yields and
`simulateGame` drains it. Measured before committing to it, a per-tick `yield`
costs **9ns**, ~0.7% of the harness's real work. The gate is **output identity**,
proven byte-for-byte across three venues × three seeds.

**Watching it found three things no test did:** the defence vanished between
pitches (the bridge only drew a live `PlayState`), every character stood in its
**bind pose** (nothing ever started a clip), and the pitch camera sat at a
standing catcher's own height so he filled the frame — a preset that had never
been looked through.

**★ And the v1 bundle invariant expired.** *"A v2 change that alters
`dist/assets/main-*.js` is a bug"* has stood since v2 began. The play view is the
first v2 code to import the sim, which value-imports the pure `systems/inning`,
so both entry points needed the same module, Rollup hoisted it into a shared
chunk, and v1's bundle moved without a line of v1 changing. Three fixes were
measured and none preserves the hash — **building v1 alone gives a different hash
and 18kB more**, which proves the hash was a property of the combined build
rather than a fingerprint of v1's source. The only literal fix is duplicating
those five modules *in source*, which is the drift PR 7 existed to prevent.

So the proxy was retired and the guarantee moved to what already enforced it:
the empty v1 source diff, and the lint asserting v1's module graph **cannot
reach** v2 — automatic, in CI, and always the real guarantee. A bundle-size band
keeps the one thing the hash incidentally caught. `render.v1BundleInvariant`
records all three attempts. **The bundle moving is evidence the sharing is real
rather than decorative.**

### PR 14 — the input membrane: you can field

`PlayInputs` has existed since PR 6 and **`stepPlay` never read it** — the
parameter was literally `_inputs`, defaulted and referenced nowhere in 1,300
lines, while its own header called it *"a typed seam so the signature does not
change when they land"*. This is them landing, and the signature did not change:
the generator's third type parameter carries them in through `.next(inputs)`, so
the headless path is unchanged **by construction** and PR 13's golden
fingerprints prove it.

Three verbs: **steer** the elected chaser with the pointer, **dive**, and
**throw to a bag**. Runner sends stay with the offence half and the plate verbs.

**Two things v1 has that v2 will not.** There is **no throw meter**, because
there is no power — `release` computes flight from the arm, a measured quantity,
where v1 needed a meter because its throws were arbitrary. And there is **no
fielding assist**, because the measurement said not to port one.

**★ The measurement.** `defense.fieldingAssist` records that v1's flat 0.5 magnet
*"was not a mild helper — it was the whole play"*: a deliberate perpendicular
mis-steer still finished 5.3px from the landing spot, inside a 39px reach. v2's
reach is 3ft. Running the same experiment here inverts it:

| aim | caught |
|---|---|
| CPU, no input | 16/27 |
| perfect | **16/27** |
| 3ft off | 5/27 |
| 8ft off | 2/27 |
| perpendicular | **0/27** (median 72.5ft adrift) |

Steering is the whole job, and done well it fields exactly as well as the CPU.
⚠️ What that table flags is the **tolerance**: three feet of aim error is a miss,
because three feet is the reach. For a seven-year-old on a touchscreen that is
plausibly unplayable — and it is the argument for an assist, sized from these
numbers rather than carried over from a game with nearly four times the reach.
`sim.fieldingInput` records it; PR 15 decides.

### PR 15 — the swing: you can bat

★ **A pitch had to be yielded before it resolved.** `pitchAndSwing` did
everything in one call — choose, release, fly, judge, swing — so PR 13's
`playAtBatLive` yielded its `pitch` frame *after* the outcome was already
settled: the view animated a ball whose fate was decided, and no human could bat
at it. It splits at the seam the model already had, `throwPitch` →
`resolvePitch`, with the yield between them.

★ **And the split provably could not move a draw.** `rng.ts`'s substreams derive
from `(root seed, label)` and never from position in the parent stream, so — in
its own words — *"forking in a different order gives the same streams"* and *"a
substream that is never drawn from costs nothing and shifts nothing"*. Two
functions forking the same labels off the same parent are indistinguishable from
one that forked both. PR 13's golden fingerprints and 30-game checksum are what
prove it, and the harness re-ran to the same 861 games / 50,054 plate
appearances / 200,383 pitches.

**A person supplies the model's own two error terms, and nothing new is invented
for him.** The CPU batter has exactly two — `plateJudgementFt` (where he thinks
the ball is) and `swingTimingSigmaFrac` (when he swings). A **tap** gives the
second (`timingErrorSec = tapAt − travelSec`) and the **pointer** gives the first
(`undercutFt = crossingY − aimY`), and from there both go through the same
`offer` path. **There is no human whiff rate and no human contact rate anywhere.**

**★ Two CPU rules deliberately do not apply, and both are statements about an AI
rather than about baseball.** `UNDERCUT_FROM_JUDGE` converts a *read* error into
a *placement* error — it exists because the CPU's aim is a misjudgement it is
unaware of, and a player's pointer **is** the placement. `TWO_STRIKE_PROTECT_FT`
exists so a poor-contact CPU kid is a foul-ball machine rather than a strikeout
machine. `swing.test.ts` asserts both by showing each constant moves the CPU's
outcomes and not the human's — the second half is what stops the first being
vacuous.

**★ Aim is a HEIGHT, not a point, and that is a modelling result.** `resolveSwing`
reads when the bat arrived and how far under the ball's centre it passed; where
the ball goes *laterally* is already decided, because `contact.ts` derives
`sprayDeg` from `timingErrorSec` — pulling it is what being early **means**. A
lateral aim term would be a second, independent source for the same quantity, so
a two-axis cursor would have put a field on the wire that nothing reads — the
defect PR 8 shipped twice. A lint asserts `HumanSwing` carries no lateral field.

**★ The measurement.** Timing is generous and aim is tight, and only one of them
is a choice:

| | value | is it tunable? |
|---|---|---|
| timing window | ±0.22s on a 1.17s flight (**18% of the flight**) | a fraction, by construction |
| aim tolerance | **2.70 in** | no — it is `BALL_RADIUS_FT + BAT.BARREL_RADIUS_FT` |
| crossing-height spread | 1.80 ft (p05–p95) | — |
| never moving the cursor | 30% in play | — |
| tracking the ball | 100% in play | — |

At the pitch rig the zone draws 89px tall, so 2.70in is about **22px** — a real
mouse target, and the skill gradient is real rather than pass/fail. Whether a
*child's* finger lands inside 22px is not known and is not claimed;
`sim.humanSwing` says so, and the assist stays unbuilt rather than guessed — the
same call `sim.fieldingInput` made for steering.

**★ A tail, because otherwise you could only ever be early.** The view advanced
the instant the ball reached the plate, so the latest expressible swing was
exactly on time and the whole late half of the window was unreachable *by
construction*. `SWING_TAIL_SEC` (0.35s) holds the frame past the crossing. The
timing test sweeps **both** signs for that reason — a one-sided sweep passes for
the broken build.

**★ And the camera could not see the plate at all.** Measured by raycasting
seven points across the strike zone against the live scene: from the centred
`RIGS.PITCH` the catcher is hit first at **all seven**. He posts 5ft behind home
and draws 6.43ft tall, so height cannot fix it — an eye at 16.5ft is still
blocked, and clearing him over the top needs a 53° bird's-eye view of a
*vertical* zone. 7.5ft of lateral offset is the smallest that clears all seven;
7.0 still loses the low inside corner. ⚠️ The zone is now visible and **the
framing is not good** — the shot reads from the first-base side and the catcher
crowds the zone's right edge. That is recorded as a `known-drift` in
`render.pitchFraming`, to be resolved in a camera pass rather than by quietly
retuning the eye until a screenshot looks better: the binding constraint is
occlusion, and only a raycast can see it. A projection test never could —
a point behind a catcher projects to exactly the same pixel as one in front.

### PR 16 — the mound and the baselines: the last two verbs

**★ Two more fields declared and read by nothing.** `sendRunner` and
`holdRunner` have been on `PlayInputs` since PR 6 — sixth and seventh instance of
the pattern, after `isFair`, `startDive`, `bridge.ts`, `PlayInputs` itself and
`swing`. A mechanism can be authored, typed and documented while no code path
reaches it, which is why every one of these ships with a lint.

**Pitching is choosing, exactly as fielding is.** A human replaces `choosePitch`
— a **kind** and a **spot** — and nothing else. The execution error stays
downstream and is scaled by the pitcher's `pitching` stat, so a player cannot
out-throw his own kid's arm. **There is no meter**, for the reason `play.ts`
already gives about throws: how hard the ball leaves the hand is
`throwSpeedFts`, a *measured* quantity, so a meter would be a second source for
something the roster already decides.

| arm | miss from the spot | strikes |
|---|---|---|
| 1 | 0.754 ft | 64.3% |
| 5 | 0.566 ft | 83.3% |
| 10 | 0.222 ft | 100% |

The gradient is monotone over the **same plan and the same seeds**, which is also
what proves the plan is not being ignored — a wired-but-inert plan shows every
arm missing identically. **★ And a person who grooves it throws far more strikes
than the CPU** (83.3% against 44.5% at the same arm), because `choosePitch`
deliberately aims *off* the edge when ahead to tempt a chase. That gap is the
size of the decision the verb hands over, not a defect in either.
`sim.humanPitch`.

**★ A pitch has to be decided before it is thrown**, so `LiveFrame` gains a
`windup` phase. Without it the only yield preceding a throw is the *previous*
pitch's, and a player would be choosing pitch N during pitch N−1's flight. It
cannot hang: v1's pitch-clock rule applies — dither and the ball is thrown for
you.

**Sends override judgement, never traffic.** A send skips `worthTaking` — the CPU
declines races it projects to lose and a person is allowed to gamble — but
`send` keeps `baseIsOpen`, because that guard is about traffic. A **forced**
runner cannot be held: the batter is coming and the bag is not his to keep.

**★ And the verb only has teeth on a ball still in the air**, which took a sweep
to find. On anything on the ground the CPU already sends every runner from every
base at every speed, so a human send is a no-op there — the first version of the
gate asserted `3 > 3` and passed for the wrong reason. On a catchable fly the CPU
correctly makes him tag, and a send is a real gamble: from second on a popup it
gets him thrown out. `sim.runnerSends`.

**★ The human needs a SIDE, or the two tap verbs collide** — the same tap on a
base means *throw there* when fielding and *send him there* when batting. v1
answers this with seats; v2's sim has no seat concept yet, so the spike bats in
the top half and pitches in the bottom, and both verbs stay reachable in one
game.

### PR 17 — the crouch that levitated, and the camera record it was being paid for

**★ Nothing had ever asked whether a clip touches the ground.** `skeleton.ts`'s
tests assert the BIND pose stands on the floor, and say why it matters — "a rig
whose toes float or sink is a rig every foot-plant in the library is authored
wrong on". Nobody then asked it of the library. Thirty-five clips are written as
joint angles, and bending a knee without also dropping the hips does not lower a
kid: **it lifts his feet.**

So the whole fielding family levitated. On the 4.0ft reference rig, `field_ready`
held both toes **0.451ft** off the grass — 11% of a body height — and every pose
derived from it (`field_scoop`, `catch_low`, `catch_chest`, `catch_jump`,
`throw_quick`) inherited the float. `bat_stance` and its three swings hovered
0.081ft. The hand-authored `hips` drops had the opposite sign problem: `slide`
buried a toe **1.141ft under the field**, `getup` 0.888, the dives 0.792.

**★ And it was already being paid for under someone else's name.**
`render.pitchFraming` recorded the PITCH camera as unable to see its own strike
zone and blamed a catcher who is "close and TALL" at 6.43 drawn feet. That is his
*standing* height. `bridge.ts` had been playing him `field_ready` since PR 13 —
the line's own comment says "he simply does what a catcher does" — and he had
been standing at full height with his feet in the air the whole time. A camera
record was describing an animation bug, which is what an unmeasured quantity
does: it turns up as somebody else's number.

The correction is **one rigid Y translation per clip, solved rather than picked**
— find the lowest bone over the whole clip and subtract it. Rigid is what makes
it safe: the vertical motion the author wrote is preserved exactly, so a run
keeps its 0.25ft flight phase and `catch_jump` its 1.75ft apex. Planting per
*key* would have glued the lower foot down and deleted both. And because the
offset is constant within a clip it contributes no velocity, so the peak-hand-
speed marker derivations were untouched — all 1204 existing tests passed
unchanged.

Two traps worth keeping. The first solve moved **nothing** while reporting
success, because `Root` sits at the origin by definition and pinned every clip's
minimum to zero. And the catcher's bounding box still read 6.43ft afterwards:
on a `SkinnedMesh`, `geometry.attributes.position` holds BIND-pose vertices and
the CPU never sees the skinned result, so a `Box3` reads a crouching kid at his
standing height. `Raycaster` applies the bone transform; that is why the ray
answers moved and the box did not.

The catcher now draws **5.33ft posed, 82.9% of standing**, and the re-measured
sweep finds **52** occlusion-free eyes where it had found essentially one. The
framing record stays `known-drift` and the eye deliberately stays put: where the
camera *should* go is a composition judgement that deserves its own change. The
pass now inherits two measured constraints rather than rediscovering them — the
offset may come down to 7.25 and either sign works, and **pulling back with a
longer lens is a dead end**, because occlusion is angular and the offset needed
scales as ~0.4×distance.

Also: **the batter had never taken a stance.** `bat_stance` is in the clip
contract and every swing names it as its `returnsTo`, and nothing had ever played
it — so the one kid the camera is pointed at waited for the pitch in `idle` and
settled out of a swing into a pose he had never been in. Same class as the
defence standing in bind pose before PR 13 drew it.

### PR 18 — a scoreboard instead of a debug string, and the gate the CSS claimed

v2 had been printing its whole game state into one pill:
`▲1 ROCKETS 0 – 0 COMETS 0-0 ●○○ ◇◇◇ 🏏 YOU BAT`. Honest about being a debug
readout, and not something you hand a six-year-old — the count is two digits that
mean nothing before you can read, the bases are three identical glyphs in a row,
and nothing about it changes *visibly* when a pitch changes it. It is now a
bottom strip: both teams with a ▶ on whoever bats, the inning, who is up, B/S/OUT
as coloured pips that pop when one lights, and a real base diamond. The pitch
picker moved out of the same string onto the right rail, and appears only on the
windup, which is the only beat the choice is collectable.

**★ The pip capacities are measured, and the obvious guess is wrong.** A pip row's
length is a claim about the rules, and a wrong one does not crash — it silently
clamps, so the count stops moving on the pitch that walked you, with nothing in
the console. Swept over five full games: balls stop at **3** and strikes at
**2**, because the fourth and the third end the plate appearance. **Outs are not
symmetric with that** — three really does occur, on the `between` frame that
reports the side retired. Writing `MAX_OUTS = 2` by analogy would have dropped a
pip on every half-inning.

**★ And the sweep that measured them read zeros, which found a real trap:
`simulateGameLive` yields the SAME object every tick, mutated in place.** Collect
frames in an array and you hold N references to one object carrying the last
tick's state — no error, no red test, every field a plausible value. The reuse is
deliberate and stays (it yields once per sim tick through a 50,000-plate-appearance
harness), but it was documented in exactly one place: `runPlayLive` said "the
`frame` object is REUSED across ticks — see `LiveFrame`", and `LiveFrame`, the
thing it pointed at, did not say so. The pointer is now real, and a test pins the
contract so a change to fresh-per-yield is a reviewed act.

**★ `tokens.css` had been claiming a gate that did not exist.** Its header read
"its overlap PREDICATES still gate CI — see scripts/v2/ui-audit.mjs", and that
file had never been written, so nothing checked v2's HUD for overlap while the
comment told every reader it did. Same class as `isFair` having no caller and
`bridge.ts` being documented before it existed — but worse, because a claim about
a *gate* is what stops the next person looking. It also explains why the root
brief lists `ui/layoutMath.ts`'s overlap predicates as "shared, never copied":
they were shared with nobody. `npm run audit:v2-layout` now imports the real ones,
so v1's chrome and v2's HUD are judged by the same arithmetic.

Its matrix is **viewports, not content**, because v2's layout strategy inverts
v1's: one `clamp()` drives every size in `rem`, which deletes `solveRow`/
`solveColumn` but moves the failure rather than removing it — a rem-scaled strip
collides at the ends of that clamp, on a short landscape phone and on a large
display, never at the size it was authored at.

Writing it was worth it three times over. It caught a name collision introduced
in the same change (a `scoreboard` field shadowing PlayView's `scoreboard()`
method) **on its first run**. Then it caught its own version of the defect it
exists to find: the "picker open" state pumped to `phase === 'windup'` and
stopped — which is the *top* of the first, where the human bats, so the picker
stayed hidden and the audit measured the scoreboard three times under a row
labelled "picker open". Sabotaging the CSS to drop the picker straight onto the
scoreboard produced a clean run. A state now names a selector it must be able to
see, and fails rather than passing quietly. And once it could see the picker,
**a CSS transition never advanced**: the class was applied, `visibility` computed
`visible`, the box had real width and height, and `opacity` sat at 0 forever,
because a transition runs on animation frames and a headless page composites on
its own schedule. That is v1's clock split — "timers follow the loop clock while
tweens follow wall-clock `Date.now()`" — with CSS as the second clock. The audit
disables transitions, which is right rather than a workaround: it measures
layout, and a transition is not layout.

### PR 19 — the camera pass: the target was the problem, not the eye

`render.pitchFraming` had asked for this explicitly, and warned against doing it
by nudging the eye until a screenshot improved. Done as a solve instead, and it
turned out to be two things, neither of which was the offset everyone was looking
at.

**★ The TARGET was pushing the zone off-centre.** The rig looked six feet *in
front of* the plate, so with the eye offset +7.5 the zone landed at x +0.13 of
frame — shoved toward the batter and the catcher, which is most of why the shot
read as crowded. Looking *at* the plate centres it at +0.03 and costs nothing at
all. Nobody had swept the target because it had never been treated as a free
parameter.

**★ And the zone was too small to judge.** 8.3% of frame height, for the one
rectangle a six-year-old has to read. Coming in to 16ft on a 34° lens instead of
18ft on 42° puts it at **12.2%, up 48%**, and the catcher grows only 23% → 25% of
frame width.

**★ Closer is not better, and the sweep had to be run to learn it.** The obvious
move is to get near the plate so the zone is big. It makes the *catcher* the
subject: at an 11ft eye he spans **52%** of frame width, and every close candidate
was worse-composed than the thing it replaced while scoring better on zone size.
Depth is what keeps him a foreground element, so the zone is bought with FOV
rather than with distance. Method worth keeping: occlusion depends only on the
eye, so 490 eyes were raycast first (233 clear) and the 1,343 surviving
eye × fov × target combinations were scored on pure projection — 270× cheaper
than sweeping all four together, which simply timed out.

The record stays `known-drift`, honestly: the shot still reads from the first-base
side, because the eye must stay offset and a centred one is 5/7 blocked. Both ways
out are bigger than a camera change — moving the catcher's post is a sim change
(it sets the steal race), and composing him as a deliberate foreground crop is art
direction rather than arithmetic.

**And the new framing immediately exposed something else: the player's barrel was
unclamped.** The plate plane a pointer is cast against is infinite, so a pointer
out at the fence set the barrel **5.97ft** up — above the batter's own head —
drawing the aim bar floating in the sky while every swing missed for a reason
nothing on screen explained. It clamps to the kid's own height now, in the *view*,
because `sim.humanSwing`'s rule is that a human's pointer IS the placement and the
model must not reinterpret it. Deliberately not narrowed toward the zone: that
would be a batting assist, and there is none.

### PR 20 — v2 becomes an app: a title, a result, and a game you can finish

v2 could play a whole game and had no way to **start** one and no way to
**finish** one. `/v2/` put you in a spike; `/v2/?play=1` dropped you mid-pitch
into a game already in progress; and when it ended the page simply stopped
moving. Every verb worked and there was no product around them.

**★ The result was being thrown away.** `simulateGameLive` *returns* a
`GameResult` — the line score, every kid's line, the tally — and the view read
`r.done` to decide whether to keep the frame and dropped `r.value` on the floor.
What looked like a hang was a completed game with nobody listening.

There is a title, a result screen and a router now, and the file that plays
baseball moved out of `spike/` to `game/GameView.ts` — it is what the product
runs on, and it should not be filed under a word that says otherwise. The two
review spikes stay where they are, because they really are spikes.

**★ The world is never torn down to show a screen.** v1 is five Phaser scenes and
a transition is a scene swap. Here the canvas is *always* the game and a screen
is DOM over it, so the title shows the real park with a game playing behind it,
PLAY AGAIN costs one generator instead of a model reload, and there is no Boot
screen because there is nothing to boot between screens. That has a consequence
worth stating: **the attract game can finish while the title is up**, which would
put a Result screen for a game nobody played over the PLAY button. Anything
reacting to the sim asks whether a screen is showing first.

`#hud` and `#screens` carry deliberately **opposite** pointer rules — the HUD is
`pointer-events: none` so taps reach the field, a screen is modal and takes every
tap — as two elements rather than one with a mode flag, so neither can be left in
the wrong state. The HUD hides behind a screen off a single `body.screen-open`
class, because a scoreboard reporting `▲1 · YOU BAT` under the wordmark is a lie
about a game that has not started.

The Result screen says **"GOOD GAME!"** and never "you lose". v1's online mode
already made that call for a disconnect and it is the right one for a losing
scoreline: the score is right there and says who won, and the next decision a
six-year-old makes is whether to press PLAY AGAIN. Its MVP comes from v1's own
`computeAwards`, imported rather than reimplemented, so a kid who is MVP here is
MVP by the same arithmetic as in the sticker album.

**★ And the layout gate PR 18 built found a bug in itself.** Extended to the two
new screens, it reported four elements off-frame that were plainly inside it.
`layoutMath`'s `Box` documents its x,y as *the centre* (matching Phaser's
`setOrigin(0.5)`); `getBoundingClientRect` returns the *top-left*. The audit had
been handing one to the other since the day it was written — shifting every box
by half its own size — and passed anyway, because the HUD is a centred strip
whose displacement happened not to push anything over an edge. A wrong rule
agreed with a right one until new content arrived. **Shared predicates are only
shared if the units are too.**

With the units fixed it found a genuine one: on a 740×320 phone held sideways the
result card is taller than the viewport — the verdict ran off the top at y −3 and
PLAY AGAIN off the bottom — and at that height `tokens.css`'s clamp is already
pinned to its 14px floor, so the scalar cannot rescue it. Compressed rather than
scrolled: a six-year-old should not have to discover that the button they need is
below the fold.

### PR 21 — the draft: v2 can finally cast a vote

The root brief's first paragraph says the game is a **voting machine** — every
draft pick is tallied, and pick rates reveal which kids become toys and shows.
v2 played beautifully and had shipped the demo without the product: there was no
way to pick a team, so there was no way to cast a vote.

Thirty kids on a board, you take nine, the CPU alternates, and **every human tap
is a vote**. The tally goes through v1's own `systems/picklog.ts` — the storage
keys are shared on purpose, so a kid who switches between `/` and `/v2/` in the
same browser keeps one continuous ledger. The draft state and the CPU's greedy
value are v1's `systems/draft.ts`, imported rather than reimplemented, so leaving
a stud on the board costs exactly what it costs in v1.

**★ The one invariant is which picks count**, and `picklog` states it: *"AI picks
are intentionally NOT counted — we only want human preference."* A CPU pick that
got tallied does not look like anything — no crash, no wrong number, no red test
— it just quietly poisons the one dataset the project exists to gather, and
nobody finds out until someone asks which characters to make toys of. So the
recorder is **injected**, which is what lets a test assert the exact set of ids
counted instead of trusting that the right branch called the right function.
Verified in the running UI too: nine picks, nine votes, none of the CPU's.

**★ And thirty kids came up in identical green.** The portraits are v1's own
`art/CharacterArt.ts` — the same thirty faces, imported, not a second set
commissioned — and the first board drew each one as inline SVG. `CharacterArt`
refers to its gradients by **id** (`url(#jerseyG)`, `url(#skinG)`), which is
correct and unremarkable while each drawing is its own document; v1 never sees it
because every kid becomes a separate Phaser texture. Inline thirty into one page
and the document holds thirty elements called `jerseyG`, every reference resolves
to the **first**, and all thirty kids wear the first kid's shirt, skin and hair.
Nothing errors. It reads as a palette bug in the art, and the art is fine.

Fixed structurally rather than by discipline: a portrait is an `<img>` with a
data URI, so each drawing is its own document and the collision is not avoided —
it is unrepresentable.

**The bundle gate fired, and was measuring the wrong thing.** Pulling in
`CharacterArt` made Rollup hoist 62kB *out* of v1's entry into the shared chunk,
so `main-*.js` "shrank" 1887 → 1824 and the gate reported a 3.3% drift on a build
where **v1's real payload moved by 0.3kB** (1908.4 → 1908.7). Measuring one file
is the retired bundle-hash's mistake in another form: chunk *boundaries* are a
property of the combined build, and only the total an entry pulls down is a
property of the entry. It reads the built HTML now and sums what each entry
actually loads.

The layout audit covers the draft too, which needed one honest change: it is the
first screen that **scrolls**, and below the fold is reachable where off the side
is not. Horizontal containment is asserted always, vertical only for screens that
do not scroll.

### PR 22 — v2 makes a noise

v2 was **completely silent**. v1 synthesizes every sound in code — Web Audio SFX,
browser speech, a stable derived voice per character, no files and no cost — and
none of it had ever been pointed at v2. It is `systems/audio.ts` and
`systems/voices.ts`, Phaser-free and importable, so the fix is wiring rather than
writing: a second bat crack would be a second sound for the same event that
drifts from the one v1 ships.

Bat crack, whiff, glove pop, the pitch leaving the hand, a cheer on a run, and
**every kid says their own name in their own voice when you draft them** — which
is the most characterful thing v1 does and costs one call. The mute is v1's mute,
persisted to the same key, so a parent who silenced the game at `/` does not have
to find the button again at `/v2/`.

**★ The decision is pure, because silence is what a broken cue table and a
working mute both sound like.** Every other view layer can be checked by looking
at it; this one cannot. A cue that never fires produces exactly nothing — which
is also the correct output when muted, when the tab has not been clicked, and
when there is no audio device. That is three ways to convince yourself it works
while it does not, so `soundCues.ts` is a function and the test drives it with
real games.

It caught its own first draft. The table keyed a whiff on `hit === 'miss'`, and
there is no such `HitType`: **a swing and a miss emits no `contact` event at
all**, it is a `pitch` with `kind: 'swingingStrike'`. The table was silent on
every whiff in the game and nothing but a sweep of the sim's actual output was
going to say so.

Two seams that already existed got their second consumer. `GameSpec.onEvent` has
carried the sim's own event stream since PR 8 with a comment reading
"`harness.ts` is its only consumer" — sound wants exactly what the harness wants,
*what happened*, synchronously, because by the time a frame is yielded a swing
and a take are indistinguishable. And runs and outs are **state**, so they come
from comparing snapshots — copied scalars, never the reused frame, or every
comparison is a thing against itself.

**★ And the layout audit caught a bug in this change, immediately.** The mute
lives in `#hud` so it survives every screen — but `body.screen-open #hud
{ visibility: hidden }` hides children too, so the one control that has to work
on the title, the draft and the result was invisible on all three, while its own
header claimed the opposite. Pointing the audit at the HUD on the app route
found it on the first run. The rule is stated as "everything except the mute"
rather than as a list of things to hide, so new game chrome is hidden by default
and a new persistent control is a deliberate exemption.

That also made the audit's tap-target rule stop being vacuous: the mute is the
first `.interactive` element the HUD has ever had, and until now nothing measured
the only persistent button in the game.

### PR 23 — the booth, and a rarity that is not a bug

v1 has two kid commentators — Pip, hyped, and Rocco, deadpan — with line pools per
moment, a no-repeat rule, a rate limiter, strict speaker alternation and an
occasional two-line exchange on the big calls. `systems/announcer.ts` is pure-ish
and Phaser-free, so v2 gets the booth by wiring rather than writing.

**★ The sim needed no change to be commentated; it was already saying enough.**
`SimEvent.pitch` carries `balls` and `strikes` *as they were before the pitch* —
fields the harness added because "a field nobody reads is a field nobody can
trust" — so a strikeout is a strike thrown at `strikes === 2` and a walk is ball
four at `balls === 3`. Seven of the booth's eighteen moments fall straight out of
events that already existed.

Homers and strikeouts are **priority 2**, which is the booth's "always speak"
lane: those are the calls a kid is waiting for, so they jump the rate limiter and
can come back as an exchange. Fouls are deliberately *not* a moment — a booth that
calls the most common contact event there is says nothing else all game.

**★ And a sweep of three whole games found no home run, which is not a bug.**
It is one in thirty at the park, and that is *measured and deliberate*:
`sim.carryVsFence` sets the fences so a power-10 kid clears the 185ft line and
**nobody** clears the 212ft centre, and `sim.gameShape` counted 155 across 861
games — a record whose own header says it "exists to be READ, not to be met",
because conforming a four-to-eight-year-olds' game to MLB's rates is precisely
the mistake the `reference` field exists to prevent.

So the test was wrong, not the sim. The rarest moment in the game is proven on a
constructed event, with the reason written next to it so the next person does not
"fix" the fences to make a test pass. A sweep is the right tool for *does the sim
emit this*; it is the wrong tool for *is the rarest moment wired up*.

One measurement trap worth keeping: driving the game by hand freezes the **wall**
clock, and the booth's rate limiter reads wall time. Hand-pumped, every
priority-1 line after the first is dropped and the booth looks broken. It is v1's
"timers follow the loop clock, tweens follow `Date.now()`" trap for the third
time in this arc, now wearing a rate limiter.

### PR 24 — the players you could not see

The draft shipped a bug one PR earlier and nothing caught it. `GameView.start()`
built `ROSTER.slice(0, 18)`, which was the **entire cast** for as long as the two
teams *were* the first eighteen in roster order. The moment a player picks their
own nine, the teams scatter across all thirty — and a kid the scene never built
has no body.

**★ And nothing says so.** `showOnly` and `applyIdleDefence` both do
`refs.kids.get(id)` and skip a miss, so he bats, he fields, he is announced by
the booth, and there is nobody standing there. No error, no warning, no red test.
Drafting from the **back** of the board put two invisible players on the field —
Peaches and Flash Gordon Jr. — which is exactly the shape of test a "tap the
first available kid" sweep never produces.

The scene builds every kid on the roster now. It costs build time and memory and
**not draw calls**: they are hidden until a frame names them, and a hidden object
draws nothing, so `render.characterDrawCost`'s budget — which is about what is
*visible* — is untouched at ten on the field.

The rule is a throw rather than a comment, because the failure mode is silence:
any roster naming a kid the scene lacks stops the game with his name in the
message. `missingFromScene` is static and pure so a test can drive it without a
GPU, and the test pins **both halves** — that the old eighteen-kid scene fails a
real back-of-the-board draft, and that the whole roster passes it — so the fix
cannot be undone quietly.

### PR 25 — a colour, a logo, and the name that falls out of them

**★ Naming with no reading and no typing.** `systems/team.ts` already had the
idea and v2 gets it whole: a team's *name* is the spoken colour plus the spoken
logo — **"THE PURPLE TIGERS"** — so a four-year-old names their team by pointing
at a colour they like and an animal they like. There is no text field anywhere in
this game and there should not be. It persists to `recess_team`, the same key v1
writes, so a kid who named their team at `/` finds it already named at `/v2/`.

**And the colour is not decoration — it fixes something the draft broke.** Before
there was a draft, the two sides *were* roster halves, so a uniform keyed on
roster index happened to match the team. Once a player picks their own nine that
coincidence is gone and each side wears a mixture of both colours: you cannot
tell the teams apart. Now your nine wear your colour and `pickRival` puts the CPU
in something that does not clash.

The uniforms are **rebuilt, not recoloured**. `ProxyCharacter` bakes its palette
into geometry at construction, so a colour change means re-running the builder —
measured at **2.2 ms a kid, 39 ms for a whole game's eighteen**, which is
imperceptible behind the button that starts the game. A `setUniform` that rewrote
vertex colours would be more code for a saving nobody can perceive. The picker
previews on the **real characters** standing behind it, so there is no mock-up
that can drift from the game.

**★ And the layout audit caught a bug the design tokens had already warned
about.** Unpicked options sat back via `transform: scale()` on the button — and a
transform scales the **hit box** with it, so a 77 px target rendered and measured
66. `tokens.css` says, in a comment written for v1: *"chips render at scale(0.86)
when unselected, so the floor must clear 44px even shrunk."* I reintroduced the
exact bug the note exists to prevent, and the gate failed **78 tap targets** on
the first run of the new screen. The scale moved to `::before`, which is paint
rather than geometry, so the target is the same size whichever option is picked —
the only behaviour a kid can predict.

The audit also needed each screen's `reach` rewritten as *"get to my screen from
any screen"* rather than *"from the front door"*: the screen states run in
sequence on one page, so by the time the team picker runs, the draft has already
left the title behind.

### PR 26 — a seventeen-minute game for a six-year-old

The root brief lists three design pillars, and one of them is **short games**.
v1 ships `INNINGS = 2`. v2 had been defaulting to the *sim's*
`GAME.REGULATION_INNINGS` of **6** — a constant chosen for the harness, not for a
player — and nobody had ever measured what that costs in minutes.

| innings | pitches | minutes |
|---|---|---|
| 2 (v1's shipped default) | 60 | **~5** |
| 3 | 111 | ~9 |
| 6 (v2's default) | 217 | **~17** |

Three and a half times the sitting, for an audience that is four to eight, from a
number nobody chose.

**★ The two defaults stay different on purpose.** Every harness record —
`sim.gameShape`'s 861 games, the 50,000-plate-appearance sweep — was measured at
six innings, and moving the sim's default would silently restate all of them
without re-running anything. So the sim keeps its measurement default and the
*product* passes its own through `GameSpec.regulationInnings`, which is exactly
what that field is for. A test pins both, so neither can drift into the other.

The choice is offered **in minutes rather than innings**: "three innings" means
nothing to a six-year-old or to the adult deciding whether there is time before
dinner, and "9 min" means something to both. The numbers on the buttons are the
measured ones, and a test asserts the lengths really are ordered and separated —
a button labelled "5 min" that plays for seventeen is worse than no button.

And the layout audit caught the new row overflowing a 740×320 phone at the *top*,
where a scroll cannot reach. `place-content: center` clips a screen that outgrows
its viewport at **both** ends; the picker is start-aligned and scrollable now, so
growth goes downward. Third time in this arc that rule has bitten, and the first
time it was already written down.

### PR 27 — the cutover

`/` is v2. `/classic/` is v1. Each links to the other.

**★ v1 was moved, not retired**, and that is the whole shape of this change. It
still builds, still ships, and still holds Recess Week, the sticker album,
pass-and-play and the WebRTC online mode — none of which v2 has yet. Its source
is untouched: the back-link on the classic page lives in `classic/index.html`,
the SHELL, so `git diff main -- src ':!src/v2'` stays empty exactly as it has for
every PR of this rebuild.

**`/v2/` stays as a permanent alias.** Every measurement script,
`npm run audit:v2-layout` and `.claude/skills/verify` drive that URL, and an
alias costs one HTML file against breaking all of them.

Two gates had to follow the move, and both would have gone green while measuring
the wrong game:

- **`npm run audit:layout`** boots v1's menu screens and pointed at `/`. After
  the cutover that is v2's DOM, which has no Phaser display list at all — it
  would have found nothing and said so cheerfully. It points at `/classic/`.
- **`scripts/v2/bundle.lint.test.js`** read `dist/index.html` for v1's payload.
  That file is v2 now, so v1's budget would have been pinned against v2's
  bundle. It reads `dist/classic/index.html`. This is the second time that gate
  has been saved by measuring what an ENTRY loads rather than a file by name:
  the chunk called `main-*.js` is v2's now, and v1's is `classic-*.js`, and the
  gate did not notice because it never asked for either by name.

Verified after the move: `/` and `/v2/` both serve `src/v2/main.ts`, `/classic/`
serves `src/main.ts`, v1 boots its schoolyard at 960×640 with the font resolved,
and both layout audits are green.

**Where this leaves the rebuild.** v2 is the front door with the whole product
loop — title, draft with the voting machine, team naming, a 3D game with sound
and commentary, and a result. What v1 still has and v2 does not: Recess Week and
the sticker album, Practice and Watch, pass-and-play and online play, the juice
meter and its specials, the batting cursor and pitch aiming, instant replay, the
pause menu, the lineup screen, and the venue picker. Those are the next arc, and
`/classic/` is why none of them had to block the cutover.

---

### PR 28 — the neighborhood: a world behind the fence

The first pass of the "on par with Backyard Baseball (2026)" push. Side-by-side
frames (reference notes in `docs/research/backyard-2026-reference.md`) made the
gap concrete: our camera, zone, scoreboard and play all had counterparts in the
BB2026 pitching view, but their park is a PLACE — houses, trees, a privacy
fence, telephone wires, background clutter — and ours was a green screen: turf,
wall, sky, nothing. Every establishing shot and every behind-plate frame showed
it.

`render/Scenery.ts` is that world. Pure set dressing outside the fence — a
plank-by-plank privacy fence ring, gabled houses with doors and windows,
tree clusters, bushes in the fence gap, telephone poles with sagging catenary
wires, one shed, puffy clouds — keyed per venue (`park` suburban, `sandlot`
warmer and treed, `blacktop` flat-roofed city blocks).

Two decisions carry the cost model. Everything bakes its transform and colour
into shared vertex-coloured BufferGeometries and merges into ONE mesh (plus one
for clouds): the whole neighborhood is 2 draw calls and ~10k triangles, spike-
measured at 46 draws / 94.9k tris against the 90/180k budget. And placement is
`sceneryPlan`, a pure function jittered by the shared `hash01` — deterministic,
Node-testable, no `Math.random`. `Scenery.test.ts` pins the three ways a prop
stops being scenery: a footprint inside the fence clearance (the sim cannot see
a house, so a fielder would run through the porch), a prop off the finite turf
plane (a floating box in the flyover), and an unmerged part spending its own
draw call.

One palette lesson worth keeping: the toon ramp's shadow step eats ~40%, so a
"slate" roof authored at its real-world value reads as BLACK from the plate.
Scenery colours are authored bright on purpose.

### PR 30 — the hand-limed foul line

Item 3 of the BB2026 gap list, scoped to its worst offender. The overlay's
every chalk mark already goes through the kit's worn `chalkLine`, but the foul
line beyond 100ft was one solid `BoxGeometry` stripe — the most synthetic
object on the field, touching the most hand-crafted one. It is now a ribbon
with the kit's own character: per-dash width and wear (hash-varied, no
`Math.random`), a slow two-sine lateral drift like a pushed chalker — the line
itself stays straight, and `sim/field.ts`'s rule line is untouched — and wear
as a TINT toward the venue's grass rather than alpha, because "chalk thinning
out" and "grass showing through" are the same pixel and a transparent ribbon
would need alpha sorting against the overlay below it.

## The 30 characters

Defined in `src/data/characters.ts` (pure content — edit freely). Each has stats (contact/power/speed/pitching, 1–10), a look (`VisualParams`), and an optional `ability`. Three signature kids are implemented via **ability hooks** so they're data-driven, not special-cased in scene code:

- **Junebug** — `never_strikes_out`: a miss becomes weak contact; she literally never whiffs.
- **Big Talk Theo** — `calls_shot`: a confident "HOME RUN, CALLED IT!" bubble every at-bat (always wrong; pure flavor, no mechanical effect).
- **Zoom Ramirez** — `unhittable_pitch`: as a pitcher, drags the batter's timing band down a notch; nearly unhittable (in a wheelchair, drawn as a special-case in the art).

The other 27 span archetypes (sluggers, speedsters, all-rounders, pitchers, weak-but-cute) so the draft has real trade-offs — passing on a stud lets the AI grab it.

---

## Architecture

### Scene flow

`Boot → Schoolyard → (CLASSIC) Lineup → Game → Result → (replay) Schoolyard`. The **Lineup screen** (`LineupScene`, CLASSIC only) sits between the draft and the game: tap-tap swaps set your batting order on a 1-9 portrait column and your positions on a chalk mini-diamond (whoever holds the mound pad starts at pitcher), with big AUTO and PLAY BALL buttons; the pure planning logic (`systems/lineup.ts` — best-arm-pitches, up-the-middle defense priority, classic batting-order heuristic) is shared with the CPU, so both teams field real lineups. In-game, **pitchers tire** (`systems/fatigue.ts`): every pitch drains stamina, a gassed arm sweats on the wind-up and scatters its pitches, and the 🥵 chip opens a bullpen picker (the CPU manages its own). The juice meter also stocks three new spends — 💨 turbo legs, 🧤 golden glove, 🧢 rally cap — and a capped **difficulty ramp** (`systems/difficulty.ts`) sharpens the CPU a notch per game played. Phaser scenes are like pages; state is handed forward as plain objects (`{playerTeam, aiTeam}` into Game; `{scores, playerTeam}` into Result). Global pick data goes to `localStorage`, not scene data. Mid-game there's also a **Pause overlay** (`PauseScene`): the ⏸ corner button (or ESC / P) freezes the whole GameScene via `scene.pause()` — sim, timers, tweens, camera, input — and launches a menu over the frozen field with big PLAY (resume) and HOME (quit to title) buttons plus the mute toggle.

- **Boot** — generates all 30 kids × 15 poses plus the rig's hero tier and the draft's street-clothes variants (~720 SVG textures across two sizes) once, shows a loading bar, hands off to the Schoolyard.
- **Schoolyard** — title screen and draft in ONE continuous world. Title beat: the brick school wears the RECESS SPORTS banner; the blacktop below has chalk four-square/hopscotch and two team pennants; a pulsing PLAY 🔔 button (unlocks audio). Press it and **recess begins**: the school bell rings, the double doors burst open, and all 30 kids stream out (real four-frame run cycles + ground shadows) through the gate and line up against the playground wall in two rows. The stream-out is a real crowd sim (`systems/crowd.ts` — pure, deterministic, unit-tested, same pattern as the live-play sim): launches are metered at the door, kids seek their wall spot with pairwise separation so bodies jostle instead of overlapping, stair/wall-gap constraints funnel the flow, and draw order is y-sorted every frame so nearer kids correctly pass in front; `SchoolyardScene.update()` steps it and positions the sprites directly (feel knobs in `config.CROWD`). The draft happens right there, sandlot style: hover a kid → a floating tag rides above them with their name and a mini stat-bar equalizer (a fast scouting read, no commitment); tap a kid → they step forward, say their name in their own voice (every character has a stable derived voice — `systems/voices.ts`), and a Backyard-style baseball card pops (framed portrait, tagline, a signature-ability chip for the special kids, 1-10 dot skill ratings, big PICK ✓); PICK → the kid shouts their own excited `draftLine` ("Moon shot time, baby!") and *runs across the yard* to your pennant. The CPU visibly wanders a "?" spotlight across the wall before its pick walks to the other side. Waiting kids bob and occasionally hop ("pick me!"). Every player pick is logged to the voting machine. An **⚡ AUTO button** (top-right, any point mid-draft) fast-forwards the rest: both sides' remaining picks fire in rapid succession (`chooseBestPick`, the same greedy value the CPU uses) and the kids sprint to their pennants in a few seconds — auto picks are deliberately NOT tallied by the voting machine, same rule as CPU picks: only deliberate human taps count as preference votes. When both teams have 9, everyone cheers (arms-up pose) in a wave with confetti, then it's off to the game. Cutscene is tap-to-skip. Dev overlays: D pick rates, G art gallery (P poses, A animate). Replays from the Result screen skip the title beat (`straightToDraft`).
- **Game** — BOTH halves are interactive with the same one-button timing input: you bat the top of each inning (swing when the ring closes) and **pitch the bottom** (throw when the mound ring closes; a good throw drags the CPU batter's swing band down, a wild one is usually a ball). **Every ball in play becomes a LIVE PLAY** — a real-time race stepped by the `liveplay.ts` sim: the defending team's nine kids stand at real positions; on defense the nearest fielder glows gold under a bobbing chevron and chases your pointer, with a Backyard-style glowing capsule stretching from your kid to where the ball is headed and a pulsing ring previewing exactly where a fly will drop (`FX.LIVE_MARKER`) — catch a fly = out; grab a grounder, then press near a base and hold to charge a throw — or run the ball to the bag yourself; on offense your runners advance one base per tap ("everybody GO!") while the CPU fields, and stretching into a throw gets you thrown out. Force-outs and fly-outs only (playground rules: ball beats you to the bag = out; caught fly = batter out, runners walk back free). Home runs are detected at launch and keep the classic celebration. Walks, walk-offs, skipped pointless bottom halves, and one bonus inning on a tie. A **difficulty ladder** on the GAME SETUP page (TEE-BALL / EASY / MEDIUM / HARD; persisted per-browser; MEDIUM is the default) picks the feel: TEE-BALL and EASY resolve to the forgiving KID feature set (slow CPU, big grab radius — tee-ball additionally sits the ball on a slow soft-lob tee so any timing makes contact); MEDIUM and HARD use the stricter CLASSIC set where the Backyard-Baseball-style mechanics (pitch aiming, batting cursor, manual baserunning, errors, steals, juice) land behind `MODES.main.features` flags, with HARD seeding the CPU difficulty ramp a couple levels up front. The tier also decides how much the game fields *for* you: the CLASSIC magnet assist that bends your steering toward the ball weakens as you climb, so on HARD getting under a fly is very nearly all your own doing. The internal `GameMode` (`main`/`kid`) is derived from the difficulty. The GAME SETUP page also carries the errors ON/OFF toggle and the 🎯 SWING SPOT / 🥊 PITCH LOCATOR helper toggles (which trim CLASSIC's batting cursor / pitch selection). **Pitch selection & aiming (CLASSIC, both halves)**: on the mound you pick a pitch from a Backyard-style stack of labeled cards on the right edge (`scenes/ui/EdgeCards.ts` — 💨 FAST / 🐢 SLOW / 🌙 CURVE / 🌀 SCREW, plus the juice specials below them showing 🔒 + their ⚡cost until you can afford one) and tap a 3×3 strike-zone cell, then hit the timing meter — meter error × pitching stat scatters the ball off your aim, and the CPU batter judges the ACTUAL crossing point (chases deceptive near-misses, punishes hangers). At the plate the CPU pitcher does the same at you: no red wild-pitch telegraph in CLASSIC — you read the drawn strike zone and the curving, speed-varying flight to decide swing vs take (`systems/pitchkind.ts`, `scenes/ui/PitchSelectUI.ts`). **The 3/4 camera (all modes)**: the field now reads like the classic looking-across-the-yard view — foul lines converge on a pinched fence, base plates pull toward the vanishing axis with depth, and every kid shrinks the deeper they stand (the batter towers in the foreground, outfielders are little). Under the hood the sim and every test still live in the flat logical space; `art/projection.ts` projects positions at draw time and un-projects pointer input, so aiming and steering land exactly where you point. **Two screen views (all modes)**: every pitch plays out in a true behind-home-plate perspective (`scenes/ui/BattingView.ts` — the TV/umpire angle): your batter big in the foreground seen from BEHIND (new rear-view pose art), the pitcher small in the distance facing you, the fielding team's actual catcher crouched at the bottom of the frame, the other seven defenders small at their real positions between the mound and the fence (so the close view shows the same nine kids as the wide field, foul lines spreading from the plate out to the poles), and the ball flying AT the camera and growing; the frontal strike zone / cursor / pitch grid are ~1.8× plate size (`art/plateView.ts` maps plate coords to it, `config.PLATE_VIEW` holds every anchor). The instant a ball is in play, a runner moves, or a steal race starts it HARD-CUTS (white-flash punch, Backyard style) back to the wide 3/4 field — the camera itself never pans or zooms. The HUD and prompts sit on a separate UI camera, with every screen-anchored lane declared in `config.HUD`. The scoreboard is a Backyard-style BOTTOM STRIP (`scenes/ui/Scoreboard.ts`): both teams' logo + name + score stacked on the left with a ▶ marking who's batting, an AT BAT block in the middle (the batter's name and their this-game line — "2-for-3 · 1 HR" — always tallied, both teams, every mode), a labeled B / S / OUT pip count that pulses whenever a pip lights, the inning, and a mini-diamond showing the base state (the STEAL! chips anchor just above it), with the umpire's BALL! / STRIKE! / FOUL! call popping above the strip — so the count is always readable and every pitch visibly changes something. **Poses & play-by-play (all modes)**: batters stand in at the plate in a real side-view batting stance (bat baked into the art — the old runtime bat prop is gone), pitchers wind up with a leg lift, all nine fielders wait in a gloves-out ready crouch, and runners hit the dirt with a dust-cloud slide whenever a throw is bearing down on their bag. Over it all, TWO kid commentators (`systems/announcer.ts` — Pip, a hyped little kid, and Rocco, a deadpan older kid, each with their own voice) trade the play-by-play through `audio.say`: pooled lines per moment with no back-to-back repeats and a rate limiter, the big calls (homers, double plays, THE called shot) always get through — and sometimes come back as a two-line exchange ("It is GONE!" / "NO WAY!"). The players talk too, Backyard style (`systems/chatter.ts`): batters hype themselves stepping in and your fielders heckle the CPU's batters ("Hey batter batter!"), each in their character's derived voice, rate-limited and droppable so they never talk over the booth. **Venues (all modes)**: a picker on the GAME SETUP page (with a live palette preview) chooses where recess happens — 🌳 The Park (the classic field), 🏡 The Sandlot (backyard: slanted wood fence with a SHORT right-field porch so oppo homers come cheap, deep left, shaggy slow grass, and the old oak in left-center that stops rollers dead with a BONK), or 🏀 The Blacktop (chain-link and fast asphalt — grounders scoot). Home-run thresholds scale with each direction's fence distance; bases and mound never move so the sim stays identical (`data/venues.ts`, `systems/venue.ts`, venue-aware `drawField`). **Juice meter (CLASSIC)**: great plays (perfect swings, hits, runs, Ks thrown, catches, double plays, steals) charge a ⚡ meter; spend it on a 💥 POWER SWING (band + quality boost — and Big Talk Theo's power swing is a GUARANTEED home run, the one time his called shot lands) or unlock a SPECIAL PITCH on the mound: the ⚡ CRAZY (huge break + flutter; Zoom's ability halves its cost), the 🔥 FIREBALL (extra fast, flies with a flame trail and a heat glow), or the 🧊 FREEZEBALL (a slow floater that flash-freezes into an ice cube MID-FLIGHT, hangs there wrecking your rhythm, then shatters out and finishes — pure time-remap, so the timing math stays honest). Every special drains triple stamina and gets its own screen-filling launch effect, and each ordinary pitch wears a themed flight trail too (speed lines, lazy loop, crescent moons, spiral, crackling bolts — `scenes/ui/PitchFx.ts`). The CPU has its own hidden meter and spends when trailing, picking among whichever specials it can afford (`systems/juice.ts`). **Steals (CLASSIC)**: with a runner on and the next bag open, a 💨 STEAL! chip appears above the scoreboard strip's mini-diamond during the pitch — arm it and the runner takes off; the race resolves on a strike or a (non-walk) ball against the catcher's arm, with a better jump off slow stuff (fouls and ball four send them scampering back). The CPU's speedsters steal against you too: a 🚨 throw-down prompt appears and a FAST tap sharpens your catcher's arm (`systems/steal.ts`, `applySteal` in `inning.ts`). **Full baserunning (CLASSIC)**: the bases are the controls — during a live play on offense, tap the base AHEAD of a runner to send them, the base BEHIND a mid-leg runner to turn them back. Real rules apply: force-outs only on forced runners; unforced runners must be TAGGED (the CPU carrier hunts off-bag runners, so getting caught in no-man's-land becomes a rundown); caught flies require a real tag-up (stray too far and you're doubled off), and a runner sent after tagging on a deep fly scores a genuine sac fly. Kid mode keeps the one-tap "everybody GO!" with free walk-backs. **Stat-driven fielders & errors (CLASSIC)**: every defender chases with their own speed stat, and errors are real — flies get dropped and grounders bobbled (glove/`fielding` stat), throws sail past the bag (arm/`pitching` stat, worse when the throw meter is overcharged). An error leaves the ball live where it fell and the flustered kid frozen for a beat, so runners take extra bases; kid mode runs the error multiplier at 0. Drafting a good glove finally matters (the draft AI values it too). **Batting cursor (CLASSIC)**: a gold sweet-spot reticle follows your pointer over the plate; a tap swings at the reticle. Contact = timing band × cursor-vs-ball overlap (dead-on keeps the band, fringe costs one, way off whiffs), swing timing pulls/pushes the spray (early = left field, late = oppo), and meeting the ball under/over its center lifts flies or chops grounders (`resolveContactAimed` + shared `buildLaunch` in `systems/atbat.ts`; CLASSIC widens the raw timing windows via `MODES.main.swingTiming` since aim is the new skill). All the juice (below) on a full ballpark backdrop (gradient sky, sun/clouds, a crowd in the stands, an outfield wall with bunting, a dirt warning track hugging the fence arc, haze-tinted treetops peeking over the wall, checkerboard-mowed grass — with each venue picking its own scenery combination via `data/venues.ts` look descriptors: the sandlot's rooftops and planks, the blacktop's brick wall, chain-link, painted three-point arc and hopscotch grid — a manicured dirt infield with mottled-speckle texture, a grass center cutout ringed by real worn basepaths with dirt circles biting into the grass at every bag, hand-limed chalk foul lines and batter's boxes, 3D pillow bases (cast shadow + shaded side face, whole bag lights gold when occupied), mound, and home plate) drawn procedurally (and fully deterministically — no `Math.random`) in `GameScene.drawField()` — with real depth dressing: the sun sits top-LEFT to match the characters' key light, mow stripes converge through the 3/4 projection, the fence has posts and casts a contact shadow, an atmospheric haze band cools the deep outfield, the mound is a lit dome, base bags lie flat on the ground plane, and a high live ball swells toward the camera while its ground shadow thins.
- **Result** — win/lose, team MVP, confetti + voice, rematch.
- **My team, my game**: on the Lineup screen you also pick a **team identity** — a uniform color + a logo emoji; the spoken pair IS the team name ("THE TEAL ROCKETS!") — and both squads take the field in real team jerseys with the logo on the badge (a texture-variant resolver recolors every pose behind the scenes; the CPU fields preset rivals like the Purple Tigers). Pressing PLAY opens the Backyard-2001-style **GAME SETUP** page (`GameSetupScene`) — one screen for game type (⚾ GAME / 🥎 PRACTICE / 👀 WATCH), the difficulty ladder, innings (1/2/3/6/9), errors, helper toggles, RESET ALL, and the field picker with a live preview; PLAY BALL runs the draft (GAME) or a quick random 9-v-9 (PRACTICE/WATCH). 🥎 **PRACTICE** is endless batting practice (no outs, no innings, a big DONE button); 👀 **WATCH** (spectator) sits both teams on CPU auto-pilot so you can just watch a game play itself (a 👀 STOP button exits). ⚙️ **Settings** still holds the independent SFX/voice volume sliders (with live audio feedback) and the game-length pick.

### The golden rule: pure logic vs. view

Everything tricky lives in `src/systems/` as **pure functions with no Phaser imports** — the same discipline as separating service functions from views in a web app:

- `draft.ts` — draft state, strict alternation, and a greedy value function (grabs the highest-value kid left, so leaving a stud on the board costs you); `chooseBestPick` picks for whichever side's turn it is (powers the CPU every turn and the AUTO fast-forward for both sides).
- `atbat.ts` — **Timing is the skill, stats shape the launch.** Swing error → a band (Perfect/Good/Weak/Miss); `resolveContact` turns a contact band into a **trajectory** (grounder/liner/fly, landing spot, hang time) instead of a pre-rolled hit/out — power/contact push the ball deeper, and only over-the-fence homers are decided here. Whether anything else is a hit or an out now *emerges* from the live play. Ability hooks apply to the band.
- `fielding.ts` — **who goes and gets it.** PURE chaser election, no Phaser and no rng. A ball in the air goes to whoever is nearest its landing spot; a ball on the ground goes to whoever can *cut it off* soonest — but only among fielders whose post is near where it will SETTLE (`LIVE.CHASE.LEASH`), and the fielder whose zone it settles in keeps it unless someone gets there `CUT_AHEAD_MS` sooner. Both gates exist because the obvious metric fails in both directions: rank purely on "who reaches it first" and the pitcher fields every grounder (a grounder starts at home, so P is nearest its early path at every angle); leash it but rank on raw time and a third baseman charges across in front of the shortstop for a ball rolling right at him. Re-election happens only when the ball turns up somewhere new — it lands, caroms, bonks, is bobbled, or a wild throw dies — behind a keep-radius, cooldown and margin, so the kid you are steering never flickers out from under you.
- `liveplay.ts` — **the live-play sim.** A tick-based reducer (`startLivePlay`/`stepLivePlay`/`finishLivePlay`) the scene steps every frame with the player's inputs (pointer steer, charge-and-release throws, "everybody GO!" taps). Ball flight/roll, one chased fielder (elected by `fielding.ts`, and it can change hands mid-play), base-covering receivers, runner legs, force races, CPU policies for whichever side the human isn't playing, plus no-soft-lock guards (auto-throw, a hard play-length cap). Emits per-tick events the scene turns into juice. **The ball really bounces**: a landed fly/liner carries its ground speed into diminishing hops (`LIVE.BOUNCE`, deterministic — no rng), then rolls out; hopping/rolling balls **carom off the fence** (reflection off the arc's inward normal — doubles off the wall are real, and the venue's `bounceMult` makes asphalt springy, shaggy grass dead). A hopping ball can only be scooped low (`PICKUP_MAX_H`), never caught for an out. **Fielding assist is mode-tied AND difficulty-scaled**: KID mode is `'auto'` (leave the pointer alone and your fielder plays itself — any real steering overrides instantly); CLASSIC is `'magnet'` (your steering is blended toward the ball while it's loose, so the kid leans the right way), and after the idle-takeover delay with nobody steering a CLASSIC chaser ambles after a loose ball at a fraction of full speed rather than standing frozen while the play runs out the clock. How much the magnet helps is a *difficulty* value, not one global constant: MEDIUM bends 30% of each step toward the ball and HARD only 12.5%, so on the hard tiers ignoring the ball genuinely drops it. The magnet is pure redirection — it lerps between two points each within one step, so it can never move you faster than steering yourself — and the idle amble is always slower than steering, at every tier, so letting go is never the better way to play. **A resting ball is always retrievable**: every settle site goes through `settleBallAt`, which clamps the spot into the field — a wild throw's overshoot used to land outside anywhere a fielder may stand (1B and 3B sit exactly on the foul lines), stranding the ball for the full play-length cap. The sail is preserved by rotating the overshoot to the nearest in-bounds direction rather than truncating it, so an overthrow at first ends up down the right-field line. The scene reports pointer staleness as a raw fact (`LiveInputs.pointerActive`); the sim decides.
- `geometry.ts` — the field's screen-space coordinates (bases, mound, the 9 fielding spots, fence) shared by the sim and the renderer so they can never disagree. The layout is a normal ballpark: bases sit exactly on the foul lines (`FOUL_SLOPE`), foul-pole x's derive per venue from the fence, there's a real outfield band beyond second base, and the fence is a **rounded arc** — `fenceBulge` px deeper at mid-fence than the pole-to-pole chord (`fencePointAt`/`fenceYAtX` evaluate the curve, `fenceNormalAt` gives the inward normal caroms reflect off; the bulge must stay ≥ 0 so containment stays convex). Also owns `clampToField`, the containment clamp the sim applies to fielder movement — a steered or CPU fielder can never be driven past the fence, far outside the foul cone, or off the bottom of the screen.
- `pitchkind.ts` — main-mode pitch types + strike-zone aiming (plate-coord space, scatter model, CPU pitch selection, flight-bend curve shared by logic and renderer).
- `mode.ts` — the persisted game mode (CLASSIC `main` / KID `kid`, migrates the old `recess_difficulty` key) plus the player-facing **difficulty ladder** on top (`getDifficulty`/`setDifficulty` + `DIFFICULTY_TIERS`; `setDifficulty` syncs both the stored difficulty and the derived `recess_mode`), `getFeatures` (per-mode mechanic flags, with an optional `FeatureOverrides` that can only DISABLE — errors/swing-spot/pitch-locator — so defaults stay a no-op), and `resolveLiveParams`, which merges `config.LIVE` with the `config.MODES[mode].live` multipliers, the chosen difficulty's `DIFFICULTY_TIERS[d].fielding` assist multipliers, and the errors override into the flat params object the sim consumes.
- `pitch.ts` — the mirror of `atbat.ts` for the defense half. Throw error → a pitch band (Perfect/Good/Weak/**Wild**); a strong arm forgives sloppy timing; pitch quality shifts the CPU batter's swing band (perfect = harder to hit, wild = usually taken for a ball). Also rolls the AI's occasional wild pitch at the player — the red "don't swing!" telegraph.
- `inning.ts` — count/outs/bases state machine, including **balls and walks** (forced runners only; a bases-loaded walk scores). `applyAtBat` returns the new state **and** a `movements` list (each runner's from→to base) for walks/homers; `applyLivePlay` folds a finished live play's outs/runs/bases back in (live plays animate themselves in real time, so `movements` is empty).
- `gameflow.ts` — game-level sequencing between halves: skip a pointless bottom (home CPU already leads after the top of the final inning), end instantly on a walk-off, grant one bonus inning on a tie.
- `picklog.ts` — the voting machine: `localStorage` tally + rate readout.

Scenes call these reducers and animate the result. This is why the logic is unit-tested (`logic.test.ts`) while the scenes aren't — the bugs live in the rules, and the rules are isolated.

### Layout: measure, then place

The one place scene code *does* get a hard rule, because it shipped a visible bug. Every screen is a fixed 960×640 absolute layout, but `pill()` sizes itself to its **rendered** text — so the long-standing habit of spacing a row at a hardcoded pitch (`x0 + i * 140`) was a standing bet that no label would ever measure wider than the pitch. It lost: `🥎 PRACTICE` measures ~142 against a 140 pitch, and on the GAME SETUP page `🎯 SWING SPOT` ended up sitting on top of `OFF` while `🥊 PITCH LOCATOR` ran under the field preview. Because emoji glyph widths depend on the platform's font fallback, the same row could look fine on one machine and collide on another.

The fix is the same split as everywhere else in the codebase — pure math, thin view:

- `ui/layoutMath.ts` — no Phaser, unit-tested: `solveRow` (spend the gap down to `minGap` *before* scaling anything, then clamp at a legibility floor and report `overflow` rather than squash), `solveColumn`, and the collision predicates.
- `ui/layout.ts` — the Phaser adapter: `row()`, `column()`, `columnGroups()` (a heading hugs its own pills; the leftover slack goes *between* groups), and `hitFromBox()`, which derives a tap target from the measured box instead of a hand-written rectangle. Every UI-kit builder publishes its true footprint — stroke bleed, drop shadow, `makeButton`'s bottom lip — so nothing downstream has to rediscover them. It is **measure-then-place, never build-and-place**: `add.text` is the only UI call that draws from `Math.random`, so placing already-built objects is fingerprint-neutral for the goldlog by construction.

And because a layout rule nobody checks is a layout rule that rots, `npm run audit:layout` boots every menu screen headlessly, walks the display list, and fails on any overlap, off-frame element, tap-area collision, or too-small target — across the content that actually causes trouble (all three venues, every difficulty, the longest of the 56 team names, all five Result variants) in both the Fredoka and font-blocked states. It runs in CI on every PR; press **L** in dev for the same check as an on-screen overlay. It is deliberately an AABB audit and not a screenshot diff: half of the original bug was a hit-area collision, which produces no pixel difference at all.

### Character art pipeline

No image files. `art/CharacterArt.ts` hand-draws each kid as a **hybrid toy-brand SVG string** — a crisp navy contour around every silhouette shape (the Backyard-Baseball precision that survives sprite-size rendering) with soft airbrushed **gradient volume** inside it and warm-brown interior facial ink, under a single upper-left warm key light (per-kid palette-derived gradients: radial on skin/hair so heads read as spheres, linear on top/bottom garments; cool navy-mixed shadow stops + warm highlight stops; limbs keep offset highlight strokes since gradients on strokes are unreliable), rounded proportions, and real expressions — from `VisualParams`: `skin` / `hair` / `hairColor` / `uniform` / `accessory` plus personality knobs `expression`, `bodyType` (now just a preset), and `freckles`, **and the per-kid silhouette specs that make 30 kids read as 30 different bodies**: `body: BodySpec` (height anchored at the ground line so feet stay planted, shoulder/hip width, belly, neck length, head width/height — every field clamped so content typos can't break the art) and `face: FaceSpec` (eye gap/size/style — classic sclera, button, or heavy-lidded sleepy — nose arc/dot/wedge, mouth width, cheek-blush intensity). Every kid also owns a street `outfit` (tee/stripeTee/hoodie/overalls/dress/jacket in `STREET_COLORS`) worn ONLY during the draft via the `:sc` texture variant — jerseys everywhere else. Hair styles include short/curly/ponytail/buzz/mohawk/bald/afro/pigtails/spiky/bun/long. **Each kid renders in 25 poses** (stand, the four-frame run gait, cheer, the gameplay set bat/windup/windup2/ready/slide/throw/catch/dive, the swing frames swingLoad/swingMid/swingFollow with rear twins, the rear-view rig pair, and the upset/nervous/dodge reactions). Side poses use the classic small-sprite **¾ cheat** — the front-view head rides the side-view body, tilted toward travel — so all hairstyles and expressions are reused verbatim. Every pose bottoms out on the same ground line so texture swaps never make feet pop. `art/textureFactory.ts` base64-encodes each SVG into a data URI and loads it as a Phaser texture keyed by `poseKey(id, pose)` (`id`, `id:run1`, …) in **two size tiers**: a base tier rasterized near display size (1.2× viewBox — the SVG rasterizer downsamples far better than GPU minification, which was the old blur) and a `:hi` hero tier (2.4×) only for the behind-plate rig's 230-288px close-ups (`heroKey`, consumed only by `BattingView`). `art.test.ts` asserts every kid × pose yields valid, undefined-free SVG, that no two kids render identically, and that jersey renders ignore the outfit field. Dev tool: press **G** on the Schoolyard for the gallery; **P** cycles poses, **A** live-animates the run cycle.

### Feel & juice

- **Tunables** in `config.ts`: `TIMING` + `PITCH_TIMING` windows, `PITCH_TRAVEL_MS` + the pitch-meter timings, `FLOW` (all between-moments pacing — next-pitch/next-batter/half-start delays and banner hold times; a banner's hold must be ≤ the FLOW beat that follows it so calls stay readable), `INNINGS` + `MAX_EXTRA_INNINGS`, `WILD_PITCH_CHANCE`, `SHAKE`, `RUNNER_TWEEN_MS`, `SHOW_TIMING_RING`, `AUDIO`, `VOICE` (the two commentator profiles, the `PICK` curated-voice ranking tiers + `GENDER` name-regex voice classification, derived kid-voice ranges incl. the `GENDER_PITCH` boy/girl bands, per-utterance `JITTER`, speech-queue caps, chatter cadence, speech volume), plus the live-play block: `LIVE` (launch distribution, fielder/runner/throw speeds, grab radii, throw-meter and play-length caps, `ASSIST` magnet blend + pointer staleness + CLASSIC idle takeover, `CHASE` chaser-election leash/cut-ahead/hysteresis, `BOUNCE` hop/restitution/carom physics) and `MODES` (per-mode live-sim multipliers incl. `fielderAssist` + `ModeFeatures` flags).
- **`ui/theme.ts`** — the shared UI kit that makes every screen match: the brand font (self-hosted Fredoka), the mascot outline color, and `panel()`/`ribbon()`/`pill()`/`heading()` helpers for rounded, outlined, drop-shadowed chrome. Buttons and draft cards are built on it; the font is awaited in Boot before the Title shows.
- **`ui/effects.ts`** — screen shake, particle burst, floating text, confetti.
- **`ui/anim.ts`** — character animation helpers: pose-texture animation (`runCycle` loops the 4-frame `RUN_FRAMES` gait — reach → pass → crossover → pass, `poseSequence` steps one-shot frame sequences), `groundShadow`, plus procedural tweens (idle "breathing" bob, celebratory squash-hop, pop-in, `enterFrom` staggered reveals, `pulse` attention loops). In-game: a real **four-frame swing** (stance → load → contact frame with a swoosh, timed under the hit-pause flash → follow-through, with a whiff over-rotation), a two-frame pitcher **wind-up** (leg lift → stride/plant), CPU batters **jog to the plate**, and baserunners are the **actual kids** sprinting the bases with real leg cycles, ground shadows, and direction-aware flips. Scene transitions use quick camera fades. Timing lives in `config.ANIM`.
- **`systems/audio.ts`** — free, code-synthesized sound: Web Audio SFX (bat crack, whiff, pop, cheer, pitch woosh) + browser SpeechSynthesis voices + a persisted mute. No files, no cost. Every voice is a `VoiceProfile` (pitch/rate/voiceIdx/voiceGender, from `systems/voices.ts`): the two booth commentators plus a stable derived voice per character. Speakers land on a **curated voice list** — `curateVoices` scores the browser's voice inventory by childlike suitability (real child voices like Edge's "Microsoft Ana" first, then neural/Google voices, with deep novelty voices excluded; tiers in `config.VOICE.PICK`) and partitions it into mixed/boy/girl sublists by name regex (`VOICE.PICK.GENDER` — the SpeechSynthesis API exposes no gender), so each kid's voice matches their `voiceGender` from `data/characters.ts`; when a browser offers no gender-marked voices, gendered pitch bands (`VOICE.KID.GENDER_PITCH`) keep boys and girls audibly apart on the mixed list. Each utterance gets a tiny pitch/rate jitter (`config.VOICE.JITTER`) so repeated lines don't sound robotically identical. A small speech queue keeps lines from cancelling each other — big moments flush it, chatter only speaks when everything is quiet.
- In-game juice: a contracting **timing ring** teaches when to swing; band feedback (PERFECT!/GOOD!/…); contact pop + shake scaled to hit size; a held **contact frame** (white pop + a beat in the plate view) before the cut to the wide field; the live hit ball streaks a fading trail and stamps a chalk ring where it lands; runners actually run the bases and cross home with a burst.
- **New verbs (CLASSIC)**: pre-pitch **swing-type chips** (🛡 safe = choke up for contact, 💪 big = crushed-or-nothing, 🤏 bunt = a dead ball in front of the plate) reshape the timing windows and the launch (`systems/atbat.ts` `timingForSwing`/`SwingType`); on defense a quick **tap mid-chase = DIVE** — a short reach burst that turns just-out-of-reach liners into highlight catches, and an empty dive leaves your kid face-down in the grass with the ball live (`LiveInputs.dive`, `LIVE.DIVE`). Every kid also has a real **batting stance** now (`VisualParams.stance`: open/crouch/high) plus throw/catch/dive action art and dedicated mid-swing/follow-through frames in both the side and behind-plate views, batters waggle the bat while they wait, and every hand is drawn (chunky fists wrap the bat handle, fingers spread on cheers and scoops) instead of the old circle mittens.
- **Where the feel numbers come from** (`scripts/measure/` + `scripts/measures.json`): a small measurement instrument for reading real Backyard Baseball 2001 footage, because every "Backyard feel" constant was originally tuned from memory and the one number that got written down was wrong — a claimed 234px basepath that is actually 179.6px, which left home→1B ~40% fast for months. `lib.js` is pure math (robust order statistics, a spread **floored at one frame period** so no measurement can claim more precision than the instrument had, and a **derived** confidence — n and spread decide it, never an operator); `video.js` is the ffmpeg side (play indexing by scene cut, motion tracking, **background subtraction** — a temporal-median background plus foreground blobs, which is how you find a ball in a venue whose fence and crowd are the same colour as it — and the screen-capture helpers that find the emulator window and tell game footage from desktop by pixel structure alone); `screenshot.js` recovers exact colour from ScummVM's integer window blit and refuses when the source has been filtered. `measures.json` holds the records — each names the `config.ts` constant it informs and carries a status that `conformance.test.js` asserts on every `npm test`, so a measurement can't go stale unnoticed. **Result so far**: BB's field is true *perspective* where ours is affine (confirmed on **three** venues from two independent sources). Its foul slope turned out to be a *per-venue* property spanning 1.197–1.241 — a third venue overturned an earlier record that had read a tight two-source agreement as one global 1.240, and our 1.2 sits inside the band. **Pitching was re-measured against a real clock** (2026-07-26: a fastball flies **1227ms** at an average arm, `PITCH_SPEED.MAIN_BASE_MS` 297→1350, with `ANIM.WINDUP_MS` 380→800 — our pitch had been ~5× too fast with half the telegraph. The superseded "270ms" reading, and the 727 and 250 before it, all marked *release* at the first frame the ~5px ball could be **spotted** against the grass, which is late by construction; magnify ≥2× before judging any frame. `pace.pitchCorridor` stays `awaiting-measurement` at n=1 under the repo's own n<3 rule) **— and the dead time between pitches** is now FILLED rather than merely waited out — the catcher throws the ball back and the pitcher gets set, skippable with a tap, exactly what BB does and what its absence had us reading as "too fast"; a 10s idle clock on the mound throws for you if you never pick a pitch). **The pace is measured AND retuned** (2026-07-24: `RUNNER_SPEED` 85→42.8, `FLY_HANG_MS` →2875–5075, `BETWEEN_PITCH_MS` →2550, with every coupled speed/delay scaled 1.987× but *not* measured). **And the first of those scaled-not-measured constants has now been fixed** (2026-07-28): fielders were running at **2.48× runner speed** — the slowest fielder in the game outran the fastest baserunner, and an outfielder could carry the ball to the plate in 2.5s against a 4.2s basepath leg. The number had sat unchanged through *five* consecutive runner slowdowns and then been faithfully scaled by the retune, because it was the one pace constant with no record and no conformance pin. Fielders and baserunners are the same kids, so the ratio is now **1.0** (`LIVE.FIELDER_RUN_RATIO`), and both it and the per-mode multipliers are pinned. Two latent bugs surfaced the moment fielders stopped being fast enough to paper over them: doubling a runner off a caught fly only ever worked by the carrier *footracing them for a tag* (the throw was gated behind 2.3s of stacked delays), and a runner turned back from the plate could settle standing on home with no run scored, silently vanishing from the inning. Both fixed. **A CUTOFF RELAY now makes outfield balls hits** (2026-07-29): watching the BB2001 capture settled it — an infield grounder is fielded and thrown to first for the out, but a ball that lands on the outfield grass is relayed outfielder → cutoff man → pitcher while the batter runs to THIRD, and BB never *attempts* a throw to first from out there. Ours now does the same (`LIVE.RELAY`, CPU defense in CLASSIC): a deep gap ball is a clean double instead of an out by 0.9s. It is not a geometry fix — BB's field proportions turned out to match ours within a few percent. Offense went from **0% of balls in play** to ~7%; real baseball is ~30%, and the remaining ceiling is that flies are still almost always caught and grounders are cut off in the infield before they ever reach the grass. What the earlier speed change did **not** do is make base hits possible — every ball a fielder reaches is still an out at first, and the next lever is the throw ratio (CLASSIC throws at 9.65× runner speed; kid mode, which does yield hits, throws at 4.60×). Originally: BB runs home→1B in **4200ms** (n=3) against our 2113ms, so we cover the basepath in half its time — recorded as a `known-drift` with the retune deliberately held for a separate pass, since `RUNNER_SPEED` is coupled to the CPU reaction/throw delays. **Fly hang is measured too** (n=4): BB's flies hang 2875–5075ms against our 2000–2900ms — measured not from the ball, which BB often draws into a picture-in-picture inset, but from the big green landing-preview disc it paints on the grass for exactly as long as the ball is airborne. The result reversed the assumption it was meant to confirm: our flies are only 14–38% long *relative to the run*, and in absolute terms BB's are LONGER, so slowing the runner without lengthening the flies would overshoot. Between-pitch is measured as well (n=3): BB takes 2550ms from the ball arriving to the pitcher having it back, against our 1250ms — but that one is already correctly *proportioned* to the anchor, so it scales along with the runner fix rather than needing its own judgement call. What remains unmeasured is the pitch corridor, the umpire-call delay and the contact→depart beat; each record names the work that would close it, and a test refuses to let one stop saying. A second pass also closed a loophole the instrument had left open: two `src/config.ts` comments asserted Backyard measurements that no record backed, and a test now refuses to let a comment claim one without a record — the record is allowed to say "not measured", but not to imply otherwise by silence. The pass also had to *reject* a rival explanation before any of it counted: a ~4.2s leg was almost perfectly explainable as an emulator running a frame-locked game 1.4× slow, and `instrument.clockValidity` is the test that ruled it out.
- **Big-moment spectacle** (`scenes/ui/Spectacle.ts`): home runs get the full show — a gold star-trailed ball soaring over the fence, fireworks, crowd flashbulbs, confetti — and the juice spends get signature screen-filling effects (gold sun-ray burst for the power swing, electric bolts for the crazy pitch, a hot orange wash + rising embers for the fireball, an icy wash + crystallizing snowflake for the freezeball). **Reaction art**: every kid has baked `upset` and `nervous` poses (plus reaction expressions) — strikeout victims turn to the camera and slump, a two-strike CPU batter sweats while you pick your pitch, and a kid who boots a ball wears it on their face (`anim.reactPose` / `BattingView.reactBatter`).

---

## Key design decisions (and why)

- **Phaser + web, not a native engine** — free, instantly playable via a link, no app store, fast iteration. Matches "free game for kids."
- **SVG art generated in code** — zero asset cost, infinitely editable, crisp at any size; a stand-in until/if real art is commissioned.
- **Pure-function game logic** — testable, reasoning-friendly, and it lets a first-time-gamedev developer separate "my rules are wrong" from "my animation is wrong."
- **Free static hosting (GitHub Pages)** — no server, no running cost; the one place that eventually needs a backend (aggregating pick votes across players) is deliberately deferred.

### Recess Week & the sticker album

The session structure that makes kids come back: **🏆 RECESS WEEK** (`systems/season.ts`) is a 5-game season — draft ONCE on Monday, keep the team all week, face a preset rival each day (the Purple Tigers, the Orange Flames…), and watch the chalkboard standings fill with big chalk W/L marks (`SeasonScene`). Per-kid stats accumulate across the week (`systems/stats.ts` — the scene emits plain stat events at its settle seams), and Friday ends in an **awards ceremony** (`AwardsScene`): Week MVP, Homer King, and K Machine on podium cards with their real stat lines, computed from the accumulated record (`systems/awards.ts`), plus the pennant if you took 3 of 5. Every game also feeds the **📔 sticker album** (`systems/album.ts` / `AlbumScene`): drafted kids earn their sticker, wins foil it, trophies stack — a second, richer voting-machine signal on top of pick rates. Seasons resume mid-week automatically (versioned localStorage).

- **📼 Instant replay (CLASSIC)**: highlight-worthy live plays — a catch off a dive, a double play, a ball off the wall — re-run themselves in letterboxed slow motion before the game moves on (tap to skip). Implemented as position-snapshot playback through the ordinary live-play renderer (`systems/replay.ts`), never re-simulation.

### Pass-and-play 2P (👥 VS)

Two kids, one device. GameScene now runs on a **two-seat model** (`SeatState` — team/score/lineup/pitcher/plan/fatigue/juice/identity per seat, resolved by `battingSeat()`/`fieldingSeat()`): in VS mode both seats are human *batters* — the batting player holds the device for their whole half (swing aiming, swing-type chips, steals, sends), while the defending team is CPU-pitched and CPU-fielded, so the device never has to change hands mid-pitch. Both kids draft face-to-face (every tap is a real voting-machine pick), each sets their own lineup and team identity on back-to-back Lineup passes, and a full-screen team-colored **handoff splash** ("THE TEAL ROCKETS, YOU'RE UP!" — tap when ready) gates each half. PvP balance: no CPU difficulty ramp, no CPU juice spends against an absent human, the juice meter follows whoever's batting, and the winner's team name headlines the Result. A seeded **gold-log harness** (`scripts/goldlog.browser.js`) guards all of this: solo CLASSIC and KID games are byte-identical before and after the seat refactor.

### Two-device online play (🔗 FRIEND)

Two kids, two devices, zero backend: WebRTC through the free PeerJS cloud broker — the site is still pure static files. Kids exchange a **four-emoji room code** (the wire id is alphanumeric hex; the emoji are just its kid-readable rendering), then draft face-to-face over the wire (each device tallies only its own picks — real votes; picks are ack'd and retransmitted until confirmed, so a transient connection blip can't strand the draft), set lineups concurrently, and play a full game. The **host runs the one true sim**; the remote player's decisions enter at the exact seams the CPU used to fill (their pitch meter and swing timing resolve on *their* device — latency can never eat a timing window), and the **guest never simulates**: it mirrors semantic beats and renders live plays by streaming positions-only `ReplayFrame`s at 20 Hz through the same `LivePlayView` the instant replay uses, interpolated to 60 fps with `lerpFrames`. No free text travels on the wire (identities are color/logo indexes). Disconnects pause under a "Looking for your friend… 🔍" overlay with a 30-second wall-clock reconnect window; a lost friend mid-play is finished by the CPU policies, and a timeout ends in a no-blame "GOOD GAME!". Pure pieces in `src/net/protocol.ts` (+ `lerpFrames` in `systems/replay.ts`), the only peerjs import in `src/net/peer.ts`, entry via `scenes/LobbyScene.ts`.

## What's explicitly not built yet

Real recorded audio, a cross-player pick-rate backend, more characters/richer art, the Phase 3 dinosaurs. Online-play v1 leaves a few edges for later: remote steal-reaction taps (wire fields reserved), guest-side manual relief, and a net rematch button.
