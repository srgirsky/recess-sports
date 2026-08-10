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

  let lips = `<path d="M51 89 Q64 94 77 89" fill="none" stroke="${mouth}" stroke-width="5" stroke-linecap="round"/>
    <path d="M56 96 Q64 99 72 96" fill="none" stroke="${nose}" stroke-width="2" opacity="0.5" stroke-linecap="round"/>`;
  if (name === 'grin' || name === 'cheer') lips = `<path d="M47 84 Q64 103 81 84 Q64 94 47 84Z" fill="${mouth}" stroke="${ink}" stroke-width="3"/><path d="M51 86 Q64 93 77 86" fill="none" stroke="${white}" stroke-width="5"/>`;
  if (name === 'determined' || name === 'angry') lips = `<path d="M53 91 L75 89" fill="none" stroke="${mouth}" stroke-width="5" stroke-linecap="round"/>`;
  if (name === 'worried' || name === 'upset') lips = `<path d="M51 96 Q64 82 77 96" fill="none" stroke="${mouth}" stroke-width="5" stroke-linecap="round"/>`;
  if (name === 'surprised') lips = `<ellipse cx="64" cy="90" rx="8" ry="11" fill="${mouth}"/>`;
  if (name === 'tongue') lips = `<path d="M47 84 Q64 103 81 84 Q64 94 47 84Z" fill="${mouth}" stroke="${ink}" stroke-width="3"/><ellipse cx="64" cy="95" rx="8" ry="6" fill="#df6c78"/>`;
  if (blink || sleepy || wink) lips = `<path d="M54 90 Q64 93 74 90" fill="none" stroke="${mouth}" stroke-width="4" stroke-linecap="round"/>`;

  return `${brows}${eyes}${lips}`;
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
