// ---------------------------------------------------------------------------
// Per-kind pitch-flight dressing (Backyard-style): speed lines on the FAST,
// a lazy loop on the SLOW, crescent trail on the CURVE, spiral on the SCREW,
// mini-bolts on the CRAZY, a flame trail on the 🔥 FIREBALL, and the 🧊
// FREEZEBALL's mid-flight ice-cube freeze. Called from the flight renderers'
// onUpdate with (ball, t, u): t = linear flight time 0..1, u = eased/remapped
// screen progress. STRICTLY RNG-FREE (goldlog + net determinism): all jitter
// derives from a spawn counter via sin(n·137.5). View-only; tweens are chrome
// on self-destructing objects. Depths ride the rig band (DEPTH+6..+8).
// ---------------------------------------------------------------------------

import Phaser from 'phaser';
import { COLORS, PLATE_VIEW, PITCH_FX, type PitchKind } from '../../config';
import * as audio from '../../systems/audio';

export interface PitchFx {
  /** Feed every flight frame. ball = the flying ball display object. */
  onUpdate(ball: Phaser.GameObjects.Arc, t: number, u: number): void;
  /** Tear down everything (also restores a frozen ball's visibility). */
  destroy(): void;
}

const TRAIL_DEPTH = PLATE_VIEW.DEPTH + 7; // just under the ball (+8)

/** Deterministic jitter in [-1, 1] from a spawn counter. */
const jitter = (n: number) => Math.sin(n * 137.5);

export function createPitchFx(scene: Phaser.Scene, kind: PitchKind): PitchFx {
  const spawned = new Set<Phaser.GameObjects.GameObject>();
  let lastSpawn = 0;
  let n = 0; // spawn counter → deterministic jitter
  let prevX: number | undefined;
  let prevY: number | undefined;

  const track = <T extends Phaser.GameObjects.GameObject>(o: T): T => {
    spawned.add(o);
    return o;
  };
  const fade = (o: Phaser.GameObjects.GameObject & { alpha?: number }, ms: number, extra = {}) => {
    scene.tweens.add({
      targets: o,
      alpha: 0,
      duration: ms,
      ...extra,
      onComplete: () => {
        spawned.delete(o);
        o.destroy();
      },
    });
  };

  // Fireball's glow rides the ball every frame (one persistent object).
  const glow =
    kind === 'fireball'
      ? track(scene.add.ellipse(0, 0, 30, 30, 0xff7a2a, 0.35).setDepth(TRAIL_DEPTH))
      : undefined;

  // Freezeball's ice cube overlays the (hidden) ball during the hold.
  let cube: Phaser.GameObjects.Container | undefined;
  let frozeBall: Phaser.GameObjects.Arc | undefined;

  const makeCube = (ball: Phaser.GameObjects.Arc) => {
    const c = scene.add.container(ball.x, ball.y).setDepth(PLATE_VIEW.DEPTH + 8);
    const s = 30 * ball.scale;
    const g = scene.add.graphics();
    g.fillStyle(0xbfe6ff, 0.92);
    g.fillRoundedRect(-s / 2, -s / 2, s, s, s * 0.22);
    g.lineStyle(3, 0xffffff, 0.95);
    g.strokeRoundedRect(-s / 2, -s / 2, s, s, s * 0.22);
    // A sparkle cross + the dim ball silhouette inside the ice.
    g.fillStyle(0xffffff, 0.7);
    g.fillCircle(-s * 0.22, -s * 0.22, s * 0.08);
    g.lineStyle(2, 0xffffff, 0.6);
    g.lineBetween(-s * 0.34, -s * 0.22, -s * 0.1, -s * 0.22);
    g.lineBetween(-s * 0.22, -s * 0.34, -s * 0.22, -s * 0.1);
    c.add(g);
    return c;
  };

  const shatterCube = (at: { x: number; y: number }, scale: number) => {
    for (let i = 0; i < 5; i++) {
      const ang = (i / 5) * Math.PI * 2 + 0.5;
      const shard = track(
        scene.add
          .triangle(at.x, at.y, 0, 0, 10 * scale, 4 * scale, 3 * scale, 10 * scale, 0xbfe6ff)
          .setStrokeStyle(2, 0xffffff, 0.9)
          .setDepth(PLATE_VIEW.DEPTH + 8)
          .setRotation(ang)
      );
      fade(shard, 260, {
        x: at.x + Math.cos(ang) * 34 * scale,
        y: at.y + Math.sin(ang) * 34 * scale,
        rotation: ang * 3,
      });
    }
  };

  const onUpdate = (ball: Phaser.GameObjects.Arc, t: number, _u: number): void => {
    const now = scene.time.now;
    const dx = prevX === undefined ? 0 : ball.x - prevX;
    const dy = prevY === undefined ? 0 : ball.y - prevY;
    prevX = ball.x;
    prevY = ball.y;

    // --- Persistent riders (every frame) ------------------------------------
    if (glow) {
      const pulse = 1 + 0.18 * Math.sin(t * Math.PI * 10);
      glow.setPosition(ball.x, ball.y).setScale(ball.scale * pulse);
    }
    if (kind === 'freezeball') {
      const { HOLD_START, HOLD_END } = PITCH_FX.FREEZE;
      if (t >= HOLD_START && t < HOLD_END && !cube) {
        cube = track(makeCube(ball));
        frozeBall = ball;
        ball.setVisible(false);
        audio.freezeCrack();
        // A ring of frost puffs around the flash-freeze.
        for (let i = 0; i < 6; i++) {
          const ang = (i / 6) * Math.PI * 2;
          const puff = track(
            scene.add
              .circle(ball.x + Math.cos(ang) * 20, ball.y + Math.sin(ang) * 14, 5, 0xe8f7ff, 0.8)
              .setDepth(TRAIL_DEPTH)
          );
          fade(puff, 380, { scale: 1.8 });
        }
      } else if (t >= HOLD_END && cube) {
        shatterCube({ x: ball.x, y: ball.y }, ball.scale);
        spawned.delete(cube);
        cube.destroy();
        cube = undefined;
        ball.setVisible(true);
        frozeBall = undefined;
        audio.pop();
      }
      cube?.setPosition(ball.x, ball.y);
    }

    // --- Cadenced trail spawns ----------------------------------------------
    if (now - lastSpawn < PITCH_FX.TRAIL_EVERY_MS) return;
    lastSpawn = now;
    n += 1;

    switch (kind) {
      case 'fastball': {
        // Speed lines: short streaks trailing the velocity direction.
        const ang = Math.atan2(dy, dx);
        const len = 16 * ball.scale;
        const streak = track(
          scene.add
            .rectangle(ball.x - dx * 2, ball.y - dy * 2 + jitter(n) * 6, len, 2.5, COLORS.white, 0.7)
            .setDepth(TRAIL_DEPTH)
            .setRotation(ang)
        );
        fade(streak, 150);
        break;
      }
      case 'changeup': {
        // A lazy pastel loop drifting around the flight path.
        const off = Math.sin(t * Math.PI * 4) * 8;
        const dot = track(
          scene.add
            .circle(ball.x + off, ball.y - off * 0.6, 4 * ball.scale, 0xbfe0a8, 0.6)
            .setDepth(TRAIL_DEPTH)
        );
        fade(dot, 400, { scale: 0.4 });
        break;
      }
      case 'curve': {
        // Crescent moon slivers that rotate as they fade.
        const arc = track(scene.add.graphics().setDepth(TRAIL_DEPTH));
        (arc as Phaser.GameObjects.Graphics)
          .lineStyle(3, 0xd9e8ff, 0.8)
          .beginPath()
          .arc(0, 0, 10 * ball.scale, 0.6, Math.PI * 1.6)
          .strokePath();
        arc.setPosition(ball.x, ball.y).setRotation(t * 6 + n);
        fade(arc, 240, { rotation: t * 6 + n + 1.2 });
        break;
      }
      case 'screwball': {
        // Two-armed spiral dots orbiting the path.
        for (const arm of [0, Math.PI]) {
          const ang = t * Math.PI * 6 + arm;
          const dot = track(
            scene.add
              .circle(ball.x + Math.cos(ang) * 10, ball.y + Math.sin(ang) * 10, 3.5 * ball.scale, 0xd8c2f5, 0.75)
              .setDepth(TRAIL_DEPTH)
          );
          fade(dot, 260, { scale: 0.3 });
        }
        break;
      }
      case 'crazy': {
        // Tiny jagged bolts crackling off the ball, gold/violet alternating.
        const bolt = track(scene.add.graphics().setDepth(TRAIL_DEPTH));
        const gfx = bolt as Phaser.GameObjects.Graphics;
        gfx.lineStyle(3, n % 2 === 0 ? COLORS.gold : 0xd9c2ff, 0.9);
        let bx = 0;
        let by = 0;
        gfx.beginPath().moveTo(bx, by);
        for (let seg = 1; seg <= 3; seg++) {
          bx += jitter(n * 3 + seg) * 12;
          by += 8 + Math.abs(jitter(n * 5 + seg)) * 6;
          gfx.lineTo(bx, by);
        }
        gfx.strokePath();
        bolt.setPosition(ball.x + jitter(n) * 10, ball.y - 6);
        fade(bolt, 180);
        break;
      }
      case 'fireball': {
        // Flame trail: three-color embers shrinking behind the ball.
        const colors = [0xffd23a, 0xff7a2a, 0xe8524a];
        const ember = track(
          scene.add
            .circle(
              ball.x - dx * 1.5 + jitter(n) * 5,
              ball.y - dy * 1.5 + jitter(n + 7) * 5,
              (5 + (n % 3)) * ball.scale,
              colors[n % 3],
              0.85
            )
            .setDepth(TRAIL_DEPTH)
        );
        fade(ember, 260, { scale: 0.2, y: ember.y - 8 });
        break;
      }
      case 'freezeball': {
        // Drifting frost motes: tiny pale diamonds falling off the floater.
        const mote = track(
          scene.add
            .rectangle(ball.x + jitter(n) * 12, ball.y + jitter(n + 3) * 8, 5, 5, 0xe8f7ff, 0.8)
            .setDepth(TRAIL_DEPTH)
            .setRotation(Math.PI / 4)
        );
        fade(mote, 420, { y: mote.y + 14, scale: 0.4 });
        break;
      }
    }
  };

  return {
    onUpdate,
    destroy() {
      // A ball frozen mid-hold must come back before its own teardown paths run.
      frozeBall?.setVisible(true);
      frozeBall = undefined;
      cube = undefined;
      for (const o of spawned) o.destroy();
      spawned.clear();
    },
  };
}
