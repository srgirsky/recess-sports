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
const mouthDark = '#3a1512';
const tongue = '#df6c78';

function eye(x, y, { closed = false, wink = false } = {}) {
  if (closed || wink) return `<path d="M${x - 16} ${y} Q${x} ${y + 9} ${x + 16} ${y}" fill="none" stroke="${ink}" stroke-width="7" stroke-linecap="round"/>`;
  // The turnaround's eyes are big CLEAN ROUND near-black discs with ONE small
  // catch-light set high, and essentially no sclera. The v7 rounded-square
  // path sheared into angular wedges over the patch's UV grid, and its
  // bottom-set glints pooled low and read cross-eyed on the board — a round
  // disc survives interpolation, and a top-placed light reads as focus.
  // A heavy lid stroke flattens the top arc so she stays determined, never
  // startled.
  return `<circle cx="${x}" cy="${y + 2}" r="15.5" fill="${iris}"/>
    <circle cx="${x}" cy="${y + 5}" r="9.5" fill="${ink}"/>
    <path d="M${x - 14} ${y - 6} Q${x} ${y - 14} ${x + 14} ${y - 6}" fill="none" stroke="${ink}" stroke-width="4.5" stroke-linecap="round"/>
    <circle cx="${x - 4.5}" cy="${y - 4}" r="3.4" fill="${white}" opacity="0.95"/>`;
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
  // brows y~40 (z~3.37), eyes y~71 (z~3.15), mouth y~112 (z~2.92) — and the
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

  // The neutral mouth is the turnaround's: a SMALL firm line (~24px — the art
  // mouth is ~16% of the face width), corners a touch below centre, set LOW on
  // clean skin. No lipLow underline on closed mouths: the v6 under-stroke
  // shaded the chin and read as a beard patch at hero distance.
  let lips = `<path d="M52 112 Q64 108.5 76 112" fill="none" stroke="${ink}" stroke-width="7" stroke-linecap="round"/>`;
  // An open smile is a MOUTH, not a crescent sticker: inner cavity, a band of
  // upper teeth, a tongue resting low, and a catch-light lower lip.
  if (name === 'grin' || name === 'cheer') lips = `<path d="M48 102 Q64 107 80 102 Q74 117 64 117 Q54 117 48 102Z" fill="${mouthDark}" stroke="${ink}" stroke-width="2.4"/>
    <path d="M50.5 103.5 Q64 108 77.5 103.5 Q73 109.6 64 109.9 Q55 109.6 50.5 103.5Z" fill="${white}"/>
    <path d="M56.5 115 Q64 118 71.5 115 Q69 111.4 64 111.4 Q59 111.4 56.5 115Z" fill="${tongue}"/>`;
  if (name === 'determined' || name === 'angry') lips = `<path d="M50 114 Q64 106.5 78 114" fill="none" stroke="${ink}" stroke-width="7.5" stroke-linecap="round"/>`;
  if (name === 'worried' || name === 'upset') lips = `<path d="M52 114.5 Q64 104.5 76 114.5 Q64 110 52 114.5Z" fill="${mouth}"/>`;
  if (name === 'surprised') lips = `<ellipse cx="64" cy="107" rx="10.5" ry="11.5" fill="${mouth}"/>
    <ellipse cx="64" cy="107" rx="7.5" ry="8.7" fill="${mouthDark}" stroke="${ink}" stroke-width="1.8"/>
    <path d="M57.5 103 Q64 100.8 70.5 103 Q69 106 64 106.2 Q59 106 57.5 103Z" fill="${white}"/>`;
  if (name === 'tongue') lips = `<path d="M48 102 Q64 107 80 102 Q74 116 64 116 Q54 116 48 102Z" fill="${mouthDark}" stroke="${ink}" stroke-width="2.4"/>
    <path d="M50.5 103.5 Q64 108 77.5 103.5 Q73 109 64 109.3 Q55 109 50.5 103.5Z" fill="${white}"/>
    <path d="M57 111 Q56.5 119.5 64 120.5 Q71.5 119.5 71 111 Q64 114 57 111Z" fill="${tongue}" stroke="${ink}" stroke-width="1.8"/>`;
  if (blink || sleepy || wink) lips = `<path d="M53 112 Q64 109.5 75 112" fill="none" stroke="${ink}" stroke-width="6" stroke-linecap="round"/>`;

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
