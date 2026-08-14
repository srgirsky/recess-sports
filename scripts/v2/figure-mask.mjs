// ---------------------------------------------------------------------------
// ★ BACKGROUND IS WHAT CONNECTS TO THE EDGE OF THE FRAME, not what merely
// resembles the backdrop.
//
// Both concept-art readers used to decide "is this pixel part of the figure?"
// per pixel, by colour distance from a backdrop sample. That is correct for
// every pixel outside the figure and wrong for a specific class inside it: a
// PALE FEATURE on a PALE BACKDROP.
//
// Tank found it. His sheet's backdrop is cream (#f3e4d2) and the highlights on
// his eyes are pale enough to land inside the tolerance, so single pixels at
// x 189 and x 232 classified as background. That splits the head's silhouette
// row into three runs — 114-188, 190-231, 233-308 — and the head detector,
// which follows the run containing the figure's centre column, faithfully
// returned the 42px bridge BETWEEN HIS EYES as the width of his head. Rows
// above and below measured 211px and 203px.
//
// ⚠️ THE SYMPTOM WAS NOT A CRASH OR AN OUTLIER. It was `measure:fidelity`
// reporting Tank's head as the narrowest run in its scan window, landing on the
// window's floor, and correctly refusing to report a boundary artifact — so the
// tool printed NOT MEASURED and looked as though it were being careful. That
// was then written up as "Tank has no neck pinch, which is a fact about the
// drawing". It is not a fact about the drawing. It is two pale pixels.
//
// A hole cannot be distinguished from the outside world by COLOUR, because it
// has the same colour as the outside world. It can be distinguished by
// CONNECTIVITY: the real background touches the border of the image and a
// highlight inside a head does not. So the mask is a flood fill inward from the
// frame edge, and anything the fill never reaches is figure — including every
// enclosed pale pixel, whatever its colour.
//
// This also retires a whole class of near-miss. A white sock against a cream
// backdrop, a cream shoe sole, the whites of an eye, a specular on a bald
// crown, a pale garment: all of them are inside the silhouette and all of them
// are now figure by construction rather than by tolerance.
// ---------------------------------------------------------------------------

/**
 * Build a figure mask by flooding the backdrop inward from the image border.
 *
 * @param at      (x, y) => [r, g, b] pixel accessor
 * @param bgAt    (x) => [r, g, b] per-column backdrop estimate
 * @param W, H    image dimensions
 * @param tolerance  per-channel distance that still counts as backdrop
 * @returns  (x, y) => boolean, true when the pixel belongs to the figure
 */
export function floodFigureMask(at, bgAt, W, H, tolerance = 16) {
  const isBackdropColour = (x, y) => {
    const c = at(x, y);
    const bg = bgAt(x);
    return (
      Math.abs(c[0] - bg[0]) < tolerance &&
      Math.abs(c[1] - bg[1]) < tolerance &&
      Math.abs(c[2] - bg[2]) < tolerance
    );
  };

  // `outside[i]` is true once the flood has reached that pixel. A scanline fill
  // rather than a per-pixel stack: these sheets run to ~1.8 million pixels and a
  // naive four-way push allocates one queue entry per pixel.
  const outside = new Uint8Array(W * H);
  const stack = [];
  const push = (x, y) => {
    if (x < 0 || y < 0 || x >= W || y >= H) return;
    const i = y * W + x;
    if (outside[i]) return;
    if (!isBackdropColour(x, y)) return;
    outside[i] = 1;
    stack.push(x, y);
  };

  for (let x = 0; x < W; x++) { push(x, 0); push(x, H - 1); }
  for (let y = 0; y < H; y++) { push(0, y); push(W - 1, y); }

  while (stack.length) {
    const y = stack.pop();
    const x = stack.pop();
    push(x - 1, y);
    push(x + 1, y);
    push(x, y - 1);
    push(x, y + 1);
  }

  return (x, y) => {
    if (x < 0 || y < 0 || x >= W || y >= H) return false;
    return outside[y * W + x] === 0;
  };
}
