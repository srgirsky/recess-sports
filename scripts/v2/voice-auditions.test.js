// ---------------------------------------------------------------------------
// The audition has to be CAST, not a loop over one generic instruction. This
// gate keeps every audition attached to the roster, gives each a distinct
// direction, and ensures the spoken copy remains the roster's copy.
// The generated MP3s stay outside public/ until a human has listened.
// ---------------------------------------------------------------------------

import { describe, expect, it } from 'vitest';
import { ROSTER } from '../../src/data/characters.ts';
import { performanceBrief, directionSheet } from './character-directions.mjs';
import { auditionSheet, VOICE_AUDITIONS } from './audition-voices.mjs';

describe('roster performance direction', () => {
  it('casts all thirty characters in roster order and preserves their copy', () => {
    expect(VOICE_AUDITIONS.map((entry) => entry.character)).toEqual(ROSTER);
    expect(auditionSheet().map((entry) => entry.line)).toEqual(ROSTER.map((c) => c.draftLine));
  });

  it('gives every character an individual sculpt, motion and voice direction', () => {
    const sheet = auditionSheet();
    expect(new Set(sheet.map((entry) => entry.direction)).size).toBe(sheet.length);
    expect(new Set(directionSheet().map((entry) => entry.sculpt)).size).toBe(ROSTER.length);
    expect(new Set(directionSheet().map((entry) => entry.motion)).size).toBe(ROSTER.length);
    expect(new Set(directionSheet().map((entry) => entry.casting)).size).toBe(ROSTER.length);
    expect(new Set(directionSheet().map((entry) => entry.read)).size).toBe(ROSTER.length);
    expect(new Set(directionSheet().map((entry) => entry.avoid)).size).toBe(ROSTER.length);
    for (const entry of sheet) {
      expect(entry.direction.length, entry.id).toBeGreaterThan(220);
      expect(entry.direction, entry.id).toMatch(/youthful/i);
    }
  });

  it('keeps the signature trio sharply separated', () => {
    const [junebug, theo, zoom] = directionSheet();
    expect(junebug.read).toMatch(/matter-of-fact/);
    expect(theo.read).toMatch(/breathless stumble/);
    expect(zoom.read).toMatch(/conspiratorial/);
  });

  it('generates a complete production handoff from the same cards', () => {
    const brief = performanceBrief();
    for (const character of ROSTER) {
      expect(brief).toContain(`${character.name} \`${character.id}\``);
    }
    expect(brief.match(/^### \d+\./gm)).toHaveLength(ROSTER.length);
    expect(brief).toContain('anims_<id>_v1.glb');
  });
});
