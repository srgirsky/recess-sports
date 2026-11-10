// ---------------------------------------------------------------------------
// The LOOK: how stylised the render is. Render-side only.
//
// ★ `real` IS THE DEFAULT, AND IT IS A MAINTAINER DIRECTION, NOT A TUNING.
// 2026-11-09: "I want it to look as real as possible more than anything."
// The toy-brand look (`toon`) quantised every surface to four flat bands and
// drew a heavy ink contour round each kid, which is what reads as "a cartoon"
// before any model is judged. `real` keeps the same models, lights and
// palette and changes only how light falls across them:
//
//   · a SMOOTH wrapped falloff instead of four bands (`materials/toon.ts`),
//     so a head reads as a lit volume;
//   · a soft specular lobe from the key light, so cloth, skin and plastic
//     catch the sun instead of sitting matte;
//   · the ink contour thinned to a hairline (`materials/outline.ts`) — it
//     still separates a kid from the grass at 40px, it no longer draws him;
//   · grain in the dirt and softer-edged shadows (`Field.ts`, `Lighting.ts`).
//
// `?look=toon` is the old look, kept the way `?tonemap=` is kept: no gate can
// see this decision, so the alternative stays one flag away for an A/B.
//
// Pure of `three`, and safe under Node (the tests import materials).
// ---------------------------------------------------------------------------

export type Look = 'real' | 'toon';

function readLook(): Look {
  if (typeof location === 'undefined') return 'real';
  return new URLSearchParams(location.search).get('look') === 'toon' ? 'toon' : 'real';
}

export const LOOK: Look = readLook();
export const REAL = LOOK === 'real';
