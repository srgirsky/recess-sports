# Parks Dept #2 environment benchmark

Author observations; visual approval pending.

The pilot changes only Parks Dept #2. It corrects the grass and scenery's duplicate sRGB-to-linear conversion, reduces mowing contrast and ground-normal blotches, adds fence plank joints and rails in the existing wall draw, makes the upper-storey windows visible over the eight-foot fence, replaces the roof's rotated cube with an actual gable prism, fills out the tree/hedge layers, and gives clouds smooth cool-to-warm shading without the field's hard toon terminator. Other venues keep their existing treatment.

Compare the complete scene, not isolated props. Reference: the project's BB2026 corpus, steam/steam-02.jpg and steam/steam-07.jpg (ground, houses, fence, vegetation and sky); storyboard frame-074.jpg and frame-129.jpg locate ground-level and wide gameplay composition. These stills do not establish continuous-motion parity. No character or animation changes are included, and existing character polish remains open.

The review package includes before/after plate, field and deep views at 1280×720 and 844×390, day/night. The benchmark instrument captures the same seeded real at-bat through its outcome plus two seconds, with the HUD, in all four profiles. Simulation, camera rules, global lighting and tone mapping are unchanged.

Remaining acceptance: independent review against the pinned reference, maintainer visual verdict, and real-device performance. The existing 90-draw target is already exceeded in the baseline supplemental wide-camera view; the pass adds zero calls. Headless render counts are not a frame-rate measurement on a phone.

## Technical validation

- `npm test`: 114 files; 2,291 passed, 14 skips. The two bundle checks skipped while the build replaced `dist/`; both passed when rerun after the build. The remaining 12 are existing skips.
- `npm run build`: both game entry points built.
- CI exposed an existing synchronous simulation sweep that could starve Vitest's reporting connection. Its unchanged venue/seed cases now run separately with an event-loop yield; all assertions and timeout values are preserved.
- Release integration with the batting fix exposed the bundle gate's fresh-checkout blind spot: CI now builds before testing so the existing size checks run. Turf shader explanations live outside GLSL strings, and excess string indentation is removed, reducing shipped bytes without changing shader tokens or raising the budget.
- Scenery: two draws and 21,520 triangles, below the existing 25,000-triangle layer budget.
- All twelve supplemental views preserve their baseline draw count. Geometry adds 11,344 triangles per view; the highest captured total is 122,756, below the 180,000 scene triangle target.
- The initial scene's wide-camera count is 111 draws both before and after; the 90-draw goal is pre-existing open work. These counts use the same headless renderer and do not replace real-device timing.

## Selected plate views

| Profile | Before | After |
|---|---|---|
| Desktop, day | [Before](before-desktop-day.png) | [After](after-desktop-day.png) |
| Desktop, night | [Before](before-desktop-night.png) | [After](after-desktop-night.png) |
| Phone, day | [Before](before-phone-day.png) | [After](after-phone-day.png) |
| Phone, night | [Before](before-phone-night.png) | [After](after-phone-night.png) |

Full benchmark capture is generated locally by `npm run capture:art-benchmark`; the existing report and rubric remain the authority for evidence completeness and review state. The selected stills here are a comparison aid, not a substitute for the complete motion receipt. ART-001, ART-002 and ART-003 stay open pending visual review.
