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

export class TitleScreen implements Screen {
  constructor(private readonly onPlay: () => void) {}

  mount(): HTMLElement {
    const root = el('div', 'screen screen--title');

    const card = el('div', 'title-card');
    card.append(
      el('h1', 'title-card__mark', 'RECESS'),
      el('h1', 'title-card__mark title-card__mark--two', 'SPORTS'),
      el('p', 'title-card__tag', 'pick your team · play ball')
    );

    // ★ THE ONE VERB. `⚾ PLAY` rather than a menu of modes: choosing a mode is
    // reading, and the difficulty ladder and venue picker v1 puts on a GAME
    // SETUP page are a later screen's problem, not the front door's.
    const play = button('⚾  PLAY', this.onPlay, 'btn--hero');

    root.append(card, play);
    return root;
  }
}
