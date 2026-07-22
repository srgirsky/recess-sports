// ---------------------------------------------------------------------------
// The behind-home-plate pitch view (the "rig"): a full-screen, fully OPAQUE
// venue-themed backdrop + the batter big in the foreground seen from behind,
// the pitcher small in the distance facing the camera, the fielding team's
// catcher crouched at the bottom of the frame, and the rest of the defense
// small at their positions (PLATE_VIEW.FIELDERS) so the close view shows the
// same nine kids as the wide field.
//
// It lives at PLATE_VIEW.DEPTH in WORLD space (never pinUI'd): the HUD on the
// UI camera stays above it, floatingText/burst (depth 60-80) draw over it, and
// everything below DEPTH (the 3/4 field, fielders, runners, the world batter
// and mound pitcher) is simply occluded while it's up. GameScene.setView() is
// the ONLY caller of show()/hide(). Pitch-era visuals (zone, rings, cursor,
// ball) must sit above DEPTH or they vanish under the backdrop.
// ---------------------------------------------------------------------------

import Phaser from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT, COLORS, PLATE_VIEW, ANIM } from '../../config';
import type { VenueDef } from '../../data/venues';
import type { PositionId } from '../../systems/geometry';
import { poseKey, heroKey, HERO_POSES } from '../../art/textureFactory';
import type { Pose } from '../../art/CharacterArt';
import { batWaggle, poseSequence } from '../../ui/anim';

export interface RigActors {
  batterId: string;
  pitcherId: string;
  catcherId: string;
  /** The 7 non-battery defenders (1B/2B/SS/3B/LF/CF/RF). */
  fielders: Array<{ position: PositionId; charId: string }>;
}

/** Shadow tone for a 0xrrggbb int: mix toward cool navy (the house shade). */
function shadeInt(color: number, f: number): number {
  const mix = (c: number, to: number) => Math.round(c * (1 - f) + to * f);
  return (
    (mix((color >> 16) & 255, 0x2c) << 16) |
    (mix((color >> 8) & 255, 0x3e) << 8) |
    mix(color & 255, 0x66)
  );
}

/** Highlight tone: mix toward warm near-white (the key light is warm). */
function lightenInt(color: number, f: number): number {
  const mix = (c: number, to: number) => Math.round(c * (1 - f) + to * f);
  return (
    (mix((color >> 16) & 255, 0xff) << 16) |
    (mix((color >> 8) & 255, 0xfa) << 8) |
    mix(color & 255, 0xe8)
  );
}

export class BattingView {
  private scene: Phaser.Scene;
  private root: Phaser.GameObjects.Container;
  private pitcher: Phaser.GameObjects.Image;
  private batter: Phaser.GameObjects.Image;
  private catcher: Phaser.GameObjects.Image;
  private pitcherId = '';
  private batterId = '';
  private batterIdle?: Phaser.Tweens.Tween;
  private batterTic?: Phaser.Time.TimerEvent;
  private batterReactTimer?: Phaser.Time.TimerEvent;
  private batterSwing?: { cancel(restore?: boolean): void };
  private batterBaseScale = 1;
  private fielderImgs = new Map<PositionId, Phaser.GameObjects.Image>();
  private tossBall: Phaser.GameObjects.Arc;
  private tossTween?: Phaser.Tweens.Tween;

  constructor(scene: Phaser.Scene, look: VenueDef['look']) {
    this.scene = scene;
    this.root = scene.add.container(0, 0).setDepth(PLATE_VIEW.DEPTH).setVisible(false);
    this.drawBackdrop(look);

    // The 7 distant defenders sit between the backdrop and the battery,
    // added far-to-near (Y ascending) so nearer kids draw over farther ones.
    const spots = Object.entries(PLATE_VIEW.FIELDERS).sort((a, b) => a[1].Y - b[1].Y);
    for (const [pos, spot] of spots) {
      const img = scene.add.image(spot.X, spot.Y, '__DEFAULT').setOrigin(0.5, 1).setVisible(false);
      this.fielderImgs.set(pos as PositionId, img);
      this.root.add(img);
    }

    const { PITCHER, BATTER, CATCHER } = PLATE_VIEW;
    this.pitcher = scene.add.image(PITCHER.X, PITCHER.Y, '__DEFAULT').setOrigin(0.5, 1);
    this.catcher = scene.add.image(CATCHER.X, CATCHER.Y, '__DEFAULT').setOrigin(0.5, 1);
    this.batter = scene.add.image(BATTER.X, BATTER.Y, '__DEFAULT').setOrigin(0.5, 1);
    // The between-pitch idle ball the distant pitcher tosses and catches
    // (BB2001's mound idle). Added after the pitcher so it draws over his
    // glove; windup() hides it — the pitched ball takes over from there.
    this.tossBall = scene.add
      .circle(0, 0, 4, COLORS.white)
      .setStrokeStyle(1.5, COLORS.ink)
      .setVisible(false);
    this.root.add([this.pitcher, this.tossBall, this.catcher, this.batter]);
  }

  /** The distant pitcher's feet — feedback text anchors near here. */
  get pitcherAnchor(): { x: number; y: number } {
    return { x: PLATE_VIEW.PITCHER.X, y: PLATE_VIEW.PITCHER.Y };
  }

  /** Where the pitched ball leaves the pitcher's hand. */
  get releasePoint(): { x: number; y: number } {
    return { x: PLATE_VIEW.PITCHER.X + 6, y: PLATE_VIEW.PITCHER.Y - PLATE_VIEW.PITCHER.RELEASE_DY };
  }

  get visible(): boolean {
    return this.root.visible;
  }

  /**
   * Show the rig with these three kids. IDEMPOTENT and cheap when already
   * up — setView('close') calls this on EVERY pitch because batters change
   * while the view stays close (strikeout -> next kid steps in).
   */
  show(actors: RigActors): void {
    this.setKid(this.pitcher, actors.pitcherId, 'stand', PLATE_VIEW.PITCHER.H);
    this.setKid(this.catcher, actors.catcherId, 'catchRear', PLATE_VIEW.CATCHER.H);
    for (const img of this.fielderImgs.values()) img.setVisible(false);
    for (const f of actors.fielders) {
      const spot = PLATE_VIEW.FIELDERS[f.position];
      const img = this.fielderImgs.get(f.position);
      if (!spot || !img) continue;
      this.setKid(img, f.charId, 'ready', spot.H);
      img.setVisible(true);
    }
    const batterChanged = this.batter.texture.key !== this.rigKey(actors.batterId, 'batRear');
    if (batterChanged) this.batterReactTimer?.remove(false); // a reaction pose never outlives its batter
    // A stale swing sequence must not re-frame the (possibly new) batter —
    // setKid below puts the stance back, so cancel without restoring.
    this.batterSwing?.cancel(false);
    this.batterSwing = undefined;
    this.setKid(this.batter, actors.batterId, 'batRear', PLATE_VIEW.BATTER.H);
    this.pitcherId = actors.pitcherId;
    this.batterId = actors.batterId;
    this.batterBaseScale = this.batter.scale;
    if (!this.root.visible || batterChanged) {
      this.startBatterIdle();
    }
    this.root.setVisible(true);
    this.tossIdle();
  }

  /**
   * The pitcher tosses the ball up and catches it while everyone waits —
   * started by show() and again by GameScene when a pitch settles (the
   * catcher lobs it back); windup() stops it. No-op while hidden or running.
   */
  tossIdle(): void {
    if (!this.root.visible || this.tossTween) return;
    const { x, y } = this.releasePoint;
    this.tossBall.setPosition(x, y).setVisible(true);
    this.tossTween = this.scene.tweens.add({
      targets: this.tossBall,
      y: y - PLATE_VIEW.TOSS.AMP,
      duration: PLATE_VIEW.TOSS.MS,
      yoyo: true,
      repeat: -1,
      ease: 'Quad.out',
    });
  }

  private stopTossIdle(): void {
    this.tossTween?.stop();
    this.tossTween = undefined;
    this.tossBall.setVisible(false);
  }

  hide(): void {
    if (!this.root.visible) return;
    this.stopTossIdle();
    this.batterReactTimer?.remove(false);
    this.batterSwing?.cancel(false);
    this.batterSwing = undefined;
    this.batterTic?.remove(false);
    this.batterTic = undefined;
    this.root.setVisible(false);
    // Nothing may keep animating off-screen (windup lean, idle breathing).
    this.scene.tweens.killTweensOf([this.pitcher, this.batter]);
    this.batterIdle = undefined;
    this.pitcher.setAngle(0);
    if (this.pitcherId) this.pitcher.setTexture(poseKey(this.pitcherId, 'stand'));
    this.setKid(this.pitcher, this.pitcherId || undefined, 'stand', PLATE_VIEW.PITCHER.H);
    this.batter.setAngle(0);
    this.batter.setX(PLATE_VIEW.BATTER.X);
  }

  /** The distant pitcher coils and leans — mirrors the world-sprite windup. */
  windup(): void {
    if (!this.root.visible || !this.pitcherId) return;
    this.stopTossIdle(); // the pitched ball takes over from here
    const p = this.pitcher;
    this.scene.tweens.killTweensOf(p);
    p.setTexture(poseKey(this.pitcherId, 'windup'));
    p.setScale(PLATE_VIEW.PITCHER.H / p.height);
    const s = p.scaleX;
    this.scene.tweens.chain({
      targets: p,
      tweens: [
        { angle: -11, scaleY: s * 1.06, duration: ANIM.WINDUP_MS * 0.55, ease: 'Quad.out' },
        { angle: 9, scaleY: s * 0.97, duration: ANIM.WINDUP_MS * 0.45, ease: 'Quad.in' },
        { angle: 0, scaleY: s, duration: 220, ease: 'Sine.out' },
      ],
      onComplete: () => {
        if (p.active && this.pitcherId) {
          this.setKid(p, this.pitcherId, 'stand', PLATE_VIEW.PITCHER.H);
        }
      },
    });
  }

  /**
   * One-shot reaction on the foreground batter: the kid turns to face the
   * camera in a front-view reaction pose (upset slump / nervous fidget /
   * cheer), then settles back into the rear-view stance. Safe to call any
   * time — swingBatter() and show() both restore the stance first, so a
   * reaction can never be worn through a swing or by the wrong kid.
   */
  reactBatter(pose: 'upset' | 'nervous' | 'cheer', holdMs: number): void {
    if (!this.root.visible || !this.batterId) return;
    // A strikeout reaction can fire while the whiff follow-through is still
    // held — the sequence must not re-frame over the reaction pose.
    this.batterSwing?.cancel(false);
    this.batterSwing = undefined;
    this.batterIdle?.stop();
    this.batterIdle = undefined;
    const b = this.batter;
    b.setAngle(0).setX(PLATE_VIEW.BATTER.X);
    this.setKid(b, this.batterId, pose, PLATE_VIEW.BATTER.H);
    this.batterReactTimer?.remove(false);
    this.batterReactTimer = this.scene.time.delayedCall(holdMs, () => this.settleBatter());
  }

  /** Put the current batter back in the rear-view stance if a reaction is up. */
  private settleBatter(): void {
    if (!this.batterId || !this.batter.active) return;
    if (this.batter.texture.key !== this.rigKey(this.batterId, 'batRear')) {
      this.setKid(this.batter, this.batterId, 'batRear', PLATE_VIEW.BATTER.H);
      this.batterBaseScale = this.batter.scale;
      if (this.root.visible) this.startBatterIdle();
    }
  }

  /**
   * The rear-view swing: a real frame sequence — stance (load) → swingMidRear
   * at the contact moment (the hit-pause flash catches this frame) →
   * swingFollowRear held through the result — with a small body whip on top.
   * A whiff over-rotates and holds the follow-through a beat longer.
   * Presentation only: nothing downstream waits on these timers.
   */
  swingBatter(whiff = false): void {
    if (!this.root.visible) return;
    this.batterReactTimer?.remove(false);
    this.batterSwing?.cancel(false);
    this.settleBatter();
    this.batterIdle?.stop();
    this.batterIdle = undefined;
    this.batterTic?.remove(false);
    this.batterTic = undefined;
    const b = this.batter;
    this.scene.tweens.killTweensOf(b); // a mid-waggle tween must not fight the whip
    b.setAngle(0);
    b.setScale(this.batterBaseScale); // clear any mid-breath scale
    const id = this.batterId;
    if (!id) return;
    const followHold = ANIM.SWING_FOLLOW_MS + (whiff ? ANIM.SWING_WHIFF_EXTRA_MS : 0);
    this.batterSwing = poseSequence(
      this.scene,
      b,
      [
        { key: this.rigKey(id, 'swingMidRear'), atMs: ANIM.SWING_MS * ANIM.SWING_CONTACT_FRAC },
        { key: this.rigKey(id, 'swingFollowRear'), atMs: ANIM.SWING_MS },
      ],
      {
        restoreTo: this.rigKey(id, 'batRear'),
        restoreAtMs: ANIM.SWING_MS + followHold,
        onRestore: () => this.startBatterIdle(),
      }
    );
    // The whip is smaller than it used to be — the frames carry the motion.
    this.scene.tweens.add({ targets: b, angle: 8, duration: ANIM.SWING_MS, yoyo: true, ease: 'Quad.out' });
    this.scene.tweens.add({ targets: b, x: PLATE_VIEW.BATTER.X + 10, duration: ANIM.SWING_MS, yoyo: true, ease: 'Quad.out' });
    if (whiff) {
      // Over-rotation after the whip settles: the kid spins himself around.
      this.scene.tweens.add({
        targets: b,
        angle: -10,
        delay: ANIM.SWING_MS * 2,
        duration: 150,
        yoyo: true,
        ease: 'Quad.out',
      });
    }
  }

  private setKid(
    img: Phaser.GameObjects.Image,
    id: string | undefined,
    pose: Pose,
    h: number
  ): void {
    if (!id) return;
    const key = this.rigKey(id, pose);
    if (img.texture.key !== key) img.setTexture(key);
    img.setScale(h / img.height);
  }

  /** The rig is the one 230px+ render site: hero tier for the big poses,
   *  base tier for the small distant kids (pitcher, mini fielders). */
  private rigKey(id: string, pose: Pose): string {
    return HERO_POSES.includes(pose) ? heroKey(id, pose) : poseKey(id, pose);
  }

  private startBatterIdle(): void {
    this.batterIdle?.stop();
    this.batterTic?.remove(false);
    const s = this.batterBaseScale;
    this.batter.setAngle(0).setX(PLATE_VIEW.BATTER.X).setScale(s);
    this.batterIdle = this.scene.tweens.add({
      targets: this.batter,
      scaleY: s * 1.03,
      duration: 850,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.inOut',
    });
    // The waiting-batter tic: an occasional bat waggle.
    this.batterTic = batWaggle(this.scene, this.batter);
  }

  // --- The backdrop: sky, venue fence, ground, mound, plate dirt ------------

  private drawBackdrop(look: VenueDef['look']): void {
    const W = GAME_WIDTH;
    const H = GAME_HEIGHT;
    const HORIZON = PLATE_VIEW.HORIZON_Y;
    const g = this.scene.add.graphics();

    // Sky: lighter at the horizon, like drawField's.
    g.fillGradientStyle(COLORS.sky, COLORS.sky, lightenInt(COLORS.sky, 0.35), lightenInt(COLORS.sky, 0.35), 1);
    g.fillRect(0, 0, W, HORIZON);

    // The warm key light, upper-left — same sun as the field.
    g.fillStyle(0xfff4de, 0.9);
    g.fillCircle(92, 66, 34);
    g.fillStyle(0xfff4de, 0.25);
    g.fillCircle(92, 66, 50);

    // Venue fence band on the horizon (same look descriptors as drawField).
    const fenceTop = HORIZON - 46;
    if (look.treeline) {
      // Haze-tinted treetops peeking over the wall.
      for (let x = 8; x < W; x += 60) {
        const big = ((x / 60) | 0) % 2 === 0;
        g.fillStyle(big ? 0x4f9d5e : 0x6fb589, big ? 0.75 : 0.6);
        g.fillCircle(x, fenceTop - (big ? 14 : 6) - ((x * 7) % 8), big ? 17 : 11);
      }
    }
    g.fillStyle(look.fence, 1);
    g.fillRect(0, fenceTop, W, HORIZON - fenceTop);
    if (look.fenceStyle === 'chainlink') {
      // Chain-link: a light X-hatch over the gray.
      g.lineStyle(2, look.fenceTrim, 0.6);
      for (let x = -40; x < W + 40; x += 26) {
        g.lineBetween(x, fenceTop, x + 34, HORIZON);
        g.lineBetween(x + 34, fenceTop, x, HORIZON);
      }
      g.lineStyle(3, lightenInt(look.fence, 0.3), 0.9);
      g.lineBetween(0, fenceTop + 2, W, fenceTop + 2);
    } else if (look.fenceStyle === 'planks') {
      // Neighbor's plank fence.
      g.lineStyle(3, look.fenceTrim, 0.8);
      for (let x = 14; x < W; x += 30) g.lineBetween(x, fenceTop, x, HORIZON);
      g.lineStyle(3, lightenInt(look.fence, 0.25), 0.9);
      g.lineBetween(0, fenceTop + 2, W, fenceTop + 2);
    } else {
      // Wall — with a crowd strip peeking over it when the venue has stands.
      if (look.skyline === 'stands') {
        g.fillStyle(shadeInt(look.fence, 0.25), 1);
        g.fillRect(0, fenceTop - 20, W, 20);
        const crowd = [0xffce3a, 0xe8524a, 0x4aa5e0, 0xfff4de, 0x9a6bd0];
        for (let i = 0; i < 64; i++) {
          // Deterministic scatter — no RNG so the backdrop never shimmers.
          const x = (i * 61) % W;
          const y = fenceTop - 8 - ((i * 37) % 10);
          g.fillStyle(crowd[i % crowd.length], 0.9);
          g.fillCircle(x, y, 4);
        }
      }
      g.lineStyle(4, look.fenceTrim, 1);
      g.lineBetween(0, fenceTop + 3, W, fenceTop + 3);
    }

    // Ground from the horizon down.
    g.fillStyle(look.grass, 1);
    g.fillRect(0, HORIZON, W, H - HORIZON);
    if (look.stripes) {
      // Mow bands, wider as they near the camera.
      g.fillStyle(look.grassDark, 0.5);
      const bands = [
        [HORIZON + 14, 16],
        [HORIZON + 58, 26],
        [HORIZON + 128, 40],
        [HORIZON + 232, 60],
      ] as const;
      for (const [y, h] of bands) g.fillRect(0, y, W, h);
    }

    // The mound: a lit dirt disc under the distant pitcher.
    const { PITCHER } = PLATE_VIEW;
    g.fillStyle(shadeInt(look.dirt, 0.18), 1);
    g.fillEllipse(PITCHER.X, PITCHER.Y - 2, 96, 26);
    g.fillStyle(look.dirt, 1);
    g.fillEllipse(PITCHER.X - 3, PITCHER.Y - 5, 88, 22);

    // Home-plate dirt filling the bottom of the frame, behind batter+catcher.
    // Ground furniture sits 48px higher than the frame bottom so the plate,
    // boxes, and batter feet all clear the bottom scoreboard strip (HUD.STRIP).
    g.fillStyle(look.dirt, 1);
    g.fillEllipse(W / 2, H + 12, 900, 320);
    g.fillStyle(lightenInt(look.dirt, 0.12), 0.5);
    g.fillEllipse(W / 2 - 90, H - 8, 560, 200);

    // Foul lines shoot OUT from the plate to the poles at the fence's far
    // edges — the camera looks straight out from home, so the 45° lines
    // spread wide; they must NOT converge on the pitcher (that reads as a
    // tiny fair wedge and strands the fielders in "foul" ground). Drawn
    // after the home dirt so they run over it from the plate, like chalk.
    g.lineStyle(5, COLORS.white, 0.85);
    g.lineBetween(452, 544, 40, HORIZON + 2);
    g.lineBetween(508, 544, 920, HORIZON + 2);

    // Batter's boxes + the plate itself.
    g.lineStyle(4, COLORS.white, 0.75);
    g.strokeRect(298, 500, 130, 68);
    g.strokeRect(532, 500, 130, 68);
    g.fillStyle(COLORS.white, 0.95);
    g.fillPoints(
      [
        { x: 452, y: 518 },
        { x: 508, y: 518 },
        { x: 508, y: 538 },
        { x: 480, y: 552 },
        { x: 452, y: 538 },
      ],
      true
    );

    this.root.add(g);
  }
}
