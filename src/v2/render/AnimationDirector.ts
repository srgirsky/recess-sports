// ---------------------------------------------------------------------------
// ★ THE ANIMATION DIRECTOR — render-side, and the ONLY place clips are played.
//
// A thin wrapper over three's `AnimationMixer` that knows the contract in
// `clips.ts`, which buys three things a bare mixer does not:
//
//   1. MARKER TIME-WARP. `playToMarker` sets the playback rate so a clip's
//      marker frame lands on the simulated instant of contact / release /
//      catch. That is what makes animation structurally unable to drift out of
//      sync with the physics: the sim decides WHEN, and the clip is stretched
//      to agree. v1 had to hand-tune `ANIM.SWING_CONTACT_FRAC` against a
//      hardcoded swing duration and re-tune it every time the pitch speed
//      moved.
//   2. THE BLEND GRAPH. Every one-shot names the clip it settles into and the
//      crossfade to use, so "no popping" is a property of the data rather than
//      of every call site remembering to schedule a follow-up.
//   3. GRACEFUL PARTIAL DELIVERY. Clips resolve character take → shared
//      `anims_recess_v1.glb` → procedural stand-in, by name. An animator can
//      replace one kid's hero/reaction/idle work without cloning all 43 clips
//      or changing the rest of the cast.
//
// It reads sim state and never writes it: the sim owns position, facing and
// every timing decision, and this file owns only what is drawn.
// ---------------------------------------------------------------------------

import { AnimationMixer, LoopOnce, LoopRepeat, type AnimationAction, type AnimationClip, type Object3D } from 'three';
import { HandPose } from './HandPose';
import { BattingPose } from './battingPose';
import {
  CLIP_BY_NAME,
  LOOP_MAX_RATE,
  LOOP_MIN_RATE,
  clipSpec,
  holdsBat,
  locomotionRateFor,
  markerLeadSec,
  pickLocomotion,
  warpRateFor,
  type AnimName,
  type ClipSpec,
} from './clips';
import type { Expression } from '../../data/types';
import type { FaceCell } from './faceAtlas';
import {
  actingRateFor,
  blinkEverySec,
  faceForClip,
  fidgetEverySec,
  performancePhase,
  reactionClipFor,
  type PerformanceProfile,
} from './performance';

export interface PlayOptions {
  /** Crossfade in, ms. Defaults to the clip's own `blendMs`. */
  fadeMs?: number;
  /** Playback rate. Defaults to 1. */
  rate?: number;
  /** Restart even if this clip is already the active one. */
  restart?: boolean;
  /** Fired when a one-shot reaches its end (before it settles). */
  onDone?: () => void;
}

export interface DirectorOptions {
  /** Shared clips from `anims_recess_v1.glb`. */
  clips?: AnimationClip[];
  /** Optional kid-specific takes. These win over shared clips, name by name. */
  performanceClips?: AnimationClip[];
  /** The procedural stand-in library. */
  fallback?: AnimationClip[];
  /** Called once per clip name that had to fall back. */
  onFallback?: (name: string) => void;
  /**
   * This kid's bat prop (see `props.attachBatProp`). The director shows it
   * exactly when `clips.holdsBat` says the playing clip is a plate clip —
   * visibility is a consequence of what is playing, so it cannot desync.
   */
  bat?: Object3D;
  /**
   * This kid's mitt (see `props.attachGloveProp`). Wearing it is a ROLE, not
   * a clip: `bridge.ts` flips `setGloveVisible` from membership in the
   * frame's defence, and the director only vetoes it while a bat clip plays —
   * one kid never carries both.
   */
  glove?: Object3D;
  /**
   * The kid behind the rig. When present, the director coordinates face,
   * reaction tempo, blinks and fidgets with the body clip it alone controls.
   */
  actor?: {
    id: string;
    profile: PerformanceProfile;
    authoredRest?: Expression;
    setExpression: (cell: FaceCell) => void;
  };
}

export class AnimationDirector {
  readonly mixer: AnimationMixer;

  private readonly byName = new Map<string, AnimationClip>();
  private readonly procedural = new Set<string>();
  private readonly sources = new Map<string, 'procedural' | 'shared' | 'character'>();
  private readonly actions = new Map<string, AnimationAction>();
  private current: AnimName | null = null;
  private pending: (() => void) | null = null;
  private warned = new Set<string>();
  private readonly actor: DirectorOptions['actor'];
  private readonly bat: Object3D | undefined;
  private readonly glove: Object3D | undefined;
  private gloveOn = false;
  readonly battingPose: BattingPose;
  private readonly handPose: HandPose;
  private nextBlinkSec = Infinity;
  private nextFidgetSec = Infinity;
  private blinkLeftSec = 0;
  private ageSec = 0;

  constructor(root: Object3D, opts: DirectorOptions = {}) {
    this.mixer = new AnimationMixer(root);
    this.handPose = new HandPose(root);
    this.battingPose = new BattingPose(root, opts.actor?.id === 'wheelchair_ace');
    this.actor = opts.actor;
    this.bat = opts.bat;
    this.glove = opts.glove;
    if (this.actor) {
      this.nextBlinkSec = blinkEverySec(this.actor.profile) * (0.55 + performancePhase(this.actor.id, 17));
      this.nextFidgetSec = fidgetEverySec(this.actor.profile) * (0.65 + performancePhase(this.actor.id, 29));
    }

    for (const clip of opts.fallback ?? []) {
      this.byName.set(clip.name, clip);
      this.procedural.add(clip.name);
      this.sources.set(clip.name, 'procedural');
    }
    // A delivered clip always wins over its stand-in, name by name.
    for (const clip of opts.clips ?? []) {
      this.byName.set(clip.name, clip);
      this.procedural.delete(clip.name);
      this.sources.set(clip.name, 'shared');
    }
    // A bespoke character take is the final word for the names it contains.
    for (const clip of opts.performanceClips ?? []) {
      this.byName.set(clip.name, clip);
      this.procedural.delete(clip.name);
      this.sources.set(clip.name, 'character');
    }
    if (opts.onFallback) for (const name of this.procedural) opts.onFallback(name);

    this.mixer.addEventListener('finished', this.onFinished);
  }

  /** Which clips are still placeholder motion — the review surface shows it. */
  isProcedural(name: string): boolean {
    return this.procedural.has(name);
  }

  /** Which delivery tier supplied this name — shown on the animation review. */
  sourceFor(name: string): 'procedural' | 'shared' | 'character' | 'missing' {
    return this.sources.get(name) ?? 'missing';
  }

  get playing(): AnimName | null {
    return this.current;
  }

  /** The action currently playing, for anyone who needs its raw time. */
  get action(): AnimationAction | null {
    return this.current ? (this.actions.get(this.current) ?? null) : null;
  }

  // --- Playback -------------------------------------------------------------

  play(name: AnimName, opts: PlayOptions = {}): AnimationAction | null {
    const spec = CLIP_BY_NAME[name];
    if (!spec) {
      this.warnOnce(name, `Unknown clip "${name}" — falling back to idle`);
      return name === 'idle' ? null : this.play('idle' as AnimName, opts);
    }

    const clip = this.byName.get(name);
    if (!clip) {
      // Nothing to play at all: neither delivered nor procedural. Idle keeps
      // the character alive rather than freezing it in bind pose, which reads
      // as a crash.
      this.warnOnce(name, `No clip data for "${name}" — falling back to idle`);
      return name === 'idle' ? null : this.play('idle' as AnimName, opts);
    }

    if (this.current === name && !opts.restart) {
      const existing = this.actions.get(name);
      if (existing) existing.timeScale = opts.rate ?? existing.timeScale;
      return existing ?? null;
    }

    this.handPose.restore();
    this.battingPose.restore();
    const next = this.actionFor(name, clip, spec);
    next.reset();
    next.timeScale = opts.rate ?? (this.actor ? actingRateFor(this.actor.profile, name) : 1);
    next.enabled = true;

    const fade = (opts.fadeMs ?? spec.blendMs) / 1000;
    const prev = this.current ? this.actions.get(this.current) : undefined;
    if (prev && prev !== next && fade > 0) {
      next.crossFadeFrom(prev, fade, false);
    } else if (prev && prev !== next) {
      prev.stop();
    }
    next.play();

    this.current = name;
    this.pending = opts.onDone ?? null;
    if (this.bat) this.bat.visible = holdsBat(name);
    if (this.glove) this.glove.visible = this.gloveOn && !holdsBat(name);
    this.applyExpression(name);
    return next;
  }

  /**
   * Play a marker clip so its marker frame lands `secUntilEvent` from now.
   *
   * This is the whole point of marker frames. Ask for a swing 233ms before the
   * ball arrives and it plays at 1.0x; ask 120ms before and it plays at ~1.9x
   * and the bat is still on the ball at the right instant.
   */
  playToMarker(name: AnimName, secUntilEvent: number, opts: PlayOptions = {}): { rate: number; clamped: boolean } {
    // Some sim facts (a catch, a throw release, a human tap) are learned on the
    // event tick itself. Starting the clip at frame zero would put its marker
    // visibly late; seek to the authored marker and let the follow-through play
    // at 1x. The pose on this rendered tick is then the physical pose the sim
    // just resolved, without predicting an uncertain catch or throw.
    if (secUntilEvent <= 0) {
      const action = this.play(name, { ...opts, fadeMs: name.startsWith('throw_') ? 0 : opts.fadeMs, rate: 1, restart: true });
      if (action) {
        action.time = markerLeadSec(name);
        this.mixer.update(0);
        this.handPose.constrainArms(name);
        if (holdsBat(name)) this.battingPose.apply(name, action.time);
        this.handPose.apply(name,Infinity,action.time);
      }
      return { rate: 1, clamped: false };
    }
    const { rate, clamped } = warpRateFor(name, secUntilEvent);
    this.play(name, { ...opts, rate, restart: true });
    return { rate, clamped };
  }

  /** Pose the windup from the possession clock without letting the mixer
   * run through release. Only the actual throw event resumes follow-through. */
  prepareThrow(timeSec: number): void {
    this.seek('throw_overhand', Math.min(markerLeadSec('throw_overhand')-1e-4, Math.max(0,timeSec)));
    if (this.action) this.action.paused = true;
  }

  cancelThrowPreparation(): void {
    if (this.current === 'throw_overhand' && this.action?.paused) this.play('field_ready');
  }

  /**
   * Drive locomotion from the sim's ground speed. Picks the clip whose authored
   * speed keeps the rate inside 0.6x-1.4x and sets that rate — which is exactly
   * the condition under which the feet stop skating.
   */
  setLocomotionSpeed(ftPerSec: number, opts: PlayOptions = {}): AnimName {
    if (ftPerSec < 0.35) {
      this.play('idle' as AnimName, opts);
      return 'idle' as AnimName;
    }
    const name = pickLocomotion(ftPerSec);
    const raw = locomotionRateFor(name, ftPerSec);
    const rate = Math.min(LOOP_MAX_RATE, Math.max(LOOP_MIN_RATE, raw));
    this.play(name, { ...opts, rate });
    return name;
  }

  /** Play this kid's directed win/loss beat, or the broad default for a proxy. */
  playReaction(won: boolean, opts: PlayOptions = {}): AnimName {
    const name = this.actor ? reactionClipFor(this.actor.profile, won) : (won ? 'cheer' : 'upset');
    this.play(name, opts);
    return name;
  }

  /** This kid is (or stops being) on defence — the mitt follows the role. */
  setGloveVisible(on: boolean): void {
    this.gloveOn = on;
    if (this.glove) this.glove.visible = on && (!this.current || !holdsBat(this.current));
  }

  /** Cancel any pending settle and hold whatever is playing. */
  hold(): void {
    this.pending = null;
  }

  /** Whether this kid is wearing the mitt — the role, not the clip's veto. */
  get gloveVisible(): boolean {
    return this.gloveOn;
  }

  /**
   * Put `name` at `timeSec`, with no crossfade and no warp.
   *
   * The instant replay's seam: the tape recorded which clip each kid was
   * playing and where in it he was, and playback puts the action back there.
   * Nothing is re-decided — a marker warped onto a simulated instant at
   * record time is re-shown at the same clip time, so the bat is on the ball
   * in the replay exactly where it was live. A finished one-shot is unpaused
   * so it can be shown mid-motion again; when playback ends, the mixer runs
   * it out at 1x and the settle graph takes over as it always does.
   */
  seek(name: AnimName, timeSec: number): void {
    this.handPose.restore();
    this.battingPose.restore();
    if (this.current !== name) this.play(name, { fadeMs: 0, rate: 1, restart: true });
    const action = this.action;
    if (!action) return;
    // A seek during a crossfade must paint the requested pose, even when the
    // mixer clock is held. Otherwise its weight can stay at zero indefinitely
    // while the readout claims the new clip and frame.
    for (const other of this.actions.values()) if (other !== action) other.stop();
    action.stopFading().stopWarping().setEffectiveWeight(1);
    const duration = action.getClip().duration;
    action.enabled = true;
    action.paused = false;
    action.timeScale = 1;
    action.time = timeSec <= 0 ? 0 : timeSec >= duration ? duration : timeSec;
    this.mixer.update(0);
    this.handPose.constrainArms(name);
    if (holdsBat(name)) this.battingPose.apply(name, action.time);
    this.handPose.apply(name,Infinity,action.time);
  }

  update(dtSec: number): void {
    this.handPose.restore();
    this.battingPose.restore();
    this.mixer.update(dtSec);
    this.updatePresence(dtSec);
    if (this.current) this.handPose.constrainArms(this.current);
    if (this.current && holdsBat(this.current)) this.battingPose.apply(this.current, this.action?.time ?? 0);
    if (this.current) this.handPose.apply(this.current,dtSec,this.action?.time ?? 0);
  }

  dispose(): void {
    this.handPose.restore();
    this.battingPose.restore();
    this.mixer.removeEventListener('finished', this.onFinished);
    this.mixer.stopAllAction();
    this.actions.clear();
    this.current = null;
  }

  // --- Internals ------------------------------------------------------------

  private actionFor(name: string, clip: AnimationClip, spec: ClipSpec): AnimationAction {
    const cached = this.actions.get(name);
    if (cached) return cached;
    const action = this.mixer.clipAction(clip);
    if (spec.loop) {
      action.setLoop(LoopRepeat, Infinity);
    } else {
      action.setLoop(LoopOnce, 1);
      // Hold the last frame. Without this the character snaps back to bind
      // pose for the length of the crossfade out — one frame of T-pose, which
      // is the single most obvious animation bug there is.
      action.clampWhenFinished = true;
    }
    this.actions.set(name, action);
    return action;
  }

  /**
   * A one-shot ended: fire the caller's callback, then settle into whatever
   * `returnsTo` names. The settle is what turns "no popping" from a note in the
   * brief into behaviour.
   */
  private onFinished = (e: { action: AnimationAction }): void => {
    const name = e.action.getClip().name;
    if (name !== this.current) return;

    const done = this.pending;
    this.pending = null;
    done?.();

    const settle = clipSpec(name).returnsTo;
    if (settle && this.current === name) this.play(settle as AnimName);
  };

  /**
   * Quiet life between actions. Timers advance only with the render clock, so
   * a backgrounded tab cannot return to a crowd that fidgeted for an hour.
   */
  private updatePresence(dtSec: number): void {
    if (!this.actor || !this.current || !(dtSec > 0)) return;
    this.ageSec += dtSec;

    if (this.blinkLeftSec > 0) {
      this.blinkLeftSec -= dtSec;
      if (this.blinkLeftSec <= 0) this.applyExpression(this.current);
    } else if (this.ageSec >= this.nextBlinkSec && this.canBlink(this.current)) {
      this.actor.setExpression('blink');
      this.blinkLeftSec = 0.12;
      this.nextBlinkSec = this.ageSec + blinkEverySec(this.actor.profile) * (0.82 + performancePhase(this.actor.id, Math.floor(this.ageSec * 10) + 41) * 0.36);
    }

    if (this.current === 'idle' && this.ageSec >= this.nextFidgetSec) {
      this.nextFidgetSec = this.ageSec + fidgetEverySec(this.actor.profile) * (0.82 + performancePhase(this.actor.id, Math.floor(this.ageSec * 10) + 73) * 0.36);
      this.play('idle_fidget', { restart: true });
    }
  }

  private canBlink(name: AnimName): boolean {
    return name === 'idle' || name === 'field_ready' || name === 'bat_stance' || name === 'walk_on' || name === 'pose_card';
  }

  private applyExpression(name: AnimName): void {
    if (!this.actor) return;
    this.blinkLeftSec = 0;
    this.actor.setExpression(faceForClip(this.actor.profile, name, this.actor.authoredRest));
  }

  private warnOnce(key: string, message: string): void {
    if (this.warned.has(key)) return;
    this.warned.add(key);
    console.warn(`[AnimationDirector] ${message}`);
  }
}
