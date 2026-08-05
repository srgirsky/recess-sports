// ---------------------------------------------------------------------------
// The matchup plate — batter vs pitcher, top-left, in the sticker language.
//
// BB2001 put "ON THE MOUND" and the at-bat block in the corners; BB2026 keeps
// a two-chip plate with a VS wedge in its pitching view. Ours lives TOP-LEFT
// because the mute owns the top-right corner, and hides during a live play —
// both reference games collapse their HUD to a mini scoreboard the moment the
// ball is in play, because that is the beat the whole screen is the play.
//
// DOM only: numbers come from `matchupModel`, ids from the frame, and nothing
// here is `.interactive` — the plate is a readout, so every tap over it falls
// through to the canvas like the scoreboard's do.
// ---------------------------------------------------------------------------

import { getCharacter } from '../../data/characters';
import { portrait } from './portrait';
import type { MatchupLines } from './matchupModel';

export class Matchup {
  readonly root = document.createElement('div');
  private readonly names: [HTMLElement, HTMLElement];
  private readonly lines: [HTMLElement, HTMLElement];
  private readonly arts: [HTMLElement, HTMLElement];
  /** Which kid each chip currently draws, so a portrait rebuilds on change only. */
  private shown: [string, string] = ['', ''];

  constructor() {
    this.root.className = 'matchup';
    const build = (mod: string): { chip: HTMLElement; art: HTMLElement; name: HTMLElement; line: HTMLElement } => {
      const chip = document.createElement('div');
      chip.className = `matchup-chip matchup-chip--${mod}`;
      const art = document.createElement('div');
      art.className = 'matchup-chip__art';
      const name = document.createElement('div');
      name.className = 'matchup-chip__name';
      const line = document.createElement('div');
      line.className = 'matchup-chip__line';
      chip.append(art, name, line);
      return { chip, art, name, line };
    };
    const bat = build('bat');
    const vs = document.createElement('div');
    vs.className = 'matchup__vs';
    vs.textContent = 'VS';
    const pit = build('pit');
    this.root.append(bat.chip, vs, pit.chip);
    this.names = [bat.name, pit.name];
    this.lines = [bat.line, pit.line];
    this.arts = [bat.art, pit.art];
  }

  update(batterId: string, pitcherId: string, lines: MatchupLines, visible: boolean): void {
    this.root.classList.toggle('is-open', visible);
    if (!visible) return;
    [batterId, pitcherId].forEach((id, i) => {
      if (this.shown[i] !== id) {
        this.shown[i] = id;
        const c = getCharacter(id);
        this.arts[i].replaceChildren(portrait(c.visual, c.name));
        this.names[i].textContent = c.name.toUpperCase();
      }
    });
    this.lines[0].textContent = lines.batter;
    this.lines[1].textContent = lines.pitcher;
  }
}
