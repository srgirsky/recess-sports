// ---------------------------------------------------------------------------
// The committed Draco/Basis decoders must match the installed `three`.
//
// A committed copy of a dependency's binary is a fork the moment that
// dependency moves. The decoders are fetched at RUNTIME by URL, so the bundler
// cannot notice the mismatch and neither can `tsc`: a `three` bump lands green,
// and then the first compressed model fails to decode in a browser, on a
// device, in front of a player. This test is the only place that can see it.
// ---------------------------------------------------------------------------

import { describe, expect, it } from 'vitest';
import { DECODER_FILES, syncDecoders } from './sync-decoders.mjs';

describe('the committed decoders track the installed three', () => {
  it('has no drifted or missing files', () => {
    const { drifted, missing } = syncDecoders({ check: true });
    expect(missing, 'three no longer ships these — update DECODER_FILES').toEqual([]);
    expect(drifted, 'stale copies in public/v2/decoders — run: npm run sync:decoders').toEqual([]);
  });

  it('copies the decoders and not the encoder', () => {
    // 954KB of Draco ENCODER for a game that only ever reads compressed
    // geometry would nearly double the decoder payload for a code path that
    // does not exist.
    const names = DECODER_FILES.map(([from]) => from);
    expect(names.some((n) => n.includes('encoder'))).toBe(false);
    expect(names.some((n) => n.endsWith('draco_decoder.wasm'))).toBe(true);
    expect(names.some((n) => n.endsWith('basis_transcoder.wasm'))).toBe(true);
  });
});
