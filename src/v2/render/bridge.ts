// ---------------------------------------------------------------------------
// The coupling point between the sim and the scene.
//
// ★ THIS FILE IS THE ONE `AGENTS.md` HAS CLAIMED ALL ALONG. Its architecture
// rule reads "`src/v2/render/**` reads sim state and never writes it.
// `render/bridge.ts` is the single named coupling point" — and until PR 13 the
// file did not exist. Same class as `isFair` having no caller, `startDive`
// having none, and the purity lint spending its first life vacuously satisfied:
// a documented structure nothing had ever leaned on.
//
// ★ IT READS AND NEVER WRITES, and that is enforced rather than reviewed.
// `purity.lint.test.js` fails a mutation of any sim-owned field from this file,
// the same way it fails a v1 module importing v2. The one-way edge is the whole
// value of having a single named seam: the sim cannot be perturbed by anything
// the camera or the animation wants.
//
// ★ AND IT OWNS NO POLICY. Where the camera goes is `cameraCues.chooseCamera`,
// which is pure and tested; which clip plays is `AnimationDirector`; what a kid
// looks like is `CharacterFactory`. This file is the wiring between them, so
// each of those stays testable without a GPU.
// ---------------------------------------------------------------------------

import type { Object3D } from 'three';
import type { LiveFrame } from '../sim/game';
import type { PlayState } from '../sim/play';
import { FIELD_POSITIONS, HOME, basePos } from '../sim/field';
import { DEFENSE } from '../sim/params';
import { isSettled, runnerPos } from '../sim/runners';
import { cloneState, sampleAt, stepFlight, type BallState } from '../sim/flight';
import type { KidView } from './CharacterModel';
import { AnimationDirector } from './AnimationDirector';
import type { CameraInput } from './cameraCues';
import { clipSpec } from './clips';

/** Everything the bridge is allowed to move. */
export interface SceneRefs {
  /** charId -> the kid on the field. Nine fielders plus whoever is batting. */
  kids: Map<string, KidView>;
  /** charId -> its director, so locomotion and one-shots stay in one place. */
  directors: Map<string, AnimationDirector>;
  ball: Object3D;
}

/**
 * Position the scene from one frame.
 *
 * `dtSec` is the RENDER delta, used only for the animation mixers — the sim's
 * own clock is inside `frame` and this function never advances it.
 */
export function applyFrame(
  refs: SceneRefs,
  frame: LiveFrame,
  dtSec: number,
  pitchElapsedSec = 0
): void {
  if (frame.phase === 'live' && frame.play) {
    applyLive(refs, frame.play);
  } else {
    // ★ THE DEFENCE STANDS AT ITS POSTS BETWEEN PITCHES. Skipping this was the
    // first thing watching the page found: with no live `PlayState` the view
    // drew nobody but the batter, so the park was empty until contact and full
    // afterwards. A fielder is on the field the whole time.
    applyIdleDefence(refs, frame);
    if (frame.phase === 'pitch' && frame.pitch) applyPitch(refs, frame, pitchElapsedSec);
    else if (frame.phase === 'windup') restBall(refs);
  }
  for (const d of refs.directors.values()) d.update(dtSec);
}

/** A reaction or action gets to finish before an idle/locomotion loop replaces
 * it. Position still comes from the sim every tick; this protects motion only. */
function holdsOneShot(dir: AnimationDirector | undefined): boolean {
  const name = dir?.playing;
  return !!name && !clipSpec(name).loop;
}

/**
 * Nine fielders at their posts, facing the plate, idling.
 *
 * ★ AND IT IS WHAT STARTS A CLIP AT ALL. `setLocomotionSpeed(0)` plays `idle`;
 * nothing else in this file does. Until the defence was drawn between pitches,
 * no director was ever asked for anything, and every character on the page
 * stood in its BIND POSE with its arms out — visible in the first screenshot,
 * invisible to every test.
 */
function applyIdleDefence(refs: SceneRefs, frame: LiveFrame): void {
  for (const [id, pos] of Object.entries(frame.defence)) {
    const kid = refs.kids.get(id);
    if (!kid) continue;
    const at = FIELD_POSITIONS[pos];
    kid.setPosition(at.x, at.z);
    kid.setFacing(Math.atan2(HOME.x - at.x, HOME.z - at.z));
    // ★ THE CATCHER CROUCHES, AND IT IS FRAMING RATHER THAN FLAVOUR. His post
    // is z -5 and the PITCH rig watches from z -18, so he is the nearest thing
    // to the lens by a factor of three and a standing catcher fills the middle
    // of the frame — measured by watching, which is the only way this kind of
    // thing is ever found. v1 solves the same problem by cropping its catcher
    // at the frame bottom; here he simply does what a catcher does.
    //
    // ⚠️ ASKING FOR THE CLIP IS NOT THE SAME AS GETTING THE CROUCH. This line
    // has been here since PR 13 and he went on drawing 6.43ft — his full
    // standing height — because `field_ready` bent his knees without dropping
    // his hips, which lifts a kid's feet rather than lowering his head. See
    // `proceduralClips.ts`'s ground solve and `groundContact.test.ts`.
    const dir = refs.directors.get(id);
    if (!holdsOneShot(dir)) {
      if (pos === 'C') dir?.play('field_ready');
      else dir?.setLocomotionSpeed(0);
    }
  }
  const batter = refs.kids.get(frame.batterId);
  if (batter) {
    batter.setPosition(-2.2, 1.2);
    batter.setFacing(Math.PI);
    // ★ AND THE BATTER STANDS IN. `bat_stance` is in the clip contract, every
    // swing clip names it as its `returnsTo`, and nothing had ever played it —
    // so the one kid the camera is pointed at waited for the pitch in `idle`,
    // arms at his sides, and settled out of a swing into a pose he had never
    // been in. Same class as the defence standing in bind pose before PR 13
    // drew it: a clip that exists, is documented, and has no caller.
    const dir = refs.directors.get(frame.batterId);
    if (!holdsOneShot(dir)) dir?.play('bat_stance');
  }
}

/** A ball in play: nine fielders, the runners, and the ball itself. */
function applyLive(refs: SceneRefs, play: PlayState): void {
  refs.ball.position.set(play.ball.p.x, play.ball.p.y, play.ball.p.z);

  for (const f of play.fielders) {
    const kid = refs.kids.get(f.charId);
    if (!kid) continue;
    kid.setPosition(f.p.x, f.p.z);
    // ★ FACE THE BALL, not the direction of travel. A fielder running to a spot
    // is watching the ball the whole way, and `moveToward` gives no heading to
    // read anyway once he arrives.
    kid.setFacing(Math.atan2(play.ball.p.x - f.p.x, play.ball.p.z - f.p.z));
    // Playback rate follows the SIM's speed, which is what stops feet skating —
    // see `clips.ts`'s `authoredSpeedFts`.
    const dir = refs.directors.get(f.charId);
    if (!holdsOneShot(dir)) dir?.setLocomotionSpeed(f.speedFts);
  }

  for (const r of play.runners) {
    const kid = refs.kids.get(r.charId);
    if (!kid) continue;
    const p = runnerPos(r);
    kid.setPosition(p.x, p.z);
    if (!isSettled(r)) {
      const to = basePos(r.to);
      kid.setFacing(Math.atan2(to.x - p.x, to.z - p.z));
    }
    const dir = refs.directors.get(r.charId);
    // Once the ball is live, the batter has left the box. Let the sim-owned
    // run interrupt a batting follow-through; fielding actions and slides still
    // finish while their root continues along the sim track.
    const battingShot = !!dir?.playing && clipSpec(dir.playing).group === 'batting';
    if (!holdsOneShot(dir) || battingShot) dir?.setLocomotionSpeed(r.speedFts);
  }
}

/**
 * The pitch, drawn by integrating the ball the sim released.
 *
 * ★ THROUGH THE SIM'S OWN INTEGRATOR, not a straight line from release to the
 * crossing — a lerp would draw a pitch with no break in it, and break is the
 * one thing the pitch model exists to produce (`sim.pitchCorridorV2`: the curve
 * is EMERGENT Magnus, not a drawn bow).
 *
 * ★ AND `sampleAt` FINALLY HAS A CALLER. It was written as "the render seam,
 * exposed before any renderer exists" and has had none since PR 2. It is the
 * interpolator BETWEEN two integrator steps, which is what keeps a 240Hz
 * trajectory smooth on a 60Hz screen without the render dt leaking into the
 * physics.
 *
 * Re-integrated from release every frame rather than carried: a pitch is ~1.2s
 * at 240Hz, so this is under three hundred steps, and stateless means it cannot
 * drift from the sim's own answer.
 */
const PITCH_HZ = 240;
/** One sim tick. Below this, a play has only just started — that is contact. */
const CONTACT_TICK_SEC = 1 / 60 + 1e-9;
function applyPitch(refs: SceneRefs, frame: LiveFrame, elapsedSec: number): void {
  const { release, travelSec } = frame.pitch!;
  const want = elapsedSec < 0 ? 0 : elapsedSec > travelSec ? travelSec : elapsedSec;
  const dt = 1 / PITCH_HZ;
  let cur: BallState = cloneState(release);
  let t = 0;
  while (t + dt <= want) {
    cur = stepFlight(cur, dt, {}).state;
    t += dt;
  }
  // The remainder, interpolated — the seam `sampleAt` exists for.
  const at = want > t ? sampleAt(cur, stepFlight(cur, dt, {}).state, (want - t) / dt) : cur;
  refs.ball.position.set(at.p.x, at.p.y, at.p.z);
}

/**
 * The ball in the pitcher's hand, during the windup.
 *
 * Without this it sits wherever the last pitch left it — on the ground at the
 * plate, or out in the outfield where the play ended — which reads as a second
 * ball on the field.
 */
function restBall(refs: SceneRefs): void {
  const at = FIELD_POSITIONS.P;
  refs.ball.position.set(at.x, DEFENSE.CATCH_CENTRE_FT, at.z);
}

/**
 * What the camera policy needs, out of a frame.
 *
 * Kept here rather than in `cameraCues.ts` because that file is PURE and must
 * not learn about `PlayState` — it is the reason `cameraCues.test.ts` can
 * project the bases through a preset with no pixels and no sim.
 */
export function cameraInputFor(frame: LiveFrame): CameraInput {
  if (frame.phase === 'live' && frame.play) {
    const p = frame.play;
    const chaser = p.fielders[p.active];
    const lead = p.runners.find((r) => r.done === null);
    return {
      // ★ THE FIRST TICK OF A PLAY IS `contact`, AND SAYING SO IS WHAT MAKES
      // THE HARD CUT REACHABLE. `chooseCamera` cuts on `phase === 'contact'`
      // and blends on `'live'`; a bridge that reported every live tick as
      // `'live'` would leave the policy's headline rule — "contact is THE cut",
      // proven in v1 and in BB2001 — unreachable while looking wired. Caught by
      // asserting the cut in `cameraCues.test.ts` against the real caller.
      phase: p.elapsedSec <= CONTACT_TICK_SEC ? 'contact' : 'live',
      ball: [p.ball.p.x, p.ball.p.y, p.ball.p.z],
      chaser: chaser ? [chaser.p.x, chaser.p.z] : undefined,
      leadRunner: lead ? [runnerPos(lead).x, runnerPos(lead).z] : undefined,
      homer: p.homeRun,
    };
  }
  // ★ THE WINDUP IS PART OF THE PITCH, TO THE CAMERA. Falling through to
  // `between` would cut to the field preset and back for one frame before every
  // single delivery — a flicker per pitch, which no test would see and any
  // watcher would.
  if (frame.phase === 'pitch' || frame.phase === 'windup') return { phase: 'pitch' };
  return { phase: 'between' };
}
