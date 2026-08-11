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
// Near-black warm brown: the turnaround's eyes are essentially all dark
// iris/pupil. #5a3116 still read as light-brown rings with white crescents —
// startled, not determined — so the iris is now a shade off the lash ink and
// fills the almond to its lids.
const iris = '#31180c';
const white = '#fff7e4';
const mouth = '#57201c';
const lipLow = '#a04d43';
const mouthDark = '#3a1512';
const tongue = '#df6c78';
const nose = '#6d3826';

function eye(x, y, { closed = false, wink = false } = {}) {
  if (closed || wink) return `<path d="M${x - 16} ${y} Q${x} ${y + 9} ${x + 16} ${y}" fill="none" stroke="${ink}" stroke-width="7" stroke-linecap="round"/>`;
  // The turnaround's eyes are LARGE and nearly all dark: a solid warm-brown
  // rounded mass under a heavy flat upper lid, darker pupil low in it, ONE
  // small catch-light. No sclera outline, no lower lash, no second sparkle —
  // the v5 almond ring + double highlights + under-eye ink read as bruised
  // raccoon rings at hero distance.
  return `<ellipse cx="${x}" cy="${y + 1}" rx="16" ry="17.5" fill="${iris}"/>
    <circle cx="${x}" cy="${y + 4}" r="9" fill="${ink}"/>
    <path d="M${x - 17} ${y - 8} Q${x} ${y - 15} ${x + 17} ${y - 8}" fill="none" stroke="${ink}" stroke-width="7" stroke-linecap="round"/>
    <circle cx="${x - 6}" cy="${y - 6}" r="2.6" fill="${white}" opacity="0.9"/>`;
}

function brow(x, y, tilt, inner) {
  // The turnaround's brows are the boldest mark on the face: THICK angular
  // bars, low over the eyes, tapering from the nose outward. The old 5.2px
  // half-thickness measured barely half the concept's bar. `inner` is +1 when
  // the nose side is the +x end.
  const thick = 7.5;
  const thin = 3.5;
  const left = inner > 0 ? thin : thick;
  const right = inner > 0 ? thick : thin;
  return `<path d="M${x - 19} ${y - tilt - left} Q${x} ${y - 10} ${x + 19} ${y + tilt - right}
    L${x + 19} ${y + tilt + right} Q${x} ${y + 1.5} ${x - 19} ${y - tilt + left}Z" fill="${ink}"/>`;
}

function face(name) {
  const blink = name === 'blink';
  const wink = name === 'wink';
  const sleepy = name === 'sleepy';
  const determined = name === 'determined' || name === 'angry';
  const worried = name === 'worried' || name === 'upset';
  // Feature heights follow the sculpt's face patch (vertical span -0.98..0.44
  // rad on the skull): brows z~3.49, eyes z~3.30, mouth z~3.11 — the
  // turnaround's low-set face, not features floating at mid-forehead; sitting
  // them low is also what leaves the bare-forehead strip under the headband.
  // Junebug's NEUTRAL is the determined scowl: the brows always angle down
  // toward the nose; 'determined' only deepens what is already there.
  const eyes =
    eye(38, 67, { closed: blink || sleepy }) +
    eye(90, 67, { closed: blink || sleepy, wink });
  const brows =
    brow(38, 40, determined ? 7 : worried ? -5 : 4, 1) +
    brow(90, 40, determined ? -7 : worried ? 5 : -4, -1);
  // No drawn nose: the sculpt carries a real nose form, and a mark on top of
  // it doubled the feature and read as a sticker.

  // The neutral mouth is the turnaround's: a firm FLAT line, set low, corners
  // a touch below centre — the determined set the whole face identity hangs
  // on. The v5 lens-shaped fill with a lit lower lip curved the wrong way and
  // the board smiled; the concept never smiles at rest. Still drawn HEAVY —
  // a 3.14 fail is a mouth that only reads in close-up.
  let lips = `<path d="M49 91.5 Q64 88 79 91.5" fill="none" stroke="${ink}" stroke-width="6.5" stroke-linecap="round"/>
    <path d="M53 96 Q64 97.6 75 96" fill="none" stroke="${lipLow}" stroke-width="2.6" opacity="0.7" stroke-linecap="round"/>`;
  // An open smile is a MOUTH, not a crescent sticker: inner cavity, a band of
  // upper teeth, a tongue resting low, and a catch-light lower lip.
  if (name === 'grin' || name === 'cheer') lips = `<path d="M46 84 Q64 89 82 84 Q76 101 64 101 Q52 101 46 84Z" fill="${mouthDark}" stroke="${ink}" stroke-width="2.4"/>
    <path d="M48.5 85.5 Q64 90 79.5 85.5 Q75 92.6 64 92.9 Q53 92.6 48.5 85.5Z" fill="${white}"/>
    <path d="M55.5 98.8 Q64 102.6 72.5 98.8 Q69.5 94.6 64 94.6 Q58.5 94.6 55.5 98.8Z" fill="${tongue}"/>
    <path d="M50 97.8 Q64 105.2 78 97.8" fill="none" stroke="${lipLow}" stroke-width="2.6" opacity="0.85"/>`;
  if (name === 'determined' || name === 'angry') lips = `<path d="M47 94 Q64 86 81 94" fill="none" stroke="${ink}" stroke-width="7" stroke-linecap="round"/>
    <path d="M52 98.5 Q64 100.5 76 98.5" fill="none" stroke="${lipLow}" stroke-width="2.8" opacity="0.75" stroke-linecap="round"/>`;
  if (name === 'worried' || name === 'upset') lips = `<path d="M51 95.5 Q64 84.5 77 95.5 Q64 90.5 51 95.5Z" fill="${mouth}"/>
    <path d="M57.5 96.8 Q64 100 70.5 96.8" fill="none" stroke="${lipLow}" stroke-width="2.4" opacity="0.75" stroke-linecap="round"/>`;
  if (name === 'surprised') lips = `<ellipse cx="64" cy="91" rx="11.5" ry="13.5" fill="${mouth}"/>
    <ellipse cx="64" cy="91" rx="8.3" ry="10.3" fill="${mouthDark}" stroke="${ink}" stroke-width="1.8"/>
    <path d="M56.5 86.5 Q64 84 71.5 86.5 Q70 90 64 90.2 Q58 90 56.5 86.5Z" fill="${white}"/>
    <path d="M58.5 98.5 Q64 95.2 69.5 98.5 Q67 100.6 64 100.6 Q61 100.6 58.5 98.5Z" fill="${tongue}"/>`;
  if (name === 'tongue') lips = `<path d="M46 84 Q64 89 82 84 Q76 100 64 100 Q52 100 46 84Z" fill="${mouthDark}" stroke="${ink}" stroke-width="2.4"/>
    <path d="M48.5 85.5 Q64 90 79.5 85.5 Q75 92 64 92.3 Q53 92 48.5 85.5Z" fill="${white}"/>
    <path d="M56.5 95.5 Q55.5 106.5 64 107.5 Q72.5 106.5 71.5 95.5 Q64 99 56.5 95.5Z" fill="${tongue}" stroke="${ink}" stroke-width="1.8"/>
    <path d="M64 99.5 L64 104.8" fill="none" stroke="${lipLow}" stroke-width="1.6" opacity="0.8"/>`;
  if (blink || sleepy || wink) lips = `<path d="M52 91 Q64 88.5 76 91" fill="none" stroke="${ink}" stroke-width="6" stroke-linecap="round"/>
    <path d="M56 95.5 Q64 97 72 95.5" fill="none" stroke="${lipLow}" stroke-width="2.4" opacity="0.7" stroke-linecap="round"/>`;

  // The mouth reads its emotion from across the diamond, so it gets a 1.3x
  // scale about its own centre and drops to y~100 — the face patch maps that
  // just above the chin, where the turnaround sets it. Larger scales push the
  // open-mouth cells into the patch's edge feather and clip them.
  return `${brows}${eyes}<g transform="translate(64 100) scale(1.3) translate(-64 -92)">${lips}</g>`;
}

const contents = cells.map((name, index) => {
  const x = (index % 4) * 128;
  const y = Math.floor(index / 4) * 128;
  return `<g transform="translate(${x} ${y})">${face(name)}</g>`;
}).join('');

const svg = `<svg width="512" height="512" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg">${contents}</svg>`;
// Indexed PNG: the atlas is flat-colour line art, and the palette encoding
// roughly halves its share of the 400KB GLB budget.
await sharp(Buffer.from(svg)).png({ compressionLevel: 9, palette: true }).toFile(output);
console.log(`wrote ${output}`);
