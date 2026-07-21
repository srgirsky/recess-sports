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
import { poseKey } from '../../art/textureFactory';

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
  private batterIdle?: Phaser.Tweens.Tween;
  private batterBaseScale = 1;
  private fielderImgs = new Map<PositionId, Phaser.GameObjects.Image>();

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
    this.root.add([this.pitcher, this.catcher, this.batter]);
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
    const batterChanged = this.batter.texture.key !== poseKey(actors.batterId, 'batRear');
    this.setKid(this.batter, actors.batterId, 'batRear', PLATE_VIEW.BATTER.H);
    this.pitcherId = actors.pitcherId;
    this.batterBaseScale = this.batter.scale;
    if (!this.root.visible || batterChanged) {
      this.startBatterIdle();
    }
    this.root.setVisible(true);
  }

  hide(): void {
    if (!this.root.visible) return;
    this.root.setVisible(false);
    // Nothing may keep animating off-screen (windup lean, idle breathing).
    this.scene.tweens.killTweensOf([this.pitcher, this.batter]);
    this.batterIdle = undefined;
    this.pitcher.setAngle(0);
    if (this.pitcherId) this.pitcher.setTexture(this.pitcherId);
    this.setKid(this.pitcher, this.pitcherId || undefined, 'stand', PLATE_VIEW.PITCHER.H);
    this.batter.setAngle(0);
    this.batter.setX(PLATE_VIEW.BATTER.X);
  }

  /** The distant pitcher coils and leans — mirrors the world-sprite windup. */
  windup(): void {
    if (!this.root.visible || !this.pitcherId) return;
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

  /** The rear-view swing whip: the whole kid snaps through the zone. */
  swingBatter(): void {
    if (!this.root.visible) return;
    this.batterIdle?.stop();
    this.batterIdle = undefined;
    const b = this.batter;
    b.setScale(this.batterBaseScale); // clear any mid-breath scale
    this.scene.tweens.add({ targets: b, angle: 12, duration: ANIM.SWING_MS, yoyo: true, ease: 'Quad.out' });
    this.scene.tweens.add({ targets: b, x: PLATE_VIEW.BATTER.X + 14, duration: ANIM.SWING_MS, yoyo: true, ease: 'Quad.out' });
  }

  private setKid(
    img: Phaser.GameObjects.Image,
    id: string | undefined,
    pose: 'stand' | 'batRear' | 'catchRear' | 'ready',
    h: number
  ): void {
    if (!id) return;
    const key = poseKey(id, pose);
    if (img.texture.key !== key) img.setTexture(key);
    img.setScale(h / img.height);
  }

  private startBatterIdle(): void {
    this.batterIdle?.stop();
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

    // Venue fence band on the horizon.
    const fenceTop = HORIZON - 46;
    g.fillStyle(look.fence, 1);
    g.fillRect(0, fenceTop, W, HORIZON - fenceTop);
    if (look.asphalt) {
      // Chain-link: a light X-hatch over the gray.
      g.lineStyle(2, look.fenceTrim, 0.6);
      for (let x = -40; x < W + 40; x += 26) {
        g.lineBetween(x, fenceTop, x + 34, HORIZON);
        g.lineBetween(x + 34, fenceTop, x, HORIZON);
      }
      g.lineStyle(3, lightenInt(look.fence, 0.3), 0.9);
      g.lineBetween(0, fenceTop + 2, W, fenceTop + 2);
    } else if (look.stands) {
      // Park: wall + a crowd strip peeking over it.
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
      g.lineStyle(4, look.fenceTrim, 1);
      g.lineBetween(0, fenceTop + 3, W, fenceTop + 3);
    } else {
      // Sandlot: neighbor's plank fence.
      g.lineStyle(3, look.fenceTrim, 0.8);
      for (let x = 14; x < W; x += 30) g.lineBetween(x, fenceTop, x, HORIZON);
      g.lineStyle(3, lightenInt(look.fence, 0.25), 0.9);
      g.lineBetween(0, fenceTop + 2, W, fenceTop + 2);
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
    g.fillStyle(look.dirt, 1);
    g.fillEllipse(W / 2, H + 60, 900, 320);
    g.fillStyle(lightenInt(look.dirt, 0.12), 0.5);
    g.fillEllipse(W / 2 - 90, H + 40, 560, 200);

    // Foul lines shoot OUT from the plate to the poles at the fence's far
    // edges — the camera looks straight out from home, so the 45° lines
    // spread wide; they must NOT converge on the pitcher (that reads as a
    // tiny fair wedge and strands the fielders in "foul" ground). Drawn
    // after the home dirt so they run over it from the plate, like chalk.
    g.lineStyle(5, COLORS.white, 0.85);
    g.lineBetween(452, 592, 40, HORIZON + 2);
    g.lineBetween(508, 592, 920, HORIZON + 2);

    // Batter's boxes + the plate itself.
    g.lineStyle(4, COLORS.white, 0.75);
    g.strokeRect(298, 548, 130, 76);
    g.strokeRect(532, 548, 130, 76);
    g.fillStyle(COLORS.white, 0.95);
    g.fillPoints(
      [
        { x: 452, y: 566 },
        { x: 508, y: 566 },
        { x: 508, y: 586 },
        { x: 480, y: 600 },
        { x: 452, y: 586 },
      ],
      true
    );

    this.root.add(g);
  }
}
