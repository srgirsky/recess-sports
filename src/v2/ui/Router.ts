// ---------------------------------------------------------------------------
// The screen router: one screen over the canvas at a time, or none.
//
// ★ v1's SCENE FLOW, MINUS THE SCENES. v1 is `Boot -> Schoolyard -> Lineup ->
// Game -> Result`, where every screen is a Phaser scene that owns a camera, an
// input plugin and a display list. Here the 3D world is ALWAYS the canvas and a
// screen is DOM over it — which is why there is no Boot and no scene teardown:
// showing the title does not tear down the park behind it.
//
// ★ AND `#screens` IS NOT `#hud`. The HUD is `pointer-events: none` so taps fall
// through to the field; a screen is the opposite — it is MODAL, it takes every
// tap, and the game behind it must not receive input. Two elements with two
// opposite rules, rather than one element with a mode flag, so neither can be
// left in the wrong state.
// ---------------------------------------------------------------------------

import { clear } from './dom';

/** A screen is anything that can build its own DOM and be told to go away. */
export interface Screen {
  /** Build the screen's root. Called once, when it is shown. */
  mount(): HTMLElement;
  /** Optional cleanup — timers, listeners. The DOM is removed for you. */
  unmount?(): void;
}

export class Router {
  private current: Screen | null = null;

  constructor(private readonly host: HTMLElement) {}

  /** Show a screen, replacing whatever was there. */
  show(screen: Screen): void {
    this.hide();
    this.current = screen;
    this.host.appendChild(screen.mount());
    this.host.classList.add('open');
    // ★ AND THE HUD GOES WITH IT, declaratively. A game runs behind the title
    // as attract mode, so without this the scoreboard sits under the wordmark
    // reading "ROCKETS 0 - 0 COMETS ▲1 YOU BAT" for a game the player has not
    // started. One class on <body> and one CSS rule, rather than every screen
    // remembering to hide it — the same argument as `#hud`'s pointer-events
    // rule, which replaced a stopPropagation convention with a fact.
    document.body.classList.add('screen-open');
  }

  /** Back to the game: no screen, and every tap reaches the field again. */
  hide(): void {
    this.current?.unmount?.();
    this.current = null;
    clear(this.host);
    this.host.classList.remove('open');
    document.body.classList.remove('screen-open');
  }

  /** What is showing, or null. Read-only — the router owns the transition. */
  get showing(): Screen | null {
    return this.current;
  }
}
