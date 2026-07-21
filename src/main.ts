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
import { LineupScene } from './scenes/LineupScene';
import { SettingsScene } from './scenes/SettingsScene';
import { SeasonScene } from './scenes/SeasonScene';
import { AwardsScene } from './scenes/AwardsScene';
import { AlbumScene } from './scenes/AlbumScene';
import { GameScene } from './scenes/GameScene';
import { ResultScene } from './scenes/ResultScene';
import { PauseScene } from './scenes/PauseScene';
import { LobbyScene } from './scenes/LobbyScene';

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
  // PauseScene last: scene-list order is render order for concurrently active
  // scenes, so the launched pause overlay draws on top of the paused Game.
  scene: [BootScene, SchoolyardScene, LobbyScene, LineupScene, GameScene, ResultScene, SettingsScene, SeasonScene, AwardsScene, AlbumScene, PauseScene],
});

// Expose for in-browser debugging during development only.
if (import.meta.env.DEV) {
  (window as unknown as { __game: Phaser.Game }).__game = game;
}
