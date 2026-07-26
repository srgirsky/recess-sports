// ---------------------------------------------------------------------------
// A tiny speaker toggle. Reused on Title / Game / Result. Reflects and flips
// the persisted mute state in systems/audio.
// ---------------------------------------------------------------------------

import Phaser from 'phaser';
import { isMuted, toggleMute } from '../systems/audio';
import { tagUi, MIN_TOUCH } from './layout';

export function makeMuteButton(
  scene: Phaser.Scene,
  x: number,
  y: number
): Phaser.GameObjects.Text {
  const label = () => (isMuted() ? '🔇' : '🔊');
  const btn = scene.add
    .text(x, y, label(), { fontSize: '30px' })
    .setOrigin(0.5)
    .setDepth(500);
  // A 30px emoji is a 30px tap target — too small for the audience. Widen the
  // hit area around the glyph without changing how it looks.
  btn.setInteractive({
    hitArea: new Phaser.Geom.Rectangle(
      btn.width / 2 - MIN_TOUCH / 2,
      btn.height / 2 - MIN_TOUCH / 2,
      MIN_TOUCH,
      MIN_TOUCH
    ),
    hitAreaCallback: Phaser.Geom.Rectangle.Contains,
    useHandCursor: true,
  });
  // stopPropagation: GameScene's scene-level pointerdown swings/throws on any
  // tap — without this, muting mid-pitch also swings the bat.
  btn.on(
    'pointerdown',
    (_p: unknown, _x: number, _y: number, e: Phaser.Types.Input.EventData) => e.stopPropagation()
  );
  btn.on(
    'pointerup',
    (_p: unknown, _x: number, _y: number, e: Phaser.Types.Input.EventData) => {
      e.stopPropagation();
      toggleMute();
      btn.setText(label());
    }
  );
  return tagUi(btn, { role: 'icon', ox: 0, oy: 0, w: btn.width, h: btn.height, label: 'mute' });
}
