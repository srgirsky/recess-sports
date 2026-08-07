// ---------------------------------------------------------------------------
// The player's own non-voting captain, as a small persisted profile.
//
// The authored thirty are the product and the draft is their voting machine,
// so this kid is intentionally outside `ROSTER`: they begin on the player's
// bench, are never offered as a pick, and never enter `recess_pickcounts` or the
// shared sticker album. The game still receives an ordinary `Character`, which
// lets the existing sim, proxy renderer, strategy screen and stat fold use the
// same paths as every neighborhood kid.
// ---------------------------------------------------------------------------

import { CUSTOM_PLAYER_ID } from '../../data/characters';
import type {
  Accessory,
  Character,
  HairStyle,
  Stats,
  VisualParams,
} from '../../data/types';

export const CUSTOM_PLAYER_STORAGE_KEY = 'recess_custom_player_v2';

export const CUSTOM_NAMES = ['Scout', 'Rookie', 'Sunny', 'Buddy', 'Slugger', 'Dash'] as const;
export const CUSTOM_HAIR: readonly HairStyle[] = [
  'short',
  'curly',
  'ponytail',
  'buzz',
  'mohawk',
  'afro',
  'pigtails',
  'spiky',
];
export const CUSTOM_ACCESSORIES: readonly Accessory[] = ['none', 'cap', 'headband', 'glasses'];

export type CustomStyle = 'hitter' | 'speedster' | 'pitcher' | 'fielder';

export const CUSTOM_STYLES: ReadonlyArray<{
  id: CustomStyle;
  icon: string;
  label: string;
  tagline: string;
  stats: Stats;
}> = [
  { id: 'hitter', icon: '💥', label: 'HITTER', tagline: 'Ready to mash.', stats: { contact: 8, power: 8, speed: 4, pitching: 3, fielding: 5 } },
  { id: 'speedster', icon: '⚡', label: 'RUNNER', tagline: 'Catch me if you can.', stats: { contact: 7, power: 3, speed: 9, pitching: 3, fielding: 6 } },
  { id: 'pitcher', icon: '🔥', label: 'PITCHER', tagline: 'Brings the heat.', stats: { contact: 5, power: 4, speed: 5, pitching: 9, fielding: 7 } },
  { id: 'fielder', icon: '🧤', label: 'GLOVE', tagline: 'Nothing gets by.', stats: { contact: 6, power: 4, speed: 7, pitching: 5, fielding: 9 } },
];

export interface CustomPlayerProfile {
  v: 1;
  name: number;
  voice: 'boy' | 'girl';
  style: CustomStyle;
  skin: number;
  hair: HairStyle;
  hairColor: number;
  accessory: Accessory;
}

export const DEFAULT_CUSTOM_PLAYER: CustomPlayerProfile = {
  v: 1,
  name: 0,
  voice: 'girl',
  style: 'hitter',
  skin: 2,
  hair: 'curly',
  hairColor: 0,
  accessory: 'none',
};

const intIn = (value: unknown, max: number, fallback: number): number =>
  Number.isInteger(value) && Number(value) >= 0 && Number(value) < max ? Number(value) : fallback;

/** Decode hostile/old localStorage without ever handing invalid palette data to art. */
export function decodeCustomPlayer(raw: string | null): CustomPlayerProfile | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<CustomPlayerProfile> | null;
    if (!value || value.v !== 1) return null;
    return {
      v: 1,
      name: intIn(value.name, CUSTOM_NAMES.length, DEFAULT_CUSTOM_PLAYER.name),
      voice: value.voice === 'boy' || value.voice === 'girl' ? value.voice : DEFAULT_CUSTOM_PLAYER.voice,
      style: CUSTOM_STYLES.some((s) => s.id === value.style) ? value.style! : DEFAULT_CUSTOM_PLAYER.style,
      skin: intIn(value.skin, 6, DEFAULT_CUSTOM_PLAYER.skin),
      hair: CUSTOM_HAIR.includes(value.hair as HairStyle) ? value.hair! : DEFAULT_CUSTOM_PLAYER.hair,
      hairColor: intIn(value.hairColor, 7, DEFAULT_CUSTOM_PLAYER.hairColor),
      accessory: CUSTOM_ACCESSORIES.includes(value.accessory as Accessory)
        ? value.accessory!
        : DEFAULT_CUSTOM_PLAYER.accessory,
    };
  } catch {
    return null;
  }
}

export function loadCustomPlayer(): CustomPlayerProfile | null {
  if (typeof localStorage === 'undefined') return null;
  return decodeCustomPlayer(localStorage.getItem(CUSTOM_PLAYER_STORAGE_KEY));
}

export function saveCustomPlayer(profile: CustomPlayerProfile): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(CUSTOM_PLAYER_STORAGE_KEY, JSON.stringify(profile));
}

export function customPlayerVisual(profile: CustomPlayerProfile): VisualParams {
  return {
    skin: profile.skin,
    hair: profile.hair,
    hairColor: profile.hairColor,
    uniform: 5,
    accessory: profile.accessory,
    expression: 'determined',
    stance: profile.style === 'hitter' ? 'open' : profile.style === 'speedster' ? 'crouch' : 'high',
    outfit: { kind: 'tee', top: (profile.skin + profile.hairColor + 4) % 12, bottoms: 'jeans' },
  };
}

/** Materialize the stored profile at the sim/render membrane. */
export function customPlayerCharacter(profile: CustomPlayerProfile): Character {
  const style = CUSTOM_STYLES.find((s) => s.id === profile.style) ?? CUSTOM_STYLES[0];
  return {
    id: CUSTOM_PLAYER_ID,
    name: CUSTOM_NAMES[profile.name] ?? CUSTOM_NAMES[0],
    emoji: '⭐',
    tagline: style.tagline,
    voiceGender: profile.voice,
    stats: { ...style.stats },
    visual: customPlayerVisual(profile),
    ability: 'none',
    draftLine: `${CUSTOM_NAMES[profile.name] ?? CUSTOM_NAMES[0]} is ready!`,
  };
}
