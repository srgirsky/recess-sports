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

const ink = '#2b170e';
const iris = '#3b2414';
const white = '#fff7e4';
const mouth = '#681e25';

function eye(x, y, { closed = false, wink = false } = {}) {
  if (closed || wink) return `<path d="M${x - 15} ${y} Q${x} ${y + 8} ${x + 15} ${y}" fill="none" stroke="${ink}" stroke-width="6" stroke-linecap="round"/>`;
  return `<path d="M${x - 17} ${y} Q${x} ${y - 15} ${x + 17} ${y} Q${x} ${y + 15} ${x - 17} ${y}Z" fill="${white}" stroke="${ink}" stroke-width="4"/>
    <ellipse cx="${x}" cy="${y + 1}" rx="7" ry="10" fill="${iris}"/><circle cx="${x - 2}" cy="${y - 2}" r="2.4" fill="${white}"/>`;
}

function brow(x, y, tilt) {
  return `<path d="M${x - 18} ${y - tilt} Q${x} ${y - 5} ${x + 18} ${y + tilt}" fill="none" stroke="${ink}" stroke-width="7" stroke-linecap="round"/>`;
}

function face(name) {
  const blink = name === 'blink';
  const wink = name === 'wink';
  const sleepy = name === 'sleepy';
  const determined = name === 'determined' || name === 'angry';
  const worried = name === 'worried' || name === 'upset';
  const eyes =
    eye(39, 55, { closed: blink || sleepy }) +
    eye(89, 55, { closed: blink || sleepy, wink });
  const brows =
    brow(39, 29, determined ? 7 : worried ? -6 : 1) +
    brow(89, 29, determined ? -7 : worried ? 6 : -1);

  let lips = `<path d="M50 91 Q64 98 78 91" fill="none" stroke="${mouth}" stroke-width="6" stroke-linecap="round"/>`;
  if (name === 'grin' || name === 'cheer') lips = `<path d="M43 86 Q64 111 85 86 Q64 99 43 86Z" fill="${mouth}" stroke="${ink}" stroke-width="3"/><path d="M48 88 Q64 98 80 88" fill="none" stroke="${white}" stroke-width="6"/>`;
  if (name === 'determined' || name === 'angry') lips = `<path d="M50 94 L78 92" fill="none" stroke="${mouth}" stroke-width="6" stroke-linecap="round"/>`;
  if (name === 'worried' || name === 'upset') lips = `<path d="M48 101 Q64 84 80 101" fill="none" stroke="${mouth}" stroke-width="6" stroke-linecap="round"/>`;
  if (name === 'surprised') lips = `<ellipse cx="64" cy="93" rx="10" ry="14" fill="${mouth}"/>`;
  if (name === 'tongue') lips = `<path d="M43 86 Q64 108 85 86 Q64 99 43 86Z" fill="${mouth}" stroke="${ink}" stroke-width="3"/><ellipse cx="64" cy="99" rx="10" ry="7" fill="#df6c78"/>`;
  if (blink || sleepy || wink) lips = `<path d="M51 94 Q64 98 77 94" fill="none" stroke="${mouth}" stroke-width="5" stroke-linecap="round"/>`;

  return `${brows}${eyes}${lips}`;
}

const contents = cells.map((name, index) => {
  const x = (index % 4) * 128;
  const y = Math.floor(index / 4) * 128;
  return `<g transform="translate(${x} ${y})">${face(name)}</g>`;
}).join('');

const svg = `<svg width="512" height="512" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg">${contents}</svg>`;
await sharp(Buffer.from(svg)).png().toFile(output);
console.log(`wrote ${output}`);
