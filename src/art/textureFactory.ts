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
import { buildCharacterSVG } from './CharacterArt';

const RENDER_W = 400; // 2x the 200-wide viewBox
const RENDER_H = 520; // 2x the 260-tall viewBox

/** Native display aspect helpers so scenes can size sprites without magic numbers. */
export const CHAR_ASPECT = RENDER_W / RENDER_H;

function svgToDataUri(svg: string): string {
  // Phaser's loader base64-decodes SVG data URIs (it calls atob), so we must
  // provide base64 — a URL-encoded URI throws InvalidCharacterError.
  // unescape(encodeURIComponent(...)) makes btoa safe for any non-Latin1 chars.
  const b64 = btoa(unescape(encodeURIComponent(svg)));
  return `data:image/svg+xml;base64,${b64}`;
}

/**
 * Queue one character's art as a texture keyed by its id.
 * MUST be called inside a scene's preload() so the loader picks it up.
 */
export function queueCharacterTexture(scene: Phaser.Scene, char: Character): void {
  if (scene.textures.exists(char.id)) return;
  const svg = buildCharacterSVG(char.visual);
  scene.load.svg(char.id, svgToDataUri(svg), { width: RENDER_W, height: RENDER_H });
}

/** Queue the whole roster. */
export function queueRosterTextures(scene: Phaser.Scene, roster: Character[]): void {
  for (const char of roster) queueCharacterTexture(scene, char);
}
