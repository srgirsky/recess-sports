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
//   /v2/?play=1     the Play View — the first page on which v2 plays baseball.
//                   The Look Spike answers "does it look right?" and the Anim
//                   Spike "does it move right?"; this answers the only question
//                   that decides a game, DOES IT PLAY RIGHT, and no test can.
//
// Flags, all readable on either page:
//
//   ?proxy=1        force PROXY characters everywhere, even for kids whose
//                   model has been delivered (asset contract §5). The A/B for
//                   a delivery against the stand-in it replaces, and the way
//                   to get a deterministic scene with no network in it.
//   ?perf=low|mid|high   force a device tier (see `render/perfTier.ts`).
//   ?kids=N         how many characters the Look Spike builds (default 13).
//   ?seed=S         the Play View's game seed. The same seed is the same game,
//                   which is what makes "watch that again" possible at all.
//   ?venue=park|sandlot|blacktop   where the Play View plays.
// ---------------------------------------------------------------------------

import { LookSpike } from './spike/LookSpike';
import { AnimSpike } from './spike/AnimSpike';
import { PlayView } from './spike/PlayView';

const canvas = document.getElementById('stage') as HTMLCanvasElement | null;
if (!canvas) throw new Error('#stage canvas is missing from v2/index.html');

const params = new URLSearchParams(location.search);
const spike = params.has('play')
  ? new PlayView(canvas)
  : params.has('anims')
    ? new AnimSpike(canvas)
    : new LookSpike(canvas);
void spike.start();

if (import.meta.env.DEV) {
  (window as unknown as { __spike: LookSpike | AnimSpike | PlayView }).__spike = spike;
}
