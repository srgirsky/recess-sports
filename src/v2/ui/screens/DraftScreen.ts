// ---------------------------------------------------------------------------
// The draft. A roster board feeds one big character spotlight; you take nine.
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
// ★ THE SCHOOLYARD IS THE VOTE EARNING ITS MOMENT. A wall of thirty equally
// small cards makes the cast read as inventory. The full-width live bench stops
// on one kid, keeps both teams physically staged, and asks PICK?; the horizontal
// roster below finds a kid, the big beat confirms them, and only that
// confirmation calls `pickByHuman` and records the vote.
// ---------------------------------------------------------------------------

import { button, el } from '../dom';
import type { Screen } from '../Router';
import { isDraftComplete, pickByCpu, pickByHuman, startDraft, type DraftState } from '../draftSession';
import { portrait } from '../portrait';
import { getCharacter } from '../../../data/characters';
import type { Rng } from '../../sim/rng';
import type { Character } from '../../../data/types';
import {
  DRAFT_REACT_SEC,
  DRAFT_WALK_OFF_SEC,
  type DraftSpotlightMode,
} from '../../render/draftPresentation';

/** Let the acting beat and walk-off finish before the CPU owns the spotlight. */
const CPU_BEAT_MS = (DRAFT_REACT_SEC + DRAFT_WALK_OFF_SEC) * 1000 + 120;

/** The four stats a card shows, in the order they read. */
const CARD_STATS = [
  ['contact', '🎯'],
  ['power', '💪'],
  ['speed', '💨'],
  ['pitching', '⚾'],
] as const;

const SPOTLIGHT_STATS = [
  ['contact', '🎯', 'HIT'],
  ['power', '💪', 'POWER'],
  ['speed', '💨', 'RUN'],
  ['pitching', '⚾', 'PITCH'],
  ['fielding', '🧤', 'GLOVE'],
] as const;

export class DraftScreen implements Screen {
  private state: DraftState;
  private root!: HTMLElement;
  private board!: HTMLElement;
  private spotlight!: HTMLElement;
  private slots!: HTMLElement;
  private status!: HTMLElement;
  private go!: HTMLButtonElement;
  private timer: ReturnType<typeof setTimeout> | null = null;
  /** Set while the CPU is picking, so a fast second tap cannot double-pick. */
  private busy = false;
  private spotlightId: string | null;
  private spotlightMode: DraftSpotlightMode = 'pick';

  constructor(
    allIds: string[],
    private readonly rng: Rng,
    private readonly onPicked: (c: Character) => void,
    private readonly onReady: (playerTeam: string[], aiTeam: string[]) => void,
    /** Lets the one three.js scene perform across the full schoolyard bench. */
    private readonly onSpotlight?: (
      id: string | null,
      pool: readonly string[],
      playerTeam: readonly string[],
      aiTeam: readonly string[],
      host: HTMLElement | null,
      mode: DraftSpotlightMode
    ) => void,
    private readonly lookup: (id: string) => Character = getCharacter,
    playerCaptainId?: string
  ) {
    this.state = startDraft(allIds, playerCaptainId ? { player: playerCaptainId, rng } : undefined);
    this.spotlightId = this.state.pool[0] ?? null;
  }

  mount(): HTMLElement {
    this.root = el('div', 'screen screen--draft');

    const head = el('div', 'draft-head');
    head.appendChild(el('h1', 'draft-head__title', 'PICK YOUR TEAM'));
    this.status = el('p', 'draft-head__status');
    head.appendChild(this.status);

    this.slots = el('div', 'draft-slots');
    this.board = el('div', 'draft-board');
    this.spotlight = el('aside', 'draft-preview');
    const workbench = el('div', 'draft-workbench');
    // The place comes first: the board is a horizontal bench below the live
    // schoolyard, not a wall a child must cross before reaching the character.
    workbench.append(this.spotlight, this.board);

    this.go = button('⚾  PLAY BALL', () => this.finish(), 'btn--hero');
    this.go.classList.add('is-hidden');

    this.root.append(head, this.slots, workbench, this.go);
    this.paint();
    return this.root;
  }

  unmount(): void {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
    this.onSpotlight?.(null, [], [], [], null, 'pick');
  }

  /** One card. */
  private card(id: string): HTMLElement {
    const c = this.lookup(id);
    const node = el('button', 'kid interactive');
    node.type = 'button';
    node.dataset.id = id;
    node.setAttribute('aria-label', `${c.name}: ${c.tagline}`);
    node.setAttribute('aria-pressed', String(this.spotlightMode === 'pick' && this.spotlightId === id));

    const art = el('div', 'kid__art');
    art.appendChild(portrait(c.visual, c.name, { street: true }));
    node.appendChild(art);
    node.appendChild(el('span', 'kid__name', c.name));

    const bars = el('div', 'kid__bars');
    for (const [key, icon] of CARD_STATS) {
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

    node.addEventListener('click', () => this.inspect(id));
    return node;
  }

  /** Put one kid on the big card. Looking is free; confirming is the vote. */
  private inspect(id: string): void {
    if (this.busy || this.state.turn !== 'player' || !this.state.pool.includes(id)) return;
    this.spotlightId = id;
    this.spotlightMode = 'pick';
    this.paint();
  }

  private take(id: string): void {
    if (this.busy || this.state.turn !== 'player') return;
    const next = pickByHuman(this.state, id);
    if (next === this.state) return;
    this.state = next;
    this.busy = true;
    this.spotlightId = id;
    this.spotlightMode = 'mine';
    // ★ THE KID SAYS THEIR OWN NAME, in their own derived voice. It is the most
    // characterful thing v1 does and it costs one call — and it is the moment
    // the vote is cast, so it is also the feedback that the tap registered.
    this.onPicked(this.lookup(id));
    this.paint();

    // ★ THE CPU'S PICK IS SHOWN, NOT SILENT. v1 wanders a "?" spotlight across
    // the wall before its pick walks off; the least this can do is name the kid
    // it took and leave them on screen for a beat. A board where the other
    // team's picks simply vanish reads as kids disappearing.
    this.timer = setTimeout(() => {
      const { state, id: taken } = pickByCpu(this.state, this.rng);
      this.state = state;
      this.busy = false;
      if (taken) {
        this.spotlightId = taken;
        this.spotlightMode = 'cpu';
      }
      this.paint(taken);
      this.timer = null;
    }, CPU_BEAT_MS);
  }

  /** How many of the nine were filled at the last paint — the newest pops. */
  private painted = 0;

  private paint(cpuTook: string | null = null): void {
    // Your nine slots, filled left to right. The slot that JUST filled pops —
    // BB's trading-card beat, spent on the moment the vote lands in the tray.
    const filled = this.state.playerTeam.filter(Boolean).length;
    this.slots.replaceChildren();
    for (let i = 0; i < 9; i++) {
      const id = this.state.playerTeam[i];
      const isNew = id !== undefined && i === filled - 1 && filled > this.painted;
      const slot = el('div', `draft-slot${id ? ' is-filled' : ''}${isNew ? ' is-new' : ''}`);
      if (id) {
        const art = el('div', 'draft-slot__art');
        const kid = this.lookup(id);
        art.appendChild(portrait(kid.visual, kid.name, { uniform: 0 }));
        slot.appendChild(art);
      }
      this.slots.appendChild(slot);
    }
    this.painted = filled;

    // The board: whoever is left.
    this.board.replaceChildren();
    for (const id of this.state.pool) this.board.appendChild(this.card(id));
    this.paintSpotlight();

    const done = isDraftComplete(this.state);
    this.status.textContent = cpuTook
      ? `they took ${this.lookup(cpuTook).name}`
      : done
        ? 'your team is ready!'
        : this.busy
          ? 'they’re picking…'
          : this.spotlightMode === 'pick'
            ? `pick your favorite — ${9 - this.state.playerTeam.length} to go`
            : `tap a kid — ${9 - this.state.playerTeam.length} to go`;

    this.go.classList.toggle('is-hidden', !done);
    this.board.classList.toggle('is-locked', this.busy || done);
  }

  private paintSpotlight(): void {
    this.spotlight.replaceChildren();
    const id = this.spotlightId;
    if (!id) return;
    const c = this.lookup(id);

    const ribbon = el(
      'div',
      `draft-preview__ribbon is-${this.spotlightMode}`,
      this.spotlightMode === 'mine'
        ? 'YOU PICKED'
        : this.spotlightMode === 'cpu'
          ? 'THEY PICKED'
          : 'PICK?'
    );
    const art = el('div', 'draft-preview__art');
    if (this.onSpotlight) {
      art.classList.add('is-live');
      art.setAttribute('role', 'img');
      art.setAttribute('aria-label', `${c.name} performing in 3D`);
    } else {
      // Standalone/tests can still use the shared portrait without a scene.
      art.appendChild(portrait(c.visual, c.name, { street: true }));
    }
    const identity = el('div', 'draft-preview__identity');
    identity.append(
      el('h2', 'draft-preview__name', `${c.emoji ?? '⭐'} ${c.name}`),
      el('p', 'draft-preview__tagline', c.tagline)
    );

    const ratings = el('div', 'draft-preview__ratings');
    for (const [key, icon, label] of SPOTLIGHT_STATS) {
      const row = el('div', 'draft-rating');
      row.setAttribute('aria-label', `${label} ${c.stats[key]} out of 10`);
      row.append(el('span', 'draft-rating__icon', icon), el('span', 'draft-rating__label', label));
      const dots = el('span', 'draft-rating__dots');
      for (let i = 1; i <= 10; i++) dots.appendChild(el('i', `draft-rating__dot${i <= c.stats[key] ? ' is-on' : ''}`));
      row.appendChild(dots);
      ratings.appendChild(row);
    }

    this.spotlight.append(
      ribbon,
      el('div', 'draft-preview__bench is-mine', '⭐ YOUR BENCH'),
      el('div', 'draft-preview__bench is-cpu', '⚾ THEIR BENCH'),
      art,
      identity,
      ratings
    );
    const canPick =
      this.spotlightMode === 'pick' &&
      this.state.turn === 'player' &&
      this.state.pool.includes(id) &&
      !this.busy;
    if (canPick) this.spotlight.appendChild(button('⭐  PICK ME!', () => this.take(id), 'draft-preview__pick'));
    else this.spotlight.appendChild(el('div', `draft-preview__stamp is-${this.spotlightMode}`, this.spotlightMode === 'mine' ? 'ON YOUR TEAM!' : 'OFF THE BOARD'));
    this.onSpotlight?.(
      id,
      this.state.pool,
      this.state.playerTeam,
      this.state.aiTeam,
      art,
      this.spotlightMode
    );
  }

  private finish(): void {
    if (!isDraftComplete(this.state)) return;
    this.onReady([...this.state.playerTeam], [...this.state.aiTeam]);
  }
}
