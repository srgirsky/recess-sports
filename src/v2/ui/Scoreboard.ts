// ---------------------------------------------------------------------------
// The scoreboard, drawn. `scoreboardModel.ts` decides what it says.
//
// ★ WHAT THIS REPLACES. The play view had been printing one string —
// "▲1  ROCKETS 0 – 0 COMETS   0-0  ●○○  ◇◇◇  🏏 YOU BAT" — into a single pill.
// It was honest about being a debug readout and it is not something you hand a
// six-year-old: the count is two digits that mean nothing until you can read,
// the bases are three identical glyphs in a row rather than a diamond, and
// nothing about it changes VISIBLY when a pitch changes it. v1's equivalent is
// a bottom strip with pips that pulse; this is that, in DOM.
//
// ★ IT BUILDS ONCE AND DIFFS. A scoreboard repainted from a template string
// every frame re-creates ~30 nodes 60 times a second and throws away the pulse
// animation each time, because a fresh element has no running animation to
// carry. So the structure is built in the constructor and `update` touches only
// what changed — which is also what makes "pulse WHEN a pip lights" expressible
// at all.
//
// ★ AND NOTHING HERE IS `.interactive`. `#hud` is `pointer-events: none` and
// only `.interactive` opts back in, so this cannot eat a tap meant for the bat.
// That is one CSS rule standing in for v1's whole stopPropagation discipline.
// ---------------------------------------------------------------------------

import { halfMark, type Pips, type ScoreboardModel } from './scoreboardModel';

function el(tag: string, className?: string, text?: string): HTMLElement {
  const n = document.createElement(tag);
  if (className) n.className = className;
  if (text !== undefined) n.textContent = text;
  return n;
}

/** One row of pips, rebuilt only when a pip changes state. */
class PipRow {
  readonly root: HTMLElement;
  private readonly dots: HTMLElement[] = [];
  private lit = 0;

  constructor(label: string, of: number, modifier: string) {
    this.root = el('div', `sb-pips sb-pips--${modifier}`);
    this.root.appendChild(el('span', 'sb-pips__label', label));
    const track = el('span', 'sb-pips__track');
    for (let i = 0; i < of; i++) {
      const dot = el('i', 'sb-pip');
      this.dots.push(dot);
      track.appendChild(dot);
    }
    this.root.appendChild(track);
  }

  set(p: Pips): void {
    if (p.lit === this.lit) return;
    // ★ PULSE ONLY THE PIP THAT JUST LIT, and only when the count went UP. A
    // reset to 0-0 lights nothing, and pulsing the whole row on every change
    // makes the one that matters invisible — the thing the readout is for is
    // "something just happened to YOU", which is a single pip's job.
    const rising = p.lit > this.lit;
    this.dots.forEach((dot, i) => {
      const on = i < p.lit;
      dot.classList.toggle('is-lit', on);
      if (rising && i === p.lit - 1) {
        dot.classList.remove('is-new');
        // Force a reflow so the animation restarts even when the same pip
        // re-lights; without it the class is added in the same frame it was
        // removed and the browser coalesces them into no change at all.
        void dot.offsetWidth;
        dot.classList.add('is-new');
      }
    });
    this.lit = p.lit;
  }
}

/** One team's name and runs. */
class SideRow {
  readonly root: HTMLElement;
  private readonly nameEl: HTMLElement;
  private readonly runsEl: HTMLElement;
  private readonly markEl: HTMLElement;
  private last = { name: '', runs: -1, batting: false };

  constructor() {
    this.root = el('div', 'sb-side');
    this.markEl = el('span', 'sb-side__mark', '▶');
    this.nameEl = el('span', 'sb-side__name');
    this.runsEl = el('span', 'sb-side__runs');
    this.root.append(this.markEl, this.nameEl, this.runsEl);
  }

  set(name: string, runs: number, batting: boolean): void {
    if (name !== this.last.name) this.nameEl.textContent = name;
    if (runs !== this.last.runs) this.runsEl.textContent = String(runs);
    if (batting !== this.last.batting) this.root.classList.toggle('is-batting', batting);
    this.last = { name, runs, batting };
  }
}

export class Scoreboard {
  readonly root: HTMLElement;
  private readonly away = new SideRow();
  private readonly home = new SideRow();
  private readonly inningEl: HTMLElement;
  private readonly batterEl: HTMLElement;
  private readonly verbEl: HTMLElement;
  private readonly balls = new PipRow('B', 3, 'balls');
  private readonly strikes = new PipRow('S', 2, 'strikes');
  private readonly outs = new PipRow('OUT', 3, 'outs');
  private readonly bags: HTMLElement[] = [];
  private last = { inning: '', batter: '', verb: '', bases: '' };

  constructor() {
    this.root = el('div', 'sb');

    const teams = el('div', 'sb__teams');
    teams.append(this.away.root, this.home.root);

    const middle = el('div', 'sb__middle');
    this.inningEl = el('span', 'sb__inning');
    this.batterEl = el('span', 'sb__batter');
    this.verbEl = el('span', 'sb__verb');
    middle.append(this.inningEl, this.batterEl, this.verbEl);

    const counts = el('div', 'sb__counts');
    counts.append(this.balls.root, this.strikes.root, this.outs.root);

    // The diamond: three bags, rotated 45° by CSS so it reads as a diamond
    // rather than three squares in a row. Home is not drawn — a runner there
    // has scored, and the score is already the biggest thing on the strip.
    const diamond = el('div', 'sb__diamond');
    for (const name of ['first', 'second', 'third']) {
      const bag = el('i', `sb-bag sb-bag--${name}`);
      this.bags.push(bag);
      diamond.appendChild(bag);
    }

    this.root.append(teams, middle, counts, diamond);
  }

  update(m: ScoreboardModel): void {
    this.away.set(m.away.name, m.away.runs, m.away.batting);
    this.home.set(m.home.name, m.home.runs, m.home.batting);

    const inning = `${halfMark(m.half)}${m.inning}`;
    if (inning !== this.last.inning) this.inningEl.textContent = inning;

    if (m.batter !== this.last.batter) this.batterEl.textContent = m.batter;

    const verb = m.you === 'bat' ? '🏏 YOU BAT' : m.you === 'pitch' ? '⚾ YOU PITCH' : '';
    if (verb !== this.last.verb) {
      this.verbEl.textContent = verb;
      this.verbEl.classList.toggle('is-hidden', verb === '');
    }

    this.balls.set(m.balls);
    this.strikes.set(m.strikes);
    this.outs.set(m.outs);

    const bases = m.bases.map((b) => (b ? '1' : '0')).join('');
    if (bases !== this.last.bases) {
      m.bases.forEach((occupied, i) => this.bags[i].classList.toggle('is-on', occupied));
    }

    this.last = { inning, batter: m.batter, verb, bases };
  }
}
