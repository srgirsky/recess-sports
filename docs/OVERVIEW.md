# Recess Sports — Overview

The deep-context doc: what we're making, why, and how it's put together. For the quick AI on-ramp see `../AGENTS.md` (`CLAUDE.md` symlinks to it); for run/build/deploy see `../README.md`.

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

Next: the retune. BABIP, the strikeout rate, the foul ratio, the
`sim.venueRollFeel` drift, and tag-ups, rundowns and steals.

---

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
