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

import { Vector3, type Object3D } from 'three';
import type { LiveFrame } from '../sim/game';
import type { PlayState } from '../sim/play';
import { FIELD_POSITIONS, HOME, basePos } from '../sim/field';
import { DEFENSE } from '../sim/params';
import { isSettled, remainingFt, runnerPos } from '../sim/runners';
import { cloneState, sampleAt, stepFlight, type BallState } from '../sim/flight';
import type { KidView } from './CharacterModel';
import { AnimationDirector } from './AnimationDirector';
import type { CameraInput } from './cameraCues';
import { clipSpec } from './clips';
import { activeFielderCue, ballPresenceCue, ballShadowCue, type BallProjection } from './readabilityCues';
import { homeRunTrot, throwFacingTarget } from './actionCues';
import { battingPlacement, battingRunOut } from './battingPose';
import type { ReplayActor, ReplaySnapshot } from './replayCues';

/** Everything the bridge is allowed to move. */
export interface SceneRefs {
  /** charId -> the kid on the field. Nine fielders plus whoever is batting. */
  kids: Map<string, KidView>;
  /** charId -> its director, so locomotion and one-shots stay in one place. */
  directors: Map<string, AnimationDirector>;
  ball: Object3D;
  /** Render-only field chrome. Optional so non-game review surfaces stay cheap. */
  ballShadow?: Object3D;
  activeFielderRing?: Object3D;
}

export interface FrameViewOptions {
  ballProjection?: BallProjection;
  /** Screens use the live park as scenery but must not inherit gameplay chrome. */
  readability?: boolean;
  /** Human placement, including misses; absent for CPU batting. */
  batAimHeightFt?: number;
  /** True only when this live half routes human input to the defence. */
  fieldingFocus?: boolean;
  /** Last frame's camera eye, for the ball's apparent-size cue. */
  cameraAt?: { x: number; y: number; z: number };
  /**
   * Seconds into a play-end hold, when the frame's play is a finished one the
   * view is still painting. A homer's runners trot from it (`homeRunTrot`).
   */
  holdElapsedSec?: number;
}

const NO_PROTECTED_IDS: ReadonlySet<string> = new Set();
const throwBallOrigins = new WeakMap<SceneRefs, { flight: NonNullable<PlayState['throw']>; offset: Vector3 }>();
const lastThrowCarrier = new WeakMap<SceneRefs, string>();

/** Character display scale raises the throwing hand above the sim's release
 * point. Carry the held ball in that hand, then ease only this visual offset
 * out over the opening quarter of flight. Physics and arrival stay unchanged. */
function applyThrowBall(refs: SceneRefs, play: PlayState): void {
  const held = play.heldBy === null ? null : play.fielders[play.heldBy].charId;
  if (held) lastThrowCarrier.set(refs,held);
  const event = play.events.find(e=>e.t==='throw'||e.t==='relay');
  // Several sim ticks can precede one paint; the release event may already
  // have been consumed. Remember the displayed carrier across that boundary.
  const id = held ?? (event && 'fielder' in event ? event.fielder : lastThrowCarrier.get(refs));
  const kid = id ? refs.kids.get(id) : null;
  const hand = kid?.bones.find(b=>b.name==='RightHand');
  if (hand && id && refs.directors.get(id)?.playing === 'throw_overhand') {
    kid!.root.updateMatrixWorld(true);
    const palm = hand.localToWorld(new Vector3(.12,-.04,0));
    if (held) refs.ball.position.copy(palm);
    else if (play.throw && throwBallOrigins.get(refs)?.flight !== play.throw) {
      throwBallOrigins.set(refs,{flight:play.throw,offset:palm.sub(refs.ball.position)});
    }
  }
  if (!play.throw) {
    throwBallOrigins.delete(refs);
    if (!held) lastThrowCarrier.delete(refs);
    return;
  }
  const origin=throwBallOrigins.get(refs);
  if (origin?.flight !== play.throw) return;
  const progress=(play.elapsedSec-play.throw.releasedAtSec)/(play.throw.arrivesAtSec-play.throw.releasedAtSec);
  const t=Math.min(1,Math.max(0,progress*4));
  refs.ball.position.addScaledVector(origin.offset,1-t*t*(3-2*t));
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
  pitchElapsedSec = 0,
  /** Front-end presenters whose clip is owned by the active screen. */
  protectedIds: ReadonlySet<string> = NO_PROTECTED_IDS,
  view: FrameViewOptions = {}
): void {
  if (frame.phase === 'live' && frame.play) {
    applyLive(refs, frame.play, protectedIds, view.holdElapsedSec);
  } else {
    // ★ THE DEFENCE STANDS AT ITS POSTS BETWEEN PITCHES. Skipping this was the
    // first thing watching the page found: with no live `PlayState` the view
    // drew nobody but the batter, so the park was empty until contact and full
    // afterwards. A fielder is on the field the whole time.
    applyIdleDefence(refs, frame, protectedIds, view.batAimHeightFt);
    if (frame.phase === 'pitch' && frame.pitch) applyPitch(refs, frame, pitchElapsedSec);
    else if (frame.phase === 'windup') restBall(refs);
  }
  const carrier = frame.phase === 'live' && frame.play?.phase === 'live' && frame.play.heldBy !== null
    ? frame.play.fielders[frame.play.heldBy].charId : null;
  for (const [id,d] of refs.directors) {
    if (id !== carrier) d.cancelThrowPreparation();
    d.update(dtSec);
  }
  if (frame.phase === 'live' && frame.play) applyThrowBall(refs, frame.play);
  applyReadability(refs, frame, view);
}

/**
 * Record what the scene is DRAWING for a live tick — the instant replay's
 * tape. Called after `applyFrame`, so every value is the one on screen:
 * positions and facing off the kids' roots, clip name and time off the
 * directors, the ball off its object, and the camera policy's input for the
 * tick. Values only; the frame and the play are read and dropped
 * (`src/v2/AGENTS.md` § The game loop on retaining a `LiveFrame`).
 */
export function snapshotScene(refs: SceneRefs, frame: LiveFrame, holdElapsedSec?: number): ReplaySnapshot | null {
  if (frame.phase !== 'live' || !frame.play) return null;
  const live = frame.play;
  const ids = new Set<string>();
  for (const fielder of live.fielders) ids.add(fielder.charId);
  for (const runner of live.runners) ids.add(runner.charId);
  const actors: ReplayActor[] = [];
  for (const id of ids) {
    const kid = refs.kids.get(id);
    if (!kid) continue;
    const dir = refs.directors.get(id);
    actors.push({
      id,
      x: kid.root.position.x,
      z: kid.root.position.z,
      facing: kid.root.rotation.y,
      visible: kid.root.visible,
      clip: dir?.playing ?? null,
      clipTime: dir?.action?.time ?? 0,
      glove: dir?.gloveVisible ?? false,
      batContact: dir?.battingPose.contact?.toArray(),
    });
  }
  const chaser = live.fielders[live.active];
  return {
    t: live.elapsedSec,
    ball: [refs.ball.position.x, refs.ball.position.y, refs.ball.position.z],
    actors,
    activeId: chaser ? chaser.charId : null,
    camera: cameraInputFor(frame, holdElapsedSec),
  };
}

export interface SnapshotViewOptions {
  ballProjection?: BallProjection;
  /** Put each kid's clip back at its recorded time (playback), or leave motion alone. */
  seekClips: boolean;
  /** Last frame's camera eye, for the ball's apparent-size cue. */
  cameraAt?: { x: number; y: number; z: number };
}

/**
 * Re-apply a recorded tick: the replay's other half. Writes the same scene
 * objects `applyFrame` writes, from the tape instead of the sim, and never
 * decides a clip — `seek` shows the recorded one at the recorded time. The
 * steering ring is hidden: there is no input during a replay.
 */
export function applySnapshot(refs: SceneRefs, snap: ReplaySnapshot, view: SnapshotViewOptions): void {
  for (const actor of snap.actors) {
    const kid = refs.kids.get(actor.id);
    if (!kid) continue;
    kid.root.position.x = actor.x;
    kid.root.position.z = actor.z;
    kid.root.rotation.y = actor.facing;
    kid.root.visible = actor.visible;
    const dir = refs.directors.get(actor.id);
    dir?.setGloveVisible(actor.glove);
    if (view.seekClips && dir && actor.clip) {
      dir.battingPose.contact = actor.batContact ? new Vector3(...actor.batContact) : null;
      dir.seek(actor.clip, actor.clipTime);
    }
  }
  refs.ball.position.set(snap.ball[0], snap.ball[1], snap.ball[2]);
  const at = { x: snap.ball[0], y: snap.ball[1], z: snap.ball[2] };
  const presence = ballPresenceCue(at, view.cameraAt ?? { x: 0, y: 0, z: 0 }, 'live', view.cameraAt !== undefined, view.ballProjection);
  refs.ball.scale.setScalar(presence.scale);
  if (refs.ballShadow) {
    const cue = ballShadowCue(at, 'live', true);
    refs.ballShadow.visible = cue.visible;
    refs.ballShadow.position.set(cue.x, 0.055, cue.z);
    refs.ballShadow.scale.setScalar(cue.scale);
  }
  if (refs.activeFielderRing) refs.activeFielderRing.visible = false;
}

/** Field chrome reads the already-positioned ball and active fielder. */
function applyReadability(refs: SceneRefs, frame: LiveFrame, view: FrameViewOptions): void {
  const enabled = view.readability !== false;
  const presence = ballPresenceCue(
    { x: refs.ball.position.x, y: refs.ball.position.y, z: refs.ball.position.z },
    view.cameraAt ?? { x: 0, y: 0, z: 0 },
    frame.phase,
    enabled && view.cameraAt !== undefined,
    view.ballProjection
  );
  refs.ball.scale.setScalar(presence.scale);
  if (refs.ballShadow) {
    const cue = ballShadowCue(
      { x: refs.ball.position.x, y: refs.ball.position.y, z: refs.ball.position.z },
      frame.phase,
      enabled
    );
    refs.ballShadow.visible = cue.visible;
    refs.ballShadow.position.set(cue.x, 0.055, cue.z);
    refs.ballShadow.scale.setScalar(cue.scale);
  }
  if (refs.activeFielderRing) {
    const cue = activeFielderCue(frame.phase === 'live' ? frame.play : null, view.fieldingFocus === true, enabled);
    refs.activeFielderRing.visible = cue.visible;
    refs.activeFielderRing.position.set(cue.x, 0.075, cue.z);
  }
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
function applyIdleDefence(
  refs: SceneRefs,
  frame: LiveFrame,
  protectedIds: ReadonlySet<string>,
  batAimHeightFt?: number
): void {
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
    // On defence you wear the mitt — a role, asserted every frame for the
    // same reason the posts are: whoever just came in from batting still has
    // last half's state.
    dir?.setGloveVisible(true);
    if (!protectedIds.has(id) && !holdsOneShot(dir)) {
      if (pos === 'C') dir?.play('field_ready');
      else dir?.setLocomotionSpeed(0);
    }
  }
  // ★ THE RUNNERS STAND ON THEIR BAGS BETWEEN PITCHES, for the same reason the
  // defence stands at its posts. A runner was only ever positioned inside a
  // live `PlayState`, so a kid who singled stood on first for the one frame the
  // play had left, vanished at the between cut, and reappeared at the next
  // contact — while the scoreboard's pip said he was there the whole time. The
  // identities are `LiveFrame.baseIds`, the half's own occupants; the sim moves
  // them (a walk, a steal, the next play) and this only draws where they are.
  frame.baseIds.forEach((id, i) => {
    if (!id) return;
    const kid = refs.kids.get(id);
    if (!kid) return;
    const at = basePos(i + 1);
    const next = basePos(i + 2);
    kid.setPosition(at.x, at.z);
    // Facing the next bag, the way a runner takes his lead.
    kid.setFacing(Math.atan2(next.x - at.x, next.z - at.z));
    const dir = refs.directors.get(id);
    dir?.setGloveVisible(false);
    if (!protectedIds.has(id) && !holdsOneShot(dir)) dir?.setLocomotionSpeed(0);
  });
  // ★ NOT WHEN HE IS THE RUNNER. The between frame still names the kid who
  // just batted, and if he singled or walked he is on first in `baseIds` —
  // standing him in the box for the between beat and moving him to the bag at
  // the next windup would be a teleport with a 2.5s layover.
  const batter = frame.baseIds.includes(frame.batterId) ? undefined : refs.kids.get(frame.batterId);
  if (batter) {
    // Match the reference grip + barrel reach; scale belongs to the art only.
    const box = battingPlacement(batter.root.scale.x);
    batter.setPosition(box.x, box.z);
    batter.setFacing(box.facing);
    // ★ AND THE BATTER STANDS IN. `bat_stance` is in the clip contract, every
    // swing clip names it as its `returnsTo`, and nothing had ever played it —
    // so the one kid the camera is pointed at waited for the pitch in `idle`,
    // arms at his sides, and settled out of a swing into a pose he had never
    // been in. Same class as the defence standing in bind pose before PR 13
    // drew it: a clip that exists, is documented, and has no caller.
    const dir = refs.directors.get(frame.batterId);
    if (dir && frame.pitch) {
      const at = pitchAt(frame, frame.pitch.travelSec).p;
      const point = new Vector3(at.x, batAimHeightFt ?? at.y, at.z);
      batter.root.parent?.updateWorldMatrix(true, false);
      dir.battingPose.contact = batter.root.parent ? batter.root.parent.localToWorld(point) : point;
    } else if (dir && frame.phase === 'windup') dir.battingPose.contact = null;
    dir?.setGloveVisible(false);
    if (!protectedIds.has(frame.batterId) && !holdsOneShot(dir)) dir?.play('bat_stance');
  }
}

/** A ball in play: nine fielders, the runners, and the ball itself. */
function applyLive(
  refs: SceneRefs,
  play: PlayState,
  protectedIds: ReadonlySet<string>,
  holdElapsedSec?: number
): void {
  refs.ball.position.set(play.ball.p.x, play.ball.p.y, play.ball.p.z);
  // The home-run trot: choreography for a play the sim has already scored.
  // Positions come from the cue instead of the runner's frozen leg; the
  // `PlayState` itself is read and never written, as everything here is.
  const trot = play.homeRun && holdElapsedSec !== undefined ? homeRunTrot(play, holdElapsedSec) : null;

  for (const f of play.fielders) {
    const kid = refs.kids.get(f.charId);
    if (!kid) continue;
    refs.directors.get(f.charId)?.setGloveVisible(true);
    kid.setPosition(f.p.x, f.p.z);
    // ★ FACE THE BALL, not the direction of travel. A fielder running to a spot
    // is watching the ball the whole way, and `moveToward` gives no heading to
    // read anyway once he arrives.
    const throwTarget = throwFacingTarget(play, f.charId);
    if (throwTarget) kid.setFacing(Math.atan2(throwTarget.x-f.p.x,throwTarget.z-f.p.z));
    else if (refs.directors.get(f.charId)?.playing !== 'throw_overhand') {
      kid.setFacing(Math.atan2(play.ball.p.x - f.p.x, play.ball.p.z - f.p.z));
    }
    // Playback rate follows the SIM's speed, which is what stops feet skating —
    // see `clips.ts`'s `authoredSpeedFts`.
    const dir = refs.directors.get(f.charId);
    if (!protectedIds.has(f.charId) && !holdsOneShot(dir)) dir?.setLocomotionSpeed(f.speedFts);
  }

  for (const r of play.runners) {
    const kid = refs.kids.get(r.charId);
    if (!kid) continue;
    refs.directors.get(r.charId)?.setGloveVisible(false);
    const dir = refs.directors.get(r.charId);
    const trotting = trot?.find((c) => c.characterId === r.charId);
    if (trotting) {
      kid.setPosition(trotting.x, trotting.z);
      kid.setFacing(trotting.facing);
      if (!protectedIds.has(r.charId)) {
        // Home, he celebrates; the one-shot settles to idle and goes again.
        if (trotting.home && !holdsOneShot(dir)) dir?.playReaction(true);
        else if (!trotting.home) dir?.setLocomotionSpeed(trotting.speedFts);
      }
      continue;
    }
    const p = runnerPos(r);
    const box = r.startBase === 0 && r.from === 0 ? battingRunOut(kid.root.scale.x, r.alongFt) : { x: 0, z: 0 };
    kid.setPosition(p.x + box.x, p.z + box.z);
    if (!isSettled(r)) {
      const to = basePos(r.to);
      kid.setFacing(Math.atan2(to.x - p.x, to.z - p.z));
    }
    // Once the ball is live, the batter has left the box. Let the sim-owned
    // run interrupt a batting follow-through; fielding actions and slides still
    // finish while their root continues along the sim track.
    const battingShot = !!dir?.playing && clipSpec(dir.playing).group === 'batting';
    if (!protectedIds.has(r.charId) && (!holdsOneShot(dir) || battingShot)) {
      dir?.setLocomotionSpeed(r.speedFts);
    }
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
function pitchAt(frame: LiveFrame, elapsedSec: number): BallState {
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
  return at;
}

function applyPitch(refs: SceneRefs, frame: LiveFrame, elapsedSec: number): void {
  const at = pitchAt(frame, elapsedSec);
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
export function cameraInputFor(frame: LiveFrame, holdElapsedSec?: number): CameraInput {
  if (frame.phase === 'live' && frame.play && frame.play.homeRun && holdElapsedSec !== undefined) {
    // The trot: the ball is gone, so the fit ladder is handed the runners
    // still on their lap and the bags ahead of them, with the batter-runner —
    // the last one home — as the lead the frame follows.
    const trot = homeRunTrot(frame.play, holdElapsedSec).filter((c) => !c.home);
    const lead = trot[trot.length - 1];
    if (!lead) return { phase: 'between' };
    return {
      phase: 'live',
      ball: [lead.x, 3, lead.z],
      leadRunner: [lead.x, lead.z],
      runners: trot.map((c) => [c.x, c.z] as const),
      targetBags: trot.map((c) => [c.next.x, c.next.z] as const),
    };
  }
  if (frame.phase === 'live' && frame.play) {
    const p = frame.play;
    const chaser = p.fielders[p.active];
    const live = p.runners.filter((r) => r.done === null);
    const lead = live[0];
    // The launch verdict from the trace, which is fixed at contact — the
    // policy's own comment asks for "the launch, not where the ball is now".
    // A vacuum parabola satisfies tan(θ) = 4·apex/carry; drag skews it, but
    // as the camera's deep-fly heuristic the stable version is the honest one.
    const landing = p.trace.landing ?? p.trace.settle;
    const carryFt = Math.sqrt(landing.x * landing.x + landing.z * landing.z);
    const launchDeg = (Math.atan2(4 * p.trace.apexFt, Math.max(carryFt, 1)) * 180) / Math.PI;
    // A bang-bang play: a thrown ball and a runner converging on one bag at
    // nearly the same instant. Both ETAs are approximations — the camera cue
    // needs "is this a race", not an umpire's call.
    let bangBangSec: number | undefined;
    if (p.throw && p.throw.target.kind === 'base') {
      const bag = p.throw.target.base;
      const racer = live.find((r) => r.to === bag);
      if (racer) {
        const throwEta = p.throw.arrivesAtSec - p.elapsedSec;
        const runEta = remainingFt(racer) / Math.max(racer.speedFts, 6);
        if (Math.abs(throwEta - runEta) <= 0.35) {
          bangBangSec = Math.max(0, Math.min(throwEta, runEta));
        }
      }
    }
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
      // The whole cast, so the policy's fit ladder can promise every runner
      // and every contested bag a place in the frame (round-2 re-audit #12).
      runners: live.map((r) => {
        const at = runnerPos(r);
        return [at.x, at.z] as const;
      }),
      targetBags: live
        .filter((r) => !isSettled(r))
        .map((r) => {
          const bag = basePos(r.to);
          return [bag.x, bag.z] as const;
        }),
      launchDeg,
      carryFt,
      bangBangSec,
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
