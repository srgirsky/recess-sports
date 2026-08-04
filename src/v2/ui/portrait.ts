// ---------------------------------------------------------------------------
// A character portrait, as an <img>.
//
// ⚠️ ★ AND IT MUST BE AN <img>, NOT INLINE SVG. `art/CharacterArt.ts` refers to
// its gradients by ID — `fill="url(#jerseyG)"`, `url(#skinG)`, `url(#hairG)` —
// which is correct and unremarkable while each drawing is its own document. v1
// never sees the problem because every kid becomes a separate Phaser texture.
//
// Inline thirty of them into ONE page and every id collides: the document has
// thirty elements called `jerseyG`, `url(#jerseyG)` resolves to the FIRST, and
// all thirty kids wear the first kid's shirt, skin and hair. Nothing errors. The
// draft board came up with thirty differently-shaped children in identical
// green, which reads as a palette bug in the art rather than a DOM one, and the
// art is fine.
//
// An `<img>` with a data URI gives each drawing its own document, so the
// collision is not avoided by discipline — it is unrepresentable. That is also
// exactly what `art/textureFactory.ts` does for Phaser, for a different reason,
// which is why the encoding below is the same base64 and not a URL-encode.
//
// ⚠️ `btoa` IS LATIN-1 ONLY. A logo badge is an emoji, so the string is encoded
// as UTF-8 first; `btoa(svg)` throws an InvalidCharacterError on the first kid
// wearing one, and only on that kid.
// ---------------------------------------------------------------------------

import { buildCharacterSVG } from '../../art/CharacterArt';
import type { VisualParams } from '../../data/types';

function toDataUri(svg: string): string {
  const utf8 = new TextEncoder().encode(svg);
  let binary = '';
  for (const byte of utf8) binary += String.fromCharCode(byte);
  return `data:image/svg+xml;base64,${btoa(binary)}`;
}

export interface PortraitOptions {
  /** Street clothes — what a kid wears in the draft, before they have a team. */
  street?: boolean;
  /** Team uniform index, once they have one. */
  uniform?: number;
}

/** An `<img>` of a kid, standing. */
export function portrait(visual: VisualParams, alt: string, opts: PortraitOptions = {}): HTMLImageElement {
  const img = document.createElement('img');
  img.className = 'portrait';
  img.alt = alt;
  img.decoding = 'async';
  img.draggable = false;
  img.src = toDataUri(
    buildCharacterSVG(
      visual,
      'stand',
      opts.uniform === undefined ? undefined : { uniform: opts.uniform },
      { street: opts.street }
    )
  );
  return img;
}
