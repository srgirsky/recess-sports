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
    sclera: '#f4e9d5',
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
    eyeHalfW: 12,
    eyeHalfH: 5.9,
    irisR: 5.3,
    irisInward: 2,
    eyeX: [34, 94],
    eyeY: 52,
    // Thick and even, tapering less: his brows are the boldest mark on a face
    // with no hair to frame it.
    browThick: 4.2,
    browThin: 2.9,
    browHalf: 14.5,
    browX: [35, 93],
    browY: 30,
    browTilt: 2,
    mouthY: 104,
  },
};
