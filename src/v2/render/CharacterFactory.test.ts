// ---------------------------------------------------------------------------
// The one seam that decides model-or-proxy.
//
// The behaviour under test is mostly about what does NOT happen: the game does
// not crash when a model is missing, a partial/corrupt manifest stays quiet,
// and a real load failure is not buried among fallback noise.
//
// The load path itself cannot run here — there is no GPU to detect KTX2 support
// on and no server to fetch from — and that is convenient rather than limiting,
// because "the fetch failed" is exactly the branch that most needs testing and
// the hardest to provoke on purpose.
// ---------------------------------------------------------------------------

import { describe, expect, it, vi, beforeEach } from 'vitest';
import { createCharacter, createCharacters, resetFallbackWarnings } from './CharacterFactory';
import { ProxyCharacter } from './ProxyCharacter';
import { ROSTER } from '../../data/characters';
import { deliveredIds, hasDeliveredModel, primeManifest } from './assets';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// The real manifest, seeded rather than fetched: vitest has no server, and the
// point of these tests is the RESOLUTION ORDER, not the transport.
const manifestPath = join(
  dirname(fileURLToPath(import.meta.url)),
  '..', '..', '..', 'public', 'v2', 'models', 'manifest.json'
);
const shipped: string[] = JSON.parse(readFileSync(manifestPath, 'utf8')).characters;
primeManifest(shipped);

const delivered = ROSTER.find((c) => hasDeliveredModel(c.id))!;
const manifestMissing = ROSTER.find((c) => c.id !== delivered.id)!;

beforeEach(() => {
  resetFallbackWarnings();
  primeManifest(shipped);
});

describe('the manifest', () => {
  it('lists a production model for every real character', () => {
    expect(deliveredIds().sort()).toEqual(ROSTER.map((c) => c.id).sort());
  });
});

describe('resolution order', () => {
  it('forces proxies everywhere under ?proxy=1, even for a delivered kid', async () => {
    // Asset contract §5 names this flag. It is the A/B between a delivery and
    // the stand-in it replaced.
    const { view, source } = await createCharacter(delivered, { forceProxy: true });
    expect(source).toBe('proxy-forced');
    expect(view).toBeInstanceOf(ProxyCharacter);
    expect(view.isProxy).toBe(true);
  });

  it('falls back SILENTLY when a manifest omits a character', async () => {
    // The full manifest is now a gate, but this remains the resilience path
    // for a partial deploy or stale cache. It must not become a crash loop.
    primeManifest(shipped.filter((id) => id !== manifestMissing.id));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { view, source } = await createCharacter(manifestMissing);
    expect(source).toBe('proxy-undelivered');
    expect(view.isProxy).toBe(true);
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it('falls back and warns ONCE when a delivered model cannot be loaded', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    // Nine of the same kid is one defect, not nine. A message that repeats per
    // instance is how the one that matters gets buried.
    const built = await createCharacters([delivered, delivered, delivered]);
    for (const { view, source } of built) {
      expect(source).toBe('proxy-failed');
      expect(view.isProxy).toBe(true);
    }
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0][0])).toContain(delivered.id);
    warn.mockRestore();
  });

  it('never rejects, whatever happens', async () => {
    // A missing model is a cosmetic downgrade. The game keeps running in every
    // branch — that is the entire reason the proxy exists.
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const nine = await createCharacters(ROSTER.slice(0, 9));
    expect(nine).toHaveLength(9);
    for (const { view } of nine) expect(view.root).toBeTruthy();
    warn.mockRestore();
  });
});

describe('what the fallback preserves', () => {
  it('still wears the drafting team, not the kid\'s own colour', async () => {
    // The team-identity system must survive the downgrade, or a squad of
    // proxies takes the field in nine different jerseys. A proxy carries its
    // colours in the vertex-colour attribute rather than in a material, so the
    // check is on the buffer.
    const a = await createCharacter(manifestMissing, { uniform: 3, forceProxy: true });
    const b = await createCharacter(manifestMissing, { uniform: 0, forceProxy: true });
    const colors = (kid: typeof a) =>
      Array.from(
        ((kid.view as ProxyCharacter).mesh.geometry.attributes.color.array as Float32Array).slice(0, 4096)
      );
    expect(colors(a)).not.toEqual(colors(b));

    // ...and everything that is NOT the team stays put.
    expect(a.view.heightFt).toBeCloseTo(b.view.heightFt, 10);
    expect(a.view.root.scale.x).toBeCloseTo(b.view.root.scale.x, 10);
  });

  it('gives a proxy a working no-op expression', async () => {
    // A proxy carries a facing CUE and no face; expression is the delivered
    // model's `face_atlas`. Callers must not have to ask which they hold.
    const { view } = await createCharacter(manifestMissing, { forceProxy: true });
    expect(() => view.setExpression('grin')).not.toThrow();
  });
});
