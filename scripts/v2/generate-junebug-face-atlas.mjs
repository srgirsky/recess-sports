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
// iris/pupil. #5a3116 read as light-brown rings, and even #31180c against
// the #26130d lid stroke split into an outline-and-interior two-tone on the
// board — the disc is now a single tone one step off the ink.
const iris = '#2a140b';
const white = '#fff7e4';
const mouth = '#57201c';
const mouthDark = '#3a1512';
const tongue = '#df6c78';

function eye(x, y, { closed = false, wink = false } = {}) {
  if (closed || wink) return `<path d="M${x - 16} ${y} Q${x} ${y + 9} ${x + 16} ${y}" fill="none" stroke="${ink}" stroke-width="7" stroke-linecap="round"/>`;
  // The turnaround's eyes are big CLEAN ROUND near-black discs with ONE small
  // catch-light set high, and essentially no sclera. The v9 disc was right but
  // its catch-light was oversized (r 4.6 on an r 16 iris) and sat mid-height,
  // and the round-2 board read her walleyed/blank — a big centred white blob
  // is a sclera, not a glint. The glint is now SMALL and tucked up under the
  // lid stroke, where the concept paints it; determination comes back the
  // moment the iris reads solid dark.
  return `<circle cx="${x}" cy="${y + 2}" r="16" fill="${iris}"/>
    <path d="M${x - 14.5} ${y - 6} Q${x} ${y - 13} ${x + 14.5} ${y - 6}" fill="none" stroke="${ink}" stroke-width="5" stroke-linecap="round"/>
    <circle cx="${x - 5.5}" cy="${y - 5.5}" r="3.1" fill="${white}"/>`;
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
  // Feature placement is MEASURED off the turnaround front head against the
  // sculpt's face patch (vertical span -1.10..0.44 rad, horizontal ±0.92):
  // brows y~40 (z~3.37), eyes y~71 (z~3.15), mouth y~114.5 (z~2.91) — and the
  // eyes sit far APART (centres ±34px), outer edges near the face's sides,
  // which is also what keeps them visible from the profile. The v6 face
  // clustered everything at centre: eyes 26px apart with bare cheeks, mouth
  // crammed under the nose. A clear 7px skin gap separates brow from eye so
  // the runtime toon ramp cannot merge them into one smudge.
  // Junebug's NEUTRAL is the determined scowl: the brows always angle down
  // toward the nose; 'determined' only deepens what is already there.
  const eyes =
    eye(30, 71, { closed: blink || sleepy }) +
    eye(98, 71, { closed: blink || sleepy, wink });
  const brows =
    brow(30, 40, determined ? 7 : worried ? -5 : 4, 1) +
    brow(98, 40, determined ? -7 : worried ? 5 : -4, -1);
  // No drawn nose: the sculpt carries a real nose form, and a mark on top of
  // it doubled the feature and read as a sticker.

  // The neutral mouth is the turnaround's firm line — wide enough to read at
  // draft-card distance (rubric 3.14), and moved DOWN 3px in step with the
  // sculpt's shortened nose: at y 111.5 the stroke butted the old nose bump's
  // base (nose bottom mapped to y~112) and the round-2 board read the pair as
  // one mustache smudge. The nose now bottoms out at y~103, so a clear
  // philtrum of skin separates it from the lip line. Still no under-stroke:
  // the v6 one shaded the chin and read as a beard patch at hero distance.
  let lips = `<path d="M50 114.5 Q64 112 78 114.5" fill="none" stroke="${ink}" stroke-width="7.5" stroke-linecap="round"/>`;
  // An open smile is a MOUTH, not a crescent sticker: inner cavity, a band of
  // upper teeth, a tongue resting low, and a catch-light lower lip.
  if (name === 'grin' || name === 'cheer') lips = `<path d="M48 104 Q64 109 80 104 Q74 119 64 119 Q54 119 48 104Z" fill="${mouthDark}" stroke="${ink}" stroke-width="2.4"/>
    <path d="M50.5 105.5 Q64 110 77.5 105.5 Q73 111.6 64 111.9 Q55 111.6 50.5 105.5Z" fill="${white}"/>
    <path d="M56.5 117 Q64 120 71.5 117 Q69 113.4 64 113.4 Q59 113.4 56.5 117Z" fill="${tongue}"/>`;
  if (name === 'determined' || name === 'angry') lips = `<path d="M48 117.5 Q64 109 80 117.5" fill="none" stroke="${ink}" stroke-width="7.5" stroke-linecap="round"/>`;
  if (name === 'worried' || name === 'upset') lips = `<path d="M52 117 Q64 107 76 117 Q64 112.5 52 117Z" fill="${mouth}"/>`;
  if (name === 'surprised') lips = `<ellipse cx="64" cy="110" rx="10.5" ry="11.5" fill="${mouth}"/>
    <ellipse cx="64" cy="110" rx="7.5" ry="8.7" fill="${mouthDark}" stroke="${ink}" stroke-width="1.8"/>
    <path d="M57.5 106 Q64 103.8 70.5 106 Q69 109 64 109.2 Q59 109 57.5 106Z" fill="${white}"/>`;
  if (name === 'tongue') lips = `<path d="M48 104 Q64 109 80 104 Q74 118 64 118 Q54 118 48 104Z" fill="${mouthDark}" stroke="${ink}" stroke-width="2.4"/>
    <path d="M50.5 105.5 Q64 110 77.5 105.5 Q73 111 64 111.3 Q55 111 50.5 105.5Z" fill="${white}"/>
    <path d="M57 113 Q56.5 121.5 64 122.5 Q71.5 121.5 71 113 Q64 116 57 113Z" fill="${tongue}" stroke="${ink}" stroke-width="1.8"/>`;
  if (blink || sleepy || wink) lips = `<path d="M50 115 Q64 112.5 78 115" fill="none" stroke="${ink}" stroke-width="7" stroke-linecap="round"/>`;

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
