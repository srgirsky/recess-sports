# Critical parity review — September 18, 2026

**Verdict: not ready to call 100% on par.** Feature breadth is substantial;
consistent character identity, finished acting, readable live play and verified
child usability still do not support that claim. Passing a test suite is not a
substitute for watching or playing the game. This is an agent's critique, not an
independent art review or a maintainer approval.

## Benchmark and evidence

Use the classic game for the character-led pickup experience and the 2026 game
for the modern presentation bar already established in this project. The
[official 2026 product page](https://store.steampowered.com/app/3935020/Backyard_Baseball/)
lists 30 characters, 11 fields, 6 modes, tutorials and T-ball. Recess has already
implemented much of the surrounding product shell. Matching counts does not
establish matching quality. Existing frame-specific comparisons remain in
[the reference notes](backyard-2026-reference.md).

Reviewed locally from main `5dd3cfe`, then on `fix/parity-review-playability`:
title, manual draft turns, custom-captain draft, autofill, strategy, team/venue
setup, the route into play, and the bare game at seed `critical-review`. Desktop
inspection used 1280×720; the bare-game landscape-phone inspection used
844×390. Automated layout and presentation results are recorded with the change.
The reference website's gallery was inspected; the local reference-video corpus
was unavailable at the path named by the capture instrument. This pass therefore
makes no new frame-timed claims about reference animation or voice quality.

## What fails the bar

| Area | Current assessment | Requirement before calling it ready |
| --- | --- | --- |
| Character identity | The initial inspection found different children in illustrated cards and the 3D scene. The second pass renders portraits from the runtime character factory, including the custom captain; the old SVG remains only while loading or if readback fails. | Recognize the same child in the card, draft, gameplay and results by face, hair, silhouette and signature clothing. |
| Draft presentation | Candidates with batting poses faced sideways; the crowd competed with the selected child; walking orientation opposed travel. Corrections are proposed in this branch. | Review all pose families, both bench destinations, and phone framing in motion. |
| Character finish and acting | The existing sculpt ledger contains 26 `needs-polish` and 4 `candidate` entries. These are recorded statuses, not thirty new visual diagnoses. The action-review matrix is unfinished. | Clear the actual sculpt and motion findings using current delivered models; review the entire action and transition, including hands, props, eyes and feet. |
| Live-play readability | A wide camera made the ball a near-invisible speck; the turf rectangle ended visibly against the sky. This branch extends the turf and gives live balls a minimum apparent size; full-scene smoke captures now include the correction. | Follow the ball and identify the active player and next base throughout camera changes, with a complete-looking environment. |
| First-session usability | Startup was blank until assets finished; the draft lacked Back and autofill; gameplay offered no basic control explanation. This branch improves all three. The second phone pass also exposed an entirely hidden roster chooser; short landscape now keeps choices beside the candidate. | A child can reach play and perform each verb without an adult explaining hidden controls. Text hints alone do not prove this for nonreaders. |
| Presentation consistency | The attractive painted title, flat illustrated cards and faceted models do not yet read as a consistently directed cast and world. | A coherent visual treatment across screens and gameplay; quality must survive ordinary cameras rather than selected hero renders. |
| Audio and comedy | Production assets and cue wiring exist; this pass has not listened through a complete game or compared repetition and acting with the reference. | Listen to a whole game, including mute/unlock, cue collisions, repetition and character-specific delivery. Unreviewed stays unreviewed. |
| Replay value | Draft, lineup, venues, Recess Week and collection provide a substantial shell. Their presence does not prove players want another game. | Observe complete games and voluntary replay; check saved progress and rewards across both entry points. |

Whole-game acceptance currently reports **59 targets, 0 approved**. This is an
approval/coverage fact, not a claim that all 59 targets are defective or that the
game is “0% complete.” New observed visual findings are owned by
[the existing ledger](../v2/art/reviews.json), ART-007 through ART-010. Existing
sculpt findings remain in their original ledger rather than being duplicated.

## Corrections in this branch

- Paint the title immediately with loading feedback and disabled game actions;
  offer a retry if startup fails.
- Render cached portraits from the same runtime character factory, with the
  game’s colour pipeline, without a second loader or permanent GPU context.
  Custom appearances and uniform changes get distinct cache entries; failed
  readback restores renderer state and falls back to the illustration.
- Match draft facing to the actual clip, turn walks toward their destinations,
  and separate the waiting group from the selected child.
- Add Back and Pick the Rest. Completing a draft cancels pending pick timers,
  preserves existing selections and the custom captain, and records no automatic
  votes. PLAY BALL remains the deliberate continuation.
- Keep the short-landscape roster chooser in a visible column beside the
  candidate; hide secondary copy there rather than hiding the actual choices.
  The layout audit now requires an initial card to be fully on-screen.
- Repair the Classic link from the permanent `/v2/` alias.
- Show short context-dependent instructions for batting, pitching, running and
  fielding; suppress them in watch mode, CPU-controlled halves and resolved plays.
- Extend the turf through the visible horizon without adding triangles, and
  preserve at least six pixels of live-ball diameter as the camera recedes.
  Collision, catching and the physical ball remain unchanged.
- Load model/animation review surfaces on demand, keeping the built game within
  its existing JavaScript budget without raising the limit.
- Make browser checks wait for enabled PLAY before driving the draft, so the
  loading shell cannot be mistaken for a ready game.

These changes do not touch v1 source, physical baseball rules, held feature
flags, delivered character models or existing approval records.

## Next review order

1. Review the proposed ball/turf corrections through field/deep camera motion
   and replay at both sizes in daylight and night.
2. Review the runtime portraits across all screens and custom appearances;
   finish any remaining identity/shape defects through the existing sculpt worklists.
3. Finish the existing character sculpt and action-review worklists. Do not
   replace missing motion evidence with another technical score.
4. Run a full audio/pacing review and the existing child-playtest protocol,
   followed by real-device performance checks.
5. Assemble the complete current-source review packet for the maintainer.
   Keep independent review and maintainer approval distinct from this agent's
   readiness judgment.

## Verification for the correction passes

- `npm test -- --maxWorkers=2`: 117 files passed, 2,315 tests passed,
  12 skipped. The initial unrestricted run hit worker timeouts while software
  WebGL was busy; the bounded run completed without unhandled errors.
- `npm run build`: passed; the classic output remains `classic-Di4uhfdr.js`.
  The v2 entry loads about 1,052 kB; the unchanged bundle gate passes.
- `npm run smoke:presentation -- .art-review/parity-review/final-presentation`:
  all 20 beats passed, with full-page PNGs and `report.json`. The script now
  freezes native rAF before boot and polls DOM readiness explicitly, preserving
  the instrument's painted state and the actual HUD in screenshots.
- The final responsive audit passed 93 scenarios (4,723 boxes), including
  startup loading/error screens at all six viewport sizes.
- Manually inspected title, draft and wide-field captures; these are agent
  observations and technical evidence, not independent art approval.

The second pass adds runtime-derived portraits and short-landscape roster
visibility. The desktop custom draft displayed 32 runtime portrait instances;
the landscape-phone inspection displayed a visible two-column chooser beside
the candidate. The portrait tests cover renderer restoration on success and
failure, resource release, retry, and appearance-cache invalidation. A fresh
20-beat smoke in `.art-review/parity-review/identity-presentation` passed,
including a required all-roster runtime-portrait check at draft opening.

Next, review the complete cast and its actions against the existing worklists,
then audio and whole-game playability. Human child-playtest observations and
independent approval must never be invented. Do not call the game ready merely
because this correction PR is green.
