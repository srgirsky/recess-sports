// Boot. Parses ?view=&seed=, builds the ctx bus, inits every subsystem in
// dependency order, exposes the capture API, runs the frame loop. FROZEN after
// scaffold — subsystem agents edit only their own directory.

import { Ctx } from './core/ctx';
import { makeRng } from './core/rng';
import { Clock } from './core/clock';
import { init as initRender } from './render/index';
import { init as initMaterials } from './materials/index';
import { init as initField } from './field/index';
import { init as initCharacters } from './characters/index';
import { init as initAnimation } from './animation/index';
import { init as initUi } from './ui/index';
import { init as initAudio } from './audio/index';

export type SpikeParams = { seed: number; view: string };

const search = new URLSearchParams(location.search);
const params: SpikeParams = {
  seed: Number(search.get('seed') ?? '1'),
  view: search.get('view') ?? 'pitching',
};

const ctx = new Ctx();
ctx.set('params', params);
ctx.set('rng', makeRng(params.seed));
const clock = new Clock();
ctx.set('clock', clock);

// Init order IS the dependency order (ARCHITECTURE.md § Ownership).
for (const init of [initRender, initMaterials, initField, initCharacters, initAnimation, initUi, initAudio]) {
  init(ctx);
}
ctx.emit('scene:ready', params);

const render = ctx.get<{ render(): void }>('render');

function tick(ms: number): void {
  clock.step(ms);
  ctx.emit('tick', { tMs: clock.tMs, dtMs: clock.dtMs });
  render.render();
}

// Manual mode flips on at the first __spike.step() and rAF stops driving —
// capture steps the clock by hand (the repo-wide headless doctrine: never
// depend on rAF in a background/headless tab).
let manual = false;
let last: number | null = null;

declare global {
  interface Window {
    __spike: { ready: true; seed: number; view: string; step(ms?: number): void };
  }
}

window.__spike = {
  ready: true,
  seed: params.seed,
  view: params.view,
  step(ms = 16.7) {
    manual = true;
    tick(ms);
  },
};

function loop(now: number): void {
  if (!manual) {
    if (last !== null) tick(Math.min(now - last, 100));
    last = now;
  }
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
