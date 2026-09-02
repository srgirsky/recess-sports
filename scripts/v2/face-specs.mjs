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
    // The mouth-cell pass: grin/cheer/tongue were near-identical on the
    // pre-batch-4 atlases (two critics pixel-diffed it) - the batch-4 knobs
    // open cheer and break the tongue past the lip line.
    alignOpenMouth: true,
    tongueOut: true,
    tongueReach: 1.3,
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
    // The mouth-cell pass: grin/cheer/tongue were near-identical on the
    // pre-batch-4 atlases (two critics pixel-diffed it) - the batch-4 knobs
    // open cheer and break the tongue past the lip line.
    alignOpenMouth: true,
    tongueOut: true,
    tongueReach: 1.3,
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
    // The mouth-cell pass: grin/cheer/tongue were near-identical on the
    // pre-batch-4 atlases (two critics pixel-diffed it) - the batch-4 knobs
    // open cheer and break the tongue past the lip line.
    alignOpenMouth: true,
    tongueOut: true,
    tongueReach: 1.3,
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
    mouthScale: 1.15,
    // The mouth-cell pass: grin/cheer/tongue were near-identical on the
    // pre-batch-4 atlases (two critics pixel-diffed it) - the batch-4 knobs
    // open cheer and break the tongue past the lip line.
    alignOpenMouth: true,
    tongueOut: true,
    tongueReach: 1.3,
    mouthY: 89,
    // A grin: corners rise clearly above the centre.
    mouthBow: -1.4,
    mouthDrop: -4.0,
    freckles: true,
    freckleTone: '#aa5f28',
  },

  // Bendy Bao. Round wire glasses (GEOMETRY, in his sculpt — never drawn
  // here), thick level brows above them, calm eyes behind the lenses, and a
  // gentle knowing smile. Feature rows traced on his sheet: brow bands rows
  // 227-237 (50% of head), lens centres row 262 (62.3% — the spec REFUSES his
  // eye band, the frames merge with the sideburns), smile rows 302-304 (79%).
  // Cells through his island (0.92, -1.25, 2.00). The eye marks must sit
  // INSIDE the lens rings (radius 0.128ft about ±0.138ft), so they are
  // moderate and round rather than roster-huge.
  bend_it: {
    ink: '#120903',
    mouthInk: '#7a4023',
    sclera: '#fffcf0',
    irisBrown: '#3a2210',
    pupil: '#150d06',
    white: '#fff6e4',
    mouth: '#6e2f1c',
    mouthDark: '#4c1d10',
    tongue: '#e07980',
    lowerLip: '#efa065',
    eyeHalfW: 13,
    eyeHalfH: 9,
    irisR: 8,
    irisInward: 2,
    eyeX: [36, 92],
    eyeY: 50,
    // The thick brows are his boldest mark, level — calm, not cross.
    browThick: 5.0,
    browThin: 2.8,
    browHalf: 13,
    browX: [32, 96],
    browY: 26,
    browTilt: 0,
    // The mouth-cell pass: grin/cheer/tongue were near-identical on the
    // pre-batch-4 atlases (two critics pixel-diffed it) - the batch-4 knobs
    // open cheer and break the tongue past the lip line.
    alignOpenMouth: true,
    tongueOut: true,
    tongueReach: 1.3,
    mouthY: 81,
    // The knowing smile: a gentle rise, softer than Chip's grin.
    mouthBow: -1.0,
    mouthDrop: -3.0,
  },

  // Flash Gordon Jr. `expression: 'cool'` — bold dark brows over big confident
  // eyes and a smirk. Feature rows traced on his sheet (spec refuses brow/eye:
  // the fade merges them into one region; its "mouth" is his nostrils): brow
  // bands rows 277-291 (55% of head), eye band rows 302-330 centred 68.1%,
  // smirk rows 355-362 (87.4%). Cells through his island (0.92, -1.25, 2.00).
  flash: {
    ink: '#140a04',
    mouthInk: '#77401f',
    sclera: '#fffcf0',
    irisBrown: '#3f2410',
    pupil: '#150d06',
    white: '#fff6e4',
    mouth: '#6e2f1c',
    mouthDark: '#4c1d10',
    tongue: '#e07980',
    lowerLip: '#ef9d5e',
    // Big and confident — eye band is 28px of a 238px head.
    eyeHalfW: 19,
    eyeHalfH: 12.5,
    irisR: 11,
    irisInward: 3,
    eyeX: [30, 98],
    eyeY: 50,
    // The brows are the boldest mark on the face: thick, dark, gently cocked.
    browThick: 5.6,
    browThin: 2.8,
    browHalf: 15,
    browX: [32, 96],
    browY: 25,
    browTilt: 2,
    // The mouth-cell pass: grin/cheer/tongue were near-identical on the
    // pre-batch-4 atlases (two critics pixel-diffed it) - the batch-4 knobs
    // open cheer and break the tongue past the lip line.
    alignOpenMouth: true,
    tongueOut: true,
    tongueReach: 1.3,
    mouthY: 85,
    // The smirk: corners rise a touch — cool, not a grin.
    mouthBow: -1.0,
    mouthDrop: -2.5,
  },

  // Zippy. The roster's biggest grin — her NEUTRAL is drawn mid-laugh, so the
  // resting mouth is a wide high-cornered smile. Big shining eyes under a
  // straight fringe, gently arched brows. Feature rows traced on her sheet
  // (spec refuses her eye band — the fringe merges with it): brow bands rows
  // 268-283 (41.3% of head), eyes rows 294-320 centred 58.7%, open smile rows
  // 347-361 (85%). Cells through her island (0.92, -1.531, 2.438).
  zippy: {
    ink: '#150b04',
    mouthInk: '#8a4030',
    sclera: '#fffdf2',
    irisBrown: '#4a2c12',
    pupil: '#170d06',
    white: '#fff8ea',
    mouth: '#7a3423',
    mouthDark: '#552114',
    tongue: '#e57f86',
    lowerLip: '#f2a066',
    eyeHalfW: 19,
    eyeHalfH: 13,
    irisR: 11.5,
    irisInward: 3,
    eyeX: [28, 100],
    eyeY: 50,
    browThick: 4.6,
    browThin: 2.2,
    browHalf: 13,
    browX: [32, 96],
    browY: 24,
    browTilt: 0,
    // The mouth-cell pass: grin/cheer/tongue were near-identical on the
    // pre-batch-4 atlases (two critics pixel-diffed it) - the batch-4 knobs
    // open cheer and break the tongue past the lip line.
    alignOpenMouth: true,
    tongueOut: true,
    tongueReach: 1.3,
    mouthY: 87,
    // The laugh: corners rise well above the centre, widest on the roster,
    // and the whole mark is scaled up — her identity is the huge grin.
    mouthBow: -1.5,
    mouthDrop: -4.6,
    mouthScale: 1.3,
  },

  // Dazzle. Sweet confident big eyes under soft thick brows, and a small warm
  // closed smile — she blows kisses, she does not grin. Feature rows traced
  // on her sheet (spec refuses all three - the mane merges every band): brows
  // rows 264-271 (37% of head), eyes rows 289-318 centred 54.1%, smile rows
  // 344-349 (76.1%). Cells through her island (0.92, -1.367, 2.300).
  diva: {
    ink: '#170b04',
    mouthInk: '#8a4530',
    sclera: '#fffdf2',
    irisBrown: '#4a2a10',
    pupil: '#170d06',
    white: '#fff8ea',
    mouth: '#7a3423',
    mouthDark: '#552114',
    tongue: '#e57f86',
    lowerLip: '#f0a06a',
    eyeHalfW: 19,
    eyeHalfH: 13,
    irisR: 11.5,
    irisInward: 3,
    eyeX: [28, 100],
    eyeY: 50,
    browThick: 4.4,
    browThin: 2.2,
    browHalf: 13,
    browX: [32, 96],
    browY: 20,
    browTilt: 0,
    // The mouth-cell pass: grin/cheer/tongue were near-identical on the
    // pre-batch-4 atlases (two critics pixel-diffed it) - the batch-4 knobs
    // open cheer and break the tongue past the lip line.
    alignOpenMouth: true,
    tongueOut: true,
    tongueReach: 1.3,
    mouthY: 84,
    // A small warm smile, corners up gently.
    mouthBow: -1.0,
    mouthDrop: -2.6,
  },

  // Noodle. `expression: 'surprised'`, glasses, freckles, bald. Thin arched
  // brows riding high on the dome, calm wide eyes behind the biggest lenses
  // on the roster, a small pleased smile. Feature rows traced on his sheet:
  // brows rows 196-202 (36.4% of head), lens centres row 231.5 (51.9%),
  // smile rows 262-270 (69.4%). Cells through his island (0.92, -1.3696,
  // 2.000). Eye marks stay inside the 0.166ft lens rings.
  noodle: {
    ink: '#150c04',
    mouthInk: '#8a5030',
    sclera: '#fffdf4',
    irisBrown: '#4a2c12',
    pupil: '#170d06',
    white: '#fff8ea',
    mouth: '#7a3a26',
    mouthDark: '#552518',
    tongue: '#e57f86',
    lowerLip: '#f2b078',
    eyeHalfW: 14,
    eyeHalfH: 10,
    irisR: 9,
    irisInward: 2,
    eyeX: [36, 92],
    eyeY: 50,
    // Thin and gently arched, floating high — curious, not cross.
    browThick: 3.0,
    browThin: 1.6,
    browHalf: 12,
    browX: [34, 94],
    browY: 28,
    browTilt: -2,
    // The mouth-cell pass: grin/cheer/tongue were near-identical on the
    // pre-batch-4 atlases (two critics pixel-diffed it) - the batch-4 knobs
    // open cheer and break the tongue past the lip line.
    alignOpenMouth: true,
    tongueOut: true,
    tongueReach: 1.3,
    mouthY: 67,
    // A small pleased smile.
    mouthBow: -1.0,
    mouthDrop: -2.4,
    freckles: true,
    freckleTone: '#cf9058',
  },

  // Turbo. Bold level brows under the spiky fringe, the roster's biggest
  // irises (near-filling the aperture), a tiny button nose and a confident
  // dimple smile. Feature rows confirmed against a zoomed crop (the spec
  // refuses brow/eye - the fringe merges them): brows rows 245-260 (58% of
  // head), irises rows 279-302 centred 72.4%, smile rows 328-335 (88.5%).
  // Cells through his island (0.92, -1.656, 2.300).
  turbo: {
    ink: '#120a04',
    mouthInk: '#7a4023',
    sclera: '#fffcf0',
    irisBrown: '#3f2510',
    pupil: '#150d06',
    white: '#fff6e4',
    mouth: '#6e2f1c',
    mouthDark: '#4c1d10',
    tongue: '#e07980',
    lowerLip: '#efa062',
    // Huge dark irises nearly filling the aperture.
    eyeHalfW: 18,
    eyeHalfH: 13.5,
    irisR: 12.5,
    irisInward: 2,
    eyeX: [30, 98],
    eyeY: 50,
    browThick: 5.0,
    browThin: 2.6,
    browHalf: 14,
    browX: [32, 96],
    browY: 19,
    browTilt: 0,
    // The mouth-cell pass: grin/cheer/tongue were near-identical on the
    // pre-batch-4 atlases (two critics pixel-diffed it) - the batch-4 knobs
    // open cheer and break the tongue past the lip line.
    alignOpenMouth: true,
    tongueOut: true,
    tongueReach: 1.3,
    mouthY: 87,
    // The dimple smile: corners up, modest.
    mouthBow: -1.0,
    mouthDrop: -2.8,
  },

  // Moose. Soft bold brows under the cap brim, big warm eyes, and an easy
  // gentle smile on the deepest skin of the authored roster so far. Feature
  // rows traced on his sheet: brows rows 263-270 (52% of head), eyes rows
  // 277-303 centred 66.7%, smile rows 323-324 (87%). Cells through his
  // island (0.92, -1.3056, 2.000).
  moose: {
    ink: '#0e0703',
    mouthInk: '#5c2c18',
    sclera: '#fff8ea',
    irisBrown: '#2e1a0c',
    pupil: '#100a05',
    white: '#fff4e0',
    mouth: '#57241a',
    mouthDark: '#39160e',
    tongue: '#dd6f79',
    lowerLip: '#c47c46',
    eyeHalfW: 18,
    eyeHalfH: 12,
    irisR: 11,
    irisInward: 3,
    eyeX: [30, 98],
    eyeY: 50,
    browThick: 5.0,
    browThin: 2.6,
    browHalf: 13,
    browX: [32, 96],
    browY: 24,
    browTilt: 0,
    // The mouth-cell pass: grin/cheer/tongue were near-identical on the
    // pre-batch-4 atlases (two critics pixel-diffed it) - the batch-4 knobs
    // open cheer and break the tongue past the lip line.
    alignOpenMouth: true,
    tongueOut: true,
    tongueReach: 1.3,
    mouthY: 84,
    // The easy smile: gentle rise.
    mouthBow: -1.0,
    mouthDrop: -3.0,
  },

  // Penny. Big bright eyes with lash lines under soft brows, and a wide open
  // smile framed by the curl bob. Feature rows traced on her sheet: brows
  // rows 212-219 (40.9% of head), eyes rows 236-267 centred 56.4%, smile
  // rows 288-295 (73.5%). Cells through her island (0.92, -1.3098, 2.300).
  penny: {
    ink: '#170c04',
    mouthInk: '#8a4530',
    sclera: '#fffdf4',
    irisBrown: '#4a2a12',
    pupil: '#170d06',
    white: '#fff8ea',
    mouth: '#7a3423',
    mouthDark: '#552114',
    tongue: '#e57f86',
    lowerLip: '#f2ac74',
    eyeHalfW: 19,
    eyeHalfH: 13,
    irisR: 11.5,
    irisInward: 3,
    eyeX: [28, 100],
    eyeY: 50,
    browThick: 4.2,
    browThin: 2.0,
    browHalf: 13,
    browX: [32, 96],
    browY: 20,
    browTilt: 0,
    // The mouth-cell pass: grin/cheer/tongue were near-identical on the
    // pre-batch-4 atlases (two critics pixel-diffed it) - the batch-4 knobs
    // open cheer and break the tongue past the lip line.
    alignOpenMouth: true,
    tongueOut: true,
    tongueReach: 1.3,
    mouthY: 76,
    // A bright open smile.
    mouthBow: -1.3,
    mouthDrop: -4.0,
    mouthScale: 1.15,
  },

  // The Professor. `expression: eager` — thick brows above the roster's
  // second-biggest lenses, bright eyes behind them, an open eager smile.
  // Feature rows traced on his sheet (spec landmarks merge with the swept
  // fringe): brows rows 190-201 (44.4% of head), lens centres row 231
  // (60.6%), smile rows 283-290 (87.2%). Cells through his island
  // (0.92, -1.3138, 2.300). Eye marks stay inside the 0.125ft rings.
  the_prof: {
    ink: '#130a04',
    mouthInk: '#7a4023',
    sclera: '#fffcf0',
    irisBrown: '#3a2210',
    pupil: '#150d06',
    white: '#fff6e4',
    mouth: '#6e2f1c',
    mouthDark: '#4c1d10',
    tongue: '#e07980',
    lowerLip: '#efa065',
    eyeHalfW: 13,
    eyeHalfH: 9.5,
    irisR: 8.5,
    irisInward: 2,
    eyeX: [36, 92],
    eyeY: 50,
    browThick: 4.6,
    browThin: 2.4,
    browHalf: 13,
    browX: [32, 96],
    browY: 21,
    browTilt: 0,
    // The mouth-cell pass: grin/cheer/tongue were near-identical on the
    // pre-batch-4 atlases (two critics pixel-diffed it) - the batch-4 knobs
    // open cheer and break the tongue past the lip line.
    alignOpenMouth: true,
    tongueOut: true,
    tongueReach: 1.3,
    mouthY: 91,
    // The eager smile: wide, corners up.
    mouthBow: -1.3,
    mouthDrop: -3.6,
    mouthScale: 1.15,
  },

  // Ace. The captain: thick level brows under the brim, steady warm eyes, a
  // calm confident smile. Feature rows traced on his sheet: brows rows
  // 283-293 (46.3% of head), eyes rows 310-339 centred 62.8%, smile rows
  // 367-374 (84.9%). Cells through his island (0.92, -1.3273, 2.300).
  ace_kid: {
    ink: '#120a04',
    mouthInk: '#7a4023',
    sclera: '#fffcf0',
    irisBrown: '#3c2410',
    pupil: '#150d06',
    white: '#fff6e4',
    mouth: '#6e2f1c',
    mouthDark: '#4c1d10',
    tongue: '#e07980',
    lowerLip: '#efa065',
    eyeHalfW: 17,
    eyeHalfH: 11.5,
    irisR: 10,
    irisInward: 3,
    eyeX: [30, 98],
    eyeY: 50,
    browThick: 5.0,
    browThin: 2.6,
    browHalf: 14,
    browX: [32, 96],
    browY: 19,
    browTilt: 0,
    // The mouth-cell pass: grin/cheer/tongue were near-identical on the
    // pre-batch-4 atlases (two critics pixel-diffed it) - the batch-4 knobs
    // open cheer and break the tongue past the lip line.
    alignOpenMouth: true,
    tongueOut: true,
    tongueReach: 1.3,
    mouthY: 84,
    // The captain's calm smile.
    mouthBow: -1.0,
    mouthDrop: -3.0,
  },

  // Rocket Rosa. Bright determined eyes under soft brows, a swept
  // side-parted fringe, and a quick confident smile. Feature rows traced on
  // her sheet: brows rows 276-284 (47.2% of head), eyes rows 298-321 centred
  // 61.3%, smile rows 352-356 (82.8%). Cells through her island
  // (0.92, -1.3240, 2.300).
  rocket: {
    ink: '#150b04',
    mouthInk: '#8a4530',
    sclera: '#fffdf2',
    irisBrown: '#42260f',
    pupil: '#170d06',
    white: '#fff8ea',
    mouth: '#7a3423',
    mouthDark: '#552114',
    tongue: '#e57f86',
    lowerLip: '#f0a468',
    eyeHalfW: 18,
    // Concept eye half-height is 12px = 0.072ft (rows 298-321 about centre
    // 309) — 8 cells, not the family's 12: the taller default dropped the
    // drawn eye bottom onto the 62% faceSkin sample row, and the render's
    // perspective extends the drawn eye ~0.03ft below its authored bottom.
    eyeHalfH: 8,
    irisR: 7.5,
    irisInward: 3,
    eyeX: [30, 98],
    // 46, not the trace's 50: the review camera's high vantage projects the
    // face plane ~0.13ft down the figure, so the drawn eye must sit at the
    // top of the featurelatitude tolerance or the 62% faceSkin sample row
    // lands across the sclera. Anchor 46 lands 58.9% vs the traced 61.3
    // (tolerance 2.5).
    eyeY: 46,
    browThick: 4.2,
    browThin: 2.0,
    browHalf: 13,
    browX: [32, 96],
    browY: 25,
    browTilt: 0,
    // Separated mouth silhouettes: without this flag grin and cheer share a
    // byte-identical lip path and the tongue never breaks the lip line —
    // rubric 3.14 fails on any kid that leaves it off. Off by default only
    // so frozen kids' atlas bytes stay put.
    tongueOut: true,
    mouthY: 83,
    // The quick confident smile.
    mouthBow: -1.1,
    mouthDrop: -3.2,
    // 1.28: at capture distance her default-size mouth collapsed grin, cheer
    // and tongue into one dark blob — the open cells differ by SILHOUETTE,
    // and the silhouette needs pixels to exist (an independent critic failed
    // rubric 3.14 on it).
    mouthScale: 1.28,
  },
  // Gizmo. Curious eyes behind round wire glasses, a spiky brown fringe,
  // and a tinkerer's grin. Feature rows traced on his sheet: brows rows
  // 229-247 (47.9% of head), lens centres 66.7% (rings rows 252-313 — the
  // atlas eye sits at the lens centre), smile rows 326-330 (85.7%). Cells
  // through his island (0.92, -1.6650, 2.500).
  gizmo: {
    ink: '#170c03',
    mouthInk: '#8a4530',
    sclera: '#fffdf2',
    irisBrown: '#3c2410',
    pupil: '#170d06',
    white: '#fff8ea',
    mouth: '#7a3423',
    mouthDark: '#552114',
    tongue: '#e57f86',
    lowerLip: '#f0a468',
    eyeHalfW: 15,
    eyeHalfH: 9,
    irisR: 8,
    irisInward: 2,
    // ★ UNDER THE RINGS. The glasses' ring centres sit at ±0.255ft (the
    // sheet keeps 13% of head width in skin between the inner rims), and the
    // island window (face_bearing 0.92) put cell 32 at ±0.18ft — a critic
    // measured the eyes ~30% of a ring radius inboard, "cross-eyed with the
    // glasses hanging outboard". Cell 20 lands them at ±0.24ft; the marks
    // start at cell 8, so this is as far out as the atlas can carry them.
    eyeX: [20, 108],
    eyeY: 50,
    browThick: 4.4,
    browThin: 2.2,
    browHalf: 13,
    browX: [32, 96],
    browY: 17,
    browTilt: 0,
    // Separated mouth silhouettes: without this flag grin and cheer share a
    // byte-identical lip path and the tongue never breaks the lip line —
    // rubric 3.14 fails on any kid that leaves it off. Off by default only
    // so frozen kids' atlas bytes stay put.
    tongueOut: true,
    // The sheet's grin arc spans px 179-238 = 0.34ft — 65 cells against the
    // default mark's ~44. Without the scale the mouth is a stroke at card
    // distance and the open cells cannot differ (rubric 3.14).
    mouthScale: 1.32,
    // A second critic measured his tongue tip at ~2px against cheer's near-
    // duplicate opening; 1.45 droops it clear of the lip line at card size.
    // 1.7, and mouthScale held to 1.32: at 1.45 the scale grew CHEER's own
    // resting tongue until the two open cells read identical at card
    // distance — separation comes from the reach, not the amplification.
    tongueReach: 1.7,
    // His mouth sits at cell-y 73; unaligned open cells paint the tongue on
    // the under-chin and it renders invisible from every gameplay camera.
    alignOpenMouth: true,
    mouthY: 81,
    // The tinkerer's grin.
    mouthBow: -1.2,
    mouthDrop: -3.0,
  },
  // Dex. Big warm brown eyes under thick black brows, a thoughtful
  // half-smile. Feature rows traced on his sheet: brow band rows 253-272
  // (49.0% of head), eyes rows 289-318 centred 67.6%, smile rows 335+
  // (82.3%). Cells through his island (0.92, -1.6855, 2.500).
  dex: {
    ink: '#120a04',
    mouthInk: '#5e2c1a',
    sclera: '#fffdf2',
    irisBrown: '#4a2a10',
    pupil: '#170d06',
    white: '#fff8ea',
    mouth: '#6e2f1e',
    mouthDark: '#4a1e12',
    tongue: '#e57f86',
    lowerLip: '#c97d4e',
    eyeHalfW: 17,
    eyeHalfH: 11,
    irisR: 9.5,
    irisInward: 3,
    eyeX: [31, 97],
    eyeY: 50,
    browThick: 5.6,
    browThin: 2.6,
    browHalf: 15,
    browX: [31, 97],
    browY: 20,
    browTilt: 0,
    // His mouth sits at cell-y 73 — unaligned open cells would paint the
    // tongue and cheer opening onto the under-chin (Gizmo's lesson).
    alignOpenMouth: true,
    tongueOut: true,
    tongueReach: 1.5,
    mouthY: 70,
    // The thoughtful half-smile.
    mouthBow: -0.9,
    mouthDrop: -2.6,
  },
  // Clover. Big hazel-green eyes, soft blonde brows, freckles across the
  // nose, a warm closed smile. Feature rows traced on her sheet: brows rows
  // 295-300 (43.0% of head), eyes rows 301-319 centred 48.7%, smile bounded
  // ~69% (skin-adjacent line; corner shadow 68.6). Cells through her island
  // (0.92, -1.5887, 2.500). eyeY sits at the featurelatitude tolerance edge
  // (46.4 vs traced 48.7, tol 2.5) so the 62% faceSkin sample row clears
  // the drawn sclera under the review camera's parallax (Rocket's lesson).
  clover: {
    ink: '#3d2c12',
    mouthInk: '#8a4530',
    sclera: '#fffdf2',
    irisBrown: '#5c5e20',
    pupil: '#170d06',
    white: '#fff8ea',
    mouth: '#a04a30',
    mouthDark: '#6e2c1a',
    tongue: '#e57f86',
    lowerLip: '#efA57a',
    eyeHalfW: 16,
    eyeHalfH: 10,
    irisR: 9,
    irisInward: 3,
    eyeX: [31, 97],
    eyeY: 46,
    browThick: 3.6,
    browThin: 1.8,
    browHalf: 13,
    browX: [31, 97],
    browY: 40,
    browTilt: 0,
    freckles: true,
    freckleTone: '#c46a30',
    alignOpenMouth: true,
    tongueOut: true,
    // 1.0, not more: her island reaches the chin at cell ~112, and a drooped
    // tongue paints the under-chin latitudes and vanishes (Gizmo's lesson,
    // the short-chin corollary).
    tongueReach: 1.0,
    mouthY: 85,
    // The warm closed smile.
    mouthBow: -1.0,
    mouthDrop: -2.8,
  },
  // Boomer. Big bright eyes under thick arched brows, and the roster's
  // widest grin — a full white teeth band. Feature rows traced on his
  // sheet: brows rows 224-232 (44.5% of head), eyes rows 246-260 centred
  // 54.7%, grin rows 272-290 (66.0%). Cells through his island
  // (0.92, -1.5005, 2.500).
  boomer: {
    ink: '#120a04',
    mouthInk: '#4e2412',
    sclera: '#fffdf2',
    irisBrown: '#3c220e',
    pupil: '#150c05',
    white: '#fff8ea',
    mouth: '#5e2a16',
    mouthDark: '#3e1a0c',
    tongue: '#e57f86',
    lowerLip: '#c87848',
    eyeHalfW: 16,
    eyeHalfH: 11,
    irisR: 9.5,
    irisInward: 3,
    eyeX: [31, 97],
    eyeY: 50,
    browThick: 5.8,
    browThin: 2.8,
    browHalf: 15,
    browX: [31, 97],
    browY: 34,
    browTilt: 0,
    // The roster's widest grin: the sheet's mouth spans 0.52ft. Open cells
    // are aligned to his high mouthY 62 (Gizmo's under-chin lesson).
    alignOpenMouth: true,
    tongueOut: true,
    tongueReach: 1.5,
    mouthScale: 1.55,
    mouthY: 62,
    mouthBow: -1.4,
    mouthDrop: -3.4,
  },
  // Smokey. Intense dark eyes under heavy straight brows, a small sly
  // smile. Feature rows traced on his sheet: brows rows 311-318 (47.5% of
  // head), eyes rows 319-350 centred 57.7%, smile arcs rows 367-372
  // (77.7%). Cells through his island (0.92, -1.7828, 2.500).
  smokey: {
    ink: '#100a05',
    mouthInk: '#5e2c1a',
    sclera: '#fffdf2',
    irisBrown: '#38200c',
    pupil: '#130b04',
    white: '#fff8ea',
    mouth: '#6e3220',
    mouthDark: '#4a2010',
    tongue: '#e57f86',
    lowerLip: '#c8763e',
    eyeHalfW: 16,
    eyeHalfH: 11,
    irisR: 9.5,
    irisInward: 3,
    eyeX: [31, 97],
    eyeY: 50,
    browThick: 5.6,
    browThin: 2.8,
    browHalf: 15,
    browX: [31, 97],
    browY: 38,
    browTilt: 1,
    alignOpenMouth: true,
    tongueOut: true,
    tongueReach: 1.4,
    mouthScale: 1.15,
    mouthY: 72,
    // The small sly smile.
    mouthBow: -0.8,
    mouthDrop: -2.4,
  },
  // Big Lou. The roster's warmest grin - huge, toothy - big eyes under
  // thick arched brows, deep brown skin, buzz cut, big proud ears. Feature
  // rows, bounded crop traces on big-lou-turnaround.png (crown row 106,
  // hand-set neck row 305 - the analyser refused his pinch, the chin
  // merges into the neck): brows centred ~170 (32.2% of head), eyes
  // centred ~201 (47.7%), the grin centred ~253 (73.9%). Cells through
  // his island (0.92, -1.4836, 2.500) on skull z 3.42 rz 0.52.
  big_lou: {
    ink: '#0e0a06',
    mouthInk: '#5a2412',
    sclera: '#fffdf2',
    irisBrown: '#3a2008',
    pupil: '#100a04',
    white: '#fff8ea',
    mouth: '#6e3220',
    mouthDark: '#48180a',
    tongue: '#e57f86',
    lowerLip: '#a05a34',
    eyeHalfW: 19,
    eyeHalfH: 13,
    irisR: 11,
    irisInward: 3,
    eyeX: [31, 97],
    eyeY: 50,
    browThick: 6.0,
    browThin: 2.8,
    browHalf: 15,
    browX: [31, 97],
    browY: 32,
    browTilt: 1,
    alignOpenMouth: true,
    tongueOut: true,
    tongueReach: 1.4,
    mouthScale: 1.35,
    mouthY: 75,
    // The huge warm toothy grin.
    mouthBow: -1.4,
    mouthDrop: -4.0,
  },
  // Zoom Ramirez. Confident easy smile, big warm brown eyes under thick
  // straight brows, the swept spike crown above. Feature rows, bounded crop
  // traces on zoom-turnaround.png (spike crown row 71, neck row 265): brows
  // centred ~180 (56.2% of head), eyes centred ~210 (71.6%); the mouth is
  // the analyser's own trace (83.5). Cells through his island
  // (0.92, -1.5780, 2.500) on skull z 2.99 rz 0.44.
  wheelchair_ace: {
    ink: '#17110c',
    mouthInk: '#6e3220',
    sclera: '#fffdf2',
    irisBrown: '#4a2a10',
    pupil: '#150b04',
    white: '#fff8ea',
    mouth: '#8a4028',
    mouthDark: '#5a2212',
    tongue: '#e57f86',
    lowerLip: '#dd8f56',
    eyeHalfW: 18,
    eyeHalfH: 13,
    irisR: 11,
    irisInward: 3,
    eyeX: [31, 97],
    eyeY: 50,
    browThick: 5.8,
    browThin: 2.8,
    browHalf: 15,
    browX: [31, 97],
    browY: 24,
    browTilt: 0,
    alignOpenMouth: true,
    tongueOut: true,
    tongueReach: 1.4,
    mouthScale: 1.15,
    mouthY: 64,
    // The confident easy smile.
    mouthBow: -0.9,
    mouthDrop: -2.2,
  },
  // Big Talk Theo. Huge open grin low on the broad face, big round eyes,
  // thick dark brows under the oversized cap bill. Feature rows: bounded
  // crop traces brows rows ~250-265 centred ~258 (49.8% of head), eyes
  // centred ~294 (63.7%); the analyser's own mouth trace 84.9% (row 349)
  // is the open smile. Cells through his island (0.92, -1.4503, 2.500)
  // on skull z 3.06 rz 0.42.
  calls_shot: {
    ink: '#14100a',
    mouthInk: '#6e3220',
    sclera: '#fffdf2',
    irisBrown: '#4a2a10',
    pupil: '#150b04',
    white: '#fff8ea',
    mouth: '#8a4028',
    mouthDark: '#5a2212',
    tongue: '#e57f86',
    lowerLip: '#e09058',
    eyeHalfW: 18,
    eyeHalfH: 13,
    irisR: 11,
    irisInward: 3,
    eyeX: [31, 97],
    eyeY: 50,
    browThick: 6.0,
    browThin: 2.8,
    browHalf: 15,
    browX: [31, 97],
    browY: 24,
    browTilt: 1,
    alignOpenMouth: true,
    tongueOut: true,
    tongueReach: 1.4,
    mouthScale: 1.3,
    mouthY: 83,
    // The huge open showman's grin.
    mouthBow: -1.5,
    mouthDrop: -4.6,
  },
  // Mimi Mash. Proud joyful smile, big warm brown eyes, thick dark brows,
  // blush cheeks under the curl halo. Feature rows traced by bounded crop on
  // mimi-mash-turnaround.png (halo crown row 92, neck row 343): thick brows
  // rows 180-190 centred ~185 (37.0% of head), big eyes rows 205-230 centred
  // ~217.5 (50.0%), the proud closed smile rows 253-259 centred ~256 (65.3%)
  // - the analyser's two competing dark bands at 75.7%/93.2% are the
  // under-chin and collar shadows, not the lip line. Cells through her
  // island (0.92, -1.3503, 2.500) on skull z 3.20 rz 0.47.
  mimi_mash: {
    ink: '#1d0d03',
    mouthInk: '#7e3a24',
    sclera: '#fffdf2',
    irisBrown: '#5a3010',
    pupil: '#150b04',
    white: '#fff8ea',
    mouth: '#8a4028',
    mouthDark: '#5e2413',
    tongue: '#e57f86',
    lowerLip: '#d87d48',
    eyeHalfW: 20,
    eyeHalfH: 14,
    irisR: 12,
    irisInward: 3,
    eyeX: [31, 97],
    eyeY: 50,
    browThick: 6.2,
    browThin: 3.0,
    browHalf: 16,
    browX: [31, 97],
    browY: 28,
    browTilt: 1,
    alignOpenMouth: true,
    tongueOut: true,
    tongueReach: 1.3,
    mouthScale: 1.25,
    mouthY: 69,
    // The proud, satisfied smile.
    mouthBow: -1.0,
    mouthDrop: -1.5,
  },
  // Sniffles. Big watery eyes under thick auburn brows, a small brave pout.
  // Feature rows traced on his sheet: brows rows 229-241 (49.6% of head),
  // eyes rows 259-291 centred 66.3%, pout bounded 78%. Cells through his
  // island (0.92, -1.8175, 2.500).
  sniffles: {
    ink: '#3a1802',
    mouthInk: '#8a4530',
    sclera: '#fffdf2',
    irisBrown: '#4a2a10',
    pupil: '#170d06',
    white: '#fff8ea',
    mouth: '#9a4a30',
    mouthDark: '#6e2c1a',
    tongue: '#e57f86',
    lowerLip: '#efa066',
    eyeHalfW: 17,
    eyeHalfH: 12,
    irisR: 10,
    irisInward: 3,
    eyeX: [31, 97],
    eyeY: 50,
    browThick: 5.4,
    browThin: 2.6,
    browHalf: 14,
    browX: [31, 97],
    browY: 24,
    browTilt: -1,
    alignOpenMouth: true,
    tongueOut: true,
    tongueReach: 1.4,
    mouthScale: 1.1,
    mouthY: 65,
    // The small brave pout.
    mouthBow: -0.6,
    mouthDrop: -2.2,
  },
  // Cricket. Bright eager eyes under the spiky fringe, freckles on the
  // fairest skin in the roster, a chirpy smile. Feature rows traced on his
  // sheet: brows rows 272-291 (51.9% of head), eyes rows 303-321 centred
  // 65.4%, smile bounded 75%. Cells through his island (0.92, -1.8175, 2.500).
  cricket: {
    ink: '#2e1804',
    mouthInk: '#9a5232',
    sclera: '#fffdf2',
    irisBrown: '#5a3812',
    pupil: '#1a0f05',
    white: '#fff8ea',
    mouth: '#b05a36',
    mouthDark: '#82381e',
    tongue: '#e57f86',
    lowerLip: '#f5b585',
    eyeHalfW: 16,
    eyeHalfH: 11,
    irisR: 9.5,
    irisInward: 3,
    eyeX: [31, 97],
    eyeY: 50,
    browThick: 4.2,
    browThin: 2.0,
    browHalf: 13,
    browX: [31, 97],
    browY: 29,
    browTilt: 0,
    freckles: true,
    freckleTone: '#c98244',
    alignOpenMouth: true,
    tongueOut: true,
    tongueReach: 1.4,
    mouthScale: 1.2,
    mouthY: 61,
    // The chirpy smile.
    mouthBow: -1.1,
    mouthDrop: -2.8,
  },
  // Peaches. Warm calm eyes under soft brows, a gentle smile, curly wisps
  // at the temples. Feature rows traced on her sheet: brows rows 184-198
  // (50.2% of head), eyes rows 209-227 centred 62.5%, lip line 77.5% (analyser-separated).
  // Cells through her island (0.92, -1.6924, 2.500).
  peaches: {
    ink: '#2e1604',
    mouthInk: '#93482a',
    sclera: '#fffdf2',
    irisBrown: '#4e2c10',
    pupil: '#170d06',
    white: '#fff8ea',
    mouth: '#a84e2e',
    mouthDark: '#7a301a',
    tongue: '#e57f86',
    lowerLip: '#f5aa70',
    eyeHalfW: 16,
    eyeHalfH: 11,
    irisR: 9.5,
    irisInward: 3,
    eyeX: [31, 97],
    eyeY: 50,
    browThick: 3.8,
    browThin: 1.8,
    browHalf: 13,
    browX: [31, 97],
    browY: 32,
    browTilt: 0,
    alignOpenMouth: true,
    tongueOut: true,
    tongueReach: 1.4,
    mouthScale: 1.15,
    mouthY: 68,
    // The gentle smile.
    mouthBow: -0.9,
    mouthDrop: -2.6,
  },
  // Lefty Lu. Sharp confident eyes, a sideways smirk. Feature rows traced
  // on her sheet: brows rows 283-287 (54.3% of head), eyes rows 289-303
  // centred 59.9%, smirk bounded 79%. Cells through her island
  // (0.92, -1.6077, 2.500).
  lefty: {
    ink: '#241204',
    mouthInk: '#8a4530',
    sclera: '#fffdf2',
    irisBrown: '#503010',
    pupil: '#170d06',
    white: '#fff8ea',
    mouth: '#9a4a30',
    mouthDark: '#6e2c1a',
    tongue: '#e57f86',
    lowerLip: '#efa066',
    eyeHalfW: 16,
    eyeHalfH: 10,
    irisR: 9,
    irisInward: 3,
    eyeX: [31, 97],
    eyeY: 50,
    browThick: 4.0,
    browThin: 2.0,
    browHalf: 13,
    browX: [31, 97],
    browY: 42,
    browTilt: 2,
    alignOpenMouth: true,
    tongueOut: true,
    tongueReach: 1.3,
    mouthScale: 1.1,
    mouthY: 75,
    // The confident sideways smirk.
    mouthBow: -0.8,
    mouthDrop: -2.4,
  },
};
