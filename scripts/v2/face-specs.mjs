// ---------------------------------------------------------------------------
// Where each character's features sit inside their face-atlas cell, and what
// colour they are.
//
// ★ THESE COORDINATES ARE NOT PORTABLE BETWEEN CHARACTERS, and that is the one
// thing to understand before adding an entry. A cell is 128 units square and it
// maps onto the head through that character's OWN atlas island window
// (`HeadSpec.island` in their sculpt script), so cell y 60 lands at a different
// latitude on every head. Junebug's brow, eye and mouth sit at 35 / 60 / 102.5;
// Tank's measured latitudes land at 30 / 52 / 104 through his window. Copying
// one kid's numbers to another draws a correct face in the wrong place.
//
// The procedure, which is the same one that produced both entries here:
//   1. find the feature's z on the turnaround with a dark-pixel scan;
//   2. convert to a latitude on that character's skull;
//   3. push it through their island window to a cell coordinate.
// `npm run measure:turnaround -- <id>` does step 1.
//
// ★ AND THE CELL HAS A NO-PAINT MARGIN. The sculpt dives the island's outer
// cell under the skull to kill the seam, so anything drawn at cell x < 7 or
// > 121 is painted on buried geometry and simply disappears. Keep every mark
// clear of it — Junebug's eyes run 8..48 and her brows 8..52.
// ---------------------------------------------------------------------------

export const FACE_SPECS = {
  // Junebug. Every value here was measured, scored on a board and re-measured
  // across seven rounds; the reasoning lives beside the code that uses it in
  // `generate-face-atlas.mjs`. Changing one of these changes an approved
  // character and needs its own board.
  nostrike: {
    ink: '#0b0603',
    mouthInk: '#5a2c21',
    sclera: '#f6ecd8',
    irisBrown: '#33190d',
    pupil: '#120c07',
    white: '#fff7e4',
    mouth: '#57201c',
    mouthDark: '#3a1512',
    tongue: '#df6c78',
    lowerLip: '#e5a069',
    eyeHalfW: 20,
    eyeHalfH: 11.5,
    irisR: 10.0,
    irisInward: 5,
    eyeX: [28, 100],
    eyeY: 60,
    browThick: 6.0,
    browThin: 3.0,
    browHalf: 22,
    browX: [30, 98],
    browY: 35,
    browTilt: 8,
    mouthY: 102.5,
  },

  // Tank. `expression: 'sleepy'`, `eyeSize: 0.8`, `nose: 'dot'`, `mouthW: 0.85`
  // in the roster, and the turnaround draws all three: heavy level brows, eyes
  // half-lidded under them, and a small closed mouth low on a round face.
  //
  // Feature latitudes measured with a dark-pixel scan over his front figure —
  // brow z 3.60, eye z 3.40, mouth z 3.00 — then pushed through his island
  // window (0.92, -1.388, 2.147) to cells 30, 52 and 104.
  //
  // His brows are LEVEL, not angled: Junebug's neutral is a scowl and her tilt
  // of 8 is her one memorable read, while Tank's memorable read is calm. A tilt
  // of 2 keeps the shape from reading as a printed bar without borrowing her
  // expression — the anti-caricature note in his production packet is explicit
  // that "sleepy" must not become "dim".
  tank: {
    ink: '#120a05',
    mouthInk: '#5c3126',
    // ★ BRIGHTER THAN THE BOARD NEEDS, BECAUSE THE GAME IS DARKER THAN THE
    // BOARD. An independent review measured the runtime scene at roughly half
    // the board's luminance (skin median 83 against 166) and found the eye
    // crushing to "a solid dark slot with no iris and no catchlight" in the
    // hero still while reading correctly on the board. The sclera has to carry
    // that difference, because it is the only light value inside the eye.
    sclera: '#fffaf0',
    irisBrown: '#3a2214',
    pupil: '#150d08',
    white: '#fff4e0',
    mouth: '#5a2620',
    mouthDark: '#3c1a15',
    tongue: '#dd6f79',
    lowerLip: '#e2a473',
    // Smaller eyes than Junebug's, and shorter: `eyeSize: 0.8` and a half-lid.
    // ★ SIZED AGAINST THE MEASUREMENT, NOT THE CELL. The first pass drew them
    // at 17 x 9.0 and the board's visible-face reading fell from 48.8% per side
    // to 35.0% against a concept that runs 48.3 and 40.8 — the marks were
    // covering three times as much skin as his own art does. His eyes are
    // half-lidded (`expression: 'sleepy'`) and small (`eyeSize: 0.8`), so they
    // are a shallow almond rather than Junebug's round alert one.
    // ★ ROUND 6: THE EYES AND BROWS WERE INVERTED, AND IT IS MEASURED. Counting
    // dark mass per row inside matched head boxes, the concept's EYES dominate
    // (63px on a 212px head = 29.7% of head width) over lighter brows (38px =
    // 17.9%). Round 5 delivered eyes at 14.4% and brows at 28.8% — an eyes:brows
    // ratio of 0.50 against the concept's 1.66, a 3.3x inversion. That is why
    // his NEUTRAL read as a scowl instead of the heavy-lidded calm the
    // turnaround draws, and why the anti-caricature note ("sleepy must not
    // become dim") was being violated from the wrong direction.
    //
    // The trade is deliberately near-neutral in total ink so `faceSkin` stays
    // inside its band: the eyes roughly double and the brows come down by about
    // as much.
    // ⚠️ WIDE AND SHORT, which is what "heavy-lidded" MEANS and what lets both
    // numbers be satisfied at once. The first attempt at the width also grew the
    // height and dropped `faceSkin` to 33.1/33.8 against a band of [42.3, 46.8]
    // — the concept holds eyes 29.7% of head width AND 48.3/40.8 visible face,
    // which is only consistent if the eye is a wide slit rather than a tall
    // almond. His upper lid covers the top third of the iris on the turnaround.
    // ★ ROUND 13: THE APERTURE MEASURED 8.2% OF HEAD HEIGHT against the
    // concept's 12.8% — a third too small, so the face read as a squint under a
    // large blank forehead. The concept holds BOTH a bigger eye and MORE
    // visible skin (48.3/40.8) than this delivery, which is only possible if
    // the ink is in the wrong place: the brows were taking the skin the eyes
    // should have. They come down as the eyes go up.
    // ★ ROUND 10: THE SHAPE WAS RIGHT AND THE FILL WAS WRONG. Two independent
    // reviews scored this face as "flat almond decals with no sclera/iris
    // separation" reading "permanently angry", against a brief that says calm.
    //
    // Measured against the concept's own head — both scaled by head width, so
    // the comparison is dimensionless — the BANDS were already right: brow band
    // 9px against 9, brow-to-eye gap 19 against 19.6, eye band 12 against 10.5.
    // Nothing about the layout needed moving, which is why five rounds of
    // moving it did not help.
    //
    // What differs is inside the eye. The concept fills most of its aperture
    // with a large dark iris and leaves white only at the corners; this shipped
    // a 5.5 iris in a 42-wide opening — a small dot in a field of sclera, which
    // at any distance reads as a stare. A wider iris in a narrower eye is both
    // closer to the drawing and what "heavy-lidded" means: the lid crops the
    // top of a big iris rather than a small one floating in white.
    // Eye width also comes back to the concept's measured 29.7% of head width.
    eyeHalfW: 18.5,
    eyeHalfH: 4.6,
    irisR: 7.0,
    irisInward: 3,
    eyeX: [34, 94],
    eyeY: 52,
    // Thick and even, tapering less: his brows are the boldest mark on a face
    // with no hair to frame it.
    // Thinner and longer, and LEVEL. The concept draws a thin gently-arched
    // brow well clear of the eye; this shipped a short thick wedge with a
    // positive tilt, and positive tilt is the inner end DROPPING — Junebug's
    // scowl, which is her memorable read and the opposite of his. Two reviews
    // independently called the result angry. The taper carries the shape now,
    // not the angle, so it still does not read as a printed bar.
    browThick: 2.1,
    browThin: 1.3,
    browHalf: 12.5,
    browX: [35, 93],
    browY: 30,
    browTilt: 0,
    // Thin through the middle, arch kept. See `brow()` in generate-face-atlas:
    // at the default 10/1.5 the bar measures 7.45 cells through its centre,
    // ~6.8% of head width against the concept's ~4.5%, which is what two
    // reviews read as a wedge. 8 / -2.0 lands it near 4.7 and leaves the curve.
    browArch: 8,
    browBase: -2.0,
    mouthY: 104,
    // See generate-face-atlas.mjs: distinct silhouettes for grin/cheer/tongue.
    tongueOut: true,
  },
};
