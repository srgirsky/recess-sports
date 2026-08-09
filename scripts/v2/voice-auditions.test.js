// ---------------------------------------------------------------------------
// The audition has to be CAST, not a loop over one generic instruction. This
// gate keeps the pilot attached to the signature trio, gives each a distinct
// voice and direction, and ensures the spoken copy remains the roster's copy.
// The generated MP3s stay outside public/ until a human has listened.
// ---------------------------------------------------------------------------

import { describe, expect, it } from 'vitest';
import { ROSTER } from '../../src/data/characters.ts';
import { auditionSheet, VOICE_AUDITIONS } from './audition-voices.mjs';

describe('signature voice audition', () => {
  it('casts the three signature characters from the roster source', () => {
    expect(VOICE_AUDITIONS.map((entry) => entry.character)).toEqual(ROSTER.slice(0, 3));
    expect(auditionSheet().map((entry) => entry.line)).toEqual(ROSTER.slice(0, 3).map((c) => c.draftLine));
  });

  it('gives every pilot character a distinct voice and acting direction', () => {
    const sheet = auditionSheet();
    expect(new Set(sheet.map((entry) => entry.voice)).size).toBe(sheet.length);
    expect(new Set(sheet.map((entry) => entry.direction)).size).toBe(sheet.length);
    for (const entry of sheet) {
      expect(entry.direction.length, entry.id).toBeGreaterThan(180);
      expect(entry.direction, entry.id).toMatch(/Youthful/);
    }
  });
});
