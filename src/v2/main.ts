// ---------------------------------------------------------------------------
// v2 entry point.
//
// `/v2/` is THE GAME now — title, play, result — and the three spikes stay
// reachable behind flags as permanent review surfaces. Each answers a question
// the others cannot, which is why none of them was deleted when the app landed:
//
//   /v2/            the app: title -> game -> result.
//   /v2/?play=1     the game with no shell, dropped straight in. The page that
//                   answers DOES IT PLAY RIGHT, and the one every measurement
//                   sweep and the layout audit drive.
//   /v2/?spike=1    the Look Spike — the park, the light, the characters, at
//                   kid scale. Answers "does it LOOK right?".
//   /v2/?anims=1    the Animation Spike — the acceptance surface for
//                   `docs/v2/animation-brief.md`. Three of that brief's four
//                   acceptance criteria are things you have to WATCH.
//
// Flags, readable on any of them:
//
//   ?proxy=1        force PROXY characters everywhere, even for kids whose
//                   model has been delivered (asset contract §5). The A/B for
//                   a delivery against the stand-in it replaces, and the way
//                   to get a deterministic scene with no network in it.
//   ?perf=low|mid|high   force a device tier (see `render/perfTier.ts`).
//   ?kids=N         how many characters the Look Spike builds (default 13).
//   ?seed=S         the game seed. The same seed is the same game, which is
//                   what makes "watch that again" possible at all. A rematch
//                   walks from it rather than re-rolling, so a session stays
//                   reproducible from one flag.
//   ?venue=park|sandlot|blacktop   where the game is played.
// ---------------------------------------------------------------------------

import { App } from './App';
import { LookSpike } from './spike/LookSpike';
import { AnimSpike } from './spike/AnimSpike';
import { GameView } from './game/GameView';

const canvas = document.getElementById('stage') as HTMLCanvasElement | null;
if (!canvas) throw new Error('#stage canvas is missing from v2/index.html');
const screens = document.getElementById('screens');
if (!screens) throw new Error('#screens is missing from v2/index.html');

const params = new URLSearchParams(location.search);
const surface = params.has('play')
  ? new GameView(canvas)
  : params.has('anims')
    ? new AnimSpike(canvas)
    : params.has('spike')
      ? new LookSpike(canvas)
      : new App(canvas, screens);
void surface.start();

if (import.meta.env.DEV) {
  // ★ `__spike` KEEPS ITS NAME. Every measurement sweep, the layout audit and
  // `.claude/skills/verify` drive the page through it, and renaming a debug
  // handle to match a refactor breaks all of them for nothing.
  (window as unknown as { __spike: unknown }).__spike = surface;
}
