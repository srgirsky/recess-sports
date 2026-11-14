// ---------------------------------------------------------------------------
// What each signature behaviour is CALLED on a card. Shared, never copied: the
// classic game's draft card (`src/ui/PlayerCard.ts`) and the 3D game's
// (`src/v2/ui/screens/DraftScreen.ts`) both read this, so a kid's story has
// one name in both games. Import-free apart from types.
// ---------------------------------------------------------------------------

import type { Character, Quirk } from './types';

/**
 * And for the signature behaviours: the one thing this kid does that nobody
 * else does, in an icon and two words, so a child who cannot read the tagline
 * still has something to choose by.
 */
export const QUIRK_LABEL: Record<Quirk, string> = {
  never_swings: '🧘 NEVER SWINGS',
  green_light: '🟢 GREEN LIGHT',
  wild_arm: '🌪️ WILD ARM',
  wobble: '〰️ THE WOBBLE',
  wrong_base: '🔀 WRONG BASE',
  clutch_behind: '🕰️ CLUTCH',
  clutch_risp: '🕰️ CLUTCH',
  clutch_runners: '🕰️ CLUTCH',
  moonshot: '🌙 MOONSHOT',
  foul_back: '↩️ FOULS BACK',
  same_spot: '📍 SAME SPOT',
  hit_by_pitch: '🛡️ GETS HIT',
  always_bunts: '🤏 ALL BUNTS',
  one_curve: '🌙 ONE CURVE',
  the_loop: '➰ THE LOOP',
  rainbow: '🌈 RAINBOW',
  heater: '🔥 THE HEATER',
  velocity: '💨 VELOCITY',
  forty_percent: '🎲 WORKS 40%',
  brick_house: '🧱 BRICK HOUSE',
  sure_hands: '🧤 SURE HANDS',
  never_tagged: '🏃 NO TAGS',
  fence_arm: '💪 FENCE ARM',
  plays_alone: '🏝️ PLAYS ALONE',
  eyes_closed: '🙈 EYES CLOSED',
};

/** This kid's behaviour, as a card names it — or undefined for a kid without one. */
export function quirkLabel(char: Character): string | undefined {
  return char.quirk ? QUIRK_LABEL[char.quirk] : undefined;
}
