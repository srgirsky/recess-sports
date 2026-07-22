// ---------------------------------------------------------------------------
// Turns our SVG strings into Phaser textures.
//
// Phaser can't use an SVG string as a sprite directly, but its loader accepts a
// data-URI URL. We queue every character's SVG in BootScene.preload(); once the
// loader finishes, `scene.add.image(x, y, char.id)` works anywhere.
//
// TWO SIZE TIERS. Kids display at 54–200px in the 960x640 logical space, so
// oversized textures just get GPU-minified into mush (bilinear filtering, no
// mipmaps). The BASE tier rasterizes near display size — the SVG rasterizer's
// downsampling beats the GPU's. The HERO tier (:hi suffix) exists ONLY for the
// behind-plate rig poses that display at 230-288px (batRear/catchRear and the
// upset/nervous reaction swaps of the rig batter); BattingView is the sole
// opt-in via heroKey() — everything else keys through poseKey unchanged.
// ---------------------------------------------------------------------------

import type Phaser from 'phaser';
import type { Character } from '../data/types';
import { buildCharacterSVG, POSES, type Pose } from './CharacterArt';

const RENDER_W = 240; // 1.2x the 200-wide viewBox — near the largest common display size
const RENDER_H = 312; // 1.2x the 260-tall viewBox

const HERO_W = 480; // 2.4x — the rig-only tier
const HERO_H = 624;
const HERO_SUFFIX = ':hi';
/** The poses the behind-plate rig displays at 230px+ (see config.PLATE_VIEW):
 *  the stance/crouch pair, the rig batter's swing frames, and every
 *  reactBatter swap (upset/nervous/cheer). */
export const HERO_POSES: Pose[] = [
  'batRear',
  'catchRear',
  'swingLoadRear',
  'swingMidRear',
  'swingFollowRear',
  'upset',
  'nervous',
  'dodge',
  'cheer',
];

/** Street-clothes variant suffix. SchoolyardScene arms the whole roster with
 *  it so the draft shows personal outfits; GameScene clears/re-arms with team
 *  suffixes, so games (kid mode included) stay in jerseys. */
export const STREET_SUFFIX = ':sc';
/** The only poses the draft renders: wall idle, the crowd stream-out's full
 *  4-frame run cycle, pennant celebration, inspect card. (The dev gallery
 *  lazily bakes the rest.) */
export const STREET_POSES: Pose[] = ['stand', 'run1', 'run2', 'run3', 'run4', 'cheer'];

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

/**
 * Hero-tier texture key: the high-res rig variant of a pose. Composes AFTER
 * the team suffix so jerseys and hero resolution stack (`id:batRear:t2x4:hi`).
 * Only BattingView should use this — the rig is the only 230px+ render site.
 */
export function heroKey(id: string, pose: Pose): string {
  return `${poseKey(id, pose)}${HERO_SUFFIX}`;
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
  pose: Pose = 'stand',
  hero = false
): void {
  const base = poseKey(char.id, pose);
  const key = hero ? `${base}${HERO_SUFFIX}` : base;
  if (scene.textures.exists(key)) return;
  const svg = buildCharacterSVG(char.visual, pose);
  scene.load.svg(key, svgToDataUri(svg), {
    width: hero ? HERO_W : RENDER_W,
    height: hero ? HERO_H : RENDER_H,
  });
}

/** Queue the whole roster in every pose, plus the hero tier for the rig poses. */
export function queueRosterTextures(scene: Phaser.Scene, roster: Character[]): void {
  for (const char of roster) {
    for (const pose of POSES) queueCharacterTexture(scene, char, pose);
    for (const pose of HERO_POSES) queueCharacterTexture(scene, char, pose, true);
  }
}

/**
 * Queue STREET-CLOTHES variants (personal outfits, no badge/collar) keyed
 * base+':sc' at the base tier. BootScene bakes the 4 draft poses; the dev
 * gallery can pass POSES to review street looks in every pose.
 */
export function queueStreetTextures(
  scene: Phaser.Scene,
  roster: Character[],
  poses: Pose[] = STREET_POSES
): void {
  for (const char of roster) {
    for (const pose of poses) {
      const key = `${poseKeyBase(char.id, pose)}${STREET_SUFFIX}`;
      if (scene.textures.exists(key)) continue;
      const svg = buildCharacterSVG(char.visual, pose, undefined, { street: true });
      scene.load.svg(key, svgToDataUri(svg), { width: RENDER_W, height: RENDER_H });
    }
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
    // Hero tier for the rig poses — the close-up batter/catcher wear jerseys.
    for (const pose of HERO_POSES) {
      const key = `${poseKeyBase(char.id, pose)}${suffix}${HERO_SUFFIX}`;
      if (scene.textures.exists(key)) continue;
      const svg = buildCharacterSVG(char.visual, pose, { uniform: identity.color, logo: identity.logo });
      scene.load.svg(key, svgToDataUri(svg), { width: HERO_W, height: HERO_H });
    }
  }
}

/** The un-variated key (queueTeamTextures must not re-resolve through the map). */
function poseKeyBase(id: string, pose: Pose): string {
  return pose === 'stand' ? id : `${id}:${pose}`;
}
