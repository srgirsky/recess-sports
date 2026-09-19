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
//
// The sweat pip (`features.stamina`, a held feature) is a row INSIDE the
// pitcher's chip, in flow, so the plate's box grows by one small line when the
// arm is tired and `audit:v2-layout` measures the same box it always did — an
// absolutely-positioned badge could poke outside the chip and collide with the
// pause. Hidden by `[hidden]` when fresh or when the feature is off; the view
// decides tired-or-not from the sim's own threshold (`stamina.ts`).
// ---------------------------------------------------------------------------

import { getCharacter } from '../../data/characters';
import type { Character } from '../../data/types';
import { portrait } from './portrait';
import type { MatchupLines } from './matchupModel';

export class Matchup {
  readonly root = document.createElement('div');
  private readonly names: [HTMLElement, HTMLElement];
  private readonly lines: [HTMLElement, HTMLElement];
  private readonly arts: [HTMLElement, HTMLElement];
  /** The tired tell on the pitcher's chip. */
  private readonly sweat: HTMLElement;
  /** Which kid each chip currently draws, so a portrait rebuilds on change only. */
  private shown: [string, string] = ['', ''];

  constructor(private readonly lookup: (id: string) => Character = getCharacter) {
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
    this.sweat = document.createElement('div');
    this.sweat.className = 'matchup-chip__sweat';
    this.sweat.textContent = '💦';
    this.sweat.setAttribute('aria-label', 'tired');
    this.sweat.hidden = true;
    pit.chip.append(this.sweat);
    this.root.append(bat.chip, vs, pit.chip);
    this.names = [bat.name, pit.name];
    this.lines = [bat.line, pit.line];
    this.arts = [bat.art, pit.art];
  }

  update(
    batterId: string,
    pitcherId: string,
    lines: MatchupLines,
    visible: boolean,
    /** Each principal's TEAM palette index, so the chip matches the model's
     * accents rather than showing a third colour source. Portraits drew each
     * kid's fixed roster street colour before this — a batter whose chip wore
     * green while his model wore team-accented red (2026-08-24 review). */
    uniforms?: { batter?: number; pitcher?: number },
    /** The pitcher is tired (`features.stamina` on and below the line). */
    tired = false
  ): void {
    this.root.classList.toggle('is-open', visible);
    if (!visible) return;
    this.sweat.hidden = !tired;
    const kit = [uniforms?.batter, uniforms?.pitcher];
    [batterId, pitcherId].forEach((id, i) => {
      const key = `${id}:${kit[i] ?? 'street'}`;
      if (this.shown[i] !== key) {
        this.shown[i] = key;
        const c = this.lookup(id);
        this.arts[i].replaceChildren(portrait(c, c.name, kit[i] === undefined ? undefined : { uniform: kit[i] }));
        this.names[i].textContent = c.name.toUpperCase();
      }
    });
    this.lines[0].textContent = lines.batter;
    this.lines[1].textContent = lines.pitcher;
  }
}
