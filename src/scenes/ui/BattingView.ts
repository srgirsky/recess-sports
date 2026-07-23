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
import { batWaggle, groundShadow, poseSequence } from '../../ui/anim';
import {
  shadeInt,
  lightenInt,
  hash01,
  speckleEllipse,
  chalkLine,
  chalkRect,
  grassFlecks,
} from '../../art/fieldTexture';

export interface RigActors {
  batterId: string;
  pitcherId: string;
  catcherId: string;
  /** The 7 non-battery defenders (1B/2B/SS/3B/LF/CF/RF). */
  fielders: Array<{ position: PositionId; charId: string }>;
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
  private pitcherWindupSeq?: { cancel(restore?: boolean): void };
  private batterBaseScale = 1;
  private fielderImgs = new Map<PositionId, Phaser.GameObjects.Image>();
  private fielderShadows = new Map<PositionId, Phaser.GameObjects.Ellipse>();
  private tossBall: Phaser.GameObjects.Arc;
  private tossTween?: Phaser.Tweens.Tween;

  constructor(scene: Phaser.Scene, look: VenueDef['look']) {
    this.scene = scene;
    this.root = scene.add.container(0, 0).setDepth(PLATE_VIEW.DEPTH).setVisible(false);
    this.drawBackdrop(look);

    // The 7 distant defenders sit between the backdrop and the battery,
    // added far-to-near (Y ascending) so nearer kids draw over farther ones.
    // Each gets a ground shadow (added to root BEFORE its image = drawn
    // under it) so nobody floats on the backdrop — same grounding as the
    // wide field's runners/fielders. Shadows are static; breathing tweens
    // scale the sprite only (the LivePlayView convention).
    const spots = Object.entries(PLATE_VIEW.FIELDERS).sort((a, b) => a[1].Y - b[1].Y);
    for (const [pos, spot] of spots) {
      const shadow = groundShadow(scene, spot.X, spot.Y - 2, spot.H * 0.52).setVisible(false);
      this.fielderShadows.set(pos as PositionId, shadow);
      this.root.add(shadow);
      const img = scene.add.image(spot.X, spot.Y, '__DEFAULT').setOrigin(0.5, 1).setVisible(false);
      this.fielderImgs.set(pos as PositionId, img);
      this.root.add(img);
    }

    const { PITCHER, BATTER, CATCHER } = PLATE_VIEW;
    // Battery ground shadows, under the images (container order = draw order).
    this.root.add(groundShadow(scene, PITCHER.X, PITCHER.Y - 2, 54));
    this.root.add(groundShadow(scene, CATCHER.X, CATCHER.Y - 6, 120));
    this.root.add(groundShadow(scene, BATTER.X + 10, BATTER.Y - 2, 150));
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
    for (const sh of this.fielderShadows.values()) sh.setVisible(false);
    for (const f of actors.fielders) {
      const spot = PLATE_VIEW.FIELDERS[f.position];
      const img = this.fielderImgs.get(f.position);
      if (!spot || !img) continue;
      this.setKid(img, f.charId, 'ready', spot.H);
      img.setVisible(true);
      this.fielderShadows.get(f.position)?.setVisible(true);
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
    this.pitcherWindupSeq?.cancel(false); // a stale windup2 must not re-pose the hidden rig
    this.pitcherWindupSeq = undefined;
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

  /** The distant pitcher coils, strides, and leans — mirrors the world-sprite
   *  windup's leg-lift → stride/plant frame pair. */
  windup(): void {
    if (!this.root.visible || !this.pitcherId) return;
    this.stopTossIdle(); // the pitched ball takes over from here
    const p = this.pitcher;
    this.scene.tweens.killTweensOf(p);
    this.pitcherWindupSeq?.cancel(false);
    p.setTexture(poseKey(this.pitcherId, 'windup'));
    this.pitcherWindupSeq = poseSequence(this.scene, p, [
      { key: poseKey(this.pitcherId, 'windup2'), atMs: ANIM.WINDUP_MS * 0.55 },
    ]);
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
  reactBatter(pose: 'upset' | 'nervous' | 'dodge' | 'cheer', holdMs: number): void {
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
    // Load frame synchronously (no one-tick stance flash); contact and
    // follow-through keep their exact times — the hit-pause flash must still
    // catch swingMidRear at SWING_MS × SWING_CONTACT_FRAC.
    b.setTexture(this.rigKey(id, 'swingLoadRear'));
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
    // Taller than the old 46px band, with real construction per style.
    const fenceTop = HORIZON - 58;
    if (look.treeline) {
      // Haze-tinted treetops peeking over the wall.
      for (let x = 8; x < W; x += 60) {
        const big = ((x / 60) | 0) % 2 === 0;
        g.fillStyle(big ? 0x4f9d5e : 0x6fb589, big ? 0.75 : 0.6);
        g.fillCircle(x, fenceTop - (big ? 14 : 6) - ((x * 7) % 8), big ? 17 : 11);
      }
    }
    if (look.fenceStyle === 'chainlink') {
      // Playground chain-link: a low windscreen base, tall see-through
      // diamonds up to a top-rail pipe, and full-height posts.
      g.fillStyle(look.fence, 1);
      g.fillRect(0, HORIZON - 22, W, 22);
      g.lineStyle(2, look.fenceTrim, 0.6);
      for (let x = -40; x < W + 40; x += 26) {
        g.lineBetween(x, fenceTop, x + 34, HORIZON);
        g.lineBetween(x + 34, fenceTop, x, HORIZON);
      }
      g.lineStyle(3, lightenInt(look.fence, 0.35), 0.9);
      g.lineBetween(0, fenceTop, W, fenceTop);
      g.fillStyle(shadeInt(look.fence, 0.25), 1);
      for (let x = 65; x < W; x += 130) g.fillRect(x - 2, fenceTop, 4, HORIZON - fenceTop);
    } else if (look.fenceStyle === 'planks') {
      // Neighbor's wood fence: per-board tint variation, two carpentry
      // rails, and posts poking above the cap.
      const PLANK = 24;
      for (let x = 0; x < W; x += PLANK) {
        const t = hash01(x / PLANK, 7);
        g.fillStyle(t > 0.62 ? lightenInt(look.fence, 0.09) : t < 0.3 ? shadeInt(look.fence, 0.12) : look.fence, 1);
        g.fillRect(x, fenceTop, Math.min(PLANK, W - x), HORIZON - fenceTop);
      }
      g.lineStyle(2, look.fenceTrim, 0.7);
      for (let x = PLANK; x < W; x += PLANK) g.lineBetween(x, fenceTop, x, HORIZON);
      g.lineStyle(3, shadeInt(look.fence, 0.3), 0.8);
      g.lineBetween(0, fenceTop + 16, W, fenceTop + 16);
      g.lineBetween(0, fenceTop + 40, W, fenceTop + 40);
      g.lineStyle(3, lightenInt(look.fence, 0.25), 0.9);
      g.lineBetween(0, fenceTop + 2, W, fenceTop + 2);
      g.fillStyle(shadeInt(look.fence, 0.35), 1);
      for (let x = 55; x < W; x += 110) {
        g.fillRect(x - 4, fenceTop - 6, 8, HORIZON - fenceTop + 6);
        g.fillRect(x - 6, fenceTop - 9, 12, 4); // post cap
      }
    } else {
      // Park wall: the painted wall with panel tints below, a chain-link
      // screen rising above it, and the crowd sitting safely behind.
      const wallTop = fenceTop + 22;
      if (look.skyline === 'stands' && look.crowdRows > 0) {
        g.fillStyle(shadeInt(look.fence, 0.25), 1);
        g.fillRect(0, fenceTop - 14, W, wallTop - fenceTop + 14);
        const crowd = [0xffce3a, 0xe8524a, 0x4aa5e0, 0xfff4de, 0x9a6bd0];
        const rows = Math.min(2, look.crowdRows);
        for (let row = 0; row < rows; row++) {
          for (let i = 0; i < 64; i++) {
            // Deterministic scatter — no RNG so the backdrop never shimmers.
            const x = (i * 61 + row * 29) % W;
            const y = wallTop - 9 - row * 10 - ((i * 37) % 6);
            const c = crowd[(i + row * 3) % crowd.length];
            g.fillStyle(c, 0.9);
            g.fillRect(x - 5, y + 3, 10, 5); // shoulders — heads read as people
            g.fillCircle(x, y, 4);
          }
        }
      }
      g.fillStyle(look.fence, 1);
      g.fillRect(0, wallTop, W, HORIZON - wallTop);
      for (let col = 0; col * 120 < W; col++) {
        const t = hash01(col, 11);
        if (t > 0.4 && t < 0.7) continue;
        g.fillStyle(t >= 0.7 ? lightenInt(look.fence, 0.12) : shadeInt(look.fence, 0.14), 0.35);
        g.fillRect(col * 120, wallTop, Math.min(120, W - col * 120), HORIZON - wallTop);
      }
      g.lineStyle(4, look.fenceTrim, 1);
      g.lineBetween(0, wallTop + 2, W, wallTop + 2);
      // The chain-link screen above the wall.
      g.lineStyle(1.5, 0xcfd6db, 0.45);
      for (let x = 0; x < W; x += 14) {
        g.lineBetween(x, fenceTop, x + 12, wallTop);
        g.lineBetween(x + 12, fenceTop, x, wallTop);
      }
      g.lineStyle(3, 0xdfe6ea, 0.8);
      g.lineBetween(0, fenceTop, W, fenceTop);
      g.fillStyle(shadeInt(look.fence, 0.25), 1);
      for (let x = 60; x < W; x += 120) {
        g.fillRect(x - 2, fenceTop, 4, HORIZON - fenceTop);
        g.fillRect(x - 4, fenceTop - 3, 8, 3); // post cap
      }
    }

    // Ground from the horizon down.
    g.fillStyle(look.grass, 1);
    g.fillRect(0, HORIZON, W, H - HORIZON);
    if (look.asphalt) {
      // Blacktop: expansion seams instead of mow bands (the wide 'court' read).
      g.lineStyle(2, look.grassDark, 0.7);
      for (let x = 120; x < W; x += 240) g.lineBetween(x, HORIZON, x, H);
      g.lineBetween(0, HORIZON + 150, W, HORIZON + 150);
    } else {
      if (look.stripes) {
        // Mow bands generated with the same recession law as the wide
        // field's checker rows — wider and further apart near the camera.
        g.fillStyle(look.grassDark, 0.5);
        for (let y = HORIZON + 10, h = 14; y < H; y += h * 2.2, h *= 1.5) {
          g.fillRect(0, y, W, h);
        }
      }
      // Tone flecks over the far band pull the flat fill into grass.
      grassFlecks(g, 0, HORIZON + 8, W, 130, lightenInt(look.grass, 0.25), shadeInt(look.grass, 0.2), 60, 1);
    }

    // The mound under the distant pitcher: the wide field's 5-layer lit-dome
    // recipe at rig scale — cast shadow, rimmed base, near-slope shade, lit
    // crown upper-left, and a real pitching rubber under his feet.
    const { PITCHER } = PLATE_VIEW;
    g.fillStyle(0x1b2833, 0.14);
    g.fillEllipse(PITCHER.X + 6, PITCHER.Y + 1, 96, 26);
    g.fillStyle(look.dirt, 1);
    g.fillEllipse(PITCHER.X, PITCHER.Y - 2, 96, 26);
    g.lineStyle(2, shadeInt(look.dirt, 0.3), 0.8);
    g.strokeEllipse(PITCHER.X, PITCHER.Y - 2, 96, 26);
    g.fillStyle(shadeInt(look.dirt, 0.3), 0.3);
    g.fillEllipse(PITCHER.X, PITCHER.Y + 2, 80, 15);
    g.fillStyle(lightenInt(look.dirt, 0.4), 0.45);
    g.fillEllipse(PITCHER.X - 6, PITCHER.Y - 6, 56, 11);
    if (!look.asphalt) {
      speckleEllipse(g, PITCHER.X, PITCHER.Y - 2, 40, 9, [shadeInt(look.dirt, 0.25), lightenInt(look.dirt, 0.35)], 18, 0.4, 5);
    }
    g.fillStyle(COLORS.white, 1);
    g.fillRect(PITCHER.X - 15, PITCHER.Y - 4, 30, 5);
    g.lineStyle(1.5, 0x9a9a9a, 1);
    g.strokeRect(PITCHER.X - 15, PITCHER.Y - 4, 30, 5);

    // Home-plate dirt filling the bottom of the frame, behind batter+catcher.
    // Ground furniture sits 48px higher than the frame bottom so the plate,
    // boxes, and batter feet all clear the bottom scoreboard strip (HUD.STRIP).
    g.fillStyle(look.dirt, 1);
    g.fillEllipse(W / 2, H + 12, 900, 320);
    // The mow edge where the grass meets the home dirt — the boundary line
    // is what makes the dirt read as a SHAPE instead of a brown wash.
    g.lineStyle(5, shadeInt(look.grass, 0.2), 0.8);
    g.strokeEllipse(W / 2, H + 12, 900, 320);
    g.fillStyle(lightenInt(look.dirt, 0.12), 0.5);
    g.fillEllipse(W / 2 - 90, H - 8, 560, 200);
    if (!look.asphalt) {
      speckleEllipse(g, W / 2, H + 12, 430, 150, [shadeInt(look.dirt, 0.22), lightenInt(look.dirt, 0.28)], 130, 0.35, 6);
      // Feet-scuff wear where batters actually stand.
      g.fillStyle(shadeInt(look.dirt, 0.3), 0.25);
      g.fillEllipse(363, 534, 100, 34);
      g.fillEllipse(597, 534, 100, 34);
    }

    // Foul lines shoot OUT from the plate to the poles at the fence's far
    // edges — the camera looks straight out from home, so the 45° lines
    // spread wide; they must NOT converge on the pitcher (that reads as a
    // tiny fair wedge and strands the fielders in "foul" ground). Drawn
    // after the home dirt so they run over it from the plate, like chalk.
    chalkLine(g, 452, 544, 40, HORIZON + 2, 5, 0.8, 1);
    chalkLine(g, 508, 544, 920, HORIZON + 2, 5, 0.8, 2);

    // Batter's boxes (worn chalk) + the plate itself.
    chalkRect(g, 298, 500, 130, 68, 4, 0.65, 4);
    chalkRect(g, 532, 500, 130, 68, 4, 0.65, 8);
    // The plate gets a shaded front edge first, then the white top — a 3px
    // lip that makes it sit IN the dirt instead of floating on it.
    g.fillStyle(0xd8dde6, 0.95);
    g.fillPoints(
      [
        { x: 452, y: 521 },
        { x: 508, y: 521 },
        { x: 508, y: 541 },
        { x: 480, y: 555 },
        { x: 452, y: 541 },
      ],
      true
    );
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
