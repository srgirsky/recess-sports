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
//   3. GRACEFUL PARTIAL DELIVERY. Clips resolve from the loaded
//      `anims_recess_v1.glb` first and fall back to the procedural stand-in
//      per clip — so the animator's pilot batch of five is playable the day it
//      lands, next to thirty placeholders, with no code change.
//
// It reads sim state and never writes it: the sim owns position, facing and
// every timing decision, and this file owns only what is drawn.
// ---------------------------------------------------------------------------

import { AnimationMixer, LoopOnce, LoopRepeat, type AnimationAction, type AnimationClip, type Object3D } from 'three';
import {
  CLIP_BY_NAME,
  LOOP_MAX_RATE,
  LOOP_MIN_RATE,
  clipSpec,
  locomotionRateFor,
  pickLocomotion,
  warpRateFor,
  type AnimName,
  type ClipSpec,
} from './clips';

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
  /** Clips from a delivered `.glb`. Anything missing falls back to `fallback`. */
  clips?: AnimationClip[];
  /** The procedural stand-in library. */
  fallback?: AnimationClip[];
  /** Called once per clip name that had to fall back. */
  onFallback?: (name: string) => void;
}

export class AnimationDirector {
  readonly mixer: AnimationMixer;

  private readonly byName = new Map<string, AnimationClip>();
  private readonly procedural = new Set<string>();
  private readonly actions = new Map<string, AnimationAction>();
  private current: AnimName | null = null;
  private pending: (() => void) | null = null;
  private warned = new Set<string>();

  constructor(root: Object3D, opts: DirectorOptions = {}) {
    this.mixer = new AnimationMixer(root);

    for (const clip of opts.fallback ?? []) {
      this.byName.set(clip.name, clip);
      this.procedural.add(clip.name);
    }
    // A delivered clip always wins over its stand-in, name by name.
    for (const clip of opts.clips ?? []) {
      this.byName.set(clip.name, clip);
      this.procedural.delete(clip.name);
    }
    if (opts.onFallback) for (const name of this.procedural) opts.onFallback(name);

    this.mixer.addEventListener('finished', this.onFinished);
  }

  /** Which clips are still placeholder motion — the review surface shows it. */
  isProcedural(name: string): boolean {
    return this.procedural.has(name);
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

    const next = this.actionFor(name, clip, spec);
    next.reset();
    next.timeScale = opts.rate ?? 1;
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
    const { rate, clamped } = warpRateFor(name, secUntilEvent);
    this.play(name, { ...opts, rate, restart: true });
    return { rate, clamped };
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

  /** Cancel any pending settle and hold whatever is playing. */
  hold(): void {
    this.pending = null;
  }

  update(dtSec: number): void {
    this.mixer.update(dtSec);
  }

  dispose(): void {
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

  private warnOnce(key: string, message: string): void {
    if (this.warned.has(key)) return;
    this.warned.add(key);
    console.warn(`[AnimationDirector] ${message}`);
  }
}
