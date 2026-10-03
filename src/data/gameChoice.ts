// ---------------------------------------------------------------------------
// Which game a player last chose: the 3D game at the front door (v2, `/`) or
// the CLASSIC game (v1, `/classic/`). Import-free and shared by both trees,
// like the other keys both games read (picks, team, album, season), so the
// choice survives the switch in either direction.
//
// The front door's index.html reads this key in a tiny inline script BEFORE
// the 3D bundle downloads, so a CLASSIC player never watches the 3D title
// flash up first. That script cannot import this module, so it spells the
// key and the value out; `gameChoice.test.ts` holds the two in step.
// ---------------------------------------------------------------------------

export type GameChoice = 'classic' | '3d';

export const GAME_CHOICE_KEY = 'recess_game';

/** The last game this browser chose, or null if it never chose. */
export function getGameChoice(): GameChoice | null {
  try {
    const v = localStorage.getItem(GAME_CHOICE_KEY);
    return v === 'classic' || v === '3d' ? v : null;
  } catch {
    return null;
  }
}

/** Remember the choice. Never throws: a private window just forgets. */
export function setGameChoice(choice: GameChoice): void {
  try {
    localStorage.setItem(GAME_CHOICE_KEY, choice);
  } catch {
    /* non-persistent is fine */
  }
}
