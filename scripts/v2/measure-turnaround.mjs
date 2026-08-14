// ---------------------------------------------------------------------------
// ★ THE SCULPTOR'S TAPE MEASURE — read a concept sheet, print the numbers a
// sculpt script needs, in feet.
//
// Junebug's sculpt script is 1,467 lines of code and 1,629 lines of comment,
// and a large share of that comment is hand-traced pixel arithmetic:
//
//   "Tracing junebug-turnaround.png column by column for the first row of six
//    consecutive skin pixels gives y=201 across the centre of the forehead
//    (x 268-310) and y=176-183 at x 382-388 — the hairline RISES 25px at the
//    temple"
//
// That work was right and it is why she is approved. Doing it twenty-nine more
// times by hand is not a plan, and every hand-traced number is a number nobody
// can re-check without redoing the trace.
//
// So this reads the same landmarks with the same detector `measure-fidelity`
// uses to GRADE the result — which matters more than it sounds. A sculptor
// measuring the concept one way and a gate measuring the delivery another way
// produces disagreements that are really two rulers, and four rounds on Junebug
// were spent on exactly that class of confusion. The reader itself now lives in
// `turnaround.mjs`, shared with `sculpt-provenance.lint.test.js`, for the same
// reason one step further out.
//
// ★ IT PRINTS FEET, NOT PIXELS. Every sculpt script authors in absolute feet
// against the canonical rig, so the conversion belongs here, once, rather than
// in a comment block per character.
//
// ★ AND IT PRINTS THE RUN COUNT, WHICH IS THE COLUMN THAT WOULD HAVE SAVED
// EIGHT REVIEW ROUNDS. A width is only a TORSO width where the row crosses
// three runs — arm, body, arm. Junebug's sheet separates at y=520 and hers was
// traced correctly. Tank's never separates: every view of his turnaround reads
// 1 from crown to ankle, so the same trace silently returns arm-plus-torso. The
// step was skipped, his form tables were authored by eye and nudged against
// review prose for seventeen rounds, and the tool gave no sign anything was
// wrong. Now it says so in its own output, and `sculpt-provenance.lint.test.js`
// refuses a table that neither cites a trace nor declares it impossible.
//
//   npm run measure:turnaround -- tank
// ---------------------------------------------------------------------------

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import process from 'node:process';

import { slugFor } from './character-registry.mjs';
import { REFERENCE_HEIGHT_FT, figure, loadSheet, rowAt, segmentsAt, views } from './turnaround.mjs';

const CONCEPTS = 'docs/v2/concepts';

const hex = (c) => '#' + c.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');

async function main() {
  const id = process.argv[2];
  if (!id) {
    console.error('usage: npm run measure:turnaround -- <character id>');
    process.exit(2);
  }
  const slug = slugFor(id);
  const path = join(CONCEPTS, `${slug}-turnaround.png`);
  if (!existsSync(path)) {
    console.error(`missing ${path}`);
    process.exit(2);
  }

  const sheet = await loadSheet(path);
  const viewCount = views(sheet).length;
  const f = figure(sheet, 0);
  const { at, x0, x1, y0, y1, figH, ftPerPx } = f;
  const centreX = Math.round((x0 + x1) / 2);
  const zOf = (y) => (y1 - y) * ftPerPx;

  console.log(`\nTurnaround measurements — ${slug} (${viewCount} views on the sheet)`);
  console.log(`front figure ${x1 - x0 + 1} x ${figH}px, scaled to ${REFERENCE_HEIGHT_FT}ft`);
  console.log(`1px = ${ftPerPx.toFixed(5)}ft   |   1ft = ${(1 / ftPerPx).toFixed(1)}px\n`);

  // --- the width profile, which is what a torso/leg table is made of ---
  console.log('width profile — the contiguous run through the figure centre');
  console.log('  z (ft)   half-width (ft)   runs   colour at centre');
  let separated = 0, sampled = 0;
  for (let frac = 0.98; frac >= 0.02; frac -= 0.04) {
    const z = frac * figH * ftPerPx;
    const y = rowAt(f, z);
    const segments = segmentsAt(f, z);
    if (!segments.length) continue;
    const run = segments.find(([a, b]) => centreX >= a && centreX <= b)
      ?? [...segments].sort((p, q) => (q[1] - q[0]) - (p[1] - p[0]))[0];
    const half = ((run[1] - run[0]) * ftPerPx) / 2;
    sampled++;
    if (segments.length >= 3) separated++;
    console.log(
      `  ${z.toFixed(3).padStart(6)}   ${half.toFixed(4).padStart(9)}      ` +
      `${String(segments.length).padStart(2)}     ${hex(at(centreX, y))}`,
    );
  }

  // --- garment boundaries: where the centre column changes colour ---
  // A hem, a cuff and a sock top are all the same event — one band of colour
  // ending and another starting — so finding them is one scan, not three.
  console.log('\ngarment boundaries down the centre column (colour changes > 40)');
  let previous = null;
  for (let y = y0; y <= y1; y++) {
    if (!f.inFigure(centreX, y)) continue;
    const c = at(centreX, y);
    if (previous) {
      const delta = Math.hypot(c[0] - previous[0], c[1] - previous[1], c[2] - previous[2]);
      if (delta > 40) console.log(`  z ${zOf(y).toFixed(3)}   ${hex(previous)} -> ${hex(c)}`);
    }
    previous = c;
  }

  console.log(
    separated === 0
      ? '\n⚠️  THE ARMS NEVER SEPARATE FROM THE BODY ON THIS SHEET.\n' +
        '    Every sampled row reads a single run, so every width above is arm\n' +
        '    PLUS torso and none of them is a torso measurement. Do not author a\n' +
        '    torso table from this column. Trace the garment by COLOUR where the\n' +
        '    sleeve has ended, or take depth off the profile view — and declare\n' +
        '    the gap with `# not-traceable:` so the provenance gate can see it.\n' +
        '    This is the exact reading that went unnoticed on Tank for seventeen\n' +
        '    rounds while eight reviews described its consequence.'
      : `\n${separated} of ${sampled} sampled rows separate the arms from the body — ` +
        'a torso width\n    is only honest on those rows.',
  );

  console.log('\n⚠️  These are the CONCEPT\'s numbers, and it is drawn POSED.');
  console.log('    A bind-pose sculpt will not match a stance, and widening a');
  console.log('    tolerance to make it match is the failure measure:fidelity\'s');
  console.log('    ankle-daylight note warns about. Author the stance, not the number.\n');
}

await main();
