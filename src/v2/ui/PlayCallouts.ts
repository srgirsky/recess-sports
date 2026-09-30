// ---------------------------------------------------------------------------
// The broadcast-sized verdict over the field. Policy is in playCalloutModel;
// this file only paints it.
//
// ★ ON THE GAME'S CLOCK, NOT THE WALL'S. The beat used to be a CSS animation
// plus a `setTimeout`, both wall time, while the game runs on its own render
// clock: pause left the verdict fading over a frozen field, and the
// presentation smoke (which paints the fixed clock) caught every verdict
// mid-fade. GameView now calls `tick(now)` with the same `now` it renders
// from, and the Web Animation's time is set from it.
// ---------------------------------------------------------------------------

import type { SimEvent } from '../sim/game';
import { CALLOUT_TOTAL_MS, calloutKeyframes, playCalloutFor } from './playCalloutModel';

export class PlayCallouts {
  readonly root = document.createElement('div');
  private readonly label = document.createElement('div');
  private readonly detail = document.createElement('div');
  private anim: Animation | null = null;
  private startedAt: number | null = null;
  private lastNow = 0;

  constructor(host: HTMLElement) {
    this.root.className = 'play-callout';
    this.root.setAttribute('aria-live', 'polite');
    this.root.setAttribute('aria-atomic', 'true');
    this.label.className = 'play-callout__label';
    this.detail.className = 'play-callout__detail';
    this.root.append(this.label, this.detail);
    host.appendChild(this.root);
  }

  onEvent(e: SimEvent): void {
    const model = playCalloutFor(e);
    if (!model) return;
    this.label.textContent = model.label;
    this.detail.textContent = model.detail ?? '';
    this.detail.classList.toggle('is-empty', model.detail === null);
    this.root.className = `play-callout is-${model.kind} is-open`;
    // A second call before the first clears restarts the pop.
    this.anim?.cancel();
    const motion = Number.parseFloat(getComputedStyle(this.root).getPropertyValue('--motion-scale')) || 1;
    this.anim = this.root.animate(calloutKeyframes(motion), { duration: CALLOUT_TOTAL_MS, fill: 'both' });
    this.anim.pause();
    this.anim.currentTime = 0;
    this.startedAt = this.lastNow;
  }

  /** Advance to the game clock's `now`, ms. */
  tick(now: number): void {
    this.lastNow = now;
    if (this.startedAt === null || !this.anim) return;
    const elapsed = now - this.startedAt;
    if (elapsed >= CALLOUT_TOTAL_MS) {
      this.reset();
      return;
    }
    this.anim.currentTime = Math.max(0, elapsed);
  }

  reset(): void {
    this.anim?.cancel();
    this.anim = null;
    this.startedAt = null;
    this.root.classList.remove('is-open');
  }
}
