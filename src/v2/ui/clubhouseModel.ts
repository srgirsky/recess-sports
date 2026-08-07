// ---------------------------------------------------------------------------
// The clubhouse data, without a DOM or localStorage read.
//
// The album and pick tally are shared with v1 on purpose. This model turns
// those two stores into the few numbers a four-year-old can recognize at a
// glance and the sticker state the screen draws. Keeping the fold pure means a
// malformed or old store can be tested without booting the game.
// ---------------------------------------------------------------------------

import type { AlbumState } from '../../systems/album';
import type { PickRate } from '../../systems/picklog';

export interface ClubhouseSticker {
  id: string;
  games: number;
  wins: number;
  trophies: number;
  unlocked: boolean;
  foil: boolean;
}

export interface ClubhouseFavorite {
  id: string;
  picks: number;
}

export interface ClubhouseModel {
  gamesPlayed: number;
  unlocked: number;
  total: number;
  foils: number;
  trophies: number;
  favorites: ClubhouseFavorite[];
  stickers: ClubhouseSticker[];
}

/** Fold the shared collection and vote stores into one stable roster order. */
export function clubhouseModel(
  album: AlbumState,
  gamesPlayed: number,
  pickRates: PickRate[],
  rosterOrder: string[]
): ClubhouseModel {
  const stickers = rosterOrder.map((id): ClubhouseSticker => {
    const games = Math.max(0, album.drafted[id] ?? 0);
    const wins = Math.max(0, album.wonWith[id] ?? 0);
    const trophies = Math.max(0, album.trophies[id] ?? 0);
    return {
      id,
      games,
      wins,
      trophies,
      unlocked: games > 0 || trophies > 0,
      foil: wins > 0,
    };
  });
  const roster = new Set(rosterOrder);
  const favorites = pickRates
    .filter((p) => roster.has(p.id) && p.count > 0)
    .sort((a, b) => b.count - a.count || rosterOrder.indexOf(a.id) - rosterOrder.indexOf(b.id))
    .slice(0, 3)
    .map((p) => ({ id: p.id, picks: p.count }));

  return {
    gamesPlayed: Math.max(0, gamesPlayed),
    unlocked: stickers.filter((s) => s.unlocked).length,
    total: stickers.length,
    foils: stickers.filter((s) => s.foil).length,
    trophies: stickers.reduce((sum, s) => sum + s.trophies, 0),
    favorites,
    stickers,
  };
}
