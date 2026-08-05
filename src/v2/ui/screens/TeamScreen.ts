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

export class TeamScreen implements Screen {
  private choice: TeamIdentity;
  private nameEl!: HTMLElement;
  private root!: HTMLElement;

  constructor(
    start: TeamIdentity,
    private readonly onPreview: (t: TeamIdentity) => void,
    private readonly onReady: (t: TeamIdentity) => void
  ) {
    this.choice = { ...start };
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

    this.root.append(head, colours, logos, button('⚾  PLAY BALL', () => this.onReady(this.choice), 'btn--hero'));
    this.paint();
    return this.root;
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
  }
}
