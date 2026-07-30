// ---------------------------------------------------------------------------
// v2 entry point.
//
// Stage 0 boots straight into the Look Spike — the standalone page whose only
// job is to answer "does this look right?" before the character art is
// commissioned. Later stages add the real router here; the spike stays
// reachable at `?spike=1` as a permanent art-review surface.
// ---------------------------------------------------------------------------

import { LookSpike } from './spike/LookSpike';

const canvas = document.getElementById('stage') as HTMLCanvasElement | null;
if (!canvas) throw new Error('#stage canvas is missing from v2/index.html');

const spike = new LookSpike(canvas);
spike.start();

if (import.meta.env.DEV) {
  (window as unknown as { __spike: LookSpike }).__spike = spike;
}
