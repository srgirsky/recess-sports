// ---------------------------------------------------------------------------
// ★ ONE RULER FOR COLOUR, BECAUSE TWO IS HOW THIS PROJECT LOSES ROUNDS.
//
// `turnaround.mjs`'s own header already makes this argument about geometry: a
// sculptor and a gate that measure the same drawing two ways produce
// disagreements that are really two rulers. Colour needs the same rule, and it
// did not have it — every constant below was defined inside `measure-fidelity`
// and reachable by nothing else, so anything that wanted to ask "is this pixel
// the same material as that one" had to invent its own answer.
//
// These are not arbitrary numbers. Each was paid for by a defect that shipped
// green, and the reasoning is kept verbatim beside it rather than summarised.
// Read them before adding a sixth constant.
// ---------------------------------------------------------------------------

export const lum = (c) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
export const sat = (c) => {
  const mx = Math.max(c[0], c[1], c[2]);
  const mn = Math.min(c[0], c[1], c[2]);
  return mx ? (mx - mn) / mx : 0;
};

// Warm, saturated and light: the skin of every character in this roster reads
// r > g > b with real saturation, which separates it from both hair and cream.
export const isSkin = (c) => c[0] > c[1] + 12 && c[1] >= c[2] && sat(c) > 0.22 && lum(c) > 80;

/**
 * ★ SHADING CHANGES VALUE, NOT HUE — so membership is decided in CHROMATICITY.
 *
 * `bandSplit` classified a pixel by raw RGB distance to the two centroids, and
 * an independent review caught what that lets through. Tank's delivered shoe
 * reported its second tone at 18.5% against the concept's 26.2% and PASSED,
 * while the pixels being counted as navy were `rgb(75,65,54)` and
 * `rgb(73,63,48)` — r > g > b, warm cream in shadow, with no blue in them at
 * all. Counting only genuinely cool pixels put the delivered band at 1.14%
 * against the concept's 17.30%: a 15x shortfall the metric reported as green.
 *
 * The arithmetic shows why it is not a tolerance problem. That shadowed cream
 * sits 86 units from the navy centroid and 190 from the cream one, because
 * DARKENING a cream moves it toward every dark colour at once. No threshold on
 * a distance that is dominated by brightness can separate "this is navy" from
 * "this is cream with the light off it".
 *
 * Normalising out brightness settles it outright: in chromaticity the same
 * pixel is 0.018 from cream and 0.32 from navy. A small value term stays in the
 * mix so that black and white — which have no chromaticity to speak of and land
 * near every centroid — still abstain rather than being assigned at random.
 */
export const CHROMA_WEIGHT = 260;
// ⚠️ AND THE VALUE TERM HAS TO STAY SMALL, OR IT DECIDES.
//
// At 0.25 this term outvoted hue at the dark end and the shoe's tone split was
// being met partly by shadow: the outsole's rgb(57,52,44) sits 29 from the navy
// centroid and 39.5 from the cream one, because darkening a cream moves it 157
// luminance units from cream and only 6 from navy. In chromaticity that pixel
// is unambiguous — warm, r > g > b — and at 0.06 it lands 11.4 from cream
// against 29 from navy, which is the right answer.
//
// A luminance FLOOR was tried first and is the wrong tool: the concept's own
// navy is #353c42 at luminance 59, so any floor high enough to exclude the
// shadow also excludes the tone it is meant to find.
export const VALUE_WEIGHT = 0.06;
export const chromaticity = (c) => {
  const sum = c[0] + c[1] + c[2];
  return sum > 0 ? [c[0] / sum, c[1] / sum, c[2] / sum] : [1 / 3, 1 / 3, 1 / 3];
};
export const toneDistance = (a, b) => {
  const ca = chromaticity(a), cb = chromaticity(b);
  const hue = Math.hypot(ca[0] - cb[0], ca[1] - cb[1], ca[2] - cb[2]);
  return Math.hypot(CHROMA_WEIGHT * hue, VALUE_WEIGHT * (lum(a) - lum(b)));
};
// ⚠️ RESCALED WITH VALUE_WEIGHT. Dropping the value term from 0.25 to 0.06
// shrinks every distance in this space by roughly 1.8x, and the old 45 then sat
// ABOVE cream-to-navy (24.5) — so navy stopped being selected as a second tone
// at all and the concept read 99.4% one colour. Cream to its own shadow is 11.4
// in the same space, so 18 still separates a real second garment tone from one
// tone's shading, which is what this constant is for.
export const TONE_SEPARATION = 18;
// Past this, a pixel belongs to neither declared tone — a sock, a shadow, skin.
// The old rule-based classifier abstained the same way by simply matching neither.
export const TONE_MEMBERSHIP = 30;
