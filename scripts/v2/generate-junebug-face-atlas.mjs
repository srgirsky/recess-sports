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
const iris = '#84502a';
const white = '#fff7e4';
const mouth = '#57201c';
const lipLow = '#a04d43';
const mouthDark = '#3a1512';
const tongue = '#df6c78';
const nose = '#6d3826';

function eye(x, y, { closed = false, wink = false } = {}) {
  if (closed || wink) return `<path d="M${x - 13} ${y} Q${x} ${y + 7} ${x + 13} ${y}" fill="none" stroke="${ink}" stroke-width="6" stroke-linecap="round"/>`;
  // A drawn-on flat almond read as a sticker. Visible sclera, a large iris
  // with a pupil and two highlights, a heavy upper lash line and a soft lower
  // lid give the eye the depth the turnaround's render has.
  return `<path d="M${x - 19} ${y} Q${x} ${y - 14} ${x + 19} ${y} Q${x} ${y + 13} ${x - 19} ${y}Z" fill="${white}" stroke="${ink}" stroke-width="2"/>
    <circle cx="${x}" cy="${y}" r="8.4" fill="${iris}"/>
    <circle cx="${x}" cy="${y + 0.5}" r="4.6" fill="${ink}"/>
    <circle cx="${x - 2.6}" cy="${y - 2.6}" r="2.1" fill="${white}"/>
    <circle cx="${x + 2.5}" cy="${y + 2.9}" r="1.1" fill="${white}" opacity="0.65"/>
    <path d="M${x - 19} ${y} Q${x} ${y - 14} ${x + 19} ${y}" fill="none" stroke="${ink}" stroke-width="4.5" stroke-linecap="round"/>
    <path d="M${x - 15} ${y + 7.5} Q${x} ${y + 12} ${x + 15} ${y + 7.5}" fill="none" stroke="${ink}" stroke-width="1.6" opacity="0.5"/>`;
}

function brow(x, y, tilt, inner) {
  // The turnaround's brows are the boldest mark on the face — and they TAPER:
  // thick at the nose, thinning outward. A uniform marker stroke is what made
  // them read as drawn-on. `inner` is +1 when the nose side is the +x end.
  const thick = 5.2;
  const thin = 1.8;
  const left = inner > 0 ? thin : thick;
  const right = inner > 0 ? thick : thin;
  return `<path d="M${x - 17} ${y - tilt - left} Q${x} ${y - 9} ${x + 17} ${y + tilt - right}
    L${x + 17} ${y + tilt + right} Q${x} ${y - 0.5} ${x - 17} ${y - tilt + left}Z" fill="${ink}"/>`;
}

function face(name) {
  const blink = name === 'blink';
  const wink = name === 'wink';
  const sleepy = name === 'sleepy';
  const determined = name === 'determined' || name === 'angry';
  const worried = name === 'worried' || name === 'upset';
  const eyes =
    eye(42, 55, { closed: blink || sleepy }) +
    eye(86, 55, { closed: blink || sleepy, wink });
  const brows =
    brow(42, 32, determined ? 6 : worried ? -5 : 1, 1) +
    brow(86, 32, determined ? -6 : worried ? 5 : -1, -1);
  // No drawn nose: the sculpt carries a real nose form, and a mark on top of
  // it doubled the feature and read as a sticker.

  // Closed lips are a SHAPE with real height: a cupid's-bow upper lip, a
  // fuller catch-light lower lip and a dark seam between them. Anything
  // shorter than ~10px in the cell collapses back into a drawn-on line at
  // hero scale — measured, twice.
  let lips = `<path d="M49.5 88.5 Q56 85 63 87.6 Q64 87.9 65 87.6 Q72 85 78.5 88.5 Q73 96.5 64 96.5 Q55 96.5 49.5 88.5Z" fill="${mouth}"/>
    <path d="M53.5 92 Q64 96.2 74.5 92 Q70 96.3 64 96.3 Q58 96.3 53.5 92Z" fill="${lipLow}"/>
    <path d="M50.5 88.8 Q64 91.6 77.5 88.8" fill="none" stroke="${ink}" stroke-width="1.7" opacity="0.55"/>`;
  // An open smile is a MOUTH, not a crescent sticker: inner cavity, a band of
  // upper teeth, a tongue resting low, and a catch-light lower lip.
  if (name === 'grin' || name === 'cheer') lips = `<path d="M46 84 Q64 89 82 84 Q76 101 64 101 Q52 101 46 84Z" fill="${mouthDark}" stroke="${ink}" stroke-width="2.4"/>
    <path d="M48.5 85.5 Q64 90 79.5 85.5 Q75 92.6 64 92.9 Q53 92.6 48.5 85.5Z" fill="${white}"/>
    <path d="M55.5 98.8 Q64 102.6 72.5 98.8 Q69.5 94.6 64 94.6 Q58.5 94.6 55.5 98.8Z" fill="${tongue}"/>
    <path d="M50 97.8 Q64 105.2 78 97.8" fill="none" stroke="${lipLow}" stroke-width="2.6" opacity="0.85"/>`;
  if (name === 'determined' || name === 'angry') lips = `<path d="M50.5 90 Q64 86 77.5 90 Q71.5 96 64 96 Q56.5 96 50.5 90Z" fill="${mouth}"/>
    <path d="M54 92 Q64 94.8 74 92 Q69.5 95.8 64 95.8 Q58.5 95.8 54 92Z" fill="${lipLow}"/>
    <path d="M52 90.2 Q64 92.4 76 90.2" fill="none" stroke="${ink}" stroke-width="1.7" opacity="0.6"/>`;
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
  if (blink || sleepy || wink) lips = `<path d="M53 89.5 Q64 86.5 75 89.5 Q69 94.5 64 94.5 Q59 94.5 53 89.5Z" fill="${mouth}"/>
    <path d="M56 91.5 Q64 94 72 91.5 Q68 94.3 64 94.3 Q60 94.3 56 91.5Z" fill="${lipLow}"/>`;

  // The mouth reads its emotion from across the diamond, so it gets a 1.35x
  // scale about its own centre — authored small, displayed legible.
  return `${brows}${eyes}<g transform="translate(64 92) scale(1.35) translate(-64 -92)">${lips}</g>`;
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
