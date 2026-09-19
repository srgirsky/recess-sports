// ---------------------------------------------------------------------------
// Instant replay — the PURE half. Which plays earn one, what a snapshot of the
// drawn scene carries, how two snapshots interpolate, and where the camera
// looks while the tape plays. No three, no DOM, no sim writes.
//
// ★ A REPLAY IS PLAYBACK OF A RECORDING, NEVER RE-SIMULATION. v1 settled this
// (`systems/replay.ts`): the scene records a snapshot of what it DREW each
// tick — positions, facing, which clip at what time, the ball — and plays the
// frames back through the same render membrane at slow motion. The sim's own
// generator is not asked for anything; `GameView` stops pumping it for the
// duration, the way pause does, so no sim instant is spent on ticks nobody
// saw and every `pace.*` record stays a real-millisecond claim.
//
// ★ AND IT IS THE CARVE-OUT `scripts/simclock.lint.test.js` NAMES. That gate
// forbids a tempo scalar on the SIM delta and says in the same breath that
// "the replay's slow-motion playback clock legitimately scales delta ... a
// render-side effect that never reaches the sim". `REPLAY.SPEED` scales a
// playback clock over recorded frames; the fixed-step accumulator never sees
// it.
//
// ★ SNAPSHOTS COPY VALUES. `src/v2/AGENTS.md` § The game loop: the same
// `LiveFrame` is yielded every tick, mutated in place, so retaining it would
// hold N references to one object. A `ReplaySnapshot` is plain numbers and
// strings read off the scene graph and the director after the frame was
// applied — the drawn state, which is what a replay should show.
//
// ★ CLIP STATE IS SEEKED, NEVER RE-DECIDED. The director resolves which clip
// plays from sim facts (a marker warped onto the simulated instant); the tape
// records the clip name and its time, and playback puts each kid's action
// back at that time (`AnimationDirector.seek`). Re-running the decisions over
// interpolated positions would re-time every marker against nothing.
//
// The numbers: `SPEED` is v1's `FX.REPLAY.SPEED`, unmeasured there and here —
// `render.replayFeel` in `scripts/measures.json` says what would settle it.
// ---------------------------------------------------------------------------

import { PLAY } from '../sim/params';
import type { PlayState } from '../sim/play';
import { chooseCamera, type CameraCue, type CameraInput } from './cameraCues';
import type { AnimName } from './clips';

export const REPLAY = {
  /** Playback rate against real time. */
  SPEED: 0.55,
  /** A play shorter than this many recorded frames is a blip, not a highlight. */
  MIN_FRAMES: 12,
  /**
   * The tape's ring. `runPlayLive` caps a play at `PLAY.MAX_PLAY_SEC` at 60Hz,
   * plus a few frames of slack for the play-end hold's own paints.
   */
  MAX_FRAMES: Math.ceil(PLAY.MAX_PLAY_SEC * 60) + 8,
  /** A throw and a runner converging inside this window is a bang-bang play. */
  BANG_BANG_SEC: 0.4,
} as const;

/** One kid, as drawn: where he stood, which way he faced, what he was playing. */
export interface ReplayActor {
  id: string;
  x: number;
  z: number;
  facing: number;
  visible: boolean;
  clip: AnimName | null;
  clipTime: number;
  glove: boolean;
  /** World-space visual swing target; copied with the pose for deterministic seeking. */
  batContact?: [number, number, number];
}

/** One drawn tick of a live play, as values. */
export interface ReplaySnapshot {
  /** The play's own clock at capture, seconds. */
  t: number;
  ball: [number, number, number];
  actors: ReplayActor[];
  /** The chasing fielder at that tick, or null once nobody is. */
  activeId: string | null;
  /** What the camera policy was handed for this tick, so playback re-frames the same cast. */
  camera: CameraInput;
}

/** What the view folds out of a play's event stream, tick by tick. */
export interface PlayHighlights {
  /** Fielders who have dived so far in this play. */
  dove: string[];
  /** A catch by a fielder who dove — the marquee highlight. */
  diveCatch: boolean;
  /** Outs recorded on this play; two is a genuine double play. */
  outs: number;
  /** The ball came off the fence. */
  carom: boolean;
  /** An out recorded while a throw and a runner were converging on one bag. */
  bangBang: boolean;
  homer: boolean;
}

export function newHighlights(): PlayHighlights {
  return { dove: [], diveCatch: false, outs: 0, carom: false, bangBang: false, homer: false };
}

/**
 * Fold this tick's events into the highlights. `play.events` is cleared every
 * tick by the reducer, so this must run on every live frame; the `between`
 * frame that follows the play carries nothing of it.
 */
export function foldHighlights(h: PlayHighlights, play: PlayState, cam: CameraInput): void {
  const racing = cam.bangBangSec !== undefined && cam.bangBangSec <= REPLAY.BANG_BANG_SEC;
  for (const e of play.events) {
    if (e.t === 'dive' && !h.dove.includes(e.fielder)) h.dove.push(e.fielder);
    else if (e.t === 'catch' && h.dove.includes(e.fielder)) h.diveCatch = true;
    else if (e.t === 'carom') h.carom = true;
    else if (e.t === 'out' && racing) h.bangBang = true;
  }
  h.outs = play.outs;
  h.homer = play.homeRun;
}

/**
 * Does this play earn the 📼 treatment? A homer is excluded on purpose: the
 * trot and the fireworks own that beat (`actionCues.homeRunTrot`), and a
 * replay after a six-second hold would be the one thing longer than the
 * homer itself.
 */
export function isReplayWorthy(h: PlayHighlights): boolean {
  return !h.homer && (h.diveCatch || h.outs >= 2 || h.carom || h.bangBang);
}

/**
 * Between two recorded ticks. Continuous fields lerp; discrete ones (clip
 * name, visibility, glove, facing) snap to the later frame — v1's rule, and
 * the reason a clip never blends between two names it was never in.
 */
export function lerpSnapshot(a: ReplaySnapshot, b: ReplaySnapshot, k: number): ReplaySnapshot {
  const kk = k <= 0 ? 0 : k >= 1 ? 1 : k;
  const mix = (p: number, q: number): number => p + (q - p) * kk;
  const byId = new Map(a.actors.map((actor) => [actor.id, actor] as const));
  return {
    t: mix(a.t, b.t),
    ball: [mix(a.ball[0], b.ball[0]), mix(a.ball[1], b.ball[1]), mix(a.ball[2], b.ball[2])],
    actors: b.actors.map((to) => {
      const from = byId.get(to.id);
      if (!from) return to;
      const sameClip = from.clip === to.clip;
      return {
        ...to,
        x: mix(from.x, to.x),
        z: mix(from.z, to.z),
        clipTime: sameClip ? mix(from.clipTime, to.clipTime) : to.clipTime,
      };
    }),
    activeId: b.activeId,
    camera: b.camera,
  };
}

/**
 * The camera during playback: the same policy, over the recorded input, so
 * the tape re-frames the cast the live frame framed. The first frame is a
 * CUT whatever the policy says — the tape may start a tick after contact if
 * that tick was never drawn, and a replay that blended in from the plate
 * would open on the wrong picture.
 */
export function replayCamera(snap: ReplaySnapshot, prev?: CameraCue): CameraCue {
  const cue = chooseCamera(snap.camera, prev);
  return prev ? cue : { ...cue, transition: 'cut' };
}
