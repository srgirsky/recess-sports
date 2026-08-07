import { describe, expect, it } from 'vitest';
import { CUSTOM_PLAYER_ID } from '../../data/characters';
import {
  CUSTOM_HAIR,
  CUSTOM_NAMES,
  CUSTOM_STYLES,
  DEFAULT_CUSTOM_PLAYER,
  customPlayerCharacter,
  decodeCustomPlayer,
} from './customPlayer';

describe('custom player profile', () => {
  it('round-trips a valid profile into one ordinary, non-roster character', () => {
    const profile = { ...DEFAULT_CUSTOM_PLAYER, name: 4, style: 'pitcher' as const, skin: 5, hair: 'mohawk' as const };
    expect(decodeCustomPlayer(JSON.stringify(profile))).toEqual(profile);
    const kid = customPlayerCharacter(profile);
    expect(kid.id).toBe(CUSTOM_PLAYER_ID);
    expect(kid.name).toBe(CUSTOM_NAMES[4]);
    expect(kid.stats).toEqual(CUSTOM_STYLES.find((s) => s.id === 'pitcher')!.stats);
    expect(kid.visual.skin).toBe(5);
    expect(kid.visual.hair).toBe('mohawk');
  });

  it('clamps malformed storage back to safe authored options', () => {
    const profile = decodeCustomPlayer(JSON.stringify({
      v: 1,
      name: 999,
      voice: 'robot',
      style: 'wizard',
      skin: -4,
      hair: 'lasers',
      hairColor: 99,
      accessory: 'cape',
    }))!;
    expect(profile).toEqual(DEFAULT_CUSTOM_PLAYER);
    expect(CUSTOM_HAIR).toContain(customPlayerCharacter(profile).visual.hair);
  });

  it('ignores unreadable and unknown versions', () => {
    expect(decodeCustomPlayer('{nope')).toBeNull();
    expect(decodeCustomPlayer(JSON.stringify({ ...DEFAULT_CUSTOM_PLAYER, v: 2 }))).toBeNull();
  });
});
