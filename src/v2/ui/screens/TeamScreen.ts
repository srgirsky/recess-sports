// ---------------------------------------------------------------------------
// "What are we called?" — a colour, a logo, and the name that falls out of them.
//
// ★ NAMING WITH NO READING AND NO TYPING. `systems/team.ts` already had the
// idea and v2 gets it whole: the team's NAME is the spoken colour plus the
// spoken logo — "THE TEAL ROCKETS" — so a four-year-old names their team by
// pointing at a colour they like and an animal they like. There is no text
// field anywhere in this game, and there should not be.
//
// ★ AND THE COLOUR IS NOT DECORATION. It is the uniform the nine kids you just
// drafted actually wear on the field, which is the only thing that makes the
// two sides tellable apart at play distance. `pickRival` picks an opponent that
// does not clash.
// ---------------------------------------------------------------------------

import { button, el } from '../dom';
import type { Screen } from '../Router';
import {
  TEAM_COLOR_NAMES,
  TEAM_LOGOS,
  teamName,
  type TeamIdentity,
} from '../../../systems/team';
import { UNIFORM_COLORS } from '../../../art/palette';
import { GAME_LENGTHS } from '../../game/GameView';
import type { VenueId } from '../../sim/field';

/** Every playable geometry must have one reachable, icon-first chip. */
export const VENUE_OPTIONS: ReadonlyArray<{ id: VenueId; icon: string; label: string }> = [
  { id: 'park', icon: '🌳', label: 'PARKS #2' },
  { id: 'sandlot', icon: '🏖️', label: 'SANDY FLATS' },
  { id: 'blacktop', icon: '🏙️', label: 'BLACKTOP' },
  { id: 'tin_can', icon: '🧱', label: 'TIN CANS' },
  { id: 'cement', icon: '🏪', label: 'CEMENT' },
  { id: 'steele', icon: '🏡', label: 'STEELE' },
  { id: 'playground', icon: '🛝', label: 'COMMONS' },
  { id: 'eckman', icon: '🌾', label: 'ECKMAN' },
  { id: 'dirt_yards', icon: '🛞', label: 'DIRT YARDS' },
  { id: 'big_city', icon: '🏟️', label: 'BIG CITY' },
  { id: 'dome', icon: '🌐', label: 'THE DOME' },
];

export class TeamScreen implements Screen {
  private choice: TeamIdentity;
  private nameEl!: HTMLElement;
  private root!: HTMLElement;

  private innings: number;

  private night: boolean;
  private venue: VenueId;

  constructor(
    start: TeamIdentity,
    startInnings: number,
    startNight: boolean,
    startVenue: VenueId,
    private readonly onInnings: (n: number) => void,
    private readonly onNight: (night: boolean) => void,
    private readonly onVenue: (v: VenueId) => void,
    private readonly onPreview: (t: TeamIdentity) => void,
    private readonly onReady: (t: TeamIdentity) => void
  ) {
    this.choice = { ...start };
    this.innings = startInnings;
    this.night = startNight;
    this.venue = startVenue;
  }

  mount(): HTMLElement {
    this.root = el('div', 'screen screen--team');

    const head = el('div', 'draft-head');
    head.appendChild(el('h1', 'draft-head__title', 'NAME YOUR TEAM'));
    this.nameEl = el('p', 'team-name');
    head.appendChild(this.nameEl);

    // Colours, as the jerseys they actually are.
    const colours = el('div', 'team-row');
    TEAM_COLOR_NAMES.forEach((label, i) => {
      const swatch = button('', () => this.set({ color: i }), 'swatch');
      swatch.style.background = UNIFORM_COLORS[i]?.jersey ?? '#888';
      swatch.dataset.color = String(i);
      swatch.setAttribute('aria-label', label);
      colours.appendChild(swatch);
    });

    const logos = el('div', 'team-row');
    TEAM_LOGOS.forEach((logo, i) => {
      const b = button('', () => this.set({ logo: i }), 'logo');
      b.appendChild(el('span', 'logo__icon', logo.icon));
      b.dataset.logo = String(i);
      b.setAttribute('aria-label', logo.name);
      logos.appendChild(b);
    });

    // ★ HOW LONG, IN MINUTES RATHER THAN INNINGS. "Three innings" means nothing
    // to a six-year-old or to the adult deciding whether there is time before
    // dinner; "9 min" means something to both. The numbers are measured, not
    // guessed — see GAME_LENGTHS.
    const lengths = el('div', 'team-row team-row--length');
    for (const choice of GAME_LENGTHS) {
      const b = button('', () => this.setInnings(choice.innings), 'length');
      b.dataset.innings = String(choice.innings);
      b.append(
        el('span', 'length__label', choice.label),
        el('span', 'length__mins', `${choice.minutes} min`)
      );
      lengths.appendChild(b);
    }

    // ★ DAY OR NIGHT — BB2026's sun/moon, and the same preview rule as the
    // colours: tapping the moon flips the REAL park behind this screen,
    // because it is the park the game is about to start in.
    const times = el('div', 'team-row team-row--time');
    for (const t of [
      { night: false, icon: '☀️', label: 'DAY' },
      { night: true, icon: '🌙', label: 'NIGHT' },
    ]) {
      const b = button('', () => this.setNight(t.night), 'timechip');
      b.dataset.night = String(t.night);
      b.append(el('span', 'timechip__icon', t.icon), el('span', 'timechip__label', t.label));
      times.appendChild(b);
    }

    // ★ WHERE we play — BB2026's field select, as chips. Same preview rule:
    // the park behind this screen rebuilds as you tap.
    const venues = el('div', 'team-row team-row--venue');
    for (const v of VENUE_OPTIONS) {
      const b = button('', () => this.setVenue(v.id), 'timechip venuechip');
      b.dataset.venue = v.id;
      b.append(el('span', 'timechip__icon', v.icon), el('span', 'timechip__label', v.label));
      venues.appendChild(b);
    }

    this.root.append(
      head,
      colours,
      logos,
      venues,
      lengths,
      times,
      button('⚾  PLAY BALL', () => this.onReady(this.choice), 'btn--hero')
    );
    this.paint();
    return this.root;
  }

  private setVenue(v: VenueId): void {
    this.venue = v;
    this.onVenue(v);
    this.paint();
  }

  private setNight(night: boolean): void {
    this.night = night;
    this.onNight(night);
    this.paint();
  }

  private setInnings(n: number): void {
    this.innings = n;
    this.onInnings(n);
    this.paint();
  }

  private set(patch: Partial<TeamIdentity>): void {
    this.choice = { ...this.choice, ...patch };
    this.paint();
    // ★ THE PREVIEW IS THE REAL THING. The kids on the field behind this screen
    // change colour as you tap, because they are the same characters the game
    // is about to start with — there is no mock-up to drift from the game.
    this.onPreview(this.choice);
  }

  private paint(): void {
    this.nameEl.textContent = teamName(this.choice);
    for (const node of this.root.querySelectorAll<HTMLElement>('.swatch')) {
      node.classList.toggle('is-picked', Number(node.dataset.color) === this.choice.color);
    }
    for (const node of this.root.querySelectorAll<HTMLElement>('.logo')) {
      node.classList.toggle('is-picked', Number(node.dataset.logo) === this.choice.logo);
    }
    for (const node of this.root.querySelectorAll<HTMLElement>('.length')) {
      node.classList.toggle('is-picked', Number(node.dataset.innings) === this.innings);
    }
    for (const node of this.root.querySelectorAll<HTMLElement>('.timechip:not(.venuechip)')) {
      node.classList.toggle('is-picked', (node.dataset.night === 'true') === this.night);
    }
    for (const node of this.root.querySelectorAll<HTMLElement>('.venuechip')) {
      node.classList.toggle('is-picked', node.dataset.venue === this.venue);
    }
  }
}
