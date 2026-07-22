import { describe, it, expect, afterEach } from 'vitest';
import {
  poseKey,
  heroKey,
  teamSuffix,
  setTeamVariant,
  clearTeamVariant,
  HERO_POSES,
} from './textureFactory';

afterEach(() => clearTeamVariant());

describe('poseKey / heroKey', () => {
  it('stand is the plain id; other poses get a suffix', () => {
    expect(poseKey('junebug', 'stand')).toBe('junebug');
    expect(poseKey('junebug', 'run1')).toBe('junebug:run1');
  });

  it('team variant suffix rides every pose for armed ids only', () => {
    setTeamVariant(['junebug'], teamSuffix(2, 4));
    expect(poseKey('junebug', 'stand')).toBe('junebug:t2x4');
    expect(poseKey('junebug', 'batRear')).toBe('junebug:batRear:t2x4');
    expect(poseKey('tank', 'batRear')).toBe('tank:batRear');
  });

  it('hero tier composes AFTER the team suffix (jerseys + hi-res stack)', () => {
    expect(heroKey('junebug', 'batRear')).toBe('junebug:batRear:hi');
    setTeamVariant(['junebug'], teamSuffix(2, 4));
    expect(heroKey('junebug', 'batRear')).toBe('junebug:batRear:t2x4:hi');
  });

  it('every reactBatter pose is in the hero set', () => {
    for (const pose of ['batRear', 'catchRear', 'upset', 'nervous', 'dodge', 'cheer'] as const) {
      expect(HERO_POSES).toContain(pose);
    }
  });
});
