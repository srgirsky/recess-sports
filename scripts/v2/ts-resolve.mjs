// Register `ts-resolve.hooks.mjs`. Used via `node --import ./scripts/v2/ts-resolve.mjs`.
// Two files because Node runs resolution hooks on a separate thread and needs
// them in their own module.
import { register } from 'node:module';
import { pathToFileURL } from 'node:url';

register('./ts-resolve.hooks.mjs', pathToFileURL(import.meta.filename));
