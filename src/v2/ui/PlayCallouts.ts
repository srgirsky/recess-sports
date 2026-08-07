// ---------------------------------------------------------------------------
// The broadcast-sized verdict over the field. Policy is in playCalloutModel;
// this file only paints it and lets CSS own the beat.
// ---------------------------------------------------------------------------

import type { SimEvent } from '../sim/game';
import { playCalloutFor } from './playCalloutModel';

const HOLD_MS = 1050;

export class PlayCallouts {
  readonly root = document.createElement('div');
  private readonly label = document.createElement('div');
  private readonly detail = document.createElement('div');
  private timer: ReturnType<typeof setTimeout> | null = null;

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
    this.root.className = `play-callout is-${model.kind}`;
    // Restart the pop when two calls arrive before the first has cleared.
    void this.root.offsetWidth;
    this.root.classList.add('is-open');
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.root.classList.remove('is-open');
      this.timer = null;
    }, HOLD_MS);
  }

  reset(): void {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
    this.root.classList.remove('is-open');
  }
}
