// ---------------------------------------------------------------------------
// Team identity — persisted like picklog/mode: a uniform color (index into
// palette.UNIFORM_COLORS) + a logo emoji. The "name" is the spoken color +
// logo pair ("THE RED ROCKETS!") so naming needs zero reading or typing.
// Rival presets give CPU teams identities of their own (the Recess Week
// season leans on these).
// ---------------------------------------------------------------------------

export interface TeamIdentity {
  /** Index into palette.UNIFORM_COLORS. */
  color: number;
  /** Index into TEAM_LOGOS. */
  logo: number;
}

const KEY = 'recess_team';
const VERSION = 1;

/** Pickable logos, each with the plural name the announcer speaks. */
export const TEAM_LOGOS: Array<{ icon: string; name: string }> = [
  { icon: '🚀', name: 'ROCKETS' },
  { icon: '🦅', name: 'EAGLES' },
  { icon: '⚡', name: 'BOLTS' },
  { icon: '🐯', name: 'TIGERS' },
  { icon: '🌟', name: 'ALL-STARS' },
  { icon: '🔥', name: 'FLAMES' },
  { icon: '🐸', name: 'FROGS' },
  { icon: '🦖', name: 'REXES' },
];

/** Spoken color name per UNIFORM_COLORS index. */
export const TEAM_COLOR_NAMES = ['RED', 'BLUE', 'GREEN', 'PURPLE', 'ORANGE', 'TEAL', 'GOLD'];

/** "THE RED ROCKETS" — the whole identity in three spoken words. */
export function teamName(t: TeamIdentity): string {
  return `THE ${TEAM_COLOR_NAMES[t.color] ?? 'RED'} ${TEAM_LOGOS[t.logo]?.name ?? 'ROCKETS'}`;
}

/** CPU rival identities (also the Recess Week opponents, in order). */
export const RIVAL_PRESETS: TeamIdentity[] = [
  { color: 3, logo: 3 }, // the Purple Tigers
  { color: 4, logo: 5 }, // the Orange Flames
  { color: 1, logo: 2 }, // the Blue Bolts
  { color: 2, logo: 6 }, // the Green Frogs
  { color: 6, logo: 7 }, // the Gold Rexes
];

/** A rival that doesn't clash with the player's color. */
export function pickRival(player: TeamIdentity, gameIndex = 0): TeamIdentity {
  const pool = RIVAL_PRESETS.filter((r) => r.color !== player.color);
  return pool[gameIndex % pool.length];
}

export function getTeamIdentity(): TeamIdentity | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { v?: number; color?: number; logo?: number };
    if (typeof parsed.color !== 'number' || typeof parsed.logo !== 'number') return null;
    return { color: parsed.color, logo: parsed.logo };
  } catch {
    return null;
  }
}

export function setTeamIdentity(t: TeamIdentity): void {
  try {
    localStorage.setItem(KEY, JSON.stringify({ v: VERSION, ...t }));
  } catch {
    /* the game still works; the choice just won't persist */
  }
}
