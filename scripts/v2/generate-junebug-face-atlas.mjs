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
  if (closed || wink) return `<path d="M${x - 12} ${y} Q${x} ${y + 6} ${x + 12} ${y}" fill="none" stroke="${ink}" stroke-width="5" stroke-linecap="round"/>`;
  return `<path d="M${x - 18} ${y} Q${x} ${y - 12} ${x + 18} ${y} Q${x} ${y + 12} ${x - 18} ${y}Z" fill="${iris}" stroke="${ink}" stroke-width="3.5"/>
    <ellipse cx="${x}" cy="${y + 1}" rx="5.5" ry="7.5" fill="${ink}"/><circle cx="${x - 2}" cy="${y - 2}" r="2.2" fill="${white}"/>`;
}

function brow(x, y, tilt) {
  return `<path d="M${x - 16} ${y - tilt} Q${x} ${y - 4} ${x + 16} ${y + tilt}" fill="none" stroke="${ink}" stroke-width="6" stroke-linecap="round"/>`;
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
    brow(42, 32, determined ? 6 : worried ? -5 : 1) +
    brow(86, 32, determined ? -6 : worried ? 5 : -1);
  const noseMark = `<path d="M63 68 Q61 73 65 74" fill="none" stroke="${nose}" stroke-width="2.5" stroke-linecap="round"/>`;

  let lips = `<path d="M51 89 Q64 93 77 89" fill="none" stroke="${mouth}" stroke-width="5" stroke-linecap="round"/>`;
  if (name === 'grin' || name === 'cheer') lips = `<path d="M47 84 Q64 103 81 84 Q64 94 47 84Z" fill="${mouth}" stroke="${ink}" stroke-width="3"/><path d="M51 86 Q64 93 77 86" fill="none" stroke="${white}" stroke-width="5"/>`;
  if (name === 'determined' || name === 'angry') lips = `<path d="M53 91 L75 89" fill="none" stroke="${mouth}" stroke-width="5" stroke-linecap="round"/>`;
  if (name === 'worried' || name === 'upset') lips = `<path d="M51 96 Q64 82 77 96" fill="none" stroke="${mouth}" stroke-width="5" stroke-linecap="round"/>`;
  if (name === 'surprised') lips = `<ellipse cx="64" cy="90" rx="8" ry="11" fill="${mouth}"/>`;
  if (name === 'tongue') lips = `<path d="M47 84 Q64 103 81 84 Q64 94 47 84Z" fill="${mouth}" stroke="${ink}" stroke-width="3"/><ellipse cx="64" cy="95" rx="8" ry="6" fill="#df6c78"/>`;
  if (blink || sleepy || wink) lips = `<path d="M54 90 Q64 93 74 90" fill="none" stroke="${mouth}" stroke-width="4" stroke-linecap="round"/>`;

  return `${brows}${eyes}${noseMark}${lips}`;
}

const contents = cells.map((name, index) => {
  const x = (index % 4) * 128;
  const y = Math.floor(index / 4) * 128;
  return `<g transform="translate(${x} ${y})">${face(name)}</g>`;
}).join('');

const svg = `<svg width="512" height="512" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg">${contents}</svg>`;
await sharp(Buffer.from(svg)).png().toFile(output);
console.log(`wrote ${output}`);
