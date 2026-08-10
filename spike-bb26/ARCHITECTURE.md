# spike-bb26 — architecture contract

Read this before writing a line. `prompt.md` says WHAT to build; this file says
HOW the codebase is divided so many agents can work it without collisions.
(Deliberately named ARCHITECTURE.md, not AGENTS.md — the parent repo's brief
lint walks the whole tree for AGENTS.md files.)

## Ownership

One subsystem = one directory = one owner per pass. **You edit only your
directory.** `src/core/`, `src/main.ts`, `tools/`, `index.html`, and the config
files are FROZEN after scaffold.

| Directory | Owns | Registers |
|---|---|---|
| `src/render/` | renderer, camera presets + cuts, lighting rig, post | `ctx.set('render', { renderer, scene, camera, render() })` |
| `src/materials/` | ALL canvas-generated textures and the palette — the single color authority (`materials/palette.ts` is the only file with hex values) | `ctx.set('materials', …)` |
| `src/field/` | ground, diamond, fence, scenery, props, background kids | `ctx.set('field', …)` |
| `src/characters/` | procedural kid mesh generation (bodies, faces, clothing) | `ctx.set('characters', …)` |
| `src/animation/` | AnimationClips, mixers, procedural idle life, the pitch/swing/contact beat | `ctx.set('animation', …)` |
| `src/ui/` | HUD + diegetic menus, in the `#hud` DOM layer or in-scene meshes | `ctx.set('ui', …)` |
| `src/audio/` | WebAudio synthesis; must no-op until first user gesture (browser rule) and stay silent in capture | `ctx.set('audio', …)` |

Init order (also the dependency order, fixed in `main.ts`):
render → materials → field → characters → animation → ui → audio.
A subsystem may `ctx.get()` anything initialized before it; for later ones,
subscribe to events or look up lazily inside a tick handler.

## Communication

- Runtime lookup: `ctx.get('name')`. **Never import across subsystem dirs.**
  Sharing types via `import type` is allowed.
- Events (`ctx.on` / `ctx.emit`). Canonical vocabulary — extend it here, in the
  same commit that first emits the new event:
  `scene:ready` · `tick {tMs, dtMs}` · `pitch:windup` · `pitch:release` ·
  `bat:swing` · `bat:contact` · `ball:land` · `camera:cut {preset}` ·
  `verdict:show {text}` · `ui:navigate {view}`.

## Views and cameras

`?view=pitching|batting|menu|draft` selects the scene; `render/` owns the
camera preset per view and honors `camera:cut`. Units are FEET (60 ft
basepaths, 46 ft mound, ~200 ft fences) so numbers port to/from v2 unchanged.

## Determinism (the capture contract)

- Randomness only via `ctx.get('rng')` (seeded from `?seed=`). No
  `Math.random`, no `Date.now`, no `performance.now` in scene construction or
  animation — time comes from `ctx.get('clock')` via the `tick` event.
- `window.__spike.step(ms)` drives the world manually for capture; the first
  call permanently stops the rAF loop. Same seed + same steps ⇒ same pixels.
- `renderer.setPixelRatio(1)` stays — capture compares 1920×1080 exactly.

## The loop protocol

After every pass: `node tools/capture.mjs --views pitching,batting` then
`node tools/compare.mjs --views pitching,batting`. The critic reads the
three-way boards (spike | reference | v2-baseline) and writes
`critic/verdict-NNN.md`: per-dimension scores 1–10 (character silhouette, face,
motion, venue density, HUD sticker language, vibe) for spike AND v2-baseline,
top-3 concrete fixes naming the owning subsystem, and harvest notes ("technique
that is working"). **The next pass opens the latest verdict first and addresses
its top-3 before anything else.** Sequential single-owner passes; never two
writers in one directory.

## File rules (parent-repo gates walk this tree)

- No file named `*.test.*` or `*.spec.*` anywhere in `spike-bb26/` — the root
  vitest run has no config and sweeps default globs repo-wide. Self-checks are
  `*.check.mjs`, run directly with `node`.
- No `AGENTS.md` / `CLAUDE.md` in this directory.
- Never edit anything outside `spike-bb26/`.
- Only `three` as a runtime dependency; no downloaded assets of any kind —
  textures, meshes, animations, fonts, and sounds are all procedural.
