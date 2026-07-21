// ---------------------------------------------------------------------------
// The live-play VIEW: every sprite the live-play sim owns (fielders, runner
// tokens, the ball + shadow, the steering spotlight, base rings, the throw-
// charge meter, the GO banner) and the render pass that places them each
// frame. Strictly sim-blind: it receives LivePlayState values and never calls
// stepLivePlay/finishLivePlay — GameScene stays the controller (it steps the
// sim, drains events for stats/juice, and owns all input state; the view only
// DRAWS from it via the accessor closures in LivePlayViewDeps).
//
// Extracted verbatim from GameScene so the guest renderer in two-device play
// can drive the exact same sprites from streamed ReplayFrames.
// ---------------------------------------------------------------------------

import Phaser from 'phaser';
import {
  GAME_WIDTH,
  GAME_HEIGHT,
  COLORS,
  ANIM,
  FX,
  LIVE,
  KID_SIZE,
} from '../../config';
import type { VenueDef } from '../../data/venues';
import {
  HOME,
  MOUND,
  basePos,
  dist,
  FIELD_POSITIONS,
  type PositionId,
} from '../../systems/geometry';
import type { LivePlayState, LiveEvent } from '../../systems/liveplay';
import { project, depthScale } from '../../art/projection';
import { poseKey } from '../../art/textureFactory';
import { idleBob, squashHop, groundShadow, runCycle, reactPose } from '../../ui/anim';
import { screenShake, burst, floatingText } from '../../ui/effects';
import { pill } from '../../ui/theme';
import * as audio from '../../systems/audio';
import { commentatorProfile } from '../../systems/voices';

/** One on-screen kid the live play can move (fielder or runner). */
export interface LiveSprite {
  container: Phaser.GameObjects.Container;
  img: Phaser.GameObjects.Image;
  charId: string;
  cycle: { stop(restoreStand?: boolean): void } | null;
  lastX: number;
  /** Sprite height at the plate; the projection shrinks it with depth. */
  baseH: number;
}

const RUNNER_H = KID_SIZE.RUNNER_H; // runner sprite height

/** Accessor closures back into scene-owned state the view must draw from. */
export interface LivePlayViewDeps {
  /** The shared mound sprite — owned by the scene's pitch ceremony. */
  pitcherSprite: () => Phaser.GameObjects.Image | undefined;
  /** Scene-owned throw-charge input state; the view only DRAWS from it. */
  charge: () => { active: boolean; start: number };
  /** pinUI — route a HUD object (the GO banner) onto the UI camera. */
  pin: (o: Phaser.GameObjects.Container) => void;
  /** Venue look, for the carom burst color. */
  look: VenueDef['look'];
}

/** Per-play sprite setup payload for beginPlay. */
export interface BeginPlayOpts {
  /** The scene's settled runner tokens (keyed by base) — wrapped into live sprites. */
  runnerTokens: Map<number, Phaser.GameObjects.Container>;
  /** The batter's fresh runner token (scene-made — makeRunner is ceremony-shared). */
  batterToken: Phaser.GameObjects.Container;
  batterId: string;
  /** Main mode: the bases are the controls (rings), else the big GO prompt. */
  manualBaserunning: boolean;
  /** First play of this kind this game — speak the one-shot coach line. */
  firstPlay: boolean;
  /** Net guest spectating the other player's play: no tappable prompts. */
  prompts?: boolean;
}

export class LivePlayView {
  private fielderSprites: LiveSprite[] = []; // parallel to assignment
  private liveRunnerSprites = new Map<string, LiveSprite>();
  private liveBall?: Phaser.GameObjects.Arc;
  private liveBallShadow?: Phaser.GameObjects.Ellipse;
  private lastTrailAt = 0; // spawn gate for the live-ball streak dots
  private activeMarker?: Phaser.GameObjects.Ellipse;
  private baseRings: Phaser.GameObjects.Arc[] = [];
  private chargeMeter?: Phaser.GameObjects.Graphics;
  private goBanner?: Phaser.GameObjects.Container;
  /** The view's copy of the defensive assignment (sim order, index 0 = P). */
  private assignment: Array<{ position: PositionId; charId: string }> = [];

  constructor(
    private scene: Phaser.Scene,
    private deps: LivePlayViewDeps
  ) {}

  /**
   * Stand the defending team's nine kids at their positions for this half.
   * Index 0 is always the pitcher (rendered by the existing mound sprite);
   * the other eight get fresh container sprites. The SIM moves these — the
   * scene must never tween them during a live play.
   */
  buildDefense(assignment: Array<{ position: PositionId; charId: string }>): void {
    for (const f of this.fielderSprites) {
      f.cycle?.stop(false); // kill the texture-swap timer BEFORE the image dies
      f.cycle = null;
      if (f.container !== (this.deps.pitcherSprite() as unknown)) f.container.destroy();
    }
    this.fielderSprites = [];
    this.assignment = assignment;

    assignment.forEach((a, i) => {
      if (i === 0) return; // the mound sprite plays P
      const p = FIELD_POSITIONS[a.position];
      const q = project(p);
      const ds = depthScale(p);
      const c = this.scene.add.container(q.x, q.y).setDepth(26);
      const shadow = groundShadow(this.scene, 0, 3, 40 * ds);
      // Fielders wait in the ready crouch, gloves out.
      const img = this.scene.add.image(0, 0, poseKey(a.charId, 'ready')).setOrigin(0.5, 0.95);
      const baseH = KID_SIZE.FIELDER_H;
      img.setScale((baseH * ds) / img.height);
      c.add([shadow, img]);
      idleBob(this.scene, img, { amp: 3, dur: 1000 + i * 90 }); // bob the IMAGE — the sim owns the container
      this.fielderSprites.push({ container: c, img, charId: a.charId, cycle: null, lastX: q.x, baseH });
    });
  }

  /** A wrapper so index 0 (the pitcher) resolves to the mound sprite. */
  private fielderSpriteAt(i: number): LiveSprite | undefined {
    if (i === 0) return undefined; // handled specially via pitcherSprite
    return this.fielderSprites[i - 1];
  }

  /**
   * The visual verbs for one sim event: SFX, pops, shakes, floating text,
   * reaction poses, and the out/score runner send-offs. The controller keeps
   * the drain loop and its bookkeeping (highlights, stats, booth calls).
   */
  reactTo(e: LiveEvent, s: LivePlayState): void {
    switch (e.t) {
      case 'catch': {
        audio.pop();
        const bq = project(s.ball.pos);
        floatingText(this.scene, bq.x, bq.y - 40, 'CAUGHT!', COLORS.gold, 30);
        if (s.mode === 'defense') audio.cheer();
        // The catcher's glove-up beat.
        const cspr = this.fielderSprites.find((f) => f.charId === e.fielder);
        if (cspr && cspr.img.active) {
          cspr.cycle?.stop(false);
          cspr.cycle = null;
          reactPose(this.scene, cspr.img, e.fielder, 'catch', { holdMs: ANIM.ACTION_HOLD_MS, restoreTo: e.fielder });
        }
        break;
      }
      case 'pickup':
        audio.pop();
        if (s.mode === 'defense') this.showBaseRings();
        break;
      case 'land': {
        const lq = project(s.ball.pos);
        burst(this.scene, lq.x, lq.y, COLORS.dirt, 6);
        // Chalk ring marking the landing spot — reads at a glance where the
        // ball came down even if you were watching your runner.
        const ring = this.scene.add.ellipse(lq.x, lq.y, 26, 11).setStrokeStyle(4, COLORS.white, 0.85).setDepth(13);
        this.scene.tweens.add({
          targets: ring,
          scaleX: 2.1,
          scaleY: 2.1,
          alpha: 0,
          duration: FX.LAND_RING_MS,
          ease: 'Quad.out',
          onComplete: () => ring.destroy(),
        });
        break;
      }
      case 'bonk': {
        const kq = project(s.ball.pos);
        floatingText(this.scene, kq.x, kq.y - 40, 'BONK! 🌳', COLORS.white, 26);
        burst(this.scene, kq.x, kq.y - 20, 0x529a49, 8);
        audio.pop();
        break;
      }
      case 'carom': {
        const cq = project(s.ball.pos);
        floatingText(this.scene, cq.x, cq.y - 36, 'OFF THE WALL!', COLORS.gold, 26);
        burst(this.scene, cq.x, cq.y - 12, this.deps.look.fenceTrim, 8);
        screenShake(this.scene, 2);
        audio.pop();
        break;
      }
      case 'error': {
        const label = e.kind === 'wild' ? 'WILD THROW!' : e.kind === 'drop' ? 'DROPPED IT!' : 'BOBBLED!';
        const eq = project(s.ball.pos);
        floatingText(this.scene, eq.x, eq.y - 44, label, COLORS.red, 28);
        screenShake(this.scene, 3);
        audio.whiff();
        // The flustered kid wears it on their face for the fumble beat.
        const fspr = this.fielderSprites.find((f) => f.charId === e.fielder);
        if (fspr && !fspr.cycle && fspr.img.active) {
          reactPose(this.scene, fspr.img, e.fielder, 'upset');
        }
        // An error by the CPU while your kids run = a gift. Cheer it.
        if (s.mode === 'offense') audio.cheer();
        break;
      }
      case 'throw': {
        audio.pitchWoosh();
        this.hideBaseRings();
        // The thrower whips through the release pose, facing the target bag.
        const tspr = e.fielder ? this.fielderSprites.find((f) => f.charId === e.fielder) : undefined;
        if (tspr && tspr.img.active) {
          tspr.cycle?.stop(false);
          tspr.cycle = null;
          tspr.img.setFlipX(project(basePos(e.toBase)).x < tspr.container.x);
          reactPose(this.scene, tspr.img, e.fielder!, 'throw', { holdMs: ANIM.ACTION_HOLD_MS, restoreTo: e.fielder! });
        }
        break;
      }
      case 'out': {
        const p = project(basePos(e.base));
        floatingText(this.scene, p.x, p.y - 46, 'OUT!', COLORS.red, 32);
        screenShake(this.scene, 4);
        if (s.mode === 'defense') audio.cheer();
        else audio.whiff();
        const spr = this.liveRunnerSprites.get(e.runner);
        if (spr) {
          spr.cycle?.stop(false);
          spr.cycle = null;
          // Fade but DON'T destroy — a replay may need them back; the
          // settle sweep disposes of everyone off-base.
          this.scene.tweens.add({
            targets: spr.container,
            alpha: 0,
            y: spr.container.y - 10,
            duration: 320,
            delay: 120,
          });
        }
        break;
      }
      case 'score': {
        burst(this.scene, HOME.x, HOME.y - 20, COLORS.gold, 14);
        audio.cheer();
        floatingText(this.scene, HOME.x, HOME.y - 60, '+1', COLORS.gold, 34);
        const spr = this.liveRunnerSprites.get(e.runner);
        if (spr) {
          spr.cycle?.stop(true);
          spr.cycle = null;
          squashHop(this.scene, spr.img, { height: 18 });
          this.scene.time.delayedCall(480, () => spr.container.setAlpha(0)); // sweep disposes at settle
        }
        break;
      }
      case 'dive': {
        const dq = project(s.fielders[s.active].pos);
        burst(this.scene, dq.x, dq.y + 4, COLORS.dirt, 5);
        audio.pitchWoosh();
        break;
      }
      case 'diveMiss': {
        const mq = project(s.fielders[s.active].pos);
        floatingText(this.scene, mq.x, mq.y - 40, 'JUST MISSED!', COLORS.white, 24);
        burst(this.scene, mq.x, mq.y + 2, COLORS.dirt, 8);
        break;
      }
      case 'safe':
      case 'run':
      case 'playOver':
        break;
    }
  }

  /** Sprite setup for a fresh live play (the sim state was just created). */
  beginPlay(state: LivePlayState, opts: BeginPlayOpts): void {
    // The sim owns the pitcher's body now — stop his breathing/windup tweens.
    const pitcher = this.deps.pitcherSprite();
    if (pitcher) {
      this.scene.tweens.killTweensOf(pitcher);
      pitcher.setAngle(0);
    }

    // The batter becomes a runner token at home; existing runners keep theirs.
    this.liveRunnerSprites = new Map();
    for (const token of opts.runnerTokens.values()) {
      const img = token.getAt(1) as Phaser.GameObjects.Image;
      const id = token.getData('id') as string;
      this.liveRunnerSprites.set(id, { container: token, img, charId: id, cycle: null, lastX: token.x, baseH: RUNNER_H });
    }
    this.liveRunnerSprites.set(opts.batterId, {
      container: opts.batterToken,
      img: opts.batterToken.getAt(1) as Phaser.GameObjects.Image,
      charId: opts.batterId,
      cycle: null,
      lastX: opts.batterToken.x,
      baseH: RUNNER_H,
    });

    // Ball + shadow, sim-positioned every frame.
    this.liveBallShadow = this.scene.add.ellipse(HOME.x, HOME.y, 16, 6, COLORS.ink, 0.3).setDepth(14);
    this.liveBall = this.scene.add.circle(HOME.x, HOME.y - 10, 9, COLORS.white).setStrokeStyle(2, COLORS.ink).setDepth(42);

    if (state.mode === 'defense') {
      // Spotlight the kid you steer.
      const chaser = state.fielders[state.active];
      this.activeMarker = this.scene.add
        .ellipse(chaser.pos.x, chaser.pos.y + 4, 52, 20)
        .setStrokeStyle(4, COLORS.gold)
        .setDepth(25);
      this.scene.tweens.add({ targets: this.activeMarker, alpha: 0.45, duration: 380, yoyo: true, repeat: -1 });
      if (opts.firstPlay && opts.prompts !== false) {
        audio.say('Get the ball!', commentatorProfile('A'), 'flush');
      }
    } else if (opts.prompts === false) {
      // Spectating the other device's play — ball and runners only.
    } else if (opts.manualBaserunning) {
      // Main mode: the bases ARE the controls — tap ahead to send, behind to
      // turn a runner back. Rings show what's tappable.
      this.showBaseRings();
      const { container } = pill(this.scene, GAME_WIDTH / 2, GAME_HEIGHT - 46, 'TAP A BASE TO RUN!  ◆', {
        fill: COLORS.gold,
        fontSize: 26,
      });
      container.setDepth(95);
      this.deps.pin(container);
      this.scene.tweens.add({ targets: container, scale: 1.06, duration: 420, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
      this.goBanner = container;
      if (opts.firstPlay) {
        audio.say('Tap a base to send your runner!', commentatorProfile('A'), 'flush');
      }
    } else {
      // Big tap-anywhere GO prompt.
      const { container } = pill(this.scene, GAME_WIDTH / 2, GAME_HEIGHT - 46, 'TAP TO RUN!  ▶', {
        fill: COLORS.gold,
        fontSize: 28,
      });
      container.setDepth(95);
      this.deps.pin(container);
      this.scene.tweens.add({ targets: container, scale: 1.07, duration: 420, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
      this.goBanner = container;
      if (opts.firstPlay) {
        audio.say('Run! Tap to take the next base!', commentatorProfile('A'), 'flush');
      }
    }
  }

  /** Place everything the sim owns for this frame (live loop AND replay). */
  render(s: LivePlayState): void {
    // Fielders (index 0 = the mound pitcher sprite).
    s.fielders.forEach((f, i) => {
      const q = project(f.pos);
      if (i === 0) {
        this.deps.pitcherSprite()?.setPosition(q.x, q.y);
        return;
      }
      const spr = this.fielderSpriteAt(i);
      if (!spr) return;
      // Mid-dive (or face-down after a whiff): the dive pose owns the sprite.
      if (f.diveUntil !== undefined || f.diveDown) {
        spr.cycle?.stop(false);
        spr.cycle = null;
        const key = poseKey(f.charId, 'dive');
        if (spr.img.texture.key !== key) spr.img.setTexture(key);
        spr.img.setFlipX(project(s.ball.pos).x < q.x);
        spr.img.setScale((spr.baseH * depthScale(q)) / spr.img.height);
        spr.container.setPosition(q.x, q.y);
        return;
      }
      // Fresh off a dive: make sure the stand texture is back.
      if (spr.img.texture.key === poseKey(f.charId, 'dive') && !spr.cycle) {
        spr.img.setTexture(poseKey(f.charId, 'stand'));
      }
      this.moveLiveSprite(spr, q.x, q.y);
    });

    // Runners. Done runners are scene-owned again (their exit animations —
    // fade on an out, hop on a score — must not be fought or their run cycle
    // restarted on a dying sprite).
    for (const r of s.runners) {
      if (r.done !== null) continue;
      const spr = this.liveRunnerSprites.get(r.charId);
      if (!spr || !spr.container.active) continue;
      // A runner closing on a bag with the ball bearing down HITS THE DIRT.
      const contested =
        r.to !== r.from &&
        r.progress > 0.72 &&
        ((s.ball.phase === 'thrown' && s.ball.throw?.toBase === r.to) ||
          (s.ball.phase === 'held' &&
            s.ball.heldBy !== null &&
            dist(s.fielders[s.ball.heldBy].pos, basePos(r.to)) < 70));
      if (contested) {
        spr.cycle?.stop(false);
        spr.cycle = null;
        spr.img.setTexture(poseKey(r.charId, 'slide'));
        const q = project(r.pos);
        spr.img.setFlipX(project(basePos(r.to)).x < spr.container.x);
        spr.container.setPosition(q.x, q.y - 6);
        continue;
      }
      const q = project(r.pos);
      this.moveLiveSprite(spr, q.x, q.y - 6);
    }

    // Ball: lift by arc height; the shadow stays on the ground plane.
    if (this.liveBall && this.liveBallShadow) {
      const b = s.ball;
      if (b.phase === 'held' && b.heldBy !== null) {
        const hq = project(s.fielders[b.heldBy].pos);
        this.liveBall.setPosition(hq.x + 12, hq.y - 34).setScale(1).setVisible(true);
        this.liveBallShadow.setVisible(false);
      } else {
        const bq = project(b.pos);
        const lift = b.height * (b.phase === 'thrown' ? 46 : 92);
        // A high ball is nearer the camera: swell it, and thin its shadow.
        this.liveBall.setPosition(bq.x, bq.y - 10 - lift).setScale(1 + b.height * 0.35).setVisible(true);
        this.liveBallShadow.setPosition(bq.x, bq.y).setVisible(true);
        this.liveBallShadow.setScale(1 - b.height * 0.45).setAlpha(1 - b.height * 0.45);
        // Streak dots behind an airborne ball (visual only — never the sim's).
        if (b.height >= FX.HIT_TRAIL_MIN_H && this.scene.time.now - this.lastTrailAt >= FX.HIT_TRAIL_EVERY_MS) {
          this.lastTrailAt = this.scene.time.now;
          const dot = this.scene.add
            .circle(this.liveBall.x, this.liveBall.y, 5 * this.liveBall.scale, COLORS.white, 0.45)
            .setDepth(41);
          this.scene.tweens.add({
            targets: dot,
            alpha: 0,
            scale: 0.4,
            duration: FX.HIT_TRAIL_LIFE_MS,
            onComplete: () => dot.destroy(),
          });
        }
      }
    }

    // The steering spotlight follows the chaser.
    if (this.activeMarker) {
      const cq = project(s.fielders[s.active].pos);
      this.activeMarker.setPosition(cq.x, cq.y + 4);
    }

    // Throw-charge meter over the carrier.
    const charge = this.deps.charge();
    if (charge.active && this.chargeMeter && s.ball.phase === 'held' && s.ball.heldBy !== null) {
      const holder = { pos: project(s.fielders[s.ball.heldBy].pos) };
      // Clamp hard: a tiny/negative width makes fillRoundedRect paint garbage.
      const p = Phaser.Math.Clamp((this.scene.time.now - charge.start) / LIVE.THROW_METER_MS, 0, 1);
      const g = this.chargeMeter;
      g.clear();
      g.setPosition(holder.pos.x, holder.pos.y - 58);
      g.fillStyle(COLORS.ink, 0.5);
      g.fillRoundedRect(-30, -7, 60, 14, 7);
      if (p > 0.08) {
        g.fillStyle(p >= 1 ? COLORS.gold : COLORS.white, 1);
        g.fillRoundedRect(-27, -4, 54 * p, 8, 4);
      }
    }
  }

  /** Direct placement + run-cycle bookkeeping for one sim-owned kid.
   *  (x, y are already-projected screen coords; y carries the depth.) */
  private moveLiveSprite(spr: LiveSprite, x: number, y: number): void {
    const moving = Math.abs(x - spr.container.x) > 0.5 || Math.abs(y - spr.container.y) > 0.5;
    if (moving) {
      if (!spr.cycle) spr.cycle = runCycle(this.scene, spr.img, spr.charId);
      if (Math.abs(x - spr.container.x) > 0.5) spr.img.setFlipX(x < spr.container.x);
    } else if (spr.cycle) {
      spr.cycle.stop(true);
      spr.cycle = null;
      spr.img.setFlipX(false);
    }
    spr.img.setScale((spr.baseH * depthScale({ x, y })) / spr.img.height);
    spr.container.setPosition(x, y);
  }

  /** Four fat glowing rings — throw targets while you hold the ball. */
  showBaseRings(): void {
    if (this.baseRings.length > 0) return;
    ([1, 2, 3, 4] as const).forEach((base) => {
      const p = project(basePos(base));
      const ring = this.scene.add.circle(p.x, p.y, 30).setStrokeStyle(5, COLORS.gold, 0.9).setDepth(24);
      this.scene.tweens.add({ targets: ring, scale: 1.25, alpha: 0.5, duration: 430, yoyo: true, repeat: -1 });
      this.baseRings.push(ring);
    });
  }

  hideBaseRings(): void {
    this.baseRings.forEach((r) => r.destroy());
    this.baseRings = [];
  }

  /** Charge started: build the meter and paint the target ring red. */
  beginCharge(chargeBase: 1 | 2 | 3 | 4): void {
    this.chargeMeter?.destroy();
    this.chargeMeter = this.scene.add.graphics().setDepth(60);
    this.baseRings.forEach((r, i) => r.setStrokeStyle(5, i + 1 === chargeBase ? COLORS.red : COLORS.gold, 0.9));
  }

  /** Throw released: the meter goes; rings stay until the sim's throw event. */
  releaseCharge(): void {
    this.chargeMeter?.destroy();
    this.chargeMeter = undefined;
  }

  /** Charge cancelled (pause, half boundary): meter down, rings back to gold. */
  cancelCharge(): void {
    this.chargeMeter?.destroy();
    this.chargeMeter = undefined;
    this.baseRings.forEach((r) => r.setStrokeStyle(5, COLORS.gold, 0.9));
  }

  /** Out/scored runners faded during the live play — bring everyone back. */
  restoreRunnersForReplay(): void {
    for (const spr of this.liveRunnerSprites.values()) {
      if (!spr.container.active) continue;
      this.scene.tweens.killTweensOf(spr.container);
      spr.container.setAlpha(1);
    }
  }

  /**
   * The play settled: chrome down, fielders trot home, and the runner-token
   * map is rebuilt from where the sim left everyone. Returns the next
   * base→token map for the scene's `runners`.
   */
  settlePlay(outcome: { baseIds: Array<string | null>; outs: number }): Map<number, Phaser.GameObjects.Container> {
    // Chrome down.
    this.hideBaseRings();
    this.activeMarker?.destroy();
    this.activeMarker = undefined;
    this.chargeMeter?.destroy();
    this.chargeMeter = undefined;
    this.goBanner?.destroy();
    this.goBanner = undefined;
    this.liveBall?.destroy();
    this.liveBall = undefined;
    this.liveBallShadow?.destroy();
    this.liveBallShadow = undefined;

    // Fielders trot home; the winner side cheers a beat.
    this.resetFieldersAfterPlay(outcome.outs > 0);

    // Rebuild the base->token map from where the sim left everyone.
    const nextRunners = new Map<number, Phaser.GameObjects.Container>();
    outcome.baseIds.forEach((id, i) => {
      if (!id) return;
      const spr = this.liveRunnerSprites.get(id);
      if (!spr || !spr.container.active) return;
      spr.cycle?.stop(false);
      spr.cycle = null;
      spr.img.setTexture(poseKey(id, 'stand')); // whatever they ended in (run/slide) → standing
      const p = project(basePos(i + 1));
      spr.container.setPosition(p.x, p.y - 6);
      spr.img.setFlipX(false);
      nextRunners.set(i + 1, spr.container);
    });
    // Anything not standing on a base (outs already faded, scorers hopped) — sweep.
    for (const [id, spr] of this.liveRunnerSprites) {
      if (!outcome.baseIds.includes(id) && spr.container.active) {
        spr.cycle?.stop(false);
        spr.cycle = null;
        this.scene.time.delayedCall(520, () => spr.container.destroy());
      }
    }
    this.liveRunnerSprites = new Map();
    return nextRunners;
  }

  /** Walk every fielder back to their spot; a successful defense cheers first. */
  private resetFieldersAfterPlay(gotAnOut: boolean): void {
    this.assignment.forEach((a, i) => {
      const home = project(FIELD_POSITIONS[a.position]);
      if (i === 0) {
        const pitcher = this.deps.pitcherSprite();
        if (pitcher) {
          pitcher.setPosition(MOUND.x, MOUND.y);
          idleBob(this.scene, pitcher, { amp: 4, dur: 1100 });
        }
        return;
      }
      const spr = this.fielderSpriteAt(i);
      if (!spr) return;
      spr.cycle?.stop(false);
      spr.cycle = null;
      spr.img.setTexture(poseKey(spr.charId, 'ready')); // back to the crouch
      spr.img.setFlipX(false);
      // Kids who left their spot were in on the play — a hop if it worked.
      if (gotAnOut && dist({ x: spr.container.x, y: spr.container.y }, home) > 8) {
        squashHop(this.scene, spr.img, { height: 14 });
      }
      this.scene.tweens.add({
        targets: spr.container,
        x: home.x,
        y: home.y,
        duration: 420,
        ease: 'Sine.inOut',
      });
    });
  }
}
