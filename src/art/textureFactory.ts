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
 * Team-uniform variant resolver. When a kid's id is registered here, every
 * poseKey() lookup silently resolves to their team-jersey texture — so the
 * whole render layer (fielders, runners, the rig, runCycle, reactions) wears
 * team colors with ZERO per-call-site changes. GameScene arms it after the
 * Lineup screen has generated the variant textures; SchoolyardScene clears it
 * so the draft always shows each kid's own look.
 */
const teamVariant = new Map<string, string>(); // id -> key suffix (e.g. ':t2')

export function setTeamVariant(ids: string[], suffix: string): void {
  for (const id of ids) teamVariant.set(id, suffix);
}

export function clearTeamVariant(): void {
  teamVariant.clear();
}

/** The variant suffix for a team identity (stable key namespace). */
export function teamSuffix(color: number, logo: number): string {
  return `:t${color}x${logo}`;
}

/**
 * Texture key for a character pose. 'stand' is the plain character id (the
 * base texture every scene already keys on); other poses get a suffix.
 * NOTE: never derive character ids by parsing texture keys — variants and
 * Phaser's own GUID keys make that meaningless. Always use ROSTER ids.
 */
export function poseKey(id: string, pose: Pose): string {
  const base = pose === 'stand' ? id : `${id}:${pose}`;
  const suffix = teamVariant.get(id);
  return suffix ? `${base}${suffix}` : base;
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

/**
 * Queue TEAM-JERSEY variants (uniform recolor + logo badge) for these kids in
 * every pose, keyed base+teamSuffix. Call from any scene, then
 * `scene.load.start()` (safe outside preload) — ~15 poses × 9 kids renders in
 * well under a second. Existing keys are skipped, so re-entering with the
 * same identity costs nothing.
 */
export function queueTeamTextures(
  scene: Phaser.Scene,
  chars: Character[],
  identity: { color: number; logo: string },
  suffix: string
): void {
  for (const char of chars) {
    for (const pose of POSES) {
      const key = `${poseKeyBase(char.id, pose)}${suffix}`;
      if (scene.textures.exists(key)) continue;
      const svg = buildCharacterSVG(char.visual, pose, { uniform: identity.color, logo: identity.logo });
      scene.load.svg(key, svgToDataUri(svg), { width: RENDER_W, height: RENDER_H });
    }
  }
}

/** The un-variated key (queueTeamTextures must not re-resolve through the map). */
function poseKeyBase(id: string, pose: Pose): string {
  return pose === 'stand' ? id : `${id}:${pose}`;
}
