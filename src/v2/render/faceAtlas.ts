// ---------------------------------------------------------------------------
// ★ THE FACE ATLAS — expression, as a UV offset. PURE (no three), like
// `cameraCues.ts`, so the cell maths is testable with no GPU and no pixels.
//
// The asset contract's §4 is unusually firm about this: "Expressions are
// texture-atlas swaps. ZERO morph targets — the validator rejects any model
// that has them." The reasons are cost and the single-skeleton bargain. Morph
// targets are per-character authored data, which is exactly the kind of
// per-character animation cost the whole one-rig-one-clip-library contract
// exists to avoid; and 12 expressions x 30 kids of blendshapes is a download
// and a GPU cost on a device budget that already spends its margin on the
// inverted-hull outline.
//
// A swap is one `vec4` uniform. It is also instant, which matters more than it
// sounds: v1's reactions were POSE textures swapped on a timer, so a face could
// only change when the whole body did. Here a batter can widen their eyes at a
// pitch without leaving `bat_stance`.
//
// ★ THE PROXY HAS NO FACE, AND THAT IS DELIBERATE. `ProxyCharacter` carries a
// facing CUE — eyes, brows, nose, and pointedly no mouth — because a
// featureless head is rotationally ambiguous at 40px and the animation review
// page could not otherwise catch a clip authored backwards. Expression lives
// here, on the delivered models, and `setExpression` is a no-op on a proxy.
// Anything that reads a proxy's face as an expression is reading a compass.
// ---------------------------------------------------------------------------

import type { Expression } from '../../data/types';

/** The atlas is a 4x4 grid, so every cell is a quarter of the texture. */
export const FACE_GRID = 4;
export const FACE_CELL_SIZE = 1 / FACE_GRID;

/**
 * ★ The cell order, verbatim from `docs/v2/asset-contract.md` §4.
 *
 * `faceAtlas.test.ts` parses that table and fails if these disagree — the same
 * source-is-code / doc-is-a-mirror discipline `clips.test.ts` applies to the
 * clip library. The artist reads the markdown; the engine reads this array; a
 * change to one without the other is a red build rather than a wrong face.
 *
 * The four `spare` cells are real, addressable and deliberately unnamed: a 4x4
 * grid has 16 slots and 12 expressions, and leaving the remainder undefined
 * would mean the first new expression breaks the atlas layout for all 30
 * delivered models at once.
 */
export const FACE_CELLS = [
  'neutral',
  'grin',
  'determined',
  'worried',
  'upset',
  'surprised',
  'blink',
  'wink',
  'sleepy',
  'angry',
  'tongue',
  'cheer',
  'spare1',
  'spare2',
  'spare3',
  'spare4',
] as const;

export type FaceCell = (typeof FACE_CELLS)[number];

/** UV transform for a cell: `[offsetU, offsetV, scaleU, scaleV]`. */
export type FaceCellUv = readonly [number, number, number, number];

/**
 * ★ READING ORDER FROM THE TOP-LEFT, and the V flip is the whole subtlety.
 *
 * The contract says "4x4 grid, cells in this order" to a human looking at a
 * 512px image, so cell 0 is the top-left one and the order runs left-to-right,
 * top-to-bottom — how you would read a contact sheet. UV space runs the other
 * way: v = 0 is the BOTTOM of the texture. So the row index has to be flipped,
 * and that flip is the single most likely thing to be wrong here, because
 * getting it backwards is not a crash — it is a roster of kids wearing the
 * wrong expression, which reads as "the artist drew them oddly".
 */
export function faceCellUv(cell: FaceCell | number): FaceCellUv {
  const i = typeof cell === 'number' ? cell : FACE_CELLS.indexOf(cell);
  if (i < 0 || i >= FACE_CELLS.length || !Number.isInteger(i)) {
    throw new Error(`faceAtlas: no cell ${String(cell)} — the atlas has exactly ${FACE_CELLS.length} cells`);
  }
  const col = i % FACE_GRID;
  const row = Math.floor(i / FACE_GRID);
  return [col * FACE_CELL_SIZE, 1 - (row + 1) * FACE_CELL_SIZE, FACE_CELL_SIZE, FACE_CELL_SIZE];
}

/**
 * v1's authored `Expression` values -> atlas cells.
 *
 * The two vocabularies were written years apart for different renderers, and
 * this is where they meet. Every kid in `src/data/characters.ts` already
 * carries a v1 expression, so mapping rather than re-authoring means 30
 * characters have a resting face the day the first model lands.
 *
 * Three choices worth stating, since none is a synonym:
 *   `happy`  -> neutral   the atlas's resting cell IS a friendly face; a
 *                         permanent grin reads as a mask over a whole game.
 *   `cool`   -> neutral   deadpan is the point of `cool`, and the atlas has no
 *                         cell for it. Distinctness comes from the model.
 *   `goofy`  -> tongue    the tongue cell exists for exactly this kid.
 */
const FROM_V1: Readonly<Record<Expression, FaceCell>> = {
  happy: 'neutral',
  cool: 'neutral',
  grin: 'grin',
  determined: 'determined',
  goofy: 'tongue',
  surprised: 'surprised',
  upset: 'upset',
  nervous: 'worried',
  celebrate: 'cheer',
};

/** A character's resting face. `undefined` means `happy`, per `VisualParams`. */
export function restingCell(expression?: Expression): FaceCell {
  return FROM_V1[expression ?? 'happy'];
}

/**
 * Cells the ENGINE drives, rather than the content: they exist to be triggered
 * by gameplay, so nothing in `characters.ts` maps to them.
 *
 * Listed rather than merely commented because `blink` is the one that will be
 * missed — it is what makes a still character look alive between pitches, and
 * it is free here (a uniform write on a timer) where in v1 it would have been
 * a whole extra pose texture per kid.
 */
export const ENGINE_CELLS: readonly FaceCell[] = ['blink', 'wink', 'sleepy', 'angry'];
