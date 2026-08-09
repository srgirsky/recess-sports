import { describe, expect, it } from 'vitest';
import { assetUrlForPage } from './assets';

describe('v2 public asset URLs', () => {
  it('resolves from the front door into the v2 asset directory', () => {
    expect(assetUrlForPage('models/kid_ace_kid.glb', 'https://host.test/recess-sports/'))
      .toBe('https://host.test/recess-sports/v2/models/kid_ace_kid.glb');
  });

  it('resolves the permanent v2 alias without duplicating its directory', () => {
    expect(assetUrlForPage('audio/bat-crack.wav', 'https://host.test/recess-sports/v2/'))
      .toBe('https://host.test/recess-sports/v2/audio/bat-crack.wav');
  });
});
