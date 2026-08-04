# src/ui/ — AI brief

v1's shared UI kit, layout solver and juice. Loaded when you touch anything here.

The font is self-hosted Fredoka (`public/fonts/fredoka.woff2`, `@font-face` in
`index.html`), awaited in `BootScene` before Title — the layout audit fails loudly
if it did not resolve, because every measured width would be the fallback's.

`theme.ts` owns the brand `FONT`, `OUTLINE` and the rounded-outlined-with-shadow
helpers `panel()`, `ribbon()`, `pill()`, `heading()`. **Use these, not raw
`add.rectangle`** — Phaser rectangles cannot round corners. `Button.ts`,
`PlayerCard.ts` and `statbars.ts` are built on them.

## ★ Measure, then place — never build-and-place

**NEVER position UI at a hardcoded pitch.** `pill()` is
`w = max(minW, label.width + 32)`, so `x0 + i * PITCH` is a bet that every
rendered label stays under `PITCH - 32`. It does not: real labels overrun real
pitches, and **emoji glyph widths differ per platform font fallback**, so a row
that looks right on your machine overlaps on someone else's. That bet shipped one
control sitting on top of another.

Build the row's items at a throwaway position, then call `row()` / `column()` /
`columnGroups()` from `layout.ts`, which read each object's published `ui` box.
Every UI-kit builder publishes its TRUE footprint via `tagUi` — panel stroke
bleed, drop shadow, and `makeButton`'s bottom lip, which puts its box below
centre (`setSize(w, h + lip)` alone reports the right size at the wrong place,
and that mismatch is why buttons were clipped by their frame).

- **Tap targets use `hitFromBox()`**, never a hand-written `Rectangle(...)`.
  `scripts/hitrect.lint.test.js` fails new ones and its allowlist may only shrink.
- **Anything with an unbounded string** (a team name, a venue) needs `maxW` +
  `minFontSize`.
- **Layout reads UNSCALED boxes on purpose.** Scenes render "unselected" at a
  reduced scale, and measuring the shrunken box would let a real collision pass
  whenever a chip happens to be dimmed. Conversely `MIN_TOUCH` is sized so the
  dimmed scale still clears the accessible minimum.
- ⚠️ Two related traps: a `heading`'s tagged height is the INK, not Phaser's line
  box (which carries line-height padding far past the glyphs); and
  `pill().setText` / `remeasureText()` **must be followed by a re-`row()`**,
  because new text is a new width.

`layoutMath.ts` is the PURE solver (no Phaser, vitest-tested): `solveRow` spends
the gap to `minGap` BEFORE scaling, clamps at `minScale`, and reports `overflow`
rather than squashing past legibility. `solveColumn` adds space-between slack.
The `overlaps`/`contains`/`insideFrame`/`intersection` predicates are shared by
the CI audit and the dev overlay, so **what you see in the overlay is what CI
asserts**.

**Verify with `npm run audit:layout`** (or press **L** in dev). It boots every
menu screen over the scene × CONTENT matrix in two passes — Fredoka loaded and
Fredoka blocked — and **fails loudly if the font did not resolve**, because every
measured width would then be the fallback's. Waivers live in
`scripts/layout-audit.json` and each carries a `why`.

## Juice and animation

`effects.ts` holds the reusable shake, burst, floating text and confetti;
big-moment set pieces live in `scenes/ui/Spectacle.ts`. `anim.ts` holds the
character-animation helpers: idle bob, squash-hop with `onDone`, pop-in,
`enterFrom` staggered reveals, `pulse` loops, `groundShadow`, `runCycle`
four-frame texture animation, `reactPose` one-shot swaps, and `poseSequence`
one-shot multi-frame stepping with cancel.

Character motion combines pose-texture swaps with procedural tweens. The swing is
a real frame sequence run through `poseSequence`, timed so the hit-pause flash
catches the contact frame, with a body-whip tween on top.
`GameScene.animateSwing(whiff)` and `BattingView.swingBatter(whiff)` are the two
entry points; a whiff holds the follow-through longer and adds an over-rotation
tween.

- ⚠️ **Every path that re-poses or destroys a batter must cancel the live
  sequence first**, and nothing downstream may wait on these timers. The same
  applies to the pitcher's two-frame wind-up, cancelled in `enterHalf`,
  `setMoundPitcher` and `BattingView.hide` so a stale stride frame never lands on
  a pitcher who already threw or was relieved.
- ⚠️ **`runCycle` timers must be stopped before their sprite is destroyed** — see
  `src/scenes/AGENTS.md`.

## Dev tooling

`src/dev/LayoutOverlay.ts` (press **L** on a menu scene) and
`src/dev/PickRateOverlay.ts` (press **D** on the title) draws chrome boxes,
tap targets and collisions using the SAME predicates as the CI gate. Menu scenes
only — its render path calls `add.text`, which is on the goldlog's rng path.

## Where things live

| File | What it owns |
|---|---|
| `src/ui/theme.ts` | the brand font, outline, and the rounded-chrome helpers |
| `src/ui/layoutMath.ts` | the PURE solver and the overlap predicates |
| `src/ui/layout.ts` | the Phaser side: `tagUi`, `worldBox`, `row`/`column`/`columnGroups`, `hitFromBox`, `MIN_TOUCH` |
| `src/ui/statbars.ts` | the equalizer bars and the 1-10 dot ratings |
| `src/ui/PlayerCard.ts` | the draft's two scouting tiers: hover tag and full baseball card |
| `src/ui/effects.ts` / `src/ui/anim.ts` | reusable juice; character animation helpers |
