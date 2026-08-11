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
// Sampled off junebug-turnaround.png's front head, not inferred: the sclera
// reads #d1b294 in lid shadow and lifts toward cream in the light, so the flat
// fill sits between the two; the iris body is #33190d and its centre bottoms
// out at #110c07.
const sclera = '#ddc9ac';
const irisBrown = '#33190d';
const pupil = '#120c07';
const white = '#fff7e4';
const mouth = '#57201c';
const mouthDark = '#3a1512';
const tongue = '#df6c78';

// Eye geometry. Scale is fixed by the one ratio that survives the trip from a
// concept render to a shipped GLB — iris diameter over iris SPACING, read off
// both images with the same dark-pixel detector: the concept measures 30/98.5
// = 0.305, and a build tuned by cell-width arithmetic instead measured 0.221,
// i.e. eyes 38% too small. Eye box is then 1.567x the iris (concept 47/30),
// the iris fills the box's HEIGHT, and each iris rides toward the nose so the
// cream survives as an outer crescent — which is what the concept does, and
// what separates a pair of eyes from a pair of holes.
const EYE_HALF_W = 18;
const EYE_HALF_H = 11.5;
const IRIS_R = 11.5;
// The concept's flat front view carries a ~7.75px nasal offset, but the atlas
// lands on a rounded face patch that turns both eyes toward the centre line
// again, and the two convergences stack into a cross-eyed read. Most of the
// determination is carried by the brows regardless, so the offset is kept as a
// hint rather than reproduced literally.
const IRIS_INWARD = 2;
// A quadratic's extremum sits at (P0 + 2*P1 + P2)/4, so a half-height of h
// needs its control point 2h off the corner line.
const almond = (x, y) =>
  `M${x - EYE_HALF_W} ${y} Q${x} ${y - EYE_HALF_H * 2} ${x + EYE_HALF_W} ${y} Q${x} ${y + EYE_HALF_H * 2} ${x - EYE_HALF_W} ${y}Z`;

function eye(x, y, uid, { closed = false, wink = false, inward = 0 } = {}) {
  if (closed || wink) return `<path d="M${x - 17} ${y} Q${x} ${y + 9} ${x + 17} ${y}" fill="none" stroke="${ink}" stroke-width="6" stroke-linecap="round"/>`;
  const id = `iris${uid}`;
  const cx = x + inward;
  // The iris is clipped to the almond so a converged pupil can ride toward the
  // nose without bulging past the lid, which is what reads as walleyed.
  return `<clipPath id="${id}"><path d="${almond(x, y)}"/></clipPath>
    <path d="${almond(x, y)}" fill="${sclera}"/>
    <g clip-path="url(#${id})">
      <circle cx="${cx}" cy="${y + 1}" r="${IRIS_R}" fill="${irisBrown}"/>
      <circle cx="${cx}" cy="${y + 1}" r="6.2" fill="${pupil}"/>
      <circle cx="${cx - 3.6}" cy="${y - 4.5}" r="2.8" fill="${white}"/>
    </g>
    <path d="M${x - EYE_HALF_W} ${y} Q${x} ${y - EYE_HALF_H * 2} ${x + EYE_HALF_W} ${y}" fill="none" stroke="${ink}" stroke-width="5.5" stroke-linecap="round"/>`;
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

function face(name, index) {
  const blink = name === 'blink';
  const wink = name === 'wink';
  const sleepy = name === 'sleepy';
  const determined = name === 'determined' || name === 'angry';
  const worried = name === 'worried' || name === 'upset';
  // Feature placement is MEASURED off the turnaround front head against the
  // sculpt's face patch (vertical span -1.10..0.44 rad, horizontal ±0.92):
  // brows y~40 (z~3.37), eyes y~71 (z~3.15), mouth y~110 (z~2.94) — and the
  // eyes sit far APART (centres ±34px), outer edges near the face's sides,
  // which is also what keeps them visible from the profile. The v6 face
  // clustered everything at centre: eyes 26px apart with bare cheeks, mouth
  // crammed under the nose. The brow-to-eye skin gap works out at ~14px, which
  // is the concept's 23px carried across at the same 68/114 scale.
  // Junebug's NEUTRAL is the determined scowl: the brows always angle down
  // toward the nose; 'determined' only deepens what is already there.
  const eyes =
    eye(30, 71, index * 2, { closed: blink || sleepy, inward: IRIS_INWARD }) +
    eye(98, 71, index * 2 + 1, { closed: blink || sleepy, wink, inward: -IRIS_INWARD });
  // Brows ride at 37, not 40: the concept holds 23px of skin between brow and
  // eye against a 30px eye box, and the taller eye box would otherwise close
  // that gap to nothing and let the toon ramp merge brow into lash.
  const brows =
    brow(30, 37, determined ? 7 : worried ? -5 : 4, 1) +
    brow(98, 37, determined ? -7 : worried ? 5 : -4, -1);
  // No drawn nose: the sculpt carries a real nose form, and a mark on top of
  // it doubled the feature and read as a sticker.

  // The neutral mouth is the turnaround's firm line — wide enough to read at
  // draft-card distance (rubric 3.14). The concept sets it 52px below the eyes
  // against a 30px eye box; at atlas scale that is y~110, and anything lower
  // migrates onto the chin, which is where the round-2 board left it. The
  // control point rides ABOVE the corners so the line turns down at the ends.
  // Still no under-stroke: the v6 one shaded the chin and read as a beard
  // patch at hero distance.
  let lips = `<path d="M50 110.5 Q64 108 78 110.5" fill="none" stroke="${ink}" stroke-width="7.5" stroke-linecap="round"/>`;
  // An open smile is a MOUTH, not a crescent sticker: inner cavity, a band of
  // upper teeth, a tongue resting low, and a catch-light lower lip.
  if (name === 'grin' || name === 'cheer') lips = `<path d="M48 100 Q64 105 80 100 Q74 115 64 115 Q54 115 48 100Z" fill="${mouthDark}" stroke="${ink}" stroke-width="2.4"/>
    <path d="M50.5 101.5 Q64 106 77.5 101.5 Q73 107.6 64 107.9 Q55 107.6 50.5 101.5Z" fill="${white}"/>
    <path d="M56.5 113 Q64 116 71.5 113 Q69 109.4 64 109.4 Q59 109.4 56.5 113Z" fill="${tongue}"/>`;
  if (name === 'determined' || name === 'angry') lips = `<path d="M48 113.5 Q64 105 80 113.5" fill="none" stroke="${ink}" stroke-width="7.5" stroke-linecap="round"/>`;
  if (name === 'worried' || name === 'upset') lips = `<path d="M52 113 Q64 103 76 113 Q64 108.5 52 113Z" fill="${mouth}"/>`;
  if (name === 'surprised') lips = `<ellipse cx="64" cy="106" rx="10.5" ry="11.5" fill="${mouth}"/>
    <ellipse cx="64" cy="106" rx="7.5" ry="8.7" fill="${mouthDark}" stroke="${ink}" stroke-width="1.8"/>
    <path d="M57.5 102 Q64 99.8 70.5 102 Q69 105 64 105.2 Q59 105 57.5 102Z" fill="${white}"/>`;
  if (name === 'tongue') lips = `<path d="M48 100 Q64 105 80 100 Q74 114 64 114 Q54 114 48 100Z" fill="${mouthDark}" stroke="${ink}" stroke-width="2.4"/>
    <path d="M50.5 101.5 Q64 106 77.5 101.5 Q73 107 64 107.3 Q55 107 50.5 101.5Z" fill="${white}"/>
    <path d="M57 109 Q56.5 117.5 64 118.5 Q71.5 117.5 71 109 Q64 112 57 109Z" fill="${tongue}" stroke="${ink}" stroke-width="1.8"/>`;
  if (blink || sleepy || wink) lips = `<path d="M50 111 Q64 108.5 78 111" fill="none" stroke="${ink}" stroke-width="7" stroke-linecap="round"/>`;

  return `${brows}${eyes}${lips}`;
}

const contents = cells.map((name, index) => {
  const x = (index % 4) * 128;
  const y = Math.floor(index / 4) * 128;
  return `<g transform="translate(${x} ${y})">${face(name, index)}</g>`;
}).join('');

const svg = `<svg width="512" height="512" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg">${contents}</svg>`;
// Indexed PNG: the atlas is flat-colour line art, and the palette encoding
// roughly halves its share of the 400KB GLB budget.
await sharp(Buffer.from(svg)).png({ compressionLevel: 9, palette: true }).toFile(output);
console.log(`wrote ${output}`);
