// ---------------------------------------------------------------------------
// The sticker album — localStorage-backed collection meta. Every kid you've
// drafted earns their sticker; winning with them foils it; trophies stack.
// This is the voting-machine thesis in collectible form: the kids players
// re-draft and treasure are the ones the album lights up.
// ---------------------------------------------------------------------------

export interface AlbumState {
  v: number;
  /** Games each kid has been on your drafted team. */
  drafted: Record<string, number>;
  /** Games each kid has WON with you. */
  wonWith: Record<string, number>;
  /** Season trophies each kid has taken home. */
  trophies: Record<string, number>;
}

const KEY = 'recess_album';
const VERSION = 1;

export function getAlbum(): AlbumState {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { v: VERSION, drafted: {}, wonWith: {}, trophies: {} };
    const p = JSON.parse(raw) as Partial<AlbumState>;
    return {
      v: VERSION,
      drafted: p.drafted ?? {},
      wonWith: p.wonWith ?? {},
      trophies: p.trophies ?? {},
    };
  } catch {
    return { v: VERSION, drafted: {}, wonWith: {}, trophies: {} };
  }
}

function save(a: AlbumState): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(a));
  } catch {
    /* fine */
  }
}

/** A finished game: everyone on the team gets a drafted tick; wins foil. */
export function recordAlbumGame(team: string[], won: boolean): void {
  const a = getAlbum();
  for (const id of team) {
    a.drafted[id] = (a.drafted[id] ?? 0) + 1;
    if (won) a.wonWith[id] = (a.wonWith[id] ?? 0) + 1;
  }
  save(a);
}

/** A season trophy for this kid. */
export function recordTrophy(id: string): void {
  const a = getAlbum();
  a.trophies[id] = (a.trophies[id] ?? 0) + 1;
  save(a);
}
