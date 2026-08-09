import { describe, expect, it } from 'vitest';
import {
  assetUrlForPage,
  characterAnimationFile,
  hasDeliveredPerformance,
  primeManifest,
} from './assets';

describe('v2 public asset URLs', () => {
  it('resolves from the front door into the v2 asset directory', () => {
    expect(assetUrlForPage('models/kid_ace_kid.glb', 'https://host.test/recess-sports/'))
      .toBe('https://host.test/recess-sports/v2/models/kid_ace_kid.glb');
  });

  it('resolves the permanent v2 alias without duplicating its directory', () => {
    expect(assetUrlForPage('audio/bat-crack.wav', 'https://host.test/recess-sports/v2/'))
      .toBe('https://host.test/recess-sports/v2/audio/bat-crack.wav');
  });

  it('names and exposes optional character-performance deliveries explicitly', () => {
    expect(characterAnimationFile('nostrike')).toBe('anims_nostrike_v1.glb');
    primeManifest(['nostrike', 'calls_shot', 'wheelchair_ace', 'big_lou', 'tank', 'mimi_mash'], ['nostrike', 'calls_shot', 'wheelchair_ace', 'big_lou', 'tank', 'mimi_mash']);
    expect(hasDeliveredPerformance('nostrike')).toBe(true);
    expect(hasDeliveredPerformance('calls_shot')).toBe(true);
    expect(hasDeliveredPerformance('wheelchair_ace')).toBe(true);
    expect(hasDeliveredPerformance('big_lou')).toBe(true);
    expect(hasDeliveredPerformance('tank')).toBe(true);
    expect(hasDeliveredPerformance('mimi_mash')).toBe(true);
  });
});
