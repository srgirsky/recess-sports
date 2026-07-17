// ---------------------------------------------------------------------------
// A tiny speaker toggle. Reused on Title / Game / Result. Reflects and flips
// the persisted mute state in systems/audio.
// ---------------------------------------------------------------------------

import Phaser from 'phaser';
import { isMuted, toggleMute } from '../systems/audio';

export function makeMuteButton(
  scene: Phaser.Scene,
  x: number,
  y: number
): Phaser.GameObjects.Text {
  const label = () => (isMuted() ? '🔇' : '🔊');
  const btn = scene.add
    .text(x, y, label(), { fontSize: '30px' })
    .setOrigin(0.5)
    .setDepth(500)
    .setInteractive({ useHandCursor: true });
  btn.on('pointerup', () => {
    toggleMute();
    btn.setText(label());
  });
  return btn;
}
