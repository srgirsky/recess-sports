// ---------------------------------------------------------------------------
// Turns our SVG strings into Phaser textures.
//
// Phaser can't use an SVG string as a sprite directly, but its loader accepts a
// data-URI URL. We queue every character's SVG in BootScene.preload(); once the
// loader finishes, `scene.add.image(x, y, char.id)` works anywhere.
//
// Rendering at 2x the viewBox keeps the kids crisp on retina/tablet screens.
// ---------------------------------------------------------------------------

import Phaser from 'phaser';
import type { Character } from '../data/types';
import { buildCharacterSVG, POSES, type Pose } from './CharacterArt';

const RENDER_W = 600; // 3x the 200-wide viewBox — keeps the added detail crisp
const RENDER_H = 780; // 3x the 260-tall viewBox

/** Native display aspect helpers so scenes can size sprites without magic numbers. */
export const CHAR_ASPECT = RENDER_W / RENDER_H;

/**
 * Texture key for a character pose. 'stand' is the plain character id (the
 * base texture every scene already keys on); other poses get a suffix.
 */
export function poseKey(id: string, pose: Pose): string {
  return pose === 'stand' ? id : `${id}:${pose}`;
}

function svgToDataUri(svg: string): string {
  // Phaser's loader base64-decodes SVG data URIs (it calls atob), so we must
  // provide base64 — a URL-encoded URI throws InvalidCharacterError.
  // unescape(encodeURIComponent(...)) makes btoa safe for any non-Latin1 chars.
  const b64 = btoa(unescape(encodeURIComponent(svg)));
  return `data:image/svg+xml;base64,${b64}`;
}

/**
 * Queue one character pose as a texture (key from poseKey).
 * MUST be called inside a scene's preload() so the loader picks it up.
 * All poses render at the same size, so texture swaps keep sprite scale valid.
 */
export function queueCharacterTexture(
  scene: Phaser.Scene,
  char: Character,
  pose: Pose = 'stand'
): void {
  const key = poseKey(char.id, pose);
  if (scene.textures.exists(key)) return;
  const svg = buildCharacterSVG(char.visual, pose);
  scene.load.svg(key, svgToDataUri(svg), { width: RENDER_W, height: RENDER_H });
}

/** Queue the whole roster in every pose. */
export function queueRosterTextures(scene: Phaser.Scene, roster: Character[]): void {
  for (const char of roster) {
    for (const pose of POSES) queueCharacterTexture(scene, char, pose);
  }
}
