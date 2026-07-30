import { defineConfig } from 'vite';
import { resolve } from 'node:path';

export default defineConfig({
  // Relative paths so the built site works from any static host path
  // (Cloudflare Pages, Netlify, GitHub Pages sub-paths, etc.)
  //
  // GOTCHA: with a relative base, asset URLs inside `v2/index.html` resolve
  // against `/v2/`, not the site root. Anything under `public/` that the v2
  // page references must be written as `../<path>` (the Fredoka @font-face is
  // the live example) or placed under `public/v2/` and referenced as `./`.
  base: './',
  build: {
    rollupOptions: {
      input: {
        // v1 — the shipped Phaser game. Untouched.
        main: resolve(__dirname, 'index.html'),
        // v2 — the three.js rebuild. Ships alongside v1 at /v2/ until cutover.
        v2: resolve(__dirname, 'v2/index.html'),
      },
    },
    // Phaser is a big bundle (~1MB) — this is expected, silence the warning.
    chunkSizeWarningLimit: 2000,
  },
});
