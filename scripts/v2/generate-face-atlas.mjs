// ---------------------------------------------------------------------------
// ★ ONE FACE-ATLAS GENERATOR FOR THE ROSTER.
//
// Junebug's atlas had its own 308-line script, and every number in it was won
// the same way her sculpt was: measured off the turnaround, scored on a board,
// re-measured. Almost none of that work is about HER. The cell order belongs to
// `faceAtlas.ts`; the brow-must-reach-black finding, the mouth-must-not-follow-
// it-down finding, the iris-to-spacing ratio, the no-paint margin at the cell
// edge and the "a closed mouth is still two lips" finding are all facts about
// drawing a legible face at 40px, and they are true of every kid on the roster.
//
// So the drawing is shared and a `FaceSpec` carries what differs: the palette,
// where the features sit in the cell, and how big they are. Tank's spec exists
// because his own head put his brow, eye and mouth at cell y 30, 52 and 104
// where Junebug's sit at 35, 60 and 102.5 — see his sculpt script's island
// window note for why those are not the same face in a different place.
//
// ⚠️ THE CELL COORDINATES ARE BOUND TO THE SKULL. A feature drawn at cell y 60
// lands wherever that row of the face island lands on the head, so moving a
// character's `island` window in their `HeadSpec` moves every mark on their
// face. The two are solved together, per character, and neither is portable.
//
//   npm run generate:face-atlas -- tank
// ---------------------------------------------------------------------------

import { resolve } from 'node:path';
import sharp from 'sharp';

import { CHARACTERS, slugFor } from './character-registry.mjs';
import { FACE_SPECS } from './face-specs.mjs';

const id = process.argv[2] ?? 'nostrike';
if (!CHARACTERS[id]) throw new Error(`unknown character "${id}"`);
const spec = FACE_SPECS[id];
if (!spec) {
  throw new Error(
    `no face spec for "${id}" — add one to scripts/v2/face-specs.mjs. ` +
    'It cannot be defaulted: the cell coordinates are bound to that head\'s atlas island window.',
  );
}
const output = resolve(`assets/v2/source/${slugFor(id)}-face-atlas.png`);
const cells = [
  'neutral', 'grin', 'determined', 'worried',
  'upset', 'surprised', 'blink', 'wink',
  'sleepy', 'angry', 'tongue', 'cheer',
  'spare1', 'spare2', 'spare3', 'spare4',
];

// ★ THE BROWS AND LASHES ARE NEAR-BLACK NOW, AND THAT IS A MEASUREMENT.
// Junebug's one memorable read is her scowl, and rubric 3.9 asks whether it
// survives a 40px downscale. Run one dark-pixel detector over both front views:
// the concept's brow bottoms out at luminance 0.0 and 1.2, the round-4 build at
// 26.2 and 39.1. A mark that never reaches black loses contrast to the skin it
// sits on the moment the sprite is resampled, which is why the delivered 40px
// face read BLANK while the concept's reads angry. #26130d decodes to linear
// 0.0117; the board's own key delivers ~0.63 of authored luminance, so the
// darkest a brow could ever render was 24-30. #0b0603 decodes to 0.0024, which
// lands the delivered mark at 5-9 — inside the concept's own range.
//
// ⚠️ THE MOUTH IS NOT ALLOWED TO FOLLOW IT DOWN. Measured the same way, the
// concept's mouth seam bottoms at 53 while the round-4 build's bottomed at 23 —
// her mouth is a soft warm crease, NOT a black slot, and painting it with the
// brow's ink is what made the 40px strip read "a fat dark rectangle" competing
// with the eyes. `mouthInk` is a separate, warm swatch for that reason.
const ink = spec.ink ?? '#0b0603';
const mouthInk = spec.mouthInk ?? '#5a2c21';
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
// ★ AND AGAIN, #ecdfc6 -> #f6ecd8, because the round-4 board measured the
// sclera as AREA rather than as brightness and the area had collapsed. Counting
// pixels over luminance 175 inside each eye box, normalised by head area: the
// concept carries 371 and 194 (left/right), the round-4 build 17 and 80 — an
// order of magnitude less white in the eye. Half of that is the iris and the
// lash (see IRIS_R and the lid stroke below) and half is that the shaded side
// of the face renders the cream just under any threshold the lit side clears.
const sclera = spec.sclera ?? '#f6ecd8';
const irisBrown = spec.irisBrown ?? '#33190d';
const pupil = spec.pupil ?? '#120c07';
const white = spec.white ?? '#fff7e4';
const mouth = spec.mouth ?? '#57201c';
const mouthDark = spec.mouthDark ?? '#3a1512';
const tongue = spec.tongue ?? '#df6c78';

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
// ★ THE IRIS SHRANK AND MOVED, AND THE EYE BOX DID NOT. At IRIS_R 11.5 the iris
// was exactly as tall as the aperture (EYE_HALF_H 11.5), so it touched both lids
// and the only cream left anywhere was two corner slivers. The concept does the
// opposite: its iris measures 30px in a 47x40 eye, i.e. 75% of the aperture's
// height, and the cream survives as a large field on the OUTER side plus a ring
// above and below. 10.0 restores that ring; IRIS_INWARD 2 -> 5 restores the
// field, at the cost of the inner crescent the concept also does not draw.
const EYE_HALF_W = spec.eyeHalfW;
const EYE_HALF_H = spec.eyeHalfH;
const IRIS_R = spec.irisR;
// The concept's flat front view carries a ~7.75px nasal offset, but the atlas
// lands on a rounded face patch that turns both eyes toward the centre line
// again, and the two convergences stack into a cross-eyed read. Most of the
// determination is carried by the brows regardless, so the offset is kept as a
// hint rather than reproduced literally.
const IRIS_INWARD = spec.irisInward;
// A quadratic's extremum sits at (P0 + 2*P1 + P2)/4, so a half-height of h
// needs its control point 2h off the corner line.
const almond = (x, y) =>
  `M${x - EYE_HALF_W} ${y} Q${x} ${y - EYE_HALF_H * 2} ${x + EYE_HALF_W} ${y} Q${x} ${y + EYE_HALF_H * 2} ${x - EYE_HALF_W} ${y}Z`;

function eye(x, y, uid, { closed = false, wink = false, heavy = false, inward = 0 } = {}) {
  if (closed || wink) return `<path d="M${x - 17} ${y} Q${x} ${y + 9} ${x + 17} ${y}" fill="none" stroke="${ink}" stroke-width="4.5" stroke-linecap="round"/>`;
  if (heavy) {
    // ★ SLEEPY IS NOT A BLINK. The first cut ORed `sleepy` into `closed`, so a
    // kid whose REST face is sleepy (Tank, `performance.ts`) played whole
    // games with his eyes drawn shut — and every per-spec iris/sclera number
    // was dead code on that path. Heavy-lidded keeps the lower half of the
    // open eye (sclera, iris, pupil all visible) under a flat lid line: asleep
    // reads shut, sleepy reads half-open.
    const id = `iris${uid}`;
    const cx = x + inward;
    const lidY = y - EYE_HALF_H * 0.2;
    return `<clipPath id="${id}"><path d="${almond(x, y)}"/></clipPath>
      <clipPath id="${id}l"><rect x="${x - EYE_HALF_W}" y="${lidY}" width="${EYE_HALF_W * 2}" height="${EYE_HALF_H * 2 + 8}"/></clipPath>
      <g clip-path="url(#${id}l)">
        <path d="${almond(x, y)}" fill="${sclera}"/>
        <g clip-path="url(#${id})">
          <circle cx="${cx}" cy="${y + 2}" r="${IRIS_R}" fill="${irisBrown}"/>
          <circle cx="${cx}" cy="${y + 2}" r="5.4" fill="${pupil}"/>
        </g>
      </g>
      <path d="M${x - EYE_HALF_W + 1} ${lidY} L${x + EYE_HALF_W - 1} ${lidY}" fill="none" stroke="${ink}" stroke-width="4" stroke-linecap="round"/>`;
  }
  const id = `iris${uid}`;
  const cx = x + inward;
  // The iris is clipped to the almond so a converged pupil can ride toward the
  // nose without bulging past the lid, which is what reads as walleyed.
  return `<clipPath id="${id}"><path d="${almond(x, y)}"/></clipPath>
    <path d="${almond(x, y)}" fill="${sclera}"/>
    <g clip-path="url(#${id})">
      <circle cx="${cx}" cy="${y + 1}" r="${IRIS_R}" fill="${irisBrown}"/>
      <circle cx="${cx}" cy="${y + 1}" r="5.4" fill="${pupil}"/>
      <circle cx="${cx - 3.2}" cy="${y - 4.0}" r="2.5" fill="${white}"/>
    </g>
    <path d="M${x - EYE_HALF_W} ${y} Q${x} ${y - EYE_HALF_H * 2} ${x + EYE_HALF_W} ${y}" fill="none" stroke="${ink}" stroke-width="3.6" stroke-linecap="round"/>`;
}

function brow(x, y, tilt, inner) {
  // The turnaround's brows are the boldest mark on the face: THICK angular
  // bars, low over the eyes, tapering from the nose outward. The old 5.2px
  // half-thickness measured barely half the concept's bar. `inner` is +1 when
  // the nose side is the +x end.
  // ★ THINNER, AND THAT IS MEASURED PERPENDICULAR. Both front views, one
  // dark-pixel detector, each brow's vertical extent divided by its own head
  // width: the concept reads 9.3% and 9.4% at a 23-degree tilt, so its TRUE
  // thickness is 9.3 * cos(23) = 8.6%; the round-4 build read 13.9% and 13.6%
  // at 6 degrees, i.e. 13.8% true — 60% too fat. Halving the half-thicknesses
  // to 6.0/3.0 lands the delivered bar at ~9.9% true, and the taper (thick at
  // the nose, thin at the temple) is the concept's own.
  const thick = spec.browThick;
  const thin = spec.browThin;
  const left = inner > 0 ? thin : thick;
  const right = inner > 0 ? thick : thin;
  // 22, was 17. The bar's rendered length measured 0.215ft against the
  // concept's 0.291 (see EYE_HALF_W's block); at this latitude one cell is
  // 0.00432ft along the face, so the missing 0.076ft is 8.8 cells across the
  // pair — half 17 -> 22 and the delivered bar lands at 0.278ft.
  const half = spec.browHalf;
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
  // ★ THE ARCH AND THE UNDERSIDE ARE PER CHARACTER, because they set how THICK
  // the bar is at its centre and not just how curved.
  //
  // A quadratic's midpoint is (P0 + 2·P1 + P2)/4, so with the arch control at
  // -10 and the underside at +1.5 the bar measures 7.45 cells through the
  // middle — about 6.8% of head width against a concept brow of ~4.5%. Two
  // independent reviews called Tank's "heavy angular wedges" against a drawing
  // of "thin tapered arcs", and that arithmetic is why: the ENDS were already
  // thin (2.1 and 1.3) and the centre was doing all the weight.
  //
  // Raising the underside thins the bar without flattening the arch, which
  // keeps the curve the concept draws. Junebug's 10/1.5 are the defaults and
  // she is untouched — her brows are her memorable read and she is approved.
  const arch = spec.browArch ?? 10;
  const base = spec.browBase ?? 1.5;
  return `<path d="M${x - half} ${y - tilt - left} Q${x} ${y - arch} ${x + half} ${y + tilt - right}
    Q${x + half - capR} ${y + tilt} ${x + half} ${y + tilt + right}
    Q${x} ${y + base} ${x - half} ${y - tilt + left}
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
  const [eyeL, eyeR] = spec.eyeX;
  const eyes =
    eye(eyeL, spec.eyeY, index * 2, { closed: blink, heavy: sleepy, inward: IRIS_INWARD }) +
    eye(eyeR, spec.eyeY, index * 2 + 1, { closed: blink, heavy: sleepy, wink, inward: -IRIS_INWARD });
  // Brows ride 25px above the eye centres: the concept holds 23px of skin
  // between brow and eye against a 30px eye box, and closing that gap lets the
  // toon ramp merge brow into lash. Their bar runs from |x| 0.345ft at the
  // outer end to 0.135ft at the inner one, which is a half-length of 17 cells
  // about a centre at 29 — the old 19 reached past the concept's inner tip and
  // ran the two brows toward each other over the nose.
  // Centres 30/98, was 29/99: with the longer bar this puts the brow's
  // geometric centre at model x 0.235ft against the concept's measured 0.242,
  // and holds its outer tip at cell 8 — clear of the buried outer cell.
  // ★ THE TILT IS THE SCOWL, AND IT WAS AT A THIRD OF THE CONCEPT'S ANGLE.
  //
  // The bar's top edge falls by `2*tilt + thin - thick` cells across its 44-cell
  // length, so tilt 4 with the old 3.8/8.0 half-thicknesses gave 3.8 cells =
  // 4.9 degrees AUTHORED. Measured on the boards, the face patch's own
  // curvature amplifies that by 1.30 (tan 6.4 deg delivered / tan 4.9 deg
  // authored) — and 6.4 degrees is what the round-4 critic scored, against the
  // concept's 22.7 and 23.0 measured by the same line fit. Solving the same
  // arithmetic backwards for 21 degrees delivered: authored tan 0.295, i.e. a
  // 13.0-cell drop, i.e. tilt 8 with the new 3.0/6.0 pair. `determined` then
  // deepens what neutral already carries, as it always has.
  const [browL, browR] = spec.browX;
  const tilt = spec.browTilt;
  const brows =
    brow(browL, spec.browY, determined ? tilt + 3 : worried ? -(tilt - 2) : tilt, 1) +
    brow(browR, spec.browY, determined ? -(tilt + 3) : worried ? tilt - 2 : -tilt, -1);
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
  // ★ ROUND 4 OVERSHOT IT. v13's 3-cell seam was scored "collapses to a ~2px
  // stroke with no lip volume"; doubling it to 6.0 cells produced the opposite
  // failure and the numbers say so. Measured with one dark detector on both
  // front views, the mouth mark's WIDTH is right (36.1% of head width delivered
  // against the concept's 36.0%) and its DEPTH is not: the concept's seam is
  // ~1.0% of head width and the delivered one 3.0%, three times over, which is
  // the "fat dark rectangle" the 40px strip read and the "dark slot with no lip
  // form" the hero read. 4.2 cells at the fullest is ~2x the concept — enough to
  // survive the draft card, which is all 3.14 ever asked for — and the centre
  // control comes in from 2.0 to 1.0 because a 2-cell cupid's bow on a 4-cell
  // seam is not a bow, it is a lump.
  const seam = (y, bow, drop) => `<path d="M41 ${y + drop} Q50 ${y - 1.2} 57 ${y - bow}
    Q64 ${y - bow + 1.0} 71 ${y - bow} Q78 ${y - 1.2} 87 ${y + drop}
    Q78 ${y + 3.4} 71 ${y + 2.6} Q64 ${y + 3.8} 57 ${y + 2.6} Q50 ${y + 3.4} 41 ${y + drop}Z" fill="${mouthInk}"/>`;
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
  // Raised to start under the THINNER seam (was y+4.6, sized to the 6-cell one).
  const lowerLip = (y) => `<path d="M46 ${y + 2.8} Q64 ${y + 4.2} 82 ${y + 2.8}
    Q73 ${y + 9.6} 64 ${y + 9.8} Q55 ${y + 9.6} 46 ${y + 2.8}Z" fill="${spec.lowerLip}"/>`;
  const my = spec.mouthY;
  // `mouthDrop` lets a character's NEUTRAL be a frown: the corners fall that
  // many cells below the centre. Grizz is why it exists — "Grumpy" is his
  // first roster word and the first independent review scored his straight
  // neutral line as losing "half the grump". Defaults preserve every earlier
  // character's mouth exactly.
  let lips = lowerLip(my) + seam(my, spec.mouthBow ?? 1.2, spec.mouthDrop ?? 1.0);
  // An open smile is a MOUTH, not a crescent sticker: inner cavity, a band of
  // upper teeth, a tongue resting low, and a catch-light lower lip.
  // ★ `grin` AND `cheer` ARE NOT THE SAME MOUTH. They were, and three of the
  // four stills rubric 3.14 is scored from came back within 8% of each other.
  // A grin is a closed-jaw smile showing the upper teeth; a cheer is a wide
  // open shout with the jaw dropped and the tongue low. Different silhouettes,
  // not different shades.
  // ★ ROUND 10: THE THREE OPEN CELLS DIFFERED BY 8 UNITS OF A 128-UNIT CELL,
  // which is not a difference at draft-card size. An independent review found
  // "four cells carrying two mouth states", with cheer and tongue reading as
  // the same open cavity. They are now separated by SILHOUETTE, which is the
  // only property that survives minifying: grin is wide and flat and closed,
  // cheer is tall and round and open, tongue breaks the lip line entirely.
  if (name === 'grin') lips = spec.tongueOut
    ? `<path d="M41 91 Q64 99 87 91 Q81 103 64 103 Q47 103 41 91Z" fill="${mouthDark}" stroke="${ink}" stroke-width="2.4"/>
    <path d="M43.5 92.6 Q64 100 84.5 92.6 Q79 99.2 64 99.5 Q49 99.2 43.5 92.6Z" fill="${white}"/>`
    : `<path d="M45 92 Q64 97 83 92 Q76 108 64 108 Q52 108 45 92Z" fill="${mouthDark}" stroke="${ink}" stroke-width="2.4"/>
    <path d="M47.5 93.5 Q64 98 80.5 93.5 Q75 100.1 64 100.4 Q53 100.1 47.5 93.5Z" fill="${white}"/>
    <path d="M55.5 106 Q64 109 72.5 106 Q69.5 102 64 102 Q58.5 102 55.5 106Z" fill="${tongue}"/>`;
  if (name === 'cheer') lips = spec.tongueOut
    ? `<path d="M48 89 Q64 98 80 89 Q86 118 64 119 Q42 118 48 89Z" fill="${mouthDark}" stroke="${ink}" stroke-width="2.6"/>
    <path d="M50 90 Q64 99.5 78 90 Q73.5 100.5 64 101 Q54.5 100.5 50 90Z" fill="${white}"/>
    <path d="M56 108 Q64 112 72 108 Q69 103.5 64 103.5 Q59 103.5 56 108Z" fill="${tongue}"/>`
    : `<path d="M45 92 Q64 97 83 92 Q76 108 64 108 Q52 108 45 92Z" fill="${mouthDark}" stroke="${ink}" stroke-width="2.4"/>
    <path d="M47.5 93.5 Q64 98 80.5 93.5 Q75 100.1 64 100.4 Q53 100.1 47.5 93.5Z" fill="${white}"/>
    <path d="M55.5 106 Q64 109 72.5 106 Q69.5 102 64 102 Q58.5 102 55.5 106Z" fill="${tongue}"/>`;
  // Determined: the same two lips, pressed and turned DOWN at the corners.
  // ★ A PRESSED MOUTH IS STILL A MOUTH. `angry` was a lower lip plus a thin
  // seam, and rubric 3.14's own prohibition is "never a stroke that collapses to
  // a line" — which is exactly what an independent review measured it as at
  // draft-card distance, a faint dark smudge carrying no emotion. The other
  // three cells were separated by silhouette in the round before this one and
  // this one was left behind.
  //
  // A frown has the corners BELOW the centre, so the arc bows upward in the
  // middle, and it is drawn as a stroked path with a round cap so it keeps a
  // measurable thickness at every scale instead of thinning to nothing.
  if ((name === 'determined' || name === 'angry') && spec.tongueOut) {
    lips = lowerLip(my + 3.5) +
      `<path d="M47 ${my + 2} Q64 ${my - 6.5} 81 ${my + 2}" fill="none" stroke="${mouthInk}"
        stroke-width="4.4" stroke-linecap="round"/>`;
  } else if (name === 'determined' || name === 'angry') {
    lips = lowerLip(my + 2) + seam(my + 1, 3.5, 2.2);
  }
  if (name === 'worried' || name === 'upset') lips = `<path d="M49 105 Q64 94.5 79 105 Q64 100.3 49 105Z" fill="${mouth}"/>`;
  if (name === 'surprised') lips = `<ellipse cx="64" cy="98" rx="11.5" ry="12.5" fill="${mouth}"/>
    <ellipse cx="64" cy="98" rx="8.2" ry="9.4" fill="${mouthDark}" stroke="${ink}" stroke-width="1.8"/>
    <path d="M56.8 93.6 Q64 91.2 71.2 93.6 Q69.6 96.9 64 97.1 Q58.4 96.9 56.8 93.6Z" fill="${white}"/>`;
  if (name === 'tongue') lips = spec.tongueOut
    // ★ THE TONGUE MUST LEAVE THE MOUTH TO BE A DIFFERENT EXPRESSION.
    //
    // The original cell tucks it inside the lower lip, which at draft-card size
    // is the same dark blob as `grin` and `cheer`. Measured on the runtime
    // stills, the four captured expressions differed by 1-4 pixels of dark mass
    // — "all emotion carried by eyebrow angle alone", and rubric 3.14 asks the
    // MOUTH to carry it. A tongue that hangs BELOW the lip line changes the
    // silhouette of the mark, which is the only thing that survives minifying.
    //
    // ⚠️ Opt-in, because Junebug is APPROVED and her atlas is bound to her
    // board hash. Her tongue cell has the same weakness and should take this
    // the next time she is re-rendered for other reasons; changing it here
    // would invalidate an approval to fix a defect nobody has scored her on.
    // `tongueReach` stretches the hanging tongue about the lip line (y 99) —
    // a kid whose mouth mark is small (or whose mouthScale shrinks pixels)
    // needs more droop before the cell separates from `cheer` at card
    // distance. Default 1 = byte-identical.
    ? `<g transform="translate(64 99) scale(1 ${spec.tongueReach ?? 1}) translate(-64 -99)">
    <path d="M47 92 Q64 97 81 92 Q75 105 64 105 Q53 105 47 92Z" fill="${mouthDark}" stroke="${ink}" stroke-width="2.4"/>
    <path d="M49.5 93.5 Q64 98 78.5 93.5 Q73 99 64 99.3 Q55 99 49.5 93.5Z" fill="${white}"/>
    <path d="M55 99 Q52 120 64 124 Q76 120 73 99 Q64 104 55 99Z" fill="${tongue}" stroke="${ink}" stroke-width="2.0"/>
    <path d="M64 107 L64 119" stroke="${mouthDark}" stroke-width="1.6" fill="none" opacity="0.55"/></g>`
    : `<path d="M45 92 Q64 97 83 92 Q76 107 64 107 Q52 107 45 92Z" fill="${mouthDark}" stroke="${ink}" stroke-width="2.4"/>
    <path d="M47.5 93.5 Q64 98 80.5 93.5 Q75 99.5 64 99.8 Q53 99.5 47.5 93.5Z" fill="${white}"/>
    <path d="M56 101.5 Q55.5 110.5 64 111.5 Q72.5 110.5 72 101.5 Q64 104.5 56 101.5Z" fill="${tongue}" stroke="${ink}" stroke-width="1.8"/>`;
  if (blink || sleepy || wink) lips = lowerLip(my + 0.5) + seam(my + 0.5, 1.6, 0.8);

  // ★ FRECKLES ARE A ROSTER FEATURE, NOT DECORATION. Eight kids carry
  // `freckles: true` in their roster visual, and Sprout's first independent
  // review scored the face down for shipping without them. Three small dots
  // scatter on each cheek below the eye line, in a skin-shading tone rather
  // than ink — dark enough to survive the hero read, light enough to vanish
  // at 40px instead of reading as dirt. Absent unless the spec asks.
  let freckles = '';
  if (spec.freckles) {
    const tone = spec.freckleTone ?? '#a55f28';
    const [fL, fR] = spec.eyeX;
    const fy = spec.eyeY + (spec.eyeHalfH ?? 10) + 8;
    const dots = (cx, s) => [[-6, 2], [0, -1], [6, 3]]
      .map(([dx, dy]) => `<circle cx="${cx + s * dx}" cy="${fy + dy}" r="2.1" fill="${tone}" opacity="0.85"/>`) 
      .join('');
    freckles = dots(fL, 1) + dots(fR, -1);
  }
  // ★ `mouthScale` grows the whole mouth mark about its own centre. Zippy is
  // why: her registry identity is a "huge happy grin" and the shared cell
  // geometry read as a thin smile at draft-card distance. Default 1 keeps
  // every existing atlas byte-identical — Junebug's approval hash included.
  const mScale = spec.mouthScale ?? 1;
  const closed = name === 'neutral' || name === 'determined' || name === 'angry'
    || name === 'worried' || name === 'upset' || blink || sleepy || wink;
  // ★ `alignOpenMouth` lifts the open cells to the kid's own mouth line.
  // The open-mouth marks are drawn about cell-y ≈ 100 regardless of
  // `mouthY`, so a kid whose mouth sits high (Gizmo, mouthY 70) gets his
  // tongue and cheer painted onto the UNDER-CHIN latitudes of the face
  // island — geometry that faces the floor and renders invisible from any
  // gameplay camera, while the atlas PNG looks perfect. Opt-in: shifting
  // would change every existing kid's atlas bytes.
  let cy = closed ? my : 100;
  if (spec.alignOpenMouth && !closed) {
    const shift = my + 3 - 103;
    lips = `<g transform="translate(0 ${shift})">${lips}</g>`;
    cy = my + 3;
  }
  if (mScale !== 1) {
    lips = `<g transform="translate(64 ${cy}) scale(${mScale}) translate(-64 -${cy})">${lips}</g>`;
  }
  return `${brows}${eyes}${freckles}${lips}`;
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
