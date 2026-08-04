// ---------------------------------------------------------------------------
// The draft. Thirty kids on a board; you take nine.
//
// ★ THE PORTRAITS ARE v1's OWN ART, INLINED. `art/CharacterArt.ts` hand-draws
// each kid as an SVG STRING from their `VisualParams`, which is exactly what a
// DOM card wants — resolution-independent, no image files, and the same thirty
// faces v1 draws, so the two games look like one product rather than two.
// Nothing is copied: this calls the same builder.
//
// ⚠️ AND IT GOES THROUGH `portrait.ts`, WHICH RENDERS IT AS AN <img>. Inlining
// thirty SVGs into one page collapses every gradient id onto the first, so all
// thirty kids wear the first kid's shirt. See that file; it is not a style
// choice.
//
// ★ THE STAT BARS ARE THE WHOLE READ. Design pillar: minimal reading, ages four
// to eight. A four-year-old cannot compare "contact 7" with "contact 4", and can
// compare two bars instantly. The name is there for the adult in the room.
// ---------------------------------------------------------------------------

import { button, el } from '../dom';
import type { Screen } from '../Router';
import { isDraftComplete, pickByCpu, pickByHuman, startDraft, type DraftState } from '../draftSession';
import { portrait } from '../portrait';
import { getCharacter } from '../../../data/characters';
import type { Rng } from '../../sim/rng';

/** How long the board shows the CPU's pick before it clears, ms. */
const CPU_BEAT_MS = 620;

/** The four stats a card shows, in the order they read. */
const STATS = [
  ['contact', '🎯'],
  ['power', '💪'],
  ['speed', '💨'],
  ['pitching', '⚾'],
] as const;

export class DraftScreen implements Screen {
  private state: DraftState;
  private root!: HTMLElement;
  private board!: HTMLElement;
  private slots!: HTMLElement;
  private status!: HTMLElement;
  private go!: HTMLButtonElement;
  private timer: ReturnType<typeof setTimeout> | null = null;
  /** Set while the CPU is picking, so a fast second tap cannot double-pick. */
  private busy = false;

  constructor(
    allIds: string[],
    private readonly rng: Rng,
    private readonly onReady: (playerTeam: string[], aiTeam: string[]) => void
  ) {
    this.state = startDraft(allIds);
  }

  mount(): HTMLElement {
    this.root = el('div', 'screen screen--draft');

    const head = el('div', 'draft-head');
    head.appendChild(el('h1', 'draft-head__title', 'PICK YOUR TEAM'));
    this.status = el('p', 'draft-head__status');
    head.appendChild(this.status);

    this.slots = el('div', 'draft-slots');
    this.board = el('div', 'draft-board');

    this.go = button('⚾  PLAY BALL', () => this.finish(), 'btn--hero');
    this.go.classList.add('is-hidden');

    this.root.append(head, this.slots, this.board, this.go);
    this.paint();
    return this.root;
  }

  unmount(): void {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
  }

  /** One card. */
  private card(id: string): HTMLElement {
    const c = getCharacter(id);
    const node = el('button', 'kid interactive');
    node.type = 'button';
    node.dataset.id = id;

    const art = el('div', 'kid__art');
    art.appendChild(portrait(c.visual, c.name, { street: true }));
    node.appendChild(art);
    node.appendChild(el('span', 'kid__name', c.name));

    const bars = el('div', 'kid__bars');
    for (const [key, icon] of STATS) {
      const row = el('div', 'kid__bar');
      row.appendChild(el('span', 'kid__bar-icon', icon));
      const track = el('span', 'kid__bar-track');
      const fill = el('i', 'kid__bar-fill');
      // 1-10 as a percentage. The bar IS the stat, so it must not be rescaled
      // to make the roster look flatter or spikier than it is.
      fill.style.inlineSize = `${(c.stats[key] / 10) * 100}%`;
      track.appendChild(fill);
      row.appendChild(track);
      bars.appendChild(row);
    }
    node.appendChild(bars);

    node.addEventListener('click', () => this.take(id));
    return node;
  }

  private take(id: string): void {
    if (this.busy || this.state.turn !== 'player') return;
    const next = pickByHuman(this.state, id);
    if (next === this.state) return;
    this.state = next;
    this.busy = true;
    this.paint();

    // ★ THE CPU'S PICK IS SHOWN, NOT SILENT. v1 wanders a "?" spotlight across
    // the wall before its pick walks off; the least this can do is name the kid
    // it took and leave them on screen for a beat. A board where the other
    // team's picks simply vanish reads as kids disappearing.
    this.timer = setTimeout(() => {
      const { state, id: taken } = pickByCpu(this.state, this.rng);
      this.state = state;
      this.busy = false;
      this.paint(taken);
      this.timer = null;
    }, CPU_BEAT_MS);
  }

  private paint(cpuTook: string | null = null): void {
    // Your nine slots, filled left to right.
    this.slots.replaceChildren();
    for (let i = 0; i < 9; i++) {
      const id = this.state.playerTeam[i];
      const slot = el('div', `draft-slot${id ? ' is-filled' : ''}`);
      if (id) {
        const art = el('div', 'draft-slot__art');
        art.appendChild(portrait(getCharacter(id).visual, getCharacter(id).name, { uniform: 0 }));
        slot.appendChild(art);
      }
      this.slots.appendChild(slot);
    }

    // The board: whoever is left.
    this.board.replaceChildren();
    for (const id of this.state.pool) this.board.appendChild(this.card(id));

    const done = isDraftComplete(this.state);
    this.status.textContent = cpuTook
      ? `they took ${getCharacter(cpuTook).name}`
      : done
        ? 'your team is ready!'
        : this.busy
          ? 'they’re picking…'
          : `tap a kid — ${9 - this.state.playerTeam.length} to go`;

    this.go.classList.toggle('is-hidden', !done);
    this.board.classList.toggle('is-locked', this.busy || done);
  }

  private finish(): void {
    if (!isDraftComplete(this.state)) return;
    this.onReady([...this.state.playerTeam], [...this.state.aiTeam]);
  }
}
