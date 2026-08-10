# SPIKE: Backyard Baseball 2026 visual replica — one shot, all procedural

Build a browser scene suite that **looks like Backyard Baseball 2026**.
Reference images are in `reference/` (fetched, not committed), annotated
anchors in `reference-manifest.json`, and the shot-by-shot audit of the real
game is `../docs/research/backyard-2026-reference.md` — **read it first**; it
is the authoritative description of what every screen contains.

This is a LOOKS spike, not a game: no rules engine, no sim correctness. A
pitch, a swing, a ball in flight, and idle life are enough motion. It will
never ship; its job is to discover character / motion / presentation
techniques better than our current procedural art (captured in
`reference/v2-baseline/`). Beating that baseline is the whole assignment.

## Deliverables (priority order — cut from the bottom)

1. **Pitching view** (`?view=pitching`), matching the steam-02 anchor: batter
   LARGE in rear-3/4 (~40% of frame height), pitcher on the mound mid-windup,
   dense world behind the fence — houses, junk truck, privacy fence with
   bunting, sagging telephone wires, watching kids. Wobbly hand-chalked
   diamond, mow bands in the grass. Full HUD in sticker language: mini-diamond,
   VS matchup plate, pitch-card stack (HEAT / HOOKS / SLOW / SPECIAL, each with
   an illustration), JUICE carton, scoreboard chips — cream fields, thick
   colored borders, drop shadows, slight rotation jitter. **Zero flat
   rectangles anywhere on screen.**
2. **Batting/contact beat** (`?view=batting`): waggle → load → swing → contact
   burst, `camera:cut` to a high oblique, verdict text filling the frame.
3. **Diegetic menu** (`?view=menu`): treehouse interior where every option is a
   physical object, not a button.
4. **Draft beat** (`?view=draft`): kid on a bench + floating trading card +
   PICK? — stretch goal, cut first.

## The quality bar

The characters are the whole point. **Chunky stylized kids**: oversized heads,
big readable eyes and mouths, thick limbs, expressive hands, clothing with real
construction (seams, sleeves, socks, shoes) — judged by silhouette at gameplay
distance. A kid standing still is never still: breathing, weight shifts, bat
waggle, glances. If a capture would embarrass you next to the steam-02 anchor,
it is not done.

## Hard constraints

- **three.js only** (version pinned in package.json — matches the parent repo
  so techniques port). No other rendering/animation/physics libraries.
- **Everything procedural**: no downloaded textures, models, fonts-as-assets,
  or audio files. Canvas-generated textures, code-built geometry, code-built
  `AnimationClip`s, WebAudio synthesis only.
- **Deterministic**: randomness only from the seeded rng, time only from the
  clock (see ARCHITECTURE.md § Determinism). `?seed=` reproduces a world
  exactly; `window.__spike.step(ms)` steps it for capture.
- Ownership, events, file-naming rules: ARCHITECTURE.md. You edit only your
  subsystem directory; never anything outside `spike-bb26/`.

## The loop

Every pass ends with a capture + compare; a critic writes
`critic/verdict-NNN.md` (scores 1–10 per dimension for spike AND v2-baseline,
top-3 concrete fixes naming the owning subsystem, harvest notes). The next
pass MUST open the latest verdict first and address its top-3 before anything
else. Sequential single-owner passes — never two writers in one directory.
