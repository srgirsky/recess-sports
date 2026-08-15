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
    // ⚠️ THE RUNTIME SCLERA IS NOT A SCULPT PROBLEM, AND THREE ROUNDS OF
    // TREATING IT AS ONE ESTABLISHED THAT.
    //
    // An independent review found the eye crushing to a solid dark almond in
    // gameplay while reading correctly on the board, and it is real: measured,
    // the brightest NEUTRAL pixel anywhere near the runtime eye is rgb(50,25,7)
    // at warmth 43, where the board reaches rgb(214,212,210) at warmth 4. A
    // darkened white would still be neutral; warmth 43 is skin. The sclera texel
    // is not reaching the pixel.
    //
    // What was tried and did NOT move it: brightening the swatch (the atlas
    // replaces ALBEDO, so a white that is never sampled stays never sampled),
    // shrinking the iris so it stops overflowing the aperture, and widening the
    // aperture so there is more white to find. The last of those also pushed
    // `visible face left` to 35.0 against a concept of 48.3 — outside tolerance
    // on a metric that had been green — so it is reverted here.
    //
    // What IS established, and what has been ELIMINATED — recorded so the next
    // person does not repeat the search:
    //
    //   - the atlas holds the sclera at rgb(255,250,240) ALPHA 255. Not dim,
    //     not semi-transparent. Opaque white.
    //   - the texture EMBEDDED IN THE SHIPPED GLB is identical to the source
    //     PNG at that texel, so nothing is lost in export.
    //   - the Blender board material renders it: rgb(214,212,210) at warmth 4.
    //   - the runtime does not. Sampled tightly on the eye and the mouth, the
    //     MAXIMUM luminance is 80-100 at warmth 103-116 — that is skin. A
    //     darkened white would still be neutral, and under this light rig a
    //     white texel should reach roughly rgb(166,148,94).
    //   - it is not only the sclera: the `grin` cell's white TEETH are missing
    //     from the runtime too, while the brows and lash lines render. Broad
    //     dark marks survive; small light ones do not.
    //   - RULED OUT: mipmap filtering. Forcing LinearFilter and
    //     generateMipmaps=false on the atlas changed the rendered pixels not at
    //     all — byte-identical offline, and pixel-identical again in a live A/B
    //     on the GPU texture in the browser.
    //
    // ★ A LIVE SESSION ON `/v2/?anims=1&kid=tank` NARROWED IT FURTHER, and the
    // remaining suspect is the LIGHT RIG rather than anything in this file:
    //
    //   - the atlas IS applied. Swapping the texture for solid magenta turns the
    //     whole head magenta, so the island, the uniform and the mix all work.
    //   - the island covers the WHOLE SKULL, not a face patch.
    //   - cell selection is correct. Painting a green bar into the left half of
    //     the active cell puts it on the left half of the head. (Note the
    //     resting cell is `determined` — PNG row 0, column 2 — because the
    //     shader flips v; probing the `grin` cell while the page rests on
    //     `determined` compares the wrong texels.)
    //   - saturated colours render as themselves: magenta reads magenta, green
    //     reads green.
    //   - but an opaque pure-WHITE block painted over the eye renders
    //     indistinguishably from skin. It erases the eye ink and leaves no
    //     bright patch.
    //
    // White specifically converging on skin, while magenta and green do not,
    // looked like a warm key light plus a filmic shoulder compressing the top of
    // the value range.
    //
    // ⚠️ THAT WAS TESTED AND IT IS ALSO NOT THE CAUSE. `Renderer.ts` uses
    // ACESFilmicToneMapping at exposure 1.05, which is a photographic HDR curve
    // on a toon ramp that never exceeds 1.0 — a reasonable suspect. Swapping it
    // for NoToneMapping moved the warmth of the brightest pixel near the eye
    // from 103-116 down to 83-93 and left the luminance where it was: still
    // skin, still no white. The experiment is reverted, because it changes the
    // look of the whole game and it did not fix the defect.
    //
    // So the cause is still open. What is left unexamined is narrow: the toon
    // ramp itself (`gradientMap`, 4 steps) and whether a near-white albedo can
    // reach the top step at all under this key/fill balance. That is a
    // lighting/material pass in the v2 render layer, roster-wide rather than
    // Tank's, and it cannot be fixed from a face spec.
    eyeHalfW: 18.5,
    eyeHalfH: 4.6,
    irisR: 7.0,
    irisInward: 3,
    eyeX: [34, 94],
    // ★ ROUND 31: +2 CELLS EACH, because the window is solved against the cell
    // rows the generator DRAWS, not the anchors it is given. `brow()` and
    // `eye()` centre their marks about 2 cells above their anchor, so a window
    // fitted to browY/eyeY put both features ~1.7% of head height high once the
    // mouth was corrected. Measured on the board: brow 34.9% and eye 54.9%
    // against the turnaround's 36.7% and 56.5%, at ~0.85% of head per cell.
    eyeY: 54,
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
    browY: 32,
    browTilt: 0,
    // Thin through the middle, arch kept. See `brow()` in generate-face-atlas:
    // at the default 10/1.5 the bar measures 7.45 cells through its centre,
    // ~6.8% of head width against the concept's ~4.5%, which is what two
    // reviews read as a wedge. 8 / -2.0 lands it near 4.7 and leaves the curve.
    browArch: 8,
    browBase: -2.0,
    // ★ ROUND 31: 104 PUT HIS MOUTH ON HIS CHIN. The island window that maps
    // this cell onto the skull was solved against a measured "mouth z 3.00",
    // and z 3.00 is 97.3% of the way down his head — the detector that produced
    // it had found the shadow UNDER the jaw, not the lip line. Re-measured
    // (turnaround rows 278-281 of a head spanning 137-319) his mouth is at
    // 78.3% of head height, and through the corrected window that is cell 77.
    // The 27-cell move is the whole of why the face read as sliding off the
    // chin: brow and eye were within a point of right the entire time.
    mouthY: 77,
    // See generate-face-atlas.mjs: distinct silhouettes for grin/cheer/tongue.
    tongueOut: true,
  },

  // Grizz. `hair: afro`, grumpy, powerful, napping. His face is small features
  // in a huge field: bead eyes 19px wide each against a 195px face opening
  // (9.7%, against Tank's 14.9%), brows 40px each (20.5% — the boldest mark on
  // the face), a frown line at cell 82 through the island window solved in
  // sculpt-grizz-source.py. The spec's mouth landmark REFUSES on his sheet
  // (nose shadow and frown within 7 luminance counts), so the lip row is the
  // bounded trace in the sculpt script's FACE_ISLAND note: z 2.684, 86.5% of
  // the afro-inclusive head.
  grizz: {
    ink: '#0a0503',
    mouthInk: '#4a2015',
    sclera: '#fff8ec',
    irisBrown: '#2a1710',
    pupil: '#100a06',
    white: '#fff4e0',
    mouth: '#57241c',
    mouthDark: '#39160f',
    tongue: '#dd6f79',
    lowerLip: '#b97e50',
    // Small heavy-lidded beads — sleepy, not squinting. Sized against the
    // measurement, Tank's lesson: one eye is 9.7% of his face width where
    // Tank's is 14.9% of his head, so the marks scale by that ratio.
    eyeHalfW: 12,
    eyeHalfH: 6,
    irisR: 5.5,
    irisInward: 2,
    eyeX: [46, 82],
    eyeY: 52,
    // The brows are the read: thick, dark, low over the eyes, inner ends
    // dropped a touch — grumpy without Junebug's full scowl.
    browThick: 5.5,
    browThin: 3.5,
    browHalf: 14,
    browX: [44, 84],
    browY: 30,
    browTilt: 4,
    mouthY: 79,
    // The pout: corners fall 4.5 cells — the concept's neutral is a clear
    // downturned frown (rows 353-358 of the sheet diverge downward from the
    // lip line's ends), and the review scored the straight line as losing it.
    mouthBow: 0.6,
    mouthDrop: 4.5,
  },

  // Sprout. Big round wonder eyes — the largest on the roster relative to his
  // face — under thin gentle brows, and a wide easy smile. Feature rows traced
  // on his sheet: brow band rows 247-259 (41.4% of head), eye band rows
  // 282-316 (61%), smile centre rows 358-359 (85.6% — the spec's mouth
  // landmark is his NOSTRILS; his light-brown smile is fainter than the
  // specks, so the lip row is the bounded trace in his sculpt script).
  // Cells solved through his island (0.92, -1.45, 2.20).
  sprout: {
    ink: '#140a04',
    mouthInk: '#7a4526',
    sclera: '#fffdf2',
    irisBrown: '#3a2313',
    pupil: '#150d08',
    white: '#fff8e8',
    mouth: '#6b3420',
    mouthDark: '#4a2114',
    tongue: '#e07980',
    lowerLip: '#f0a468',
    // Huge and round: one eye is ~18% of his face width and nearly as tall.
    eyeHalfW: 19,
    eyeHalfH: 13,
    irisR: 11,
    irisInward: 3,
    eyeX: [26, 102],
    eyeY: 47,
    browThick: 4.5,
    browThin: 2.2,
    browHalf: 13,
    browX: [30, 98],
    browY: 20,
    browTilt: 0,
    mouthY: 81,
    // A smile: the corners RISE 3.6 cells above the centre (negative drop),
    // with the centre easing down — the inverse of Grizz's pout.
    mouthBow: -1.2,
    mouthDrop: -3.6,
    // Roster visual.freckles — three per cheek, in skin shading, absent at 40px.
    freckles: true,
    freckleTone: '#a55f28',
  },

  // Bubbles. "Here for a good time" — enormous warm amber eyes with high
  // catchlights, thin gold brows, a broad easy smile, and the roster's densest
  // freckles. Feature rows traced on her sheet: thin brows ~46% of head, the
  // big eyes centred 56% (rows 281-305), the laugh line ~86% (the spec's
  // mouth REFUSES: her laugh merges with the hair curtains — bounded trace in
  // the sculpt script). Cells through her island (0.92, -1.45, 2.55).
  bubbles: {
    ink: '#1a0e04',
    mouthInk: '#8a4530',
    sclera: '#fffdf4',
    irisBrown: '#8a5a1e',
    pupil: '#241505',
    white: '#fff8ea',
    mouth: '#7a3423',
    mouthDark: '#552114',
    tongue: '#e57f86',
    lowerLip: '#f0a06a',
    eyeHalfW: 20,
    eyeHalfH: 14,
    irisR: 12,
    irisInward: 3,
    eyeX: [30, 98],
    eyeY: 48,
    browThick: 3.2,
    browThin: 1.8,
    browHalf: 12,
    browX: [32, 96],
    browY: 28,
    browTilt: 0,
    mouthY: 92,
    // A broad smile: corners rise well above the centre.
    mouthBow: -1.4,
    mouthDrop: -4.2,
    freckles: true,
    freckleTone: '#b46a30',
  },

  // Chip. "Little bat, quick feet" — big round eager eyes under the cap brim,
  // soft brows, a bright open grin, freckles. Feature rows on his sheet:
  // brows rows 300-311 (60% of head), eyes rows 312-336 (67.6%), smile rows
  // 362-371 (89.5% — the fixed mouthIn detector's own landmark, verified by
  // hand). Cells through his island (0.92, -1.35, 2.20).
  chip: {
    ink: '#160b03',
    mouthInk: '#7a4023',
    sclera: '#fffcf0',
    irisBrown: '#4a2a10',
    pupil: '#170d05',
    white: '#fff6e4',
    mouth: '#6e2f1c',
    mouthDark: '#4c1d10',
    tongue: '#e07980',
    lowerLip: '#efa065',
    eyeHalfW: 19,
    eyeHalfH: 13,
    irisR: 11,
    irisInward: 3,
    eyeX: [28, 100],
    eyeY: 40,
    browThick: 4.0,
    browThin: 2.0,
    browHalf: 13,
    browX: [30, 98],
    browY: 24,
    browTilt: 0,
    mouthY: 89,
    // A grin: corners rise clearly above the centre.
    mouthBow: -1.4,
    mouthDrop: -4.0,
    freckles: true,
    freckleTone: '#aa5f28',
  },
};
