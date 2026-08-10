// OWNER: ui agent. DOM builders for every HUD sticker. All positions are in
// the 1920×1080 design space (index.ts scales the root to the real viewport).
// Sticker doctrine: cream fields, thick colored borders, rounded corners, drop
// shadows, hardcoded per-element rotation jitter — zero flat rectangles.

import {
  gearIcon,
  juiceCarton,
  keyCluster,
  miniDiamond,
  pitchArt,
  portrait,
  teamLogo,
  whistleIcon,
  type PitchKind,
} from './art';
import { FONT, chunkyText, keyChip, sticker, type Theme } from './theme';

function abs(el: HTMLElement, x: Partial<CSSStyleDeclaration>): void {
  Object.assign(el.style, { position: 'absolute', ...x });
}

function shadowed(cv: HTMLCanvasElement, t: Theme, rotDeg: number): HTMLDivElement {
  const wrap = document.createElement('div');
  wrap.appendChild(cv);
  abs(wrap, {
    filter: `drop-shadow(0 6px 8px ${t.rgba('hudShadow', 0.4)})`,
    transform: `rotate(${rotDeg}deg)`,
  });
  return wrap;
}

// ---------------------------------------------------------------- mini-diamond
export function buildMiniDiamond(t: Theme): HTMLElement {
  const wrap = shadowed(miniDiamond(t), t, -2);
  abs(wrap, { left: '26px', top: '20px' });
  return wrap;
}

// ------------------------------------------------------------- VS matchup plate
type CardSide = 'left' | 'right';

function nameCard(
  t: Theme,
  color: string,
  name: string,
  sub: string,
  face: HTMLCanvasElement,
  side: CardSide,
  rotDeg: number,
): HTMLElement {
  const card = document.createElement('div');
  sticker(t, card, { border: t.c(color), borderW: 4, radius: 14, rotDeg, pad: '6px 12px' });
  Object.assign(card.style, {
    position: 'relative',
    width: '224px',
    height: '64px',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    alignItems: side === 'left' ? 'flex-end' : 'flex-start',
    gap: '3px',
  });
  const nm = chunkyText(t, name, 22, t.c(color), 0);
  const band = document.createElement('div');
  band.textContent = sub;
  Object.assign(band.style, {
    fontFamily: FONT,
    fontWeight: '900',
    fontSize: '13px',
    color: t.c('hudCream'),
    background: t.c(color),
    borderRadius: '8px',
    padding: '2px 10px',
    letterSpacing: '1px',
    whiteSpace: 'nowrap',
  });
  card.append(nm, band);
  const pWrap = document.createElement('div');
  abs(pWrap, {
    top: '-6px',
    [side === 'left' ? 'left' : 'right']: '-14px',
    filter: `drop-shadow(0 3px 4px ${t.rgba('hudShadow', 0.35)})`,
  } as Partial<CSSStyleDeclaration>);
  pWrap.appendChild(face);
  card.appendChild(pWrap);
  // keep text clear of the portrait
  Object.assign(nm.style, side === 'left' ? { marginRight: '4px' } : { marginLeft: '4px' });
  Object.assign(band.style, side === 'left' ? { marginRight: '4px' } : { marginLeft: '4px' });
  return card;
}

export function buildMatchup(t: Theme): HTMLElement {
  const row = document.createElement('div');
  abs(row, { right: '34px', top: '26px', display: 'flex', alignItems: 'center' });
  const left = nameCard(
    t,
    'hudRed',
    'JUNEBUG',
    '0 FOR 0 TODAY',
    portrait(t, { skin: 'skinTan', hair: 'hairOrange', cap: 'capGreen', bg: 'hudRed', style: 'cap' }),
    'left',
    -1.4,
  );
  const right = nameCard(
    t,
    'hudBlue',
    'LEFTY LU',
    '0 K · 0 BB',
    portrait(t, { skin: 'skinBrown', hair: 'hairBlack', bg: 'hudBlue', style: 'ponytail' }),
    'right',
    1.2,
  );
  // VS wedge overlaps both cards
  const vs = document.createElement('div');
  sticker(t, vs, { bg: t.c('hudYellow'), border: t.dark('hudYellow', 0.45), borderW: 3, radius: 10, rotDeg: -8 });
  Object.assign(vs.style, {
    position: 'relative',
    zIndex: '2',
    margin: '0 -10px',
    width: '46px',
    height: '40px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  });
  const vsText = chunkyText(t, 'VS', 20, t.c('hudInk'), 0);
  vsText.style.fontStyle = 'italic';
  vs.appendChild(vsText);
  row.append(left, vs, right);
  return row;
}

// ------------------------------------------------------------- pitch card stack
function pitchCard(
  t: Theme,
  label: string,
  kind: PitchKind,
  color: string,
  w: number,
  h: number,
  rotDeg: number,
  selected: boolean,
): HTMLElement {
  const card = document.createElement('div');
  const bg = `linear-gradient(180deg, ${t.light(color, 0.22)} 0%, ${t.c(color)} 55%, ${t.dark(color, 0.18)} 100%)`;
  sticker(t, card, { bg, border: t.light(color, 0.55), borderW: 4, radius: 16, rotDeg });
  Object.assign(card.style, {
    position: 'relative',
    width: `${w}px`,
    height: `${h}px`,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'flex-start',
    flex: 'none',
  });
  if (selected) {
    card.style.boxShadow = `0 0 0 4px ${t.rgba('hudYellow', 0.9)}, 0 8px 14px ${t.rgba('hudShadow', 0.45)}`;
  }
  const lbl = chunkyText(t, label, label.length > 8 ? 21 : 26, t.c('hudCream'), 4);
  Object.assign(lbl.style, { marginTop: '8px', letterSpacing: '0.5px' });
  if (selected) lbl.style.color = t.c('hudYellow');
  const art = pitchArt(t, kind);
  Object.assign(art.style, { marginTop: '-4px' });
  card.append(lbl, art);
  return card;
}

export function buildPitchStack(t: Theme): HTMLElement {
  const col = document.createElement('div');
  abs(col, {
    right: '30px',
    top: '244px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-end',
    gap: '16px',
  });
  // top row: SPECIAL tucks left of the (selected) HEAT card
  const rowTop = document.createElement('div');
  Object.assign(rowTop.style, { display: 'flex', alignItems: 'flex-start', gap: '14px' });
  rowTop.append(
    pitchCard(t, 'SPECIAL', 'special', 'hudInk', 152, 112, -2.5, false),
    pitchCard(t, 'HEAT', 'heat', 'hudBlue', 170, 128, 1.6, true),
  );
  col.append(
    rowTop,
    pitchCard(t, 'RIGHT HOOK', 'rightHook', 'hudPurple', 164, 116, -1.2, false),
    pitchCard(t, 'LEFT HOOK', 'leftHook', 'hudPurple', 164, 116, 1.8, false),
    pitchCard(t, 'SLOW BALL', 'slow', 'hudPurple', 164, 116, -1.6, false),
  );
  return col;
}

// ------------------------------------------------------------------ pill chips
function darkPill(t: Theme, rotDeg: number): HTMLElement {
  const pill = document.createElement('div');
  sticker(t, pill, {
    bg: t.rgba('hudInk', 0.82),
    border: t.rgba('hudCream', 0.35),
    borderW: 3,
    radius: 26,
    rotDeg,
    pad: '8px 20px',
  });
  Object.assign(pill.style, { display: 'flex', alignItems: 'center', gap: '12px' });
  return pill;
}

export function buildChangePitchChip(t: Theme): HTMLElement {
  const pill = darkPill(t, -1);
  abs(pill, { right: '244px', top: '818px' });
  pill.appendChild(keyCluster(t));
  pill.appendChild(chunkyText(t, 'CHANGE PITCH', 24, t.c('hudCream'), 0));
  return pill;
}

export function buildStanceChip(t: Theme): HTMLElement {
  const pill = darkPill(t, -0.8);
  abs(pill, { left: '560px', bottom: '44px' });
  pill.append(keyChip(t, 'Z', 30), keyChip(t, 'C', 30), chunkyText(t, 'SWITCH STANCE', 24, t.c('hudCream'), 0));
  return pill;
}

// ----------------------------------------------------------------- juice carton
export function buildJuice(t: Theme): HTMLElement {
  const wrap = shadowed(juiceCarton(t), t, 2.2);
  abs(wrap, { right: '34px', bottom: '20px' });
  return wrap;
}

// ------------------------------------------------------------------- scoreboard
function pipRow(t: Theme, letter: string, n: number, litColor: string, lit: number): HTMLElement {
  const row = document.createElement('div');
  Object.assign(row.style, { display: 'flex', alignItems: 'center', gap: '5px' });
  const l = chunkyText(t, letter, 15, t.c('hudCream'), 0);
  l.style.width = '14px';
  row.appendChild(l);
  for (let i = 0; i < n; i += 1) {
    const dot = document.createElement('span');
    Object.assign(dot.style, {
      width: '11px',
      height: '11px',
      borderRadius: '50%',
      background: i < lit ? t.c(litColor) : t.rgba('hudCream', 0.22),
      border: `2px solid ${t.rgba('hudShadow', 0.55)}`,
      boxShadow: i < lit ? `0 0 5px ${t.rgba(litColor, 0.8)}` : 'none',
      display: 'inline-block',
    });
    row.appendChild(dot);
  }
  return row;
}

export function buildScoreboard(t: Theme): HTMLElement {
  const group = document.createElement('div');
  abs(group, { left: '30px', bottom: '26px', display: 'flex', flexDirection: 'column', gap: '10px' });

  // chips row: settings + whistle
  const chips = document.createElement('div');
  Object.assign(chips.style, { display: 'flex', gap: '12px', paddingLeft: '6px' });
  const chip = (icon: HTMLCanvasElement, key: string, rotDeg: number): HTMLElement => {
    const c = document.createElement('div');
    sticker(t, c, { bg: t.c('hudRed'), border: t.dark('hudRed', 0.45), borderW: 3, radius: 12, rotDeg, pad: '5px 10px' });
    Object.assign(c.style, { position: 'relative', display: 'flex', alignItems: 'center', gap: '8px' });
    c.append(icon, keyChip(t, key, 24));
    return c;
  };
  chips.append(chip(gearIcon(t), 'ESC', -1.5), chip(whistleIcon(t), 'T', 1.2));

  // main panel
  const panel = document.createElement('div');
  sticker(t, panel, {
    bg: `linear-gradient(180deg, ${t.mix('hudGreen', 'hudInk', 0.45)} 0%, ${t.mix('hudGreen', 'hudInk', 0.62)} 100%)`,
    border: t.c('hudCream'),
    borderW: 4,
    radius: 16,
    rotDeg: -1,
    pad: '8px 12px',
  });
  Object.assign(panel.style, {
    position: 'relative',
    width: '296px',
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
  });

  const scoreRow = document.createElement('div');
  Object.assign(scoreRow.style, { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px' });
  const score = (v: string): HTMLElement => {
    const s = chunkyText(t, v, 30, t.c('hudYellow'), 0);
    const box = document.createElement('div');
    Object.assign(box.style, {
      background: t.rgba('hudShadow', 0.45),
      border: `2px solid ${t.rgba('hudCream', 0.25)}`,
      borderRadius: '9px',
      padding: '2px 10px',
    });
    box.appendChild(s);
    return box;
  };
  const dash = chunkyText(t, '·', 22, t.rgba('hudCream', 0.6), 0);
  scoreRow.append(teamLogo(t, 'star'), score('00'), dash, score('00'), teamLogo(t, 'bear'));

  const inning = document.createElement('div');
  Object.assign(inning.style, {
    background: t.rgba('hudShadow', 0.4),
    border: `2px solid ${t.rgba('hudCream', 0.22)}`,
    borderRadius: '9px',
    padding: '3px 0',
    display: 'flex',
    justifyContent: 'center',
  });
  inning.appendChild(chunkyText(t, 'TOP OF INNING 1', 16, t.c('hudCream'), 0));

  const pips = document.createElement('div');
  Object.assign(pips.style, { display: 'flex', justifyContent: 'space-between', padding: '0 10px 2px' });
  pips.append(pipRow(t, 'B', 3, 'hudBlue', 0), pipRow(t, 'S', 2, 'hudYellow', 0), pipRow(t, 'O', 2, 'hudRed', 0));

  panel.append(scoreRow, inning, pips);
  group.append(chips, panel);
  return group;
}
