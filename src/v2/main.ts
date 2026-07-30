// ---------------------------------------------------------------------------
// v2 entry point.
//
// Stage 0 boots straight into the Look Spike — the standalone page whose only
// job is to answer "does this look right?" before the character art is
// commissioned. Later stages add the real router here; both spikes stay
// reachable as permanent review surfaces:
//
//   /v2/            the Look Spike (also `?spike=1`) — the park, the light,
//                   the characters, at kid scale.
//   /v2/?anims=1    the Animation Spike — the acceptance surface for
//                   `docs/v2/animation-brief.md`. Three of that brief's four
//                   acceptance criteria are things you have to WATCH, so they
//                   need a page to watch them on.
// ---------------------------------------------------------------------------

import { LookSpike } from './spike/LookSpike';
import { AnimSpike } from './spike/AnimSpike';

const canvas = document.getElementById('stage') as HTMLCanvasElement | null;
if (!canvas) throw new Error('#stage canvas is missing from v2/index.html');

const params = new URLSearchParams(location.search);
const spike = params.has('anims') ? new AnimSpike(canvas) : new LookSpike(canvas);
spike.start();

if (import.meta.env.DEV) {
  (window as unknown as { __spike: LookSpike | AnimSpike }).__spike = spike;
}
