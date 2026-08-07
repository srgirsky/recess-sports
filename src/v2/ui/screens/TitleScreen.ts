// ---------------------------------------------------------------------------
// The title. One button, and the button is the whole screen's job.
//
// ★ DESIGN PILLAR, NOT MINIMALISM: "minimal reading, icon- and voice-forward".
// The audience is four to eight, and a four-year-old cannot read RECESS SPORTS
// either — the wordmark is a picture to them. So there is exactly one thing to
// do and it is the biggest thing on screen.
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
  constructor(private readonly onPlay: () => void) {}

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

    // ★ THE ONE VERB. `⚾ PLAY` rather than a menu of modes: choosing a mode is
    // reading, and the difficulty ladder and venue picker v1 puts on a GAME
    // SETUP page are a later screen's problem, not the front door's.
    const play = button('⚾  PLAY', this.onPlay, 'btn--hero');

    // ★ THE WAY BACK TO v1, AND IT IS DELIBERATELY SMALL. v2 took the front
    // door at the cutover, but v1 still holds Recess Week, the sticker album,
    // pass-and-play and the online mode — none of which v2 has yet, and none of
    // which anyone should have to guess the URL for. It is the only text on this
    // screen a four-year-old is not expected to read, which is why it is last,
    // quiet, and below the thing they came for.
    const classic = button('🕹  CLASSIC GAME', () => {
      location.href = './classic/';
    }, 'btn--quiet btn--small');

    root.append(lockup, play, classic);
    return root;
  }
}
