// The catalog is derived from the production content, never a copied roster.
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { ROSTER } from '../../src/data/characters.ts';
import { VENUE_GEOMETRY } from '../../src/v2/sim/field.ts';
import { makeTargets, walk } from './art-review.mjs';
export const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
export const targets = makeTargets(ROSTER, Object.keys(VENUE_GEOMETRY), walk(join(root, 'src/v2/ui/screens')).filter(f => f.endsWith('Screen.ts')).map(f => f.replace(/\.ts$/, '')));
export const readJson = file => JSON.parse(readFileSync(file, 'utf8'));
export const ledger = () => readJson(join(root, 'docs/v2/art/reviews.json'));
