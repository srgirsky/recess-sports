# Batting audit · 2026-09-18

These are author diagnostics and the maintainer's reported defect, not an independent approval. Findings ART-004, ART-005 and ART-006 live in [the existing ledger](../reviews.json); that file owns their status and acceptance conditions.

The user identified a backward-facing batter and an implausible grip in the Parks Dept review video. Inspection confirmed Junebug looking toward the catcher with the hands behind the torso. The plate bridge sets the root yaw to PI, while the delivered stance/head rotations leave the face pointing away from the mound. The existing grip test only checks the distance between hand bones on a generic procedural pose; it does not prove that delivered hands grasp the bat in world space. Capturing a complete video did not mean its action had been adequately critiqued.

## Evidence and limits

- `junebug-0000.jpg`: 0.00 seconds; `junebug-0075.jpg`: 2.50 seconds, before the incoming ball reaches the batter. Full game and HUD, 1280×720. Extracted without editing from the 30 fps benchmark on park PR #243, runtime commit c640987 (same runtime as 4414cc7). They demonstrate the stance, not a complete contact analysis.
- `probe.json`: a fresh diagnostic on main's runtime using the production `CharacterFactory`, `GameView.directorFor` and delivered clips. Plate position/yaw come from the actual bridge output; all 30 kids load as models. Three stance samples per kid; 90/90 have negative head-forward dot toward the pitcher (range about −0.973 to −0.352). The file records source digest and capture time.
- The head bone's local +Z is a facing proxy, not eye tracking. Hand distances are in scaled world feet and refer to bones, not skin or finger surfaces. No grip threshold or full-animation approval follows from them.
- This sweep does **not** inspect every frame, transition, camera, handedness variation, or contact event. Run the expanded review matrix to close that coverage; do not generalize a clean diagnostic to all animation quality.

Reproduce with `npm run audit:batting`; add `-- --check` to return nonzero for a sampled head facing away. The present failure is expected and retained, not waived. The broader per-character/action evidence slots and review procedure are in [art acceptance](../../art-acceptance.md).

## Fix order

1. Correct the shared plate orientation and verify it against all delivered stances in the actual game.
2. Solve the grip, arm/wrist poses and bat/ball contact together; re-export affected authored takes through the existing pipeline and review the whole swing, including blends and recovery.
3. Audit the other action families and transitions with the same explicit evidence and findings process. Fix shared causes once, then verify every affected character; repair character-specific exceptions individually.

A controlled diagnostic experiment changed only the batter root yaw from PI to 0: all 90 facing samples became positive (about 0.340 to 0.972), and `--check` returned zero instead of one. The runtime was restored afterward; this isolates the orientation cause without claiming a corrected grip, stance or contact. The defect is documented, not fixed by this audit change. The environment proposal remains separate and carries no character-motion approval.
