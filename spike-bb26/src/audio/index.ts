// OWNER: audio. WebAudio synthesis, gesture-gated. The AudioContext exists
// only after the first pointerdown (engine.ts); every call before that — and
// therefore ALL of headless capture — is a silent no-op. Voices live in
// sfx.ts (whoosh/crack/thud) and ambient.ts (breeze, birds, chatter).

import type { Ctx } from '../core/ctx';
import { AudioEngine } from './engine';
import { whoosh, crack, thud } from './sfx';
import { Ambient } from './ambient';

type Rng = { next(): number };

export function init(ctx: Ctx): void {
  // ONE draw from the shared rng seeds a private mulberry32 stream, so the
  // audio's runtime draws (chirp timing, noise fill — which only ever happen
  // after an interactive unlock) can never perturb any other subsystem's
  // deterministic rng sequence.
  let s = Math.floor(ctx.get<Rng>('rng').next() * 0xffffffff) >>> 0;
  const rand = (): number => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), s | 1);
    t = (t + Math.imul(t ^ (t >>> 7), t | 61)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  const engine = new AudioEngine(rand);
  engine.install();
  const ambient = new Ambient(engine);

  ctx.on('pitch:release', (p) => {
    const durMs = (p as { durMs?: number } | undefined)?.durMs;
    whoosh(engine, durMs !== undefined ? durMs * 0.35 : 320);
  });
  ctx.on('bat:contact', () => crack(engine));
  ctx.on('ball:land', () => thud(engine));
  ctx.on('tick', (p) => ambient.update((p as { tMs: number }).tMs));

  ctx.set('audio', {
    unlocked: () => engine.unlocked,
    setVolume: (v: number) => engine.setVolume(v),
  });
}
