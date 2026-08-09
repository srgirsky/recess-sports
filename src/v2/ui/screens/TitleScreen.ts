// ---------------------------------------------------------------------------
// The title. PLAY remains the one dominant verb; the clubhouse is a quiet door
// back to things the player has already earned.
//
// ★ DESIGN PILLAR, NOT MINIMALISM: "minimal reading, icon- and voice-forward".
// The audience is four to eight, and a four-year-old cannot read RECESS SPORTS
// either — the wordmark is a picture to them. So there is exactly one dominant
// thing to do and it is the biggest thing on screen.
//
// ★ AND THE PARK IS BEHIND IT, LIVE. v1's title is a drawn schoolyard in a
// Phaser scene; here the 3D field is already rendered and the title is DOM over
// it, so the first thing a kid sees is the place they are about to play in. That
// is free, and it is the reason `Router` does not tear the world down to show a
// screen.
// ---------------------------------------------------------------------------

import { button, el } from '../dom';
import type { Screen } from '../Router';
import { getCharacter } from '../../../data/characters';
import { portrait } from '../portrait';

export class TitleScreen implements Screen {
  constructor(
    private readonly onPlay: () => void,
    private readonly onClubhouse: () => void,
    private readonly onSeason: () => void,
    private readonly onModes: () => void
  ) {}

  mount(): HTMLElement {
    const root = el('div', 'screen screen--title');

    // The game is a character product. Put the cast on the front door rather
    // than asking a wordmark and an empty field to sell them by implication.
    const lockup = el('div', 'title-lockup');
    const hero = (id: string, mod: string): HTMLElement => {
      const c = getCharacter(id);
      const frame = el('div', `title-hero title-hero--${mod}`);
      frame.setAttribute('aria-hidden', 'true');
      frame.appendChild(portrait(c.visual, '', { street: true }));
      return frame;
    };

    const card = el('div', 'title-card');
    card.append(
      el('h1', 'title-card__mark', 'RECESS'),
      el('h1', 'title-card__mark title-card__mark--two', 'SPORTS'),
      el('p', 'title-card__tag', 'pick your team · play ball')
    );
    lockup.append(hero('nostrike', 'left'), card, hero('wheelchair_ace', 'right'));

    // ★ THE ONE DOMINANT VERB. `⚾ PLAY` rather than a menu of modes: choosing a
    // mode is reading, and setup is a later screen's problem. The quiet
    // clubhouse is retrospective—it never stands between a kid and a game.
    const actions = el('div', 'title-actions');
    actions.append(
      button('⚾  PLAY', this.onPlay, 'btn--hero'),
      button('🏠  CLUBHOUSE', this.onClubhouse, 'btn--quiet btn--clubhouse'),
      button('🏆  RECESS WEEK', this.onSeason, 'btn--quiet btn--season'),
      button('🎯  MORE GAMES', this.onModes, 'btn--quiet btn--modes')
    );

    // ★ THE WAY BACK TO v1, AND IT IS DELIBERATELY SMALL. v2 took the front
    // door at the cutover, but v1 still holds pass-and-play, online play and its
    // mature setup shell — none of which anyone should have to guess the URL for. It is
    // the only text on this screen a four-year-old is not expected to read,
    // which is why it is last, quiet, and below the thing they came for.
    const classic = button('🕹  CLASSIC GAME', () => {
      location.href = './classic/';
    }, 'btn--quiet btn--small');

    // Small, persistent production disclosure. It is not a decision a child
    // must read, so it stays outside the one-dominant-verb hierarchy.
    const voiceDisclosure = el('p', 'title-voice-note', 'Character voices include AI-generated performances.');

    root.append(lockup, actions, classic, voiceDisclosure);
    return root;
  }
}
