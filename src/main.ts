// ---------------------------------------------------------------------------
// App entry. Creates the Phaser game and registers every scene.
//
// Django analogy: this is a bit like urls.py + settings.py combined — it wires
// the "pages" (scenes) together and sets global config. Scenes then run in the
// order you start() them; the first one in the list boots first.
// ---------------------------------------------------------------------------

import Phaser from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT, COLORS } from './config';
import { BootScene } from './scenes/BootScene';
import { SchoolyardScene } from './scenes/SchoolyardScene';
import { GameScene } from './scenes/GameScene';
import { ResultScene } from './scenes/ResultScene';

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: GAME_WIDTH,
  height: GAME_HEIGHT,
  backgroundColor: COLORS.sky,
  scale: {
    // FIT scales our fixed 960x640 canvas to fill any screen without distortion.
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  render: {
    antialias: true,
    roundPixels: true,
  },
  scene: [BootScene, SchoolyardScene, GameScene, ResultScene],
});

// Expose for in-browser debugging during development only.
if (import.meta.env.DEV) {
  (window as unknown as { __game: Phaser.Game }).__game = game;
}
