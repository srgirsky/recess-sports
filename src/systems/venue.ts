// ---------------------------------------------------------------------------
// Venue selection — persisted per-browser like the game mode, plus the
// resolver that turns a VenueDef into the FieldGeometry the sim consumes.
// ---------------------------------------------------------------------------

import { VENUES, type VenueDef, type VenueId } from '../data/venues';
import { foulPoleXAt, type FieldGeometry } from './geometry';

const KEY = 'recess_venue';

export function getVenue(): VenueDef {
  try {
    const stored = localStorage.getItem(KEY) as VenueId | null;
    if (stored && VENUES[stored]) return VENUES[stored];
  } catch {
    /* fall through */
  }
  return VENUES.park;
}

export function setVenue(id: VenueId): void {
  try {
    localStorage.setItem(KEY, id);
  } catch {
    /* ignore — the game still works, the choice just won't persist */
  }
}

/** The sim-facing shape of a venue (fence line, ground pace, obstacles). */
export function getFieldGeometry(v: VenueDef): FieldGeometry {
  return {
    fenceLeftY: v.fenceLeftY,
    fenceRightY: v.fenceRightY,
    fenceLeftX: foulPoleXAt(v.fenceLeftY).left,
    fenceRightX: foulPoleXAt(v.fenceRightY).right,
    fenceBulge: v.fenceBulge,
    rollMult: v.rollMult,
    bounceMult: v.bounceMult,
    obstacles: v.obstacles.map((o) => ({ x: o.x, y: o.y, r: o.r })),
  };
}
