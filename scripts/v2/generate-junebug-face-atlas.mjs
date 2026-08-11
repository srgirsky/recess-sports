// Junebug's character-specific 4x4 expression atlas. The cell order is owned
// by faceAtlas.ts; this generator owns only her graphic construction.

import { resolve } from 'node:path';
import sharp from 'sharp';

const output = resolve('assets/v2/source/junebug-face-atlas.png');
const cells = [
  'neutral', 'grin', 'determined', 'worried',
  'upset', 'surprised', 'blink', 'wink',
  'sleepy', 'angry', 'tongue', 'cheer',
  'spare1', 'spare2', 'spare3', 'spare4',
];

const ink = '#26130d';
// Sampled off junebug-turnaround.png's front head, not inferred: the sclera
// reads #d1b294 in lid shadow and lifts toward cream in the light, so the flat
// fill sits between the two; the iris body is #33190d and its centre bottoms
// out at #110c07.
// ★ LIFTED #ddc9ac -> #ecdfc6, and the reason is the board's key light, not
// the art. The round-3 verdict measured the eyes as "not a pair": 188 sclera
// pixels left against 753 right. The atlas is EXACTLY symmetric (76/76 cream
// pixels per cell, counted), and so is the face patch — what differs is that
// the board lights her from camera-right, so the left cheek renders 103 mean
// luminance against the right's 120. At #ddc9ac (luminance 201) the shaded
// side's sclera lands just UNDER any threshold the lit side clears, so a
// symmetric drawing counts 4:1. The concept survives the same lighting because
// its sclera is brighter: its own front view counts 477/421, a 1.13 ratio,
// while carrying an even more lopsided catchlight (147/30). A 10% lift puts
// both of Junebug's sides clear of the same threshold.
const sclera = '#ecdfc6';
const irisBrown = '#33190d';
const pupil = '#120c07';
const white = '#fff7e4';
const mouth = '#57201c';
const mouthDark = '#3a1512';
const tongue = '#df6c78';

// Eye geometry. Scale is fixed by the one ratio that survives the trip from a
// concept render to a shipped GLB — iris diameter over iris SPACING, read off
// both images with the same dark-pixel detector: the concept measures 30/98.5
// = 0.305, and a build tuned by cell-width arithmetic instead measured 0.221,
// i.e. eyes 38% too small. Eye box is then 1.567x the iris (concept 47/30),
// the iris fills the box's HEIGHT, and each iris rides toward the nose so the
// cream survives as an outer crescent — which is what the concept does, and
// what separates a pair of eyes from a pair of holes.
// ★ ROUND-3 RE-MEASUREMENT, ON THE DELIVERED BOARD RATHER THAN ON ARITHMETIC.
// Both front views were run through one connected-component detector at
// luminance < 95, then divided by each figure's own head width (concept 251px
// on an 882px figure, delivered 172px on a 578px figure):
//   eye mark   concept 52px wide = 0.207 of head width; delivered 29px = 0.169
//   brow bar   concept 62px wide = 0.247;                delivered 30px = 0.174
// The eye is 18% narrow and the brow 30% SHORT, and that is most of why the
// round-3 40px strip read "a mottled brown lump with four or five competing
// dark marks" where the concept reads as a bright face with two clean dark
// dots: the concept's brow and eye are bold enough to fuse into ONE mark per
// side at field scale, and these were not. Heights already match (concept
// 40px eye / 33px brow = 0.188 / 0.155 ft; delivered 26 / 21 = 0.186 / 0.151),
// so only the horizontal grows.
// ⚠️ AND THE CELL HAS A NO-PAINT MARGIN NOW. The sculpt's face patch dives its
// outer CELL under the skull to kill the island seam (see `face_patch`'s
// `proud` block), so anything drawn inside cell x < 7 or > 121 is painted on
// buried geometry and simply disappears. Every mark below stays clear of it:
// eyes 8..48, brows 8..52.
const EYE_HALF_W = 20;
const EYE_HALF_H = 11.5;
const IRIS_R = 11.5;
// The concept's flat front view carries a ~7.75px nasal offset, but the atlas
// lands on a rounded face patch that turns both eyes toward the centre line
// again, and the two convergences stack into a cross-eyed read. Most of the
// determination is carried by the brows regardless, so the offset is kept as a
// hint rather than reproduced literally.
const IRIS_INWARD = 2;
// A quadratic's extremum sits at (P0 + 2*P1 + P2)/4, so a half-height of h
// needs its control point 2h off the corner line.
const almond = (x, y) =>
  `M${x - EYE_HALF_W} ${y} Q${x} ${y - EYE_HALF_H * 2} ${x + EYE_HALF_W} ${y} Q${x} ${y + EYE_HALF_H * 2} ${x - EYE_HALF_W} ${y}Z`;

function eye(x, y, uid, { closed = false, wink = false, inward = 0 } = {}) {
  if (closed || wink) return `<path d="M${x - 17} ${y} Q${x} ${y + 9} ${x + 17} ${y}" fill="none" stroke="${ink}" stroke-width="6" stroke-linecap="round"/>`;
  const id = `iris${uid}`;
  const cx = x + inward;
  // The iris is clipped to the almond so a converged pupil can ride toward the
  // nose without bulging past the lid, which is what reads as walleyed.
  return `<clipPath id="${id}"><path d="${almond(x, y)}"/></clipPath>
    <path d="${almond(x, y)}" fill="${sclera}"/>
    <g clip-path="url(#${id})">
      <circle cx="${cx}" cy="${y + 1}" r="${IRIS_R}" fill="${irisBrown}"/>
      <circle cx="${cx}" cy="${y + 1}" r="6.2" fill="${pupil}"/>
      <circle cx="${cx - 3.6}" cy="${y - 4.5}" r="2.8" fill="${white}"/>
    </g>
    <path d="M${x - EYE_HALF_W} ${y} Q${x} ${y - EYE_HALF_H * 2} ${x + EYE_HALF_W} ${y}" fill="none" stroke="${ink}" stroke-width="5.5" stroke-linecap="round"/>`;
}

function brow(x, y, tilt, inner) {
  // The turnaround's brows are the boldest mark on the face: THICK angular
  // bars, low over the eyes, tapering from the nose outward. The old 5.2px
  // half-thickness measured barely half the concept's bar. `inner` is +1 when
  // the nose side is the +x end.
  const thick = 8.0;
  const thin = 3.8;
  const left = inner > 0 ? thin : thick;
  const right = inner > 0 ? thick : thin;
  // 22, was 17. The bar's rendered length measured 0.215ft against the
  // concept's 0.291 (see EYE_HALF_W's block); at this latitude one cell is
  // 0.00432ft along the face, so the missing 0.076ft is 8.8 cells across the
  // pair — half 17 -> 22 and the delivered bar lands at 0.278ft.
  const half = 22; // spans 8..52 about the centres below
  // ★ THE ENDS ARE ROUNDED, AND THEY ROUND INWARD. Round 3 scored the brows
  // "flat black parallelograms with hard corners sitting on the surface" — the
  // bar was closed by two vertical L segments, so each end was a squared-off
  // cut where the concept's own brow (junebug-turnaround.png's front head)
  // tapers to a soft point at the outer end and a rolled one at the nose. The
  // caps are quadratics whose control point sits INSIDE `half` rather than
  // outside it, so the bar's measured length is unchanged and nothing moves
  // toward the cell's no-paint margin — see EYE_HALF_W's block for why that
  // margin now has to hold: the sculpt paints this atlas on the SKULL, whose
  // UV is clamped at the island edge, so ink near cell x 0 would be dragged
  // around the whole back of the head.
  const capL = left * 0.45;
  const capR = right * 0.45;
  return `<path d="M${x - half} ${y - tilt - left} Q${x} ${y - 10} ${x + half} ${y + tilt - right}
    Q${x + half - capR} ${y + tilt} ${x + half} ${y + tilt + right}
    Q${x} ${y + 1.5} ${x - half} ${y - tilt + left}
    Q${x - half + capL} ${y - tilt} ${x - half} ${y - tilt - left}Z" fill="${ink}"/>`;
}

function face(name, index) {
  const blink = name === 'blink';
  const wink = name === 'wink';
  const sleepy = name === 'sleepy';
  const determined = name === 'determined' || name === 'angry';
  const worried = name === 'worried' || name === 'upset';
  // ★ THESE COORDINATES ARE BOUND TO THE SKULL, and the skull moved.
  //
  // The atlas lands on the sculpt's face patch, whose row `vf` maps to a
  // latitude `sin(-1.10 + vf*1.54)` on the head ellipsoid — so a cell y is a
  // model z only once the head's centre and radii are fixed. v11 rebuilt the
  // head against the turnaround (centre z 3.32, rz 0.635, from 3.40/0.615),
  // which slid every feature down the face. Re-solved rather than re-guessed:
  // concept brow centre y246 -> z 3.331 -> cell y 35; eye centre y286 ->
  // z 3.143 -> cell y 60; mouth y343 -> z 2.874 -> cell y 101.
  //
  // Horizontally the widened skull barely moves them: the concept's eye
  // centres measure ±0.240ft off the midline, which on the new face patch is
  // cell x 28 and 100 (was 30/98). They sit far APART with their outer edges
  // near the face's sides, which is what keeps them visible from the profile —
  // the v6 failure was 26px of separation, not this.
  // Junebug's NEUTRAL is the determined scowl: the brows always angle down
  // toward the nose; 'determined' only deepens what is already there.
  const eyes =
    eye(28, 60, index * 2, { closed: blink || sleepy, inward: IRIS_INWARD }) +
    eye(100, 60, index * 2 + 1, { closed: blink || sleepy, wink, inward: -IRIS_INWARD });
  // Brows ride 25px above the eye centres: the concept holds 23px of skin
  // between brow and eye against a 30px eye box, and closing that gap lets the
  // toon ramp merge brow into lash. Their bar runs from |x| 0.345ft at the
  // outer end to 0.135ft at the inner one, which is a half-length of 17 cells
  // about a centre at 29 — the old 19 reached past the concept's inner tip and
  // ran the two brows toward each other over the nose.
  // Centres 30/98, was 29/99: with the longer bar this puts the brow's
  // geometric centre at model x 0.235ft against the concept's measured 0.242,
  // and holds its outer tip at cell 8 — clear of the buried outer cell.
  const brows =
    brow(30, 35, determined ? 7 : worried ? -5 : 4, 1) +
    brow(98, 35, determined ? -7 : worried ? 5 : -4, -1);
  // No drawn nose: the sculpt carries a real nose form, and a mark on top of
  // it doubled the feature and read as a sticker.

  // The neutral mouth is the turnaround's firm line. It moved UP with the
  // skull (y 110 -> 102): the concept's mouth measures z 2.870, which on the
  // v11 face patch is cell y 102, and a mouth left at 110 would have migrated
  // onto the chin push. It also WIDENED to x 46..82 — the concept's mouth mark
  // measures 0.198ft across and the old 50..78 shipped 0.14ft, which is what
  // makes rubric 3.14 hard at draft-card distance. The control point rides
  // ABOVE the corners so the line turns down at the ends. Still no
  // under-stroke: the v6 one shaded the chin and read as a beard patch.
  // ★ A CLOSED MOUTH IS STILL TWO LIPS. v11 drew the neutral and determined
  // mouths as one round-capped stroke, and the board scored exactly that: "a
  // solid black rounded-rectangle bar of uniform thickness with flat ends, no
  // lips, no corners, no curve" — rubric 3.14's "stroke that collapses to a
  // line". A stroke cannot taper, so the seam is now a FILLED path: corners
  // that come to a point, a cupid's bow dipping at the centre of the upper
  // edge, and its greatest thickness a third of the way in from each corner.
  //
  // The width is measured, not chosen. The concept's mouth mark runs 39px on a
  // 233px head; at the mouth's latitude this face patch's 128 cells cover
  // 0.537ft, so 39px = 0.184ft = 44 cells — x 42..86 about the centre line.
  // The concept's own seam is barely 3 cells thick and would vanish at draft
  // scale, so the seam here is 4.4 at its fullest: enough to survive the card,
  // shaped enough not to read as a dash.
  // ★ AND IT IS TWICE AS THICK, BECAUSE 3 CELLS IS 3 PIXELS. The v13 seam ran
  // from `y - bow` to `y + 1.9` — 3.1 cells at its fullest — and round 3 scored
  // it exactly: "the mouth collapses to a ~2px stroke with no lip volume even
  // at 6x, failing 3.14 outright". 3.14 is not asking for a wider mouth; the
  // width is measured and correct (the concept's mark runs 39px on a 233px
  // head = 44 cells, and this spans 41..87). It is asking for the mark to
  // survive a downscale, and a 3-cell mark on a face that occupies ~150px of
  // the front board is 3.5px before the toon ramp and under 1px on the draft
  // card. 6.0 cells at the fullest holds ~2px at card distance and still
  // tapers to points at the corners, which is what stops it reading as a dash.
  const seam = (y, bow, drop) => `<path d="M41 ${y + drop} Q50 ${y - 2.0} 57 ${y - bow}
    Q64 ${y - bow + 2.0} 71 ${y - bow} Q78 ${y - 2.0} 87 ${y + drop}
    Q78 ${y + 6.0} 71 ${y + 4.8} Q64 ${y + 6.6} 57 ${y + 4.8} Q50 ${y + 6.0} 41 ${y + drop}Z" fill="${ink}"/>`;
  // The lower lip is a form, not a mark: a warm shape lighter than the skin
  // under the seam, which is what the concept's own render shows once the dark
  // line is discounted. No under-STROKE — the v6 one shaded the chin and read
  // as a beard patch.
  // ★ #e5a069, was #d28a55. MEASURED against the skin it sits on: the sculpt
  // authors SKIN as #C9814A and the old lip at #d28a55 was 9 luminance units
  // above it, which the board's own key light swamps — the round-3 verdict
  // found "no lip volume" for the same reason it found no mouth. The concept's
  // lit lower lip samples (226,163,116) against a chin of (196,138,98), a
  // 27-unit lift; #e5a069 is 26 above SKIN. It also starts BELOW the thicker
  // seam rather than under the old thin one.
  const lowerLip = (y) => `<path d="M46 ${y + 4.6} Q64 ${y + 6.2} 82 ${y + 4.6}
    Q73 ${y + 11.2} 64 ${y + 11.4} Q55 ${y + 11.2} 46 ${y + 4.6}Z" fill="#e5a069"/>`;
  let lips = lowerLip(102.5) + seam(102.5, 1.2, 1.0);
  // An open smile is a MOUTH, not a crescent sticker: inner cavity, a band of
  // upper teeth, a tongue resting low, and a catch-light lower lip.
  if (name === 'grin' || name === 'cheer') lips = `<path d="M45 92 Q64 97 83 92 Q76 108 64 108 Q52 108 45 92Z" fill="${mouthDark}" stroke="${ink}" stroke-width="2.4"/>
    <path d="M47.5 93.5 Q64 98 80.5 93.5 Q75 100.1 64 100.4 Q53 100.1 47.5 93.5Z" fill="${white}"/>
    <path d="M55.5 106 Q64 109 72.5 106 Q69.5 102 64 102 Q58.5 102 55.5 106Z" fill="${tongue}"/>`;
  // Determined: the same two lips, pressed and turned DOWN at the corners.
  if (name === 'determined' || name === 'angry') lips = lowerLip(104.5) + seam(103.5, 5.0, 2.6);
  if (name === 'worried' || name === 'upset') lips = `<path d="M49 105 Q64 94.5 79 105 Q64 100.3 49 105Z" fill="${mouth}"/>`;
  if (name === 'surprised') lips = `<ellipse cx="64" cy="98" rx="11.5" ry="12.5" fill="${mouth}"/>
    <ellipse cx="64" cy="98" rx="8.2" ry="9.4" fill="${mouthDark}" stroke="${ink}" stroke-width="1.8"/>
    <path d="M56.8 93.6 Q64 91.2 71.2 93.6 Q69.6 96.9 64 97.1 Q58.4 96.9 56.8 93.6Z" fill="${white}"/>`;
  if (name === 'tongue') lips = `<path d="M45 92 Q64 97 83 92 Q76 107 64 107 Q52 107 45 92Z" fill="${mouthDark}" stroke="${ink}" stroke-width="2.4"/>
    <path d="M47.5 93.5 Q64 98 80.5 93.5 Q75 99.5 64 99.8 Q53 99.5 47.5 93.5Z" fill="${white}"/>
    <path d="M56 101.5 Q55.5 110.5 64 111.5 Q72.5 110.5 72 101.5 Q64 104.5 56 101.5Z" fill="${tongue}" stroke="${ink}" stroke-width="1.8"/>`;
  if (blink || sleepy || wink) lips = lowerLip(103) + seam(103, 1.6, 0.8);

  return `${brows}${eyes}${lips}`;
}

const contents = cells.map((name, index) => {
  const x = (index % 4) * 128;
  const y = Math.floor(index / 4) * 128;
  return `<g transform="translate(${x} ${y})">${face(name, index)}</g>`;
}).join('');

const svg = `<svg width="512" height="512" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg">${contents}</svg>`;
// Indexed PNG: the atlas is flat-colour line art, and the palette encoding
// roughly halves its share of the 400KB GLB budget.
await sharp(Buffer.from(svg)).png({ compressionLevel: 9, palette: true }).toFile(output);
console.log(`wrote ${output}`);
