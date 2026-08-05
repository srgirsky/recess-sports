// ---------------------------------------------------------------------------
// The mute. One control, in the HUD, on every screen.
//
// ★ IT IS THE FIRST `.interactive` THING IN `#hud`, which is what makes that
// element's whole design finally do something. `#hud` is `pointer-events: none`
// and `.interactive` opts back in, so this button takes its own taps and every
// other tap over the HUD still falls through to the field — v1's "corner buttons
// must stopPropagation or tapping pause also swings the bat" gotcha, made
// structurally impossible rather than remembered. It is also the first thing the
// layout audit's tap-target rule has ever had to measure in the HUD.
//
// ★ AND IT LIVES OUTSIDE THE ROUTER. Sound needs turning off at the title, in
// the draft, mid-pitch and on the result screen — a control that belonged to a
// screen would vanish on four of the five. `body.screen-open` hides the
// scoreboard and deliberately does not hide this.
// ---------------------------------------------------------------------------

import { button } from './dom';
import type { Sound } from './Sound';

export class MuteButton {
  private readonly el: HTMLButtonElement;

  constructor(private readonly sound: Sound) {
    this.el = button('', () => this.flip(), 'btn--mute');
    this.el.setAttribute('aria-label', 'sound on or off');
    this.paint();
  }

  mount(): void {
    document.getElementById('hud')?.appendChild(this.el);
  }

  private flip(): void {
    this.sound.toggle();
    this.paint();
  }

  private paint(): void {
    // The icon IS the label. Nothing here is readable at four years old, and a
    // crossed-out speaker is understood before any of the words for it are.
    this.el.textContent = this.sound.muted ? '🔇' : '🔊';
    this.el.classList.toggle('is-muted', this.sound.muted);
  }
}
