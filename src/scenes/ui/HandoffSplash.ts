// ---------------------------------------------------------------------------
// Pass-and-play handoff splash: a full-screen opaque team-colored panel that
// says WHOSE turn it is — giant logo, team-jersey kid art, spoken team name —
// and waits for a tap. The caller gates every FLOW timer behind `onReady`,
// which trivially satisfies the banner-hold invariant: nothing is scheduled
// until the right kid is holding the device.
// ---------------------------------------------------------------------------

import Phaser from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT, COLORS, PASSPLAY } from '../../config';
import { TEAM_LOGOS, teamName, type TeamIdentity } from '../../systems/team';
import { UNIFORM_COLORS } from '../../art/palette';
import { poseKey } from '../../art/textureFactory';
import { FONT } from '../../ui/theme';
import * as audio from '../../systems/audio';
import { commentatorProfile } from '../../systems/voices';

export function showHandoffSplash(
  scene: Phaser.Scene,
  identity: TeamIdentity | undefined,
  /** A kid from the team to show big on the panel (already in team jersey). */
  posterKidId: string,
  onReady: () => void,
  pin: <T extends Phaser.GameObjects.GameObject>(o: T) => T
): void {
  const jersey = identity ? parseInt(UNIFORM_COLORS[identity.color].jersey.slice(1), 16) : COLORS.sky;
  const logo = identity ? TEAM_LOGOS[identity.logo].icon : '⚾';
  const name = identity ? teamName(identity) : 'NEXT TEAM';

  const root = scene.add.container(0, 0).setDepth(97);
  const bg = scene.add
    .rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, jersey, 1)
    .setInteractive(); // swallows every tap behind it
  root.add(bg);
  const big = scene.add.text(GAME_WIDTH / 2, 170, logo, { fontSize: '120px' }).setOrigin(0.5);
  root.add(big);
  scene.tweens.add({ targets: big, scale: 1.12, duration: 500, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
  const kid = scene.add.image(GAME_WIDTH / 2, GAME_HEIGHT / 2 + 130, poseKey(posterKidId, 'cheer')).setOrigin(0.5, 1);
  kid.setScale(200 / kid.height);
  root.add(kid);
  root.add(
    scene.add
      .text(GAME_WIDTH / 2, 320, `${name},\nYOU'RE UP!`, {
        fontFamily: FONT,
        fontSize: '44px',
        color: '#ffffff',
        fontStyle: 'bold',
        align: 'center',
      })
      .setOrigin(0.5)
      .setStroke('#14202e', 10)
  );
  const tapHint = scene.add
    .text(GAME_WIDTH / 2, GAME_HEIGHT - 70, '👆 TAP WHEN READY', {
      fontFamily: FONT,
      fontSize: '24px',
      color: '#ffffff',
      fontStyle: 'bold',
    })
    .setOrigin(0.5)
    .setStroke('#14202e', 7);
  root.add(tapHint);
  scene.tweens.add({ targets: tapHint, alpha: 0.5, duration: 460, yoyo: true, repeat: -1 });
  pin(root);

  audio.say(`${name}, you're up!`, commentatorProfile('A'), 'flush');

  // Arm the dismiss tap after a short guard so the tap that ENDED the last
  // half can't blow straight through the splash.
  scene.time.delayedCall(PASSPLAY.SPLASH_GUARD_MS, () => {
    bg.once('pointerdown', () => {
      root.destroy();
      onReady();
    });
  });
}
