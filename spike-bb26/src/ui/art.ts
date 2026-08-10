// OWNER: ui agent. Canvas-painted HUD illustrations — the sticker art layer.
// Every painter is deterministic (no rng, no time): wobbles are hardcoded
// constants. Canvases draw at 2x and are CSS-sized down for crisp edges.
// Colors only via the Theme (palette authority lives in materials/palette.ts).

import { FONT, type Theme } from './theme';

type Painted = { cv: HTMLCanvasElement; g: CanvasRenderingContext2D };

function mk(w: number, h: number): Painted {
  const cv = document.createElement('canvas');
  cv.width = w * 2;
  cv.height = h * 2;
  cv.style.width = `${w}px`;
  cv.style.height = `${h}px`;
  cv.style.display = 'block';
  const g = cv.getContext('2d')!;
  g.scale(2, 2);
  g.lineJoin = 'round';
  g.lineCap = 'round';
  return { cv, g };
}

function rr(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

/** Kite path centered at (cx,cy): home at bottom, CF at top. */
function kite(g: CanvasRenderingContext2D, cx: number, cy: number, rV: number, rH: number): void {
  g.beginPath();
  g.moveTo(cx, cy - rV);
  g.lineTo(cx + rH, cy);
  g.lineTo(cx, cy + rV);
  g.lineTo(cx - rH, cy);
  g.closePath();
}

function mitt(g: CanvasRenderingContext2D, t: Theme, x: number, y: number, s: number): void {
  g.save();
  g.translate(x, y);
  g.fillStyle = t.c('gloveBrown');
  g.strokeStyle = t.dark('gloveBrown', 0.55);
  g.lineWidth = s * 0.22;
  // three-finger cloud + thumb wedge
  g.beginPath();
  g.arc(-s * 0.42, -s * 0.1, s * 0.42, 0, Math.PI * 2);
  g.arc(0, -s * 0.28, s * 0.46, 0, Math.PI * 2);
  g.arc(s * 0.42, -s * 0.08, s * 0.4, 0, Math.PI * 2);
  g.arc(0, s * 0.22, s * 0.55, 0, Math.PI * 2);
  g.fill();
  g.stroke();
  // lighter palm pocket
  g.fillStyle = t.light('gloveBrown', 0.35);
  g.beginPath();
  g.arc(0, s * 0.16, s * 0.34, 0, Math.PI * 2);
  g.fill();
  g.restore();
}

/** Top-left widget: green kite diamond, dirt infield, mitts per fielding spot,
 *  chevron shift cluster with the fat yellow arrow. Sticker border included. */
export function miniDiamond(t: Theme): HTMLCanvasElement {
  const S = 238;
  const { cv, g } = mk(S, S);
  const cx = S / 2;
  const cy = S / 2 + 4;
  // sticker chassis: ink rim, cream border, then field
  kite(g, cx, cy, 112, 96);
  g.lineWidth = 7;
  g.strokeStyle = t.dark('hudGreen', 0.62);
  g.fillStyle = t.c('hudCream');
  g.stroke();
  g.fill();
  kite(g, cx, cy, 99, 84);
  g.fillStyle = t.mix('grassDark', 'hudGreen', 0.35);
  g.fill();
  // mow arcs (lighter bands radiating from home = bottom vertex)
  g.save();
  kite(g, cx, cy, 99, 84);
  g.clip();
  g.strokeStyle = t.rgba('grassLight', 0.5);
  for (let i = 0; i < 4; i += 1) {
    g.lineWidth = 10 + (i % 2) * 4;
    g.beginPath();
    g.arc(cx, cy + 99, 62 + i * 34, Math.PI * 1.18, Math.PI * 1.82);
    g.stroke();
  }
  // dirt infield: rounded arc wedge near home
  g.fillStyle = t.c('dirtTan');
  g.beginPath();
  g.arc(cx, cy + 58, 56, Math.PI * 1.05, Math.PI * 1.95);
  g.closePath();
  g.fill();
  // grass cut inside the infield
  g.fillStyle = t.mix('grassDark', 'hudGreen', 0.2);
  g.beginPath();
  g.arc(cx, cy + 56, 30, Math.PI * 1.08, Math.PI * 1.92);
  g.closePath();
  g.fill();
  g.restore();
  // wobbly chalk lines home→1B / home→3B
  g.strokeStyle = t.rgba('chalkCream', 0.85);
  g.lineWidth = 3;
  g.beginPath();
  g.moveTo(cx, cy + 92);
  g.quadraticCurveTo(cx + 40, cy + 44, cx + 74, cy + 6);
  g.moveTo(cx, cy + 92);
  g.quadraticCurveTo(cx - 40, cy + 44, cx - 74, cy + 6);
  g.stroke();
  // mitts: C, P, 1B, 2B, SS, 3B, LF, CF, RF
  const spots: Array<[number, number]> = [
    [0, 84], [0, 30], [52, 12], [26, -16], [-26, -16], [-52, 12],
    [-56, -46], [0, -66], [56, -46],
  ];
  for (const [dx, dy] of spots) mitt(g, t, cx + dx, cy + dy, 10);
  // shift chevrons around the P spot
  const chev = (dx: number, dy: number, rot: number, fat: boolean): void => {
    g.save();
    g.translate(cx + dx, cy + 26 + dy);
    g.rotate(rot);
    g.fillStyle = fat ? t.c('hudYellow') : t.rgba('hudCream', 0.85);
    g.strokeStyle = t.rgba('hudShadow', 0.45);
    g.lineWidth = 2.5;
    const s = fat ? 15 : 10;
    g.beginPath();
    g.moveTo(-s, -s * 0.55);
    g.lineTo(0, s * 0.55);
    g.lineTo(s, -s * 0.55);
    g.lineTo(s * 0.55, -s);
    g.lineTo(0, -s * 0.1);
    g.lineTo(-s * 0.55, -s);
    g.closePath();
    g.fill();
    g.stroke();
    g.restore();
  };
  chev(-30, 4, Math.PI / 2, false); // left
  chev(30, 4, -Math.PI / 2, false); // right
  chev(0, -26, Math.PI, false); // up
  chev(0, 34, 0, true); // fat yellow down — the active shift
  return cv;
}

export type PortraitSpec = {
  skin: string;
  hair: string;
  cap?: string;
  bg: string;
  style: 'cap' | 'ponytail' | 'crew';
};

/** Round kid portrait for the VS plate and scoreboard logos. */
export function portrait(t: Theme, spec: PortraitSpec): HTMLCanvasElement {
  const S = 62;
  const { cv, g } = mk(S, S);
  const c = S / 2;
  // ring + colored backdrop
  g.beginPath();
  g.arc(c, c, c - 2, 0, Math.PI * 2);
  g.fillStyle = t.light(spec.bg, 0.55);
  g.fill();
  g.lineWidth = 3.5;
  g.strokeStyle = t.c('hudCream');
  g.stroke();
  g.save();
  g.beginPath();
  g.arc(c, c, c - 4, 0, Math.PI * 2);
  g.clip();
  // shoulders
  g.fillStyle = spec.bg;
  g.beginPath();
  g.arc(c, S + 8, 22, 0, Math.PI * 2);
  g.fill();
  // face
  g.fillStyle = t.c(spec.skin);
  g.strokeStyle = t.dark(spec.skin, 0.4);
  g.lineWidth = 2;
  g.beginPath();
  g.arc(c, c + 4, 17, 0, Math.PI * 2);
  g.fill();
  g.stroke();
  // ears
  g.beginPath();
  g.arc(c - 17, c + 5, 4, 0, Math.PI * 2);
  g.arc(c + 17, c + 5, 4, 0, Math.PI * 2);
  g.fill();
  // hair behind
  g.fillStyle = t.c(spec.hair);
  if (spec.style === 'ponytail') {
    g.beginPath();
    g.arc(c, c - 2, 18.5, Math.PI * 0.95, Math.PI * 2.05);
    g.fill();
    g.beginPath();
    g.ellipse(c + 16, c + 12, 7, 15, -0.35, 0, Math.PI * 2);
    g.fill();
  } else {
    g.beginPath();
    g.arc(c, c - 1, 18, Math.PI * 1.02, Math.PI * 1.98);
    g.fill();
  }
  // cap
  if (spec.style === 'cap' && spec.cap) {
    g.fillStyle = t.c(spec.cap);
    g.strokeStyle = t.dark(spec.cap, 0.4);
    g.lineWidth = 2;
    g.beginPath();
    g.arc(c, c - 3, 17.5, Math.PI, Math.PI * 2);
    g.closePath();
    g.fill();
    g.stroke();
    rr(g, c - 19, c - 6, 24, 6, 3);
    g.fill();
    g.stroke();
    g.fillStyle = t.light(spec.cap!, 0.3);
    g.beginPath();
    g.arc(c, c - 12, 3, 0, Math.PI * 2);
    g.fill();
  }
  // eyes + glints
  g.fillStyle = t.c('hudCream');
  g.beginPath();
  g.ellipse(c - 6.5, c + 3, 4.4, 5.2, 0, 0, Math.PI * 2);
  g.ellipse(c + 6.5, c + 3, 4.4, 5.2, 0, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = t.c('hudInk');
  g.beginPath();
  g.arc(c - 5.5, c + 4, 2.2, 0, Math.PI * 2);
  g.arc(c + 7.5, c + 4, 2.2, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = t.c('cloudLit');
  g.beginPath();
  g.arc(c - 6.3, c + 3, 0.9, 0, Math.PI * 2);
  g.arc(c + 6.7, c + 3, 0.9, 0, Math.PI * 2);
  g.fill();
  // smile
  g.strokeStyle = t.dark(spec.skin, 0.55);
  g.lineWidth = 2;
  g.beginPath();
  g.arc(c, c + 9, 6, Math.PI * 0.15, Math.PI * 0.85);
  g.stroke();
  g.restore();
  return cv;
}

function baseball(g: CanvasRenderingContext2D, t: Theme, x: number, y: number, r: number): void {
  g.fillStyle = t.c('ballWhite');
  g.strokeStyle = t.dark('ballWhite', 0.45);
  g.lineWidth = r * 0.14;
  g.beginPath();
  g.arc(x, y, r, 0, Math.PI * 2);
  g.fill();
  g.stroke();
  g.strokeStyle = t.c('ballStitch');
  g.lineWidth = r * 0.13;
  g.beginPath();
  g.arc(x - r * 1.15, y, r * 0.95, -0.6, 0.6);
  g.stroke();
  g.beginPath();
  g.arc(x + r * 1.15, y, r * 0.95, Math.PI - 0.6, Math.PI + 0.6);
  g.stroke();
}

/** Thick yellow motion swoosh with an arrowhead — the HOOK card art. */
function swoosh(g: CanvasRenderingContext2D, t: Theme, flip: boolean): void {
  g.save();
  if (flip) {
    g.translate(120, 0);
    g.scale(-1, 1);
  }
  g.strokeStyle = t.c('hudYellow');
  g.lineWidth = 13;
  g.beginPath();
  g.moveTo(18, 18);
  g.quadraticCurveTo(78, 8, 86, 46);
  g.stroke();
  g.fillStyle = t.c('hudYellow');
  g.beginPath();
  g.moveTo(72, 48);
  g.lineTo(100, 44);
  g.lineTo(84, 68);
  g.closePath();
  g.fill();
  g.restore();
}

export type PitchKind = 'heat' | 'rightHook' | 'leftHook' | 'slow' | 'special';

/** Illustration block for a pitch card (drawn on transparent, card supplies bg). */
export function pitchArt(t: Theme, kind: PitchKind): HTMLCanvasElement {
  const { cv, g } = mk(120, 84);
  if (kind === 'heat') {
    // flaming ball riding a bat
    g.save();
    g.translate(60, 46);
    g.rotate(-0.5);
    // bat
    const grad = g.createLinearGradient(-46, 0, 48, 0);
    grad.addColorStop(0, t.dark('batWood', 0.25));
    grad.addColorStop(1, t.c('batWood'));
    g.fillStyle = grad;
    g.strokeStyle = t.dark('batWood', 0.5);
    g.lineWidth = 3;
    g.beginPath();
    g.moveTo(-46, -4);
    g.lineTo(10, -8.5);
    g.quadraticCurveTo(48, -11, 48, 0);
    g.quadraticCurveTo(48, 11, 10, 8.5);
    g.lineTo(-46, 4);
    g.closePath();
    g.fill();
    g.stroke();
    // knob
    g.beginPath();
    g.arc(-48, 0, 6, 0, Math.PI * 2);
    g.fill();
    g.stroke();
    g.restore();
    // flame tail
    g.fillStyle = t.c('hudOrange');
    g.beginPath();
    g.moveTo(14, 14);
    g.quadraticCurveTo(40, 2, 62, 16);
    g.quadraticCurveTo(44, 22, 36, 20);
    g.quadraticCurveTo(26, 24, 14, 14);
    g.closePath();
    g.fill();
    g.fillStyle = t.c('hudYellow');
    g.beginPath();
    g.moveTo(28, 16);
    g.quadraticCurveTo(48, 8, 62, 17);
    g.quadraticCurveTo(46, 20, 28, 16);
    g.closePath();
    g.fill();
    baseball(g, t, 74, 22, 15);
  } else if (kind === 'rightHook' || kind === 'leftHook') {
    swoosh(g, t, kind === 'leftHook');
    baseball(g, t, kind === 'leftHook' ? 88 : 32, 56, 17);
  } else if (kind === 'slow') {
    // dozy ball drifting down with dashed trail
    g.strokeStyle = t.rgba('hudYellow', 0.9);
    g.lineWidth = 7;
    g.setLineDash([10, 12]);
    g.beginPath();
    g.moveTo(20, 14);
    g.quadraticCurveTo(58, 6, 74, 40);
    g.stroke();
    g.setLineDash([]);
    baseball(g, t, 76, 52, 17);
    // Zz
    g.fillStyle = t.c('hudCream');
    g.font = `900 20px ${FONT}`;
    g.fillText('z', 26, 52);
    g.font = `900 14px ${FONT}`;
    g.fillText('z', 40, 40);
  } else {
    // mystery crate with ??
    g.save();
    g.translate(60, 44);
    g.rotate(-0.12);
    g.fillStyle = t.mix('hudInk', 'hudCream', 0.28);
    g.strokeStyle = t.dark('hudInk', 0.3);
    g.lineWidth = 3.5;
    rr(g, -30, -26, 60, 54, 7);
    g.fill();
    g.stroke();
    g.strokeStyle = t.mix('hudInk', 'hudCream', 0.5);
    g.lineWidth = 6;
    g.beginPath();
    g.moveTo(-30, 0);
    g.lineTo(30, 0);
    g.moveTo(0, -26);
    g.lineTo(0, 28);
    g.stroke();
    g.fillStyle = t.c('hudCream');
    g.font = `900 26px ${FONT}`;
    g.textAlign = 'center';
    g.fillText('?', -13, 20);
    g.font = `900 20px ${FONT}`;
    g.fillText('?', 15, -6);
    g.restore();
  }
  return cv;
}

/** JUICE 110% carton with gable top and a bendy straw-pole. */
export function juiceCarton(t: Theme): HTMLCanvasElement {
  const W = 170;
  const H = 230;
  const { cv, g } = mk(W, H);
  g.save();
  g.translate(6, 54);
  // straw: rises from the gable, elbows up-right
  g.strokeStyle = t.c('hudOrange');
  g.lineWidth = 13;
  g.beginPath();
  g.moveTo(96, 6);
  g.lineTo(102, -30);
  g.quadraticCurveTo(106, -46, 122, -44);
  g.stroke();
  g.strokeStyle = t.dark('hudOrange', 0.35);
  g.lineWidth = 3;
  g.beginPath();
  g.moveTo(99, -12);
  g.lineTo(107, -10);
  g.stroke();
  // carton body — squashed trapezoid, red with darker side panel
  const bodyTop = 26;
  g.fillStyle = t.c('hudRed');
  g.strokeStyle = t.dark('hudRed', 0.5);
  g.lineWidth = 4;
  g.beginPath();
  g.moveTo(18, bodyTop);
  g.lineTo(134, bodyTop);
  g.lineTo(142, 160);
  g.quadraticCurveTo(142, 168, 134, 168);
  g.lineTo(14, 168);
  g.quadraticCurveTo(6, 168, 8, 160);
  g.closePath();
  g.fill();
  g.stroke();
  // side shade
  g.fillStyle = t.dark('hudRed', 0.3);
  g.beginPath();
  g.moveTo(118, bodyTop);
  g.lineTo(134, bodyTop);
  g.lineTo(142, 160);
  g.quadraticCurveTo(142, 168, 134, 168);
  g.lineTo(122, 168);
  g.closePath();
  g.fill();
  // gable top
  g.fillStyle = t.c('hudOrange');
  g.strokeStyle = t.dark('hudOrange', 0.45);
  g.lineWidth = 4;
  g.beginPath();
  g.moveTo(18, bodyTop);
  g.lineTo(40, -2);
  g.lineTo(112, -2);
  g.lineTo(134, bodyTop);
  g.closePath();
  g.fill();
  g.stroke();
  // fold ridge
  g.fillStyle = t.light('hudOrange', 0.3);
  rr(g, 44, -10, 64, 12, 5);
  g.fill();
  g.stroke();
  // JUICE lettering, per-letter bounce
  g.fillStyle = t.c('hudYellow');
  g.strokeStyle = t.dark('hudRed', 0.55);
  g.lineWidth = 5;
  g.font = `900 40px ${FONT}`;
  g.textAlign = 'center';
  const word = 'JUICE';
  const bounce = [0, -5, -8, -5, 0];
  const rot = [-0.12, -0.06, 0, 0.06, 0.12];
  for (let i = 0; i < word.length; i += 1) {
    g.save();
    g.translate(38 + i * 19.5, 72 + bounce[i]!);
    g.rotate(rot[i]!);
    g.strokeText(word[i]!, 0, 0);
    g.fillText(word[i]!, 0, 0);
    g.restore();
  }
  // starburst + 110%
  g.save();
  g.translate(75, 122);
  g.rotate(-0.1);
  g.fillStyle = t.c('hudYellow');
  g.strokeStyle = t.dark('hudOrange', 0.35);
  g.lineWidth = 3;
  g.beginPath();
  const spikes = 12;
  for (let i = 0; i < spikes * 2; i += 1) {
    const r = i % 2 === 0 ? 46 : 32;
    const a = (i / (spikes * 2)) * Math.PI * 2 - Math.PI / 2;
    const x = Math.cos(a) * r * 1.15;
    const y = Math.sin(a) * r * 0.82;
    if (i === 0) g.moveTo(x, y);
    else g.lineTo(x, y);
  }
  g.closePath();
  g.fill();
  g.stroke();
  g.fillStyle = t.c('hudRed');
  g.font = `900 34px ${FONT}`;
  g.textAlign = 'center';
  g.fillText('110%', 0, 12);
  g.restore();
  g.restore();
  return cv;
}

/** Round team logo: star kid or bear critter. */
export function teamLogo(t: Theme, kind: 'star' | 'bear'): HTMLCanvasElement {
  const S = 44;
  const { cv, g } = mk(S, S);
  const c = S / 2;
  g.beginPath();
  g.arc(c, c, c - 2, 0, Math.PI * 2);
  g.fillStyle = kind === 'star' ? t.c('hudPurple') : t.mix('gloveBrown', 'hudYellow', 0.25);
  g.fill();
  g.lineWidth = 3;
  g.strokeStyle = t.c('hudCream');
  g.stroke();
  if (kind === 'star') {
    g.fillStyle = t.c('hudYellow');
    g.strokeStyle = t.dark('hudPurple', 0.4);
    g.lineWidth = 2;
    g.beginPath();
    for (let i = 0; i < 10; i += 1) {
      const r = i % 2 === 0 ? 15 : 6.5;
      const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
      const x = c + Math.cos(a) * r;
      const y = c + Math.sin(a) * r;
      if (i === 0) g.moveTo(x, y);
      else g.lineTo(x, y);
    }
    g.closePath();
    g.fill();
    g.stroke();
    // face on the star
    g.fillStyle = t.c('hudInk');
    g.beginPath();
    g.arc(c - 3.5, c - 1, 1.6, 0, Math.PI * 2);
    g.arc(c + 3.5, c - 1, 1.6, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = t.c('hudInk');
    g.lineWidth = 1.6;
    g.beginPath();
    g.arc(c, c + 2.5, 3.5, Math.PI * 0.2, Math.PI * 0.8);
    g.stroke();
  } else {
    // bear: ears, muzzle, cap
    g.fillStyle = t.c('gloveBrown');
    g.beginPath();
    g.arc(c - 9, c - 8, 5, 0, Math.PI * 2);
    g.arc(c + 9, c - 8, 5, 0, Math.PI * 2);
    g.fill();
    g.beginPath();
    g.arc(c, c + 1, 12, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = t.light('gloveBrown', 0.45);
    g.beginPath();
    g.ellipse(c, c + 5, 6.5, 5, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = t.c('hudInk');
    g.beginPath();
    g.arc(c - 4.5, c - 2, 1.7, 0, Math.PI * 2);
    g.arc(c + 4.5, c - 2, 1.7, 0, Math.PI * 2);
    g.arc(c, c + 3.5, 2.2, 0, Math.PI * 2);
    g.fill();
  }
  return cv;
}

export function gearIcon(t: Theme): HTMLCanvasElement {
  const S = 30;
  const { cv, g } = mk(S, S);
  const c = S / 2;
  g.fillStyle = t.c('hudCream');
  g.strokeStyle = t.dark('hudRed', 0.5);
  g.lineWidth = 2;
  for (let i = 0; i < 8; i += 1) {
    g.save();
    g.translate(c, c);
    g.rotate((i / 8) * Math.PI * 2);
    rr(g, -3, -12.5, 6, 7, 2);
    g.fill();
    g.restore();
  }
  g.beginPath();
  g.arc(c, c, 8.5, 0, Math.PI * 2);
  g.fill();
  g.stroke();
  g.fillStyle = t.c('hudRed');
  g.beginPath();
  g.arc(c, c, 3.5, 0, Math.PI * 2);
  g.fill();
  return cv;
}

export function whistleIcon(t: Theme): HTMLCanvasElement {
  const S = 30;
  const { cv, g } = mk(S, S);
  g.fillStyle = t.c('hudCream');
  g.strokeStyle = t.dark('hudRed', 0.5);
  g.lineWidth = 2;
  // body
  g.beginPath();
  g.arc(13, 18, 8, 0, Math.PI * 2);
  g.fill();
  g.stroke();
  // mouthpiece
  rr(g, 15, 8, 13, 6, 3);
  g.fill();
  g.stroke();
  // pea
  g.fillStyle = t.c('hudRed');
  g.beginPath();
  g.arc(13, 18, 3, 0, Math.PI * 2);
  g.fill();
  return cv;
}

/** Q/E/R/F key cluster for the CHANGE PITCH chip. */
export function keyCluster(t: Theme): HTMLCanvasElement {
  const S = 58;
  const { cv, g } = mk(S, S);
  const key = (x: number, y: number, label: string): void => {
    g.fillStyle = t.c('hudCream');
    g.strokeStyle = t.dark('hudBlue', 0.3);
    g.lineWidth = 2;
    rr(g, x - 9, y - 9, 18, 18, 4);
    g.fill();
    g.stroke();
    g.fillStyle = t.c('hudInk');
    g.font = `900 10px ${FONT}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(label, x, y + 1);
  };
  key(29, 11, 'R');
  key(11, 29, 'Q');
  key(47, 29, 'E');
  key(29, 47, 'F');
  return cv;
}
