// OWNER: ui agent. The HUD sticker layer, in the #hud DOM layer.
//
// Structure: a 1920×1080 design-space root scaled to the viewport (capture is
// exactly 1:1), widgets absolutely positioned in design px (widgets.ts), all
// illustration painted on 2x canvases (art.ts), all color via the materials
// palette authority (theme.ts — no hex literals in this directory).
//
// Views: 'pitching' shows the full steam-02 chrome (mini-diamond, VS plate,
// pitch-card stack + CHANGE PITCH, JUICE carton, scoreboard chips); 'batting'
// swaps the pitch stack for the Z/C SWITCH STANCE chip; menu/draft show no HUD
// (those views are later passes). The verdict overlay fills center frame on
// 'bat:contact' ("SQUARED!") or any 'verdict:show {text}'.
//
// Determinism: the verdict pop is animated from 'tick' payloads only — no CSS
// transitions/animations anywhere (they run on wall clock and would break the
// same-seed-same-pixels capture contract). Rotation jitter is hardcoded
// constants, so the HUD never draws from the shared rng stream.

import type { Ctx } from '../core/ctx';
import { FONT, chunkyText, makeTheme, type Theme } from './theme';
import {
  buildChangePitchChip,
  buildJuice,
  buildMatchup,
  buildMiniDiamond,
  buildPitchStack,
  buildScoreboard,
  buildStanceChip,
} from './widgets';

const DESIGN_W = 1920;
const DESIGN_H = 1080;

type TickPayload = { tMs: number; dtMs: number };

class Verdict {
  readonly el: HTMLElement;
  private readonly word: HTMLElement;
  private tNow = 0;
  private tShown = -1;

  constructor(t: Theme) {
    this.el = document.createElement('div');
    Object.assign(this.el.style, {
      position: 'absolute',
      left: '0',
      top: '0',
      width: `${DESIGN_W}px`,
      height: `${DESIGN_H}px`,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      visibility: 'hidden',
      pointerEvents: 'none',
    });
    this.word = chunkyText(t, 'SQUARED!', 210, t.c('hudYellow'), 14);
    Object.assign(this.word.style, {
      filter: `drop-shadow(0 10px 0 ${t.rgba('hudShadow', 0.4)}) drop-shadow(0 16px 26px ${t.rgba('hudShadow', 0.45)})`,
    });
    this.el.appendChild(this.word);
  }

  show(text: string): void {
    this.word.textContent = text;
    this.tShown = this.tNow;
  }

  onTick(tMs: number): void {
    this.tNow = tMs;
    if (this.tShown < 0) return;
    const dt = tMs - this.tShown;
    const IN = 150; // overshoot pop
    const HOLD = 900;
    const OUT = 280;
    if (dt > IN + HOLD + OUT) {
      this.el.style.visibility = 'hidden';
      this.tShown = -1;
      return;
    }
    this.el.style.visibility = 'visible';
    let scale: number;
    let opacity = 1;
    if (dt < IN) {
      const k = dt / IN; // ease-out back: overshoot then settle
      const back = 1.7;
      const e = 1 + (back + 1) * Math.pow(k - 1, 3) + back * Math.pow(k - 1, 2);
      scale = 0.3 + 0.7 * e;
      opacity = Math.min(1, k * 3);
    } else if (dt < IN + HOLD) {
      scale = 1 + 0.015 * Math.sin((dt - IN) / 90); // alive, barely
    } else {
      const k = (dt - IN - HOLD) / OUT;
      scale = 1 + 0.25 * k;
      opacity = 1 - k;
    }
    this.word.style.transform = `rotate(-3deg) scale(${scale.toFixed(4)})`;
    this.word.style.opacity = opacity.toFixed(3);
  }
}

export function init(ctx: Ctx): void {
  const t = makeTheme(ctx);
  const params = ctx.get<{ view: string }>('params');
  const hud = document.getElementById('hud')!;

  const root = document.createElement('div');
  Object.assign(root.style, {
    position: 'absolute',
    left: '0',
    top: '0',
    width: `${DESIGN_W}px`,
    height: `${DESIGN_H}px`,
    transformOrigin: '0 0',
    fontFamily: FONT,
    overflow: 'visible',
    pointerEvents: 'none',
  });
  hud.appendChild(root);

  const fit = (): void => {
    const s = Math.min(window.innerWidth / DESIGN_W, window.innerHeight / DESIGN_H);
    const x = (window.innerWidth - DESIGN_W * s) / 2;
    const y = (window.innerHeight - DESIGN_H * s) / 2;
    root.style.transform = `translate(${x}px, ${y}px) scale(${s})`;
  };
  window.addEventListener('resize', fit);
  fit();

  // Build once, toggle per view.
  const miniDiamond = buildMiniDiamond(t);
  const matchup = buildMatchup(t);
  const pitchStack = buildPitchStack(t);
  const changePitch = buildChangePitchChip(t);
  const stance = buildStanceChip(t);
  const juice = buildJuice(t);
  const scoreboard = buildScoreboard(t);
  const verdict = new Verdict(t);
  root.append(miniDiamond, matchup, pitchStack, changePitch, stance, juice, scoreboard, verdict.el);

  const setView = (view: string): void => {
    const gameplay = view === 'pitching' || view === 'batting';
    // Restore each element's ORIGINAL display (many are flex) — setting '' would
    // silently demote flex rows to block stacks.
    const show = (el: HTMLElement, on: boolean): void => {
      if (el.dataset.disp === undefined) el.dataset.disp = el.style.display || 'block';
      el.style.display = on ? el.dataset.disp : 'none';
    };
    show(miniDiamond, gameplay);
    show(matchup, gameplay);
    show(scoreboard, gameplay);
    show(juice, gameplay);
    show(pitchStack, view === 'pitching');
    show(changePitch, view === 'pitching');
    show(stance, view === 'batting');
  };
  setView(params.view);

  ctx.on('ui:navigate', (p) => setView((p as { view: string }).view));
  ctx.on('tick', (p) => verdict.onTick((p as TickPayload).tMs));
  ctx.on('bat:contact', () => verdict.show('SQUARED!'));
  ctx.on('verdict:show', (p) => verdict.show((p as { text: string }).text));

  ctx.set('ui', {
    root,
    setView,
    showVerdict: (text: string) => verdict.show(text),
  });
}
