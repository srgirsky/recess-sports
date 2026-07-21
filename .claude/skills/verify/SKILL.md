---
name: verify
description: How to run and drive Recess Sports for end-to-end verification (dev server + Chrome + headless clock pumping).
---

# Verifying Recess Sports changes at the surface

## Launch

```bash
npm run dev          # Vite on http://localhost:5173/ (background it)
```

Open the URL in a Chrome tab via the claude-in-chrome tools.

## The occlusion trap

If `document.hidden` is true (Chrome window behind other windows — common for
automation sessions), Phaser's rAF is throttled/frozen: tweens crawl, timers
don't fire, real clicks land on not-yet-appeared UI. `osascript -e 'tell
application "Google Chrome" to activate'` may not help (and AppleScript tab
enumeration can time out). Don't fight it — switch to headless clock pumping.

## Headless clock pumping (works while occluded)

Install once via javascript_tool (per CLAUDE.md gotchas — timers follow the
loop clock, tweens follow `Date.now()`, so pump BOTH):

```js
window.pump = (ms, dt = 50) => {
  const g = window.__game;
  let t = Math.max(g.loop.time, performance.now());
  for (let e = 0; e < ms; e += dt) {
    t += dt;
    for (const sc of g.scene.getScenes(true)) sc.tweens.startTime -= dt;
    g.loop.step(t);
  }
  return g.loop.time;
};
```

Screenshots still capture the current painted state — pump, then screenshot.

## Driving the Schoolyard (title → draft)

```js
const s = window.__game.scene.getScene('Schoolyard');
// PLAY: the titleObjs container at logical (480, TITLE.MAIN_Y = 535); makeButton fires on pointerup
s.titleObjs.find(o => o.x === 480 && o.y === 535).emit('pointerup');
pump(600);            // phase 'cutscene', 30 kids spawn
s.finishCutscene();   // public tap-to-skip → phase 'idle'
// Manual pick: s.inspectKid(s.state.pool[0]); pump(300); s.confirmPick();
// One full pick round-trip (walk + AI delay + scan + CPU walk) ≈ pump(7000)
// AUTO: s.autoBtn.emit('pointerup'); full 18-pick auto draft ≈ pump(9000),
//   then pump(2500) more for the cheer + transition to the Game scene.
// Restart draft from the Game scene:
//   game.scene.getScene('Game').scene.start('Schoolyard', {straightToDraft: true})
```

State to assert: `s.phase`, `s.state.playerTeam/aiTeam/pool/turn`,
`localStorage.getItem('recess_pickcounts')` (only deliberate human picks tally),
`game.scene.getScenes(true)` for scene transitions.

GameScene has its own headless hooks — see CLAUDE.md gotchas
(`resolvePlayerSwing`, `resolvePlayerPitch`, `setLivePointer`, ...).
